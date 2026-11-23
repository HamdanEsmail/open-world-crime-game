// Small paid services around Port Sarab. On foot beside a cruising Sarab Cab the player can hail it
// and ride to the map waypoint (a quick fade and a time-lapse across town, paid by the distance); and
// at a PSPD front desk, with nobody in pursuit, a fine buys one star off the wanted level.

const CAB_MODEL = 'sarab_cab';
/** Metres per second a hailed cab covers on the in-game clock. */
const CAB_PACE = 12;
const FINE_PER_STAR = 500;

/**
 * Build game.cityServices.
 * @returns {{update(dt:number):void, hailCab(cab:Object):boolean, payFine(station:Object):boolean, cabFareTo(x:number, z:number):number, riding:boolean}}
 */
export function createCityServices(game) {
  const stations = game.city.placesOfKind('policeStation').map((place) => ({ place, prompt: '', stars: -1 }));
  const isCruisingCab = (vehicle) => vehicle.spec.id === CAB_MODEL && Boolean(vehicle.driver) && !vehicle.isPlayer && !vehicle.tags.depotCab && !vehicle.ai?.owner;
  let ride = null;

  const services = {
    update,
    hailCab,
    payFine,
    cabFareTo,
    get riding() {
      return ride !== null;
    },
  };

  /** Run a ride in progress; offer a cab or a fine to a player on foot. */
  function update(dt) {
    if (ride) {
      runRide(dt);
      return;
    }
    if (game.mode !== 'playing') return;
    const player = game.player;
    if (!player || !player.character || player.vehicle || player.state === 'down') return;
    const pos = player.character.pos;
    const wanted = game.wanted;
    const stars = wanted ? wanted.level : 0;
    if (stars > 0 && !wanted.seen) {
      for (let i = 0; i < stations.length; i += 1) {
        const station = stations[i];
        const dx = pos.x - station.place.x;
        const dz = pos.z - station.place.z;
        if (dx * dx + dz * dz > 4.5 * 4.5) continue;
        if (station.stars !== stars) {
          station.stars = stars;
          station.prompt = `Pay a fine: drop a star ($${fineFor(stars).toLocaleString('en-US')})`;
        }
        game.prompts.offer(21, 'E', station.prompt);
        if (pressedFor(station.prompt)) payFine(station);
        return;
      }
    }
    if (stars > 0 || !game.vehicles || (game.missions && game.missions.active) || (game.activities && game.activities.running)) return;
    const cab = game.vehicles.nearest(pos.x, pos.z, 12, isCruisingCab);
    if (!cab || Math.abs(cab.speed) > 14) return;
    game.prompts.offer(16, 'E', 'Hail the cab');
    if (pressedFor('Hail the cab')) hailCab(cab);
  }

  /** Ride a hailed cab to the waypoint: pay, fade, and step out at the kerb there hours later. */
  function hailCab(cab) {
    const target = rideTarget();
    if (!target) {
      game.events.emit('notify', { text: 'Set a waypoint on the map first (M)', kind: 'info' });
      return false;
    }
    const pos = game.player.pos;
    const route = game.roads.findRoute(pos.x, pos.z, target.x, target.z);
    const metres = game.roads.routeLength(route);
    if (metres < 80) {
      game.events.emit('notify', { text: 'You are nearly there: walk it', kind: 'info' });
      return false;
    }
    const fare = cabFareTo(target.x, target.z, metres);
    if (!game.economy || !game.economy.spend(fare, 'Cab ride')) {
      game.events.emit('notify', { text: `The ride costs $${fare}`, kind: 'bad' });
      return false;
    }
    const drop = game.roads.nearestWalkway(target.x, target.z, 120);
    ride = { x: drop ? drop.x : target.x, z: drop ? drop.z : target.z, metres, time: 0, moved: false, cab };
    if (cab.controls) cab.controls.brake = 1;
    game.events.emit('subtitle', { speaker: 'Cab driver', text: 'Hop in. I know a shortcut.', seconds: 2.4 });
    game.effects?.flash?.(0x0e1b2a, 1);
    game.economy?.stats?.add?.('cabRides', 1);
    return true;
  }

  /** The time-lapse: a beat of darkness, then the player is at the destination and the clock has moved on. */
  function runRide(dt) {
    ride.time += game.time.realDt || dt;
    if (!ride.moved && ride.time > 0.45) {
      ride.moved = true;
      const heading = Math.atan2(game.player.pos.x - ride.x, game.player.pos.z - ride.z) + Math.PI;
      game.player.teleport(ride.x, ride.z, heading);
      const minutes = ride.metres / CAB_PACE;
      game.time.hour = (game.time.hour + minutes / 60) % 24;
      game.events.emit('notify', { text: `Dropped off after ${Math.round(minutes)} minutes`, kind: 'info' });
      game.events.emit('service:cabRide', { metres: ride.metres });
    }
    if (ride.time > 1.2) ride = null;
  }

  /** A fine buys one star off, with nobody watching. */
  function payFine(station) {
    const wanted = game.wanted;
    if (!wanted || wanted.level <= 0 || wanted.seen) return false;
    const fine = fineFor(wanted.level);
    if (!game.economy || !game.economy.spend(fine, 'PSPD fine')) {
      game.events.emit('notify', { text: `The fine is $${fine.toLocaleString('en-US')}`, kind: 'bad' });
      return false;
    }
    if (wanted.level <= 1) wanted.clear();
    else wanted.set(wanted.level - 1);
    game.events.emit('subtitle', { speaker: 'Desk sergeant', text: 'Paperwork. I love paperwork. Off you go.', seconds: 2.6 });
    game.events.emit('service:finePaid', { station: station.place.id, fine });
    return true;
  }

  /** Dollars for a cab ride of `metres` (measured along the roads when not given). */
  function cabFareTo(x, z, metres) {
    let distance = metres;
    if (distance === undefined) {
      const pos = game.player.pos;
      distance = game.roads.routeLength(game.roads.findRoute(pos.x, pos.z, x, z));
    }
    return Math.round(8 + distance * 0.04);
  }

  /** The map waypoint, else whatever the GPS is pointing at. */
  function rideTarget() {
    const list = game.markers.list;
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].kind === 'waypoint') return game.markers.positionOf(list[i]);
    const routed = game.markers.routeTarget();
    return routed ? game.markers.positionOf(routed) : null;
  }

  function fineFor(stars) {
    return FINE_PER_STAR * stars + 250;
  }

  function pressedFor(text) {
    return game.input.pressed('interact') && game.prompts.current === text;
  }

  return services;
}
