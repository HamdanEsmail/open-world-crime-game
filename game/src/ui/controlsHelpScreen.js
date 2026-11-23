// The controls screen: every action of KHAMSIN beside its key caps, in two columns, built from the
// game's own key table (game.keyBindings and game.actionLabels) so it can never disagree with play.
import { createMenuPanel } from './menuListControls.js';
import { createElement, createKeyCap, keyCapLabel } from './uiElements.js';

/**
 * Build the controls panel in `container`.
 * @returns {{element:Element, handleKey():boolean, refresh():void}}
 */
export function createControlsHelpPanel(game, container) {
  const panel = createMenuPanel(container, 'Controls', 'KEYBOARD AND MOUSE');
  panel.element.classList.add('controls-panel');
  const grid = createElement('div', 'controls-grid', panel.body);

  function refresh() {
    grid.textContent = '';
    const bindings = game.keyBindings || {};
    const labels = game.actionLabels || {};
    const rows = [{ codes: ['Mouse'], label: 'Look around and aim (move the mouse)' }];
    for (const action of ACTION_ORDER) {
      if (!bindings[action]) continue;
      rows.push({ codes: uniqueCaps(bindings[action]), label: labels[action] || action });
    }
    for (const action of Object.keys(bindings)) {
      if (ACTION_ORDER.includes(action)) continue;
      rows.push({ codes: uniqueCaps(bindings[action]), label: labels[action] || action });
    }
    for (const row of rows) {
      const line = createElement('div', 'controls-row', grid);
      const caps = createElement('span', 'controls-caps', line);
      row.codes.forEach((code, i) => {
        if (i > 0) createElement('span', 'controls-or', caps, '/');
        if (code === 'Mouse') createElement('kbd', 'key-cap key-cap--wide', caps, 'Mouse');
        else createKeyCap(code, caps);
      });
      createElement('span', 'controls-label', line, row.label);
    }
  }

  refresh();
  return { element: panel.element, handleKey: () => false, refresh };
}

/** Key codes with the same printed cap (left and right Shift) shown once. */
function uniqueCaps(codes) {
  const seen = new Set();
  const result = [];
  for (const code of codes) {
    const label = keyCapLabel(code);
    if (seen.has(label)) continue;
    seen.add(label);
    result.push(code);
  }
  return result;
}

/** On foot first, then driving, then the screens. */
const ACTION_ORDER = [
  'moveForward', 'moveBack', 'moveLeft', 'moveRight', 'sprint', 'jump', 'crouch', 'interact', 'enterVehicle',
  'fire', 'aim', 'reload', 'nextWeapon', 'previousWeapon', 'weaponWheel',
  'handbrake', 'horn', 'headlights', 'nextRadio', 'lookBehind', 'changeCamera',
  'phone', 'map', 'pause', 'quickSave',
];
