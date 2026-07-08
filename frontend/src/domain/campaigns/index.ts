const STAFF_ROLES = new Set(['admin', 'gm']);
const VISIBILITIES = new Set(['public', 'private']);
const STATUSES = new Set(['active', 'paused', 'archived']);

function cleanText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function cleanEnum<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  const text = cleanText(value).toLowerCase();
  return (allowed.has(text) ? text : fallback) as T;
}

function normalizeList<T>(value: unknown, normalizer: (item: unknown) => T | null): T[] {
  return (Array.isArray(value) ? value.map(normalizer).filter(Boolean) : []) as T[];
}

export interface SessionLike {
  user?: { username?: unknown; role?: unknown } | Record<string, unknown>;
  authenticated?: boolean;
  username?: unknown;
  role?: unknown;
}

export function sessionUser(session: SessionLike = {}): Record<string, unknown> {
  return session && typeof session === 'object' ? ((session.user || session) as Record<string, unknown>) : {};
}

export function sessionUsername(session: SessionLike = {}): string {
  return cleanText(sessionUser(session).username);
}

export function isStaffSession(session: SessionLike = {}): boolean {
  return STAFF_ROLES.has(cleanText(sessionUser(session).role).toLowerCase());
}

export function isLoggedInSession(session: SessionLike = {}): boolean {
  return Boolean(session && (session.authenticated || sessionUser(session).username));
}

export interface CampaignMember {
  username: string;
  characterId: string;
  joinedAt: string;
  [extra: string]: unknown;
}

export function normalizeCampaignMember(member: Record<string, unknown> = {}): CampaignMember | null {
  if (!member || typeof member !== 'object') return null;
  return {
    ...member,
    username: cleanText(member.username),
    characterId: cleanText(member.characterId ?? member.character_id),
    joinedAt: cleanText(member.joinedAt),
  };
}

export interface CampaignInvite {
  id: string;
  username: string;
  status: string;
  createdAt: string;
  [extra: string]: unknown;
}

export function normalizeCampaignInvite(invite: Record<string, unknown> = {}): CampaignInvite | null {
  if (!invite || typeof invite !== 'object') return null;
  return {
    ...invite,
    id: cleanText(invite.id),
    username: cleanText(invite.username),
    status: cleanText(invite.status, 'pending'),
    createdAt: cleanText(invite.createdAt),
  };
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  status: 'active' | 'paused' | 'archived';
  members: CampaignMember[];
  invites: CampaignInvite[];
  isMember: boolean;
  myInviteId: string;
  canJoin: boolean;
  [extra: string]: unknown;
}

export function normalizeCampaign(input: Record<string, unknown> = {}): Campaign {
  const campaign = input && typeof input === 'object' ? input : {};
  return {
    ...campaign,
    id: cleanText(campaign.id),
    name: cleanText(campaign.name),
    description: cleanText(campaign.description),
    visibility: cleanEnum(campaign.visibility, VISIBILITIES, 'public'),
    status: cleanEnum(campaign.status, STATUSES, 'active'),
    members: normalizeList(campaign.members, (item) => normalizeCampaignMember(item as Record<string, unknown>)),
    invites: normalizeList(campaign.invites, (item) => normalizeCampaignInvite(item as Record<string, unknown>)),
    isMember: Boolean(campaign.isMember),
    myInviteId: cleanText(campaign.myInviteId),
    canJoin: Boolean(campaign.canJoin),
  };
}

export interface CampaignDraft {
  name: string;
  description: string;
  visibility: 'public' | 'private';
  status: 'active' | 'paused' | 'archived';
}

export function normalizeCampaignDraft(input: Record<string, unknown> = {}): CampaignDraft {
  const campaign = normalizeCampaign(input);
  return {
    name: campaign.name,
    description: campaign.description,
    visibility: campaign.visibility,
    status: campaign.status,
  };
}

export function campaignMembershipFor(campaign: unknown, session: SessionLike = {}): CampaignMember | null {
  const normalized = normalizeCampaign(campaign as Record<string, unknown>);
  const username = sessionUsername(session);
  if (!username) return null;
  return normalized.members.find(member => member.username === username) || null;
}

export function campaignInviteFor(campaign: unknown, session: SessionLike = {}): CampaignInvite | null {
  const normalized = normalizeCampaign(campaign as Record<string, unknown>);
  const username = sessionUsername(session);
  if (!username) return null;
  return normalized.invites.find(invite => invite.username === username && invite.status === 'pending') || null;
}

export function canManageCampaign(_campaign: unknown, session: SessionLike = {}): boolean {
  return isStaffSession(session);
}

export function canViewCampaign(campaign: unknown, session: SessionLike = {}): boolean {
  const normalized = normalizeCampaign(campaign as Record<string, unknown>);
  if (canManageCampaign(normalized, session)) return true;
  if (normalized.visibility === 'public') return true;
  if (campaignMembershipFor(normalized, session)) return true;
  return Boolean(campaignInviteFor(normalized, session));
}

export function canJoinCampaign(campaign: unknown, session: SessionLike = {}): boolean {
  const normalized = normalizeCampaign(campaign as Record<string, unknown>);
  if (!isLoggedInSession(session)) return false;
  if (campaignMembershipFor(normalized, session) || normalized.isMember) return false;
  return normalized.visibility === 'public' || Boolean(campaignInviteFor(normalized, session));
}

export interface CampaignNotification {
  id: string;
  kind: string;
  campaignId: string;
  title: string;
  message: string;
  createdAt: string;
  [extra: string]: unknown;
}

export function normalizeCampaignNotification(input: Record<string, unknown> = {}): CampaignNotification {
  const notification = input && typeof input === 'object' ? input : {};
  return {
    ...notification,
    id: cleanText(notification.id),
    kind: cleanText(notification.kind, 'campaign'),
    campaignId: cleanText(notification.campaignId),
    title: cleanText(notification.title),
    message: cleanText(notification.message),
    createdAt: cleanText(notification.createdAt),
  };
}

export function normalizeCampaignNotifications(input: unknown[] = []): CampaignNotification[] {
  return normalizeList(input, (item) => normalizeCampaignNotification(item as Record<string, unknown>));
}

export function campaignInviteCount(notifications: unknown[] = []): number {
  return normalizeCampaignNotifications(notifications).filter(item => item.kind === 'invite').length;
}

export function selectCampaign(campaigns: unknown[] = [], selectedId = ''): Campaign | null {
  const normalized = normalizeList(campaigns, (item) => normalizeCampaign(item as Record<string, unknown>));
  if (!normalized.length) return null;
  return normalized.find(campaign => campaign.id === selectedId) || normalized[0];
}

export function selectedCharacterForCampaign(campaignId: string, characterByCampaign: Record<string, unknown> = {}, characters: { id?: string }[] = []): string {
  const selectedId = cleanText(characterByCampaign?.[campaignId]);
  if (selectedId) return selectedId;
  const first = Array.isArray(characters) ? characters[0] : null;
  return cleanText(first?.id);
}
