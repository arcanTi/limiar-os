import { describe, it, expect } from 'vitest';
import {
  addGear,
  gearBlock,
  gearBlockDetail,
  gearBlockLabel,
  gearBlockMessage,
  gearCatalog,
  gearCount,
  gearInventory,
  gearSpend,
  removeGear,
  unsellableGear,
} from '../../../src/domain/character/creationGear.ts';
import seed from '../../../../data/seed/limiar-seed.json' with { type: 'json' };

const CATALOG = [
  { code: 'ASSAULT-RIFLE', name: 'Assault Rifle', cat: 'WEAPONS', weaponClass: 'Assault Rifle', price: 500, dmg: '5d6', stock: 'IN STOCK' },
  { code: 'LIGHT-ARMORJACK', name: 'Light Armorjack', cat: 'ARMOR', price: 100, stock: 'IN STOCK' },
  { code: 'AGENT', name: 'Agent', cat: 'GEAR', price: 100, stock: 'IN STOCK', desc: 'celular inteligente' },
  { code: 'SOLD-OUT-GUN', name: 'Militech Arms', cat: 'WEAPONS', price: 500, stock: 'SOLD OUT' },
  { code: 'BRAWLING-BODY-MID', name: 'Brawling, BODY 5-6', cat: 'WEAPONS', price: 0, purchasable: false, specialRules: ['system-profile', 'not purchasable'] },
  { code: 'AMMO-RIFLE', name: 'Rifle Ammunition', cat: 'AMMUNITION', price: 10, packSize: 10, stock: 'IN STOCK' },
  { code: 'AMMO-SEM-PRECO', name: 'Municao sem preco', cat: 'AMMUNITION', price: 0, stock: 'IN STOCK' },
  { code: 'GORILLA-ARMS', name: 'Gorilla Arms', cat: 'LIMBS', price: 1000 },
  { code: 'BIOMON', name: 'Biomonitor', cat: 'FASHION', price: 100 },
  { code: 'TT-GOLD', name: 'Trauma Team Gold', cat: 'TRAUMA TEAM', price: 25000 },
  { name: 'Sem codigo', cat: 'GEAR', price: 10 },
];

const byCode = (code) => gearCatalog(CATALOG).find((item) => item.code === code);
const rich = { cashLeft: 2550 };

describe('prateleira da criacao', () => {
  it('vende arma, armadura, municao e equipamento, e nada mais', () => {
    const codes = gearCatalog(CATALOG).map((item) => item.code);
    expect(codes).toEqual(['ASSAULT-RIFLE', 'SOLD-OUT-GUN', 'LIGHT-ARMORJACK', 'AMMO-RIFLE', 'AGENT']);
  });

  it('deixa cyberware, fashion e Trauma Team de fora', () => {
    const codes = gearCatalog(CATALOG).map((item) => item.code);
    expect(codes).not.toContain('GORILLA-ARMS');
    expect(codes).not.toContain('BIOMON');
    expect(codes).not.toContain('TT-GOLD');
  });

  it('nao vende perfil de sistema nem linha sem preco, e separa os dois motivos', () => {
    const codes = gearCatalog(CATALOG).map((item) => item.code);
    expect(codes).not.toContain('BRAWLING-BODY-MID');
    expect(codes).not.toContain('AMMO-SEM-PRECO');
    expect(unsellableGear(CATALOG)).toEqual([
      { code: 'BRAWLING-BODY-MID', name: 'Brawling, BODY 5-6', cat: 'WEAPONS', reason: 'system-profile' },
      { code: 'AMMO-SEM-PRECO', name: 'Municao sem preco', cat: 'AMMUNITION', reason: 'no-price' },
    ]);
  });

  it('carrega o tamanho do pacote: uma compra de municao sao dez tiros', () => {
    expect(byCode('AMMO-RIFLE').packSize).toBe(10);
    expect(byCode('ASSAULT-RIFLE').packSize).toBe(1);
  });

  it('a ficha recebe pericia, ROF e alcance junto com o item comprado', () => {
    const catalog = gearCatalog([
      { code: 'KATANA', name: 'Katana', cat: 'WEAPONS', kind: 'weapon', skill: 'Melee Weapon', price: 100, dmg: '3d6', rof: 2, hands: 'varies', concealable: false },
    ]);
    const picks = addGear([], catalog[0], rich);
    const [row] = gearInventory(picks);
    // Without these the sheet printed "—" for skill and ROF, and could not
    // tell a katana from a rifle.
    expect(row).toMatchObject({ skill: 'Melee Weapon', rof: 2, hands: 'varies', melee: true, concealable: false, mag: null });
  });

  it('carrega o perfil de dano do catalogo', () => {
    expect(byCode('ASSAULT-RIFLE')).toMatchObject({ dmg: '5d6', type: 'Assault Rifle' });
  });

  it('marca arma branca como melee e arma de fogo como distancia', () => {
    const catalog = gearCatalog([
      { code: 'LIGHT-MELEE', name: 'Light Melee Weapon', cat: 'WEAPONS', kind: 'weapon', skill: 'Melee Weapon', price: 50, dmg: '1d6', rof: 2, hands: 'varies', concealable: true },
      { code: 'SNIPER', name: 'Sniper Rifle', cat: 'WEAPONS', kind: 'weapon', skill: 'Shoulder Arms', price: 500, dmg: '5d6', rof: 1, hands: 2, mag: 4 },
      { code: 'FISTS', name: 'Brawling', cat: 'WEAPONS', kind: 'weapon', skill: 'Brawling', price: 10, dmg: '2d6', rof: 2, hands: 0 },
    ]);
    const at = (code) => catalog.find((item) => item.code === code);
    expect(at('LIGHT-MELEE')).toMatchObject({ melee: true, skill: 'Melee Weapon', rof: 2, hands: 'varies', concealable: true, mag: null });
    expect(at('SNIPER')).toMatchObject({ melee: false, skill: 'Shoulder Arms', rof: 1, hands: '2', mag: 4, concealable: false });
    // Brawling is melee by its skill even without an explicit flag on the row.
    expect(at('FISTS').melee).toBe(true);
  });

  it('le SP e penalidade da armadura, e nada disso vaza para outras categorias', () => {
    const catalog = gearCatalog([
      { code: 'FLAK', name: 'Flak', cat: 'ARMOR', price: 500, armor: { headSP: 15, bodySP: 15, armorPenalty: { REF: -4, DEX: -4, MOVE: -4 } } },
      { code: 'KEVLAR', name: 'Kevlar', cat: 'ARMOR', price: 50, armor: { headSP: 7, bodySP: 7, armorPenalty: { REF: 0, DEX: 0, MOVE: 0 } } },
      { code: 'AMMO-RIFLE', name: 'Rifle Ammunition', cat: 'AMMUNITION', ammoType: 'Rifle', packSize: 10, price: 10 },
      { code: 'AGENT', name: 'Agent', cat: 'GEAR', price: 100 },
    ]);
    const at = (code) => catalog.find((item) => item.code === code);
    expect(at('FLAK')).toMatchObject({ sp: 15, armorPenalty: -4 });
    expect(at('KEVLAR')).toMatchObject({ sp: 7, armorPenalty: 0 });
    expect(at('AMMO-RIFLE')).toMatchObject({ sp: null, armorPenalty: 0, ammoType: 'Rifle', melee: false });
    expect(at('AGENT')).toMatchObject({ sp: null, skill: '', rof: null, ammoType: '' });
  });

  it('o catalogo real classifica cada arma vendida como melee ou de distancia', () => {
    const weapons = gearCatalog(seed.items).filter((item) => item.cat === 'WEAPONS');
    expect(weapons.length).toBeGreaterThan(0);
    for (const weapon of weapons) {
      expect(weapon.dmg).toMatch(/^\d+d\d+/);
      expect(weapon.skill).not.toBe('');
    }
    const melee = weapons.filter((item) => item.melee).map((item) => item.code);
    expect(melee).toContain('LIGHT-MELEE');
    expect(melee).toContain('VERY-HEAVY-MELEE');
    expect(melee).not.toContain('ASSAULT-RIFLE');
  });
});

describe('compra e venda', () => {
  it('somar unidades do mesmo item aumenta a quantidade', () => {
    let picks = addGear([], byCode('AGENT'), rich);
    picks = addGear(picks, byCode('AGENT'), rich);
    expect(picks).toHaveLength(1);
    expect(picks[0].qty).toBe(2);
    expect(gearSpend(picks)).toBe(200);
    expect(gearCount(picks)).toBe(2);
  });

  it('vender devolve uma unidade por vez ate a linha sumir', () => {
    let picks = addGear(addGear([], byCode('AGENT'), rich), byCode('AGENT'), rich);
    picks = removeGear(picks, 'AGENT');
    expect(picks[0].qty).toBe(1);
    expect(removeGear(picks, 'AGENT')).toEqual([]);
  });

  it('recusa o que nao cabe no dinheiro que sobrou do chrome', () => {
    const block = gearBlock([], byCode('ASSAULT-RIFLE'), { cashLeft: 400 });
    expect(block).toBe('funds');
    expect(gearBlockMessage(block, byCode('ASSAULT-RIFLE'))).toContain('Assault Rifle');
    expect(addGear([], byCode('ASSAULT-RIFLE'), { cashLeft: 400 })).toEqual([]);
    expect(addGear([], byCode('ASSAULT-RIFLE'), { cashLeft: 500 })).toHaveLength(1);
  });

  it('respeita o estoque', () => {
    expect(gearBlock([], byCode('SOLD-OUT-GUN'), rich)).toBe('soldout');
  });

  it('o aviso da carta conta quanto falta, sem repetir o nome do item', () => {
    expect(gearBlockLabel('funds')).toBe('SEM SALDO');
    expect(gearBlockDetail('funds', byCode('ASSAULT-RIFLE'), { cashLeft: 400 }))
      .toBe('Faltam 100eb. Venda outra compra ou fique sem ele.');
    expect(gearBlockDetail('soldout', byCode('SOLD-OUT-GUN'))).toBe('Esgotado no catálogo.');
    expect(gearBlockDetail(null, byCode('AGENT'))).toBe('');
    expect(gearBlockLabel(null)).toBe('');
  });
});

describe('linhas gravadas no inventario', () => {
  it('gera id unico, quantidade e nada equipado', () => {
    let picks = addGear([], byCode('ASSAULT-RIFLE'), rich);
    picks = addGear(picks, byCode('AGENT'), rich);
    picks = addGear(picks, byCode('AGENT'), rich);
    const rows = gearInventory(picks);
    expect(rows.map((row) => row.id)).toEqual(['assault-rifle-0', 'agent-1']);
    expect(rows[0].packSize).toBe(1);
    expect(rows[0]).toMatchObject({ code: 'ASSAULT-RIFLE', qty: 1, type: 'Assault Rifle', dmg: '5d6', equipped: false });
    expect(rows[1]).toMatchObject({ code: 'AGENT', qty: 2, equipped: false });
  });
});

describe('contra o catalogo real da mesa', () => {
  const catalog = gearCatalog(seed.items);

  it('a prateleira tem arma, armadura e equipamento de verdade', () => {
    const cats = new Set(catalog.map((item) => item.cat));
    expect(cats.has('WEAPONS')).toBe(true);
    expect(cats.has('ARMOR')).toBe(true);
    expect(cats.has('GEAR')).toBe(true);
    expect(catalog.every((item) => item.price > 0)).toBe(true);
  });

  it('a municao basica esta precificada e sai em pacote de dez (p.94/344)', () => {
    const ammo = catalog.filter((item) => item.cat === 'AMMUNITION');
    expect(ammo.find((item) => item.code === 'AMMO-RIFLE')).toMatchObject({ price: 10, packSize: 10 });
    expect(ammo.find((item) => item.code === 'AMMO-GRENADE')).toMatchObject({ price: 50, packSize: 1 });
    expect(ammo.find((item) => item.code === 'AMMO-ROCKET')).toMatchObject({ price: 100, packSize: 1 });
  });

  it('o unico que fica fora da prateleira e a tabela de Brawling, por ser perfil de sistema', () => {
    const pending = unsellableGear(seed.items);
    expect(pending.every((row) => row.reason === 'system-profile')).toBe(true);
    expect(pending.map((row) => row.code).sort()).toEqual([
      'BRAWLING-BODY-HIGH', 'BRAWLING-BODY-LOW', 'BRAWLING-BODY-MID', 'BRAWLING-BODY-SUPERHUMAN',
    ]);
  });
});

describe('municao no inventario', () => {
  it('a linha diz que a compra e um pacote, para ninguem ler dez tiros como um', () => {
    const ammo = gearCatalog(seed.items).find((item) => item.code === 'AMMO-RIFLE');
    const rows = gearInventory(addGear(addGear([], ammo, rich), ammo, rich));
    expect(rows[0]).toMatchObject({ code: 'AMMO-RIFLE', qty: 2, packSize: 10 });
    expect(rows[0].notes).toContain('pacote com 10');
  });
});
