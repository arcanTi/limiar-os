// Turns install-engine issues into a line a player can act on.
//
// The engine speaks in English rule identifiers ("Required cyberware is not
// installed."), which is useless at the counter: the player needs to know
// WHICH piece is missing and what to do about it. Everything the answer needs
// is already in the issue's `evidence`, so this reads it back and names the
// missing part using the catalog the shop is already holding.

import type { ValidationIssue } from './itemTypes.ts';
import type { LegacyCatalogItem } from './legacyCatalogTypes.ts';

function evidenceOf(issue: ValidationIssue): Record<string, unknown> {
  const evidence = issue && issue.evidence;
  return evidence && typeof evidence === 'object' ? evidence as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

/** The item's shop name, falling back to its code when the catalog has no row. */
export function catalogLabel(catalog: unknown, code: unknown): string {
  const wanted = text(code);
  if (!wanted) return '';
  const rows = (Array.isArray(catalog) ? catalog : []) as LegacyCatalogItem[];
  const hit = rows.find((row) => row && text((row as { code?: unknown }).code) === wanted);
  const name = hit ? text((hit as { name?: unknown }).name) : '';
  return name || wanted;
}

/** One issue as an instruction in Portuguese, or the raw message when unmapped. */
export function describeInstallIssue(issue: ValidationIssue, catalog: unknown = []): string {
  if (!issue) return '';
  const evidence = evidenceOf(issue);
  const required = catalogLabel(catalog, evidence.requiredCode);
  switch (issue.type) {
    case 'required_cyberware_missing':
      return required ? `precisa de ${required} instalado antes` : 'precisa de outro implante instalado antes';
    case 'required_cyberware_count_missing': {
      const count = Number(evidence.requiredCount) || 1;
      const have = Number(evidence.count) || 0;
      return `precisa de ${count}x ${required || 'o implante base'} instalado (voce tem ${have})`;
    }
    case 'paired_cyberware_requirement_missing': {
      const count = Number(evidence.requiredCount) || 2;
      return `precisa de ${count}x ${required || 'o implante base'} em locais diferentes (ex.: os dois bracos)`;
    }
    case 'required_stat_missing':
      return `precisa de ${text(evidence.stat) || 'STAT'} ${Number(evidence.min) || 0} (voce tem ${Number(evidence.value) || 0})`;
    case 'cyberware_duplicate_unique':
      return 'e uma peca unica: so cabe uma instalada';
    case 'cyberware_parent_wrong_type': {
      const parent = catalogLabel(catalog, evidence.requiredParentCode);
      return parent ? `so encaixa em ${parent}` : 'nao encaixa na peca escolhida';
    }
    case 'cyberware_parent_not_found':
    case 'slot_parent_not_found':
    case 'paired_parent_slot_missing':
    case 'paired_parent_slot_pool_missing':
      return 'depende de uma peca base que nao esta instalada';
    case 'slot_capacity_exceeded': {
      const pool = text(evidence.poolId);
      const capacity = Number(evidence.capacity) || 0;
      return `nao ha espaco livre${pool ? ` em ${pool}` : ''}: ${capacity} slot(s) ja ocupado(s)`;
    }
    default:
      return text(issue.message);
  }
}

/** Every reason at once, deduplicated, ready to drop into a warning tag. */
export function installBlockText(issues: ValidationIssue[] | null | undefined, catalog: unknown = []): string {
  const seen = new Set<string>();
  return (issues || [])
    .map((issue) => describeInstallIssue(issue, catalog))
    .filter((line) => {
      if (!line || seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join('; ');
}
