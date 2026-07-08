import type { HttpRequest } from './http.ts';

export function createUsersApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/users'),
    upsert: async (payload: Record<string, unknown>): Promise<unknown> => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
    delete: async (username: string): Promise<unknown> => request('/users/' + encodeURIComponent(username), { method: 'DELETE' }),
  };
}
