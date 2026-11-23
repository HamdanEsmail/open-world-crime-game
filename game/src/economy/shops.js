// The shops of Port Sarab: the two Brass & Barrel gun counters (weapons unlocked by reputation rank,
// ammunition, body armour), the garages (repairs, paint, upgrades: see garageWorkshop.js) and five
// food stands that put the player back on their feet. Each has a blip on the map and a prompt at the
// counter. Becomes game.shops.
import { createShopCounter } from './shopCounterMenu.js';
import { createGarageWorkshop } from './garageWorkshop.js';
import { weaponUnlockedAtRank, mealPrice } from './shopPriceRules.js';

const ARMOR_PRICE = 450;
/** What each food stand serves. */
const DISHES = {
  food_corniche: 'a hot zaatar flatbread',
  food_souk: 'a saffron chicken skewer',
  food_lantern: 'a falafel wrap with extra tahini',
  food_wadi: 'a karak tea and two samosas',
  food_southgate: 'a date shake and a stack of fries',
};

/**
 * Build game.shops.
 * @returns {{gunShops:Object[], foodStands:Object[], garages:Object[], counter:Object, workshop:Object,
 *   openGunShop(shop:Object):void, buyWeapon(weaponId:string):boolean, buyAmmo(weaponId:string):boolean, buyArmor():boolean, eat(stand:Object):boolean, update(dt:number):void}}
 */
export function createShops(game) {
  const counter = createShopCounter(game);
  const workshop = createGarageWorkshop(game, counter);
  const gunShops = game.city.placesOfKind('gunShop').map((place) => ({
    place,
    prompt: `Browse weapons at ${place.name.split(',')[0]}`,
    marker: game.markers.add({ kind: 'shop', icon: 'gunShop', owner: 'shops', pos: { x: place.x, y: 0, z: place.z }, edge: false, color: 0xff6a3d, label: place.name }),
  }));
  const foodStands = game.city.placesOfKind('food').map((place) => ({
    place,
    price: mealPrice(place),
    prompt: `Eat at ${place.name} ($${mealPrice(place)})`,
    marker: game.markers.add({ kind: 'food', owner: 'shops', pos: { x: place.x, y: 0, z: place.z }, edge: false, color: 0xf6a04d, label: place.name }),
  }));

  const shops = {
    gunShops,
    foodStands,
    garages: workshop.garages,
    counter,
    workshop,
    openGunShop,
    buyWeapon,
    buyAmmo,
    buyArmor,
    eat,
    update,
  };

  /** Prompts at the counters for a player on foot; the garages watch for drivers. */
  function update() {
    counter.update();
    workshop.update();
    if (game.mode !== 'playing' || counter.isOpen) return;
    const player = game.player;
    if (!player || !player.character || player.vehicle || player.state === 'down') return;
    const pos = player.character.pos;
    for (let i = 0; i < gunShops.length; i += 1) {
      const shop = gunShops[i];
      if (near(pos, shop.place, 4)) {
        game.prompts.offer(20, 'E', shop.prompt);
        if (pressedFor(shop.prompt)) openGunShop(shop);
        return;
      }
    }
    for (let i = 0; i < foodStands.length; i += 1) {
      const stand = foodStands[i];
      if (near(pos, stand.place, 3.5)) {
        game.prompts.offer(20, 'E', stand.prompt);
        if (pressedFor(stand.prompt)) eat(stand);
        return;
      }
    }
  }

  /** The gun counter's list: weapons by rank, ammunition for those carried, body armour. */
  function openGunShop(shop) {
    const items = gunShopItems();
    counter.show({
      title: shop.place.name,
      subtitle: game.economy ? `Rank ${game.economy.rank}: ${game.economy.rankName}` : '',
      items,
      onBuy(item) {
        let bought = false;
        if (item.action === 'weapon') bought = buyWeapon(item.weaponId);
        else if (item.action === 'ammo') bought = buyAmmo(item.weaponId);
        else if (item.action === 'armor') bought = buyArmor();
        if (bought) {
          game.events.emit('shop:purchase', { shop: shop.place.id, item: item.id, price: item.price });
          replaceItems(items, gunShopItems());
        }
        return bought;
      },
      onClose() {},
    }, shop.place);
  }

  function gunShopItems() {
    const items = [];
    const character = game.player ? game.player.character : null;
    const rank = game.economy ? game.economy.rank : 1;
    const catalog = game.catalog.weapons || [];
    const stocked = Boolean(game.weapons && game.weapons.give);
    for (const weapon of catalog) {
      const carried = character ? character.weapons.find((w) => w.id === weapon.id) : null;
      if (carried && weapon.ammoBox > 0) {
        items.push({ id: `ammo:${weapon.id}`, action: 'ammo', weaponId: weapon.id, name: `${weapon.name} ammo x${weapon.ammoBox}`, price: weapon.ammoPrice, description: `${carried.ammo + (carried.clip || 0)} rounds carried` });
        continue;
      }
      const unlocked = weaponUnlockedAtRank(weapon, rank);
      items.push({
        id: `weapon:${weapon.id}`, action: 'weapon', weaponId: weapon.id, name: weapon.name, price: weapon.price,
        owned: Boolean(carried),
        disabled: Boolean(carried) || !unlocked || !stocked,
        description: carried ? 'Carried' : !stocked ? 'Out of stock' : unlocked ? weapon.description : `Needs rank ${weapon.rank}: ${rankName(weapon.rank)}`,
      });
    }
    const maxArmor = game.config.player.maxArmor || 100;
    const armorFull = !character || character.armor >= maxArmor;
    items.push({ id: 'armor', action: 'armor', name: 'Body armour', price: ARMOR_PRICE, disabled: armorFull, description: armorFull ? 'Already wearing a full vest' : 'A ceramic vest that soaks up the first few hits' });
    return items;
  }

  /** Buy a weapon with its starting rounds. */
  function buyWeapon(weaponId) {
    const weapon = weaponSpec(weaponId);
    const character = game.player ? game.player.character : null;
    if (!weapon || !character || !game.weapons) return false;
    if (!weaponUnlockedAtRank(weapon, game.economy ? game.economy.rank : 1)) return false;
    if (!pay(weapon.price, `Brass & Barrel: ${weapon.name}`)) return false;
    game.weapons.give(character, weapon.id, weapon.startAmmo || 0);
    game.economy?.stats?.add?.('weaponsBought', 1);
    game.events.emit('notify', { text: `${weapon.name} bought`, kind: 'good' });
    return true;
  }

  /** A box of rounds for a carried weapon. */
  function buyAmmo(weaponId) {
    const weapon = weaponSpec(weaponId);
    const character = game.player ? game.player.character : null;
    if (!weapon || !character || !game.weapons || !(weapon.ammoBox > 0)) return false;
    if (!pay(weapon.ammoPrice, `Brass & Barrel: ${weapon.name} ammo`)) return false;
    game.weapons.give(character, weapon.id, weapon.ammoBox);
    game.audio?.play?.('reload');
    return true;
  }

  function buyArmor() {
    const character = game.player ? game.player.character : null;
    if (!character) return false;
    const maxArmor = game.config.player.maxArmor || 100;
    if (character.armor >= maxArmor || !pay(ARMOR_PRICE, 'Brass & Barrel: body armour')) return false;
    character.armor = maxArmor;
    game.events.emit('notify', { text: 'Body armour on', kind: 'good' });
    return true;
  }

  /** A meal at a stand: health back to full. */
  function eat(stand) {
    const character = game.player ? game.player.character : null;
    if (!character) return false;
    if (character.health >= character.maxHealth) {
      game.events.emit('notify', { text: 'You are not hungry', kind: 'info' });
      return false;
    }
    if (!pay(stand.price, stand.place.name)) return false;
    character.health = character.maxHealth;
    game.economy?.stats?.add?.('mealsEaten', 1);
    game.events.emit('notify', { text: `You have ${DISHES[stand.place.id] || 'a bite to eat'}. Health full.`, kind: 'good' });
    game.audio?.play?.('pickup');
    return true;
  }

  function pay(price, reason) {
    if (game.economy && game.economy.spend(price, reason)) return true;
    game.events.emit('notify', { text: 'Not enough cash', kind: 'bad' });
    return false;
  }

  function pressedFor(text) {
    return game.input.pressed('interact') && game.prompts.current === text;
  }

  function weaponSpec(id) {
    const catalog = game.catalog;
    if (typeof catalog.weaponById === 'function') return catalog.weaponById(id);
    return (catalog.weapons || []).find((weapon) => weapon.id === id) || null;
  }

  function rankName(rank) {
    const ranks = game.economy && game.economy.ranks;
    return ranks && ranks[rank - 1] ? ranks[rank - 1].name : `rank ${rank}`;
  }

  return shops;
}

/** Swap a shop list's contents in place, so an open shop screen shows the new stock. */
export function replaceItems(items, fresh) {
  items.length = 0;
  for (const item of fresh) items.push(item);
}

function near(pos, place, radius) {
  const dx = pos.x - place.x;
  const dz = pos.z - place.z;
  return dx * dx + dz * dz < radius * radius;
}
