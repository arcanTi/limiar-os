// CORE tab folding. A GM reading someone else's sheet is usually after one
// number, not the whole dossier, so the four CORE blocks start folded and
// remember what was opened. Players keep the sheet fully expanded: it is their
// own character, and hiding it behind toggles would read as data lost.

// Order matters only for documentation; each key is independent.
export const SHEET_CORE_SECTION_KEYS = ['attrs', 'stats', 'dossier', 'brief'];

/**
 * Normalize a stored preference into a complete open/closed map. Unknown keys
 * are dropped and missing ones default to folded, so a preference written by an
 * older build can never leave a section in an undefined state.
 */
export function normalizeCoreSections(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const sections = {};
  SHEET_CORE_SECTION_KEYS.forEach((key) => { sections[key] = source[key] === true; });
  return sections;
}

export function toggleCoreSection(current, key) {
  const sections = normalizeCoreSections(current);
  if (!SHEET_CORE_SECTION_KEYS.includes(key)) return sections;
  return { ...sections, [key]: !sections[key] };
}
