// Composition root. Wires infrastructure, framework and the UI component, then
// mounts the app into the page's <x-dc> root.
import './tailwind.css';
import './styles/main.css';
// Nexus is a self-contained game and is only needed after navigation to its
// view. Loading it asynchronously keeps the player-sheet startup chunk lean.
void import('../games/nexus/index.js');
import { createLimiarAPI, LimiarStore } from './infrastructure/store.ts';
import { downloadBytes } from './infrastructure/download.ts';
import { readViewPrefs, writeViewPrefs } from './infrastructure/viewPrefs.ts';
import { mountComponent } from './framework/index.js';
import Component from './ui/Component.js';
import { mountCampaignsOverlay } from './ui/views/campaigns.js';
import { mountOnboardingWizard } from './ui/views/onboarding.js';
import { createApplication } from './application/createApplication.ts';

// Defaults previously declared via the script tag's data-props attribute.
const params = new URLSearchParams(location.search);
const activeCampaignId = params.get('campaign') || '';
const wantsToJoin = params.get('join') === '1';
const api = createLimiarAPI({ campaignId: activeCampaignId });
const app = createApplication({ api });

mountComponent(Component, {
  scanlines: true,
  aura: true,
  api,
  app,
  store: LimiarStore,
  downloadFile: downloadBytes,
  // Local layout preferences reach the UI through the composition root;
  // the component itself never touches storage.
  viewPrefs: { read: () => readViewPrefs(), write: (patch) => writeViewPrefs(patch) },
  activeCampaignId,
});

mountCampaignsOverlay({ api, activeCampaignId });

// First-time players without a character are sent through onboarding. When
// they arrived through a table invite (`join=1`), completion also joins them
// to that campaign.
async function maybeOpenOnboarding() {
  try {
    const session = await api.auth.session();
    const user = (session && session.user) || {};
    if (!session || !session.authenticated) return;
    // GMs and administrators use the full builder; onboarding is the shortcut
    // for newly registered players.
    if (user.role !== 'player') return;

    const characters = await api.characters.list();
    if (Array.isArray(characters) && characters.length > 0) return;

    let campaignName = '';
    if (activeCampaignId) {
      const campaigns = await api.campaigns.list();
      const match = (Array.isArray(campaigns) ? campaigns : []).find((c) => c && c.id === activeCampaignId);
      campaignName = (match && match.name) || '';
    }

    mountOnboardingWizard({
      api,
      // Reuse the full builder's portrait generator so new sheets never start
      // with an empty portrait.
      svgCard: LimiarStore.svgCard,
      campaignId: wantsToJoin ? activeCampaignId : '',
      campaignName: wantsToJoin ? campaignName : '',
      onDone: ({ skipped } = {}) => {
        // Reload so the application derives roster, campaigns, and active
        // character from the newly persisted state.
        if (!skipped) location.assign('/' + (activeCampaignId ? '?campaign=' + encodeURIComponent(activeCampaignId) : ''));
      },
    });
  } catch {
    // Onboarding is optional. If its preflight fails, the application remains
    // usable through the full character builder.
  }
}

maybeOpenOnboarding();
