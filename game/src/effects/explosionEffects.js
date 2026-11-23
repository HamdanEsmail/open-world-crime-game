// The blast when a car or a fuel drum goes up in Port Sarab: a white-hot flash, an orange fireball of
// several lobes that cools into a rising column of black smoke, a shock ring racing over the ground,
// burning debris arcing out on smoke trails, a shower of sparks, a glow thrown on the ground and a
// scorch mark left behind. Each blast runs a short timeline of its own so the smoke keeps coming.
import { BLEND_SOFT, BLEND_GLOW, FLAG_FLAT, FLAG_OVERLAY, TRAIL_FIRE, TRAIL_SMOKE } from './particleEffects.js';
import { PARTICLE_FRAMES as F } from './particleSpriteAtlas.js';

/**
 * Create the explosion service.
 * @param {Object} game
 * @param {ReturnType<import('./particleEffects.js').createParticleSystem>} particles
 * @param {{addScorch?: Function}|null} skidMarks  where scorch marks are laid
 * @param {(x: number, z: number, fallback: number) => number} groundAt
 */
export function createExplosionEffects(game, particles, skidMarks, groundAt) {
  const blasts = [];
  for (let i = 0; i < MAX_BLASTS; i += 1) {
    blasts.push({ active: false, x: 0, y: 0, z: 0, ground: 0, radius: 4, age: 0, popped: false, smokeTimer: 0, fireTimer: 0, flameCount: 0, nearGround: true, sandy: false });
  }
  let nextBlast = 0;

  /**
   * Set off an explosion at (x, y, z). radius is the fireball's size in metres (a car is about 4).
   * options: { color: debris colour (the car's paint), scorch: false to leave no mark }
   */
  function explode(x, y, z, radius = 4, options) {
    const r = Math.max(0.8, radius);
    const ground = groundAt(x, z, y - 0.5);
    const surface = game.terrain && typeof game.terrain.surfaceAt === 'function' ? game.terrain.surfaceAt(x, z) : 'road';
    const sandy = surface === 'sand' || surface === 'beach';
    const nearGround = y - ground < r * 1.5;

    emitFlash(x, y, z, r);
    emitFireball(x, y, z, r);
    emitSparkShower(x, y, z, r, ground);
    emitBurningDebris(x, y, z, r, ground, options && options.color);
    if (nearGround) {
      emitGroundLight(x, ground, z, r);
      emitShockRing(x, ground, z, r, sandy);
      emitDustSkirt(x, ground, z, r, sandy);
      if (skidMarks && skidMarks.addScorch && !(options && options.scorch === false) && surface !== 'water') {
        skidMarks.addScorch(x, ground, z, r * 1.6);
      }
    }

    const blast = blasts[nextBlast];
    nextBlast = (nextBlast + 1) % MAX_BLASTS;
    blast.active = true;
    blast.x = x;
    blast.y = y;
    blast.z = z;
    blast.ground = ground;
    blast.radius = r;
    blast.age = 0;
    blast.popped = false;
    blast.smokeTimer = 0.15;
    blast.fireTimer = 0.2;
    blast.flameCount = 0;
    blast.nearGround = nearGround;
    blast.sandy = sandy;
  }

  /** Run each blast's timeline: a second pop, the smoke column, the flames that linger at its foot. */
  function update(dt) {
    for (let i = 0; i < MAX_BLASTS; i += 1) {
      const b = blasts[i];
      if (!b.active) continue;
      b.age += dt;
      if (!b.popped && b.age > 0.14) {
        b.popped = true;
        emitSecondaryPop(b.x, b.y, b.z, b.radius);
      }
      if (b.age < SMOKE_SECONDS) {
        b.smokeTimer -= dt;
        while (b.smokeTimer <= 0) {
          const k = b.age / SMOKE_SECONDS;
          b.smokeTimer += 0.07 + k * 0.2;
          emitColumnSmoke(b, 1 - k);
        }
      }
      if (b.nearGround && b.age < FIRE_SECONDS) {
        b.fireTimer -= dt;
        while (b.fireTimer <= 0) {
          b.fireTimer += 0.06;
          emitLingeringFlame(b, 1 - b.age / FIRE_SECONDS);
        }
      }
      if (b.age > SMOKE_SECONDS + 1) b.active = false;
    }
  }

  /**
   * The white-hot instant: a huge glow and a star, gone in a fifth of a second. In plain view it is
   * drawn over the scene so the ground in front does not slice it; behind a building it stays hidden.
   */
  function emitFlash(x, y, z, r) {
    const overlay = inPlainView(x, y + r * 0.3, z) ? FLAG_OVERLAY : 0;
    let s = start(BLEND_GLOW, F.GLOW, x, y + r * 0.3, z);
    s.flags = overlay;
    s.size0 = r * 5;
    s.size1 = r * 7;
    s.life = 0.22;
    ramp(s, 0xffffff, 0xfff2c8, 0xffb060, 0.4);
    s.alpha = 1;
    s.fadeIn = 0.01;
    s.fadeOut = 0.15;
    particles.emit(s);
    s = start(BLEND_GLOW, F.STAR, x, y + r * 0.3, z);
    s.flags = overlay;
    s.size0 = r * 3.2;
    s.size1 = r * 4.2;
    s.life = 0.12;
    ramp(s, 0xffffff, 0xfff4d0, 0xffc070, 0.5);
    s.alpha = 1;
    s.fadeIn = 0.01;
    s.fadeOut = 0.2;
    particles.emit(s);
  }

  /** Lobes of fire that swell, cool from white to orange to brown, and hand over to black smoke. */
  function emitFireball(x, y, z, r) {
    for (let n = 0; n < 14; n += 1) {
      const angle = Math.random() * TAU;
      const lift = 0.2 + Math.random() * 0.8;
      const flat = Math.sqrt(1 - lift * lift);
      const dx = Math.cos(angle) * flat;
      const dz = Math.sin(angle) * flat;
      const reach = r * (0.1 + Math.random() * 0.35);
      const s = start(BLEND_SOFT, Math.random() < 0.7 ? F.PUFF_DENSE : F.PUFF, x + dx * reach, y + lift * reach + r * 0.3, z + dz * reach);
      const out = r * rand(1.8, 3.2);
      s.vx = dx * out;
      s.vy = lift * out + r * 0.6;
      s.vz = dz * out;
      s.size0 = r * rand(0.6, 0.85);
      s.size1 = r * rand(1.8, 2.4);
      s.life = rand(1.1, 1.7);
      s.rotVel = spread(0.9);
      const inner = reach < r * 0.25;
      ramp(s, inner ? 0xfffbe6 : 0xffe9a8, FIREBALL_ORANGES[n % FIREBALL_ORANGES.length], 0x3a1a0c, rand(0.16, 0.3));
      s.alpha = 1;
      s.fadeIn = 0.01;
      s.fadeOut = 0.55;
      s.glowEnd = 0.6;
      s.drag = 3.0;
      s.gravity = -2;
      s.wind = 0.3;
      particles.emit(s);

      const smoke = start(BLEND_SOFT, Math.random() < 0.6 ? F.PUFF_DENSE : F.WISP, x + dx * reach * 2, y + lift * reach * 2 + r * 0.6, z + dz * reach * 2);
      smoke.delay = rand(0.35, 0.6);
      smoke.vx = dx * out * 0.3;
      smoke.vy = lift * out * 0.3 + r * 0.8;
      smoke.vz = dz * out * 0.3;
      smoke.size0 = r * rand(1.2, 1.5);
      smoke.size1 = r * rand(2.8, 3.5);
      smoke.life = rand(5, 7);
      smoke.rotVel = spread(0.4);
      ramp(smoke, 0x52402f, 0x35302c, 0x635e58, 0.3);
      smoke.alpha = 0.82;
      smoke.fadeIn = 0.06;
      smoke.fadeOut = 0.45;
      smoke.drag = 0.7;
      smoke.gravity = -2.2;
      smoke.wind = 0.9;
      particles.emit(smoke);
    }
    for (let n = 0; n < 4; n += 1) {
      const s = start(BLEND_GLOW, F.GLOW, x + spread(r * 0.3), y + r * rand(0.3, 0.7), z + spread(r * 0.3));
      s.vy = r * rand(0.3, 0.7);
      s.size0 = r * rand(2.0, 2.6);
      s.size1 = r * 1.2;
      s.life = rand(0.55, 0.8);
      ramp(s, 0xffffff, 0xffd080, 0xff6a18, 0.35);
      s.alpha = 0.9;
      s.fadeIn = 0.01;
      s.fadeOut = 0.35;
      s.drag = 2;
      particles.emit(s);
    }
    for (let n = 0; n < 6; n += 1) {
      const s = start(BLEND_GLOW, n % 2 === 0 ? F.FLAME : F.FLAME_TALL, x + spread(r * 0.5), y + r * rand(0.2, 0.6), z + spread(r * 0.5));
      s.rot = spread(0.3);
      s.vx = spread(r * 0.6);
      s.vy = r * rand(0.8, 1.4);
      s.vz = spread(r * 0.6);
      s.size0 = r * rand(1.2, 1.7);
      s.size1 = r * 0.5;
      s.life = rand(0.6, 0.95);
      ramp(s, 0xfff0b0, 0xff7a1a, 0x701400, 0.3);
      s.alpha = 0.9;
      s.fadeIn = 0.01;
      s.fadeOut = 0.4;
      s.drag = 2;
      s.gravity = -2;
      particles.emit(s);
    }
  }

  /** A second, smaller burst a moment later, higher up: it makes the blast roll. */
  function emitSecondaryPop(x, y, z, r) {
    for (let n = 0; n < 4; n += 1) {
      const s = start(BLEND_SOFT, F.PUFF_DENSE, x + spread(r * 0.5), y + r * rand(0.7, 1.1), z + spread(r * 0.5));
      s.vx = spread(r * 1.2);
      s.vy = r * rand(0.8, 1.5);
      s.vz = spread(r * 1.2);
      s.size0 = r * 0.4;
      s.size1 = r * rand(1.0, 1.4);
      s.life = rand(0.9, 1.2);
      s.rotVel = spread(1);
      ramp(s, 0xfff2c0, 0xff7c18, 0x3c1c0e, 0.25);
      s.alpha = 1;
      s.fadeIn = 0.02;
      s.fadeOut = 0.5;
      s.glowEnd = 0.5;
      s.drag = 3;
      s.gravity = -2;
      particles.emit(s);
    }
    const g = start(BLEND_GLOW, F.GLOW, x, y + r * 0.9, z);
    g.size0 = r * 2.4;
    g.size1 = r * 3;
    g.life = 0.3;
    ramp(g, 0xffe6a0, 0xff9a40, 0x802000, 0.4);
    g.alpha = 0.7;
    g.fadeIn = 0.05;
    g.fadeOut = 0.3;
    particles.emit(g);
  }

  /** A pool of orange light thrown on the ground around the fireball. */
  function emitGroundLight(x, ground, z, r) {
    const s = start(BLEND_GLOW, F.GLOW, x, ground + 0.2, z);
    s.flags = FLAG_FLAT;
    s.size0 = r * 6;
    s.size1 = r * 7.5;
    s.life = 1.1;
    ramp(s, 0xffc070, 0xff7a24, 0x501000, 0.3);
    s.alpha = 0.85;
    s.fadeIn = 0.01;
    s.fadeOut = 0.25;
    particles.emit(s);
  }

  /** A bright ring and a dust ring racing out over the ground. */
  function emitShockRing(x, ground, z, r, sandy) {
    let s = start(BLEND_GLOW, F.RING, x, ground + 0.25, z);
    s.flags = FLAG_FLAT;
    s.size0 = r * 0.8;
    s.size1 = r * 7;
    s.life = 0.42;
    ramp(s, 0xfff4d0, 0xffb050, 0xff6020, 0.4);
    s.alpha = 0.9;
    s.fadeIn = 0.01;
    s.fadeOut = 0.2;
    particles.emit(s);
    s = start(BLEND_SOFT, F.RING_SOFT, x, ground + 0.3, z);
    s.flags = FLAG_FLAT;
    s.size0 = r * 1.2;
    s.size1 = r * 6.5;
    s.life = 1.0;
    ramp(s, sandy ? 0xdcc08a : 0xbcae96, sandy ? 0xd4b57e : 0xb0a490, sandy ? 0xcdb486 : 0xa89e90, 0.5);
    s.alpha = 0.38;
    s.fadeIn = 0.04;
    s.fadeOut = 0.25;
    s.lit = 1;
    particles.emit(s);
  }

  /** Dust (or sand) shoved out along the ground in every direction. */
  function emitDustSkirt(x, ground, z, r, sandy) {
    const count = 16;
    for (let n = 0; n < count; n += 1) {
      const angle = (n / count) * TAU + spread(0.2);
      const s = start(BLEND_SOFT, Math.random() < 0.5 ? F.PUFF_DENSE : F.PUFF, x + Math.cos(angle) * r * 0.4, ground + r * 0.2, z + Math.sin(angle) * r * 0.4);
      const out = r * rand(3.2, 5.5);
      s.vx = Math.cos(angle) * out;
      s.vy = rand(0.3, 1.0);
      s.vz = Math.sin(angle) * out;
      s.size0 = r * 0.45;
      s.size1 = r * rand(1.5, 2.0);
      s.life = rand(1.8, 2.6);
      s.rotVel = spread(0.6);
      if (sandy) ramp(s, 0xeccb8a, 0xdcb578, 0xd2b386, 0.4);
      else ramp(s, 0xb9a88e, 0xa89a86, 0x9c9282, 0.4);
      s.frame = F.WISP_SOFT;
      s.alpha = 0.5;
      s.fadeIn = 0.04;
      s.fadeOut = 0.4;
      s.drag = 2.6;
      s.gravity = -0.1;
      s.wind = 0.6;
      particles.emit(s);
    }
  }

  /** A fountain of streaking sparks. */
  function emitSparkShower(x, y, z, r, ground) {
    for (let n = 0; n < 40; n += 1) {
      const s = start(BLEND_GLOW, F.STREAK, x + spread(r * 0.3), y + r * 0.3, z + spread(r * 0.3));
      const angle = Math.random() * TAU;
      const lift = Math.random();
      const speed = rand(8, 24);
      s.vx = Math.cos(angle) * speed * (1 - lift * 0.5);
      s.vy = lift * speed + 2;
      s.vz = Math.sin(angle) * speed * (1 - lift * 0.5);
      s.size0 = rand(0.06, 0.1);
      s.size1 = s.size0;
      s.stretch = 0.03;
      s.life = rand(0.5, 1.3);
      ramp(s, 0xffffff, 0xffd060, 0xff5a10, 0.3);
      s.alpha = 1;
      s.fadeIn = 0.01;
      s.fadeOut = 0.6;
      s.drag = 0.5;
      s.gravity = 9.8;
      s.bounce = 0.3;
      s.floorY = ground;
      particles.emit(s);
    }
  }

  /** Burning chunks on high arcs, trailing fire and smoke, plus dark wreckage that tumbles and bounces. */
  function emitBurningDebris(x, y, z, r, ground, color) {
    for (let n = 0; n < 9; n += 1) {
      const s = start(BLEND_GLOW, F.EMBER, x + spread(r * 0.3), y + r * 0.4, z + spread(r * 0.3));
      const angle = Math.random() * TAU;
      const out = rand(3, 10) * Math.sqrt(r / 4);
      s.vx = Math.cos(angle) * out;
      s.vy = rand(7, 15) * Math.sqrt(r / 4);
      s.vz = Math.sin(angle) * out;
      s.size0 = rand(0.35, 0.55);
      s.size1 = s.size0 * 0.6;
      s.stretch = 0.02;
      s.life = rand(1.4, 2.4);
      ramp(s, 0xfff2c0, 0xffa030, 0xff5010, 0.4);
      s.alpha = 1;
      s.fadeIn = 0.01;
      s.fadeOut = 0.75;
      s.drag = 0.15;
      s.gravity = 11;
      s.bounce = 0.25;
      s.floorY = ground + 0.1;
      s.trail = TRAIL_FIRE;
      particles.emit(s);
    }
    const tint = color === undefined ? 0x3a3532 : color;
    for (let n = 0; n < 12; n += 1) {
      const s = start(BLEND_SOFT, Math.random() < 0.2 ? F.SHARD : F.CHUNK, x + spread(r * 0.3), y + r * 0.3, z + spread(r * 0.3));
      const angle = Math.random() * TAU;
      const out = rand(3, 9) * Math.sqrt(r / 4);
      s.vx = Math.cos(angle) * out;
      s.vy = rand(4, 12) * Math.sqrt(r / 4);
      s.vz = Math.sin(angle) * out;
      s.size0 = rand(0.18, 0.45) * Math.sqrt(r / 4);
      s.size1 = s.size0;
      s.life = rand(3, 4.5);
      s.c0.setHex(n % 3 === 0 ? tint : 0x2e2a28).multiplyScalar(rand(0.7, 1.1));
      s.c1.copy(s.c0);
      s.c2.copy(s.c0).multiplyScalar(0.6);
      s.alpha = 1;
      s.fadeIn = 0.01;
      s.fadeOut = 0.85;
      s.drag = 0.2;
      s.gravity = 9.8;
      s.bounce = 0.3;
      s.floorY = ground + 0.08;
      s.rotVel = spread(12);
      if (n % 2 === 0) s.trail = TRAIL_SMOKE;
      particles.emit(s);
    }
  }

  /** One puff of the column of black smoke that climbs out of the blast. */
  function emitColumnSmoke(b, strength) {
    const r = b.radius;
    const s = start(BLEND_SOFT, Math.random() < 0.6 ? F.PUFF_DENSE : F.WISP, b.x + spread(r * 0.35), b.ground + r * 0.45 + Math.min(b.age * 0.8, r * 0.6), b.z + spread(r * 0.35));
    s.vx = spread(0.6);
    s.vy = rand(2, 4) * Math.sqrt(r / 4);
    s.vz = spread(0.6);
    s.size0 = r * rand(0.8, 1.1);
    s.size1 = r * rand(2.6, 3.4);
    s.life = rand(5, 7.5);
    s.rotVel = spread(0.4);
    const grey = Math.random() < 0.35;
    ramp(s, grey ? 0x4c443d : 0x3a322c, grey ? 0x403a35 : 0x2a2522, 0x5e5953, 0.35);
    if (b.age < FIRE_SECONDS * 0.7) {
      // Smoke leaving the flames is lit orange from below for a moment, then cools to plain smoke.
      s.c0.setHex(0x8a4418);
      s.mid = 0.22;
      s.glowEnd = 0.22;
    }
    s.alpha = 0.78 * (0.45 + 0.55 * strength);
    s.fadeIn = 0.06;
    s.fadeOut = 0.5;
    s.drag = 0.55;
    s.gravity = -2.2;
    s.wind = 1;
    particles.emit(s);
  }

  /** Flames that keep licking where the blast was, shrinking as the fuel burns off. */
  function emitLingeringFlame(b, strength) {
    const r = b.radius;
    const s = start(BLEND_GLOW, Math.random() < 0.5 ? F.FLAME : F.FLAME_TALL, b.x + spread(r * 0.45), b.ground + 0.2, b.z + spread(r * 0.45));
    s.rot = spread(0.2);
    s.vx = spread(0.3);
    s.vy = rand(1.5, 3) * (0.5 + strength * 0.5);
    s.vz = spread(0.3);
    s.size0 = r * rand(0.4, 0.6) * (0.5 + strength * 0.5);
    s.size1 = s.size0 * 0.3;
    s.life = rand(0.45, 0.8);
    ramp(s, 0xfff3c4, 0xffa23a, 0x8a2008, 0.32);
    s.alpha = 0.9;
    s.fadeIn = 0.12;
    s.fadeOut = 0.45;
    s.drag = 1.2;
    s.gravity = -3;
    particles.emit(s);
    b.flameCount += 1;
    if (b.flameCount % 3 === 0 && b.age > SMOKE_SECONDS * 0.6) {
      const smoke = start(BLEND_SOFT, F.WISP, b.x + spread(r * 0.3), b.ground + 1.2, b.z + spread(r * 0.3));
      smoke.vy = rand(1.5, 2.5);
      smoke.size0 = r * 0.3;
      smoke.size1 = r * rand(1.2, 1.8);
      smoke.life = rand(3, 4.5);
      smoke.rotVel = spread(0.5);
      ramp(smoke, 0x2e2925, 0x302b28, 0x58534e, 0.4);
      smoke.alpha = 0.55 * (0.4 + strength * 0.6);
      smoke.fadeIn = 0.1;
      smoke.fadeOut = 0.5;
      smoke.drag = 0.6;
      smoke.gravity = -1.6;
      smoke.wind = 1;
      particles.emit(smoke);
    }
  }

  /** True when nothing static stands between the camera and the point. */
  function inPlainView(x, y, z) {
    const colliders = game.colliders;
    if (!colliders || typeof colliders.lineOfSight !== 'function') return true;
    const eye = game.camera.position;
    EYE.x = eye.x;
    EYE.y = eye.y;
    EYE.z = eye.z;
    POINT.x = x;
    POINT.y = y;
    POINT.z = z;
    try {
      return colliders.lineOfSight(EYE, POINT) !== false;
    } catch (error) {
      return true;
    }
  }

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

  return {
    explode, update,
    get activeCount() {
      let n = 0;
      for (let i = 0; i < MAX_BLASTS; i += 1) if (blasts[i].active) n += 1;
      return n;
    },
  };
}

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

const MAX_BLASTS = 8;
const SMOKE_SECONDS = 5;
const FIRE_SECONDS = 6;
const FIREBALL_ORANGES = [0xff8a1c, 0xff9e2c, 0xf2681a, 0xffb03a, 0xe85a14];
const EYE = { x: 0, y: 0, z: 0 };
const POINT = { x: 0, y: 0, z: 0 };
const TAU = Math.PI * 2;
