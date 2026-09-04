import { describe, it, expect } from 'vitest';
import { isPurchasableProduct } from '../../../src/domain/items/itemNormalizers.ts';
import seed from '../../../../data/seed/limiar-seed.json' with { type: 'json' };

describe('o que e mercadoria no catalogo', () => {
  it('item comum e vendavel', () => {
    expect(isPurchasableProduct({ code: 'ASSAULT-RIFLE', price: 500 })).toBe(true);
  });

  it('purchasable: false tira da loja', () => {
    expect(isPurchasableProduct({ code: 'X', purchasable: false })).toBe(false);
  });

  it('a regra especial "not purchasable" tambem tira, escrita como lista ou texto', () => {
    expect(isPurchasableProduct({ code: 'X', specialRules: ['system-profile', 'not purchasable'] })).toBe(false);
    expect(isPurchasableProduct({ code: 'X', specialRules: 'Not Purchasable' })).toBe(false);
  });

  it('nada nao e mercadoria', () => {
    expect(isPurchasableProduct(null)).toBe(false);
  });

  it('as linhas de Brawling do catalogo real ficam de fora', () => {
    const brawling = seed.items.filter((item) => String(item.code || '').startsWith('BRAWLING-BODY'));
    expect(brawling).toHaveLength(4);
    expect(brawling.every((item) => !isPurchasableProduct(item))).toBe(true);
    // ...e nenhuma arma de verdade foi levada junto.
    const rifle = seed.items.find((item) => item.code === 'ASSAULT-RIFLE');
    expect(isPurchasableProduct(rifle)).toBe(true);
  });
});
