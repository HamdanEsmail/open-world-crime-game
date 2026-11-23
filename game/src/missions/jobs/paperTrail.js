// Job 5, "Paper Trail", given by Mina at the Grand Souk on a Sunday morning. Learn the bullion run:
// tail the Aurum Bullion Carrier from the Vane Spire through Old Sarab and Al Wadi to the docks in
// Mina's unremarkable Sandpiper, through red lights and traffic, without being seen. At the Mina
// Customs House Captain Dahan wants a tracker on its bumper: a few tense seconds on foot, unseen.
import {
  framedShot, kerbSpot, laneSpot, streetCrossing, placeOr, landmarkOr, apart, playerAt, playerVehicle, isDown, isWrecked,
  aside, chatter, ring, later, createBarks, createListeners, aheadOf, clampNumber,
} from './jobSceneHelpers.js';

export const job = {
  id: 'paper_trail',
  order: 5,
  title: 'Paper Trail',
  giver: 'mina',
  contact: 'contact_mina',
  requires: ['dock_shift'],
  hours: null,
  reward: { money: 2000, rep: 130 },
  briefing: 'Every Sunday an Aurum Bullion Carrier leaves the Vane Spire with Vane\'s gold. Nobody knows where it goes. '
    + 'Follow it in Mina\'s Sandpiper, close enough to keep it, far enough to stay invisible. Dahan wants a tracker on it '
    + 'when it stops at the Customs House.',
  run: runPaperTrail,
};

/** How close and how far behind the carrier a tail may drive, in metres. */
const TAIL = { min: 16, max: 90, grace: 5 };
/** The carrier's cruising speed through town, m/s (about 40 km/h). */
const CRUISE = 11;
/** Seconds the carrier stands at the Customs House while its guard checks the seals. */
const CUSTOMS_STOP = 32;
/** Seconds at the rear bumper it takes to fix the tracker. */
const PLANT_SECONDS = 1.6;

/** Brief at the souk, wait at the Spire, three legs of tail, the tracker, the pier, then away. */
async function runPaperTrail(m) {
  const scene = surveyTheRoute(m);
  try {
    m.setTime(9.6);
    m.setTraffic(1);
    if (m.resumeFrom === 'customs') {
      resumeAtTheCustomsHouse(m, scene);
      watchForSpooking(m, scene);
    } else {
      if (m.resumeFrom === 'tail') {
        resumeBehindTheCarrier(m, scene);
      } else {
        await openAtMinasStall(m, scene);
        await takePositionAtTheSpire(m, scene);
        m.checkpoint('tail');
        await watchVaneSeeItOff(m, scene);
      }
      watchForSpooking(m, scene);
      await tailLeg(m, scene, [scene.pearlCorner, scene.sundialStop], 'Tail the carrier down Pearl Street to the Sundial');
      await holdBack(m, scene, 7, 'Hold back while it idles by the Sundial', [['mina', 'It always stops here. Counting tourists, or tails.']]);
      await tailLeg(m, scene, [scene.karakStop], 'Tail it east along Souk Street into Al Wadi');
      await teaBreak(m, scene);
      await tailLeg(m, scene, [scene.craneCorner, scene.customsStop], 'Tail it north to the Mina Customs House');
      m.checkpoint('customs');
    }
    await plantTheTracker(m, scene);
    await followToThePier(m, scene);
    await slipAway(m, scene);
  } finally {
    scene.listeners.clear();
  }
}

/** Mina's stall: the ask, the rules of a good tail, and her deliberately forgettable Sandpiper. */
async function openAtMinasStall(m, scene) {
  const contact = scene.contact;
  m.teleportPlayer(contact.x + 1.3, contact.z + 1.2, Math.atan2(-1.3, -1.2));
  m.spawnCast('mina', contact.x - 0.8, contact.z, Math.atan2(1.3, 1.2));
  scene.sandpiper = m.spawnVehicle('dromo_sandpiper', { x: scene.sandpiperSpot.x, z: scene.sandpiperSpot.z, heading: scene.sandpiperSpot.heading, color: 0xf4f1e8, parked: true });
  const pair = { x: contact.x + 0.25, z: contact.z + 0.6 };
  await m.cutscene([
    framedShot(m, contact, { distance: 34, height: 11, yaw: 0.35, lookHeight: 4, seconds: 4.2, drift: 10,
      speaker: 'mina', text: 'Every Sunday Vane\'s gold leaves the Spire in an armoured truck.' }),
    framedShot(m, pair, { distance: 5.2, height: 1.7, yaw: 0.35, lookHeight: 1.5, seconds: 4,
      speaker: 'mina', text: 'Where it goes after that, nobody knows. Today you find out.' }),
    framedShot(m, pair, { distance: 4.6, height: 1.7, yaw: -0.4, lookHeight: 1.55, seconds: 2.8,
      speaker: 'zayd', text: 'A tail. No ramming?' }),
    framedShot(m, scene.sandpiper, { distance: 8, height: 2.4, yaw: scene.sandpiper.heading + 2.4, lookHeight: 0.8, seconds: 3.8, drift: 2,
      speaker: 'mina', text: 'Take my Sandpiper. Nobody has ever looked twice at a Sandpiper.' }),
  ]);
  chatter(m, [['mina', 'Stay back, stay boring. If they see you, it is over.']]);
  m.objective('Get in Mina\'s Sandpiper');
  const carMark = m.marker(scene.sandpiper, { label: 'Sandpiper', kind: 'vehicle', color: 0x4fb6ff, radius: 2.6, route: true });
  await m.until(() => playerVehicle(m) !== null);
  m.clearMarker(carMark);
  later(m, 3, () => ring(m, 'dahan', [
    ['dahan', 'Mina has you tailing the bullion run. Good. So do I.'],
    ['dahan', 'It stops at the Customs House. Put my tracker on its rear bumper.'],
    ['dahan', 'Small, magnetic, quick. If a guard looks your way, walk on.'],
    ['zayd', 'And if he doesn\'t look?'],
    ['dahan', 'Then for once we follow Vane\'s gold all the way home.'],
  ]));
}

/** Park a safe distance behind the carrier at the Spire's kerb, where the lobby can't see you. */
async function takePositionAtTheSpire(m, scene) {
  spawnTheCarrier(m, scene, scene.carrierSpot);
  m.objective('Park behind the bullion carrier at the Vane Spire');
  await m.reach(scene.waitSpot, 10, { inVehicle: true, stopped: true, label: 'Wait here' });
  chatter(m, [['mina', 'Good. Engine running, eyes on the truck. Look bored.']]);
}

/** Idris Vane on his plaza, seeing his gold off like a favourite nephew. */
async function watchVaneSeeItOff(m, scene) {
  const door = scene.door;
  const vaneAt = { x: door.x + 1.2, z: door.z - 2.6 };
  const vane = m.spawnCast('vane', vaneAt.x, vaneAt.z, 0);
  const aide = m.spawnPerson({ archetype: 'business', kind: 'target', faction: 'aurum', name: 'Aurum guard', x: door.x - 1.4, z: door.z - 3, heading: 0 });
  await m.cutscene([
    framedShot(m, door, { distance: 48, height: 3, yaw: 0.45, lookHeight: 70, seconds: 4, rise: 10,
      speaker: 'mina', text: 'Ten o\'clock. Vane walks his gold like a dog.' }),
    framedShot(m, vaneAt, { distance: 4.6, height: 1.75, yaw: 0.6, lookHeight: 1.7, seconds: 4.2, drift: 0.8,
      speaker: 'vane', text: 'Gold is patient, gentlemen. Be like gold.' }),
    framedShot(m, scene.carrier, { distance: 15, height: 3.2, yaw: scene.carrier.heading + Math.PI * 0.8, lookHeight: 1.4, seconds: 3.6,
      speaker: 'mina', text: 'There it goes. Three stops, then somewhere. Stay with it.' }),
  ]);
  m.walkTo(vane, door.x, door.z - 50, { pace: 'walk' }).then(() => m.remove(vane)).catch(() => {});
  m.walkTo(aide, door.x - 1, door.z - 50, { pace: 'walk' }).then(() => m.remove(aide)).catch(() => {});
}

/** A retry at the Spire: Zayd already parked behind the carrier, engine running. */
function resumeBehindTheCarrier(m, scene) {
  scene.sandpiper = m.spawnVehicle('dromo_sandpiper', { x: scene.waitSpot.x, z: scene.waitSpot.z, heading: scene.waitSpot.heading, color: 0xf4f1e8 });
  m.playerInto(scene.sandpiper);
  spawnTheCarrier(m, scene, scene.carrierSpot);
  chatter(m, [['mina', 'Here it comes again. Gently this time.']]);
}

/** A retry at the Customs House: the carrier just pulled up, Zayd parked well back along the avenue. */
function resumeAtTheCustomsHouse(m, scene) {
  const stop = scene.customsStop;
  spawnTheCarrier(m, scene, stop);
  scene.guard = m.spawnPerson({ archetype: 'business', kind: 'target', faction: 'aurum', name: 'Aurum guard', x: stop.x, z: stop.z, heading: stop.heading });
  m.seat(scene.carrier, scene.guard, 1);
  const back = aheadOf({ pos: stop, heading: stop.heading }, -48);
  const spot = laneSpot(m, back.x, back.z, { facing: stop.heading });
  scene.sandpiper = m.spawnVehicle('dromo_sandpiper', { x: spot.x, z: spot.z, heading: spot.heading, color: 0xf4f1e8 });
  m.playerInto(scene.sandpiper);
  chatter(m, [['mina', 'Customs House. The carrier is stopping. Stay back.']]);
}

/**
 * One leg of the tail: the carrier drives through `points` (stopping at the last) obeying the
 * lights, while Zayd keeps between TAIL.min and TAIL.max metres behind it.
 */
async function tailLeg(m, scene, points, text) {
  m.objective(text);
  // The heavy truck rolls the last stretch slowly so it pulls up without overshooting (and reversing into its tail).
  const stop = points[points.length - 1];
  const legs = points.slice(0, -1).map((point) => ({ point, speed: CRUISE, stop: false }));
  if (stop.lane) legs.push({ point: { x: stop.x - stop.lane.dirX * 40, z: stop.z - stop.lane.dirZ * 40 }, speed: CRUISE, stop: false });
  legs.push({ point: stop, speed: CRUISE * 0.55, stop: true });
  const drive = (async () => {
    for (const leg of legs) {
      await m.driveTo(scene.carrier, leg.point.x, leg.point.z, { speed: leg.speed, stop: leg.stop, careful: true, obeySignals: true });
    }
    return true;
  })();
  drive.catch(() => {});
  const tail = m.tail(scene.carrier, { min: TAIL.min, max: TAIL.max, grace: TAIL.grace, label: 'Bullion carrier' });
  scene.tailing = true;
  keepTheRoadClear(m, scene, () => scene.tailing);
  await m.any([drive, tail]);
  scene.tailing = false;
}

/**
 * A careful driver waits behind anything stopped in its lane; if the carrier has stood still far
 * longer than a red light lasts, whatever is stuck in front of it is cleared away.
 */
function keepTheRoadClear(m, scene, driving) {
  const carrier = scene.carrier;
  let stillFor = 0;
  aside(m.until(() => {
    if (!driving()) return true;
    stillFor = Math.abs(carrier.speed) < 0.5 ? stillFor + m.game.time.dt : 0;
    if (stillFor > 20) {
      stillFor = 0;
      const ahead = aheadOf(carrier, 14);
      m.clearArea(ahead.x, ahead.z, 12);
    }
    return false;
  }));
}

/** The carrier waits: Zayd keeps his distance (the tail rules still hold) for `seconds`. */
async function holdBack(m, scene, seconds, text, lines) {
  m.objective(text);
  if (lines) chatter(m, lines);
  scene.tailing = true;
  await m.any([m.seconds(seconds), m.tail(scene.carrier, { min: TAIL.min - 4, max: TAIL.max + 20, grace: TAIL.grace, label: 'Bullion carrier' })]);
  scene.tailing = false;
}

/** At Karak Corner the guard hops out for tea. Creatures of habit. */
async function teaBreak(m, scene) {
  const carrier = scene.carrier;
  m.objective('Wait while the guard buys his karak');
  chatter(m, [['mina', 'Karak Corner. Every run. Vane\'s guards are creatures of habit.']]);
  const side = sideDoorOf(carrier, 1);
  const guard = m.spawnPerson({ archetype: 'business', kind: 'target', faction: 'aurum', name: 'Aurum guard', x: side.x, z: side.z, heading: carrier.heading });
  scene.guard = guard;
  scene.tailing = true;
  const errand = (async () => {
    await m.walkTo(guard, scene.karak.x, scene.karak.z, { pace: 'walk' });
    guard.intent.gesture = 'talk';
    await m.seconds(3.5);
    guard.intent.gesture = null;
    const back = sideDoorOf(carrier, 1);
    await m.walkTo(guard, back.x, back.z, { pace: 'walk' });
    m.seat(carrier, guard, 1);
    return true;
  })();
  errand.catch(() => {});
  later(m, 4, () => chatter(m, [['radio', 'Sarab Gold, ninety-eight six. Khamsin warning for later this week.']]));
  await m.any([
    errand,
    m.seconds(26),
    m.tail(carrier, { min: TAIL.min - 4, max: TAIL.max + 20, grace: TAIL.grace, label: 'Bullion carrier' }),
  ]);
  scene.tailing = false;
  if (guard.vehicle !== carrier && !isDown(guard)) m.seat(carrier, guard, 1);
}

/**
 * The Customs House stop: the guard circles the truck checking its seals; Zayd may walk up behind
 * it and fix Dahan's tracker to the rear bumper, as long as the guard never sees him do it.
 */
async function plantTheTracker(m, scene) {
  const carrier = scene.carrier;
  const barks = scene.barks;
  m.objective('Hold back while the carrier stops at the Customs House');
  const tracker = m.objective('Optional: plant Dahan\'s tracker on the carrier\'s rear bumper, unseen', { optional: true });
  chatter(m, [['mina', 'Customs seal check. Thirty seconds, then they roll.']]);
  const guard = scene.guard && !isDown(scene.guard) ? scene.guard : m.spawnPerson({ archetype: 'business', kind: 'target', faction: 'aurum', name: 'Aurum guard', x: carrier.pos.x, z: carrier.pos.z, heading: carrier.heading });
  const kerbSide = sideDoorOf(carrier, 1);
  if (guard.vehicle) m.walkTo(guard, kerbSide.x, kerbSide.z, { pace: 'walk' }).catch(() => {});
  scene.guard = guard;
  m.failIfDead(guard, 'You hurt an Aurum guard. Vane will change every route he has.');
  const state = { patrolling: true, seen: false, planted: false, progress: 0 };
  patrolTheCarrier(m, carrier, guard, state);
  const bumper = aheadOf(carrier, -(carrier.spec.length / 2 + 0.7));
  const bumperMark = m.marker(bumper, { label: 'Rear bumper', kind: 'objective', color: 0x2f6bff, radius: 1.2, route: false });
  const clock = m.timer('CARRIER LEAVES', CUSTOMS_STOP, { onExpire: 'continue' });
  let counter = null;
  let shown = -1;
  await m.until(() => {
    if (clock.remaining <= 0) return true;
    const zayd = m.game.player.character;
    const onFoot = !playerVehicle(m) && zayd;
    if (onFoot && apart(zayd, carrier) < 30) barks.say('outOfCar', [[['mina', 'Dust? Why did you stop?'], ['zayd', 'Stretching my legs. Long drive.']]], { once: true, force: true });
    if (onFoot && guardSees(m, guard, carrier, zayd.pos)) {
      state.seen = true;
      return true;
    }
    const atBumper = onFoot && apart(zayd, bumper) < 2.1;
    if (atBumper) {
      state.progress += m.game.time.dt;
      if (!counter) {
        counter = m.counter('PLANTING TRACKER', 0, 100);
        shown = -1;
      }
      const percent = Math.round(clampNumber(state.progress / PLANT_SECONDS, 0, 1) * 100);
      if (percent !== shown) {
        shown = percent;
        counter.set(percent);
      }
    } else {
      state.progress = Math.max(0, state.progress - m.game.time.dt * 2);
      if (counter) {
        counter.clear();
        counter = null;
      }
    }
    if (state.progress >= PLANT_SECONDS) {
      state.planted = true;
      return true;
    }
    return false;
  });
  clock.stop();
  if (counter) counter.clear();
  m.clearMarker(bumperMark);
  state.patrolling = false;

  if (state.planted) {
    tracker.done();
    m.badge(10, 'Dahan has a tracker on Vane\'s gold');
    m.flag('trackerPlanted', true);
    chatter(m, [['dahan', 'Signal is live. Beautiful work, Karam. Now get back in the car.']]);
    m.objective('Get back in the Sandpiper before it rolls');
    const carMark = m.marker(scene.sandpiper, { label: 'Sandpiper', kind: 'vehicle', color: 0x4fb6ff, radius: 2.6, route: true });
    await m.any([m.until(() => playerVehicle(m) !== null), m.seconds(Math.max(4, clock.remaining))]);
    m.clearMarker(carMark);
  } else if (state.seen) {
    tracker.fail();
    m.flag('trackerPlanted', false);
    m.trust(-3, 'Mina heard a guard chase off a "dockhand"');
    chatter(m, [
      ['Aurum guard', 'Hey! You! Away from the truck!'],
      ['zayd', 'Sorry, boss. Looking for the customs office.'],
      ['mina', 'A dockhand at the truck? Tell me that was not you.'],
    ]);
  } else {
    tracker.fail();
    m.flag('trackerPlanted', false);
  }
  // The guard climbs back in (in a hurry if he has just chased someone off).
  if (!isDown(guard) && guard.vehicle !== carrier) {
    const door = sideDoorOf(carrier, 1);
    await m.any([m.walkTo(guard, door.x, door.z, { pace: state.seen ? 'run' : 'walk' }), m.seconds(6)]);
    if (!isDown(guard) && guard.vehicle !== carrier) m.seat(carrier, guard, 1);
  }
}

/** The carrier rolls on to Pier Nine; a looser follow, then a long look from the Corniche. */
async function followToThePier(m, scene) {
  const carrier = scene.carrier;
  m.objective('Follow the carrier to its berth');
  const leg = (async () => {
    await m.driveTo(carrier, scene.quayGate.x, scene.quayGate.z, { speed: CRUISE, stop: false, careful: true, obeySignals: true });
    await m.driveTo(carrier, scene.berth.x, scene.berth.z, { speed: 5, stop: true, careful: true });
  })();
  leg.catch(() => {});
  let rolling = true;
  keepTheRoadClear(m, scene, () => rolling);
  const mark = m.marker(carrier, { label: 'Bullion carrier', kind: 'objective', color: 0xffd24a, route: true });
  let farFor = 0;
  const lost = m.failIf(() => {
    if (apart(playerAt(m), carrier) > 280) farFor += m.game.time.dt;
    else farFor = 0;
    return farFor > 10;
  }, 'You lost the carrier in the docks.');
  await leg;
  rolling = false;
  lost.stop();
  m.clearMarker(mark);
  chatter(m, [
    ['mina', 'Pier Nine. The export crane. So it leaves by sea.'],
    ['zayd', 'Or it\'s meant to look that way.'],
  ]);
  m.objective('Watch it load from the Corniche, at a distance');
  let closeFor = 0;
  m.failIf(() => {
    if (apart(playerAt(m), carrier) < 24) {
      if (closeFor === 0) scene.barks.say('pierClose', [['mina', 'Not on the quay! Back up to the Corniche.']], { force: true });
      closeFor += m.game.time.dt;
    } else {
      closeFor = 0;
    }
    return closeFor > 4;
  }, 'The dock crew spotted you at the pier.');
  await m.reach(scene.vantage, 16, { stopped: true, label: 'Vantage point' });
  await m.seconds(4);
  chatter(m, [['mina', 'Crane takes the strongbox. Ship\'s called the Amber Star.']]);
  await m.seconds(3);
}

/** Drive away from the docks while Mina wraps up; the crew moves the Cover meter on the tail. */
async function slipAway(m, scene) {
  m.objective('Get clear of the docks');
  m.marker(scene.clearOfDocks, { label: 'Clear of the docks', kind: 'waypoint', radius: 6, route: true });
  ring(m, 'mina', scene.spooked
    ? [['mina', 'We know the route now. Sunday, Pier Nine, the Amber Star.'], ['mina', 'Next time drive like nobody, not like a rally champion.']]
    : [['mina', 'We know the route now. Sunday, Pier Nine, the Amber Star.'], ['mina', 'And they never saw you. Not once. I\'m almost impressed.']]);
  await m.until(() => apart(playerAt(m), scene.berth) > 300);
  if (scene.spooked) m.trust(2, 'Mina got her route, if not gracefully');
  else m.trust(5, 'A ghost of a tail: Mina is impressed');
}

/** Mina's running commentary on the gap, and the two ways to blow a tail outright: ram it or shoot near it. */
function watchForSpooking(m, scene) {
  const carrier = scene.carrier;
  const barks = scene.barks;
  let rammed = false;
  let gunfire = false;
  scene.listeners.on('vehicle:collision', (contact) => {
    const mine = playerVehicle(m);
    if (mine && ((contact.vehicle === carrier && contact.other === mine) || (contact.vehicle === mine && contact.other === carrier))) rammed = true;
  });
  scene.listeners.on('shot:fired', (shot) => {
    if (shot.shooter === m.game.player.character && apart(shot, carrier) < 80) gunfire = true;
  });
  m.failIf(() => rammed, 'You rammed the bullion carrier. So much for a quiet tail.');
  m.failIf(() => gunfire, 'Shots near the carrier. Aurum changed the whole route.');
  m.failIf(() => isWrecked(carrier), 'The bullion carrier is out of action. The run is cancelled.');
  aside(m.until(() => {
    if (!scene.tailing) return false;
    const d = apart(playerAt(m), carrier);
    if (d < TAIL.min + 6) {
      scene.spooked = true;
      barks.say('close', [['mina', 'Too close! They check their mirrors, Dust.'], ['mina', 'Back off. Let a taxi in between you.'], ['mina', 'Closer and you can kiss the bumper.']]);
    } else if (d > TAIL.max - 15) {
      barks.say('far', [['mina', 'You\'re losing them. Close up.'], ['mina', 'Don\'t let a red light split you up.'], ['zayd', 'I see it. Relax.']]);
    } else if (Math.abs(carrier.speed) < 0.5 && d < 40) {
      barks.say('red', [['mina', 'Red light. Breathe. Stay put.'], ['zayd', 'Longest light in Port Sarab.']]);
    }
    return false;
  }));
}

/** The guard walks round the truck, a look at the seals at every corner, until told to stop. */
function patrolTheCarrier(m, carrier, guard, state) {
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  (async () => {
    let index = 0;
    while (state.patrolling && !isDown(guard)) {
      const [side, along] = corners[index % 4];
      const corner = cornerOf(carrier, side, along);
      await m.walkTo(guard, corner.x, corner.z, { pace: 'walk' });
      if (!state.patrolling) break;
      await m.seconds(1.4);
      index += 1;
    }
  })().catch(() => {});
}

/** True when the guard sees a point: close, inside his field of view, and not hidden by the truck or a wall. */
function guardSees(m, guard, carrier, point) {
  if (isDown(guard) || guard.vehicle) return false;
  const dx = point.x - guard.pos.x;
  const dz = point.z - guard.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 2.2) return true;
  if (d > 15) return false;
  const facing = (dx * Math.sin(guard.heading) + dz * Math.cos(guard.heading)) / d;
  if (facing < 0.42) return false;
  if (truckHides(carrier, guard.pos, point)) return false;
  const colliders = m.game.colliders;
  if (!colliders || !colliders.lineOfSight) return true;
  EYE.x = guard.pos.x;
  EYE.y = guard.pos.y + 1.6;
  EYE.z = guard.pos.z;
  SEEN.x = point.x;
  SEEN.y = point.y + 1.2;
  SEEN.z = point.z;
  return colliders.lineOfSight(EYE, SEEN);
}

/** Does the carrier's body stand between a and b? A segment against the truck's footprint. */
function truckHides(carrier, a, b) {
  const s = Math.sin(carrier.heading);
  const c = Math.cos(carrier.heading);
  const halfLength = carrier.spec.length / 2;
  const halfWidth = carrier.spec.width / 2;
  const ax = (a.x - carrier.pos.x) * c - (a.z - carrier.pos.z) * s;
  const az = (a.x - carrier.pos.x) * s + (a.z - carrier.pos.z) * c;
  const bx = (b.x - carrier.pos.x) * c - (b.z - carrier.pos.z) * s;
  const bz = (b.x - carrier.pos.x) * s + (b.z - carrier.pos.z) * c;
  let t0 = 0;
  let t1 = 1;
  const slabs = [[ax, bx - ax, halfWidth], [az, bz - az, halfLength]];
  for (const [start, delta, half] of slabs) {
    if (Math.abs(delta) < 1e-6) {
      if (start < -half || start > half) return false;
      continue;
    }
    let near = (-half - start) / delta;
    let far = (half - start) / delta;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

/** A corner of the truck, a little out from the body: side +1 is its right, along +1 its front. */
function cornerOf(carrier, side, along) {
  const s = Math.sin(carrier.heading);
  const c = Math.cos(carrier.heading);
  const out = carrier.spec.width / 2 + 1.1;
  const reach = carrier.spec.length / 2 + 0.9;
  // forward = (s, c); right = (-c, s)
  return { x: carrier.pos.x + s * reach * along - c * out * side, z: carrier.pos.z + c * reach * along + s * out * side };
}

/** Beside the cab door on one side (+1 right, the kerb side; -1 left). */
function sideDoorOf(carrier, side) {
  const s = Math.sin(carrier.heading);
  const c = Math.cos(carrier.heading);
  const out = carrier.spec.width / 2 + 1;
  const along = carrier.spec.length * 0.22;
  return { x: carrier.pos.x + s * along - c * out * side, z: carrier.pos.z + c * along + s * out * side };
}

/** The Aurum carrier at a kerb with its driver aboard, engine running, the road ahead of it cleared. */
function spawnTheCarrier(m, scene, spot) {
  m.clearArea(spot.x, spot.z, 32);
  scene.carrier = m.spawnVehicle('aurum_bullion', { x: spot.x, z: spot.z, heading: spot.heading, color: 0x2b2f36 });
  const driver = m.spawnPerson({ archetype: 'business', kind: 'target', faction: 'aurum', name: 'Aurum driver', x: spot.x, z: spot.z, heading: spot.heading });
  m.seat(scene.carrier, driver, 0);
  m.stopDriving(scene.carrier);
  scene.driver = driver;
  m.failIfDead(driver, 'The carrier\'s driver is hurt. Vane will never use this route again.');
}

/** Every stop of the run, read from the plan: the Spire kerb, the Sundial, Karak Corner, Customs, Pier Nine. */
function surveyTheRoute(m) {
  const city = m.game.city;
  const contact = placeOr(m, 'contact_mina', { x: -260, z: 50, heading: Math.PI });
  const door = placeOr(m, 'vane_spire_door', { x: -63, z: -310, heading: Math.PI });
  // Each stop sits on the lane the carrier is already driving, so it never has to turn round
  // (and drive straight past its own tail).
  const west = -Math.PI / 2;
  const east = Math.PI / 2;
  const north = Math.PI;
  // On the lane line, not in the parking bays, so no parked car stands in front of it.
  const carrierSpot = kerbSpot(m, door.curbX, door.curbZ, { facing: west, shift: 0.3 });
  const back = aheadOf({ pos: carrierSpot, heading: carrierSpot.heading }, -62);
  const sundial = landmarkOr(m, 'sundialTower', { x: -63, z: 150 });
  const karak = placeOr(m, 'food_wadi', { x: 803, z: 50 });
  const customs = landmarkOr(m, 'customsHouse', { x: 773, z: -400, w: 70 });
  const exportDock = placeOr(m, 'export_dock', { x: 1016, z: -683 });
  const pearl = streetCrossing(m, 'Pearl Street', 'Gold Street', { x: -160, z: -300 });
  const soukStreetZ = streetCrossing(m, 'Pearl Street', 'Souk Street', { x: -160, z: 60 }).z;
  const crane = streetCrossing(m, 'Crane Street', 'Souk Street', { x: 920, z: 60 });
  const quayEdge = (city.coast && city.coast.beachTopZ) || -720;
  const berth = { x: exportDock.x, z: quayEdge - 70 };
  const vantageLane = laneSpot(m, exportDock.x - 95, exportDock.curbZ !== undefined ? exportDock.curbZ - 12 : exportDock.z - 16);
  return {
    contact, door, carrierSpot,
    waitSpot: kerbSpot(m, back.x, back.z, { facing: west }),
    sandpiperSpot: kerbSpot(m, contact.x + 14, contact.curbZ !== undefined ? contact.curbZ : contact.z + 5),
    pearlCorner: laneSpot(m, pearl.x + 16, pearl.z, { facing: west }),
    sundialStop: kerbSpot(m, sundial.x - 30, soukStreetZ + 4, { facing: east, shift: 0.25 }),
    karak,
    karakStop: kerbSpot(m, karak.x, soukStreetZ + 4, { facing: east, shift: 0.25 }),
    craneCorner: laneSpot(m, crane.x - 16, crane.z, { facing: east }),
    customsStop: kerbSpot(m, customs.x - (customs.w || 70) / 2 - 40, customs.z, { facing: north, shift: 0.3 }),
    berth,
    quayGate: laneSpot(m, berth.x - 25, exportDock.curbZ !== undefined ? exportDock.curbZ - 12 : exportDock.z - 16, { facing: east }),
    vantage: { x: vantageLane.x, z: vantageLane.z },
    clearOfDocks: laneSpot(m, berth.x - 120, berth.z + 330),
    carrier: null, driver: null, guard: null, sandpiper: null, tailing: false, spooked: false,
    barks: createBarks(m, { gap: 6 }),
    listeners: createListeners(m),
  };
}

const EYE = { x: 0, y: 0, z: 0 };
const SEEN = { x: 0, y: 0, z: 0 };
