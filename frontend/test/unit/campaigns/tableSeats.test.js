import { describe, expect, it } from 'vitest';

import {
  activeCharacterIdFor,
  controlledCharacterIds,
  delegatedSeats,
  seatCharacterId,
  tableSeats,
} from '../../../src/domain/campaigns/tableSeats.ts';

const campaign = {
  id: 'mesa-1',
  name: 'NOITE EM WATSON',
  roster: [
    { username: 'leu', role: 'player', characterId: 'leu-1', portraitUrl: '/uploads/leu.png' },
    { username: 'matheus', role: 'gm', characterId: null, portraitUrl: null },
    { username: 'bari', role: 'player', characterId: 'bari-1', portraitUrl: null },
  ],
};

describe('assentos da mesa', () => {
  it('coloca o mestre na frente e voce logo depois', () => {
    const seats = tableSeats(campaign, { username: 'bari' });
    expect(seats.map(s => s.username)).toEqual(['matheus', 'bari', 'leu']);
    expect(seats[0].roleLabel).toBe('MESTRE');
    expect(seats[1].isSelf).toBe(true);
    expect(seats[2].isSelf).toBe(false);
  });

  it('nao duplica o mestre que tambem entrou como membro', () => {
    const doubled = { roster: [...campaign.roster, { username: 'MATHEUS', role: 'player', characterId: 'x' }] };
    expect(tableSeats(doubled, { username: 'bari' }).filter(s => s.username.toLowerCase() === 'matheus')).toHaveLength(1);
  });

  it('aceita o campo em snake_case que vem do banco', () => {
    const seats = tableSeats({ roster: [{ username: 'leu', role: 'player', character_id: 'leu-1', portrait_url: '/u/l.png', character_role: 'Nomad', character_level: 3 }] });
    expect(seats[0]).toMatchObject({ characterId: 'leu-1', portraitUrl: '/u/l.png', characterRole: 'Nomad', characterLevel: 3 });
  });

  // Classe e nivel viajam com o assento para a mesa ser lida como personagens.
  it('carrega classe e nivel, com nivel 1 quando o assento nao traz ficha', () => {
    const seats = tableSeats({
      roster: [
        { username: 'leu', role: 'player', characterId: 'leu-1', characterName: 'Rook', characterRole: 'Solo', characterLevel: 4 },
        { username: 'matheus', role: 'gm', characterId: null },
      ],
    });
    expect(seats[1]).toMatchObject({ characterName: 'Rook', characterRole: 'Solo', characterLevel: 4 });
    expect(seats[0]).toMatchObject({ characterName: '', characterRole: '', characterLevel: 1 });
  });

  it('gera iniciais legiveis e descarta entrada sem username', () => {
    const seats = tableSeats({ roster: [{ username: 'ana_lu', role: 'player' }, { role: 'player' }, null, 'lixo'] });
    expect(seats).toHaveLength(1);
    expect(seats[0].initials).toBe('AN');
  });

  it('sem campanha nao inventa mesa', () => {
    expect(tableSeats(null)).toEqual([]);
    expect(tableSeats({})).toEqual([]);
  });

  it('acha a ficha que a mesa inscreveu para voce', () => {
    expect(seatCharacterId(campaign, 'leu')).toBe('leu-1');
    expect(seatCharacterId(campaign, 'matheus')).toBe('');
    expect(seatCharacterId(campaign, 'ninguem')).toBe('');
  });
});

describe('qual ficha o jogador dirige', () => {
  const characters = [{ id: 'bari-1' }, { id: 'antiga-2' }];

  it('a inscrita na campanha vence a que estava ativa', () => {
    expect(activeCharacterIdFor('bari-1', characters, 'antiga-2')).toBe('bari-1');
  });

  it('assento sem ficha, ou apontando para documento que nao e seu, mantem a atual', () => {
    expect(activeCharacterIdFor('', characters, 'antiga-2')).toBe('antiga-2');
    expect(activeCharacterIdFor('de-outro-jogador', characters, 'antiga-2')).toBe('antiga-2');
  });

  it('sem escolha anterior e com uma unica ficha, assume essa', () => {
    expect(activeCharacterIdFor('', [{ id: 'so-uma' }], '')).toBe('so-uma');
  });

  it('sem fichas nao force uma escolha', () => {
    expect(activeCharacterIdFor('', [], '')).toBe('');
    expect(activeCharacterIdFor('', null, '')).toBe('');
  });
});

// --- Cobrindo jogador ausente ---
// O mestre cede a ficha de quem faltou para outro da mesa; o substituto dirige
// a ficha ate o mestre devolver. Controle muda, dono nao.

const covered = {
  id: 'mesa-1',
  name: 'NOITE EM WATSON',
  roster: [
    { username: 'matheus', role: 'gm', characterId: null },
    { username: 'bari', role: 'player', characterId: 'bari-1', controlledBy: null },
    { username: 'leu', role: 'player', characterId: 'leu-1', controlledBy: 'bari' },
  ],
};

describe('assento coberto por substituto', () => {
  it('marca quem esta segurando a ficha do ausente', () => {
    const seats = tableSeats(covered, { username: 'bari' });
    const absent = seats.find(seat => seat.username === 'leu');

    expect(absent.controlledBy).toBe('bari');
    expect(absent.controlledByMe).toBe(true);
    expect(seats.find(seat => seat.username === 'bari').controlledBy).toBe('');
  });

  it('para os outros da mesa, cobrir e informacao, nao posse', () => {
    const seats = tableSeats(covered, { username: 'leu' });
    const mine = seats.find(seat => seat.username === 'leu');

    expect(mine.isSelf).toBe(true);
    expect(mine.controlledBy).toBe('bari');
    expect(mine.controlledByMe).toBe(false);
  });

  it('lista so as fichas cedidas, nunca a propria', () => {
    expect(delegatedSeats(covered, 'bari').map(seat => seat.characterId)).toEqual(['leu-1']);
    expect(delegatedSeats(covered, 'leu')).toEqual([]);
    expect(delegatedSeats(covered, '')).toEqual([]);
  });

  it('o conjunto dirigivel e o assento proprio mais o cedido', () => {
    expect(controlledCharacterIds(covered, 'bari').sort()).toEqual(['bari-1', 'leu-1']);
    expect(controlledCharacterIds(covered, 'leu')).toEqual(['leu-1']);
    expect(controlledCharacterIds(covered, 'ninguem')).toEqual([]);
  });
});

describe('escolha do jogador x regra do assento', () => {
  const characters = [{ id: 'bari-1' }, { id: 'leu-1' }, { id: 'bari-antiga' }];

  it('assumir a ficha cedida sobrevive ao proximo refresh', () => {
    const controlled = controlledCharacterIds(covered, 'bari');
    expect(activeCharacterIdFor('bari-1', characters, 'leu-1', controlled)).toBe('leu-1');
  });

  it('ficha sem assento nem cessao perde para o assento', () => {
    const controlled = controlledCharacterIds(covered, 'bari');
    expect(activeCharacterIdFor('bari-1', characters, 'bari-antiga', controlled)).toBe('bari-1');
  });

  it('cessao revogada devolve o jogador ao proprio assento', () => {
    expect(activeCharacterIdFor('bari-1', characters, 'leu-1', ['bari-1'])).toBe('bari-1');
  });
});
