#!/usr/bin/env bash
# Run this AFTER a crash/reboot to bundle the evidence into one file for Claude.
#   ./scripts/collect-diagnostics.sh   then share the printed logs/crash-bundle-*.txt
#
# It pulls: the last synced system sample (the memory ramp), the tail of the dev
# log, kernel panics, app crash reports, and macOS low-memory/jetsam events.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
out="logs/crash-bundle-$(date +%Y%m%d-%H%M%S).txt"

{
  echo "===== ENVIRONMENT ====="
  echo "node $(node -v 2>/dev/null) | npm $(npm -v 2>/dev/null)"
  sw_vers 2>/dev/null
  sysctl -n hw.memsize | awk '{printf "RAM %.0f GB\n", $1/1073741824}'

  echo; echo "===== LAST SYSTEM SAMPLE (look for pages_free collapsing / swap climbing) ====="
  last_sys=$(ls -t logs/system-*.log 2>/dev/null | head -1)
  if [ -n "${last_sys:-}" ]; then echo "file: $last_sys"; tail -n 40 "$last_sys"; else echo "(none)"; fi

  echo; echo "===== LAST DEV OUTPUT ====="
  last_dev=$(ls -t logs/dev-*.log 2>/dev/null | head -1)
  if [ -n "${last_dev:-}" ]; then echo "file: $last_dev"; tail -n 80 "$last_dev"; else echo "(none)"; fi

  echo; echo "===== KERNEL PANICS (last 3) ====="
  ls -t /Library/Logs/DiagnosticReports/*.panic 2>/dev/null | head -3 | while read -r p; do
    echo "--- $p ---"; head -n 40 "$p" 2>/dev/null || echo "(unreadable; may need sudo)"
  done
  [ -z "$(ls -t /Library/Logs/DiagnosticReports/*.panic 2>/dev/null)" ] && echo "(no panic files — not a kernel panic)"

  echo; echo "===== RECENT APP CRASH REPORTS (node/next, last 10) ====="
  ls -t "$HOME"/Library/Logs/DiagnosticReports/*.ips 2>/dev/null \
    | xargs -I{} sh -c 'grep -liE "node|next" "{}" >/dev/null 2>&1 && echo "{}"' 2>/dev/null | head -10
  echo "(none listed = no node/next process crash report)"

  echo; echo "===== macOS LOW-MEMORY / JETSAM / WATCHDOG (last 3h) ====="
  log show --last 3h --predicate \
    'eventMessage CONTAINS[c] "jetsam" OR eventMessage CONTAINS[c] "memorystatus" OR eventMessage CONTAINS[c] "low swap" OR eventMessage CONTAINS[c] "watchdog"' \
    2>/dev/null | tail -n 120
} > "$out" 2>&1

echo "Wrote $out"
echo "Share it with Claude, or run:  cat $out"
