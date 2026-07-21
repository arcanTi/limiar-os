// ARQUITETURA 4B: data lifecycle for the map page. The composition root
// supplies rendering/image callbacks; this module owns fetch, hydration and
// soft-reload selection preservation without depending on DOM/canvas globals.
export function createMapDataRuntime({ api, campaignId, state, cellKey, ingestPings, renderLoaded, renderSoft }) {
  async function load() {
    const data = await api.get(campaignId);
    state.canEdit = !!data.canEdit;
    state.scene = data.scene;
    state.scenes = data.scenes || [];
    state.tokens = data.tokens || [];
    state.fogAreas = data.fogAreas || [];
    state.reveals = data.reveals || [];
    state.templates = data.templates || [];
    state.walls = data.walls || [];
    state.props = data.props || [];
    state.lights = data.lights || [];
    state.drawings = data.drawings || [];
    state.pins = data.pins || [];
    state.combat = data.combat || { active: false, roundNumber: 0, turnCharacterId: null };
    state.selectedIds = state.selectedIds.filter(id => state.tokens.some(token => token.id === id));
    state.mapVersion = Math.max(state.mapVersion || 0, Number(data.mapVersion) || 0);
    state.difficultCells = new Set(((data.scene && data.scene.difficultTerrain) || []).map(([x, y]) => cellKey(x, y)));
    ingestPings(data.pings);
    await renderLoaded();
  }

  async function loadSoft() {
    try {
      const selected = state.selected, selectedTemplateId = state.selectedTemplateId, selectedPropId = state.selectedPropId;
      await load();
      state.selected = selected && state.tokens.some(token => token.id === selected) ? selected : state.selected;
      state.selectedTemplateId = selectedTemplateId && state.templates.some(template => template.id === selectedTemplateId) ? selectedTemplateId : state.selectedTemplateId;
      state.selectedPropId = selectedPropId && state.props.some(prop => prop.id === selectedPropId) ? selectedPropId : state.selectedPropId;
      renderSoft();
    } catch (_) {
      // Realtime/poll refresh failures are intentionally non-disruptive.
    }
  }

  return { load, loadSoft };
}
