import { createLimiarAPI } from '../infrastructure/api/index.ts';
import { getToken, setToken } from '../infrastructure/session.ts';

"use strict";
const api = createLimiarAPI();

function byId(id) { return document.getElementById(id); }
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const els = {
  stepCredentials: byId('stepCredentials'),
  stepCampaign: byId('stepCampaign'),
  googleButton: byId('googleButton'),
  googleDivider: byId('googleDivider'),
  loginForm: byId('loginForm'),
  registerForm: byId('registerForm'),
  loginUsername: byId('loginUsername'),
  loginPassword: byId('loginPassword'),
  registerUsername: byId('registerUsername'),
  registerPassword: byId('registerPassword'),
  registerConfirm: byId('registerConfirm'),
  toggleMode: byId('toggleMode'),
  credentialsStatus: byId('credentialsStatus'),
  campaignList: byId('campaignList'),
  campaignEmpty: byId('campaignEmpty'),
  continueWithoutCampaign: byId('continueWithoutCampaign'),
  campaignStatus: byId('campaignStatus'),
};

function showStatus(el, text, kind) {
  el.textContent = text || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function setMode(mode) {
  const registering = mode === 'register';
  els.loginForm.hidden = registering;
  els.registerForm.hidden = !registering;
  els.toggleMode.textContent = registering ? 'Ja tenho uma conta' : 'Criar uma conta';
}
setMode('login');
els.toggleMode.onclick = () => setMode(els.registerForm.hidden ? 'register' : 'login');

function goToApp(campaignId) {
  const target = '/Limiar%20OS.dc-2.html' + (campaignId ? ('?campaign=' + encodeURIComponent(campaignId)) : '');
  window.location.assign(target);
}

function eligibleCampaigns(campaigns, user) {
  const isAdmin = user && user.role === 'admin';
  return (Array.isArray(campaigns) ? campaigns : []).filter((entry) => {
    if (!entry || entry.status === 'archived') return false;
    return isAdmin || entry.isMember || entry.created_by === user.username || entry.createdBy === user.username;
  });
}

async function showCampaignPicker(user) {
  els.stepCredentials.hidden = true;
  els.stepCampaign.hidden = false;
  showStatus(els.campaignStatus, 'Carregando campanhas...', '');
  try {
    const campaigns = await api.campaigns.list();
    const eligible = eligibleCampaigns(campaigns, user || {});
    els.campaignEmpty.hidden = eligible.length > 0;
    els.campaignList.innerHTML = eligible.map((c) => {
      const isGm = (user && user.role === 'admin') || c.created_by === (user && user.username) || c.createdBy === (user && user.username);
      return `<button type="button" class="campaign-card" data-campaign-id="${esc(c.id)}"><strong>${esc(c.name)}</strong><span>${isGm ? 'GM' : 'Jogador'}</span></button>`;
    }).join('');
    showStatus(els.campaignStatus, '', '');
  } catch (e) {
    showStatus(els.campaignStatus, e.message || 'Nao foi possivel carregar campanhas', 'err');
  }
}

els.campaignList.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-campaign-id]');
  if (!btn) return;
  goToApp(btn.getAttribute('data-campaign-id'));
});
els.continueWithoutCampaign.onclick = () => goToApp('');

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showStatus(els.credentialsStatus, 'Entrando...', '');
  try {
    const session = await api.auth.login(els.loginUsername.value.trim(), els.loginPassword.value);
    if (!session || !session.token) throw new Error('Credenciais invalidas');
    await showCampaignPicker(session.user);
  } catch (_e) {
    showStatus(els.credentialsStatus, 'Credenciais invalidas', 'err');
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
  showStatus(els.credentialsStatus, 'Criando conta...', '');
  try {
    const session = await api.auth.register(els.registerUsername.value.trim(), els.registerPassword.value);
    if (!session || !session.token) throw new Error('Nao foi possivel criar a conta');
    await showCampaignPicker(session.user);
  } catch (e) {
    showStatus(els.credentialsStatus, e.message || 'Nao foi possivel criar a conta', 'err');
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
  try {
    const config = await api.request('/meta/config');
    const clientId = config && config.googleClientId;
    if (!clientId) return;
    const google = await waitForGoogleSdk();
    if (!google) return;
    google.accounts.id.initialize({ client_id: clientId, callback: handleGoogleCredential });
    google.accounts.id.renderButton(els.googleButton, { theme: 'outline', size: 'large', width: 280 });
    els.googleDivider.hidden = false;
  } catch (_e) {
    // Google login is optional — silently fall back to password login.
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
