// The wanted level, top right and large: five eight-pointed stars that fill in sand gold one by
// one as the PSPD's interest grows. They pop in as they are earned, flash red and blue while a
// pursuit is on, blink slowly while the police search, and vanish when the heat is off.
import { eightPointStarPath } from './hudIconLibrary.js';
import { createElement, setText, setClass, replayClass } from './uiElements.js';
import { wantedStarsShown, wantedStarsMode } from './hudAndMenuGuide.js';

/**
 * Build the stars in `container` (#hud-wanted-stars).
 * @returns {{update():void, level:number}}
 */
export function createWantedStarsDisplay(game, container) {
  const maxStars = game.config?.wanted?.maxStars || 5;
  const label = createElement('div', 'wanted-label', container);
  const lightbar = createElement('span', 'wanted-lightbar', label);
  createElement('i', 'wanted-lightbar-red', lightbar);
  createElement('i', 'wanted-lightbar-blue', lightbar);
  const labelText = createElement('span', 'wanted-label-text', label, 'PSPD');
  const row = createElement('div', 'wanted-row', container);
  const starPath = eightPointStarPath(20, 20, 18.5);
  const stars = [];
  for (let i = 0; i < maxStars; i += 1) {
    const holder = createElement('span', 'wanted-star', row);
    holder.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="wanted-star-shape" d="${starPath}"/><circle class="wanted-star-eye" cx="20" cy="20" r="4.4"/></svg>`;
    stars.push(holder);
  }
  const meter = createElement('div', 'wanted-meter', container);
  const meterFill = createElement('i', 'wanted-meter-fill', meter);
  const display = { update, level: 0 };
  let shownLevel = -1;
  let shownState = '';
  let shownMeter = -1;

  /** Follow game.wanted: level 0..5 and state 'clear' | 'pursuit' | 'search'. */
  function update() {
    const wanted = game.wanted;
    const level = wanted ? wantedStarsShown(wanted.level, maxStars) : 0;
    const state = wantedStarsMode(level, wanted && wanted.state);
    if (level !== shownLevel) {
      for (let i = 0; i < stars.length; i += 1) {
        const on = i < level;
        setClass(stars[i], 'is-on', on);
        if (on && i >= shownLevel && shownLevel >= 0) {
          stars[i].style.animationDelay = `${(i - Math.max(0, shownLevel)) * 0.12}s`;
          replayClass(stars[i], 'is-popping', 0.9);
        }
      }
      if (level < shownLevel && level > 0) replayClass(row, 'is-dropping', 0.6);
      setClass(container, 'is-wanted', level > 0);
      shownLevel = level;
      display.level = level;
    }
    if (state !== shownState) {
      container.dataset.state = state;
      setText(labelText, state === 'search' ? 'PSPD SEARCHING' : state === 'pursuit' ? 'PSPD PURSUIT' : 'PSPD');
      shownState = state;
    }
    // Under the stars: heat building toward the next star in a pursuit, or the search running out.
    let fraction = 0;
    if (state === 'search' && typeof wanted.searchProgress === 'number') fraction = 1 - wanted.searchProgress;
    else if (state === 'pursuit' && typeof wanted.heat === 'number') fraction = level >= maxStars ? 1 : wanted.heat;
    const step = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    if (step !== shownMeter) {
      shownMeter = step;
      meterFill.style.width = `${step}%`;
    }
  }

  return display;
}
