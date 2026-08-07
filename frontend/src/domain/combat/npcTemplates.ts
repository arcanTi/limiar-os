// Quick-spawn archetypes for the GM Cockpit's NPC builder. Stats are
// approximate CPR RED baselines for common opposition tiers — good enough
// for on-the-fly combat, not meant to replace a hand-built NPC sheet.

export interface NpcTemplateAttack {
  name: string;
  dice: string;
  skill: string;
}

export interface NpcTemplate {
  id: string;
  label: string;
  body: number;
  ref: number;
  hpMax: number;
  headSp: number;
  bodySp: number;
  attacks: NpcTemplateAttack[];
}

export const NPC_TEMPLATES: NpcTemplate[] = [
  {
    id: 'ganger',
    label: 'GANGER',
    body: 6, ref: 6, hpMax: 30, headSp: 4, bodySp: 4,
    attacks: [{ name: 'Heavy Pistol', dice: '2d6', skill: 'Handgun' }],
  },
  {
    id: 'seguranca',
    label: 'SEGURANCA',
    body: 6, ref: 7, hpMax: 35, headSp: 11, bodySp: 11,
    attacks: [{ name: 'SMG', dice: '2d6', skill: 'Autofire' }],
  },
  {
    id: 'solo',
    label: 'SOLO',
    body: 8, ref: 9, hpMax: 45, headSp: 12, bodySp: 12,
    attacks: [
      { name: 'Assault Rifle', dice: '5d6', skill: 'Autofire' },
      { name: 'Combat Knife', dice: '2d6', skill: 'Melee Weapon' },
    ],
  },
  {
    id: 'drone',
    label: 'DRONE',
    body: 4, ref: 8, hpMax: 25, headSp: 8, bodySp: 8,
    attacks: [{ name: 'Mounted Weapon', dice: '3d6', skill: 'Heavy Weapons' }],
  },
  {
    id: 'boss',
    label: 'BOSS',
    body: 10, ref: 8, hpMax: 60, headSp: 15, bodySp: 15,
    attacks: [
      { name: 'Shotgun', dice: '5d6', skill: 'Shoulder Arms' },
      { name: 'Punhos', dice: '3d6', skill: 'Martial Arts' },
    ],
  },
];

export const NPC_ATTACK_SKILL_OPTIONS: string[] = [
  'Handgun', 'Autofire', 'Shoulder Arms', 'Heavy Weapons', 'Brawling', 'Martial Arts', 'Melee Weapon',
];

export interface NpcDraftShape {
  name: string;
  body: string;
  ref: string;
  hpMax: string;
  headSp: string;
  bodySp: string;
  qty: string;
  templateId: string;
  attackRows: NpcTemplateAttack[];
}

export function npcDraftFromTemplate(template: NpcTemplate | null | undefined): NpcDraftShape {
  if (!template) {
    return { name: '', body: '5', ref: '5', hpMax: '35', headSp: '11', bodySp: '11', qty: '1', templateId: '', attackRows: [{ name: '', dice: '2d6', skill: 'Handgun' }] };
  }
  return {
    name: template.label,
    body: String(template.body),
    ref: String(template.ref),
    hpMax: String(template.hpMax),
    headSp: String(template.headSp),
    bodySp: String(template.bodySp),
    qty: '1',
    templateId: template.id,
    attackRows: template.attacks.map(a => ({ ...a })),
  };
}
