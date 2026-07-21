// ARQUITETURA 4B: extracted from campaign-map.js — the primary long-poll
// loop plus the CORRECAO 2B safety-net fallback, isolated from the page's
// DOM/state so the reload/backoff behavior is testable without a document.
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
}) {
  let stopped = false;
  let abortController = null;
  let fallbackTimer = 0;

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
        const version = Number(update && update.version) || getVersion();
        if (update && update.changed) {
          setVersion(version);
          await onChanged();
        } else {
          setVersion(Math.max(getVersion(), version));
        }
      } catch (_) {
        if (!stopped) await delay(realtimeRetryDelayMs);
      } finally {
        if (abortController === controller) abortController = null;
      }
    }
  }

  function scheduleFallbackPoll(ms = fallbackDelayMs) {
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
