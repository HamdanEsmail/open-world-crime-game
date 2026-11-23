// Job 9, Khamsin Rising: the storm comes hours early, so the heist is tonight. In Faris's teal van,
// against the storm front, collect Faris at Haddad Motors, the cutting gear at Hangar 2 and Tavi at
// the docks while the sky turns amber and the city empties, and stage at the Vane Spire. The crew
// talk the whole way; what Zayd tells Faris and Tavi face to face moves the Cover meter.
import {
  spireStage, hangarStage, createCrewVoice, openJobScope, lanePoint, shotOf, overShoulder, twoShot, placePerson,
  playerDistance, fairDriveSeconds, background, strollTo, backInto, buildGearCase, leaveWeatherAfterJob, holdTheClock,
  shieldCast,
} from './finaleSceneHelpers.js';

export const job = {
  id: 'khamsin_rising',
  order: 9,
  title: 'Khamsin Rising',
  giver: 'mina',
  contact: 'contact_mina',
  requires: ['golden_goose'],
  hours: null,
  reward: { money: 2000, rep: 150 },
  briefing: 'The khamsin is arriving hours early, so the Vane job is tonight. Take the van and collect the crew '
    + 'and the gear across the city before the storm closes the roads: Faris at Haddad Motors, the cutting gear '
    + 'at Hangar 2, Tavi at the docks. Then stage at the Vane Spire.',
  async run(m) {
    const scope = openJobScope(m);
    try {
      await runKhamsinRising(m, scope);
    } finally {
      scope.close();
    }
  },
};

/** The four legs of the evening; a retry resumes after the last pickup that was made. */
async function runKhamsinRising(m, scope) {
  const ctx = {
    m,
    scope,
    voice: createCrewVoice(m),
    spire: spireStage(m),
    hangar: hangarStage(m),
    van: null,
    mina: null,
  };
  const from = Math.max(0, STAGES.indexOf(m.resumeFrom));
  ctx.clock = holdTheClock(m, scope, STORM_STEPS[from].hour);
  setTheStorm(ctx, from);

  if (from === 0) {
    await openingAtTheSouk(ctx);
  } else {
    stageTheVan(ctx, from);
  }
  armTheVan(ctx);
  if (from <= 0) {
    await collectFaris(ctx);
    m.checkpoint('faris');
    setTheStorm(ctx, 1);
  }
  if (from <= 1) {
    await loadTheGear(ctx);
    m.checkpoint('gear');
    setTheStorm(ctx, 2);
  }
  if (from <= 2) {
    await collectTavi(ctx);
    m.checkpoint('tavi');
    setTheStorm(ctx, 3);
  }
  await stageAtTheSpire(ctx);
}

/** The storm and the emptying streets, one step per leg. */
function setTheStorm(ctx, leg) {
  const { m } = ctx;
  const step = STORM_STEPS[Math.min(leg, STORM_STEPS.length - 1)];
  ctx.clock.set(step.hour);
  m.setWeather(step.storm, leg === 0 ? 20 : 45);
  m.setTraffic(step.traffic);
  m.setPedestrians(step.people);
}

/** The radio says it first; Mina says it better. */
async function openingAtTheSouk(ctx) {
  const { m } = ctx;
  const souk = m.place('contact_mina') || { x: -260, z: 50, curbX: -260, curbZ: 54.7, heading: Math.PI };
  const park = lanePoint(m, souk.curbX + 10, souk.curbZ, -Math.PI / 2, { kerb: true });
  ctx.van = m.spawnVehicle('sahel_caravan', { x: park.x, z: park.z, heading: park.heading, color: VAN_TEAL });
  const at = m.giver ? m.giver.pos : { x: souk.x, z: souk.z };
  ctx.mina = m.spawnCast('mina', at.x, at.z, souk.heading || Math.PI);
  const zayd = m.game.player.character;
  await m.cutscene([
    { position: { x: souk.x + 30, y: 16, z: souk.z + 40 }, lookAt: { x: souk.x - 40, y: 30, z: souk.z + 260 }, moveTo: { x: souk.x + 24, y: 20, z: souk.z + 36 }, seconds: 5, speaker: 'radio', text: 'Sarab Gold 98.6. Khamsin warning: the wind arrives tonight. Hours early.' },
    overShoulder(m, ctx.mina, zayd, { seconds: 4, speaker: 'mina', text: "Hours early. So it's tonight, Dust. Not Thursday." }),
    overShoulder(m, zayd, ctx.mina, { seconds: 2.8, speaker: 'zayd', text: 'The plan said Thursday.' }),
    overShoulder(m, ctx.mina, zayd, { seconds: 4, side: -1, speaker: 'mina', text: "The plan also said a storm. The storm didn't read the plan." }),
    shotOf(m, ctx.van, { bearing: 2.5, distance: 8.5, height: 2.2, look: 1.1, seconds: 4, slide: 2.5, speaker: 'mina', text: 'Van is out front. Faris, the cutting gear, Tavi, then the Spire.' }),
    twoShot(m, zayd, ctx.mina, { seconds: 3, speaker: 'zayd', text: 'Before the roads close.' }),
    overShoulder(m, ctx.mina, zayd, { seconds: 4, back: 1.0, push: 0.3, speaker: 'mina', text: 'Before nobody can see four people rob a tower. Which is the idea.' }),
  ]);
  m.seat(ctx.van, ctx.mina, 1);
}

/** A retry: the van where the last pickup was made, Mina in the passenger seat. */
function stageTheVan(ctx, from) {
  const { m, hangar } = ctx;
  let spot;
  if (from === 1) {
    const garage = m.place('garage_haddad') || { curbX: 126.4, curbZ: 808.2 };
    spot = lanePoint(m, garage.curbX, garage.curbZ, Math.PI / 2, { kerb: true });
  } else if (from === 2) {
    spot = { x: hangar.apron.x - 8, z: hangar.apron.z - 2, heading: -Math.PI / 2 };
  } else {
    const dock = m.place('contact_tavi') || { curbX: 691.8, curbZ: -400 };
    spot = lanePoint(m, dock.curbX, dock.curbZ, Math.PI, { kerb: true });
  }
  ctx.van = m.spawnVehicle('sahel_caravan', { x: spot.x, z: spot.z, heading: spot.heading, color: VAN_TEAL });
  ctx.mina = m.spawnCast('mina', spot.x + 3, spot.z, 0);
  m.seat(ctx.van, ctx.mina, 1);
  m.playerInto(ctx.van);
}

function armTheVan(ctx) {
  const { m, scope, voice } = ctx;
  m.failIfDestroyed(ctx.van, "The van is wrecked, and the heist with it.");
  shieldCast(scope, ctx.mina);
  scope.on('vehicle:collision', (event) => {
    if (!event || (event.vehicle !== ctx.van && event.other !== ctx.van) || !(event.speed > 7)) return;
    voice.react(CREW_ON_BUMPS, 8);
  });
}

/** One leg of the evening against the storm front: a fair clock from the GPS length of the drive. */
async function driveLeg(ctx, target, objective, label) {
  const { m } = ctx;
  await backInto(m, ctx.van, 'Get back in the van');
  const here = m.game.player.pos;
  const seconds = fairDriveSeconds(m, { x: here.x, z: here.z }, target, 13, 45);
  const clock = m.timer('STORM FRONT', seconds, { reason: 'The khamsin closed the roads before you got there.' });
  m.objective(objective);
  await m.reach(target, 9, { inVehicle: ctx.van, stopped: true, label });
  clock.stop();
}

/** Haddad Motors: Faris climbs in the back with his opinions about engines. */
async function collectFaris(ctx) {
  const { m, voice } = ctx;
  m.objective('Get in the van');
  await m.inVehicle(ctx.van);
  voice.talk([
    ['mina', 'I made a list. It has sub-lists.'],
    ['zayd', 'Of course it does.'],
    ['mina', "One: Faris. Two: the torch. Three: Tavi, who'll complain."],
    ['radio', 'The Corniche is closing to traffic. Lifeguards have gone home.'],
    ['mina', "Look at the sky. It's going the colour of karak."],
  ]);
  const garage = m.place('garage_haddad') || { x: 126.4, z: 803.5, curbX: 126.4, curbZ: 808.2 };
  const kerb = lanePoint(m, garage.curbX, garage.curbZ, Math.PI / 2, { kerb: true });
  await driveLeg(ctx, { x: kerb.x, z: kerb.z }, 'Pick up Faris at Haddad Motors', 'Haddad Motors');

  const faris = m.spawnCast('faris', garage.x - 4, garage.z - 2, Math.PI);
  m.objective('Wait for Faris to climb in');
  voice.talk([
    ['faris', 'Ha! The van! My beautiful ugly van!'],
    ['faris', "An engine knows when it's the big day, Zayd. Listen to her purr."],
    ['zayd', "That's the exhaust, Uncle."],
    ['faris', 'Same thing, at my age.'],
  ]);
  await m.any([m.walkTo(faris, ctx.van.pos.x - Math.sin(ctx.van.heading) * 3.6, ctx.van.pos.z - Math.cos(ctx.van.heading) * 3.6, { pace: 'walk' }), m.seconds(9)]);
  m.remove(faris);
  await voice.quiet();
}

/** Hangar 2: Zayd carries the cutting gear himself, and Faris asks the question he has been saving. */
async function loadTheGear(ctx) {
  const { m, scope, voice, hangar } = ctx;
  voice.talk([
    ['radio', 'Visibility on the Dune Highway is falling. The airfield has grounded all flights.'],
    ['faris', "You know what I'm buying with my share?"],
    ['mina', 'Paying your parts supplier, finally?'],
    ['faris', 'A rally car. A real one. And this one drives it.'],
    ['mina', 'Zayd? Driving? In public? With his face?'],
    ['faris', 'With a helmet. Nobody sees a face in a helmet.'],
  ]);
  const apron = { x: hangar.apron.x - 6, z: hangar.apron.z - 3 };
  await driveLeg(ctx, apron, 'Collect the cutting gear at Hangar 2', 'Hangar 2');

  const crate = { x: hangar.x - hangar.w / 2 - 2.2, z: hangar.z + 9 };
  scope.adopt(buildGearCase(m, crate.x, crate.z, 0.3, 0xe4572e));
  m.objective('Get out and load the cutting gear');
  await m.reach(crate, 2.6, { onFoot: true, label: 'Cutting gear' });
  const loading = m.counter('LOADING', 0, 100);
  let progress = 0;
  await m.until(() => {
    if (playerDistance(m, crate) < 3.6) progress += (m.game.time.dt || 0) * 38;
    loading.set(Math.min(100, Math.round(progress)));
    return progress >= 100;
  });
  loading.clear();

  const zayd = m.game.player.character;
  const faris = m.spawnCast('faris', crate.x - 1.2, crate.z + 3.2, Math.PI);
  placePerson(m, faris, crate.x - 1.2, crate.z + 3.2, Math.PI);
  await m.cutscene([
    overShoulder(m, faris, zayd, { seconds: 3.5, speaker: 'faris', text: 'Careful! That torch cuts steel like butter. Also fingers.' }),
    twoShot(m, faris, zayd, { seconds: 3, speaker: 'faris', text: 'Zayd. After tonight...' }),
    overShoulder(m, faris, zayd, { seconds: 4.5, back: 1.0, push: 0.3, speaker: 'faris', text: 'We race again? You and me, like before? Say it.' }),
  ]);
  m.objective('Answer Faris');
  const answer = await m.choice([
    { id: 'race', key: 'E', text: "We race again, Uncle." },
    { id: 'tonight', key: 'F', text: "Let's get through tonight first." },
  ]);
  m.flag('promisedFarisRace', answer === 'race');
  if (answer === 'race') {
    m.trust(6, 'Faris believes in you');
    voice.talk([
      ['zayd', 'We race again, Uncle.'],
      ['faris', "Ha! I knew it. I'll build her from a bare frame."],
    ]);
  } else {
    m.badge(4, 'You keep your distance');
    voice.talk([
      ['zayd', "Let's get through tonight first."],
      ['faris', '...Of course. Tonight first. Always tonight first.'],
    ]);
  }
  m.objective('Get back in the van');
  strollTo(m, faris, ctx.van.pos.x, ctx.van.pos.z, 'walk');
  await m.inVehicle(ctx.van);
  m.remove(faris);
}

/** The long drive back into the city, the docks, and Tavi asking Zayd to his face. */
async function collectTavi(ctx) {
  const { m, voice } = ctx;
  voice.talk([
    ['radio', 'The port has stopped the cranes. Ships are riding it out offshore.'],
    ['mina', 'Dust. Can I tell you something odd?'],
    ['zayd', 'Is it on a sub-list?'],
    ['mina', 'You drive like a man with nothing to lose.'],
    ['mina', 'But you check your mirrors like a man with everything to lose.'],
    ['zayd', 'Old habit.'],
    ['mina', 'Whose habit?'],
    ['faris', "Leave him, Mina. He's been through the fire."],
    ['mina', 'Everyone has been through the fire, Faris. Some of us brought matches.'],
    ['faris', 'An engine runs hot before it runs true. That is Zayd.'],
    ['mina', "That isn't even a real saying."],
    ['faris', 'It is in Southgate.'],
    ['mina', "Who are you, really, Zayd? When you're not driving?"],
    ['zayd', "I'm always driving."],
    ['radio', 'Stay indoors. Seal your windows. The khamsin has no manners.'],
  ]);
  const dock = m.place('contact_tavi') || { x: 696.5, z: -400, curbX: 691.8, curbZ: -400 };
  const kerb = lanePoint(m, dock.curbX, dock.curbZ, Math.PI, { kerb: true });
  await driveLeg(ctx, { x: kerb.x, z: kerb.z }, 'Pick up Tavi at Mina Docks', 'Mina Docks');

  const meet = { x: dock.x, z: dock.z - 14 };
  const tavi = m.spawnCast('tavi', meet.x, meet.z, Math.PI);
  m.objective('Fetch Tavi from the yard gate');
  await m.reach(tavi, 3.2, { onFoot: true, label: 'Tavi' });
  const zayd = m.game.player.character;
  await m.cutscene([
    overShoulder(m, tavi, zayd, { seconds: 3, speaker: 'tavi', text: "You're late. And it's raining sand." }),
    overShoulder(m, tavi, zayd, { seconds: 4, side: -1, speaker: 'tavi', text: "A cop car sat outside Haddad's last week. Two hours. Watching." }),
    twoShot(m, tavi, zayd, { seconds: 4, speaker: 'tavi', text: "So I'm asking you to your face, Dust. Who are you?" }),
  ]);
  m.objective('Answer Tavi');
  const answer = await m.choice([
    { id: 'driver', key: 'E', text: 'Just the driver.' },
    { id: 'story', key: 'F', text: 'The man Vane robbed of everything.' },
  ]);
  m.flag('toldTaviTheStory', answer === 'story');
  if (answer === 'driver') {
    m.badge(5, 'You kept your cover tight');
    m.trust(-3, 'Tavi is not convinced');
    voice.talk([
      ['zayd', 'Just the driver.'],
      ['tavi', 'Just the driver. Sure.'],
      ['mina', "He is just the driver, Tavi. He's very good at it."],
      ['tavi', "We'll see."],
    ]);
  } else {
    m.trust(7, 'The crew hears your story');
    m.badge(-4, 'You are getting close to them');
    voice.talk([
      ['zayd', "Vane's people rigged my brakes. Then they bought the stewards."],
      ['zayd', 'I lost my licence, my name and my house.'],
      ['tavi', '...Huh. So you want him worse than I do.'],
      ['mina', 'Now that, I believe.'],
    ]);
  }
  m.objective('Get back in the van');
  strollTo(m, tavi, ctx.van.pos.x, ctx.van.pos.z, 'run');
  await m.inVehicle(ctx.van);
  m.remove(tavi);
}

/** Into the dead city to the Vane Spire; the crew steps out into the storm; Dahan calls. */
async function stageAtTheSpire(ctx) {
  const { m, voice, spire } = ctx;
  voice.talk([
    ['radio', 'All roads closing at nightfall. Stay home. Stay inside.'],
    ['tavi', 'Guards change at nine. Vane keeps eight on the plaza.'],
    ['mina', "Eight on the plaza, two in the lobby, none in the lift. The lift's mine."],
    ['faris', 'And the torch is mine. Nobody touches the torch.'],
    ['tavi', 'Nobody wants to touch your torch, Faris.'],
    ['faris', 'Good.'],
    ['mina', 'Dust. Whatever happens up there, you get us out.'],
    ['zayd', "That's the job."],
  ]);
  const kerb = lanePoint(m, spire.curb.x + 6, spire.curb.z, -Math.PI / 2, { kerb: true });
  await driveLeg(ctx, { x: kerb.x, z: kerb.z }, 'Stage the van at the Vane Spire', 'Vane Spire');
  await voice.quiet();

  // The crew steps out onto the pavement on the van's kerb side (its right, parked as it is).
  const van = ctx.van;
  const side = (along, across) => ({
    x: van.pos.x + Math.sin(van.heading) * along - Math.cos(van.heading) * across,
    z: van.pos.z + Math.cos(van.heading) * along + Math.sin(van.heading) * across,
  });
  const a = side(-1, 2.7);
  const b = side(-3.4, 2.9);
  const c = side(1.6, 3.1);
  placePerson(m, ctx.mina, a.x, a.z, Math.PI);
  const faris = m.spawnCast('faris', b.x, b.z, Math.PI);
  const tavi = m.spawnCast('tavi', c.x, c.z, Math.PI);
  ctx.clock.set(17.9);
  m.setWeather(0.66, 6);
  leaveWeatherAfterJob(m, 0.62, 2);
  await m.cutscene([
    { position: { x: spire.curb.x + 34, y: 2, z: spire.curb.z + 26 }, lookAt: { x: spire.x, y: 210, z: spire.z }, moveTo: { x: spire.curb.x + 28, y: 3, z: spire.curb.z + 20 }, seconds: 5, speaker: 'mina', text: 'Three hundred metres of glass, and nobody can see it.' },
    twoShot(m, ctx.mina, faris, { seconds: 3.5, speaker: 'faris', text: 'Like a mirage. Sarab.' }),
    shotOf(m, tavi, { bearing: 2.6, distance: 4, height: 1.7, look: 1.55, seconds: 3, speaker: 'tavi', text: "Mirages don't have guards." }),
    overShoulder(m, ctx.mina, m.game.player.character, { seconds: 4, speaker: 'mina', text: 'Tonight they do. Ten minutes. Breathe. Then we go in.' }),
  ]);
  m.objective('Answer the phone');
  await m.phone('dahan', [
    ['dahan', "Karam. The storm moved it up, didn't it?"],
    ['zayd', 'Tonight.'],
    ['dahan', 'My units are standing by, out of sight. When you call, we come.'],
    ['dahan', 'Tonight, then. Whatever you decide, decide it before the vault.'],
  ]);
  background(m.say([['mina', 'Dust. When you are ready. I will be at the door.']]));
}

/** Retry points, in the order the evening passes them. */
const STAGES = [null, 'faris', 'gear', 'tavi'];

/** The khamsin rising leg by leg, and the city emptying with it. */
const STORM_STEPS = [
  { hour: 15.9, storm: 0.12, traffic: 0.85, people: 0.8 },
  { hour: 16.4, storm: 0.26, traffic: 0.62, people: 0.5 },
  { hour: 16.9, storm: 0.42, traffic: 0.4, people: 0.3 },
  { hour: 17.4, storm: 0.58, traffic: 0.2, people: 0.12 },
];

const VAN_TEAL = 0x1ba39c;

const CREW_ON_BUMPS = [
  ['mina', 'The gear is in the back, Dust. The fragile gear.'],
  ['faris', 'Gently! She is older than you!'],
  ['mina', 'I felt that in my sub-lists.'],
  ['faris', 'Ya Allah, the suspension!'],
  ['mina', "Visibility is bad. That's not an excuse, that's a warning."],
];
