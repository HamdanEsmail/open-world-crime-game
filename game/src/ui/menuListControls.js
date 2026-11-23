// The way every KHAMSIN menu list behaves: a column of options in heavy capitals that answers the
// mouse (hover to focus, click to choose) and the keyboard (arrows or W/S to move, Enter to choose),
// marks the focused option with a gold star, and plays the menu sounds.
import { eightPointStarPath } from './hudIconLibrary.js';
import { createElement, setText } from './uiElements.js';

/**
 * Build a list of options in `container`.
 * @param {Object} game
 * @param {Element} container
 * @param {{id:string, label:string, hint?:string, disabled?:boolean, onSelect?:Function, onFocus?:Function}[]} items
 * @param {{className?:string, onFocus?:Function}} [options]
 * @returns {{element:Element, handleKey(code:string):boolean, setItems(items:Array):void, focus(index:number):void, focusedItem():Object, index:number}}
 */
export function createMenuList(game, container, items, options = {}) {
  const element = createElement('div', `menu-list ${options.className || ''}`, container);
  element.setAttribute('role', 'menu');
  const list = { element, handleKey, setItems, focus, focusedItem, index: 0, items: [] };
  let buttons = [];

  /** Replace the options (keeps the focus on the same id when it still exists). */
  function setItems(nextItems) {
    const keepId = list.items[list.index] ? list.items[list.index].id : null;
    list.items = nextItems;
    element.textContent = '';
    buttons = nextItems.map((item, index) => {
      const button = createElement('button', 'menu-item', element);
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.innerHTML = `<svg class="menu-item-star" viewBox="0 0 20 20" aria-hidden="true"><path d="${STAR}"/></svg>`;
      const label = createElement('span', 'menu-item-label', button, item.label);
      if (item.hint) createElement('span', 'menu-item-hint', button, item.hint);
      if (item.disabled) button.classList.add('is-disabled');
      button.__label = label;
      button.addEventListener('mouseenter', () => focus(index, true));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        focus(index, false);
        choose();
      });
      return button;
    });
    let start = keepId ? nextItems.findIndex((item) => item.id === keepId) : -1;
    if (start < 0) start = nextItems.findIndex((item) => !item.disabled);
    focus(Math.max(0, start), false, true);
  }

  /** Move the focus to an option (skips nothing: disabled options can be focused but not chosen). */
  function focus(index, withSound = true, silent = false) {
    if (!buttons.length) return;
    const next = ((index % buttons.length) + buttons.length) % buttons.length;
    if (next === list.index && buttons[next].classList.contains('is-focused')) return;
    if (buttons[list.index]) buttons[list.index].classList.remove('is-focused');
    list.index = next;
    buttons[next].classList.add('is-focused');
    if (withSound && !silent) game.audio?.play?.('menuMove');
    const item = list.items[next];
    if (item && item.onFocus) item.onFocus(item);
    if (options.onFocus) options.onFocus(item, next);
  }

  function choose() {
    const item = list.items[list.index];
    if (!item) return;
    if (item.disabled) {
      game.audio?.play?.('menuBack');
      buttons[list.index].classList.remove('is-refused');
      void buttons[list.index].offsetWidth;
      buttons[list.index].classList.add('is-refused');
      return;
    }
    game.audio?.play?.('menuSelect');
    if (item.onSelect) item.onSelect(item);
  }

  /** Arrows / W S move, Enter / Space choose. Returns true when the key was used. */
  function handleKey(code) {
    if (code === 'ArrowUp' || code === 'KeyW') {
      focus(list.index - 1);
      return true;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      focus(list.index + 1);
      return true;
    }
    if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
      choose();
      return true;
    }
    return false;
  }

  function focusedItem() {
    return list.items[list.index] || null;
  }

  /** Change one option's label in place (a toggle, a count). */
  list.relabel = (id, text) => {
    const index = list.items.findIndex((item) => item.id === id);
    if (index >= 0 && buttons[index]) setText(buttons[index].__label, text);
  };

  setItems(items);
  return list;
}

/**
 * A titled panel with a gold rule, used for the sub-screens (controls, settings, saves ...).
 * Returns { element, body }.
 */
export function createMenuPanel(container, title, kicker) {
  const element = createElement('section', 'menu-panel', container);
  const head = createElement('header', 'menu-panel-head', element);
  if (kicker) createElement('div', 'menu-panel-kicker', head, kicker);
  createElement('h2', 'menu-panel-title', head, title);
  const rule = createElement('div', 'menu-rule', head);
  rule.innerHTML = `<i></i><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${STAR}"/></svg><i></i>`;
  const body = createElement('div', 'menu-panel-body', element);
  return { element, body };
}

/** The thin gold rule with a star in the middle, as markup. */
export function goldRuleMarkup(className = 'menu-rule') {
  return `<div class="${className}"><i></i><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${STAR}"/></svg><i></i></div>`;
}

const STAR = eightPointStarPath(10, 10, 9.4);
