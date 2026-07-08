import type { HttpClient } from './http.ts';

export interface UploadResult {
  url?: string;
  [extra: string]: unknown;
}

export function createUploadsApi(http: HttpClient) {
  return {
    image: async (file: Blob, meta?: Record<string, unknown>): Promise<UploadResult> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('meta', JSON.stringify(meta || {}));
      const res = await fetch(http.remoteBaseUrl + '/uploads/images', { method: 'POST', body: fd, headers: http.authHeader() });
      if (!res.ok) throw new Error('Upload failed: ' + res.status);
      return res.json();
    },
  };
}
