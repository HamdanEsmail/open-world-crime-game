// The rival drivers of Port Sarab's street races. Each is a named racer in a car of their own, driven
// checkpoint to checkpoint by the shared autopilot with their own skill: braking early for the turns,
// lining up straight for the jumps, swinging out to pass slower cars, rubber-banded a little so the
// race stays close, and put back on the road when they crash, roll over or drive into the gulf.
import { rivalSkillForRace } from './activityRules.js';

/** The racers of Port Sarab's street scene: name, the way they talk, and how good they are (0..1). */
export const RIVAL_DRIVERS = [
  { name: 'Tariq "Nitro" Bashir', skill: 0.92, taunt: 'You brought that to a race? Bold.', passed: 'See you at the finish, Dust.', beaten: 'Lucky line. Next time.' },
  { name: 'Lena Castellan', skill: 0.84, taunt: 'Try to keep my tail lights in sight.', passed: 'Excuse me, coming through!', beaten: 'Show-off.' },
  { name: 'Omar Quayle', skill: 0.74, taunt: 'My mechanic says this thing does three hundred.', passed: 'Ha! Eat sand!', beaten: 'Hey, I had that corner!' },
  { name: 'Sadia Renn', skill: 0.88, taunt: 'Rally champ, they said. We will see.', passed: 'Too slow, champ.', beaten: 'Fine. You can drive.' },
  { name: 'Dex Moreau', skill: 0.66, taunt: 'Just don\'t scratch the paint, okay?', passed: 'Woo! Still got it!', beaten: 'Was that legal?' },
  { name: 'Farida Lux', skill: 0.8, taunt: 'The Corniche crowd is watching. Don\'t embarrass yourself.', passed: 'Bye-bye!', beaten: 'Nice move. Annoying, but nice.' },
  { name: 'Kofi Amari', skill: 0.7, taunt: 'Last one to the line buys karak.', passed: 'Karak\'s on you!', beaten: 'Okay, karak\'s on me.' },
  { name: 'Juno Navarre', skill: 0.95, taunt: 'I don\'t lose on my own streets.', passed: 'Stay in my mirrors.', beaten: 'Huh. Nobody does that.' },
];

/** How much tougher than a street car a rival's race-prepared car is. */
const RIVAL_TOUGHNESS = 2.4;

/** Paint for the rival cars, so each one reads apart on the grid. */
const RIVAL_PAINT = [0xe4572e, 0x1ba39c, 0xf2a81d, 0x6a3fa0, 0x9bd13a, 0x4d9de0, 0xfff4d6];

/**
 * Build the rival-driving helpers used by the street races.
 * @returns {{prepareRaceLine(race:Object):void, spawnRival(race:Object, specId:string, slot:Object, profile:Object, index:number):Object,
 *   driveRival(racer:Object, race:Object, dt:number, playerProgress:number):void, measureProgress(racer:Object, race:Object):number,
 *   checkpointPassed(race:Object, index:number, x:number, z:number):boolean, recoverRival(racer:Object, race:Object):void, releaseRival(racer:Object):void}}
 */
export function createRaceRivalDrivers(game) {
  /**
   * Work out the racing line once a race is set up: every checkpoint's direction of approach, the
   * distance along the course to it, and the radius of the turn there (how fast it can be taken).
   */
  function prepareRaceLine(race) {
    const points = race.points;
    const count = points.length;
    race.cum = new Float64Array(count);
    race.inX = new Float64Array(count);
    race.inZ = new Float64Array(count);
    race.cornerRadius = new Float64Array(count);
    let px = race.grid.x;
    let pz = race.grid.z;
    let total = 0;
    for (let i = 0; i < count; i += 1) {
      const p = points[i];
      const dx = p.x - px;
      const dz = p.z - pz;
      const length = Math.hypot(dx, dz) || 1;
      total += length;
      race.cum[i] = total;
      race.inX[i] = dx / length;
      race.inZ[i] = dz / length;
      px = p.x;
      pz = p.z;
    }
    race.total = total;
    for (let i = 0; i < count; i += 1) {
      const p = points[i];
      const next = points[i + 1];
      if (!next) {
        race.cornerRadius[i] = 1e6;
        continue;
      }
      const ox = next.x - p.x;
      const oz = next.z - p.z;
      const length = Math.hypot(ox, oz) || 1;
      const dot = (race.inX[i] * ox + race.inZ[i] * oz) / length;
      const turn = Math.acos(Math.max(-1, Math.min(1, dot)));
      const width = p.cornerWidth || p.r * 1.4;
      race.cornerRadius[i] = width / (1 - Math.cos(turn / 2) + 0.015);
    }
  }

  /** Put a rival car with its driver on a grid slot. Returns the racer record. */
  function spawnRival(race, specId, slot, profile, index) {
    const vehicles = game.vehicles;
    const vehicle = vehicles.spawn(specId, { x: slot.x, z: slot.z, heading: slot.heading, color: RIVAL_PAINT[index % RIVAL_PAINT.length], faction: 'civilian' });
    if (!vehicle) return null;
    vehicle.ai = { owner: 'streetRace', race: race.route.id };
    vehicle.tags.raceRival = true;
    // Race-prepared: roll cages and stiff panels keep a rival in it after a scrape or a landing.
    vehicle.maxHealth = vehicle.spec.health * RIVAL_TOUGHNESS;
    vehicle.health = vehicle.maxHealth;
    let driver = null;
    const characters = game.characters;
    if (characters && characters.spawn) {
      driver = characters.spawn({ kind: 'civilian', faction: 'civilian', archetype: 'local', name: profile.name, x: slot.x + 2, z: slot.z, heading: slot.heading });
      if (driver) {
        driver.ai = { owner: 'streetRace' };
        characters.enterVehicle(driver, vehicle, 0, { instant: true });
      }
    }
    vehicles.setDriver(vehicle, driver);
    vehicle.ai = { owner: 'streetRace', race: race.route.id };
    return {
      isPlayer: false,
      name: profile.name,
      profile,
      vehicle,
      driver,
      skill: rivalSkillForRace(race.route.id, race.tier, profile.skill),
      next: 0,
      progress: 0,
      finished: false,
      finishTime: 0,
      place: 0,
      dnf: false,
      side: index % 2 === 0 ? 1 : -1,
      stuckTime: 0,
      flipTime: 0,
      bestDistance: Infinity,
      noGain: 0,
      lastX: slot.x,
      lastZ: slot.z,
    };
  }

  /** One frame at the wheel for a rival: hold on the grid, race the course, or cruise after the line. */
  function driveRival(racer, race, dt, playerProgress) {
    const vehicle = racer.vehicle;
    if (!vehicle || vehicle.despawned || vehicle.wrecked || vehicle.sunk) {
      racer.dnf = true;
      return;
    }
    const pilot = game.vehicles.autopilot;
    if (race.state === 'countdown') {
      pilot.stopVehicle(vehicle, true);
      vehicle.controls.handbrake = true;
      vehicle.controls.throttle = race.countdown < 1.2 ? 0.35 : 0;
      return;
    }
    if (racer.finished || racer.dnf) {
      pilot.stopVehicle(vehicle, false);
      return;
    }
    const points = race.points;
    let target = points[racer.next];
    if (checkpointPassed(race, racer.next, vehicle.pos.x, vehicle.pos.z)) {
      racer.next += 1;
      racer.bestDistance = Infinity;
      racer.noGain = 0;
      if (racer.next >= points.length) {
        racer.finished = true;
        racer.finishTime = race.elapsed;
        return;
      }
      target = points[racer.next];
    }

    const dx = target.x - vehicle.pos.x;
    const dz = target.z - vehicle.pos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const speed = Math.abs(vehicle.speed);
    const profile = vehicle.dynamics ? vehicle.dynamics.profile : null;
    const grip = profile ? profile.grip : vehicle.spec.grip;
    const braking = profile ? profile.braking : vehicle.spec.braking;
    const topSpeed = profile ? profile.topSpeed : vehicle.spec.topSpeed;

    // Pure pursuit along the course: once inside the look-ahead, aim down the next leg.
    let aimX = target.x;
    let aimZ = target.z;
    const following = points[racer.next + 1];
    const lookAhead = 7 + speed * 0.55;
    if (following && !target.jump && distance < lookAhead) {
      const ox = following.x - target.x;
      const oz = following.z - target.z;
      const leg = Math.hypot(ox, oz) || 1;
      const reach = Math.min(leg, lookAhead - distance);
      aimX = target.x + (ox / leg) * reach;
      aimZ = target.z + (oz / leg) * reach;
    }

    // Swing out past a slower car in the way.
    const ahead = pilot.obstacleAhead(vehicle, 16);
    if (ahead.vehicle && Math.abs(ahead.vehicle.speed) < speed - 1.5 && !target.jump) {
      const ax = aimX - vehicle.pos.x;
      const az = aimZ - vehicle.pos.z;
      const reach = Math.hypot(ax, az) || 1;
      aimX += (-az / reach) * racer.side * 3.4;
      aimZ += (ax / reach) * racer.side * 3.4;
    }

    // Rubber band: a little help when far behind the player, a little lift when far ahead.
    const gap = racer.progress - playerProgress;
    const rubber = Math.max(0.9, Math.min(1.08, 1 - gap / 2600));
    const skill = racer.skill;
    let pace = topSpeed * (0.84 + 0.14 * Math.min(1, skill)) * rubber;
    const gripUse = 0.72 + 0.22 * Math.min(1, skill) + (rubber > 1 ? 0.04 : 0);
    const corner = target.jump ? 27 : Math.sqrt(grip * 9.81 * gripUse * race.cornerRadius[racer.next]);
    const room = Math.max(0, distance - 3);
    const brakeLimit = Math.sqrt(corner * corner + 2 * braking * (0.5 + 0.25 * Math.min(1, skill)) * room);
    if (brakeLimit < pace) pace = brakeLimit;
    pilot.driveToward(vehicle, aimX, aimZ, pace, { aggression: 0.45 + 0.4 * Math.min(1, skill), allowReverse: true });

    watchForTrouble(racer, race, dt, distance);
  }

  /** Count up stuck, rolled or going-nowhere time, and put the car back on the course when it is too long. */
  function watchForTrouble(racer, race, dt, distance) {
    const vehicle = racer.vehicle;
    const pilot = game.vehicles.autopilot;
    racer.stuckTime = pilot.isStuck(vehicle) ? racer.stuckTime + dt : Math.max(0, racer.stuckTime - dt);
    const rolled = Math.abs(vehicle.roll) > 1.2 || Math.abs(vehicle.pitch) > 1.1;
    racer.flipTime = rolled ? racer.flipTime + dt : 0;
    if (distance < racer.bestDistance - 2) {
      racer.bestDistance = distance;
      racer.noGain = 0;
    } else {
      racer.noGain += dt;
    }
    const wet = vehicle.dynamics && vehicle.dynamics.inWater;
    if (racer.stuckTime > 3.5 || racer.flipTime > 1.6 || racer.noGain > 11 || wet) recoverRival(racer, race);
  }

  /** Back on the course at the last checkpoint passed, facing the next one, clear of other cars. */
  function recoverRival(racer, race) {
    const vehicle = racer.vehicle;
    const points = race.points;
    const from = racer.next > 0 ? points[racer.next - 1] : race.grid;
    const to = points[racer.next];
    const heading = Math.atan2(to.x - from.x, to.z - from.z);
    let x = from.x;
    let z = from.z;
    const sideX = -Math.cos(heading);
    const sideZ = Math.sin(heading);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const other = game.vehicles.nearest(x, z, 5.5, (candidate) => candidate !== vehicle);
      if (!other) break;
      x += sideX * racer.side * 3.5;
      z += sideZ * racer.side * 3.5;
    }
    game.vehicles.place(vehicle, x, z, heading);
    game.vehicles.autopilot.reset(vehicle);
    racer.stuckTime = 0;
    racer.flipTime = 0;
    racer.noGain = 0;
    racer.bestDistance = Infinity;
    if (vehicle.health < vehicle.maxHealth * 0.35) vehicle.health = vehicle.maxHealth * 0.35;
  }

  /**
   * Has the car at (x, z) passed checkpoint `index`? Inside its radius, or across its gate line
   * (the line through it square to the approach) within a widened radius, so nobody has to turn back
   * for a checkpoint missed by a metre at speed.
   */
  function checkpointPassed(race, index, x, z) {
    const p = race.points[index];
    if (!p) return false;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < p.r * p.r) return true;
    const along = dx * race.inX[index] + dz * race.inZ[index];
    if (along < 0 || along > 30) return false;
    const across = Math.abs(dx * race.inZ[index] - dz * race.inX[index]);
    return across < p.r * 1.5;
  }

  /** Metres of the course this racer has covered (finished racers rank by finishing order). */
  function measureProgress(racer, race) {
    if (racer.finished) {
      racer.progress = race.total + 100000 - racer.finishTime;
      return racer.progress;
    }
    const vehicle = racer.isPlayer ? (game.player ? game.player.vehicle : null) : racer.vehicle;
    const pos = vehicle ? vehicle.pos : game.player ? game.player.pos : null;
    if (!pos || racer.next >= race.points.length) return racer.progress;
    const p = race.points[racer.next];
    const remaining = Math.hypot(p.x - pos.x, p.z - pos.z);
    const before = racer.next > 0 ? race.cum[racer.next - 1] : 0;
    racer.progress = Math.max(before, race.cum[racer.next] - remaining);
    return racer.progress;
  }

  /** Take a rival and their car out of the world. */
  function releaseRival(racer) {
    if (racer.driver && game.characters && game.characters.despawn) {
      if (racer.driver.vehicle && game.characters.exitVehicle) game.characters.exitVehicle(racer.driver, { instant: true });
      game.characters.despawn(racer.driver);
    }
    if (racer.vehicle && !racer.vehicle.despawned) {
      if (racer.vehicle.isPlayer) racer.vehicle.ai = null;
      else game.vehicles.despawn(racer.vehicle);
    }
    racer.driver = null;
    racer.vehicle = null;
  }

  return { prepareRaceLine, spawnRival, driveRival, measureProgress, checkpointPassed, recoverRival, releaseRival };
}
