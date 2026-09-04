import { describe, it, expect } from 'vitest';
import {
  addGear,
  gearBlock,
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
  { code: 'BRAWLING-BODY-MID', name: 'Brawling, BODY 5-6', cat: 'WEAPONS', price: 0 },
  { code: 'GORILLA-ARMS', name: 'Gorilla Arms', cat: 'LIMBS', price: 1000 },
  { code: 'BIOMON', name: 'Biomonitor', cat: 'FASHION', price: 100 },
  { code: 'TT-GOLD', name: 'Trauma Team Gold', cat: 'TRAUMA TEAM', price: 25000 },
  { name: 'Sem codigo', cat: 'GEAR', price: 10 },
];

const byCode = (code) => gearCatalog(CATALOG).find((item) => item.code === code);
const rich = { cashLeft: 2550 };

describe('prateleira da criacao', () => {
  it('vende arma, armadura e equipamento, e nada mais', () => {
    const codes = gearCatalog(CATALOG).map((item) => item.code);
    expect(codes).toEqual(['ASSAULT-RIFLE', 'SOLD-OUT-GUN', 'LIGHT-ARMORJACK', 'AGENT']);
  });

  it('deixa cyberware, fashion e Trauma Team de fora', () => {
    const codes = gearCatalog(CATALOG).map((item) => item.code);
    expect(codes).not.toContain('GORILLA-ARMS');
    expect(codes).not.toContain('BIOMON');
    expect(codes).not.toContain('TT-GOLD');
  });

  it('nao vende linha sem preco, porque item de graca fura o orcamento', () => {
    expect(gearCatalog(CATALOG).map((item) => item.code)).not.toContain('BRAWLING-BODY-MID');
    expect(unsellableGear(CATALOG)).toEqual([
      { code: 'BRAWLING-BODY-MID', name: 'Brawling, BODY 5-6', cat: 'WEAPONS', reason: 'no-price' },
    ]);
  });

  it('carrega o perfil de dano do catalogo', () => {
    expect(byCode('ASSAULT-RIFLE')).toMatchObject({ dmg: '5d6', type: 'Assault Rifle' });
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
});

describe('linhas gravadas no inventario', () => {
  it('gera id unico, quantidade e nada equipado', () => {
    let picks = addGear([], byCode('ASSAULT-RIFLE'), rich);
    picks = addGear(picks, byCode('AGENT'), rich);
    picks = addGear(picks, byCode('AGENT'), rich);
    const rows = gearInventory(picks);
    expect(rows.map((row) => row.id)).toEqual(['assault-rifle-0', 'agent-1']);
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

  it('lista o que o catalogo ainda deve precificar', () => {
    const pending = unsellableGear(seed.items).map((row) => row.code);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending).toContain('AMMO-RIFLE');
  });
});
