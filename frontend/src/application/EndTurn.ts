import { advanceCombatTurn } from '../domain/combat/index.ts';
import type { CombatState } from '../domain/combat/index.ts';
import { isPlayerUser } from '../domain/auth/policies.ts';
import type { SessionSnapshot } from '../domain/auth/policies.ts';

interface CombatStateApi {
  set: (state: CombatState & { updatedAt: string }) => Promise<unknown>;
  endTurn?: (currentId: string) => Promise<CombatState>;
}

export interface EndTurnApi {
  combat?: { state: CombatStateApi };
}

export interface EndTurnInput {
  session?: SessionSnapshot;
  combatState: CombatState;
  currentId: string | null;
  activeCharacterId?: string | null;
  combatantName?: string;
  requireOwnTurn?: boolean;
}

export interface EndTurnResult {
  ok: boolean;
  error?: string | null;
  combatState?: CombatState;
  path?: 'gm' | 'player';
  chatMessage?: string | null;
}

// Encapsulates both end-turn entry points: the GM's "NEXT" button (full
// local state transition, persisted directly) and a player's "END TURN"
// self-service action (must be their own combatant's turn; goes through the
// backend's restricted /combat-state/end-turn endpoint, which re-validates
// turn ownership server-side). requireOwnTurn is true only for the
// self-service path.
export default class EndTurn {
  api?: EndTurnApi;
  clock: () => Date;

  constructor({ api, clock = () => new Date() }: { api?: EndTurnApi; clock?: () => Date } = {}) {
    this.api = api;
    this.clock = clock;
  }

  async execute({ session = {}, combatState, currentId, activeCharacterId, combatantName, requireOwnTurn = false }: EndTurnInput): Promise<EndTurnResult> {
    if (requireOwnTurn && (!currentId || currentId !== activeCharacterId)) return { ok: false, error: null };

    if (!isPlayerUser(session)) {
      const nextState = advanceCombatTurn(combatState, currentId);
      if (this.api && this.api.combat) {
        try {
          await this.api.combat.state.set({ ...nextState, updatedAt: this.clock().toISOString() });
        } catch (err) {
          return { ok: false, error: 'Falha ao persistir combate: ' + (err as Error).message };
        }
      }
      return { ok: true, combatState: nextState, path: 'gm' };
    }

    if (!(this.api && this.api.combat && typeof this.api.combat.state.endTurn === 'function')) {
      return { ok: false, error: 'Backend de combate indisponivel' };
    }
    try {
      const saved = await this.api.combat.state.endTurn(currentId as string);
      return {
        ok: true,
        combatState: saved,
        path: 'player',
        chatMessage: saved ? ('FIM DE TURNO :: ' + (combatantName || currentId)) : null,
      };
    } catch (err) {
      return { ok: false, error: 'Falha ao finalizar turno: ' + (err as Error).message };
    }
  }
}
