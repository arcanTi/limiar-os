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
