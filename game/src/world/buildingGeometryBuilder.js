// The mason of Port Sarab: one growing mesh that every wall, roof, dome, fin and sign of a city
// chunk is laid into, so a whole neighbourhood draws in one call. Each face carries a facade tile
// from the atlas, a tint, and the building's seed that decides which of its windows light at night.
import * as THREE from 'three';
import { ellipsePoints } from './buildingFootprints.js';

/**
 * A writer of merged building geometry. `atlas` comes from createFacadeAtlas().
 * Faces are wound counter-clockwise seen from outside; walls get facade UVs in tile repeats,
 * snapped so windows are never cut in half at a corner.
 * @returns {ReturnType<typeof makeBuilder>}
 */
export function createBuildingGeometryBuilder(atlas) {
  return makeBuilder(atlas);
}

/** The footprint helpers live in buildingFootprints.js; shapes may import them from here too. */
export { rectPoints, faceOf, chamferPoints, roundedPoints, ellipsePoints, insetPoints, scalePoints, rotatePoints } from './buildingFootprints.js';

function makeBuilder(atlas) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const tiles = [];
  const indices = [];
  const color = new THREE.Color(1, 1, 1);
  let tile = atlas.tiles.plain;
  let seed = 0;
  let vertexCount = 0;
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _n = new THREE.Vector3();

  const builder = {
    /** Choose the facade tile (by name) and optionally the tint for the faces that follow. */
    use(name, tint) {
      const next = atlas.tiles[name];
      if (next) tile = next;
      else console.warn(`facade tile "${name}" is missing`);
      if (tint !== undefined) builder.tint(tint);
      return builder;
    },
    /** Tint the faces that follow: a hex number, a THREE.Color or [r, g, b] in linear 0..1. */
    tint(value) {
      if (typeof value === 'number') color.setHex(value);
      else if (Array.isArray(value)) color.setRGB(value[0], value[1], value[2]);
      else if (value && value.isColor) color.copy(value);
      return builder;
    },
    /** The building's own number, 0..1: which of its windows light up after dark. */
    seed(value) {
      seed = value;
      return builder;
    },
    get tileName() { return tile.name; },
    get tileWidth() { return tile.worldW; },
    get tileHeight() { return tile.worldH; },

    quad,
    wall,
    box,
    prism,
    prismWalls,
    cap,
    cylinder,
    dome,
    pyramid,
    gableRoof,
    barrelVault,
    slab,
    panel,
    triangle,

    /** Vertex and triangle counts so far. */
    stats() {
      return { vertices: vertexCount, triangles: indices.length / 3 };
    },
    /** The finished BufferGeometry, or null when nothing was laid. */
    build() {
      if (vertexCount === 0) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('facadeTile', new THREE.Float32BufferAttribute(tiles, 2));
      geometry.setIndex(vertexCount > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      return geometry;
    },
  };

  function vertex(x, y, z, nx, ny, nz, u, v) {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    colors.push(color.r, color.g, color.b);
    tiles.push(tile.index, seed);
    vertexCount += 1;
    return vertexCount - 1;
  }

  /**
   * A quad a-b-c-d (bottom-left, bottom-right, top-right, top-left seen from its front) with
   * UVs from (u0, v0) at a to (u1, v1) at c. `rotate` turns the tile a quarter (vertical signs).
   * `normal` may be given to bend shading (smooth curves); otherwise it is the face's own.
   */
  function quad(a, b, c, d, u0, v0, u1, v1, rotate = false, normalA = null, normalB = null) {
    let n0 = normalA;
    let n1 = normalB;
    if (!n0) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      _n.crossVectors(_a, _b);
      if (_n.lengthSq() < 1e-12) {
        _a.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        _b.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]);
        _n.crossVectors(_a, _b);
      }
      _n.normalize();
      n0 = [_n.x, _n.y, _n.z];
      n1 = n0;
    }
    if (!n1) n1 = n0;
    const i = vertexCount;
    if (rotate) {
      vertex(a[0], a[1], a[2], n0[0], n0[1], n0[2], u0, v1);
      vertex(b[0], b[1], b[2], n1[0], n1[1], n1[2], u0, v0);
      vertex(c[0], c[1], c[2], n1[0], n1[1], n1[2], u1, v0);
      vertex(d[0], d[1], d[2], n0[0], n0[1], n0[2], u1, v1);
    } else {
      vertex(a[0], a[1], a[2], n0[0], n0[1], n0[2], u0, v0);
      vertex(b[0], b[1], b[2], n1[0], n1[1], n1[2], u1, v0);
      vertex(c[0], c[1], c[2], n1[0], n1[1], n1[2], u1, v1);
      vertex(d[0], d[1], d[2], n0[0], n0[1], n0[2], u0, v1);
    }
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** One triangle a-b-c (counter-clockwise from the front) with planar UVs given per corner. */
  function triangle(a, b, c, ua, va, ub, vb, uc, vc) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b).normalize();
    const i = vertexCount;
    vertex(a[0], a[1], a[2], _n.x, _n.y, _n.z, ua, va);
    vertex(b[0], b[1], b[2], _n.x, _n.y, _n.z, ub, vb);
    vertex(c[0], c[1], c[2], _n.x, _n.y, _n.z, uc, vc);
    indices.push(i, i + 1, i + 2);
  }

  /**
   * A vertical wall from (ax, az) to (bx, bz) seen from outside (a on the left), y0 to y1.
   * Options: fit (UV 0..1 for signs and single features), u0/u1/v0/v1, vBase (the height windows
   * count from), repeatU (exact count of tile repeats), rotate, topInset (lean the top inward, metres).
   */
  function wall(ax, az, bx, bz, y0, y1, o = EMPTY) {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-4 || y1 - y0 < 1e-4) return;
    let u0;
    let u1;
    let v0;
    let v1;
    if (o.fit) {
      u0 = 0.004; u1 = 0.996; v0 = 0.006; v1 = 0.994;
    } else {
      const repeat = o.repeatU ?? Math.max(1, Math.round(length / tile.worldW));
      u0 = o.u0 ?? 0;
      u1 = o.u1 ?? u0 + repeat;
      const base = o.vBase ?? 0;
      v0 = o.v0 ?? (y0 - base) / tile.worldH;
      v1 = o.v1 ?? (y1 - base) / tile.worldH;
    }
    quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], u0, v0, u1, v1, !!o.rotate);
  }

  /**
   * An axis-aligned box. Options: top (tile name for the roof, false for none), topTint,
   * bottom (true to close the underside), skip ('nsew' letters of sides to leave open),
   * vBase, fitSides.
   */
  function box(x0, y0, z0, x1, y1, z1, o = EMPTY) {
    const skip = o.skip || '';
    const wo = o.vBase !== undefined || o.fitSides ? { vBase: o.vBase, fit: o.fitSides } : EMPTY;
    if (!skip.includes('s')) wall(x0, z1, x1, z1, y0, y1, wo);
    if (!skip.includes('e')) wall(x1, z1, x1, z0, y0, y1, wo);
    if (!skip.includes('n')) wall(x1, z0, x0, z0, y0, y1, wo);
    if (!skip.includes('w')) wall(x0, z0, x0, z1, y0, y1, wo);
    const points = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
    if (o.top !== false) withTile(o.top, o.topTint, () => cap(points, y1, true));
    if (o.bottom) withTile(o.bottomTile, o.bottomTint, () => cap(points, y0, false));
  }

  /** A thin horizontal slab (floor plate, canopy, balcony) with all six sides. */
  function slab(x0, z0, x1, z1, y0, thickness, o = EMPTY) {
    box(x0, y0, z0, x1, y0 + thickness, z1, { ...o, bottom: true });
  }

  /**
   * A flat panel standing on the ground plane line a-b (sign board, fin), both faces when
   * `doubleSided`; `fit` maps the whole tile once.
   */
  function panel(ax, az, bx, bz, y0, y1, o = EMPTY) {
    wall(ax, az, bx, bz, y0, y1, o);
    if (o.doubleSided) wall(bx, bz, ax, az, y0, y1, o.backFit === false ? { ...o, fit: false } : o);
  }

  /**
   * Extrude a convex footprint from y0 to y1. Options: top (tile name or false), topTint,
   * topScale (taper the top about the centroid), topY(x, z) (a sloped top), smooth (round
   * shading across facets), perimeter (continuous UVs around the outline), vBase, repeatU.
   */
  function prism(points, y0, y1, o = EMPTY) {
    const top = prismWalls(points, y0, y1, o);
    if (o.top !== false) withTile(o.top, o.topTint, () => capPoints(top, true));
  }

  /** The walls of a prism without its cap; returns the top outline as [x, y, z] points. */
  function prismWalls(points, y0, y1, o = EMPTY) {
    const n = points.length;
    let cx = 0;
    let cz = 0;
    for (const p of points) { cx += p[0]; cz += p[1]; }
    cx /= n;
    cz /= n;
    const scale = o.topScale ?? 1;
    const top = points.map(([x, z]) => {
      const tx = cx + (x - cx) * scale;
      const tz = cz + (z - cz) * scale;
      return [tx, typeof o.topY === 'function' ? o.topY(tx, tz) : y1, tz];
    });
    const edgeNormals = [];
    let perimeter = 0;
    for (let i = 0; i < n; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      edgeNormals.push([-dz / len, 0, dx / len]);
      perimeter += len;
    }
    const vertexNormals = o.smooth ? points.map((_, i) => {
      const prev = edgeNormals[(i + n - 1) % n];
      const next = edgeNormals[i];
      const dot = prev[0] * next[0] + prev[2] * next[2];
      if (dot < 0.6) return null;
      const x = prev[0] + next[0];
      const z = prev[2] + next[2];
      const l = Math.hypot(x, z) || 1;
      return [x / l, 0, z / l];
    }) : null;
    const base = o.vBase ?? 0;
    const repeatsAround = o.perimeter ? Math.max(1, Math.round(perimeter / tile.worldW)) : 0;
    let run = 0;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const a = points[i];
      const b = points[j];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-4) continue;
      let u0;
      let u1;
      if (o.perimeter) {
        u0 = (run / perimeter) * repeatsAround;
        u1 = ((run + len) / perimeter) * repeatsAround;
      } else {
        u0 = 0;
        u1 = o.repeatU ?? Math.max(1, Math.round(len / tile.worldW));
      }
      run += len;
      const ta = top[i];
      const tb = top[j];
      const v0 = (y0 - base) / tile.worldH;
      const va = (ta[1] - base) / tile.worldH;
      const vb = (tb[1] - base) / tile.worldH;
      let na = null;
      let nb = null;
      if (vertexNormals) {
        na = vertexNormals[i] || edgeNormals[i];
        nb = vertexNormals[j] || edgeNormals[i];
      }
      if (Math.abs(va - vb) < 1e-5) {
        quad([a[0], y0, a[1]], [b[0], y0, b[1]], tb, ta, u0, v0, u1, va, false, na, nb);
      } else {
        // A sloped top: two triangles with their own heights.
        const i0 = vertexCount;
        const nn = na || normalOf([a[0], y0, a[1]], [b[0], y0, b[1]], ta);
        const mm = nb || nn;
        vertex(a[0], y0, a[1], nn[0], nn[1], nn[2], u0, v0);
        vertex(b[0], y0, b[1], mm[0], mm[1], mm[2], u1, v0);
        vertex(tb[0], tb[1], tb[2], mm[0], mm[1], mm[2], u1, vb);
        vertex(ta[0], ta[1], ta[2], nn[0], nn[1], nn[2], u0, va);
        indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
    }
    return top;
  }

  /** Close a convex outline of [x, z] points at height y, facing up (or down). */
  function cap(points, y, up = true) {
    capPoints(points.map(([x, z]) => [x, y, z]), up);
  }

  /** Close a convex outline of [x, y, z] points (fan triangulation), planar UVs in metres. */
  function capPoints(points, up = true) {
    const n = points.length;
    if (n < 3) return;
    // The winding of the outline decides which way the fan faces; flip it to face up (or down).
    _n.set(0, 0, 0);
    for (let i = 0; i < n; i += 1) {
      const p = points[i];
      const q = points[(i + 1) % n];
      _n.x += (p[1] - q[1]) * (p[2] + q[2]);
      _n.y += (p[2] - q[2]) * (p[0] + q[0]);
      _n.z += (p[0] - q[0]) * (p[1] + q[1]);
    }
    if (_n.lengthSq() < 1e-12) return;
    _n.normalize();
    const flip = up ? _n.y < 0 : _n.y > 0;
    if (flip) _n.negate();
    const start = vertexCount;
    for (const p of points) vertex(p[0], p[1], p[2], _n.x, _n.y, _n.z, p[0] / tile.worldW, -p[2] / tile.worldH);
    for (let i = 1; i < n - 1; i += 1) {
      if (!flip) indices.push(start, start + i, start + i + 1);
      else indices.push(start, start + i + 1, start + i);
    }
  }

  /** An upright cylinder (water tank, column, drum), smooth-shaded, capped on top. */
  function cylinder(cx, cz, radius, y0, y1, segments = 8, o = EMPTY) {
    const points = ellipsePoints(cx, cz, radius, radius, segments);
    prism(points, y0, y1, { ...o, smooth: true, perimeter: true, topScale: o.topScale });
  }

  /** A dome (half an ellipsoid) of radius r rising `rise` above y0. */
  function dome(cx, cz, radius, y0, rise, segments = 10, rings = 4) {
    const ring = [];
    for (let k = 0; k <= rings; k += 1) {
      const t = (k / rings) * Math.PI / 2;
      ring.push({ r: radius * Math.cos(t), y: y0 + rise * Math.sin(t), nr: Math.cos(t) / radius, ny: Math.sin(t) / Math.max(rise, 0.01) });
    }
    for (let k = 0; k < rings; k += 1) {
      const lo = ring[k];
      const hi = ring[k + 1];
      for (let s = 0; s < segments; s += 1) {
        const a0 = (s / segments) * Math.PI * 2;
        const a1 = ((s + 1) / segments) * Math.PI * 2;
        const c0 = Math.cos(a0);
        const s0 = Math.sin(a0);
        const c1 = Math.cos(a1);
        const s1 = Math.sin(a1);
        const n0 = normalize3(lo.nr * c0, lo.ny, -lo.nr * s0);
        const n1 = normalize3(lo.nr * c1, lo.ny, -lo.nr * s1);
        quad(
          [cx + lo.r * c0, lo.y, cz - lo.r * s0], [cx + lo.r * c1, lo.y, cz - lo.r * s1],
          [cx + hi.r * c1, hi.y, cz - hi.r * s1], [cx + hi.r * c0, hi.y, cz - hi.r * s0],
          s / segments * 4, k / rings, (s + 1) / segments * 4, (k + 1) / rings, false, n0, n1,
        );
      }
    }
  }

  /** A four-sided pyramid (hip roof, obelisk cap) from a w x d base at y0 to an apex h above. */
  function pyramid(cx, cz, w, d, y0, h, o = EMPTY) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const apexW = o.ridge ?? 0;
    const alongX = w >= d;
    const top = y0 + h;
    const rx = alongX ? apexW / 2 : 0;
    const rz = alongX ? 0 : apexW / 2;
    const tw = tile.worldW;
    const th = tile.worldH;
    // south and north faces are trapezoids (or triangles), east and west the hip ends
    quad([x0, y0, z1], [x1, y0, z1], [cx + rx, top, cz + rz], [cx - rx, top, cz + rz], 0, 0, w / tw, Math.hypot(h, d / 2) / th);
    quad([x1, y0, z0], [x0, y0, z0], [cx - rx, top, cz - rz], [cx + rx, top, cz - rz], 0, 0, w / tw, Math.hypot(h, d / 2) / th);
    quad([x1, y0, z1], [x1, y0, z0], [cx + rx, top, cz - rz], [cx + rx, top, cz + rz], 0, 0, d / tw, Math.hypot(h, w / 2) / th);
    quad([x0, y0, z0], [x0, y0, z1], [cx - rx, top, cz + rz], [cx - rx, top, cz - rz], 0, 0, d / tw, Math.hypot(h, w / 2) / th);
  }

  /**
   * A pitched roof over a rectangle: two slopes meeting at a ridge along X (or Z), with
   * gable-end triangles in `endTile` (defaults to the current tile).
   */
  function gableRoof(x0, z0, x1, z1, y0, rise, alongX = true, o = EMPTY) {
    const top = y0 + rise;
    const tw = tile.worldW;
    const th = tile.worldH;
    if (alongX) {
      const zm = (z0 + z1) / 2;
      const slope = Math.hypot(rise, (z1 - z0) / 2);
      quad([x0, y0, z1], [x1, y0, z1], [x1, top, zm], [x0, top, zm], 0, 0, (x1 - x0) / tw, slope / th);
      quad([x1, y0, z0], [x0, y0, z0], [x0, top, zm], [x1, top, zm], 0, 0, (x1 - x0) / tw, slope / th);
      withTile(o.endTile, o.endTint, () => {
        const v1 = (y0 + rise - (o.vBase ?? 0)) / tile.worldH;
        const v0 = (y0 - (o.vBase ?? 0)) / tile.worldH;
        const ur = (z1 - z0) / tile.worldW;
        triangle([x1, y0, z1], [x1, y0, z0], [x1, top, zm], 0, v0, ur, v0, ur / 2, v1);
        triangle([x0, y0, z0], [x0, y0, z1], [x0, top, zm], 0, v0, ur, v0, ur / 2, v1);
      });
    } else {
      const xm = (x0 + x1) / 2;
      const slope = Math.hypot(rise, (x1 - x0) / 2);
      quad([x1, y0, z1], [x1, y0, z0], [xm, top, z0], [xm, top, z1], 0, 0, (z1 - z0) / tw, slope / th);
      quad([x0, y0, z0], [x0, y0, z1], [xm, top, z1], [xm, top, z0], 0, 0, (z1 - z0) / tw, slope / th);
      withTile(o.endTile, o.endTint, () => {
        const v1 = (y0 + rise - (o.vBase ?? 0)) / tile.worldH;
        const v0 = (y0 - (o.vBase ?? 0)) / tile.worldH;
        const ur = (x1 - x0) / tile.worldW;
        triangle([x0, y0, z1], [x1, y0, z1], [xm, top, z1], 0, v0, ur, v0, ur / 2, v1);
        triangle([x1, y0, z0], [x0, y0, z0], [xm, top, z0], 0, v0, ur, v0, ur / 2, v1);
      });
    }
  }

  /** A barrel vault (half-cylinder roof) over a rectangle, its axis along X (or Z), with end walls. */
  function barrelVault(x0, z0, x1, z1, y0, rise, alongX = true, segments = 8, o = EMPTY) {
    const span = alongX ? z1 - z0 : x1 - x0;
    const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const half = span / 2;
    const profile = [];
    for (let s = 0; s <= segments; s += 1) {
      const t = Math.PI * (1 - s / segments);
      profile.push({ off: half * Math.cos(t), y: y0 + rise * Math.sin(t), nx: Math.cos(t) / half, ny: Math.sin(t) / rise });
    }
    const length = alongX ? x1 - x0 : z1 - z0;
    const repeats = Math.max(1, Math.round(length / tile.worldW));
    for (let s = 0; s < segments; s += 1) {
      const p = profile[s];
      const q = profile[s + 1];
      const np = normalize3(p.nx, p.ny, 0);
      const nq = normalize3(q.nx, q.ny, 0);
      if (alongX) {
        // across goes from -z side (s=0 at z0? off negative = z0 side) to +z
        quad([x1, p.y, mid + p.off], [x0, p.y, mid + p.off], [x0, q.y, mid + q.off], [x1, q.y, mid + q.off],
          0, s / segments, repeats, (s + 1) / segments, false, [0, np[1], np[0]], [0, nq[1], nq[0]]);
      } else {
        quad([mid + p.off, p.y, z0], [mid + p.off, p.y, z1], [mid + q.off, q.y, z1], [mid + q.off, q.y, z0],
          0, s / segments, repeats, (s + 1) / segments, false, [np[0], np[1], 0], [nq[0], nq[1], 0]);
      }
    }
    if (o.ends === false) return;
    withTile(o.endTile, o.endTint, () => {
      const fan = (fixed, flip) => {
        for (let s = 0; s < segments; s += 1) {
          const p = profile[s];
          const q = profile[s + 1];
          const A = alongX ? [fixed, y0, mid] : [mid, y0, fixed];
          const B = alongX ? [fixed, p.y, mid + p.off] : [mid + p.off, p.y, fixed];
          const C = alongX ? [fixed, q.y, mid + q.off] : [mid + q.off, q.y, fixed];
          const uB = (p.off + half) / tile.worldW;
          const uC = (q.off + half) / tile.worldW;
          const vB = (p.y - y0) / tile.worldH;
          const vC = (q.y - y0) / tile.worldH;
          const uA = half / tile.worldW;
          if (flip) triangle(A, C, B, uA, 0, uC, vC, uB, vB);
          else triangle(A, B, C, uA, 0, uB, vB, uC, vC);
        }
      };
      if (alongX) { fan(x1, false); fan(x0, true); } else { fan(z0, false); fan(z1, true); }
    });
  }

  /** Run `draw` with another tile (and tint) for a moment, then restore the current ones. */
  function withTile(name, tint, draw) {
    if (!name && tint === undefined) { draw(); return; }
    const savedTile = tile;
    const r = color.r;
    const g = color.g;
    const b = color.b;
    if (name) builder.use(name);
    if (tint !== undefined) builder.tint(tint);
    draw();
    tile = savedTile;
    color.setRGB(r, g, b);
  }

  function normalOf(a, b, c) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b).normalize();
    return [_n.x, _n.y, _n.z];
  }

  return builder;
}

function normalize3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const EMPTY = Object.freeze({});
