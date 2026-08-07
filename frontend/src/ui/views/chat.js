import {
  chatIsInbound,
  chatRollTitle,
  chatText,
  parseDamageTrackingMessage,
} from '../../domain/chat/rollLog.ts';
import { trackingToneFromLabel, chatRollTone } from '../view/constants.js';

// SYS.06 // COMMS: the floating chat/roll-log drawer. Feed rows, unread
// count, the ALL/ROLLS/MESSAGES filter, and the GM's "request a named test"
// form (reqLabel/reqDv/reqSides) are pure given state + tx. The per-request
// "roll this" action stays in Component (rollFromRequest drives the animated
// dice roller, shared with the combat initiative button).
export function chatRenderVals(state = {}, deps = {}) {
  const S = state;
  const tx = deps.tx || {};
  const gm = !!S.gm;
  const activeName = deps.activeCharacterName || 'OPERATIVE';
  const activeCharacterId = deps.activeCharacterId;

  const commsFeed = (S.comms || []).map(m => {
    const isGm = m.role === 'gm';
    const mine = gm ? isGm : (m.role === 'player' && m.sender === activeName);
    const rgb = isGm ? '63,224,208' : '214,170,78';
    const accent = isGm ? '#3fe0d0' : '#d6aa4e';
    // Roll/request content gets colored by what it *is* (ranged/melee/test/
    // GM-requested), not by who sent it — sender already has the GM/player
    // identity color above; this is a second, independent axis.
    const tone = chatRollTone(m);
    const typeLabel = m.kind === 'roll' ? 'ROLL' : (m.kind === 'request' ? 'REQ' : (isGm ? 'GM' : 'MSG'));
    let text = chatText(m.text || '');
    let rollView = null;
    let trackingView = null;
    if (m.kind === 'roll' && m.roll) {
      rollView = {
        title: chatRollTitle(m.roll.label || 'ROLL', m.sender || ''),
        detail: chatText(m.roll.detail || ''),
        total: String(m.roll.total == null ? '' : m.roll.total),
        outcome: chatText(m.roll.outcome || ''),
      };
      text = '';
    } else if (m.kind === 'request' && m.request && !(m.text && m.text.trim())) {
      const rq = m.request;
      text = 'Pedido de teste: ' + (rq.label || 'TESTE') + ' (d' + rq.sides + (rq.dv != null ? ' vs DV ' + rq.dv : '') + ')';
    } else {
      trackingView = parseDamageTrackingMessage(text, { resolveTone: trackingToneFromLabel });
      if (trackingView) text = '';
    }
    const canRoll = !gm && m.kind === 'request' && !!m.request && (!m.request.combatantId || m.request.combatantId === activeCharacterId);
    const reqOpts = m.request;
    const bubbleClass = 'lm-chat-bubble'
      + (mine ? ' lm-chat-bubble--mine' : '')
      + (m.kind === 'roll' ? ' lm-chat-bubble--roll' : '')
      + (m.kind === 'request' ? ' lm-chat-bubble--request' : '')
      + (trackingView ? ' lm-chat-bubble--tracking' : '');
    return {
      kind: m.kind === 'roll' ? 'roll' : 'text',
      name: m.sender || (isGm ? 'MESTRE' : 'OPERATIVO'),
      text,
      isPlain: !!text,
      isRoll: !!rollView,
      rollTitle: rollView ? rollView.title : '',
      rollDetail: rollView ? rollView.detail : '',
      rollTotal: rollView ? rollView.total : '',
      rollOutcome: rollView ? rollView.outcome : '',
      isTracking: !!trackingView,
      trackingTitle: trackingView ? trackingView.title : '',
      trackingActor: trackingView ? trackingView.actor : '',
      trackingTone: trackingView ? trackingView.toneLabel : '',
      trackingRows: trackingView ? trackingView.rows : [],
      trackingTotal: trackingView ? trackingView.total : '',
      t: m.at || '',
      enc: false,
      typeLabel,
      canRoll,
      roll: canRoll ? (() => deps.rollFromRequest(reqOpts)) : (() => {}),
      rowStyle: 'lm-chat-row' + (mine ? ' lm-chat-row--mine' : ''),
      bubbleClass,
      chatVars: '--chat-accent:' + accent + ';--chat-rgb:' + rgb + ';--chat-glow:' + (m.kind === 'request' ? '0 0 8px ' + accent : 'none') + ';'
        + (trackingView ? '--chat-weapon:' + trackingView.toneColor + ';--chat-weapon-rgb:' + trackingView.toneRgb + ';' : '')
        + (tone ? '--chat-tone:' + tone.color + ';--chat-tone-rgb:' + tone.rgb + ';' : ''),
    };
  });

  const unread = Math.max(0, (S.comms || []).filter(m => chatIsInbound(m, { gm, activeName })).length - (S.readCount || 0));
  const commsFeedFiltered = S.commsFilter === 'all' ? commsFeed : commsFeed.filter(m => m.kind === S.commsFilter);
  const commsFilterBtns = [
    { key: 'all', label: tx.commsFilterAll },
    { key: 'roll', label: tx.commsFilterRolls },
    { key: 'text', label: tx.commsFilterMessages },
  ].map(f => ({
    key: f.key,
    label: f.label,
    onClick: () => deps.setCommsFilter(f.key),
    style: 'lm-comms-filter-btn' + (S.commsFilter === f.key ? ' lm-comms-filter-btn--on' : ''),
  }));
  const hasCommsFeed = commsFeedFiltered.length > 0;

  return {
    commsFeed: commsFeedFiltered,
    hasCommsFeed,
    noCommsFeed: !hasCommsFeed,
    commsFilterBtns,
    unread,
    hasUnread: unread > 0,
    commsOpen: !!S.commsOpen,
    toggleComms: deps.toggleComms,
    closeComms: deps.closeComms,
    gmDraft: S.gmDraft || '',
    onGmDraft: (e) => deps.setGmDraft(e.target.value),
    sendGm: deps.sendGm,
    reply: S.reply || '',
    onReply: (e) => deps.setReply(e.target.value),
    sendReply: deps.sendReply,
    reqLabel: S.reqLabel || '',
    reqDv: S.reqDv || '',
    onReqLabel: (e) => deps.setState({ reqLabel: e.target.value }),
    onReqDv: (e) => deps.setState({ reqDv: e.target.value }),
    onReqSides: (e) => deps.setState({ reqSides: Number(e.target.value) || 10 }),
    requestRoll: deps.requestRoll,
  };
}

// component: the Component instance. postChat/refreshChat/scrollCommsToBottom
// stay there — they're core infrastructure used well beyond this drawer
// (every combat/tarot/initiative roll posts through postChat). This only
// owns the drawer's own open/close/filter/compose state.
export function chatHandlers(component) {
  const openComms = () => {
    component.setState({
      commsOpen: true,
      readCount: (component.state.comms || []).filter(m => chatIsInbound(m, { gm: component.state.gm, activeName: component.activeCharacter().name })).length,
    });
    component.scrollCommsToBottom();
  };
  const closeComms = () => component.setState({ commsOpen: false });

  return {
    openComms,
    closeComms,
    toggleComms: () => (component.state.commsOpen ? closeComms() : openComms()),
    setCommsFilter: (filter) => component.setState({ commsFilter: filter }),
    setGmDraft: (value) => component.setState({ gmDraft: value }),
    sendGm: () => {
      const t = component.state.gmDraft.trim();
      if (!t) return;
      component.setState({ gmDraft: '' });
      component.postChat({ kind: 'text', text: t });
    },
    setReply: (value) => component.setState({ reply: value }),
    sendReply: () => {
      const t = component.state.reply.trim();
      if (!t) return;
      component.setState({ reply: '' });
      component.postChat({ kind: 'text', text: t });
    },
    // GM action: ask a player to roll a specific test. The request is delivered
    // as a comms message carrying the exact roll options, so the player rolls
    // it with one tap and the result is reported back automatically.
    requestRoll: () => {
      if (!component.ensureGm('Login do mestre necessario para pedir teste')) return;
      const label = (component.state.reqLabel || '').trim().toUpperCase() || 'TESTE';
      const sides = Number(component.state.reqSides) || 10;
      const dvRaw = String(component.state.reqDv || '').trim();
      const dv = dvRaw === '' ? null : Number(dvRaw);
      const check = sides === 10;
      const opts = { label, sides, count: 1, mod: 0, check };
      if (check && dv != null && !Number.isNaN(dv)) opts.dv = dv;
      const text = 'Pedido de teste: ' + label + ' (d' + sides + (opts.dv != null ? ' vs DV ' + opts.dv : '') + ')';
      component.setState({ reqLabel: '', reqDv: '' });
      component.postChat({ kind: 'request', text, request: opts });
    },
  };
}
