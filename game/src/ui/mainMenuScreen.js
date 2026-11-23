// The title screen of KHAMSIN: the name in huge spaced capitals with PORT SARAB beneath, a thin
// gold rule and star, laid over the live city on a night-blue gradient: Continue, New Game, Load
// Game, Controls, Settings and Credits, with the sub-screens opening on the right.
import { createMenuList, createMenuPanel, goldRuleMarkup } from './menuListControls.js';
import { createControlsHelpPanel } from './controlsHelpScreen.js';
import { createSettingsPanel } from './settingsScreen.js';
import { createSaveSlotsPanel } from './saveSlotsScreen.js';
import { createElement, createKeyCap } from './uiElements.js';
import { eightPointStarPath } from './hudIconLibrary.js';

/**
 * Build the title screen in `root` (#main-menu).
 * @param {Object} director  the menu director: finishMainMenu(eventName, payload)
 * @returns {{name:string, open():void, close():void, handleKey(code:string):boolean, pauses:boolean, coversHud:boolean}}
 */
export function createMainMenuScreen(game, root, director) {
  root.textContent = '';
  root.classList.add('main-menu');
  createElement('div', 'main-menu-shade', root);
  const emblem = createElement('div', 'main-menu-emblem', root);
  emblem.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true"><path d="${eightPointStarPath(100, 100, 96)}"/><path d="${eightPointStarPath(100, 100, 70)}"/><circle cx="100" cy="100" r="30"/></svg>`;
  const column = createElement('div', 'main-menu-column', root);
  const brand = createElement('div', 'brand', column);
  brand.innerHTML = `<div class="brand-kicker">AN UNDERCOVER WHEELMAN. A CITY BUILT ON A MIRAGE.</div>
    <h1 class="brand-title">KHAMSIN</h1>${goldRuleMarkup('brand-rule')}<div class="brand-subtitle">PORT SARAB</div>`;
  const nav = createElement('nav', 'main-menu-nav', column);
  const list = createMenuList(game, nav, [], { className: 'main-menu-list' });
  const footer = createElement('div', 'main-menu-footer', column);
  const hints = createElement('div', 'menu-key-hints', footer);
  addHint(hints, ['ArrowUp', 'ArrowDown'], 'Choose');
  addHint(hints, ['Enter'], 'Confirm');
  addHint(hints, ['Escape'], 'Back');
  createElement('div', 'main-menu-note', footer, 'An original game. Every name, place and sound here is invented.');
  const side = createElement('div', 'main-menu-side', root);
  const screen = { name: 'main', open, close, handleKey, pauses: false, coversHud: true };
  let sub = null;

  function items() {
    const result = [];
    const hasSave = Boolean(game.save && game.save.hasAny && game.save.hasAny());
    if (hasSave) result.push({ id: 'continue', label: 'Continue', hint: 'Back to the streets', onSelect: () => director.finishMainMenu('menu:continue', {}) });
    result.push({ id: 'new', label: 'New Game', hint: 'Begin the khamsin job', onSelect: () => director.finishMainMenu('menu:newGame', {}) });
    result.push({ id: 'load', label: 'Load Game', onSelect: () => openSub('load') });
    result.push({ id: 'controls', label: 'Controls', onSelect: () => openSub('controls') });
    result.push({ id: 'settings', label: 'Settings', onSelect: () => openSub('settings') });
    result.push({ id: 'credits', label: 'Credits', onSelect: () => openSub('credits') });
    return result;
  }

  /** Open a sub-screen on the right; keys go to it until Escape. */
  function openSub(kind) {
    closeSub();
    if (kind === 'load') sub = createSaveSlotsPanel(game, side, 'load', { onLoad: (slot) => director.finishMainMenu('menu:load', { slot }) });
    else if (kind === 'controls') sub = createControlsHelpPanel(game, side);
    else if (kind === 'settings') sub = createSettingsPanel(game, side);
    else sub = createCreditsPanel(side);
    sub.kind = kind;
    side.classList.add('is-open');
    root.classList.add('has-sub');
  }

  function closeSub() {
    if (!sub) return;
    sub.element.remove();
    sub = null;
    side.classList.remove('is-open');
    root.classList.remove('has-sub');
  }

  function open() {
    list.setItems(items());
    list.focus(0, false, true);
    closeSub();
    root.hidden = false;
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
  }

  function close() {
    closeSub();
    root.hidden = true;
  }

  function handleKey(code) {
    if (sub) {
      if (code === 'Escape' || code === 'Backspace') {
        game.audio?.play?.('menuBack');
        closeSub();
        return true;
      }
      sub.handleKey(code);
      return true;
    }
    return list.handleKey(code);
  }

  return screen;
}

/** The credits: what KHAMSIN is, and the promise that all of it is invented. */
function createCreditsPanel(container) {
  const panel = createMenuPanel(container, 'Credits', 'KHAMSIN: PORT SARAB');
  panel.element.classList.add('credits-panel');
  createElement('p', 'credits-lead', panel.body, 'An original game. Every name, place and sound here is invented.');
  const lines = [
    ['The city', 'Port Sarab, its eight districts, the Vane Spire and the Amber Dunes'],
    ['The crew', 'Zayd "Dust" Karam, Mina Okoro, "Uncle" Faris Haddad, Tavi Rourke'],
    ['The law', 'Captain Rasha Dahan and the Port Sarab Police Department'],
    ['Made with', 'Plain JavaScript, three.js, and sound synthesised in the browser'],
  ];
  for (const [role, text] of lines) {
    const row = createElement('div', 'credits-row', panel.body);
    createElement('span', 'credits-role', row, role.toUpperCase());
    createElement('span', 'credits-text', row, text);
  }
  return { element: panel.element, handleKey: () => false };
}

function addHint(container, codes, text) {
  const hint = createElement('span', 'menu-key-hint', container);
  for (const code of codes) createKeyCap(code, hint);
  createElement('span', 'menu-key-hint-text', hint, text);
}
