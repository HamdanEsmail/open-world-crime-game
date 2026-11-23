// The modelling kit behind Port Sarab's street furniture: low-poly parts (boxes, posts, cones, panels,
// bent rods and free triangles) welded into one geometry per prop. Every part carries its own colour
// and three flags the shared shaders read: tint (takes the copy's own paint), glow (lights up at
// night) and bend (how far it gives in the wind).
import * as THREE from 'three';

/**
 * Start a new prop shape. Parts are placed in metres in the prop's own space (+Z is its front, +Y up,
 * y = 0 the ground), then build() returns one indexed BufferGeometry with the attributes
 * position, normal, uv, color and propFlags (x tint, y glow, z bend).
 *
 * Part options: { x, y, z, rx, ry, rz, sx, sy, sz, color, tint, glow, bend, uvRect: [u0, v0, u1, v1] }
 * (x, y, z is the part's centre; rotations are radians, applied in X, Y, Z order).
 */
export function createShapeBuilder() {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const flags = [];
  const indices = [];
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  /** Weld a THREE geometry into the shape with the part options. Returns the builder. */
  function part(geometry, o = {}) {
    position.set(o.x || 0, o.y || 0, o.z || 0);
    euler.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
    quaternion.setFromEuler(euler);
    scale.set(o.sx === undefined ? 1 : o.sx, o.sy === undefined ? 1 : o.sy, o.sz === undefined ? 1 : o.sz);
    matrix.compose(position, quaternion, scale);
    if (o.matrix) matrix.premultiply(o.matrix);
    normalMatrix.getNormalMatrix(matrix);
    readColor(o.color === undefined ? 0xffffff : o.color);
    const tint = o.tint || 0;
    const glow = o.glow || 0;
    const bend = o.bend || 0;
    const uvRect = o.uvRect || null;
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const base = positions.length / 3;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      else n.set(0, 1, 0);
      normals.push(n.x, n.y, n.z);
      let u = uv ? uv.getX(i) : 0;
      let w = uv ? uv.getY(i) : 0;
      if (uvRect) {
        u = uvRect[0] + u * (uvRect[2] - uvRect[0]);
        w = uvRect[1] + w * (uvRect[3] - uvRect[1]);
      }
      uvs.push(u, w);
      colors.push(color.r, color.g, color.b);
      flags.push(tint, glow, typeof bend === 'function' ? bend(v.x, v.y, v.z) : bend);
    }
    if (geometry.index) {
      const index = geometry.index;
      for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i += 1) indices.push(base + i);
    }
    geometry.dispose();
    return builder;
  }

  function readColor(value) {
    if (Array.isArray(value)) color.setRGB(value[0], value[1], value[2]);
    else if (value && value.isColor) color.copy(value);
    else color.setHex(value);
  }

  /** A bent rod through `points` ([x, y, z] each) with `sides` faces; open ends. */
  function tube(points, radius, sides, o = {}) {
    const ring = [];
    const dir = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    const rows = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      side.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.9) side.set(1, 0, 0);
      side.cross(dir).normalize();
      up.crossVectors(dir, side).normalize();
      const r = typeof radius === 'function' ? radius(i / (points.length - 1)) : radius;
      const row = [];
      for (let k = 0; k <= sides; k += 1) {
        const angle = (k / sides) * Math.PI * 2;
        const cs = Math.cos(angle);
        const sn = Math.sin(angle);
        const nx = side.x * cs + up.x * sn;
        const ny = side.y * cs + up.y * sn;
        const nz = side.z * cs + up.z * sn;
        row.push(vertex(points[i][0] + nx * r, points[i][1] + ny * r, points[i][2] + nz * r, nx, ny, nz, k / sides, i / (points.length - 1), o));
      }
      rows.push(row);
    }
    for (let i = 0; i < rows.length - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
    }
    ring.length = 0;
    return builder;
  }

  /**
   * Add one vertex (already in prop space) and return its index. o: { color, tint, glow, bend }.
   * Used for shapes built point by point: fronds, fabric, ramps.
   */
  function vertex(x, y, z, nx, ny, nz, u, w, o = {}) {
    readColor(o.color === undefined ? 0xffffff : o.color);
    positions.push(x, y, z);
    n.set(nx, ny, nz).normalize();
    normals.push(n.x, n.y, n.z);
    uvs.push(u, w);
    colors.push(color.r, color.g, color.b);
    flags.push(o.tint || 0, o.glow || 0, typeof o.bend === 'function' ? o.bend(x, y, z) : o.bend || 0);
    return positions.length / 3 - 1;
  }

  /** Two triangles a-b-c, a-c-d (counter-clockwise seen from the front). */
  function quad(a, b, c, d) {
    indices.push(a, b, c, a, c, d);
  }

  const builder = {
    part,
    /** A box w x h x d centred on (x, y, z). */
    box: (w, h, d, o) => part(new THREE.BoxGeometry(w, h, d), o),
    /** An upright cylinder (or a tapered post) centred on (x, y, z). */
    cylinder: (radiusTop, radiusBottom, h, sides, o = {}) => part(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, sides, 1, !!o.open), o),
    /** A cone with its base centred below (x, y, z) by h / 2. */
    cone: (radius, h, sides, o) => part(new THREE.ConeGeometry(radius, h, sides), o),
    /** A low-poly ball. */
    sphere: (radius, widthSegments, heightSegments, o) => part(new THREE.SphereGeometry(radius, widthSegments, heightSegments), o),
    /** A flat panel w x h facing +Z. */
    plane: (w, h, o) => part(new THREE.PlaneGeometry(w, h), o),
    /** A ring lying flat (a torus with few sides). */
    torus: (radius, tube, radialSegments, tubularSegments, o) => part(new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments), o),
    tube,
    vertex,
    quad,
    /** One triangle a-b-c. */
    triangle(a, b, c) {
      indices.push(a, b, c);
      return builder;
    },
    get vertexCount() {
      return positions.length / 3;
    },
    /** Finish: one indexed BufferGeometry with bounds computed. */
    build() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('propFlags', new THREE.Float32BufferAttribute(flags, 3));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      return geometry;
    },
  };
  return builder;
}

/** The number of triangles a geometry draws. */
export function triangleCount(geometry) {
  if (geometry.index) return geometry.index.count / 3;
  return geometry.attributes.position.count / 3;
}

/** A unit panel (1 x 1, facing +Z, centred) for printed faces: adverts, street names, rugs. */
export function createPrintedPanelGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Linear colour from a 0xRRGGBB value, as an [r, g, b] list for part options. */
export function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Scale a colour value (hex or list) by `k` and return it as a list. */
export function shade(value, k) {
  const c = Array.isArray(value) ? value : rgb(value);
  return [c[0] * k, c[1] * k, c[2] * k];
}
