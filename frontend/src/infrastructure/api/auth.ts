import type { HttpClient } from './http.ts';

export function createAuthApi(http: HttpClient) {
  return {
    login: async (accessToken: string, remember = false): Promise<{ token?: string; [extra: string]: unknown } | null> => {
      const session = await http.request('/login', { method: 'POST', body: JSON.stringify({ token: accessToken, remember }) }) as { token?: string } | null;
      if (session && session.token) http.setToken(session.token);
      return session;
    },
    logout: async (): Promise<{ ok: true }> => {
      try { await http.request('/logout', { method: 'POST', body: JSON.stringify({}) }); } catch { /* best-effort */ }
      http.setToken(null);
      return { ok: true };
    },
    session: async (): Promise<unknown> => http.request('/session'),
    token: (): string | null => http.token(),
  };
}
