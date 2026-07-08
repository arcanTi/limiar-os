import type { HttpRequest } from './http.ts';

export function createMapApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/map'),
    upsert: async (payload: Record<string, unknown>): Promise<unknown> => request('/map', { method: 'POST', body: JSON.stringify(payload) }),
    delete: async (id: string): Promise<unknown> => request('/map/' + id, { method: 'DELETE' }),
  };
}
