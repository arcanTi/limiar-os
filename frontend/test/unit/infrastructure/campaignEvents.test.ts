import { describe, expect, it } from 'vitest';

import { createCampaignEventWaiter } from '../../../src/infrastructure/api/campaignEvents.ts';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string, public protocols: string[]) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  message(payload: object): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  closed(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
}

describe('campaign WebSocket event waiter', () => {
  it('uses one authenticated socket for sequential campaign waits', async () => {
    FakeWebSocket.instances = [];
    const wait = createCampaignEventWaiter({
      remoteBaseUrl: '/api',
      token: () => 'session-token',
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })!;

    const first = wait('camp-1', 0);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('ws://localhost/api/ws/campaigns/camp-1?since=0');
    expect(socket.protocols).toEqual(['limiar.v1', 'bearer.session-token']);
    socket.readyState = FakeWebSocket.OPEN;
    socket.message({ type: 'campaign.update', version: 1, changed: true, topics: ['chat'] });
    await expect(first).resolves.toMatchObject({ version: 1, topics: ['chat'] });

    const second = wait('camp-1', 1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    socket.message({ type: 'campaign.update', version: 2, changed: true, topics: ['map'] });
    await expect(second).resolves.toMatchObject({ version: 2, topics: ['map'] });
  });

  it('maps authenticated close codes to terminal API errors', async () => {
    FakeWebSocket.instances = [];
    const wait = createCampaignEventWaiter({
      remoteBaseUrl: '/api',
      token: () => 'session-token',
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })!;

    const result = wait('private-campaign', 0);
    FakeWebSocket.instances[0].closed(4403);

    await expect(result).rejects.toMatchObject({ status: 403 });
  });

  it('closes the shared socket when the active loop is aborted', async () => {
    FakeWebSocket.instances = [];
    const wait = createCampaignEventWaiter({
      remoteBaseUrl: '/api',
      token: () => 'session-token',
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })!;
    const controller = new AbortController();
    const result = wait('camp-1', 0, controller.signal);
    const socket = FakeWebSocket.instances[0];

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
