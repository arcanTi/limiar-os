// Telling a real likeness apart from the generated card art.

interface PortraitBearer {
  portraitUrl?: unknown;
}

/**
 * The photo someone actually uploaded, or '' when there is none.
 *
 * Every sheet carries a `portraitUrl`: the wizard fills it with `svgCard`, a
 * 900x560 data: URI that is the same graphic for everybody. That art is a
 * placeholder, not a likeness, so anywhere a face is the point — the operative
 * picker, a roster row — it has to read as "no photo yet" and let the initials
 * stand in. Uploads are served from a path, never inlined, so the data: prefix
 * is the whole test.
 */
export function uploadedPortrait(character: PortraitBearer | null | undefined): string {
  const url = String((character && character.portraitUrl) || '').trim();
  if (!url || url.slice(0, 5).toLowerCase() === 'data:') return '';
  return url;
}
