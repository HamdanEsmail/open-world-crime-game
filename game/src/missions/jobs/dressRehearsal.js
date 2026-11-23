// Job 7, Dress Rehearsal: Mina rides along to time the getaway for real. From the Vane Spire's lobby
// door down Vane Boulevard and out through the Port Sarab Gate with a three-star pursuit locked on
// (she phoned in the tip herself, "to test the response"), then lose the police in the dunes and
// stash the Summit at the Dune Hideout. Captain Dahan's condition: every officer goes home tonight.
import {
  spireStage, gateStage, createCrewVoice, openJobScope, lanePoint, shotOf, overShoulder, twoShot, killedByPlayer,
  background, backInto,
} from './finaleSceneHelpers.js';

export const job = {
  id: 'dress_rehearsal',
  order: 7,
  title: 'Dress Rehearsal',
  giver: 'mina',
  contact: 'contact_mina',
  requires: ['sand_tax'],
  hours: null,
  reward: { money: 3500, rep: 190 },
  briefing: 'Mina wants the getaway timed for real: from the Vane Spire lobby door down Vane Boulevard and out '
    + 'through the Port Sarab Gate, with the police on your tail because she called them herself. Lose them in '
    + 'the dunes and stash the Summit at the Dune Hideout. Captain Dahan has one condition: no officer dies.',
  async run(m) {
    const scope = openJobScope(m);
    try {
      await runDressRehearsal(m, scope);
    } finally {
      scope.close();
    }
  },
};

/** The rehearsal from the souk to the hideout, picking up at the lobby door or the dunes on a retry. */
async function runDressRehearsal(m, scope) {
  const ctx = {
    m,
    scope,
    voice: createCrewVoice(m),
    spire: spireStage(m),
    gate: gateStage(m),
    car: null,
    mina: null,
    officersKilled: 0,
    gateSeconds: 0,
  };
  m.setTime(17.2);
  m.setWeather(0, 4);
  m.setTraffic(0.9);
  m.setPedestrians(0.9);
  watchForFallenOfficers(ctx);

  if (m.resumeFrom === 'dunes') {
    stageAtTheGate(ctx);
  } else {
    if (m.resumeFrom === 'door') {
      stageAtTheDoor(ctx);
    } else {
      await openingAtTheSouk(ctx);
      await driveToTheDoor(ctx);
    }
    m.checkpoint('door');
    await tipOffAtTheDoor(ctx);
    await runTheGetawayRoute(ctx);
    m.checkpoint('dunes');
  }
  await loseThemInTheDunes(ctx);
  await stashAtTheHideout(ctx);
  await settleTheCover(ctx);
}

/** Mina at her stall in the Grand Souk, the Spire over the rooftops, and the plan for tonight. */
async function openingAtTheSouk(ctx) {
  const { m, spire } = ctx;
  const souk = m.place('contact_mina') || { x: -260, z: 50, curbX: -260, curbZ: 54.7 };
  const park = lanePoint(m, souk.curbX - 9, souk.curbZ, -Math.PI / 2, { kerb: true });
  ctx.car = m.spawnVehicle('oryx_summit', { x: park.x, z: park.z, heading: park.heading, color: SUMMIT_PEARL });
  const at = m.giver ? m.giver.pos : { x: souk.x, z: souk.z };
  ctx.mina = m.spawnCast('mina', at.x, at.z, souk.heading || Math.PI);
  const zayd = m.game.player.character;
  const tower = { x: spire.x, y: 150, z: spire.z };
  await m.cutscene([
    { position: { x: souk.x - 30, y: 6, z: souk.z + 26 }, lookAt: tower, moveTo: { x: souk.x - 22, y: 8, z: souk.z + 20 }, seconds: 4.5, speaker: 'mina', text: 'Soon we rob a tower. Tonight we rehearse leaving it.' },
    overShoulder(m, zayd, ctx.mina, { seconds: 3, speaker: 'zayd', text: 'Rehearse. With who?' }),
    overShoulder(m, ctx.mina, zayd, { seconds: 4, speaker: 'mina', text: 'Real police. I phoned in the tip myself. Anonymous. Very rude.' }),
    shotOf(m, ctx.car, { bearing: 2.6, distance: 9, height: 2.2, look: 0.9, seconds: 4, slide: 3, speaker: 'mina', text: 'Three stars of honest feedback. I want to see how fast they come.' }),
    twoShot(m, zayd, ctx.mina, { seconds: 3, speaker: 'zayd', text: 'And if they come fast?' }),
    overShoulder(m, ctx.mina, zayd, { seconds: 3.5, side: -1, back: 1.0, speaker: 'mina', text: 'Then we have a problem on the night. Get in.' }),
  ]);
  m.seat(ctx.car, ctx.mina, 1);
}

/** Across Old Sarab to the Spire, Mina inventing her own pace notes. */
async function driveToTheDoor(ctx) {
  const { m, voice, spire } = ctx;
  m.objective('Get in the Summit');
  await m.inVehicle(ctx.car);
  armTheCar(ctx);
  voice.talk([
    ['mina', 'The Summit you borrowed from the Mirage Grand. Faris put a heart in it.'],
    ['mina', "I'll call the route. Faris says you like pace notes."],
    ['zayd', 'Faris says a lot of things.'],
    ['mina', 'Left at Pearl, then a long straight... something. Medium?'],
    ['zayd', "That's not how pace notes work."],
    ['mina', "It is now. I'm innovating."],
  ]);
  m.objective('Drive Mina to the Vane Spire lobby door');
  await m.reach({ x: spire.curb.x, z: spire.curb.z }, 8, { inVehicle: ctx.car, stopped: true, label: 'Vane Spire' });
}

/** A retry from the door: the Summit at the Gold Street kerb, Mina aboard, the player at the wheel. */
function stageAtTheDoor(ctx) {
  const { m, spire } = ctx;
  const park = lanePoint(m, spire.curb.x + 4, spire.curb.z, -Math.PI / 2, { kerb: true });
  ctx.car = m.spawnVehicle('oryx_summit', { x: park.x, z: park.z, heading: park.heading, color: SUMMIT_PEARL });
  ctx.mina = m.spawnCast('mina', park.x, park.z + 3, 0);
  m.seat(ctx.car, ctx.mina, 1);
  m.playerInto(ctx.car);
  armTheCar(ctx);
}

/** A retry from the dunes: just out of the Gate, three stars still on the tail. */
function stageAtTheGate(ctx) {
  const { m, gate } = ctx;
  const spot = lanePoint(m, gate.laneX, gate.z + 30, 0);
  ctx.car = m.spawnVehicle('oryx_summit', { x: spot.x, z: spot.z, heading: spot.heading, color: SUMMIT_PEARL });
  ctx.mina = m.spawnCast('mina', spot.x + 3, spot.z, 0);
  m.seat(ctx.car, ctx.mina, 1);
  m.playerInto(ctx.car);
  armTheCar(ctx);
  m.wanted.set(3);
}

/** The Summit and Mina must come through in one piece; Mina has a word for every bump. */
function armTheCar(ctx) {
  const { m, scope, voice } = ctx;
  m.failIfDestroyed(ctx.car, "The Summit is scrap. Mina won't rehearse a getaway in a taxi.");
  m.failIfDead(ctx.mina, "Mina is down. There's no plan without the planner.");
  scope.on('vehicle:collision', (event) => {
    if (!event || (event.vehicle !== ctx.car && event.other !== ctx.car) || !(event.speed > 7)) return;
    const other = event.vehicle === ctx.car ? event.other : event.vehicle;
    voice.react(other && other.faction === 'police' ? MINA_ON_POLICE_HITS : MINA_ON_CRASHES, 6);
  });
}

/** At the lobby door: Dahan's condition, then Mina makes the call that brings the police. */
async function tipOffAtTheDoor(ctx) {
  const { m, spire } = ctx;
  const car = ctx.car;
  await m.cutscene([
    { position: { x: spire.curb.x + 14, y: 1.2, z: spire.curb.z + 9 }, lookAt: { x: spire.x, y: 160, z: spire.z }, moveTo: { x: spire.curb.x + 10, y: 1.4, z: spire.curb.z + 7 }, seconds: 4, speaker: 'mina', text: 'The lobby door. On the night, the gold comes out right there.' },
    shotOf(m, car, { bearing: 2.3, distance: 7, height: 1.8, look: 1.1, seconds: 3.5, speaker: 'mina', text: 'Wheels stop for ninety seconds. Not one more.' }),
    shotOf(m, car, { bearing: -2.6, distance: 6, height: 1.5, look: 1.2, seconds: 3, speaker: 'zayd', text: 'And tonight?' }),
    { position: { x: spire.curb.x + 60, y: 3, z: spire.curb.z + 4 }, lookAt: { x: spire.curb.x, y: 2, z: spire.curb.z }, seconds: 3.5, speaker: 'mina', text: "Tonight I make a phone call. But first, yours is ringing." },
  ]);
  m.objective('Answer the phone');
  await m.phone('dahan', [
    ['dahan', 'Karam. Your planner just called in an armed robbery on Gold Street.'],
    ['zayd', 'A rehearsal.'],
    ['dahan', "My units don't know that. They'll come in hard."],
    ['dahan', 'Nobody dies on that route tonight. Not one of mine.'],
    ['zayd', 'Understood.'],
  ]);
  m.objective('Hold at the door while Mina calls it in');
  await m.say([
    ['mina', 'Hello, police? A very suspicious pearl Summit. Vane Spire. Hurry, please.'],
    ['dispatch', 'All units: armed suspects, Vane Spire, Gold Street. Pearl Oryx Summit.'],
  ]);
  m.wanted.set(3);
  m.wanted.lock(3);
  await m.seconds(2.5);
}

/** The route itself, flat out, three stars locked on: Gold Street, Vane Boulevard, the Gate. */
async function runTheGetawayRoute(ctx) {
  const { m, scope, voice, gate, spire } = ctx;
  await backInto(m, ctx.car, 'Get back in the Summit');
  const started = m.game.time.elapsed;
  const clock = m.timer('TO THE GATE', 150, { reason: "Too slow to the Gate. On the night, that's a prison cell." });
  voice.talk([
    ['mina', 'Clock is running. Go, go, go.'],
    ['mina', "Right onto Vane Boulevard, flat out. I'm timing."],
  ]);
  m.objective('Turn onto Vane Boulevard');
  const corner = lanePoint(m, 40, spire.curb.z + 26, 0);
  await m.checkpoints([{ x: corner.x, z: corner.z }], { radius: 13, label: 'Vane Boulevard' });

  voice.talk([
    ['dispatch', 'Suspect vehicle southbound on Vane Boulevard. All units converge.'],
    ['mina', "They're quicker than I budgeted. Noted."],
  ]);
  m.objective('Run Vane Boulevard south through the planned junctions');
  const south = (z) => {
    const p = lanePoint(m, 40, z, 0);
    return { x: p.x, z: p.z };
  };
  const junctionTalk = {
    1: [['mina', 'Al Noor junction. On the night these lights will be ours.'], ['mina', 'Next is Tamarind. Keep it straight. Ish.']],
    2: [['dispatch', 'Requesting a roadblock at the Gate. Negative, no units in position.'], ['mina', "No roadblock. That's the best news I've had all week."]],
    3: [['mina', "Gate in sight. Don't brake. I mean it, don't."]],
  };
  let leg = 0;
  scope.on('mission:checkpoint', (event) => {
    if (leg === 1 && event && junctionTalk[event.index]) voice.talk(junctionTalk[event.index]);
  });
  leg = 1;
  await m.checkpoints([south(-60), south(300), south(680)], { radius: 12, label: 'JUNCTIONS' });
  leg = 2;

  m.objective('Burst out through the Port Sarab Gate');
  await m.checkpoints([{ x: gate.laneX, z: gate.z - 12 }], { radius: 13, label: 'Port Sarab Gate' });
  clock.stop();
  ctx.gateSeconds = Math.round(m.game.time.elapsed - started);
  m.flag('rehearsalSeconds', ctx.gateSeconds);
  const underPar = ctx.gateSeconds <= PAR_SECONDS;
  voice.talk([
    ['mina', `Time! ${ctx.gateSeconds} seconds from the door. Let me write that down.`],
    underPar ? ['mina', 'Under ninety. Faris owes me karak for a week.'] : ['mina', "Over ninety. We'll shave it on the night."],
  ]);
  if (underPar) m.trust(4, 'Mina: under par to the Gate');
  else m.trust(1, 'Mina has her numbers');
}

/** Out past the Gate the pursuit is no longer locked: the dunes have to do the rest. */
async function loseThemInTheDunes(ctx) {
  const { m, voice } = ctx;
  await backInto(m, ctx.car, 'Get back in the Summit');
  m.wanted.lock(null);
  voice.talk([
    ['mina', 'Now lose them. The dunes eat police cars.'],
    ['zayd', 'The dunes eat everything.'],
    ['dispatch', 'Shaheen-1, sweep south of the Gate. Suspect heading into the sand.'],
    ['mina', 'A helicopter. Nobody mentioned a helicopter on the tip line.'],
  ]);
  m.objective('Lose the police in the dunes');
  await m.lostWanted();
  voice.talk([
    ['dispatch', 'All units, suspect lost in the dunes. Resume patrol.'],
    ['mina', "And that's the response time of Port Sarab's finest. Noted."],
  ]);
}

/** A slow drive to the hideout at sunset, and the question Mina has been saving. */
async function stashAtTheHideout(ctx) {
  const { m, voice } = ctx;
  await backInto(m, ctx.car, 'Get back in the Summit');
  voice.talk([
    ['mina', 'Take us to the hideout. I want to see where the gold sleeps.'],
    ['mina', 'Can I ask you something, Dust?'],
    ['zayd', "You'll ask anyway."],
    ['mina', 'Why did they ban you? The real reason.'],
    ['zayd', 'My brakes failed at a hundred and ninety. Vane built the brakes.'],
    ['mina', 'So this is personal.'],
    ['zayd', "Everything's personal at a hundred and ninety."],
  ]);
  m.objective('Stash the Summit at the Dune Hideout');
  await m.reach('safehouse_dunes', 10, { inVehicle: ctx.car, stopped: true, label: 'Dune Hideout' });
  const hideout = m.place('safehouse_dunes') || { x: -690, z: 1118 };
  await voice.quiet();
  await m.cutscene([
    shotOf(m, ctx.car, { bearing: 0.6, distance: 26, height: 9, look: 1, seconds: 4.5, push: 6, speaker: 'mina', text: 'Good. On the night, everything goes exactly like this.' }),
    shotOf(m, ctx.car, { bearing: 1.9, distance: 7, height: 1.6, look: 1.2, seconds: 3.5, speaker: 'zayd', text: 'Nothing goes exactly like anything.' }),
    { position: { x: hideout.x + 40, y: 14, z: hideout.z + 46 }, lookAt: { x: hideout.x - 120, y: 6, z: hideout.z - 60 }, moveTo: { x: hideout.x + 34, y: 20, z: hideout.z + 40 }, seconds: 4.5, speaker: 'mina', text: "That's why I made three plans. You get to know about one." },
  ]);
}

/** Dahan's verdict on the night, by phone, and the Cover meter it moves. */
async function settleTheCover(ctx) {
  const { m } = ctx;
  const seconds = ctx.gateSeconds || Number(m.flag('rehearsalSeconds')) || 0;
  if (ctx.officersKilled === 0) {
    await m.phone('dahan', [
      ['dahan', 'Every unit came home tonight. Thank you, Karam.'],
      seconds > 0 ? ['dahan', `Door to Gate in ${seconds} seconds. I'll remember that number too.`] : ['dahan', "I'll remember that route too."],
    ]);
    m.badge(8, 'Dahan: every officer went home');
  } else {
    await m.phone('dahan', [
      ['dahan', 'I lost an officer on your route tonight.'],
      ['dahan', "A rehearsal, Karam. Don't make me regret you."],
    ]);
    m.badge(-Math.min(25, 15 + (ctx.officersKilled - 1) * 5), 'An officer died on your route');
  }
}

/** Any officer killed by Zayd during the job counts against him with Dahan. */
function watchForFallenOfficers(ctx) {
  const { m, scope, voice } = ctx;
  scope.on('character:died', (event) => {
    const fallen = event && event.character;
    if (!fallen || (fallen.kind !== 'officer' && fallen.faction !== 'police')) return;
    if (event.source && !killedByPlayer(m, event.source)) return;
    ctx.officersKilled += 1;
    if (ctx.officersKilled === 1) {
      m.notify('An officer is down. Dahan said nobody dies.', 'bad');
      background(m.say([['mina', 'Dust! That was a person, not a cone!']]));
    } else {
      voice.react(MINA_ON_POLICE_HITS, 3);
    }
  });
}

/** Seconds from the lobby door to the Gate that Mina calls "under par". */
const PAR_SECONDS = 90;
/** The getaway Summit's pearl paint. */
const SUMMIT_PEARL = 0xe9e2d0;

const MINA_ON_CRASHES = [
  ['mina', 'That was a lamppost. It had a family.'],
  ['mina', "I'm adding that to the damage column."],
  ['mina', "Faris will feel that in his bones."],
  ['mina', 'Mirrors are for looking in, Dust.'],
  ['mina', "Fine. That's fine. I didn't need that vertebra."],
  ['mina', 'On the night the gold will be in the back. Remember that.'],
];

const MINA_ON_POLICE_HITS = [
  ['mina', "They're on us. Do something rally-ish."],
  ['mina', "Gently! They're only doing their jobs. Badly."],
  ['mina', "That cruiser's going to need a note from its mother."],
  ['dispatch', 'Unit seven disabled. Suspect is ramming. Use caution.'],
];
