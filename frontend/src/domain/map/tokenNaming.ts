// Naming policy for newly created tokens. It always numbers a fresh base
// ("Ganger" -> "Ganger 1" -> "Ganger 2", ...) rather than try to preserve a
// hand-typed suffix. Editing an already-placed token's name is untouched:
// the form just saves whatever the user typed, no renumbering.

export function nextTokenName(existingNames: readonly (string | null | undefined)[], requestedName: string): string {
  const trimmed = String(requestedName || '').trim() || 'Token';
  const m = trimmed.match(/^(.*?)\s+(\d+)$/);
  const base = (m ? m[1].trim() : trimmed) || 'Token';
  const baseLower = base.toLowerCase();
  let maxN = 0;
  for (const name of existingNames) {
    const mm = String(name || '').trim().match(/^(.*?)\s+(\d+)$/);
    if (mm && mm[1].trim().toLowerCase() === baseLower) maxN = Math.max(maxN, parseInt(mm[2], 10) || 0);
  }
  return `${base} ${maxN + 1}`;
}
