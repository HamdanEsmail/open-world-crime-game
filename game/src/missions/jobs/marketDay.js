// Job 3, "Market Day", given by Mina at the Grand Souk. Thursday is collection day: the Dune Jackals
// squeeze every stall for "sand tax". Zayd throws five of them out of the market square with his
// fists (then their bats and a gun), rams their lieutenant Qadir's pickup to a stop in the lanes
// of Old Sarab, and decides Qadir's fate: Tavi wants him silenced, Captain Dahan wants him talking.
import {
  framedShot, kerbSpot, standingSpots, lotsOfUse, lotCentre, placeOr, landmarkOr, apart, playerAt, playerVehicle,
  isDown, isWrecked, healthShare, chatter, ring, later, createBarks, createListeners, markFoes, untilDown,
  clampNumber, JACKAL_PAINT,
} from './jobSceneHelpers.js';

export const job = {
  id: 'market_day',
  order: 3,
  title: 'Market Day',
  giver: 'mina',
  contact: 'contact_mina',
  requires: ['borrowed_wheels'],
  hours: null,
  reward: { money: 1500, rep: 110 },
  briefing: 'Thursday is collection day in the Grand Souk, and the Dune Jackals take their "sand tax" from every stall. '
    + 'Mina wants them thrown out in front of everyone, and their lieutenant Qadir run off the road. '
    + 'Tavi wants Qadir silenced for good. Captain Dahan wants him alive and talking.',
  run: runMarketDay,
};

/** The share of its health Qadir's pickup can lose before its engine gives out. */
const PICKUP_GIVES_OUT_AT = 0.45;

/** Brawl in the square, chase through Old Sarab, Qadir's fate, back to Mina. */
async function runMarketDay(m) {
  const scene = surveySouk(m);
  try {
    m.setPedestrians(0.6);
    if (m.resumeFrom !== 'chase') {
      await openOnCollectionDay(m, scene);
      await brawlInTheSquare(m, scene);
      await pickUpTheViper(m, scene);
      m.checkpoint('chase');
    } else {
      resumeAtTheChase(m, scene);
    }
    await chaseQadirsPickup(m, scene);
    const outcome = await decideQadirsFate(m, scene);
    await returnToMina(m, scene, outcome);
  } finally {
    scene.listeners.clear();
  }
}

/** The opening: the souk from above, Mina's ask, the Jackals at Old Hamid's stall, Qadir watching. */
async function openOnCollectionDay(m, scene) {
  spawnTheCollectors(m, scene);
  m.teleportPlayer(scene.contact.x + 1.4, scene.contact.z + 1.1, Math.atan2(-1.4, -1.1));
  scene.mina = m.spawnCast('mina', scene.contact.x - 0.9, scene.contact.z, Math.atan2(1.4, 1.1));
  const pair = { x: scene.contact.x + 0.25, z: scene.contact.z + 0.55 };
  await m.cutscene([
    framedShot(m, scene.centre, { distance: 78, height: 40, yaw: 0.6, lookHeight: 0, seconds: 4.6, drift: 20,
      speaker: 'mina', text: 'Thursday. Collection day. The Dune Jackals call it sand tax.' }),
    framedShot(m, pair, { distance: 5.2, height: 1.7, yaw: 0.35, lookHeight: 1.5, seconds: 4, drift: 0.8,
      speaker: 'mina', text: 'Old Hamid pays. I pay. Today nobody pays.' }),
    framedShot(m, scene.stall, { distance: 10, height: 3.4, yaw: 1.3, lookHeight: 1, seconds: 4, drift: 2.5,
      speaker: 'Jackal', text: 'Sand tax went up, grandfather. Strong wind this year.' }),
    framedShot(m, scene.qadirSpot, { distance: 8.5, height: 2.1, yaw: -1.2, lookHeight: 1.4, seconds: 3.6, drift: 1.5,
      speaker: 'zayd', text: 'And the one leaning on the pickup?' }),
  ]);
  chatter(m, [
    ['mina', 'Qadir. Sayf\'s lieutenant. He never gets his own hands dirty.'],
    ['mina', 'Five of them, champion. You have fists. I have faith.'],
    ['zayd', 'Faith doesn\'t throw punches.'],
  ]);
  m.objective('Walk into the souk square');
  later(m, 7, () => ring(m, 'dahan', [
    ['dahan', 'Karam. That lieutenant, Qadir, is the closest I have come to Sayf.'],
    ['dahan', 'If it comes to it, he walks away breathing. I need him talking.'],
    ['zayd', 'The crew won\'t like soft.'],
    ['dahan', 'The crew doesn\'t decide what happens to you. I do.'],
  ]));
  await m.reach(scene.entry, 8, { onFoot: true, label: 'Souk square' });
}

/** Three brawlers with bare fists, then a bat and a gun out of the Spice Arcade. */
async function brawlInTheSquare(m, scene) {
  const barks = scene.barks;
  m.wanted.lock(0);
  m.police.suspend(180);
  m.clearArea(scene.centre.x, scene.centre.z, 70);
  const zayd = m.game.player.character;
  if (zayd) zayd.weaponIndex = -1; // a market brawl starts with bare knuckles
  for (const brawler of scene.brawlers) m.hostile(brawler, { accuracy: 0.55, style: 'rush' });
  sendHamidHome(m, scene);
  chatter(m, [['Jackal', 'Look, a hero. Break his nose.']]);
  const counter = m.counter('JACKALS DOWN', 0, 5);
  const brawlerMarks = markFoes(m, scene.brawlers);
  m.objective('Put the three Jackal brawlers on the ground');
  await untilDown(m, scene.brawlers, 3, {
    counter, marks: brawlerMarks,
    onDown: (down) => {
      if (down === 1) barks.say('firstDown', [['mina', 'Ha! That one still owes me for a screen.'], ['zayd', 'One.']], { force: true });
      else if (down === 2) barks.say('secondDown', [['mina', 'Hamid is cheering. Quietly. Behind a sack of cumin.']], { force: true });
    },
  });

  // The rest of the crew comes out of the Spice Arcade armed, down the aisles either side of the middle.
  const west = scene.square.x0 + 3;
  const batman = m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: west, z: scene.centre.z - scene.aisle, heading: Math.PI / 2, weapon: 'bat', health: 60 });
  const gunman = m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: west, z: scene.centre.z + scene.aisle, heading: Math.PI / 2, weapon: 'pistol', ammo: 36, health: 45 });
  const armed = [batman, gunman];
  m.hostile(batman, { accuracy: 0.5, style: 'rush' });
  later(m, 3.5, () => m.hostile(gunman, { accuracy: 0.16, style: 'cover' }));
  chatter(m, [['Jackal', 'Enough dancing. Bring the bat!'], ['mina', 'And that one has a gun. Use the stalls, Dust!']]);
  const armedMarks = markFoes(m, armed);
  m.objective('Take down the Jackal with the bat, then the gunman');
  let gunmanAt = { x: gunman.pos.x, z: gunman.pos.z };
  await untilDown(m, armed, 2, {
    counter, base: 3, marks: armedMarks,
    onDown: (down) => {
      if (isDown(gunman)) gunmanAt = { x: gunman.pos.x, z: gunman.pos.z };
      if (down === 1) barks.say('armedDown', [['zayd', 'Four.'], ['mina', 'The bat goes to Hamid. Spoils of war.']], { force: true });
    },
  });
  if (isDown(gunman)) gunmanAt = { x: gunman.pos.x, z: gunman.pos.z };
  scene.viperAt = gunmanAt;
  counter.clear();
  chatter(m, [
    ['mina', 'Five! The whole souk saw that.'],
    ['Qadir', 'Dust Karam? The washed-up rally boy? Sayf will hear about this!'],
  ]);
}

/** The gunman's Viper 9 lies where he fell: the story hands Zayd his first pistol. */
async function pickUpTheViper(m, scene) {
  m.objective('Pick up the Viper 9 the gunman dropped');
  const shine = m.marker(scene.viperAt, { label: 'Viper 9', kind: 'pickup', color: 0xe9b44c, radius: 1.2, route: false });
  await m.reach(scene.viperAt, 2.4, { onFoot: true, label: 'Viper 9' });
  m.clearMarker(shine);
  m.give('pistol', 48);
  chatter(m, [['mina', 'Keep it. You\'re going to need it now.']]);
}

/** A retry after the brawl: Zayd at the souk's south-east court, armed, the cars where they were. */
function resumeAtTheChase(m, scene) {
  spawnTheGetaway(m, scene);
  m.teleportPlayer(scene.court.x - 3, scene.court.z + 4, Math.PI / 2);
  m.give('pistol', 48);
  m.wanted.clear();
  chatter(m, [['mina', 'Qadir is in his pickup. Find a car, quick!']]);
}

/** Qadir floors it into Old Sarab; Zayd takes a car and rams the pickup until its engine gives out. */
async function chaseQadirsPickup(m, scene) {
  const { pickup, qadir, summit, barks } = scene;
  m.wanted.lock(null);
  m.objective('Get a car and go after Qadir');
  const summitMark = m.marker(summit, { label: 'Oryx Summit', kind: 'vehicle', color: 0x1ba39c, route: true });
  qadir.intent.gesture = null;
  if (qadir.vehicle !== pickup) m.seat(pickup, qadir, 0);
  chatter(m, [['Qadir', 'Start, you old goat. Start!'], ['mina', 'Take my cousin\'s Summit on Souk Street. Keys are in it.']]);
  await m.any([m.until(() => playerVehicle(m) !== null), m.seconds(22)]);
  m.clearMarker(summitMark);
  m.fleeFrom(pickup, { speed: 17 });
  if (!playerVehicle(m)) {
    m.objective('Get a car: Qadir is getting away');
    await m.until(() => playerVehicle(m) !== null);
  }

  m.objective('Ram Qadir\'s pickup until it stops');
  const pickupMark = m.marker(pickup, { label: 'Qadir', kind: 'enemy', color: 0xe4572e, route: true, radius: 3 });
  const counter = m.counter('PICKUP DAMAGE', 0, 100);
  later(m, 4, () => chatter(m, [['mina', 'Ram him. A pickup that old dies of shame.']]));

  // A solid ram hurts the pickup more than the crash itself: a chase is won with the bumper.
  let lastRamAt = -10;
  scene.listeners.on('vehicle:collision', (contact) => {
    const mine = playerVehicle(m);
    if (!mine || !scene.chasing) return;
    const rammed = (contact.vehicle === pickup && contact.other === mine) || (contact.vehicle === mine && contact.other === pickup);
    if (!rammed || !(contact.speed > 3)) return;
    const now = m.game.time.elapsed;
    if (now - lastRamAt < 0.5) return;
    lastRamAt = now;
    m.game.vehicles.applyDamage(pickup, 45 + contact.speed * 13, { source: m.game.player.character, kind: 'crash', x: contact.x, z: contact.z });
    barks.say('ram', [
      ['zayd', 'Pull over, Qadir.'],
      ['Qadir', 'Are you insane? This pickup is my mother\'s!'],
      ['mina', 'That one I felt from here.'],
      ['Qadir', 'Sayf will skin you for this!'],
      ['zayd', 'Consider it a refund.'],
      ['mina', 'Again! He is wobbling!'],
    ]);
  });

  let farFor = 0;
  m.failIf(() => {
    if (apart(playerAt(m), pickup) > 240) farFor += m.game.time.dt;
    else farFor = 0;
    return farFor > 10;
  }, 'Qadir lost you in the lanes of Old Sarab.');

  scene.chasing = true;
  let fleeSpeed = 17;
  let shown = 0;
  await m.until(() => {
    if (isWrecked(pickup) || isDown(qadir)) return true;
    const share = healthShare(pickup);
    const progress = clampNumber((1 - share) / (1 - PICKUP_GIVES_OUT_AT), 0, 1);
    const percent = Math.round(progress * 100);
    if (percent !== shown) {
      shown = percent;
      counter.set(percent);
    }
    const wanted = share < 0.6 ? 12 : share < 0.8 ? 15 : 17;
    if (wanted !== fleeSpeed) {
      fleeSpeed = wanted;
      m.fleeFrom(pickup, { speed: fleeSpeed });
      if (wanted === 12) barks.say('smoking', [['mina', 'His engine is smoking. One more good hit!']], { force: true });
    }
    if (apart(playerAt(m), pickup) > 150) barks.say('far', [['mina', 'He is getting away! Floor it, champion!'], ['zayd', 'He drives like he stole it. He did.']]);
    const mine = playerVehicle(m);
    if (mine && healthShare(mine) < 0.35) barks.say('ownCar', [['zayd', 'This car is not going to last.'], ['mina', 'My cousin is going to cry.']], { once: true });
    return progress >= 1;
  });
  scene.chasing = false;
  counter.clear();
  m.clearMarker(pickupMark);
  if (!isWrecked(pickup)) {
    m.stopDriving(pickup);
    pickup.controls.brake = 0.7;
    chatter(m, [['Qadir', 'No, no, no. Not now!'], ['mina', 'That\'s the engine. He is done.']]);
    await m.any([m.until(() => Math.abs(pickup.speed) < 1.2), m.seconds(8)]);
  }
}

/** Qadir climbs out with his hands up. Tavi phones: finish him. Walk away for Dahan, or do it. */
async function decideQadirsFate(m, scene) {
  const { pickup, qadir } = scene;
  if (isDown(qadir)) {
    chatter(m, [['mina', 'Qadir didn\'t make it out of that pickup.'], ['zayd', 'Sand tax. Paid in full.']]);
    settleTheScore(m, 'finish', 'Qadir died in the crash');
    return 'finish';
  }
  m.calm(qadir);
  const kerb = m.game.roads.nearestWalkway(pickup.pos.x, pickup.pos.z, 40);
  let standX = kerb ? kerb.x : pickup.pos.x + 6;
  let standZ = kerb ? kerb.z : pickup.pos.z;
  const away = apart({ x: standX, z: standZ }, pickup);
  if (away < 8) {
    const dx = standX - pickup.pos.x;
    const dz = standZ - pickup.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    standX = pickup.pos.x + (dx / length) * 9;
    standZ = pickup.pos.z + (dz / length) * 9;
  }
  // Walking orders take him out of the cab first.
  m.walkTo(qadir, standX, standZ, { pace: 'walk' }).then(() => {
    qadir.intent.gesture = 'handsUp';
  }).catch(() => {});

  m.objective('Get out and face Qadir');
  ring(m, 'tavi', [
    ['tavi', 'Mina says you caught Sayf\'s man. Good.'],
    ['tavi', 'Now finish it. A Jackal who talks gets us all hanged.'],
  ]);
  const caught = await m.any([m.reach(qadir, 4.5, { onFoot: true, label: 'Qadir' }), m.until(() => isDown(qadir))]);
  if (caught === 1) {
    chatter(m, [['zayd', 'So much for questions.']]);
    settleTheScore(m, 'finish', 'You put Qadir down');
    return 'finish';
  }
  qadir.intent.gesture = 'handsUp';
  chatter(m, [
    ['Qadir', 'Wait! I only collect. Sayf decides everything.'],
    ['Qadir', 'You want names? I have names. Just let me walk.'],
  ]);
  m.objective('Walk away and leave him for Dahan, or finish it for Tavi');
  // Pressing a key decides; so does shooting him, or simply driving off and leaving him there.
  const choosing = m.choice([
    { id: 'spare', key: 'E', text: 'Walk away: Dahan gets him talking' },
    { id: 'finish', key: 'F', text: 'Finish it: Tavi gets his silence' },
  ]);
  const picked = await m.any([choosing, m.until(() => isDown(qadir)), m.until(() => apart(playerAt(m), qadir) > 40)]);
  const outcome = picked === 0 ? await choosing : picked === 1 ? 'finish' : 'spare';
  return outcome === 'finish' ? finishQadir(m, scene) : spareQadir(m, scene);
}

/** Zayd turns his back on Qadir; PSPD picks him up two streets away. */
async function spareQadir(m, scene) {
  const { qadir } = scene;
  qadir.intent.gesture = null;
  chatter(m, [
    ['zayd', 'Run. Before I change my mind.'],
    ['Qadir', 'You\'ll regret this, rally boy.'],
  ]);
  const runTo = m.game.roads.nearestWalkway(qadir.pos.x + 60, qadir.pos.z + 40, 80) || { x: qadir.pos.x + 60, z: qadir.pos.z + 40 };
  m.walkTo(qadir, runTo.x, runTo.z, { pace: 'sprint' }).then(() => m.remove(qadir)).catch(() => {});
  later(m, 9, () => chatter(m, [['dispatch', 'All units, suspect detained on Tamarind Street. Major Crimes notified.']]));
  settleTheScore(m, 'spare', 'Qadir lives to talk to Dahan');
  return 'spare';
}

/** Zayd does what Tavi asked. The screen goes dark for it. */
async function finishQadir(m, scene) {
  const { qadir } = scene;
  if (!isDown(qadir)) {
    await m.fadeOut(0.6);
    m.game.characters.kill(qadir, { source: m.game.player.character, kind: 'bullet' });
    m.game.audio?.play?.('gunPistol', { x: qadir.pos.x, y: 1.4, z: qadir.pos.z });
    await m.seconds(0.5);
    await m.fadeIn(0.8);
  }
  chatter(m, [['zayd', 'Sand tax. Paid in full.']]);
  settleTheScore(m, 'finish', 'You finished Qadir');
  return 'finish';
}

/** Move the Cover meter and remember the outcome for later jobs. */
function settleTheScore(m, outcome, why) {
  if (outcome === 'spare') {
    m.badge(8, why);
    m.trust(-5, 'Tavi wanted Qadir silenced');
    m.flag('lieutenantSpared', true);
  } else {
    m.trust(8, why);
    m.badge(-8, 'Dahan needed Qadir alive');
    m.flag('lieutenantSpared', false);
  }
}

/** Shake any heat, then walk back into the souk to Mina. */
async function returnToMina(m, scene, outcome) {
  if (m.game.wanted && m.game.wanted.level > 0) {
    m.objective('Lose the police');
    chatter(m, [['mina', 'Don\'t bring the police to my stall. Lose them first.']]);
    await m.lostWanted();
  }
  m.objective('Meet Mina back at the souk');
  await m.reach(scene.contact, 6, { label: 'Mina' });
  if (outcome === 'spare') {
    await m.say([
      ['mina', 'Tavi is fuming. He says you went soft.'],
      ['zayd', 'Soft is cheaper than a funeral.'],
      ['mina', 'Hamid sent saffron. Don\'t ask what it cost him.'],
    ]);
  } else {
    await m.say([
      ['mina', 'Tavi is buying the drinks tonight. I\'m not drinking.'],
      ['zayd', 'Fair.'],
      ['mina', 'Hamid sent saffron. He couldn\'t look at me.'],
    ]);
  }
  await m.say([['mina', 'The Jackals know your face now. Keep the Viper close.']]);
}

/** Where everything in the job stands, read from the city plan. */
function surveySouk(m) {
  const city = m.game.city;
  const souk = landmarkOr(m, 'grandSouk', { x: -260, z: -27 });
  const square = lotsOfUse(m, 'marketSquare', souk.x, souk.z)[0] || { x0: souk.x - 46, z0: souk.z - 36, x1: souk.x + 46, z1: souk.z + 36 };
  const centre = lotCentre(square);
  const contact = placeOr(m, 'contact_mina', { x: centre.x, z: square.z1 + 40, heading: Math.PI });
  // The south-east court, between the South Hall and the Copper Arcade, opens the square onto the streets.
  const byName = (name) => city.buildings.find((building) => building.name === name);
  const southHall = byName('Grand Souk South Hall');
  const copper = byName('Copper Arcade');
  const lot = southHall ? city.blocks[southHall.block].lot : { x1: square.x1 + 41, z1: square.z1 + 38 };
  const court = {
    x: southHall ? (southHall.x + southHall.w / 2 + lot.x1) / 2 : square.x1 + 26,
    z: copper ? (copper.z + copper.d / 2 + lot.z1) / 2 : square.z1 + 21,
  };
  const pickupSpot = kerbSpot(m, lot.x1 + 12, court.z);
  const toCourt = Math.atan2(court.x - pickupSpot.x, court.z - pickupSpot.z);
  // The stalls stand in east-west rows round a clear centre (a fountain, four palms seven metres
  // out); the aisles a little either side of the middle run straight in from the east and west.
  const aisle = 5.7;
  return {
    souk, square, centre, contact, court, aisle,
    entry: { x: centre.x + 13, z: centre.z + aisle },
    stall: { x: centre.x, z: centre.z + 9 },
    pickupSpot,
    qadirSpot: { x: pickupSpot.x + Math.sin(toCourt) * 3.2, z: pickupSpot.z + Math.cos(toCourt) * 3.2, heading: toCourt },
    summitSpot: kerbSpot(m, court.x - 4, contact.curbZ !== undefined ? contact.curbZ : contact.z + 5),
    brawlers: [], hamid: null, qadir: null, pickup: null, summit: null, mina: null, viperAt: null, chasing: false,
    barks: createBarks(m, { gap: 4.5 }),
    listeners: createListeners(m),
  };
}

/** The Jackals at Old Hamid's stall, Qadir by his pickup, and the Summit waiting on Souk Street. */
function spawnTheCollectors(m, scene) {
  const spots = standingSpots(m, scene.stall.x, scene.stall.z, 3, { radius: 3, start: 1.2, arc: Math.PI * 1.3 });
  scene.brawlers = spots.map((spot) => {
    const brawler = m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Dune Jackal', x: spot.x, z: spot.z, heading: spot.heading, health: 55 });
    m.calm(brawler);
    return brawler;
  });
  const hamid = m.spawnPerson({ archetype: 'local', kind: 'civilian', faction: 'civilian', name: 'Old Hamid', x: scene.stall.x, z: scene.stall.z, heading: Math.PI * 0.75 });
  m.calm(hamid);
  hamid.intent.gesture = 'cower';
  scene.hamid = hamid;
  spawnTheGetaway(m, scene);
  scene.qadir.intent.gesture = 'lean';
}

/** Qadir and his dusty red pickup on Pearl Street; Mina's cousin's Oryx Summit on Souk Street. */
function spawnTheGetaway(m, scene) {
  scene.pickup = m.spawnVehicle('oryx_nomad', { x: scene.pickupSpot.x, z: scene.pickupSpot.z, heading: scene.pickupSpot.heading, color: JACKAL_PAINT[0], faction: 'gang' });
  scene.qadir = m.spawnPerson({ archetype: 'gang', kind: 'gang', faction: 'gang', name: 'Qadir', x: scene.qadirSpot.x, z: scene.qadirSpot.z, heading: scene.qadirSpot.heading, health: 120 });
  m.calm(scene.qadir);
  scene.summit = m.spawnVehicle('oryx_summit', { x: scene.summitSpot.x, z: scene.summitSpot.z, heading: scene.summitSpot.heading, color: 0xd9b77a, parked: true });
  if (m.resumeFrom === 'chase') m.seat(scene.pickup, scene.qadir, 0);
}

/** Old Hamid scurries off out of the square once the fists start flying. */
function sendHamidHome(m, scene) {
  const hamid = scene.hamid;
  if (!hamid) return;
  hamid.intent.gesture = null;
  m.walkTo(hamid, scene.square.x0 + 2, scene.square.z1 - 2, { pace: 'run' }).then(() => m.remove(hamid)).catch(() => {});
}
