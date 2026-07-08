import { normalizeEnhancementCodes } from '../domain/cyberware/index.ts';

interface EquippedItem {
  code?: string;
  name?: string;
  attachesTo?: string[];
  enhancements?: unknown;
  [extra: string]: unknown;
}

interface CharactersApi {
  upsert: (character: Record<string, unknown>) => unknown;
}

export interface ToggleCyberwareEnhancementApi {
  characters?: CharactersApi;
}

export interface ToggleCyberwareEnhancementInput {
  character: Record<string, unknown> & { equipped?: unknown };
  parentCode: string;
  enhancementCode: string;
  normalizeEquipped?: (equipped: unknown) => EquippedItem[];
}

export interface ToggleCyberwareEnhancementResult {
  ok: boolean;
  error?: string;
  characterPatch?: { equipped: EquippedItem[] };
  flashMessage?: string;
}

// Attaches/detaches an enhancement to/from a parent cyberware item already on
// the character. normalizeEquipped is injected since resolving the raw
// equipped array into full product-shaped items depends on the runtime
// catalog (Component.productByCode), not on pure domain data.
export default class ToggleCyberwareEnhancement {
  api?: ToggleCyberwareEnhancementApi;

  constructor({ api }: { api?: ToggleCyberwareEnhancementApi } = {}) {
    this.api = api;
  }

  execute({ character, parentCode, enhancementCode, normalizeEquipped }: ToggleCyberwareEnhancementInput): ToggleCyberwareEnhancementResult {
    const current = character || {};
    const equipped: EquippedItem[] = normalizeEquipped ? normalizeEquipped(current.equipped) : ((current.equipped as EquippedItem[]) || []);
    const enhancement = equipped.find(it => it.code === enhancementCode);
    if (!enhancement || !Array.isArray(enhancement.attachesTo) || !enhancement.attachesTo.includes(parentCode)) {
      return { ok: false, error: 'Enhancement incompatível' };
    }
    let attached = false;
    const nextEquipped = equipped.map(it => {
      if (!it || !it.code || it.code === enhancementCode) return it;
      let codes = normalizeEnhancementCodes(it.enhancements).filter(code => code !== enhancementCode);
      if (it.code === parentCode) {
        attached = !normalizeEnhancementCodes(it.enhancements).includes(enhancementCode);
        if (attached) codes = [...codes, enhancementCode];
      }
      return { ...it, enhancements: codes };
    });
    const characterPatch = { equipped: nextEquipped };
    if (this.api?.characters) this.api.characters.upsert({ ...current, ...characterPatch });
    return {
      ok: true,
      characterPatch,
      flashMessage: (enhancement.name || enhancement.code) + (attached ? ' vinculado' : ' desvinculado'),
    };
  }
}
