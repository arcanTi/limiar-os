import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SYSTEM_ID,
  RPG_SYSTEMS,
  implementationLabel,
  isSystemPlayable,
  playableSystems,
  systemMeta,
} from '../../../src/domain/campaigns/systems.ts';

describe('catalogo de sistemas', () => {
  it('mantem todos os sistemas visiveis, nao so os jogaveis', () => {
    // Decisao de produto de 2026-07-21: mostrar com selo em vez de esconder.
    expect(RPG_SYSTEMS.map((s) => s.id)).toEqual(['cyberpunk-red', 'dnd5e', 'cthulhu', 'other']);
  });

  it('so Cyberpunk RED e jogavel', () => {
    expect(playableSystems().map((s) => s.id)).toEqual(['cyberpunk-red']);
    expect(isSystemPlayable('cyberpunk-red')).toBe(true);
    expect(isSystemPlayable('dnd5e')).toBe(false);
    expect(isSystemPlayable('other')).toBe(false);
  });

  it('o default e o unico sistema jogavel', () => {
    expect(isSystemPlayable(DEFAULT_SYSTEM_ID)).toBe(true);
  });

  it('id desconhecido cai em "outro sistema" e nao vira jogavel', () => {
    expect(systemMeta('pathfinder').id).toBe('other');
    expect(systemMeta(null).id).toBe('other');
    expect(systemMeta(undefined).id).toBe('other');
    expect(isSystemPlayable('pathfinder')).toBe(false);
  });

  it('expoe o rotulo do selo usado nos cards', () => {
    expect(implementationLabel('cyberpunk-red')).toBe('Yes');
    expect(implementationLabel('dnd5e')).toBe('No');
    expect(implementationLabel('other')).toBe('Partially');
  });

  it('todo sistema traz marca e classe para o card', () => {
    RPG_SYSTEMS.forEach((system) => {
      expect(system.cls).toBeTruthy();
      expect(system.mark).toBeTruthy();
      expect(system.label).toBeTruthy();
    });
  });
});
