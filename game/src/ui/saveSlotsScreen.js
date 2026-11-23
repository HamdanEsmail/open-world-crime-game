// The save and load screens: the autosave and three save slots as cards with what each holds
// (job, time, cash). Saving asks the save system through 'menu:save'; loading goes back to the
// director, which closes the menus and emits 'menu:load'.
import { createMenuPanel, createMenuList } from './menuListControls.js';
import { createElement, setText } from './uiElements.js';

/**
 * Build a save or load panel in `container`.
 * @param {'save'|'load'} mode
 * @param {{onLoad?(slot:any):void}} [callbacks]
 * @returns {{element:Element, handleKey(code:string):boolean, refresh():void}}
 */
export function createSaveSlotsPanel(game, container, mode, callbacks = {}) {
  const panel = createMenuPanel(container, mode === 'save' ? 'Save Game' : 'Load Game', mode === 'save' ? 'WRITE YOUR PROGRESS' : 'PICK UP WHERE YOU LEFT OFF');
  panel.element.classList.add('saves-panel');
  const list = createMenuList(game, panel.body, [], { className: 'save-list' });
  const status = createElement('div', 'saves-status', panel.body);

  /** Re-read the slots from the save system. */
  function refresh() {
    const slots = readSlots(game);
    list.setItems(slots.map((slot) => {
      const isAuto = slot.auto || slot.slot === 'auto' || slot.slot === 'autosave';
      const disabled = mode === 'save' ? isAuto : !slot.exists;
      return {
        id: String(slot.slot),
        label: slot.label || (isAuto ? 'Autosave' : `Slot ${slot.slot}`),
        hint: slot.exists ? slot.detail || 'Saved game' : mode === 'save' ? 'Empty: save here' : 'Empty',
        disabled,
        onSelect: () => choose(slot),
      };
    }));
    setText(status, mode === 'save' ? 'The autosave is written by the game after every job.' : '');
  }

  function choose(slot) {
    if (mode === 'save') {
      game.events.emit('menu:save', { slot: slot.slot });
      setText(status, `Saved to ${slot.label || `slot ${slot.slot}`}.`);
      status.classList.remove('is-flash');
      void status.offsetWidth;
      status.classList.add('is-flash');
      setTimeout(refresh, 60);
    } else if (callbacks.onLoad) {
      callbacks.onLoad(slot.slot);
    }
  }

  refresh();
  return { element: panel.element, handleKey: list.handleKey, refresh };
}

/** The save system's slots, or empty stand-ins while there is none. */
function readSlots(game) {
  const listed = game.save && game.save.listSlots ? game.save.listSlots() : null;
  if (Array.isArray(listed) && listed.length) return listed;
  return [
    { slot: 'auto', exists: false, label: 'Autosave', detail: '', auto: true },
    { slot: 1, exists: false, label: 'Slot 1', detail: '' },
    { slot: 2, exists: false, label: 'Slot 2', detail: '' },
    { slot: 3, exists: false, label: 'Slot 3', detail: '' },
  ];
}
