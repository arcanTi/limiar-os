// Composition root. Wires infrastructure, framework and the UI component, then
// mounts the app into the page's <x-dc> root.
import { createLimiarAPI, LimiarStore } from './infrastructure/store.ts';
import { mountComponent } from './framework/index.js';
import Component from './ui/Component.js';
import { mountCampaignsOverlay } from './ui/views/campaigns.js';
import { createApplication } from './application/createApplication.ts';

// Defaults previously declared via the script tag's data-props attribute.
const api = createLimiarAPI();
const app = createApplication({ api });

mountComponent(Component, {
  scanlines: true,
  aura: true,
  api,
  app,
  store: LimiarStore,
});

mountCampaignsOverlay({ api });
