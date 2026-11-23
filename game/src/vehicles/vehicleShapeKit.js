// The sculpting kit the vehicles of Port Sarab are carved with: side profiles extruded across the width
// with rounded edges and tumblehome, boxes and tubes for bumpers, wings and roll cages, and decals (lamp
// lenses, grilles, window glass, door seams) projected onto the shell like stickers. Everything bakes
// into one vertex-coloured mesh with crease-aware smooth normals and livery coordinates.
import * as THREE from 'three';
import { VEHICLE_SURFACES } from './vehicleMaterials.js';

const CREASE_COS = Math.cos((40 * Math.PI) / 180);

/**
 * Start sculpting one model. `dims` (length, width, height in metres) sets the livery projection.
 * @param {{length:number, width:number, height:number}} dims
 */
export function createShapeKit(dims) {
  const positions = [];
  const parts = [];
  const groups = [];
  const solids = [];
  const lamps = { head: [], tail: [], reverse: [], sirenRed: [], sirenBlue: [], amber: [], sign: [] };
  let groupCounter = 0;
  const tri = new Float32Array(9);
  const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };

  /** Store one triangle. */
  function pushTriangle(t, part, group, solid) {
    const ex = t[3] - t[0], ey = t[4] - t[1], ez = t[5] - t[2];
    const fx = t[6] - t[0], fy = t[7] - t[1], fz = t[8] - t[2];
    const cx = ey * fz - ez * fy, cy = ez * fx - ex * fz, cz = ex * fy - ey * fx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    if (!VEHICLE_SURFACES[part]) part = 'paint';
    if (solid) solids.push(parts.length);
    for (let i = 0; i < 9; i += 1) positions.push(t[i]);
    parts.push(part);
    groups.push(group);
  }

  /** Store a triangle, flipped if needed so it faces along the hint direction. */
  function orientedTriangle(a, b, c, hx, hy, hz, part, group, solid) {
    tri[0] = a[0]; tri[1] = a[1]; tri[2] = a[2];
    tri[3] = b[0]; tri[4] = b[1]; tri[5] = b[2];
    tri[6] = c[0]; tri[7] = c[1]; tri[8] = c[2];
    const n = faceNormal(tri);
    if (n.x * hx + n.y * hy + n.z * hz < 0) {
      tri[3] = c[0]; tri[4] = c[1]; tri[5] = c[2];
      tri[6] = b[0]; tri[7] = b[1]; tri[8] = b[2];
    }
    pushTriangle(tri, part, group, solid);
  }

  /** Add every triangle of a three.js geometry through a vertex transform. */
  function addGeometry(geometry, transform, part, { group = newGroup(), solid = false, classify = null } = {}) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i + 2 < position.count; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        v.fromBufferAttribute(position, i + k);
        transform(v);
        tri[k * 3] = v.x; tri[k * 3 + 1] = v.y; tri[k * 3 + 2] = v.z;
      }
      const surface = classify ? classify(centroidOf(tri), faceNormal(tri)) : part;
      pushTriangle(tri, surface, group, solid);
    }
    if (source !== geometry) source.dispose();
    geometry.dispose();
  }

  function newGroup() {
    groupCounter += 1;
    return groupCounter;
  }

  /** Nearest solid surface along a ray; fills and returns `hit`, or null. */
  function raycast(ox, oy, oz, dx, dy, dz) {
    let best = Infinity;
    let bestIndex = -1;
    for (let s = 0; s < solids.length; s += 1) {
      const o = solids[s] * 9;
      const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
      const e1x = positions[o + 3] - ax, e1y = positions[o + 4] - ay, e1z = positions[o + 5] - az;
      const e2x = positions[o + 6] - ax, e2y = positions[o + 7] - ay, e2z = positions[o + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det;
      const tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const w = (dx * qx + dy * qy + dz * qz) * inv;
      if (w < 0 || u + w > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-4 && t < best) {
        best = t;
        bestIndex = o;
      }
    }
    if (bestIndex < 0) return null;
    for (let i = 0; i < 9; i += 1) tri[i] = positions[bestIndex + i];
    const n = faceNormal(tri);
    const flip = n.x * dx + n.y * dy + n.z * dz > 0 ? -1 : 1;
    hit.t = best;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    hit.nx = n.x * flip; hit.ny = n.y * flip; hit.nz = n.z * flip;
    return hit;
  }

  const kit = {
    lamps,
    newGroup,
    raycast,
    addGeometry,

    /**
     * Extrude a side silhouette, given as [z, y] points, across the width (centred on x = xOffset), with
     * rounded edges. `deform(x, y, z)` returns a new x for tumblehome and plan taper; `classify(c, n)`
     * picks the surface of each triangle from its centre and normal.
     */
    profileShell(outline, { width, bevel = 0.06, bevelSegments = 3, xOffset = 0, deform = null, classify = null, part = 'paint', solid = true, curveSegments = 4 }) {
      const clean = dedupeOutline(outline);
      if (clean.length < 3) return;
      const shape = new THREE.Shape(clean.map((p) => new THREE.Vector2(p[0], p[1])));
      const b = Math.max(0, Math.min(bevel, width * 0.45));
      const depth = b > 0 ? Math.max(0.002, width - 2 * b) : width;
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth, steps: 1, curveSegments, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments,
      });
      addGeometry(geometry, (v) => {
        const z = v.x;
        const y = v.y;
        let x = -(v.z - depth / 2);
        if (deform) x = deform(x, y, z);
        v.set(x + xOffset, y, z);
      }, part, { solid, classify });
    },

    /** A box centred at (cx, cy, cz), turned by rx, ry, rz (order YXZ). */
    box(cx, cy, cz, sx, sy, sz, part, { rx = 0, ry = 0, rz = 0, solid = false } = {}) {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, cy, cz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
        new THREE.Vector3(1, 1, 1),
      );
      addGeometry(new THREE.BoxGeometry(sx, sy, sz), (v) => v.applyMatrix4(matrix), part, { solid });
    },

    /** A round tube from a to b ([x, y, z] arrays): roll cages, exhausts, push bars. */
    tube(a, b, radius, part, { segments = 6, caps = true } = {}) {
      const start = new THREE.Vector3(a[0], a[1], a[2]);
      const end = new THREE.Vector3(b[0], b[1], b[2]);
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length < 1e-4) return;
      const matrix = new THREE.Matrix4().compose(
        start.clone().add(end).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
        new THREE.Vector3(1, 1, 1),
      );
      addGeometry(new THREE.CylinderGeometry(radius, radius, length, segments, 1, !caps), (v) => v.applyMatrix4(matrix), part);
    },

    /**
     * Project a rectangle onto the shell, like a sticker standing `offset` proud of it. Axis 'front' and
     * 'rear' take the rectangle in (x, y); 'left' and 'right' in (z, y); 'top' in (x, z). `mirror` adds
     * the twin on the other side. `lamp` registers the centre as a light anchor of that kind.
     */
    decal(axis, a0, a1, b0, b1, part, { cols = 2, rows = 1, offset = 0.008, lamp = null, mirror = false } = {}) {
      projectDecal(axis, a0, a1, b0, b1, part, cols, rows, offset, lamp);
      if (mirror) {
        if (axis === 'left' || axis === 'right') projectDecal(axis === 'left' ? 'right' : 'left', a0, a1, b0, b1, part, cols, rows, offset, lamp);
        else projectDecal(axis, -a1, -a0, b0, b1, part, cols, rows, offset, lamp);
      }
    },

    /**
     * A round (or oval) sticker of radii ra, rb centred at (ca, cb) on the given axis: round headlamps,
     * tail lamps and badges. Same options as decal().
     */
    disc(axis, ca, cb, ra, rb, part, { segments = 10, offset = 0.008, lamp = null, mirror = false } = {}) {
      projectDisc(axis, ca, cb, ra, rb, part, segments, offset, lamp);
      if (mirror) {
        if (axis === 'left' || axis === 'right') projectDisc(axis === 'left' ? 'right' : 'left', ca, cb, ra, rb, part, segments, offset, lamp);
        else projectDisc(axis, -ca, cb, ra, rb, part, segments, offset, lamp);
      }
    },

    /** A raised flare around a wheel arch on both sides, `width` wide and `standout` proud of the body. */
    archFlare(wheelZ, wheelY, radius, { width = 0.08, standout = 0.035, from = 0.12, to = Math.PI - 0.12, segments = 9, part = 'trim' } = {}) {
      for (const side of [1, -1]) {
        const group = newGroup();
        let previous = null;
        for (let k = 0; k <= segments; k += 1) {
          const angle = from + ((to - from) * k) / segments;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const inner = surfacePoint(side, wheelZ + cos * (radius + 0.012), wheelY + sin * (radius + 0.012));
          const outer = surfacePoint(side, wheelZ + cos * (radius + width), wheelY + sin * (radius + width));
          if (!inner || !outer) { previous = null; continue; }
          const ring = {
            innerBase: [inner[0], inner[1], inner[2]],
            innerTop: [inner[0] + side * standout, inner[1], inner[2]],
            outerTop: [outer[0] + side * standout * 0.75, outer[1], outer[2]],
            outerBase: [outer[0], outer[1], outer[2]],
            cos, sin,
          };
          if (previous) {
            const rz = (cos + previous.cos) * 0.5;
            const ry = (sin + previous.sin) * 0.5;
            quadOriented(previous.innerTop, ring.innerTop, ring.outerTop, previous.outerTop, side, 0, 0, part, group);
            quadOriented(previous.innerBase, ring.innerBase, ring.innerTop, previous.innerTop, 0, -ry, -rz, part, group);
            quadOriented(previous.outerTop, ring.outerTop, ring.outerBase, previous.outerBase, side * 0.3, ry, rz, part, group);
          }
          previous = ring;
        }
      }
    },

    /** A quad a-b-c-d ([x, y, z] corners in order) facing along `hint` ([x, y, z]). */
    quad(a, b, c, d, part, hint, group = newGroup()) {
      quadOriented(a, b, c, d, hint[0], hint[1], hint[2], part, group);
    },

    /** A triangle facing along `hint`. */
    triangle(a, b, c, part, hint, group = newGroup()) {
      orientedTriangle(a, b, c, hint[0], hint[1], hint[2], part, group, false);
    },

    /** Register a light anchor (position and the way the lamp faces) for the glow system. */
    lamp(kind, x, y, z, nx, ny, nz) {
      if (lamps[kind]) lamps[kind].push({ x, y, z, nx, ny, nz });
    },

    /** Bake everything into a BufferGeometry: position, normal, color, aSurface, uv. */
    finalize() {
      return bakeGeometry(positions, parts, groups, dims);
    },

    get triangleCount() {
      return parts.length;
    },
  };

  /** The side surface point at (z, y) seen from the given side (+1 left, -1 right), or null. */
  function surfacePoint(side, z, y) {
    const h = raycast(side * 50, y, z, -side, 0, 0);
    return h ? [h.x, h.y, h.z] : null;
  }

  function quadOriented(a, b, c, d, hx, hy, hz, part, group) {
    orientedTriangle(a, b, c, hx, hy, hz, part, group, false);
    orientedTriangle(a, c, d, hx, hy, hz, part, group, false);
  }

  function projectPoint(ray, a, b, offset) {
    const o = ray.origin(a, b);
    const h = raycast(o[0], o[1], o[2], ray.dir[0], ray.dir[1], ray.dir[2]);
    return h ? [h.x + h.nx * offset, h.y + h.ny * offset, h.z + h.nz * offset] : null;
  }

  function projectDisc(axis, ca, cb, ra, rb, part, segments, offset, lamp) {
    const ray = DECAL_AXES[axis];
    if (!ray) return;
    const centre = projectPoint(ray, ca, cb, offset * 1.6);
    if (!centre) return;
    const group = newGroup();
    const hx = -ray.dir[0], hy = -ray.dir[1], hz = -ray.dir[2];
    let first = null;
    let previous = null;
    for (let k = 0; k <= segments; k += 1) {
      const angle = (k / segments) * Math.PI * 2;
      const p = k === segments ? first : projectPoint(ray, ca + Math.cos(angle) * ra, cb + Math.sin(angle) * rb, offset);
      if (k === 0) first = p;
      if (p && previous) orientedTriangle(centre, previous, p, hx, hy, hz, part, group, false);
      previous = p;
    }
    if (lamp) {
      const h = raycast(...ray.origin(ca, cb), ray.dir[0], ray.dir[1], ray.dir[2]);
      if (h) kit.lamp(lamp, h.x + h.nx * 0.03, h.y + h.ny * 0.03, h.z + h.nz * 0.03, h.nx, h.ny, h.nz);
    }
  }

  function projectDecal(axis, a0, a1, b0, b1, part, cols, rows, offset, lamp) {
    const ray = DECAL_AXES[axis];
    if (!ray) return;
    const grid = [];
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        const a = a0 + ((a1 - a0) * i) / cols;
        const b = b0 + ((b1 - b0) * j) / rows;
        const o = ray.origin(a, b);
        const h = raycast(o[0], o[1], o[2], ray.dir[0], ray.dir[1], ray.dir[2]);
        grid.push(h ? [h.x + h.nx * offset, h.y + h.ny * offset, h.z + h.nz * offset] : null);
      }
    }
    const group = newGroup();
    const hx = -ray.dir[0], hy = -ray.dir[1], hz = -ray.dir[2];
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const p00 = grid[j * (cols + 1) + i];
        const p10 = grid[j * (cols + 1) + i + 1];
        const p01 = grid[(j + 1) * (cols + 1) + i];
        const p11 = grid[(j + 1) * (cols + 1) + i + 1];
        if (p00 && p10 && p11) orientedTriangle(p00, p10, p11, hx, hy, hz, part, group, false);
        if (p00 && p11 && p01) orientedTriangle(p00, p11, p01, hx, hy, hz, part, group, false);
      }
    }
    if (lamp) {
      const o = ray.origin((a0 + a1) / 2, (b0 + b1) / 2);
      const h = raycast(o[0], o[1], o[2], ray.dir[0], ray.dir[1], ray.dir[2]);
      if (h) kit.lamp(lamp, h.x + h.nx * 0.03, h.y + h.ny * 0.03, h.z + h.nz * 0.03, h.nx, h.ny, h.nz);
    }
  }

  return kit;
}

/** Where decal rays start for each axis and which way they travel. */
const DECAL_AXES = {
  front: { dir: [0, 0, -1], origin: (a, b) => [a, b, 50] },
  rear: { dir: [0, 0, 1], origin: (a, b) => [a, b, -50] },
  left: { dir: [-1, 0, 0], origin: (a, b) => [50, b, a] },
  right: { dir: [1, 0, 0], origin: (a, b) => [-50, b, a] },
  top: { dir: [0, -1, 0], origin: (a, b) => [a, 50, b] },
};

/**
 * Round the corners of a polyline of [z, y, radius?] points: each corner with a radius becomes a short
 * arc of three points. Ends are kept.
 */
export function roundPolyline(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const r = p[2] || 0;
    if (r <= 0 || i === 0 || i === points.length - 1) {
      out.push([p[0], p[1]]);
      continue;
    }
    const prev = points[i - 1];
    const next = points[i + 1];
    const d1 = Math.hypot(prev[0] - p[0], prev[1] - p[1]);
    const d2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const cut = Math.min(r, d1 * 0.45, d2 * 0.45);
    const a = [p[0] + ((prev[0] - p[0]) / d1) * cut, p[1] + ((prev[1] - p[1]) / d1) * cut];
    const b = [p[0] + ((next[0] - p[0]) / d2) * cut, p[1] + ((next[1] - p[1]) / d2) * cut];
    out.push(a);
    out.push([0.25 * a[0] + 0.5 * p[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * p[1] + 0.25 * b[1]]);
    out.push(b);
  }
  return out;
}

/**
 * Close a body silhouette: `upper` runs from the front-bottom corner over the top to the rear-bottom
 * corner; the bottom returns along the sill at height `clear`, cutting a round arch over each wheel.
 * @param {number[][]} upper   [z, y, radius?] points
 * @param {{clear:number, wheels:{z:number, y:number}[], archRadius:number, archSegments?:number}} options
 */
export function archedSideOutline(upper, { clear, wheels, archRadius, archSegments = 8 }) {
  const top = roundPolyline(upper);
  const frontZ = top[0][0];
  const rearZ = top[top.length - 1][0];
  const bottom = [];
  const sorted = wheels.slice().sort((p, q) => p.z - q.z);
  for (const wheel of sorted) {
    const R = archRadius;
    if (clear >= wheel.y + R * 0.98) continue;
    if (wheel.z - R < rearZ + 0.04 || wheel.z + R > frontZ - 0.04) continue;
    const s = Math.max(-0.95, Math.min(0.95, (clear - wheel.y) / R));
    const beta = Math.asin(s);
    const start = Math.PI - beta;
    for (let k = 0; k <= archSegments; k += 1) {
      const angle = start + ((beta - start) * k) / archSegments;
      bottom.push([wheel.z + R * Math.cos(angle), wheel.y + R * Math.sin(angle)]);
    }
  }
  return top.concat(bottom);
}

/** Drop repeated points (and a closing point equal to the first). */
function dedupeOutline(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-4 || Math.abs(last[1] - p[1]) > 1e-4) out.push(p);
  }
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(last[0] - first[0]) < 1e-4 && Math.abs(last[1] - first[1]) < 1e-4) out.pop();
  }
  return out;
}

const _normal = { x: 0, y: 0, z: 0 };
const _centroid = { x: 0, y: 0, z: 0 };

/** Unit normal of a triangle stored as 9 numbers (shared result object). */
function faceNormal(t) {
  const ex = t[3] - t[0], ey = t[4] - t[1], ez = t[5] - t[2];
  const fx = t[6] - t[0], fy = t[7] - t[1], fz = t[8] - t[2];
  let x = ey * fz - ez * fy, y = ez * fx - ex * fz, z = ex * fy - ey * fx;
  const len = Math.hypot(x, y, z) || 1;
  x /= len; y /= len; z /= len;
  _normal.x = x; _normal.y = y; _normal.z = z;
  return _normal;
}

function centroidOf(t) {
  _centroid.x = (t[0] + t[3] + t[6]) / 3;
  _centroid.y = (t[1] + t[4] + t[7]) / 3;
  _centroid.z = (t[2] + t[5] + t[8]) / 3;
  return _centroid;
}

/**
 * Turn the triangle soup into a renderable geometry. Normals are smoothed across neighbours of the same
 * surface and smoothing group when they meet at less than 40 degrees, so curved shells read smooth and
 * creases stay crisp.
 */
function bakeGeometry(positions, parts, groups, dims) {
  const count = parts.length;
  const area = new Float32Array(count * 3);
  const unit = new Float32Array(count * 3);
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    const ex = positions[o + 3] - positions[o], ey = positions[o + 4] - positions[o + 1], ez = positions[o + 5] - positions[o + 2];
    const fx = positions[o + 6] - positions[o], fy = positions[o + 7] - positions[o + 1], fz = positions[o + 8] - positions[o + 2];
    const x = ey * fz - ez * fy, y = ez * fx - ex * fz, z = ex * fy - ey * fx;
    const len = Math.hypot(x, y, z) || 1;
    area[t * 3] = x; area[t * 3 + 1] = y; area[t * 3 + 2] = z;
    unit[t * 3] = x / len; unit[t * 3 + 1] = y / len; unit[t * 3 + 2] = z / len;
  }
  const keyOf = (t, k) => {
    const o = t * 9 + k * 3;
    return `${groups[t]}|${parts[t]}|${Math.round(positions[o] * 4000)}|${Math.round(positions[o + 1] * 4000)}|${Math.round(positions[o + 2] * 4000)}`;
  };
  const shared = new Map();
  for (let t = 0; t < count; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const key = keyOf(t, k);
      const list = shared.get(key);
      if (list) list.push(t);
      else shared.set(key, [t]);
    }
  }

  const position = new Float32Array(count * 9);
  const normal = new Float32Array(count * 9);
  const color = new Float32Array(count * 9);
  const surface = new Float32Array(count * 12);
  const uv = new Float32Array(count * 6);
  const tint = new THREE.Color();
  const uvOut = { u: 0, v: 0 };
  for (let t = 0; t < count; t += 1) {
    const def = VEHICLE_SURFACES[parts[t]];
    tint.setHex(def.color);
    const ux = unit[t * 3], uy = unit[t * 3 + 1], uz = unit[t * 3 + 2];
    for (let k = 0; k < 3; k += 1) {
      const o = t * 9 + k * 3;
      position[o] = positions[o]; position[o + 1] = positions[o + 1]; position[o + 2] = positions[o + 2];
      let nx = 0, ny = 0, nz = 0;
      for (const other of shared.get(keyOf(t, k))) {
        const dot = ux * unit[other * 3] + uy * unit[other * 3 + 1] + uz * unit[other * 3 + 2];
        if (other === t || dot >= CREASE_COS) {
          nx += area[other * 3]; ny += area[other * 3 + 1]; nz += area[other * 3 + 2];
        }
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      normal[o] = nx / len; normal[o + 1] = ny / len; normal[o + 2] = nz / len;
      color[o] = tint.r; color[o + 1] = tint.g; color[o + 2] = tint.b;
      const s = t * 12 + k * 4;
      surface[s] = def.paint || 0;
      surface[s + 1] = def.roughness;
      surface[s + 2] = def.metalness;
      surface[s + 3] = def.lamp || 0;
      liveryUv(positions[o], positions[o + 1], positions[o + 2], ux, uy, uz, dims, uvOut);
      uv[t * 6 + k * 2] = uvOut.u;
      uv[t * 6 + k * 2 + 1] = uvOut.v;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('aSurface', new THREE.BufferAttribute(surface, 4));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

/**
 * Livery coordinates of a point on a face: upward faces read the plan half of the atlas, faces looking
 * forward or back read the end column of the side half, and side faces read the side elevation,
 * mirrored so both sides run front to back the way text reads.
 */
function liveryUv(x, y, z, nx, ny, nz, dims, out) {
  const L = dims.length;
  const W = dims.width;
  const H = dims.height;
  const vSide = 0.01 + 0.48 * Math.min(1, Math.max(0, y / H));
  if (ny > 0.55) {
    out.u = 0.5 + (0.96 * z) / L;
    out.v = 0.51 + 0.48 * Math.min(1, Math.max(0, x / W + 0.5));
  } else if (Math.abs(nz) > Math.abs(nx)) {
    out.u = 0.01;
    out.v = vSide;
  } else {
    out.u = 0.5 + (nx >= 0 ? -1 : 1) * ((0.96 * z) / L);
    out.v = vSide;
  }
}
