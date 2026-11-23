// Watches every car near the camera and turns what its tyres and engine are doing into effects: black
// rubber and white smoke when it slides on asphalt, golden rooster tails and ruts when it digs into the
// dunes, a dust wake behind fast cars, grey smoke from a hurt engine, flames and black smoke when it
// burns and a slow smoulder from a wreck. Running people kick up little puffs of sand on the beach.
import { MARK_RUBBER, MARK_SAND_RUT } from './skidMarks.js';
import { tyreSmokeForSlip, skidMarkStrength, sandPlumeForWheel, engineSmokeForDamage } from './effectRules.js';

/**
 * Create the watcher. `emitEffect(kind, x, y, z, options)` spawns a recipe; `skidMarks` lays tracks.
 * @returns {{update: (dt: number) => void, landed: (vehicle: Object, strength?: number) => void,
 *   stateOf: (vehicle: Object) => Object}}
 */
export function createVehicleWheelEffects(game, emitEffect, skidMarks) {
  const states = new WeakMap();
  const walkers = new WeakMap();
  const opts = { count: 1, scale: 1, vx: 0, vy: 0, vz: 0, dirX: 0, dirY: 0, dirZ: 0, alpha: 1, color: undefined, grains: undefined, fireLit: false };

  /** Look at every vehicle and every running person near the camera once a frame. */
  function update(dt) {
    if (!(dt > 0)) return;
    const list = game.vehicles && game.vehicles.list;
    if (list) for (let i = 0; i < list.length; i += 1) watchVehicle(list[i], dt);
    const crowd = game.characters && game.characters.list;
    if (crowd) watchFootsteps(crowd, dt);
  }

  function watchVehicle(v, dt) {
    if (!v || !v.pos) return;
    const st = stateOf(v);
    const cam = game.camera.position;
    const dx = v.pos.x - cam.x;
    const dz = v.pos.z - cam.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > WATCH_RADIUS * WATCH_RADIUS) {
      endAllTracks(st);
      return;
    }
    const lod = d2 < NEAR_RADIUS * NEAR_RADIUS ? 1 : 0.45;
    const spec = v.spec || FALLBACK_SPEC;
    const heading = v.heading || 0;
    const cs = Math.cos(heading);
    const sn = Math.sin(heading);
    const vx = v.vel ? v.vel.x : 0;
    const vz = v.vel ? v.vel.z : 0;
    const speed = Math.abs(typeof v.speed === 'number' ? v.speed : Math.hypot(vx, vz));
    const surface = surfaceAt(v.pos.x, v.pos.z);
    const sandy = surface === 'sand' || surface === 'beach';
    const paved = !sandy && surface !== 'water';
    const alive = !v.wrecked;
    const halfTrack = (spec.track || 1.6) * 0.5;
    const halfBase = (spec.wheelbase || 2.6) * 0.5;
    const tyreWidth = clamp((spec.width || 1.9) * 0.13, 0.18, 0.34);
    const slip = v.slip || 0;
    const direction = (v.speed || 0) >= 0 ? 1 : -1;
    const sideSlide = vx * -cs + vz * sn;

    for (let w = 0; w < 4; w += 1) {
      const wheel = v.wheels ? v.wheels[w] : null;
      const track = st.tracks[w];
      const grounded = (wheel ? wheel.grounded !== false : true) && v.grounded !== false;
      if (!grounded || !alive) {
        skidMarks.endTrack(track);
        continue;
      }
      const rear = w >= 2;
      const skid = Math.max(wheel && typeof wheel.skid === 'number' ? wheel.skid : 0, slip * (rear ? 1 : 0.55));
      const lx = (w % 2 === 0 ? 1 : -1) * halfTrack;
      const lz = (w < 2 ? 1 : -1) * halfBase;
      const wx = v.pos.x + lx * cs + lz * sn;
      const wz = v.pos.z - lx * sn + lz * cs;
      const wy = groundY(wx, wz, v.pos.y);
      if (paved) {
        const strength = skidMarkStrength(skid, speed, surface);
        if (strength > 0) {
          skidMarks.extend(track, wx, wy, wz, tyreWidth, strength, MARK_RUBBER);
          st.timers[w] += dt * tyreSmokeForSlip(skid, speed) * lod;
          while (st.timers[w] >= 1) {
            st.timers[w] -= 1;
            setOptions(1, 0.8 + 0.5 * strength, vx, vz);
            emitEffect('tyreSmoke', wx, wy + 0.25, wz, opts);
          }
        } else {
          skidMarks.endTrack(track);
        }
      } else if (sandy) {
        const rut = skidMarkStrength(skid, speed, surface);
        if (rut > 0) skidMarks.extend(track, wx, wy, wz, tyreWidth * 1.25, rut, MARK_SAND_RUT);
        else skidMarks.endTrack(track);
        const driven = spec.drive === 'awd' || (spec.drive === 'fwd' ? !rear : rear);
        st.timers[w] += dt * sandPlumeForWheel(speed, skid, driven, lod);
        while (st.timers[w] >= 1) {
          st.timers[w] -= 1;
          const kick = (2.5 + speed * 0.35 + skid * 6) * direction;
          setOptions(1, 0.8 + Math.min(1.0, speed / 25 + skid * 0.6), vx, vz);
          opts.dirX = -sn * kick - cs * sideSlide * 0.25;
          opts.dirY = 2.5 + skid * 5 + speed * 0.12;
          opts.dirZ = -cs * kick + sn * sideSlide * 0.25;
          emitEffect('sand', wx, wy + 0.2, wz, opts);
        }
      } else {
        skidMarks.endTrack(track);
      }
    }

    if (paved && alive && speed > WAKE_SPEED && v.grounded !== false) {
      st.wake += dt * (speed - WAKE_SPEED) * 0.2 * lod;
      while (st.wake >= 1) {
        st.wake -= 1;
        setOptions(1, 0.9, vx, vz);
        opts.alpha = 0.5;
        emitEffect('dust', v.pos.x - sn * halfBase * 1.3, groundY(v.pos.x, v.pos.z, v.pos.y) + 0.1, v.pos.z - cs * halfBase * 1.3, opts);
      }
    }

    const length = spec.length || 4.4;
    const bonnetX = v.pos.x + sn * length * 0.33;
    const bonnetZ = v.pos.z + cs * length * 0.33;
    const bonnetY = v.pos.y + (spec.height || 1.4) * 0.75;
    if (v.onFire) {
      const width = spec.width || 1.9;
      const top = v.pos.y + (spec.height || 1.4) * 0.7;
      st.fire += dt * 18 * lod;
      while (st.fire >= 1) {
        st.fire -= 1;
        const along = length * (Math.random() * 0.55 - 0.15);
        const across = width * (Math.random() - 0.5) * 0.6;
        setOptions(1, 1.25, vx, vz);
        emitEffect('fire', v.pos.x + sn * along + cs * across, top, v.pos.z + cs * along - sn * across, opts);
      }
      st.smoke += dt * 6 * lod;
      while (st.smoke >= 1) {
        st.smoke -= 1;
        setOptions(1, 1.1, vx, vz);
        opts.fireLit = true;
        emitEffect('blackSmoke', bonnetX, top + 1.2, bonnetZ, opts);
      }
      st.light += dt * 8;
      while (st.light >= 1) {
        st.light -= 1;
        setOptions(1, 0.9 + Math.random() * 0.2, 0, 0);
        emitEffect('glowPool', v.pos.x + sn * length * 0.15, groundY(v.pos.x, v.pos.z, v.pos.y), v.pos.z + cs * length * 0.15, opts);
      }
    } else if (v.wrecked) {
      if (st.wreckedAt < 0) st.wreckedAt = game.time.elapsed;
      const ember = Math.max(0, 1 - (game.time.elapsed - st.wreckedAt) / SMOULDER_SECONDS);
      if (ember > 0) {
        st.smoke += dt * (0.8 + 2.2 * ember) * lod;
        while (st.smoke >= 1) {
          st.smoke -= 1;
          setOptions(1, 0.55 + 0.45 * ember, 0, 0);
          opts.alpha = 0.35 + 0.65 * ember;
          emitEffect('blackSmoke', v.pos.x, v.pos.y + (spec.height || 1.4) * 0.9, v.pos.z, opts);
        }
      }
    } else {
      const maxHealth = spec.health || 1000;
      const health = typeof v.health === 'number' ? v.health : maxHealth;
      const hurt = engineSmokeForDamage(health / maxHealth, !!v.smoking);
      if (hurt >= 0) {
        st.smoke += dt * (2 + 7 * hurt) * lod;
        while (st.smoke >= 1) {
          st.smoke -= 1;
          setOptions(1, 0.5 + 0.4 * hurt, vx, vz);
          opts.color = hurt > 0.6 ? 0x5e5955 : 0x9a948e;
          emitEffect('smoke', bonnetX, bonnetY, bonnetZ, opts);
        }
      }
    }
    if (!v.wrecked) st.wreckedAt = -1;
  }

  /** A burst of dust or sand under the wheels when a car comes down from a jump. */
  function landed(v, strength = 1) {
    if (!v || !v.pos) return;
    const s = clamp(strength, 0.3, 2);
    const spec = v.spec || FALLBACK_SPEC;
    const heading = v.heading || 0;
    const cs = Math.cos(heading);
    const sn = Math.sin(heading);
    const surface = surfaceAt(v.pos.x, v.pos.z);
    const sandy = surface === 'sand' || surface === 'beach';
    for (let w = 0; w < 4; w += 1) {
      const lx = (w % 2 === 0 ? 1 : -1) * (spec.track || 1.6) * 0.5;
      const lz = (w < 2 ? 1 : -1) * (spec.wheelbase || 2.6) * 0.5;
      const wx = v.pos.x + lx * cs + lz * sn;
      const wz = v.pos.z - lx * sn + lz * cs;
      const wy = groundY(wx, wz, v.pos.y);
      setOptions(sandy ? 2 : 2, (sandy ? 0.9 : 0.75) * s, v.vel ? v.vel.x : 0, v.vel ? v.vel.z : 0);
      opts.dirX = lx * cs * 1.5;
      opts.dirY = sandy ? 2.2 * s : 0.4;
      opts.dirZ = -lx * sn * 1.5;
      emitEffect(sandy ? 'sand' : 'dust', wx, wy + 0.1, wz, opts);
    }
  }

  function watchFootsteps(crowd, dt) {
    const cam = game.camera.position;
    let looked = 0;
    for (let i = 0; i < crowd.length && looked < MAX_WALKERS; i += 1) {
      const c = crowd[i];
      if (!c || !c.pos || c.vehicle || c.grounded === false) continue;
      if (c.state !== 'run' && c.state !== 'sprint') continue;
      const dx = c.pos.x - cam.x;
      const dz = c.pos.z - cam.z;
      if (dx * dx + dz * dz > FOOTSTEP_RADIUS * FOOTSTEP_RADIUS) continue;
      looked += 1;
      const surface = surfaceAt(c.pos.x, c.pos.z);
      if (surface !== 'sand' && surface !== 'beach') continue;
      let st = walkers.get(c);
      if (!st) {
        st = { timer: Math.random(), foot: 0 };
        walkers.set(c, st);
      }
      st.timer += dt * (c.state === 'sprint' ? 3.4 : 2.7);
      if (st.timer < 1) continue;
      st.timer -= 1;
      st.foot = 1 - st.foot;
      const side = st.foot ? 0.13 : -0.13;
      const h = c.heading || 0;
      const vx = c.vel ? c.vel.x : 0;
      const vz = c.vel ? c.vel.z : 0;
      setOptions(1, 0.3, 0, 0);
      opts.grains = 1;
      opts.dirX = -vx * 0.15;
      opts.dirY = 1.1;
      opts.dirZ = -vz * 0.15;
      emitEffect('sand', c.pos.x + Math.cos(h) * side, groundY(c.pos.x, c.pos.z, c.pos.y) + 0.05, c.pos.z - Math.sin(h) * side, opts);
    }
  }

  /** The effect bookkeeping kept for one vehicle (its four tracks and emission timers). */
  function stateOf(v) {
    let st = states.get(v);
    if (!st) {
      st = {
        tracks: [skidMarks.createTrack(), skidMarks.createTrack(), skidMarks.createTrack(), skidMarks.createTrack()],
        timers: new Float32Array(4),
        wake: 0, fire: 0, smoke: 0, light: 0, wreckedAt: -1, lastHit: -10,
      };
      states.set(v, st);
    }
    return st;
  }

  function endAllTracks(st) {
    for (let w = 0; w < 4; w += 1) skidMarks.endTrack(st.tracks[w]);
  }

  function setOptions(count, scale, vx, vz) {
    opts.count = count;
    opts.scale = scale;
    opts.vx = vx;
    opts.vy = 0;
    opts.vz = vz;
    opts.dirX = 0;
    opts.dirY = 0;
    opts.dirZ = 0;
    opts.alpha = 1;
    opts.color = undefined;
    opts.grains = undefined;
    opts.fireLit = false;
  }

  function surfaceAt(x, z) {
    const terrain = game.terrain;
    if (!terrain || typeof terrain.surfaceAt !== 'function') return 'road';
    return terrain.surfaceAt(x, z) || 'road';
  }

  function groundY(x, z, fallback) {
    const terrain = game.terrain;
    if (!terrain || typeof terrain.heightAt !== 'function') return fallback;
    const h = terrain.heightAt(x, z);
    return Number.isFinite(h) ? h : fallback;
  }

  return { update, landed, stateOf };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

const WATCH_RADIUS = 170;
const NEAR_RADIUS = 70;
const WAKE_SPEED = 18;
const SMOULDER_SECONDS = 50;
const FOOTSTEP_RADIUS = 35;
const MAX_WALKERS = 40;
const FALLBACK_SPEC = { track: 1.6, wheelbase: 2.6, width: 1.9, length: 4.4, height: 1.4, health: 1000, drive: 'rwd' };
