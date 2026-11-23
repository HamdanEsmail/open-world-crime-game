// Getting into and out of vehicles: finding the car the player is facing, running to its door,
// taking an empty one or pulling the driver out of theirs (a carjacking, which is a crime), taking
// the wheel once seated, and stepping or bailing out.

/** The usable vehicle nearest the character's reach, or null. */
export function findVehicleToEnter(game, character) {
  const vehicles = game.vehicles ? game.vehicles.list : null;
  if (!vehicles) return null;
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];
    if (vehicle.wrecked || vehicle.sunk || vehicle.hidden) continue;
    const dx = vehicle.pos.x - character.pos.x;
    const dz = vehicle.pos.z - character.pos.z;
    const reach = vehicle.spec.length * 0.5 + 2.6;
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
 * Start taking a vehicle: the player runs to the driver's door and climbs in (the character system
 * plays it, pulling out whoever is at the wheel). An occupied car is a carjacking and is reported; a
 * police car is a worse one. options: { instant, quiet }. The wheel is taken in takeTheWheel().
 */
export function enterOrStealVehicle(game, player, vehicle, options) {
  const character = player.character;
  const victim = vehicle.driver && vehicle.driver !== character ? vehicle.driver : null;
  const police = vehicle.faction === 'police';
  if (!options.quiet && !vehicle.tags.owned && (victim || police || !vehicle.tags.stolen)) {
    const type = police ? 'policeCarTheft' : victim ? 'carjacking' : 'carTheft';
    game.events.emit('crime', { type, x: vehicle.pos.x, z: vehicle.pos.z, victim, vehicle });
    game.economy?.stats?.add?.('vehiclesStolen', 1);
  }
  // Whoever was driving loses the car now: it stops where it is and waits for the thief.
  vehicle.ai = null;
  const controls = vehicle.controls;
  controls.throttle = 0;
  controls.steer = 0;
  controls.brake = 1;
  controls.handbrake = true;
  controls.horn = false;
  if (victim) {
    if (victim.ai) victim.ai.carjacked = true;
    game.events.emit('vehicle:carjacked', { vehicle, victim, by: character });
  }
  if (!vehicle.tags.owned) vehicle.tags.stolen = true;
  player.entering = vehicle;
  player.enteringSince = game.time.elapsed;
  game.characters.enterVehicle(character, vehicle, 0, { instant: !!options.instant });
  // Seated at once: take the wheel now, unless the "seated" event already did.
  if (options.instant && player.entering === vehicle) takeTheWheel(game, player, vehicle, options);
}

/** The player is in the seat: the vehicle is theirs to drive. */
export function takeTheWheel(game, player, vehicle, options = {}) {
  player.entering = null;
  vehicle.isPlayer = true;
  vehicle.parked = false;
  vehicle.locked = false;
  vehicle.ai = null;
  vehicle.controls.handbrake = false;
  vehicle.controls.brake = 0;
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
