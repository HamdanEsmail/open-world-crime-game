// Shapes for the solid things that stand on the ground of Port Sarab, cranes, yachts, the lighthouse,
// the desert landmarks, merged into one vertex-coloured mesh per group: boxes, tapered cylinders,
// prisms and loose triangles, placed through a transform stack and flat-shaded for a crisp,
// sculpted low-poly look.
import * as THREE from 'three';

/** Start an empty merged prop geometry. */
export function createPropBuilder() {
  const positions = [];
  const normals = [];
  const colors = [];
  const extra = [];
  const stack = [new THREE.Matrix4()];
  const colorCache = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const local = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const offset = new THREE.Vector3();
  let extraValue = null;

  function linear(hex) {
    let rgb = colorCache.get(hex);
    if (!rgb) {
      const color = new THREE.Color(hex);
      rgb = [color.r, color.g, color.b];
      colorCache.set(hex, rgb);
    }
    return rgb;
  }

  /** One flat-shaded triangle in the current transform; corners are [x, y, z] arrays. */
  function triangle(p0, p1, p2, hex, shade0 = 1, shade1 = 1, shade2 = 1) {
    const m = stack[stack.length - 1];
    a.set(p0[0], p0[1], p0[2]).applyMatrix4(m);
    b.set(p1[0], p1[1], p1[2]).applyMatrix4(m);
    c.set(p2[0], p2[1], p2[2]).applyMatrix4(m);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    const rgb = linear(hex);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i += 1) normals.push(n.x, n.y, n.z);
    colors.push(rgb[0] * shade0, rgb[1] * shade0, rgb[2] * shade0, rgb[0] * shade1, rgb[1] * shade1, rgb[2] * shade1, rgb[0] * shade2, rgb[1] * shade2, rgb[2] * shade2);
    if (extraValue) for (let i = 0; i < 3; i += 1) extra.push(...extraValue);
  }

  const props = {
    triangle,

    /** A quad a-b-c-d, counter-clockwise seen from its front. */
    quad(p0, p1, p2, p3, hex, shadeBottom = 1) {
      triangle(p0, p1, p2, hex, shadeBottom, shadeBottom, 1);
      triangle(p0, p2, p3, hex, shadeBottom, 1, 1);
    },

    /** Run `draw` with an extra transform: position, Euler rotation (radians, order YXZ) and scale. */
    with(x, y, z, rotY, rotX, rotZ, draw, sx = 1, sy = 1, sz = 1) {
      euler.set(rotX || 0, rotY || 0, rotZ || 0, 'YXZ');
      quaternion.setFromEuler(euler);
      offset.set(x, y, z);
      scale.set(sx, sy, sz);
      local.compose(offset, quaternion, scale);
      stack.push(stack[stack.length - 1].clone().multiply(local));
      draw();
      stack.pop();
    },

    /** Tag every vertex added inside `draw` with an extra per-vertex value (for shader animation). */
    tagged(value, draw) {
      const previous = extraValue;
      extraValue = value;
      draw();
      extraValue = previous;
    },

    /** A box centred on (x, y, z) with sizes w (x), h (y), d (z); `faces` may skip 'bottom'. */
    box(x, y, z, w, h, d, hex, options = {}) {
      const x0 = x - w / 2; const x1 = x + w / 2;
      const y0 = y - h / 2; const y1 = y + h / 2;
      const z0 = z - d / 2; const z1 = z + d / 2;
      const side = options.sideColor === undefined ? hex : options.sideColor;
      const sb = options.shadeBottom === undefined ? 1 : options.shadeBottom;
      props.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], options.topColor === undefined ? hex : options.topColor);
      props.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side, sb);
      props.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side, sb);
      props.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side, sb);
      props.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side, sb);
      if (options.bottom) props.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex);
    },

    /** A beam between two points with a square section of `size` (lattice members, rails, guy struts). */
    beam(ax, ay, az, bx, by, bz, size, hex) {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const length = Math.hypot(dx, dy, dz);
      if (length < 0.001) return;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / length)));
      props.with((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, yaw, pitch, 0, () => props.box(0, 0, 0, size, size, length, hex));
    },

    /**
     * A tapered cylinder (or cone) standing on (x, y0, z): radii at bottom and top, `segments` sides.
     * options: { capTop, capBottom, topColor, smooth, phase }
     */
    cylinder(x, y0, z, radiusBottom, radiusTop, height, segments, hex, options = {}) {
      const y1 = y0 + height;
      const phase = options.phase || 0;
      for (let i = 0; i < segments; i += 1) {
        const a0 = phase + (i / segments) * Math.PI * 2;
        const a1 = phase + ((i + 1) / segments) * Math.PI * 2;
        const p0 = [x + Math.sin(a0) * radiusBottom, y0, z + Math.cos(a0) * radiusBottom];
        const p1 = [x + Math.sin(a1) * radiusBottom, y0, z + Math.cos(a1) * radiusBottom];
        const p2 = [x + Math.sin(a1) * radiusTop, y1, z + Math.cos(a1) * radiusTop];
        const p3 = [x + Math.sin(a0) * radiusTop, y1, z + Math.cos(a0) * radiusTop];
        if (radiusBottom > 0.0001 || radiusTop > 0.0001) props.quad(p0, p1, p2, p3, hex, options.shadeBottom || 1);
        if (options.capTop && radiusTop > 0.0001) triangle([x, y1, z], p3, p2, options.topColor === undefined ? hex : options.topColor);
        if (options.capBottom && radiusBottom > 0.0001) triangle([x, y0, z], p1, p0, hex);
      }
    },

    /** A vertical prism over a polygon [[x, z], ...] (clockwise on a north-up map) between y0 and y1. */
    prism(points, y0, y1, hex, options = {}) {
      const count = points.length;
      for (let i = 0; i < count; i += 1) {
        const p = points[i];
        const q = points[(i + 1) % count];
        props.quad([q[0], y0, q[1]], [p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]], options.sideColor === undefined ? hex : options.sideColor, options.shadeBottom || 1);
      }
      if (options.capTop !== false) {
        for (let i = 1; i < count - 1; i += 1) triangle([points[0][0], y1, points[0][1]], [points[i + 1][0], y1, points[i + 1][1]], [points[i][0], y1, points[i][1]], options.topColor === undefined ? hex : options.topColor);
      }
    },

    /** A low-poly boulder: a squashed, jittered octahedron-sphere of radius r. */
    boulder(x, y, z, r, hex, rng, squash = 0.7) {
      const rings = [[0, 1], [0.7, 0.55], [0.75, -0.25], [0, -0.85]];
      const sides = 6;
      const points = [];
      for (let k = 0; k < rings.length; k += 1) {
        const row = [];
        for (let i = 0; i < sides; i += 1) {
          const angle = (i / sides) * Math.PI * 2 + k * 0.5;
          const radius = rings[k][0] * r * (0.8 + rng.next() * 0.4);
          row.push([x + Math.sin(angle) * radius, y + rings[k][1] * r * squash * (0.85 + rng.next() * 0.3), z + Math.cos(angle) * radius]);
        }
        points.push(row);
      }
      for (let k = 0; k < rings.length - 1; k += 1) {
        for (let i = 0; i < sides; i += 1) {
          const j = (i + 1) % sides;
          const shade = 0.82 + 0.18 * (1 - k / rings.length);
          triangle(points[k][i], points[k + 1][i], points[k + 1][j], hex, shade, shade, shade);
          triangle(points[k][i], points[k + 1][j], points[k][j], hex, shade, shade, shade);
        }
      }
    },

    /** Number of triangles so far. */
    get triangles() {
      return positions.length / 9;
    },

    /**
     * Make the mesh. `extraName` / `extraSize` name the per-vertex tag attribute when tagged() was used.
     * @returns {THREE.Mesh|null}
     */
    build(material, name, extraName = null, extraSize = 0) {
      if (positions.length === 0) return null;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      if (extraName && extra.length === (positions.length / 3) * extraSize) {
        geometry.setAttribute(extraName, new THREE.Float32BufferAttribute(extra, extraSize));
      }
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      return mesh;
    },
  };
  return props;
}
