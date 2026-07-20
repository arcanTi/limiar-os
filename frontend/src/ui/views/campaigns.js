import {
  campaignInviteCount,
  canJoinCampaign,
  canManageCampaign,
  isLoggedInSession,
  isStaffSession,
  normalizeCampaign,
  normalizeCampaignDraft,
  normalizeCampaignNotifications,
  selectCampaign,
  selectedCharacterForCampaign,
} from '../../domain/campaigns/index.ts';
import { patchRoot } from '../../framework/index.js';

const defaultDraft = { id: '', name: '', description: '', visibility: 'public', status: 'active', bannerUrl: '' };

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function playerUsers(users = []) {
  return Array.isArray(users) ? users.filter(user => user.role === 'player') : [];
}

export function campaignsRenderVals(state = {}, deps = {}) {
  const session = state.session || null;
  const campaigns = Array.isArray(state.campaigns) ? state.campaigns.map(normalizeCampaign) : [];
  const notifications = normalizeCampaignNotifications(state.notifications || []);
  const characters = Array.isArray(state.characters) ? state.characters : [];
  const staff = isStaffSession(session);
  const logged = isLoggedInSession(session);
  const selected = selectCampaign(campaigns, state.selectedCampaignId);
  const query = String(state.inviteQuery || '').trim().toLowerCase();
  const users = playerUsers(state.users).filter(user => !query || String(user.username).toLowerCase().includes(query)).slice(0, 80);
  const current = selected ? {
    ...selected,
    canJoin: canJoinCampaign(selected, session),
    canManage: canManageCampaign(selected, session),
    selectedCharacterId: selectedCharacterForCampaign(selected.id, state.characterByCampaign || {}, characters),
    pendingInviteCount: selected.invites.filter(invite => invite.status === 'pending').length,
  } : null;
  const draft = normalizeCampaignDraft(state.draft || deps.defaultDraft || defaultDraft);
  const bannerFile = state.bannerFile || null;

  return {
    open: Boolean(state.open),
    logged,
    staff,
    username: session?.user?.username || session?.username || '',
    campaigns: campaigns.map(campaign => ({
      ...campaign,
      active: Boolean(selected && selected.id === campaign.id),
      canManage: canManageCampaign(campaign, session),
      pendingInviteCount: campaign.invites.filter(invite => invite.status === 'pending').length,
    })),
    notifications,
    notifyCount: campaignInviteCount(notifications),
    characters,
    users,
    query,
    selected: current,
    status: String(state.status || ''),
    draft,
    editing: Boolean(draft.id),
    bannerFileName: bannerFile ? bannerFile.name : '',
    bannerPreviewUrl: state.bannerPreviewUrl || '',
  };
}

export function campaignsHandlers(component, api) {
  const patch = (next, options) => component.setState(next, options);
  const refresh = async () => {
    if (!api.auth.token()) {
      patch({ session: null, campaigns: [], notifications: [], characters: [], users: [] });
      return;
    }
    try {
      const session = await api.auth.session();
      if (!isLoggedInSession(session)) {
        patch({ session });
        return;
      }
      const [campaigns, notifications, characters] = await Promise.all([
        api.campaigns.list(),
        api.campaigns.notifications(),
        api.characters.list(),
      ]);
      const normalizedCampaigns = Array.isArray(campaigns) ? campaigns.map(normalizeCampaign) : [];
      const selectedCampaignId = normalizedCampaigns.some(campaign => campaign.id === component.state.selectedCampaignId)
        ? component.state.selectedCampaignId
        : (normalizedCampaigns[0]?.id || '');
      const next = {
        session,
        campaigns: normalizedCampaigns,
        selectedCampaignId,
        notifications: Array.isArray(notifications) ? notifications : [],
        characters: Array.isArray(characters) ? characters : [],
      };
      if (isStaffSession(session)) {
        try {
          next.users = playerUsers(await api.users.list());
        } catch (_) {
          next.users = [];
        }
      } else {
        next.users = [];
      }
      patch(next);
    } catch (_) {
      patch({ status: 'Sessao indisponivel' });
    }
  };

  return {
    refresh,
    toggle: async () => {
      patch({ open: !component.state.open });
      await refresh();
    },
    close: () => patch({ open: false }),
    selectCampaign: (campaignId) => patch({ selectedCampaignId: campaignId }),
    updateDraft: (key, value) => patch({ draft: { ...component.state.draft, [key]: value } }, { render: false }),
    updateInviteQuery: (inviteQuery) => patch({ inviteQuery }, { render: false }),
    updateCharacter: (campaignId, characterId) => patch({
      characterByCampaign: { ...component.state.characterByCampaign, [campaignId]: characterId },
    }, { render: false }),
    editCampaign: (campaign) => {
      patch({
        draft: normalizeCampaignDraft(campaign),
        bannerFile: null,
        bannerPreviewUrl: '',
        status: '',
      });
    },
    cancelEdit: () => patch({ draft: { ...defaultDraft }, bannerFile: null, bannerPreviewUrl: '' }),
    setBannerFile: (file) => {
      patch({ bannerFile: file || null, bannerPreviewUrl: file ? URL.createObjectURL(file) : '' });
    },
    saveCampaign: async () => {
      const draft = normalizeCampaignDraft(component.state.draft);
      const bannerFile = component.state.bannerFile || null;
      try {
        let saved = await api.campaigns.create(draft);
        if (bannerFile && saved && saved.id) {
          try {
            const asset = await api.uploads.image(bannerFile, { scope: 'campaign-banner', ownerId: saved.id });
            if (asset && asset.url) {
              saved = await api.campaigns.create({ ...draft, id: saved.id, bannerUrl: asset.url });
            }
          } catch (_) {
            patch({ status: 'Campanha salva; falha ao enviar capa' });
          }
        }
        patch({ draft: { ...defaultDraft }, bannerFile: null, bannerPreviewUrl: '', status: 'Campanha salva' });
        await refresh();
      } catch (_) {
        patch({ status: 'Falha ao salvar campanha' });
      }
    },
    clearBanner: async (campaign) => {
      try {
        await api.campaigns.create({ id: campaign.id, name: campaign.name, clearBanner: true });
        patch({ status: 'Capa removida' });
        await refresh();
      } catch (_) {
        patch({ status: 'Falha ao remover capa' });
      }
    },
    invite: async (campaignId, username) => {
      try {
        await api.campaigns.invite(campaignId, username);
        patch({ status: 'Convite enviado para ' + username });
        await refresh();
      } catch (_) {
        patch({ status: 'Falha ao enviar convite' });
      }
    },
    cancelInvite: async (campaignId, username) => {
      try {
        await api.campaigns.cancelInvite(campaignId, username);
        patch({ status: 'Convite cancelado' });
        await refresh();
      } catch (_) {
        patch({ status: 'Falha ao cancelar convite' });
      }
    },
    removeMember: async (campaignId, username) => {
      try {
        await api.campaigns.removeMember(campaignId, username);
        patch({ status: 'Player removido da campanha' });
        await refresh();
      } catch (_) {
        patch({ status: 'Falha ao remover player' });
      }
    },
    join: async (campaignId) => {
      const characterId = selectedCharacterForCampaign(campaignId, component.state.characterByCampaign, component.state.characters);
      if (!characterId) {
        patch({ status: 'Crie uma ficha antes de entrar' });
        return;
      }
      try {
        await api.campaigns.join(campaignId, characterId);
        patch({ status: 'Campanha vinculada a ficha' });
        await refresh();
      } catch (_) {
        patch({ status: 'Nao foi possivel entrar na campanha' });
      }
    },
  };
}

function campaignListItem(campaign) {
  return `
    <button class="lm-campaign-list-item${campaign.active ? ' lm-campaign-list-item--active' : ''}" data-campaign-select="${esc(campaign.id)}">
      <span>
        <strong>${esc(campaign.name)}</strong>
        <em>${esc(campaign.visibility).toUpperCase()} // ${esc(campaign.status).toUpperCase()}</em>
      </span>
      <b>${campaign.members.length}</b>
      ${campaign.pendingInviteCount ? `<i>${campaign.pendingInviteCount}</i>` : ''}
    </button>
  `;
}

function campaignDetail(vals) {
  const campaign = vals.selected;
  if (!campaign) return '<div class="lm-campaign-empty">Nenhuma campanha disponivel.</div>';
  const invited = new Set(campaign.invites.filter(invite => invite.status === 'pending').map(invite => invite.username));
  const memberUsers = new Set(campaign.members.map(member => member.username));
  const charOptions = vals.characters.map(character => `<option value="${esc(character.id)}" ${campaign.selectedCharacterId === character.id ? 'selected' : ''}>${esc(character.name || character.id)}</option>`).join('');
  return `
    <div class="lm-campaign-detail">
      <div class="lm-campaign-detail-head">
        <div>
          <div class="lm-campaign-name">${esc(campaign.name)}</div>
          <div class="lm-campaign-meta">${esc(campaign.visibility).toUpperCase()} // ${esc(campaign.status).toUpperCase()} // ${campaign.members.length} FICHAS</div>
        </div>
        <div class="lm-campaign-actions">
          <span class="lm-campaign-chip">${campaign.isMember ? 'VINCULADA' : campaign.canJoin ? 'ABERTA' : 'INFO'}</span>
          ${campaign.canManage ? `<button data-campaign-edit="${esc(campaign.id)}">EDITAR</button>` : ''}
          ${campaign.isMember || vals.staff ? `<button data-campaign-map="${esc(campaign.id)}">MESA</button>` : ''}
        </div>
      </div>
      ${campaign.bannerUrl ? `<div class="lm-campaign-banner" style="background-image:url(${esc(campaign.bannerUrl)})"></div>` : ''}
      <div class="lm-campaign-desc">${esc(campaign.description || 'Sem briefing.')}</div>
      ${campaign.isMember ? `<div class="lm-campaign-note">Sua ficha nesta campanha: ${esc(campaign.members[0]?.characterId || 'registrada')}</div>` : ''}
      ${campaign.canJoin ? `
        <div class="lm-campaign-join">
          <select data-campaign-character="${esc(campaign.id)}">${charOptions}</select>
          <button data-campaign-join="${esc(campaign.id)}">${campaign.myInviteId ? 'ACEITAR CONVITE' : 'ENTRAR'}</button>
        </div>
      ` : ''}
      ${campaign.canManage ? `
        <div class="lm-campaign-master-grid">
          <div class="lm-campaign-roster">
            <div class="lm-campaign-staff-title">FICHAS NA CAMPANHA</div>
            ${campaign.members.map(member => `
              <div class="lm-campaign-roster-row">
                <span>${esc(member.username)}</span>
                <strong>${esc(member.characterId)}</strong>
                <button data-campaign-remove-member="${esc(campaign.id)}" data-campaign-user="${esc(member.username)}">REMOVER</button>
              </div>
            `).join('') || '<div class="lm-campaign-empty">Nenhum player vinculado.</div>'}
            <div class="lm-campaign-staff-title lm-campaign-subtitle">CONVITES</div>
            ${campaign.invites.map(invite => `
              <div class="lm-campaign-roster-row">
                <span>${esc(invite.username)}</span>
                <strong>${esc(invite.status)}</strong>
                ${invite.status === 'pending' ? `<button data-campaign-cancel-invite="${esc(campaign.id)}" data-campaign-user="${esc(invite.username)}">CANCELAR</button>` : ''}
              </div>
            `).join('') || '<div class="lm-campaign-empty">Nenhum convite enviado.</div>'}
          </div>
          <div class="lm-campaign-player-search">
            <div class="lm-campaign-staff-title">PLAYERS</div>
            <input data-campaign-search value="${esc(vals.query)}" placeholder="buscar player para convite" />
            <div class="lm-campaign-candidates">
              ${vals.users.map(user => `
                <button data-campaign-invite="${esc(campaign.id)}" data-campaign-user="${esc(user.username)}" ${invited.has(user.username) || memberUsers.has(user.username) ? 'disabled' : ''}>
                  <span>${esc(user.username)}</span>
                  <strong>${memberUsers.has(user.username) ? 'DENTRO' : invited.has(user.username) ? 'CONVIDADO' : 'CONVIDAR'}</strong>
                </button>
              `).join('') || '<span class="lm-campaign-empty">Nenhum player encontrado</span>'}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderCampaignsOverlay(state, deps = {}) {
  const vals = campaignsRenderVals(state, deps);
  const panel = vals.open ? `
    <div class="lm-campaign-scrim" data-campaign-close></div>
    <div class="lm-campaign-panel">
      <div class="lm-campaign-panel-head">
        <div><span>SYS.CAMPAIGNS</span><strong>${vals.logged ? esc(vals.username) : 'LOGIN'} // ${vals.campaigns.length} campanhas</strong></div>
        <button data-campaign-close>×</button>
      </div>
      ${!vals.logged ? `<div class="lm-campaign-login-hint">Entre no Limiar OS para ver campanhas e convites.</div>` : `
        <div class="lm-campaign-body">
          <aside class="lm-campaign-side">
            <div class="lm-campaign-section">
              <div class="lm-campaign-title">CAMPANHAS</div>
              <div class="lm-campaign-list">${vals.campaigns.map(campaignListItem).join('') || '<div class="lm-campaign-empty">Nenhuma campanha disponivel.</div>'}</div>
            </div>
            <div class="lm-campaign-section">
              <div class="lm-campaign-title">NOTIFICACOES</div>
              ${vals.notifications.map(notification => `
                <div class="lm-campaign-notice">
                  <div><strong>${esc(notification.title)}</strong><span>${esc(notification.message)}</span></div>
                  ${notification.kind === 'invite' ? `<button data-campaign-join="${esc(notification.campaignId)}">ACEITAR</button>` : ''}
                </div>
              `).join('') || '<div class="lm-campaign-empty">Sem notificacoes pendentes.</div>'}
            </div>
          </aside>
          <main class="lm-campaign-main">
            ${vals.staff ? `
              <div class="lm-campaign-create">
                <div class="lm-campaign-title">${vals.editing ? 'EDITAR CAMPANHA' : 'CRIAR CAMPANHA'}</div>
                <input data-campaign-draft="name" value="${esc(vals.draft.name)}" placeholder="nome da campanha" />
                <textarea data-campaign-draft="description" placeholder="briefing">${esc(vals.draft.description)}</textarea>
                <div class="lm-campaign-row">
                  <select data-campaign-draft="visibility">
                    <option value="public" ${vals.draft.visibility === 'public' ? 'selected' : ''}>PUBLICA</option>
                    <option value="private" ${vals.draft.visibility === 'private' ? 'selected' : ''}>PRIVADA</option>
                  </select>
                  <select data-campaign-draft="status">
                    <option value="active" ${vals.draft.status === 'active' ? 'selected' : ''}>ATIVA</option>
                    <option value="paused" ${vals.draft.status === 'paused' ? 'selected' : ''}>PAUSADA</option>
                    <option value="archived" ${vals.draft.status === 'archived' ? 'selected' : ''}>ARQUIVADA</option>
                  </select>
                </div>
                <div class="lm-campaign-banner-picker">
                  ${vals.bannerPreviewUrl || vals.draft.bannerUrl ? `<div class="lm-campaign-banner-preview" style="background-image:url(${esc(vals.bannerPreviewUrl || vals.draft.bannerUrl)})"></div>` : ''}
                  <input id="lm-campaign-banner-input" type="file" accept="image/*" data-campaign-banner-file style="display:none;" />
                  <button type="button" data-campaign-banner-trigger>${vals.bannerFileName || vals.draft.bannerUrl ? 'TROCAR CAPA' : 'ESCOLHER CAPA'}</button>
                  ${vals.editing && vals.draft.bannerUrl ? `<button type="button" data-campaign-clear-banner>REMOVER CAPA</button>` : ''}
                </div>
                <div class="lm-campaign-form-actions">
                  ${vals.editing ? `<button type="button" data-campaign-cancel-edit>CANCELAR</button>` : ''}
                  <button class="lm-campaign-primary" data-campaign-save>SALVAR</button>
                </div>
              </div>
            ` : ''}
            ${campaignDetail(vals)}
          </main>
        </div>
        <div class="lm-campaign-status">${esc(vals.status)}</div>
      `}
    </div>
  ` : '';

  return panel;
}

function createOverlayController(root, api, initialCampaignId = '') {
  const controller = {
    state: {
      open: false,
      session: null,
      campaigns: [],
      notifications: [],
      characters: [],
      users: [],
      draft: { ...defaultDraft },
      inviteQuery: '',
      characterByCampaign: {},
      selectedCampaignId: initialCampaignId,
      status: '',
    },
    setState(next, options = {}) {
      Object.assign(this.state, next);
      if (options.render !== false) this.render();
    },
    render() {
      const temp = document.createElement('template');
      temp.innerHTML = renderCampaignsOverlay(this.state);
      patchRoot(root, [...temp.content.childNodes]);
    },
  };
  return { controller, handlers: campaignsHandlers(controller, api) };
}

function filterCandidateButtons(root, query) {
  const needle = String(query || '').trim().toLowerCase();
  root.querySelectorAll('.lm-campaign-candidates').forEach(group => {
    let visible = 0;
    group.querySelectorAll('button[data-campaign-user]').forEach(button => {
      const username = String(button.getAttribute('data-campaign-user') || '').toLowerCase();
      const show = !needle || username.includes(needle);
      button.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });
    group.querySelectorAll('[data-campaign-empty-filter]').forEach(node => node.remove());
    if (!visible) {
      group.insertAdjacentHTML('beforeend', '<span class="lm-campaign-empty" data-campaign-empty-filter>Nenhum player encontrado</span>');
    }
  });
}

export function mountCampaignsOverlay({ api, documentRef = globalThis.document, activeCampaignId = '' } = {}) {
  if (!api || !documentRef?.body) return null;
  let root = documentRef.getElementById('limiar-campaign-widget');
  if (!root) {
    root = documentRef.createElement('div');
    root.id = 'limiar-campaign-widget';
    documentRef.body.appendChild(root);
  }
  if (root.dataset.mounted === 'true') return root;
  root.dataset.mounted = 'true';

  const { controller, handlers } = createOverlayController(root, api, activeCampaignId);
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-campaign-close]')) handlers.close();
    if (target.closest('[data-campaign-save]')) handlers.saveCampaign();
    const selectedNode = target.closest('[data-campaign-select]');
    if (selectedNode) handlers.selectCampaign(selectedNode.getAttribute('data-campaign-select'));
    const joinNode = target.closest('[data-campaign-join]');
    if (joinNode) handlers.join(joinNode.getAttribute('data-campaign-join'));
    const mapNode = target.closest('[data-campaign-map]');
    if (mapNode) globalThis.location.assign(`/campaign-map.html?campaign=${encodeURIComponent(mapNode.getAttribute('data-campaign-map'))}`);
    const inviteNode = target.closest('[data-campaign-invite]');
    if (inviteNode) handlers.invite(inviteNode.getAttribute('data-campaign-invite'), inviteNode.getAttribute('data-campaign-user'));
    const editNode = target.closest('[data-campaign-edit]');
    if (editNode) {
      const campaign = (controller.state.campaigns || []).find(c => c.id === editNode.getAttribute('data-campaign-edit'));
      if (campaign) handlers.editCampaign(campaign);
    }
    if (target.closest('[data-campaign-cancel-edit]')) handlers.cancelEdit();
    if (target.closest('[data-campaign-banner-trigger]')) root.querySelector('#lm-campaign-banner-input')?.click();
    if (target.closest('[data-campaign-clear-banner]')) {
      const draft = controller.state.draft || {};
      if (draft.id && globalThis.confirm('Remover a capa desta campanha?')) handlers.clearBanner(draft);
    }
    const cancelInviteNode = target.closest('[data-campaign-cancel-invite]');
    if (cancelInviteNode) handlers.cancelInvite(cancelInviteNode.getAttribute('data-campaign-cancel-invite'), cancelInviteNode.getAttribute('data-campaign-user'));
    const removeMemberNode = target.closest('[data-campaign-remove-member]');
    if (removeMemberNode) {
      const username = removeMemberNode.getAttribute('data-campaign-user');
      if (globalThis.confirm(`Remover ${username} desta campanha?`)) {
        handlers.removeMember(removeMemberNode.getAttribute('data-campaign-remove-member'), username);
      }
    }
  });
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const draftKey = target.getAttribute('data-campaign-draft');
    if (draftKey) handlers.updateDraft(draftKey, target.value);
    if (target.matches('[data-campaign-search]')) {
      handlers.updateInviteQuery(target.value);
      filterCandidateButtons(root, target.value);
    }
    const campaignId = target.getAttribute('data-campaign-character');
    if (campaignId) handlers.updateCharacter(campaignId, target.value);
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches('[data-campaign-banner-file]')) {
      handlers.setBannerFile(target.files && target.files[0]);
    }
  });

  controller.render();
  handlers.refresh();
  setInterval(handlers.refresh, 10000);
  // The overlay is a standalone widget outside the main template/component
  // tree, so SYS.08's "CAMPANHAS" button (a plain template onClick) reaches
  // it through this global instead of prop-drilling handlers across trees.
  globalThis.limiarCampaigns = { toggle: handlers.toggle };
  return root;
}
