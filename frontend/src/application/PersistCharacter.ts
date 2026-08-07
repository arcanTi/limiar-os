export interface CharacterPersistenceApi {
  characters?: {
    upsert: (character: Record<string, unknown>) => Promise<unknown>;
    createPlayer?: (character: Record<string, unknown>) => Promise<unknown>;
    patchNotes?: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  };
}

/** Single write boundary for the player sheet and combat-created NPCs. */
export default class PersistCharacter {
  constructor(private readonly api?: CharacterPersistenceApi) {}

  async save(character: Record<string, unknown>, { player = false } = {}): Promise<unknown> {
    const characters = this.api?.characters;
    if (!characters) return character;
    if (player && characters.createPlayer) return characters.createPlayer(character);
    return characters.upsert(character);
  }

  async patchNotes(
    id: string,
    patch: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<unknown> {
    if (!this.api?.characters?.patchNotes) return patch;
    return this.api.characters.patchNotes(
      id,
      expectedRevision === undefined ? patch : { ...patch, expectedRevision },
    );
  }
}
