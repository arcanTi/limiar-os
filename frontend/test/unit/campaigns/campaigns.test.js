import { describe, expect, it } from 'vitest';

import {
  campaignInviteCount,
  campaignInviteFor,
  campaignMembershipFor,
  canJoinCampaign,
  canManageCampaign,
  canViewCampaign,
  isLoggedInSession,
  isStaffSession,
  normalizeCampaign,
  normalizeCampaignDraft,
  normalizeCampaignNotification,
  selectCampaign,
  selectedCharacterForCampaign,
} from '../../../src/domain/campaigns/index.ts';

describe('domain/campaigns', () => {
  it('normalizes campaign fields, enums, members and invites defensively', () => {
    expect(normalizeCampaign({
      id: ' c1 ',
      name: '  Limiar  ',
      description: ' mesa ',
      visibility: 'secret',
      status: 'done',
      members: [{ username: 'player', characterId: 42 }],
      invites: [{ id: 9, username: 'guest', status: '' }],
      isMember: 1,
      canJoin: 0,
    })).toEqual(expect.objectContaining({
      id: 'c1',
      name: 'Limiar',
      description: 'mesa',
      visibility: 'public',
      status: 'active',
      members: [expect.objectContaining({ username: 'player', characterId: '42' })],
      invites: [expect.objectContaining({ id: '9', username: 'guest', status: 'pending' })],
      isMember: true,
      canJoin: false,
    }));

    expect(normalizeCampaignDraft({ name: ' A ', visibility: 'private', status: 'paused' })).toEqual({
      id: '',
      name: 'A',
      description: '',
      visibility: 'private',
      status: 'paused',
      bannerUrl: '',
    });
  });

  it('recognizes staff and logged sessions from backend session shape', () => {
    expect(isStaffSession({ authenticated: true, user: { role: 'gm' } })).toBe(true);
    expect(isStaffSession({ user: { role: 'player' } })).toBe(false);
    expect(isLoggedInSession({ authenticated: true, user: { username: 'neo' } })).toBe(true);
    expect(isLoggedInSession({ authenticated: false })).toBe(false);
  });

  it('applies campaign visibility, invite and management rules', () => {
    const privateCampaign = {
      id: 'c-private',
      visibility: 'private',
      members: [{ username: 'member' }],
      invites: [{ id: 'invite-1', username: 'invited', status: 'pending' }],
    };

    expect(canManageCampaign(privateCampaign, { user: { role: 'admin' } })).toBe(true);
    const ownedCampaign = { ...privateCampaign, created_by: 'gm-owner' };
    expect(canManageCampaign(ownedCampaign, { user: { username: 'gm-owner', role: 'gm' } })).toBe(true);
    expect(canManageCampaign(ownedCampaign, { user: { username: 'gm-other', role: 'gm' } })).toBe(false);
    expect(canManageCampaign(ownedCampaign, { user: { username: 'gm-other', role: 'admin' } })).toBe(true);
    expect(canManageCampaign(ownedCampaign, { user: { username: 'gm-owner', role: 'player' } })).toBe(false);
    expect(canViewCampaign(privateCampaign, { user: { role: 'gm' } })).toBe(true);
    expect(canViewCampaign(privateCampaign, { user: { username: 'member', role: 'player' } })).toBe(true);
    expect(canViewCampaign(privateCampaign, { user: { username: 'invited', role: 'player' } })).toBe(true);
    expect(canViewCampaign(privateCampaign, { user: { username: 'outsider', role: 'player' } })).toBe(false);
    expect(canJoinCampaign(privateCampaign, { user: { username: 'member', role: 'player' } })).toBe(false);
    expect(canJoinCampaign(privateCampaign, { user: { username: 'invited', role: 'player' } })).toBe(true);
    expect(canJoinCampaign({ visibility: 'public' }, { user: { username: 'outsider', role: 'player' } })).toBe(true);
  });

  it('finds current membership, invite, active campaign and selected character', () => {
    const campaign = {
      members: [{ username: 'neo', characterId: 'char-1' }],
      invites: [{ id: 'invite-1', username: 'neo', status: 'pending' }],
    };

    expect(campaignMembershipFor(campaign, { user: { username: 'neo' } })).toMatchObject({ characterId: 'char-1' });
    expect(campaignInviteFor(campaign, { user: { username: 'neo' } })).toMatchObject({ id: 'invite-1' });
    expect(selectCampaign([{ id: 'a' }, { id: 'b' }], 'b')).toMatchObject({ id: 'b' });
    expect(selectCampaign([{ id: 'a' }], 'missing')).toMatchObject({ id: 'a' });
    expect(selectedCharacterForCampaign('campaign-1', { 'campaign-1': 'char-2' }, [{ id: 'char-1' }])).toBe('char-2');
    expect(selectedCharacterForCampaign('campaign-2', {}, [{ id: 'char-1' }])).toBe('char-1');
  });

  it('normalizes notifications and counts invites', () => {
    const notification = normalizeCampaignNotification({ id: 3, kind: '', campaignId: 8, title: ' T ', message: ' M ' });
    expect(notification).toMatchObject({ id: '3', kind: 'campaign', campaignId: '8', title: 'T', message: 'M' });
    expect(campaignInviteCount([{ kind: 'invite' }, { kind: 'campaign' }, { kind: 'invite' }])).toBe(2);
  });
});
