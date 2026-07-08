import { LIMIAR_TAROT_CARDS } from '../../domain/tarot/constants.ts';
import {
  computeTarotDamage,
  resolveTarotEffects,
  shuffleTarotDeck as tarotShuffleDeck,
  tarotSessionId as tarotNewSessionId,
  tarotCardFromEntry as tarotCardEntry,
  normalizeTarotState as tarotNormalizeState,
  tarotHistoryRows as tarotRows,
  tarotStatePatch as tarotPatch,
} from '../../domain/tarot/index.ts';
import { CPRED_CRITICAL_INJURIES } from '../../domain/character/constants.ts';
import { parseDiceText } from '../../domain/dice/index.ts';
import { chipStyle as viewChipStyle } from '../view/styles.js';

// Pure row-shaping helpers: no component state, just atom -> presentation.
function criticalOptionsFor(atom, selected) {
  const pool = (atom && atom.pool) || (atom && atom.location) || '';
  const rows = Object.values(CPRED_CRITICAL_INJURIES).filter(injury => !pool || injury.location === pool);
  const fallback = selected || (rows[0] && rows[0].id) || '';
  return rows.map(injury => ({ value: injury.id, label: injury.name_pt + ' // ' + injury.location.toUpperCase(), selected: injury.id === fallback, notSelected: injury.id !== fallback }));
}

function describeTarotAtom(atom, idx) {
  if (!atom) return 'Efeito #' + (idx + 1);
  if (atom.type === 'damage') {
    if (atom.timing === 'preArmor') return 'Dano base do ataque // +' + (atom.amount || 0) + ' antes da SP';
    if (atom.multiplier) return 'Dano base do ataque // x' + atom.multiplier + ' depois da SP';
    if (atom.timing === 'direct' || atom.bypassArmor) return 'Dano direto no HP';
    return 'Dano base do ataque';
  }
  if (atom.type === 'sp') return 'Ablacao de SP +' + atom.amount + ' // local ' + (atom.location === 'hit' ? 'atingido' : atom.location);
  if (atom.type === 'criticalInjury') {
    const injury = atom.injury && CPRED_CRITICAL_INJURIES[atom.injury];
    return 'Lesao critica: ' + (injury ? injury.name_pt : 'GM escolhe') + (atom.location ? ' // ' + atom.location.toUpperCase() : atom.pool ? ' // ' + atom.pool.toUpperCase() : '') + (atom.bonusDamage ? ' // bonus HP direto -' + atom.bonusDamage : '');
  }
  if (atom.type === 'humanity') return (atom.direction === 'gain' ? 'Ganho' : 'Perda') + ' de Humanidade: ' + atom.amount;
  if (atom.type === 'deathSave') return 'Death Save do alvo' + (atom.modifier ? ' // mod ' + atom.modifier : '');
  if (atom.type === 'status') return 'Status: ' + (atom.label_pt || atom.id);
  if (atom.type === 'cyberware') return 'Adjudicar cyberware: ' + atom.action + ' // ' + (atom.duration ? atom.duration.value + ' ' + atom.duration.unit : 'instantaneo');
  if (atom.type === 'weapon') return 'Adjudicar arma: ' + atom.action;
  if (atom.type === 'locationOverride') return 'Adjudicar local: acerta ' + atom.location;
  if (atom.type === 'special') return atom.note_pt || 'Nota do GM';
  return 'Efeito ' + atom.type;
}

function tarotRowId(prefix) {
  return 'tarot-' + prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function makeTarotRow(atom, idx) {
  const amount = atom && atom.amount;
  const dice = parseDiceText(amount);
  const injury = atom && atom.injury ? CPRED_CRITICAL_INJURIES[atom.injury] : null;
  const selectedInjuryId = atom && atom.injury ? atom.injury : ((criticalOptionsFor(atom)[0] || {}).value || '');
  return {
    id: tarotRowId((atom && atom.type) || 'row'),
    atom,
    status: atom && atom.type === 'special' ? 'skipped' : 'pending',
    rolledTotal: null,
    damageValue: atom && atom.type === 'damage' ? '' : dice ? '' : (typeof amount === 'number' ? String(amount) : ''),
    selectedLocation: atom && atom.location === 'head' ? 'head' : atom && atom.location === 'body' ? 'body' : (injury && injury.location) || (atom && atom.pool) || 'body',
    selectedInjuryId,
    note: describeTarotAtom(atom, idx),
  };
}

function tarotRgb(hex) {
  const clean = String(hex || '#d6aa4e').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function decodeTarotCard(card) {
  return new Promise((resolve) => {
    if (!card || !card.img) return resolve();
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = card.img;
    if (img.complete) resolve();
  });
}

// SYS.05 // TAROT: the Night City Tarot mini-game — draw/discard/shuffle flow,
// the FX canvas, the victim/attacker targeting picker, and the per-card
// resolution panel (roll/apply each resolved atom against the victim).
export function tarotRenderVals(state = {}, deps = {}) {
  const S = state;
  const tx = deps.tx || {};
  const tarotCurrent = S.tarotCurrent || null;
  const tarotHasCurrent = !!tarotCurrent;
  const tarotPhaseClass = S.tarotPhase ? 'is-' + S.tarotPhase : '';
  const tarotJusticeClass = tarotCurrent && tarotCurrent.discard === 'sentence-cut' && S.tarotPhase === 'discarding' ? 'justice-cut' : '';
  const tarotWorldClass = tarotCurrent && tarotCurrent.fx === 'world' ? 'tarot-world' : '';
  const tarotState = tarotNormalizeState(S.tarotState);
  const tarotSeenCount = tarotState.seen.length;
  const tarotCycleLabel = tarotSeenCount + '/' + LIMIAR_TAROT_CARDS.length;
  const tarotSessionStatus = tarotState.drawnThisSession
    ? tx.tarotSessionCard + ' ' + tarotState.drawnThisSession.name
    : tx.tarotSessionEmpty;
  const tarotSessionLocked = !!tarotState.drawnThisSession;
  const tarotCanReshuffle = tarotSeenCount >= LIMIAR_TAROT_CARDS.length;
  const tarotShuffleBtnClass = 'lm-tarot-btn-ghost' + (tarotCanReshuffle ? '' : ' lm-tarot-btn-disabled');
  const tarotFxLabel = tarotCurrent ? tarotCurrent.fxLabel : 'FX STANDBY';
  const tarotArtStyle = tarotCurrent ? "--tarot-art:url('" + tarotCurrent.img + "')" : '';
  const tarotVictim = deps.tarotVictim();
  const tarotAttacker = deps.tarotAttacker();
  const tarotCtx = deps.tarotContextFor(tarotVictim);
  const tarotCharacterOptions = (S.characters || []).map(c => ({ id: c.id, name: c.name || c.id, selected: c.id === tarotVictim.id, notSelected: c.id !== tarotVictim.id }));
  const tarotAttackerOptions = (S.characters || []).map(c => ({ id: c.id, name: c.name || c.id, selected: c.id === (tarotAttacker && tarotAttacker.id), notSelected: c.id !== (tarotAttacker && tarotAttacker.id) }));
  const tarotAttackMeleeStyle = viewChipStyle(tarotCtx.wasMelee);
  const tarotAttackRangedStyle = viewChipStyle(tarotCtx.wasRanged);
  const tarotResolution = S.tarotResolution || null;
  const tarotHasResolution = !!tarotResolution;
  const tarotNoResolution = !tarotResolution;
  const tarotUnresolved = tarotResolution && tarotResolution.unresolved && tarotResolution.unresolved.length
    ? tarotResolution.unresolved.map(note => ({ note }))
    : [];
  const tarotHasUnresolved = tarotUnresolved.length > 0;
  const rowStatusLabel = (row) => row.status === 'applied' ? 'APLICADO' : row.status === 'rolled' ? 'ROLADO' : row.status === 'skipped' ? 'NOTA' : 'PENDENTE';
  const rowStatusColor = (row) => row.status === 'applied' ? '#3fe0d0' : row.status === 'skipped' ? '#6f7a64' : row.status === 'rolled' ? '#d6aa4e' : '#c0635b';
  const tarotRowsView = (tarotResolution && tarotResolution.atoms || []).map(row => {
    const atom = row.atom || {};
    const dice = parseDiceText(atom.amount);
    const locked = row.status === 'applied' || row.status === 'skipped';
    const isNoteOnly = ['cyberware', 'weapon', 'locationOverride'].includes(atom.type);
    const isSpecial = atom.type === 'special';
    const isDeathSave = atom.type === 'deathSave';
    const needsDice = !!dice && !row.rolledTotal;
    const canRoll = !locked && row.status === 'pending' && (isDeathSave || needsDice);
    const canApply = !locked && !isSpecial && !isDeathSave && !isNoteOnly && (!needsDice || row.rolledTotal);
    const locationOptions = ['head', 'body'].map(loc => ({ value: loc, label: loc === 'head' ? 'CABECA' : 'CORPO', selected: (row.selectedLocation || 'body') === loc, notSelected: (row.selectedLocation || 'body') !== loc }));
    const injuryOptions = criticalOptionsFor(atom, row.selectedInjuryId);
    return {
      ...row,
      typeLabel: String(atom.type || 'atom').toUpperCase(),
      statusLabel: rowStatusLabel(row),
      statusColor: rowStatusColor(row),
      rolledLabel: row.rolledTotal ? 'ROLADO ' + row.rolledTotal : '',
      showDamageInput: atom.type === 'damage',
      showLocationSelect: !locked && ((atom.type === 'sp' && atom.location === 'hit') || atom.type === 'damage'),
      showInjurySelect: !locked && atom.type === 'criticalInjury' && (!atom.injury || atom.chooser),
      locationOptions,
      injuryOptions,
      canRoll,
      canApply,
      canAcknowledge: !locked && isNoteOnly,
      isSpecial,
      applyLabel: isNoteOnly ? 'OK' : tx.apply,
      rollLabel: isDeathSave ? 'ROLAR DEATH SAVE' : tx.rollDice,
      onDamageInput: (e) => deps.updateTarotRow(row.id, { damageValue: e.target.value }),
      onLocationChange: (e) => deps.updateTarotRow(row.id, { selectedLocation: e.target.value }),
      onInjuryChange: (e) => deps.updateTarotRow(row.id, { selectedInjuryId: e.target.value }),
      roll: () => deps.rollTarotRow(row.id),
      apply: () => deps.applyTarotRow(row.id),
    };
  });
  const tarotHasRows = tarotRowsView.length > 0;

  return {
    tarotCurrent: tarotCurrent || { n: '', name: '', effect: '', color: '#d6aa4e', img: '', glyph: '', fxLabel: '' },
    tarotHasCurrent,
    tarotNoCurrent: !tarotHasCurrent,
    tarotPhaseClass,
    tarotJusticeClass,
    tarotWorldClass,
    tarotDeckCount: tarotCycleLabel,
    tarotCycleSeen: tx.tarotCycleSeen,
    tarotSessionStatus,
    tarotSessionLocked,
    tarotCanReshuffle,
    tarotCannotReshuffle: !tarotCanReshuffle,
    tarotShuffleBtnClass,
    tarotShuffleTitle: tarotCanReshuffle ? '' : tx.tarotShuffleLocked,
    tarotIsGm: S.gm,
    tarotShowForceDraw: S.gm && tarotSessionLocked,
    tarotFxLabel,
    tarotArtStyle,
    tarotHistory: S.tarotHistory || [],
    tarotHasHistory: (S.tarotHistory || []).length > 0,
    tarotNoHistory: (S.tarotHistory || []).length === 0,
    tarotResolutionTitle: tx.tarotResolutionTitle,
    tarotCharacterOptions,
    tarotAttackerOptions,
    onTarotVictim: (e) => deps.setTarotTarget(e.target.value),
    onTarotAttacker: (e) => deps.setTarotAttacker(e.target.value),
    tarotAttackMeleeStyle,
    tarotAttackRangedStyle,
    setTarotMelee: () => deps.setTarotContext({ attackType: 'melee' }),
    setTarotRanged: () => deps.setTarotContext({ attackType: 'ranged' }),
    tarotTargetHasCyberware: tarotCtx.targetHasCyberware,
    tarotTargetNoCyberware: !tarotCtx.targetHasCyberware,
    tarotTargetHasExplosive: tarotCtx.targetHasExplosive,
    tarotTargetNoExplosive: !tarotCtx.targetHasExplosive,
    tarotCyberAutoLabel: tarotCtx.autoCyberware ? 'AUTO: SIM' : 'AUTO: NAO',
    tarotExplosiveAutoLabel: tarotCtx.autoExplosive ? 'AUTO: SIM' : 'AUTO: NAO',
    onTarotCyberware: (e) => deps.setTarotContext({ targetHasCyberware: !!e.target.checked }),
    onTarotExplosive: (e) => deps.setTarotContext({ targetHasExplosive: !!e.target.checked }),
    resolveTarotPanel: () => deps.resolveTarotPanel(),
    revertTarotPanel: () => deps.restoreTarotSnapshot(),
    closeTarotResolution: () => deps.closeTarotResolution(),
    tarotHasResolution,
    tarotNoResolution,
    tarotRows: tarotRowsView,
    tarotHasRows,
    tarotUnresolved,
    tarotHasUnresolved,
    drawTarot: () => deps.drawTarot(),
    forceDrawTarot: () => deps.drawTarot(true),
    discardTarot: () => deps.discardTarot(),
    newTarotSession: () => deps.startNewTarotSession(),
    shuffleTarot: () => deps.shuffleTarot(),
  };
}

// component: the Component instance. state/setState/api/app/ensureGm/flash/
// tx/characterById/activeCharacter/normalizeCharacter/installedCyberware/
// normalizeGearList/asNumber/roll/skillCanonicalName/updateCharacterById/
// adjustSpDamage/addCriticalInjury/addStatusEffect/empImmunitySources already
// live there (shared well beyond the tarot view).
export function tarotHandlers(component) {
  function normalizeTarotState(payload) {
    return tarotNormalizeState(payload);
  }

  async function ensureTarotState(payload) {
    const isFresh = !payload;
    const state = normalizeTarotState(payload);
    if (isFresh && component.api() && component.api().tarot && component.api().tarot.state) {
      try {
        await component.api().tarot.state.set({ ...state, updatedAt: new Date().toISOString() });
      } catch (_) {
        // A non-GM/static session can still render; GM persistence remains the source of truth.
      }
    }
    return state;
  }

  async function saveTarotState(nextState, options = {}) {
    const state = normalizeTarotState({ ...nextState, updatedAt: new Date().toISOString() });
    const tarotApi = component.api() && component.api().tarot && component.api().tarot.state;
    if (tarotApi) {
      try {
        await tarotApi.set(state);
      } catch (err) {
        if (!options.allowLocal) {
          component.flash('Falha ao persistir taro: ' + err.message, 3200);
          return null;
        }
      }
    }
    component.setState(tarotPatch(state));
    return state;
  }

  function tarotSessionLocked() {
    const state = normalizeTarotState(component.state.tarotState);
    return !!state.drawnThisSession;
  }

  function tarotSessionStatusLabel(state) {
    const tarotState = normalizeTarotState(state || component.state.tarotState);
    return tarotState.drawnThisSession
      ? component.tx().tarotSessionCard + ' ' + tarotState.drawnThisSession.name
      : component.tx().tarotSessionEmpty;
  }

  async function startNewTarotSession() {
    if (!component.ensureGm('Login do mestre necessario para iniciar nova sessao de taro')) return;
    const state = normalizeTarotState(component.state.tarotState);
    const saved = await saveTarotState({
      ...state,
      sessionId: tarotNewSessionId(),
      drawnThisSession: null,
    });
    if (saved) component.flash('Nova sessao de taro iniciada');
  }

  function preloadTarotAssets() {
    if (component._tarotPreloaded) return;
    component._tarotPreloaded = true;
    LIMIAR_TAROT_CARDS.forEach((card) => {
      const img = new Image();
      img.src = card.img;
      if (img.decode) img.decode().catch(() => {});
    });
  }

  function stopTarotFx(clearTimer = true) {
    if (clearTimer) clearTimeout(component._tarotPhaseTimer);
    if (!component._tarotFx) return;
    component._tarotFx.active = false;
    cancelAnimationFrame(component._tarotFx.raf);
    if (component._tarotFx.ctx) component._tarotFx.ctx.clearRect(0, 0, component._tarotFx.w, component._tarotFx.h);
    component._tarotFx = null;
  }

  function startTarotFx(card) {
    const canvas = document.getElementById('limiar-tarot-fx');
    if (!canvas || !card) return;
    stopTarotFx(false);
    const ctx = canvas.getContext('2d', { alpha: true });
    const box = canvas.getBoundingClientRect();
    const parentBox = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : box;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, reduce ? 1.1 : 1.65);
    const w = Math.max(1, Math.floor(Math.max(box.width || 0, parentBox.width || 0)));
    const h = Math.max(1, Math.floor(Math.max(box.height || 0, parentBox.height || 0)));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rgb = tarotRgb(card.color);
    const countBase = reduce ? 34 : 86;
    const heavy = ['impact', 'lightning', 'world', 'solar', 'hellfire'].includes(card.fx);
    const count = heavy ? Math.min(118, countBase + 24) : countBase;
    const particles = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * (card.fx === 'chariot' ? 5 : 1.2),
      vy: (Math.random() - 0.5) * 1.2,
      r: 0.8 + Math.random() * (heavy ? 2.5 : 1.6),
      life: 0.25 + Math.random() * 0.75,
      seed: Math.random() * 8,
      i,
    }));
    const fx = { active: true, raf: 0, last: performance.now(), t: 0, canvas, ctx, w, h, rgb, mode: card.fx, particles };
    const reset = (p) => {
      p.x = Math.random() * w;
      p.y = card.fx === 'hellfire' || card.fx === 'solar' ? h + Math.random() * 40 : Math.random() * h;
      p.vx = (Math.random() - 0.5) * (card.fx === 'chariot' ? 5 : 1.2);
      p.vy = card.fx === 'hellfire' || card.fx === 'solar' ? -0.8 - Math.random() * 1.8 : (Math.random() - 0.5) * 1.2;
      p.life = 0.3 + Math.random() * 0.7;
    };
    const loop = (now) => {
      if (!fx.active) return;
      const dt = Math.min(0.04, (now - fx.last) / 1000 || 0.016);
      fx.last = now;
      fx.t += dt;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const cx = w * 0.5, cy = h * 0.48;
      for (const p of particles) {
        p.life -= dt * 0.055;
        if (p.life <= 0 || p.x < -60 || p.x > w + 60 || p.y < -80 || p.y > h + 80) reset(p);
        const dx = p.x - cx, dy = p.y - cy;
        const a = Math.atan2(dy, dx);
        if (card.fx === 'world' || card.fx === 'wheel') {
          p.vx += Math.cos(a + Math.PI / 2) * 0.035;
          p.vy += Math.sin(a + Math.PI / 2) * 0.035;
        } else if (card.fx === 'matrix' || card.fx === 'verdict' || card.fx === 'judgement') {
          p.vy += 0.018;
        } else if (card.fx === 'void' || card.fx === 'psychic' || card.fx === 'moon') {
          p.vx += Math.sin(fx.t + p.seed + p.y * 0.01) * 0.025;
          p.vy += Math.cos(fx.t * 0.8 + p.seed + p.x * 0.01) * 0.02;
        } else if (card.fx === 'impact' || card.fx === 'lightning') {
          p.vx += Math.cos(a) * 0.045;
          p.vy += Math.sin(a) * 0.045;
        }
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        const alpha = Math.max(0.05, Math.min(0.52, p.life * 0.45));
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
        ctx.shadowBlur = card.fx === 'world' ? 16 : 9;
        ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha * 1.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (card.fx === 'world' || card.fx === 'starfield') {
        ctx.lineWidth = 1;
        for (let i = 0; i < particles.length; i += 5) {
          const p = particles[i], q = particles[(i + 17) % particles.length];
          const dist = Math.hypot(p.x - q.x, p.y - q.y);
          if (dist < 150) {
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.15 * (1 - dist / 150)})`;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      if (!document.hidden) fx.raf = requestAnimationFrame(loop);
    };
    component._tarotFx = fx;
    fx.raf = requestAnimationFrame(loop);
  }

  async function drawTarotNext(force = false) {
    const result = await component.app().resolveTarotDraw.execute({ tarotState: component.state.tarotState, force });
    if (!result.ok) {
      if (result.error) component.flash(result.error, 3200);
      else component.flash('Ja existe uma carta sacada nesta sessao. Use NOVA SESSAO ou FORCAR SAQUE.', 3200);
      return;
    }
    const { card, tarotState: savedState } = result;
    await decodeTarotCard(card);
    stopTarotFx();
    component.setState({
      tarotCurrent: card,
      tarotDeck: savedState.order,
      tarotPhase: 'dealing',
      tarotResolution: null,
      tarotApplySnapshot: null,
      tarotHistory: tarotRows(savedState.history),
    });
    clearTimeout(component._tarotPhaseTimer);
    component._tarotPhaseTimer = setTimeout(() => {
      if (component.state.tarotCurrent === card) {
        component.setState({ tarotPhase: 'shown' });
        setTimeout(() => startTarotFx(card), 30);
      }
    }, 720);
  }

  async function drawTarot(force = false) {
    if (tarotSessionLocked() && !force) {
      component.flash('Ja existe uma carta sacada nesta sessao. Use NOVA SESSAO ou FORCAR SAQUE.', 3200);
      return;
    }
    if (component.state.tarotPhase === 'shown' && component.state.tarotCurrent) {
      replaceTarotCard(force);
      return;
    }
    if (component.state.tarotPhase !== 'idle') return;
    await drawTarotNext(force);
  }

  function replaceTarotCard(force = false) {
    if (component.state.tarotPhase !== 'shown' || !component.state.tarotCurrent) return;
    const current = component.state.tarotCurrent;
    component.setState({ tarotPhase: 'discarding' });
    clearTimeout(component._tarotPhaseTimer);
    component._tarotPhaseTimer = setTimeout(() => {
      stopTarotFx();
      component.setState({ tarotCurrent: null, tarotPhase: 'idle', tarotResolution: null, tarotApplySnapshot: null });
      setTimeout(() => drawTarotNext(force), 35);
    }, current.discard === 'sentence-cut' ? 820 : 660);
  }

  function discardTarot() {
    if (component.state.tarotPhase !== 'shown' || !component.state.tarotCurrent) return;
    component.setState({ tarotPhase: 'discarding' });
    clearTimeout(component._tarotPhaseTimer);
    component._tarotPhaseTimer = setTimeout(() => {
      stopTarotFx();
      component.setState({ tarotCurrent: null, tarotPhase: 'idle', tarotResolution: null, tarotApplySnapshot: null });
    }, component.state.tarotCurrent.discard === 'sentence-cut' ? 820 : 660);
  }

  async function shuffleTarot() {
    if (component.state.tarotPhase === 'dealing' || component.state.tarotPhase === 'discarding') return;
    const state = normalizeTarotState(component.state.tarotState);
    if (state.seen.length < LIMIAR_TAROT_CARDS.length) {
      component.flash('Embaralhar libera quando 22/22 cartas forem vistas no ciclo.', 3200);
      return;
    }
    const savedState = await saveTarotState({
      ...state,
      order: tarotShuffleDeck(),
      seen: [],
    });
    if (!savedState) return;
    stopTarotFx();
    clearTimeout(component._tarotPhaseTimer);
    component.setState({ tarotDeck: savedState.order, tarotCurrent: null, tarotPhase: 'shuffling', tarotResolution: null, tarotApplySnapshot: null });
    component._tarotPhaseTimer = setTimeout(() => component.setState({ tarotPhase: 'idle' }), 360);
  }

  function tarotVictim() {
    const fallback = component.activeCharacter();
    return component.characterById(component.state.tarotTargetId || fallback.id);
  }

  function tarotAttacker() {
    const id = component.state.tarotAttackerId || component.activeCharacter().id;
    return id ? component.characterById(id) : null;
  }

  function tarotContextFor(victim) {
    const ctx = component.state.tarotContext || {};
    const v = victim || tarotVictim();
    const autoCyberware = component.installedCyberware(v).length > 0;
    const autoExplosive = characterHasExplosive(v);
    return {
      wasMelee: (ctx.attackType || 'melee') === 'melee',
      wasRanged: (ctx.attackType || 'melee') === 'ranged',
      targetHasCyberware: ctx.targetHasCyberware == null ? autoCyberware : !!ctx.targetHasCyberware,
      targetHasExplosive: ctx.targetHasExplosive == null ? autoExplosive : !!ctx.targetHasExplosive,
      autoCyberware,
      autoExplosive,
    };
  }

  function characterHasExplosive(character) {
    const text = component.normalizeGearList(character && character.gear).map(g => [g.name, g.type, g.notes, g.weaponClass].join(' ')).join(' ').toLowerCase();
    return /\b(grenade|granada|explosive|explosivo|rocket|missile|mina)\b/.test(text);
  }

  function setTarotTarget(id) {
    const victim = component.characterById(id);
    component.setState(s => ({
      tarotTargetId: victim.id,
      tarotContext: { ...(s.tarotContext || {}), targetHasCyberware: null, targetHasExplosive: null },
      tarotResolution: null,
      tarotApplySnapshot: null,
    }));
  }

  function setTarotAttacker(id) {
    component.setState({ tarotAttackerId: id || '', tarotResolution: null });
  }

  function setTarotContext(patch) {
    component.setState(s => ({ tarotContext: { ...(s.tarotContext || {}), ...patch } }));
  }

  // Infer the Phase 3 attackType picker from the weapon's combat skill.
  function attackTypeFromWeapon(weapon) {
    const skill = component.skillCanonicalName(weapon && weapon.skill);
    if (['Archery', 'Autofire', 'Handgun', 'Heavy Weapons', 'Shoulder Arms'].includes(skill)) return 'ranged';
    if (['Brawling', 'Martial Arts', 'Melee Weapon'].includes(skill)) return 'melee';
    return (component.state.tarotContext && component.state.tarotContext.attackType) || 'melee';
  }

  function tarotSnapshot(character, card) {
    const c = component.normalizeCharacter(character);
    return {
      cardN: card && card.n,
      targetId: c.id,
      criticalInjuries: (c.criticalInjuries || []).map(entry => ({ ...entry })),
      statusEffects: (c.statusEffects || []).map(entry => ({ ...entry, duration: entry.duration ? { ...entry.duration } : null, remaining: entry.remaining ? { ...entry.remaining } : null, modifiers: { ...(entry.modifiers || {}), spAblation: entry.modifiers && entry.modifiers.spAblation ? { ...entry.modifiers.spAblation } : undefined } })),
      spDamage: { ...(c.spDamage || { head: 0, body: 0 }) },
      health: { cur: c.health && c.health.cur },
      humanityLoss: c.humanityLoss || 0,
    };
  }

  function restoreTarotSnapshot() {
    const snap = component.state.tarotApplySnapshot;
    if (!snap || !snap.targetId) return component.flash('Nenhum snapshot de taro para reverter');
    const target = component.characterById(snap.targetId);
    component.updateCharacterById(target.id, {
      criticalInjuries: snap.criticalInjuries || [],
      statusEffects: snap.statusEffects || [],
      spDamage: snap.spDamage || { head: 0, body: 0 },
      health: { ...(target.health || {}), cur: snap.health && snap.health.cur },
      humanityLoss: snap.humanityLoss || 0,
    });
    component.setState({ tarotResolution: null, tarotApplySnapshot: null });
  }

  function tarotTargetIdFor(atom) {
    if (!atom || atom.target === 'victim' || atom.scope === 'victim') return tarotVictim().id;
    if (atom.target === 'attacker' || atom.scope === 'attacker' || atom.scope === 'attacker-vs-victim') return (component.state.tarotAttackerId || component.activeCharacter().id || '');
    return tarotVictim().id;
  }

  function resolveTarotPanel() {
    if (!component.state.tarotCurrent) return;
    const victim = tarotVictim();
    const ctx = tarotContextFor(victim);
    const resolved = resolveTarotEffects(component.state.tarotCurrent, ctx);
    const rows = (resolved.resolved || []).map((atom, idx) => makeTarotRow(atom, idx));
    const currentSnap = component.state.tarotApplySnapshot;
    const snapshot = currentSnap && currentSnap.cardN === component.state.tarotCurrent.n && currentSnap.targetId === victim.id
      ? currentSnap
      : tarotSnapshot(victim, component.state.tarotCurrent);
    component.setState({
      tarotTargetId: victim.id,
      tarotAttackerId: component.state.tarotAttackerId || component.activeCharacter().id,
      tarotResolution: { cardN: component.state.tarotCurrent.n, atoms: rows, unresolved: resolved.unresolved || [] },
      tarotApplySnapshot: snapshot,
    });
  }

  function updateTarotRow(rowId, patch) {
    component.setState(s => {
      const res = s.tarotResolution;
      if (!res) return {};
      return { tarotResolution: { ...res, atoms: (res.atoms || []).map(row => row.id === rowId ? { ...row, ...patch } : row) } };
    });
  }

  function rollTarotRow(rowId) {
    const res = component.state.tarotResolution;
    const row = res && (res.atoms || []).find(r => r.id === rowId);
    if (!row || row.status === 'applied') return;
    const atom = row.atom || {};
    if (atom.type === 'deathSave') {
      const victim = tarotVictim();
      const target = (victim.derived && victim.derived.deathSave || 0) + (Number(atom.modifier) || 0);
      component.roll({ label: 'TARO DEATH SAVE', sides: 10, count: 1, mod: 0, deathSaveTarget: target, skipActionPenalty: true, onResolved: (result) => {
        if (result.deathSavePassed) {
          updateTarotRow(rowId, { status: 'rolled', rolledTotal: result.total, note: row.note + ' // sucesso' });
          return;
        }
        const failRows = (atom.onFail || []).map((failAtom, idx) => makeTarotRow(failAtom, idx));
        component.setState(s => {
          const current = s.tarotResolution || res;
          return { tarotResolution: { ...current, atoms: (current.atoms || []).map(r => r.id === rowId ? { ...r, status: 'rolled', rolledTotal: result.total, note: row.note + ' // falhou' } : r).concat(failRows) } };
        });
      } });
      return;
    }
    const dice = parseDiceText(atom.amount);
    if (!dice) return;
    component.roll({ label: 'TARO ' + atom.type.toUpperCase(), sides: dice.sides, count: dice.count, mod: 0, skipActionPenalty: true, onResolved: (result) => {
      updateTarotRow(rowId, { status: 'rolled', rolledTotal: result.total, damageValue: String(result.total) });
    } });
  }

  function applyTarotRow(rowId) {
    const res = component.state.tarotResolution;
    const row = res && (res.atoms || []).find(r => r.id === rowId);
    if (!row || row.status === 'applied') return;
    const atom = row.atom || {};
    const targetId = tarotTargetIdFor(atom);
    if (!targetId && atom.target === 'attacker') {
      updateTarotRow(rowId, { status: 'skipped', note: row.note + ' // atacante nao definido' });
      return;
    }
    const target = component.characterById(targetId);
    const mark = (note) => updateTarotRow(rowId, { status: 'applied', note: note || row.note });
    if (atom.type === 'damage') {
      const amount = component.asNumber(row.damageValue || row.rolledTotal, 0, 0, 999);
      const damage = computeTarotDamage(target, {
        rolledDamage: amount,
        location: row.selectedLocation || 'body',
        atoms: (res.atoms || []).map(r => r.atom),
      });
      component.updateCharacterById(target.id, { health: { ...(target.health || {}), cur: Math.max(0, ((target.health && target.health.cur) || 0) - damage.hpLoss) } });
      if (damage.spAblated) component.adjustSpDamage(target.id, damage.location, damage.spAblated);
      mark(row.note + ' // HP -' + damage.hpLoss + ' // ' + damage.breakdown.join(' // '));
    } else if (atom.type === 'sp') {
      component.adjustSpDamage(target.id, row.selectedLocation || 'body', atom.amount || 0);
      mark(row.note + ' // SP ' + (row.selectedLocation || 'body') + ' -' + (atom.amount || 0));
    } else if (atom.type === 'criticalInjury') {
      const injuryId = atom.injury || row.selectedInjuryId;
      const catalog = CPRED_CRITICAL_INJURIES[injuryId];
      const bonusDamage = Math.max(0, Number(atom.bonusDamage) || 0);
      const result = component.addCriticalInjury(row.selectedLocation || (catalog && catalog.location) || 'body', injuryId, {
        targetId: target.id,
        source: 'tarot:' + ((component.state.tarotCurrent && component.state.tarotCurrent.n) || '?'),
        stackPenalty: atom.stackPenalty,
        hpLossDirect: bonusDamage,
      });
      if (result && result.blocked) {
        mark(row.note + ' // bloqueada por ' + result.sources.join(', '));
        return;
      }
      mark(row.note + (bonusDamage ? ' // HP direto -' + bonusDamage : ' // sem dano bonus'));
    } else if (atom.type === 'humanity') {
      const amount = component.asNumber(row.rolledTotal || atom.amount, 0, 0, 100);
      const sign = atom.direction === 'gain' ? -1 : 1;
      component.updateCharacterById(target.id, { humanityLoss: Math.max(0, Math.min(100, (target.humanityLoss || 0) + sign * amount)) });
      mark(row.note + (sign > 0 ? ' // humanity loss +' : ' // humanity loss -') + amount);
    } else if (atom.type === 'status') {
      component.addStatusEffect({ id: atom.id, label_pt: atom.label_pt, duration: atom.duration || null, modifiers: atom.modifiers || {} }, { targetId: target.id, source: 'tarot:' + ((component.state.tarotCurrent && component.state.tarotCurrent.n) || '?') });
      mark();
    } else if (atom.type === 'cyberware') {
      const empSources = atom.action === 'disable' ? component.empImmunitySources(target) : [];
      mark(row.note + (empSources.length ? ' // EMP resistido por ' + empSources.join(', ') + ' // demais cyberware adjudicar' : ' // adjudicado'));
    } else if (['weapon', 'locationOverride'].includes(atom.type)) {
      mark(row.note + ' // adjudicado');
    }
  }

  return {
    ensureTarotState,
    saveTarotState,
    normalizeTarotState,
    tarotCardFromEntry: tarotCardEntry,
    tarotHistoryRows: tarotRows,
    tarotSessionLocked,
    tarotSessionStatusLabel,
    startNewTarotSession,
    preloadTarotAssets,
    stopTarotFx,
    startTarotFx,
    drawTarot,
    drawTarotNext,
    replaceTarotCard,
    discardTarot,
    shuffleTarot,
    tarotVictim,
    tarotAttacker,
    tarotContextFor,
    setTarotTarget,
    setTarotAttacker,
    setTarotContext,
    attackTypeFromWeapon,
    restoreTarotSnapshot,
    resolveTarotPanel,
    updateTarotRow,
    rollTarotRow,
    applyTarotRow,
    closeTarotResolution: () => component.setState({ tarotResolution: null }),
  };
}
