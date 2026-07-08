export const DEFAULT_TOKEN_KEY = 'limiar_auth_token';
export const LEGACY_TOKEN_KEY = 'limiar_gm_token';

export interface TokenOptions {
  storage?: Storage | null;
  tokenKey?: string;
  legacyTokenKey?: string;
}

function storageFrom(options: TokenOptions = {}): Storage | null {
  if (options.storage) return options.storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function getToken(options: TokenOptions = {}): string | null {
  const storage = storageFrom(options);
  const tokenKey = options.tokenKey || DEFAULT_TOKEN_KEY;
  const legacyTokenKey = options.legacyTokenKey || LEGACY_TOKEN_KEY;
  try {
    return storage ? (storage.getItem(tokenKey) || storage.getItem(legacyTokenKey) || null) : null;
  } catch {
    return null;
  }
}

export function setToken(value: string | null | undefined, options: TokenOptions = {}): void {
  const storage = storageFrom(options);
  const tokenKey = options.tokenKey || DEFAULT_TOKEN_KEY;
  const legacyTokenKey = options.legacyTokenKey || LEGACY_TOKEN_KEY;
  try {
    if (!storage) return;
    if (value) {
      storage.setItem(tokenKey, value);
      storage.removeItem(legacyTokenKey);
    } else {
      clearToken(options);
    }
  } catch { /* storage unavailable (private mode, SSR, etc.) */ }
}

export function clearToken(options: TokenOptions = {}): void {
  const storage = storageFrom(options);
  const tokenKey = options.tokenKey || DEFAULT_TOKEN_KEY;
  const legacyTokenKey = options.legacyTokenKey || LEGACY_TOKEN_KEY;
  try {
    if (!storage) return;
    storage.removeItem(tokenKey);
    storage.removeItem(legacyTokenKey);
  } catch { /* storage unavailable (private mode, SSR, etc.) */ }
}
