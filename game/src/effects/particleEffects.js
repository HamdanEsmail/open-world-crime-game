// The pooled particle system behind every puff of road dust, golden sand plume, smoke column, flame and
// spark in Port Sarab. Two batches, two draw calls: soft alpha-blended plumes sorted far to near and lit
// by the sun (orange at golden hour, dim at night), and additive fire, sparks and flashes. Typed arrays
// and free lists throughout: nothing is allocated per frame.
import * as THREE from 'three';
import { paintParticleAtlas, PARTICLE_FRAMES } from './particleSpriteAtlas.js';
import { PARTICLE_VERTEX_SHADER, PARTICLE_FRAGMENT_SHADER } from './particleShaders.js';

/** Which batch a particle joins: soft (alpha-blended, lit by the sky) or glow (additive light). */
export const BLEND_SOFT = 0;
export const BLEND_GLOW = 1;

/** Particle flags. */
export const FLAG_FLAT = 1; // lies flat on the ground instead of facing the camera
export const FLAG_FROZEN = 2; // stays where it was born; its velocity only orients a streak
export const FLAG_DIE_ON_FLOOR = 4; // vanishes when it falls to its floor (droplets, sand grains)
export const FLAG_OVERLAY = 8; // drawn in front of the scene (the instant flash of a blast in plain view)

/** What a flying particle leaves behind it as it goes. */
export const TRAIL_SMOKE = 1;
export const TRAIL_BLACK_SMOKE = 2;
export const TRAIL_FIRE = 3;

/**
 * Create the particle pools and add their two meshes to game.scene.
 * Emit with the shared spec:  const s = particles.spec(); s.x = 1; ...; particles.emit(s);
 * @param {Object} game
 * @param {{softCapacity?: number, glowCapacity?: number}} [options]
 */
export function createParticleSystem(game, options = {}) {
  const atlas = paintParticleAtlas();
  const shared = {
    uPixelScale: { value: 0.001 },
    uNear: { value: 0.3 },
    uSunTint: { value: new THREE.Color(1.1, 1.05, 0.95) },
    uShadeTint: { value: new THREE.Color(0.66, 0.7, 0.8) },
    uAtlas: { value: atlas },
  };
  const soft = createParticleBatch(options.softCapacity || 1600, false, shared);
  const glow = createParticleBatch(options.glowCapacity || 1000, true, shared);
  soft.mesh.renderOrder = 3;
  glow.mesh.renderOrder = 5;
  game.scene.add(soft.mesh);
  game.scene.add(glow.mesh);

  const scratch = createParticleSpec();
  const trailSpec = createParticleSpec();
  const wind = { x: 0.8, z: -0.45, strength: 1 };
  const sunColor = new THREE.Color();
  const shadeColor = new THREE.Color();
  const forward = new THREE.Vector3();

  /** The shared spec, reset to defaults. Fill it in and pass it to emit(). */
  function spec() {
    return resetParticleSpec(scratch);
  }

  /** Start one particle from a spec. Returns its slot, or -1 when nothing could be spawned. */
  function emit(s) {
    const b = s.blend === BLEND_GLOW ? glow : soft;
    let i;
    if (b.freeCount > 0) {
      b.freeCount -= 1;
      i = b.free[b.freeCount];
      b.alive[b.count] = i;
      b.count += 1;
    } else {
      if (b.count === 0) return -1;
      b.cursor = (b.cursor + 1) % b.count;
      i = b.alive[b.cursor];
    }
    b.px[i] = s.x; b.py[i] = s.y; b.pz[i] = s.z;
    b.vx[i] = s.vx; b.vy[i] = s.vy; b.vz[i] = s.vz;
    b.age[i] = -Math.max(0, s.delay);
    b.life[i] = Math.max(0.01, s.life);
    b.size0[i] = s.size0; b.size1[i] = s.size1;
    b.rot[i] = s.rot; b.rotVel[i] = s.rotVel;
    const c = i * 9;
    b.col[c] = s.c0.r; b.col[c + 1] = s.c0.g; b.col[c + 2] = s.c0.b;
    b.col[c + 3] = s.c1.r; b.col[c + 4] = s.c1.g; b.col[c + 5] = s.c1.b;
    b.col[c + 6] = s.c2.r; b.col[c + 7] = s.c2.g; b.col[c + 8] = s.c2.b;
    b.mid[i] = Math.min(0.99, Math.max(0.01, s.mid));
    b.alpha[i] = s.alpha;
    b.fadeIn[i] = Math.max(0.0001, s.fadeIn);
    b.fadeOut[i] = Math.min(0.9999, s.fadeOut);
    b.drag[i] = s.drag; b.gravity[i] = s.gravity; b.wind[i] = s.wind;
    b.bounce[i] = s.bounce; b.floorY[i] = s.floorY;
    b.frame[i] = s.frame; b.stretch[i] = s.stretch;
    b.flags[i] = s.flags; b.lit[i] = s.lit; b.glowEnd[i] = s.glowEnd;
    b.trail[i] = s.trail; b.trailTimer[i] = Math.random() * TRAIL_INTERVAL;
    return i;
  }

  /** Move, age and draw every particle. */
  function update(dt) {
    refreshWind();
    if (dt > 0) {
      simulateBatch(soft, dt);
      simulateBatch(glow, dt);
    }
    refreshLighting();
    game.camera.getWorldDirection(forward);
    writeBatch(soft, true);
    writeBatch(glow, false);
  }

  function simulateBatch(b, dt) {
    const windX = wind.x * wind.strength;
    const windZ = wind.z * wind.strength;
    for (let n = 0; n < b.count; n += 1) {
      const i = b.alive[n];
      const age = b.age[i] + dt;
      b.age[i] = age;
      if (age < 0) continue;
      if (age >= b.life[i]) {
        killAt(b, n);
        n -= 1;
        continue;
      }
      b.rot[i] += b.rotVel[i] * dt;
      if (b.flags[i] & FLAG_FROZEN) continue;
      const keep = Math.exp(-b.drag[i] * dt);
      const w = b.wind[i];
      b.vx[i] = windX * w + (b.vx[i] - windX * w) * keep;
      b.vz[i] = windZ * w + (b.vz[i] - windZ * w) * keep;
      b.vy[i] = b.vy[i] * keep - b.gravity[i] * dt;
      b.px[i] += b.vx[i] * dt;
      b.py[i] += b.vy[i] * dt;
      b.pz[i] += b.vz[i] * dt;
      if (b.py[i] < b.floorY[i]) {
        if (b.flags[i] & FLAG_DIE_ON_FLOOR) {
          killAt(b, n);
          n -= 1;
          continue;
        }
        if (b.bounce[i] >= 0) {
          b.py[i] = b.floorY[i];
          if (b.vy[i] < 0) b.vy[i] = -b.vy[i] * b.bounce[i];
          b.vx[i] *= 0.55;
          b.vz[i] *= 0.55;
          b.rotVel[i] *= 0.5;
        }
      }
      if (b.trail[i] !== 0) {
        b.trailTimer[i] -= dt;
        if (b.trailTimer[i] <= 0) {
          b.trailTimer[i] += TRAIL_INTERVAL;
          const fade = 1 - age / b.life[i];
          emitTrail(b.trail[i], b.px[i], b.py[i], b.pz[i], fade);
        }
      }
    }
  }

  /** The smoke (and flame) a burning chunk of debris leaves along its arc. */
  function emitTrail(kind, x, y, z, fade) {
    const s = resetParticleSpec(trailSpec);
    s.blend = BLEND_SOFT;
    s.frame = Math.random() < 0.5 ? PARTICLE_FRAMES.WISP : PARTICLE_FRAMES.PUFF;
    s.x = x; s.y = y; s.z = z;
    s.vx = (Math.random() - 0.5) * 0.6;
    s.vy = 0.4 + Math.random() * 0.5;
    s.vz = (Math.random() - 0.5) * 0.6;
    s.rot = Math.random() * 6.28;
    s.rotVel = (Math.random() - 0.5) * 1.2;
    s.drag = 1.4;
    s.gravity = -0.5;
    s.wind = 0.8;
    s.fadeIn = 0.05;
    s.fadeOut = 0.3;
    if (kind === TRAIL_SMOKE) {
      s.life = 0.9 + Math.random() * 0.5;
      s.size0 = 0.2; s.size1 = 1.3;
      s.c0.setHex(0x6e6964); s.c1.setHex(0x7d7873); s.c2.setHex(0x8c8782);
      s.alpha = 0.34 * fade;
    } else {
      s.life = 1.3 + Math.random() * 0.7;
      s.size0 = 0.35; s.size1 = 2.1;
      s.c0.setHex(0x2a2522); s.c1.setHex(0x312c29); s.c2.setHex(0x4a4542);
      s.alpha = 0.55 * fade;
    }
    emit(s);
    if (kind === TRAIL_FIRE && fade > 0.3) {
      const f = resetParticleSpec(trailSpec);
      f.blend = BLEND_GLOW;
      f.frame = PARTICLE_FRAMES.FLAME;
      f.x = x; f.y = y; f.z = z;
      f.vy = 1.2;
      f.life = 0.22 + Math.random() * 0.12;
      f.size0 = 0.75 * fade; f.size1 = 0.25;
      f.rot = (Math.random() - 0.5) * 0.4;
      f.c0.setHex(0xfff0b8); f.c1.setHex(0xff9a32); f.c2.setHex(0xa02a08);
      f.mid = 0.35; f.alpha = 0.9; f.fadeIn = 0.05; f.fadeOut = 0.4;
      emit(f);
    }
  }

  /** Pack the visible particles into the GPU buffers; the soft batch is sorted far to near. */
  function writeBatch(b, sortByDepth) {
    const cam = game.camera.position;
    const fx = forward.x;
    const fy = forward.y;
    const fz = forward.z;
    let visible = 0;
    if (sortByDepth) {
      const keys = b.keys;
      for (let n = 0; n < b.count; n += 1) {
        const i = b.alive[n];
        if (b.age[i] < 0) continue;
        const depth = (b.px[i] - cam.x) * fx + (b.py[i] - cam.y) * fy + (b.pz[i] - cam.z) * fz;
        if (depth < -6) continue;
        const q = depth <= 0 ? 0 : depth >= 60000 ? 960000 : (depth * 16) | 0;
        keys[visible] = (MAX_DEPTH_KEY - q) * KEY_STRIDE + i;
        visible += 1;
      }
      for (let k = visible; k < b.lastSorted; k += 1) keys[k] = Infinity;
      b.lastSorted = visible;
      keys.sort();
      for (let k = 0; k < visible; k += 1) writeParticle(b, keys[k] % KEY_STRIDE, k);
    } else {
      for (let n = 0; n < b.count; n += 1) {
        const i = b.alive[n];
        if (b.age[i] < 0) continue;
        writeParticle(b, i, visible);
        visible += 1;
      }
    }
    b.geometry.instanceCount = visible;
    b.mesh.visible = visible > 0;
    if (visible > 0) {
      markRange(b.aPos, visible * 4);
      markRange(b.aColor, visible * 4);
      markRange(b.aMisc, visible * 4);
      markRange(b.aVel, visible * 4);
    }
  }

  /** Work out one particle's size, colour, opacity and light for this moment, into GPU slot k. */
  function writeParticle(b, i, k) {
    const t = b.age[i] / b.life[i];
    const grow = 1 - (1 - t) * (1 - t);
    const size = b.size0[i] + (b.size1[i] - b.size0[i]) * grow;
    let a = b.alpha[i];
    const fi = b.fadeIn[i];
    if (t < fi) {
      const u = t / fi;
      a *= u * u * (3 - 2 * u);
    }
    const fo = b.fadeOut[i];
    if (t > fo) {
      const u = (1 - t) / (1 - fo);
      a *= u * u * (3 - 2 * u);
    }
    const m = b.mid[i];
    const c = i * 9;
    const col = b.col;
    let r;
    let g;
    let bl;
    if (t < m) {
      const u = t / m;
      r = col[c] + (col[c + 3] - col[c]) * u;
      g = col[c + 1] + (col[c + 4] - col[c + 1]) * u;
      bl = col[c + 2] + (col[c + 5] - col[c + 2]) * u;
    } else {
      const u = (t - m) / (1 - m);
      r = col[c + 3] + (col[c + 6] - col[c + 3]) * u;
      g = col[c + 4] + (col[c + 7] - col[c + 4]) * u;
      bl = col[c + 5] + (col[c + 8] - col[c + 5]) * u;
    }
    let lit = b.lit[i];
    const ge = b.glowEnd[i];
    if (ge > 0 && t < ge) {
      const start = ge * 0.3;
      if (t <= start) lit = 0;
      else {
        const u = (t - start) / (ge - start);
        lit *= u * u * (3 - 2 * u);
      }
    }
    const o = k * 4;
    const pos = b.aPos.array;
    pos[o] = b.px[i]; pos[o + 1] = b.py[i]; pos[o + 2] = b.pz[i]; pos[o + 3] = size;
    const color = b.aColor.array;
    color[o] = r; color[o + 1] = g; color[o + 2] = bl; color[o + 3] = a;
    const misc = b.aMisc.array;
    const flags = b.flags[i];
    misc[o] = b.rot[i]; misc[o + 1] = b.frame[i]; misc[o + 2] = b.stretch[i];
    misc[o + 3] = flags & FLAG_FLAT ? 1 : flags & FLAG_OVERLAY ? 2 : 0;
    const vel = b.aVel.array;
    vel[o] = b.vx[i]; vel[o + 1] = b.vy[i]; vel[o + 2] = b.vz[i]; vel[o + 3] = b.additive ? 0 : lit;
  }

  /** Tint the soft batch by the sun and the sky: warm tops at golden hour, dim and blue at night. */
  function refreshLighting() {
    const sky = game.sky;
    const colors = sky && sky.colors;
    if (colors && colors.sun && colors.sun.isColor && colors.ambient && colors.ambient.isColor) {
      lightFromSkyColors(colors);
    } else {
      lightFromGuess(sky);
    }
    const camera = game.camera;
    const height = (game.renderer && game.renderer.domElement && game.renderer.domElement.height) || 800;
    shared.uPixelScale.value = (2 * Math.tan(((camera.fov || 60) * Math.PI) / 360)) / Math.max(1, height);
    shared.uNear.value = camera.near || 0.3;
  }

  /**
   * The sky hands us the light falling on a white surface from the sun and from the sky (already dim
   * at night): a puff's sunlit top gets both, its underside the sky, the sand's bounce and a little sun
   * scattered through it.
   */
  function lightFromSkyColors(colors) {
    const top = shared.uSunTint.value;
    const bottom = shared.uShadeTint.value;
    top.copy(colors.sun).multiplyScalar(0.8);
    sunColor.copy(colors.ambient).multiplyScalar(0.75);
    top.add(sunColor);
    bottom.copy(colors.ambient).multiplyScalar(0.9);
    sunColor.copy(colors.sun).multiplyScalar(0.12);
    bottom.add(sunColor);
    if (colors.ground && colors.ground.isColor) {
      shadeColor.copy(colors.ground).multiplyScalar(0.4);
      bottom.add(shadeColor);
    }
    const peak = Math.max(top.r, top.g, top.b);
    if (peak > 1.3) {
      top.multiplyScalar(1.3 / peak);
      bottom.multiplyScalar(1.3 / peak);
    }
    top.setRGB(Math.max(top.r, 0.05), Math.max(top.g, 0.06), Math.max(top.b, 0.09));
    bottom.setRGB(Math.max(bottom.r, 0.03), Math.max(bottom.g, 0.04), Math.max(bottom.b, 0.06));
  }

  /** Without the sky's colours: guess from the sun light's colour and the night factor. */
  function lightFromGuess(sky) {
    const night = sky && typeof sky.night === 'number' ? Math.min(1, Math.max(0, sky.night)) : 0;
    const colors = sky && sky.colors;
    if (!readColor(colors && (colors.sun || colors.sunLight || colors.sunColor), sunColor)
      && !readColor(sky && sky.sunLight && sky.sunLight.color, sunColor)) sunColor.setRGB(1.0, 0.9, 0.76);
    if (!readColor(colors && (colors.ambient || colors.hemiSky || colors.sky || colors.zenith), shadeColor)) {
      shadeColor.setRGB(0.62, 0.68, 0.8);
    }
    scaleToPeak(sunColor, 1.12);
    sunColor.lerp(WHITE_TOP, 0.3);
    scaleToPeak(shadeColor, 0.74);
    const day = 1 - night;
    shared.uSunTint.value.setRGB(
      sunColor.r * day + 0.16 * night, sunColor.g * day + 0.18 * night, sunColor.b * day + 0.27 * night,
    );
    shared.uShadeTint.value.setRGB(
      shadeColor.r * day + 0.07 * night, shadeColor.g * day + 0.09 * night, shadeColor.b * day + 0.15 * night,
    );
  }

  /** The breeze that bends smoke columns: the weather's wind (a gale in the khamsin), or a sea breeze. */
  function refreshWind() {
    const weather = game.weather;
    const w = weather && weather.wind;
    if (w && typeof w.x === 'number' && typeof w.z === 'number') {
      wind.x = w.x;
      wind.z = w.z;
      wind.strength = 1;
      return;
    }
    const storm = weather && typeof weather.sandstorm === 'number' ? weather.sandstorm : 0;
    wind.strength = 1 + storm * 6;
  }

  function killAt(b, n) {
    const i = b.alive[n];
    b.count -= 1;
    b.alive[n] = b.alive[b.count];
    b.free[b.freeCount] = i;
    b.freeCount += 1;
  }

  /** Remove every particle at once (a new scene, a loaded game). */
  function clear() {
    for (const b of [soft, glow]) {
      b.count = 0;
      b.freeCount = b.capacity;
      for (let i = 0; i < b.capacity; i += 1) b.free[i] = b.capacity - 1 - i;
      b.geometry.instanceCount = 0;
      b.mesh.visible = false;
    }
  }

  function liveCount() {
    return soft.count + glow.count;
  }

  return { spec, emit, update, clear, liveCount, wind, frames: PARTICLE_FRAMES, soft, glow };
}

/** One pool of particles and the instanced quad mesh that draws it. */
function createParticleBatch(capacity, additive, shared) {
  const f32 = () => new Float32Array(capacity);
  const b = {
    capacity,
    additive,
    px: f32(), py: f32(), pz: f32(), vx: f32(), vy: f32(), vz: f32(),
    age: f32(), life: f32(), size0: f32(), size1: f32(), rot: f32(), rotVel: f32(),
    col: new Float32Array(capacity * 9), mid: f32(),
    alpha: f32(), fadeIn: f32(), fadeOut: f32(),
    drag: f32(), gravity: f32(), wind: f32(), bounce: f32(), floorY: f32(),
    stretch: f32(), lit: f32(), glowEnd: f32(), trailTimer: f32(),
    frame: new Uint8Array(capacity), flags: new Uint8Array(capacity), trail: new Uint8Array(capacity),
    alive: new Int32Array(capacity), count: 0,
    free: new Int32Array(capacity), freeCount: capacity,
    cursor: 0,
    keys: new Float64Array(capacity).fill(Infinity), lastSorted: 0,
  };
  for (let i = 0; i < capacity; i += 1) b.free[i] = capacity - 1 - i;

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const instanced = () => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  b.aPos = instanced();
  b.aColor = instanced();
  b.aMisc = instanced();
  b.aVel = instanced();
  geometry.setAttribute('iPosSize', b.aPos);
  geometry.setAttribute('iColor', b.aColor);
  geometry.setAttribute('iMisc', b.aMisc);
  geometry.setAttribute('iVel', b.aVel);
  geometry.instanceCount = 0;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, shared);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    defines: additive ? { GLOW_BATCH: '' } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: !additive,
    side: THREE.DoubleSide,
  });
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;

  b.geometry = geometry;
  b.material = material;
  b.mesh = new THREE.Mesh(geometry, material);
  b.mesh.frustumCulled = false;
  b.mesh.visible = false;
  b.mesh.name = additive ? 'effects-glow-particles' : 'effects-soft-particles';
  return b;
}

/** A blank particle description with sensible defaults. */
function createParticleSpec() {
  return resetParticleSpec({
    c0: new THREE.Color(), c1: new THREE.Color(), c2: new THREE.Color(),
  });
}

function resetParticleSpec(s) {
  s.blend = BLEND_SOFT;
  s.x = 0; s.y = 0; s.z = 0;
  s.vx = 0; s.vy = 0; s.vz = 0;
  s.life = 1; s.delay = 0;
  s.size0 = 1; s.size1 = 1;
  s.rot = 0; s.rotVel = 0;
  s.c0.setRGB(1, 1, 1); s.c1.setRGB(1, 1, 1); s.c2.setRGB(1, 1, 1);
  s.mid = 0.5;
  s.alpha = 1; s.fadeIn = 0.1; s.fadeOut = 0.6;
  s.drag = 0; s.gravity = 0; s.wind = 0;
  s.bounce = -1; s.floorY = -1e9;
  s.frame = 0; s.stretch = 0; s.flags = 0;
  s.lit = 1; s.glowEnd = 0; s.trail = 0;
  return s;
}

/** Copy a colour given as a THREE.Color, a 0xRRGGBB number or a CSS string into `out`. */
function readColor(value, out) {
  if (value === undefined || value === null) return false;
  if (value.isColor) {
    out.copy(value);
    return true;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    out.set(value);
    return true;
  }
  if (typeof value.r === 'number') {
    out.setRGB(value.r, value.g, value.b);
    return true;
  }
  return false;
}

/** Scale a colour so its brightest channel is `peak`, keeping its hue. */
function scaleToPeak(color, peak) {
  const m = Math.max(color.r, color.g, color.b);
  if (m > 0.0001) color.multiplyScalar(peak / m);
  else color.setRGB(peak, peak, peak);
}

/** Upload only the used part of an instance buffer (three r159+), or all of it on older builds. */
function markRange(attribute, count) {
  if (attribute.clearUpdateRanges && attribute.addUpdateRange) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, count);
  } else if (attribute.updateRange) {
    attribute.updateRange.offset = 0;
    attribute.updateRange.count = count;
  }
  attribute.needsUpdate = true;
}

const TRAIL_INTERVAL = 0.045;
const KEY_STRIDE = 4096;
const MAX_DEPTH_KEY = 1000000;
const WHITE_TOP = new THREE.Color(1.12, 1.1, 1.06);
