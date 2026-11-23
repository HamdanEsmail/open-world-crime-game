// What every kind of effect in Port Sarab is made of: how many particles, which sprite, which colours,
// how they fly and how long they live. game.effects.spawn('sand', x, y, z, options) lands here. The
// golden rooster tail a car throws up on the dunes is the signature look of the desert; road dust,
// engine smoke, burning-fuel smoke, flames and tyre smoke live here too, the breaking things next door.
import { BLEND_SOFT, BLEND_GLOW, FLAG_DIE_ON_FLOOR } from './particleEffects.js';
import { PARTICLE_FRAMES as F } from './particleSpriteAtlas.js';
import { emitMuzzleFlash } from './bulletTracers.js';
import { createImpactRecipes } from './impactRecipes.js';
import { EFFECT_KINDS as KIND_NOTES } from './effectRules.js';

/** The kinds game.effects.spawn() understands, as a list (their descriptions live in effectRules.js). */
export const EFFECT_KINDS = Object.freeze(Object.keys(KIND_NOTES));

/**
 * Bind the effect recipes to a particle system.
 * Options every recipe reads (all optional): count, scale, alpha, color (0xRRGGBB),
 * vx/vy/vz (velocity to inherit, e.g. the car's), dirX/dirY/dirZ (throw velocity or surface normal),
 * speed, metal (an impact on metal also throws sparks), fireLit (black smoke glows orange as it leaves flames).
 * @returns {{emit: (kind: string, x: number, y: number, z: number, options?: Object) => boolean,
 *   groundAt: (x: number, z: number, fallback: number) => number, kinds: string[]}}
 */
export function createParticleRecipes(game, particles) {
  const impacts = createImpactRecipes(particles, groundAt, emitRoadDust);
  const recipes = {
    dust: emitRoadDust,
    sand: emitSandPlume,
    smoke: emitGreySmoke,
    blackSmoke: emitBlackSmoke,
    fire: emitFlames,
    muzzle: emitMuzzle,
    tyreSmoke: emitTyreSmoke,
    sparks: impacts.sparks,
    impact: impacts.impact,
    debris: impacts.debris,
    glass: impacts.glass,
    splash: impacts.splash,
    blood: impacts.blood,
    leaves: impacts.leaves,
    glowPool: impacts.glowPool,
  };

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

  /** Golden sand thrown up by tyres on the dunes: big soft puffs, a fast spray and a scatter of grains. */
  function emitSandPlume(x, y, z, o) {
    const scale = o.scale ?? 1;
    const count = o.count ?? 2;
    const tx = o.dirX ?? 0;
    const ty = o.dirY ?? 2.5;
    const tz = o.dirZ ?? 0;
    const ivx = (o.vx ?? 0) * 0.35;
    const ivz = (o.vz ?? 0) * 0.35;
    for (let n = 0; n < count; n += 1) {
      const pick = Math.random();
      const frame = pick < 0.4 ? F.PUFF_DENSE : pick < 0.7 ? F.PUFF : F.WISP_SOFT;
      const s = start(BLEND_SOFT, frame, x + spread(0.25 * scale), y + rand(0, 0.3) * scale, z + spread(0.25 * scale));
      const k = rand(0.6, 1.2);
      s.vx = tx * k + ivx + spread(1.2) * scale;
      s.vy = ty * k + spread(0.8);
      s.vz = tz * k + ivz + spread(1.2) * scale;
      s.life = rand(1.6, 2.8) * (0.7 + 0.3 * Math.min(scale, 1.5));
      s.size0 = rand(0.5, 0.8) * scale;
      s.size1 = rand(3.0, 4.6) * scale;
      s.rotVel = spread(0.8);
      ramp(s, o.color ?? 0xf8dfa8, 0xebc27a, 0xdcbc8c, 0.3);
      s.alpha = 0.44 * (o.alpha ?? 1);
      s.fadeIn = 0.05;
      s.fadeOut = 0.38;
      s.drag = 1.5;
      s.gravity = 1.2;
      s.wind = 0.45;
      particles.emit(s);
    }
    if (scale > 0.6) {
      const spray = start(BLEND_SOFT, F.PUFF, x, y + 0.1, z);
      const k = rand(1.3, 1.7);
      spray.vx = tx * k + ivx + spread(0.6);
      spray.vy = ty * k + rand(0.5, 1.5);
      spray.vz = tz * k + ivz + spread(0.6);
      spray.life = rand(0.6, 0.9);
      spray.size0 = 0.3 * scale;
      spray.size1 = rand(1.4, 2.0) * scale;
      spray.rotVel = spread(1.5);
      ramp(spray, 0xfbe6b8, 0xf0cf8e, 0xe6c590, 0.4);
      spray.alpha = 0.5 * (o.alpha ?? 1);
      spray.fadeIn = 0.03;
      spray.fadeOut = 0.3;
      spray.drag = 0.9;
      spray.gravity = 3.5;
      particles.emit(spray);
    }
    const grains = o.grains ?? Math.ceil(count * 0.5);
    const floor = groundAt(x, z, y - 0.3);
    for (let n = 0; n < grains; n += 1) {
      const s = start(BLEND_SOFT, F.EMBER, x + spread(0.2), y + rand(0, 0.2), z + spread(0.2));
      const k = rand(0.8, 1.4);
      s.vx = tx * k + ivx + spread(2);
      s.vy = ty * k * 1.2 + rand(0, 2);
      s.vz = tz * k + ivz + spread(2);
      s.life = rand(0.6, 1.0);
      s.size0 = rand(0.035, 0.06) * Math.max(0.8, Math.min(scale, 1.4));
      s.size1 = s.size0;
      s.stretch = 0.04;
      ramp(s, 0xe0b066, 0xd3a258, 0xc49452, 0.5);
      s.alpha = 0.85;
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

  /** Thick black smoke from burning fuel and rubber; with fireLit it glows orange leaving the flames. */
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
      if (o.fireLit) {
        s.c0.setHex(0x8a4418);
        s.mid = 0.2;
        s.glowEnd = 0.2;
      }
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

const TAU = Math.PI * 2;
const NO_OPTIONS = Object.freeze({});
