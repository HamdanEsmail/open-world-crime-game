// The sprite sheet every particle in Port Sarab is cut from, painted in code on one canvas: soft dust
// puffs, wispy smoke, flame licks, spark streaks, debris chunks, droplets, rings, a muzzle star and a
// hot glow. Sixteen 128-pixel frames in a 4 by 4 grid; the particle shader picks one frame per particle.
import * as THREE from 'three';

/** Frame numbers in the atlas, read left to right and top to bottom. */
export const PARTICLE_FRAMES = Object.freeze({
  PUFF: 0, PUFF_DENSE: 1, WISP: 2, WISP_SOFT: 3,
  FLAME: 4, FLAME_TALL: 5, STREAK: 6, CHUNK: 7,
  DROPLET: 8, RING: 9, STAR: 10, GLOW: 11,
  SHARD: 12, EMBER: 13, LEAF: 14, RING_SOFT: 15,
});

/** Frames per row (and rows) of the atlas. */
export const ATLAS_GRID = 4;

/**
 * Paint the particle atlas and wrap it in a texture uploaded with premultiplied alpha, so soft edges
 * filter cleanly into the mipmaps without dark fringes. Colours are plain data (white shapes with grey
 * detail); each particle tints them.
 * @returns {THREE.CanvasTexture}
 */
export function paintParticleAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * ATLAS_GRID;
  canvas.height = CELL * ATLAS_GRID;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(1977);
  const painters = [
    paintCauliflowerPuff, paintDensePuff, paintWispySmoke, paintSoftWisp,
    paintFlameLick, paintTallFlame, paintSparkStreak, paintDebrisChunk,
    paintDroplet, paintThinRing, paintMuzzleStar, paintHotGlow,
    paintGlassShard, paintEmber, paintPalmLeaf, paintDustRing,
  ];
  // Each frame is painted at 88% inside its cell so every cell keeps a clear border: the mip levels the
  // shader samples (up to level 3) then never mix one frame into its neighbour.
  for (let i = 0; i < painters.length; i += 1) {
    ctx.save();
    ctx.translate((i % ATLAS_GRID) * CELL + CELL / 2, Math.floor(i / ATLAS_GRID) * CELL + CELL / 2);
    ctx.scale(CELL_FILL, CELL_FILL);
    ctx.translate(-CELL / 2, -CELL / 2);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    painters[i](ctx, CELL, random);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = true;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** A cauliflower of soft blobs, lit from above: road dust, tyre smoke, sand plumes. */
function paintCauliflowerPuff(ctx, s, random) {
  const c = s / 2;
  for (let i = 0; i < 13; i += 1) {
    const angle = random() * TAU;
    const dist = Math.sqrt(random()) * s * 0.16;
    const radius = s * (0.12 + random() * 0.13);
    softDisc(ctx, c + Math.cos(angle) * dist, c + Math.sin(angle) * dist * 0.9, radius, 215 + random() * 40, 0.5);
  }
  shadeFromAbove(ctx, s, 0.28);
  speckle(ctx, s, random, 60, 0.1);
}

/** Fewer, fuller blobs: the body of a sand plume or a fireball lobe. */
function paintDensePuff(ctx, s, random) {
  const c = s / 2;
  for (let i = 0; i < 8; i += 1) {
    const angle = random() * TAU;
    const dist = Math.sqrt(random()) * s * 0.12;
    const radius = s * (0.17 + random() * 0.1);
    softDisc(ctx, c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, radius, 225 + random() * 30, 0.72);
  }
  shadeFromAbove(ctx, s, 0.34);
  speckle(ctx, s, random, 50, 0.09);
}

/** A torn streamer of smoke with holes in it. */
function paintWispySmoke(ctx, s, random) {
  const c = s / 2;
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const x = c + (t - 0.5) * s * 0.46 + Math.sin(t * 5.3) * s * 0.04;
    const y = c + Math.sin(t * 3.1 + 1.0) * s * 0.11 + (random() - 0.5) * s * 0.06;
    softDisc(ctx, x, y, s * (0.08 + random() * 0.1), 225 + random() * 30, 0.34);
  }
  punchHoles(ctx, s, random, 7, 0.45);
  shadeFromAbove(ctx, s, 0.2);
}

/** A broad, thin veil of smoke. */
function paintSoftWisp(ctx, s, random) {
  const c = s / 2;
  for (let i = 0; i < 7; i += 1) {
    const angle = random() * TAU;
    const dist = Math.sqrt(random()) * s * 0.12;
    softDisc(ctx, c + Math.cos(angle) * dist, c + Math.sin(angle) * dist, s * (0.2 + random() * 0.09), 235, 0.3);
  }
  punchHoles(ctx, s, random, 5, 0.35);
}

/** A teardrop flame with a white-hot root and a licking tip (tip at the top). */
function paintFlameLick(ctx, s, random) {
  const c = s / 2;
  for (let k = 0; k < 10; k += 1) {
    const t = k / 9;
    const y = s * (0.66 - t * 0.5);
    const radius = s * (0.17 * (1 - t) + 0.03) * 1.25;
    const x = c + Math.sin(t * 4.2 + random() * 0.4) * s * 0.04 * t;
    softDisc(ctx, x, y, radius, 170 + 85 * (1 - t), 0.5);
  }
  for (let k = 0; k < 4; k += 1) softDisc(ctx, c, s * (0.64 - k * 0.07), s * 0.1 * (1 - k * 0.18), 255, 0.65);
}

/** A narrow forked flame. */
function paintTallFlame(ctx, s, random) {
  const c = s / 2;
  for (let k = 0; k < 12; k += 1) {
    const t = k / 11;
    const fork = t > 0.45 ? (t - 0.45) * s * 0.18 : 0;
    const radius = s * (0.12 * (1 - t) + 0.025) * 1.25;
    const y = s * (0.74 - t * 0.6);
    softDisc(ctx, c - fork + (random() - 0.5) * 3, y, radius, 175 + 80 * (1 - t), 0.45);
    if (fork > 0) softDisc(ctx, c + fork * 0.8, y + s * 0.04, radius * 0.85, 175 + 80 * (1 - t), 0.4);
  }
  for (let k = 0; k < 3; k += 1) softDisc(ctx, c, s * (0.72 - k * 0.07), s * 0.075, 255, 0.6);
}

/** A spark streak along the frame's vertical axis, brightest toward the leading (top) end. */
function paintSparkStreak(ctx, s) {
  const c = s / 2;
  const across = ctx.createLinearGradient(c - s * 0.3, 0, c + s * 0.3, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(0.65, 'rgba(255,255,255,0.35)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = across;
  ctx.fillRect(c - s * 0.3, s * 0.04, s * 0.6, s * 0.92);
  ctx.globalCompositeOperation = 'destination-in';
  const along = ctx.createLinearGradient(0, s * 0.04, 0, s * 0.96);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.12, 'rgba(255,255,255,1)');
  along.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over';
}

/** A faceted lump of concrete, metal or plastic, lit from the upper left. */
function paintDebrisChunk(ctx, s, random) {
  const c = s / 2;
  const sides = 7;
  const xs = [];
  const ys = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * TAU + (random() - 0.5) * 0.5;
    const radius = s * (0.26 + random() * 0.15);
    xs.push(c + Math.cos(angle) * radius);
    ys.push(c + Math.sin(angle) * radius);
  }
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    const mx = (xs[i] + xs[j]) / 2 - c;
    const my = (ys[i] + ys[j]) / 2 - c;
    const length = Math.hypot(mx, my) || 1;
    const light = (-mx * 0.6 - my * 0.8) / length;
    const value = Math.round(150 + light * 70);
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.beginPath();
    ctx.moveTo(c + (random() - 0.5) * 6, c + (random() - 0.5) * 6);
    ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(xs[j], ys[j]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgb(70,68,66)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) (i === 0 ? ctx.moveTo(xs[i], ys[i]) : ctx.lineTo(xs[i], ys[i]));
  ctx.closePath();
  ctx.stroke();
}

/** A drop of water, long along the vertical axis so it streaks when it flies. */
function paintDroplet(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(0.45, 1);
  softDisc(ctx, 0, 0, s * 0.42, 235, 0.95);
  ctx.restore();
  softDisc(ctx, c - s * 0.04, c - s * 0.12, s * 0.09, 255, 0.9);
}

/** A thin bright ring: shock waves and water rings. */
function paintThinRing(ctx, s) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.47);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0)');
  g.addColorStop(0.84, 'rgba(255,255,255,1)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** A six-pointed muzzle star with a hot centre. */
function paintMuzzleStar(ctx, s) {
  const c = s / 2;
  for (let k = 0; k < 6; k += 1) {
    const angle = (k / 6) * TAU + 0.3;
    const length = s * (k % 2 === 0 ? 0.46 : 0.3);
    const width = s * (k % 2 === 0 ? 0.07 : 0.05);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, length, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  softDisc(ctx, c, c, s * 0.22, 255, 1);
}

/** A round glow with a white-hot centre: flashes, embers, light pools. */
function paintHotGlow(ctx, s) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.48);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.1, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.38)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** A sliver of window glass with a bright edge. */
function paintGlassShard(ctx, s, random) {
  const c = s / 2;
  const points = [
    [c - s * 0.3, c + s * 0.32], [c + s * (0.05 + random() * 0.1), c - s * 0.4], [c + s * 0.3, c + s * 0.2],
  ];
  ctx.fillStyle = 'rgba(230,240,245,0.85)';
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.stroke();
}

/** A small bright point that fades fast at its rim. */
function paintEmber(ctx, s) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.42);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** A frond torn off a palm tree, with a darker midrib. */
function paintPalmLeaf(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-0.6);
  ctx.fillStyle = 'rgb(235,240,225)';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.42, s * 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgb(150,160,130)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(s * 0.4, 0);
  ctx.stroke();
  ctx.restore();
}

/** A thick, lumpy ring of dust: the skirt of a blast rolling over the ground. */
function paintDustRing(ctx, s, random) {
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, s * 0.47);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * TAU + random() * 0.3;
    softDisc(ctx, c + Math.cos(angle) * s * 0.34, c + Math.sin(angle) * s * 0.34, s * (0.05 + random() * 0.05), 240, 0.35);
  }
}

/** A radial-gradient disc of grey `value` (0..255) and peak opacity `alpha`. */
function softDisc(ctx, x, y, radius, value, alpha) {
  const v = Math.round(Math.min(255, Math.max(0, value)));
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
  g.addColorStop(0.55, `rgba(${v},${v},${v},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${v},${v},${v},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Darken the lower half of what is already painted, as if the sun were overhead. */
function shadeFromAbove(ctx, s, amount) {
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.88);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(110,104,100,${amount})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over';
}

/** Sprinkle light and dark grain over what is already painted. */
function speckle(ctx, s, random, count, strength) {
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < count; i += 1) {
    const light = random() < 0.5;
    ctx.fillStyle = light ? `rgba(255,255,255,${strength})` : `rgba(60,55,50,${strength})`;
    ctx.beginPath();
    ctx.arc(random() * s, random() * s, 1 + random() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Cut soft holes into what is already painted, for torn wisps. */
function punchHoles(ctx, s, random, count, strength) {
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < count; i += 1) {
    softDisc(ctx, s * (0.3 + random() * 0.4), s * (0.3 + random() * 0.4), s * (0.04 + random() * 0.06), 0, strength);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** A small seeded generator so the atlas is the same on every run. */
function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL = 128;
const CELL_FILL = 0.88;
const TAU = Math.PI * 2;
