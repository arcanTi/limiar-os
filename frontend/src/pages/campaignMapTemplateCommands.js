// ARQUITETURA 4B: template persistence commands extracted from campaign-map.js.
// The module receives form/state/dialog access as dependencies, while retaining
// the page's existing reload-after-mutation behavior and permission checks.
export function createTemplateCommands({
  api, campaignId, getTemplates, getSelectedTemplateId, setSelectedTemplateId,
  getTemplateForm, canEditTemplate, reload, status, confirmDelete,
}) {
  async function saveTemplatePlacement(payload) {
    try {
      await api.saveTemplate(campaignId, payload);
      await reload();
      status('template salvo', 'ok');
    } catch (e) {
      status(e.message || 'template indisponivel', 'err');
    }
  }

  async function saveTemplateEdit() {
    const template = getTemplates().find(item => item.id === getSelectedTemplateId());
    if (!template) return status('selecione um template na lista', 'err');
    if (!canEditTemplate(template)) return status('sem permissao para editar este template', 'err');
    const form = getTemplateForm();
    await saveTemplatePlacement({
      id: template.id, kind: form.kind, x: template.x, y: template.y,
      directionDeg: Number(form.directionDeg || 0), distanceUnits: Number(form.distanceUnits || 0),
      angleDeg: Number(form.angleDeg || 53), widthUnits: Number(form.widthUnits || 0),
      color: form.color, label: form.label, hidden: form.hidden, lifecycle: form.lifecycle,
    });
  }

  async function deleteTemplate(id) {
    if (!await confirmDelete()) return;
    try {
      await api.deleteTemplate(campaignId, id);
      if (getSelectedTemplateId() === id) setSelectedTemplateId(null);
      await reload();
      status('template removido', 'ok');
    } catch (e) {
      status(e.message || 'remocao indisponivel', 'err');
    }
  }

  return { saveTemplatePlacement, saveTemplateEdit, deleteTemplate };
}
