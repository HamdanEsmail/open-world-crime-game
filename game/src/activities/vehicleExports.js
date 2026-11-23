// The Pier 9 export crane in Mina Docks buys particular cars for buyers overseas, no questions asked.
// It keeps a list of five wanted models on its board; drive one in good condition into the crane's
// bay and it pays by model and by how much of the car is left, then hoists it onto the ship. Fill the
// whole list for a bonus and a fresh list. Getting into a wanted model points the way to the dock.
import { exportPriceForVehicle } from './activityRules.js';

/** The models Pier 9 ever asks for, and how often each turns up on a list: the exotic ones less often. */
const EXPORT_WEIGHTS = {
  dromo_sandpiper: 3, varda_meridian: 3, sarab_cab: 2, kestrel_sirocco: 2, zephyr_mirage: 1, kestrel_corniche: 2,
  oryx_summit: 3, oryx_nomad: 3, sahel_caravan: 2, sahel_hauler: 1, dune_jackal: 2, sarab_metro_bus: 1,
};
const LIST_SIZE = 5;
const LIST_BONUS = 6000;
const EXPORT_TEAL = 0x2fc2b8;

/**
 * Build the export list (game.activities.exports).
 * @returns {{id:string, wanted:string[], delivered:boolean[], priceFor(vehicle:Object):number, isWanted(specId:string):boolean,
 *   deliver(vehicle:Object):boolean, showList():void, update(dt:number):void, stop():void, serialize():Object, deserialize(data:Object):void}}
 */
export function createVehicleExports(game, activities) {
  const dock = game.city.placesOfKind('exportDock')[0] || null;
  const bay = dock ? activities.kerbPose(dock) : null;
  const state = { listIndex: 0, wanted: [], delivered: [], exported: 0, earned: 0, listsDone: 0 };
  const hoisting = [];
  let deliverPrompt = '';
  let deliverFor = null;
  let routeMarker = null;
  generateList();
  if (dock) {
    game.markers.add({ kind: 'activity', icon: 'exportDock', owner: 'exportDock', pos: { x: bay.x, y: 0, z: bay.z }, edge: false, color: EXPORT_TEAL, label: 'Pier 9 Export Crane' });
  }

  const module = {
    id: 'exports',
    get wanted() {
      return state.wanted;
    },
    get delivered() {
      return state.delivered;
    },
    priceFor,
    isWanted,
    deliver,
    showList,
    update,
    stop() {},
    serialize,
    deserialize,
  };

  /** Hoist shipped cars, offer the board and the delivery at the bay. */
  function update(dt) {
    hoistExportedCars(dt);
    if (!bay || game.mode !== 'playing') return;
    const player = game.player;
    if (!player || !player.character) return;
    const pos = player.pos;
    const dx = pos.x - bay.x;
    const dz = pos.z - bay.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > 20 * 20) return;
    const vehicle = activities.playerVehicle();
    if (vehicle && distanceSq < 10 * 10 && Math.abs(vehicle.speed) < 2 && isWanted(vehicle.spec.id)) {
      if (deliverFor !== vehicle || (game.time.frame & 31) === 0) {
        deliverFor = vehicle;
        deliverPrompt = priceFor(vehicle) <= 0 || vehicle.tags.owned
          ? `Pier 9 will not take this ${vehicle.spec.name}`
          : `Export the ${vehicle.spec.name} (${activities.money(priceFor(vehicle))})`;
      }
      if (activities.offer(24, 'E', deliverPrompt)) deliver(vehicle);
      return;
    }
    if (activities.offer(18, 'E', 'Read the Pier 9 export list')) showList();
  }

  /** Ship the car: pay, step the player out onto the quay, and let the crane lift it away. */
  function deliver(vehicle) {
    const index = slotFor(vehicle.spec.id);
    if (index === -1) return false;
    if (vehicle.tags.owned) {
      activities.toast('That one is yours. Pier 9 only ships other people\'s cars.', 'bad');
      return false;
    }
    if (priceFor(vehicle) <= 0) {
      activities.say('Pier 9 foreman', 'That is scrap, not export. Bring it back in one piece.', 3);
      return false;
    }
    const price = priceFor(vehicle);
    state.delivered[index] = true;
    state.exported += 1;
    state.earned += price;
    if (game.player && game.player.vehicle === vehicle && dock) game.player.teleport(dock.x, dock.z, dock.heading + Math.PI);
    vehicle.locked = true;
    vehicle.parked = true;
    vehicle.tags.exported = true;
    hoisting.push({ vehicle, time: 0, lift: 0 });
    game.economy?.stats?.add?.('carsExported', 1);
    game.events.emit('export:delivered', { specId: vehicle.spec.id, price });
    activities.payout({ id: 'export', title: `Exported: ${vehicle.spec.name}`, reward: price, rep: 6, detail: `${countLeft()} left on the list`, sound: 'cash' });
    activities.say('Pier 9 foreman', rateLine(conditionOf(vehicle)), 3);
    clearRouteMarker();
    if (countLeft() === 0) completeList();
    return true;
  }

  /** The whole list shipped: a bonus and a new list. */
  function completeList() {
    state.listsDone += 1;
    activities.payout({ id: 'exportList', title: 'Export list complete', reward: LIST_BONUS, rep: 60, detail: 'Pier 9 has a new list on the board' });
    activities.banner('EXPORT LIST COMPLETE', `${activities.money(LIST_BONUS)} bonus`, 'good', 3.5);
    state.listIndex += 1;
    generateList();
  }

  /** Show the board: the five models, what each pays, and which are shipped. */
  function showList() {
    const items = state.wanted.map((specId, i) => {
      const spec = specOf(specId);
      return {
        id: specId,
        name: spec ? spec.name : specId,
        price: exportPriceForVehicle(spec, 1),
        description: state.delivered[i] ? 'Shipped' : 'Wanted: bring one in good condition to the bay',
        owned: state.delivered[i],
        disabled: true,
      };
    });
    const menus = game.menus;
    if (menus && menus.openShop) {
      menus.openShop({
        title: 'Pier 9 Export List',
        subtitle: `${countLeft()} of ${LIST_SIZE} wanted · full list pays a ${activities.money(LIST_BONUS)} bonus`,
        items,
        onBuy() {},
        onClose() {},
      });
      return;
    }
    const left = [];
    for (const item of items) if (!item.owned) left.push(`${item.name} ${activities.money(item.price)}`);
    activities.toast(`Pier 9 wants: ${left.join(' · ')}`, 'info');
  }

  /** The car rises from the bay on the crane's hook, turning slowly, and is gone. */
  function hoistExportedCars(dt) {
    for (let i = hoisting.length - 1; i >= 0; i -= 1) {
      const job = hoisting[i];
      const vehicle = job.vehicle;
      job.time += dt;
      if (vehicle.despawned) {
        hoisting.splice(i, 1);
        continue;
      }
      const asleep = vehicle.dynamics && vehicle.dynamics.sleeping;
      if (asleep && !vehicle.driver) {
        job.lift += dt;
        vehicle.pos.y += dt * (2 + job.lift * 3);
        vehicle.heading += dt * 0.25;
      }
      if (job.lift > 5 || job.time > 9) {
        game.vehicles.despawn(vehicle);
        hoisting.splice(i, 1);
      }
    }
  }

  /** Point the way to the dock when the player gets into a wanted car. */
  game.events.on('player:enteredVehicle', (event) => {
    const vehicle = event.vehicle;
    if (!vehicle || !dock || !isWanted(vehicle.spec.id) || vehicle.tags.owned || vehicle.tags.exported) return;
    activities.toast(`Pier 9 wants this ${vehicle.spec.name}: up to ${activities.money(exportPriceForVehicle(vehicle.spec, 1))}`, 'cash');
    clearRouteMarker();
    const quiet = activities.running || (game.missions && game.missions.active) || game.markers.routeTarget();
    routeMarker = game.markers.add({ kind: 'activity', icon: 'exportDock', owner: 'exportDelivery', pos: { x: bay.x, y: 0, z: bay.z }, beacon: true, route: !quiet, color: EXPORT_TEAL, radius: 5, label: 'Pier 9: deliver the car' });
  });
  game.events.on('player:exitedVehicle', () => clearRouteMarker());

  function clearRouteMarker() {
    if (routeMarker) game.markers.remove(routeMarker);
    routeMarker = null;
  }

  /** Price for this car now, by model and condition (0 when it is too battered to ship). */
  function priceFor(vehicle) {
    return exportPriceForVehicle(vehicle.spec, conditionOf(vehicle));
  }

  function conditionOf(vehicle) {
    const max = vehicle.maxHealth || vehicle.spec.health || 1;
    return Math.max(0, vehicle.health / max);
  }

  function isWanted(specId) {
    return slotFor(specId) !== -1;
  }

  function slotFor(specId) {
    for (let i = 0; i < state.wanted.length; i += 1) if (state.wanted[i] === specId && !state.delivered[i]) return i;
    return -1;
  }

  function countLeft() {
    let left = 0;
    for (const done of state.delivered) if (!done) left += 1;
    return left;
  }

  function rateLine(condition) {
    if (condition > 0.95) return 'Not a scratch. The buyer will cry with joy.';
    if (condition > 0.75) return 'A few dents. We have seen worse.';
    return 'It runs. Barely. Half price, and you are lucky.';
  }

  /** Five different models for list number `state.listIndex`, the same list every time for that number. */
  function generateList() {
    const rng = game.rng.fork(`exports-${state.listIndex}`);
    const ids = Object.keys(EXPORT_WEIGHTS).filter((id) => specOf(id));
    const weights = ids.map((id) => EXPORT_WEIGHTS[id] || 1);
    state.wanted = [];
    state.delivered = [];
    while (state.wanted.length < LIST_SIZE && ids.length > 0) {
      const pick = rng.weighted(ids, weights);
      const at = ids.indexOf(pick);
      ids.splice(at, 1);
      weights.splice(at, 1);
      state.wanted.push(pick);
      state.delivered.push(false);
    }
  }

  function specOf(id) {
    const catalog = game.catalog;
    if (catalog && typeof catalog.vehicleById === 'function') return catalog.vehicleById(id);
    return null;
  }

  function serialize() {
    return { listIndex: state.listIndex, delivered: state.delivered.slice(), exported: state.exported, earned: state.earned, listsDone: state.listsDone };
  }

  function deserialize(data) {
    state.listIndex = (data && data.listIndex) || 0;
    generateList();
    const saved = (data && data.delivered) || [];
    for (let i = 0; i < state.delivered.length; i += 1) state.delivered[i] = Boolean(saved[i]);
    state.exported = (data && data.exported) || 0;
    state.earned = (data && data.earned) || 0;
    state.listsDone = (data && data.listsDone) || 0;
  }

  return module;
}
