import { DEFAULT_TOKEN_KEY, getToken, setToken as storeToken } from '../session.ts';

const defaultBaseUrl = '/api';

export type HttpRequest = <T = unknown>(path: string, requestOptions?: RequestInit) => Promise<T>;

export interface HttpClient {
  remoteBaseUrl: string;
  request: HttpRequest;
  authHeader: () => Record<string, string>;
  token: () => string | null;
  setToken: (value: string | null) => void;
}

export interface HttpClientOptions {
  remoteBaseUrl?: string;
  tokenKey?: string;
}

export class ApiError extends Error {
  status: number;
  path: string;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    path: string,
    error?: { code?: string; message?: string; details?: Record<string, unknown> },
  ) {
    super(error?.message || 'API ' + status + ' ' + path);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.code = error?.code;
    this.details = error?.details;
  }
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const remoteBaseUrl = options.remoteBaseUrl || defaultBaseUrl;
  const tokenKey = options.tokenKey || DEFAULT_TOKEN_KEY;

  const token = () => getToken({ tokenKey });
  const setToken = (value: string | null) => storeToken(value, { tokenKey });
  const authHeader = (): Record<string, string> => {
    const value = token();
    return value ? { Authorization: 'Bearer ' + value } : {};
  };
  const request: HttpRequest = async <T = unknown>(path: string, requestOptions?: RequestInit): Promise<T> => {
    if (!remoteBaseUrl) return null as T;
    const isForm = requestOptions && requestOptions.body instanceof FormData;
    const res = await fetch(remoteBaseUrl + path, {
      headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...authHeader(), ...(requestOptions && requestOptions.headers) },
      ...requestOptions,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      } | null;
      throw new ApiError(res.status, path, body?.error);
    }
    if (res.status === 204) return null as T;
    return res.json() as Promise<T>;
  };

  return { remoteBaseUrl, request, authHeader, token, setToken };
}
