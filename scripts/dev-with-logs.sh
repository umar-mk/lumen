#!/usr/bin/env bash
# Run the Next dev server with crash-proof instrumentation.
#
# Why this exists: `npm run dev` has hard-frozen this Mac. This wrapper records a
# 1-second system sample that is fsync'd to disk every tick, so the LAST sample
# before a freeze survives the reboot — that's how we catch a runaway-memory ramp
# instead of guessing. It also tees the dev server's own output to a log.
#
# Run it in YOUR terminal (not inside Claude): ./scripts/dev-with-logs.sh
set -uo pipefail
cd "$(dirname "$0")/.."

mkdir -p logs
ts="$(date +%Y%m%d-%H%M%S)"
sys="logs/system-$ts.log"
dev="logs/dev-$ts.log"

{
  echo "# Lumen dev session $ts"
  echo "# node $(node -v 2>/dev/null) | npm $(npm -v 2>/dev/null) | macOS $(sw_vers -productVersion 2>/dev/null)"
  echo "# RAM $(sysctl -n hw.memsize | awk '{printf "%.0f GB", $1/1073741824}')"
  echo "# epoch | pages_free pages_active pages_wired | swap | load(1m 5m 15m) | top-3 mem procs"
} > "$sys"
sync

# Background sampler — one synced line per second.
(
  while true; do
    epoch=$(date +%s)
    vmline=$(vm_stat | awk '
      /Pages free/        {gsub(/\./,"",$3); f=$3}
      /Pages active/      {gsub(/\./,"",$3); a=$3}
      /Pages wired down/  {gsub(/\./,"",$4); w=$4}
      END {print f, a, w}')
    swap=$(sysctl -n vm.swapusage 2>/dev/null)
    load=$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | xargs)
    topmem=$(ps -A -o rss=,comm= -m 2>/dev/null | head -n 3 \
             | awk '{printf "%s(%dMB) ", $NF, $1/1024}')
    printf '%s | %s | %s | %s | %s\n' "$epoch" "$vmline" "$swap" "$load" "$topmem" >> "$sys"
    sync
    sleep 1
  done
) &
sampler=$!
trap 'kill "$sampler" 2>/dev/null' EXIT INT TERM

echo "system stats -> $sys"
echo "dev output   -> $dev"
echo "Open http://localhost:3000  (NOT 8000).  Ctrl-C to stop."
echo

# Heap is already capped to 2GB via the package.json dev script's NODE_OPTIONS,
# so a JS-side runaway exits with a clean OOM error instead of freezing.
npm run dev 2>&1 | tee "$dev"
