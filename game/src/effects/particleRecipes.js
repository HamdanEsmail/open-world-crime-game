// What every kind of effect in Port Sarab is made of: how many particles, which sprite, which colours,
// how they fly and how long they live. game.effects.spawn('sand', x, y, z, options) lands here. The
// golden rooster tail a car throws up on the dunes is the signature look of the desert.
import { BLEND_SOFT, BLEND_GLOW, FLAG_FLAT, FLAG_DIE_ON_FLOOR } from './particleEffects.js';
import { PARTICLE_FRAMES as F } from './particleSpriteAtlas.js';
import { emitMuzzleFlash } from './bulletTracers.js';

/** The kinds game.effects.spawn() understands. */
export const EFFECT_KINDS = Object.freeze([
  'dust', 'sand', 'smoke', 'blackSmoke', 'fire', 'sparks', 'impact', 'debris', 'glass', 'splash',
  'muzzle', 'tyreSmoke', 'blood', 'leaves',
]);

/**
 * Bind the effect recipes to a particle system.
 * Options every recipe reads (all optional): count, scale, alpha, color (0xRRGGBB),
 * vx/vy/vz (velocity to inherit, e.g. the car's), dirX/dirY/dirZ (throw velocity or surface normal),
 * speed, metal (an impact on metal also throws sparks).
 * @returns {{emit: (kind: string, x: number, y: number, z: number, options?: Object) => boolean,
 *   groundAt: (x: number, z: number, fallback: number) => number, kinds: string[]}}
 */
export function createParticleRecipes(game, particles) {
  const recipes = {
    dust: emitRoadDust,
    sand: emitSandPlume,
    smoke: emitGreySmoke,
    blackSmoke: emitBlackSmoke,
    fire: emitFlames,
    sparks: emitSparks,
    impact: emitBulletImpact,
    debris: emitDebris,
    glass: emitShatteredGlass,
    splash: emitSplash,
    muzzle: emitMuzzle,
    tyreSmoke: emitTyreSmoke,
    blood: emitBloodPuff,
    leaves: emitPalmLeaves,
  };
  const innerOptions = { count: 0, scale: 1, speed: 0, dirX: 0, dirY: 0, dirZ: 0, vx: 0, vy: 0, vz: 0, color: undefined, alpha: 1 };

  /** Spawn one burst of `kind` at (x, y, z). Returns false for an unknown kind. */
  function emit(kind, x, y, z, options) {
    const recipe = recipes[kind];
    if (!recipe) return false;
    recipe(x, y, z, options || NO_OPTIONS);
    return true;
  }

  /** The ground height under (x, z), from the terrain when there is one. */
  function groundAt(x, z, fallback) {
    const terrain = game.terrain;
    if (!terrain || typeof terrain.heightAt !== 'function') return fallback;
    const h = terrain.heightAt(x, z);
    return Number.isFinite(h) ? h : fallback;
  }

  /** Golden sand thrown up by tyres on the dunes: big soft puffs and a spray of grains. */
  function emitSandPlume(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 2;
    const tx = o.dirX ?? 0;
    const ty = o.dirY ?? 2.5;
    const tz = o.dirZ ?? 0;
    const ivx = (o.vx ?? 0) * 0.35;
    const ivz = (o.vz ?? 0) * 0.35;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.6 ? F.PUFF_DENSE : F.PUFF, x + spread(0.25 * scale), y + rand(0, 0.3) * scale, z + spread(0.25 * scale));
      const k = rand(0.55, 1.1);
      s.vx = tx * k + ivx + spread(1.1) * scale;
      s.vy = ty * k + spread(0.6);
      s.vz = tz * k + ivz + spread(1.1) * scale;
      s.life = rand(1.3, 2.3) * (0.7 + 0.3 * scale);
      s.size0 = rand(0.35, 0.6) * scale;
      s.size1 = rand(2.4, 3.8) * scale;
      s.rotVel = spread(0.8);
      ramp(s, o.color ?? 0xf6d9a0, 0xe8bd72, 0xd9b682, 0.35);
      s.alpha = 0.55 * (o.alpha ?? 1);
      s.fadeIn = 0.06;
      s.fadeOut = 0.4;
      s.drag = 2.0;
      s.gravity = 1.6;
      s.wind = 0.45;
      particles.emit(s);
    }
    const grains = o.grains ?? Math.ceil(count * 0.75);
    const floor = groundAt(x, z, y - 0.3);
    for (let n = 0; n < grains; n += 1) {
      const s = start(BLEND_SOFT, F.EMBER, x + spread(0.2), y + rand(0, 0.2), z + spread(0.2));
      const k = rand(0.8, 1.4);
      s.vx = tx * k + ivx + spread(2);
      s.vy = ty * k * 1.2 + rand(0, 2);
      s.vz = tz * k + ivz + spread(2);
      s.life = rand(0.6, 1.0);
      s.size0 = rand(0.06, 0.1) * Math.max(0.7, scale);
      s.size1 = s.size0;
      s.stretch = 0.025;
      ramp(s, 0xc4924a, 0xb8873f, 0xa67a3a, 0.5);
      s.alpha = 0.9;
      s.fadeIn = 0.02;
      s.fadeOut = 0.7;
      s.drag = 0.3;
      s.gravity = 9.8;
      s.flags = FLAG_DIE_ON_FLOOR;
      s.floorY = floor;
      particles.emit(s);
    }
  }

  /** Grey-beige dust kicked up off the asphalt. */
  function emitRoadDust(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 3;
    const tint = o.color ?? 0xc2b6a4;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.5 ? F.PUFF : F.PUFF_DENSE, x + spread(0.4 * scale), y + rand(0.1, 0.4) * scale, z + spread(0.4 * scale));
      s.vx = (o.vx ?? 0) * 0.3 + spread(1.4) * scale + (o.dirX ?? 0);
      s.vy = rand(0.5, 1.4) * scale + (o.dirY ?? 0);
      s.vz = (o.vz ?? 0) * 0.3 + spread(1.4) * scale + (o.dirZ ?? 0);
      s.life = rand(1.4, 2.4);
      s.size0 = rand(0.45, 0.8) * scale;
      s.size1 = rand(2.2, 3.4) * scale;
      s.rotVel = spread(0.7);
      ramp(s, tint, tint, 0xa79d90, 0.5);
      s.alpha = 0.34 * (o.alpha ?? 1);
      s.fadeIn = 0.08;
      s.fadeOut = 0.35;
      s.drag = 1.8;
      s.gravity = -0.12;
      s.wind = 0.6;
      particles.emit(s);
    }
  }

  /** Grey smoke from a hurt engine or a smouldering wreck. */
  function emitGreySmoke(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 2;
    const tint = o.color ?? 0x9a948e;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.5 ? F.WISP : F.PUFF, x + spread(0.3 * scale), y + spread(0.2), z + spread(0.3 * scale));
      s.vx = (o.vx ?? 0) * 0.2 + spread(0.4) + (o.dirX ?? 0);
      s.vy = rand(1.0, 2.0) * Math.sqrt(scale) + (o.dirY ?? 0);
      s.vz = (o.vz ?? 0) * 0.2 + spread(0.4) + (o.dirZ ?? 0);
      s.life = rand(2.4, 3.8);
      s.size0 = 0.5 * scale;
      s.size1 = rand(3.0, 4.6) * scale;
      s.rotVel = spread(0.5);
      ramp(s, tint, 0x837e7a, 0x77736f, 0.4);
      s.alpha = 0.4 * (o.alpha ?? 1);
      s.fadeIn = 0.12;
      s.fadeOut = 0.45;
      s.drag = 0.9;
      s.gravity = -0.5;
      s.wind = 1.0;
      particles.emit(s);
    }
  }

  /** Thick black smoke from burning fuel and rubber. */
  function emitBlackSmoke(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 2;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.6 ? F.PUFF_DENSE : F.WISP, x + spread(0.4 * scale), y + spread(0.2), z + spread(0.4 * scale));
      s.vx = (o.vx ?? 0) * 0.15 + spread(0.5) + (o.dirX ?? 0);
      s.vy = rand(2.0, 3.4) * Math.sqrt(scale) + (o.dirY ?? 0);
      s.vz = (o.vz ?? 0) * 0.15 + spread(0.5) + (o.dirZ ?? 0);
      s.life = rand(3.5, 5.5);
      s.size0 = 0.8 * scale;
      s.size1 = rand(4.5, 6.5) * scale;
      s.rotVel = spread(0.4);
      ramp(s, o.color ?? 0x2b2724, 0x24201e, 0x4d4946, 0.5);
      s.alpha = 0.62 * (o.alpha ?? 1);
      s.fadeIn = 0.08;
      s.fadeOut = 0.5;
      s.drag = 0.75;
      s.gravity = -0.7;
      s.wind = 1.1;
      particles.emit(s);
    }
  }

  /** Licking flames with a warm glow under them and the odd rising ember. */
  function emitFlames(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 2;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_GLOW, Math.random() < 0.6 ? F.FLAME : F.FLAME_TALL, x + spread(0.35 * scale), y + rand(0, 0.25) * scale, z + spread(0.35 * scale));
      s.rot = spread(0.18);
      s.rotVel = spread(0.4);
      s.vx = (o.vx ?? 0) * 0.5 + spread(0.3);
      s.vy = rand(1.2, 2.4) * scale;
      s.vz = (o.vz ?? 0) * 0.5 + spread(0.3);
      s.life = rand(0.42, 0.75);
      s.size0 = rand(0.9, 1.35) * scale;
      s.size1 = 0.35 * scale;
      ramp(s, 0xfff3c4, 0xffa23a, 0x8a2008, 0.32);
      s.alpha = 0.85 * (o.alpha ?? 1);
      s.fadeIn = 0.12;
      s.fadeOut = 0.45;
      s.drag = 1.2;
      s.gravity = -3.0;
      s.wind = 0.4;
      particles.emit(s);
    }
    if (Math.random() < 0.35) {
      const s = start(BLEND_GLOW, F.GLOW, x, y + 0.4 * scale, z);
      s.size0 = 2.6 * scale;
      s.size1 = 3.1 * scale;
      s.life = 0.32;
      ramp(s, 0xffb04a, 0xff8a2a, 0xa03a0a, 0.5);
      s.alpha = 0.24;
      s.fadeIn = 0.3;
      s.fadeOut = 0.5;
      particles.emit(s);
    }
    if (Math.random() < 0.3) {
      const s = start(BLEND_GLOW, F.EMBER, x + spread(0.3 * scale), y + 0.3 * scale, z + spread(0.3 * scale));
      s.vx = spread(1);
      s.vy = rand(2, 4);
      s.vz = spread(1);
      s.life = rand(0.8, 1.4);
      s.size0 = rand(0.08, 0.12);
      s.size1 = s.size0 * 0.6;
      s.stretch = 0.02;
      ramp(s, 0xfff0a0, 0xffa030, 0xff4010, 0.4);
      s.alpha = 1;
      s.fadeIn = 0.02;
      s.drag = 0.8;
      s.gravity = -1;
      s.wind = 0.9;
      particles.emit(s);
    }
  }

  /** Bright streaking sparks that arc down and skip off the ground. */
  function emitSparks(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 12;
    const speed = o.speed ?? 9;
    const dx = o.dirX ?? 0;
    const dy = o.dirY ?? 1.5;
    const dz = o.dirZ ?? 0;
    const floor = groundAt(x, z, y - 0.6);
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_GLOW, F.STREAK, x, y, z);
      randomUnit(UNIT);
      const sp = speed * rand(0.4, 1.2) * scale;
      const k = rand(0.5, 1.2);
      s.vx = UNIT.x * sp + dx * k + (o.vx ?? 0) * 0.6;
      s.vy = Math.abs(UNIT.y) * sp * 0.8 + dy * k + (o.vy ?? 0) * 0.3;
      s.vz = UNIT.z * sp + dz * k + (o.vz ?? 0) * 0.6;
      s.life = rand(0.3, 0.75);
      s.size0 = rand(0.045, 0.075) * Math.max(0.7, scale);
      s.size1 = s.size0;
      s.stretch = 0.035;
      ramp(s, 0xffffff, 0xffd468, 0xff6a1a, 0.25);
      s.alpha = 1;
      s.fadeIn = 0.01;
      s.fadeOut = 0.55;
      s.drag = 0.6;
      s.gravity = 9.8;
      s.bounce = 0.35;
      s.floorY = floor;
      particles.emit(s);
    }
  }

  /** Where a bullet strikes: a puff of plaster or dust, flying chips, a pin-prick flash. */
  function emitBulletImpact(x, y, z, o) {
    const nx = o.dirX ?? 0;
    const ny = o.dirY ?? 1;
    const nz = o.dirZ ?? 0;
    const tint = o.color ?? 0xbdae98;
    for (let n = 0; n < 2; n += 1) {
      const s = start(BLEND_SOFT, F.PUFF, x + nx * 0.1, y + ny * 0.1, z + nz * 0.1);
      const k = rand(1, 2.2);
      s.vx = nx * k + spread(0.5);
      s.vy = ny * k + spread(0.5) + 0.3;
      s.vz = nz * k + spread(0.5);
      s.life = rand(0.6, 1.0);
      s.size0 = 0.12;
      s.size1 = rand(0.7, 1.1);
      s.rotVel = spread(1);
      ramp(s, tint, tint, tint, 0.5);
      s.alpha = 0.55;
      s.fadeIn = 0.05;
      s.fadeOut = 0.3;
      s.drag = 3;
      s.gravity = -0.2;
      s.wind = 0.5;
      particles.emit(s);
    }
    const floor = groundAt(x, z, y - 1);
    for (let n = 0; n < 4; n += 1) {
      const s = start(BLEND_SOFT, F.CHUNK, x, y, z);
      const k = rand(2, 4);
      s.vx = nx * k + spread(2.5);
      s.vy = ny * k + spread(2.5) + 1.5;
      s.vz = nz * k + spread(2.5);
      s.life = rand(0.5, 0.8);
      s.size0 = rand(0.05, 0.08);
      s.size1 = s.size0;
      s.rotVel = spread(20);
      ramp(s, tint, tint, tint, 0.5);
      s.c0.multiplyScalar(0.6);
      s.c1.multiplyScalar(0.6);
      s.c2.multiplyScalar(0.6);
      s.alpha = 1;
      s.fadeIn = 0.01;
      s.fadeOut = 0.7;
      s.gravity = 9.8;
      s.bounce = 0.3;
      s.floorY = floor;
      particles.emit(s);
    }
    const f = start(BLEND_GLOW, F.GLOW, x + nx * 0.05, y + ny * 0.05, z + nz * 0.05);
    f.size0 = 0.45;
    f.size1 = 0.6;
    f.life = 0.06;
    ramp(f, 0xfff0c8, 0xffd090, 0xffa050, 0.5);
    f.alpha = 0.8;
    f.fadeIn = 0.01;
    f.fadeOut = 0.2;
    particles.emit(f);
    if (o.metal) {
      const spark = fillInner(5, 0.6, 5);
      spark.dirX = nx * 3;
      spark.dirY = ny * 3 + 1;
      spark.dirZ = nz * 3;
      emitSparks(x, y, z, spark);
    }
  }

  /** Chunks of a car, a wall or a kiosk thrown by a crash, with a little dust. */
  function emitDebris(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 6;
    const tint = o.color ?? 0x5d5650;
    const floor = groundAt(x, z, y - 1);
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.15 ? F.SHARD : F.CHUNK, x + spread(0.3), y + rand(0, 0.4), z + spread(0.3));
      const angle = Math.random() * TAU;
      const out = rand(1.5, 5.5) * scale;
      s.vx = Math.cos(angle) * out + (o.vx ?? 0) * 0.5 + (o.dirX ?? 0);
      s.vy = rand(2.5, 6.5) * Math.sqrt(scale) + (o.dirY ?? 0);
      s.vz = Math.sin(angle) * out + (o.vz ?? 0) * 0.5 + (o.dirZ ?? 0);
      s.size0 = rand(0.12, 0.3) * scale;
      s.size1 = s.size0;
      s.life = rand(2, 3.2);
      s.fadeIn = 0.01;
      s.fadeOut = 0.8;
      s.c0.setHex(tint).multiplyScalar(rand(0.75, 1.15));
      s.c1.copy(s.c0);
      s.c2.copy(s.c0);
      s.drag = 0.25;
      s.gravity = 9.8;
      s.bounce = 0.3;
      s.floorY = floor;
      s.rotVel = spread(12);
      particles.emit(s);
    }
    const dust = fillInner(2, scale * 0.8, 0);
    emitRoadDust(x, Math.max(floor, y - 0.5), z, dust);
  }

  /** A window bursting: glittering shards that tinkle down, with a few glints. */
  function emitShatteredGlass(x, y, z, o) {
    const count = o.count ?? 10;
    const floor = groundAt(x, z, y - 1);
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, F.SHARD, x + spread(0.4), y + spread(0.2), z + spread(0.4));
      randomUnit(UNIT);
      const k = rand(1.5, 5);
      s.vx = UNIT.x * k + (o.dirX ?? 0) + (o.vx ?? 0) * 0.5;
      s.vy = Math.abs(UNIT.y) * k + rand(1, 4) + (o.dirY ?? 0);
      s.vz = UNIT.z * k + (o.dirZ ?? 0) + (o.vz ?? 0) * 0.5;
      s.size0 = rand(0.05, 0.13);
      s.size1 = s.size0;
      s.life = rand(1.0, 1.8);
      ramp(s, 0xe4f6fa, 0xd6eef4, 0xbfe0e8, 0.5);
      s.alpha = 0.9;
      s.fadeIn = 0.01;
      s.fadeOut = 0.7;
      s.drag = 0.3;
      s.gravity = 9.8;
      s.bounce = 0.22;
      s.floorY = floor;
      s.rotVel = spread(16);
      s.lit = 0.55;
      particles.emit(s);
    }
    for (let n = 0; n < count / 2; n += 1) {
      const s = start(BLEND_GLOW, F.STAR, x + spread(0.5), y + spread(0.3), z + spread(0.5));
      s.vx = spread(2);
      s.vy = rand(0, 2);
      s.vz = spread(2);
      s.size0 = rand(0.12, 0.22);
      s.size1 = s.size0 * 0.5;
      s.life = rand(0.15, 0.4);
      s.rotVel = spread(6);
      s.alpha = 0.9;
      s.fadeIn = 0.05;
      s.gravity = 4;
      particles.emit(s);
    }
  }

  /** Water thrown up when something big hits the gulf: droplets, spray and a spreading ring. */
  function emitSplash(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 14;
    const root = Math.sqrt(scale);
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, F.DROPLET, x + spread(0.5 * scale), y, z + spread(0.5 * scale));
      const angle = Math.random() * TAU;
      const out = rand(0.5, 3.2) * scale;
      s.vx = Math.cos(angle) * out + (o.vx ?? 0) * 0.3;
      s.vy = rand(3.5, 8) * root;
      s.vz = Math.sin(angle) * out + (o.vz ?? 0) * 0.3;
      s.stretch = 0.05;
      s.size0 = rand(0.08, 0.16) * root;
      s.size1 = s.size0;
      s.life = rand(0.8, 1.4);
      ramp(s, 0xf6fdff, 0xeaf7fb, 0xd8eef4, 0.5);
      s.alpha = 0.9;
      s.fadeIn = 0.01;
      s.fadeOut = 0.75;
      s.drag = 0.25;
      s.gravity = 9.8;
      s.flags = FLAG_DIE_ON_FLOOR;
      s.floorY = y - 0.15;
      s.lit = 0.7;
      particles.emit(s);
    }
    for (let n = 0; n < 3; n += 1) {
      const s = start(BLEND_SOFT, F.PUFF_DENSE, x + spread(0.6 * scale), y + 0.2, z + spread(0.6 * scale));
      s.vx = spread(1.2);
      s.vy = rand(0.5, 1.5) * root;
      s.vz = spread(1.2);
      s.size0 = 0.6 * scale;
      s.size1 = rand(2.2, 3.2) * scale;
      s.life = rand(0.9, 1.4);
      s.rotVel = spread(0.6);
      ramp(s, 0xf2fbfd, 0xe8f6f9, 0xe2f2f6, 0.5);
      s.alpha = 0.6;
      s.fadeIn = 0.05;
      s.fadeOut = 0.4;
      s.drag = 2.2;
      s.gravity = 0.3;
      particles.emit(s);
    }
    const ring = start(BLEND_SOFT, F.RING_SOFT, x, y + 0.05, z);
    ring.flags = FLAG_FLAT;
    ring.size0 = 0.6 * scale;
    ring.size1 = 4.5 * scale;
    ring.life = 1.4;
    ring.rotVel = spread(0.3);
    ramp(ring, 0xf4fcff, 0xf4fcff, 0xf4fcff, 0.5);
    ring.alpha = 0.55;
    ring.fadeIn = 0.02;
    ring.fadeOut = 0.3;
    ring.lit = 0.6;
    particles.emit(ring);
  }

  /** The flash at a gun's muzzle (direction from dirX/dirY/dirZ). */
  function emitMuzzle(x, y, z, o) {
    emitMuzzleFlash(particles, x, y, z, o.dirX ?? 0, o.dirY ?? 0, o.dirZ ?? 1, o.scale ?? 1);
  }

  /** Thick white smoke from tyres sliding on hot asphalt. */
  function emitTyreSmoke(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 1;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.55 ? F.PUFF : F.PUFF_DENSE, x + spread(0.2), y + rand(0, 0.2), z + spread(0.2));
      s.vx = (o.vx ?? 0) * 0.25 + spread(0.7) * scale;
      s.vy = rand(0.4, 1.0);
      s.vz = (o.vz ?? 0) * 0.25 + spread(0.7) * scale;
      s.life = rand(1.6, 2.6);
      s.size0 = 0.5 * scale;
      s.size1 = rand(3.0, 4.4) * scale;
      s.rotVel = spread(0.8);
      ramp(s, 0xf6f4f0, 0xe8e4de, 0xd4cfc8, 0.4);
      s.alpha = 0.44 * (o.alpha ?? 1);
      s.fadeIn = 0.1;
      s.fadeOut = 0.35;
      s.drag = 1.6;
      s.gravity = -0.25;
      s.wind = 0.8;
      particles.emit(s);
    }
  }

  /** A small, brief dark-red puff where a bullet strikes a person. Kept mild. */
  function emitBloodPuff(x, y, z, o) {
    const count = o.count ?? 3;
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, F.PUFF, x + spread(0.08), y + spread(0.08), z + spread(0.08));
      const k = rand(0.6, 1.4);
      s.vx = (o.dirX ?? 0) * k + spread(0.5);
      s.vy = (o.dirY ?? 0) * k + spread(0.5);
      s.vz = (o.dirZ ?? 0) * k + spread(0.5);
      s.life = rand(0.3, 0.5);
      s.size0 = 0.08;
      s.size1 = 0.32;
      ramp(s, 0x8c1616, 0x6a0e0e, 0x4a0a0a, 0.5);
      s.alpha = 0.7;
      s.fadeIn = 0.05;
      s.fadeOut = 0.4;
      s.drag = 3;
      s.gravity = 1.5;
      s.lit = 0.9;
      particles.emit(s);
    }
  }

  /** Palm fronds shaken loose when a car flattens a tree; they flutter down. */
  function emitPalmLeaves(x, y, z, o) {
    const count = o.count ?? 6;
    const floor = groundAt(x, z, y - 3);
    for (let n = 0; n < count; n += 1) {
      const s = start(BLEND_SOFT, F.LEAF, x + spread(1.5), y + rand(0, 2), z + spread(1.5));
      s.vx = spread(3) + (o.vx ?? 0) * 0.3;
      s.vy = rand(1, 4);
      s.vz = spread(3) + (o.vz ?? 0) * 0.3;
      s.size0 = rand(0.6, 1.1);
      s.size1 = s.size0;
      s.life = rand(2.5, 3.5);
      s.rotVel = spread(5);
      ramp(s, o.color ?? 0x5f8f3a, 0x6f9a44, 0x8a8a4a, 0.6);
      s.alpha = 1;
      s.fadeIn = 0.02;
      s.fadeOut = 0.8;
      s.drag = 2.4;
      s.gravity = 3.2;
      s.wind = 1;
      s.bounce = 0;
      s.floorY = floor;
      particles.emit(s);
    }
  }

  /** Reset the shared spec for one particle of `blend` and atlas `frame` at (x, y, z). */
  function start(blend, frame, x, y, z) {
    const s = particles.spec();
    s.blend = blend;
    s.frame = frame;
    s.x = x;
    s.y = y;
    s.z = z;
    s.rot = Math.random() * TAU;
    return s;
  }

  /** Fill the options a recipe passes on to another recipe. */
  function fillInner(count, scale, speed) {
    innerOptions.count = count;
    innerOptions.scale = scale;
    innerOptions.speed = speed;
    innerOptions.dirX = 0;
    innerOptions.dirY = 0;
    innerOptions.dirZ = 0;
    innerOptions.vx = 0;
    innerOptions.vy = 0;
    innerOptions.vz = 0;
    innerOptions.color = undefined;
    innerOptions.alpha = 1;
    return innerOptions;
  }

  return { emit, groundAt, kinds: EFFECT_KINDS };
}

/** Set a particle's three colour stops (0xRRGGBB) and where the middle one sits in its life. */
function ramp(s, hex0, hex1, hex2, mid) {
  s.c0.setHex(hex0);
  s.c1.setHex(hex1);
  s.c2.setHex(hex2);
  s.mid = mid;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function spread(r) {
  return (Math.random() * 2 - 1) * r;
}

/** A random direction, written into `out`. */
function randomUnit(out) {
  let x;
  let y;
  let z;
  let d;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    d = x * x + y * y + z * z;
  } while (d > 1 || d < 0.0001);
  d = 1 / Math.sqrt(d);
  out.x = x * d;
  out.y = y * d;
  out.z = z * d;
  return out;
}

const TAU = Math.PI * 2;
const UNIT = { x: 0, y: 0, z: 0 };
const NO_OPTIONS = Object.freeze({});
