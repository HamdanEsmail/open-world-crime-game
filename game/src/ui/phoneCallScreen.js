// Zayd's phone: when Captain Dahan or the crew call, a card rings in at the bottom right with
// the caller's name and role and a key cap to answer. Answering tells the story system through
// 'phone:answered'; an unanswered call rings out after twenty seconds.
import { glyphSvg } from './hudIconLibrary.js';
import { createElement, createKeyCap, setText } from './uiElements.js';

/**
 * Build the phone card in `root` (#phone-handler-calls) and listen for 'phone:incoming'.
 * @returns {{incoming(call:{from:string, role?:string}):void, accept():void, dismiss():void, update():void, ringing:boolean, call:Object|null}}
 */
export function createPhoneCallScreen(game, root) {
  root.textContent = '';
  root.classList.add('phone');
  const card = createElement('div', 'phone-card', root);
  const icon = createElement('div', 'phone-icon', card);
  icon.innerHTML = `${glyphSvg('phone', 'phone-glyph')}<i class="phone-wave phone-wave--1"></i><i class="phone-wave phone-wave--2"></i>`;
  const text = createElement('div', 'phone-text', card);
  const kicker = createElement('div', 'phone-kicker', text, 'INCOMING CALL');
  const caller = createElement('div', 'phone-caller', text);
  const role = createElement('div', 'phone-role', text);
  const action = createElement('div', 'phone-action', card);
  const phoneKey = (game.keyBindings && game.keyBindings.phone && game.keyBindings.phone[0]) || 'KeyT';
  createKeyCap(phoneKey, action);
  const actionText = createElement('span', 'phone-action-text', action, 'Answer');
  const phone = { incoming, accept, dismiss, update, ringing: false, call: null };
  let ringOutAt = 0;
  let nextRingAt = 0;
  let hideTimer = 0;

  /** Start ringing: { from: 'Capt. Rasha Dahan', role: 'Handler' }. */
  function incoming(call) {
    phone.call = call || { from: 'Unknown caller' };
    phone.ringing = true;
    root.dataset.state = 'ringing';
    setText(kicker, 'INCOMING CALL');
    setText(caller, phone.call.from || phone.call.name || 'Unknown caller');
    setText(role, phone.call.role || '');
    icon.style.background = typeof phone.call.color === 'string' ? phone.call.color : '';
    setText(actionText, 'Answer');
    action.hidden = false;
    clearTimeout(hideTimer);
    root.hidden = false;
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
    ringOutAt = performance.now() + 20000;
    nextRingAt = 0;
  }

  /** Pick up: the card shows the call in progress, then steps aside for the subtitles. */
  function accept() {
    if (!phone.ringing) return;
    phone.ringing = false;
    root.dataset.state = 'talking';
    setText(kicker, 'ON THE LINE');
    action.hidden = true;
    game.audio?.play?.('phonePickup');
    game.events.emit('phone:answered', { from: phone.call.from, role: phone.call.role, call: phone.call });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 2600);
  }

  /** Let it go unanswered (or hang up). */
  function dismiss() {
    if (!phone.call) return;
    const wasRinging = phone.ringing;
    phone.ringing = false;
    if (wasRinging) game.events.emit('phone:missed', { from: phone.call.from, call: phone.call });
    hide();
  }

  function hide() {
    root.classList.add('is-leaving');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      root.hidden = true;
      root.classList.remove('is-leaving');
      if (!phone.ringing) phone.call = null;
    }, 400);
  }

  /**
   * Ring every 1.6 s. When the story's phone (game.phone) runs the call it answers on the key and
   * ends the call itself; on its own, the card answers on the phone key and rings out after 20 s.
   */
  function update() {
    if (!phone.ringing) return;
    const storyRunsCall = Boolean(game.phone);
    if (!storyRunsCall && game.input.pressed('phone')) {
      accept();
      return;
    }
    const now = performance.now();
    if (now >= nextRingAt) {
      nextRingAt = now + 1600;
      game.audio?.play?.('phoneRing');
    }
    if (!storyRunsCall && now > ringOutAt) dismiss();
  }

  game.events.on('phone:incoming', (payload) => incoming(payload));
  root.hidden = true;
  return phone;
}
