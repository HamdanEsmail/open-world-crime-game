// Zayd's homes in Port Sarab: the flat in Al Wadi he starts with, the Crescent Penthouse over the
// marina and the Dune Hideout by the rally paddock, both for sale. At an owned door the player rests:
// six hours pass, health comes back, a one- or two-star search gives up, and the game is saved. Cars
// the player owns and parks outside are remembered (three per home) and waiting at the kerb on return.
// Becomes game.safehouses.
import { safehouseRestClearsWanted } from './shopPriceRules.js';
import { applyVehicleUpgrades, kerbPoseOf } from './garageWorkshop.js';

/** Cars a safehouse keeps at its kerb. */
const KERB_SLOTS = 3;
/** Metres from the kerb within which a parked owned car counts as left at home. */
const PARK_RADIUS = 15;
const OWNED_GREEN = 0x3fd07f;
const FOR_SALE_SAND = 0xe9b44c;

/**
 * Build game.safehouses.
 * @returns {{homes:Object[], owns(placeId:string):boolean, buy(placeId:string):boolean, rest(placeId:string):boolean,
 *   unlock(placeId:string):void, grantVehicle(specId:string, placeId?:string, options?:{color?:number}):boolean,
 *   update(dt:number):void, serialize():Object, deserialize(data:Object):void, reset():void}}
 */
export function createSafehouses(game) {
  const homes = game.city.placesOfKind('safehouse').map((place) => {
    const home = {
      place,
      owned: Boolean(place.owned),
      price: place.price || 0,
      kerb: kerbPoseOf(place),
      /** Remembered cars: {spec, color, health, upgrades, vehicle} */
      parked: [],
      marker: null,
      restPrompt: `Rest and save at ${place.name}`,
      buyPrompt: `Buy ${place.name} ($${(place.price || 0).toLocaleString('en-US')})`,
    };
    return home;
  });
  for (const home of homes) refreshMarker(home);

  const safehouses = { homes, owns, buy, rest, unlock, grantVehicle, update, serialize, deserialize, reset: () => deserialize(null) };

  /** Door prompts on foot; parked cars appear as the player comes home and go when they leave. */
  function update() {
    if ((game.time.frame % 30) === 5) keepParkedCars();
    if (game.mode !== 'playing') return;
    const player = game.player;
    if (!player || !player.character || player.vehicle || player.state === 'down') return;
    const pos = player.character.pos;
    for (let i = 0; i < homes.length; i += 1) {
      const home = homes[i];
      const dx = pos.x - home.place.x;
      const dz = pos.z - home.place.z;
      if (dx * dx + dz * dz > 4 * 4) continue;
      const text = home.owned ? home.restPrompt : home.buyPrompt;
      game.prompts.offer(19, 'E', text);
      if (game.input.pressed('interact') && game.prompts.current === text) {
        if (home.owned) rest(home.place.id);
        else buy(home.place.id);
      }
      return;
    }
  }

  function owns(placeId) {
    const home = homeById(placeId);
    return Boolean(home && home.owned);
  }

  /** Buy a home for its price. */
  function buy(placeId) {
    const home = homeById(placeId);
    if (!home || home.owned) return false;
    if (!game.economy || !game.economy.spend(home.price, `Property: ${home.place.name}`)) {
      game.events.emit('notify', { text: `${home.place.name} costs $${home.price.toLocaleString('en-US')}`, kind: 'bad' });
      return false;
    }
    home.owned = true;
    refreshMarker(home);
    game.economy?.stats?.add?.('propertiesBought', 1);
    game.events.emit('safehouse:bought', { place: home.place });
    game.events.emit('activity:completed', { id: `safehouse_${home.place.id}`, title: `${home.place.name} is yours`, reward: 0, detail: 'Rest here to save; park owned cars outside' });
    game.audio?.play?.('missionPassed');
    game.events.emit('safehouse:saved', { place: home.place });
    return true;
  }

  /** Sleep six hours at an owned home: health back, a light search dropped, and an autosave. */
  function rest(placeId) {
    const home = homeById(placeId);
    if (!home || !home.owned) return false;
    const wanted = game.wanted;
    const stars = wanted ? wanted.level : 0;
    if (stars > 0 && !safehouseRestClearsWanted(stars, wanted.seen)) {
      game.events.emit('notify', { text: 'Not with the police on your tail', kind: 'bad' });
      return false;
    }
    if (stars > 0) wanted.clear();
    const character = game.player.character;
    character.health = character.maxHealth;
    game.time.hour = (game.time.hour + 6) % 24;
    game.effects?.flash?.(0x0e1b2a, 0.9);
    game.economy?.stats?.add?.('nightsRested', 1);
    game.events.emit('safehouse:saved', { place: home.place });
    const hour = Math.floor(game.time.hour);
    const minute = Math.floor((game.time.hour - hour) * 60);
    game.events.emit('notify', { text: `Rested until ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}. Game saved.`, kind: 'good' });
    game.audio?.play?.('save');
    return true;
  }

  /** The story hands over a home without payment. */
  function unlock(placeId) {
    const home = homeById(placeId);
    if (!home || home.owned) return;
    home.owned = true;
    refreshMarker(home);
    game.events.emit('notify', { text: `${home.place.name} is yours now`, kind: 'good' });
  }

  /**
   * The story gives the player a car: it waits outside `placeId` (default: the first owned home).
   * @returns {boolean} false when that home's kerb is full
   */
  function grantVehicle(specId, placeId, options) {
    const home = placeId ? homeById(placeId) : homes.find((candidate) => candidate.owned);
    if (!home || home.parked.length >= KERB_SLOTS) return false;
    const spec = game.catalog.vehicleById ? game.catalog.vehicleById(specId) : null;
    if (!spec) return false;
    home.parked.push({ spec: specId, color: options && typeof options.color === 'number' ? options.color : spec.colors[0], health: 1, upgrades: null, vehicle: null });
    keepParkedCars();
    return true;
  }

  /** An owned car left at a home's kerb is remembered there. */
  game.events.on('player:exitedVehicle', (event) => {
    const vehicle = event.vehicle;
    if (!vehicle || !vehicle.tags.owned || vehicle.wrecked) return;
    for (const home of homes) {
      if (!home.owned) continue;
      if (Math.hypot(vehicle.pos.x - home.kerb.x, vehicle.pos.z - home.kerb.z) > PARK_RADIUS) continue;
      if (home.parked.some((record) => record.vehicle === vehicle)) return;
      if (home.parked.length >= KERB_SLOTS) {
        game.events.emit('notify', { text: `${home.place.name} has no room for another car`, kind: 'bad' });
        return;
      }
      home.parked.push(recordOf(vehicle));
      vehicle.tags.safehouse = home.place.id;
      game.events.emit('notify', { text: `${vehicle.spec.name} kept at ${home.place.name}`, kind: 'good' });
      return;
    }
  });
  /** Driving a remembered car away takes it off that home's list. */
  game.events.on('player:enteredVehicle', (event) => {
    for (const home of homes) {
      const index = home.parked.findIndex((record) => record.vehicle === event.vehicle);
      if (index !== -1) {
        home.parked.splice(index, 1);
        event.vehicle.tags.safehouse = null;
      }
    }
  });
  game.events.on('vehicle:despawned', (event) => {
    for (const home of homes) for (const record of home.parked) if (record.vehicle === event.vehicle) record.vehicle = null;
  });
  game.events.on('vehicle:destroyed', (event) => {
    for (const home of homes) {
      const index = home.parked.findIndex((record) => record.vehicle === event.vehicle);
      if (index !== -1) home.parked.splice(index, 1);
    }
  });

  /** Bring a home's cars back to its kerb when the player is near; put them away when far. */
  function keepParkedCars() {
    const pos = game.player && game.player.character ? game.player.pos : null;
    if (!pos || !game.vehicles) return;
    for (const home of homes) {
      const distance = Math.hypot(pos.x - home.kerb.x, pos.z - home.kerb.z);
      for (let slot = 0; slot < home.parked.length; slot += 1) {
        const record = home.parked[slot];
        if (distance < 180 && !record.vehicle) spawnParked(home, record, slot, pos);
        else if (distance > 320 && record.vehicle && !record.vehicle.driver) {
          const vehicle = record.vehicle;
          Object.assign(record, recordOf(vehicle));
          record.vehicle = null;
          game.vehicles.despawn(vehicle);
        }
      }
    }
  }

  /** Put a remembered car on its kerb slot, unless someone or something stands there. */
  function spawnParked(home, record, slot, playerPos) {
    const offset = (slot - 1) * 7.5;
    const x = home.kerb.x + Math.sin(home.kerb.heading) * offset;
    const z = home.kerb.z + Math.cos(home.kerb.heading) * offset;
    if (Math.hypot(playerPos.x - x, playerPos.z - z) < 4 || game.vehicles.nearest(x, z, 4)) return;
    const vehicle = game.vehicles.spawn(record.spec, { x, z, heading: home.kerb.heading, color: record.color, parked: true, faction: 'player' });
    if (!vehicle) return;
    vehicle.tags.owned = true;
    vehicle.tags.stolen = false;
    vehicle.tags.safehouse = home.place.id;
    if (record.upgrades) {
      vehicle.tags.upgrades = { ...record.upgrades };
      applyVehicleUpgrades(vehicle);
    }
    vehicle.health = vehicle.maxHealth * Math.max(0.3, record.health);
    record.vehicle = vehicle;
  }

  function recordOf(vehicle) {
    return {
      spec: vehicle.spec.id,
      color: vehicle.color,
      health: vehicle.maxHealth ? vehicle.health / vehicle.maxHealth : 1,
      upgrades: vehicle.tags.upgrades ? { ...vehicle.tags.upgrades } : null,
      vehicle,
    };
  }

  function refreshMarker(home) {
    if (home.marker) game.markers.remove(home.marker);
    home.marker = game.markers.add({
      kind: 'safehouse', owner: 'safehouses', pos: { x: home.place.x, y: 0, z: home.place.z }, edge: home.owned,
      color: home.owned ? OWNED_GREEN : FOR_SALE_SAND,
      label: home.owned ? home.place.name : `For sale: ${home.place.name} ($${home.price.toLocaleString('en-US')})`,
    });
  }

  function homeById(placeId) {
    return homes.find((home) => home.place.id === placeId) || null;
  }

  function serialize() {
    const out = {};
    for (const home of homes) {
      out[home.place.id] = {
        owned: home.owned,
        parked: home.parked.map((record) => {
          const fresh = record.vehicle && !record.vehicle.despawned ? recordOf(record.vehicle) : record;
          return { spec: fresh.spec, color: fresh.color, health: fresh.health, upgrades: fresh.upgrades };
        }),
      };
    }
    return { homes: out };
  }

  function deserialize(data) {
    const saved = (data && data.homes) || {};
    for (const home of homes) {
      for (const record of home.parked) if (record.vehicle && !record.vehicle.driver) game.vehicles?.despawn?.(record.vehicle);
      const entry = saved[home.place.id];
      home.owned = entry ? Boolean(entry.owned) : Boolean(home.place.owned);
      home.parked = entry && Array.isArray(entry.parked)
        ? entry.parked.slice(0, KERB_SLOTS).map((record) => ({ spec: record.spec, color: record.color, health: record.health || 1, upgrades: record.upgrades || null, vehicle: null }))
        : [];
      refreshMarker(home);
    }
  }

  return safehouses;
}
