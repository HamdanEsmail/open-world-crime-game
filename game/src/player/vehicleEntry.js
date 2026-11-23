// Getting into and out of vehicles: finding the car the player is facing, taking an empty one,
// pulling a driver out of theirs (a carjacking, which is a crime), and stepping or bailing out.

/** The usable vehicle nearest the character's reach, or null. */
export function findVehicleToEnter(game, character) {
  const vehicles = game.vehicles ? game.vehicles.list : null;
  if (!vehicles) return null;
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];
    if (vehicle.wrecked) continue;
    const dx = vehicle.pos.x - character.pos.x;
    const dz = vehicle.pos.z - character.pos.z;
    const reach = vehicle.spec.length * 0.5 + 2.4;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > reach * reach) continue;
    if (Math.abs(vehicle.speed) > 9) continue;
    // Prefer what the player is facing.
    const facing = (Math.sin(character.heading) * dx + Math.cos(character.heading) * dz) / (Math.sqrt(distanceSq) + 0.001);
    const score = distanceSq * (1.4 - facing * 0.4);
    if (score < bestScore) {
      bestScore = score;
      best = vehicle;
    }
  }
  return best;
}

/**
 * Put the player at the wheel. An occupied car is a carjacking: the driver is thrown out and the
 * theft is reported; a police car is a worse one. options: { instant, quiet }.
 */
export function enterOrStealVehicle(game, player, vehicle, options) {
  const character = player.character;
  const victim = vehicle.driver && vehicle.driver !== character ? vehicle.driver : null;
  if (victim) {
    game.characters.exitVehicle(victim, { thrown: true });
    if (victim.ai) victim.ai.carjacked = true;
    game.events.emit('vehicle:carjacked', { vehicle, victim, by: character });
  }
  const police = vehicle.faction === 'police';
  if (!options.quiet && !vehicle.tags.owned && (victim || police || !vehicle.tags.stolen)) {
    const type = police ? 'policeCarTheft' : victim ? 'carjacking' : 'carTheft';
    game.events.emit('crime', { type, x: vehicle.pos.x, z: vehicle.pos.z, victim, vehicle });
    game.economy?.stats?.add?.('vehiclesStolen', 1);
  }
  if (!vehicle.tags.owned) vehicle.tags.stolen = true;
  game.characters.enterVehicle(character, vehicle, 0, { instant: !!options.instant });
  vehicle.driver = character;
  vehicle.isPlayer = true;
  vehicle.parked = false;
  vehicle.locked = false;
  vehicle.ai = null;
  vehicle.controls.handbrake = false;
  player.vehicle = vehicle;
  player.state = 'driving';
  if (game.cameraRig) game.cameraRig.lookBehind = false;
  game.events.emit('player:enteredVehicle', { vehicle });
  if (!options.quiet) game.audio?.play?.('doorClose', { x: vehicle.pos.x, y: 1, z: vehicle.pos.z });
}

/** Step out (or bail out at speed, which hurts). options: { instant, thrown, quiet }. */
export function leaveVehicle(game, player, options) {
  const vehicle = player.vehicle;
  if (!vehicle) return;
  const character = player.character;
  const controls = vehicle.controls;
  controls.throttle = 0;
  controls.steer = 0;
  controls.brake = 0;
  controls.horn = false;
  controls.siren = false;
  controls.handbrake = !options.thrown;
  game.characters.exitVehicle(character, { instant: !!options.instant, thrown: !!options.thrown });
  if (vehicle.driver === character) vehicle.driver = null;
  vehicle.isPlayer = false;
  vehicle.tags.lastPlayerUse = game.time.elapsed;
  player.vehicle = null;
  player.state = 'onFoot';
  if (game.cameraRig) game.cameraRig.lookBehind = false;
  if (!options.quiet) {
    game.events.emit('player:exitedVehicle', { vehicle });
    game.audio?.play?.('doorOpen', { x: vehicle.pos.x, y: 1, z: vehicle.pos.z });
  }
}
