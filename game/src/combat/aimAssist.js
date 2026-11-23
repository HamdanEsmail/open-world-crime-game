// Aim assist for a keyboard-and-mouse player in Port Sarab: a shot that leaves the muzzle near
// someone worth hitting bends a little toward their chest (hostiles first, then whoever is nearest the
// crosshair), the camera leans gently with a runner you are tracking, and from the driver's seat a
// drive-by goes to the nearest hostile in the arc you are looking at. Nothing is drawn here.
import * as THREE from 'three';
import { aimAssistCone, aimAssistBend } from './combatRules.js';

/** Assist reaches this far (m). From the wheel, a little less. */
const ASSIST_RANGE = 50;
const DRIVER_RANGE = 45;
/** Half-angle (rad) of the cone a target must sit in to be helped, and of the camera's sticky zone. */
const SHOT_CONE = 0.075;
const PULL_CONE = 0.11;
/** Half-angle (rad) around the camera's heading searched for a drive-by target. */
const DRIVER_ARC = 0.9;
/** How strongly the camera follows a tracked target's sideways motion, and centres on it (per second). */
const FOLLOW_SHARE = 0.5;
const CENTRE_RATE = 2.4;
const MAX_PULL_PER_SECOND = 0.8;

/**
 * Create the aim assist. `isHostile(character)` says whether someone is fighting the player.
 * @returns {{bendShot: Function, driverAim: Function, updateCameraPull: Function, enabled: boolean, target: Object|null}}
 */
export function createAimAssist(game, grid, ballistics, isHostile) {
  const candidates = [];
  const chest = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const from = new THREE.Vector3();
  const look = new THREE.Vector3();
  const excluded = [null, null, null];
  let pullTarget = null;
  let pullYaw = 0;
  let pullSearchTimer = 0;

  const assist = {
    /** False when the player turned aim assist off in the settings. */
    get enabled() {
      return !(game.settings && game.settings.aimAssist === false);
    },
    /** The person the camera is currently leaning toward, if any. */
    get target() {
      return pullTarget;
    },
    bendShot,
    driverAim,
    updateCameraPull,
    clear,
  };

  /**
   * Bend the player's shot toward the most plausible target near the crosshair. The crosshair is the
   * ray from `eye` along the unit `look` (the camera through the screen centre); the round leaves the
   * muzzle. The crosshair's point at the target's depth moves toward its chest by at most the weapon's
   * assist angle, and `dir` (unit, changed in place) is pointed from the muzzle at that point, so the
   * shoulder camera's parallax never costs a hit. Returns the target or null.
   */
  function bendShot(shooter, muzzle, eye, look, dir, weapon) {
    if (!assist.enabled || !weapon || !(weapon.assist > 0)) return null;
    const range = Math.min(ASSIST_RANGE, weapon.range);
    const target = pickTarget(shooter, eye.x, eye.y, eye.z, look.x, look.y, look.z, range, SHOT_CONE, false);
    if (!target) return null;
    ballistics.chestPoint(target, chest);
    const depth = (chest.x - eye.x) * look.x + (chest.y - eye.y) * look.y + (chest.z - eye.z) * look.z;
    // The crosshair's point level with the target, and how far (as an angle) it is off the chest.
    from.copy(eye).addScaledVector(look, depth);
    toTarget.subVectors(chest, from);
    const gap = toTarget.length();
    const share = aimAssistBend(gap / Math.max(1, depth), weapon);
    from.addScaledVector(toTarget, share);
    dir.subVectors(from, muzzle);
    const length = dir.length();
    if (length < 0.5) return null;
    dir.multiplyScalar(1 / length);
    return target;
  }

  /**
   * A drive-by: the nearest hostile within the arc around `yaw` (the camera's heading), in sight of
   * the window at (ox, oy, oz). Writes the unit direction to its chest into `outDir`; null when none.
   */
  function driverAim(shooter, yaw, ox, oy, oz, outDir) {
    if (!assist.enabled) return null;
    grid.gatherNear(ox, oz, DRIVER_RANGE, candidates, grid.PEOPLE);
    let best = null;
    let bestScore = Infinity;
    const ownVehicle = shooter.vehicle;
    for (let i = 0; i < candidates.length; i += 1) {
      const person = candidates[i];
      if (!eligible(person, shooter, ownVehicle) || !isHostile(person)) continue;
      ballistics.chestPoint(person, chest);
      const dx = chest.x - ox;
      const dz = chest.z - oz;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > DRIVER_RANGE || distance < 0.5) continue;
      const off = Math.abs(angleBetween(yaw, Math.atan2(dx, dz)));
      if (off > DRIVER_ARC) continue;
      const score = distance * (1 + off);
      if (score >= bestScore) continue;
      from.set(ox, oy, oz);
      if (game.colliders && !game.colliders.lineOfSight(from, chest)) continue;
      best = person;
      bestScore = score;
    }
    candidates.length = 0;
    if (!best) return null;
    ballistics.chestPoint(best, chest);
    outDir.set(chest.x - ox, chest.y - oy, chest.z - oz).normalize();
    return best;
  }

  /**
   * While the player aims on foot, let the camera lean with the target under the crosshair: follow
   * half of its sideways motion and drift gently toward its chest. Call once a frame.
   */
  function updateCameraPull(dt, character) {
    const rig = game.cameraRig;
    const camera = game.camera;
    const aiming = character && character.intent && character.intent.aim && !character.vehicle && character.alive !== false;
    if (!assist.enabled || !rig || rig.isCinematic || !camera || !aiming || !(dt > 0)) {
      pullTarget = null;
      return;
    }
    look.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    pullSearchTimer -= dt;
    if (pullSearchTimer <= 0 || (pullTarget && !stillValid(pullTarget, character))) {
      pullSearchTimer = 0.12;
      const found = pickTarget(character, cx, cy, cz, look.x, look.y, look.z, ASSIST_RANGE + 4, PULL_CONE, true);
      if (found !== pullTarget) {
        pullTarget = found;
        if (found) {
          ballistics.chestPoint(found, chest);
          pullYaw = Math.atan2(chest.x - cx, chest.z - cz);
        }
      }
    }
    if (!pullTarget) return;
    ballistics.chestPoint(pullTarget, chest);
    const yawNow = Math.atan2(chest.x - cx, chest.z - cz);
    const apparent = angleBetween(pullYaw, yawNow);
    pullYaw = yawNow;
    const error = angleBetween(rig.yaw, yawNow);
    if (Math.abs(error) > PULL_CONE * 1.6) {
      pullTarget = null;
      return;
    }
    const stickiness = 1 - Math.min(1, Math.abs(error) / (PULL_CONE * 1.6));
    let turn = apparent * FOLLOW_SHARE + error * (1 - Math.exp(-CENTRE_RATE * stickiness * dt));
    const limit = MAX_PULL_PER_SECOND * dt;
    if (turn > limit) turn = limit;
    else if (turn < -limit) turn = -limit;
    rig.yaw += turn;
  }

  /**
   * The best person near the line from (ox, oy, oz) along (dx, dy, dz): hostiles first, then whoever
   * sits nearest the line, inside a cone that widens for close targets, in sight of the origin.
   */
  function pickTarget(shooter, ox, oy, oz, dx, dy, dz, range, cone, fromCamera) {
    excluded[0] = null;
    excluded[1] = null;
    excluded[2] = null;
    const ownVehicle = shooter ? shooter.vehicle : null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      grid.gatherAlongRay(ox, oz, dx, dz, range, candidates, grid.PEOPLE, true);
      let best = null;
      let bestScore = Infinity;
      for (let i = 0; i < candidates.length; i += 1) {
        const person = candidates[i];
        if (person === excluded[0] || person === excluded[1] || person === excluded[2]) continue;
        if (!eligible(person, shooter, ownVehicle)) continue;
        ballistics.chestPoint(person, chest);
        const vx = chest.x - ox;
        const vy = chest.y - oy;
        const vz = chest.z - oz;
        const along = vx * dx + vy * dy + vz * dz;
        if (along < (fromCamera ? 1.5 : 0.6) || along > range) continue;
        const distance = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const angle = Math.acos(clampUnit(along / distance));
        const allowed = aimAssistCone(distance, cone);
        if (angle > allowed) continue;
        const score = angle / allowed + (isHostile(person) ? 0 : 1) + distance / 250;
        if (score < bestScore) {
          best = person;
          bestScore = score;
        }
      }
      candidates.length = 0;
      if (!best) return null;
      ballistics.chestPoint(best, chest);
      from.set(ox, oy, oz);
      if (!game.colliders || game.colliders.lineOfSight(from, chest)) return best;
      excluded[attempt] = best;
    }
    return null;
  }

  function eligible(person, shooter, ownVehicle) {
    if (!person || person === shooter || person.alive === false || person.despawned) return false;
    if (person.vehicle && person.vehicle === ownVehicle) return false;
    return person.state !== 'dead';
  }

  function stillValid(person, shooter) {
    return eligible(person, shooter, shooter.vehicle);
  }

  /** Forget the tracked target (a respawn, a cutscene). */
  function clear() {
    pullTarget = null;
  }

  return assist;
}

function clampUnit(value) {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Shortest signed turn from heading a to heading b. */
function angleBetween(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
