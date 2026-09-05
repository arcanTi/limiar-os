// Pure authorization checks over a session snapshot. Callers assemble
// { authAuthenticated, authUser, activeCharacterId } from their own state.

export interface SessionSnapshot {
  authAuthenticated?: boolean;
  authUser?: { role?: string } | null;
  activeCharacterId?: string | null;
}

export function isAdmin(session: SessionSnapshot | null | undefined): boolean {
  return !!(session && session.authUser && session.authUser.role === 'admin');
}

export function isPlayerUser(session: SessionSnapshot | null | undefined): boolean {
  return !!(session && session.authAuthenticated && session.authUser && session.authUser.role === 'player');
}

export function canManageOwnSheet(session: SessionSnapshot | null | undefined, characterId?: string | null): boolean {
  return isPlayerUser(session) && (!characterId || characterId === (session && session.activeCharacterId));
}

/**
 * Image uploads are a GM tool, with one exception: a player may set the
 * portrait on the sheet they are playing. The upload endpoint itself only asks
 * for a session, so this is the whole rule — and without the exception a
 * player picking their first photo was bounced to the login screen.
 */
export function canUploadImage(
  session: SessionSnapshot | null | undefined,
  { staff = false, scope = '', ownerId = '' }: { staff?: boolean; scope?: string; ownerId?: string | null } = {},
): boolean {
  if (staff) return true;
  if (scope !== 'character-portrait') return false;
  const owner = String(ownerId || '');
  return !!owner && canManageOwnSheet(session, owner);
}
