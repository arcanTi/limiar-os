export type BodyRegionId =
  | 'skull' | 'eyes' | 'ears' | 'torso'
  | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'
  | 'skin' | 'fullBody';

export type BodyItemStatus = 'online' | 'offline' | 'damaged' | 'destroyed';

export interface BodyMapItem {
  code: string;
  name: string;
  description: string;
  status: BodyItemStatus;
  isWeapon: boolean;
  enhancementCount: number;
}

export interface BodyRegion {
  id: BodyRegionId;
  items: BodyMapItem[];
  count: number;
  worstStatus: BodyItemStatus;
}

export interface BodyMap {
  regions: BodyRegion[];
  totalInstalled: number;
  hasAnyChrome: boolean;
}

type InstalledLike = {
  code?: unknown;
  name?: unknown;
  cat?: unknown;
  category?: unknown;
  marketCat?: unknown;
  cyberwareType?: unknown;
  kind?: unknown;
  weaponClass?: unknown;
  desc?: unknown;
  description?: unknown;
  legacyDesc?: unknown;
  sourceNotes?: unknown;
  location?: unknown;
  instanceId?: unknown;
  parentInstanceId?: unknown;
  enhancements?: unknown;
  damageState?: unknown;
  enabled?: unknown;
};

const BODY_REGION_IDS: BodyRegionId[] = [
  'skull',
  'eyes',
  'ears',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
  'skin',
  'fullBody',
];

const STATUS_RANK: Record<BodyItemStatus, number> = {
  online: 0,
  offline: 1,
  damaged: 2,
  destroyed: 3,
};

const DIRECT_LOCATIONS = new Set<BodyRegionId>(['leftArm', 'rightArm', 'leftLeg', 'rightLeg']);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function upper(value: unknown): string {
  return text(value).toUpperCase();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function itemKey(item: InstalledLike): string {
  return text(item.instanceId) || upper(item.code);
}

function directRegionFromLocation(value: unknown): BodyRegionId | null {
  const location = text(value) as BodyRegionId;
  return DIRECT_LOCATIONS.has(location) ? location : null;
}

function isArmItem(item: InstalledLike): boolean {
  return /(ARM|HAND|SHOULDER)/i.test(`${text(item.code)} ${text(item.name)}`);
}

function isLegItem(item: InstalledLike): boolean {
  return /(LEG|FOOT|FEET)/i.test(`${text(item.code)} ${text(item.name)}`);
}

function statusForItem(item: InstalledLike): BodyItemStatus {
  if (item.damageState === 'destroyed') return 'destroyed';
  if (item.damageState === 'disabled') return 'damaged';
  if (item.enabled === false) return 'offline';
  return 'online';
}

function isCyberweapon(item: InstalledLike): boolean {
  const cat = upper(item.cat || item.category || item.marketCat);
  const type = lower(item.cyberwareType);
  const kind = lower(item.kind);
  return cat === 'WEAPONS'
    || cat === 'WEAPON ATTACHMENTS'
    || type === 'cyberweapon'
    || kind === 'cyberweapon'
    || !!text(item.weaponClass);
}

function baseRegion(item: InstalledLike): BodyRegionId | 'limb' | 'weapon' {
  const cat = upper(item.cat || item.category || item.marketCat);
  const type = lower(item.cyberwareType);

  if (cat === 'NEURAL' || cat === 'DECK' || type === 'neuralware' || type === 'chipware' || type === 'cyberdeck-hardware') return 'skull';
  if (cat === 'OPTICS' || type === 'cyberoptics') return 'eyes';
  if (cat === 'AUDIO' || type === 'cyberaudio') return 'ears';
  if (cat === 'INTERNAL' || type === 'internal') return 'torso';
  if (cat === 'EXTERNAL' || cat === 'FASHION' || type === 'external' || type === 'fashionware') return 'skin';
  if (cat === 'BORG' || type === 'borgware') return 'fullBody';
  if (cat === 'LIMBS' || type === 'cyberarm' || type === 'cyberleg') return 'limb';
  if (cat === 'WEAPONS' || cat === 'WEAPON ATTACHMENTS' || type === 'cyberweapon' || isCyberweapon(item)) return 'weapon';
  return 'torso';
}

function enhancementCodes(item: InstalledLike): string[] {
  return Array.isArray(item.enhancements)
    ? item.enhancements.map(code => upper(code)).filter(Boolean)
    : [];
}

function parentForWeapon(item: InstalledLike, siblings: InstalledLike[]): InstalledLike | null {
  const parentId = text(item.parentInstanceId);
  if (parentId) {
    const directParent = siblings.find(candidate => text(candidate.instanceId) === parentId);
    if (directParent) return directParent;
  }
  const code = upper(item.code);
  if (!code) return null;
  return siblings.find(candidate => enhancementCodes(candidate).includes(code)) || null;
}

function limbRegionForItem(item: InstalledLike, siblingSlice: InstalledLike[]): BodyRegionId {
  const direct = directRegionFromLocation(item.location);
  if (direct) return direct;

  const leg = isLegItem(item);
  const arm = !leg || isArmItem(item);
  const target = leg && !isArmItem(item) ? 'leg' : (arm ? 'arm' : 'arm');
  const priorMatching = siblingSlice.filter(candidate => {
    if (directRegionFromLocation(candidate.location)) return false;
    const candidateBase = baseRegion(candidate);
    if (candidateBase !== 'limb') return false;
    if (target === 'leg') return isLegItem(candidate) && !isArmItem(candidate);
    return !isLegItem(candidate) || isArmItem(candidate);
  }).length;

  if (target === 'leg') return priorMatching === 1 ? 'leftLeg' : 'rightLeg';
  return priorMatching === 1 ? 'leftArm' : 'rightArm';
}

export function regionForItem(item: unknown, siblings: unknown[] = []): BodyRegionId {
  const row = (item && typeof item === 'object' ? item : {}) as InstalledLike;
  const rows = Array.isArray(siblings) ? siblings.filter(candidate => candidate && typeof candidate === 'object') as InstalledLike[] : [];
  const base = baseRegion(row);

  if (base === 'limb') {
    const index = rows.indexOf(row);
    return limbRegionForItem(row, index >= 0 ? rows.slice(0, index) : []);
  }

  if (base === 'weapon') {
    const parent = parentForWeapon(row, rows);
    return parent ? regionForItem(parent, rows) : 'rightArm';
  }

  return base;
}

function bodyMapItem(item: InstalledLike): BodyMapItem {
  const description = text(item.desc || item.description || item.legacyDesc || item.sourceNotes)
    || 'Sem descricao registrada para este chrome.';
  return {
    code: upper(item.code) || 'UNKNOWN',
    name: text(item.name || item.code) || 'UNKNOWN',
    description,
    status: statusForItem(item),
    isWeapon: isCyberweapon(item),
    enhancementCount: enhancementCodes(item).length,
  };
}

function worstStatus(items: BodyMapItem[]): BodyItemStatus {
  return items.reduce<BodyItemStatus>((worst, item) => STATUS_RANK[item.status] > STATUS_RANK[worst] ? item.status : worst, 'online');
}

export function buildBodyMap(installed: unknown[]): BodyMap {
  const rows = Array.isArray(installed)
    ? installed.filter(item => item && typeof item === 'object') as InstalledLike[]
    : [];
  const itemsByRegion = new Map<BodyRegionId, BodyMapItem[]>();
  BODY_REGION_IDS.forEach(id => itemsByRegion.set(id, []));

  rows.forEach(row => {
    const key = itemKey(row);
    if (!key) return;
    const region = regionForItem(row, rows);
    itemsByRegion.get(region)?.push(bodyMapItem(row));
  });

  const regions = BODY_REGION_IDS.map(id => {
    const items = itemsByRegion.get(id) || [];
    return {
      id,
      items,
      count: items.length,
      worstStatus: worstStatus(items),
    };
  });

  return {
    regions,
    totalInstalled: rows.length,
    hasAnyChrome: rows.length > 0,
  };
}
