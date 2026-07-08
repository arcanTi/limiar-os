import type { HttpRequest } from './http.ts';

export function createCatalogApi(request: HttpRequest) {
  return {
    list: async (): Promise<unknown> => request('/items'),
    upsert: async (payload: Record<string, unknown>): Promise<unknown> => request('/items', { method: 'POST', body: JSON.stringify(payload) }),
    delete: async (id: string): Promise<unknown> => request('/items/' + id, { method: 'DELETE' }),
  };
}
