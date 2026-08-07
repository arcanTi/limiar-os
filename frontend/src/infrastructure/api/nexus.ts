import type { HttpRequest } from './http.ts';

export function createNexusApi(request: HttpRequest) {
  return {
    get: async (): Promise<unknown> => request('/nexus-challenge'),
    set: async (payload: Record<string, unknown>): Promise<unknown> => request('/nexus-challenge', { method: 'POST', body: JSON.stringify(payload) }),
    getResult: async (): Promise<unknown> => request('/nexus-result'),
    reportResult: async (payload: Record<string, unknown>): Promise<unknown> => request('/nexus-result', { method: 'POST', body: JSON.stringify(payload) }),
  };
}
