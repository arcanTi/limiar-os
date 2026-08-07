export function chipStyle(active) {
  return 'lm-chip' + (active ? ' lm-chip--active' : '');
}

export function dieStyle(active) {
  return 'lm-die-btn' + (active ? ' lm-die-btn--active' : '');
}

export function viewStyle(active) {
  return 'lm-view-btn' + (active ? ' lm-view-btn--active' : '');
}

export function langBtnStyle(active, hasLeftBorder) {
  return 'lm-lang-btn' + (hasLeftBorder ? ' lm-lang-btn--left' : '') + (active ? ' lm-lang-btn--active' : '');
}

export function pageBtnStyle(active, disabled) {
  return 'lm-page-btn' + (disabled ? ' lm-page-btn--disabled' : active ? ' lm-page-btn--active' : '');
}

export function toggleRow(on) {
  return 'lm-toggle-row' + (on ? ' lm-toggle-row--on' : '');
}

export function gameTabStyle(active, accent) {
  return 'lm-game-tab' + (active ? (accent === '#3fe0d0' ? ' lm-game-tab--active-teal' : ' lm-game-tab--active-gold') : '');
}
