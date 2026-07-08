import { asNumber } from '../../domain/shared/num.ts';
import { normalizeHqIp } from '../../domain/character/index.ts';
import { formatIpLogRows } from '../../domain/economy/index.ts';

const IP_AWARD_KEYS = ['group', 'warrior', 'socializer', 'explorer', 'roleplayer'];

// SYS.08 // SYSTEM tab: the session IP-award panel (mirrored into the shared
// HQ ledger), the HQ ledger history, and admin user management.
export function hqRenderVals(state = {}, deps = {}) {
  const S = state;
  const ipAward = S.ipAward || {};
  const ipAwardTotal = IP_AWARD_KEYS.reduce((sum, key) => sum + asNumber(ipAward[key], 0, 0, 9999), 0);
  const ipAwardBtnStyle = 'lm-ip-award-btn' + (ipAwardTotal > 0 ? ' lm-ip-award-btn--on' : ' lm-ip-award-btn--off');
  const hqIp = normalizeHqIp(S.hqIp);
  const hqIpLogRows = formatIpLogRows(hqIp.log);
  const userDraft = S.userDraft || {};
  const userRole = userDraft.role || 'player';
  const userRows = (S.users || []).map(user => ({
    ...user,
    roleLabel: String(user.role || 'player').toUpperCase(),
    onEdit: () => deps.editUserDraft(user),
    onDelete: () => deps.deleteUser(user.username),
  }));

  return {
    hqIp, ipAwardTotal, ipAwardBtnStyle,
    ipAwardGroup: ipAward.group || '',
    ipAwardWarrior: ipAward.warrior || '',
    ipAwardSocializer: ipAward.socializer || '',
    ipAwardExplorer: ipAward.explorer || '',
    ipAwardRoleplayer: ipAward.roleplayer || '',
    onIpAwardGroup: (e) => deps.setIpAwardField('group', e.target.value),
    onIpAwardWarrior: (e) => deps.setIpAwardField('warrior', e.target.value),
    onIpAwardSocializer: (e) => deps.setIpAwardField('socializer', e.target.value),
    onIpAwardExplorer: (e) => deps.setIpAwardField('explorer', e.target.value),
    onIpAwardRoleplayer: (e) => deps.setIpAwardField('roleplayer', e.target.value),
    applyIpAward: deps.applyIpAward,
    hqIpLogRows,
    noHqIpLog: hqIpLogRows.length === 0,
    userRows,
    userDraftUsername: userDraft.username || '',
    userDraftPassword: userDraft.password || '',
    userDraftRole: userRole,
    userRoleAdminSelected: userRole === 'admin',
    userRoleGmSelected: userRole === 'gm',
    userRolePlayerSelected: userRole === 'player',
    onUserDraftUsername: (e) => deps.setUserDraftField('username', e.target.value),
    onUserDraftPassword: (e) => deps.setUserDraftField('password', e.target.value),
    onUserDraftRole: (e) => deps.setUserDraftField('role', e.target.value),
    saveUserDraft: deps.saveUserDraft,
  };
}

// component: the Component instance (state/setState/api/flash/ensureGm/
// activeCharacter/updateActiveCharacter/ipEntry/normalizeHqIp/isAdmin/
// loadUsers already live there and aren't being duplicated here).
export function hqHandlers(component) {
  return {
    setIpAwardField: (key, value) => component.setState(s => ({ ipAward: { ...(s.ipAward || {}), [key]: value } })),

    async applyIpAward() {
      if (!component.ensureGm('Login do mestre necessario para premiar IP')) return;
      const award = component.state.ipAward || {};
      const group = component.asNumber(award.group, 0, 0, 9999);
      const warrior = component.asNumber(award.warrior, 0, 0, 9999);
      const socializer = component.asNumber(award.socializer, 0, 0, 9999);
      const explorer = component.asNumber(award.explorer, 0, 0, 9999);
      const roleplayer = component.asNumber(award.roleplayer, 0, 0, 9999);
      const total = group + warrior + socializer + explorer + roleplayer;
      if (total <= 0) return component.flash('Informe ao menos 1 IP para premiar');
      const active = component.activeCharacter();
      const after = component.asNumber(active.ip, 0, 0, 999999) + total;
      const parts = [];
      if (group) parts.push('Grupo +' + group);
      if (warrior) parts.push('Warrior +' + warrior);
      if (socializer) parts.push('Socializer +' + socializer);
      if (explorer) parts.push('Explorer +' + explorer);
      if (roleplayer) parts.push('Roleplayer +' + roleplayer);
      const log = [component.ipEntry('award', 'Premiacao de sessao: ' + parts.join(' / '), total, after), ...(active.ipLog || [])];
      component.updateActiveCharacter({ ip: after, ipLog: log });

      if (group > 0) {
        const currentHq = component.normalizeHqIp(component.state.hqIp);
        const hqAfter = currentHq.ip + group;
        const hqIp = { ip: hqAfter, log: [component.ipEntry('award', 'IP de Grupo espelhado: ' + (active.name || 'OPERATIVE'), group, hqAfter), ...(currentHq.log || [])] };
        component.setState({ hqIp });
        if (component.api() && component.api().hq) {
          try {
            await component.api().hq.set(hqIp);
          } catch (err) {
            component.setState({ gmStatus: 'IP aplicado; falha ao sincronizar HQ: ' + err.message });
          }
        }
      }

      component.setState({ ipAward: { group: '', warrior: '', socializer: '', explorer: '', roleplayer: '' } });
      component.flash('IP aplicado: +' + total);
    },

    setUserDraftField: (key, value) => component.setState(s => ({ userDraft: { ...(s.userDraft || {}), [key]: value } })),

    async saveUserDraft() {
      if (!(component.api() && component.api().users && component.isAdmin())) return;
      const draft = component.state.userDraft || {};
      try {
        await component.api().users.upsert(draft);
        component.setState({ userDraft: { username: '', password: '', role: 'player' }, gmStatus: 'Usuario salvo' });
        await component.loadUsers();
      } catch (_) {
        component.setState({ gmStatus: 'Falha ao salvar usuario' });
      }
    },

    editUserDraft: (user) => component.setState({ userDraft: { username: user.username || '', password: '', role: user.role || 'player' } }),

    async deleteUser(username) {
      if (!(component.api() && component.api().users && component.isAdmin())) return;
      try {
        await component.api().users.delete(username);
        component.setState({ gmStatus: 'Usuario removido' });
        await component.loadUsers();
      } catch (_) {
        component.setState({ gmStatus: 'Falha ao remover usuario' });
      }
    },
  };
}
