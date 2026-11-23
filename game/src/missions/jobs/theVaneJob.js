// Job 10, The Vane Job: the finale, in the full khamsin. Fight Idris Vane's private guards across the
// Spire plaza to the lobby doors, hold them from both sides while Mina opens the vault lift, ride up
// to the gold, and decide: call it in (CLEAN HANDS) or take the gold (DUST IN THE WIND). Each ending
// then plays its own last act, its epilogue and the credits, and the city stays open afterwards.
import {
  spireStage, createCrewVoice, openJobScope, lanePoint, shotOf, overShoulder, twoShot, placePerson, faceTo,
  freeSpotsAround, stackGoldBars, coverValues, playerDistance, distanceBetween, leaveWeatherAfterJob,
} from './finaleSceneHelpers.js';
import { playBadgeEnding, playCrewEnding } from '../../story/storyEndings.js';

export const job = {
  id: 'the_vane_job',
  order: 10,
  title: 'The Vane Job',
  giver: 'mina',
  contact: 'vane_spire_door',
  requires: ['khamsin_rising'],
  hours: null,
  reward: { money: 25000, rep: 500 },
  briefing: "The khamsin has buried Port Sarab. Fight Vane's guards across the Spire plaza, hold the lobby while "
    + 'Mina opens the vault lift, and ride up to the gold. Then decide, before the vault: call it in, or take '
    + 'the gold and vanish into the dunes.',
  async run(m) {
    const scope = openJobScope(m);
    try {
      await runTheVaneJob(m, scope);
    } finally {
      scope.close();
    }
  },
};

/** The plaza, the lobby, the vault, the choice, the ending; retries resume at each of them. */
async function runTheVaneJob(m, scope) {
  const ctx = { m, scope, voice: createCrewVoice(m), spire: spireStage(m), crew: {}, van: null, summit: null, guards: [] };
  m.setTime(18.8);
  m.setWeather(1, 5);
  m.setTraffic(0.04);
  m.setPedestrians(0);
  m.clearArea(ctx.spire.x, ctx.spire.towerSouth + 40, 140);
  leaveWeatherAfterJob(m, 0, 25);

  const resume = m.resumeFrom;
  if (resume && resume.startsWith('badge')) {
    await playBadgeEnding(m);
    return;
  }
  if (resume && resume.startsWith('crew')) {
    await playCrewEnding(m);
    return;
  }

  parkTheCrew(ctx);
  // The alarm line is cut and the storm swallows the shooting: no police until someone calls them.
  m.wanted.clear();
  m.wanted.lock(0);
  if (resume !== 'lobby') {
    if (resume !== 'plaza') await openingInTheStorm(ctx);
    m.checkpoint('plaza');
    await fightAcrossThePlaza(ctx);
  }
  m.checkpoint('lobby');
  await holdTheLobbyDoors(ctx);
  await dahanBeforeTheVault(ctx);
  const ending = await theVaultAndTheChoice(ctx);
  m.checkpoint(ending === 'badge' ? 'badge_call' : 'crew_load');
  const carry = { mina: ctx.crew.mina, faris: ctx.crew.faris, tavi: ctx.crew.tavi, summit: ctx.summit, van: ctx.van };
  if (ending === 'badge') await playBadgeEnding(m, carry);
  else await playCrewEnding(m, carry);
}

/** The van and the getaway Summit at the Gold Street kerb; the crew behind the van, out of sight. */
function parkTheCrew(ctx) {
  const { m, spire } = ctx;
  const vanSpot = lanePoint(m, spire.curb.x - 20, spire.curb.z, -Math.PI / 2, { kerb: true });
  // The getaway car waits on the far kerb, already pointing east toward Vane Boulevard and the Gate.
  const summitSpot = lanePoint(m, spire.curb.x + 22, spire.curb.z + 12, Math.PI / 2, { kerb: true });
  ctx.van = m.spawnVehicle('sahel_caravan', { x: vanSpot.x, z: vanSpot.z, heading: vanSpot.heading, color: VAN_TEAL, parked: true });
  ctx.summit = m.spawnVehicle('oryx_summit', { x: summitSpot.x, z: summitSpot.z, heading: summitSpot.heading, color: SUMMIT_PEARL, parked: true });
  const behind = (along, across) => ({ x: vanSpot.x + along, z: vanSpot.z + across });
  const spots = { mina: behind(1.5, 3.2), faris: behind(-2, 3.4), tavi: behind(4, 3.0) };
  for (const id of ['mina', 'faris', 'tavi']) {
    const at = spots[id];
    const person = m.spawnCast(id, at.x, at.z, Math.PI);
    if (!person) continue;
    placePerson(m, person, at.x, at.z, Math.PI);
    // Sturdy enough to survive a stray round in the storm; the job only fails if Mina falls.
    person.maxHealth = Math.max(person.maxHealth || 0, CREW_HEALTH);
    person.health = CREW_HEALTH;
    ctx.crew[id] = person;
  }
  m.failIfDead(ctx.crew.mina, 'Mina is down. Without her the lift stays shut.');
  // Zayd starts in cover with them, behind the van, looking up at the plaza.
  if (m.resumeFrom !== 'lobby') m.teleportPlayer(vanSpot.x + 3.6, vanSpot.z + 4.4, Math.PI);
  ctx.coverSpot = { x: vanSpot.x + 3.6, z: vanSpot.z + 4.4 };
  m.give('rifle', 240);
  m.give('pistol', 72);
  m.game.weapons?.dropPickup?.('armor', spire.curb.x - 6, spire.curb.z + 4, {});
}

/** The Spire swallowed by the storm, the crew behind the van, Vane's guards on the plaza. */
async function openingInTheStorm(ctx) {
  const { m, spire } = ctx;
  const { mina, faris, tavi } = ctx.crew;
  const zayd = m.game.player.character;
  ctx.guards = postGuards(ctx, 4, { x: spire.x, z: spire.towerSouth + 24, radius: 15 });
  await m.cutscene([
    { position: { x: spire.curb.x + 40, y: 1.6, z: spire.curb.z + 30 }, lookAt: { x: spire.x, y: 240, z: spire.z }, moveTo: { x: spire.curb.x + 30, y: 2.2, z: spire.curb.z + 22 }, seconds: 5, fov: 58, speaker: 'radio', text: 'Sarab Gold 98.6. The khamsin is here. Visibility: almost nothing.' },
    shotOf(m, { x: spire.x, z: spire.towerSouth + 20 }, { bearing: 0.4, distance: 30, height: 4, look: 1.4, seconds: 4, push: 6, speaker: 'tavi', text: "Vane's own guards. Not cops. Nobody here goes easy." }),
    twoShot(m, mina, zayd, { seconds: 4, speaker: 'mina', text: 'Lift is in the lobby core. Give me ninety seconds at the panel.' }),
    overShoulder(m, faris, zayd, { seconds: 3.5, speaker: 'faris', text: "Ninety seconds. I've waited longer for a kettle." }),
    overShoulder(m, zayd, mina, { seconds: 3, speaker: 'zayd', text: 'Stay behind the van till I wave.' }),
    overShoulder(m, mina, zayd, { seconds: 3.5, side: -1, back: 1.0, speaker: 'mina', text: 'Wave nicely. And Dust? Come back.' }),
  ]);
  faceTo(tavi, spire.door);
}

/** Three pushes across the plaza: the posted guards, both flanks, and the heavies at the doors. */
async function fightAcrossThePlaza(ctx) {
  const { m, voice, spire } = ctx;
  if (ctx.guards.length === 0) ctx.guards = postGuards(ctx, 4, { x: spire.x, z: spire.towerSouth + 24, radius: 15 });
  for (const guard of ctx.guards) m.hostile(guard, { accuracy: 0.3, style: 'cover' });
  voice.talk([
    ['Aurum Security', 'Contact! Plaza, south side! Weapons free!'],
    ['tavi', 'Behind the planters, Dust! Use them!'],
  ]);
  m.objective('Take out the guards on the plaza');
  await m.dead(ctx.guards, { label: 'GUARDS' });
  m.game.weapons?.dropPickup?.('health', spire.x + 6, spire.towerSouth + 30, {});

  voice.talk([
    ['faris', 'Ha! The old driver can still shoot!'],
    ['mina', 'More of them! Both sides, by the boulevard and Pearl Street!'],
  ]);
  const flanks = spawnGuards(ctx, 2, { x: spire.towerEast + 16, z: spire.towerSouth + 14, radius: 6, weapon: 'smg' })
    .concat(spawnGuards(ctx, 2, { x: spire.towerWest - 16, z: spire.towerSouth + 14, radius: 6, weapon: 'smg' }));
  m.objective('Push on: guards on both flanks');
  await m.dead(flanks, { label: 'GUARDS' });
  m.game.weapons?.dropPickup?.('armor', spire.x - 8, spire.towerSouth + 18, {});

  voice.talk([
    ['tavi', 'Lobby doors! Two heavies coming out!'],
    ['Aurum Security', 'Hold the core! Nobody reaches the lift!'],
  ]);
  const heavies = spawnGuards(ctx, 3, { x: spire.door.x, z: spire.door.z + 4, radius: 5, heavy: true, weapon: 'shotgun', accuracy: 0.38 });
  m.objective('Clear the lobby doors');
  await m.dead(heavies, { label: 'GUARDS' });
  voice.talk([
    ['zayd', 'Clear. Now.'],
    ['mina', "Running. Don't look at me running."],
  ]);
  m.objective('Reach the lobby doors');
  await m.reach(spire.door, 4, { onFoot: true, label: 'Lobby doors' });
}

/** Mina at the lift panel, guards from both sides; she only works while nobody is on her back. */
async function holdTheLobbyDoors(ctx) {
  const { m, scope, voice, spire } = ctx;
  const { mina, faris, tavi } = ctx.crew;
  const door = spire.door;
  placePerson(m, mina, door.x + 1.4, spire.towerSouth + 1.1, Math.PI);
  if (faris) placePerson(m, faris, door.x + 4.2, spire.towerSouth + 1.6, Math.PI * 0.75);
  if (tavi) placePerson(m, tavi, door.x - 3.4, spire.towerSouth + 1.6, -Math.PI * 0.75);
  if (playerDistance(m, door) > 12) m.teleportPlayer(door.x - 1, door.z + 6, Math.PI);
  scope.every(() => {
    if (mina && mina.alive !== false && mina.intent) {
      mina.intent.gesture = 'phone';
      mina.intent.faceYaw = Math.PI;
    }
  });
  voice.talk([
    ['mina', 'Panel is open. Lovely. Somebody wired this in copper and spite.'],
    ['mina', 'Keep them off my back, and this goes quickly.'],
  ]);
  m.objective('Hold the lobby doors while Mina opens the lift');
  const panel = m.counter('LIFT PANEL', 0, 100);
  const alive = [];
  const waves = [
    { at: 0, west: 3, east: 0 },
    { at: 24, west: 0, east: 3 },
    { at: 50, west: 2, east: 2, heavy: true },
    { at: 74, street: 3 },
  ];
  let next = 0;
  let progress = 0;
  let blockedFor = 0;
  let lastBlockedLine = -1e9;
  await m.until(() => {
    const dt = m.game.time.dt || 0;
    for (let i = alive.length - 1; i >= 0; i -= 1) if (alive[i].alive === false || alive[i].despawned) alive.splice(i, 1);
    while (next < waves.length && progress >= waves[next].at && alive.length <= 3) {
      alive.push(...sendWave(ctx, waves[next]));
      next += 1;
    }
    const crowding = alive.some((guard) => distanceBetween(guard, mina) < MINA_ELBOW_ROOM);
    if (crowding) {
      blockedFor += dt;
      if (blockedFor > 1.2 && m.game.time.elapsed - lastBlockedLine > 9) {
        lastBlockedLine = m.game.time.elapsed;
        voice.talk([PANEL_INTERRUPTED[Math.floor(Math.random() * PANEL_INTERRUPTED.length)]]);
      }
    } else {
      blockedFor = 0;
      const before = progress;
      progress = Math.min(100, progress + (dt * 100) / LIFT_SECONDS);
      for (const beat of PANEL_BEATS) if (before < beat.at && progress >= beat.at) voice.talk(beat.lines);
    }
    panel.set(Math.floor(progress));
    return progress >= 100 && next >= waves.length;
  });
  panel.clear();
  if (alive.some((guard) => guard.alive !== false)) {
    m.objective('Finish the last of the guards');
    await m.dead(alive.filter((guard) => guard.alive !== false), { label: 'GUARDS' });
  }
  voice.talk([['mina', "There. Lift's ours. Everyone in, now."]]);
  await voice.quiet();
}

/** One wave of the defence: from the west corner, the east corner, or out of an SUV on Gold Street. */
function sendWave(ctx, wave) {
  const { m, voice, spire } = ctx;
  const z = spire.towerSouth + 9;
  let list = [];
  if (wave.west) list = list.concat(spawnGuards(ctx, wave.west, { x: spire.towerWest - 14, z, radius: 6, heavy: wave.heavy, weapon: wave.heavy ? 'rifle' : 'smg' }));
  if (wave.east) list = list.concat(spawnGuards(ctx, wave.east, { x: spire.towerEast + 14, z, radius: 6, heavy: wave.heavy, weapon: wave.heavy ? 'rifle' : 'smg' }));
  if (wave.street) {
    const kerb = lanePoint(m, spire.curb.x + 8, spire.curb.z, Math.PI / 2, { kerb: true });
    const suv = m.spawnVehicle('oryx_summit', { x: kerb.x, z: kerb.z, heading: kerb.heading, color: GUARD_BLACK, parked: true });
    if (suv) suv.controls.headlights = true;
    list = list.concat(spawnGuards(ctx, wave.street, { x: kerb.x, z: kerb.z - 6, radius: 5, heavy: true, weapon: 'shotgun', accuracy: 0.36 }));
  }
  const side = wave.street ? 'street' : wave.west && wave.east ? 'both' : wave.west ? 'west' : 'east';
  voice.talk([WAVE_CALLS[side]]);
  return list;
}

/** Guards standing their posts (not yet fighting), for the opening shot. */
function postGuards(ctx, count, options) {
  return spawnGuards(ctx, count, { ...options, posted: true });
}

/** Idris Vane's private security in charcoal and gold, or the heavies in tactical gear. */
function spawnGuards(ctx, count, { x, z, radius = 8, heavy = false, weapon = 'smg', accuracy = 0.32, posted = false }) {
  const { m } = ctx;
  const player = m.game.player.character;
  const list = [];
  for (const spot of freeSpotsAround(m, x, z, radius, count)) {
    const heading = Math.atan2(player.pos.x - spot.x, player.pos.z - spot.z);
    const guard = m.spawnPerson({
      archetype: heavy ? 'swat' : 'business', kind: 'gang', faction: 'gang', name: 'Aurum Security',
      x: spot.x, z: spot.z, heading, weapon, ammo: 400, health: heavy ? 170 : 100, armor: heavy ? 50 : 0,
      look: guardLook(m, heavy),
    });
    if (!guard) continue;
    if (!posted) m.hostile(guard, { accuracy, style: heavy ? 'rush' : 'cover' });
    list.push(guard);
  }
  return list;
}

/** A charcoal suit with gold cuffs for Vane's guards (the heavies keep their tactical kit). */
function guardLook(m, heavy) {
  const characters = m.game.characters;
  if (!characters || typeof characters.randomLook !== 'function') return undefined;
  const look = characters.randomLook(heavy ? 'swat' : 'business');
  if (!heavy && look) {
    look.top = { color: 0x22252b, colorB: 0xc9a24a, pattern: 'suit', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: 0xc9a24a };
    look.bottom = { color: 0x22252b, colorB: 0x111214, belt: true, shorts: false, boots: null, socks: null };
    look.headwear = null;
  }
  return look;
}

/** At the lift doors, Dahan: the line she has been saving. */
async function dahanBeforeTheVault(ctx) {
  const { m } = ctx;
  m.objective('Answer the phone');
  await m.phone('dahan', [
    ['dahan', "Karam. You're at the lift."],
    ['zayd', 'Going up.'],
    ['dahan', 'Whatever you decide, decide it before the vault.'],
  ]);
}

/** Up 330 metres to Vane's vault: the gold in amber storm light, and the choice. */
async function theVaultAndTheChoice(ctx) {
  const { m, scope, spire } = ctx;
  const vault = buildVaultSet(m, { x: spire.x, y: spire.h + 70, z: spire.z });
  scope.adopt(() => vault.dispose());
  const door = spire.door;
  const c = vault.centre;
  await m.cutscene([
    { position: { x: door.x + 24, y: 2, z: door.z + 26 }, lookAt: { x: spire.x, y: 140, z: spire.z }, moveTo: { x: door.x + 40, y: 190, z: door.z + 70 }, seconds: 5.5, fov: 60, speaker: 'mina', text: 'Three hundred and thirty metres. My ears just popped.' },
    { position: vault.at(3.6, 2.2, 3.2), lookAt: vault.doorWheel, moveTo: vault.at(3.9, 2.4, 3.6), seconds: 3.2, fov: 44, speaker: 'faris', text: 'Torch. Stand back. Further.' },
    { position: vault.entrance, lookAt: vault.gold, moveTo: vault.at(0, 1.6, 3.4), seconds: 5, fov: 52, speaker: 'tavi', text: 'Six years I guarded his rubbish. This is what it was for.' },
    { position: vault.at(-7.6, 4.6, 5.4), lookAt: vault.at(0, 0.8, -3), moveTo: vault.at(-6.8, 4.2, 4.6), seconds: 4.5, fov: 56, speaker: 'mina', text: 'Four hundred kilos. Give or take a pharaoh.' },
    { position: vault.at(3.2, 0.9, 0.6), lookAt: vault.at(-2.6, 0.9, -4.6), moveTo: vault.at(2.6, 0.95, 0.2), seconds: 4, fov: 48, speaker: 'faris', text: 'Zayd. Your hands are shaking.' },
    { position: vault.at(-1.2, 1.7, 2.6), lookAt: vault.at(0, 1.1, -4.4), moveTo: vault.at(-0.9, 1.6, 1.8), seconds: 3.5, fov: 46, speaker: 'zayd', text: 'Altitude.', cut: 'hard' },
  ]);
  // Hold on the gold while the decision is made.
  const hold = { position: vault.at(0.6, 1.8, 3.2), lookAt: vault.at(0, 1.0, -4.4), fov: 50 };
  m.game.cameraRig?.setCinematic?.(hold);
  m.game.menus?.letterbox?.(true);
  let ending;
  try {
    ending = await chooseTheEnding(ctx);
  } finally {
    m.game.cameraRig?.setCinematic?.(null);
    m.game.menus?.letterbox?.(false);
  }
  if (m.game.story && typeof m.game.story.setEnding === 'function') m.game.story.setEnding(ending);
  else if (m.game.story) m.game.story.ending = ending;
  m.flag('ending', ending);
  vault.dispose();
  // Back down on the plaza with the crew around the doors.
  const { mina, faris, tavi } = ctx.crew;
  m.teleportPlayer(c.x, spire.door.z + 5, Math.PI);
  if (mina) placePerson(m, mina, spire.door.x + 2, spire.door.z + 3, 0);
  if (faris) placePerson(m, faris, spire.door.x + 4, spire.door.z + 6, -Math.PI / 2);
  if (tavi) placePerson(m, tavi, spire.door.x - 3, spire.door.z + 4, Math.PI / 2);
  return ending;
}

/**
 * The choice, as far as the Cover meter allows it: "Call it in" needs badge 35, "Take the gold" needs
 * crew trust 35. With one road shut, someone says why; with both shut, the stronger side wins.
 */
async function chooseTheEnding(ctx) {
  const { m } = ctx;
  const cover = coverValues(m);
  const story = m.game.story || {};
  const canBadge = typeof story.canCallItIn === 'boolean' ? story.canCallItIn : cover.badge >= ENDING_THRESHOLD;
  const canCrew = typeof story.canTakeTheGold === 'boolean' ? story.canTakeTheGold : cover.trust >= ENDING_THRESHOLD;
  const callIt = { id: 'badge', key: 'E', text: 'Call it in' };
  const takeIt = { id: 'crew', key: 'F', text: 'Take the gold' };
  if (canBadge && canCrew) {
    m.objective('Decide. Call it in, or take the gold.');
    return m.choice([callIt, takeIt]);
  }
  if (canBadge) {
    await m.say([
      ['tavi', "Funny. Nobody here trusts you any more, Dust. It's a three-way split."],
      ['zayd', "Then I'll make a call instead."],
    ]);
    m.objective('Decide. The crew has cut you out.');
    return m.choice([callIt]);
  }
  if (canCrew) {
    await m.say([
      ['dahan', "Karam. Your badge is gone. If you call now, nobody comes."],
      ['zayd', 'Then I never called.'],
    ]);
    m.objective('Decide. Dahan has cut you loose.');
    return m.choice([takeIt]);
  }
  await m.say([
    ['zayd', 'Nobody trusts me. Not them. Not her.'],
    ['zayd', 'So I take the road I can still drive.'],
  ]);
  return cover.badge >= cover.trust ? 'badge' : 'crew';
}

/**
 * Idris Vane's vault, built for the cameras high above the Spire where nothing else stands: a dark
 * marble room lit amber through a storm-glass wall, a round door hanging open, and pallets of gold
 * bars stacked to the shoulder. Returns anchor points for the shots and dispose().
 */
function buildVaultSet(m, centre) {
  const THREE = m.game.THREE;
  const group = new THREE.Group();
  group.name = 'vane-vault-set';
  const owned = [];
  const keep = (thing) => {
    owned.push(thing);
    return thing;
  };
  const marble = keep(new THREE.MeshLambertMaterial({ color: 0x3a302a, emissive: 0x1c130c, side: THREE.BackSide }));
  const floorMat = keep(new THREE.MeshLambertMaterial({ color: 0x5a4a3e, emissive: 0x24180e }));
  const inlay = keep(new THREE.MeshBasicMaterial({ color: 0xe9b44c }));
  const stormGlass = keep(new THREE.MeshBasicMaterial({ color: 0xf2a040, transparent: true, opacity: 0.92 }));
  const steel = keep(new THREE.MeshLambertMaterial({ color: 0x8d8f94, emissive: 0x2a2418 }));
  const palletMat = keep(new THREE.MeshLambertMaterial({ color: 0x6b4a2e, emissive: 0x1a0f05 }));
  const goldMat = keep(new THREE.MeshStandardMaterial({ color: 0xf2c04a, emissive: 0x7a4800, emissiveIntensity: 0.85, metalness: 0.45, roughness: 0.3 }));
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(keep(geometry), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(18, 6.5, 14), marble, 0, 3.25, 0);
  add(new THREE.PlaneGeometry(17.8, 13.8), floorMat, 0, 0.01, 0).rotation.x = -Math.PI / 2;
  add(new THREE.RingGeometry(3.2, 3.45, 48), inlay, 0, 0.02, 0).rotation.x = -Math.PI / 2;
  // The storm-glass wall at the back: the khamsin glowing amber outside, cut by steel mullions.
  add(new THREE.PlaneGeometry(16, 4.2), stormGlass, 0, 3.3, -6.95);
  for (let i = -3; i <= 3; i += 1) add(new THREE.BoxGeometry(0.18, 4.4, 0.18), steel, i * 2.6, 3.3, -6.85);
  // The vault door, a metre-thick disc swung open beside the entrance, its gold wheel facing in.
  const door = add(new THREE.CylinderGeometry(2.4, 2.4, 0.7, 40), steel, 5.6, 2.5, 5.6);
  door.rotation.order = 'YXZ';
  door.rotation.set(Math.PI / 2, 1.15, 0);
  add(new THREE.TorusGeometry(0.9, 0.09, 8, 24), inlay, 5.6 - Math.sin(1.15) * 0.42, 2.5, 5.6 - Math.cos(1.15) * 0.42).rotation.y = 1.15;

  // Pallets of bars: a row along the back, two down each side, two in the middle, stepped pyramids.
  const pallets = [];
  for (let i = -2; i <= 2; i += 1) pallets.push({ x: i * 3.1, z: -4.6, layers: 7 - Math.abs(i) });
  for (const side of [-1, 1]) for (let j = 0; j < 2; j += 1) pallets.push({ x: side * 7, z: -1.6 + j * 3.2, layers: 5 - j });
  pallets.push({ x: -1.6, z: 0.4, layers: 3 }, { x: 1.6, z: 0.6, layers: 4 });
  group.add(stackGoldBars(THREE, pallets, goldMat, keep));
  const palletMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(2.5, 0.16, 1.5)), palletMat, pallets.length);
  const matrix = new THREE.Matrix4();
  pallets.forEach((pallet, index) => palletMesh.setMatrixAt(index, matrix.makeTranslation(pallet.x, 0.08, pallet.z)));
  palletMesh.instanceMatrix.needsUpdate = true;
  group.add(palletMesh);

  group.traverse((object) => {
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
  });
  group.position.set(centre.x, centre.y, centre.z);
  m.game.scene.add(group);
  const glows = [];
  const effects = m.game.effects;
  if (effects && effects.glows && effects.glows.add) {
    for (const [gx, gy, gz, size] of [[0, 5.6, -2, 9], [-6, 5.4, 2, 6], [6, 5.4, 2, 6], [0, 1.2, -4.4, 7]]) {
      glows.push(effects.glows.add({ x: centre.x + gx, y: centre.y + gy, z: centre.z + gz, color: 0xffb347, size }));
    }
  }
  const at = (x, y, z) => ({ x: centre.x + x, y: centre.y + y, z: centre.z + z });
  let disposed = false;
  return {
    centre,
    at,
    entrance: at(0, 1.7, 6.2),
    gold: at(0, 1.1, -4.2),
    doorWheel: at(5.6, 2.5, 5.6),
    dispose() {
      if (disposed) return;
      disposed = true;
      m.game.scene.remove(group);
      for (const glow of glows) effects?.glows?.remove?.(glow);
      for (const thing of owned) thing.dispose?.();
    },
  };
}

/** Below the threshold a road to an ending is shut (the Cover meter's rule). */
const ENDING_THRESHOLD = 35;
/** Seconds of uninterrupted work Mina needs on the lift panel. */
const LIFT_SECONDS = 92;
/** A guard this close to Mina stops her work. */
const MINA_ELBOW_ROOM = 9;
/** The crew's health in the finale (story characters are frail by default). */
const CREW_HEALTH = 900;

const VAN_TEAL = 0x1ba39c;
const SUMMIT_PEARL = 0xe9e2d0;
const GUARD_BLACK = 0x16181c;

const WAVE_CALLS = {
  west: ['tavi', 'West side! They are coming round from Pearl Street!'],
  east: ['faris', 'East! By the boulevard! Three of them!'],
  both: ['tavi', 'Both corners at once! Heavies!'],
  street: ['mina', 'An SUV on Gold Street! Behind us, Dust!'],
};

const PANEL_BEATS = [
  { at: 20, lines: [['mina', 'Twenty percent. The panel is talking to me now.']] },
  { at: 40, lines: [['mina', 'Forty. Who puts a vault lift on a timer? Vane does.']] },
  { at: 60, lines: [['Aurum Security', 'They are at the core! All units to the lobby!'], ['mina', 'Sixty. The lift is sulking.']] },
  { at: 80, lines: [['mina', 'Eighty. Nearly. Nearly. Do not let them near me.']] },
];

const PANEL_INTERRUPTED = [
  ['mina', 'Dust! One of them is right on me!'],
  ['mina', "I can't work with a gun in my ear!"],
  ['faris', 'Zayd! By Mina! Get him off her!'],
];
