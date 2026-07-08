// Economy domain: Improvement Point (IP) costs and ledger entries. Pure — the
// UI owns spending (state mutation + API sync) and calls these for the math.

const CPRED_IP_MULT = 10;
const CPRED_IP_ROLE_MULT = CPRED_IP_MULT * 3;

export interface IpLedgerEntry {
  id: string;
  at: string;
  type: string;
  label: string;
  amount: number;
  balanceAfter: number;
}

interface IpEntryDeps {
  rng?: () => number;
  clock?: () => Date;
}

// IP cost to raise a skill to `nextLevel` (doubled for Difficult skills).
export function ipCost(nextLevel: unknown, difficult: unknown): number {
  return Math.max(0, (Number(nextLevel) || 0) * CPRED_IP_MULT * (difficult ? 2 : 1));
}

// IP cost to raise a Role Ability to `nextRank`.
export function ipRoleCost(nextRank: unknown): number {
  return Math.max(0, (Number(nextRank) || 0) * CPRED_IP_ROLE_MULT);
}

// A single ledger entry for the character's IP history. rng/clock are
// injectable so callers (e.g. the application layer) get deterministic
// ids/timestamps in tests; both default to the real thing.
export function ipEntry(
  type: string,
  label: string,
  amount: number,
  balanceAfter: number,
  { rng = Math.random, clock = () => new Date() }: IpEntryDeps = {},
): IpLedgerEntry {
  return {
    id: (type || 'ip') + '-' + clock().getTime().toString(36) + '-' + rng().toString(36).slice(2, 7),
    at: clock().toISOString(),
    type,
    label,
    amount,
    balanceAfter,
  };
}

// Display-formats a ledger entry's timestamp as "DD/MM HH:MM".
export function formatIpDate(value: unknown, clock: () => Date = () => new Date()): string {
  const d = clock();
  if (value) {
    const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
    d.setTime(timestamp);
  }
  if (Number.isNaN(d.getTime())) return '--';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Display-formats up to the 18 most recent ledger rows for a history panel.
export function formatIpLogRows(rows: unknown, clock: () => Date = () => new Date()) {
  return (Array.isArray(rows) ? rows : []).slice(0, 18).map((entry: Partial<IpLedgerEntry>) => {
    const amount = Number(entry.amount) || 0;
    return {
      when: formatIpDate(entry.at, clock),
      label: entry.label || entry.type || 'IP',
      amountLabel: amount > 0 ? '+' + amount : String(amount),
      amountColor: amount >= 0 ? '#3fe0d0' : '#c0635b',
    };
  });
}
