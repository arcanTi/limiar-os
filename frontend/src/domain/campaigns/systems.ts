// Single source of truth for the RPG systems offered by the product. All
// systems remain visible with their implementation status, but only fully
// implemented systems can be selected for play.

export type SystemImplementation = 'yes' | 'no' | 'partially';

export interface RpgSystem {
  id: string;
  label: string;
  implementation: SystemImplementation;
  /** CSS class for the brand block displayed on system cards. */
  cls: string;
  /** Trusted short HTML mark defined by the application, never by a user. */
  mark: string;
}

export const DEFAULT_SYSTEM_ID = 'cyberpunk-red';
export const FALLBACK_SYSTEM_ID = 'other';

const OTHER_MARK =
  '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7L12 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  + '<path d="M7.3 15.6h9.4L12 8.7l-4.7 6.9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
  + '</svg>';

export const RPG_SYSTEMS: RpgSystem[] = [
  {
    id: 'cyberpunk-red',
    label: 'Cyberpunk RED',
    implementation: 'yes',
    cls: 'campaign-logo-cpr',
    mark: '<i>CYBER<br>PUNK</i><b>RED</b>',
  },
  {
    id: 'dnd5e',
    label: 'D&D 5e',
    implementation: 'no',
    cls: 'campaign-logo-dnd',
    mark: '<i>&amp;</i><b>5E</b>',
  },
  {
    id: 'cthulhu',
    label: 'Call of Cthulhu',
    implementation: 'no',
    cls: 'campaign-logo-coc',
    mark: '<i>CoC</i><b>7E</b>',
  },
  {
    id: 'other',
    label: 'Outro sistema',
    implementation: 'partially',
    cls: 'campaign-logo-other',
    mark: OTHER_MARK,
  },
];

const BY_ID: Record<string, RpgSystem> = RPG_SYSTEMS.reduce<Record<string, RpgSystem>>(
  (acc, system) => { acc[system.id] = system; return acc; },
  {},
);

/** Return system metadata, falling back to `other` for unknown identifiers. */
export function systemMeta(system: unknown): RpgSystem {
  return BY_ID[String(system ?? '')] || BY_ID[FALLBACK_SYSTEM_ID];
}

/** A system is playable only when its rules are fully implemented. */
export function isSystemPlayable(system: unknown): boolean {
  return systemMeta(system).implementation === 'yes';
}

export function playableSystems(): RpgSystem[] {
  return RPG_SYSTEMS.filter((system) => system.implementation === 'yes');
}

const IMPLEMENTATION_LABELS: Record<SystemImplementation, string> = {
  yes: 'Yes',
  no: 'No',
  partially: 'Partially',
};

export function implementationLabel(system: unknown): string {
  return IMPLEMENTATION_LABELS[systemMeta(system).implementation];
}
