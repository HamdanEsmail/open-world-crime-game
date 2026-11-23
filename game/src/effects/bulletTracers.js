// Gunfire you can see in Port Sarab: a hot streak that races from the muzzle to whatever the bullet hits
// in a few frames, a star-shaped muzzle flash with a breath of smoke, and the right kind of hit where it
// lands (sparks off metal, sand off the dunes, plaster off walls). All of it rides in the pooled
// particle batches, so a firefight costs no extra draw calls.
import { BLEND_GLOW, BLEND_SOFT, FLAG_FROZEN } from './particleEffects.js';
import { PARTICLE_FRAMES as F } from './particleSpriteAtlas.js';

/**
 * Create the tracer service. `emitEffect(kind, x, y, z, options)` is the recipe spawner used for hits.
 * @returns {{fire: Function, muzzleFlash: Function, impact: Function}}
 */
export function createBulletTracers(game, particles, emitEffect) {
  const hitOptions = { count: 0, scale: 1, dirX: 0, dirY: 1, dirZ: 0, metal: false, color: undefined, speed: 0 };

  /**
   * A tracer streak from (ax, ay, az) to (bx, by, bz).
   * options: speed (m/s, default 520), length (m, default 6), width (m, default 0.09), color ('warm'|'green'|'red').
   */
  function fire(ax, ay, az, bx, by, bz, options) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dist > 1)) return;
    const ux = dx / dist;
    const uy = dy / dist;
    const uz = dz / dist;
    const speed = (options && options.speed) || 520;
    const length = (options && options.length) || 6;
    const width = (options && options.width) || 0.09;
    const lead = Math.min(1.2, dist * 0.3);
    const s = particles.spec();
    s.blend = BLEND_GLOW;
    s.frame = F.STREAK;
    s.x = ax + ux * lead;
    s.y = ay + uy * lead;
    s.z = az + uz * lead;
    s.vx = ux * speed;
    s.vy = uy * speed;
    s.vz = uz * speed;
    s.life = Math.max(0.016, (dist - lead) / speed);
    s.size0 = width;
    s.size1 = width;
    s.stretch = length / speed;
    const tint = options && options.color;
    if (tint === 'green') tracerRamp(s, 0xf0ffe8, 0x9cff7a, 0x4ad050);
    else if (tint === 'red') tracerRamp(s, 0xfff0e8, 0xff7a5a, 0xd03020);
    else tracerRamp(s, 0xfffbe8, 0xffd890, 0xffa040);
    s.alpha = 1;
    s.fadeIn = 0.01;
    s.fadeOut = 0.85;
    particles.emit(s);
  }

  /**
   * What a bullet does where it lands. `what` is what it hit: a Vehicle (sparks), a Character (left to
   * the hit-puff on 'character:damaged'), or anything else (a puff of the surface: sand, plaster, dust).
   * (nx, ny, nz) points back toward the shooter.
   */
  function impact(x, y, z, nx, ny, nz, what) {
    if (what && what.intent) return;
    hitOptions.dirX = nx;
    hitOptions.dirY = ny;
    hitOptions.dirZ = nz;
    hitOptions.metal = !!(what && what.spec);
    hitOptions.color = undefined;
    const surface = game.terrain && typeof game.terrain.surfaceAt === 'function' ? game.terrain.surfaceAt(x, z) : null;
    const groundY = game.terrain && typeof game.terrain.heightAt === 'function' ? game.terrain.heightAt(x, z) : 0;
    const onGround = Math.abs(y - groundY) < 0.35;
    if (surface === 'water' && onGround) {
      hitOptions.count = 5;
      hitOptions.scale = 0.25;
      emitEffect('splash', x, y, z, hitOptions);
      return;
    }
    if ((surface === 'sand' || surface === 'beach') && onGround) {
      hitOptions.count = 1;
      hitOptions.scale = 0.35;
      hitOptions.dirX = nx * 2;
      hitOptions.dirY = 2.5;
      hitOptions.dirZ = nz * 2;
      emitEffect('sand', x, y, z, hitOptions);
      return;
    }
    if (hitOptions.metal) hitOptions.color = 0x8d8a86;
    else if (!onGround) hitOptions.color = 0xe6d8c0;
    emitEffect('impact', x, y, z, hitOptions);
  }

  /** The muzzle flash alone, e.g. for a shot that hit nothing visible. */
  function muzzleFlash(x, y, z, dirX, dirY, dirZ, scale = 1) {
    emitMuzzleFlash(particles, x, y, z, dirX, dirY, dirZ, scale);
  }

  return { fire, impact, muzzleFlash };
}

/**
 * A star-shaped flash at a gun's muzzle, a short tongue of flame along the shot and a wisp of smoke.
 * (dirX, dirY, dirZ) is the direction of fire; `scale` 1 suits a pistol, 1.6 a rifle or shotgun.
 */
export function emitMuzzleFlash(particles, x, y, z, dirX, dirY, dirZ, scale = 1) {
  const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const uz = dirZ / len;

  let s = particles.spec();
  s.blend = BLEND_GLOW;
  s.frame = F.STAR;
  s.x = x + ux * 0.12 * scale;
  s.y = y + uy * 0.12 * scale;
  s.z = z + uz * 0.12 * scale;
  s.rot = Math.random() * 6.28;
  s.size0 = 0.42 * scale;
  s.size1 = 0.62 * scale;
  s.life = 0.055;
  s.c0.setHex(0xfff6d8);
  s.c1.setHex(0xffd890);
  s.c2.setHex(0xffb650);
  s.alpha = 1;
  s.fadeIn = 0.01;
  s.fadeOut = 0.3;
  particles.emit(s);

  s = particles.spec();
  s.blend = BLEND_GLOW;
  s.frame = F.STREAK;
  s.flags = FLAG_FROZEN;
  s.x = x + ux * 0.38 * scale;
  s.y = y + uy * 0.38 * scale;
  s.z = z + uz * 0.38 * scale;
  s.vx = ux * 30;
  s.vy = uy * 30;
  s.vz = uz * 30;
  s.stretch = 0.025 * scale;
  s.size0 = 0.24 * scale;
  s.size1 = 0.2 * scale;
  s.life = 0.05;
  s.c0.setHex(0xffffff);
  s.c1.setHex(0xffe0a0);
  s.c2.setHex(0xffc060);
  s.alpha = 1;
  s.fadeIn = 0.01;
  s.fadeOut = 0.4;
  particles.emit(s);

  s = particles.spec();
  s.blend = BLEND_GLOW;
  s.frame = F.GLOW;
  s.x = x + ux * 0.2;
  s.y = y + uy * 0.2;
  s.z = z + uz * 0.2;
  s.size0 = 1.5 * scale;
  s.size1 = 1.8 * scale;
  s.life = 0.07;
  s.c0.setHex(0xffc070);
  s.c1.setHex(0xffa050);
  s.c2.setHex(0xff7a30);
  s.alpha = 0.45;
  s.fadeIn = 0.01;
  s.fadeOut = 0.3;
  particles.emit(s);

  s = particles.spec();
  s.blend = BLEND_SOFT;
  s.frame = F.WISP;
  s.x = x + ux * 0.3;
  s.y = y + uy * 0.3;
  s.z = z + uz * 0.3;
  s.vx = ux * 1.2;
  s.vy = uy * 1.2 + 0.4;
  s.vz = uz * 1.2;
  s.rot = Math.random() * 6.28;
  s.rotVel = (Math.random() - 0.5) * 1.5;
  s.size0 = 0.12 * scale;
  s.size1 = 0.9 * scale;
  s.life = 0.9;
  s.c0.setHex(0xddd7cc);
  s.c1.setHex(0xd0cabe);
  s.c2.setHex(0xc4beb2);
  s.alpha = 0.22;
  s.fadeIn = 0.05;
  s.fadeOut = 0.4;
  s.drag = 2;
  s.gravity = -0.4;
  s.wind = 0.6;
  particles.emit(s);
}

function tracerRamp(s, hex0, hex1, hex2) {
  s.c0.setHex(hex0);
  s.c1.setHex(hex1);
  s.c2.setHex(hex2);
  s.mid = 0.5;
}
