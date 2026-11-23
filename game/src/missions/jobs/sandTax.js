// Job 6, "Sand Tax", given by Uncle Faris at Haddad Motors in the late-afternoon heat. The Dune
// Jackals took his tuned Dune Jackal buggy as "tax". Drive an Oryx Nomad out into the Amber Dunes
// (stopping their scout before he warns the camp, if you can), win the gunfight at Sayf's camp by
// Ain Zahra Oasis, take the buggy and outrun their pickups over the dunes to the Dune Hideout,
// which becomes Zayd's. Captain Dahan wants a photograph of Sayf's ledger while he is there.
import {
  framedShot, kerbSpot, laneToward, clearSpot, standingSpots, placeOr, landmarkOr, apart, playerAt, playerVehicle,
  isDown, isWrecked, healthShare, aside, chatter, ring, later, createBarks, createListeners, markFoes, untilDown,
  spawnJackalRide, pitchJackalCamp, aheadOf, clampNumber, JACKAL_PAINT,
} from './jobSceneHelpers.js';

export const job = {
  id: 'sand_tax',
  order: 6,
  title: 'Sand Tax',
  giver: 'faris',
  contact: 'contact_faris',
  requires: ['paper_trail'],
  hours: null,
  reward: { money: 3000, rep: 170 },
  briefing: 'Sayf\'s Dune Jackals took Uncle Faris\'s tuned Dune Jackal buggy as "sand tax". They camp at Ain Zahra Oasis. '
    + 'Drive out in Faris\'s Oryx Nomad, take the camp, take the buggy and outrun the pickups over the dunes to the '
    + 'Dune Hideout. Dahan wants Sayf\'s ledger photographed.',
  run: runSandTax,
};

/** Seconds of standing in Sayf's tent it takes to photograph every page of the ledger. */
const LEDGER_SECONDS = 2.5;
/** No more Jackal vehicles than this chase the buggy at once. */
const MOST_CHASERS = 3;

/** Faris's ask, the drive out, the camp, the buggy, the dunes, the hideout. */
async function runSandTax(m) {
  const scene = surveyTheDesert(m);
  try {
    m.setTime(16.4);
    scene.camp = pitchJackalCamp(m, scene.campCentre, { radius: 13, facing: scene.approachAngle });
    spawnTheCamp(m, scene);
    if (m.resumeFrom !== 'escape') {
      await openAtHaddadMotors(m, scene);
      await driveOutToTheOasis(m, scene);
      await raidTheCamp(m, scene);
      await m.inVehicle(scene.buggy, { label: 'Dune Jackal' });
      closeLedger(m, scene);
      m.checkpoint('escape');
    } else {
      resumeInTheBuggy(m, scene);
    }
    await escapeOverTheDunes(m, scene);
    await homeAtTheHideout(m, scene);
  } finally {
    scene.listeners.clear();
    if (scene.camp) scene.camp.remove();
  }
}

/** Haddad Motors in the heat: Faris, heartbroken and loud, hands over a pickup and a shotgun. */
async function openAtHaddadMotors(m, scene) {
  const contact = scene.contact;
  m.teleportPlayer(contact.x + 1.4, contact.z - 1.1, Math.atan2(-1.4, 1.1));
  m.spawnCast('faris', contact.x - 0.8, contact.z + 0.5, Math.atan2(1.4, -1.1));
  scene.nomad = m.spawnVehicle('oryx_nomad', { x: scene.nomadSpot.x, z: scene.nomadSpot.z, heading: scene.nomadSpot.heading, color: 0xd9b77a, parked: true });
  const pair = { x: contact.x + 0.3, z: contact.z - 0.3 };
  await m.cutscene([
    framedShot(m, scene.garage, { distance: 64, height: 22, yaw: 0.25, lookHeight: 3, seconds: 4.4, drift: 16,
      speaker: 'faris', text: 'They took her, Dust. My Dune Jackal. Called it sand tax.' }),
    framedShot(m, pair, { distance: 5.4, height: 1.7, yaw: -0.3, lookHeight: 1.55, seconds: 4,
      speaker: 'faris', text: 'Twelve years I tuned that buggy. She knows my hands.' }),
    framedShot(m, pair, { distance: 4.6, height: 1.75, yaw: 2.6, lookHeight: 1.55, seconds: 2.4,
      speaker: 'zayd', text: 'Where?' }),
    framedShot(m, scene.nomad, { distance: 9, height: 2.6, yaw: scene.nomad.heading + 2.3, lookHeight: 1, seconds: 4.2, drift: 2,
      speaker: 'faris', text: 'Ain Zahra oasis. Sayf\'s boys camp there when the wind is wrong.' }),
  ]);
  m.give('shotgun', 24);
  chatter(m, [
    ['faris', 'Take the Nomad. She is ugly, but she climbs.'],
    ['faris', 'And this. Dust Devil twelve. Don\'t tell your aunt.'],
    ['zayd', 'I don\'t have an aunt.'],
    ['faris', 'Then nobody will tell her.'],
  ]);
  m.objective('Get in Faris\'s Oryx Nomad');
  const carMark = m.marker(scene.nomad, { label: 'Oryx Nomad', kind: 'vehicle', color: 0x4fb6ff, radius: 2.6, route: true });
  await m.until(() => playerVehicle(m) !== null);
  m.clearMarker(carMark);
}

/** West along the Dune Parkway and out on the Wadi Road; a Jackal scout waits at the junction. */
async function driveOutToTheOasis(m, scene) {
  const barks = scene.barks;
  m.objective('Drive out to the dune above Ain Zahra Oasis');
  later(m, 6, () => ring(m, 'dahan', [
    ['dahan', 'You\'re heading for Sayf\'s camp. I can\'t send anyone into the dunes.'],
    ['dahan', 'He keeps a ledger in his tent. Payments from Vane, if we\'re lucky.'],
    ['dahan', 'Photograph it. It ties the Jackals to Vane\'s money.'],
    ['zayd', 'Anything else? Bring you a falcon?'],
    ['dahan', 'Just come back, Karam.'],
  ]));
  later(m, 38, () => chatter(m, [
    ['faris', 'You know, we drove this road the year we won the Wadi Rally.'],
    ['zayd', 'You were sick in a bucket the whole way.'],
    ['faris', 'A champion\'s bucket, boy.'],
  ]));

  // The scout sits off the junction; once he sees the Nomad he races for the camp.
  const scout = scene.scout;
  let scoutObjective = null;
  aside(m.until(() => apart(playerAt(m), scout.vehicle) < 130).then(() => {
    if (scene.scoutSettled || isWrecked(scout.vehicle) || isDown(scout.driver)) return;
    scoutObjective = m.objective('Optional: stop the Jackal scout before he warns the camp', { optional: true });
    m.marker(scout.vehicle, { label: 'Scout', kind: 'enemy', color: 0xe4572e, route: false });
    m.driveTo(scout.vehicle, scene.campCentre.x, scene.campCentre.z, { speed: 24, stop: true, aggression: 0.8 }).catch(() => {});
    barks.say('scout', [['faris', 'Jackal scout at the junction! Stop him before he warns the camp!']], { force: true });
  }));
  aside(m.until(() => {
    if (scene.scoutSettled) return true;
    const stopped = isWrecked(scout.vehicle) || isDown(scout.driver) || healthShare(scout.vehicle) < 0.55;
    const home = apart(scout.vehicle, scene.campCentre) < 45;
    if (!stopped && !home) return false;
    scene.scoutSettled = true;
    if (stopped) {
      if (!isWrecked(scout.vehicle)) m.stopDriving(scout.vehicle);
      if (!isDown(scout.driver)) m.hostile(scout.driver, { accuracy: 0.25, style: 'cover' });
      if (scoutObjective) scoutObjective.done();
      chatter(m, [['faris', 'Quiet as a cat in a carburettor.'], ['zayd', 'Scout\'s done.']]);
    } else {
      scene.alerted = true;
      if (scoutObjective) scoutObjective.fail();
      chatter(m, [['faris', 'He made it to the camp. They\'ll be waiting for you now.']]);
    }
    return true;
  }));

  await m.reach(scene.overlook, 22, { stopped: true, label: 'Ridge above the oasis' });
  m.wanted.lock(0);
  m.police.suspend(400);
  if (!scene.scoutSettled && scoutObjective === null) scene.scoutSettled = true;
  await m.cutscene([
    framedShot(m, scene.campCentre, { distance: 70, height: 26, yaw: scene.approachAngle + 0.35, lookHeight: 0, seconds: 4.2, drift: 18,
      speaker: 'zayd', text: 'I see her. Saffron paint, roll cage.' }),
    framedShot(m, scene.buggy, { distance: 9, height: 2.4, yaw: scene.buggy.heading + 2.2, lookHeight: 0.8, seconds: 3.4, drift: 2,
      speaker: 'faris', text: 'My baby! Is she hurt? Is she scratched?' }),
    framedShot(m, scene.campCentre, { distance: 16, height: 4, yaw: scene.approachAngle - 0.5, lookHeight: 1.2, seconds: 3.6,
      speaker: 'zayd', text: 'She\'s fine. Six men with guns are sitting around her.' }),
  ]);
  chatter(m, [['faris', 'Ah. Small problem.']]);
}

/** The gunfight among the tents, then three more out of them; Dahan's ledger on the side. */
async function raidTheCamp(m, scene) {
  const barks = scene.barks;
  const guards = scene.guards;
  if (scene.alerted) {
    const extra = standingSpots(m, scene.campCentre.x, scene.campCentre.z, 1, { radius: 8 })[0];
    guards.push(m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: extra.x, z: extra.z, heading: extra.heading, weapon: 'rifle', ammo: 300 }));
  }
  openLedger(m, scene);
  m.objective('Take the camp from the Jackals');
  const counter = m.counter('JACKALS DOWN', 0, guards.length + 3);
  const marks = markFoes(m, guards);

  let alarm = scene.alerted;
  const zayd = m.game.player.character;
  scene.listeners.on('shot:fired', (shot) => {
    if (shot.shooter === zayd && apart(zayd, scene.campCentre) < 180) alarm = true;
  });
  scene.listeners.on('character:damaged', (hit) => {
    if (guards.indexOf(hit.character) !== -1) alarm = true;
  });
  if (!alarm) await m.until(() => alarm || scene.alerted || guards.some((guard) => !isDown(guard) && apart(guard, playerAt(m)) < 40));
  for (const guard of guards) {
    if (isDown(guard)) continue;
    guard.intent.gesture = null;
    m.hostile(guard, { accuracy: 0.3, style: 'cover' });
  }
  chatter(m, scene.alerted
    ? [['Jackal', 'There he is! Sayf wants his head!']]
    : [['Jackal', 'Car on the ridge! Up, up, get up!']]);
  later(m, 5, () => barks.say('mindHer', [['faris', 'Careful with the buggy! Shoot around her!']], { force: true }));

  await untilDown(m, guards, Math.min(3, guards.length), {
    counter, marks,
    onDown: (down) => {
      if (down === 1) barks.say('firstDown', [['zayd', 'One.'], ['faris', 'Ha! Did he fall over? Tell me he fell over.']], { force: true });
    },
  });
  // Three more stumble out of the tents, woken by the noise.
  const sleepers = scene.camp.tents.map((tent) => m.spawnPerson({
    archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: tent.door.x, z: tent.door.z, heading: tent.heading, weapon: 'smg', ammo: 240,
  }));
  for (const sleeper of sleepers) m.hostile(sleeper, { accuracy: 0.26, style: 'cover' });
  chatter(m, [['Jackal', 'Who\'s shooting? Who let him in?'], ['zayd', 'They were asleep in the tents. Three more.']]);
  const all = guards.concat(sleepers);
  const sleeperMarks = markFoes(m, sleepers);
  await untilDown(m, all, all.length, {
    counter, marks: { refresh() { marks.refresh(); sleeperMarks.refresh(); } },
    onDown: (down) => {
      if (down === all.length - 1) barks.say('lastOne', [['zayd', 'Last one.'], ['faris', 'One more, Dust! For the buggy!']], { force: true });
    },
  });
  counter.clear();
  chatter(m, [['faris', 'Is she there? Get in her, Dust. Bring her home.']]);
  m.objective('Get in Faris\'s Dune Jackal');
}

/** Dahan's side-objective: stand in Sayf's red tent long enough to photograph every page. */
function openLedger(m, scene) {
  const tent = scene.camp.sayfTent;
  const ledger = {
    open: true, done: false, held: 0,
    objective: m.objective('Optional: photograph Sayf\'s ledger in the red tent', { optional: true }),
    mark: m.marker(tent.door, { label: 'Sayf\'s ledger', kind: 'objective', color: 0x2f6bff, radius: 1.6, route: false }),
  };
  scene.ledger = ledger;
  aside((async () => {
    let counter = null;
    let shown = -1;
    await m.until(() => {
      if (!ledger.open) return true;
      const zayd = m.game.player.character;
      const inside = zayd && !playerVehicle(m) && apart(zayd, tent.door) < 2.6;
      if (inside && !counter) {
        counter = m.counter('LEDGER PHOTOS', 0, 100);
        shown = -1;
      } else if (!inside && counter) {
        counter.clear();
        counter = null;
      }
      if (!inside) return false;
      ledger.held += m.game.time.dt;
      const percent = Math.round(clampNumber(ledger.held / LEDGER_SECONDS, 0, 1) * 100);
      if (percent !== shown) {
        shown = percent;
        counter.set(percent);
      }
      return ledger.held >= LEDGER_SECONDS;
    });
    if (counter) counter.clear();
    if (!ledger.open) return;
    ledger.open = false;
    ledger.done = true;
    m.clearMarker(ledger.mark);
    ledger.objective.done();
    m.badge(8, 'Sayf\'s ledger names Vane\'s money');
    m.flag('ledgerPhotographed', true);
    chatter(m, [['zayd', 'Vane\'s name, three times a page.'], ['dahan', 'Every page, Karam. Sayf writes like a schoolboy.']]);
  })());
}

/** Leaving the camp closes the ledger: missed if it was never photographed. */
function closeLedger(m, scene) {
  const ledger = scene.ledger;
  if (!ledger || !ledger.open) return;
  aside(m.until(() => !ledger.open || apart(playerAt(m), scene.campCentre) > 140).then(() => {
    if (!ledger.open) return;
    ledger.open = false;
    m.clearMarker(ledger.mark);
    ledger.objective.fail();
    m.flag('ledgerPhotographed', false);
  }));
}

/** A retry from the camp: the fight won, Zayd already in the buggy, engine ticking. */
function resumeInTheBuggy(m, scene) {
  m.playerInto(scene.buggy);
  m.wanted.lock(0);
  chatter(m, [['faris', 'Again, Dust. Over the dunes, like the old days.']]);
}

/** Dune crests to the hideout with Jackal pickups and a buggy on the tail. */
async function escapeOverTheDunes(m, scene) {
  const { buggy, barks } = scene;
  m.failIfDestroyed(buggy, 'Faris\'s buggy is a burning frame in the sand.');
  m.failIfLeft(buggy, 130, 'You left Faris\'s buggy in the dunes.');
  chatter(m, [['faris', 'Not the road! They own the road. Over the dunes, like Wadi nineteen.']]);
  m.objective('Outrun the Jackals over the dunes to the Dune Hideout');
  sendDuneChasers(m, scene);
  watchTheBuggy(m, scene);
  await m.checkpoints(scene.duneLine, { radius: 16, label: 'DUNE CRESTS' });
  m.objective('Pull in at the Dune Hideout');
  await m.reach(scene.hideout, 12, { inVehicle: buggy, stopped: true, label: 'Dune Hideout' });
  scene.home = true;
  for (const ride of scene.chasers) if (!isWrecked(ride.vehicle) && !isDown(ride.driver)) m.fleeFrom(ride.vehicle, { speed: 20 });
}

/** The hideout becomes Zayd's, the buggy is parked in it, Faris weeps, Sayf makes a promise. */
async function homeAtTheHideout(m, scene) {
  const share = healthShare(scene.buggy);
  await m.say([
    ['faris', 'Dune Hideout. My cousin\'s old rally shed. It\'s yours now.'],
    ['zayd', 'And the buggy?'],
    ['faris', 'The buggy is... also yours. Keep her running. Don\'t make me cry.'],
  ]);
  if (share >= 0.6) m.trust(6, 'Faris\'s buggy came home barely scratched');
  else m.trust(2, 'Faris\'s buggy came home, more or less');
  await m.fadeOut(0.8);
  const park = scene.hideout;
  m.remove(scene.buggy);
  m.unlockSafehouse('safehouse_dunes');
  m.grantVehicle('dune_jackal', 'safehouse_dunes');
  m.teleportPlayer(park.x + 3, park.z + 3, Math.PI * 0.75);
  m.flag('jackalBuggyOwned', true);
  await m.seconds(0.4);
  await m.fadeIn(1);
  await m.phone('sayf', [
    ['sayf', 'Rally boy. You took my buggy.'],
    ['zayd', 'Faris\'s buggy.'],
    ['sayf', 'Keep it. Next time, I collect from the mechanic.'],
  ]);
}

/** Pickups and a buggy come over the dunes behind; one more from the Wadi Road ahead. */
function sendDuneChasers(m, scene) {
  const waves = [
    { when: () => true, specs: ['oryx_nomad', 'dune_jackal'], from: 'behind', line: [['zayd', 'Pickups behind me. And a buggy.']] },
    { when: () => apart(playerAt(m), scene.campCentre) > 330, specs: ['oryx_nomad'], from: 'road', line: [['faris', 'One coming off the Wadi Road ahead of you!']] },
    { when: () => apart(playerAt(m), scene.campCentre) > 520, specs: ['dune_jackal'], from: 'behind', line: [['zayd', 'Another buggy. Sayf has a fleet.']] },
  ];
  aside((async () => {
    for (const wave of waves) {
      await m.until(() => scene.home || wave.when());
      if (scene.home) return;
      for (const spec of wave.specs) {
        if (liveChasers(scene) >= MOST_CHASERS) break;
        const ride = wave.from === 'road' ? spawnChaserOnRoad(m, scene, spec) : spawnChaserBehind(m, scene, spec);
        if (ride) scene.chasers.push(ride);
      }
      scene.barks.say(`wave-${wave.from}-${wave.specs.length}`, [wave.line], { force: true });
      await m.seconds(12);
    }
  })());
}

/** A Jackal vehicle over the dune behind the buggy, already chasing. */
function spawnChaserBehind(m, scene, specId) {
  const buggy = scene.buggy;
  const back = aheadOf(buggy, -(120 + Math.random() * 40));
  const side = (Math.random() - 0.5) * 60;
  const x = back.x + Math.cos(buggy.heading) * side;
  const z = back.z - Math.sin(buggy.heading) * side;
  const spot = clearSpot(m, x, z, { heading: Math.atan2(buggy.pos.x - x, buggy.pos.z - z), search: 20 });
  if (apart(spot, playerAt(m)) < 80) return null;
  return launchChaser(m, specId, spot);
}

/** A Jackal pickup on the Wadi Road ahead, turning in toward the buggy. */
function spawnChaserOnRoad(m, scene, specId) {
  const buggy = scene.buggy;
  const ahead = aheadOf(buggy, 170);
  const spot = laneToward(m, ahead.x, ahead.z, buggy.pos.x, buggy.pos.z, { maxDistance: 140 });
  if (apart(spot, playerAt(m)) < 90) return null;
  return launchChaser(m, specId, spot);
}

function launchChaser(m, specId, spot) {
  const ride = spawnJackalRide(m, specId, spot, { crew: 2, weapon: specId === 'dune_jackal' ? 'pistol' : 'smg' });
  if (!ride.vehicle) return null;
  m.pursue(ride.vehicle, { aggression: specId === 'dune_jackal' ? 0.8 : 0.65, accuracy: 0.28 });
  m.marker(ride.vehicle, { label: 'Jackals', kind: 'enemy', color: 0xe4572e, route: false });
  return ride;
}

function liveChasers(scene) {
  let alive = 0;
  for (const ride of scene.chasers) if (!ride.out) alive += 1;
  return alive;
}

/** Faris on the radio about every jump and every dent; chasers that crash or fall far behind drop out. */
function watchTheBuggy(m, scene) {
  const { buggy, barks } = scene;
  let airborne = 0;
  let dentSaid = false;
  aside(m.until(() => {
    if (scene.home) return true;
    if (!buggy.grounded) airborne += m.game.time.dt;
    else {
      if (airborne > 0.75) {
        barks.say('jump', [
          [['faris', 'Was she flying? Tell me she was flying!'], ['zayd', 'She was flying.']],
          [['faris', 'That\'s the jump from Wadi nineteen! I\'m crying, Dust.']],
          [['zayd', 'Landed it.'], ['faris', 'She always lands. Like a cat. A loud cat.']],
        ], { force: true });
      }
      airborne = 0;
    }
    if (!dentSaid && healthShare(buggy) < 0.6) {
      dentSaid = true;
      barks.say('dent', [['faris', 'Easy! She has feelings!']], { force: true });
    }
    for (const ride of scene.chasers) {
      if (ride.out) continue;
      const crashed = isWrecked(ride.vehicle) || isDown(ride.driver);
      const lost = apart(ride.vehicle, buggy) > 420;
      if (!crashed && !lost) continue;
      ride.out = true;
      if (crashed) barks.say('chaserDown', [['zayd', 'One pickup, upside down.'], ['faris', 'Ha! That\'s my girl!'], ['zayd', 'Sand in his teeth.']]);
      else {
        m.remove(ride.vehicle);
        for (const person of ride.people) m.remove(person);
      }
    }
    return false;
  }));
}

/** Where everything stands: the garage, the oasis camp, the ridge, the dune line, the hideout. */
function surveyTheDesert(m) {
  const contact = placeOr(m, 'contact_faris', { x: 96, z: 803, heading: Math.PI });
  const garagePlace = placeOr(m, 'garage_haddad', { x: 126, z: 803 });
  const garage = landmarkOr(m, 'haddadMotors', { x: 103, z: 771 });
  const oasis = landmarkOr(m, 'oasis', { x: -1180, z: 1480, radius: 60 });
  const hideout = placeOr(m, 'safehouse_dunes', { x: -690, z: 1118 });
  const junction = desertJunction(m, { x: -980, z: 1250 });
  const approachAngle = Math.atan2(junction.x - oasis.x, junction.z - oasis.z);
  const campCentre = { x: oasis.x + Math.sin(approachAngle) * 30, z: oasis.z + Math.cos(approachAngle) * 30 };
  const overlook = { x: campCentre.x + Math.sin(approachAngle) * 140, z: campCentre.z + Math.cos(approachAngle) * 140 };
  // Over the dunes: south-east first, away from the road the Jackals own, then north to the shed.
  const duneLine = [
    { x: campCentre.x + 95, z: campCentre.z + 85 },
    { x: campCentre.x + 255, z: campCentre.z + 105 },
    { x: campCentre.x + 390, z: campCentre.z - 5 },
    { x: campCentre.x + 400, z: campCentre.z - 155 },
  ];
  return {
    contact, garage, oasis, hideout, junction, approachAngle, campCentre, overlook, duneLine,
    nomadSpot: kerbSpot(m, garagePlace.curbX !== undefined ? garagePlace.curbX : garagePlace.x, (garagePlace.curbZ !== undefined ? garagePlace.curbZ : garagePlace.z) + 4, { facing: -Math.PI / 2 }),
    scoutSpot: { x: junction.x + 34, z: junction.z + 26 },
    camp: null, guards: [], buggy: null, nomad: null, scout: null, chasers: [], ledger: null,
    alerted: false, scoutSettled: false, home: false,
    barks: createBarks(m, { gap: 4.5 }),
    listeners: createListeners(m),
  };
}

/** Where the Falcon Rock Track leaves the Wadi Road: the last junction before the oasis. */
function desertJunction(m, fallback) {
  const roads = (m.game.city && m.game.city.desertRoads) || [];
  const track = roads.find((road) => road.name === 'Falcon Rock Track');
  if (!track) return fallback;
  const end = track.points[track.points.length - 1];
  return { x: end[0], z: end[1] };
}

/** The camp's guards at ease round the fire, Faris's buggy by the crates, and the scout at the junction. */
function spawnTheCamp(m, scene) {
  const centre = scene.campCentre;
  const across = scene.approachAngle + Math.PI / 2;
  const buggySpot = clearSpot(m, centre.x + Math.sin(across) * 9, centre.z + Math.cos(across) * 9, { heading: scene.approachAngle, search: 10 });
  scene.buggy = m.spawnVehicle('dune_jackal', { x: buggySpot.x, z: buggySpot.z, heading: buggySpot.heading, color: 0xf2a81d, parked: true, health: 1100 });
  if (m.resumeFrom === 'escape') return;
  const weapons = ['rifle', 'pistol', 'smg', 'rifle'];
  scene.guards = standingSpots(m, centre.x, centre.z, 4, { radius: 5.5 }).map((spot, i) => {
    const guard = m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: spot.x, z: spot.z, heading: spot.heading, weapon: weapons[i], ammo: 300 });
    m.calm(guard);
    guard.intent.gesture = i % 2 === 0 ? 'sit' : 'talk';
    return guard;
  });
  const scoutSpot = scene.scoutSpot;
  scene.scout = spawnJackalRide(m, 'dune_jackal', { x: scoutSpot.x, z: scoutSpot.z, heading: Math.atan2(scene.junction.x - scoutSpot.x, scene.junction.z - scoutSpot.z) }, { crew: 1, color: JACKAL_PAINT[1] });
  m.stopDriving(scene.scout.vehicle);
}
