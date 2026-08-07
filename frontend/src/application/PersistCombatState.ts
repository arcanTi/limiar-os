export interface CombatStatePersistenceApi {
  combat?: { state?: { set: (state: Record<string, unknown>) => Promise<unknown> } };
}

/** Keeps HTTP persistence out of combat rendering and interaction handlers. */
export default class PersistCombatState {
  constructor(private readonly api?: CombatStatePersistenceApi) {}

  available(): boolean {
    return Boolean(this.api?.combat?.state?.set);
  }

  async execute(state: Record<string, unknown>): Promise<unknown> {
    if (!this.api?.combat?.state?.set) return state;
    return this.api.combat.state.set(state);
  }
}
