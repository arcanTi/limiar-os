// ARQUITETURA 4B: map-canvas pointer lifecycle. Page-specific reads/actions
// are injected so hover, press, drag and release no longer close over the
// campaign-map composition root.
export function createPointerHandlers(deps) {
  const { canvas, state, pointer, ui, screenToWorld, tokenAt, snap, renderTokens, syncTokenForm, renderTokenHud, updateSelectedMove, drawOnce, canMove, templateAt, canEditTemplate, syncTemplateForm, renderTemplateList, wallAt, toggleDoor, openPromptModal, savePin, toggleTerrainAtWorld, pixelsToMeters, sceneSize, moveTokenGroup, saveTemplatePlacement, saveWall, saveProp, saveLight, saveDrawing, saveFog, buildAttackMeasure, prepareMapAttack, status } = deps;

  function onHover(event) {
    if (pointer.down) return;
    const token = tokenAt(screenToWorld(event.clientX, event.clientY));
    const id = token ? token.id : null;
    if (id === state.hoverTokenId) return;
    state.hoverTokenId = id;
    drawOnce();
  }

  async function onDown(event) {
    canvas.focus();
    const point = screenToWorld(event.clientX, event.clientY), token = tokenAt(point);
    pointer.down = true; pointer.start = { x: event.clientX, y: event.clientY }; pointer.startWorld = point; pointer.world = point; pointer.cam = { ...state.camera }; pointer.attackerTokenId = null; pointer.mode = event.button === 2 || state.tool === 'pan' ? 'pan' : state.tool;
    if (pointer.mode === 'select' && token) {
      const multi = state.canEdit && (event.ctrlKey || event.metaKey);
      if (multi) { state.selectedIds = state.selectedIds.includes(token.id) ? state.selectedIds.filter(id => id !== token.id) : [...state.selectedIds, token.id]; state.selected = state.selectedIds.at(-1) || null; pointer.down = false; renderTokens(); syncTokenForm(); renderTokenHud(); updateSelectedMove(); drawOnce(); return; }
      state.selected = token.id;
      if (!state.selectedIds.includes(token.id) || !state.canEdit) state.selectedIds = [token.id];
      syncTokenForm(); renderTokens(); renderTokenHud(); updateSelectedMove(); pointer.mode = canMove(token) ? 'token' : 'pan'; pointer.id = token.id; pointer.dragOrigin = pointer.mode === 'token' ? { x: token.x, y: token.y } : null; pointer.offset = { x: token.x - point.x, y: token.y - point.y }; pointer.group = state.selectedIds.map(id => { const item = state.tokens.find(current => current.id === id); return item && { id, x: item.x, y: item.y }; }).filter(Boolean);
    } else if (pointer.mode === 'select') {
      const template = templateAt(point);
      if (template && canEditTemplate(template)) { state.selectedTemplateId = template.id; syncTemplateForm(); renderTemplateList(); pointer.mode = 'templateMove'; pointer.templateId = template.id; pointer.offset = { x: template.x - point.x, y: template.y - point.y }; }
      else { state.selected = null; state.selectedIds = []; renderTokens(); renderTokenHud(); updateSelectedMove(); }
    } else if (pointer.mode === 'wall' && state.canEdit) {
      const wall = wallAt(point);
      if (wall && wall.kind === 'door') { pointer.down = false; toggleDoor(wall.id).catch(error => status(error.message, 'err')); return; }
      state.wallDraft = { x1: point.x, y1: point.y, x2: point.x, y2: point.y, kind: ui.wallKind.value };
    } else if (pointer.mode === 'prop' && state.canEdit) state.propDraft = { x: point.x, y: point.y, w: 1, h: 1, material: ui.propMaterial ? ui.propMaterial.value : 'wood', hpMax: ui.propHpMax ? Number(ui.propHpMax.value || 10) : 10 };
    else if (pointer.mode === 'light' && state.canEdit) { const kind = ui.lightKind.value, selected = state.tokens.find(item => item.id === state.selected); state.lightDraft = { kind, x: point.x, y: point.y, tokenId: kind === 'token' && selected ? selected.id : null, brightUnits: Number(ui.lightBright.value || 0), dimUnits: Number(ui.lightDim.value || 0), color: ui.lightColor.value, label: ui.lightLabel.value, enabled: true }; }
    else if (pointer.mode === 'drawing' && state.canEdit) state.drawingDraft = { points: [point], color: ui.drawingColor.value, width: Number(ui.drawingWidth.value || 3), label: ui.drawingLabel.value };
    else if (pointer.mode === 'pin' && state.canEdit) { pointer.down = false; const label = await openPromptModal({ title: 'Nova nota', label: 'Texto da nota', initial: '' }); if (label !== null) savePin({ x: point.x, y: point.y, icon: '•', label, visibility: ui.pinVisibility.value }).catch(error => status(error.message, 'err')); return; }
    else if (pointer.mode === 'fog' && state.canEdit) state.fogDraft = { x: point.x, y: point.y, width: 1, height: 1, label: 'Area oculta' };
    else if (pointer.mode === 'measure') { const attacker = token && canMove(token) ? token : null; pointer.attackerTokenId = attacker && attacker.id || null; state.measure = { from: attacker ? { x: attacker.x, y: attacker.y } : point, to: attacker ? { x: attacker.x, y: attacker.y } : point, attackerTokenId: pointer.attackerTokenId }; }
    else if (pointer.mode === 'terrain' && state.canEdit) { pointer.terrainTouched = new Set(); toggleTerrainAtWorld(point); }
    else if (pointer.mode === 'template') state.templateDraft = { kind: ui.templateKind.value, x: point.x, y: point.y, directionDeg: 0, distanceUnits: 0, angleDeg: Number(ui.templateAngle.value || 53), widthUnits: Number(ui.templateWidth.value || 0), color: ui.templateColor.value, label: ui.templateLabel.value, hidden: ui.templateHidden.checked, lifecycle: ui.templateLifecycle ? ui.templateLifecycle.value : 'manual' };
    drawOnce();
  }

  function onMove(event) {
    if (!pointer.down) return;
    const current = screenToWorld(event.clientX, event.clientY); pointer.world = current;
    if (pointer.mode === 'pan') { state.camera.x = pointer.cam.x + event.clientX - pointer.start.x; state.camera.y = pointer.cam.y + event.clientY - pointer.start.y; }
    else if (pointer.mode === 'token') { const token = state.tokens.find(item => item.id === pointer.id); if (token) { const point = snap({ x: current.x + pointer.offset.x, y: current.y + pointer.offset.y }), dx = point.x - token.x, dy = point.y - token.y; for (const original of pointer.group || [{ id: token.id }]) { const item = state.tokens.find(currentToken => currentToken.id === original.id); if (item) { item.x += dx; item.y += dy; } } } }
    else if (pointer.mode === 'templateMove') { const template = state.templates.find(item => item.id === pointer.templateId); if (template) { const point = snap({ x: current.x + pointer.offset.x, y: current.y + pointer.offset.y }); template.x = point.x; template.y = point.y; } }
    else if (pointer.mode === 'wall' && state.wallDraft) state.wallDraft = { ...state.wallDraft, x2: current.x, y2: current.y };
    else if (pointer.mode === 'prop' && state.propDraft) { const start = pointer.startWorld; state.propDraft = { ...state.propDraft, x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y) }; }
    else if (pointer.mode === 'light' && state.lightDraft) { const units = pixelsToMeters(Math.hypot(current.x - state.lightDraft.x, current.y - state.lightDraft.y), sceneSize().g); state.lightDraft = { ...state.lightDraft, dimUnits: units, brightUnits: Math.min(Number(ui.lightBright.value || 0), units) }; }
    else if (pointer.mode === 'drawing' && state.drawingDraft) { const points = state.drawingDraft.points, last = points[points.length - 1]; if (Math.hypot(current.x - last.x, current.y - last.y) >= 3 / state.camera.zoom) state.drawingDraft = { ...state.drawingDraft, points: [...points, current] }; }
    else if (pointer.mode === 'fog') { const start = pointer.startWorld; state.fogDraft = { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y), label: 'Area oculta' }; }
    else if (pointer.mode === 'measure') state.measure.to = current;
    else if (pointer.mode === 'terrain' && state.canEdit) toggleTerrainAtWorld(current);
    else if (pointer.mode === 'template' && state.templateDraft) { const draft = state.templateDraft, dx = current.x - draft.x, dy = current.y - draft.y, distancePx = Math.hypot(dx, dy); state.templateDraft = { ...draft, directionDeg: distancePx > 2 ? Math.atan2(dy, dx) * 180 / Math.PI : draft.directionDeg, distanceUnits: pixelsToMeters(distancePx, sceneSize().g) }; }
    drawOnce();
  }

  function onUp(event) {
    if (!pointer.down) return;
    const token = state.tokens.find(item => item.id === pointer.id), fog = state.fogDraft, wall = state.wallDraft, prop = state.propDraft, light = state.lightDraft, drawing = state.drawingDraft, mode = pointer.mode;
    pointer.down = false; state.fogDraft = null; state.wallDraft = null; state.propDraft = null; state.lightDraft = null; state.drawingDraft = null;
    if (mode === 'token' && token) { const moved = (pointer.group || [{ id: token.id }]).map(item => state.tokens.find(current => current.id === item.id)).filter(Boolean); moveTokenGroup(moved).catch(error => status(error.message, 'err')); }
    if (mode === 'templateMove') { const template = state.templates.find(item => item.id === pointer.templateId); if (template) saveTemplatePlacement({ id: template.id, kind: template.kind, x: template.x, y: template.y, directionDeg: template.directionDeg, distanceUnits: template.distanceUnits, angleDeg: template.angleDeg, widthUnits: template.widthUnits, color: template.color, label: template.label, hidden: template.hidden, lifecycle: template.lifecycle }); }
    if (mode === 'wall' && wall && Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) >= 4) saveWall(wall).catch(error => status(error.message, 'err'));
    if (mode === 'prop' && prop && prop.w >= 4 && prop.h >= 4) saveProp(prop).catch(error => status(error.message, 'err'));
    if (mode === 'light' && light && Number(light.dimUnits) > 0) saveLight(light).catch(error => status(error.message, 'err'));
    if (mode === 'drawing' && drawing && drawing.points.length > 1) saveDrawing(drawing).catch(error => status(error.message, 'err'));
    if (mode === 'fog' && fog) saveFog(fog);
    if (mode === 'measure') { const attacker = state.tokens.find(item => item.id === pointer.attackerTokenId), target = tokenAt(screenToWorld(event.clientX, event.clientY)), measure = buildAttackMeasure(attacker, target); if (measure) { state.measure = measure; prepareMapAttack(); } else setTimeout(() => { if (state.measure && !state.measure.attack) { state.measure = null; drawOnce(); } }, 1000); }
    if (mode === 'template') { const draft = state.templateDraft; state.templateDraft = null; if (draft && draft.distanceUnits > 0) saveTemplatePlacement(draft); else drawOnce(); }
    pointer.attackerTokenId = null; pointer.dragOrigin = null; drawOnce();
  }

  return { onHover, onDown, onMove, onUp };
}
