// The in-game clock of Port Sarab, top right under the cash: a 24-hour time with a tiny sun, a
// low dusk sun, a moon, or the wavy lines of a khamsin sandstorm when the wind is blowing sand.
import { skyIconSvg } from './hudIconLibrary.js';
import { createElement, setText } from './uiElements.js';
import { formatClock } from './hudAndMenuGuide.js';

/**
 * Build the clock in `container` (#hud-clock-weather).
 * @returns {{update():void}}
 */
export function createClockWeatherDisplay(game, container) {
  const icon = createElement('span', 'clock-icon', container);
  const time = createElement('span', 'clock-time', container, '00:00');
  const storm = createElement('span', 'clock-storm', container);
  let shownSky = '';

  /** Rewrite the time once per in-game minute and the icon when the sky changes. */
  function update() {
    const hour = game.time ? game.time.hour : 12;
    setText(time, formatClock(hour));
    const sandstorm = game.weather ? game.weather.sandstorm || 0 : 0;
    const sky = sandstorm > 0.3 ? 'sandstorm' : hour < 5.4 || hour >= 20.2 ? 'moon' : hour < 7 || hour >= 17.6 ? 'dusk' : 'sun';
    if (sky !== shownSky) {
      icon.innerHTML = skyIconSvg(sky);
      icon.dataset.sky = sky;
      shownSky = sky;
    }
    setText(storm, sandstorm > 0.3 ? 'KHAMSIN' : '');
  }

  return { update };
}
