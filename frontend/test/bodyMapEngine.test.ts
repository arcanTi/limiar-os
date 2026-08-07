import { describe, expect, it } from 'vitest';
import { buildBodyMap, regionForItem } from '../src/domain/items/bodyMapEngine.ts';

function region(map: ReturnType<typeof buildBodyMap>, id: string) {
  const found = map.regions.find(row => row.id === id);
  if (!found) throw new Error(`missing region ${id}`);
  return found;
}

describe('bodyMapEngine', () => {
  it('maps legacy categories and cyberware types to deterministic body regions', () => {
    const cases = [
      [{ code: 'NEURAL-LINK', cat: 'NEURAL' }, 'skull'],
      [{ code: 'CHIP-SOCKET', cyberwareType: 'chipware' }, 'skull'],
      [{ code: 'DECK-ARM', cat: 'DECK' }, 'skull'],
      [{ code: 'CYBEREYE', cat: 'OPTICS' }, 'eyes'],
      [{ code: 'LOWLIGHT', cyberwareType: 'cyberoptics' }, 'eyes'],
      [{ code: 'CYBERAUDIO', cat: 'AUDIO' }, 'ears'],
      [{ code: 'AUD-REC', cyberwareType: 'cyberaudio' }, 'ears'],
      [{ code: 'MUSCLE-LACE', cat: 'INTERNAL' }, 'torso'],
      [{ code: 'NANO-SURGE', cyberwareType: 'internal' }, 'torso'],
      [{ code: 'SUBDERMAL', cat: 'EXTERNAL' }, 'skin'],
      [{ code: 'TECH-HAIR', cyberwareType: 'fashionware' }, 'skin'],
      [{ code: 'FBC-CORE', cat: 'BORG' }, 'fullBody'],
      [{ code: 'BORG-FRAME', cyberwareType: 'borgware' }, 'fullBody'],
      [{ code: 'ODD-CHROME', cat: 'UNKNOWN' }, 'torso'],
    ] as const;

    cases.forEach(([item, expected]) => {
      expect(regionForItem(item, [item])).toBe(expected);
    });
  });

  it('respects explicit limb locations', () => {
    expect(regionForItem({ code: 'CYBERARM', cat: 'LIMBS', location: 'leftArm' }, [])).toBe('leftArm');
    expect(regionForItem({ code: 'CYBERLEG', cat: 'LIMBS', location: 'rightLeg' }, [])).toBe('rightLeg');
  });

  it('uses code/name heuristics for unlocated limbs', () => {
    const cyberarm = { code: 'CYBERARM', cat: 'LIMBS' };
    const shoulder = { code: 'MOUNT', name: 'Shoulder Mount', cat: 'LIMBS' };
    const cyberleg = { code: 'CYBERLEG', cat: 'LIMBS' };
    const foot = { code: 'BALANCE', name: 'Grip Foot', cat: 'LIMBS' };

    expect(regionForItem(cyberarm, [cyberarm])).toBe('rightArm');
    expect(regionForItem(shoulder, [shoulder])).toBe('rightArm');
    expect(regionForItem(cyberleg, [cyberleg])).toBe('rightLeg');
    expect(regionForItem(foot, [foot])).toBe('rightLeg');
  });

  it('alternates unlocated limbs stably right to left then stacks on right', () => {
    const arms = [
      { code: 'CYBERARM', name: 'Cyberarm', cat: 'LIMBS', instanceId: 'arm-1' },
      { code: 'CYBERARM', name: 'Cyberarm', cat: 'LIMBS', instanceId: 'arm-2' },
      { code: 'CYBERARM', name: 'Cyberarm', cat: 'LIMBS', instanceId: 'arm-3' },
    ];
    const legs = [
      { code: 'CYBERLEG', name: 'Cyberleg', cat: 'LIMBS', instanceId: 'leg-1' },
      { code: 'CYBERLEG', name: 'Cyberleg', cat: 'LIMBS', instanceId: 'leg-2' },
      { code: 'CYBERLEG', name: 'Cyberleg', cat: 'LIMBS', instanceId: 'leg-3' },
    ];

    expect(arms.map(item => regionForItem(item, arms))).toEqual(['rightArm', 'leftArm', 'rightArm']);
    expect(legs.map(item => regionForItem(item, legs))).toEqual(['rightLeg', 'leftLeg', 'rightLeg']);
  });

  it('inherits cyberweapon regions from parent instance or parent enhancements', () => {
    const parent = { code: 'CYBERARM', cat: 'LIMBS', instanceId: 'arm', location: 'leftArm', enhancements: ['POPUP-GUN'] };
    const childByParent = { code: 'MONO-BLADE', cyberwareType: 'cyberweapon', parentInstanceId: 'arm' };
    const childByEnhancement = { code: 'POPUP-GUN', cyberwareType: 'cyberweapon' };
    const orphan = { code: 'ORPHAN-GUN', cyberwareType: 'cyberweapon' };

    expect(regionForItem(childByParent, [parent, childByParent])).toBe('leftArm');
    expect(regionForItem(childByEnhancement, [parent, childByEnhancement])).toBe('leftArm');
    expect(regionForItem(orphan, [orphan])).toBe('rightArm');
  });

  it('sets item status and region worst status by precedence', () => {
    const map = buildBodyMap([
      { code: 'ONLINE', cat: 'OPTICS' },
      { code: 'OFFLINE', cat: 'OPTICS', enabled: false },
      { code: 'DAMAGED', cat: 'OPTICS', damageState: 'disabled' },
      { code: 'DESTROYED', cat: 'OPTICS', damageState: 'destroyed' },
    ]);

    expect(region(map, 'eyes').items.map(item => item.status)).toEqual(['online', 'offline', 'damaged', 'destroyed']);
    expect(region(map, 'eyes').worstStatus).toBe('destroyed');
  });

  it('keeps chrome descriptions for clickable body map details', () => {
    const map = buildBodyMap([
      { code: 'NEURAL-LINK', name: 'Neural Link', cat: 'NEURAL', desc: 'Base neural para plugs e speedware.' },
    ]);

    expect(region(map, 'skull').items[0].description).toBe('Base neural para plugs e speedware.');
  });

  it('always returns ten regions and an empty map for empty or invalid input', () => {
    const empty = buildBodyMap([]);
    const invalid = buildBodyMap(null as unknown as unknown[]);

    expect(empty.regions).toHaveLength(10);
    expect(empty.totalInstalled).toBe(0);
    expect(empty.hasAnyChrome).toBe(false);
    expect(empty.regions.every(row => row.count === 0)).toBe(true);
    expect(invalid.regions).toHaveLength(10);
    expect(invalid.hasAnyChrome).toBe(false);
  });

  it('does not mutate the installed input list', () => {
    const input = [
      { code: 'CYBERARM', cat: 'LIMBS', enhancements: ['POPUP-GUN'] },
      { code: 'POPUP-GUN', cyberwareType: 'cyberweapon' },
    ];
    const before = JSON.stringify(input);

    buildBodyMap(input);

    expect(JSON.stringify(input)).toBe(before);
  });
});
