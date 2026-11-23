// The eight stunt ramps of Port Sarab, from the Beach Kicker on the Corniche sand to the Falcon Launch
// on the dirt track. Leave the top of a ramp at speed and the jump is measured: time in the air,
// height, and the distance to touchdown, with a moment of slow motion at the top of the arc. Land it
// upright past the ramp's mark and the city pays for the first landing on each ramp; all eight pays a
// prize of its own.
import { stuntJumpTarget, stuntJumpReward } from './activityRules.js';

/** Fraction of normal speed the world runs at during a jump's slow motion. */
const SLOW_MOTION = 0.32;
/** Longest the slow motion lasts, in real seconds. */
const SLOW_MOTION_SECONDS = 1.3;
const ALL_RAMPS_BONUS = 15000;
const RAMP_CORAL = 0xe4572e;

/**
 * Build the stunt jumps (game.activities.stunts).
 * @returns {{id:string, ramps:Object[], landed:Object, jump:Object|null, update(dt:number):void, stop():void,
 *   serialize():Object, deserialize(data:Object):void}}
 */
export function createStuntJumps(game, activities) {
  const ramps = game.city.stuntRamps.map((ramp) => {
    const dirX = Math.sin(ramp.heading);
    const dirZ = Math.cos(ramp.heading);
    return {
      id: ramp.id,
      name: ramp.name,
      x: ramp.x,
      z: ramp.z,
      dirX,
      dirZ,
      length: ramp.length,
      width: ramp.width,
      height: ramp.height,
      topX: ramp.x + dirX * ramp.length,
      topZ: ramp.z + dirZ * ramp.length,
      minDistance: stuntJumpTarget(ramp.height),
      marker: null,
    };
  });
  /** Best distance landed on each ramp, by id (absent until first landed). */
  const landed = {};
  const state = { allBonusPaid: false, jumps: 0 };
  let watched = null;
  let onRamp = null;
  let leftRampAt = -1;
  let wasGrounded = true;
  let jump = null;
  let slowMotionLeft = 0;
  let savedScale = 1;

  const module = {
    id: 'stunts',
    ramps,
    landed,
    update,
    stop,
    serialize,
    deserialize,
    get jump() {
      return jump;
    },
  };

  /** Watch the player's car on and off the ramps; run the slow motion; judge the landing. */
  function update(dt) {
    runSlowMotion();
    if ((game.time.frame % 30) === 11) refreshRampMarkers();
    const vehicle = activities.playerVehicle();
    if (vehicle !== watched) {
      if (jump) abortJump('');
      watched = vehicle;
      onRamp = null;
      wasGrounded = true;
    }
    if (!vehicle) return;
    const grounded = vehicle.grounded !== false;
    if (jump) {
      followJump(vehicle, grounded, dt);
    } else if (grounded) {
      const ramp = rampUnder(vehicle);
      if (ramp) {
        onRamp = ramp;
        leftRampAt = game.time.elapsed;
      }
    } else if (wasGrounded && onRamp && game.time.elapsed - leftRampAt < 0.3) {
      beginJump(vehicle, onRamp);
    }
    wasGrounded = grounded;
  }

  /** The ramp whose upper half the car is driving up, fast and the right way, or null. */
  function rampUnder(vehicle) {
    const px = vehicle.pos.x;
    const pz = vehicle.pos.z;
    for (let i = 0; i < ramps.length; i += 1) {
      const ramp = ramps[i];
      const dx = px - ramp.x;
      const dz = pz - ramp.z;
      const along = dx * ramp.dirX + dz * ramp.dirZ;
      if (along < ramp.length * 0.45 || along > ramp.length + 2.5) continue;
      const across = dx * ramp.dirZ - dz * ramp.dirX;
      if (Math.abs(across) > ramp.width / 2 + 0.8) continue;
      const climb = vehicle.vel.x * ramp.dirX + vehicle.vel.z * ramp.dirZ;
      if (climb > 7) return ramp;
    }
    return null;
  }

  function beginJump(vehicle, ramp) {
    jump = {
      ramp,
      vehicle,
      startX: vehicle.pos.x,
      startZ: vehicle.pos.z,
      startY: vehicle.pos.y,
      speed: Math.hypot(vehicle.vel.x, vehicle.vel.z),
      air: 0,
      peak: 0,
      landed: false,
      landX: 0,
      landZ: 0,
      settle: 0,
    };
    onRamp = null;
    game.events.emit('stunt:takeoff', { ramp: ramp.id, speed: jump.speed });
  }

  function followJump(vehicle, grounded, dt) {
    const j = jump;
    if (vehicle.wrecked) {
      abortJump('Stunt failed: wrecked');
      return;
    }
    if (!j.landed) {
      j.air += dt;
      const ground = game.terrain ? game.terrain.heightAt(vehicle.pos.x, vehicle.pos.z) : 0;
      const height = vehicle.pos.y - ground;
      if (height > j.peak) j.peak = height;
      if (j.air > 0.22 && j.speed > 14 && slowMotionLeft <= 0 && game.time.scale >= 0.99) startSlowMotion();
      if (grounded && j.air > 0.25) {
        j.landed = true;
        j.landX = vehicle.pos.x;
        j.landZ = vehicle.pos.z;
        endSlowMotion();
      } else if (grounded) {
        // Only a hop off the lip: not a jump.
        jump = null;
        endSlowMotion();
      } else if (j.air > 8) {
        abortJump('');
      }
      return;
    }
    // A moment after touchdown, judge whether it was landed on four wheels.
    j.settle += dt;
    const rolled = Math.abs(vehicle.roll) > 0.9 || Math.abs(vehicle.pitch) > 0.9;
    const wet = vehicle.dynamics && vehicle.dynamics.inWater;
    if (rolled || wet) {
      abortJump('Stunt failed: you did not stick the landing');
      return;
    }
    if (j.settle > 0.6) judgeJump();
  }

  /** Measure the jump and pay a first landing on a ramp. */
  function judgeJump() {
    const j = jump;
    jump = null;
    const ramp = j.ramp;
    const distance = Math.round(Math.hypot(j.landX - j.startX, j.landZ - j.startZ));
    const airTime = Math.round(j.air * 10) / 10;
    state.jumps += 1;
    game.economy?.stats?.max?.('longestJumpMetres', distance);
    const success = distance >= ramp.minDistance;
    const first = success && landed[ramp.id] === undefined;
    if (success) landed[ramp.id] = Math.max(landed[ramp.id] || 0, distance);
    game.events.emit('stunt:jump', { ramp: ramp.id, name: ramp.name, distance, airTime, height: Math.round(j.peak * 10) / 10, success, first });
    if (!success) {
      activities.banner(`${distance} m`, `${ramp.name}: needs ${ramp.minDistance} m`, 'bad', 2.2);
      return;
    }
    const count = Object.keys(landed).length;
    activities.banner(`STUNT JUMP  ${distance} m`, `${ramp.name} · ${airTime} s in the air`, 'good', 3);
    if (first) {
      activities.payout({
        id: `stunt_${ramp.id}`, title: `Stunt jump: ${ramp.name}`, reward: stuntJumpReward(distance, airTime), rep: 15,
        detail: `${distance} m · ${count} / ${ramps.length} ramps landed`, sound: 'cash', banner: false,
      });
      activities.toast(`Stunt jumps ${count} / ${ramps.length}`, 'good');
      if (ramp.marker) {
        game.markers.remove(ramp.marker);
        ramp.marker = null;
      }
    } else {
      activities.toast(`${ramp.name}: best ${landed[ramp.id]} m`, 'info');
    }
    if (count === ramps.length && !state.allBonusPaid) {
      state.allBonusPaid = true;
      activities.payout({ id: 'stuntsAll', title: 'Every stunt jump landed', reward: ALL_RAMPS_BONUS, rep: 150, detail: 'All eight ramps of Port Sarab' });
    }
  }

  function abortJump(reason) {
    jump = null;
    endSlowMotion();
    if (reason) activities.toast(reason, 'bad');
  }

  /** The world slows at the top of the arc; real time keeps the slow motion short. */
  function startSlowMotion() {
    savedScale = game.time.scale;
    game.time.scale = SLOW_MOTION;
    slowMotionLeft = SLOW_MOTION_SECONDS;
    game.cameraRig?.shake?.(0.15);
  }

  function runSlowMotion() {
    if (slowMotionLeft <= 0) return;
    slowMotionLeft -= game.time.realDt || 0.016;
    if (slowMotionLeft <= 0 || game.mode !== 'playing') endSlowMotion();
  }

  function endSlowMotion() {
    if (slowMotionLeft > 0 || game.time.scale === SLOW_MOTION) {
      if (game.time.scale === SLOW_MOTION) game.time.scale = savedScale || 1;
    }
    slowMotionLeft = 0;
  }

  /** Ramps not yet landed show on the minimap when the player is within reach of them. */
  function refreshRampMarkers() {
    const pos = game.player ? game.player.pos : null;
    if (!pos) return;
    for (const ramp of ramps) {
      const near = Math.hypot(pos.x - ramp.x, pos.z - ramp.z) < 260;
      const wanted = near && landed[ramp.id] === undefined;
      if (wanted && !ramp.marker) {
        ramp.marker = game.markers.add({ kind: 'activity', owner: 'stuntRamps', pos: { x: ramp.x, y: 0, z: ramp.z }, edge: false, color: RAMP_CORAL, label: `Stunt jump: ${ramp.name} (${ramp.minDistance} m)` });
      } else if (!wanted && ramp.marker) {
        game.markers.remove(ramp.marker);
        ramp.marker = null;
      }
    }
  }

  function stop() {
    if (jump) abortJump('');
  }

  function serialize() {
    return { landed: { ...landed }, allBonusPaid: state.allBonusPaid, jumps: state.jumps };
  }

  function deserialize(data) {
    for (const id of Object.keys(landed)) delete landed[id];
    const saved = (data && data.landed) || {};
    for (const id of Object.keys(saved)) landed[id] = saved[id];
    state.allBonusPaid = Boolean(data && data.allBonusPaid);
    state.jumps = (data && data.jumps) || 0;
    for (const ramp of ramps) {
      if (ramp.marker) game.markers.remove(ramp.marker);
      ramp.marker = null;
    }
  }

  return module;
}
