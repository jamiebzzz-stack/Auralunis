// network.ts — shared network helpers.
//
// Every remote call in the app (Celestrak TLE, NOAA space weather, Open-Meteo,
// Space-Track) is best-effort: each caller already falls back to simulated or
// cached data. Without a timeout, though, a request that never settles leaves
// that fallback unreachable — the feature spins forever instead of degrading.
// `fetchWithTimeout` bounds every request with an AbortController so the catch
// path is always reached.

/** Default ceiling for a best-effort remote call. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10000;

/**
 * `fetch` with a hard timeout. Aborts the request after `timeoutMs` and rejects,
 * so the caller's existing catch/fallback path runs instead of hanging.
 * Any caller-supplied `signal` is respected in addition to the timeout.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honour a caller's own signal too — if it aborts, we abort.
  const callerSignal = init.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort);
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
  }
}

/**
 * Coerce an untrusted feed value to a finite number.
 * Public feeds (NOAA especially) ship nulls, empty strings and the literal
 * "null" in numeric columns. `parseFloat` turns those into NaN, which then
 * flows silently through every downstream comparison (NaN >= 4 is false), so a
 * storm can read as "calm". Anything non-finite falls back to `fallback`.
 */
export function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}
