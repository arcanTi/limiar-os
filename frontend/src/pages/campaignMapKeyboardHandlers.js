// ARQUITETURA 4B: keyboard input for map tools and selected-token movement.
export function createMapKeyboardHandler({ state, closeTokenMenu, renderTokens, renderTokenHud, updateSelectedMove, drawOnce, setTool, sceneSize, snap, canMove, moveTokenGroup, status }) {
  return function onKeyDown(event) {
    const target = event.target;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') { closeTokenMenu(); state.selected = null; state.selectedIds = []; renderTokens(); renderTokenHud(); updateSelectedMove(); drawOnce(); return; }
    const tools = { m: 'select', p: 'pan', r: 'measure', a: 'template', w: 'wall', c: 'prop', l: 'light', o: 'fog', t: 'terrain', d: 'drawing', n: 'pin' };
    if (tools[key] && (!['w', 'c', 'l', 'o', 't', 'd', 'n'].includes(key) || state.canEdit)) { event.preventDefault(); setTool(tools[key]); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta || !state.selectedIds.length) return;
    event.preventDefault();
    const gridSize = sceneSize().g, selected = state.tokens.filter(token => state.selectedIds.includes(token.id) && canMove(token));
    if (!selected.length) return;
    for (const token of selected) { const next = snap({ x: token.x + delta[0] * gridSize, y: token.y + delta[1] * gridSize }); token.x = next.x; token.y = next.y; }
    moveTokenGroup(selected).catch(error => status(error.message || 'movimento indisponivel', 'err'));
    drawOnce();
  };
}
