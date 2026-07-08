import { describe, expect, it, vi } from 'vitest';

import { chatHandlers, chatRenderVals } from '../../../src/ui/views/chat.js';

const baseDeps = () => ({
  tx: { commsFilterAll: 'ALL', commsFilterRolls: 'ROLLS', commsFilterMessages: 'MESSAGES' },
  activeCharacterName: 'Rook',
  activeCharacterId: 'rook',
  rollFromRequest: vi.fn(),
  toggleComms: vi.fn(),
  closeComms: vi.fn(),
  setCommsFilter: vi.fn(),
  setGmDraft: vi.fn(),
  sendGm: vi.fn(),
  setReply: vi.fn(),
  sendReply: vi.fn(),
});

describe('ui/views/chat chatRenderVals', () => {
  it('renders a plain text message, tagging it "mine" for the active player', () => {
    const state = { comms: [{ kind: 'text', role: 'player', sender: 'Rook', text: 'oi', at: '12:00' }], commsFilter: 'all' };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed).toHaveLength(1);
    expect(vals.commsFeed[0]).toMatchObject({ name: 'Rook', text: 'oi', isPlain: true, typeLabel: 'MSG', rowStyle: 'lm-chat-row lm-chat-row--mine' });
  });

  it('tags a GM message as "mine" only for a GM viewer', () => {
    const state = { comms: [{ kind: 'text', role: 'gm', sender: 'MESTRE', text: 'oi', at: '12:00' }], commsFilter: 'all', gm: true };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed[0].rowStyle).toContain('--mine');
  });

  it('renders a roll message with title/detail/outcome and clears the plain text', () => {
    const state = {
      comms: [{ kind: 'roll', sender: 'Rook', role: 'player', roll: { label: 'ROOK :: ATAQUE', detail: '5 + 3', total: 8, outcome: '' } }],
      commsFilter: 'all',
    };
    const vals = chatRenderVals(state, baseDeps());
    const row = vals.commsFeed[0];
    expect(row.isRoll).toBe(true);
    expect(row.isPlain).toBe(false);
    expect(row.rollTitle).toBe('ATAQUE');
    expect(row.rollTotal).toBe('8');
  });

  it('colors a roll bubble by weapon/skill tone, independent of sender identity', () => {
    const state = {
      comms: [{ kind: 'roll', sender: 'Mira', role: 'player', roll: { label: 'MIRA :: MONO-KATANA ATAQUE', detail: '5 + 3', total: 8, outcome: '' } }],
      commsFilter: 'all',
    };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed[0].chatVars).toContain('--chat-tone:#b56cff');
  });

  it('colors a GM test request with its own distinct tone', () => {
    const state = {
      comms: [{ kind: 'request', role: 'gm', request: { label: 'REFLEXOS', sides: 10 } }],
      commsFilter: 'all',
    };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed[0].chatVars).toContain('--chat-tone:#ff9f43');
  });

  it('leaves plain text messages without a tone override, keeping identity color in charge', () => {
    const state = { comms: [{ kind: 'text', role: 'player', sender: 'Rook', text: 'oi' }], commsFilter: 'all' };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed[0].chatVars).not.toContain('--chat-tone');
  });

  it('parses a damage-tracking text message into a tracking row', () => {
    const state = {
      comms: [{ kind: 'text', role: 'gm', sender: 'SISTEMA', text: 'DAMAGE TRACKING :: MELEE :: ROOK\nWolvers :: BASE :: 3d6 :: ROLLS 4, 5, 6 :: SUBTOTAL 15\nTOTAL :: 15' }],
      commsFilter: 'all',
    };
    const vals = chatRenderVals(state, baseDeps());
    const row = vals.commsFeed[0];
    expect(row.isTracking).toBe(true);
    expect(row.trackingActor).toBe('ROOK');
    expect(row.trackingTotal).toBe('15');
    expect(row.bubbleClass).toContain('lm-chat-bubble--tracking');
  });

  it('keeps the roll/tracking modifier classes on your own messages, so CSS can exempt them from the flattened "mine" bubble', () => {
    const rollState = {
      comms: [{ kind: 'roll', sender: 'Rook', role: 'player', roll: { label: 'ROOK :: MONO-KATANA ATAQUE', detail: '5 + 3', total: 8, outcome: '' } }],
      commsFilter: 'all',
    };
    const rollVals = chatRenderVals(rollState, baseDeps());
    expect(rollVals.commsFeed[0].bubbleClass).toContain('lm-chat-bubble--mine');
    expect(rollVals.commsFeed[0].bubbleClass).toContain('lm-chat-bubble--roll');

    const trackingState = {
      comms: [{ kind: 'text', role: 'player', sender: 'Rook', text: 'DAMAGE TRACKING :: MELEE :: ROOK\nWolvers :: BASE :: 3d6 :: ROLLS 4, 5, 6 :: SUBTOTAL 15\nTOTAL :: 15' }],
      commsFilter: 'all',
    };
    const trackingVals = chatRenderVals(trackingState, baseDeps());
    expect(trackingVals.commsFeed[0].bubbleClass).toContain('lm-chat-bubble--mine');
    expect(trackingVals.commsFeed[0].bubbleClass).toContain('lm-chat-bubble--tracking');
  });

  it('marks a test request as rollable only for the targeted combatant', () => {
    const state = {
      comms: [{ kind: 'request', role: 'gm', request: { label: 'REFLEXOS', sides: 10, combatantId: 'rook' } }],
      commsFilter: 'all',
      gm: false,
    };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed[0].canRoll).toBe(true);
    const otherDeps = baseDeps();
    const otherVals = chatRenderVals({ ...state, comms: [{ kind: 'request', role: 'gm', request: { label: 'REFLEXOS', sides: 10, combatantId: 'vesper' } }] }, otherDeps);
    expect(otherVals.commsFeed[0].canRoll).toBe(false);
  });

  it('a GM never sees canRoll true, even for their own request', () => {
    const state = { comms: [{ kind: 'request', role: 'gm', request: { label: 'X', sides: 10 } }], commsFilter: 'all', gm: true };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed[0].canRoll).toBe(false);
  });

  it('filters the feed by kind and reports hasCommsFeed/noCommsFeed', () => {
    const state = {
      comms: [
        { kind: 'text', role: 'player', sender: 'Rook', text: 'a' },
        { kind: 'roll', role: 'player', sender: 'Rook', roll: { label: 'X', detail: '1', total: 1 } },
      ],
      commsFilter: 'roll',
    };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.commsFeed).toHaveLength(1);
    expect(vals.commsFeed[0].kind).toBe('roll');
    expect(vals.hasCommsFeed).toBe(true);
    expect(vals.noCommsFeed).toBe(false);
  });

  it('reports noCommsFeed for an empty feed', () => {
    const vals = chatRenderVals({ comms: [], commsFilter: 'all' }, baseDeps());
    expect(vals.noCommsFeed).toBe(true);
  });

  it('computes unread as inbound messages minus readCount', () => {
    const state = {
      comms: [
        { role: 'player', sender: 'Vesper', kind: 'text' },
        { role: 'gm', sender: 'MESTRE', kind: 'text' },
      ],
      readCount: 1,
      commsFilter: 'all',
    };
    const vals = chatRenderVals(state, baseDeps());
    expect(vals.unread).toBe(1);
    expect(vals.hasUnread).toBe(true);
  });

  it('wires the filter buttons through deps.setCommsFilter', () => {
    const deps = baseDeps();
    const vals = chatRenderVals({ comms: [], commsFilter: 'all' }, deps);
    vals.commsFilterBtns.find(b => b.key === 'roll').onClick();
    expect(deps.setCommsFilter).toHaveBeenCalledWith('roll');
  });

  it('wires gmDraft/reply compose fields through deps', () => {
    const deps = baseDeps();
    const vals = chatRenderVals({ comms: [], commsFilter: 'all', gmDraft: 'hey', reply: 'yo' }, deps);
    expect(vals.gmDraft).toBe('hey');
    expect(vals.reply).toBe('yo');
    vals.onGmDraft({ target: { value: 'new' } });
    expect(deps.setGmDraft).toHaveBeenCalledWith('new');
    vals.onReply({ target: { value: 'new2' } });
    expect(deps.setReply).toHaveBeenCalledWith('new2');
  });
});

function fakeComponent(overrides = {}) {
  return {
    state: { comms: [], gm: false, commsOpen: false, gmDraft: '', reply: '', ...overrides.state },
    setState: vi.fn(function (patch) {
      this.state = { ...this.state, ...patch };
    }),
    activeCharacter: vi.fn(() => ({ name: 'Rook' })),
    scrollCommsToBottom: vi.fn(),
    postChat: vi.fn(),
  };
}

describe('ui/views/chat chatHandlers', () => {
  it('openComms sets commsOpen and readCount to the current inbound count, then scrolls', () => {
    const component = fakeComponent({ state: { comms: [{ role: 'player', sender: 'Vesper' }, { role: 'gm', sender: 'M' }] } });
    chatHandlers(component).openComms();
    expect(component.state.commsOpen).toBe(true);
    expect(component.state.readCount).toBe(2);
    expect(component.scrollCommsToBottom).toHaveBeenCalledTimes(1);
  });

  it('closeComms sets commsOpen false', () => {
    const component = fakeComponent({ state: { commsOpen: true } });
    chatHandlers(component).closeComms();
    expect(component.state.commsOpen).toBe(false);
  });

  it('toggleComms opens when closed and closes when open', () => {
    const component = fakeComponent({ state: { commsOpen: false } });
    const handlers = chatHandlers(component);
    handlers.toggleComms();
    expect(component.state.commsOpen).toBe(true);
    handlers.toggleComms();
    expect(component.state.commsOpen).toBe(false);
  });

  it('sendGm posts the trimmed draft and clears it; no-ops when blank', () => {
    const component = fakeComponent({ state: { gmDraft: '  hello  ' } });
    chatHandlers(component).sendGm();
    expect(component.postChat).toHaveBeenCalledWith({ kind: 'text', text: 'hello' });
    expect(component.state.gmDraft).toBe('');

    const empty = fakeComponent({ state: { gmDraft: '   ' } });
    chatHandlers(empty).sendGm();
    expect(empty.postChat).not.toHaveBeenCalled();
  });

  it('sendReply posts the trimmed reply and clears it; no-ops when blank', () => {
    const component = fakeComponent({ state: { reply: '  yo  ' } });
    chatHandlers(component).sendReply();
    expect(component.postChat).toHaveBeenCalledWith({ kind: 'text', text: 'yo' });
    expect(component.state.reply).toBe('');
  });

  it('setCommsFilter/setGmDraft/setReply update the corresponding state field', () => {
    const component = fakeComponent();
    const handlers = chatHandlers(component);
    handlers.setCommsFilter('roll');
    expect(component.state.commsFilter).toBe('roll');
    handlers.setGmDraft('abc');
    expect(component.state.gmDraft).toBe('abc');
    handlers.setReply('def');
    expect(component.state.reply).toBe('def');
  });
});
