// The two endings of KHAMSIN, each a last act the player drives himself. CLEAN HANDS: Zayd calls it
// in, the PSPD floods the plaza as his allies, Tavi bolts and must be run down before the Gate, and
// Idris Vane is led out in cuffs. DUST IN THE WIND: the gold goes into the Summit, a locked five-star
// escape runs out through the Gate into the dunes, and the crew splits four shares at dawn.
import {
  spireStage, gateStage, createCrewVoice, openJobScope, trackStall, lanePoint, shotOf, overShoulder, twoShot,
  placePerson, faceTo, distanceBetween, playerDistance, background, driveOff, strollTo, backInto, buildGoldShares,
  freeSpotsAround, holdTheClock, shieldCast,
} from '../missions/jobs/finaleSceneHelpers.js';
import { playCredits, playStoryCard } from './creditsRoll.js';

/**
 * CLEAN HANDS. Called from the Vane Job once Zayd chooses to call it in (or on a retry of this act).
 * @param {Object} m  the job context
 * @param {{mina?, faris?, tavi?, summit?, van?}} [carry]  the crew and cars already on the plaza
 */
export async function playBadgeEnding(m, carry = {}) {
  const scope = openJobScope(m);
  try {
    recordTheEnding(m, 'badge');
    const act = prepareTheAct(m, scope, carry);
    m.wanted.clear();
    m.wanted.lock(0);
    m.setWeather(1, 2);
    if (m.resumeFrom !== 'badge_chase') await zaydMakesTheCall(act);
    m.checkpoint('badge_chase');
    await runTaviDown(act);
    await viewOnThePlaza(act);
    m.grantVehicle('pspd_interceptor', 'safehouse_flat');
    m.flag('banLifted', true);
    m.flag('endingSeen', 'badge');
    m.stat('endingsSeen', 1);
    await playCredits(m, 'badge', act.clock);
  } finally {
    scope.close();
  }
}

/**
 * DUST IN THE WIND. Called from the Vane Job once Zayd chooses the gold (or on a retry of this act).
 * @param {Object} m  the job context
 * @param {{mina?, faris?, tavi?, summit?, van?}} [carry]
 */
export async function playCrewEnding(m, carry = {}) {
  const scope = openJobScope(m);
  try {
    recordTheEnding(m, 'crew');
    const act = prepareTheAct(m, scope, carry);
    m.setWeather(1, 2);
    if (m.resumeFrom === 'crew_dunes') {
      stageAtTheGate(act);
    } else {
      await loadTheGold(act);
      await runForTheGate(act);
      m.checkpoint('crew_dunes');
    }
    await intoTheDunes(act);
    await dawnAtTheHideout(act);
    m.pay(CREW_SHARE_BONUS, 'Your share of the Vane gold');
    m.grantVehicle('zephyr_mirage', 'safehouse_dunes');
    m.flag('endingSeen', 'crew');
    m.stat('endingsSeen', 1);
    await playCredits(m, 'crew', act.clock);
  } finally {
    scope.close();
  }
}

/** The plaza as the vault left it: the crew at the doors, the van and the Summit at the kerb. */
function prepareTheAct(m, scope, carry) {
  const spire = spireStage(m);
  const act = { m, scope, voice: createCrewVoice(m), spire, gate: gateStage(m), crew: {}, summit: null, van: null };
  act.clock = carry.clock || holdTheClock(m, scope, 17.8);
  const door = spire.door;
  const spots = { mina: { x: door.x + 2, z: door.z + 3 }, faris: { x: door.x + 4, z: door.z + 6 }, tavi: { x: door.x - 3, z: door.z + 4 } };
  for (const id of ['mina', 'faris', 'tavi']) {
    let person = carry[id];
    if (!person || person.alive === false || person.despawned) {
      person = m.spawnCast(id, spots[id].x, spots[id].z, 0);
      if (person) {
        person.maxHealth = Math.max(person.maxHealth || 0, 900);
        person.health = person.maxHealth;
      }
    }
    shieldCast(scope, person);
    act.crew[id] = person;
  }
  act.summit = usable(carry.summit) ? carry.summit : spawnParked(m, 'oryx_summit', spire.curb.x + 22, spire.curb.z + 12, Math.PI / 2, SUMMIT_PEARL);
  act.van = usable(carry.van) ? carry.van : spawnParked(m, 'sahel_caravan', spire.curb.x - 20, spire.curb.z, -Math.PI / 2, VAN_TEAL);
  return act;
}

// ---- CLEAN HANDS ---------------------------------------------------------------------------------

/** On the plaza, Zayd dials. Faris hears it. Tavi understands it first, and runs for the Summit. */
async function zaydMakesTheCall(act) {
  const { m, crew, summit } = act;
  const zayd = m.game.player.character;
  if (m.game.player.vehicle || playerDistance(m, act.spire.door) > 8) m.teleportPlayer(act.spire.door.x, act.spire.door.z + 5, Math.PI);
  zayd.intent.gesture = 'phone';
  await m.cutscene([
    twoShot(m, zayd, crew.mina, { seconds: 4.5, side: -1, speaker: 'zayd', text: "Dahan. It's Karam. The vault is open. Come and get it." }),
    { position: { x: act.spire.curb.x + 30, y: 3, z: act.spire.curb.z + 18 }, lookAt: { x: act.spire.door.x, y: 2, z: act.spire.door.z }, seconds: 3, speaker: 'dahan', text: 'Units rolling. Stay alive, Karam.' },
    overShoulder(m, crew.faris, zayd, { seconds: 3.5, speaker: 'faris', text: 'Zayd? Who... who was that?' }),
    overShoulder(m, crew.tavi, zayd, { seconds: 3.5, side: -1, speaker: 'tavi', text: "A cop. He's a cop! I knew it. I knew it!" }),
  ]);
  zayd.intent.gesture = null;
  // Tavi is already across the plaza and sprinting for the Summit when the camera finds him.
  const door = { x: summit.pos.x - Math.cos(summit.heading) * 2.2, z: summit.pos.z + Math.sin(summit.heading) * 2.2 };
  placePerson(m, crew.tavi, door.x - 9, door.z - 9, Math.atan2(9, 9));
  strollTo(m, crew.tavi, door.x, door.z, 'sprint');
  await m.cutscene([
    shotOf(m, summit, { bearing: -2.4, distance: 14, height: 2.2, look: 1, seconds: 3, speaker: 'mina', text: "Tavi, don't! Tavi!" }),
  ]);
}

/** Allies on the plaza, the Interceptor Dahan sent ahead, and Tavi's run for the Gate. */
async function runTaviDown(act) {
  const { m, scope, voice, spire, gate, crew } = act;
  const summit = act.summit;
  const tavi = crew.tavi;
  for (const id of ['mina', 'faris']) {
    const person = crew[id];
    if (person && person.alive !== false) {
      m.calm(person);
      person.intent.gesture = 'handsUp';
    }
  }
  // Tavi runs out from under the crew's luck: a crash that bad can kill him now.
  shieldCast(scope, tavi, false);
  const resumed = m.resumeFrom === 'badge_chase';
  if (resumed) {
    const ahead = lanePoint(m, gate.laneX, spire.curb.z + 160, 0);
    m.game.vehicles?.place?.(summit, ahead.x, ahead.z, ahead.heading);
  }
  if (tavi && tavi.alive !== false) m.seat(summit, tavi, 0);
  const bolt = (speed) => driveOff(m, summit, gate.laneX, gate.z + 80, { speed, careful: false, aggression: 0.9, stop: false });
  bolt(resumed ? 24 : 20);
  // The storm slows him at first; once clear of the city blocks he opens it up.
  background(m.seconds(14).then(() => {
    if (!summit.wrecked) bolt(26);
  }));

  // Dahan sent one car ahead: it stands on the plaza a few strides from the lobby doors.
  const ride = { x: spire.x + 9, z: spire.towerSouth + 19, heading: 0 };
  const interceptor = m.spawnVehicle('pspd_interceptor', { x: ride.x, z: ride.z, heading: ride.heading, faction: 'police', parked: true });
  if (interceptor) interceptor.controls.siren = true;
  if (resumed) m.playerInto(interceptor);
  const lender = m.spawnPerson({ archetype: 'officer', kind: 'officer', faction: 'police', x: ride.x - 2.6, z: ride.z + 1.5, heading: Math.PI });
  sendAlliedUnits(act);

  voice.talk([
    ['Officer', "Captain's orders, Karam. Keys are in it. Go!"],
    ['dispatch', 'All units: Vane Spire, assist undercover officer. Suspect fleeing south in a pearl Summit.'],
  ]);
  if (!resumed) {
    m.objective('Take the PSPD Interceptor');
    await m.inVehicle(interceptor);
  }
  if (lender) m.calm(lender);
  m.objective('Stop Tavi before he reaches the Gate');
  const quarry = m.marker(summit, { label: 'Tavi', color: 0xe4572e, radius: 3.5 });
  voice.talk([
    ['dahan', 'Karam, he has a head start and a full tank. Stop him.'],
    ['dispatch', 'Shaheen-1 is grounded. Zero visibility. Ground units only.'],
  ]);
  let warned = false;
  const stall = trackStall(m, scope, summit, {
    label: "TAVI'S ENGINE",
    hits: 4,
    bulletShare: 0.24,
    onHit(progress) {
      voice.react(progress > 0.6 ? TAVI_CORNERED : DAHAN_ON_RAMS, 4);
      if (progress >= 0.5) bolt(19);
    },
    onStall() {
      voice.talk([['dispatch', "Suspect's engine is gone. He's coasting. Box him in."]]);
    },
  });
  const escaped = m.failIf(() => distanceBetween(summit, { x: gate.laneX, z: gate.z }) < 60, 'Tavi made it out through the Gate. The storm has him now.');
  scope.every(() => {
    if (warned || stall.stalled) return;
    if (distanceBetween(summit, { x: gate.laneX, z: gate.z }) < 320) {
      warned = true;
      voice.talk([['dahan', "He's almost at the Gate, Karam! Now or never!"]]);
    }
  });
  let still = 0;
  await m.until(() => {
    if (!summit || summit.wrecked) return true;
    still = Math.abs(summit.speed) < 1.5 ? still + (m.game.time.dt || 0) : 0;
    return (stall.stalled && still > 1.2) || (still > 2 && playerDistance(m, summit) < 25);
  });
  escaped.stop();
  stall.clear();
  m.clearMarker(quarry);
  m.stopDriving(summit);
  await arrestTavi(act);
}

/** Two cruisers and an Enforcer roll in from Vane Boulevard, lights going, on Zayd's side now. */
function sendAlliedUnits(act) {
  const { m, spire, gate } = act;
  // Two cruisers in the westbound lane from Vane Boulevard; the Enforcer eastbound, behind Tavi.
  const units = [
    { spec: 'pspd_interceptor', x: 14, heading: -Math.PI / 2, stopX: spire.curb.x + 14 },
    { spec: 'pspd_interceptor', x: 2, heading: -Math.PI / 2, stopX: spire.curb.x + 2 },
    { spec: 'pspd_enforcer', x: spire.curb.x - 4, heading: Math.PI / 2, chase: true },
  ];
  for (const unit of units) {
    const spot = lanePoint(m, unit.x, spire.curb.z + 5, unit.heading);
    const car = m.spawnVehicle(unit.spec, { x: spot.x, z: spot.z, heading: spot.heading, faction: 'police' });
    if (!car) continue;
    const driver = m.spawnPerson({ archetype: 'officer', kind: 'officer', faction: 'police', x: spot.x, z: spot.z });
    if (driver) m.seat(car, driver, 0);
    car.controls.siren = true;
    car.controls.headlights = true;
    if (unit.chase) driveOff(m, car, gate.laneX, gate.z - 30, { speed: 26, careful: false, aggression: 0.7 });
    else driveOff(m, car, unit.stopX, spire.curb.z - 1.5, { speed: 14, stop: true });
    act.allies = (act.allies || []).concat(car);
  }
}

/** Tavi climbs out with his hands up; if he is alive, he gets the last word. */
async function arrestTavi(act) {
  const { m, voice, summit } = act;
  const tavi = act.crew.tavi;
  if (!tavi || tavi.alive === false) {
    voice.talk([
      ['dispatch', 'Suspect vehicle down on Vane Boulevard. The driver did not make it.'],
      ['zayd', 'Tavi...'],
    ]);
    m.flag('taviFate', 'dead');
    await voice.quiet();
    return;
  }
  const side = { x: summit.pos.x - Math.cos(summit.heading) * 4, z: summit.pos.z + Math.sin(summit.heading) * 4 };
  await m.any([m.walkTo(tavi, side.x, side.z, { pace: 'walk' }), m.seconds(4)]);
  m.calm(tavi);
  tavi.intent.gesture = 'handsUp';
  m.objective('Arrest Tavi');
  await m.reach(tavi, 3.5, { onFoot: true, label: 'Tavi' });
  const zayd = m.game.player.character;
  await m.cutscene([
    overShoulder(m, tavi, zayd, { seconds: 3.5, speaker: 'tavi', text: 'A week. You were one of us for a week.' }),
    overShoulder(m, zayd, tavi, { seconds: 3.5, speaker: 'zayd', text: "Longer than that. That's the problem." }),
    overShoulder(m, tavi, zayd, { seconds: 4, side: -1, speaker: 'tavi', text: 'Faris vouched for you. You know what that does to him?' }),
    twoShot(m, zayd, tavi, { seconds: 3, speaker: 'zayd', text: 'I know.' }),
  ]);
  m.flag('taviFate', 'arrested');
}

/** Back on the plaza as the storm eases: Vane in cuffs, Dahan in person, the crew under the lights. */
async function viewOnThePlaza(act) {
  const { m, spire, crew } = act;
  await m.fadeOut(1);
  act.clock.set(19.6);
  m.setWeather(0.3, 3);
  const door = spire.door;
  m.teleportPlayer(door.x + 5, door.z + 13, Math.PI);
  const zayd = m.game.player.character;
  if (crew.tavi && crew.tavi.alive !== false) m.remove(crew.tavi);
  for (const car of act.allies || []) m.remove(car);
  const cruiserSpot = lanePoint(m, spire.curb.x + 6, spire.curb.z, -Math.PI / 2, { kerb: true });
  const cruiser = m.spawnVehicle('pspd_interceptor', { x: cruiserSpot.x, z: cruiserSpot.z, heading: cruiserSpot.heading, faction: 'police', parked: true });
  if (cruiser) cruiser.controls.siren = true;
  const kerbSide = { x: cruiserSpot.x + 1, z: cruiserSpot.z - 3.6 };
  placePerson(m, crew.mina, kerbSide.x - 2.2, kerbSide.z - 0.6, 0);
  placePerson(m, crew.faris, kerbSide.x + 1.4, kerbSide.z - 0.8, 0);
  for (const person of [crew.mina, crew.faris]) if (person) person.intent.gesture = 'handsUp';
  const dahan = m.spawnCast('dahan', door.x + 2.5, door.z + 15, Math.PI * 0.8);
  const vane = m.spawnCast('vane', door.x, door.z + 0.5, 0);
  const escorts = [-1, 1].map((side) => m.spawnPerson({ archetype: 'officer', kind: 'officer', faction: 'police', x: door.x + side * 1.1, z: door.z + 0.2, heading: 0 }));
  const watchers = freeSpotsAround(m, door.x - 10, door.z + 16, 7, 3, { playerGap: 3 })
    .map((spot) => m.spawnPerson({ archetype: 'officer', kind: 'officer', faction: 'police', x: spot.x, z: spot.z, heading: Math.PI }));
  for (const watcher of watchers) if (watcher) faceTo(watcher, door);
  const evidence = buildGoldShares(m, door.x - 6, door.z + 9, 0.2, 2);
  act.scope.adopt(() => evidence.dispose());
  // Vane walks to the cruiser between two officers while the scene plays.
  const walkTarget = { x: cruiserSpot.x - 2, z: cruiserSpot.z - 4.5 };
  strollTo(m, vane, walkTarget.x, walkTarget.z, 'walk');
  escorts.forEach((officer, index) => officer && strollTo(m, officer, walkTarget.x + (index ? 1.1 : -1.1), walkTarget.z - 0.4, 'walk'));
  await m.cutscene([
    { position: { x: door.x - 22, y: 6, z: door.z + 34 }, lookAt: vane, moveTo: { x: door.x - 16, y: 5, z: door.z + 28 }, seconds: 5, speaker: 'vane', text: 'Port Sarab was a mirage before me. It will be one after.' },
    overShoulder(m, vane, zayd, { seconds: 4, back: 1.6, speaker: 'vane', text: 'Mr Karam. The Vane Spire thanks you for your visit.' }),
    twoShot(m, dahan, zayd, { seconds: 3, speaker: 'dahan', text: 'Karam.' }),
    twoShot(m, zayd, dahan, { seconds: 2.5, side: -1, speaker: 'zayd', text: 'Captain.' }),
    overShoulder(m, dahan, zayd, { seconds: 4, speaker: 'dahan', text: "First time we've stood in the same place. You're taller than you sound." }),
    overShoulder(m, crew.mina, zayd, { seconds: 4, back: 2.2, speaker: 'mina', text: 'Good driving, Dust. Shame about everything else.' }),
    overShoulder(m, crew.faris, zayd, { seconds: 4.5, back: 2.2, side: -1, speaker: 'faris', text: "I vouched for you. I'd do it again. Damn you, Zayd, I'd do it again." }),
    overShoulder(m, dahan, zayd, { seconds: 4.5, side: -1, speaker: 'dahan', text: 'Faris walks. You asked, I listened. And your ban is lifted.' }),
    twoShot(m, dahan, zayd, { seconds: 4, speaker: 'dahan', text: "Go home, Karam. That's an order, and a thank-you." }),
  ]);
  const taviLine = m.flag('taviFate') === 'dead' ? 'Tavi Rourke never made it out of the storm.' : 'Tavi Rourke: nine years. He writes to no one.';
  await playStoryCard(m, {
    kicker: 'ENDING',
    title: 'CLEAN HANDS',
    lines: [
      'Idris Vane: forty-one counts of laundering. Bail denied. Still smiling.',
      taviLine,
      'Mina Okoro: three years. The souk keeps her stall for her.',
      'Faris Haddad: no charges. Haddad Motors is still open, and still loud.',
      'Captain Rasha Dahan: promoted. She still phones.',
      'Zayd "Dust" Karam: banned no longer. The Wadi Rally starts in spring.',
    ],
    shots: [
      { position: { x: door.x + 18, y: 3, z: door.z + 30 }, lookAt: { x: spire.x, y: 40, z: spire.z }, moveTo: { x: door.x + 30, y: 70, z: door.z + 60 }, seconds: 13, fov: 55 },
    ],
  });
}

// ---- DUST IN THE WIND ----------------------------------------------------------------------------

/** Bags of bars into the Summit; Mina and Faris take the van east as the decoy; Tavi rides along. */
async function loadTheGold(act) {
  const { m, crew, summit, scope } = act;
  const zayd = m.game.player.character;
  if (m.game.player.vehicle) m.teleportPlayer(act.spire.door.x, act.spire.door.z + 5, Math.PI);
  const back = { x: summit.pos.x - Math.sin(summit.heading) * 4, z: summit.pos.z - Math.cos(summit.heading) * 4 };
  const pile = buildGoldShares(m, back.x, back.z, summit.heading, 2);
  scope.adopt(() => pile.dispose());
  placePerson(m, crew.faris, back.x + 1.6, back.z - 1.2, summit.heading + Math.PI);
  placePerson(m, crew.tavi, back.x - 1.4, back.z - 1.4, summit.heading + Math.PI);
  placePerson(m, crew.mina, back.x + 0.4, back.z - 3.4, summit.heading + Math.PI);
  m.teleportPlayer(back.x - 0.8, back.z - 4.6, summit.heading);
  await m.cutscene([
    shotOf(m, { x: back.x, z: back.z }, { bearing: summit.heading + 2.4, distance: 7, height: 2.2, look: 0.6, seconds: 4.5, push: 1.5, speaker: 'faris', text: 'Four hundred kilos in my Summit. Her springs will never forgive me.' }),
    overShoulder(m, crew.mina, zayd, { seconds: 4, speaker: 'mina', text: 'Faris and I take the van east. The decoy. Loud and slow.' }),
    overShoulder(m, crew.tavi, zayd, { seconds: 3.5, side: -1, speaker: 'tavi', text: 'I ride with you. Gate, dunes, hideout. No stops.' }),
    twoShot(m, crew.faris, zayd, { seconds: 3.5, speaker: 'faris', text: 'Habibi. Drive like the old days.' }),
    twoShot(m, zayd, crew.faris, { seconds: 2.5, side: -1, speaker: 'zayd', text: 'Faster.' }),
    { position: { x: act.spire.curb.x + 50, y: 12, z: act.spire.curb.z + 30 }, lookAt: { x: act.spire.x, y: 30, z: act.spire.towerSouth }, seconds: 3.5, speaker: 'dispatch', text: 'All units! Vane Spire, alarm triggered, vault breach! Every unit!' },
  ]);
  pile.dispose();
  m.seat(summit, crew.tavi, 1);
  const van = act.van;
  if (van && !van.wrecked) {
    m.seat(van, crew.faris, 0);
    m.seat(van, crew.mina, 1);
    driveOff(m, van, 680, act.spire.curb.z + 2, { speed: 16, stop: false });
  }
}

/** Five stars locked on, Vane Boulevard flat out, and a clock on the Gate. */
async function runForTheGate(act) {
  const { m, voice, gate, spire, summit } = act;
  m.failIfDestroyed(summit, 'The Summit is burning, and the gold with it.');
  m.failIfDead(act.crew.tavi, 'Tavi is down. The gold rides on alone, and so does the blame.');
  m.wanted.set(5);
  m.wanted.lock(5);
  m.objective('Get in the Summit');
  await m.inVehicle(summit);
  const clock = m.timer('GATE CLOSES', 130, { reason: "PSPD sealed the Gate. There's no road out of the city now." });
  voice.talk([
    ['tavi', 'Five stars. Five! I have never been worth five of anything.'],
    ['dispatch', 'Roadblocks on Vane Boulevard. Seal the Gate. Nobody leaves the city.'],
  ]);
  letTaviReactToCrashes(act);
  m.objective('Run Vane Boulevard to the Gate');
  const corner = lanePoint(m, 40, spire.curb.z + 26, 0);
  await m.checkpoints([{ x: corner.x, z: corner.z }], { radius: 13, label: 'Vane Boulevard' });
  voice.talk([
    ['tavi', 'Same route as the rehearsal. You remember it?'],
    ['zayd', 'I remember everything.'],
  ]);
  const south = (z) => {
    const p = lanePoint(m, 40, z, 0);
    return { x: p.x, z: p.z };
  };
  await m.checkpoints([south(-60), south(300), south(680)], { radius: 12, label: 'Vane Boulevard' });
  voice.talk([['tavi', "Gate's still open! Mina was right, they're slow in a storm!"]]);
  m.objective('Out through the Port Sarab Gate');
  await m.checkpoints([{ x: gate.laneX, z: gate.z - 12 }], { radius: 13, label: 'Port Sarab Gate' });
  clock.stop();
}

/** A retry from the Gate: the Summit just outside the city, Tavi in the passenger seat, five stars. */
function stageAtTheGate(act) {
  const { m, gate, summit } = act;
  const spot = lanePoint(m, gate.laneX, gate.z + 30, 0);
  m.game.vehicles?.place?.(summit, spot.x, spot.z, spot.heading);
  m.seat(summit, act.crew.tavi, 1);
  m.playerInto(summit);
  m.failIfDestroyed(summit, 'The Summit is burning, and the gold with it.');
  m.failIfDead(act.crew.tavi, 'Tavi is down. The gold rides on alone, and so does the blame.');
  m.wanted.set(5);
  m.wanted.lock(5);
  letTaviReactToCrashes(act);
}

/** Off the road and into the khamsin: Dahan's last call on the way, the police blind in the sand. */
async function intoTheDunes(act) {
  const { m, voice, summit } = act;
  await backInto(m, summit, 'Get back in the Summit');
  voice.talk([
    ['tavi', 'Off the road! Into the sand! Their cruisers will bog!'],
    ['zayd', 'Hold on to something.'],
  ]);
  m.objective('Leave the road: into the dunes, where they cannot follow');
  const wadi = lanePoint(m, -600, 950, Math.atan2(-80, 240), { maxDistance: 60 });
  background(dahansLastCall(act));
  await m.checkpoints([{ x: -100, z: 886 }, { x: -340, z: 902 }, { x: wadi.x, z: wadi.z }], { radius: 14, label: 'Through the dunes' });
  m.wanted.lock(null);
  m.wanted.set(2);
  m.police.suspend(6);
  voice.talk([
    ['dispatch', 'Shaheen-1 returning to base. Zero visibility. We have lost them in the sand.'],
    ['tavi', "They're blind out here. Lose the last of them, Dust."],
  ]);
  m.objective('Lose the last patrols in the storm');
  await m.lostWanted();
  voice.talk([
    ['tavi', 'Nothing. Nothing in the mirrors but sand.'],
    ['tavi', 'Take us home. Whatever home is now.'],
  ]);
  m.objective('Get to the Dune Hideout');
  await m.reach('safehouse_dunes', 11, { inVehicle: summit, stopped: true, label: 'Dune Hideout' });
}

/** Dahan rings once more. Tavi hears one word too many. */
async function dahansLastCall(act) {
  const { m, voice } = act;
  await m.seconds(6);
  await m.phone('dahan', [
    ['dahan', 'Karam.'],
    ['zayd', 'Captain.'],
    ['dahan', 'I vouched for you. To the commissioner. To my own people.'],
    ['zayd', 'I know.'],
    ['dahan', 'Then you know what this costs me.'],
    ['dahan', "Don't come back to Port Sarab, Zayd. I won't call twice."],
  ]);
  voice.talk([
    ['tavi', '...Captain?'],
    ['zayd', 'Was. Not any more.'],
    ['tavi', "Huh. Then the gold's the only honest thing in this car."],
  ]);
}

/** Dawn after the khamsin: four shares on the sand, the crew, and the open desert. */
async function dawnAtTheHideout(act) {
  const { m, crew, summit, scope } = act;
  await m.fadeOut(1.2);
  m.wanted.clear();
  act.clock.set(6.1);
  m.setWeather(0, 1);
  const hideout = m.place('safehouse_dunes') || { x: -690, z: 1118 };
  const base = { x: hideout.x + 4, z: hideout.z + 8 };
  m.teleportPlayer(base.x - 3.5, base.z + 2.2, Math.PI / 2);
  m.game.vehicles?.place?.(summit, base.x - 9, base.z - 4, 0.4);
  let van = act.van;
  if (van && !van.wrecked) m.game.vehicles?.place?.(van, base.x + 9, base.z - 5, -0.5);
  else van = m.spawnVehicle('sahel_caravan', { x: base.x + 9, z: base.z - 5, heading: -0.5, color: VAN_TEAL, parked: true });
  for (const car of [summit, van]) if (car) m.stopDriving(car);
  placePerson(m, crew.mina, base.x + 1.5, base.z - 2.4, 0);
  placePerson(m, crew.faris, base.x + 3.6, base.z + 0.6, -Math.PI / 2);
  placePerson(m, crew.tavi, base.x - 0.8, base.z + 3.2, Math.PI);
  const shares = buildGoldShares(m, base.x + 0.6, base.z + 0.4, 0, 4);
  scope.adopt(() => shares.dispose());
  const zayd = m.game.player.character;
  const raced = m.flag('promisedFarisRace') === true;
  await m.cutscene([
    { position: { x: base.x - 70, y: 22, z: base.z + 60 }, lookAt: { x: base.x, y: 2, z: base.z }, moveTo: { x: base.x - 46, y: 14, z: base.z + 44 }, seconds: 6, fov: 50, speaker: 'radio', text: 'Sarab Gold 98.6. The khamsin has passed. Idris Vane reports nothing stolen.' },
    shotOf(m, { x: base.x + 0.6, z: base.z + 0.4 }, { bearing: 0.5, distance: 4.5, height: 1.4, look: 0.3, seconds: 4.5, push: 1, speaker: 'mina', text: 'Four shares. I did the maths twice. Then I just looked at it.' }),
    overShoulder(m, crew.faris, zayd, { seconds: 4.5, speaker: 'faris', text: "Vane can't report gold he never declared. Ha! The man is a poem." }),
    overShoulder(m, crew.tavi, zayd, { seconds: 3.5, side: -1, speaker: 'tavi', text: 'Dust. I was wrong about you.' }),
    overShoulder(m, zayd, crew.tavi, { seconds: 4, speaker: 'zayd', text: "No, you weren't. That's the funny part." }),
    overShoulder(m, crew.faris, zayd, { seconds: 4, back: 1.0, speaker: 'faris', text: 'After this, we race again, eh? Somewhere far. No stewards.' }),
    twoShot(m, zayd, crew.faris, { seconds: 3, speaker: 'zayd', text: raced ? 'I promised, Uncle.' : 'Somewhere far.' }),
    overShoulder(m, crew.mina, zayd, { seconds: 3, side: -1, speaker: 'mina', text: 'So. What now?' }),
    { position: { x: base.x - 6, y: 2.2, z: base.z + 10 }, lookAt: { x: base.x + 120, y: 10, z: base.z + 260 }, moveTo: { x: base.x - 10, y: 30, z: base.z + 2 }, seconds: 5, fov: 54, speaker: 'zayd', text: 'Now? We drive.' },
  ]);
  await playStoryCard(m, {
    kicker: 'ENDING',
    title: 'DUST IN THE WIND',
    lines: [
      "Idris Vane reported nothing stolen. He couldn't.",
      'Captain Rasha Dahan asked for the traffic division. She got it.',
      'Mina Okoro opened a repair shop in a city with no name and very good coffee.',
      "Faris Haddad races again, under somebody else's name.",
      'Tavi Rourke bought a boat. It rains a lot where he went. He hates it.',
      'Zayd "Dust" Karam: last seen on the Amber Dunes at dawn, driving.',
    ],
    shots: [
      { position: { x: base.x + 30, y: 6, z: base.z + 40 }, lookAt: { x: base.x, y: 1.5, z: base.z }, moveTo: { x: base.x + 80, y: 60, z: base.z + 120 }, seconds: 13, fov: 52 },
    ],
  });
}

/** Tavi has an opinion about every bump on the run. */
function letTaviReactToCrashes(act) {
  const { scope, voice, summit } = act;
  if (act.crashTalk) return;
  act.crashTalk = true;
  scope.on('vehicle:collision', (event) => {
    if (!event || (event.vehicle !== summit && event.other !== summit) || !(event.speed > 7)) return;
    voice.react(TAVI_ON_THE_RUN, 5);
  });
}

/** The story remembers which road was taken (also when an ending is replayed from its checkpoint). */
function recordTheEnding(m, which) {
  const story = m.game.story;
  if (!story || story.ending === which) return;
  if (typeof story.setEnding === 'function') story.setEnding(which);
  else story.ending = which;
  m.flag('ending', which);
}

function usable(vehicle) {
  return Boolean(vehicle && !vehicle.wrecked && !vehicle.despawned);
}

function spawnParked(m, specId, x, z, heading, color) {
  const spot = lanePoint(m, x, z, heading, { kerb: true });
  return m.spawnVehicle(specId, { x: spot.x, z: spot.z, heading: spot.heading, color, parked: true });
}

/** On top of the job's own reward: the gold's share comes to $250,000 in all. */
const CREW_SHARE_BONUS = 225000;
const SUMMIT_PEARL = 0xe9e2d0;
const VAN_TEAL = 0x1ba39c;

const DAHAN_ON_RAMS = [
  ['dahan', "That's it. Again."],
  ['dispatch', "Undercover unit is ramming the suspect. Don't interfere."],
  ['dahan', 'Mind the Summit. The gold in it is evidence.'],
];

const TAVI_CORNERED = [
  ['tavi', 'You sold us! You sold Faris!'],
  ['tavi', "I'll put you in the sand, Karam!"],
  ['tavi', 'Back off! Back off!'],
];

const TAVI_ON_THE_RUN = [
  ['tavi', 'Mind the gold! It dents!'],
  ['tavi', 'That cruiser was asking for it.'],
  ['tavi', 'Is this how you drove the rally? No wonder they banned you.'],
  ['tavi', "Don't stop! Whatever you do, don't stop!"],
];
