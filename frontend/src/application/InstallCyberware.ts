import { resolveInstalledCyberware } from '../domain/items/cyberwareInstallEngine.ts';
import { cyberwareHumanityLoss } from '../domain/cyberware/index.ts';
import type { InstalledCyberwareItem } from '../domain/cyberware/index.ts';
import type { ValidationIssue } from '../domain/items/itemTypes.ts';
import type { LegacyCatalogItem, LegacyCharacter } from '../domain/items/legacyCatalogTypes.ts';
import canonicalRules from '../../../data/canonical/cpr-canonical-rules.json' with { type: 'json' };
import type { CanonicalRules } from '../domain/items/canonicalRulesTypes.ts';

// An issue is "new" if no issue with the same type/code/evidence existed
// before the install. Compares by structural signature rather than the
// affected instance's code alone, since pool-level issues (e.g. slot
// capacity) carry no top-level code.
function issueSignature(issue: ValidationIssue): string {
  return JSON.stringify([issue.type, issue.code || null, issue.evidence || null]);
}

function newErrorIssues(beforeIssues: ValidationIssue[], afterIssues: ValidationIssue[]): ValidationIssue[] {
  const beforeErrors = new Set(beforeIssues.filter(i => i.severity === 'error').map(issueSignature));
  return afterIssues.filter(i => i.severity === 'error' && !beforeErrors.has(issueSignature(i)));
}

interface CharactersApi {
  upsert: (character: Record<string, unknown>) => unknown;
}

export interface InstallCyberwareApi {
  characters?: CharactersApi;
}

interface ProductLike extends LegacyCatalogItem {
  price?: number;
  stock?: string;
}

export interface InstallCyberwareInput {
  character: LegacyCharacter;
  catalog: LegacyCatalogItem[];
  product: ProductLike;
  credits: unknown;
  resolveInstallPayload?: (product: ProductLike) => LegacyCatalogItem;
}

export interface InstallCyberwareResult {
  ok: boolean;
  error?: string | null;
  characterPatch?: Record<string, unknown>;
  humanityLossDelta?: number;
  toast?: string;
  issues?: ValidationIssue[];
}

// Orchestrates installing a cyberware product: validates slot/requirement
// rules via the canonical-rules engine, computes the humanity loss impact,
// and persists via the injected api client. Blocks only on NEW errors the
// install itself introduces (pre-existing legacy-data warnings on already
// installed chrome are not this action's problem).
export default class InstallCyberware {
  api?: InstallCyberwareApi;

  constructor({ api }: { api?: InstallCyberwareApi } = {}) {
    this.api = api;
  }

  execute({ character, catalog, product, credits, resolveInstallPayload }: InstallCyberwareInput): InstallCyberwareResult {
    const active = character || {};
    if (!product || !product.code) return { ok: false, error: null };
    const currentEquipped = Array.isArray(active.equipped) ? active.equipped : [];
    if (currentEquipped.some(it => it && it.code === product.code)) return { ok: false, error: null };

    const price = Number(product.price) || 0;
    const after = (Number(credits) || 0) - price;
    if (after < 0 || product.stock === 'SOLD OUT') return { ok: false, error: null };

    const installedItem = resolveInstallPayload ? resolveInstallPayload(product) : product;
    const nextEquipped = [...currentEquipped, installedItem];

    const before = resolveInstalledCyberware({ ...active, equipped: currentEquipped }, catalog, canonicalRules as CanonicalRules);
    const afterResolved = resolveInstalledCyberware({ ...active, equipped: nextEquipped }, catalog, canonicalRules as CanonicalRules);
    const blockingIssues = newErrorIssues(before.issues, afterResolved.issues);
    if (blockingIssues.length) {
      return {
        ok: false,
        error: product.code + ' nao pode ser instalado: ' + blockingIssues.map(issue => issue.message).join('; '),
        issues: blockingIssues,
      };
    }

    const humanityLossDelta = cyberwareHumanityLoss(nextEquipped as InstalledCyberwareItem[]) - cyberwareHumanityLoss(currentEquipped as InstalledCyberwareItem[]);
    const owned = nextEquipped.map(it => it && it.code).filter(Boolean);
    const characterPatch = { equipped: nextEquipped, owned, credits: after };
    if (this.api?.characters) this.api.characters.upsert({ ...active, ...characterPatch });
    return {
      ok: true,
      characterPatch,
      humanityLossDelta,
      toast: product.code + ' INSTALLED' + (humanityLossDelta ? ' (-' + humanityLossDelta + ' HUM)' : ''),
    };
  }
}
