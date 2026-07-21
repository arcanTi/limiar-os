// ARQUITETURA 4B: light persistence commands extracted from campaign-map.js.
// Revision/state/render plumbing is injected so the commands stay independent
// from the page DOM and can be verified with a small fake map state.
export function createLightCommands({
  api, campaignId, getExpectedRevision, setSceneRevision, getLights, setLights,
  render, drawOnce, status,
}) {
  async function saveLight(light) {
    const saved = await api.saveLight(campaignId, { ...light, expectedRevision: getExpectedRevision() });
    setSceneRevision(saved.sceneRevision);
    setLights([...getLights().filter(item => item.id !== saved.id), saved]);
    render();
    drawOnce();
    status('luz salva', 'ok');
  }

  async function deleteLight(id) {
    const saved = await api.deleteLight(campaignId, { lightId: id, expectedRevision: getExpectedRevision() });
    setSceneRevision(saved.sceneRevision);
    setLights(getLights().filter(light => light.id !== id));
    render();
    drawOnce();
    status('luz removida', 'ok');
  }

  async function toggleLight(id) {
    const saved = await api.toggleLight(campaignId, { lightId: id, expectedRevision: getExpectedRevision() });
    setSceneRevision(saved.sceneRevision);
    setLights(getLights().map(light => (light.id === id ? saved : light)));
    render();
    drawOnce();
    status(saved.enabled ? 'luz ligada' : 'luz apagada', 'ok');
  }

  return { saveLight, deleteLight, toggleLight };
}
