// What the screen does when Zayd goes down: the whole city drains of colour, tinted police blue
// with IN CUFFS when the PSPD arrest him, or coral red with LIGHTS OUT when he is knocked out,
// with a short line on what it cost him. It clears when he is back on his feet.
import { createElement, setText } from './uiElements.js';

/**
 * Build the screen in `root` (#busted-wasted-screen) and listen for arrests, knock-outs and respawns.
 * @returns {{show(kind:'cuffs'|'lightsOut', line?:string):void, clear():void, isShowing:boolean}}
 */
export function createArrestedKnockedOutScreen(game, root) {
  root.textContent = '';
  root.classList.add('knockout');
  createElement('div', 'knockout-tint', root);
  const stripe = createElement('div', 'knockout-stripe', root);
  const headline = createElement('div', 'knockout-headline', stripe);
  const line = createElement('div', 'knockout-line', stripe);
  const screen = { show, clear, isShowing: false };
  let fallback = 0;

  /** Drain the colour and print the verdict. */
  function show(kind, text) {
    const cuffs = kind === 'cuffs';
    root.dataset.kind = cuffs ? 'cuffs' : 'lightsOut';
    setText(headline, cuffs ? 'IN CUFFS' : 'LIGHTS OUT');
    setText(line, text || (cuffs ? 'PSPD took your weapons and a cut of your cash' : 'Sarab General patched you up'));
    root.hidden = false;
    root.classList.remove('is-showing', 'is-leaving');
    void root.offsetWidth;
    root.classList.add('is-showing');
    screen.isShowing = true;
    game.audio?.play?.(cuffs ? 'arrested' : 'knockedOut');
    clearTimeout(fallback);
    fallback = setTimeout(clear, 9000);
  }

  /** Let the colour back in (on respawn). */
  function clear() {
    clearTimeout(fallback);
    if (!screen.isShowing) return;
    screen.isShowing = false;
    root.classList.add('is-leaving');
    setTimeout(() => {
      if (screen.isShowing) return;
      root.hidden = true;
      root.classList.remove('is-showing', 'is-leaving');
    }, 700);
  }

  game.events.on('player:arrested', (payload) => show('cuffs', payload && payload.line));
  game.events.on('player:died', (payload) => show('lightsOut', payload && payload.line));
  game.events.on('player:respawned', () => clear());

  root.hidden = true;
  return screen;
}
