// CPR RED poison/drug tables (Core Rulebook). A toxin is resisted with one
// Resist Torture/Drugs check against a fixed DV; failing takes the full
// effect. Poison damage goes straight to HP — armor neither soaks it nor
// ablates from it — which is why toxins never travel through the normal
// damage engine.

export type ToxinKind = 'poison' | 'drug';
export type ToxinIntensity = 'mild' | 'strong' | 'deadly';
/** How the toxin has to reach the target; gates Nasal Filters immunity. */
export type ToxinDelivery = 'inhaled' | 'injected' | 'ingested' | 'contact';
/** Only meat can be poisoned. Drones and Full Body Conversions are immune. */
export type BodyType = 'meat' | 'fbc' | 'drone';

export const TOXIN_RESIST_SKILL = 'Resist Torture/Drugs';

export interface ToxinIntensityRow {
  id: ToxinIntensity;
  label_pt: string;
  resistDV: number;
  damage: string;
}

export const TOXIN_INTENSITIES: ToxinIntensityRow[] = [
  { id: 'mild', label_pt: 'Suave', resistDV: 11, damage: '1d6' },
  { id: 'strong', label_pt: 'Forte', resistDV: 13, damage: '2d6' },
  { id: 'deadly', label_pt: 'Mortal', resistDV: 15, damage: '3d6' },
];

export const TOXIN_DELIVERIES: { id: ToxinDelivery; label_pt: string }[] = [
  { id: 'inhaled', label_pt: 'Inalada' },
  { id: 'injected', label_pt: 'Injetada' },
  { id: 'ingested', label_pt: 'Ingerida' },
  { id: 'contact', label_pt: 'Contato' },
];

export const BODY_TYPES: { id: BodyType; label_pt: string; organic: boolean }[] = [
  { id: 'meat', label_pt: 'Organico (meat)', organic: true },
  { id: 'fbc', label_pt: 'Full Body Conversion', organic: false },
  { id: 'drone', label_pt: 'Drone / inorganico', organic: false },
];

export interface ToxinDefinition {
  id: string;
  name: string;
  kind: ToxinKind;
  intensity: ToxinIntensity;
  /** Defaults to the intensity's DV; a GM may tune it per toxin. */
  resistDV: number;
  /** Poisons carry dice; drugs normally carry none and use `effect_pt`. */
  damage: string;
  delivery: ToxinDelivery;
  effect_pt: string;
  /** Status preset applied on a failed check, when the toxin has one. */
  statusPresetId?: string;
  custom?: boolean;
  source?: string;
}

/** Cyberware that grants immunity to inhaled toxins (CPR: Nasal Filters). */
export const NASAL_FILTER_CODES = ['NASAL-FILTER'];
/** Cyberware granting a flat bonus to the resist check (CPR: Toxin Binders). */
export const TOXIN_BINDER_CODES = ['TOX-BIND'];
export const TOXIN_BINDER_BONUS = 2;

export const CPR_BASE_TOXINS: ToxinDefinition[] = [
  // --- Poisons: direct HP damage ------------------------------------------
  {
    id: 'belladonna', name: 'Beladona', kind: 'poison', intensity: 'mild',
    resistDV: 11, damage: '1d6', delivery: 'ingested',
    effect_pt: '1d6 de dano direto ao HP.', source: 'CPR Core',
  },
  {
    id: 'toxic-waste', name: 'Lixo Toxico', kind: 'poison', intensity: 'mild',
    resistDV: 11, damage: '1d6', delivery: 'contact',
    effect_pt: '1d6 de dano direto ao HP.', source: 'CPR Core',
  },
  {
    id: 'arsenic', name: 'Arsenico', kind: 'poison', intensity: 'strong',
    resistDV: 13, damage: '2d6', delivery: 'ingested',
    effect_pt: '2d6 de dano direto ao HP.', source: 'CPR Core',
  },
  {
    id: 'biotoxin', name: 'Biotoxina', kind: 'poison', intensity: 'deadly',
    resistDV: 15, damage: '3d6', delivery: 'injected',
    effect_pt: '3d6 de dano direto ao HP.', source: 'CPR Core',
  },
  {
    id: 'designer-poison', name: 'Veneno de Grife', kind: 'poison', intensity: 'deadly',
    resistDV: 15, damage: '3d6', delivery: 'injected',
    effect_pt: '3d6 de dano direto ao HP.', source: 'CPR Core',
  },
  {
    id: 'stonefish-venom', name: 'Veneno de Peixe-Pedra', kind: 'poison', intensity: 'deadly',
    resistDV: 15, damage: '3d6', delivery: 'injected',
    effect_pt: '3d6 de dano direto ao HP.', source: 'CPR Core',
  },
  // --- Drugs: no dice, a described state -----------------------------------
  {
    id: 'alcohol', name: 'Alcool', kind: 'drug', intensity: 'mild',
    resistDV: 11, damage: '', delivery: 'ingested',
    effect_pt: 'Embriaguez.', statusPresetId: 'toxin_inebriated', source: 'CPR Core',
  },
  {
    id: 'sodium-pentothal', name: 'Pentotal Sodico', kind: 'drug', intensity: 'strong',
    resistDV: 13, damage: '', delivery: 'injected',
    effect_pt: 'Sugestionabilidade.', statusPresetId: 'toxin_suggestible', source: 'CPR Core',
  },
  {
    id: 'designer-drug', name: 'Droga de Grife', kind: 'drug', intensity: 'deadly',
    resistDV: 15, damage: '', delivery: 'injected',
    effect_pt: 'Efeito definido por quem a formulou.', statusPresetId: 'toxin_designer',
    source: 'CPR Core',
  },
];

export interface ToxinAmmunitionRow {
  code: string;
  name: string;
  toxinId: string;
  cost: number;
  costCategory: string;
  eligibleWeapons: string[];
  /** Toxin ammunition replaces the weapon's own damage; it never adds to it. */
  dealsBaseWeaponDamage: false;
  resistDV: number;
  damage: string;
  /** Critical-injury id inflicted instead of damage (teargas). */
  inflictedInjury?: string;
  injuryDuration_pt?: string;
  delivery: ToxinDelivery;
  condition_pt: string;
}

export const CPR_TOXIN_AMMUNITION: ToxinAmmunitionRow[] = [
  {
    code: 'AMMO-BIOTOXIN', name: 'Municao de Biotoxina', toxinId: 'biotoxin',
    cost: 500, costCategory: 'Expensive', eligibleWeapons: ['Arrows', 'Grenades'],
    dealsBaseWeaponDamage: false, resistDV: 15, damage: '3d6', delivery: 'injected',
    condition_pt: 'acerto em carne',
  },
  {
    code: 'AMMO-POISON', name: 'Municao de Veneno', toxinId: 'arsenic',
    cost: 100, costCategory: 'Premium', eligibleWeapons: ['Arrows', 'Grenades'],
    dealsBaseWeaponDamage: false, resistDV: 13, damage: '2d6', delivery: 'injected',
    condition_pt: 'acerto em carne',
  },
  {
    code: 'AMMO-TEARGAS', name: 'Municao de Gas Lacrimogeneo', toxinId: 'teargas',
    cost: 50, costCategory: 'Costly', eligibleWeapons: ['Grenades'],
    dealsBaseWeaponDamage: false, resistDV: 13, damage: '', delivery: 'inhaled',
    // `crit_head_4` is the head table's "Olho Danificado" (Damaged Eye). The
    // book applies the injury without its bonus damage, which falls out for
    // free here: toxins never run through the damage engine that adds it.
    inflictedInjury: 'crit_head_4', injuryDuration_pt: '1 minuto',
    condition_pt: 'acerto nos olhos de carne',
  },
];

/** Teargas is ammunition-only in the book, but the exposure engine needs it. */
export const TEARGAS_TOXIN: ToxinDefinition = {
  id: 'teargas', name: 'Gas Lacrimogeneo', kind: 'drug', intensity: 'strong',
  resistDV: 13, damage: '', delivery: 'inhaled',
  effect_pt: 'Lesao critica Olho Danificado por 1 minuto (sem dano bonus).',
  source: 'CPR Core',
};
