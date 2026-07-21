// ARQUITETURA 4B: scene-level persistence commands (save/create/activate the
// active scene, upload+size a background image) extracted from
// campaign-map.js. The command logic only depends on the small ctx surface
// below — reading form values, writing a couple of fields back, and the
// page's reload/status/api plumbing — so it stays decoupled from the page's
// global `ui`/`state` objects and is testable without a document.
function readImageSize(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function createSceneCommands({
  api,
  campaignId,
  getSceneForm,
  setBackground,
  setSize,
  getUploadFile,
  clearUploadFile,
  getBackgroundSrc,
  reload,
  fitView,
  status,
  promptSceneName,
  uploadImage,
}) {
  async function saveScene(activate = false) {
    const form = getSceneForm();
    const payload = {
      id: activate ? form.selectedSceneId : form.currentSceneId,
      name: form.name || 'Cena',
      background: form.background,
      backgroundFit: form.backgroundFit,
      width: Number(form.width || 1600),
      height: Number(form.height || 1000),
      gridSize: Number(form.gridSize || 64),
      fogEnabled: true,
      shadowOpacity: Number(form.shadowOpacity || 0.92),
      darkness: Number(form.darkness || 0),
      explorationMode: form.explorationMode,
      activate,
    };
    await api.saveScene(campaignId, payload);
    await reload();
    status('cenario salvo', 'ok');
  }

  async function newScene() {
    const name = await promptSceneName();
    if (!name) return;
    await api.saveScene(campaignId, { name, activate: true });
    await reload();
    fitView();
  }

  async function activateScene(sceneId) {
    await api.activate(campaignId, sceneId);
    await reload();
    fitView();
  }

  async function uploadMap() {
    const file = getUploadFile();
    if (!file) return;
    try {
      status(`enviando mapa: ${file.name}`);
      const asset = await uploadImage(file, 'campaign-map');
      setBackground(asset.url);
      const size = await readImageSize(asset.url);
      if (size) setSize(size.w, size.h);
      await saveScene();
      status('imagem do mapa enviada e salva', 'ok');
    } catch (e) {
      status(`falha no upload do mapa: ${e.message}`, 'err');
    } finally {
      clearUploadFile();
    }
  }

  async function useImageSize() {
    const src = getBackgroundSrc();
    if (!src) return status('informe uma imagem primeiro', 'err');
    const size = await readImageSize(src);
    if (size) {
      setSize(size.w, size.h);
      await saveScene();
      return;
    }
    status('nao consegui ler o tamanho da imagem', 'err');
  }

  return { saveScene, newScene, activateScene, uploadMap, useImageSize };
}
