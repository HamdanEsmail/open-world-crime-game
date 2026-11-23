// How the Port Sarab police see: a staggered line-of-sight check from each patrol car and officer
// to the suspect, over a range that shrinks for a man crouching on foot, at night and in the
// khamsin's dust, and the question every crime asks: did anyone in uniform see that happen?
import * as THREE from 'three';

/** Seconds between two sight checks by the same pair of eyes (each unit checks a few times a second). */
const SIGHT_INTERVAL = 0.25;
/** A player further than this (squared metres) from where the eyes last looked has jumped: look again now. */
const JUMP_SQ = 30 * 30;
/** Metres from which an officer with a clear view notices a crime. */
export const WITNESS_RANGE = 90;
/** How far the police pick out the player: behind the wheel, on foot, crouching. */
const RANGE_DRIVING = 130;
const RANGE_ON_FOOT = 90;
const RANGE_CROUCHING = 45;
/** Closer than this the police know where the player is without needing a clear view. */
const TOUCH_RANGE = 7;
/** Eye heights: an officer at the wheel and an officer standing. */
export const EYE_HEIGHT_CAR = 1.35;
export const EYE_HEIGHT_FOOT = 1.6;

/**
 * Build the police's eyes. Stateless apart from scratch vectors; each car or officer keeps its own
 * eyes object from createEyes().
 * @param {Object} game
 */
export function createPoliceSight(game) {
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  /** A fresh set of eyes for a police car or an officer; the first check comes at a random moment. */
  function createEyes() {
    return { timer: Math.random() * SIGHT_INTERVAL, sees: false, distance: Infinity, lastSeen: -1e9, checkedX: 0, checkedZ: 0 };
  }

  /**
   * Look for the player from (x, y, z). The distance is kept fresh every frame; the line of sight is
   * tested only every SIGHT_INTERVAL seconds. Returns whether these eyes see the player.
   */
  function lookForPlayer(eyes, x, y, z, dt) {
    const player = game.player;
    if (!playerIsVisibleTarget(player)) {
      eyes.sees = false;
      eyes.distance = Infinity;
      return false;
    }
    const p = player.pos;
    const dx = p.x - x;
    const dz = p.z - z;
    eyes.distance = Math.sqrt(dx * dx + dz * dz);
    eyes.timer -= dt;
    // A player who jumped (a respawn, a scripted move) is looked for afresh at once.
    const jumped = (p.x - eyes.checkedX) * (p.x - eyes.checkedX) + (p.z - eyes.checkedZ) * (p.z - eyes.checkedZ) > JUMP_SQ;
    if (eyes.timer > 0 && !jumped) return eyes.sees;
    eyes.checkedX = p.x;
    eyes.checkedZ = p.z;
    eyes.timer = eyes.timer < -SIGHT_INTERVAL || jumped ? SIGHT_INTERVAL * 0.5 : eyes.timer + SIGHT_INTERVAL;
    let sees = false;
    if (eyes.distance <= TOUCH_RANGE) {
      sees = true;
    } else if (eyes.distance <= rangeToPlayer(eyes.sees)) {
      playerAimPoint(to);
      sees = clearView(x, y, z, to.x, to.y, to.z);
    }
    eyes.sees = sees;
    if (sees) eyes.lastSeen = game.time.elapsed;
    return sees;
  }

  /**
   * How far the police can pick the player out right now: far for a car, less for a man on foot,
   * much less for one crouching; less again at night without headlights, and never beyond what the
   * sandstorm lets anyone see. Eyes already on him hold on a little further.
   */
  function rangeToPlayer(alreadyWatching) {
    const player = game.player;
    if (!player || !player.character) return 0;
    const vehicle = player.vehicle;
    let range = vehicle ? RANGE_DRIVING : player.character.intent && player.character.intent.crouch ? RANGE_CROUCHING : RANGE_ON_FOOT;
    if (alreadyWatching) range *= 1.2;
    const night = game.sky && typeof game.sky.night === 'number' ? game.sky.night : 0;
    const lit = vehicle && vehicle.controls && vehicle.controls.headlights;
    if (!lit) range *= 1 - 0.3 * night;
    const visibility = game.weather && game.weather.visibility;
    if (typeof visibility === 'number' && visibility > 0) range = Math.min(range, visibility * 0.9);
    return range;
  }

  /**
   * True when some police eyes have a clear view of the ground point (x, z) within `range`: a crewed
   * car, an officer on foot, or the helicopter watching the player there.
   */
  function policeSawPoint(x, z, range) {
    const units = game.police && game.police.units;
    if (units) {
      const rangeSq = range * range;
      for (let i = 0; i < units.length; i += 1) {
        const unit = units[i];
        const vehicle = unit.vehicle;
        if (vehicle && !vehicle.wrecked && crewAboard(unit)) {
          const dx = vehicle.pos.x - x;
          const dz = vehicle.pos.z - z;
          if (dx * dx + dz * dz <= rangeSq
            && clearView(vehicle.pos.x, vehicle.pos.y + EYE_HEIGHT_CAR, vehicle.pos.z, x, groundAt(x, z) + 1, z)) return true;
        }
        const officers = unit.officers;
        for (let k = 0; k < officers.length; k += 1) {
          const officer = officers[k];
          if (officer.vehicle || officer.alive === false) continue;
          const dx = officer.pos.x - x;
          const dz = officer.pos.z - z;
          if (dx * dx + dz * dz <= rangeSq
            && clearView(officer.pos.x, officer.pos.y + EYE_HEIGHT_FOOT, officer.pos.z, x, groundAt(x, z) + 1, z)) return true;
        }
      }
    }
    const helicopter = game.policeHelicopter;
    const player = game.player;
    if (helicopter && helicopter.seesPlayer && player && player.character) {
      const p = player.pos;
      if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 80 * 80) return true;
    }
    return false;
  }

  /** Nothing static (buildings, walls, containers, dunes) stands between the two points. */
  function clearView(ax, ay, az, bx, by, bz) {
    const colliders = game.colliders;
    if (!colliders || !colliders.lineOfSight) return true;
    from.set(ax, ay, az);
    to.set(bx, by, bz);
    return colliders.lineOfSight(from, to);
  }

  /** The point the police look at: the middle of the player's car, or his chest (lower when crouching). */
  function playerAimPoint(out) {
    const player = game.player;
    const p = player.pos;
    const crouching = !player.vehicle && player.character.intent && player.character.intent.crouch;
    out.set(p.x, p.y + (player.vehicle ? 1.0 : crouching ? 0.7 : 1.2), p.z);
    return out;
  }

  /** Whether the player can be seen from the point (x, y, z) right now, with a fresh line-of-sight test. */
  function playerVisibleFrom(x, y, z, range) {
    const player = game.player;
    if (!playerIsVisibleTarget(player)) return false;
    const p = player.pos;
    if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) > range * range) return false;
    playerAimPoint(to);
    return clearView(x, y, z, to.x, to.y, to.z);
  }

  function groundAt(x, z) {
    const terrain = game.terrain;
    return terrain && terrain.heightAt ? terrain.heightAt(x, z) : 0;
  }

  return { createEyes, lookForPlayer, rangeToPlayer, policeSawPoint, clearView, playerAimPoint, playerVisibleFrom };
}

/** The car's crew can look out of it: someone in uniform is aboard (or it was sent out without people). */
function crewAboard(unit) {
  const officers = unit.officers;
  if (officers.length === 0) return true;
  for (let i = 0; i < officers.length; i += 1) if (officers[i].vehicle === unit.vehicle) return true;
  return false;
}

function playerIsVisibleTarget(player) {
  return !!(player && player.character && player.state !== 'down' && player.character.alive !== false);
}
