// The shop counter used by Brass & Barrel gun shops, Chroma Bay respray garages and the food
// stands: the shop's name on a gold band, its wares with prices, a description of the one in
// focus, Zayd's cash, and a Buy that refuses politely when he cannot pay.
import { createMenuList, goldRuleMarkup } from './menuListControls.js';
import { createElement, createKeyCap, setText, formatMoney, replayClass } from './uiElements.js';

/**
 * Build the shop screen in `root` (#shop-menu).
 * @param {Object} director  close(name)
 * @returns {{name:string, open(config:Object):void, close():void, handleKey(code:string):boolean, pauses:boolean, coversHud:boolean}}
 */
export function createShopMenuScreen(game, root, director) {
  root.textContent = '';
  root.classList.add('shop');
  createElement('div', 'shop-veil', root);
  const card = createElement('div', 'shop-card', root);
  const head = createElement('header', 'shop-head', card);
  const kicker = createElement('div', 'shop-kicker', head);
  const title = createElement('h2', 'shop-title', head);
  head.insertAdjacentHTML('beforeend', goldRuleMarkup('shop-rule'));
  const body = createElement('div', 'shop-body', card);
  const listHolder = createElement('div', 'shop-list-holder', body);
  const list = createMenuList(game, listHolder, [], { className: 'shop-list', onFocus: (item) => describe(item) });
  const info = createElement('aside', 'shop-info', body);
  const infoName = createElement('div', 'shop-info-name', info);
  const infoPrice = createElement('div', 'shop-info-price', info);
  const infoText = createElement('p', 'shop-info-text', info);
  const footer = createElement('footer', 'shop-footer', card);
  const cash = createElement('div', 'shop-cash', footer);
  createElement('span', 'shop-cash-label', cash, 'CASH');
  const cashValue = createElement('span', 'shop-cash-value', cash, '$0');
  const message = createElement('div', 'shop-message', footer);
  const hints = createElement('div', 'menu-key-hints', footer);
  addHint(hints, ['Enter'], 'Buy');
  addHint(hints, ['Escape'], 'Leave');

  const screen = { name: 'shop', open, close, handleKey, pauses: true, coversHud: true };
  let config = null;

  /**
   * Open with { title, subtitle, items: [{id, name, price, description, owned, disabled}], onBuy(item), onClose() }.
   * onBuy does the purchase itself (spending the money); returning false marks it refused.
   */
  function open(options) {
    config = options || { items: [] };
    setText(kicker, (config.subtitle || 'OPEN FOR BUSINESS').toUpperCase());
    setText(title, (config.title || 'Shop').toUpperCase());
    setText(message, '');
    refresh();
    const firstForSale = (config.items || []).findIndex((item) => !item.owned && !item.disabled);
    list.focus(Math.max(0, firstForSale), false, true);
    describe(list.focusedItem());
    root.hidden = false;
    replayClass(card, 'is-entering', 0.5);
  }

  function refresh() {
    const money = game.economy ? game.economy.money || 0 : 0;
    setText(cashValue, formatMoney(money));
    list.setItems((config.items || []).map((item) => ({
      id: String(item.id),
      label: item.name,
      hint: item.owned ? 'OWNED' : item.price > 0 ? formatMoney(item.price) : 'FREE',
      disabled: Boolean(item.disabled || item.owned),
      source: item,
      onSelect: () => buy(item),
    })));
    list.element.querySelectorAll('.menu-item').forEach((button, i) => {
      const item = config.items[i];
      button.classList.toggle('is-owned', Boolean(item && item.owned));
      button.classList.toggle('is-dear', Boolean(item && !item.owned && item.price > money));
    });
    describe(list.focusedItem());
  }

  function describe(entry) {
    const item = entry && entry.source;
    setText(infoName, item ? item.name.toUpperCase() : '');
    setText(infoPrice, item ? (item.owned ? 'Already yours' : item.price > 0 ? formatMoney(item.price) : 'Free') : '');
    setText(infoText, item ? item.description || '' : '');
  }

  /** Check the wallet, then let the shop's owner make the sale. */
  function buy(item) {
    const money = game.economy ? game.economy.money || 0 : 0;
    if (item.price > money) {
      say(`Not enough cash: ${formatMoney(item.price - money)} short.`, true);
      game.audio?.play?.('menuBack');
      return;
    }
    const result = config.onBuy ? config.onBuy(item) : true;
    if (result === false) {
      say('The shopkeeper shakes his head.', true);
      return;
    }
    say(`Bought: ${item.name}.`, false);
    game.audio?.play?.('purchase');
    refresh();
  }

  function say(text, bad) {
    setText(message, text);
    message.classList.toggle('is-bad', bad);
    replayClass(message, 'is-flash', 0.6);
  }

  function close() {
    root.hidden = true;
    const done = config && config.onClose;
    config = null;
    if (done) done();
  }

  function handleKey(code) {
    if (code === 'Escape' || code === 'Backspace') {
      game.audio?.play?.('menuBack');
      director.close('shop');
      return true;
    }
    return list.handleKey(code);
  }

  return screen;
}

function addHint(container, codes, text) {
  const hint = createElement('span', 'menu-key-hint', container);
  for (const code of codes) createKeyCap(code, hint);
  createElement('span', 'menu-key-hint-text', hint, text);
}
