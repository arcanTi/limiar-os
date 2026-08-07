// Decode/format chat text for the comms feed and the damage-tracking log
// posted by postDamageRollTracking. Tone (color/label) is presentation and
// lives in ui/view/constants.js; callers inject a resolveTone(label, rows)
// callback instead of this module importing UI code.
export function chatText(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function chatRollTitle(label: unknown, sender: unknown): string {
  const parts = chatText(label || 'ROLL').split(/\s+::\s+/).map(part => part.trim()).filter(Boolean);
  const who = chatText(sender || '').trim().toUpperCase();
  if (parts.length > 1 && parts[0].toUpperCase() === who) parts.shift();
  return parts.join(' / ') || chatText(label || 'ROLL');
}

export interface ParsedDamageTrackingLine {
  source?: string;
  type?: string;
  reason?: string;
  notation?: string;
  faces?: string;
  subtotal?: string;
  raw?: string;
}

// Current format, produced by postDamageRollTracking:
//   "Wolvers :: BASE :: 3d6+2 :: ROLLS 4, 5, 6 :: SUBTOTAL 17"
// Legacy format, kept for backward-compat parsing of old stored messages:
//   "Wolvers [Weapon Base] 3d6+2 => 4, 5, 6 = 17"
export function parseDamageTrackingLine(line: unknown): ParsedDamageTrackingLine {
  const text = chatText(line).trim();
  let match = text.match(/^(.+?) :: (BASE|BONUS)(?: :: (.+?))? :: ([^:]+?) :: ROLLS (.*?) :: SUBTOTAL (-?\d+)$/);
  if (match) {
    return {
      source: match[1],
      type: match[2],
      reason: match[3] || '',
      notation: match[4],
      faces: match[5],
      subtotal: match[6],
    };
  }
  match = text.match(/^(.+?) \[(.+?)\] ([0-9]+d[0-9]+[+-]?\d*) => (.*?) = (-?\d+)$/);
  if (!match) return { raw: text };
  const rawType = match[2].trim();
  const typeParts = rawType.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  const primaryType = (typeParts[0] || rawType).toLowerCase();
  const type = primaryType === 'weapon base' ? 'BASE' : (primaryType === 'bonus' ? 'BONUS' : rawType);
  const reason = typeParts.slice(1).filter(part => part.toLowerCase() !== primaryType).join(' - ');
  return {
    source: match[1],
    type,
    reason,
    notation: match[3],
    faces: match[4],
    subtotal: match[5],
  };
}

// A comms message counts as "inbound" (unread-eligible) when it was not
// authored by the current viewer.
export function chatIsInbound(message: { role?: string; sender?: string } | null | undefined, { gm, activeName }: { gm?: boolean; activeName?: string } = {}): boolean {
  if (!message) return false;
  if (gm) return message.role !== 'gm';
  const myName = activeName || 'OPERATIVE';
  return !(message.role === 'player' && message.sender === myName);
}

export interface DamageTone {
  label: string;
  color: string;
  rgb: string;
}

export interface ParsedDamageTrackingMessage {
  title: 'DAMAGE';
  actor: string;
  toneLabel: string;
  toneColor: string;
  toneRgb: string;
  total: string;
  rows: ParsedDamageTrackingLine[];
}

export function parseDamageTrackingMessage(
  value: unknown,
  { resolveTone }: { resolveTone?: (label: string, rows: ParsedDamageTrackingLine[]) => DamageTone } = {},
): ParsedDamageTrackingMessage | null {
  const lines = chatText(value).split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || !lines[0].startsWith('DAMAGE TRACKING ::')) return null;
  const totalLine = lines.find(line => line.startsWith('TOTAL ::'));
  const headerParts = lines[0].split(/\s+::\s+/).map(part => part.trim()).filter(Boolean);
  const toneLabels = ['MELEE', 'BRAWL', 'HANDGUN', 'RANGED', 'HEAVY', 'AUTO', 'WEAPON'];
  const hasTone = toneLabels.includes(String(headerParts[1] || '').toUpperCase());
  const rows = lines
    .filter(line => !line.startsWith('DAMAGE TRACKING ::') && !line.startsWith('TOTAL ::'))
    .map(line => parseDamageTrackingLine(line));
  const tone = resolveTone ? resolveTone(hasTone ? headerParts[1] : '', rows) : { label: '', color: '', rgb: '' };
  return {
    title: 'DAMAGE',
    actor: hasTone ? (headerParts[2] || '') : (headerParts[1] || ''),
    toneLabel: tone.label,
    toneColor: tone.color,
    toneRgb: tone.rgb,
    total: totalLine ? totalLine.slice('TOTAL ::'.length).trim() : '',
    rows,
  };
}
