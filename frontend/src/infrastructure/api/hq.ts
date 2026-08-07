import type { HttpRequest } from './http.ts';

export function createHqApi(request: HttpRequest) {
  return {
    get: async (): Promise<unknown> => request('/hq'),
    set: async (payload: Record<string, unknown>): Promise<unknown> => request('/hq', { method: 'POST', body: JSON.stringify(payload) }),
  };
}
