// The settings screen: master, music and effects volume, mouse sensitivity, invert-Y and graphics
// quality. Choices live on game.settings, reach the audio at once and are announced with
// 'settings:changed' (the save system keeps them between visits).
import { createMenuPanel } from './menuListControls.js';
import { createElement, setText, setClass } from './uiElements.js';

/**
 * Make sure game.settings holds every field with a sane value, and apply the volumes.
 * @returns {Object} the settings
 */
export function loadSettings(game) {
  if (!game.settings) game.settings = {};
  const settings = game.settings;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const fallback = DEFAULT_SETTINGS[key];
    if (typeof fallback === 'number' && !Number.isFinite(settings[key])) settings[key] = fallback;
    else if (typeof settings[key] !== typeof fallback) settings[key] = fallback;
  }
  game.audio?.setVolumes?.({ master: settings.master, music: settings.music, effects: settings.effects });
  return settings;
}

/**
 * Build the settings panel in `container`.
 * @returns {{element:Element, handleKey(code:string):boolean, refresh():void, focusRow(i:number):void}}
 */
export function createSettingsPanel(game, container) {
  const settings = loadSettings(game);
  const panel = createMenuPanel(container, 'Settings', 'SOUND, CONTROLS AND PICTURE');
  panel.element.classList.add('settings-panel');
  const rows = ROWS.map((spec, index) => buildRow(spec, index));
  const result = { element: panel.element, handleKey, refresh, focusRow, active: false };
  let focused = 0;

  function buildRow(spec, index) {
    const row = createElement('div', 'settings-row', panel.body);
    createElement('span', 'settings-label', row, spec.label);
    const control = createElement('div', 'settings-control', row);
    const value = createElement('span', 'settings-value', row);
    let input = null;
    if (spec.kind === 'slider') {
      input = createElement('input', 'settings-slider', control);
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.tabIndex = -1;
      input.addEventListener('input', () => change(spec, Number(input.value)));
    } else if (spec.kind === 'toggle' || spec.kind === 'choice') {
      const choices = spec.kind === 'toggle' ? [false, true] : spec.choices;
      for (const choice of choices) {
        const chip = createElement('button', 'settings-chip', control, spec.kind === 'toggle' ? (choice ? 'On' : 'Off') : choice.toUpperCase());
        chip.type = 'button';
        chip.tabIndex = -1;
        chip.__choice = choice;
        chip.addEventListener('click', () => change(spec, choice));
      }
    }
    row.addEventListener('mouseenter', () => focusRow(index, true));
    return { spec, row, input, value, control };
  }

  /** Store a new value, save it, and tell the game. */
  function change(spec, next) {
    let valueToStore = next;
    if (spec.kind === 'slider') valueToStore = Math.round(Math.min(spec.max, Math.max(spec.min, next)) * 100) / 100;
    if (settings[spec.key] === valueToStore) return;
    settings[spec.key] = valueToStore;
    if (VOLUME_KEYS.has(spec.key)) game.audio?.setVolumes?.({ master: settings.master, music: settings.music, effects: settings.effects });
    game.events.emit('settings:changed', { settings, key: spec.key });
    game.audio?.play?.('menuMove');
    refresh();
  }

  function refresh() {
    for (const { spec, input, value, control } of rows) {
      const current = settings[spec.key];
      if (spec.kind === 'slider') {
        if (input && Number(input.value) !== current) input.value = String(current);
        if (input) input.style.setProperty('--fill', `${((current - spec.min) / (spec.max - spec.min)) * 100}%`);
        setText(value, spec.format(current));
      } else {
        for (const chip of control.children) setClass(chip, 'is-chosen', chip.__choice === current);
        setText(value, '');
      }
    }
  }

  function focusRow(index, fromMouse = false) {
    const next = ((index % rows.length) + rows.length) % rows.length;
    if (next !== focused && !fromMouse) game.audio?.play?.('menuMove');
    rows[focused].row.classList.remove('is-focused');
    focused = next;
    rows[focused].row.classList.add('is-focused');
  }

  /** Up and down pick a row; left and right (or Enter) change it. */
  function handleKey(code) {
    const { spec } = rows[focused];
    if (code === 'ArrowUp' || code === 'KeyW') { focusRow(focused - 1); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { focusRow(focused + 1); return true; }
    const left = code === 'ArrowLeft' || code === 'KeyA';
    const right = code === 'ArrowRight' || code === 'KeyD';
    const enter = code === 'Enter' || code === 'Space';
    if (!left && !right && !enter) return false;
    const current = settings[spec.key];
    if (spec.kind === 'slider') change(spec, current + (left ? -spec.step : spec.step) * (enter ? 0 : 1));
    else if (spec.kind === 'toggle') change(spec, !current);
    else {
      const index = spec.choices.indexOf(current);
      const step = left ? -1 : 1;
      change(spec, spec.choices[(index + step + spec.choices.length) % spec.choices.length]);
    }
    return true;
  }

  refresh();
  focusRow(0, true);
  return result;
}

const percent = (value) => `${Math.round(value * 100)}%`;

const ROWS = [
  { key: 'master', label: 'Master volume', kind: 'slider', min: 0, max: 1, step: 0.05, format: percent },
  { key: 'music', label: 'Music and radio', kind: 'slider', min: 0, max: 1, step: 0.05, format: percent },
  { key: 'effects', label: 'Sound effects', kind: 'slider', min: 0, max: 1, step: 0.05, format: percent },
  { key: 'mouseSensitivity', label: 'Mouse sensitivity', kind: 'slider', min: 0.2, max: 3, step: 0.1, format: (v) => `${v.toFixed(1)}x` },
  { key: 'invertY', label: 'Invert mouse Y', kind: 'toggle' },
  { key: 'quality', label: 'Graphics quality', kind: 'choice', choices: ['low', 'medium', 'high'] },
];

/** The same defaults the game context starts with. */
const DEFAULT_SETTINGS = {
  master: 0.8,
  music: 0.6,
  effects: 0.9,
  mouseSensitivity: 1,
  invertY: false,
  quality: 'medium',
};

const VOLUME_KEYS = new Set(['master', 'music', 'effects']);
