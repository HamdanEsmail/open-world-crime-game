// Small DOM and number helpers shared by every HUD piece and screen of KHAMSIN: build elements,
// write text only when it changes (so the HUD never thrashes layout), and format money, time,
// distance and key names the way Port Sarab prints them.
import { formatMoney, formatClock } from './hudAndMenuGuide.js';

export { formatMoney, formatClock };

/**
 * Create an element with a class and optional text, appended to `parent` when given.
 * @param {string} tag @param {string} [className] @param {Element} [parent] @param {string} [text]
 */
export function createElement(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

/** Write a node's text only when it differs from what is shown (keeps style recalculation away). */
export function setText(node, value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (node.__shownText !== text) {
    node.__shownText = text;
    node.textContent = text;
  }
}

/** Toggle a class only when its state changes. */
export function setClass(node, className, on) {
  const flag = `__class_${className}`;
  const state = Boolean(on);
  if (node[flag] === state) return;
  node[flag] = state;
  node.classList.toggle(className, state);
}

/** Show or hide a node through its `hidden` attribute, touching the DOM only on change. */
export function setShown(node, shown) {
  const hidden = !shown;
  if (node.__hiddenState === hidden) return;
  node.__hiddenState = hidden;
  node.hidden = hidden;
}

/** Set one CSS custom property or style field only when its value changes. */
export function setStyle(node, property, value) {
  const key = `__style_${property}`;
  if (node[key] === value) return;
  node[key] = value;
  if (property.startsWith('--')) node.style.setProperty(property, value);
  else node.style[property] = value;
}

/** Restart a CSS animation class (a pop, a flash) on a node. */
export function replayClass(node, className, seconds = 0.6) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  clearTimeout(node[`__replay_${className}`]);
  node[`__replay_${className}`] = setTimeout(() => node.classList.remove(className), seconds * 1000);
}

/**
 * Paint a fine sand-grain texture once and publish it as the CSS variable --sand-grain, laid over
 * the night-blue panels of the HUD and the menus so they feel printed rather than flat.
 */
export function applySandGrainTexture() {
  const root = document.documentElement;
  if (root.__sandGrainApplied) return;
  root.__sandGrainApplied = true;
  try {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    let seed = 1337;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 2600; i += 1) {
      const light = random() < 0.55;
      ctx.fillStyle = light ? `rgba(255,236,190,${0.05 + random() * 0.07})` : `rgba(0,0,0,${0.08 + random() * 0.1})`;
      ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), random() < 0.2 ? 2 : 1, 1);
    }
    root.style.setProperty('--sand-grain', `url(${canvas.toDataURL('image/png')})`);
  } catch (error) {
    root.style.setProperty('--sand-grain', 'none');
  }
}

/** '+$500' or '-$300'. */
export function formatMoneyDelta(delta) {
  const value = Math.round(Number(delta) || 0);
  return `${value >= 0 ? '+' : '-'}${formatMoney(Math.abs(value))}`;
}

/** A countdown: 102.4 -> '01:42'. */
export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? '0' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}

/** '640 m' or '1.4 km'. */
export function formatDistance(metres) {
  const d = Math.max(0, Number(metres) || 0);
  if (d < 1000) return `${Math.round(d / 10) * 10} m`;
  return `${(d / 1000).toFixed(1)} km`;
}

/** 'Kestrel Sirocco GT' -> 'KESTREL SIROCCO GT'; ids like 'hornet_pistol' -> 'Hornet Pistol'. */
export function titleFromId(id) {
  return String(id || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** How a key code is printed on a key cap: 'KeyW' -> 'W', 'Mouse0' -> 'LMB', 'ArrowUp' -> the arrow. */
export function keyCapLabel(code) {
  if (!code) return '';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** Build a key cap element: <kbd class="key-cap">F</kbd>. */
export function createKeyCap(code, parent) {
  const cap = createElement('kbd', 'key-cap', parent, keyCapLabel(code));
  if (cap.textContent.length > 2) cap.classList.add('key-cap--wide');
  return cap;
}

const KEY_NAMES = {
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Bksp',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
