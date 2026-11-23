// The effects director of Port Sarab, game.effects. It owns the particle pools, skid marks, light glows,
// explosions, tracers and mission beacons, and turns what happens in the game into something you can
// see: sparks and debris when cars crash, muzzle flashes and tracers in a firefight, a fireball and a
// screen flash when something blows up, splashes, dust and smoke. About six draw calls in all.
import * as THREE from 'three';
import { createParticleSystem } from './particleEffects.js';
import { createParticleRecipes, EFFECT_KINDS } from './particleRecipes.js';
import { createSkidMarks } from './skidMarks.js';
import { createLightGlows } from './lightGlows.js';
import { createExplosionEffects } from './explosionEffects.js';
import { createBulletTracers } from './bulletTracers.js';
import { createMarkerBeacons } from './markerBeacons.js';
import { createVehicleWheelEffects } from './vehicleWheelEffects.js';
import { explosionShakeAtDistance, explosionFlashAtDistance } from './effectRules.js';

/**
 * Create game.effects and start listening to the game's events.
 * @returns {{spawn: Function, tracer: Function, muzzleFlash: Function, bulletImpact: Function,
 *   explosion: Function, flash: Function, glows: Object, skidMarks: Object, beacons: Object,
 *   particles: Object, kinds: string[], update: Function, stats: Function, clear: Function}}
 */
export function createEffects(game) {
  const particles = createParticleSystem(game);
  const recipes = createParticleRecipes(game, particles);
  const skidMarks = createSkidMarks(game);
  const glows = createLightGlows(game);
  const explosions = createExplosionEffects(game, particles, skidMarks, recipes.groundAt);
  const tracers = createBulletTracers(game, particles, recipes.emit);
  const beacons = createMarkerBeacons(game);
  const wheels = createVehicleWheelEffects(game, recipes.emit, skidMarks);
  const screenFlash = createScreenFlash(game);
  const recentBlasts = [];
  for (let i = 0; i < 6; i += 1) recentBlasts.push({ x: 0, y: 0, z: 0, time: -100 });
  let nextRecent = 0;
  const opts = { count: 1, scale: 1, vx: 0, vy: 0, vz: 0, dirX: 0, dirY: 0, dirZ: 0, color: undefined, alpha: 1, metal: false, speed: 0 };
  const thinOpts = { count: 1 };

  /**
   * Spawn a burst of `kind` at (x, y, z): 'dust'|'sand'|'smoke'|'blackSmoke'|'fire'|'sparks'|'impact'|'debris'|
   * 'glass'|'splash'|'muzzle'|'tyreSmoke'|'blood'|'leaves'. Far from the camera bursts thin out, beyond 450 m they are skipped.
   */
  function spawn(kind, x, y, z, options) {
    const d2 = distanceSqToCamera(x, z);
    if (d2 > SPAWN_RADIUS * SPAWN_RADIUS) return false;
    if (d2 > 160 * 160 && options && options.count > 2 && options !== thinOpts) {
      for (const key in thinOpts) thinOpts[key] = undefined;
      Object.assign(thinOpts, options);
      thinOpts.count = Math.max(1, Math.round(options.count * 0.5));
      return recipes.emit(kind, x, y, z, thinOpts);
    }
    return recipes.emit(kind, x, y, z, options);
  }

  /** A tracer streak from a muzzle (a) to where the bullet lands (b). options: speed, length, width, color. */
  function tracer(ax, ay, az, bx, by, bz, options) {
    if (distanceSqToCamera(ax, az) > SPAWN_RADIUS * SPAWN_RADIUS && distanceSqToCamera(bx, bz) > SPAWN_RADIUS * SPAWN_RADIUS) return;
    tracers.fire(ax, ay, az, bx, by, bz, options);
  }

  /** A muzzle flash at (x, y, z) firing along (dirX, dirY, dirZ). */
  function muzzleFlash(x, y, z, dirX, dirY, dirZ, scale = 1) {
    if (distanceSqToCamera(x, z) > SPAWN_RADIUS * SPAWN_RADIUS) return;
    tracers.muzzleFlash(x, y, z, dirX, dirY, dirZ, scale);
  }

  /** What a bullet does where it lands; `what` is the vehicle or person it hit, if any. */
  function bulletImpact(x, y, z, nx, ny, nz, what) {
    if (distanceSqToCamera(x, z) > SPAWN_RADIUS * SPAWN_RADIUS) return;
    tracers.impact(x, y, z, nx, ny, nz, what);
  }

  /**
   * Blow something up at (x, y, z): the full fireball, smoke column, shock ring, debris and scorch, a
   * camera shake and a screen flash scaled by distance. A second call at the same spot within half a
   * second is ignored, so a system may both call this and emit 'explosion'.
   * options: { color: debris colour, scorch: false, shake: false, flash: false }
   */
  function explosion(x, y, z, radius = 4, options) {
    const now = game.time.elapsed;
    for (let i = 0; i < recentBlasts.length; i += 1) {
      const b = recentBlasts[i];
      if (now - b.time < 0.5 && Math.abs(b.x - x) < 3 && Math.abs(b.z - z) < 3 && Math.abs(b.y - y) < 3) return;
    }
    const slot = recentBlasts[nextRecent];
    nextRecent = (nextRecent + 1) % recentBlasts.length;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.time = now;
    const camera = game.camera.position;
    const dist = Math.hypot(camera.x - x, camera.y - y, camera.z - z);
    if (dist < SPAWN_RADIUS * 1.5) explosions.explode(x, y, z, radius, options);
    const shake = explosionShakeAtDistance(dist, radius);
    if (shake > 0 && !(options && options.shake === false)) {
      const rig = game.cameraRig;
      if (rig && typeof rig.shake === 'function') rig.shake(shake);
    }
    const glare = explosionFlashAtDistance(dist, radius);
    if (glare > 0 && !(options && options.flash === false)) flash(0xfff0d0, glare);
  }

  /** A brief full-screen tint of `color` (0xRRGGBB) at `strength` 0..1 that fades within half a second. */
  function flash(color, strength = 0.5) {
    screenFlash.trigger(color, strength);
  }

  /** Run every effect for one frame. Emitters first, so what they spawn is drawn this frame. */
  function update(dt) {
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    wheels.update(step);
    explosions.update(step);
    particles.update(step);
    skidMarks.update(step);
    glows.update(step);
    beacons.update(step);
    screenFlash.update(game.time.realDt || step);
  }

  /** How much is alive right now, for the debug overlay. */
  function stats() {
    return {
      particles: particles.liveCount(),
      softParticles: particles.soft.count,
      glowParticles: particles.glow.count,
      glows: glows.count,
      beacons: beacons.count,
      skidQuads: skidMarks.quadsWritten,
      blasts: explosions.activeCount,
    };
  }

  /** Remove every particle and mark (a loaded game or a new scene). */
  function clear() {
    particles.clear();
    skidMarks.clear();
  }

  function distanceSqToCamera(x, z) {
    const camera = game.camera.position;
    const dx = x - camera.x;
    const dz = z - camera.z;
    return dx * dx + dz * dz;
  }

  // ---- what the game's events look like --------------------------------------------------------------

  /** Two cars meet, or a car meets a wall: sparks, flakes of paint, dust, glass on a hard hit, a shake. */
  function onVehicleCollision(e) {
    const v = e && e.vehicle;
    if (!v || !v.pos) return;
    const x = Number.isFinite(e.x) ? e.x : v.pos.x;
    const y = Number.isFinite(e.y) ? e.y : v.pos.y + 0.6;
    const z = Number.isFinite(e.z) ? e.z : v.pos.z;
    const mass = (v.spec && v.spec.mass) || 1400;
    const dv = Number.isFinite(e.impulse) ? e.impulse / mass : e.speed || 0;
    const strength = Math.min(1.6, dv / 12);
    if (strength < 0.04) return;
    const involvesPlayer = v.isPlayer || (e.other && e.other.isPlayer);
    if (involvesPlayer) {
      const rig = game.cameraRig;
      if (rig && typeof rig.shake === 'function') rig.shake(Math.min(1, strength * 0.6));
    }
    if (distanceSqToCamera(x, z) > SPAWN_RADIUS * SPAWN_RADIUS) return;
    const st = wheels.stateOf(v);
    const now = game.time.elapsed;
    const scraping = now - st.lastHit < 0.15;
    st.lastHit = now;
    const nx = e.nx || 0;
    const nz = e.nz || 0;
    resetOptions();
    opts.count = scraping ? 2 + Math.round(strength * 3) : 5 + Math.round(strength * 14);
    opts.speed = 6 + strength * 6;
    opts.dirX = nx * 3 + (v.vel ? v.vel.x * 0.3 : 0);
    opts.dirY = 1.5;
    opts.dirZ = nz * 3 + (v.vel ? v.vel.z * 0.3 : 0);
    recipes.emit('sparks', x, y, z, opts);
    if (scraping) return;
    if (strength > 0.22) {
      resetOptions();
      opts.count = 2 + Math.round(strength * 5);
      opts.scale = 0.5 + strength * 0.35;
      opts.color = typeof v.color === 'number' ? v.color : undefined;
      opts.dirX = nx * 2;
      opts.dirZ = nz * 2;
      recipes.emit('debris', x, y, z, opts);
    }
    resetOptions();
    opts.count = 1 + Math.round(strength * 3);
    opts.scale = 0.7 + strength * 0.4;
    recipes.emit('dust', x, Math.max(y - 0.5, recipes.groundAt(x, z, y - 0.5)), z, opts);
    if (strength > 0.85) {
      resetOptions();
      opts.count = 6 + Math.round(strength * 4);
      opts.dirX = nx * 1.5;
      opts.dirZ = nz * 1.5;
      recipes.emit('glass', x, y + 0.4, z, opts);
    }
  }

  /** A gun goes off: flash at the muzzle, a tracer to the hit, and the right kind of hit puff. */
  function onShotFired(e) {
    if (!e) return;
    const x = e.x;
    const y = e.y;
    const z = e.z;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    const dirX = e.dirX || 0;
    const dirY = e.dirY || 0;
    const dirZ = e.dirZ || 0;
    const flashScale = MUZZLE_SCALE[e.model] || MUZZLE_SCALE[e.weaponId] || 1;
    muzzleFlash(x, y, z, dirX, dirY, dirZ, flashScale);
    const hasHit = Number.isFinite(e.hitX) && Number.isFinite(e.hitY) && Number.isFinite(e.hitZ);
    const bx = hasHit ? e.hitX : x + dirX * 120;
    const by = hasHit ? e.hitY : y + dirY * 120;
    const bz = hasHit ? e.hitZ : z + dirZ * 120;
    tracer(x, y, z, bx, by, bz, flashScale > 1.3 ? TRACER_BIG : undefined);
    if (!hasHit) return;
    // `hit` is what the bullet struck: 'world' | 'vehicle' | 'character' (or the object itself), `target` the object.
    const what = e.target || (e.hit && typeof e.hit === 'object' ? e.hit : null);
    const kind = typeof e.hit === 'string' ? e.hit : what && what.spec ? 'vehicle' : what && what.intent ? 'character' : e.hit ? 'world' : null;
    if (kind === 'world' || kind === 'vehicle') bulletImpact(bx, by, bz, -dirX, -dirY, -dirZ, kind === 'vehicle' ? what : null);
  }

  /** A person is hit by a bullet: a small dark puff where it struck. */
  function onCharacterDamaged(e) {
    if (!e || e.kind !== 'bullet' || !e.character || !e.character.pos) return;
    const c = e.character;
    if (distanceSqToCamera(c.pos.x, c.pos.z) > 120 * 120) return;
    resetOptions();
    opts.count = 3;
    opts.dirY = 0.3;
    recipes.emit('blood', c.pos.x, c.pos.y + 1.2, c.pos.z, opts);
  }

  /** A person thrown to the ground: dust (or sand) where they land. */
  function onKnockedDown(e) {
    const c = e && e.character;
    if (!c || !c.pos) return;
    if (distanceSqToCamera(c.pos.x, c.pos.z) > 120 * 120) return;
    const surface = game.terrain && typeof game.terrain.surfaceAt === 'function' ? game.terrain.surfaceAt(c.pos.x, c.pos.z) : 'road';
    resetOptions();
    opts.count = 3;
    opts.scale = 0.6;
    opts.dirY = 1;
    recipes.emit(surface === 'sand' || surface === 'beach' ? 'sand' : 'dust', c.pos.x, c.pos.y + 0.1, c.pos.z, opts);
  }

  /** A car goes into the gulf. */
  function onVehicleSunk(e) {
    const v = e && e.vehicle;
    if (!v || !v.pos) return;
    const sea = game.config && game.config.world && Number.isFinite(game.config.world.seaLevel) ? game.config.world.seaLevel : 0;
    resetOptions();
    opts.count = 26;
    opts.scale = 1.6;
    opts.vx = v.vel ? v.vel.x : 0;
    opts.vz = v.vel ? v.vel.z : 0;
    spawn('splash', v.pos.x, Math.max(sea, Math.min(v.pos.y, sea + 0.2)), v.pos.z, opts);
  }

  /** A car flattens a lamp, a palm, a hydrant or a kiosk. */
  function onPropBroken(e) {
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return;
    if (distanceSqToCamera(e.x, e.z) > SPAWN_RADIUS * SPAWN_RADIUS) return;
    const kind = String((e.collider && e.collider.kind) || '');
    const ground = recipes.groundAt(e.x, e.z, 0);
    const v = e.vehicle;
    resetOptions();
    opts.vx = v && v.vel ? v.vel.x : 0;
    opts.vz = v && v.vel ? v.vel.z : 0;
    if (/palm|tree|plant|bush/i.test(kind)) {
      opts.count = 7;
      recipes.emit('leaves', e.x, ground + 3, e.z, opts);
      opts.count = 4;
      opts.color = 0x7a5a3a;
      recipes.emit('debris', e.x, ground + 0.6, e.z, opts);
    } else if (/hydrant|fountain|water|pipe/i.test(kind)) {
      opts.count = 22;
      opts.scale = 1.3;
      recipes.emit('splash', e.x, ground + 0.4, e.z, opts);
    } else if (/lamp|light|sign|neon|signal/i.test(kind)) {
      opts.count = 14;
      opts.dirY = 3;
      recipes.emit('sparks', e.x, ground + 1.2, e.z, opts);
      opts.count = 6;
      recipes.emit('glass', e.x, ground + 1.5, e.z, opts);
      opts.count = 3;
      opts.color = 0x6a6e74;
      recipes.emit('debris', e.x, ground + 0.6, e.z, opts);
    } else {
      opts.count = 6;
      opts.color = /bin|trash|cone|barrier/i.test(kind) ? 0xd06a30 : undefined;
      recipes.emit('debris', e.x, ground + 0.6, e.z, opts);
      opts.count = 4;
      opts.dirY = 2;
      opts.color = undefined;
      recipes.emit('sparks', e.x, ground + 0.6, e.z, opts);
    }
    opts.count = 2;
    opts.scale = 0.8;
    opts.color = undefined;
    recipes.emit('dust', e.x, ground + 0.2, e.z, opts);
  }

  /** A car is wrecked: a burst of black smoke, glass and sparks (the fire that follows is watched per frame). */
  function onVehicleDestroyed(e) {
    const v = e && e.vehicle;
    if (!v || !v.pos) return;
    if (distanceSqToCamera(v.pos.x, v.pos.z) > SPAWN_RADIUS * SPAWN_RADIUS) return;
    const y = v.pos.y + ((v.spec && v.spec.height) || 1.4) * 0.7;
    resetOptions();
    opts.count = 4;
    opts.scale = 1.1;
    recipes.emit('blackSmoke', v.pos.x, y, v.pos.z, opts);
    opts.count = 10;
    recipes.emit('glass', v.pos.x, y, v.pos.z, opts);
    opts.count = 16;
    opts.dirY = 3;
    recipes.emit('sparks', v.pos.x, y, v.pos.z, opts);
  }

  function onExplosion(e) {
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return;
    const y = Number.isFinite(e.y) ? e.y : recipes.groundAt(e.x, e.z, 0) + 0.5;
    explosion(e.x, y, e.z, Number.isFinite(e.radius) ? e.radius : 4, e.color === undefined ? undefined : { color: e.color });
  }

  function onVehicleLanded(e) {
    const v = e && (e.vehicle || e);
    if (!v || !v.pos) return;
    const strength = Number.isFinite(e.impact) ? e.impact / 8 : Number.isFinite(e.speed) ? e.speed / 8 : 1;
    wheels.landed(v, strength);
  }

  function resetOptions() {
    opts.count = 1;
    opts.scale = 1;
    opts.vx = 0;
    opts.vy = 0;
    opts.vz = 0;
    opts.dirX = 0;
    opts.dirY = 0;
    opts.dirZ = 0;
    opts.color = undefined;
    opts.alpha = 1;
    opts.metal = false;
    opts.speed = 0;
  }

  const events = game.events;
  if (events) {
    events.on('vehicle:collision', onVehicleCollision);
    events.on('vehicle:landed', onVehicleLanded);
    events.on('vehicle:sunk', onVehicleSunk);
    events.on('vehicle:destroyed', onVehicleDestroyed);
    events.on('prop:broken', onPropBroken);
    events.on('explosion', onExplosion);
    events.on('shot:fired', onShotFired);
    events.on('character:damaged', onCharacterDamaged);
    events.on('character:knockedDown', onKnockedDown);
    events.on('vehicle:despawned', (e) => glows.removeFor(e && e.vehicle));
  }

  return {
    spawn, tracer, muzzleFlash, bulletImpact, explosion, flash, update, stats, clear,
    glows, skidMarks, beacons, particles, kinds: EFFECT_KINDS,
  };
}

/**
 * A full-screen tint drawn as one triangle over everything: warm white for a blast, red for a hit.
 * It is only drawn while it shows, and stronger at the screen's edges than its centre.
 */
function createScreenFlash(game) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const uniforms = { uColor: { value: new THREE.Color(1, 1, 1) }, uStrength: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FLASH_VERTEX_SHADER,
    fragmentShader: FLASH_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  mesh.visible = false;
  mesh.name = 'effects-screen-flash';
  game.scene.add(mesh);
  let strength = 0;

  return {
    trigger(color, amount) {
      uniforms.uColor.value.set(color === undefined ? 0xffffff : color);
      strength = Math.min(1, Math.max(strength, amount));
      uniforms.uStrength.value = strength;
      mesh.visible = strength > 0.01;
    },
    update(dt) {
      if (strength <= 0) return;
      strength *= Math.exp(-dt * 6);
      if (strength < 0.01) strength = 0;
      uniforms.uStrength.value = strength;
      mesh.visible = strength > 0;
    },
  };
}

const SPAWN_RADIUS = 450;
const TRACER_BIG = Object.freeze({ width: 0.12, length: 8 });
/** How big each gun's muzzle flash is, by weapon model (or id). */
const MUZZLE_SCALE = Object.freeze({ pistol: 1, smg: 1.15, rifle: 1.45, marksman: 1.6, shotgun: 1.75 });

const FLASH_VERTEX_SHADER = /* glsl */ `
varying vec2 vScreen;
void main() {
  vScreen = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FLASH_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vScreen;
void main() {
  float edge = smoothstep(0.25, 1.35, length(vScreen));
  gl_FragColor = vec4(uColor, uStrength * mix(0.55, 1.0, edge));
  #include <colorspace_fragment>
}
`;
