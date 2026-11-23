// The opening of a new game: Port Sarab at golden hour in four slow shots (the skyline from the
// gulf, the Vane Spire, the Grand Souk, Haddad Motors) while Captain Dahan and Zayd set up the
// undercover job in under thirty seconds. Then Zayd stands outside his flat in Al Wadi with his
// first lead: Uncle Faris has work, and the GPS points the way to the F on the map.

/** The hour the story opens at: the sun low and gold over the gulf. */
const OPENING_HOUR = 17.4;

/**
 * Play the opening and leave the player at the flat with the first hint.
 * @returns {Promise<void>} resolves when the player has control
 */
export async function startNewGameIntro(game) {
  const flat = game.city && game.city.place ? game.city.place('safehouse_flat') : null;
  if (game.sky && typeof game.sky.setHour === 'function') game.sky.setHour(OPENING_HOUR);
  else game.time.hour = OPENING_HOUR;
  game.weather?.clear?.(0);
  const player = game.player;
  if (flat && player && player.character) player.teleport(flat.x, flat.z, flat.heading + Math.PI);
  const director = game.cutscenes;
  if (director && typeof director.play === 'function') {
    await director.play(openingShots(game), { owner: 'intro' });
  }
  if (flat && player && player.character) player.teleport(flat.x, flat.z, flat.heading + Math.PI);
  game.missions?.guideTo?.('shakedown_run');
  game.events.emit('notify', { text: 'Uncle Faris has work. Find the F on your map.', kind: 'info', seconds: 9 });
  game.events.emit('story:introFinished', {});
}

/** Four places, six lines, about twenty-eight seconds. */
export function openingShots(game) {
  const spire = landmarkAt(game, 'vaneSpire', -63, -400);
  const souk = landmarkAt(game, 'grandSouk', -260, -27);
  const garage = landmarkAt(game, 'haddadMotors', 103, 771);
  return [
    {
      position: { x: spire.x + 330, y: 26, z: -1010 },
      moveTo: { x: spire.x + 210, y: 34, z: -985 },
      lookAt: { x: spire.x, y: 110, z: spire.z },
      seconds: 6,
      fov: 52,
      speaker: 'dahan',
      text: 'Port Sarab. Glass towers, gold sand, and other people\'s money.',
    },
    {
      position: { x: spire.x + 50, y: 2.4, z: spire.z + 74 },
      moveTo: { x: spire.x + 36, y: 4.5, z: spire.z + 60 },
      lookAt: { x: spire.x, y: 190, z: spire.z },
      seconds: 6,
      fov: 58,
      speaker: 'dahan',
      text: 'Idris Vane owns the tallest one. We think he launders gold through it.',
    },
    {
      position: { x: souk.x - 52, y: 16, z: souk.z + 58 },
      moveTo: { x: souk.x - 26, y: 14, z: souk.z + 52 },
      lookAt: { x: souk.x + 6, y: 2, z: souk.z - 6 },
      seconds: 4.3,
      speaker: 'dahan',
      text: 'A crew is planning to rob him. I want them, and his ledgers.',
    },
    {
      position: { x: souk.x - 26, y: 14, z: souk.z + 52 },
      moveTo: { x: souk.x - 2, y: 12.5, z: souk.z + 47 },
      lookAt: { x: souk.x + 12, y: 2, z: souk.z - 8 },
      seconds: 4.2,
      cut: 'hard',
      speaker: 'zayd',
      text: 'So you need a getaway driver nobody would ever trust.',
    },
    {
      position: { x: garage.x + 58, y: 7, z: garage.z + 62 },
      moveTo: { x: garage.x + 34, y: 4.6, z: garage.z + 50 },
      lookAt: { x: garage.x - 4, y: 3, z: garage.z + 8 },
      seconds: 4.4,
      speaker: 'dahan',
      text: 'A banned champion with nothing to lose. Faris Haddad vouched for you.',
    },
    {
      position: { x: garage.x + 34, y: 4.6, z: garage.z + 50 },
      moveTo: { x: garage.x + 22, y: 3.8, z: garage.z + 44 },
      lookAt: { x: garage.x - 8, y: 3, z: garage.z + 6 },
      seconds: 3.6,
      cut: 'hard',
      speaker: 'zayd',
      text: 'He taught me to drive. Leave him out of this.',
    },
  ];
}

function landmarkAt(game, id, x, z) {
  const list = (game.city && game.city.landmarks) || [];
  const found = list.find((item) => item.id === id);
  return found ? { x: found.x, z: found.z } : { x, z };
}
