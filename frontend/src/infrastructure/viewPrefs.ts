// Per-browser view preferences: which panels a user keeps folded away, and
// other purely local layout choices. Deliberately separate from character or
// campaign data — nothing here is shared, synced, or worth a round trip to the
// backend, and losing it (private window, cleared storage) only costs a
// default layout.

export const VIEW_PREFS_KEY = 'limiar_view_prefs';

export interface ViewPrefsOptions {
  storage?: Storage | null;
  key?: string;
}

function storageFrom(options: ViewPrefsOptions = {}): Storage | null {
  // An explicit `storage: null` means "no storage" (tests, SSR); only an absent
  // key falls back to the browser's own.
  if ('storage' in options) return options.storage || null;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readViewPrefs(options: ViewPrefsOptions = {}): Record<string, unknown> {
  const storage = storageFrom(options);
  try {
    const raw = storage ? storage.getItem(options.key || VIEW_PREFS_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Anything that is not a plain object (an array, a string, a stale format)
    // is treated as absent rather than merged into, so a corrupt entry degrades
    // to defaults instead of breaking the view that reads it.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function writeViewPrefs(
  patch: Record<string, unknown>,
  options: ViewPrefsOptions = {},
): void {
  const storage = storageFrom(options);
  if (!storage) return;
  try {
    const next = { ...readViewPrefs(options), ...patch };
    storage.setItem(options.key || VIEW_PREFS_KEY, JSON.stringify(next));
  } catch { /* storage unavailable or over quota: the preference is optional */ }
}
