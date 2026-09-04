// Who is sitting at the table. The backend publishes `campaign.roster` to every
// viewer who can see the campaign (username, role, characterId, portrait), so a
// player can see the party without receiving anyone else's character document —
// `/api/characters` stays owner-scoped.
//
// This is a read-only view: the seats exist to show presence, never to switch
// which character the local user controls.

const cleanText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export interface TableSeat {
  username: string;
  role: string;
  roleLabel: string;
  characterId: string;
  characterName: string;
  /** The character's class (Solo, Nomad...), '' when the seat brought no sheet. */
  characterRole: string;
  characterLevel: number;
  portraitUrl: string;
  initials: string;
  isGm: boolean;
  isSelf: boolean;
  /** Player standing in for this seat while its owner is away; '' when nobody is. */
  controlledBy: string;
  /** True when the local user is the one covering this seat. */
  controlledByMe: boolean;
}

interface SeatOptions {
  username?: string;
}

function seatInitials(username: string): string {
  const letters = username.replace(/[^a-zA-Z0-9]/g, '');
  return (letters.slice(0, 2) || username.slice(0, 2) || '??').toUpperCase();
}

function seatLevel(value: unknown): number {
  const level = Math.floor(Number(value));
  return Number.isFinite(level) && level > 0 ? Math.min(level, 99) : 1;
}

function readSeat(entry: Record<string, unknown>, selfUsername: string): TableSeat | null {
  const username = cleanText(entry.username);
  if (!username) return null;
  const role = (cleanText(entry.role) || 'player').toLowerCase();
  const isGm = role === 'gm' || role === 'admin';
  const controlledBy = cleanText(entry.controlledBy ?? entry.controlled_by);
  const sameUser = (a: string, b: string): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  return {
    username,
    role,
    roleLabel: isGm ? 'MESTRE' : 'PLAYER',
    characterId: cleanText(entry.characterId ?? entry.character_id),
    characterName: cleanText(entry.characterName ?? entry.character_name),
    characterRole: cleanText(entry.characterRole ?? entry.character_role),
    characterLevel: seatLevel(entry.characterLevel ?? entry.character_level),
    portraitUrl: cleanText(entry.portraitUrl ?? entry.portrait_url),
    initials: seatInitials(username),
    isGm,
    isSelf: sameUser(username, selfUsername),
    controlledBy,
    controlledByMe: sameUser(controlledBy, selfUsername),
  };
}

/**
 * The table roster, GM first and the local user ahead of the other players.
 *
 * Duplicate usernames collapse: the backend inserts the campaign owner into the
 * roster when they have no member row, and a GM who also joined as a member
 * would otherwise appear twice.
 */
export function tableSeats(campaign: unknown, { username = '' }: SeatOptions = {}): TableSeat[] {
  const source = (campaign && typeof campaign === 'object' ? campaign : {}) as Record<string, unknown>;
  const raw = Array.isArray(source.roster) ? source.roster : [];
  const seen = new Set<string>();
  const seats: TableSeat[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const seat = readSeat(entry as Record<string, unknown>, username);
    if (!seat) continue;
    const key = seat.username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    seats.push(seat);
  }
  const rank = (seat: TableSeat): number => (seat.isGm ? 0 : (seat.isSelf ? 1 : 2));
  return seats
    .map((seat, index) => ({ seat, index }))
    .sort((a, b) => (rank(a.seat) - rank(b.seat)) || (a.index - b.index))
    .map((item) => item.seat);
}

/**
 * Seats this user is covering for an absent player.
 *
 * A GM grants control when someone does not show up; the substitute drives that
 * character until the GM takes it back. It is never their own seat.
 */
export function delegatedSeats(campaign: unknown, username: string): TableSeat[] {
  if (!username) return [];
  return tableSeats(campaign, { username }).filter((seat) => seat.controlledByMe && !seat.isSelf);
}

/**
 * Every character the table lets this user drive: their own seat plus whatever
 * was delegated to them. Anything outside this list is a document the account
 * happens to own but no table put in play.
 */
export function controlledCharacterIds(campaign: unknown, username: string): string[] {
  const ids = tableSeats(campaign, { username })
    .filter((seat) => (seat.isSelf || seat.controlledByMe) && seat.characterId)
    .map((seat) => seat.characterId);
  return [...new Set(ids)];
}

/** The character this user brought to this table, if the roster names one. */
export function seatCharacterId(campaign: unknown, username: string): string {
  const seat = tableSeats(campaign, { username }).find((entry) => entry.isSelf);
  return seat ? seat.characterId : '';
}

/**
 * Which character the local user drives.
 *
 * One player, one sheet — with the stand-in case as the deliberate exception.
 * A choice the table sanctions (their own seat, or a sheet delegated to them)
 * survives every refresh, so taking over an absent player's character is not
 * undone a second later. Anything else loses to the campaign seat, which is how
 * an account that still owns older documents cannot end up driving the wrong
 * one. Off-table the current choice stands, falling back to the only document
 * the account has.
 */
export function activeCharacterIdFor(
  seatId: string,
  characters: Array<{ id?: string }> | null | undefined,
  currentId: string,
  controlledIds: string[] = [],
): string {
  const list = Array.isArray(characters) ? characters : [];
  const has = (id: string): boolean => !!id && list.some((entry) => entry && entry.id === id);
  const sanctioned = new Set(controlledIds.filter(Boolean));
  if (has(currentId) && sanctioned.has(currentId)) return currentId;
  if (has(seatId)) return seatId;
  if (has(currentId)) return currentId;
  return list.length === 1 && list[0] && list[0].id ? String(list[0].id) : currentId;
}
