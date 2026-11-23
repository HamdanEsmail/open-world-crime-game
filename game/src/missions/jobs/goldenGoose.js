// Job 8, Golden Goose: Tavi's highway ambush. The Aurum Bullion Carrier leaves Sarab Airfield with
// two Dune Jackal SUVs riding escort; ram or shoot it to a stop before it reaches the Port Sarab Gate,
// win the shoot-out with the escort, and drive the slow, seven-tonne truck to Hangar 2 under a
// four-star response. Dahan wants the carrier's driver alive; Tavi wants no witnesses.
import {
  gateStage, hangarStage, createCrewVoice, openJobScope, trackStall, lanePoint, shotOf, overShoulder, twoShot,
  playerDistance, distanceBetween, background, driveOff, strollTo, placePerson, killedByPlayer,
} from './finaleSceneHelpers.js';

export const job = {
  id: 'golden_goose',
  order: 8,
  title: 'Golden Goose',
  giver: 'tavi',
  contact: 'contact_tavi',
  requires: ['dress_rehearsal'],
  hours: null,
  reward: { money: 6000, rep: 240 },
  briefing: "Vane's gold is flying in tonight and riding into the city in one armoured truck, escorted by two "
    + 'Jackal SUVs. Ambush it on the Dune Highway, stop it before the Port Sarab Gate, deal with the escort and '
    + 'drive the carrier to Hangar 2 with half the PSPD behind you. Dahan: the driver lives. Tavi: no witnesses.',
  async run(m) {
    const scope = openJobScope(m);
    try {
      await runGoldenGoose(m, scope);
    } finally {
      scope.close();
    }
  },
};

/** From Tavi's dock gate to the ambush, the hit, the shoot-out and the run to Hangar 2. */
async function runGoldenGoose(m, scope) {
  const ctx = {
    m,
    scope,
    voice: createCrewVoice(m),
    gate: gateStage(m),
    hangar: hangarStage(m),
    ambush: null,
    nomad: null,
    tavi: null,
    carrier: null,
    driver: null,
    escorts: [],
    escortCrew: [],
    leaderFate: 'none',
  };
  m.setTime(17.4);
  m.setWeather(0, 4);
  m.setTraffic(0.8);
  ctx.ambush = ambushPoint(m);

  if (m.resumeFrom === 'carrier') {
    stageInTheCarrier(ctx);
  } else {
    if (m.resumeFrom === 'highway') {
      stageAtTheAmbush(ctx);
    } else {
      await openingAtTheDocks(ctx);
      await driveToTheAmbush(ctx);
    }
    m.checkpoint('highway');
    await waitForTheConvoy(ctx);
    await stopTheCarrier(ctx);
    await fightTheEscort(ctx);
    await takeTheCarrier(ctx);
    m.checkpoint('carrier');
  }
  await runItToHangarTwo(ctx);
  await closeTheHangarDoors(ctx);
}

/** On the Dune Highway shoulder just east of the Airfield Road junction, facing west. */
function ambushPoint(m) {
  const junction = { x: 700, z: 1390 };
  // The highway runs east-south-east from the junction; westbound traffic heads about -1.15 rad.
  const spot = lanePoint(m, junction.x + 44, junction.z - 19, Math.atan2(-360, 160), { kerb: true, maxDistance: 40 });
  return { x: spot.x, z: spot.z, heading: spot.heading, junction };
}

/** Tavi at the dock gate, the cranes behind him, laying out the hit. */
async function openingAtTheDocks(ctx) {
  const { m } = ctx;
  const dock = m.place('contact_tavi') || { x: 696.5, z: -400, curbX: 691.8, curbZ: -400, heading: Math.PI / 2 };
  const park = lanePoint(m, dock.curbX, dock.curbZ - 9, Math.PI, { kerb: true });
  ctx.nomad = m.spawnVehicle('oryx_nomad', { x: park.x, z: park.z, heading: park.heading, color: NOMAD_SAND });
  const at = m.giver ? m.giver.pos : { x: dock.x, z: dock.z };
  ctx.tavi = m.spawnCast('tavi', at.x, at.z, -Math.PI / 2);
  const zayd = m.game.player.character;
  await m.cutscene([
    { position: { x: dock.x - 34, y: 24, z: dock.z + 70 }, lookAt: { x: 800, y: 34, z: -840 }, moveTo: { x: dock.x - 26, y: 20, z: dock.z + 58 }, seconds: 4.5, speaker: 'tavi', text: "Vane's ship is late. So tonight his gold flies in." },
    overShoulder(m, ctx.tavi, zayd, { seconds: 4, speaker: 'tavi', text: 'Airfield to the Spire, down the Dune Highway. One armoured truck.' }),
    overShoulder(m, zayd, ctx.tavi, { seconds: 2.5, speaker: 'zayd', text: 'Escort?' }),
    overShoulder(m, ctx.tavi, zayd, { seconds: 4, side: -1, speaker: 'tavi', text: "Two black SUVs. Sayf's Jackals. They shoot first, and second." }),
    shotOf(m, ctx.nomad, { bearing: 2.4, distance: 8, height: 2, look: 0.9, seconds: 4, slide: 2, speaker: 'tavi', text: 'We stop it, we take it, we hide it in Hangar 2.' }),
    overShoulder(m, zayd, ctx.tavi, { seconds: 3, speaker: 'zayd', text: "Hangar 2's next door to the airfield." }),
    twoShot(m, ctx.tavi, zayd, { seconds: 4, speaker: 'tavi', text: 'Nobody looks for stolen gold beside the plane it came off.' }),
    overShoulder(m, ctx.tavi, zayd, { seconds: 4, back: 1.0, push: 0.4, speaker: 'tavi', text: 'And Dust. No witnesses. Sayf can never know it was us.' }),
  ]);
  m.seat(ctx.nomad, ctx.tavi, 1);
  m.give('smg', 240);
}

/** South out of the city with Tavi riding shotgun; Dahan calls about the man behind the wheel. */
async function driveToTheAmbush(ctx) {
  const { m, voice } = ctx;
  m.objective('Get in the Nomad');
  await m.inVehicle(ctx.nomad);
  armTheNomad(ctx);
  voice.talk([
    ['tavi', 'Steel bumper. Faris welded it himself. Hit things with it.'],
    ['tavi', 'You really won the Wadi Rally three times?'],
    ['zayd', 'Four. They took one back.'],
    ['tavi', 'Why did they ban you?'],
    ['zayd', 'Somebody paid them to.'],
    ['tavi', "Somebody. Funny how it's always somebody."],
  ]);
  background(dahanOnTheDriver(ctx));
  m.objective('Drive to the ambush point on the Dune Highway');
  await m.reach({ x: ctx.ambush.x, z: ctx.ambush.z }, 11, { inVehicle: ctx.nomad, stopped: true, label: 'Ambush point' });
}

/** Dahan rings mid-drive; Tavi hears half of it. */
async function dahanOnTheDriver(ctx) {
  const { m, voice } = ctx;
  await m.seconds(14);
  await m.phone('dahan', [
    ['dahan', "Karam. The carrier's driver is Nabil Sabri. Fifty-two."],
    ['dahan', "Three daughters. He isn't Vane's. He just drives."],
    ['dahan', "He goes home tonight. And don't burn that truck. I need the gold."],
    ['zayd', 'Copy.'],
  ]);
  voice.talk([
    ['tavi', 'Who was that?'],
    ['zayd', 'Faris. He wants his bumper back.'],
    ['tavi', 'Six years on Vane\'s docks. Six years of "somebody".'],
    ['tavi', 'Faris trusts you. Mina trusts Faris. I trust nobody.'],
    ['zayd', 'Sounds restful.'],
    ['tavi', "It's kept me breathing. After this, a boat. Somewhere it rains."],
    ['zayd', "You'll hate rain."],
    ['tavi', "I'll learn."],
  ]);
}

/** A retry at the ambush: the Nomad on the shoulder, Tavi beside the player. */
function stageAtTheAmbush(ctx) {
  const { m } = ctx;
  ctx.nomad = m.spawnVehicle('oryx_nomad', { x: ctx.ambush.x, z: ctx.ambush.z, heading: ctx.ambush.heading, color: NOMAD_SAND });
  ctx.tavi = m.spawnCast('tavi', ctx.ambush.x + 3, ctx.ambush.z + 3, 0);
  m.seat(ctx.nomad, ctx.tavi, 1);
  m.playerInto(ctx.nomad);
  m.give('smg', 240);
  armTheNomad(ctx);
}

function armTheNomad(ctx) {
  const { m } = ctx;
  m.failIfDead(ctx.tavi, "Tavi is down. The inside man's inside a body bag.");
}

/** The convoy turns off the Airfield Road: the carrier with a Jackal SUV in front and one behind. */
async function waitForTheConvoy(ctx) {
  const { m, voice } = ctx;
  m.objective('Wait for the convoy');
  // Out here in the dunes nobody hears the shooting: the PSPD only learns of it from the carrier's alarm.
  m.wanted.clear();
  m.wanted.lock(0);
  voice.talk([['tavi', 'Kill the engine. Let the dust settle.']]);
  await m.seconds(2.5);
  const heading = Math.atan2(-120, -230);
  const at = (ahead) => lanePoint(m, 806, 1592, heading, { ahead, maxDistance: 40 });
  const lead = at(24);
  const middle = at(0);
  const rear = at(-22);
  ctx.carrier = m.spawnVehicle('aurum_bullion', { x: middle.x, z: middle.z, heading: middle.heading });
  // Sturdy enough to live through a stray round; Dahan's wish is broken only on purpose.
  ctx.driver = m.spawnPerson({ archetype: 'worker', kind: 'civilian', name: 'Nabil Sabri', x: middle.x, z: middle.z, health: 240 });
  m.seat(ctx.carrier, ctx.driver, 0);
  for (const spot of [lead, rear]) {
    const suv = m.spawnVehicle('oryx_summit', { x: spot.x, z: spot.z, heading: spot.heading, color: JACKAL_BLACK, faction: 'gang' });
    const leads = spot === lead;
    const wheelman = m.spawnPerson({ archetype: 'gang', faction: 'gang', name: leads ? 'Rafiq' : undefined, x: spot.x, z: spot.z, weapon: 'pistol', ammo: 90, health: leads ? 140 : undefined });
    const gunner = m.spawnPerson({ archetype: 'gang', faction: 'gang', x: spot.x, z: spot.z, weapon: 'smg', ammo: 240 });
    m.seat(suv, wheelman, 0);
    m.seat(suv, gunner, 1);
    ctx.escorts.push(suv);
    ctx.escortCrew.push(wheelman, gunner);
  }
  const target = ctx.gate;
  driveOff(m, ctx.escorts[0], target.laneX, target.z - 30, { speed: 15, careful: false });
  driveOff(m, ctx.carrier, target.laneX, target.z - 30, { speed: 14, careful: true });
  driveOff(m, ctx.escorts[1], target.laneX, target.z - 30, { speed: 15, careful: true });
  m.failIfDestroyed(ctx.carrier, 'The carrier burned, and the gold with it.');

  const junction = ctx.ambush.junction;
  await m.cutscene([
    { position: { x: junction.x + 70, y: 14, z: junction.z + 95 }, lookAt: ctx.carrier, seconds: 4.5, speaker: 'tavi', text: "There's the goose. Golden eggs and all." },
    shotOf(m, ctx.escorts[0], { bearing: -0.9, distance: 16, height: 3, look: 1, seconds: 3.5, follow: true, speaker: 'tavi', text: 'Lead SUV. Jackals with machine pistols.' }),
    shotOf(m, ctx.carrier, { bearing: 2.2, distance: 14, height: 2.4, look: 1.4, seconds: 3.5, follow: true, speaker: 'zayd', text: 'Seven tonnes of armour.' }),
    { position: { x: ctx.ambush.x + 6, y: 2.2, z: ctx.ambush.z + 9 }, lookAt: { x: junction.x, y: 2, z: junction.z }, seconds: 3, speaker: 'tavi', text: 'And one Faris bumper. Go!' },
  ]);
}

/** The chase: ram the carrier or shoot its engine to death before it gets through the Gate. */
async function stopTheCarrier(ctx) {
  const { m, scope, voice, gate } = ctx;
  for (const suv of ctx.escorts) m.pursue(suv, { aggression: 0.72, accuracy: 0.26 });
  driveOff(m, ctx.carrier, gate.laneX, gate.z - 20, { speed: 21, careful: false, aggression: 0.55 });
  voice.talk([
    ['tavi', 'Get alongside and hit it! Back wheels!'],
    ['tavi', 'Escorts are turning on us. Heads down!'],
  ]);
  m.objective('Stop the carrier before it reaches the Gate');
  const target = m.marker(ctx.carrier, { label: 'Aurum carrier', color: CORAL, radius: 4 });
  let warned = false;
  const stall = trackStall(m, scope, ctx.carrier, {
    label: 'CARRIER ENGINE',
    hits: 5,
    bulletShare: 0.28,
    onHit(progress) {
      if (progress > 0.45 && progress < 0.75) driveOff(m, ctx.carrier, gate.laneX, gate.z - 20, { speed: 16, careful: false });
      else if (progress >= 0.75) driveOff(m, ctx.carrier, gate.laneX, gate.z - 20, { speed: 11, careful: false });
      voice.react(TAVI_ON_RAMS, 3);
    },
    onStall() {
      voice.talk([['tavi', "Engine's dead! The goose is down!"]]);
    },
  });
  const escaped = m.failIf(() => distanceBetween(ctx.carrier, { x: gate.laneX, z: gate.z }) < 70, 'The carrier made it to the Gate. The gold is back inside the city.');
  scope.every(() => {
    if (warned || stall.stalled) return;
    if (distanceBetween(ctx.carrier, { x: gate.laneX, z: gate.z }) < 260) {
      warned = true;
      voice.talk([['tavi', "It's nearly at the Gate! Stop it now!"]]);
    }
  });
  // Stopped means stalled and standing, or boxed in and held still with the player right on it
  // (a carrier that merely waits behind its own escort for a moment does not count).
  let still = 0;
  await m.until(() => {
    const carrier = ctx.carrier;
    if (!carrier || carrier.wrecked) return true;
    still = Math.abs(carrier.speed) < 1.5 ? still + (m.game.time.dt || 0) : 0;
    return (stall.stalled && still > 1.2) || (still > 2.2 && playerDistance(m, carrier) < 30);
  });
  escaped.stop();
  stall.clear();
  m.clearMarker(target);
  if (!stall.stalled) m.stopDriving(ctx.carrier);
}

/** Everyone out: the escort and Sayf's outriders fight; the escort leader may run for it. */
async function fightTheEscort(ctx) {
  const { m, voice } = ctx;
  const carrier = ctx.carrier;
  const driver = ctx.driver;
  if (driver && driver.alive !== false) {
    const side = sideOf(carrier, 9);
    strollTo(m, driver, side.x, side.z, 'run');
  }
  for (const suv of ctx.escorts) m.stopDriving(suv);
  const fighters = [];
  ctx.escortCrew.forEach((person, index) => {
    if (!person || person.alive === false) return;
    const suv = ctx.escorts[index < 2 ? 0 : 1];
    const near = suv && !suv.wrecked ? suv.pos : carrier.pos;
    background(m.walkTo(person, near.x + (index % 2 ? 4 : -4), near.z + 3, { pace: 'run' }));
    m.hostile(person, { accuracy: 0.4, style: 'cover' });
    fighters.push(person);
  });
  const ahead = sideOf(carrier, -26, 1);
  const outriders = m.spawnEnemies(3, { x: ahead.x, z: ahead.z, radius: 8, archetype: 'gang', weapon: 'smg', accuracy: 0.34, style: 'cover' });
  voice.talk([
    ['tavi', 'They are out of the cars! Get to cover!'],
    ['tavi', "Sayf's outriders, up the road! Three of them!"],
  ]);
  const leader = fighters.length > 0 ? fighters[0] : null;
  const others = fighters.slice(1).concat(outriders);
  m.objective('Take out the Jackal escort');
  watchTheDriver(ctx);
  if (others.length > 0) await m.dead(others, { label: 'JACKALS' });
  if (leader && leader.alive !== false) background(chaseTheLeader(ctx, leader));
  else ctx.leaderFate = 'dead';
  voice.talk([['tavi', 'Clear. Ha! Clear!']]);
}

/** The escort's leader bolts for Sayf: stopping him is Tavi's idea of "no witnesses". */
async function chaseTheLeader(ctx, leader) {
  const { m, voice } = ctx;
  m.calm(leader);
  const suv = ctx.escorts.find((car) => car && !car.wrecked && Math.abs(car.speed) < 30);
  const side = m.objective('Stop the escort leader before he reaches Sayf', { optional: true });
  voice.talk([['tavi', "Rafiq's running for Sayf! He leads the escort. No witnesses, Dust!"]]);
  if (suv) {
    m.seat(suv, leader, 0);
    m.fleeFrom(suv, { speed: 26 });
  } else {
    background(m.walkTo(leader, leader.pos.x - 220, leader.pos.z - 260, { pace: 'sprint' }));
  }
  m.marker(suv || leader, { label: 'Escort leader', color: CORAL, kind: 'enemy', route: false, beacon: false, radius: 2 });
  const start = { x: leader.pos.x, z: leader.pos.z };
  const caught = () => leader.alive === false || (suv && (suv.wrecked || (Math.abs(suv.speed) < 1 && playerDistance(m, suv) < 14 && distanceBetween(suv, start) > 20)))
    || (!suv && playerDistance(m, leader) < 2.5);
  const gone = () => distanceBetween(leader, start) > 320 || playerDistance(m, leader) > 300;
  const result = await m.any([m.until(caught), m.until(gone), m.seconds(70)]);
  if (result === 0) {
    ctx.leaderFate = 'stopped';
    side.done();
    voice.talk([['tavi', "He won't be telling Sayf anything."]]);
  } else {
    ctx.leaderFate = 'escaped';
    side.fail();
    voice.talk([['tavi', 'He got away. Now Sayf knows our faces.']]);
  }
}

/** Nabil Sabri cowers by his truck; Dahan wants him home tonight. */
function watchTheDriver(ctx) {
  const { m, scope } = ctx;
  const driver = ctx.driver;
  scope.every(() => {
    if (!driver || driver.alive === false || driver.ai?.mode === 'walk') return;
    driver.intent.gesture = 'cower';
  });
  scope.on('character:died', (event) => {
    if (!event || event.character !== driver) return;
    ctx.driverKilledByPlayer = killedByPlayer(m, event.source);
    m.notify('Nabil Sabri is dead.', 'bad');
  });
}

/** Nabil walks home; the carrier is the player's. Tavi climbs into the cab. */
async function takeTheCarrier(ctx) {
  const { m, voice } = ctx;
  const driver = ctx.driver;
  if (driver && driver.alive !== false) {
    // Gather the three of them beside the cab for the scene.
    const zayd = m.game.player.character;
    const spot = sideOf(ctx.carrier, 2, 5.5);
    if (m.game.player.vehicle || playerDistance(m, driver) > 12) m.teleportPlayer(spot.x, spot.z, 0);
    const tavisSpot = sideOf(ctx.carrier, 4.5, 7);
    if (ctx.tavi && ctx.tavi.alive !== false) placePerson(m, ctx.tavi, tavisSpot.x, tavisSpot.z, 0);
    await m.cutscene([
      overShoulder(m, driver, zayd, { seconds: 3.5, speaker: 'Nabil', text: "Please. I drive the truck. That's all I do." }),
      overShoulder(m, ctx.tavi, zayd, { seconds: 3, side: -1, speaker: 'tavi', text: 'No witnesses, Dust. That was the deal.' }),
      overShoulder(m, zayd, driver, { seconds: 3.5, speaker: 'zayd', text: 'The deal was gold, not graves. Walk home, Nabil.' }),
      overShoulder(m, ctx.tavi, zayd, { seconds: 3, speaker: 'tavi', text: 'How do you know his name?' }),
      twoShot(m, zayd, ctx.tavi, { seconds: 3, speaker: 'zayd', text: "It's on his shirt." }),
    ]);
    driver.intent.gesture = null;
    const home = lanePoint(m, ctx.gate.laneX, ctx.gate.z + 40, Math.PI);
    strollTo(m, driver, home.x + 12, home.z, 'run');
  }
  if (ctx.tavi && ctx.tavi.alive !== false) m.seat(ctx.carrier, ctx.tavi, 1);
  m.objective('Take the carrier');
  await m.inVehicle(ctx.carrier);
}

/** A retry with the carrier already taken: back on the highway, Tavi in the cab. */
function stageInTheCarrier(ctx) {
  const { m } = ctx;
  const spot = lanePoint(m, 180, 1155, Math.atan2(240, 230), { maxDistance: 60 });
  ctx.carrier = m.spawnVehicle('aurum_bullion', { x: spot.x, z: spot.z, heading: spot.heading });
  ctx.tavi = m.spawnCast('tavi', spot.x + 4, spot.z, 0);
  m.seat(ctx.carrier, ctx.tavi, 1);
  m.playerInto(ctx.carrier);
  m.failIfDestroyed(ctx.carrier, 'The carrier burned, and the gold with it.');
  armTheNomad(ctx);
  ctx.leaderFate = m.flag('gooseLeaderFate') || 'escaped';
}

/** Seven tonnes, four stars, the long way round to Hangar 2. */
async function runItToHangarTwo(ctx) {
  const { m, scope, voice, hangar } = ctx;
  m.flag('gooseLeaderFate', ctx.leaderFate);
  m.wanted.set(4);
  m.wanted.lock(4);
  voice.talk([
    ['dispatch', 'All units: Aurum carrier hijacked, Dune Highway. Four-star response.'],
    ['tavi', 'Four stars. For one truck. Vane must be screaming.'],
    ['tavi', 'This thing turns like a cathedral.'],
    ['zayd', "Cathedrals don't turn."],
    ['tavi', 'Exactly.'],
    ['dispatch', 'Shaheen-1 airborne. Air unit tracking the carrier.'],
  ]);
  scope.on('vehicle:collision', (event) => {
    if (!event || (event.vehicle !== ctx.carrier && event.other !== ctx.carrier) || !(event.speed > 6)) return;
    voice.react(TAVI_IN_THE_CAB, 6);
  });
  m.objective('Drive the carrier to Hangar 2');
  await m.reach(hangar.apron, 13, { inVehicle: ctx.carrier, stopped: true, label: 'Hangar 2' });
  m.wanted.lock(null);
  m.wanted.clear();
}

/** Faris and Mina at the hangar doors; the Cover meter settles; Dahan hears about it later. */
async function closeTheHangarDoors(ctx) {
  const { m, voice, hangar } = ctx;
  const apron = hangar.apron;
  const faris = m.spawnCast('faris', apron.x - 7, apron.z - 6, Math.PI / 2);
  const mina = m.spawnCast('mina', apron.x - 7, apron.z + 5, Math.PI / 2);
  await voice.quiet();
  await m.cutscene([
    { position: { x: apron.x - 46, y: 9, z: apron.z + 34 }, lookAt: { x: hangar.x, y: 6, z: hangar.z }, moveTo: { x: apron.x - 38, y: 7, z: apron.z + 26 }, seconds: 4.5, speaker: 'faris', text: 'Ya salam! Seven tonnes of trouble, and barely a scratch on her.' },
    overShoulder(m, mina, ctx.carrier, { seconds: 4.5, back: 3.2, height: 2.4, speaker: 'mina', text: "Transponder's dead, doors are closing. To them, the goose just flew away." }),
    shotOf(m, ctx.carrier, { bearing: -1.2, distance: 8, height: 2.2, look: 1.6, seconds: 3.5, speaker: 'tavi', text: 'Told you. Next to the plane it came off.' }),
    twoShot(m, mina, faris, { seconds: 3.5, speaker: 'mina', text: 'You told me nothing, Tavi. It was my idea.' }),
  ]);
  const driverLived = ctx.driver ? ctx.driver.alive !== false : m.flag('nabilLived') !== false;
  m.flag('nabilLived', driverLived);
  if (driverLived) m.badge(8, 'Dahan: Nabil Sabri walked home');
  else m.badge(-12, 'The Aurum driver died');
  if (ctx.driverKilledByPlayer) m.trust(3, 'Tavi: no witnesses');
  if (ctx.leaderFate === 'stopped' || ctx.leaderFate === 'dead') m.trust(6, 'Tavi: the escort is finished');
  else if (ctx.leaderFate === 'escaped') m.trust(-3, 'The escort leader got away');
  const lines = driverLived
    ? [['dahan', 'An armoured truck vanished on the Dune Highway.'], ['dahan', 'Nabil Sabri walked into the Gate post an hour ago. Thank you.']]
    : [['dahan', 'Nabil Sabri is dead, Karam.'], ['dahan', 'Three daughters. I hope the gold was heavy.']];
  if (typeof m.callAfter === 'function') m.callAfter('dahan', lines, 7);
  else background(m.phone('dahan', lines));
}

/** A point beside a vehicle: `along` metres ahead (negative behind) and `across` to its right. */
function sideOf(vehicle, along, across = 0) {
  const s = Math.sin(vehicle.heading);
  const c = Math.cos(vehicle.heading);
  return { x: vehicle.pos.x + s * along - c * across, z: vehicle.pos.z + c * along + s * across };
}

const NOMAD_SAND = 0xd9b77a;
const CORAL = 0xe4572e;
const JACKAL_BLACK = 0x16181c;

const TAVI_ON_RAMS = [
  ['tavi', "That's it! Again!"],
  ['tavi', "It's limping! Stay on it!"],
  ['tavi', 'Hit it like it owes you money!'],
  ['tavi', 'Back wheels, Dust! Trucks hate that!'],
  ['tavi', "Faris's bumper is earning its keep."],
];

const TAVI_IN_THE_CAB = [
  ['tavi', "They're boxing us! Push through!"],
  ['tavi', 'Seven tonnes, Dust. Use them.'],
  ['tavi', 'That cruiser just learned about mass.'],
  ['tavi', "Don't stop. Whatever happens, don't stop."],
];
