// Job 4, "Dock Shift", given by Tavi at Mina Docks at half past ten at night. A Sahel Hauler loaded
// with Idris Vane's "machine parts" (gold-smelting gear) sits in a floodlit container yard guarded
// by Dune Jackals: shoot it out among the stacks, then haul the heavy truck across the city and the
// dunes to Hangar 2 at Sarab Airfield with Jackal pickups ramming it all the way. Captain Dahan asks
// for a stop at the Mina Customs House so her people can photograph the manifest; the crew notices.
import {
  framedShot, laneSpot, kerbSpot, laneToward, clearSpot, standingSpots, lotsOfUse, lotCentre, placeOr, landmarkOr,
  apart, playerAt, playerVehicle, isDown, isWrecked, healthShare, aside, chatter, ring, later, createBarks,
  createListeners, markFoes, untilDown, spawnJackalRide, hangFloodlights, aheadOf,
} from './jobSceneHelpers.js';

export const job = {
  id: 'dock_shift',
  order: 4,
  title: 'Dock Shift',
  giver: 'tavi',
  contact: 'contact_tavi',
  requires: ['market_day'],
  hours: null,
  reward: { money: 2500, rep: 140 },
  briefing: 'Tavi has a truck for the crew: a Sahel Hauler of Vane\'s "machine parts", really the gear to melt down gold, '
    + 'parked in a Jackal-guarded container yard by Pier Nine. Take the yard at night, take the truck, and drive it to '
    + 'Hangar 2 at Sarab Airfield through every pickup Sayf can send. Dahan wants the manifest photographed at the Customs House on the way.',
  run: runDockShift,
};

/** Seconds the Hauler must stand still at the Customs House while the manifest is photographed. */
const MANIFEST_SECONDS = 10;
/** No more Jackal vehicles than this chase the Hauler at once. */
const MOST_CHASERS = 3;

/** Night yard shoot-out, the haul to the airfield under attack, the Customs House detour. */
async function runDockShift(m) {
  const scene = surveyDocks(m);
  try {
    m.setTime(22.5);
    m.setTraffic(0.45);
    m.setPedestrians(0.25);
    if (m.resumeFrom !== 'haul') {
      spawnTheYard(m, scene);
      await openOnTheNightShift(m, scene);
      await reachTheYard(m, scene);
      await shootOutInTheStacks(m, scene);
      await m.inVehicle(scene.hauler, { label: 'Sahel Hauler' });
      m.checkpoint('haul');
    } else {
      resumeInTheHauler(m, scene);
    }
    await haulToHangarTwo(m, scene);
    await closeAtTheHangar(m, scene);
  } finally {
    scene.listeners.clear();
    if (scene.lights) scene.lights.remove();
  }
}

/** Cranes against the night, Tavi at his post, the floodlit yard with the truck and its guards. */
async function openOnTheNightShift(m, scene) {
  const contact = scene.contact;
  m.teleportPlayer(contact.x + 1.3, contact.z - 1.2, Math.atan2(-1.3, 1.2));
  scene.tavi = m.spawnCast('tavi', contact.x - 0.8, contact.z + 0.6, Math.atan2(1.3, -1.2));
  const pair = { x: contact.x + 0.25, z: contact.z - 0.3 };
  await m.cutscene([
    framedShot(m, scene.cranes, { distance: 150, height: 55, yaw: 2.6, lookHeight: 20, seconds: 4.4, drift: 30,
      speaker: 'tavi', text: 'Night shift at Mina Docks. Vane\'s crates never wait for morning.' }),
    framedShot(m, pair, { distance: 5.2, height: 1.75, yaw: 2.75, lookHeight: 1.6, seconds: 4, drift: 0.6,
      speaker: 'tavi', text: 'Sahel Hauler in the yard by Pier Nine. Manifest says machine parts.' }),
    framedShot(m, pair, { distance: 4.8, height: 1.7, yaw: -1.35, lookHeight: 1.6, seconds: 2.6,
      speaker: 'zayd', text: 'And what does the truck say?' }),
    framedShot(m, scene.hauler, { distance: 19, height: 4.5, yaw: scene.roadSide + 0.45, lookHeight: 1.8, seconds: 4.4, drift: 5,
      speaker: 'tavi', text: 'Smelting gear. Vane melts down what he steals. Jackals all over it.' }),
  ]);
  m.give('smg', 128);
  chatter(m, [
    ['tavi', 'Here. Hornet MP. Try not to shoot me with it.'],
    ['zayd', 'No promises.'],
    ['tavi', 'Then Hangar 2 at the airfield. Mina is waiting. Don\'t be late.'],
  ]);
  later(m, 9, () => ring(m, 'dahan', [
    ['dahan', 'That truck\'s manifest is my whole case against Vane.'],
    ['dahan', 'On the way out, stop at the Customs House. My people photograph it.'],
    ['zayd', 'With Jackals on my tail?'],
    ['dahan', 'Ten seconds, Karam. Then drive like you used to.'],
  ]));
}

/** Tavi's pickup to the yard gate; the guards stay easy until Zayd is close or the shooting starts. */
async function reachTheYard(m, scene) {
  m.objective('Take Tavi\'s pickup to the container yard by Pier Nine');
  const pickupMark = m.marker(scene.taviPickup, { label: 'Tavi\'s pickup', kind: 'vehicle', color: 0x1ba39c, route: false });
  m.until(() => playerVehicle(m) !== null).then(() => m.clearMarker(pickupMark)).catch(() => {});
  await m.reach(scene.approach, 40, { label: 'Container yard' });
  m.clearMarker(pickupMark);
  chatter(m, [['tavi', 'Lights off. The Jackals shoot at anything that glows.']]);
}

/** Four guards around the truck, then three more out of the stacks. */
async function shootOutInTheStacks(m, scene) {
  const barks = scene.barks;
  m.wanted.lock(0);
  m.police.suspend(240);
  m.clearArea(scene.yardCentre.x, scene.yardCentre.z, 90);
  m.failIfDestroyed(scene.hauler, 'The Hauler burned with Vane\'s gear inside.');
  m.objective('Clear the Jackals out of the yard');
  const counter = m.counter('JACKALS DOWN', 0, 7);
  const firstMarks = markFoes(m, scene.guards);

  // The yard wakes up when Zayd gets close, fires a shot, or lands a hit on one of them.
  let alarm = false;
  const zayd = m.game.player.character;
  scene.listeners.on('shot:fired', (shot) => {
    if (shot.shooter === zayd && apart(zayd, scene.yardCentre) < 160) alarm = true;
  });
  scene.listeners.on('character:damaged', (hit) => {
    if (scene.guards.indexOf(hit.character) !== -1) alarm = true;
  });
  await m.until(() => alarm || scene.guards.some((guard) => !isDown(guard) && apart(guard, playerAt(m)) < 36));
  for (const guard of scene.guards) if (!isDown(guard)) m.hostile(guard, { accuracy: 0.34, style: 'cover' });
  chatter(m, [['Jackal', 'Who\'s there? Yard\'s closed!']]);

  await untilDown(m, scene.guards, 3, {
    counter, marks: firstMarks,
    onDown: (down) => {
      if (down === 1) barks.say('firstBlood', [['tavi', 'One down. Vane pays them by the bullet.'], ['zayd', 'That\'s one.']], { force: true });
    },
  });
  // Three more come round from the far rows with smgs.
  const far = { x: scene.yardCentre.x * 2 - scene.haulerSpot.x, z: scene.yardCentre.z * 2 - scene.haulerSpot.z };
  const spots = standingSpots(m, far.x, far.z, 3, { radius: 7 });
  const relief = spots.map((spot) => m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: spot.x, z: spot.z, heading: spot.heading, weapon: 'smg', ammo: 300 }));
  for (const jackal of relief) m.hostile(jackal, { accuracy: 0.3, style: 'cover' });
  chatter(m, [['Jackal', 'Behind the reefers! Flank him!'], ['tavi', 'More of them in the stacks. Watch the rows!']]);
  const allGuards = scene.guards.concat(relief);
  const reliefMarks = markFoes(m, relief);
  await untilDown(m, allGuards, 7, {
    counter, marks: { refresh() { firstMarks.refresh(); reliefMarks.refresh(); } },
    onDown: (down) => {
      if (down === 5) barks.say('five', [['zayd', 'Two left.'], ['tavi', 'Keep your head down, rally boy.']], { force: true });
      if (down === 6) barks.say('six', [['zayd', 'Last one.']], { force: true });
    },
  });
  counter.clear();
  chatter(m, [['tavi', 'Yard\'s quiet. Get in the Hauler before the next patrol.']]);
  m.objective('Get in the Sahel Hauler');
}

/** A retry from the yard gate: the Hauler where it stood, Zayd at its door, the guards gone. */
function resumeInTheHauler(m, scene) {
  scene.hauler = m.spawnVehicle('sahel_hauler', { x: scene.haulerSpot.x, z: scene.haulerSpot.z, heading: scene.haulerSpot.heading, color: 0xf2a81d });
  scene.lights = hangFloodlights(m, scene.floodlightPoints);
  m.give('smg', 128);
  m.playerInto(scene.hauler);
  m.wanted.clear();
}

/** The long haul: Jackal pickups in waves, the Hauler's damage, the optional Customs House stop. */
async function haulToHangarTwo(m, scene) {
  const { hauler, barks } = scene;
  m.wanted.lock(null);
  m.failIfDestroyed(hauler, 'The Hauler burned with Vane\'s gear inside.');
  m.failIfLeft(hauler, 140, 'You left the Hauler and its cargo behind.');
  hauler.controls.headlights = true;
  chatter(m, [['zayd', 'Six tonnes of gold-melting junk. Handles like a camel.']]);
  m.objective('Drive the Hauler to Hangar 2 at Sarab Airfield');
  m.marker(scene.hangarFront, { label: 'Hangar 2', kind: 'objective', color: 0xe9b44c, radius: 8, route: true });
  openCustomsDetour(m, scene);
  sendChasers(m, scene);
  watchTheHauler(m, scene);
  waitAtTheHangar(m, scene);
  later(m, 70, () => ring(m, 'faris', [
    ['faris', 'Dust! Mina says you are driving a truck that is on fire.'],
    ['zayd', 'Smoking. Not on fire.'],
    ['faris', 'In my day that was the same thing. Be careful, boy.'],
  ]));
  await m.reach(scene.hangarFront, 14, { inVehicle: hauler, stopped: true, label: 'Hangar 2' });
  scene.arrived = true;
  closeCustomsDetour(m, scene);
  for (const ride of scene.chasers) if (!isWrecked(ride.vehicle) && ride.driver && !isDown(ride.driver)) m.fleeFrom(ride.vehicle, { speed: 18 });
  barks.say('arrived', [['zayd', 'Hangar 2. Special delivery.']], { force: true });
}

/** Mina and Tavi at the hangar door; Tavi asks about the stop at Customs if there was one. */
async function closeAtTheHangar(m, scene) {
  placeCrewAtHangar(m, scene);
  const between = { x: scene.crewSpot.x - 0.8, z: scene.crewSpot.z + 0.6 };
  const photographed = scene.detour && scene.detour.done;
  const shots = [
    framedShot(m, scene.hauler, { distance: 18, height: 6, yaw: scene.hauler.heading + 2.5, lookHeight: 1.6, seconds: 4, drift: 4,
      speaker: 'mina', text: 'Twelve crucibles and a furnace. Machine parts, the manifest says.' }),
  ];
  if (photographed) {
    shots.push(
      framedShot(m, between, { distance: 5.5, height: 1.8, yaw: -1.6, lookHeight: 1.6, seconds: 3.6, speaker: 'tavi', text: 'You stopped at the Customs House. Why?' }),
      framedShot(m, between, { distance: 6, height: 1.9, yaw: -0.8, lookHeight: 1.6, seconds: 3.2, speaker: 'zayd', text: 'Brakes were cooking. Heavy truck.' }),
      framedShot(m, between, { distance: 5.5, height: 1.8, yaw: -1.6, lookHeight: 1.6, seconds: 3, speaker: 'tavi', text: 'Next time let them cook.' }),
    );
  } else {
    shots.push(framedShot(m, between, { distance: 5.5, height: 1.8, yaw: -1.6, lookHeight: 1.6, seconds: 3.6, speaker: 'tavi', text: 'Not bad, rally boy. Not bad at all.' }));
  }
  shots.push(framedShot(m, between, { distance: 9, height: 3, yaw: -1.1, lookHeight: 1.4, seconds: 3.6, rise: 2,
    speaker: 'mina', text: 'Get some sleep. Next we learn how the gold travels.' }));
  await m.cutscene(shots);
  if (photographed) m.trust(-3, 'Tavi noticed the stop at Customs');
  else m.trust(3, 'A clean run: Tavi is impressed');
  m.flag('manifestPhotographed', !!photographed);
}

/** Dahan's side-objective: ten seconds parked outside the Customs House, Jackals or no Jackals. */
function openCustomsDetour(m, scene) {
  const stop = scene.customsStop;
  const detour = {
    open: true, done: false, held: 0,
    objective: m.objective('Optional: stop at the Customs House so Dahan\'s people can photograph the manifest', { optional: true }),
    mark: m.marker(stop, { label: 'Customs House', kind: 'objective', color: 0x2f6bff, radius: 7, route: false }),
  };
  scene.detour = detour;
  aside((async () => {
    let counter = null;
    let shown = -1;
    await m.until(() => {
      if (!detour.open) return true;
      const here = playerVehicle(m) === scene.hauler && apart(scene.hauler, stop) < 17;
      if (here && !counter) {
        counter = m.counter('MANIFEST PHOTOS', Math.floor(detour.held), MANIFEST_SECONDS);
        shown = -1;
        scene.barks.say('clerk', [['Customs clerk', 'Hold it right there. Smile for the manifest.']], { once: true, force: true });
      } else if (!here && counter) {
        counter.clear();
        counter = null;
        if (detour.held > 0.5) scene.barks.say('leftEarly', [['dahan', 'Karam, they were not finished. Go back.']], { once: true, force: true });
      }
      if (!here) return false;
      if (Math.abs(scene.hauler.speed) < 2.2) detour.held += m.game.time.dt;
      const photos = Math.min(MANIFEST_SECONDS, Math.floor(detour.held));
      if (photos !== shown) {
        shown = photos;
        counter.set(photos);
      }
      return detour.held >= MANIFEST_SECONDS;
    });
    if (counter) counter.clear();
    if (!detour.open) return;
    detour.done = true;
    detour.open = false;
    m.clearMarker(detour.mark);
    detour.objective.done();
    m.badge(8, 'The manifest is on Dahan\'s desk');
    chatter(m, [['dahan', 'Got it. Every page. Now go.'], ['zayd', 'Going.']]);
  })());
}

/** The Hauler made it (or the job ended): an unfinished detour is marked missed. */
function closeCustomsDetour(m, scene) {
  const detour = scene.detour;
  if (!detour || !detour.open) return;
  detour.open = false;
  m.clearMarker(detour.mark);
  detour.objective.fail();
}

/** Jackal pickups in three waves (Sail Street, the south of the city, the desert), never more than three at once. */
function sendChasers(m, scene) {
  const waves = [
    { when: () => true, count: 2, spec: 'oryx_nomad', line: [['tavi', 'Jackal pickups behind you! They heard the shooting.']] },
    { when: () => apart(playerAt(m), scene.yardCentre) > 900, count: 2, spec: 'oryx_nomad', line: [['tavi', 'Two more coming up behind. Sayf is emptying his garage.']] },
    { when: () => playerAt(m).z > scene.desertEdgeZ, count: 2, spec: 'dune_jackal', line: [['zayd', 'Buggies. On sand they are faster than me.'], ['tavi', 'Then don\'t let them pass, genius.']] },
  ];
  aside((async () => {
    for (const wave of waves) {
      await m.until(() => scene.arrived || wave.when());
      if (scene.arrived) return;
      await m.until(() => scene.arrived || liveChasers(scene) < MOST_CHASERS);
      if (scene.arrived) return;
      for (let i = 0; i < wave.count && liveChasers(scene) < MOST_CHASERS; i += 1) {
        const ride = spawnChaserBehind(m, scene, wave.spec, 150 + i * 45);
        if (ride) scene.chasers.push(ride);
      }
      scene.barks.say(`wave-${wave.spec}-${wave.count}`, [wave.line], { force: true });
      await m.seconds(20);
    }
  })());
}

/** A Jackal vehicle on a lane `behind` metres back from the Hauler, already giving chase. */
function spawnChaserBehind(m, scene, specId, behind) {
  const hauler = scene.hauler;
  const back = aheadOf(hauler, -behind);
  let spot = laneToward(m, back.x, back.z, hauler.pos.x, hauler.pos.z, { maxDistance: 90 });
  if (!spot.lane) spot = clearSpot(m, back.x, back.z, { heading: Math.atan2(hauler.pos.x - back.x, hauler.pos.z - back.z), search: 20 });
  if (apart(spot, playerAt(m)) < 70) return null;
  const ride = spawnJackalRide(m, specId, spot, { crew: 2, weapon: specId === 'dune_jackal' ? 'pistol' : 'smg' });
  if (!ride.vehicle) return null;
  ride.vehicle.controls.headlights = true;
  ride.bark = false;
  m.pursue(ride.vehicle, { aggression: specId === 'dune_jackal' ? 0.75 : 0.55 });
  m.marker(ride.vehicle, { label: 'Jackals', kind: 'enemy', color: 0xe4572e, route: false, beacon: false });
  return ride;
}

/** Chasers still in the hunt. */
function liveChasers(scene) {
  let alive = 0;
  for (const ride of scene.chasers) if (!ride.out) alive += 1;
  return alive;
}

/** Talk about the truck's damage and the chasers that crash out; drop the ones left far behind. */
function watchTheHauler(m, scene) {
  const { hauler, barks } = scene;
  const thresholds = [
    { share: 0.75, line: ['tavi', 'Mind the paint. That truck has to pass for honest.'] },
    { share: 0.5, line: ['tavi', 'She is taking a beating! The cargo has to arrive in one piece!'] },
    { share: 0.3, line: ['zayd', 'Engine\'s coughing. Come on, old girl.'] },
  ];
  aside(m.until(() => {
    if (scene.arrived) return true;
    const share = healthShare(hauler);
    for (const threshold of thresholds) {
      if (!threshold.said && share < threshold.share) {
        threshold.said = true;
        barks.say(`damage-${threshold.share}`, [threshold.line], { force: true });
      }
    }
    for (const ride of scene.chasers) {
      if (ride.out) continue;
      const crashed = isWrecked(ride.vehicle) || isDown(ride.driver);
      const lost = apart(ride.vehicle, hauler) > 460;
      if (crashed || lost) {
        ride.out = true;
        if (crashed) {
          barks.say('chaserDown', [
            ['zayd', 'One less.'],
            ['tavi', 'Ha! Straight into the bollards!'],
            ['zayd', 'Should have bought the good tyres.'],
            ['tavi', 'That one is walking home.'],
          ]);
        } else {
          m.remove(ride.vehicle);
          for (const person of ride.people) m.remove(person);
        }
      }
    }
    return false;
  }));
}

/** Where everything in the job stands: the contact, the yard, the truck, the Customs House, the hangar. */
function surveyDocks(m) {
  const city = m.game.city;
  const contact = placeOr(m, 'contact_tavi', { x: 696, z: -400, heading: Math.PI / 2 });
  const exportDock = placeOr(m, 'export_dock', { x: 1016, z: -683 });
  const customs = landmarkOr(m, 'customsHouse', { x: 773, z: -400 });
  const customsBlock = customs.building !== undefined && city.buildings[customs.building] ? city.buildings[customs.building].block : -1;
  const yards = lotsOfUse(m, 'containerYard', exportDock.x, exportDock.z).filter((lot) => lot.block !== customsBlock && lot.district === 'docks');
  const yard = yards[0] || { x0: exportDock.x - 40, z0: exportDock.z + 90, x1: exportDock.x + 40, z1: exportDock.z + 170 };
  const yardCentre = lotCentre(yard);
  const haulerSpot = haulerParking(m, yard, yardCentre);
  const hangar = landmarkOr(m, 'airfieldHangar', { x: 900, z: 1680, w: 46, d: 36 });
  const approachLane = laneSpot(m, haulerSpot.x, haulerSpot.z, { maxDistance: 120 });
  return {
    contact, yard, yardCentre, haulerSpot,
    roadSide: Math.atan2(approachLane.x - haulerSpot.x, approachLane.z - haulerSpot.z),
    cranes: landmarkOr(m, 'portCranes', { x: 800, z: -840 }),
    approach: { x: approachLane.x, z: approachLane.z },
    customsStop: kerbSpot(m, customs.x - (customs.w || 70) / 2 - 40, customs.z),
    hangarFront: { x: hangar.x - (hangar.w || 46) / 2 - 14, z: hangar.z },
    crewSpot: { x: hangar.x - (hangar.w || 46) / 2 - 3, z: hangar.z - (hangar.d || 36) / 2 + 4 },
    desertEdgeZ: city.urban.maxZ + 120,
    floodlightPoints: [
      { x: yard.x0 + 2, z: yard.z0 + 2 }, { x: yard.x1 - 2, z: yard.z0 + 2 },
      { x: yard.x0 + 2, z: yard.z1 - 2 }, { x: yard.x1 - 2, z: yard.z1 - 2 },
    ],
    guards: [], chasers: [], hauler: null, taviPickup: null, tavi: null, mina: null, taviAtHangar: null,
    lights: null, detour: null, arrived: false,
    barks: createBarks(m, { gap: 4 }),
    listeners: createListeners(m),
  };
}

/** The Hauler stands on the yard's open band along the side nearest a road, facing along it. */
function haulerParking(m, yard, centre) {
  const road = laneSpot(m, centre.x, centre.z, { maxDistance: 200 });
  const dx = road.x - centre.x;
  const dz = road.z - centre.z;
  let x = centre.x;
  let z = centre.z;
  let heading = Math.PI / 2;
  if (Math.abs(dz) >= Math.abs(dx)) {
    z = dz > 0 ? yard.z1 - 4 : yard.z0 + 4;
  } else {
    x = dx > 0 ? yard.x1 - 4 : yard.x0 + 4;
    heading = 0;
  }
  return clearSpot(m, x, z, { halfWidth: 1.3, halfLength: 4, heading, search: 26 });
}

/** The truck under floodlights, its four guards at ease, and Tavi's pickup at the kerb. */
function spawnTheYard(m, scene) {
  const spot = scene.haulerSpot;
  scene.hauler = m.spawnVehicle('sahel_hauler', { x: spot.x, z: spot.z, heading: spot.heading, color: 0xf2a81d, parked: true });
  scene.lights = hangFloodlights(m, scene.floodlightPoints);
  const ring4 = standingSpots(m, spot.x, spot.z, 4, { radius: 9 });
  scene.guards = ring4.map((place, i) => {
    const guard = m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: place.x, z: place.z,
      heading: place.heading + Math.PI, weapon: i === 0 ? 'smg' : 'pistol', ammo: 200 });
    m.calm(guard);
    return guard;
  });
  const kerb = kerbSpot(m, scene.contact.curbX !== undefined ? scene.contact.curbX : scene.contact.x - 5, scene.contact.z + 10);
  scene.taviPickup = m.spawnVehicle('oryx_nomad', { x: kerb.x, z: kerb.z, heading: kerb.heading, color: 0xf4f1e8, parked: true });
}

/** Mina and Tavi wait by the hangar wall for the end; they arrive there once the Hauler is close. */
function waitAtTheHangar(m, scene) {
  aside(m.until(() => apart(scene.hauler, scene.hangarFront) < 320).then(() => placeCrewAtHangar(m, scene)));
}

/** Mina and Tavi by the hangar's north corner, out of the Hauler's way, facing the apron. */
function placeCrewAtHangar(m, scene) {
  const spot = scene.crewSpot;
  if (!scene.mina) scene.mina = m.spawnCast('mina', spot.x, spot.z, -Math.PI / 2);
  if (!scene.taviAtHangar) scene.taviAtHangar = m.spawnCast('tavi', spot.x - 1.6, spot.z + 1.2, -Math.PI / 2);
}
