import { describe, expect, it, vi } from 'vitest';

import { formatIpDate, formatIpLogRows, ipCost, ipEntry, ipRoleCost } from '../../../src/domain/economy/index.ts';

describe('domain/economy', () => {
  it('computes skill IP cost from next level and doubles difficult skills', () => {
    expect(ipCost(5, false)).toBe(50);
    expect(ipCost(5, true)).toBe(100);
    expect(ipCost(-2, true)).toBe(0);
  });

  it('computes role ability IP cost from next rank', () => {
    expect(ipRoleCost(4)).toBe(120);
    expect(ipRoleCost('3')).toBe(90);
    expect(ipRoleCost(null)).toBe(0);
  });

  it('builds IP ledger entries with stable shape', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);

    expect(ipEntry('skill', 'Handgun 5', -50, 10)).toEqual({
      id: expect.stringMatching(/^skill-[a-z0-9]+-[a-z0-9]{5}$/),
      at: '2026-07-06T12:00:00.000Z',
      type: 'skill',
      label: 'Handgun 5',
      amount: -50,
      balanceAfter: 10,
    });

    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('formats a ledger timestamp as DD/MM HH:MM (local time)', () => {
    const local = new Date(2026, 6, 6, 9, 5, 0); // 2026-07-06 09:05 local
    expect(formatIpDate(local.toISOString(), () => local)).toBe('06/07 09:05');
    expect(formatIpDate('not-a-date')).toBe('--');
  });

  it('falls back to the injected clock when a row has no timestamp', () => {
    const local = new Date(2026, 0, 15, 3, 7, 0); // 2026-01-15 03:07 local
    expect(formatIpDate(null, () => local)).toBe('15/01 03:07');
  });

  it('formats ledger rows, capping at 18 and coloring by sign', () => {
    const first = new Date(2026, 6, 6, 9, 5, 0);
    const second = new Date(2026, 6, 6, 10, 0, 0);
    const rows = formatIpLogRows([
      { at: first.toISOString(), label: 'Compra Handgun LV 5', amount: -50 },
      { at: second.toISOString(), type: 'award', amount: 30 },
    ]);
    expect(rows).toEqual([
      { when: '06/07 09:05', label: 'Compra Handgun LV 5', amountLabel: '-50', amountColor: '#c0635b' },
      { when: '06/07 10:00', label: 'award', amountLabel: '+30', amountColor: '#3fe0d0' },
    ]);
  });

  it('caps ledger rows at 18 entries', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ at: '2026-07-06T09:05:00.000Z', label: 'Entry ' + i, amount: 1 }));
    expect(formatIpLogRows(rows)).toHaveLength(18);
  });
});
