import { describe, expect, it } from 'vitest';

import { canManageOwnSheet, canUploadImage, isAdmin, isPlayerUser } from '../../../src/domain/auth/policies.ts';

describe('domain/auth/policies', () => {
  describe('isAdmin', () => {
    it('is true for a session with an admin authUser', () => {
      expect(isAdmin({ authUser: { role: 'admin' } })).toBe(true);
    });
    it('is false for a GM, player or anonymous session', () => {
      expect(isAdmin({ authUser: { role: 'gm' } })).toBe(false);
      expect(isAdmin({ authUser: { role: 'player' } })).toBe(false);
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin({})).toBe(false);
    });
  });

  describe('isPlayerUser', () => {
    it('is true only when authenticated AND role is player', () => {
      expect(isPlayerUser({ authAuthenticated: true, authUser: { role: 'player' } })).toBe(true);
    });
    it('is false when not authenticated even with a player role on record', () => {
      expect(isPlayerUser({ authAuthenticated: false, authUser: { role: 'player' } })).toBe(false);
    });
    it('is false for admin/gm roles', () => {
      expect(isPlayerUser({ authAuthenticated: true, authUser: { role: 'admin' } })).toBe(false);
      expect(isPlayerUser({ authAuthenticated: true, authUser: { role: 'gm' } })).toBe(false);
    });
    it('is false for an anonymous session', () => {
      expect(isPlayerUser(null)).toBe(false);
    });
  });

  describe('canManageOwnSheet', () => {
    const playerSession = { authAuthenticated: true, authUser: { role: 'player' }, activeCharacterId: 'char-1' };

    it('a player can manage a sheet when no specific characterId is given', () => {
      expect(canManageOwnSheet(playerSession, null)).toBe(true);
    });
    it('a player can manage their own active character', () => {
      expect(canManageOwnSheet(playerSession, 'char-1')).toBe(true);
    });
    it('a player cannot manage a different character', () => {
      expect(canManageOwnSheet(playerSession, 'char-2')).toBe(false);
    });
    it('a GM/admin session (not isPlayerUser) can never manage via this policy', () => {
      const gmSession = { authAuthenticated: true, authUser: { role: 'gm' }, activeCharacterId: 'char-1' };
      expect(canManageOwnSheet(gmSession, 'char-1')).toBe(false);
    });
  });

  describe('canUploadImage', () => {
    const player = { authAuthenticated: true, authUser: { role: 'player' }, activeCharacterId: 'char-1' };

    it('lets staff upload anything', () => {
      expect(canUploadImage(null, { staff: true, scope: 'map-image', ownerId: 'current-map' })).toBe(true);
    });
    it('lets a player set the portrait of the sheet they are playing', () => {
      expect(canUploadImage(player, { scope: 'character-portrait', ownerId: 'char-1' })).toBe(true);
    });
    it('refuses a player the portrait of someone else', () => {
      expect(canUploadImage(player, { scope: 'character-portrait', ownerId: 'char-2' })).toBe(false);
    });
    it('refuses a portrait upload with no owner, so an empty id is never a wildcard', () => {
      expect(canUploadImage(player, { scope: 'character-portrait', ownerId: '' })).toBe(false);
    });
    it('refuses every other scope to a player', () => {
      expect(canUploadImage(player, { scope: 'map-image', ownerId: 'char-1' })).toBe(false);
      expect(canUploadImage(player, { scope: 'item-image', ownerId: 'char-1' })).toBe(false);
    });
    it('refuses an anonymous session', () => {
      expect(canUploadImage(null, { scope: 'character-portrait', ownerId: 'char-1' })).toBe(false);
    });
  });
});
