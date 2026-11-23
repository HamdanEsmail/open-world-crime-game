// The counter every shop in Port Sarab sells across: the menus' shop screen when it is there, and
// otherwise a plain prompt at the counter ("E  Buy Viper 9 ($650) · X next") that steps through the
// same list. Gun shops, garages and the export board all open their lists through this one door.

/**
 * Build the counter.
 * @returns {{show(options:{title:string, subtitle?:string, items:Object[], onBuy(item:Object):void, onClose?():void}, anchor?:{x:number, z:number}):void,
 *   close():void, update():void, isOpen:boolean}}
 */
export function createShopCounter(game) {
  /** The list shown at the counter when the menus' shop screen is missing. */
  let counter = null;

  /**
   * Show a shop list. With the menus' shop screen it opens there; otherwise the counter prompt takes
   * over until the player walks away from `anchor`.
   */
  function show(options, anchor) {
    const menus = game.menus;
    if (menus && typeof menus.openShop === 'function') {
      menus.openShop(options);
      return;
    }
    const keep = counter && counter.title === options.title ? counter.index : 0;
    const pos = game.player ? game.player.pos : null;
    counter = {
      title: options.title,
      items: options.items,
      onBuy: options.onBuy,
      onClose: options.onClose,
      index: Math.min(keep, Math.max(0, options.items.length - 1)),
      anchorX: anchor ? anchor.x : pos ? pos.x : 0,
      anchorZ: anchor ? anchor.z : pos ? pos.z : 0,
      prompt: '',
    };
    if (!keep) game.events.emit('notify', { text: `${options.title}: X for the next item, Z for the last, E to buy`, kind: 'info' });
    describe();
  }

  /** Each frame while the counter is open: cycle, buy, or close when the player leaves. */
  function update() {
    if (!counter) return;
    const pos = game.player ? game.player.pos : null;
    if (!pos || Math.hypot(pos.x - counter.anchorX, pos.z - counter.anchorZ) > 10 || game.mode !== 'playing') {
      close();
      return;
    }
    const input = game.input;
    const count = counter.items.length;
    if (count === 0) {
      close();
      return;
    }
    if (input.pressed('nextWeapon')) {
      counter.index = (counter.index + 1) % count;
      describe();
    } else if (input.pressed('previousWeapon')) {
      counter.index = (counter.index + count - 1) % count;
      describe();
    }
    game.prompts.offer(35, 'E', counter.prompt);
    if (input.pressed('interact') && game.prompts.current === counter.prompt) {
      const item = counter.items[counter.index];
      if (item.disabled || item.owned) {
        game.events.emit('notify', { text: item.description || 'Not available', kind: 'bad' });
      } else {
        counter.onBuy(item);
        if (counter) {
          counter.index = Math.min(counter.index, Math.max(0, counter.items.length - 1));
          describe();
        }
      }
    }
  }

  function close() {
    if (!counter) return;
    const done = counter.onClose;
    counter = null;
    if (done) done();
  }

  function describe() {
    const item = counter.items[counter.index];
    if (!item) return;
    const price = item.price > 0 ? ` ($${Math.round(item.price).toLocaleString('en-US')})` : '';
    const state = item.disabled ? ` · ${item.description || 'unavailable'}` : '';
    counter.prompt = `${item.name}${price}${state} · ${counter.index + 1}/${counter.items.length}`;
  }

  return {
    show,
    close,
    update,
    get isOpen() {
      return counter !== null;
    },
  };
}
