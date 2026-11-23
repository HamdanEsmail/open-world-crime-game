// The pause menu: the frozen city behind a blurred night-blue veil, a header with cash, REP, the
// clock and the district, the options down the left (Resume, Map, Jobs, Stats, Save, Load,
// Controls, Settings, Quit to Title) and the chosen page on the right, plus the frame rate.
import { createMenuList, createMenuPanel } from './menuListControls.js';
import { createJobsLogPanel } from './jobsLogScreen.js';
import { createStatsPanel } from './statsScreen.js';
import { createSaveSlotsPanel } from './saveSlotsScreen.js';
import { createControlsHelpPanel } from './controlsHelpScreen.js';
import { createSettingsPanel } from './settingsScreen.js';
import { createElement, createKeyCap, setText, formatMoney, formatClock, titleFromId } from './uiElements.js';
import { eightPointStarPath } from './hudIconLibrary.js';
import { playerPosition } from './gpsRoute.js';

/**
 * Build the pause menu in `root` (#pause-menu).
 * @param {Object} director  close(name), openMap(), quitToTitle(), finishLoad(slot)
 * @returns {{name:string, open():void, close():void, handleKey(code:string):boolean, pauses:boolean, coversHud:boolean}}
 */
export function createPauseMenuScreen(game, root, director) {
  root.textContent = '';
  root.classList.add('pause-menu');
  createElement('div', 'pause-veil', root);
  const frame = createElement('div', 'pause-frame', root);
  const header = createElement('header', 'pause-header', frame);
  const brand = createElement('div', 'pause-brand', header);
  brand.innerHTML = `<svg class="pause-brand-star" viewBox="0 0 20 20" aria-hidden="true"><path d="${eightPointStarPath(10, 10, 9.4)}"/></svg><span class="pause-brand-name">KHAMSIN</span><span class="pause-brand-sub">PORT SARAB</span>`;
  createElement('div', 'pause-title', header, 'PAUSED');
  const chips = createElement('div', 'pause-chips', header);
  const cashChip = chip(chips, 'CASH');
  const repChip = chip(chips, 'REP');
  const clockChip = chip(chips, 'TIME');
  const placeChip = chip(chips, 'DISTRICT');
  const body = createElement('div', 'pause-body', frame);
  const nav = createElement('nav', 'pause-nav', body);
  const detail = createElement('div', 'pause-detail', body);
  const footer = createElement('footer', 'pause-footer', frame);
  const hints = createElement('div', 'menu-key-hints', footer);
  addHint(hints, ['ArrowUp', 'ArrowDown'], 'Choose');
  addHint(hints, ['Enter'], 'Open');
  addHint(hints, ['Escape'], 'Back / resume');
  addHint(hints, ['KeyM'], 'Map');
  const fps = createElement('div', 'pause-fps', footer, '-- FPS');

  const pages = {};
  const screen = { name: 'pause', open, close, handleKey, pauses: true, coversHud: true };
  let pageActive = false;
  let current = null;
  let fpsTimer = 0;

  const list = createMenuList(game, nav, [
    { id: 'resume', label: 'Resume', onSelect: () => director.close('pause') },
    { id: 'map', label: 'Map', onSelect: () => director.openMap() },
    { id: 'jobs', label: 'Jobs' },
    { id: 'stats', label: 'Stats' },
    { id: 'save', label: 'Save Game', onSelect: () => enterPage() },
    { id: 'load', label: 'Load Game', onSelect: () => enterPage() },
    { id: 'controls', label: 'Controls' },
    { id: 'settings', label: 'Settings', onSelect: () => enterPage() },
    { id: 'quit', label: 'Quit to Title', onSelect: () => enterPage() },
  ], { className: 'pause-list', onFocus: (item) => showPage(item.id) });

  /** Show the page for a menu option on the right (built once, refreshed each time). */
  function showPage(id) {
    leavePage();
    if (current) current.element.hidden = true;
    let page = pages[id];
    if (!page) {
      if (id === 'resume') page = createResumeCard(game, detail);
      else if (id === 'map') page = createInfoCard(detail, 'City Map', 'PORT SARAB AT A GLANCE', 'Every district, shop and job on one sheet. Drag to pan, scroll to zoom, click to drop a waypoint the GPS will follow.', 'Open the map');
      else if (id === 'jobs') page = createJobsLogPanel(game, detail);
      else if (id === 'stats') page = createStatsPanel(game, detail);
      else if (id === 'save') page = createSaveSlotsPanel(game, detail, 'save');
      else if (id === 'load') page = createSaveSlotsPanel(game, detail, 'load', { onLoad: (slot) => director.finishLoad(slot) });
      else if (id === 'controls') page = createControlsHelpPanel(game, detail);
      else if (id === 'settings') page = createSettingsPanel(game, detail);
      else if (id === 'quit') page = createQuitCard(game, detail, director, () => leavePage());
      pages[id] = page;
    }
    page.element.hidden = false;
    if (page.refresh) page.refresh();
    current = page;
    current.id = id;
    current.interactive = INTERACTIVE_PAGES.has(id);
  }

  function enterPage() {
    if (!current || !current.interactive) return;
    pageActive = true;
    root.classList.add('is-in-page');
  }

  function leavePage() {
    pageActive = false;
    root.classList.remove('is-in-page');
  }

  function refreshHeader() {
    const economy = game.economy || {};
    setText(cashChip, formatMoney(economy.money || 0));
    setText(repChip, typeof economy.rank === 'number' ? `${economy.rank} ${economy.rankName || ''}`.trim() : economy.rankName || economy.rank || '-');
    setText(clockChip, formatClock(game.time ? game.time.hour : 12));
    const pos = playerPosition(game);
    const district = pos && game.city && game.city.districtAt ? game.city.districtAt(pos.x, pos.z) : null;
    setText(placeChip, district ? district.name : '-');
  }

  function open() {
    root.hidden = false;
    refreshHeader();
    list.focus(0, false, true);
    showPage('resume');
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
    clearInterval(fpsTimer);
    const tick = () => setText(fps, `${game.time ? game.time.fps : 0} FPS`);
    tick();
    fpsTimer = setInterval(tick, 500);
  }

  function close() {
    root.hidden = true;
    clearInterval(fpsTimer);
    leavePage();
  }

  function handleKey(code) {
    if (pageActive) {
      if (code === 'Escape' || code === 'Backspace' || ((code === 'ArrowLeft' || code === 'KeyA') && current.id !== 'settings')) {
        game.audio?.play?.('menuBack');
        leavePage();
        return true;
      }
      current.handleKey(code);
      return true;
    }
    if (code === 'Escape' || code === 'KeyP') {
      game.audio?.play?.('menuBack');
      director.close('pause');
      return true;
    }
    if (code === 'KeyM') {
      director.openMap();
      return true;
    }
    if ((code === 'ArrowRight' || code === 'KeyD') && current && current.interactive) {
      enterPage();
      return true;
    }
    return list.handleKey(code);
  }

  return screen;
}

/** The first page: what Zayd is doing right now. */
function createResumeCard(game, container) {
  const panel = createMenuPanel(container, 'Back to the streets', 'RESUME');
  panel.element.classList.add('resume-panel');
  const job = createElement('div', 'resume-job', panel.body);
  const text = createElement('p', 'resume-text', panel.body);
  function refresh() {
    const story = game.missions && game.missions.active;
    const active = story || (game.activities && game.activities.active);
    job.textContent = '';
    if (active) {
      createElement('div', 'resume-job-kicker', job, story ? 'CURRENT JOB' : 'SIDE JOB');
      createElement('div', 'resume-job-title', job, (active.title || titleFromId(active.id)).toUpperCase());
      const next = (active.objectives || []).find((o) => !o.done && !o.optional);
      if (next) createElement('div', 'resume-job-step', job, next.text);
    }
    const wanted = game.wanted && game.wanted.level > 0 ? `${game.wanted.level}-star heat is still on you. ` : '';
    setText(text, `${wanted}The city waits, frozen in the heat. Press Escape to drive on.`);
  }
  refresh();
  return { element: panel.element, refresh };
}

/** A short card for options that act at once (Map). */
function createInfoCard(container, title, kicker, body, action) {
  const panel = createMenuPanel(container, title, kicker);
  createElement('p', 'info-text', panel.body, body);
  createElement('div', 'info-action', panel.body, `Enter: ${action}`);
  return { element: panel.element };
}

/** Quit to the title, after a confirmation. */
function createQuitCard(game, container, director, back) {
  const panel = createMenuPanel(container, 'Quit to Title', 'LEAVE PORT SARAB');
  createElement('p', 'info-text', panel.body, 'Anything since your last save will be lost. The autosave keeps the start of the current job.');
  const list = createMenuList(game, panel.body, [
    { id: 'quit', label: 'Quit to title', onSelect: () => director.quitToTitle() },
    { id: 'stay', label: 'Stay in the city', onSelect: () => back() },
  ], { className: 'confirm-list' });
  return { element: panel.element, handleKey: list.handleKey, refresh: () => list.focus(1, false, true) };
}

/** Pages whose own list takes the keys once entered. */
const INTERACTIVE_PAGES = new Set(['save', 'load', 'settings', 'quit']);

function chip(container, label) {
  const node = createElement('div', 'pause-chip', container);
  createElement('span', 'pause-chip-label', node, label);
  return createElement('span', 'pause-chip-value', node, '-');
}

function addHint(container, codes, text) {
  const hint = createElement('span', 'menu-key-hint', container);
  for (const code of codes) createKeyCap(code, hint);
  createElement('span', 'menu-key-hint-text', hint, text);
}
