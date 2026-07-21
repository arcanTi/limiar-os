import { sessionUsername } from '../domain/campaigns/index.ts';
import { effectiveMoveStat } from '../domain/character/derivedStatsEngine.ts';
import { cellKey, cellsToMeters, GRID_METERS_PER_CELL, metersToCells, moveRangeCells, moveRangePixels, pixelsToMeters, segmentMovementCost } from '../domain/movement/index.ts';
import { cprAmmoBadge, cprDismissBadge, cprOnResolveTemplate, cprTokenBadges, cprWoundVisual } from '../domain/map/systemAdapter.ts';
import { measureTokenDistance } from '../domain/map/measurementEngine.ts';
import { visionContainsPoint, visionPolygon } from '../domain/map/visionEngine.ts';
import { createMapAttackIntent, saveMapAttackIntent } from '../domain/map/mapAttackIntent.ts';
import { createMapFocusIntent, saveMapFocusIntent } from '../domain/map/mapFocusIntent.ts';
import { createMapAoeIntent, saveMapAoeIntent } from '../domain/map/mapAoeIntent.ts';
import { templateCells } from '../domain/map/templateEngine.ts';
import { cameraPanForAnchor, clampZoom, lerpZoom } from '../domain/map/viewport.ts';
import { adaptiveGridStyle } from '../domain/map/gridRender.ts';
import { createLimiarAPI } from '../infrastructure/api/index.ts';
import { getToken } from '../infrastructure/session.ts';
import { normalizeCombatState as combatNormalizeState } from '../domain/combat/index.ts';
import { rollD10 } from '../domain/combat/combatDice.ts';
import { createMapSync } from './campaignMapSync.js';
import { createSceneCommands } from './campaignMapSceneCommands.js';
import { createPropCommands } from './campaignMapPropCommands.js';
import { createTokenCommands } from './campaignMapTokenCommands.js';
import { createLightCommands } from './campaignMapLightCommands.js';
import { createTemplateCommands } from './campaignMapTemplateCommands.js';
import { createCanvasRenderer } from './campaignMapCanvasRenderer.js';
import { createPointerHandlers } from './campaignMapPointerHandlers.js';
import { createMapKeyboardHandler } from './campaignMapKeyboardHandlers.js';
import { createMapDataRuntime } from './campaignMapDataRuntime.js';
import * as selectors from './campaignMapSelectors.js';

"use strict";
const limiarApi = createLimiarAPI();
const params = new URLSearchParams(location.search);
const campaignId = params.get("campaign") || "";
const state = { session:null, canEdit:false, scene:null, scenes:[], tokens:[], fogAreas:[], reveals:[], templates:[], walls:[], props:[], lights:[], drawings:[], pins:[], mapVersion:0, selected:null, selectedIds:[], hoverTokenId:null, selectedTemplateId:null, selectedPropId:null, templateDraft:null, wallDraft:null, propDraft:null, lightDraft:null, drawingDraft:null, tool:"select", showGrid:true, snap:false, runMode:false, camera:{x:0,y:0,zoom:1}, mapImage:null, tokenImages:new Map(), measure:null, fogDraft:null, difficultCells:new Set(), characterMoveCache:new Map(), selectedMoveCells:null, pingAnims:new Map(), combat:{active:false,roundNumber:0,turnCharacterId:null} };
const PING_ANIM_MS = 3000, PING_KEEP_MS = 20000;
const canvas = byId("canvas"), ctx = canvas.getContext("2d");
// Fog/shadow layer (README-MAPA B1): destination-out must punch holes in a
// dedicated offscreen buffer, never in the main canvas — punching it there
// erases whatever was already painted (map image, tokens) instead of just
// the black overlay, leaving a literal hole where vision should be clear.
const shadowCanvas = document.createElement("canvas"), shadowCtx = shadowCanvas.getContext("2d");
const ui = {
  sceneName:byId("sceneName"), campaignName:byId("campaignName"), hud:byId("hud"), status:byId("statusText"), sceneSelect:byId("sceneSelect"), sceneInput:byId("sceneInput"), bgInput:byId("bgInput"), fitSelect:byId("fitSelect"), gridInput:byId("gridInput"), widthInput:byId("widthInput"), heightInput:byId("heightInput"), darknessInput:byId("darknessInput"), explorationModeSelect:byId("explorationModeSelect"), uploadFile:byId("uploadFile"), tokenList:byId("tokenList"), fogList:byId("fogList"), tokenName:byId("tokenName"), tokenColor:byId("tokenColor"), tokenImage:byId("tokenImage"), tokenSize:byId("tokenSize"), tokenVision:byId("tokenVision"), tokenRotation:byId("tokenRotation"), tokenElevation:byId("tokenElevation"), tokenMove:byId("tokenMove"), tokenHp:byId("tokenHp"), tokenHpMax:byId("tokenHpMax"), tokenVisible:byId("tokenVisible"), tokenResourceVisibility:byId("tokenResourceVisibility"), tokenUploadFile:byId("tokenUploadFile"), gridToggle:byId("gridToggle"), snapToggle:byId("snapToggle"), runToggle:byId("runToggle"), templateList:byId("templateList"), templateKind:byId("templateKind"), templateColor:byId("templateColor"), templateLabel:byId("templateLabel"), templateDistance:byId("templateDistance"), templateDirection:byId("templateDirection"), templateAngle:byId("templateAngle"), templateWidth:byId("templateWidth"), templateHidden:byId("templateHidden"), templateLifecycle:byId("templateLifecycle"), wallKind:byId("wallKind"), wallList:byId("wallList"), propMaterial:byId("propMaterial"), propHpMax:byId("propHpMax"), propList:byId("propList"), lightKind:byId("lightKind"), lightBright:byId("lightBright"), lightDim:byId("lightDim"), lightColor:byId("lightColor"), lightLabel:byId("lightLabel"), lightList:byId("lightList"), drawingColor:byId("drawingColor"), drawingWidth:byId("drawingWidth"), drawingLabel:byId("drawingLabel"), drawingList:byId("drawingList"), pinVisibility:byId("pinVisibility"), pinList:byId("pinList"), tokenMenu:byId("tokenMenu"), emptySceneMsg:byId("emptySceneMsg"), tokenHud:byId("tokenHud"), modalBackdrop:byId("modalBackdrop"), modalBox:byId("modalBox")
};
const pointer = { down:false, mode:"", id:null, start:{x:0,y:0}, startWorld:{x:0,y:0}, world:{x:0,y:0}, cam:{x:0,y:0}, offset:{x:0,y:0}, terrainTouched:null, attackerTokenId:null, dragOrigin:null };
let terrainQueue = Promise.resolve();
let zoomAnim = null, zoomRafPending = false;
let modalResolve = null;
const mapSync = createMapSync({
  waitForUpdate: limiarApi.campaignMaps.waitForUpdate
    ? (since, signal) => limiarApi.campaignMaps.waitForUpdate(campaignId, since, signal)
    : null,
  getVersion: () => state.mapVersion,
  setVersion: v => { state.mapVersion = v; },
  onChanged: () => loadSoft(),
});
const sceneCommands = createSceneCommands({
  api: limiarApi.campaignMaps,
  campaignId,
  getSceneForm: () => ({
    selectedSceneId: ui.sceneSelect.value,
    currentSceneId: state.scene && state.scene.id,
    name: ui.sceneInput.value,
    background: ui.bgInput.value,
    backgroundFit: ui.fitSelect.value,
    width: ui.widthInput.value,
    height: ui.heightInput.value,
    gridSize: ui.gridInput.value,
    shadowOpacity: state.scene && state.scene.shadowOpacity,
    darkness: ui.darknessInput.value,
    explorationMode: ui.explorationModeSelect.value,
  }),
  setBackground: url => { ui.bgInput.value = url; },
  setSize: (w, h) => { ui.widthInput.value = w; ui.heightInput.value = h; },
  getUploadFile: () => ui.uploadFile.files[0],
  clearUploadFile: () => { ui.uploadFile.value = ""; },
  getBackgroundSrc: () => ui.bgInput.value,
  reload: () => load(),
  fitView: () => fitView(),
  status: (text, kind) => status(text, kind),
  promptSceneName: () => openPromptModal({ title: "Nova cena", label: "Nome da cena", initial: "Nova cena" }),
  uploadImage: (file, scope) => uploadImage(file, scope),
});
const propCommands = createPropCommands({
  api: limiarApi.campaignMaps,
  campaignId,
  getMaterialOverride: current => (ui.propMaterial ? ui.propMaterial.value : current),
  getHpMaxOverride: current => (ui.propHpMax ? Number(ui.propHpMax.value || 10) : current),
  getExpectedRevision: () => Number((state.scene && state.scene.revision) || 0),
  setSceneRevision: revision => { state.scene = { ...state.scene, revision }; },
  getProps: () => state.props,
  setProps: props => { state.props = props; },
  getSelectedPropId: () => state.selectedPropId,
  setSelectedPropId: id => { state.selectedPropId = id; },
  render: () => renderPropList(),
  drawOnce: () => drawOnce(),
  status: (text, kind) => status(text, kind),
  confirmDelete: () => openConfirmModal({ title: "Remover prop", message: "Remover este prop da cena?", danger: true, confirmLabel: "remover" }),
  promptDamage: () => openPromptModal({ title: "Dano ao prop", label: "Dano a aplicar (sem ablacao)", initial: "5" }),
});
const tokenCommands = createTokenCommands({
  api: limiarApi.campaignMaps,
  campaignId,
  canEdit: () => state.canEdit,
  getSelectedTokenId: () => state.selected,
  getTokens: () => state.tokens,
  getTokenForm: () => ({ name: ui.tokenName.value, color: ui.tokenColor.value, image: ui.tokenImage.value, size: ui.tokenSize.value, visionDistanceUnits: ui.tokenVision.value, rotation: ui.tokenRotation.value, elevation: ui.tokenElevation.value, move: ui.tokenMove.value, hp: ui.tokenHp.value, hpMax: ui.tokenHpMax.value, visible: ui.tokenVisible.checked, resourceVisibility: ui.tokenResourceVisibility.value }),
  getDefaultPosition: () => { const r = canvas.getBoundingClientRect(); return snap(screenToWorld(r.left + r.width / 2, r.top + r.height / 2)); },
  setSelectedTokenId: id => { state.selected = id; },
  setSelectedTokenIds: ids => { state.selectedIds = ids; },
  reload: () => load(),
  status: (text, kind) => status(text, kind),
  confirmDelete: () => openConfirmModal({ title: "Remover token", message: "Remover este token da cena?", danger: true, confirmLabel: "remover" }),
  getUploadFile: () => ui.tokenUploadFile.files[0],
  clearUploadFile: () => { ui.tokenUploadFile.value = ""; },
  uploadImage: (file, scope) => uploadImage(file, scope),
  setTokenImage: url => { ui.tokenImage.value = url; },
});
const lightCommands = createLightCommands({
  api: limiarApi.campaignMaps,
  campaignId,
  getExpectedRevision: () => Number((state.scene && state.scene.revision) || 0),
  setSceneRevision: revision => { state.scene = { ...state.scene, revision }; },
  getLights: () => state.lights,
  setLights: lights => { state.lights = lights; },
  render: () => renderLightList(),
  drawOnce: () => drawOnce(),
  status: (text, kind) => status(text, kind),
});
const templateCommands = createTemplateCommands({
  api: limiarApi.campaignMaps,
  campaignId,
  getTemplates: () => state.templates,
  getSelectedTemplateId: () => state.selectedTemplateId,
  setSelectedTemplateId: id => { state.selectedTemplateId = id; },
  getTemplateForm: () => ({ kind: ui.templateKind.value, color: ui.templateColor.value, label: ui.templateLabel.value, distanceUnits: ui.templateDistance.value, directionDeg: ui.templateDirection.value, angleDeg: ui.templateAngle.value, widthUnits: ui.templateWidth.value, hidden: ui.templateHidden.checked, lifecycle: ui.templateLifecycle ? ui.templateLifecycle.value : "manual" }),
  canEditTemplate: template => canEditTemplate(template),
  reload: () => load(),
  status: (text, kind) => status(text, kind),
  confirmDelete: () => openConfirmModal({ title: "Remover template", message: "Remover este template da cena?", danger: true, confirmLabel: "remover" }),
});
const canvasRenderer = createCanvasRenderer({
  canvas,
  ctx,
  getCamera: () => state.camera,
  sceneSize: () => sceneSize(),
  drawLayers: {
    base: ({ w, h }) => { ctx.fillStyle = "#050706"; ctx.fillRect(0, 0, w, h); if (state.mapImage) { const b = bgPlacement(); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.drawImage(state.mapImage, b.x, b.y, b.w, b.h); ctx.restore(); } else { ctx.fillStyle = "#10170f"; ctx.fillRect(0, 0, w, h); } },
    grid: ({ w, h, g }) => { if (state.showGrid) drawGrid(w, h, g); },
    terrain: ({ g }) => { drawDifficultTerrain(g); drawDrawings(); },
    frame: ({ w, h }) => { ctx.strokeStyle = "rgba(214,170,78,.65)"; ctx.lineWidth = 3 / state.camera.zoom; ctx.strokeRect(0, 0, w, h); },
    tokens: () => state.tokens.filter(t => state.canEdit || t.visible !== false).forEach(drawToken),
    movement: ({ g }) => { drawMoveRange(g); drawDragGhost(g); },
    visibility: ({ w, h }) => { drawShadow(w, h); drawLights(); drawManualFog(); },
    objects: ({ g }) => { drawWalls(); drawProps(g); drawPins(); },
    overlays: ({ g }) => { drawMeasure(g); drawTemplates(g); drawPings(); },
  },
  afterFrame: ({ g }) => { positionTokenHud(); const moveCells = state.selectedMoveCells, moveEff = moveCells != null ? moveRangeCells(moveCells, { run: state.runMode }) : null; const moveLabel = moveEff != null ? ` | MOVE ${moveCells}q${state.runMode ? " (RUN x2)" : ""} = ${cellsToMeters(moveEff).toFixed(0)}m` : ""; const focusToken = state.tokens.find(x => x.id === (state.hoverTokenId || state.selected)); const attack = state.measure && state.measure.attackReady ? ` <button class="btn primary" id="mapAttackBtn">USAR NO ATAQUE</button>` : ""; const combatLabel = state.combat && state.combat.active ? ` | COMBATE ROUND ${state.combat.roundNumber}` : ""; ui.hud.innerHTML = `Zoom ${Math.round(state.camera.zoom * 100)}% | Grid ${g}px (${GRID_METERS_PER_CELL}m) | ${esc(state.tool)}${state.selectedIds.length > 1 ? ` | ${state.selectedIds.length} selecionados` : ""}${combatLabel}${moveLabel}${esc(conditionSummary(focusToken))}${attack}`; const attackBtn = byId("mapAttackBtn"); if (attackBtn) attackBtn.onclick = runAction(useMapAttack); },
});
const pointerHandlers = createPointerHandlers({
  canvas, state, pointer, ui, screenToWorld, tokenAt, snap, renderTokens, syncTokenForm, renderTokenHud, updateSelectedMove, drawOnce, canMove, templateAt, canEditTemplate, syncTemplateForm, renderTemplateList, wallAt, toggleDoor, openPromptModal, savePin, toggleTerrainAtWorld, pixelsToMeters, sceneSize, moveTokenGroup, saveTemplatePlacement, saveWall, saveProp, saveLight, saveDrawing, saveFog, buildAttackMeasure, prepareMapAttack, status,
});
const onMapKeyDown = createMapKeyboardHandler({ state, closeTokenMenu, renderTokens, renderTokenHud, updateSelectedMove, drawOnce, setTool, sceneSize, snap, canMove, moveTokenGroup, status });
const dataRuntime = createMapDataRuntime({
  api: limiarApi.campaignMaps,
  campaignId,
  state,
  cellKey,
  ingestPings,
  renderLoaded: async () => { applyScene(); renderScenes(); renderTokens(); renderFog(); renderTemplateList(); renderWallList(); renderPropList(); renderLightList(); renderDrawingList(); renderPinList(); renderTokenHud(); loadMapImage(); updateSelectedMove(); drawOnce(); },
  renderSoft: () => { renderTokens(); renderTemplateList(); renderPropList(); renderTokenHud(); },
});
function byId(id){return document.getElementById(id)}
function esc(v){return String(v == null ? "" : v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function status(text,kind=""){ui.status.textContent=text;ui.status.className="status "+kind}
// Own dialogs (README-MAPA A8): replace window.prompt()/confirm() with a
// panel styled like the rest of the map chrome, instead of the browser's
// native dialog. One shared backdrop/box, resolved like a promise-based
// prompt; closeModal() is the single exit path (OK, cancel, backdrop click,
// Escape) so there's only one place that resolves/clears modalResolve.
function closeModal(result){const resolve=modalResolve;modalResolve=null;ui.modalBackdrop.classList.add("hidden");ui.modalBox.innerHTML="";if(resolve)resolve(result)}
function openPromptModal({title,label,initial=""}){return new Promise(resolve=>{modalResolve=resolve;ui.modalBox.innerHTML=`<h3>${esc(title)}</h3><label>${esc(label)}<input id="modalInput"></label><div class="row modal-actions"><button class="btn" id="modalCancel">cancelar</button><button class="btn primary" id="modalOk">ok</button></div>`;ui.modalBackdrop.classList.remove("hidden");const input=byId("modalInput");input.value=initial;input.focus();input.select();byId("modalCancel").onclick=()=>closeModal(null);byId("modalOk").onclick=()=>closeModal(input.value);input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();closeModal(input.value)}if(e.key==="Escape")closeModal(null)}})}
function openConfirmModal({title,message,danger=false,confirmLabel="confirmar"}){return new Promise(resolve=>{modalResolve=resolve;ui.modalBox.innerHTML=`<h3>${esc(title)}</h3><p class="hint">${esc(message)}</p><div class="row modal-actions"><button class="btn" id="modalCancel">cancelar</button><button class="btn ${danger?"danger":"primary"}" id="modalOk">${esc(confirmLabel)}</button></div>`;ui.modalBackdrop.classList.remove("hidden");byId("modalCancel").onclick=()=>closeModal(false);byId("modalOk").onclick=()=>closeModal(true);byId("modalOk").focus()})}
function runAction(fn){return async()=>{try{await fn()}catch(e){status(e.message||"acao indisponivel","err")}}}
const canMove = (...a) => selectors.canMove(state, ...a);
const canEditTemplate = (...a) => selectors.canEditTemplate(state, ...a);
const sceneSize = (...a) => selectors.sceneSize(state, ...a);
const tokenRadius = (...a) => selectors.tokenRadius(state, ...a);
const visionRadiusPx = (...a) => selectors.visionRadiusPx(state, ...a);
const lightRadiusPx = (...a) => selectors.lightRadiusPx(state, ...a);
const lightPosition = (...a) => selectors.lightPosition(state, ...a);
const tokenAt = (...a) => selectors.tokenAt(state, ...a);
const templateAt = (...a) => selectors.templateAt(state, ...a);
const propAt = (...a) => selectors.propAt(state, ...a);
const wallAt = (...a) => selectors.wallAt(state, ...a);
const losWalls = (...a) => selectors.losWalls(state, ...a);
const liveVisionTokens = (...a) => selectors.liveVisionTokens(state, ...a);
const tokenVisibleNow = (...a) => selectors.tokenVisibleNow(state, ...a);
const buildAttackMeasure = (...a) => selectors.buildAttackMeasure(state, ...a);
async function init(){bind();setupF8Keyboard();if(ui.lightList)ui.lightList.onclick=e=>{const toggle=e.target.closest("[data-toggle-light]"),rm=e.target.closest("[data-remove-light]");if(toggle)runAction(()=>toggleLight(toggle.dataset.toggleLight))();else if(rm)runAction(()=>deleteLight(rm.dataset.removeLight))()};resize();if(!campaignId)return status("campanha ausente na URL","err");if(!getToken())return status("login necessario","err");state.session = await limiarApi.auth.session().then(d=>d.user||d);await load();fitView();mapSync.startRealtime();mapSync.scheduleFallbackPoll()}
function load(){return dataRuntime.load()}
function loadSoft(){return dataRuntime.loadSoft()}
function applyScene(){const s=state.scene||{};ui.sceneName.textContent=s.name||"Cena";ui.campaignName.textContent=campaignId;ui.sceneInput.value=s.name||"";ui.bgInput.value=s.background||"";ui.fitSelect.value=s.backgroundFit||"contain";ui.gridInput.value=s.gridSize||64;ui.widthInput.value=s.width||1600;ui.heightInput.value=s.height||1000;ui.darknessInput.value=s.darkness||0;ui.explorationModeSelect.value=s.explorationMode||"shared";document.querySelectorAll(".master-only").forEach(el=>el.hidden=!state.canEdit);ui.emptySceneMsg.classList.toggle("hidden",!!s.background);ui.emptySceneMsg.innerHTML=state.canEdit?"<strong>Cena sem imagem</strong>Defina uma imagem de fundo na aba “cenas” para preparar a mesa.":"<strong>Mesa nao preparada</strong>O GM ainda nao definiu a cena desta campanha."}
function renderScenes(){ui.sceneSelect.innerHTML=state.scenes.map(s=>`<option value="${esc(s.id)}" ${s.active?"selected":""}>${s.active?"* ":""}${esc(s.name)}</option>`).join("")}
function loadMapImage(){state.mapImage=null;const src=state.scene&&state.scene.background;if(!src){drawOnce();return}const img=new Image();img.onload=()=>{state.mapImage=img;drawOnce()};img.onerror=()=>status("imagem do mapa nao carregou","err");img.src=src}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(320,Math.floor(r.width*dpr));canvas.height=Math.max(240,Math.floor(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);drawOnce()}
// Defensive guard (README-MAPA B2): the very first automatic fitView() call
// in init() can in principle race the canvas's own layout (rect not settled
// yet), landing on the degenerate .05 zoom floor. Retry on the next frame
// rather than commit to a fit computed from a bogus rect.
function fitView(){const r=canvas.getBoundingClientRect();if(r.width<50||r.height<50){requestAnimationFrame(fitView);return}const {w,h}=sceneSize();const z=Math.max(.05,Math.min(4,Math.min(r.width/w,r.height/h)*.94));state.camera.zoom=z;state.camera.x=(r.width-w*z)/2;state.camera.y=(r.height-h*z)/2;drawOnce()}
function screenToWorld(x,y){const r=canvas.getBoundingClientRect();return {x:(x-r.left-state.camera.x)/state.camera.zoom,y:(y-r.top-state.camera.y)/state.camera.zoom}}
function worldToScreen(x,y){return {x:x*state.camera.zoom+state.camera.x,y:y*state.camera.zoom+state.camera.y}}
function snap(p){if(!state.snap)return p;const g=sceneSize().g;return {x:Math.round(p.x/g)*g,y:Math.round(p.y/g)*g}}
function bgPlacement(){const {w,h}=sceneSize(),img=state.mapImage,mode=(state.scene&&state.scene.backgroundFit)||"contain";if(!img||mode==="stretch")return{x:0,y:0,w,h};if(mode==="native")return{x:(w-img.naturalWidth)/2,y:(h-img.naturalHeight)/2,w:img.naturalWidth,h:img.naturalHeight};const ratio=mode==="cover"?Math.max(w/img.naturalWidth,h/img.naturalHeight):Math.min(w/img.naturalWidth,h/img.naturalHeight);return{x:(w-img.naturalWidth*ratio)/2,y:(h-img.naturalHeight*ratio)/2,w:img.naturalWidth*ratio,h:img.naturalHeight*ratio}}
function tokenImage(src){if(!src)return null;let img=state.tokenImages.get(src);if(img)return img.ready?img:null;img=new Image();img.ready=false;img.onload=()=>{img.ready=true;drawOnce()};img.onerror=()=>state.tokenImages.delete(src);img.src=src;state.tokenImages.set(src,img);return null}
function drawOnce(){canvasRenderer.schedule()}
function draw(){canvasRenderer.draw()}
function drawDifficultTerrain(g){if(!state.difficultCells.size)return;ctx.save();ctx.fillStyle="rgba(192,99,91,.24)";ctx.strokeStyle="rgba(192,99,91,.55)";ctx.lineWidth=1/state.camera.zoom;state.difficultCells.forEach(key=>{const [gx,gy]=key.split(",").map(Number);ctx.fillRect(gx*g,gy*g,g,g);ctx.strokeRect(gx*g,gy*g,g,g)});ctx.restore()}
// Overlay informativo de alcance de movimento (CPR RAW: MOVE x 2m; Run dobra
// a distancia). So desenha, nao bloqueia o drag do token — o GM arbitra.
function drawMoveRange(g){if(state.selectedMoveCells==null)return;const t=state.tokens.find(x=>x.id===state.selected);if(!t)return;const radius=moveRangePixels(state.selectedMoveCells,g,{run:state.runMode});if(!radius)return;ctx.save();ctx.strokeStyle="rgba(63,224,208,.5)";ctx.setLineDash([6/state.camera.zoom,5/state.camera.zoom]);ctx.lineWidth=2/state.camera.zoom;ctx.beginPath();ctx.arc(t.x,t.y,radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore()}
// Adaptive contrast (README-MAPA A4): flat rgba(...,.14) was unreadable over
// a dark map at low zoom; adaptiveGridStyle (domain/map/gridRender) lifts
// alpha/line-width for darker scenes and zoomed-out views.
function drawGrid(w,h,g){const style=adaptiveGridStyle(state.camera.zoom,Number(state.scene&&state.scene.darkness)||0);ctx.strokeStyle=`rgba(${style.colorRgb},${style.alpha})`;ctx.lineWidth=style.lineWidthPx/state.camera.zoom;ctx.beginPath();for(let x=0;x<=w;x+=g){ctx.moveTo(x,0);ctx.lineTo(x,h)}for(let y=0;y<=h;y+=g){ctx.moveTo(0,y);ctx.lineTo(w,y)}ctx.stroke()}
// Rich drag (README-MAPA A3): while a token is being dragged, show a ghost
// ring at the origin, a line to the live position, the snapped destination
// cell, and the movement cost so far (reusing segmentMovementCost — same
// math the R-tool measure already uses). Advisory only: cost is shown, the
// drag is never blocked, even past the token's MOVE budget.
function drawDragGhost(g){if(!(pointer.down&&pointer.mode==="token"&&pointer.dragOrigin))return;const t=state.tokens.find(x=>x.id===pointer.id);if(!t)return;const origin=pointer.dragOrigin,r=tokenRadius(t);ctx.save();ctx.setLineDash([5/state.camera.zoom,4/state.camera.zoom]);ctx.strokeStyle="rgba(240,234,216,.55)";ctx.lineWidth=2/state.camera.zoom;ctx.beginPath();ctx.arc(origin.x,origin.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(t.x,t.y);ctx.stroke();const cell=g,gx=Math.floor(t.x/cell)*cell,gy=Math.floor(t.y/cell)*cell;ctx.strokeStyle="#3fe0d0";ctx.lineWidth=2/state.camera.zoom;ctx.strokeRect(gx,gy,cell,cell);const cost=segmentMovementCost(origin,{x:t.x,y:t.y},cell,state.difficultCells),budget=state.selectedMoveCells,over=budget!=null&&cost.costCells>budget;ctx.fillStyle=over?"#c0635b":"#3fe0d0";ctx.font=`${13/state.camera.zoom}px monospace`;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(`${cost.costCells.toFixed(0)}q // ${cost.costMeters.toFixed(0)}m${over?" (excede MOVE)":""}`,(origin.x+t.x)/2,Math.min(origin.y,t.y)-8/state.camera.zoom);ctx.restore()}
function drawToken(t){const r=tokenRadius(t),sel=state.selectedIds.includes(t.id)||t.id===state.selected,img=tokenImage(t.image);ctx.save();ctx.translate(t.x,t.y);ctx.fillStyle=t.color||"#d6aa4e";ctx.shadowColor="rgba(0,0,0,.58)";ctx.shadowBlur=16/state.camera.zoom;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.shadowColor="transparent";if(img){ctx.save();ctx.beginPath();ctx.arc(0,0,r*.92,0,Math.PI*2);ctx.clip();const side=Math.min(img.naturalWidth,img.naturalHeight),sx=(img.naturalWidth-side)/2,sy=(img.naturalHeight-side)/2;ctx.drawImage(img,sx,sy,side,side,-r*.92,-r*.92,r*1.84,r*1.84);ctx.restore()}else{ctx.fillStyle="rgba(0,0,0,.48)";ctx.beginPath();ctx.arc(0,0,r*.72,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`${Math.max(12,r*.45)}px monospace`;ctx.fillText((t.name||"?").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase(),0,0)}ctx.lineWidth=(sel?5:2)/state.camera.zoom;ctx.strokeStyle=sel?varColor("--teal"):"rgba(5,7,6,.94)";ctx.stroke();if(isCombatTurn(t)){ctx.save();ctx.shadowColor="rgba(214,170,78,.85)";ctx.shadowBlur=14/state.camera.zoom;ctx.strokeStyle="#d6aa4e";ctx.lineWidth=3/state.camera.zoom;ctx.beginPath();ctx.arc(0,0,r+6/state.camera.zoom,0,Math.PI*2);ctx.stroke();ctx.restore()}ctx.save();ctx.rotate((Number(t.rotation)||0)*Math.PI/180);ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(r*.8,0);ctx.lineTo(r*.35,-r*.19);ctx.lineTo(r*.35,r*.19);ctx.closePath();ctx.fill();ctx.restore();drawName(t,r);if(Number(t.elevation)) {ctx.fillStyle="#3fe0d0";ctx.font=`${10/state.camera.zoom}px monospace`;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(`${Number(t.elevation)>0?"+":""}${Number(t.elevation)}m`,0,-r-5/state.camera.zoom)}drawHp(t,r);drawConditionBadges(t,r);drawAmmoBadge(t,r);if(state.canEdit&&visionRadiusPx(t)>0){ctx.strokeStyle="rgba(63,224,208,.16)";ctx.lineWidth=1/state.camera.zoom;ctx.beginPath();ctx.arc(0,0,visionRadiusPx(t),0,Math.PI*2);ctx.stroke()}ctx.restore()}
function drawName(t,r){const label=t.name||"Token";ctx.font=`${12/state.camera.zoom}px monospace`;const mw=ctx.measureText(label).width+12/state.camera.zoom,mh=22/state.camera.zoom;ctx.fillStyle="rgba(0,0,0,.76)";roundRect(-mw/2,r+6/state.camera.zoom,mw,mh,5/state.camera.zoom);ctx.fill();ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="top";ctx.fillText(label,0,r+11/state.camera.zoom)}
function drawHp(t,r){const visual=cprWoundVisual(t);if(!visual)return;const pct=Math.max(0,Math.min(1,Number(t.hp)/Number(t.hpMax)));ctx.strokeStyle="rgba(0,0,0,.72)";ctx.lineWidth=6/state.camera.zoom;ctx.beginPath();ctx.arc(0,0,r+7/state.camera.zoom,-Math.PI/2,Math.PI*1.5);ctx.stroke();ctx.strokeStyle=visual.color;ctx.beginPath();ctx.arc(0,0,r+7/state.camera.zoom,-Math.PI/2,-Math.PI/2+Math.PI*2*pct);ctx.stroke()}
// Badges (F2b): untreated critical injuries + active status effects, drawn
// as small dots on the token's lower arc. Server already gated what arrived
// (F2a/F2b resourceVisibility contract) — this only renders what's there.
function drawConditionBadges(t,r){const badges=cprTokenBadges(t);if(!badges.length)return;const shown=badges.slice(0,5),extra=badges.length-shown.length,dot=Math.max(4,r*.22),cy=r*.7,startX=-(shown.length-1)*dot*1.15;ctx.save();shown.forEach((b,i)=>{const x=startX+i*dot*2.3;ctx.beginPath();ctx.arc(x,cy,dot,0,Math.PI*2);ctx.fillStyle=b.kind==="injury"?"#c0635b":"#d6aa4e";ctx.fill();ctx.lineWidth=1.5/state.camera.zoom;ctx.strokeStyle="rgba(5,7,6,.9)";ctx.stroke()});if(extra>0){ctx.fillStyle="#fff";ctx.font=`${Math.max(9,dot*1.1)}px monospace`;ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(`+${extra}`,startX+shown.length*dot*2.3-dot*.6,cy)}ctx.restore()}
function conditionSummary(t){if(!t)return "";const badges=cprTokenBadges(t);return badges.length?` | ${t.name||"Token"}: ${badges.map(b=>b.label).join(", ")}`:""}
// Ammo HUD (Fase MUNICAO-NO-MAPA / G4): small pill at the token's lower-right,
// numbers already resolved server-side (map_state cross-references the
// linked character's primary ammo-tracked weapon) — this only draws what
// cprAmmoBadge formats. Red fill is advisory only (needs_reload never blocks
// the attack, same rule as every other combat gate in this app).
function drawAmmoBadge(t,r){const badge=cprAmmoBadge(t);if(!badge)return;const font=Math.max(9,r*.32),pad=3/state.camera.zoom;ctx.save();ctx.font=`${font}px monospace`;const mw=ctx.measureText(badge.label).width+pad*2,mh=font+pad*1.4,x=r*.6,y=r*.6;ctx.fillStyle=badge.needsReload?"rgba(192,99,91,.92)":"rgba(5,7,6,.82)";roundRect(x,y,mw,mh,3/state.camera.zoom);ctx.fill();ctx.strokeStyle=badge.needsReload?"#c0635b":"#d6aa4e";ctx.lineWidth=1/state.camera.zoom;ctx.stroke();ctx.fillStyle="#fff";ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText(badge.label,x+pad,y+mh/2);ctx.restore()}
// Token HUD (Onda 1 A1): anchored under the selected token, HP inline +
// clickable badges as the fast primary path — the side-panel form remains
// for full/advanced editing. renderTokenHud() rebuilds content (called on
// selection/data changes); positionTokenHud() is the cheap per-frame
// follow-up so the HUD tracks pan/zoom/drag without a DOM rebuild every tick.
function renderTokenHud(){
  if(!ui.tokenHud)return;
  const t=state.tokens.find(x=>x.id===state.selected);
  if(!t){ui.tokenHud.classList.add("hidden");ui.tokenHud.innerHTML="";return}
  const editable=canMove(t),badges=cprTokenBadges(t);
  const hpRow=t.hp!=null?`<div class="hud-hp"><button data-hud-hp="-1" ${editable?"":"disabled"}>-</button><input id="hudHpInput" type="number" value="${t.hp}" ${editable?"":"disabled"}><span>/ ${t.hpMax!=null?esc(t.hpMax):"?"}</span><button data-hud-hp="1" ${editable?"":"disabled"}>+</button></div>`:"";
  const badgeRow=badges.length?`<div class="hud-badges">${badges.map(b=>`<button class="hud-badge ${b.kind}" data-hud-badge="${esc(b.id)}" data-hud-badge-kind="${b.kind}" title="${esc(b.detail||(b.kind==="injury"?"tratar":"remover"))}" ${editable&&t.characterId?"":"disabled"}>${esc(b.label)}</button>`).join("")}</div>`:"";
  const actions=t.characterId&&editable?`<div class="hud-actions"><span class="tag" id="hudSheetBtn">ficha</span><span class="tag" id="hudCockpitBtn">cockpit</span></div>`:"";
  ui.tokenHud.innerHTML=`<div class="hud-name">${esc(t.name||"Token")}</div>${hpRow}${badgeRow}${actions}`;
  ui.tokenHud.classList.remove("hidden");
  positionTokenHud();
  const hpInput=byId("hudHpInput");
  if(hpInput)hpInput.onchange=()=>patchToken(t,{hp:Number(hpInput.value)||0});
  ui.tokenHud.querySelectorAll("[data-hud-hp]").forEach(b=>b.onclick=()=>patchToken(t,{hp:Math.max(0,Number(t.hp||0)+Number(b.dataset.hudHp))}));
  ui.tokenHud.querySelectorAll("[data-hud-badge]").forEach(b=>b.onclick=()=>dismissBadge(t,{kind:b.dataset.hudBadgeKind,id:b.dataset.hudBadge}));
  const sheetBtn=byId("hudSheetBtn"),cockpitBtn=byId("hudCockpitBtn");
  if(sheetBtn)sheetBtn.onclick=()=>openCharacterFocus(t.characterId,"sheet");
  if(cockpitBtn)cockpitBtn.onclick=()=>openCharacterFocus(t.characterId,"combat");
}
function positionTokenHud(){if(!ui.tokenHud||ui.tokenHud.classList.contains("hidden"))return;const t=state.tokens.find(x=>x.id===state.selected);if(!t){ui.tokenHud.classList.add("hidden");return}const p=worldToScreen(t.x,t.y+tokenRadius(t));ui.tokenHud.style.left=Math.round(p.x)+"px";ui.tokenHud.style.top=Math.round(p.y)+"px"}
// Token HP lives on the token row itself (not derived from the linked
// character each read, see repositories/campaign_maps.normalize_token) —
// patching it is just a saveToken() call with one field changed, so the HUD
// stepper/input reuse the exact same endpoint the advanced form already uses.
async function patchToken(t,partial){if(!canMove(t))return;try{const payload={id:t.id,name:t.name,kind:t.kind,characterId:t.characterId,ownerUsername:t.ownerUsername,x:t.x,y:t.y,color:t.color,size:t.size,vision:t.vision,visionDistanceUnits:t.visionDistanceUnits,rotation:t.rotation,elevation:t.elevation,move:t.move,image:t.image,hp:t.hp,hpMax:t.hpMax,visible:t.visible,resourceVisibility:t.resourceVisibility,...partial};const saved=await limiarApi.campaignMaps.saveToken(campaignId,payload);state.tokens=state.tokens.map(x=>x.id===saved.id?saved:x);renderTokenHud();renderTokens();drawOnce()}catch(e){status(e.message||"token indisponivel","err")}}
// Badges come from the linked CHARACTER's conditions, not the token —
// cprDismissBadge (systemAdapter) decides treated-vs-removed, same
// GM-or-owner write path sheet.js uses for self-service condition clearing
// (characters.upsert for GM, characters.createPlayer for the owning player;
// backend gates createPlayer on ownerUsername match either way).
async function dismissBadge(t,badge){if(!t.characterId||!canMove(t))return;try{const character=await limiarApi.characters.get(t.characterId);const patch=cprDismissBadge(character,badge);if(!patch)return;const next={...character,...patch};const writer=state.canEdit?limiarApi.characters.upsert:limiarApi.characters.createPlayer;await writer(next);await loadSoft();status("atualizado","ok")}catch(e){status(e.message||"acao indisponivel","err")}}
// CM1: turn highlight — token's gold ring only lights up when combat is
// actually active and this token is linked to whoever's turn it is.
function isCombatTurn(t){return !!(t&&t.characterId&&state.combat&&state.combat.active&&state.combat.turnCharacterId&&t.characterId===state.combat.turnCharacterId)}
const EXPLORED_MAX_ALPHA=.5;
// F2c: `individual` exploration mode means visibleNow isn't pooled across the
// party — a non-GM viewer only gets live-vision clearing from tokens they
// own. `shared` (CPR default) keeps pooling every player token, unchanged.
function polygonPath(points,targetCtx=ctx){if(!points.length)return;targetCtx.beginPath();targetCtx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)targetCtx.lineTo(points[i].x,points[i].y);targetCtx.closePath()}
// Painted on the offscreen shadowCtx (scene-pixel resolution, not device
// pixels — a quality tradeoff acceptable until Onda 2's layered pipeline),
// then composited onto the main canvas in one drawImage call. Punching the
// destination-out holes directly on the main canvas (the old approach)
// erased whatever was already painted there — map image, tokens — instead
// of just the black overlay, showing as a literal hole where vision should
// be clear (README-MAPA B1).
function drawShadow(w,h){if(!state.scene)return;const fog=!!state.scene.fogEnabled,darkness=Math.max(0,Math.min(1,Number(state.scene.darkness)||0));if(!fog&&!darkness)return;const tokens=liveVisionTokens(),alpha=fog?(state.canEdit?Math.max(.12,darkness*.75):Math.max(Number(state.scene.shadowOpacity)||.92,darkness)):darkness;const cw=Math.max(1,Math.ceil(w)),ch=Math.max(1,Math.ceil(h));if(shadowCanvas.width!==cw||shadowCanvas.height!==ch){shadowCanvas.width=cw;shadowCanvas.height=ch}else{shadowCtx.clearRect(0,0,cw,ch)}shadowCtx.globalCompositeOperation="source-over";shadowCtx.fillStyle=`rgba(0,0,0,${alpha})`;shadowCtx.fillRect(0,0,w,h);shadowCtx.globalCompositeOperation="destination-out";if(fog)for(const r of state.reveals){clearVision(r.x,r.y,r.radius,EXPLORED_MAX_ALPHA,shadowCtx)}const shadowWalls=losWalls();for(const t of tokens){const radius=visionRadiusPx(t),poly=visionPolygon(t,radius,shadowWalls);shadowCtx.save();polygonPath(poly,shadowCtx);shadowCtx.clip();clearVision(t.x,t.y,radius,1,shadowCtx);shadowCtx.restore()}ctx.drawImage(shadowCanvas,0,0,w,h)}
function clearVision(x,y,radius,maxAlpha=1,targetCtx=ctx){const rg=targetCtx.createRadialGradient(x,y,Math.max(10,Number(radius)*.24),x,y,Number(radius));rg.addColorStop(0,`rgba(0,0,0,${maxAlpha})`);rg.addColorStop(.72,`rgba(0,0,0,${maxAlpha*.82})`);rg.addColorStop(1,"rgba(0,0,0,0)");targetCtx.fillStyle=rg;targetCtx.beginPath();targetCtx.arc(x,y,Number(radius),0,Math.PI*2);targetCtx.fill()}
function drawLights(){const list=state.lightDraft?[...state.lights,state.lightDraft]:state.lights,viewers=liveVisionTokens(),walls=losWalls();for(const light of list){if(!light.enabled)continue;const p=lightPosition(light),dim=lightRadiusPx(light.dimUnits),bright=lightRadiusPx(light.brightUnits);if(!(dim>0))continue;const paint=()=>{const rg=ctx.createRadialGradient(p.x,p.y,Math.max(0,bright*.15),p.x,p.y,dim);rg.addColorStop(0,`${hexToRgba(light.color,.62)}`);rg.addColorStop(bright/dim,`${hexToRgba(light.color,.28)}`);rg.addColorStop(1,hexToRgba(light.color,0));ctx.fillStyle=rg;ctx.beginPath();ctx.arc(p.x,p.y,dim,0,Math.PI*2);ctx.fill()};const sourceVisible=state.canEdit||viewers.some(v=>visionContainsPoint(v,visionRadiusPx(v),walls,p));if(sourceVisible){ctx.save();polygonPath(visionPolygon(p,dim,walls));ctx.clip();paint();ctx.restore()}}}
function drawManualFog(){ctx.save();for(const f of state.fogAreas){ctx.fillStyle=state.canEdit?"rgba(0,0,0,.46)":"rgba(0,0,0,.98)";ctx.fillRect(f.x,f.y,f.width,f.height);if(state.canEdit){ctx.strokeStyle="rgba(214,170,78,.72)";ctx.lineWidth=2/state.camera.zoom;ctx.strokeRect(f.x,f.y,f.width,f.height)}}if(state.fogDraft){const f=state.fogDraft;ctx.fillStyle="rgba(63,224,208,.16)";ctx.strokeStyle="#3fe0d0";ctx.lineWidth=2/state.camera.zoom;ctx.fillRect(f.x,f.y,f.width,f.height);ctx.strokeRect(f.x,f.y,f.width,f.height)}ctx.restore()}
function drawWalls(){const list=state.wallDraft?[...state.walls,state.wallDraft]:state.walls;ctx.save();ctx.lineCap="round";for(const wall of list){const door=wall.kind==="door",open=door&&wall.open;ctx.strokeStyle=open?"rgba(63,224,208,.55)":door?"#d6aa4e":"#c0635b";ctx.lineWidth=(door?5:4)/state.camera.zoom;ctx.setLineDash(open?[8/state.camera.zoom,6/state.camera.zoom]:[]);ctx.beginPath();ctx.moveTo(wall.x1,wall.y1);ctx.lineTo(wall.x2,wall.y2);ctx.stroke();ctx.setLineDash([])}ctx.restore()}
function renderWallList(){if(!ui.wallList)return;ui.wallList.innerHTML=state.walls.map(w=>`<button class="list-btn token-row" data-wall="${esc(w.id)}"><span class="swatch" style="background:${w.kind==="door"?(w.open?"#3fe0d0":"#d6aa4e"):"#c0635b"}"></span><span>${w.kind==="door"?"porta":"parede"}<br><small class="tag">${w.kind==="door"?(w.open?"aberta":"fechada"):"bloqueia visao"}</small></span>${w.kind==="door"?`<span class="tag" data-toggle-door="${esc(w.id)}">${w.open?"fechar":"abrir"}</span>`:""}<span class="tag danger" data-remove-wall="${esc(w.id)}">remover</span></button>`).join("")||'<p class="hint">sem paredes</p>'}
async function saveWall(wall){const saved=await limiarApi.campaignMaps.saveWall(campaignId,{...wall,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.walls=[...state.walls.filter(w=>w.id!==saved.id),saved];renderWallList();drawOnce();status("parede salva","ok")}
async function deleteWall(id){const saved=await limiarApi.campaignMaps.deleteWall(campaignId,{wallId:id,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.walls=state.walls.filter(w=>w.id!==id);renderWallList();drawOnce();status("parede removida","ok")}
async function toggleDoor(id){const saved=await limiarApi.campaignMaps.toggleDoor(campaignId,{wallId:id,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.walls=state.walls.map(w=>w.id===id?saved:w);renderWallList();drawOnce();status(saved.open?"porta aberta":"porta fechada","ok")}

// G2: destructible cover. Same shape/tool pattern as walls above (rectangle
// drag -> save with scene expectedRevision); LOS blocking itself lives in
// losWalls()/propsToWalls (domain/map/visionEngine), the page only owns
// drawing + persistence. Damage is open to any campaign member (matches the
// backend route) — logging a hit on cover isn't a GM-only action, same as a
// player's own attack roll already applying character damage without a
// GM click.
function drawProps(g){const list=state.propDraft?[...state.props,state.propDraft]:state.props;for(const p of list){const destroyed=Number(p.hp)<=0;ctx.save();ctx.fillStyle=destroyed?"rgba(120,110,100,.28)":hexToRgba(p.color||"#8a7455",.55);ctx.strokeStyle=destroyed?"rgba(120,110,100,.6)":(p.color||"#8a7455");ctx.lineWidth=(p.id&&p.id===state.selectedPropId?3:2)/state.camera.zoom;if(destroyed)ctx.setLineDash([6/state.camera.zoom,4/state.camera.zoom]);ctx.beginPath();ctx.rect(p.x,p.y,p.w||0,p.h||0);ctx.fill();ctx.stroke();ctx.setLineDash([]);if(!destroyed&&p.hpMax>0){const pct=Math.max(0,Math.min(1,Number(p.hp)/Number(p.hpMax)));ctx.fillStyle="rgba(0,0,0,.35)";ctx.fillRect(p.x,p.y-6/state.camera.zoom,p.w||0,4/state.camera.zoom);ctx.fillStyle="#c0635b";ctx.fillRect(p.x,p.y-6/state.camera.zoom,(p.w||0)*pct,4/state.camera.zoom)}ctx.restore()}}
function renderPropList(){if(!ui.propList)return;ui.propList.innerHTML=state.props.map(p=>{const destroyed=Number(p.hp)<=0;return `<button class="list-btn token-row ${p.id===state.selectedPropId?"active":""}" data-prop="${esc(p.id)}"><span class="swatch" style="background:${esc(p.color||"#8a7455")}"></span><span>${esc(p.label||p.material)}<br><small class="tag">${esc(p.material)} // HP ${Math.round(p.hp)}/${Math.round(p.hpMax)}${destroyed?" // ESCOMBRO":""}</small></span>${state.canEdit?`<span class="tag danger" data-remove-prop="${esc(p.id)}">remover</span>`:""}<span class="tag" data-damage-prop="${esc(p.id)}">-dano</span></button>`}).join("")||'<p class="hint">sem props</p>'}
function saveProp(prop){return propCommands.saveProp(prop)}
function deleteProp(id){return propCommands.deleteProp(id)}
function damageProp(id){return propCommands.damageProp(id)}
function renderLightList(){if(!ui.lightList)return;const me=sessionUsername(state.session);ui.lightList.innerHTML=state.lights.map(l=>{const token=l.tokenId&&state.tokens.find(t=>t.id===l.tokenId),canToggle=state.canEdit||((l.kind==="token"||l.kind==="effect")&&token&&token.ownerUsername===me);return `<button class="list-btn token-row" data-light="${esc(l.id)}"><span class="swatch" style="background:${esc(l.color)}"></span><span>${esc(l.label||l.kind)}<br><small class="tag">${esc(l.kind)} // ${l.brightUnits}m / ${l.dimUnits}m</small></span>${canToggle?`<span class="tag" data-toggle-light="${esc(l.id)}">${l.enabled?"ligada":"apagada"}</span>`:""}${state.canEdit?`<span class="tag danger" data-remove-light="${esc(l.id)}">remover</span>`:""}</button>`}).join("")||'<p class="hint">sem luzes</p>'}
function saveLight(light){return lightCommands.saveLight(light)}
function deleteLight(id){return lightCommands.deleteLight(id)}
function toggleLight(id){return lightCommands.toggleLight(id)}
function drawDrawings(){const list=state.drawingDraft?[...state.drawings,state.drawingDraft]:state.drawings;ctx.save();ctx.lineCap="round";ctx.lineJoin="round";for(const d of list){const points=d.points||[];if(points.length<2)continue;ctx.strokeStyle=d.color||"#3fe0d0";ctx.lineWidth=Math.max(.5,Number(d.width)||3)/state.camera.zoom;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();if(d.label){const end=points[points.length-1];ctx.fillStyle=d.color||"#3fe0d0";ctx.font=`${12/state.camera.zoom}px monospace`;ctx.textBaseline="bottom";ctx.fillText(d.label,end.x,end.y-4/state.camera.zoom)}}ctx.restore()}
function drawPins(){ctx.save();for(const p of state.pins){ctx.fillStyle="#d6aa4e";ctx.strokeStyle="#050706";ctx.lineWidth=2/state.camera.zoom;ctx.beginPath();ctx.arc(p.x,p.y-7/state.camera.zoom,7/state.camera.zoom,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(p.x-4/state.camera.zoom,p.y-2/state.camera.zoom);ctx.lineTo(p.x,p.y+8/state.camera.zoom);ctx.lineTo(p.x+4/state.camera.zoom,p.y-2/state.camera.zoom);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#080a07";ctx.font=`${10/state.camera.zoom}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(p.icon||"•",p.x,p.y-7/state.camera.zoom);if(p.label){ctx.fillStyle="#fff";ctx.textAlign="left";ctx.textBaseline="bottom";ctx.font=`${11/state.camera.zoom}px monospace`;ctx.fillText(p.label,p.x+10/state.camera.zoom,p.y-9/state.camera.zoom)}}ctx.restore()}
function renderDrawingList(){if(!ui.drawingList)return;ui.drawingList.innerHTML=state.drawings.map(d=>`<button class="list-btn token-row"><span class="swatch" style="background:${esc(d.color)}"></span><span>${esc(d.label||"desenho")}<br><small class="tag">${(d.points||[]).length} pontos</small></span><span class="tag danger" data-remove-drawing="${esc(d.id)}">remover</span></button>`).join("")||'<p class="hint">sem desenhos</p>';ui.drawingList.onclick=e=>{const rm=e.target.closest("[data-remove-drawing]");if(rm)runAction(()=>deleteDrawing(rm.dataset.removeDrawing))()}}
function renderPinList(){if(!ui.pinList)return;ui.pinList.innerHTML=state.pins.map(p=>`<button class="list-btn token-row"><span class="swatch" style="background:#d6aa4e"></span><span>${esc(p.label||"nota")}<br><small class="tag">${esc(p.visibility)}</small></span>${state.canEdit?`<span class="tag danger" data-remove-pin="${esc(p.id)}">remover</span>`:""}</button>`).join("")||'<p class="hint">sem pins</p>';ui.pinList.onclick=e=>{const rm=e.target.closest("[data-remove-pin]");if(rm)runAction(()=>deletePin(rm.dataset.removePin))()}}
async function saveDrawing(drawing){const saved=await limiarApi.campaignMaps.saveDrawing(campaignId,{...drawing,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.drawings=[...state.drawings.filter(d=>d.id!==saved.id),saved];renderDrawingList();drawOnce();status("desenho salvo","ok")}
async function deleteDrawing(id){const saved=await limiarApi.campaignMaps.deleteDrawing(campaignId,{drawingId:id,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.drawings=state.drawings.filter(d=>d.id!==id);renderDrawingList();drawOnce();status("desenho removido","ok")}
async function savePin(pin){const saved=await limiarApi.campaignMaps.savePin(campaignId,{...pin,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.pins=[...state.pins.filter(p=>p.id!==saved.id),saved];renderPinList();drawOnce();status("pin salvo","ok")}
async function deletePin(id){const saved=await limiarApi.campaignMaps.deletePin(campaignId,{pinId:id,expectedRevision:Number(state.scene&&state.scene.revision||0)});state.scene={...state.scene,revision:saved.sceneRevision};state.pins=state.pins.filter(p=>p.id!==id);renderPinList();drawOnce();status("pin removido","ok")}
// LOS advisory (CM1): a supplementary warning line, never a gate — the real
// visibility gate for the attack flow stays tokenVisibleNow() (party-pool
// aggregate). This is a stricter single-attacker raycast check purely to
// surface "you personally can't see them, even if a teammate can."
function measureLosWarning(){const attackerId=state.measure&&state.measure.attackerTokenId;if(!attackerId)return "";const attacker=state.tokens.find(t=>t.id===attackerId);if(!attacker)return "";const radius=visionRadiusPx(attacker);if(!(radius>0))return "";const to=state.measure.to;return visionContainsPoint(attacker,radius,losWalls(),to)?"":" // SEM LINHA DE VISAO"}
function drawMeasure(g){if(!state.measure)return;const {from,to}=state.measure,distance=measureTokenDistance(from,to,g),cost=segmentMovementCost(from,to,g,state.difficultCells);if(!distance)return;ctx.strokeStyle="#d6aa4e";ctx.lineWidth=3/state.camera.zoom;ctx.setLineDash([8/state.camera.zoom,7/state.camera.zoom]);ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x,to.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#d6aa4e";ctx.font=`${14/state.camera.zoom}px monospace`;const terrainLabel=cost.difficultCellCount?` // custo mov. ${cost.costCells}q // ${cost.costMeters.toFixed(0)}m`:"";const target=state.measure.attack&&state.measure.attack.targetName?` // ALVO ${state.measure.attack.targetName}`:"";ctx.fillText(`${distance.cells.toFixed(0)}q // ${distance.rangeMeters.toFixed(0)}m${target}${terrainLabel}${measureLosWarning()}`,(from.x+to.x)/2,(from.y+to.y)/2)}
// Shared by the R-tool drag (release over a token) and the context-menu
// "Medir e usar no ataque" shortcut (CM1) — same validated path either way,
// the menu just skips having to drag precisely.
async function prepareMapAttack(){const measure=state.measure,attack=measure&&measure.attack;if(!attack)return;try{const raw=await limiarApi.combat.state.get(),combat=raw&&typeof raw==="object"?raw:{},order=Array.isArray(combat.order)?combat.order:[],current=order[Number(combat.turnIndex)],entry=current&&combat.combatants&&combat.combatants[current];if(!combat.active||current!==attack.attackerCharacterId||!entry||entry.defeated){state.measure={...measure,attackReady:false};status("ataque do mapa exige o turno ativo do atacante","err");drawOnce();return}state.measure={...measure,attackReady:true};status("alcance pronto para ataque","ok");drawOnce()}catch(e){state.measure={...measure,attackReady:false};status(e.message||"combate indisponivel","err");drawOnce()}}
async function useMapAttack(){const attack=state.measure&&state.measure.attack;if(!attack||!state.measure.attackReady)return status("medida de ataque indisponivel","err");const intent=createMapAttackIntent({campaignId,sceneId:String((state.scene&&state.scene.id)||""),...attack});saveMapAttackIntent(sessionStorage,intent);location.assign("/?mapAttack=1")}

// --- CM1: token context menu (right-click) ---------------------------------
// "Abrir ficha"/"Abrir cockpit" hand off to the main app via a one-shot
// sessionStorage envelope (mapFocusIntent), same discipline as F4's attack
// intent above. Iniciativa/derrotado act straight on the shared combat-state
// setting (limiarApi.combat.state), the same one Component.js's cockpit
// reads/writes — no new backend route, just read-modify-write like the
// cockpit already does (backend/api/state.py _post_combat_end_turn).
function openCharacterFocus(characterId,mode){const intent=createMapFocusIntent({campaignId,characterId,mode});saveMapFocusIntent(sessionStorage,intent);location.assign("/?mapFocus=1")}
function measureAgainstFromMenu(attacker,target){const measure=buildAttackMeasure(attacker,target);if(!measure)return status("sem banda de ataque valida para esse alvo/distancia","err");state.measure=measure;prepareMapAttack();drawOnce()}
// Fase MUNICAO-NO-MAPA (G4): same persistence path combat.js's reloadWeapon/
// persistGearPatch use under the hood (Component.js applyCharacterPatch) —
// a full character read-modify-write through POST /characters (GM) or
// POST /player-characters (owner), no new backend route. The only "logic"
// here is the one-liner CM0 already does (currentAmmo = magazine) on the
// weaponId map_state already picked (t.ammo.weaponId) — no ammo rules live
// on the map (combatAmmoEngine.ts stays the only source of truth).
async function reloadTokenWeapon(t){if(!canMove(t)||!t.characterId||!t.ammo)return status("sem arma com municao rastreada","err");try{const character=await limiarApi.characters.get(t.characterId);const gear=Array.isArray(character.gear)?character.gear:[];const weaponId=t.ammo.weaponId;const updatedGear=gear.map(item=>item&&item.id===weaponId?{...item,currentAmmo:item.magazine}:item);const writer=state.canEdit?limiarApi.characters.upsert:limiarApi.characters.createPlayer;await writer({...character,gear:updatedGear});status((t.ammo.weaponName||"Arma")+" recarregada","ok");await load()}catch(e){status(e.message||"recarga indisponivel","err")}}
async function rollTokenInitiative(t){if(!state.canEdit)return;try{const combat=combatNormalizeState(await limiarApi.combat.state.get());const entry=combat.combatants[t.characterId];if(!entry)return status("personagem nao esta no combate","err");if(entry.initiative!=null)return status("iniciativa ja rolada","err");const character=await limiarApi.characters.get(t.characterId);const ref=Number(character&&character.base&&character.base.REF)||0;const roll=rollD10()+ref;await limiarApi.combat.state.set({...combat,combatants:{...combat.combatants,[t.characterId]:{...entry,initiative:roll}},updatedAt:new Date().toISOString()});status(`iniciativa ${t.name||"token"}: ${roll}`,"ok")}catch(e){status(e.message||"iniciativa indisponivel","err")}}
async function toggleTokenDefeated(t){if(!state.canEdit)return;try{const combat=combatNormalizeState(await limiarApi.combat.state.get());const entry=combat.combatants[t.characterId];if(!entry)return status("personagem nao esta no combate","err");const next=!entry.defeated;await limiarApi.combat.state.set({...combat,combatants:{...combat.combatants,[t.characterId]:{...entry,defeated:next}},updatedAt:new Date().toISOString()});status(next?"marcado como derrotado":"reativado","ok")}catch(e){status(e.message||"acao indisponivel","err")}}
function tokenMenuActions(t,combatState){const actions=[];const mine=canMove(t);if(t.characterId){if(mine)actions.push({label:"Abrir ficha",run:()=>openCharacterFocus(t.characterId,"sheet")});if(mine)actions.push({label:"Abrir cockpit",run:()=>openCharacterFocus(t.characterId,"combat")});if(mine&&t.ammo)actions.push({label:"Recarregar "+(t.ammo.weaponName||"arma"),run:()=>reloadTokenWeapon(t)})}else{actions.push({label:"Sem personagem vinculado",disabled:true})}if(state.selected&&state.selected!==t.id){const attacker=state.tokens.find(x=>x.id===state.selected);if(attacker&&canMove(attacker)&&attacker.characterId&&t.characterId)actions.push({label:"Medir e usar no ataque",run:()=>measureAgainstFromMenu(attacker,t)})}const entry=combatState&&t.characterId?combatState.combatants[t.characterId]:null;if(state.canEdit&&entry){if(entry.initiative==null)actions.push({label:"Rolar iniciativa",run:()=>rollTokenInitiative(t)});actions.push({label:entry.defeated?"Reativar":"Marcar derrotado",danger:!entry.defeated,run:()=>toggleTokenDefeated(t)})}return actions}
function closeTokenMenu(){if(!ui.tokenMenu)return;ui.tokenMenu.hidden=true;ui.tokenMenu.innerHTML=""}
function renderTokenMenu(t,x,y,combatState){if(!ui.tokenMenu)return;const actions=tokenMenuActions(t,combatState);ui.tokenMenu.innerHTML=`<div class="ctx-title">${esc(t.name||"Token")}</div>`+actions.map((a,i)=>`<button ${a.disabled?"disabled":`data-act="${i}"`} class="${a.danger?"danger":""}">${esc(a.label)}</button>`).join("");ui.tokenMenu.querySelectorAll("[data-act]").forEach(btn=>btn.onclick=()=>{const action=actions[Number(btn.dataset.act)];closeTokenMenu();action.run()});ui.tokenMenu.hidden=false;const rect=ui.tokenMenu.getBoundingClientRect();ui.tokenMenu.style.left=Math.max(4,Math.min(x,innerWidth-rect.width-8))+"px";ui.tokenMenu.style.top=Math.max(4,Math.min(y,innerHeight-rect.height-8))+"px"}
async function openTokenMenu(e){const p=screenToWorld(e.clientX,e.clientY),t=tokenAt(p);if(!t)return closeTokenMenu();let combatState=null;try{combatState=combatNormalizeState(await limiarApi.combat.state.get())}catch(_){combatState=null}renderTokenMenu(t,e.clientX,e.clientY,combatState)}
// Templates (F3): drag from origin sets direction+distance (released ==
// persisted, "documento de cena"); angle/width/color/label/hidden come from
// the side-panel form. Rendered as a translucent shape (smooth) plus
// highlighted grid cells (domain/map/templateEngine, the actual affected
// cells) — both driven by the exact same geometry.
function unitsToPx(units,g){return metersToCells(Number(units)||0)*g}
function hexToRgba(hex,alpha){const h=String(hex||"#3fe0d0").replace("#","");const full=h.length===3?h.split("").map(c=>c+c).join(""):h.padEnd(6,"0").slice(0,6);const n=parseInt(full,16)||0x3fe0d0;return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`}
function drawTemplates(g){const list=state.templateDraft?[...state.templates,state.templateDraft]:state.templates;for(const t of list){const distPx=unitsToPx(t.distanceUnits,g);if(!(distPx>0))continue;const widthPx=unitsToPx(t.widthUnits,g),dir=Number(t.directionDeg||0),rad=dir*Math.PI/180,sel=t.id&&t.id===state.selectedTemplateId;ctx.save();ctx.translate(t.x,t.y);ctx.fillStyle=hexToRgba(t.color,.22);ctx.strokeStyle=t.color||"#3fe0d0";ctx.lineWidth=(sel?3:2)/state.camera.zoom;ctx.beginPath();if(t.kind==="cone"){const half=((Number(t.angleDeg)||53)/2)*Math.PI/180;ctx.moveTo(0,0);ctx.arc(0,0,distPx,rad-half,rad+half);ctx.closePath()}else if(t.kind==="rectangle"||t.kind==="ray"){ctx.rotate(rad);ctx.rect(0,-widthPx/2,distPx,widthPx)}else{ctx.arc(0,0,distPx,0,Math.PI*2)}ctx.fill();ctx.stroke();ctx.restore();const cells=templateCells({kind:t.kind,x:t.x,y:t.y,directionDeg:dir,distanceUnits:Number(t.distanceUnits)||0,angleDeg:Number(t.angleDeg),widthUnits:Number(t.widthUnits)},{gridSizePx:g});ctx.save();ctx.fillStyle=hexToRgba(t.color,.14);for(const c of cells){ctx.fillRect(c.x*g,c.y*g,g,g)}ctx.restore();if(t.label){ctx.save();ctx.fillStyle="#fff";ctx.font=`${12/state.camera.zoom}px monospace`;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(t.label,t.x,t.y-6/state.camera.zoom);ctx.restore()}}}
function syncTemplateForm(){const t=state.templates.find(x=>x.id===state.selectedTemplateId);if(!t)return;ui.templateKind.value=t.kind||"circle";ui.templateColor.value=t.color||"#3fe0d0";ui.templateLabel.value=t.label||"";ui.templateDistance.value=t.distanceUnits||0;ui.templateDirection.value=Math.round(Number(t.directionDeg)||0);ui.templateAngle.value=t.angleDeg||53;ui.templateWidth.value=t.widthUnits||0;ui.templateHidden.checked=!!t.hidden;if(ui.templateLifecycle)ui.templateLifecycle.value=t.lifecycle||"manual"}
function renderTemplateList(){ui.templateList.innerHTML=state.templates.map(t=>{const canResolve=t.lifecycle==="untilResolved"&&!t.resolved&&canEditTemplate(t);return `<button class="list-btn token-row ${t.id===state.selectedTemplateId?"active":""}" data-template="${esc(t.id)}" style="${t.resolved?"opacity:.5":""}"><span class="swatch" style="background:${esc(t.color)}"></span><span>${esc(t.label||t.kind)}<br><small class="tag">${esc(t.kind)} ${t.lifecycle==="untilResolved"?(t.resolved?"// RESOLVIDO":"// ATE RESOLVER"):""} ${t.ownerUsername?"// "+esc(t.ownerUsername):""}</small></span>${canResolve?`<span class="tag" data-resolve-template="${esc(t.id)}" style="background:rgba(63,224,208,.18);color:#3fe0d0;">RESOLVER</span>`:""}${canEditTemplate(t)?`<span class="tag danger" data-remove-template="${esc(t.id)}">remover</span>`:""}</button>`}).join("")||'<p class="hint">sem templates</p>'}
function saveTemplatePlacement(payload){return templateCommands.saveTemplatePlacement(payload)}
function saveTemplateEdit(){return templateCommands.saveTemplateEdit()}
function deleteTemplate(id){return templateCommands.deleteTemplate(id)}
// Fase AREA: RESOLVER — lists tokens whose cell is inside templateCells()
// AND inside this session's F3 visibility (tokenVisibleNow), same rule F4's
// attack measurement already enforces: never auto-target a token the acting
// user can't see. cprOnResolveTemplate (systemAdapter) turns that filtered
// list into targetCharacterIds; a system with no area rule returns null and
// this just reports "no valid targets" instead of handing off. On handoff,
// the map's job is done — the cockpit (2nd confirmation) applies the actual
// damage and marks the template resolved via expectedRevision.
function resolveTemplateAction(t){
  if(!canEditTemplate(t))return status("sem permissao para resolver este template","err");
  const g=sceneSize().g;
  const cells=templateCells({kind:t.kind,x:t.x,y:t.y,directionDeg:t.directionDeg,distanceUnits:t.distanceUnits,angleDeg:t.angleDeg,widthUnits:t.widthUnits},{gridSizePx:g});
  const cellSet=new Set(cells.map(c=>c.x+":"+c.y));
  const affected=state.tokens.filter(tok=>tok.characterId&&cellSet.has(Math.floor(tok.x/g)+":"+Math.floor(tok.y/g))&&tokenVisibleNow(tok));
  const command=cprOnResolveTemplate({template:t,tokens:affected});
  if(!command){status("nenhum alvo valido (visivel) na area do template","err");return}
  const intent=createMapAoeIntent({campaignId,sceneId:String((state.scene&&state.scene.id)||""),templateId:t.id,expectedRevision:Number(t.revision||0),areaKind:command.areaKind,areaLabel:command.areaLabel,targetCharacterIds:command.targetCharacterIds});
  saveMapAoeIntent(sessionStorage,intent);
  location.assign("/?mapAoe=1");
}
// Pings (F1 do PLANO-MAPA-FOUNDRY): duplo-clique envia, todos recebem via
// polling. Cor deterministica por username pra ficar igual em todos os
// clientes. Entradas ficam em pingAnims por PING_KEEP_MS (> janela de 10s do
// servidor) pra nao re-animar o mesmo ping a cada poll; so os primeiros
// PING_ANIM_MS sao desenhados.
function pingColor(name){let h=0;for(const c of String(name||"")){h=(h*31+c.charCodeAt(0))%360}return `hsl(${h},72%,62%)`}
function ingestPings(list){const now=performance.now();for(const p of list||[]){if(!p||!p.id||state.pingAnims.has(p.id))continue;state.pingAnims.set(p.id,{...p,start:now})}for(const [id,p] of state.pingAnims){if(now-p.start>PING_KEEP_MS)state.pingAnims.delete(id)}}
async function sendPing(p){try{const ping=await limiarApi.campaignMaps.ping(campaignId,{x:p.x,y:p.y,color:pingColor(sessionUsername(state.session))});ingestPings([ping]);drawOnce()}catch(e){status(e.message||"ping indisponivel","err")}}
function drawPings(){if(!state.pingAnims.size)return;const now=performance.now();let live=false;ctx.save();for(const p of state.pingAnims.values()){const t=(now-p.start)/PING_ANIM_MS;if(t>=1)continue;live=true;const base=30/state.camera.zoom;ctx.lineWidth=2.5/state.camera.zoom;for(let i=0;i<3;i++){const prog=(t*1.6+i/3)%1;ctx.strokeStyle=p.color||"#3fe0d0";ctx.globalAlpha=Math.max(0,(1-prog)*(1-t)*.9);ctx.beginPath();ctx.arc(p.x,p.y,base*(0.25+prog*1.4),0,Math.PI*2);ctx.stroke()}ctx.globalAlpha=Math.max(0,1-t);ctx.fillStyle=p.color||"#3fe0d0";ctx.beginPath();ctx.arc(p.x,p.y,4/state.camera.zoom,0,Math.PI*2);ctx.fill();ctx.font=`${12/state.camera.zoom}px monospace`;ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(p.username||"?",p.x,p.y-base*.7)}ctx.restore();if(live)drawOnce()}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function varColor(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()}
function renderTokens(){ui.tokenList.innerHTML=state.tokens.map(t=>`<button class="list-btn token-row ${state.selectedIds.includes(t.id)||t.id===state.selected?"active":""}" data-token="${esc(t.id)}"><span class="swatch" style="background:${esc(t.color)}"></span><span>${esc(t.name)}<br><small class="tag">${esc(t.kind)} ${t.ownerUsername?"// "+esc(t.ownerUsername):""}</small></span><span class="tag">${t.visionDistanceUnits!=null?Number(t.visionDistanceUnits)+"m":Number(t.vision||0)+"px"}</span>${state.canEdit?`<span class="tag danger" data-remove-token="${esc(t.id)}">remover</span>`:""}</button>`).join("")||'<p class="hint">sem tokens</p>'}
function renderFog(){ui.fogList.innerHTML=state.fogAreas.map(f=>`<button class="list-btn"><span>${esc(f.label)}<br><small class="tag">${Math.round(f.width)} x ${Math.round(f.height)}</small></span>${state.canEdit?`<span class="tag danger" data-remove-fog="${esc(f.id)}">revelar</span>`:""}</button>`).join("")||'<p class="hint">nenhuma area</p>'}
function syncTokenForm(){const t=state.tokens.find(x=>x.id===state.selected);if(!t)return;ui.tokenName.value=t.name||"";ui.tokenColor.value=t.color||"#d6aa4e";ui.tokenImage.value=t.image||"";ui.tokenSize.value=t.size||1;ui.tokenVision.value=t.visionDistanceUnits!=null?t.visionDistanceUnits:pixelsToMeters(t.vision||0,sceneSize().g);ui.tokenRotation.value=Number(t.rotation)||0;ui.tokenElevation.value=Number(t.elevation)||0;ui.tokenMove.value=t.move==null?"":t.move;ui.tokenMove.disabled=!!t.characterId;ui.tokenHp.value=t.hp==null?"":t.hp;ui.tokenHpMax.value=t.hpMax==null?"":t.hpMax;ui.tokenVisible.checked=t.visible!==false;ui.tokenResourceVisibility.value=t.resourceVisibility||(t.kind==="player"?"party":"gm")}
// MOVE efetivo do token selecionado (CPR RAW: base MOVE - penalidade de
// armadura - movePenalty de conditions, ja agregados em effectiveMoveStat).
// Token vinculado a personagem busca a ficha (so o dono ou o GM podem, ver
// permissao de /characters/:id); token sem personagem usa o campo manual
// `move` (default 6). Cacheado por characterId para nao refazer fetch a cada
// redraw.
async function updateSelectedMove(){const t=state.tokens.find(x=>x.id===state.selected);if(!t){state.selectedMoveCells=null;drawOnce();return}if(!t.characterId){state.selectedMoveCells=Number(t.move||6);drawOnce();return}if(state.characterMoveCache.has(t.characterId)){state.selectedMoveCells=state.characterMoveCache.get(t.characterId);drawOnce();return}try{const character=await limiarApi.characters.get(t.characterId);const move=effectiveMoveStat(character);state.characterMoveCache.set(t.characterId,move);state.selectedMoveCells=move}catch(_){state.selectedMoveCells=Number(t.move||6)}drawOnce()}
function saveScene(activate=false){return sceneCommands.saveScene(activate)}
function newScene(){return sceneCommands.newScene()}
function activateScene(){return sceneCommands.activateScene(ui.sceneSelect.value)}
async function uploadImage(file,scope){return limiarApi.uploads.image(file,{scope,ownerId:campaignId})}
function uploadMap(){return sceneCommands.uploadMap()}
function uploadToken(){return tokenCommands.uploadToken()}
function useImageSize(){return sceneCommands.useImageSize()}
// Auto-incrementing names (README-MAPA A7): only the create flow (old is
// null, i.e. "adicionar") renumbers via nextTokenName — editing an already-
// placed token just saves the name field as typed, no surprises.
function saveToken(){return tokenCommands.saveToken()}
function syncPlayers(){return tokenCommands.syncPlayers()}
async function moveToken(t){await limiarApi.campaignMaps.moveToken(campaignId,{tokenId:t.id,x:t.x,y:t.y})}
async function moveTokenGroup(tokens){if(tokens.length===1)return moveToken(tokens[0]);await limiarApi.campaignMaps.moveTokens(campaignId,{moves:tokens.map(t=>({tokenId:t.id,x:t.x,y:t.y}))})}
function deleteToken(id){return tokenCommands.deleteToken(id)}
async function saveFog(f){if(!state.canEdit||f.width<8||f.height<8)return;await limiarApi.campaignMaps.saveFog(campaignId,f);await load()}
async function deleteFog(id){if(!state.canEdit)return;await limiarApi.campaignMaps.deleteFog(campaignId,id);await load();status("area revelada","ok")}
async function clearReveals(){if(!state.canEdit)return;if(!await openConfirmModal({title:"Resetar exploracao",message:"Resetar areas ja reveladas desta cena?",danger:true,confirmLabel:"resetar"}))return;await limiarApi.campaignMaps.clearReveals(campaignId);await load();status("exploracao resetada","ok")}
// Pinta/apaga terreno dificil por celula (CPR RAW: 2m gastos por 1m
// percorrido). Um toggle por celula por arraste (pointer.terrainTouched) pra
// nao alternar ida-e-volta ao passar o mouse repetidas vezes na mesma celula.
// Cada toggle e' um read-modify-write no backend (le a lista, altera, salva) —
// encadeado em terrainQueue pra nao rodar dois toggles em paralelo e um
// sobrescrever o outro quando o arraste passa por varias celulas rapido.
function toggleTerrainAtWorld(p){if(!pointer.terrainTouched)return;const g=sceneSize().g,gx=Math.floor(p.x/g),gy=Math.floor(p.y/g),key=cellKey(gx,gy);if(pointer.terrainTouched.has(key))return;pointer.terrainTouched.add(key);terrainQueue=terrainQueue.then(()=>limiarApi.campaignMaps.toggleTerrain(campaignId,{x:gx,y:gy})).then(scene=>{state.scene=scene;state.difficultCells=new Set((scene.difficultTerrain||[]).map(([x,y])=>cellKey(x,y)));drawOnce()}).catch(e=>status(e.message||"terreno indisponivel","err"))}
async function clearTerrain(){if(!state.canEdit)return;if(!await openConfirmModal({title:"Limpar terreno",message:"Limpar todo terreno dificil desta cena?",danger:true,confirmLabel:"limpar"}))return;const scene=await limiarApi.campaignMaps.clearTerrain(campaignId);state.scene=scene;state.difficultCells=new Set();drawOnce();status("terreno dificil limpo","ok")}
// Smooth zoom (README-MAPA A5): wheel/+/- used to jump straight to the
// target zoom. Now they set a target and lerp toward it every frame
// (viewport.lerpZoom/cameraPanForAnchor), pinning the same world point
// under the cursor/anchor throughout — same anchor math as before, just
// eased instead of instant. A single shared rAF chain (zoomRafPending)
// so repeated wheel ticks don't stack up duplicate animation loops.
function zoom(delta,cx=canvas.getBoundingClientRect().width/2,cy=canvas.getBoundingClientRect().height/2){const target=clampZoom(state.camera.zoom+delta);const r=canvas.getBoundingClientRect();const anchorWorld=screenToWorld(cx+r.left,cy+r.top);zoomAnim={target,anchorScreen:{x:cx,y:cy},anchorWorld};if(!zoomRafPending){zoomRafPending=true;requestAnimationFrame(tickZoom)}}
function tickZoom(){zoomRafPending=false;if(!zoomAnim)return;const next=lerpZoom(state.camera.zoom,zoomAnim.target,.35);state.camera.zoom=next;const pan=cameraPanForAnchor(zoomAnim.anchorWorld,zoomAnim.anchorScreen,next);state.camera.x=pan.x;state.camera.y=pan.y;drawOnce();if(next===zoomAnim.target){zoomAnim=null;return}zoomRafPending=true;requestAnimationFrame(tickZoom)}
function setTool(tool){state.tool=tool;document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));drawOnce()}
function centerToken(){const t=state.tokens.find(x=>x.id===state.selected);if(!t)return;const r=canvas.getBoundingClientRect();state.camera.x=r.width/2-t.x*state.camera.zoom;state.camera.y=r.height/2-t.y*state.camera.zoom;drawOnce()}
function bind(){ui.modalBackdrop.onclick=e=>{if(e.target===ui.modalBackdrop)closeModal(null)};addEventListener("resize",resize);byId("backBtn").onclick=()=>location.href="/";byId("reloadBtn").onclick=runAction(load);byId("fitBtn").onclick=fitView;byId("fitPanelBtn").onclick=fitView;byId("centerBtn").onclick=fitView;byId("zoomInBtn").onclick=()=>zoom(.15);byId("zoomOutBtn").onclick=()=>zoom(-.15);byId("sideBtn").onclick=()=>document.body.classList.toggle("side-off");byId("sideCloseBtn").onclick=()=>document.body.classList.add("side-off");byId("saveSceneBtn").onclick=runAction(()=>saveScene());byId("newSceneBtn").onclick=runAction(newScene);byId("activateSceneBtn").onclick=runAction(activateScene);ui.uploadFile.onchange=runAction(uploadMap);byId("useImageSizeBtn").onclick=runAction(useImageSize);byId("addTokenBtn").onclick=runAction(async()=>{state.selected=null;await saveToken()});byId("saveTokenBtn").onclick=runAction(saveToken);byId("centerTokenBtn").onclick=centerToken;byId("syncPlayersBtn").onclick=runAction(syncPlayers);ui.tokenUploadFile.onchange=runAction(uploadToken);byId("fogToolBtn").onclick=()=>setTool("fog");byId("templateToolBtn").onclick=()=>setTool("template");byId("saveTemplateBtn").onclick=runAction(saveTemplateEdit);byId("clearRevealsBtn").onclick=runAction(clearReveals);byId("clearTerrainBtn").onclick=runAction(clearTerrain);ui.gridToggle.onchange=()=>{state.showGrid=ui.gridToggle.checked;drawOnce()};ui.snapToggle.onchange=()=>state.snap=ui.snapToggle.checked;ui.runToggle.onchange=()=>{state.runMode=ui.runToggle.checked;drawOnce()};document.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>setTool(b.dataset.tool));document.querySelectorAll("[data-panel]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-panel]").forEach(x=>x.classList.toggle("active",x===b));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+b.dataset.panel))});ui.tokenList.onclick=e=>{const rm=e.target.closest("[data-remove-token]");if(rm){runAction(()=>deleteToken(rm.dataset.removeToken))();return}const btn=e.target.closest("[data-token]");if(btn){state.selected=btn.dataset.token;state.selectedIds=[state.selected];syncTokenForm();renderTokens();renderTokenHud();updateSelectedMove();drawOnce()}};ui.fogList.onclick=e=>{const rm=e.target.closest("[data-remove-fog]");if(rm)runAction(()=>deleteFog(rm.dataset.removeFog))()};ui.templateList.onclick=e=>{const rm=e.target.closest("[data-remove-template]");if(rm){runAction(()=>deleteTemplate(rm.dataset.removeTemplate))();return}const rv=e.target.closest("[data-resolve-template]");if(rv){const t=state.templates.find(x=>x.id===rv.dataset.resolveTemplate);if(t)resolveTemplateAction(t);return}const btn=e.target.closest("[data-template]");if(btn){state.selectedTemplateId=btn.dataset.template;syncTemplateForm();renderTemplateList();drawOnce()}};if(ui.propList)ui.propList.onclick=e=>{const rm=e.target.closest("[data-remove-prop]");if(rm){runAction(()=>deleteProp(rm.dataset.removeProp))();return}const dmg=e.target.closest("[data-damage-prop]");if(dmg){runAction(()=>damageProp(dmg.dataset.damageProp))();return}const btn=e.target.closest("[data-prop]");if(btn){state.selectedPropId=btn.dataset.prop;renderPropList();drawOnce()}};if(ui.wallList)ui.wallList.onclick=e=>{const toggle=e.target.closest("[data-toggle-door]"),rm=e.target.closest("[data-remove-wall]");if(toggle)runAction(()=>toggleDoor(toggle.dataset.toggleDoor))();else if(rm)runAction(()=>deleteWall(rm.dataset.removeWall))()};canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY>0?-.12:.12,e.clientX-r.left,e.clientY-r.top)},{passive:false});canvas.addEventListener("contextmenu",e=>{e.preventDefault();openTokenMenu(e)});document.addEventListener("mousedown",e=>{if(ui.tokenMenu&&!ui.tokenMenu.hidden&&!ui.tokenMenu.contains(e.target))closeTokenMenu()});canvas.addEventListener("dblclick",e=>{e.preventDefault();sendPing(screenToWorld(e.clientX,e.clientY))});canvas.addEventListener("mousedown",onDown);addEventListener("mousemove",onMove);addEventListener("mouseup",onUp);canvas.addEventListener("mousemove",onHover)}
function setupF8Keyboard(){addEventListener("keydown",onMapKeyDown)}
function onHover(e){return pointerHandlers.onHover(e)}
function onDown(e){return pointerHandlers.onDown(e)}
function onMove(e){return pointerHandlers.onMove(e)}
function onUp(e){return pointerHandlers.onUp(e)}
addEventListener("beforeunload",()=>mapSync.stop());
init().catch(e=>status(e.message,"err"));
