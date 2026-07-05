/**
 * Narration uses the local `/api/tts` Edge voice. Each beat's audio is fetched
 * (with retries) and cached by text, so the *next* beat can be prefetched while
 * the current one plays — that's what removes the gap between beats. If a beat's
 * audio still can't be produced after retries, we advance silently on a timed
 * estimate; we deliberately do NOT fall back to the browser Web Speech voice (it
 * randomly starts speaking and sounds robotic). The returned handle supports real
 * pause/resume so audio and animation stay on the same timeline.
 */

export interface Narrator {
  cancel(): void;
  pause(): void;
  resume(): void;
}

const TTS_ENDPOINT = "/api/tts";
const MAX_ATTEMPTS = 4; // total tries per beat before giving up to silence
const RETRY_BACKOFF_MS = 350; // linear backoff between tries (× attempt)
const MAX_CACHE_ENTRIES = 64; // bound memory across a long lesson
// If audio still isn't ready after this, advance silently. Generous because
// prefetch usually makes the blob resolve instantly at play time; this only
// bites an un-prefetched first beat whose retries are all failing.
const PLAY_BUDGET_MS = 20000;

// text → in-flight/settled audio blob. Lets us warm the next beat early and
// reuse audio when an interrupted beat replays.
const blobCache = new Map<string, Promise<Blob>>();

function evictIfNeeded() {
  while (blobCache.size > MAX_CACHE_ENTRIES) {
    const oldest = blobCache.keys().next().value;
    if (oldest === undefined) break;
    blobCache.delete(oldest);
  }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

// One beat → one mp3 blob, retrying transient Edge-endpoint failures. Each retry
// is a fresh request to the route (a genuine new shot at Microsoft's endpoint).
async function fetchTtsBlob(text: string, signal: AbortSignal): Promise<Blob> {
  let lastErr: unknown = new Error("TTS unavailable");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const res = await fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const blob = await res.blob();
      if (!blob.size) throw new Error("Empty TTS audio");
      return blob;
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await abortableDelay(RETRY_BACKOFF_MS * attempt, signal);
    }
  }
  throw lastErr;
}

/** Warm the cache for a beat's narration ahead of time (fire-and-forget). */
export function prefetchNarration(text: string): void {
  if (typeof window === "undefined") return;
  const key = text.trim();
  if (!key || blobCache.has(key)) return;
  const controller = new AbortController();
  const p = fetchTtsBlob(key, controller.signal).catch((err) => {
    blobCache.delete(key); // a failed warm-up shouldn't poison a later real play
    throw err;
  });
  blobCache.set(key, p);
  evictIfNeeded();
}

function getNarrationBlob(text: string): Promise<Blob> {
  const key = text.trim();
  const cached = blobCache.get(key);
  if (cached) return cached;
  prefetchNarration(key);
  return blobCache.get(key)!;
}

export function clearNarrationCache(): void {
  blobCache.clear();
}

function silentNarrate(
  text: string,
  onDone?: () => void,
  onReady?: (seconds: number) => void,
  onStart?: () => void,
): Narrator {
  let cancelled = false;
  let paused = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = Math.max(2500, (words / 165) * 60000); // ~165 wpm
  let remainingMs = ms;
  onReady?.(ms / 1000);

  const finish = () => {
    timer = null;
    if (!cancelled) onDone?.();
  };

  const startTimer = () => {
    if (cancelled) return;
    if (!started) {
      started = true;
      onStart?.();
    }
    startedAt = Date.now();
    timer = setTimeout(finish, remainingMs);
  };

  startTimer();

  return {
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
    pause() {
      if (cancelled || paused || !timer) return;
      paused = true;
      clearTimeout(timer);
      timer = null;
      remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    },
    resume() {
      if (cancelled || !paused) return;
      paused = false;
      startTimer();
    },
  };
}

export function narrate(
  text: string,
  opts: { onDone?: () => void; rate?: number; onReady?: (seconds: number) => void; onStart?: () => void } = {},
): Narrator {
  if (typeof window === "undefined") return silentNarrate(text, opts.onDone, opts.onReady, opts.onStart);

  let cancelled = false;
  let paused = false;
  let started = false;
  let fallback: Narrator | null = null;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;

  const cleanupAudio = () => {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  // If Edge TTS exhausts retries or stalls past the budget, advance silently —
  // never the browser voice.
  const startFallback = () => {
    if (cancelled || fallback) return;
    window.clearTimeout(budgetTimer);
    cleanupAudio();
    fallback = silentNarrate(text, opts.onDone, opts.onReady, opts.onStart);
    if (paused) fallback.pause();
  };

  const budgetTimer = window.setTimeout(startFallback, PLAY_BUDGET_MS);

  const markStarted = () => {
    if (started || cancelled) return;
    started = true;
    opts.onStart?.();
  };

  const playAudio = () => {
    if (!audio || cancelled || paused) return;
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.then(markStarted).catch(startFallback);
    } else {
      markStarted();
    }
  };

  getNarrationBlob(text)
    .then((blob) => {
      if (cancelled || fallback) return;
      window.clearTimeout(budgetTimer);
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audio.onloadedmetadata = () => {
        if (!cancelled && audio && Number.isFinite(audio.duration)) opts.onReady?.(audio.duration);
      };
      audio.onplaying = markStarted;
      audio.onended = () => {
        cleanupAudio();
        if (!cancelled) opts.onDone?.();
      };
      audio.onerror = startFallback;
      playAudio();
    })
    .catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      startFallback();
    });

  return {
    cancel() {
      cancelled = true;
      window.clearTimeout(budgetTimer);
      cleanupAudio();
      fallback?.cancel();
    },
    pause() {
      paused = true;
      fallback?.pause();
      audio?.pause();
    },
    resume() {
      if (cancelled) return;
      paused = false;
      if (fallback) fallback.resume();
      else playAudio();
    },
  };
}
