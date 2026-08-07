import type { HttpRequest } from './http.ts';

export function createUsersApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/users'),
    upsert: async (payload: Record<string, unknown>): Promise<unknown> => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
    delete: async (username: string): Promise<unknown> => request('/users/' + encodeURIComponent(username), { method: 'DELETE' }),
    updateMe: async (payload: Record<string, unknown>): Promise<unknown> => request('/users/me', { method: 'POST', body: JSON.stringify(payload) }),
    passwordResetRequests: async (): Promise<unknown> => request('/password-reset-requests'),
    dismissPasswordResetRequest: async (username: string): Promise<unknown> =>
      request('/password-reset-requests/' + encodeURIComponent(username), { method: 'DELETE' }),
  };
}
