// Netrunning foundation (CPR RAW): Interface Ability catalog as rollable
// data. NET architecture (floors, DVs per floor, REZ, Black ICE) is a future
// phase — these abilities only carry enough shape to roll Interface + 1d10
// with a label; DV/target resolution stays a GM call until that phase lands.

export interface NetInterfaceAbility {
  id: string;
  name: string;
  desc: string;
  isAttack: boolean;
}

export const CPRED_NETRUNNING_ABILITIES: NetInterfaceAbility[] = [
  { id: 'backdoor', name: 'Backdoor', desc: 'Acessa um NET Architecture sem passar pela Password/Floor 1, evitando alertar o sistema.', isAttack: false },
  { id: 'cloak', name: 'Cloak', desc: 'Oculta a presenca do netrunner dentro do NET Architecture, dificultando deteccao por Black ICE ou outros netrunners.', isAttack: false },
  { id: 'control', name: 'Control', desc: 'Assume o controle de um dispositivo conectado (Control Node) acessivel pelo Floor atual.', isAttack: false },
  { id: 'eye-dee', name: 'Eye-Dee', desc: 'Identifica programas, Black ICE e outros netrunners presentes no Floor atual.', isAttack: false },
  { id: 'pathfinder', name: 'Pathfinder', desc: 'Encontra o caminho para o proximo Floor ou mapeia a estrutura do NET Architecture.', isAttack: false },
  { id: 'scanner', name: 'Scanner', desc: 'Revela o conteudo do Floor atual: programas, Black ICE e dispositivos conectados.', isAttack: false },
  // Zap damage against Black ICE/Programs is resolved by blackIce.ts in the
  // Nexus trace-confrontation flow; this row stays the rollable ability label.
  { id: 'zap', name: 'Zap', desc: 'Ataca um programa ou netrunner no NET; dano contra programas/Black ICE usa o confronto NET.', isAttack: true },
];
