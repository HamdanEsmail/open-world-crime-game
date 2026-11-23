// Haddad Motors and the three Chroma Bay Respray shops. Drive onto the bay and stop: every garage
// repairs and resprays (a fresh coat loses the police when no officer is watching); Uncle Faris's
// Haddad Motors also tunes engines, fits rally tyres and armour plating that stay on the car, and
// for a fee makes a stolen car the player's own, kept at the safehouses.
import { repairPrice, resprayPrice, upgradePrice, upgradeRank, GARAGE_UPGRADES, RESPRAY_COLOURS } from './shopPriceRules.js';

/** Car classes no garage in Port Sarab will touch. */
const REFUSED_CLASSES = new Set(['police', 'policeSuv', 'armored']);

/**
 * Build the garages (part of game.shops).
 * @returns {{garages:Object[], update():void, open(garage:Object, vehicle:Object):void, repair(vehicle:Object):boolean,
 *   respray(vehicle:Object, colour:{name:string,color:number}):void, upgrade(vehicle:Object, kind:string):boolean, makeOwned(vehicle:Object):void}}
 */
export function createGarageWorkshop(game, counter) {
  const garages = game.city.placesOfKind('garage').map((place) => {
    const full = place.id === 'garage_haddad';
    const pose = kerbPoseOf(place);
    return {
      place,
      pose,
      full,
      prompt: full ? 'Haddad Motors: repairs, paint and upgrades' : 'Chroma Bay Respray: repairs and paint',
      marker: game.markers.add({ kind: 'garage', owner: 'garages', pos: { x: place.x, y: 0, z: place.z }, edge: false, color: 0x6aa7ff, label: place.name }),
    };
  });

  /** A driver stopped on a garage's bay gets its prompt. */
  function update() {
    if (game.mode !== 'playing') return;
    const player = game.player;
    const vehicle = player && player.vehicle && !player.vehicle.wrecked ? player.vehicle : null;
    if (!vehicle || Math.abs(vehicle.speed) > 1.5) return;
    for (let i = 0; i < garages.length; i += 1) {
      const garage = garages[i];
      const dx = vehicle.pos.x - garage.pose.x;
      const dz = vehicle.pos.z - garage.pose.z;
      if (dx * dx + dz * dz > 8 * 8) continue;
      game.prompts.offer(20, 'E', garage.prompt);
      if (game.input.pressed('interact') && game.prompts.current === garage.prompt) open(garage, vehicle);
      return;
    }
  }

  /** Show what this garage can do for this car. */
  function open(garage, vehicle) {
    if (REFUSED_CLASSES.has(vehicle.spec.className)) {
      game.events.emit('subtitle', { speaker: garage.full ? 'Uncle Faris' : 'Chroma Bay', text: 'Not that one. Too hot for anyone in this town.', seconds: 3 });
      return;
    }
    const items = itemsFor(garage, vehicle);
    counter.show({
      title: garage.place.name,
      subtitle: `${vehicle.spec.name} · ${Math.round((vehicle.health / vehicle.maxHealth) * 100)}% condition`,
      items,
      onBuy: (item) => buy(garage, vehicle, item, items),
      onClose() {},
    }, garage.pose);
  }

  function itemsFor(garage, vehicle) {
    const items = [];
    const health = vehicle.health / (vehicle.maxHealth || 1);
    const fix = repairPrice(health, vehicle.spec.value);
    items.push({ id: 'repair', action: 'repair', name: 'Repair', price: fix, disabled: fix === 0, description: fix === 0 ? 'Not a scratch on it' : 'Panels, glass and engine as new' });
    const wanted = game.wanted;
    const stars = wanted ? wanted.level : 0;
    const watched = Boolean(wanted && stars > 0 && wanted.seen);
    for (const colour of RESPRAY_COLOURS) {
      items.push({
        id: `paint:${colour.color}`, action: 'paint', colour, name: `Paint: ${colour.name}`, price: resprayPrice(stars),
        owned: vehicle.color === colour.color,
        disabled: watched,
        description: watched ? 'Not with the police watching' : stars > 0 ? 'A new colour loses the police' : 'A fresh coat in a new colour',
      });
    }
    if (!garage.full) return items;
    const upgrades = vehicle.tags.upgrades || { engine: 0, tyres: 0, armor: 0 };
    const rank = game.economy ? game.economy.rank : 1;
    for (const kind of ['engine', 'tyres', 'armor']) {
      const upgrade = GARAGE_UPGRADES[kind];
      const level = (upgrades[kind] || 0) + 1;
      const maxed = level > upgrade.levels.length;
      const needs = maxed ? 1 : upgradeRank(kind, level);
      const locked = rank < needs;
      items.push({
        id: `upgrade:${kind}`, action: 'upgrade', kind,
        name: upgrade.levels.length > 1 ? `${upgrade.name} ${Math.min(level, upgrade.levels.length)}/${upgrade.levels.length}` : upgrade.name,
        price: maxed ? 0 : upgradePrice(kind, vehicle.spec.value, level),
        owned: maxed,
        disabled: maxed || locked,
        description: maxed ? 'Fitted' : locked ? `Needs rank ${needs}: ${rankName(needs)}` : describeUpgrade(kind, level),
      });
    }
    if (!vehicle.tags.owned) {
      items.push({ id: 'own', action: 'own', name: 'Make it mine', price: upgradePrice('owned', vehicle.spec.value), description: 'New plates and papers. Kept at your safehouses.' });
    }
    return items;
  }

  /** Take the money, do the work, and refresh the list in place. Returns false when refused. */
  function buy(garage, vehicle, item, items) {
    if (game.player.vehicle !== vehicle) return false;
    if (!game.economy || !game.economy.spend(item.price, `${garage.place.name}: ${item.name}`)) {
      game.events.emit('notify', { text: 'Not enough cash', kind: 'bad' });
      return false;
    }
    if (item.action === 'repair') repair(vehicle);
    else if (item.action === 'paint') respray(vehicle, item.colour);
    else if (item.action === 'upgrade') upgrade(vehicle, item.kind);
    else if (item.action === 'own') makeOwned(vehicle);
    game.events.emit('shop:purchase', { shop: garage.place.id, item: item.id, price: item.price });
    const fresh = itemsFor(garage, vehicle);
    items.length = 0;
    for (const entry of fresh) items.push(entry);
    return true;
  }

  /** As new again. */
  function repair(vehicle) {
    const done = game.vehicles && game.vehicles.repair ? game.vehicles.repair(vehicle) : false;
    if (!done) vehicle.health = vehicle.maxHealth;
    game.events.emit('notify', { text: 'Repaired', kind: 'good' });
    return true;
  }

  /** A new colour; with stars and nobody watching, the police lose the car. */
  function respray(vehicle, colour) {
    vehicle.color = colour.color;
    vehicle.tags.stolen = false;
    game.events.emit('vehicle:resprayed', { vehicle, color: colour.color });
    const wanted = game.wanted;
    if (wanted && wanted.level > 0 && !wanted.seen) {
      wanted.clear();
      game.events.emit('notify', { text: `${colour.name}. The PSPD lost you.`, kind: 'good' });
    } else {
      game.events.emit('notify', { text: `Resprayed: ${colour.name}`, kind: 'good' });
    }
  }

  /** Fit the next level of `kind` ('engine' | 'tyres' | 'armor'); it stays with the car. */
  function upgrade(vehicle, kind) {
    const upgrade = GARAGE_UPGRADES[kind];
    const upgrades = vehicle.tags.upgrades || (vehicle.tags.upgrades = { engine: 0, tyres: 0, armor: 0 });
    if (!upgrade || (upgrades[kind] || 0) >= upgrade.levels.length) return false;
    upgrades[kind] = (upgrades[kind] || 0) + 1;
    applyVehicleUpgrades(vehicle);
    if (kind === 'armor') vehicle.health = vehicle.maxHealth;
    game.events.emit('vehicle:upgraded', { vehicle, upgrade: kind, level: upgrades[kind] });
    game.events.emit('notify', { text: `${upgrade.name} fitted`, kind: 'good' });
    return true;
  }

  /** Papers in the player's name: no longer stolen, kept at the safehouses. */
  function makeOwned(vehicle) {
    vehicle.tags.owned = true;
    vehicle.tags.stolen = false;
    vehicle.faction = 'player';
    game.economy?.stats?.add?.('carsOwned', 1);
    game.events.emit('vehicle:owned', { vehicle });
    game.events.emit('notify', { text: `The ${vehicle.spec.name} is yours. Park it at a safehouse to keep it.`, kind: 'good' });
  }

  function rankName(rank) {
    const ranks = game.economy && game.economy.ranks;
    return ranks && ranks[rank - 1] ? ranks[rank - 1].name : `rank ${rank}`;
  }

  return { garages, update, open, repair, respray, upgrade, makeOwned };
}

/**
 * Make a car's fitted upgrades count: vehicle.tune multipliers for the handling ({power, grip,
 * topSpeed}) and a higher maxHealth for armour, keeping its share of health.
 */
export function applyVehicleUpgrades(vehicle) {
  const upgrades = vehicle.tags.upgrades;
  if (!upgrades) return;
  const engine = upgrades.engine ? GARAGE_UPGRADES.engine.levels[upgrades.engine - 1] : null;
  const tyres = upgrades.tyres ? GARAGE_UPGRADES.tyres.levels[upgrades.tyres - 1] : null;
  const armor = upgrades.armor ? GARAGE_UPGRADES.armor.levels[upgrades.armor - 1] : null;
  vehicle.tune = {
    power: engine ? engine.power : 1,
    topSpeed: engine ? engine.topSpeed : 1,
    grip: tyres ? tyres.grip : 1,
  };
  const share = vehicle.maxHealth > 0 ? vehicle.health / vehicle.maxHealth : 1;
  vehicle.maxHealth = vehicle.spec.health * (armor ? armor.health : 1);
  vehicle.health = vehicle.maxHealth * Math.min(1, share);
}

/** What each upgrade level does, in a line for the shop. */
function describeUpgrade(kind, level) {
  const step = GARAGE_UPGRADES[kind].levels[level - 1];
  if (kind === 'engine') return `+${Math.round((step.power - 1) * 100)}% power, +${Math.round((step.topSpeed - 1) * 100)}% top speed`;
  if (kind === 'tyres') return `+${Math.round((step.grip - 1) * 100)}% grip, on sand too`;
  return `+${Math.round((step.health - 1) * 100)}% toughness`;
}

/** Where a car stops for a place: at the kerb beside it, facing the way traffic runs on that side. */
export function kerbPoseOf(place) {
  const atKerb = place.curbX !== undefined && (place.curbX !== place.x || place.curbZ !== place.z);
  if (!atKerb) return { x: place.x, z: place.z, heading: place.heading || 0 };
  let heading = (place.heading + Math.PI / 2) % (Math.PI * 2);
  if (heading > Math.PI) heading -= Math.PI * 2;
  return { x: place.curbX, z: place.curbZ, heading };
}
