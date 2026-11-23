// Driving a Sarab Cab for fares. In any cab (one always waits at the depot on Saffron Street) the
// player starts a shift with E; a passenger hails from a kerb nearby, walks to the cab and climbs in,
// names a place ("The Mirage Grand, and step on it"), and pays by the meter at the drop-off, with a
// bonus for a quick ride and a tip that shrinks with every bump. Fares in a row pay a streak bonus.
// The shift ends when the player leaves the cab.
import { taxiFareForTrip, taxiBonusSeconds, taxiStreakBonus } from './activityRules.js';

const CAB_MODEL = 'sarab_cab';
const TAXI_YELLOW = 0xf5c400;

/** Where people in Port Sarab ask to be taken, and what they say when they get in. */
const DESTINATIONS = [
  { name: 'The Mirage Grand', landmark: 'grandHotel', line: 'The Mirage Grand, and step on it.' },
  { name: 'the Vane Spire', place: 'vane_spire_door', line: 'Vane Spire. I have a meeting I cannot be late for.' },
  { name: 'the Grand Souk', landmark: 'grandSouk', line: 'The Grand Souk, please. My aunt is waiting with a shopping list.' },
  { name: 'Sarab General', place: 'hospital', line: 'Sarab General. It is not urgent. Probably.' },
  { name: 'the Crescent Yacht Club', landmark: 'yachtClub', line: 'Crescent Yacht Club. Try not to look impressed.' },
  { name: 'the Sundial Tower', landmark: 'sundialTower', line: 'Sundial Tower. I am meeting someone under the clock.' },
  { name: 'the Customs House', landmark: 'customsHouse', line: 'Mina Customs House. Do not ask what is in the bag.' },
  { name: 'Zaatar & Co.', place: 'food_corniche', line: 'Zaatar & Co. on the Corniche. Best flatbread in the city.' },
  { name: 'Midnight Falafel', place: 'food_lantern', line: 'Midnight Falafel on Lantern Row. I have been dreaming about it all day.' },
  { name: 'Karak Corner', place: 'food_wadi', line: 'Karak Corner in Al Wadi, my friend. Quick as you like.' },
  { name: 'the Dune Diner', place: 'food_southgate', line: 'The Dune Diner down in Southgate, please.' },
  { name: 'Haddad Motors', place: 'garage_haddad', line: 'Haddad Motors. My car has been there a week. A week!' },
  { name: 'PSPD Headquarters', place: 'police_hq', line: 'Police headquarters. I am reporting a stolen camel. Do not laugh.' },
  { name: 'the Marina Clinic', place: 'clinic_marina', line: 'Marina Clinic, please. Nothing serious, just a sunburn.' },
];

const PASSENGER_NAMES = ['Leila', 'Hassan', 'Mrs. Odeh', 'Rafael', 'Noura', 'Theo', 'Amira', 'Bilal', 'Grace', 'Samir', 'Yara', 'Farouk', 'Mei', 'Jonah', 'Salma', 'Viktor'];
const ARCHETYPES = ['business', 'tourist', 'civilian', 'local', 'business', 'tourist'];
const BUMP_LINES = ['Hey! Watch the road!', 'My coffee!', 'Do you even have a licence?', 'Easy, easy!', 'I felt that in my teeth.', 'That is coming out of your tip.'];
const HAPPY_LINES = ['Smooth ride. Keep the change.', 'Fastest cab in Port Sarab!', 'You drive like a poet, my friend.', 'Perfect. I will ask for you next time.'];
const GRUMPY_LINES = ['I am never taking a cab again.', 'Here. No tip. You know why.', 'My chiropractor will hear about this.', 'I would have been faster on a camel.'];

/**
 * Build the taxi job (game.activities.taxi).
 * @returns {{id:string, stats:Object, startShift():boolean, stop(reason:string):void, update(dt:number):void, serialize():Object,
 *   deserialize(data:Object):void, shift:Object|null}}
 */
export function createTaxiFares(game, activities) {
  const rng = game.rng.fork('taxi-fares');
  const depot = game.city.placesOfKind('taxiDepot')[0] || null;
  const depotPose = depot ? activities.kerbPose(depot) : null;
  const stats = { fares: 0, earnings: 0, bestStreak: 0, shifts: 0 };
  const destinations = locateDestinations();
  const card = {
    id: 'taxi', title: 'Sarab Cab', giver: 'activity', kicker: 'TAXI', side: true,
    objectives: [{ text: '', done: false }, { text: '', done: false }],
    timer: null,
    counter: { label: 'Meter $', value: 0, of: 0 },
    taxi: { meter: 0, tip: 0, streak: 0, fares: 0, earned: 0 },
  };
  const bonusTimer = { label: 'Bonus', seconds: 0 };
  let shift = null;
  let depotCab = null;
  const depotMarker = depot ? game.markers.add({ kind: 'activity', icon: 'taxiDepot', owner: 'taxiDepot', pos: { x: depotPose.x, y: 0, z: depotPose.z }, edge: false, color: TAXI_YELLOW, label: 'Sarab Cab Depot: taxi fares' }) : null;

  const module = {
    id: 'taxi',
    stats,
    startShift,
    stop,
    update,
    serialize,
    deserialize,
    get shift() {
      return shift;
    },
  };

  /** Each frame: run the shift, keep a cab waiting at the depot, offer a shift to a cab driver. */
  function update(dt) {
    keepDepotCab();
    if (shift) {
      updateShift(dt);
      return;
    }
    if (game.mode !== 'playing') return;
    const cab = activities.playerVehicle();
    if (!cab || cab.spec.id !== CAB_MODEL || Math.abs(cab.speed) > 8 || !activities.canStart()) return;
    if (activities.offer(22, 'E', 'Start taxi fares')) startShift();
  }

  /** Begin a shift in the cab the player is driving. */
  function startShift() {
    const cab = activities.playerVehicle();
    if (!cab || cab.spec.id !== CAB_MODEL || !activities.canStart()) return false;
    shift = {
      cab,
      stage: 'seeking',
      wait: 0.5,
      passenger: null,
      passengerName: '',
      destination: null,
      marker: null,
      streak: 0,
      fares: 0,
      earned: 0,
      routeLength: 0,
      driven: 0,
      lastX: cab.pos.x,
      lastZ: cab.pos.z,
      bumps: 0,
      bonusLeft: 0,
      stageTime: 0,
      bumpCooldown: 0,
      leaving: [],
    };
    stats.shifts += 1;
    card.objectives[0].text = 'Find a fare';
    card.objectives[0].done = false;
    card.objectives[1].text = 'Drive them where they want to go';
    card.objectives[1].done = false;
    card.timer = null;
    card.counter.value = 0;
    card.taxi.streak = 0;
    card.taxi.fares = 0;
    card.taxi.earned = 0;
    activities.begin(module, card);
    activities.toast('On duty. Fares are hailing nearby.', 'good');
    return true;
  }

  function updateShift(dt) {
    const s = shift;
    s.stageTime += dt;
    s.bumpCooldown -= dt;
    walkAwayFinishedFares(dt);
    const cab = s.cab;
    if (cab.wrecked || cab.despawned) {
      endShift('The cab is wrecked');
      return;
    }
    if (game.player && game.player.vehicle !== cab) {
      endShift(s.stage === 'riding' ? 'You left the cab with a fare aboard' : '');
      return;
    }
    const wantedLevel = game.wanted ? game.wanted.level : 0;
    if (s.stage === 'seeking') {
      if (wantedLevel > 0) {
        card.objectives[0].text = 'Lose the police: nobody hails a hot cab';
        return;
      }
      s.wait -= dt;
      if (s.wait <= 0) hailNewPassenger();
    } else if (s.stage === 'waiting') {
      updateWaitingPassenger();
    } else if (s.stage === 'boarding') {
      updateBoarding();
    } else if (s.stage === 'riding') {
      if (wantedLevel >= 2) {
        bail('Police?! Let me out of here!');
        return;
      }
      updateRide(dt);
    }
  }

  /** A new fare waves from a sidewalk a few hundred metres away. */
  function hailNewPassenger() {
    const s = shift;
    const cab = s.cab;
    const spot = game.roads.randomWalkwayNear(cab.pos.x, cab.pos.z, 140, 420, rng);
    if (!spot) {
      s.wait = 1;
      return;
    }
    const x = spot.x;
    const z = spot.z;
    const name = rng.pick(PASSENGER_NAMES);
    let passenger = null;
    if (game.characters && game.characters.spawn) {
      passenger = game.characters.spawn({ kind: 'civilian', faction: 'civilian', archetype: rng.pick(ARCHETYPES), name, x, z, heading: rng.range(-Math.PI, Math.PI) });
    }
    if (passenger) passenger.ai = { owner: 'taxi' };
    else passenger = { virtual: true, name, pos: { x, y: 0, z }, vehicle: null };
    s.passenger = passenger;
    s.passengerName = name;
    s.stage = 'waiting';
    s.stageTime = 0;
    s.marker = game.markers.add({ kind: 'objective', owner: 'taxiFare', entity: passenger, beacon: true, route: true, color: TAXI_YELLOW, radius: 2.5, label: `Fare: ${name}` });
    const street = game.city.streetNameAt(x, z);
    card.objectives[0].text = street ? `Pick up ${name} on ${street}` : `Pick up ${name}`;
    card.objectives[0].done = false;
    card.objectives[1].text = 'Drive them where they want to go';
    card.objectives[1].done = false;
    card.timer = null;
  }

  /** The fare waves as the cab comes near; a stop beside them lets them in. */
  function updateWaitingPassenger() {
    const s = shift;
    const p = s.passenger;
    const cab = s.cab;
    const dx = cab.pos.x - p.pos.x;
    const dz = cab.pos.z - p.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (!p.virtual && p.intent) {
      p.intent.moveX = 0;
      p.intent.moveZ = 0;
      p.intent.faceYaw = Math.atan2(dx, dz);
      p.intent.gesture = distance < 70 ? 'wave' : null;
    }
    if (s.stageTime > 150) {
      dismissPassenger();
      activities.toast(`${s.passengerName} got tired of waiting`, 'bad');
      s.streak = 0;
      card.taxi.streak = 0;
      s.stage = 'seeking';
      s.wait = 2;
      return;
    }
    if (distance < 11 && Math.abs(cab.speed) < 2.5) {
      s.stage = 'boarding';
      s.stageTime = 0;
      if (!p.virtual) {
        p.intent.gesture = null;
        game.characters.enterVehicle(p, cab, 3, { instant: false });
      }
    }
  }

  function updateBoarding() {
    const s = shift;
    const p = s.passenger;
    const cab = s.cab;
    if (Math.abs(cab.speed) > 4 && s.stageTime < 6) {
      if (!p.virtual && p.vehicle && game.characters.exitVehicle) game.characters.exitVehicle(p, { instant: true });
      s.stage = 'waiting';
      s.stageTime = 0;
      return;
    }
    const seated = p.virtual ? s.stageTime > 1.2 : p.vehicle === cab && (p.state === 'passenger' || p.state === 'sit');
    if (!seated && s.stageTime > 7 && !p.virtual) game.characters.enterVehicle(p, cab, 3, { instant: true });
    if (seated || s.stageTime > 7.2) beginRide();
  }

  /** The fare is aboard: they name a destination; the meter and the bonus clock start. */
  function beginRide() {
    const s = shift;
    const cab = s.cab;
    let destination = null;
    for (let attempt = 0; attempt < 12 && !destination; attempt += 1) {
      const candidate = rng.pick(destinations);
      const d = Math.hypot(candidate.x - cab.pos.x, candidate.z - cab.pos.z);
      if (d > 320 && d < 1500) destination = candidate;
    }
    if (!destination) destination = destinations[0];
    s.destination = destination;
    const route = game.roads.findRoute(cab.pos.x, cab.pos.z, destination.x, destination.z);
    s.routeLength = Math.max(250, game.roads.routeLength(route));
    s.driven = 0;
    s.lastX = cab.pos.x;
    s.lastZ = cab.pos.z;
    s.bumps = 0;
    s.bonusLeft = taxiBonusSeconds(s.routeLength);
    s.stage = 'riding';
    s.stageTime = 0;
    if (s.marker) game.markers.remove(s.marker);
    s.marker = game.markers.add({ kind: 'objective', owner: 'taxiFare', pos: { x: destination.x, y: 0, z: destination.z }, beacon: true, route: true, color: TAXI_YELLOW, radius: 5, label: destination.name });
    card.objectives[0].text = `Pick up ${s.passengerName}`;
    card.objectives[0].done = true;
    card.objectives[1].text = `Take ${s.passengerName} to ${destination.name}`;
    bonusTimer.seconds = s.bonusLeft;
    card.timer = bonusTimer;
    activities.say(s.passengerName, destination.line, 3.6);
  }

  function updateRide(dt) {
    const s = shift;
    const cab = s.cab;
    const step = Math.hypot(cab.pos.x - s.lastX, cab.pos.z - s.lastZ);
    s.lastX = cab.pos.x;
    s.lastZ = cab.pos.z;
    if (step < 20) s.driven += step;
    s.bonusLeft = Math.max(0, s.bonusLeft - dt);
    if ((game.time.frame % 20) === 0) {
      const fare = fareSoFar(s);
      card.counter.value = fare.meter;
      card.taxi.meter = fare.meter;
      card.taxi.tip = fare.tip;
    }
    if (s.bonusLeft > 0) bonusTimer.seconds = s.bonusLeft;
    else if (card.timer) card.timer = null;
    const d = s.destination;
    const dx = cab.pos.x - d.x;
    const dz = cab.pos.z - d.z;
    if (dx * dx + dz * dz < 12 * 12 && Math.abs(cab.speed) < 2) dropOff();
  }

  /** At the kerb: the fare pays the meter, the time bonus, a tip by how gentle the ride was, and the streak. */
  function dropOff() {
    const s = shift;
    const fare = fareSoFar(s);
    const meter = fare.meter;
    const tip = fare.tip;
    const bonus = fare.bonus;
    s.streak += 1;
    s.fares += 1;
    const streakBonus = taxiStreakBonus(s.streak);
    const total = fare.total + streakBonus;
    s.earned += total;
    stats.fares += 1;
    stats.earnings += total;
    if (s.streak > stats.bestStreak) stats.bestStreak = s.streak;
    game.economy?.addMoney?.(total, `Fare: ${s.passengerName}`);
    game.economy?.addRep?.(3 + Math.min(5, s.streak), 'Taxi fare');
    game.economy?.stats?.add?.('taxiFares', 1);
    activities.say(s.passengerName, s.bumps < 2 ? rng.pick(HAPPY_LINES) : rng.pick(GRUMPY_LINES), 3);
    const parts = [`Fare ${activities.money(meter)}`];
    if (bonus > 0) parts.push(`speed ${activities.money(bonus)}`);
    if (tip > 0) parts.push(`tip ${activities.money(tip)}`);
    if (streakBonus > 0) parts.push(`streak x${s.streak} ${activities.money(streakBonus)}`);
    activities.toast(parts.join(' · '), 'cash');
    activities.banner(`FARE ${activities.money(total)}`, s.streak >= 2 ? `${s.streak} in a row` : '', 'good', 2);
    game.events.emit('taxi:fare', { fare: meter, tip, bonus, streak: s.streak, total, passenger: s.passengerName });
    card.taxi.streak = s.streak;
    card.taxi.fares = s.fares;
    card.taxi.earned = s.earned;
    card.objectives[1].done = true;
    letPassengerOut();
    s.stage = 'seeking';
    s.wait = 3;
    card.timer = null;
    card.counter.value = 0;
  }

  /** Something goes wrong mid-ride: the fare jumps out without paying and the streak is gone. */
  function bail(line) {
    const s = shift;
    activities.say(s.passengerName, line, 3);
    letPassengerOut();
    s.streak = 0;
    card.taxi.streak = 0;
    s.stage = 'seeking';
    s.wait = 4;
    card.timer = null;
    card.counter.value = 0;
    activities.toast('Fare lost', 'bad');
  }

  /** The fare by the rules: the distance actually driven (capped near the fair route), the ride time, the bumps. */
  function fareSoFar(s) {
    return taxiFareForTrip(Math.min(s.driven, s.routeLength * 1.5), s.stageTime, s.bumps);
  }

  function letPassengerOut() {
    const s = shift;
    if (s.marker) game.markers.remove(s.marker);
    s.marker = null;
    const p = s.passenger;
    s.passenger = null;
    if (!p || p.virtual) return;
    if (p.vehicle && game.characters.exitVehicle) game.characters.exitVehicle(p, {});
    s.leaving.push({ person: p, time: 0, dirX: Math.sin(s.cab.heading + Math.PI / 2), dirZ: Math.cos(s.cab.heading + Math.PI / 2) });
  }

  function dismissPassenger() {
    const s = shift;
    if (s.marker) game.markers.remove(s.marker);
    s.marker = null;
    const p = s.passenger;
    s.passenger = null;
    if (p && !p.virtual && game.characters.despawn) game.characters.despawn(p);
  }

  /** Dropped-off fares stroll away from the kerb, then leave the world once out of the way. */
  function walkAwayFinishedFares(dt) {
    const s = shift;
    for (let i = s.leaving.length - 1; i >= 0; i -= 1) {
      const leaving = s.leaving[i];
      leaving.time += dt;
      const p = leaving.person;
      if (p.intent && !p.vehicle) {
        p.intent.moveX = leaving.dirX;
        p.intent.moveZ = leaving.dirZ;
        p.intent.pace = 'walk';
      }
      if (leaving.time > 9) {
        if (game.characters.despawn) game.characters.despawn(p);
        s.leaving.splice(i, 1);
      }
    }
  }

  /** Hear bumps and hits on the cab while a fare rides. */
  game.events.on('vehicle:collision', (event) => {
    const s = shift;
    if (!s || s.stage !== 'riding' || event.vehicle !== s.cab || s.bumpCooldown > 0) return;
    const hard = typeof event.speed === 'number' ? event.speed : 0;
    if (hard < 2.5) return;
    s.bumpCooldown = 1.2;
    s.bumps += hard > 9 ? 2 : 1;
    if (Math.random() < 0.75) activities.say(s.passengerName, BUMP_LINES[Math.floor(Math.random() * BUMP_LINES.length)], 2.2);
  });
  game.events.on('vehicle:hitCharacter', (event) => {
    const s = shift;
    if (!s || s.stage !== 'riding' || event.vehicle !== s.cab || event.character === s.passenger) return;
    bail('You hit someone! Stop the car, I am getting out!');
  });

  /** End the shift: say how it went; fares were paid as they were driven. */
  function endShift(reason) {
    const s = shift;
    if (s.passenger) {
      if (s.stage === 'riding') activities.say(s.passengerName, 'Fine! I will walk!', 2.5);
      if (s.stage === 'riding' || s.stage === 'boarding') letPassengerOut();
      else dismissPassenger();
    }
    for (const leaving of s.leaving) if (game.characters?.despawn) game.characters.despawn(leaving.person);
    game.markers.removeByOwner('taxiFare');
    shift = null;
    if (s.fares > 0) {
      activities.complete(module, {
        title: 'Taxi shift over', reward: s.earned, paid: true, rep: 0,
        detail: `${s.fares} fare${s.fares === 1 ? '' : 's'} · ${activities.money(s.earned)} · best streak ${Math.max(s.streak, 1)}`,
      });
    } else if (reason) {
      activities.fail(module, reason);
    } else {
      activities.release(module);
      activities.toast('Off duty', 'info');
    }
  }

  /** Stopped from outside: clear the fare and the markers without a summary. */
  function stop() {
    const s = shift;
    if (!s) return;
    if (s.passenger) {
      if (s.passenger.vehicle) letPassengerOut();
      else dismissPassenger();
    }
    for (const leaving of s.leaving) if (game.characters?.despawn) game.characters.despawn(leaving.person);
    game.markers.removeByOwner('taxiFare');
    shift = null;
  }

  /** A Sarab Cab parked at the depot kerb whenever the player comes by. */
  function keepDepotCab() {
    if (!depotPose || !game.vehicles || (game.time.frame & 15) !== 3) return;
    const pos = game.player ? game.player.pos : null;
    if (!pos) return;
    const distance = Math.hypot(pos.x - depotPose.x, pos.z - depotPose.z);
    if (distance > 260 || distance < 9) return;
    if (depotCab && !depotCab.despawned && Math.hypot(depotCab.pos.x - depotPose.x, depotCab.pos.z - depotPose.z) < 25) return;
    const nearby = game.vehicles.nearest(depotPose.x, depotPose.z, 14);
    if (nearby && nearby.spec.id === CAB_MODEL) {
      depotCab = nearby;
      return;
    }
    if (nearby) return;
    depotCab = game.vehicles.spawn(CAB_MODEL, { x: depotPose.x, z: depotPose.z, heading: depotPose.heading, parked: true });
    if (depotCab) depotCab.tags.depotCab = true;
  }

  /** Each destination's drop-off point at the kerb of the nearest lane. */
  function locateDestinations() {
    const out = [];
    for (const destination of DESTINATIONS) {
      let x = null;
      let z = null;
      if (destination.place) {
        const place = game.city.place(destination.place);
        if (place) {
          const pose = activities.kerbPose(place);
          x = pose.x;
          z = pose.z;
        }
      } else {
        const landmark = game.city.landmarks.find((candidate) => candidate.id === destination.landmark || candidate.kind === destination.landmark);
        if (landmark) {
          const lane = game.roads.nearestLane(landmark.x, landmark.z, 260);
          if (lane) {
            x = lane.x;
            z = lane.z;
          }
        }
      }
      if (x !== null) out.push({ name: destination.name, line: destination.line, x, z });
    }
    return out;
  }

  function serialize() {
    return { fares: stats.fares, earnings: stats.earnings, bestStreak: stats.bestStreak, shifts: stats.shifts };
  }

  function deserialize(data) {
    stop();
    stats.fares = (data && data.fares) || 0;
    stats.earnings = (data && data.earnings) || 0;
    stats.bestStreak = (data && data.bestStreak) || 0;
    stats.shifts = (data && data.shifts) || 0;
  }

  return module;
}
