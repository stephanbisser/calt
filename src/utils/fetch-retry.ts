/* eslint-disable no-undef -- fetch, RequestInit, Response are Node 18+ globals */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

/**
 * Wraps fetch() with an AbortController timeout and retry logic for
 * HTTP 429 (Too Many Requests) and transient network errors.
 *
 * - Retries up to 3 times with exponential back-off (1 s, 2 s, 4 s).
 * - Honours the Retry-After header when present.
 * - Aborts after 30 seconds per attempt.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    // If the caller already provided a signal, forward its abort to ours
    if (init?.signal) {
      const outer = init.signal;
      if (outer.aborted) {
        controller.abort(outer.reason);
      } else {
        outer.addEventListener("abort", () => controller.abort(outer.reason), {
          once: true,
        });
      }
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      // On 429 we may retry — but not on the last attempt
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseRetryAfter(retryAfter)
          : BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delayMs);
        continue;
      }

      return response;
    } catch (error: unknown) {
      lastError = error;

      if (isAbortError(error)) {
        throw new Error(
          "Request timed out after 30 seconds. Check your network connection or try again.",
        );
      }

      // Retry transient network errors, but not on the last attempt
      if (attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delayMs);
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Should be unreachable, but just in case
  throw lastError;
}

function parseRetryAfter(value: string): number {
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return seconds * 1_000;
  }
  // Retry-After can also be an HTTP-date
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(date - Date.now(), 0);
  }
  return BASE_DELAY_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}
