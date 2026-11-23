// The big centre-screen lines of Port Sarab's side jobs: a race's 3, 2, 1, GO!, LAP 2, a STUNT
// JUMP's distance, a taxi FARE, a GOLDEN FALCON found. Gold for good news, cream for counts and
// laps, coral for a miss, with a smaller line beneath; each replaces the last and fades quickly.
import { createElement, setText, setShown } from './uiElements.js';

/**
 * Build the banner in `container` (a child of #hud, so it never takes the mouse or the keys) and
 * listen for 'activity:banner' {text, sub, kind, seconds} and 'activity:countdown' {count}.
 * @returns {{show(text:string, sub?:string, kind?:'good'|'info'|'bad', seconds?:number):void, update():void}}
 */
export function createActivityBanner(game, container) {
  const line = createElement('div', 'activity-line', container);
  const headline = createElement('div', 'activity-line-text', line);
  const sub = createElement('div', 'activity-line-sub', line);
  setShown(line, false);
  let hideAt = 0;
  let leaveAt = 0;
  let lastShownAt = -1e9;

  /** Show a line now, replacing any line on screen. */
  function show(text, subText, kind = 'info', seconds = 1.6) {
    if (!text) return;
    const words = String(text).toUpperCase();
    setText(headline, words);
    setText(sub, subText ? String(subText).toUpperCase() : '');
    setShown(sub, Boolean(subText));
    line.dataset.kind = kind === 'good' || kind === 'bad' ? kind : 'info';
    line.classList.toggle('is-count', /^\d{1,2}$/.test(words) || words === 'GO!' || words === 'GO');
    line.classList.toggle('is-long', words.length > 14);
    setShown(line, true);
    line.classList.remove('is-showing', 'is-leaving');
    void line.offsetWidth;
    line.classList.add('is-showing');
    const now = performance.now();
    lastShownAt = now;
    const duration = Math.max(0.5, Number(seconds) || 1.6) * 1000;
    leaveAt = now + duration;
    hideAt = now + duration + 260;
  }

  /** Fade out and hide when the line's time is up (called with the HUD each frame). */
  function update() {
    if (!hideAt) return;
    const now = performance.now();
    if (now >= leaveAt && !line.classList.contains('is-leaving')) line.classList.add('is-leaving');
    if (now >= hideAt) {
      hideAt = 0;
      setShown(line, false);
    }
  }

  game.events.on('activity:banner', (payload) => {
    if (payload) show(payload.text, payload.sub, payload.kind, payload.seconds);
  });
  // A bare countdown (one that came without its own banner) still gets its big number.
  game.events.on('activity:countdown', (payload) => {
    if (!payload || performance.now() - lastShownAt < 200) return;
    const count = Number(payload.count) || 0;
    show(count > 0 ? String(count) : 'GO!', '', count > 0 ? 'info' : 'good', count > 0 ? 0.9 : 1.2);
  });

  return { show, update };
}
