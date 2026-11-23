// The interact prompt, bottom centre above the subtitles: a key cap and what it does here, such
// as [F] Steal the Kestrel Sirocco GT or [E] Talk to Uncle Faris. Systems set it each frame they
// want it and clear it when the chance has passed.
import { createElement, createKeyCap, keyCapLabel, setShown } from './uiElements.js';

/**
 * Build the prompt in `container` (#hud-interact-prompt).
 * @returns {{setPrompt(key:string, text:string):void, setPrompts(list:{key:string,text:string}[]):void, clearPrompt():void}}
 */
export function createInteractPrompt(game, container) {
  const list = createElement('div', 'prompt-list', container);
  let signature = '';
  setShown(list, false);

  /**
   * Show one prompt. `key` is an action name ('enterVehicle'), a key code ('KeyF') or a label ('F').
   */
  function setPrompt(key, text) {
    const next = `${key}\u0001${text}`;
    if (next === signature) return;
    signature = next;
    render([{ key, text }]);
  }

  /** Show several prompts side by side: [{key, text}]. */
  function setPrompts(prompts) {
    let next = '';
    for (const prompt of prompts) next += `${prompt.key}\u0001${prompt.text}\u0002`;
    if (next === signature) return;
    signature = next;
    render(prompts);
  }

  function clearPrompt() {
    if (!signature) return;
    signature = '';
    setShown(list, false);
  }

  function render(prompts) {
    list.textContent = '';
    for (const prompt of prompts) {
      const row = createElement('div', 'prompt', list);
      createKeyCap(resolveKey(prompt.key), row);
      createElement('span', 'prompt-text', row, prompt.text || '');
    }
    setShown(list, prompts.length > 0);
    list.classList.remove('is-new');
    void list.offsetWidth;
    list.classList.add('is-new');
  }

  function resolveKey(key) {
    const bindings = game.keyBindings || {};
    if (bindings[key] && bindings[key].length) return bindings[key][0];
    return keyCapLabel(key) ? key : String(key || '');
  }

  return { setPrompt, setPrompts, clearPrompt };
}
