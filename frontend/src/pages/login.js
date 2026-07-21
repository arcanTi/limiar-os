import { createLimiarAPI } from '../infrastructure/api/index.ts';
import { getToken, setToken } from '../infrastructure/session.ts';

"use strict";
const api = createLimiarAPI();

function byId(id) { return document.getElementById(id); }
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const els = {
  stageArt: byId('stageArt'),
  googleFallback: byId('googleFallback'),
  stepCredentials: byId('stepCredentials'),
  stepCampaign: byId('stepCampaign'),
  googleButton: byId('googleButton'),
  googleDivider: byId('googleDivider'),
  formSwap: byId('formSwap'),
  loginForm: byId('loginForm'),
  registerForm: byId('registerForm'),
  loginUsername: byId('loginUsername'),
  loginPassword: byId('loginPassword'),
  loginRemember: byId('loginRemember'),
  forgotPasswordLink: byId('forgotPasswordLink'),
  resetRequestForm: byId('resetRequestForm'),
  resetUsername: byId('resetUsername'),
  resetCancel: byId('resetCancel'),
  registerUsername: byId('registerUsername'),
  registerPassword: byId('registerPassword'),
  registerConfirm: byId('registerConfirm'),
  toggleMode: byId('toggleMode'),
  credentialsStatus: byId('credentialsStatus'),
  campaignList: byId('campaignList'),
  campaignEmpty: byId('campaignEmpty'),
  joinableSection: byId('joinableSection'),
  joinableList: byId('joinableList'),
  continueWithoutCampaign: byId('continueWithoutCampaign'),
  campaignStatus: byId('campaignStatus'),
  newCampaignToggle: byId('newCampaignToggle'),
  newCampaignModal: byId('newCampaignModal'),
  newCampaignBackdrop: byId('newCampaignBackdrop'),
  newCampaignClose: byId('newCampaignClose'),
  newCampaignForm: byId('newCampaignForm'),
  newCampaignName: byId('newCampaignName'),
  newCampaignSystem: byId('newCampaignSystem'),
  newCampaignVisibility: byId('newCampaignVisibility'),
  newCampaignBanner: byId('newCampaignBanner'),
  bannerPreview: byId('bannerPreview'),
  newCampaignCancel: byId('newCampaignCancel'),
  newCampaignStatus: byId('newCampaignStatus'),
  systemAvailability: byId('systemAvailability'),
  newCampaignSubmit: byId('newCampaignSubmit'),
};

// ---------- random hero illustration (inline SVG, flat friendly style) ----------
const ART_TABLE = `
<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mesa de jogo com dado de vinte lados">
  <ellipse cx="260" cy="212" rx="238" ry="168" fill="#e9f1fe"/>
  <ellipse cx="260" cy="330" rx="180" ry="14" fill="#dbe7f6"/>
  <rect x="70" y="286" width="380" height="26" rx="13" fill="#c9dcf5"/>
  <rect x="96" y="312" width="16" height="34" rx="6" fill="#b6cdea"/>
  <rect x="408" y="312" width="16" height="34" rx="6" fill="#b6cdea"/>
  <g class="art-float">
    <path d="M260 96 330 136v80l-70 40-70-40v-80z" fill="#4a8cf7"/>
    <path d="M260 96v40l60 24 10-24zM190 136l10 24 60-24v-40zM260 296l-56-32 14-26 42 18 42-18 14 26z" fill="#3576e0" opacity=".55"/>
    <path d="M218 238h84l-42-78z" fill="#fff" opacity=".92"/>
    <text x="260" y="230" text-anchor="middle" font-family="Nunito,sans-serif" font-size="30" font-weight="800" fill="#3576e0">20</text>
  </g>
  <g transform="rotate(-12 150 258)"><g class="art-float-slow">
    <rect x="118" y="228" width="64" height="88" rx="8" fill="#fff" stroke="#dbe7f6" stroke-width="2"/>
    <rect x="128" y="240" width="44" height="30" rx="5" fill="#ffd166"/>
    <rect x="128" y="280" width="44" height="6" rx="3" fill="#e3e9f2"/>
    <rect x="128" y="292" width="30" height="6" rx="3" fill="#e3e9f2"/>
  </g></g>
  <g transform="rotate(9 384 262)">
    <rect x="352" y="230" width="64" height="88" rx="8" fill="#fff" stroke="#dbe7f6" stroke-width="2"/>
    <rect x="362" y="242" width="44" height="30" rx="5" fill="#ff8f6b"/>
    <rect x="362" y="282" width="44" height="6" rx="3" fill="#e3e9f2"/>
    <rect x="362" y="294" width="30" height="6" rx="3" fill="#e3e9f2"/>
  </g>
  <g>
    <path d="M448 250c0 20-8 34-8 34h-32s-8-14-8-34a24 24 0 0 1 48 0z" fill="#58c99b"/>
    <path d="M424 250v34" stroke="#3ba97c" stroke-width="3" stroke-linecap="round"/>
    <rect x="408" y="282" width="32" height="22" rx="5" fill="#f4b26a"/>
  </g>
  <g fill="#ffd166">
    <path class="art-float" d="m120 130 4.5 10.5L135 145l-10.5 4.5L120 160l-4.5-10.5L105 145l10.5-4.5z"/>
    <path class="art-float-slow" d="m396 108 3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
    <path class="art-float-slow" d="m344 350 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
  </g>
</svg>`;

const ART_MAP = `
<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa de aventura com bussola">
  <ellipse cx="260" cy="208" rx="238" ry="168" fill="#e6f7f0"/>
  <ellipse cx="260" cy="330" rx="180" ry="14" fill="#d5eee2"/>
  <g transform="rotate(-4 260 220)">
    <rect x="110" y="128" width="300" height="196" rx="12" fill="#fff8ec" stroke="#eadfc6" stroke-width="3"/>
    <rect x="98" y="120" width="14" height="212" rx="7" fill="#e8b04b"/>
    <rect x="408" y="120" width="14" height="212" rx="7" fill="#e8b04b"/>
    <path d="M150 290c30-24 12-58 44-70s58 10 82-16 44-14 82-36" fill="none" stroke="#ff8f6b" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path d="m352 158 16 16m0-16-16 16" stroke="#e8493a" stroke-width="5" stroke-linecap="round"/>
    <path d="m196 180 14-24 14 24zm34 0 11-19 11 19z" fill="#58c99b"/>
    <path d="M170 250a8 8 0 0 1 16 0c0 6-8 14-8 14s-8-8-8-14z" fill="#4a8cf7"/>
    <circle cx="178" cy="250" r="3" fill="#fff"/>
  </g>
  <g transform="translate(388 88)"><g class="art-float">
    <circle r="34" fill="#4a8cf7"/>
    <circle r="26" fill="#fff"/>
    <g class="art-spin"><path d="M0-19 6 0 0 19-6 0z" fill="#e8493a"/><path d="M0-19 6 0h-12z" fill="#ff8f6b"/></g>
    <circle r="4" fill="#2b3445"/>
  </g></g>
  <g class="art-float-slow">
    <rect x="96" y="70" width="42" height="42" rx="9" fill="#6ea3f9"/>
    <circle cx="108" cy="82" r="3.5" fill="#fff"/><circle cx="126" cy="82" r="3.5" fill="#fff"/>
    <circle cx="108" cy="100" r="3.5" fill="#fff"/><circle cx="126" cy="100" r="3.5" fill="#fff"/>
    <circle cx="117" cy="91" r="3.5" fill="#fff"/>
  </g>
  <g fill="#ffd166">
    <path class="art-float-slow" d="m78 180 4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/>
    <path class="art-float" d="m448 210 3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
  </g>
</svg>`;

const ART_BOOK = `
<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Grimorio aberto com vela">
  <ellipse cx="260" cy="208" rx="238" ry="168" fill="#efeafd"/>
  <ellipse cx="260" cy="330" rx="180" ry="14" fill="#e2daf8"/>
  <g>
    <path d="M120 300c0-10 62-26 140-26s140 16 140 26v14H120z" fill="#b28cf7"/>
    <path d="M260 176c-34-18-96-20-124-10-6 2-10 7-10 13v96c0 8 8 13 16 11 26-7 84-5 118 12z" fill="#fff" stroke="#e2daf8" stroke-width="3"/>
    <path d="M260 176c34-18 96-20 124-10 6 2 10 7 10 13v96c0 8-8 13-16 11-26-7-84-5-118 12z" fill="#faf7ff" stroke="#e2daf8" stroke-width="3"/>
    <path d="M260 176v122" stroke="#d5c8f5" stroke-width="4"/>
    <g stroke="#d5c8f5" stroke-width="5" stroke-linecap="round">
      <path d="M154 196h74M154 216h74M154 236h50"/>
      <path d="M292 196h74M292 216h74M292 236h50"/>
    </g>
    <path d="m322 258 5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#b28cf7"/>
  </g>
  <g transform="translate(408 208)">
    <rect x="-18" y="0" width="36" height="70" rx="8" fill="#ff8f6b"/>
    <rect x="-24" y="62" width="48" height="14" rx="7" fill="#f4b26a"/>
    <path d="M0-2c8 10 6 18 0 22-6-4-8-12 0-22z" fill="#ffd166" class="art-flicker"/>
    <circle cx="0" cy="14" r="4" fill="#fff" opacity=".8"/>
  </g>
  <g transform="translate(110 224)"><g class="art-float-slow">
    <circle cy="34" r="26" fill="#58c99b"/>
    <path d="M-26 34a26 26 0 0 0 52 0z" fill="#3ba97c"/>
    <rect x="-8" y="-8" width="16" height="22" rx="4" fill="#8ad9ba"/>
    <rect x="-12" y="-14" width="24" height="10" rx="4" fill="#f4b26a"/>
    <circle cx="-6" cy="28" r="4" fill="#d9f4e8"/><circle cx="8" cy="42" r="3" fill="#d9f4e8"/>
  </g></g>
  <g fill="#ffd166">
    <path class="art-float" d="m150 110 4.5 10.5L165 125l-10.5 4.5L150 140l-4.5-10.5L135 125l10.5-4.5z"/>
    <path class="art-float-slow" d="m386 96 3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
    <path class="art-float" d="m440 150 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
  </g>
</svg>`;

const ART_SCENES = [ART_TABLE, ART_MAP, ART_BOOK];

function showSvgScene() {
  if (!els.stageArt) return;
  els.stageArt.innerHTML = ART_SCENES[Math.floor(Math.random() * ART_SCENES.length)];
}

// Photo mode: the server lists whatever lives in assets/login/ — one image is
// drawn at random per load; when the folder is empty we keep the SVG scenes.
async function initHeroArt() {
  if (!els.stageArt) return;
  try {
    const data = await api.request('/meta/login-art');
    const images = data && Array.isArray(data.images) ? data.images : [];
    if (!images.length) { showSvgScene(); return; }
    const src = images[Math.floor(Math.random() * images.length)];
    const img = new Image();
    img.alt = '';
    img.onload = () => {
      els.stageArt.parentElement.classList.add('has-photo');
      els.stageArt.replaceChildren(img);
      requestAnimationFrame(() => img.classList.add('is-loaded'));
    };
    img.onerror = showSvgScene;
    img.src = src;
  } catch (_e) {
    showSvgScene();
  }
}
initHeroArt();

// ---------- system badges ----------
const SYSTEM_META = {
  'cyberpunk-red': { label: 'Cyberpunk RED', implementation: 'yes', cls: 'campaign-logo-cpr', mark: '<i>CYBER<br>PUNK</i><b>RED</b>' },
  'dnd5e': { label: 'D&D 5e', implementation: 'no', cls: 'campaign-logo-dnd', mark: '<i>&amp;</i><b>5E</b>' },
  'cthulhu': { label: 'Call of Cthulhu', implementation: 'no', cls: 'campaign-logo-coc', mark: '<i>CoC</i><b>7E</b>' },
  'other': {
    label: 'Outro sistema', implementation: 'partially', cls: 'campaign-logo-other',
    mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7L12 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.3 15.6h9.4L12 8.7l-4.7 6.9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  },
};
function systemMeta(system) {
  return SYSTEM_META[String(system || '')] || SYSTEM_META.other;
}

// ---------- step transitions ----------
function switchStep(fromEl, toEl) {
  if (!fromEl || fromEl.hidden) { toEl.hidden = false; return; }
  fromEl.classList.add('step-leaving');
  window.setTimeout(() => {
    fromEl.hidden = true;
    fromEl.classList.remove('step-leaving');
    toEl.hidden = false;
  }, 200);
}

function showStatus(el, text, kind) {
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function setButtonLoading(form, loading) {
  const btn = form.querySelector('.btn-primary');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
  btn.querySelector('.btn-spinner').hidden = !loading;
}

function setMode(mode) {
  const registering = mode === 'register';
  const resetting = mode === 'reset';
  els.loginForm.hidden = registering || resetting;
  els.registerForm.hidden = !registering;
  els.resetRequestForm.hidden = !resetting;
  els.toggleMode.hidden = resetting;
  els.toggleMode.textContent = registering ? 'Ja tenho uma conta' : 'Criar uma conta';
  els.googleDivider.hidden = resetting;
  els.googleFallback.closest('.google-row').hidden = resetting;
  showStatus(els.credentialsStatus, '', '');
}
setMode('login');
els.toggleMode.onclick = () => setMode(els.registerForm.hidden ? 'register' : 'login');
els.forgotPasswordLink.onclick = () => setMode('reset');
els.resetCancel.onclick = () => setMode('login');

function goToApp(campaignId) {
  const target = '/Limiar%20OS.dc-2.html' + (campaignId ? ('?campaign=' + encodeURIComponent(campaignId)) : '');
  window.location.assign(target);
}

function memberCampaigns(campaigns, user) {
  const isAdmin = user && user.role === 'admin';
  return (Array.isArray(campaigns) ? campaigns : []).filter((entry) => {
    if (!entry || entry.status === 'archived') return false;
    return isAdmin || entry.isMember || entry.created_by === user.username || entry.createdBy === user.username;
  });
}

// campaigns the backend already flags as joinable (public-open tables, or a
// pending invite) that aren't in memberCampaigns yet - these used to be
// silently dropped, leaving an invited/newly-registered player with nothing
// to click but "continuar sem campanha"
function joinableCampaigns(campaigns, user) {
  const isAdmin = user && user.role === 'admin';
  return (Array.isArray(campaigns) ? campaigns : []).filter((entry) => {
    if (!entry || entry.status === 'archived' || isAdmin) return false;
    if (entry.isMember || entry.created_by === user.username || entry.createdBy === user.username) return false;
    return Boolean(entry.canJoin || entry.myInviteId);
  });
}

let currentUser = null;

function renderCampaignCard(c, user, opts) {
  const joinable = Boolean(opts && opts.joinable);
  const isGm = (user && user.role === 'admin') || c.created_by === (user && user.username) || c.createdBy === (user && user.username);
  const roster = Array.isArray(c.roster) ? c.roster : [];
  const count = Number.isFinite(c.participantCount) ? c.participantCount : roster.length;
  const meta = systemMeta(c.system);
  const visibility = c.visibility === 'private' ? 'Privada' : 'Pública';
  const paused = c.status === 'paused' ? ' · Pausada' : '';
  const bannerUrl = c.bannerUrl || c.banner_url || '';
  const topStyle = bannerUrl ? ` style="background-image:url(${esc(bannerUrl)})"` : '';
  const tag = joinable
    ? (c.myInviteId ? '<span class="campaign-card-tag invite">Convite</span>' : '<span class="campaign-card-tag player">Aberta</span>')
    : `<span class="campaign-card-tag${isGm ? '' : ' player'}">${isGm ? 'Mestre' : 'Jogador'}</span>`;
  const cta = joinable
    ? (c.myInviteId ? 'Aceitar convite' : 'Ver campanha')
    : 'Entrar';
  const implementationLabel = { yes: 'Yes', no: 'No', partially: 'Partially' }[meta.implementation] || 'No';
  const readinessTag = `<span class="system-tag implementation-${meta.implementation}">Implementado · ${implementationLabel}</span>`;
  return `
    <button type="button" class="campaign-card${joinable ? ' joinable' : ''}" data-campaign-id="${esc(c.id)}" data-campaign-mode="${joinable ? 'joinable' : 'member'}">
      <span class="campaign-card-top${bannerUrl ? ' has-banner' : ''}"${topStyle}>
        <span class="campaign-logo ${meta.cls}">${meta.mark}</span>
        <span class="campaign-card-body">
          <strong>${esc(c.name)}</strong>
          <em>${esc(meta.label)} · ${visibility}${paused}</em>
        </span>
        <span class="campaign-card-count"><b>${count}</b><small>jogador${count === 1 ? '' : 'es'}</small></span>
      </span>
      <span class="campaign-card-foot">
        <span>${tag} ${readinessTag}</span>
        <span class="campaign-card-cta">${cta} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </span>
    </button>
  `;
}

async function loadCampaignList(user) {
  showStatus(els.campaignStatus, 'Carregando campanhas...', '');
  try {
    const campaigns = await api.campaigns.list();
    const mine = memberCampaigns(campaigns, user || {});
    const joinable = joinableCampaigns(campaigns, user || {});
    els.campaignEmpty.hidden = mine.length > 0;
    els.campaignEmpty.textContent = joinable.length > 0
      ? 'Você ainda não entrou em nenhuma mesa, mas há campanhas esperando abaixo.'
      : 'Você ainda não participa de nenhuma campanha. Crie uma ou aguarde um convite.';
    els.campaignList.innerHTML = mine.map((c) => renderCampaignCard(c, user)).join('');
    els.joinableSection.hidden = joinable.length === 0;
    els.joinableList.innerHTML = joinable.map((c) => renderCampaignCard(c, user, { joinable: true })).join('');
    showStatus(els.campaignStatus, '', '');
  } catch (e) {
    showStatus(els.campaignStatus, e.message || 'Não foi possível carregar campanhas', 'err');
  }
}

async function showCampaignPicker(user) {
  currentUser = user || null;
  switchStep(els.stepCredentials, els.stepCampaign);
  const isStaff = currentUser && (currentUser.role === 'admin' || currentUser.role === 'gm');
  els.newCampaignToggle.hidden = !isStaff;
  await loadCampaignList(currentUser);
}

els.campaignList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-campaign-id]');
  if (!btn) return;
  goToApp(btn.getAttribute('data-campaign-id'));
});
// joinable cards (invite pending or public-open, not yet a member) route into
// the app's own campaigns view instead of the map/HQ directly - accepting an
// invite needs a character pick, which only that view can do
els.joinableList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-campaign-id]');
  if (!btn) return;
  goToApp('');
});
els.continueWithoutCampaign.onclick = () => goToApp('');

function updateSystemAvailability() {
  const meta = systemMeta(els.newCampaignSystem.value);
  const implementation = meta.implementation || 'no';
  const label = { yes: 'Yes', no: 'No', partially: 'Partially' }[implementation];
  els.systemAvailability.textContent = `Implementado · ${label}`;
  els.systemAvailability.className = `system-availability implementation-${implementation}`;
  els.newCampaignSubmit.disabled = implementation !== 'yes';
}
function openCampaignModal() {
  els.newCampaignModal.hidden = false;
  document.body.classList.add('modal-open');
  showStatus(els.newCampaignStatus, '', '');
  updateSystemAvailability();
  els.newCampaignName.focus();
}
function closeCampaignModal() {
  els.newCampaignModal.hidden = true;
  document.body.classList.remove('modal-open');
  els.newCampaignForm.reset();
  resetBannerPicker();
  updateSystemAvailability();
  els.newCampaignToggle.focus();
}
els.newCampaignToggle.onclick = openCampaignModal;
els.newCampaignBackdrop.onclick = closeCampaignModal;
els.newCampaignClose.onclick = closeCampaignModal;
els.newCampaignSystem.addEventListener('change', updateSystemAvailability);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.newCampaignModal.hidden) closeCampaignModal();
});
function resetBannerPicker() {
  els.newCampaignBanner.value = '';
  els.bannerPreview.hidden = true;
  els.bannerPreview.style.backgroundImage = '';
}
els.newCampaignBanner.addEventListener('change', () => {
  const file = els.newCampaignBanner.files && els.newCampaignBanner.files[0];
  if (!file) { resetBannerPicker(); return; }
  const url = URL.createObjectURL(file);
  els.bannerPreview.style.backgroundImage = `url(${url})`;
  els.bannerPreview.hidden = false;
});
els.newCampaignCancel.onclick = () => {
  closeCampaignModal();
};
els.newCampaignForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = els.newCampaignName.value.trim();
  if (!name) return;
  const meta = systemMeta(els.newCampaignSystem.value);
  if (meta.implementation !== 'yes') {
    showStatus(els.newCampaignStatus, 'Sistema ainda nao implementado', 'err');
    return;
  }
  setButtonLoading(els.newCampaignForm, true);
  const basePayload = {
    name,
    system: els.newCampaignSystem.value,
    visibility: els.newCampaignVisibility.value,
  };
  try {
    const campaign = await api.campaigns.create(basePayload);
    const bannerFile = els.newCampaignBanner.files && els.newCampaignBanner.files[0];
    if (campaign && campaign.id && bannerFile) {
      try {
        // the campaign doesn't exist until it's created, so the banner is
        // uploaded (and the campaign re-saved with the resulting URL) right after
        const asset = await api.uploads.image(bannerFile, { scope: 'campaign-banner', ownerId: campaign.id });
        if (asset && asset.url) await api.campaigns.create({ ...basePayload, id: campaign.id, bannerUrl: asset.url });
      } catch (_e) {
        // banner is a nice-to-have; a failed upload shouldn't block campaign creation
      }
    }
    els.newCampaignModal.hidden = true;
    document.body.classList.remove('modal-open');
    els.newCampaignForm.reset();
    resetBannerPicker();
    await loadCampaignList(currentUser);
    if (campaign && campaign.id) goToApp(campaign.id);
  } catch (e) {
    showStatus(els.newCampaignStatus, e.message || 'Não foi possível criar a campanha', 'err');
  } finally {
    setButtonLoading(els.newCampaignForm, false);
  }
});

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showStatus(els.credentialsStatus, '', '');
  setButtonLoading(els.loginForm, true);
  try {
    const session = await api.auth.login(els.loginUsername.value.trim(), els.loginPassword.value, els.loginRemember.checked);
    if (!session || !session.token) throw new Error('Credenciais inválidas');
    await showCampaignPicker(session.user);
  } catch (_e) {
    showStatus(els.credentialsStatus, 'Credenciais inválidas', 'err');
  } finally {
    setButtonLoading(els.loginForm, false);
  }
});

els.resetRequestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = els.resetUsername.value.trim();
  if (!username) return;
  setButtonLoading(els.resetRequestForm, true);
  try {
    await api.auth.requestPasswordReset(username);
  } catch (_e) {
    // still show the generic message below - the request is fire-and-forget
    // from the user's point of view either way (see backend: no enumeration).
  } finally {
    setButtonLoading(els.resetRequestForm, false);
    els.resetRequestForm.reset();
    showStatus(els.credentialsStatus, 'Se o usuário existir, um mestre ou administrador vai liberar uma nova senha em breve.', '');
    window.setTimeout(() => setMode('login'), 2600);
  }
});

els.registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (els.registerPassword.value.length < 8) {
    showStatus(els.credentialsStatus, 'Senha deve ter ao menos 8 caracteres', 'err');
    return;
  }
  if (els.registerPassword.value !== els.registerConfirm.value) {
    showStatus(els.credentialsStatus, 'Senhas nao conferem', 'err');
    return;
  }
  showStatus(els.credentialsStatus, '', '');
  setButtonLoading(els.registerForm, true);
  try {
    const session = await api.auth.register(els.registerUsername.value.trim(), els.registerPassword.value);
    if (!session || !session.token) throw new Error('Não foi possível criar a conta');
    await showCampaignPicker(session.user);
  } catch (e) {
    showStatus(els.credentialsStatus, e.message || 'Não foi possível criar a conta', 'err');
  } finally {
    setButtonLoading(els.registerForm, false);
  }
});

async function handleGoogleCredential(response) {
  showStatus(els.credentialsStatus, 'Entrando com Google...', '');
  try {
    const session = await api.request('/auth/google', { method: 'POST', body: JSON.stringify({ idToken: response.credential }) });
    if (!session || !session.token) throw new Error('Falha no login com Google');
    setToken(session.token);
    await showCampaignPicker(session.user);
  } catch (e) {
    showStatus(els.credentialsStatus, e.message || 'Falha no login com Google', 'err');
  }
}

function waitForGoogleSdk(retries = 20) {
  return new Promise((resolve) => {
    const check = (n) => {
      if (window.google && window.google.accounts && window.google.accounts.id) return resolve(window.google);
      if (n <= 0) return resolve(null);
      setTimeout(() => check(n - 1), 150);
    };
    check(retries);
  });
}

async function initGoogleButton() {
  // The fallback button is always visible; when the server has a client id
  // and the SDK loads, the official Google button replaces it.
  els.googleFallback.onclick = () => {
    showStatus(els.credentialsStatus, 'Login com Google indisponivel: servidor sem GOOGLE_CLIENT_ID configurado.', 'err');
  };
  try {
    const config = await api.request('/meta/config');
    const clientId = config && config.googleClientId;
    if (!clientId) return;
    const google = await waitForGoogleSdk();
    if (!google) return;
    google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
    google.accounts.id.renderButton(els.googleButton, { type: 'standard', shape: 'pill', size: 'large', width: 330, locale: 'pt-BR' });
    els.googleFallback.hidden = true;
  } catch (_e) {
    // Google login stays on the fallback button when config/SDK are missing.
  }
}

async function boot() {
  if (getToken()) {
    try {
      const data = await api.auth.session();
      if (data && data.authenticated && data.user) {
        await showCampaignPicker(data.user);
        return;
      }
    } catch (_e) {
      // fall through to the credentials step
    }
  }
  initGoogleButton();
}
boot();
