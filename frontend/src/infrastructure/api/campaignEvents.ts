import { ApiError } from './http.ts';

export type CampaignUpdate = {
  type?: string;
  version: number;
  changed: boolean;
  topics: string[];
};

export type CampaignEventWaiter = (
  campaignId: string,
  since: number,
  signal?: AbortSignal,
) => Promise<CampaignUpdate>;

type Pending = {
  since: number;
  resolve: (value: CampaignUpdate) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
};

function websocketUrl(remoteBaseUrl: string, campaignId: string, since: number): string {
  const base = new URL(remoteBaseUrl || '/api', globalThis.location?.href || 'http://localhost/');
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = base.pathname.replace(/\/$/, '') + '/ws/campaigns/' + encodeURIComponent(campaignId);
  base.search = '?since=' + encodeURIComponent(String(Math.max(0, since)));
  return base.toString();
}

function closeStatus(code: number): number {
  return ({ 4401: 401, 4403: 403, 4404: 404 } as Record<number, number>)[code] || 503;
}

export function createCampaignEventWaiter({
  remoteBaseUrl,
  token,
  WebSocketImpl = globalThis.WebSocket,
}: {
  remoteBaseUrl: string;
  token: () => string | null;
  WebSocketImpl?: typeof WebSocket;
}): CampaignEventWaiter | null {
  if (!WebSocketImpl) return null;

  let socket: WebSocket | null = null;
  let socketCampaign = '';
  let pending: Pending | null = null;
  const queued: CampaignUpdate[] = [];

  function rejectPending(reason: unknown): void {
    const current = pending;
    pending = null;
    if (!current) return;
    if (current.abort && current.signal) current.signal.removeEventListener('abort', current.abort);
    current.reject(reason);
  }

  function resetSocket(): void {
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocketImpl.OPEN || socket.readyState === WebSocketImpl.CONNECTING) {
        socket.close(1000, 'campaign changed');
      }
    }
    socket = null;
    socketCampaign = '';
    queued.length = 0;
  }

  function deliver(update: CampaignUpdate): void {
    if (!pending) {
      queued.push(update);
      return;
    }
    if (update.version < pending.since) return;
    const current = pending;
    pending = null;
    if (current.abort && current.signal) current.signal.removeEventListener('abort', current.abort);
    current.resolve(update);
  }

  function ensureSocket(campaignId: string, since: number): void {
    if (socket && socketCampaign === campaignId && socket.readyState !== WebSocketImpl.CLOSED) return;
    resetSocket();
    socketCampaign = campaignId;
    const credential = token();
    const protocols = credential ? ['limiar.v1', 'bearer.' + credential] : ['limiar.v1'];
    socket = new WebSocketImpl(websocketUrl(remoteBaseUrl, campaignId, since), protocols);
    socket.onmessage = event => {
      let message: CampaignUpdate | null = null;
      try { message = JSON.parse(String(event.data)) as CampaignUpdate; }
      catch (_) { return; }
      if (!message || message.type === 'heartbeat') return;
      if (message.type !== 'campaign.update') return;
      deliver({
        ...message,
        version: Number(message.version) || 0,
        changed: Boolean(message.changed),
        topics: Array.isArray(message.topics) ? message.topics : [],
      });
    };
    socket.onclose = event => {
      const status = closeStatus(event.code);
      socket = null;
      socketCampaign = '';
      rejectPending(new ApiError(status, '/ws/campaigns/' + encodeURIComponent(campaignId)));
    };
    socket.onerror = () => {
      // `close` owns the rejection because browsers intentionally hide the
      // handshake status from `error` events.
    };
  }

  return (campaignId, since, signal) => new Promise<CampaignUpdate>((resolve, reject) => {
    const queuedIndex = queued.findIndex(update => update.version >= since);
    if (queuedIndex >= 0) {
      resolve(queued.splice(queuedIndex, 1)[0]);
      return;
    }
    if (pending) {
      reject(new Error('Only one campaign update waiter may be active per API client'));
      return;
    }
    const entry: Pending = { since, resolve, reject, signal };
    if (signal) {
      entry.abort = () => {
        if (pending === entry) pending = null;
        resetSocket();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal.aborted) {
        entry.abort();
        return;
      }
      signal.addEventListener('abort', entry.abort, { once: true });
    }
    pending = entry;
    ensureSocket(campaignId, since);
  });
}
