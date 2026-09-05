import { describe, expect, it } from 'vitest';

import {
  applyAttachmentEffects,
  installAttachment,
  occupiedWeaponAttachmentSlots,
  removeAttachment,
  validateAttachmentInstallation,
} from '../../../src/domain/items/weaponAttachmentEngine.ts';

const rifle = {
  id: 'rifle-1', code: 'ASSAULT-RIFLE', name: 'Assault Rifle', kind: 'weapon', weaponType: 'Assault Rifle',
  weaponSkill: 'Shoulder Arms', damage: '5d6', magazine: 25, concealable: false, exotic: false,
};
const attachment = (code: string) => ({ code, name: code, kind: 'weaponAttachment' });

describe('weaponAttachmentEngine', () => {
  it('rejects melee, unmodified exotic and magazine-incompatible hosts', () => {
    expect(validateAttachmentInstallation({ ...rifle, weaponSkill: 'Melee Weapon' }, attachment('SCOPE')).ok).toBe(false);
    expect(validateAttachmentInstallation({ ...rifle, exotic: true }, attachment('SCOPE')).reason).toContain('exoticas');
    expect(validateAttachmentInstallation({ ...rifle, weaponSkill: 'Archery', magazine: null }, attachment('DRUM-MAG')).reason).toContain('carregador');
    expect(validateAttachmentInstallation({ ...rifle, weaponSkill: 'Handgun' }, attachment('UNDERBARREL-GL')).reason).toContain('Shoulder Arms');
  });

  it('accounts for slots, duplicate accessories and the single magazine modification', () => {
    const smart = installAttachment(rifle, attachment('SMARTGUN-LINK')).weapon;
    expect(occupiedWeaponAttachmentSlots(smart)).toBe(2);
    expect(validateAttachmentInstallation(smart, attachment('SMARTGUN-LINK')).reason).toContain('ja esta instalado');
    expect(validateAttachmentInstallation(smart, attachment('UNDERBARREL-SHOTGUN')).reason).toContain('Slots insuficientes');
    expect(validateAttachmentInstallation({ ...rifle, installedAttachments: ['EXTENDED-MAG'] }, attachment('DRUM-MAG')).reason).toContain('modificacao de carregador');
  });

  it('allows a Tech-slotted exotic and derives magazine, concealment, attack and underbarrel modes', () => {
    expect(validateAttachmentInstallation({ ...rifle, exotic: true, attachmentSlots: 1 }, attachment('SCOPE')).ok).toBe(true);
    const modified = applyAttachmentEffects(rifle, {
      ...rifle,
      installedAttachments: ['DRUM-MAG', 'SMARTGUN-LINK', 'UNDERBARREL-GL'],
    });
    expect(modified).toMatchObject({ magazine: 45, mag: 45, concealable: false, attackMod: 1 });
    expect(modified.weaponModes).toContainEqual(expect.objectContaining({ mode: 'underbarrelGrenadeLauncher', damage: '6d6', magazine: 1 }));
  });

  it('rebuilds factory stats after removal instead of trusting mutated instance fields', () => {
    const modified = applyAttachmentEffects({ ...rifle, concealable: true }, { ...rifle, magazine: 45, concealable: false, installedAttachments: ['DRUM-MAG'] });
    const removed = removeAttachment(modified, 'DRUM-MAG');
    const restored = applyAttachmentEffects({ ...rifle, concealable: true }, removed);
    expect(restored).toMatchObject({ installedAttachments: [], magazine: 25, concealable: true });
  });
});
