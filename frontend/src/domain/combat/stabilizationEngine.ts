// Stabilization DVs (CPR RAW): pure function from HP state to the target
// Difficulty Value and which Medtech skill(s) may attempt it. hpMax/
// seriouslyWounded are the caller's derivedStatsEngine outputs — this module
// only classifies healthCur against them, it does not compute HP itself.

export type WoundState = 'healthy' | 'lightlyWounded' | 'seriouslyWounded' | 'mortallyWounded';

export interface StabilizationVitals {
  healthCur: number;
  hpMax: number;
  seriouslyWounded: number;
}

export interface StabilizationResult {
  state: WoundState;
  dv: number | null;
  allowedSkills: string[];
}

export function resolveStabilizationDV(vitals: StabilizationVitals = { healthCur: 0, hpMax: 1, seriouslyWounded: 0 }): StabilizationResult {
  const hpMax = Math.max(1, Number(vitals.hpMax) || 1);
  const seriouslyWounded = Math.max(0, Number(vitals.seriouslyWounded) || 0);
  const healthCur = Number(vitals.healthCur) || 0;

  if (healthCur < 1) return { state: 'mortallyWounded', dv: 15, allowedSkills: ['Paramedic'] };
  if (healthCur <= seriouslyWounded) return { state: 'seriouslyWounded', dv: 13, allowedSkills: ['First Aid', 'Paramedic'] };
  if (healthCur < hpMax) return { state: 'lightlyWounded', dv: 10, allowedSkills: ['First Aid', 'Paramedic'] };
  return { state: 'healthy', dv: null, allowedSkills: [] };
}
