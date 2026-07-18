import { describe, expect, it, vi } from 'vitest';

import { hqHandlers, hqRenderVals } from '../../../src/ui/views/hq.js';

describe('ui/views/hq hqRenderVals', () => {
  const deps = {
    setIpAwardField: vi.fn(),
    applyIpAward: vi.fn(),
    setUserDraftField: vi.fn(),
    saveUserDraft: vi.fn(),
    editUserDraft: vi.fn(),
    deleteUser: vi.fn(),
  };

  it('computes the IP award total/button style from the draft fields', () => {
    const state = { ipAward: { group: '10', warrior: '5', socializer: '', explorer: '0', roleplayer: '3' } };
    const vals = hqRenderVals(state, deps);
    expect(vals.ipAwardTotal).toBe(18);
    expect(vals.ipAwardBtnStyle).toBe('lm-ip-award-btn lm-ip-award-btn--on');
    expect(vals.ipAwardGroup).toBe('10');
  });

  it('renders an "off" button style and empty field defaults when nothing is awarded', () => {
    const vals = hqRenderVals({}, deps);
    expect(vals.ipAwardTotal).toBe(0);
    expect(vals.ipAwardBtnStyle).toBe('lm-ip-award-btn lm-ip-award-btn--off');
    expect(vals.ipAwardGroup).toBe('');
  });

  it('wires the award field setters through deps.setIpAwardField', () => {
    const vals = hqRenderVals({}, deps);
    vals.onIpAwardWarrior({ target: { value: '7' } });
    expect(deps.setIpAwardField).toHaveBeenCalledWith('warrior', '7');
  });

  it('formats the HQ ledger history via the domain economy formatter', () => {
    const state = { hqIp: { ip: 40, log: [{ at: '2026-07-06T12:00:00.000Z', label: 'IP de Grupo espelhado: Rook', amount: 10 }] } };
    const vals = hqRenderVals(state, deps);
    expect(vals.hqIp.ip).toBe(40);
    expect(vals.noHqIpLog).toBe(false);
    expect(vals.hqIpLogRows[0]).toMatchObject({ label: 'IP de Grupo espelhado: Rook', amountLabel: '+10' });
  });

  it('reports noHqIpLog when the ledger is empty', () => {
    const vals = hqRenderVals({ hqIp: { ip: 0, log: [] } }, deps);
    expect(vals.noHqIpLog).toBe(true);
  });

  it('builds userRows with role labels and wires onEdit/onDelete through deps', () => {
    const users = [{ username: 'rook', role: 'player' }];
    const vals = hqRenderVals({ users }, deps);
    expect(vals.userRows[0]).toMatchObject({ username: 'rook', roleLabel: 'PLAYER', canManage: true });
    vals.userRows[0].onEdit();
    expect(deps.editUserDraft).toHaveBeenCalledWith(users[0]);
    vals.userRows[0].onDelete();
    expect(deps.deleteUser).toHaveBeenCalledWith('rook');
  });

  it('marks staff rows as unmanageable for a non-admin GM session', () => {
    const users = [{ username: 'rook', role: 'player' }, { username: 'vesper', role: 'gm' }];
    const vals = hqRenderVals({ users, authUser: { role: 'gm' } }, deps);
    expect(vals.userRows.find(u => u.username === 'rook').canManage).toBe(true);
    expect(vals.userRows.find(u => u.username === 'vesper').canManage).toBe(false);
    expect(vals.canManageStaffRoles).toBe(false);
  });

  it('exposes canManageUsers from gmAuthenticated and canManageStaffRoles from admin role', () => {
    const gm = hqRenderVals({ gmAuthenticated: true, authUser: { role: 'gm' } }, deps);
    expect(gm.canManageUsers).toBe(true);
    expect(gm.canManageStaffRoles).toBe(false);

    const admin = hqRenderVals({ gmAuthenticated: true, authUser: { role: 'admin' } }, deps);
    expect(admin.canManageStaffRoles).toBe(true);

    const player = hqRenderVals({}, deps);
    expect(player.canManageUsers).toBe(false);
  });

  it('reflects the user draft role selection flags', () => {
    const vals = hqRenderVals({ userDraft: { username: 'gm1', password: '', role: 'gm' } }, deps);
    expect(vals.userDraftUsername).toBe('gm1');
    expect(vals.userRoleGmSelected).toBe(true);
    expect(vals.userRoleAdminSelected).toBe(false);
    expect(vals.userRolePlayerSelected).toBe(false);
  });

  it('defaults the user draft role to player when unset', () => {
    const vals = hqRenderVals({}, deps);
    expect(vals.userDraftRole).toBe('player');
    expect(vals.userRolePlayerSelected).toBe(true);
  });
});

function fakeComponent(overrides = {}) {
  const apiInstance = overrides.apiInstance || {
    hq: { set: vi.fn().mockResolvedValue(undefined) },
    users: { upsert: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) },
  };
  return {
    state: { ipAward: {}, hqIp: { ip: 0, log: [] }, userDraft: {}, gmAuthenticated: true, ...overrides.state },
    setState: vi.fn(function (patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = { ...this.state, ...next };
    }),
    ensureGm: overrides.ensureGm || vi.fn(() => true),
    asNumber: (value, fallback, min, max) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    },
    activeCharacter: overrides.activeCharacter || vi.fn(() => ({ id: 'rook', name: 'Rook', ip: 100, ipLog: [] })),
    updateActiveCharacter: vi.fn(),
    ipEntry: (type, label, amount, balanceAfter) => ({ type, label, amount, balanceAfter }),
    normalizeHqIp: (payload) => payload || { ip: 0, log: [] },
    api: vi.fn(() => apiInstance),
    flash: vi.fn(),
    loadUsers: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ui/views/hq hqHandlers', () => {
  it('setIpAwardField merges a single field into state.ipAward', () => {
    const component = fakeComponent();
    hqHandlers(component).setIpAwardField('warrior', '5');
    expect(component.state.ipAward).toEqual({ warrior: '5' });
  });

  it('applyIpAward requires GM auth', async () => {
    const component = fakeComponent({ ensureGm: vi.fn(() => false) });
    await hqHandlers(component).applyIpAward();
    expect(component.updateActiveCharacter).not.toHaveBeenCalled();
  });

  it('applyIpAward flashes when the total is zero', async () => {
    const component = fakeComponent({ state: { ipAward: { group: '0' } } });
    await hqHandlers(component).applyIpAward();
    expect(component.flash).toHaveBeenCalledWith('Informe ao menos 1 IP para premiar');
    expect(component.updateActiveCharacter).not.toHaveBeenCalled();
  });

  it('applyIpAward adds the total to the active character and resets the draft', async () => {
    const component = fakeComponent({ state: { ipAward: { warrior: '5', socializer: '3' } } });
    await hqHandlers(component).applyIpAward();
    expect(component.updateActiveCharacter).toHaveBeenCalledWith(expect.objectContaining({ ip: 108 }));
    expect(component.state.ipAward).toEqual({ group: '', warrior: '', socializer: '', explorer: '', roleplayer: '' });
    expect(component.flash).toHaveBeenCalledWith('IP aplicado: +8');
  });

  it('applyIpAward mirrors a group award into the shared HQ ledger and persists it', async () => {
    const component = fakeComponent({ state: { ipAward: { group: '10' } } });
    await hqHandlers(component).applyIpAward();
    expect(component.state.hqIp.ip).toBe(10);
    expect(component.api().hq.set).toHaveBeenCalledWith(expect.objectContaining({ ip: 10 }));
  });

  it('applyIpAward does not touch the HQ ledger when no group IP is awarded', async () => {
    const component = fakeComponent({ state: { ipAward: { warrior: '5' } } });
    const hqSet = component.api().hq.set;
    await hqHandlers(component).applyIpAward();
    expect(hqSet).not.toHaveBeenCalled();
  });

  it('saveUserDraft requires staff auth + a users api, then reloads the list', async () => {
    const component = fakeComponent({ state: { userDraft: { username: 'new', password: 'x', role: 'player', email: 'new@example.com' } } });
    await hqHandlers(component).saveUserDraft();
    expect(component.api().users.upsert).toHaveBeenCalledWith({ username: 'new', password: 'x', role: 'player', email: 'new@example.com' });
    expect(component.loadUsers).toHaveBeenCalledTimes(1);
    expect(component.state.userDraft).toEqual({ username: '', password: '', role: 'player', email: '' });
  });

  it('saveUserDraft is a no-op for a non-staff session', async () => {
    const component = fakeComponent({ state: { gmAuthenticated: false } });
    await hqHandlers(component).saveUserDraft();
    expect(component.loadUsers).not.toHaveBeenCalled();
  });

  it('editUserDraft loads a user into the draft (password always blank)', () => {
    const component = fakeComponent();
    hqHandlers(component).editUserDraft({ username: 'vesper', role: 'gm', email: 'vesper@example.com' });
    expect(component.state.userDraft).toEqual({ username: 'vesper', password: '', role: 'gm', email: 'vesper@example.com' });
  });

  it('deleteUser requires staff auth, then reloads the list', async () => {
    const component = fakeComponent();
    await hqHandlers(component).deleteUser('vesper');
    expect(component.api().users.delete).toHaveBeenCalledWith('vesper');
    expect(component.loadUsers).toHaveBeenCalledTimes(1);
  });
});
