// Collects the ground of Port Sarab (asphalt, kerbs, paving, lawns, quays, runway) as triangles in a
// few large world chunks and three layers: the base floor, the paint laid over it, and the solid
// kerbs, walls and hedges that cast shadows. One build() turns each chunk-layer into one mesh, so the
// whole street network and every block floor cost a handful of draw calls.
import * as THREE from 'three';
import { SURFACE_METRES } from './groundSurfaceAtlas.js';

/**
 * @param {Object} game
 * @param {(x:number, z:number) => string} chunkOf   names the chunk a piece of ground belongs to
 */
export function createGroundMeshBuilder(game, chunkOf) {
  const { valueNoise2D } = game.math;
  const buffers = new Map();
  const corner = { x: 0, y: 0, z: 0, u: 0, v: 0, r: 1, g: 1, b: 1 };
  const tintCache = new Map();

  /** The buffer for a layer ('base' | 'paint' | 'solid') at a world point. */
  function target(layer, x, z) {
    const key = `${layer}|${chunkOf(x, z)}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      buffer = { layer, chunk: chunkOf(x, z), positions: [], normals: [], colors: [], uvs: [], tiles: [], indices: [] };
      buffers.set(key, buffer);
    }
    return buffer;
  }

  /** Linear-light colour multipliers for an sRGB hex tint (white leaves the swatch as painted). */
  function tintOf(hex) {
    let rgb = tintCache.get(hex);
    if (!rgb) {
      const c = new THREE.Color(hex);
      rgb = [c.r, c.g, c.b];
      tintCache.set(hex, rgb);
    }
    return rgb;
  }

  /** Brightness wobble of `amount` that drifts over tens of metres, so no surface is a flat slab. */
  function wobble(x, z, amount) {
    if (!amount) return 1;
    const broad = valueNoise2D(x / 19, z / 19, 3) * 2 - 1;
    const fine = valueNoise2D(x / 5.7, z / 5.7, 8) * 2 - 1;
    return 1 + amount * (broad * 0.75 + fine * 0.35);
  }

  function pushVertex(buffer, x, y, z, nx, ny, nz, u, v, r, g, b, tile) {
    buffer.positions.push(x, y, z);
    buffer.normals.push(nx, ny, nz);
    buffer.uvs.push(u, v);
    buffer.colors.push(r, g, b);
    buffer.tiles.push(tile);
    return buffer.positions.length / 3 - 1;
  }

  /** Add triangle a-b-c, flipped if needed so its front faces along (nx, ny, nz). */
  function pushTriangle(buffer, a, b, c, nx, ny, nz) {
    const p = buffer.positions;
    const ax = p[a * 3]; const ay = p[a * 3 + 1]; const az = p[a * 3 + 2];
    const e1x = p[b * 3] - ax; const e1y = p[b * 3 + 1] - ay; const e1z = p[b * 3 + 2] - az;
    const e2x = p[c * 3] - ax; const e2y = p[c * 3 + 1] - ay; const e2z = p[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * nx + cy * ny + cz * nz < 0) buffer.indices.push(a, c, b);
    else buffer.indices.push(a, b, c);
  }

  function uvOf(surface, x, z, options) {
    const metres = SURFACE_METRES[surface] * (options.scale || 1);
    const ox = options.uvOffsetX || 0;
    const oz = options.uvOffsetZ || 0;
    if (options.rotate) {
      corner.u = (z + oz) / metres;
      corner.v = (x + ox) / metres;
    } else {
      corner.u = (x + ox) / metres;
      corner.v = (z + oz) / metres;
    }
  }

  const builder = {
    /**
     * A flat rectangle at height y, cut into cells of about `cell` metres so its tint can wobble.
     * options: { tint, jitter, cell, rotate, scale }
     */
    rect(layer, x0, z0, x1, z1, y, surface, options = {}) {
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
      const cell = options.cell || 12;
      const nx = Math.max(1, Math.round((x1 - x0) / cell));
      const nz = Math.max(1, Math.round((z1 - z0) / cell));
      const tint = tintOf(options.tint === undefined ? 0xffffff : options.tint);
      builder.grid(layer, surface, nz + 1, nx + 1, (i, j, out) => {
        out.x = x0 + ((x1 - x0) * j) / nx;
        out.z = z0 + ((z1 - z0) * i) / nz;
        out.y = y;
        uvOf(surface, out.x, out.z, options);
        out.u = corner.u;
        out.v = corner.v;
        const w = wobble(out.x, out.z, options.jitter === undefined ? 0.08 : options.jitter);
        out.r = tint[0] * w;
        out.g = tint[1] * w;
        out.b = tint[2] * w;
      }, (x0 + x1) / 2, (z0 + z1) / 2);
    },

    /**
     * A grid of shared vertices (rows x cols). vertexFn(i, j, out) fills out.x/y/z, out.u/v, out.r/g/b.
     * Faces point up unless `up` is false (then each quad faces along normalFn's direction).
     */
    grid(layer, surface, rows, cols, vertexFn, chunkX, chunkZ) {
      let buffer = null;
      const first = [];
      for (let i = 0; i < rows; i += 1) {
        for (let j = 0; j < cols; j += 1) {
          corner.r = 1; corner.g = 1; corner.b = 1;
          vertexFn(i, j, corner);
          if (!buffer) buffer = target(layer, chunkX === undefined ? corner.x : chunkX, chunkZ === undefined ? corner.z : chunkZ);
          const index = pushVertex(buffer, corner.x, corner.y, corner.z, 0, 1, 0, corner.u, corner.v, corner.r, corner.g, corner.b, surface);
          if (i === 0 && j === 0) first.push(index);
        }
      }
      const start = first[0];
      for (let i = 0; i < rows - 1; i += 1) {
        for (let j = 0; j < cols - 1; j += 1) {
          const a = start + i * cols + j;
          const b = a + 1;
          const c = a + cols;
          const d = c + 1;
          pushTriangle(buffer, a, c, d, 0, 1, 0);
          pushTriangle(buffer, a, d, b, 0, 1, 0);
        }
      }
      return buffer;
    },

    /** A flat convex polygon [[x, z], ...] at height y, fanned from its first corner. */
    polygon(layer, points, y, surface, options = {}) {
      if (points.length < 3) return;
      let cx = 0;
      let cz = 0;
      for (const p of points) { cx += p[0]; cz += p[1]; }
      cx /= points.length;
      cz /= points.length;
      const buffer = target(layer, cx, cz);
      const tint = tintOf(options.tint === undefined ? 0xffffff : options.tint);
      const jitter = options.jitter === undefined ? 0.06 : options.jitter;
      const indices = [];
      for (const p of points) {
        uvOf(surface, p[0], p[1], options);
        const w = wobble(p[0], p[1], jitter);
        indices.push(pushVertex(buffer, p[0], p[2] === undefined ? y : p[2], p[1], 0, 1, 0, corner.u, corner.v, tint[0] * w, tint[1] * w, tint[2] * w, surface));
      }
      for (let i = 1; i < indices.length - 1; i += 1) pushTriangle(buffer, indices[0], indices[i], indices[i + 1], 0, 1, 0);
    },

    /** A flat strip of width `width` centred on the segment (ax, az)-(bx, bz): road lines, bands, bars. */
    bar(layer, ax, az, bx, bz, width, y, surface, options = {}) {
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01) return;
      const px = (-(bz - az) / length) * width * 0.5;
      const pz = ((bx - ax) / length) * width * 0.5;
      builder.polygon(layer, [[ax + px, az + pz], [bx + px, bz + pz], [bx - px, bz - pz], [ax - px, az - pz]], y, surface, options);
    },

    /**
     * A vertical face from (x0, z0) to (x1, z1) between bottom and top heights at each end. It faces to
     * the left of travel from the first point to the second (walking east, it faces north).
     */
    face(layer, x0, z0, x1, z1, bottom0, top0, bottom1, top1, surface, options = {}) {
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 0.005) return;
      const nx = (z1 - z0) / length;
      const nz = -(x1 - x0) / length;
      const buffer = target(layer, (x0 + x1) / 2, (z0 + z1) / 2);
      const tint = tintOf(options.tint === undefined ? 0xffffff : options.tint);
      const metres = SURFACE_METRES[surface] * (options.scale || 1);
      const along0 = options.rotate ? 0 : (Math.abs(nx) > Math.abs(nz) ? z0 : x0);
      const along1 = options.rotate ? length : (Math.abs(nx) > Math.abs(nz) ? z1 : x1);
      const w = wobble(x0, z0, options.jitter === undefined ? 0.05 : options.jitter);
      const r = tint[0] * w;
      const g = tint[1] * w;
      const b = tint[2] * w;
      const shade = options.shadeBottom === undefined ? 1 : options.shadeBottom;
      const a = pushVertex(buffer, x0, bottom0, z0, nx, 0, nz, along0 / metres, bottom0 / metres, r * shade, g * shade, b * shade, surface);
      const bb = pushVertex(buffer, x1, bottom1, z1, nx, 0, nz, along1 / metres, bottom1 / metres, r * shade, g * shade, b * shade, surface);
      const c = pushVertex(buffer, x1, top1, z1, nx, 0, nz, along1 / metres, top1 / metres, r, g, b, surface);
      const d = pushVertex(buffer, x0, top0, z0, nx, 0, nz, along0 / metres, top0 / metres, r, g, b, surface);
      if (Math.abs(top0 - bottom0) > 0.0005 || Math.abs(top1 - bottom1) > 0.0005) {
        if (top0 - bottom0 > 0.0005) pushTriangle(buffer, a, bb, d, nx, 0, nz);
        if (top1 - bottom1 > 0.0005) pushTriangle(buffer, bb, c, d, nx, 0, nz);
      }
    },

    /** An axis-aligned block standing from y0 to y1: a top and four sides (kerb, planter, wall). */
    box(layer, x0, z0, x1, z1, y0, y1, topSurface, sideSurface, options = {}) {
      builder.rect(layer, x0, z0, x1, z1, y1, topSurface, { tint: options.topTint === undefined ? options.tint : options.topTint, jitter: options.jitter, cell: options.cell || 40, rotate: options.rotate });
      const sideOptions = { tint: options.sideTint === undefined ? options.tint : options.sideTint, jitter: options.jitter, shadeBottom: options.shadeBottom };
      builder.face(layer, x1, z0, x0, z0, y0, y1, y0, y1, sideSurface, sideOptions);
      builder.face(layer, x0, z1, x1, z1, y0, y1, y0, y1, sideSurface, sideOptions);
      builder.face(layer, x0, z0, x0, z1, y0, y1, y0, y1, sideSurface, sideOptions);
      builder.face(layer, x1, z1, x1, z0, y0, y1, y0, y1, sideSurface, sideOptions);
    },

    /** A flat ring sector (annulus between two radii, between two angles) for plazas and drives. */
    ring(layer, cx, cz, inner, outer, angle0, angle1, y, surface, options = {}) {
      const segments = Math.max(3, Math.ceil(((angle1 - angle0) * outer) / (options.step || 3)));
      const tint = tintOf(options.tint === undefined ? 0xffffff : options.tint);
      const jitter = options.jitter === undefined ? 0.05 : options.jitter;
      builder.grid(layer, surface, segments + 1, 2, (i, j, out) => {
        const angle = angle0 + ((angle1 - angle0) * i) / segments;
        const radius = j === 0 ? inner : outer;
        out.x = cx + Math.sin(angle) * radius;
        out.z = cz + Math.cos(angle) * radius;
        out.y = y;
        if (options.polar) {
          out.u = (angle * (inner + outer) * 0.5) / SURFACE_METRES[surface];
          out.v = radius / SURFACE_METRES[surface];
        } else {
          uvOf(surface, out.x, out.z, options);
          out.u = corner.u;
          out.v = corner.v;
        }
        const w = wobble(out.x, out.z, jitter);
        out.r = tint[0] * w;
        out.g = tint[1] * w;
        out.b = tint[2] * w;
      }, cx, cz);
    },

    /** A ring of vertical faces around a circle (pool rims, fountain basins, round planters). */
    cylinderWall(layer, cx, cz, radius, y0, y1, surface, options = {}) {
      const segments = options.segments || Math.max(8, Math.ceil(radius * 2));
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const x0 = cx + Math.sin(a0) * radius;
        const z0 = cz + Math.cos(a0) * radius;
        const x1 = cx + Math.sin(a1) * radius;
        const z1 = cz + Math.cos(a1) * radius;
        if (options.inward) builder.face(layer, x0, z0, x1, z1, y0, y1, y0, y1, surface, options);
        else builder.face(layer, x1, z1, x0, z0, y0, y1, y0, y1, surface, options);
      }
    },

    /** Turn every chunk-layer into a mesh with the matching material. */
    build(materials) {
      const meshes = [];
      for (const buffer of buffers.values()) {
        if (buffer.indices.length === 0) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2));
        geometry.setAttribute('surfaceTile', new THREE.BufferAttribute(new Uint8Array(buffer.tiles), 1));
        const vertexCount = buffer.positions.length / 3;
        geometry.setIndex(new THREE.BufferAttribute(vertexCount > 65535 ? new Uint32Array(buffer.indices) : new Uint16Array(buffer.indices), 1));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, materials[buffer.layer]);
        mesh.name = `ground-${buffer.layer}-${buffer.chunk}`;
        mesh.receiveShadow = true;
        mesh.castShadow = buffer.layer === 'solid';
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        meshes.push(mesh);
      }
      buffers.clear();
      return meshes;
    },

    tintOf,
    wobble,
  };
  return builder;
}
