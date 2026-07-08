import { DEFAULT_TOKEN_KEY, getToken, setToken as storeToken } from '../session.ts';

const defaultBaseUrl = '/api';

export type HttpRequest = (path: string, requestOptions?: RequestInit) => Promise<unknown>;

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

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const remoteBaseUrl = options.remoteBaseUrl || defaultBaseUrl;
  const tokenKey = options.tokenKey || DEFAULT_TOKEN_KEY;

  const token = () => getToken({ tokenKey });
  const setToken = (value: string | null) => storeToken(value, { tokenKey });
  const authHeader = (): Record<string, string> => {
    const value = token();
    return value ? { Authorization: 'Bearer ' + value } : {};
  };
  const request: HttpRequest = async (path, requestOptions) => {
    if (!remoteBaseUrl) return null;
    const isForm = requestOptions && requestOptions.body instanceof FormData;
    const res = await fetch(remoteBaseUrl + path, {
      headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...authHeader(), ...(requestOptions && requestOptions.headers) },
      ...requestOptions,
    });
    if (!res.ok) throw new Error('API ' + res.status + ' ' + path);
    if (res.status === 204) return null;
    return res.json();
  };

  return { remoteBaseUrl, request, authHeader, token, setToken };
}
