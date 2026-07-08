import type { HttpRequest } from './http.ts';

export function createCommsApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/chat'),
    post: async (payload: Record<string, unknown>): Promise<unknown> => request('/chat', { method: 'POST', body: JSON.stringify(payload) }),
    clear: async (): Promise<unknown> => request('/chat', { method: 'DELETE' }),
  };
}
