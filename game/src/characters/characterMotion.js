// Moves the people of Port Sarab on foot: turns each person's intent (a direction, a pace, jump,
// crouch, aim) into acceleration and braking, a brisk but finite turn, jumps with a little
// anticipation, gravity, ground following over dunes and ramps, falls off ledges (hard landings hurt),
// wading and swimming in the gulf, and pushes people out of walls, palms, cars and each other.
// Cars that hit someone hard are reported to the manager, which knocks them flying.
import { fallDamageFromImpact } from './characterAnimationRules.js';

/** Per-person movement memory. */
export function createMotionState() {
  return {
    yawRate: 0, turnLead: 0, crouching: false, windup: 0, windupTimer: 0, jumpHeld: false,
    landingSpeed: 0, airTime: 0, swimming: false, wading: 0, autoTarget: false, autoTargetX: 0, autoTargetZ: 0,
    lockedTime: 0, lastVehicleHitId: -1, lastVehicleHitTime: -9, stumbleTime: 0,
  };
}

/**
 * Move one person on foot (modes 'foot' and 'swim') by dt. `ctx` = {config, now, damage(character,
 * amount, info), knockDown(character, vx, vy, vz, info), onLanded(character, speed)}. Returns nothing;
 * writes pos, vel, heading, grounded and the motion memory.
 */
export function updateFootMotion(character, body, dt, game, ctx) {
  const motion = body.motion;
  const intent = character.intent;
  const config = ctx.config;
  const anim = body.anim;
  const pos = character.pos;
  const vel = character.vel;

  // What the legs are allowed to do right now.
  const stumbling = character.state === 'stumble' || motion.stumbleTime > 0;
  const gesture = intent.gesture;
  const rooted = gesture === 'cower' || gesture === 'sit' || gesture === 'lean' || !!anim.meleeMove || character.alive === false;
  motion.stumbleTime = Math.max(0, motion.stumbleTime - dt);

  // Desired velocity on the ground.
  let moveX = intent.moveX || 0;
  let moveZ = intent.moveZ || 0;
  let pace = intent.pace || 'walk';
  if (motion.autoTarget) {
    const dx = motion.autoTargetX - pos.x;
    const dz = motion.autoTargetZ - pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    moveX = d > 1e-3 ? dx / d : 0;
    moveZ = d > 1e-3 ? dz / d : 0;
    if (d < 0.9) { moveX *= d / 0.9 + 0.25; moveZ *= d / 0.9 + 0.25; }
    pace = d > 4 ? 'run' : 'walk';
  }
  let amount = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (amount > 1) { moveX /= amount; moveZ /= amount; amount = 1; }
  const crouch = !!intent.crouch && !motion.swimming;
  motion.crouching = crouch;
  const aiming = !!intent.aim && !rooted;
  let topSpeed = pace === 'sprint' ? config.sprintSpeed : pace === 'run' ? config.runSpeed : config.walkSpeed;
  if (crouch) topSpeed = Math.min(topSpeed, 1.6);
  if (aiming) topSpeed = Math.min(topSpeed, config.runSpeed * 0.72);
  if (gesture === 'handsUp' || gesture === 'phone' || gesture === 'talk') topSpeed = Math.min(topSpeed, config.walkSpeed);
  topSpeed *= 1 - 0.55 * motion.wading;
  if (motion.swimming) topSpeed = Math.min(topSpeed, 1.5);
  if (rooted || stumbling) topSpeed = 0;
  if (anim.meleeMove) topSpeed = 0.4;

  // Turning: toward the aim, else toward where the person is going, else to the requested facing.
  let desired = character.heading;
  if (aiming) desired = intent.aimYaw;
  else if (amount > 0.05 && topSpeed > 0) desired = Math.atan2(moveX, moveZ);
  else if (intent.faceYaw !== null && intent.faceYaw !== undefined && !stumbling) desired = intent.faceYaw;
  const delta = wrapAngle(desired - character.heading);
  const groundSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  const turnRate = aiming ? 13 : groundSpeed > 6 ? 4.6 : groundSpeed > 3.5 ? 6.5 : 9;
  const canTurn = character.grounded || motion.swimming ? 1 : 0.35;
  const step = clamp(delta * Math.min(1, 12 * dt), -turnRate * dt, turnRate * dt) * (stumbling ? 0 : canTurn);
  character.heading = wrapAngle(character.heading + step);
  motion.yawRate = damp(motion.yawRate, dt > 0 ? step / dt : 0, 14, dt);
  motion.turnLead = clamp(delta, -1.2, 1.2);

  // Sharp turns slow a person down first: weight, not ice.
  const pivot = aiming ? 1 : 0.3 + 0.7 * Math.max(0, Math.cos(delta));
  const targetX = moveX * topSpeed * pivot;
  const targetZ = moveZ * topSpeed * pivot;
  const grounded = character.grounded || motion.swimming;
  const speedUp = targetX * vel.x + targetZ * vel.z >= groundSpeed * groundSpeed - 0.01;
  const accel = !grounded ? 2.2 : stumbling ? 3 : speedUp ? 13 : 18;
  const ax = targetX - vel.x;
  const az = targetZ - vel.z;
  const gap = Math.sqrt(ax * ax + az * az);
  if (gap > 1e-5) {
    const change = Math.min(gap, accel * dt);
    vel.x += (ax / gap) * change;
    vel.z += (az / gap) * change;
  }

  // Jump: a short crouch, then launch.
  const jumpPressed = !!intent.jump && !motion.jumpHeld;
  motion.jumpHeld = !!intent.jump;
  if (jumpPressed && character.grounded && !motion.swimming && !rooted && !stumbling && motion.windupTimer <= 0) {
    motion.windupTimer = 0.09;
  }
  if (motion.windupTimer > 0) {
    motion.windupTimer -= dt;
    motion.windup = 1 - Math.max(0, motion.windupTimer) / 0.09;
    if (motion.windupTimer <= 0) {
      vel.y = config.jumpSpeed;
      character.grounded = false;
      motion.windup = 0;
      motion.airTime = 0;
    }
  } else {
    motion.windup = damp(motion.windup, 0, 20, dt);
  }

  // Integrate and follow the ground.
  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  const ground = groundAt(game, pos.x, pos.z);
  const water = waterAt(game, pos.x, pos.z, ground, config.seaLevel);
  if (water.depth > 1.3 || (motion.swimming && water.depth > 1.0)) {
    // Swim at the surface.
    if (!motion.swimming && !character.grounded) ctx.onSplash && ctx.onSplash(character);
    motion.swimming = true;
    motion.wading = 1;
    pos.y = damp(pos.y, config.seaLevel - 1.25, 8, dt);
    vel.y = 0;
    character.grounded = true;
    motion.airTime = 0;
  } else {
    motion.swimming = false;
    motion.wading = clamp((water.depth - 0.25) / 0.9, 0, 1);
    if (character.grounded) {
      if (ground < pos.y - 0.5) {
        // Walked off a ledge.
        character.grounded = false;
        vel.y = Math.min(vel.y, 0);
        motion.airTime = 0;
      } else {
        pos.y = ground > pos.y ? Math.min(ground, pos.y + Math.max(0.6, groundSpeed * dt * 2)) : damp(pos.y, ground, 25, dt);
        if (Math.abs(pos.y - ground) < 0.002) pos.y = ground;
        vel.y = 0;
      }
    } else {
      motion.airTime += dt;
      vel.y -= config.gravity * dt;
      pos.y += vel.y * dt;
      if (pos.y <= ground && vel.y <= 0) {
        const impact = -vel.y;
        pos.y = ground;
        vel.y = 0;
        character.grounded = true;
        motion.landingSpeed = impact;
        if (ctx.onLanded) ctx.onLanded(character, impact);
        const harm = fallDamageFromImpact(impact);
        if (harm > 0 && character.alive !== false) {
          ctx.damage(character, harm, { kind: 'fall', source: null });
          if (impact > 14 && character.alive !== false) ctx.knockDown(character, vel.x * 0.3, 0.5, vel.z * 0.3, { source: null });
        }
      }
    }
  }

  // Static world: buildings, walls, posts and palms.
  const colliders = game.colliders;
  if (colliders && typeof colliders.pushOutCircle === 'function') {
    const contact = colliders.pushOutCircle(pos, BODY_RADIUS, pos.y + 0.3, pos.y + 1.7);
    if (contact) {
      const into = vel.x * contact.nx + vel.z * contact.nz;
      if (into < 0) {
        vel.x -= contact.nx * into;
        vel.z -= contact.nz * into;
      }
    }
  }
}

/**
 * Push a person out of every vehicle's body; a car that drives into someone faster than a shove
 * reports a hit through ctx.onVehicleHit(character, vehicle, closingSpeed, nx, nz).
 * `point` is where the person is (their feet, or the middle of a tumbling body).
 */
export function resolveVehicleContacts(character, body, point, game, ctx) {
  const vehicles = game.vehicles && game.vehicles.list;
  if (!vehicles || vehicles.length === 0) return;
  const own = character.vehicle || (body.boarding && body.boarding.phase ? body.boarding.vehicle : null);
  const radius = BODY_RADIUS;
  for (let i = 0; i < vehicles.length; i += 1) {
    const vehicle = vehicles[i];
    if (!vehicle || vehicle === own || !vehicle.pos || !vehicle.spec) continue;
    const dx = point.x - vehicle.pos.x;
    const dz = point.z - vehicle.pos.z;
    const halfLength = vehicle.spec.length * 0.5 + radius;
    const halfWidth = vehicle.spec.width * 0.5 + radius;
    if (dx * dx + dz * dz > (halfLength + halfWidth) * (halfLength + halfWidth)) continue;
    if (point.y > vehicle.pos.y + (vehicle.spec.height || 1.5) + 0.2 || point.y < vehicle.pos.y - 1.5) continue;
    const c = Math.cos(vehicle.heading);
    const s = Math.sin(vehicle.heading);
    const localZ = dx * s + dz * c;
    const localX = dx * c - dz * s;
    const overlapZ = halfLength - Math.abs(localZ);
    const overlapX = halfWidth - Math.abs(localX);
    if (overlapZ <= 0 || overlapX <= 0) continue;
    let nx;
    let nz;
    let depth;
    if (overlapX < overlapZ) {
      const sign = localX >= 0 ? 1 : -1;
      nx = c * sign;
      nz = -s * sign;
      depth = overlapX;
    } else {
      const sign = localZ >= 0 ? 1 : -1;
      nx = s * sign;
      nz = c * sign;
      depth = overlapZ;
    }
    // Closing speed of the car's surface at the contact against the person.
    const yawRate = vehicle.yawRate || 0;
    const vvx = (vehicle.vel ? vehicle.vel.x : 0) + yawRate * dz;
    const vvz = (vehicle.vel ? vehicle.vel.z : 0) - yawRate * dx;
    const closing = (vvx - character.vel.x) * nx + (vvz - character.vel.z) * nz;
    point.x += nx * depth;
    point.z += nz * depth;
    if (point !== character.pos) {
      character.pos.x += nx * depth;
      character.pos.z += nz * depth;
    }
    if (closing > HIT_SPEED && ctx.onVehicleHit) {
      ctx.onVehicleHit(character, vehicle, closing, nx, nz);
    } else if (closing > 0) {
      character.vel.x += nx * closing;
      character.vel.z += nz * closing;
    }
  }
}

/** Soft separation so a crowd never overlaps; heavier people (the player) give way less. */
export function separatePeople(list) {
  const count = list.length;
  for (let i = 0; i < count; i += 1) {
    const a = list[i];
    const bodyA = a.body;
    if (!bodyA || !SOLID_MODES[bodyA.mode]) continue;
    for (let j = i + 1; j < count; j += 1) {
      const b = list[j];
      const bodyB = b.body;
      if (!bodyB || !SOLID_MODES[bodyB.mode]) continue;
      const dx = b.pos.x - a.pos.x;
      if (dx > 0.62 || dx < -0.62) continue;
      const dz = b.pos.z - a.pos.z;
      if (dz > 0.62 || dz < -0.62) continue;
      if (Math.abs(b.pos.y - a.pos.y) > 1.2) continue;
      const d2 = dx * dx + dz * dz;
      const min = BODY_RADIUS * 2;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const push = (min - d) * 0.5;
      const nx = d2 > 1e-8 ? dx / d : 1;
      const nz = d2 > 1e-8 ? dz / d : 0;
      const wa = a.kind === 'player' ? 0.2 : b.kind === 'player' ? 1.8 : 1;
      const wb = 2 - wa;
      a.pos.x -= nx * push * wa;
      a.pos.z -= nz * push * wa;
      b.pos.x += nx * push * wb;
      b.pos.z += nz * push * wb;
    }
  }
}

/** Ground height under (x, z): the terrain when there is one, else the flat city at 0. */
export function groundAt(game, x, z) {
  const terrain = game.terrain;
  if (terrain && typeof terrain.heightAt === 'function') {
    const y = terrain.heightAt(x, z);
    if (Number.isFinite(y)) return y;
  }
  return 0;
}

/** How deep the gulf is at (x, z) (0 on dry land). */
function waterAt(game, x, z, ground, seaLevel) {
  const terrain = game.terrain;
  _water.depth = 0;
  if (terrain && typeof terrain.isWater === 'function' && terrain.isWater(x, z)) {
    _water.depth = Math.max(0, seaLevel - ground);
  }
  return _water;
}

function wrapAngle(a) {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  else if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** A person's radius for collisions, and the closing speed at which a car knocks them over. */
export const BODY_RADIUS = 0.3;
const HIT_SPEED = 3.2;
const SOLID_MODES = { foot: true, swim: true, getUp: true };
const _water = { depth: 0 };
