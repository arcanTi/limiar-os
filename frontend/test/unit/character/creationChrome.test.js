import { describe, it, expect } from 'vitest';
import {
  addChrome,
  chromeAttachments,
  chromeBlock,
  chromeBlockMessage,
  chromeCatalog,
  chromeEquipped,
  chromeHumanityLoss,
  chromeSpend,
  creationCashLeft,
  isChromeEnhancement,
  normalizeChromeItem,
  removeChrome,
} from '../../../src/domain/character/creationChrome.ts';
import { CPRED_CREATION_CASH } from '../../../src/domain/character/constants.ts';
import canonicalRules from '../../../../data/canonical/cpr-canonical-rules.json' with { type: 'json' };
import seed from '../../../../data/seed/limiar-seed.json' with { type: 'json' };

const CATALOG = [
  { code: 'GORILLA-ARMS', name: 'Gorilla Arms', cat: 'LIMBS', price: 1000, hcost: 14, stock: 'IN STOCK', desc: 'bracos de forca' },
  { code: 'ENH-TUNGSTEN', name: 'Tungsten Reinforcement', cat: 'LIMBS', price: 500, hcost: 3, stock: 'IN STOCK', attachesTo: ['GORILLA-ARMS'] },
  { code: 'NEURAL-LINK', name: 'Neural Link', cat: 'NEURAL', price: 500, hcost: 7, stock: 'IN STOCK' },
  { code: 'BORG-FULL', name: 'Full Borg Conversion', cat: 'BORG', price: 2000, hcost: 40, stock: 'IN STOCK' },
  { code: 'CHROME-GONE', name: 'Peca esgotada', cat: 'OPTICS', price: 100, hcost: 2, stock: 'SOLD OUT' },
  { code: 'MEDTECH-BAG', name: 'Medtech Bag', cat: 'GEAR', price: 100, hcost: 0, stock: 'IN STOCK' },
  { name: 'Sem codigo', cat: 'NEURAL', price: 10 },
];

const byCode = (code) => chromeCatalog(CATALOG).find((item) => item.code === code);

describe('catalogo de chrome da criacao', () => {
  it('fica so com o que e implantado, e exige codigo', () => {
    const codes = chromeCatalog(CATALOG).map((item) => item.code);
    expect(codes).toContain('GORILLA-ARMS');
    expect(codes).toContain('NEURAL-LINK');
    expect(codes).not.toContain('MEDTECH-BAG');
    expect(codes).toHaveLength(5);
  });

  it('mantem aprimoramento mesmo se a categoria nao for de implante', () => {
    const enhancement = chromeCatalog([{ code: 'ENH-X', name: 'X', cat: 'GEAR', attachesTo: ['GORILLA-ARMS'] }]);
    expect(enhancement).toHaveLength(1);
    expect(isChromeEnhancement(enhancement[0])).toBe(true);
  });

  it('nao repete o mesmo codigo vindo duas vezes do catalogo', () => {
    expect(chromeCatalog([...CATALOG, CATALOG[0]]).filter((item) => item.code === 'GORILLA-ARMS')).toHaveLength(1);
  });

  it('normaliza numeros ausentes em vez de propagar NaN', () => {
    expect(normalizeChromeItem({ code: 'X', price: 'abc', hcost: null })).toMatchObject({ price: 0, hcost: 0, name: 'X', stock: 'IN STOCK' });
  });
});

describe('orcamento de 2.550eb', () => {
  it('o que sobra e o dinheiro inicial', () => {
    const picks = [byCode('GORILLA-ARMS')];
    expect(chromeSpend(picks)).toBe(1000);
    expect(creationCashLeft(picks)).toBe(CPRED_CREATION_CASH - 1000);
  });

  it('sem chrome, o operativo comeca com o orcamento inteiro no bolso', () => {
    expect(creationCashLeft([])).toBe(CPRED_CREATION_CASH);
  });

  it('recusa o que nao cabe no orcamento', () => {
    const picks = [byCode('BORG-FULL')];
    expect(chromeBlock([], byCode('BORG-FULL')).reason).toBeNull();
    expect(chromeBlock(picks, byCode('GORILLA-ARMS')).reason).toBe('funds');
    expect(addChrome(picks, byCode('GORILLA-ARMS'))).toEqual(picks);
  });

  it('soma a HUMANITY de tudo que foi instalado', () => {
    expect(chromeHumanityLoss([byCode('GORILLA-ARMS'), byCode('ENH-TUNGSTEN')])).toBe(17);
  });
});

describe('aprimoramentos exigem a peca base', () => {
  it('bloqueia o aprimoramento solto e explica o porque', () => {
    const block = chromeBlock([], byCode('ENH-TUNGSTEN'));
    expect(block.reason).toBe('parent');
    expect(chromeBlockMessage(block, byCode('ENH-TUNGSTEN'))).toContain('GORILLA-ARMS');
  });

  it('libera depois que a peca base entra', () => {
    const picks = addChrome([], byCode('GORILLA-ARMS'));
    expect(chromeBlock(picks, byCode('ENH-TUNGSTEN')).reason).toBeNull();
    expect(addChrome(picks, byCode('ENH-TUNGSTEN'))).toHaveLength(2);
  });

  it('remover a peca base devolve tambem o aprimoramento preso nela', () => {
    let picks = addChrome([], byCode('GORILLA-ARMS'));
    picks = addChrome(picks, byCode('ENH-TUNGSTEN'));
    picks = addChrome(picks, byCode('NEURAL-LINK'));
    const after = removeChrome(picks, 'GORILLA-ARMS');
    expect(after.map((item) => item.code)).toEqual(['NEURAL-LINK']);
  });

  it('agrupa o instalado como peca base e seus aprimoramentos', () => {
    let picks = addChrome([], byCode('GORILLA-ARMS'));
    picks = addChrome(picks, byCode('ENH-TUNGSTEN'));
    const groups = chromeAttachments(picks);
    expect(groups).toHaveLength(1);
    expect(groups[0].parent.code).toBe('GORILLA-ARMS');
    expect(groups[0].enhancements.map((item) => item.code)).toEqual(['ENH-TUNGSTEN']);
  });
});

describe('outras recusas', () => {
  it('nao instala a mesma peca duas vezes', () => {
    const picks = addChrome([], byCode('NEURAL-LINK'));
    expect(chromeBlock(picks, byCode('NEURAL-LINK')).reason).toBe('duplicate');
  });

  it('respeita o estoque do catalogo', () => {
    expect(chromeBlock([], byCode('CHROME-GONE')).reason).toBe('soldout');
  });

  it('aplica os requisitos do motor de instalacao quando o catalogo cru e passado', () => {
    const raw = [
      { code: 'NEURAL-LINK', name: 'Neural Link', cat: 'NEURAL', price: 500, hcost: 7, cyberwareType: 'neuralware' },
      {
        code: 'CHIP-X',
        name: 'Chipware X',
        cat: 'NEURAL',
        price: 200,
        hcost: 2,
        cyberwareType: 'chipware',
        requires: [{ type: 'requiredCyberware', code: 'NEURAL-LINK', name: 'Neural Link' }],
      },
    ];
    const chip = chromeCatalog(raw).find((item) => item.code === 'CHIP-X');
    const link = chromeCatalog(raw).find((item) => item.code === 'NEURAL-LINK');
    const block = chromeBlock([], chip, { catalog: raw });
    expect(block.reason).toBe('install');
    expect(chromeBlockMessage(block, chip)).toContain('Chipware X');
    expect(chromeBlock(addChrome([], link), chip, { catalog: raw }).reason).toBeNull();
  });
});

describe('linhas gravadas na ficha', () => {
  it('instala a peca e lista o aprimoramento no pai', () => {
    let picks = addChrome([], byCode('GORILLA-ARMS'));
    picks = addChrome(picks, byCode('ENH-TUNGSTEN'));
    const rows = chromeEquipped(picks);
    expect(rows.map((row) => row.code)).toEqual(['GORILLA-ARMS', 'ENH-TUNGSTEN']);
    expect(rows[0].enhancements).toEqual(['ENH-TUNGSTEN']);
    expect(rows[1].enhancements).toEqual([]);
    expect(rows[0]).toMatchObject({ hcost: 14, price: 1000, cat: 'LIMBS' });
  });
});

describe('contra o catalogo real da mesa', () => {
  const catalog = chromeCatalog(seed.items);
  const real = (code) => catalog.find((item) => item.code === code);
  const context = { catalog: seed.items, canonicalRules };

  it('vende o chrome comum da criacao sem falso bloqueio', () => {
    // Gorilla Arms sao uma compra unica que cobre os dois bracos; o motor so
    // reclama de pareamento porque a criacao nao escolhe braco esquerdo/direito.
    ['GORILLA-ARMS', 'CYBERARM', 'NEURAL-LINK'].forEach((code) => {
      expect(chromeBlock([], real(code), context).reason).toBeNull();
    });
  });

  it('cobra o Neural Link antes do speedware, como manda o RAW', () => {
    expect(chromeBlock([], real('KERENZIKOV'), context).reason).toBe('install');
    expect(chromeBlock(addChrome([], real('NEURAL-LINK'), context), real('KERENZIKOV'), context).reason).toBeNull();
  });

  it('exige o Neural Link antes do chipware que depende dele', () => {
    const socket = real('CHIP-SOCKET');
    const link = real('NEURAL-LINK');
    expect(chromeBlock([], socket, context).reason).toBe('install');
    expect(chromeBlock(addChrome([], link, context), socket, context).reason).toBeNull();
  });

  it('so libera o Hydraulic Ram depois das Gorilla Arms', () => {
    const ram = real('ENH-HYD-RAM');
    expect(chromeBlock([], ram, context).reason).toBe('parent');
    expect(chromeBlock(addChrome([], real('GORILLA-ARMS'), context), ram, context).reason).toBeNull();
  });

  it('para de vender quando os 2.550eb acabam', () => {
    let picks = [];
    ['GORILLA-ARMS', 'CYBERARM'].forEach((code) => { picks = addChrome(picks, real(code), context); });
    expect(chromeSpend(picks)).toBeLessThanOrEqual(CPRED_CREATION_CASH);
    expect(creationCashLeft(picks)).toBe(CPRED_CREATION_CASH - chromeSpend(picks));
  });
});
