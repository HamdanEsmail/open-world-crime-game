// A tileable texture of soft noise, painted once when the game starts and shared by the sky's
// clouds, the sea's foam and the khamsin's boiling dust: their shaders read noise with a single
// texture lookup instead of computing it for every pixel, which keeps the atmosphere cheap on laptops.
import * as THREE from 'three';

/**
 * The shared noise texture, painted on first use. Each channel is 0..1 and tiles every 256 texels:
 *   R  broad fractal noise, 8 cells across the tile at its coarsest octave (cloud shapes, billows)
 *   G  a soft warp field, 4 cells across (bends cloud streaks, wobbles foam lines)
 *   B  a second warp field, 4 cells across
 *   A  fine grain, 32 cells across (wisps, foam speckle, boiling heads)
 * @returns {THREE.DataTexture}
 */
export function getSkyNoiseTexture(game) {
  if (!sharedNoise) sharedNoise = paintSkyNoise(game.math.hash2D);
  return sharedNoise;
}

/** Smooth value noise in -0.5..0.5 that repeats every `periodX` by `periodZ` cells. */
export function periodicValueNoise(hash, x, z, periodX, periodZ, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const ux = smootherFraction(x - ix);
  const uz = smootherFraction(z - iz);
  const x0 = ((ix % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const z0 = ((iz % periodZ) + periodZ) % periodZ;
  const z1 = (z0 + 1) % periodZ;
  const a = hash(x0, z0, seed);
  const b = hash(x1, z0, seed);
  const c = hash(x0, z1, seed);
  const d = hash(x1, z1, seed);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz - 0.5;
}

/** Paint the four channels, each a sum of periodic octaves built from a small lattice of random values. */
function paintSkyNoise(hash) {
  const size = NOISE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let channel = 0; channel < 4; channel += 1) {
    const { cells, seed } = NOISE_CHANNELS[channel];
    const lattices = cells.map((count, octave) => buildLattice(hash, count, seed + octave * 7));
    let norm = 0;
    for (let o = 0, amplitude = 0.5; o < cells.length; o += 1, amplitude *= 0.5) norm += amplitude;
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        let sum = 0;
        let amplitude = 0.5;
        for (let o = 0; o < cells.length; o += 1) {
          const count = cells[o];
          sum += sampleLattice(lattices[o], count, (i / size) * count, (j / size) * count) * amplitude;
          amplitude *= 0.5;
        }
        data[(j * size + i) * 4 + channel] = Math.round((sum / norm) * 255);
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** A count-by-count grid of random values in 0..1 that wraps at its edges. */
function buildLattice(hash, count, seed) {
  const lattice = new Float32Array(count * count);
  for (let z = 0; z < count; z += 1) {
    for (let x = 0; x < count; x += 1) lattice[z * count + x] = hash(x, z, seed);
  }
  return lattice;
}

/** Smoothly interpolate the wrapping lattice at (x, z), in lattice cells. */
function sampleLattice(lattice, count, x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const ux = smootherFraction(x - ix);
  const uz = smootherFraction(z - iz);
  const x0 = ix % count;
  const x1 = (x0 + 1) % count;
  const z0 = iz % count;
  const z1 = (z0 + 1) % count;
  const a = lattice[z0 * count + x0];
  const b = lattice[z0 * count + x1];
  const c = lattice[z1 * count + x0];
  const d = lattice[z1 * count + x1];
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

function smootherFraction(t) {
  return t * t * (3 - 2 * t);
}

let sharedNoise = null;
const NOISE_SIZE = 256;
const NOISE_CHANNELS = [
  { cells: [8, 16, 32, 64], seed: 11 },
  { cells: [4, 8, 16], seed: 23 },
  { cells: [4, 8, 16], seed: 37 },
  { cells: [32, 64], seed: 41 },
];
