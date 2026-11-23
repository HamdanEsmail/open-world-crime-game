// How Port Sarab's drivers react to trouble: pulling over for a siren coming up behind, flooring it
// or bailing out and running when shots ring out or something blows up, speeding off or climbing out
// to shake a fist when the player rams them, running from a carjacking, and leaving a burning wreck.

/** A siren within this distance behind a driver makes it pull over. */
const SIREN_RANGE = 70;
const GUNFIRE_RANGE = 60;
const GUNFIRE_HIT_RANGE = 26;
const EXPLOSION_RANGE = 90;
/** Closing speed (m/s) of a hit from the player that counts as being rammed rather than nudged. */
const RAM_SPEED = 4;
/** The arm-waving the angry driver makes at the player. */
const ANGRY_GESTURE = 'wave';

/**
 * Build the reactions of traffic drivers to what happens around them.
 * @param {Object} game
 * @param {Object} traffic   the traffic system (drivers, fleeing, stats, release, isVisible)
 * @param {Object} driverAI  trafficDriverAI (to re-plan a fleeing driver's route)
 */
export function createTrafficReactions(game, traffic, driverAI) {
  const fleeing = traffic.fleeing;
  let sirenTimer = 0;

  game.events.on('shot:fired', onGunfire);
  game.events.on('explosion', onExplosion);
  game.events.on('vehicle:collision', onCollision);
  game.events.on('vehicle:carjacked', onCarjacked);
  game.events.on('player:enteredVehicle', onPlayerTookVehicle);
  game.events.on('vehicle:onFire', onBurning);
  game.events.on('vehicle:destroyed', onBurning);

  /** Each frame: sirens behind, drivers pulling over to get out, angry drivers, people running away. */
  function update(dt) {
    sirenTimer -= dt;
    if (sirenTimer <= 0) {
      sirenTimer = 0.2;
      checkSirens();
    }
    const list = traffic.drivers;
    for (let i = 0; i < list.length; i += 1) {
      const state = list[i];
      if (state.mode === 'halt') finishHalt(state);
      else if (state.mode === 'confront') updateConfront(state, dt);
      else if (state.mode !== 'abandoned' && (state.vehicle.wrecked || (state.driver && state.driver.alive === false))) {
        abandonCar(state, state.vehicle.pos.x, state.vehicle.pos.z);
      }
    }
    updateFleeing(dt);
  }

  /**
   * Trouble at (x, z): drive off fast away from it (ignoring the lights), or stop and run for it on
   * foot. Slow cars, and cars with the trouble just ahead, are more likely to be abandoned.
   */
  function panic(state, x, z) {
    if (state.mode === 'abandoned') return;
    if (state.mode === 'confront') {
      abandonCar(state, x, z);
      return;
    }
    state.threatX = x;
    state.threatZ = z;
    if (state.mode === 'flee') {
      state.modeTime = Math.max(state.modeTime, 10);
      return;
    }
    if (state.mode === 'halt') return;
    const vehicle = state.vehicle;
    const dx = x - vehicle.pos.x;
    const dz = z - vehicle.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const ahead = dx * Math.sin(vehicle.heading) + dz * Math.cos(vehicle.heading) > 0;
    let bail = 0.22;
    if (vehicle.speed < 5) bail += 0.25;
    if (ahead && distance < 30) bail += 0.25;
    if (distance < 14) bail += 0.15;
    if (state.driver && Math.random() < bail) {
      state.mode = 'halt';
      state.haltReason = 'bail';
      return;
    }
    state.mode = 'flee';
    state.modeTime = 14 + Math.random() * 9;
    state.hornTime = 0.6 + Math.random();
    if (state.phase === 0 && !state.committed) driverAI.choosePath(state, null);
  }

  /** Everyone gets out and runs from (fromX, fromZ); the car is left where it stands. */
  function abandonCar(state, fromX, fromZ) {
    const vehicle = state.vehicle;
    const characters = game.characters;
    const driver = state.driver;
    const passenger = state.passenger;
    if (driver && driver.alive !== false) {
      if (driver.vehicle === vehicle && characters && characters.exitVehicle) characters.exitVehicle(driver, {});
      makeFlee(driver, fromX, fromZ, 9 + Math.random() * 7);
      state.driver = null;
    }
    if (passenger && passenger.alive !== false) {
      if (passenger.vehicle === vehicle && characters && characters.exitVehicle) characters.exitVehicle(passenger, {});
      makeFlee(passenger, fromX, fromZ, 9 + Math.random() * 7);
      state.passenger = null;
    }
    if (vehicle.driver && vehicle.driver.alive !== false && !vehicle.isPlayer && game.vehicles.setDriver) game.vehicles.setDriver(vehicle, null);
    state.mode = 'abandoned';
    state.modeTime = 0;
    state.offsetTarget = 0;
    vehicle.controls.horn = false;
  }

  /** Hand a person over to running away from (fromX, fromZ) for a while; then they are tidied away out of sight. */
  function makeFlee(character, fromX, fromZ, seconds) {
    if (!character) return;
    for (let i = 0; i < fleeing.length; i += 1) {
      if (fleeing[i].character === character) {
        fleeing[i].fromX = fromX;
        fleeing[i].fromZ = fromZ;
        fleeing[i].duration = Math.max(fleeing[i].duration, fleeing[i].time + seconds);
        return;
      }
    }
    const record = { system: 'traffic', role: 'fleeing', character, fromX, fromZ, time: 0, duration: seconds, swerve: 0, wobble: Math.random() * 6.28 };
    character.ai = record;
    if (character.intent) character.intent.gesture = null;
    fleeing.push(record);
  }

  /** A driver who has pulled up for a reason: once stopped, bail out or climb out to have a word. */
  function finishHalt(state) {
    const vehicle = state.vehicle;
    if (Math.abs(vehicle.speed) > 0.6) return;
    if (state.haltReason === 'confront' && state.driver && state.driver.vehicle === vehicle && game.characters && game.characters.exitVehicle) {
      game.characters.exitVehicle(state.driver, {});
      if (vehicle.driver === state.driver && game.vehicles.setDriver) game.vehicles.setDriver(vehicle, null);
      state.driver.ai = { system: 'traffic', role: 'angry', car: state };
      state.mode = 'confront';
      state.confrontStep = 0;
      state.modeTime = 0;
      return;
    }
    abandonCar(state, state.threatX, state.threatZ);
  }

  /** Out of the car, facing the player, waving an arm; then back in and on the way. */
  function updateConfront(state, dt) {
    const driver = state.driver;
    const vehicle = state.vehicle;
    state.modeTime += dt;
    if (!driver || driver.alive === false || !game.characters) {
      abandonCar(state, vehicle.pos.x, vehicle.pos.z);
      return;
    }
    const intent = driver.intent;
    if (state.confrontStep === 0) {
      if (state.modeTime > 1.2) state.confrontStep = 1;
    } else if (state.confrontStep === 1) {
      const target = game.player && game.player.pos;
      if (intent) {
        intent.moveX = 0;
        intent.moveZ = 0;
        intent.gesture = ANGRY_GESTURE;
        if (target) intent.faceYaw = Math.atan2(target.x - driver.pos.x, target.z - driver.pos.z);
      }
      if (state.modeTime > 4.8) {
        if (intent) {
          intent.gesture = null;
          intent.faceYaw = null;
        }
        game.characters.enterVehicle(driver, vehicle, 0, {});
        state.confrontStep = 2;
      }
    } else if (driver.vehicle === vehicle || state.modeTime > 11) {
      if (driver.vehicle !== vehicle) game.characters.enterVehicle(driver, vehicle, 0, { instant: true });
      if (vehicle.driver !== driver && game.vehicles.setDriver) game.vehicles.setDriver(vehicle, driver);
      driver.ai = { system: 'traffic', role: 'driver', car: state };
      state.mode = 'cruise';
      state.offsetTarget = 0;
      state.hornTime = 0.7;
    }
  }

  /** Any vehicle with its siren on, closing in from behind within range: pull over and slow down. */
  function checkSirens() {
    const vehicles = game.vehicles ? game.vehicles.list : null;
    if (!vehicles) return;
    const list = traffic.drivers;
    for (let v = 0; v < vehicles.length; v += 1) {
      const siren = vehicles[v];
      if (!siren.controls.siren || siren.wrecked) continue;
      for (let i = 0; i < list.length; i += 1) {
        const state = list[i];
        if (state.mode !== 'cruise' && state.mode !== 'yield') continue;
        const car = state.vehicle;
        if (car === siren) continue;
        const rx = siren.pos.x - car.pos.x;
        const rz = siren.pos.z - car.pos.z;
        if (rx * rx + rz * rz > SIREN_RANGE * SIREN_RANGE) continue;
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        const along = rx * fx + rz * fz;
        const across = rz * fx - rx * fz;
        if (along > -3 || across > 10 || across < -10) continue;
        const closing = siren.vel.x * fx + siren.vel.z * fz - car.speed;
        if (closing > 0.5 || along > -25) {
          state.mode = 'yield';
          state.modeTime = 2.6;
        }
      }
    }
  }

  /** People running from trouble: away from it, swerving round what stops them; tidied up out of sight. */
  function updateFleeing(dt) {
    const pop = game.config.population;
    const focus = traffic.focus;
    for (let i = fleeing.length - 1; i >= 0; i -= 1) {
      const record = fleeing[i];
      const person = record.character;
      if (!person || person.ai !== record) {
        fleeing.splice(i, 1);
        continue;
      }
      record.time += dt;
      const dx = person.pos.x - focus.x;
      const dz = person.pos.z - focus.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const done = record.time > record.duration + 3;
      if ((done || person.alive === false) && ((distance > 35 && !traffic.isVisible(person.pos.x, person.pos.z, 1.5)) || distance > pop.despawnRadius)) {
        if (game.characters && game.characters.despawn) game.characters.despawn(person);
        fleeing.splice(i, 1);
        continue;
      }
      if (person.alive === false || person.vehicle || !person.intent) continue;
      let ax = person.pos.x - record.fromX;
      let az = person.pos.z - record.fromZ;
      const length = Math.sqrt(ax * ax + az * az);
      if (length > 0.01) {
        ax /= length;
        az /= length;
      } else {
        ax = Math.sin(record.wobble);
        az = Math.cos(record.wobble);
      }
      const moving = person.vel ? Math.sqrt(person.vel.x * person.vel.x + person.vel.z * person.vel.z) : 1;
      if (record.time > 1.2 && moving < 0.4) record.swerve += dt * 2.2;
      const turn = record.swerve + Math.sin(record.time * 0.8 + record.wobble) * 0.35;
      const s = Math.sin(turn);
      const c = Math.cos(turn);
      const intent = person.intent;
      intent.moveX = ax * c + az * s;
      intent.moveZ = az * c - ax * s;
      intent.pace = record.time < record.duration * 0.65 ? 'sprint' : record.time < record.duration ? 'run' : 'walk';
      intent.gesture = null;
      intent.faceYaw = null;
      intent.aim = false;
      intent.fire = false;
    }
  }

  function onGunfire(event) {
    if (!event) return;
    reactToTrouble(event.x, event.z, GUNFIRE_RANGE, event.hitX, event.hitZ, GUNFIRE_HIT_RANGE, event.shooter);
  }

  function onExplosion(event) {
    if (!event) return;
    const range = Math.max(EXPLOSION_RANGE, (event.radius || 0) * 5);
    reactToTrouble(event.x, event.z, range, undefined, undefined, 0, null);
  }

  /** Everyone near (x, z) (or near where a bullet landed) panics; people already running run on. */
  function reactToTrouble(x, z, range, hitX, hitZ, hitRange, shooter) {
    if (typeof x !== 'number' || typeof z !== 'number') return;
    const list = traffic.drivers;
    const hasHit = typeof hitX === 'number' && typeof hitZ === 'number';
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const state = list[i];
      if (shooter && state.driver === shooter) continue;
      const pos = state.vehicle.pos;
      const near = within(pos, x, z, range) || (hasHit && within(pos, hitX, hitZ, hitRange));
      if (near && Math.random() < 0.9) panic(state, x, z);
    }
    for (let i = 0; i < fleeing.length; i += 1) {
      const record = fleeing[i];
      if (!within(record.character.pos, x, z, range)) continue;
      record.fromX = x;
      record.fromZ = z;
      record.duration = Math.max(record.duration, record.time + 8);
    }
  }

  /** Crashes: the player ramming a traffic car, and (for the record) traffic hitting traffic or walls. */
  function onCollision(event) {
    if (!event || !event.vehicle) return;
    const a = traffic.driverOf(event.vehicle);
    const b = event.other ? traffic.driverOf(event.other) : null;
    if (!event.other) {
      if (a && event.speed > 3) traffic.noteCrash(a, null, event.speed);
      return;
    }
    if (a && b) traffic.noteCrash(a, b, event.speed);
    const playerCar = game.player ? game.player.vehicle : null;
    if (!playerCar) return;
    if (event.vehicle === playerCar && b) rammedByPlayer(b, event.speed);
    else if (event.other === playerCar && a) rammedByPlayer(a, event.speed);
  }

  /** Rammed: most drivers speed off, some stop, get out and have a word, then drive on. */
  function rammedByPlayer(state, speed) {
    if (state.mode === 'abandoned' || state.mode === 'halt' || state.mode === 'confront') return;
    state.hornTime = 0.5 + Math.random() * 0.8;
    if (!(speed > RAM_SPEED)) return;
    const player = game.player && game.player.pos;
    state.threatX = player ? player.x : state.vehicle.pos.x;
    state.threatZ = player ? player.z : state.vehicle.pos.z;
    if (state.mode === 'flee') {
      state.modeTime = Math.max(state.modeTime, 6);
      return;
    }
    if (state.driver && state.vehicle.speed < 10 && Math.random() < 0.36) {
      state.mode = 'halt';
      state.haltReason = 'confront';
      return;
    }
    state.mode = 'flee';
    state.modeTime = 7 + Math.random() * 5;
    state.hornTime = 1.2;
    if (state.phase === 0 && !state.committed) driverAI.choosePath(state, null);
  }

  /** Pulled from the wheel: the car is the thief's now; the victim and any passenger run for it. */
  function onCarjacked(event) {
    if (!event || !event.vehicle) return;
    const vehicle = event.vehicle;
    const state = traffic.driverOf(vehicle);
    const by = event.by;
    const fromX = by && by.pos ? by.pos.x : vehicle.pos.x;
    const fromZ = by && by.pos ? by.pos.z : vehicle.pos.z;
    if (event.victim) makeFlee(event.victim, fromX, fromZ, 10 + Math.random() * 6);
    if (!state) return;
    if (state.passenger && state.passenger.alive !== false) {
      if (state.passenger.vehicle === vehicle && game.characters && game.characters.exitVehicle) game.characters.exitVehicle(state.passenger, {});
      makeFlee(state.passenger, fromX, fromZ, 10 + Math.random() * 6);
    }
    state.driver = null;
    state.passenger = null;
    traffic.release(vehicle);
  }

  /** The player got into a car the traffic owned (an empty one, a parked one): it is theirs now. */
  function onPlayerTookVehicle(event) {
    if (!event || !event.vehicle) return;
    const vehicle = event.vehicle;
    const state = traffic.driverOf(vehicle);
    if (state && state.driver && state.driver.vehicle !== vehicle && state.driver.alive !== false) {
      makeFlee(state.driver, vehicle.pos.x, vehicle.pos.z, 8 + Math.random() * 5);
      state.driver = null;
    }
    if (state && state.passenger && state.passenger.alive !== false) {
      if (state.passenger.vehicle === vehicle && game.characters && game.characters.exitVehicle) game.characters.exitVehicle(state.passenger, {});
      makeFlee(state.passenger, vehicle.pos.x, vehicle.pos.z, 8 + Math.random() * 5);
      state.passenger = null;
    }
    if (traffic.owns(vehicle)) traffic.release(vehicle);
  }

  /** A car on fire is left to burn: whoever can still run, runs. */
  function onBurning(event) {
    if (!event || !event.vehicle) return;
    const state = traffic.driverOf(event.vehicle);
    if (state && state.mode !== 'abandoned') abandonCar(state, event.vehicle.pos.x, event.vehicle.pos.z);
  }

  return { update, panic, abandonCar, makeFlee };
}

function within(pos, x, z, range) {
  const dx = pos.x - x;
  const dz = pos.z - z;
  return dx * dx + dz * dz < range * range;
}
