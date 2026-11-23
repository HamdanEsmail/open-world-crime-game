// Small numeric helpers shared through game.math: clamping, easing, angles, 2D distance and a
// deterministic value-noise used for dunes and for anything that should look organic.

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function inverseLerp(a, b, value) {
  return a === b ? 0 : clamp01((value - a) / (b - a));
}

export function smoothstep(edge0, edge1, value) {
  const t = inverseLerp(edge0, edge1, value);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent approach of `a` toward `b`; lambda is the speed (higher is snappier). */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** Move `a` toward `b` by at most `maxStep`. */
export function approach(a, b, maxStep) {
  return a < b ? Math.min(a + maxStep, b) : Math.max(a - maxStep, b);
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Shortest signed turn from angle `from` to angle `to`. */
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

export function dampAngle(a, b, lambda, dt) {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

/** Heading (yaw) of a direction on the ground plane: 0 faces +Z, PI/2 faces +X. */
export function headingOf(dx, dz) {
  return Math.atan2(dx, dz);
}

export function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distanceSq2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Distance from point p to segment a-b on the ground plane; `out.t` gets the 0..1 position along it. */
export function distanceToSegment2D(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq === 0 ? 0 : clamp01(((px - ax) * abx + (pz - az) * abz) / lengthSq);
  if (out) out.t = t;
  return distance2D(px, pz, ax + abx * t, az + abz * t);
}

/** Integer hash to 0..1, stable for the same cell and seed. */
export function hash2D(ix, iz, seed = 0) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 144665) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. */
export function valueNoise2D(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Fractal noise in 0..1: `octaves` layers of value noise. */
export function fractalNoise2D(x, z, octaves = 4, seed = 0) {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 17) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/** Everything above as one object, handed to systems as game.math. */
export const mathUtils = {
  TAU, clamp, clamp01, lerp, inverseLerp, smoothstep, damp, approach, wrapAngle, angleDelta, dampAngle,
  headingOf, distance2D, distanceSq2D, distanceToSegment2D, hash2D, valueNoise2D, fractalNoise2D,
};
