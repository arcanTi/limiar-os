// ARQUITETURA 4B: token persistence commands extracted from campaign-map.js.
// Form/canvas reads and page effects are injected, keeping this module free of
// DOM/state globals and making its save/delete/upload paths independently testable.
import { nextTokenName } from '../domain/map/tokenNaming.ts';

export function createTokenCommands({
  api, campaignId, canEdit, getSelectedTokenId, getTokens, getTokenForm,
  getDefaultPosition, setSelectedTokenId, setSelectedTokenIds, reload, status,
  confirmDelete, getUploadFile, clearUploadFile, uploadImage, setTokenImage,
}) {
  async function saveToken() {
    if (!canEdit()) return;
    const old = getTokens().find(token => token.id === getSelectedTokenId());
    const form = getTokenForm();
    const position = old || getDefaultPosition();
    const name = old ? (form.name || 'Token') : nextTokenName(getTokens().map(token => token.name), form.name || 'Token');
    const payload = {
      id: old && old.id, name, kind: (old && old.kind) || 'npc', characterId: old && old.characterId, ownerUsername: old && old.ownerUsername,
      x: position.x, y: position.y, color: form.color, size: Number(form.size || 1), vision: old && old.vision,
      visionDistanceUnits: Number(form.visionDistanceUnits || 0), rotation: Number(form.rotation || 0), elevation: Number(form.elevation || 0),
      move: (old && old.characterId) || form.move === '' ? null : Number(form.move), image: form.image,
      hp: form.hp === '' ? null : Number(form.hp), hpMax: form.hpMax === '' ? null : Number(form.hpMax),
      visible: form.visible, resourceVisibility: form.resourceVisibility,
    };
    const saved = await api.saveToken(campaignId, payload);
    setSelectedTokenId(saved.id);
    setSelectedTokenIds([saved.id]);
    await reload();
    status('token salvo', 'ok');
  }

  async function syncPlayers() {
    const result = await api.syncPlayers(campaignId);
    await reload();
    status(`tokens criados/atualizados: ${result.players}`, 'ok');
  }

  async function deleteToken(id) {
    if (!canEdit() || !await confirmDelete()) return;
    await api.deleteToken(campaignId, id);
    await reload();
    status('token removido', 'ok');
  }

  async function uploadToken() {
    const file = getUploadFile();
    if (!file) return;
    try {
      status(`enviando token: ${file.name}`);
      const asset = await uploadImage(file, 'campaign-token');
      setTokenImage(asset.url);
      await saveToken();
      status('token atualizado', 'ok');
    } catch (e) {
      status(`falha no upload do token: ${e.message}`, 'err');
    } finally {
      clearUploadFile();
    }
  }

  return { saveToken, syncPlayers, deleteToken, uploadToken };
}
