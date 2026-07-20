import type { HttpClient } from './http.ts';

export function createAuthApi(http: HttpClient) {
  return {
    login: async (username: string, password: string, remember = false): Promise<{ token?: string; [extra: string]: unknown } | null> => {
      const session = await http.request('/login', { method: 'POST', body: JSON.stringify({ username, password, remember }) }) as { token?: string } | null;
      if (session && session.token) http.setToken(session.token);
      return session;
    },
    requestPasswordReset: async (username: string): Promise<unknown> =>
      http.request('/password-reset-requests', { method: 'POST', body: JSON.stringify({ username }) }),
    register: async (username: string, password: string): Promise<{ token?: string; [extra: string]: unknown } | null> => {
      const session = await http.request('/register', { method: 'POST', body: JSON.stringify({ username, password }) }) as { token?: string } | null;
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
