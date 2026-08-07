// Map synchronization coordinator. The primary long-poll loop and safety-net
// fallback are isolated from page DOM/state so reload and backoff behavior is
// testable without a document.
// The page still owns `state.mapVersion`; this module only reads/writes it
// through the getVersion/setVersion hooks so there is a single source of
// truth for the version counter.
export function createMapSync({
  waitForUpdate,
  getVersion,
  setVersion,
  onChanged,
  fallbackDelayMs = 15000,
  fallbackRetryDelayMs = 1000,
  realtimeRetryDelayMs = 1000,
  maxRealtimeRetryDelayMs = 60000,
  fallbackAfterFailures = 3,
}) {
  let stopped = false;
  let abortController = null;
  let fallbackTimer = 0;
  let consecutiveFailures = 0;
  let retryDelayMs = realtimeRetryDelayMs;

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function startRealtime() {
    if (!waitForUpdate || stopped) return;
    stopped = false;
    while (!stopped) {
      const controller = new AbortController();
      abortController = controller;
      try {
        const update = await waitForUpdate(getVersion(), controller.signal);
        if (stopped) break;
        consecutiveFailures = 0;
        retryDelayMs = realtimeRetryDelayMs;
        const version = Number(update && update.version) || getVersion();
        if (update && update.changed) {
          setVersion(version);
          await onChanged();
        } else {
          setVersion(Math.max(getVersion(), version));
        }
      } catch (error) {
        if (stopped) break;
        const status = Number(error && error.status);
        if ([401, 403, 404].includes(status)) {
          stopped = true;
          break;
        }
        consecutiveFailures += 1;
        if (consecutiveFailures >= fallbackAfterFailures) {
          try { await onChanged(); }
          catch (_) { await delay(fallbackRetryDelayMs); }
        }
        await delay(retryDelayMs);
        retryDelayMs = Math.min(maxRealtimeRetryDelayMs, retryDelayMs * 2);
      } finally {
        if (abortController === controller) abortController = null;
      }
    }
  }

  function scheduleFallbackPoll(ms = fallbackDelayMs) {
    // The realtime loop owns recovery when long-poll exists. Running this timer
    // in parallel doubled reads and session writes on every open Mesa.
    if (waitForUpdate) return;
    fallbackTimer = setTimeout(async () => {
      if (stopped) return;
      try {
        await onChanged();
        scheduleFallbackPoll(fallbackDelayMs);
      } catch (_) {
        scheduleFallbackPoll(fallbackRetryDelayMs);
      }
    }, ms);
  }

  function stop() {
    stopped = true;
    if (abortController) abortController.abort();
    clearTimeout(fallbackTimer);
  }

  return { startRealtime, scheduleFallbackPoll, stop };
}
