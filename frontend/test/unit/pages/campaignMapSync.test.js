import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMapSync } from '../../../src/pages/campaignMapSync.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createMapSync (ARQUITETURA 4B)', () => {
  it('does nothing if the API has no long-poll support', async () => {
    const onChanged = vi.fn();
    const sync = createMapSync({ waitForUpdate: null, getVersion: () => 0, setVersion: () => {}, onChanged });
    await sync.startRealtime();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('calls onChanged and bumps the version when the server reports a change', async () => {
    let version = 0;
    const onChanged = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const waitForUpdate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return { version: 5, changed: true };
      sync.stop();
      return { version: 5, changed: false };
    });
    const sync = createMapSync({ waitForUpdate, getVersion: () => version, setVersion: v => { version = v; }, onChanged });
    await sync.startRealtime();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(version).toBe(5);
  });

  it('backs off and retries after a long-poll failure, stopping cleanly on stop()', async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const waitForUpdate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      sync.stop();
      return { version: 0, changed: false };
    });
    const sync = createMapSync({ waitForUpdate, getVersion: () => 0, setVersion: () => {}, onChanged, realtimeRetryDelayMs: 1000 });
    const done = sync.startRealtime();
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(waitForUpdate).toHaveBeenCalledTimes(2);
  });

  it('fallback poll runs onChanged every fallbackDelayMs and retries fast on failure', async () => {
    let fail = true;
    const onChanged = vi.fn(async () => {
      if (fail) { fail = false; throw new Error('down'); }
    });
    const sync = createMapSync({ waitForUpdate: null, getVersion: () => 0, setVersion: () => {}, onChanged, fallbackDelayMs: 15000, fallbackRetryDelayMs: 1000 });
    sync.scheduleFallbackPoll();
    await vi.advanceTimersByTimeAsync(15000);
    expect(onChanged).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChanged).toHaveBeenCalledTimes(2);
    sync.stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('does not run the fallback timer in parallel with realtime sync', async () => {
    const onChanged = vi.fn();
    const waitForUpdate = vi.fn(() => new Promise(() => {}));
    const sync = createMapSync({ waitForUpdate, getVersion: () => 0, setVersion: () => {}, onChanged, fallbackDelayMs: 1000 });
    sync.scheduleFallbackPoll();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onChanged).not.toHaveBeenCalled();
    sync.stop();
  });

  it('stops retrying terminal authorization and not-found failures', async () => {
    const onChanged = vi.fn();
    const error = Object.assign(new Error('forbidden'), { status: 403 });
    const waitForUpdate = vi.fn().mockRejectedValue(error);
    const sync = createMapSync({ waitForUpdate, getVersion: () => 0, setVersion: () => {}, onChanged });
    await sync.startRealtime();
    await vi.advanceTimersByTimeAsync(60000);
    expect(waitForUpdate).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('stop() aborts the in-flight long-poll signal', async () => {
    const onChanged = vi.fn();
    let capturedSignal = null;
    const waitForUpdate = vi.fn((since, signal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    const sync = createMapSync({ waitForUpdate, getVersion: () => 0, setVersion: () => {}, onChanged });
    sync.startRealtime();
    await vi.advanceTimersByTimeAsync(0);
    expect(capturedSignal.aborted).toBe(false);
    sync.stop();
    expect(capturedSignal.aborted).toBe(true);
  });
});
