// ARQUITETURA 4B: prop persistence commands (G2 destructible cover) extracted
// from campaign-map.js — save/delete/damage a prop, always folding the
// returned scene revision back so the next mutation's optimistic-concurrency
// check stays correct. DOM reads (material/hpMax form overrides, the
// confirm/prompt dialogs) and rendering stay injected so this module has no
// `ui`/`ctx` dependency.
export function createPropCommands({
  api,
  campaignId,
  getMaterialOverride,
  getHpMaxOverride,
  getExpectedRevision,
  setSceneRevision,
  getProps,
  setProps,
  getSelectedPropId,
  setSelectedPropId,
  render,
  drawOnce,
  status,
  confirmDelete,
  promptDamage,
}) {
  async function saveProp(prop) {
    try {
      const saved = await api.saveProp(campaignId, {
        ...prop,
        material: getMaterialOverride(prop.material),
        hpMax: getHpMaxOverride(prop.hpMax),
        expectedRevision: getExpectedRevision(),
      });
      setSceneRevision(saved.sceneRevision);
      setProps([...getProps().filter(p => p.id !== saved.id), saved]);
      render();
      drawOnce();
      status('prop salvo', 'ok');
    } catch (e) {
      status(e.message || 'prop indisponivel', 'err');
    }
  }

  async function deleteProp(id) {
    if (!await confirmDelete()) return;
    try {
      const saved = await api.deleteProp(campaignId, { propId: id, expectedRevision: getExpectedRevision() });
      setSceneRevision(saved.sceneRevision);
      setProps(getProps().filter(p => p.id !== id));
      if (getSelectedPropId() === id) setSelectedPropId(null);
      render();
      drawOnce();
      status('prop removido', 'ok');
    } catch (e) {
      status(e.message || 'remocao indisponivel', 'err');
    }
  }

  async function damageProp(id) {
    const raw = await promptDamage();
    if (raw === null) return;
    const amount = Number(raw);
    if (!(amount > 0)) return status('dano invalido', 'err');
    try {
      const saved = await api.damageProp(campaignId, { propId: id, amount, expectedRevision: getExpectedRevision() });
      setSceneRevision(saved.sceneRevision);
      setProps(getProps().map(p => (p.id === id ? saved : p)));
      render();
      drawOnce();
      status(saved.destroyed ? 'prop destruido' : 'dano aplicado', 'ok');
    } catch (e) {
      status(e.message || 'dano indisponivel', 'err');
    }
  }

  return { saveProp, deleteProp, damageProp };
}
