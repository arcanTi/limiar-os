import { describe, expect, it } from 'vitest';

import { NPC_TEMPLATES, NPC_ATTACK_SKILL_OPTIONS, npcDraftFromTemplate } from '../../../src/domain/combat/npcTemplates.ts';

describe('domain/combat npcTemplates', () => {
  it('exposes a non-empty set of archetypes with stats and at least one attack', () => {
    expect(NPC_TEMPLATES.length).toBeGreaterThan(0);
    NPC_TEMPLATES.forEach(t => {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.body).toBeGreaterThan(0);
      expect(t.ref).toBeGreaterThan(0);
      expect(t.hpMax).toBeGreaterThan(0);
      expect(t.attacks.length).toBeGreaterThan(0);
    });
  });

  it('lists common weapon skills for the attack row builder', () => {
    expect(NPC_ATTACK_SKILL_OPTIONS).toContain('Handgun');
    expect(NPC_ATTACK_SKILL_OPTIONS).toContain('Autofire');
  });

  it('npcDraftFromTemplate seeds a draft matching the template stats', () => {
    const ganger = NPC_TEMPLATES.find(t => t.id === 'ganger');
    const draft = npcDraftFromTemplate(ganger);
    expect(draft.name).toBe(ganger.label);
    expect(draft.body).toBe(String(ganger.body));
    expect(draft.templateId).toBe('ganger');
    expect(draft.attackRows).toEqual(ganger.attacks);
  });

  it('npcDraftFromTemplate falls back to a blank draft with one empty attack row', () => {
    const draft = npcDraftFromTemplate(null);
    expect(draft.name).toBe('');
    expect(draft.attackRows).toHaveLength(1);
  });
});
