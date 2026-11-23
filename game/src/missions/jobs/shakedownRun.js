// Job 1, "Shakedown Run": Uncle Faris hands Zayd the keys to his Kestrel Sirocco GT and times him
// round Southgate, out through the Port Sarab Gate onto the Dune Highway, a handbrake turn, and home.
// It teaches the car, the handbrake and the minimap; afterwards Captain Dahan makes her first call.

export const job = {
  id: 'shakedown_run',
  order: 1,
  title: 'Shakedown Run',
  giver: 'faris',
  contact: 'contact_faris',
  requires: [],
  hours: null,
  reward: { money: 500, rep: 60 },
  hint: 'Uncle Faris has work. Find the F on your map.',
  briefing: 'Uncle Faris vouched for you to the crew. Now he wants to see it for himself: his Kestrel Sirocco GT, a timed lap of Southgate, out through the Port Sarab Gate onto the Dune Highway, and home to Haddad Motors.',

  async run(m) {
    const garage = m.place('contact_faris');
    const bay = { x: garage.curbX + 3, z: garage.curbZ + 1.4 };
    m.clearArea(bay.x, bay.z, 14);
    const car = parkTheSirocco(m, bay);

    if (m.resumeFrom === 'lap') {
      m.playerInto(car);
    } else {
      const faris = m.giver || m.spawnCast('faris', garage.x, garage.z, garage.heading + Math.PI);
      m.teleportPlayer(garage.x + 1.6, garage.z + 2.6, Math.PI + 0.55);
      turnToward(faris, m.player.character);
      await m.cutscene(introShots(garage, car, faris, m.player.character));
      m.objective('Get in the Sirocco');
      m.say([['faris', 'Mind the paint. She is older than your career.']]);
      await m.inVehicle(car);
      m.checkpoint('lap');
    }

    m.failIfDestroyed(car, 'The Sirocco is scrap. Faris will never forgive you.');
    m.failIfLeft(car, 150, 'You walked away from Faris\'s car.');
    m.objective('Hit every checkpoint before the clock runs out');
    m.notify('Follow the gold line on the minimap. SPACE is the handbrake.', 'info');
    m.say([['faris', 'Clock starts now. Out the Gate, round the highway, home.']]);
    const clock = m.timer('TIME', LAP_SECONDS, { reason: 'Too slow. Faris has seen enough.' });
    m.on('mission:checkpoint', (event) => {
      const lines = LAP_BANTER[event.index];
      if (lines) m.say(lines);
      if (event.index === TURNAROUND) m.notify('Handbrake turn: steer hard and hold SPACE.', 'info');
    });
    await m.checkpoints(LAP, { radius: 11 });
    const spare = clock.remaining;
    clock.stop();

    m.objective('Bring her home to Haddad Motors');
    await m.reach(bay, 8, { inVehicle: car, stopped: true, label: 'Haddad Motors' });

    const condition = car.health / Math.max(1, car.maxHealth);
    if (spare > 25) m.trust(6, 'Faris is impressed');
    else m.trust(3, 'Faris nods');
    if (condition < 0.6) m.trust(-2, 'Faris counts the dents');

    const faris = m.giver || m.spawnCast('faris', garage.x, garage.z, garage.heading + Math.PI);
    const outro = m.cutscene(outroShots(garage, bay, spare, faris, m.player.character));
    await m.seconds(0.24);
    m.teleportPlayer(garage.x + 1.6, garage.z + 2.6, Math.PI + 0.55);
    turnToward(faris, m.player.character);
    await outro;

    m.callAfter('dahan', [
      ['dahan', 'You are in. Don\'t get comfortable.'],
      ['dahan', 'Mina Okoro runs a phone stall in the Grand Souk. Go see her.'],
      ['zayd', 'And if she asks why a champion drives for thieves?'],
      ['dahan', 'Tell her the truth, Karam. You are broke.'],
    ], 7);
  },
};

/** Have one person face another while they talk. */
function turnToward(person, other) {
  if (!person || !other || !person.intent) return;
  person.intent.faceYaw = Math.atan2(other.pos.x - person.pos.x, other.pos.z - person.pos.z);
  person.intent.gesture = 'talk';
}

/** Faris's coral Sirocco, parked in the bay outside his garage facing west toward the Gate. */
function parkTheSirocco(m, bay) {
  return m.spawnVehicle('kestrel_sirocco', { x: bay.x, z: bay.z, heading: -Math.PI / 2, color: 0xe4572e, parked: true });
}

function introShots(garage, car, faris, zayd) {
  const fx = garage.x;
  const fz = garage.z;
  const lookFaris = faris || { x: fx, y: 1.6, z: fz };
  const lookZayd = zayd || { x: fx + 1.6, y: 1.6, z: fz + 2.6 };
  return [
    { position: { x: fx + 26, y: 4.2, z: fz + 12 }, moveTo: { x: fx + 17, y: 3.4, z: fz + 10.5 }, lookAt: { x: fx, y: 1.8, z: fz + 2 }, seconds: 4.2, speaker: 'faris', text: 'Dust Karam. Thinner, poorer, same scowl.' },
    { position: { x: fx - 1.1, y: 1.8, z: fz - 1.5 }, moveTo: { x: fx - 0.9, y: 1.78, z: fz - 1.2 }, lookAt: lookZayd, seconds: 2.6, speaker: 'zayd', text: 'Hello, Uncle.' },
    { position: { x: fx + 3.4, y: 1.8, z: fz + 4.8 }, moveTo: { x: fx + 2.8, y: 1.75, z: fz + 4.0 }, lookAt: lookFaris, seconds: 4.0, speaker: 'faris', text: 'Mina wants proof the hands still work. So do I.' },
    { position: { x: car.pos.x - 7, y: 1.0, z: car.pos.z + 4.5 }, moveTo: { x: car.pos.x - 3.5, y: 0.8, z: car.pos.z + 5 }, lookAt: car, seconds: 4.6, fov: 50, speaker: 'faris', text: 'Southgate, out the Gate, round the Dune Highway and home.' },
    { position: { x: fx + 2.6, y: 1.7, z: fz + 4.2 }, moveTo: { x: fx + 2.2, y: 1.7, z: fz + 3.6 }, lookAt: lookFaris, seconds: 4.0, speaker: 'faris', text: 'An engine forgives you. A clock never does.' },
  ];
}

function outroShots(garage, bay, spare, faris, zayd) {
  const fx = garage.x;
  const fz = garage.z;
  const lookFaris = faris || { x: fx, y: 1.6, z: fz };
  const lookZayd = zayd || { x: fx + 1.6, y: 1.6, z: fz + 2.6 };
  const verdict = spare > 25 ? 'Two seconds slower than you were. Still the best in Sarab.' : 'Slower than you were. The ban made you careful.';
  return [
    { position: { x: bay.x - 12, y: 2.8, z: bay.z + 7 }, moveTo: { x: bay.x - 8, y: 2.4, z: bay.z + 6 }, lookAt: lookFaris, seconds: 4.4, speaker: 'faris', text: verdict },
    { position: { x: fx - 1.1, y: 1.8, z: fz - 1.5 }, moveTo: { x: fx - 0.9, y: 1.78, z: fz - 1.2 }, lookAt: lookZayd, seconds: 3.2, speaker: 'zayd', text: 'Two seconds is a lot of money, Uncle.' },
    { position: { x: fx + 3.2, y: 1.8, z: fz + 4.6 }, moveTo: { x: fx + 2.6, y: 1.75, z: fz + 3.9 }, lookAt: lookFaris, seconds: 4.2, speaker: 'faris', text: 'Mina will want you now. Keep your engine warm and your mouth shut.' },
  ];
}

/** Seconds on the clock for the lap. */
const LAP_SECONDS = 115;
/** The checkpoint after which the car must be turned round on the highway. */
const TURNAROUND = 4;

/** West to the Gate, out along the Dune Highway, a turnaround, back in, and round Faris's block. */
const LAP = [
  { x: 40, z: 822 },
  { x: 36, z: 900 },
  { x: 55, z: 1030 },
  { x: 175, z: 1150 },
  { x: 60, z: 1042 },
  { x: 44, z: 900 },
  { x: 40, z: 630 },
  { x: 232, z: 620 },
  { x: 240, z: 812 },
];

/** What Faris says on the phone as each checkpoint falls (by how many are done). */
const LAP_BANTER = {
  1: [['faris', 'Left for the Gate. Feel her pull? That is love.']],
  2: [['faris', 'The Port Sarab Gate. Every champion leaves through it once.']],
  3: [['faris', 'Open her up. The highway forgives everything but fear.']],
  4: [['faris', 'Now turn her round. Handbrake, then throttle. Like old times.']],
  5: [['faris', 'Ha! The Wadi Rally never saw a turn that clean.']],
  6: [['zayd', 'She drifts left under braking.'], ['faris', 'So did you. Now bring her home.']],
  7: [['faris', 'Oasis Street. Mind the karak sellers.']],
  8: [['faris', 'Last corner. Do not shame me now.']],
};
