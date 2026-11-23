// The PSPD patrol helicopter "Shaheen-1", built in code: a lofted fuselage carrying the force's
// livery, an engine fairing, tail boom, swept fin, stabiliser and tail rotor, landing skids, a
// searchlight on a gimbal under the nose, a main rotor drawn as a translucent spinning disc with
// blurred blades (so it reads as spinning in a still frame), and blinking navigation lights.
// The model faces +Z with its skids at y = 0; policeHelicopter.js places and animates it.
import * as THREE from 'three';
import { paintShaheenLivery, FUSELAGE_V0, PLAIN_WHITE_UV } from './helicopterLivery.js';

/** Main rotor radius, metres. */
export const ROTOR_RADIUS = 5.6;
/** Where the searchlight gimbal hangs under the nose (model space). */
export const SEARCHLIGHT_MOUNT = Object.freeze({ x: -0.46, y: 0.42, z: 2.62 });
/** The open side doors the gunner fires from, left (+X) and right (-X), model space. */
export const DOOR_LEFT = Object.freeze({ x: 1.18, y: 1.45, z: 0.15 });
export const DOOR_RIGHT = Object.freeze({ x: -1.18, y: 1.45, z: 0.15 });
/** The middle of the airframe (for hits) and the engine exhaust (for smoke), model space. */
export const BODY_CENTER = Object.freeze({ x: 0, y: 1.7, z: -1.2 });
export const EXHAUST_POINT = Object.freeze({ x: 0, y: 2.75, z: -2.5 });

/**
 * Build Shaheen-1. Returns:
 *  root        the group to place (rotation order YXZ: pitch > 0 is nose down, roll > 0 lifts the left side)
 *  searchlight an Object3D under the nose to point with lookAt (its +Z is the beam)
 *  lensWorldPosition(out)  where the beam leaves the lamp, in world space
 *  animate(dt, time, rotorSpeed, night, pixelScale)  spin the rotors and blink the lights
 */
export function buildShaheenModel() {
  const root = new THREE.Group();
  root.name = 'Shaheen-1';
  root.rotation.order = 'YXZ';

  const bodyMaterial = new THREE.MeshLambertMaterial({ map: paintShaheenLivery(), vertexColors: true });
  const body = new THREE.Mesh(buildAirframeGeometry(), bodyMaterial);
  body.name = 'Shaheen-1 airframe';
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });

  // Main rotor: a hub with stub blades that really turns, under a disc that paints the blur.
  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 3.16, -0.75);
  root.add(mainRotor);
  const mainHub = new THREE.Mesh(buildHubGeometry(4, 0.3, 2.1, 0.3, 'y'), darkMaterial);
  mainHub.castShadow = true;
  mainRotor.add(mainHub);
  const mainDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 56), createRotorDiscMaterial(4, 0x1d232b, 0xe4572e, 0.95));
  mainDisc.rotation.x = -Math.PI / 2;
  mainDisc.position.y = 0.06;
  mainDisc.scale.setScalar(ROTOR_RADIUS);
  mainDisc.renderOrder = 4;
  mainRotor.add(mainDisc);

  // Tail rotor on the right of the fin, spinning in the fin's plane.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(-0.2, 3.12, -8.5);
  root.add(tailRotor);
  const tailHub = new THREE.Mesh(buildHubGeometry(2, 0.08, 0.5, 0.11, 'x'), darkMaterial);
  tailRotor.add(tailHub);
  const tailDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), createRotorDiscMaterial(2, 0x1d232b, 0xfff4d6, 0.9));
  tailDisc.rotation.y = Math.PI / 2;
  tailDisc.position.x = -0.05;
  tailDisc.scale.setScalar(0.86);
  tailDisc.renderOrder = 4;
  tailRotor.add(tailDisc);

  // The searchlight: a gimballed lamp whose +Z axis is aimed at the ground with lookAt.
  const searchlight = new THREE.Object3D();
  searchlight.position.set(SEARCHLIGHT_MOUNT.x, SEARCHLIGHT_MOUNT.y, SEARCHLIGHT_MOUNT.z);
  root.add(searchlight);
  const lampHousing = new THREE.Mesh(buildLampGeometry(), darkMaterial);
  lampHousing.castShadow = true;
  searchlight.add(lampHousing);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0xfff6e2, toneMapped: false }));
  lens.position.z = 0.335;
  searchlight.add(lens);

  const navLights = buildNavigationLights();
  root.add(navLights.points);

  const discUniforms = mainDisc.material.uniforms;
  const tailUniforms = tailDisc.material.uniforms;
  let bladeAngle = Math.random() * Math.PI * 2;
  let tailAngle = 0;

  /** Spin the rotors (rotorSpeed 0..1 of flight rpm) and run the light patterns. */
  function animate(dt, time, rotorSpeed, night, pixelScale) {
    bladeAngle = (bladeAngle + dt * rotorSpeed * 13.5) % (Math.PI * 2);
    tailAngle = (tailAngle + dt * rotorSpeed * 33) % (Math.PI * 2);
    mainHub.rotation.y = bladeAngle;
    discUniforms.uAngle.value = bladeAngle;
    discUniforms.uOpacity.value = 0.25 + 0.75 * Math.min(1, rotorSpeed * 1.4);
    // The disc is not lit by the scene's lights: shade its colour down as the night falls.
    discUniforms.uShade.value = 1 - 0.8 * night;
    tailHub.rotation.x = tailAngle;
    tailUniforms.uAngle.value = tailAngle;
    tailUniforms.uOpacity.value = discUniforms.uOpacity.value;
    tailUniforms.uShade.value = discUniforms.uShade.value;
    navLights.uniforms.uTime.value = time;
    navLights.uniforms.uNight.value = night;
    navLights.uniforms.uPixelScale.value = pixelScale;
  }

  const lensOffset = new THREE.Vector3(0, 0, 0.36);
  /** The world position the beam leaves from (call after the root's world matrix is current). */
  function lensWorldPosition(out) {
    out.copy(lensOffset);
    return searchlight.localToWorld(out);
  }

  return { root, body, searchlight, lens, mainRotor, tailRotor, animate, lensWorldPosition };
}

/** The airframe as one mesh: the lofted fuselage (textured) and every fixed part (vertex coloured). */
function buildAirframeGeometry() {
  const WHITE = 0xf3f0e8;
  const NIGHT = 0x0e1b2a;
  const TEAL = 0x1ba39c;
  const CORAL = 0xe4572e;
  const GRAPHITE = 0x2f343b;
  const STEEL = 0x8d939b;
  const parts = [{ geometry: loftFuselage(), keepUv: true }];

  // Engine fairing with intakes and twin exhausts, and the rotor mast.
  parts.push({ geometry: ellipsoid(0, 2.47, -1.15, 0.74, 0.45, 1.42, 14, 8), color: WHITE });
  parts.push({ geometry: ellipsoid(0.64, 2.58, -0.55, 0.1, 0.17, 0.36, 8, 6), color: GRAPHITE });
  parts.push({ geometry: ellipsoid(-0.64, 2.58, -0.55, 0.1, 0.17, 0.36, 8, 6), color: GRAPHITE });
  parts.push({ geometry: tube(0.34, 2.62, -2.15, 0.46, 2.72, -2.72, 0.14, 8), color: GRAPHITE });
  parts.push({ geometry: tube(-0.34, 2.62, -2.15, -0.46, 2.72, -2.72, 0.14, 8), color: GRAPHITE });
  parts.push({ geometry: tube(0, 2.8, -0.75, 0, 3.12, -0.75, 0.12, 8), color: GRAPHITE });

  // Fin (night blue with a teal stripe and a coral tip), ventral fin, stabiliser with end plates.
  parts.push({ geometry: prismZY([[-7.15, 2.32], [-8.32, 3.84], [-8.78, 3.82], [-8.45, 2.26]], -0.07, 0.07), color: NIGHT });
  parts.push({ geometry: prismZY([[-7.58, 2.9], [-7.75, 3.12], [-8.62, 3.12], [-8.57, 2.9]], -0.078, 0.078), color: TEAL });
  parts.push({ geometry: prismZY([[-8.1, 3.6], [-8.28, 3.8], [-8.74, 3.79], [-8.7, 3.6]], -0.078, 0.078), color: CORAL });
  parts.push({ geometry: prismZY([[-7.8, 2.14], [-8.42, 2.18], [-8.46, 1.56], [-8.16, 1.56]], -0.05, 0.05), color: NIGHT });
  parts.push({ geometry: box(0, 2.17, -6.5, 2.3, 0.07, 0.56), color: WHITE });
  parts.push({ geometry: box(1.16, 2.2, -6.52, 0.06, 0.46, 0.6), color: NIGHT });
  parts.push({ geometry: box(-1.16, 2.2, -6.52, 0.06, 0.46, 0.6), color: NIGHT });

  // Landing skids with upturned toes and two pairs of legs.
  for (const s of [1, -1]) {
    const x = 1.02 * s;
    parts.push({ geometry: tube(x, 0.08, -1.75, x, 0.08, 1.75, 0.065, 6), color: STEEL });
    parts.push({ geometry: tube(x, 0.08, 1.75, x, 0.34, 2.27, 0.065, 6), color: STEEL });
    parts.push({ geometry: tube(x, 0.08, 1.05, 0.7 * s, 0.64, 1.05, 0.06, 6), color: STEEL });
    parts.push({ geometry: tube(x, 0.08, -0.95, 0.7 * s, 0.68, -0.95, 0.06, 6), color: STEEL });
  }

  // Chin sensor ball, and the yoke the searchlight hangs from.
  parts.push({ geometry: ellipsoid(0.44, 0.5, 2.5, 0.23, 0.23, 0.23, 10, 8), color: GRAPHITE });
  parts.push({ geometry: tube(-0.46, 0.66, 2.62, -0.46, 0.46, 2.62, 0.06, 6), color: GRAPHITE });
  return mergeParts(parts);
}

/**
 * The fuselage from nose to tail as one lofted surface: superelliptic rings (squarer through the
 * cabin, round at the nose and boom), u along the length and v round the girth for the livery.
 * Each station: [z, top y, bottom y, half width, squareness (2 = ellipse)].
 */
function loftFuselage() {
  const STATIONS = [
    [3.58, 1.24, 1.14, 0.06, 2.0],
    [3.5, 1.5, 0.95, 0.42, 2.0],
    [3.36, 1.74, 0.8, 0.66, 2.1],
    [3.12, 2.0, 0.68, 0.84, 2.2],
    [2.8, 2.24, 0.6, 0.96, 2.3],
    [2.35, 2.43, 0.56, 1.04, 2.4],
    [1.8, 2.54, 0.55, 1.09, 2.5],
    [1.1, 2.58, 0.55, 1.11, 2.6],
    [0.2, 2.58, 0.55, 1.11, 2.6],
    [-0.6, 2.56, 0.58, 1.08, 2.6],
    [-1.3, 2.52, 0.68, 1.0, 2.5],
    [-1.9, 2.46, 0.86, 0.88, 2.4],
    [-2.45, 2.38, 1.14, 0.7, 2.3],
    [-2.95, 2.33, 1.48, 0.52, 2.2],
    [-3.4, 2.3, 1.74, 0.38, 2.1],
    [-4.4, 2.31, 1.9, 0.3, 2.0],
    [-5.6, 2.33, 1.98, 0.26, 2.0],
    [-6.8, 2.36, 2.04, 0.23, 2.0],
    [-7.8, 2.4, 2.1, 0.2, 2.0],
    [-8.25, 2.4, 2.16, 0.15, 2.0],
    [-8.42, 2.33, 2.22, 0.05, 2.0],
  ];
  const zNose = STATIONS[0][0];
  const zTail = STATIONS[STATIONS.length - 1][0];
  const segments = 18;
  const rings = STATIONS.length;
  const columns = segments + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < rings; i += 1) {
    const [z, top, bottom, halfWidth, squareness] = STATIONS[i];
    const cy = (top + bottom) / 2;
    const halfHeight = (top - bottom) / 2;
    const exponent = 2 / squareness;
    for (let j = 0; j <= segments; j += 1) {
      const phi = (j / segments) * Math.PI * 2;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      positions.push(halfWidth * Math.sign(s) * Math.pow(Math.abs(s), exponent), cy - halfHeight * Math.sign(c) * Math.pow(Math.abs(c), exponent), z);
      uvs.push((z - zTail) / (zNose - zTail), FUSELAGE_V0 + (1 - FUSELAGE_V0) * (j / segments));
    }
  }
  for (let i = 0; i < rings - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * columns + j;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Close the nose and the tail with a point each.
  const noseIndex = positions.length / 3;
  positions.push(0, (STATIONS[0][1] + STATIONS[0][2]) / 2, zNose + 0.03);
  uvs.push(1, FUSELAGE_V0 + 0.5 * (1 - FUSELAGE_V0));
  const tailIndex = noseIndex + 1;
  const last = STATIONS[rings - 1];
  positions.push(0, (last[1] + last[2]) / 2, zTail - 0.03);
  uvs.push(0, FUSELAGE_V0 + 0.5 * (1 - FUSELAGE_V0));
  const lastRing = (rings - 1) * columns;
  for (let j = 0; j < segments; j += 1) {
    indices.push(noseIndex, j, j + 1);
    indices.push(tailIndex, lastRing + j + 1, lastRing + j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The texture seam runs along the belly: share the normal across it so no crease shows.
  const normal = geometry.attributes.normal;
  for (let i = 0; i < rings; i += 1) {
    const a = i * columns;
    const b = a + segments;
    const nx = (normal.getX(a) + normal.getX(b)) / 2;
    const ny = (normal.getY(a) + normal.getY(b)) / 2;
    const nz = (normal.getZ(a) + normal.getZ(b)) / 2;
    const length = Math.hypot(nx, ny, nz) || 1;
    normal.setXYZ(a, nx / length, ny / length, nz / length);
    normal.setXYZ(b, nx / length, ny / length, nz / length);
  }
  return geometry;
}

/** A rotor hub with `blades` stub blades radiating in the plane normal to `axis` ('y' main, 'x' tail). */
function buildHubGeometry(blades, hubRadius, bladeLength, chord, axis) {
  const parts = [];
  const hub = new THREE.CylinderGeometry(hubRadius, hubRadius * 1.1, hubRadius * 0.6, 10);
  parts.push({ geometry: hub, color: 0xffffff });
  for (let k = 0; k < blades; k += 1) {
    const blade = new THREE.BoxGeometry(bladeLength, 0.05, chord);
    blade.translate(hubRadius + bladeLength / 2, 0, 0);
    blade.rotateY((k / blades) * Math.PI * 2);
    parts.push({ geometry: blade, color: 0xffffff });
  }
  const merged = mergeParts(parts);
  if (axis === 'x') merged.rotateZ(Math.PI / 2);
  return merged;
}

/** The searchlight's housing: a ball joint and a stubby barrel along +Z. */
function buildLampGeometry() {
  const ball = new THREE.SphereGeometry(0.16, 10, 8);
  const barrel = new THREE.CylinderGeometry(0.2, 0.17, 0.46, 12, 1, false);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0, 0.1);
  return mergeParts([{ geometry: ball, color: 0xffffff }, { geometry: barrel, color: 0xffffff }]);
}

/**
 * A rotor seen spinning: dark translucent disc with motion-blurred blades trailing behind each
 * blade's leading edge, and the painted blade tips smeared into a ring.
 */
function createRotorDiscMaterial(blades, color, tipColor, strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAngle: { value: 0 },
      uBlades: { value: blades },
      uOpacity: { value: 1 },
      uShade: { value: 1 },
      uStrength: { value: strength },
      uColor: { value: new THREE.Color(color) },
      uTipColor: { value: new THREE.Color(tipColor) },
    },
    vertexShader: ROTOR_VERTEX_SHADER,
    fragmentShader: ROTOR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * The navigation lights as one batch of glowing points: red anti-collision beacons above and below,
 * white strobes on the fin and the skid toes, steady red (left) and green (right) on the stabiliser.
 */
function buildNavigationLights() {
  // [x, y, z, colour, pattern (0 steady, 1 beacon, 2 strobe), phase]
  const LIGHTS = [
    [0, 2.96, -1.95, 0xff2a1a, 1, 0],
    [0, 0.5, -0.6, 0xff2a1a, 1, 0.5],
    [0, 3.88, -8.62, 0xffffff, 2, 0],
    [1.02, 0.38, 2.3, 0xffffff, 2, 0.33],
    [-1.02, 0.38, 2.3, 0xffffff, 2, 0.33],
    [1.2, 2.24, -6.52, 0xff3020, 0, 0],
    [-1.2, 2.24, -6.52, 0x20ff60, 0, 0],
    [0, 2.32, -8.48, 0xfff4e0, 0, 0],
  ];
  const positions = new Float32Array(LIGHTS.length * 3);
  const colors = new Float32Array(LIGHTS.length * 3);
  const patterns = new Float32Array(LIGHTS.length);
  const phases = new Float32Array(LIGHTS.length);
  const color = new THREE.Color();
  LIGHTS.forEach((light, i) => {
    positions.set([light[0], light[1], light[2]], i * 3);
    color.setHex(light[3]);
    colors.set([color.r, color.g, color.b], i * 3);
    patterns[i] = light[4];
    phases[i] = light[5];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPattern', new THREE.BufferAttribute(patterns, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uPixelScale: { value: 700 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: NAV_VERTEX_SHADER,
    fragmentShader: NAV_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;
  return { points, uniforms };
}

// ---- small geometry helpers -------------------------------------------------------------------

/**
 * Merge part geometries (already placed) into one non-indexed geometry with normals, uvs and
 * vertex colours. Parts with keepUv keep their own uvs; the rest point at a plain white texel.
 */
function mergeParts(parts) {
  let count = 0;
  for (const part of parts) {
    const g = part.geometry;
    count += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  let o = 0;
  for (const part of parts) {
    const g = part.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const index = g.index;
    const n = index ? index.count : pos.count;
    color.setHex(part.color === undefined ? 0xffffff : part.color);
    for (let i = 0; i < n; i += 1) {
      const k = index ? index.getX(i) : i;
      positions[o * 3] = pos.getX(k);
      positions[o * 3 + 1] = pos.getY(k);
      positions[o * 3 + 2] = pos.getZ(k);
      normals[o * 3] = nor.getX(k);
      normals[o * 3 + 1] = nor.getY(k);
      normals[o * 3 + 2] = nor.getZ(k);
      if (part.keepUv && uv) {
        uvs[o * 2] = uv.getX(k);
        uvs[o * 2 + 1] = uv.getY(k);
      } else {
        uvs[o * 2] = PLAIN_WHITE_UV[0];
        uvs[o * 2 + 1] = PLAIN_WHITE_UV[1];
      }
      colors[o * 3] = color.r;
      colors[o * 3 + 1] = color.g;
      colors[o * 3 + 2] = color.b;
      o += 1;
    }
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** An open tube between two points. */
function tube(ax, ay, az, bx, by, bz, radius, segments) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, true);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / length, dy / length, dz / length));
  geometry.applyQuaternion(quaternion);
  geometry.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return geometry;
}

function ellipsoid(x, y, z, rx, ry, rz, widthSegments, heightSegments) {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  geometry.scale(rx, ry, rz);
  geometry.translate(x, y, z);
  return geometry;
}

function box(x, y, z, sx, sy, sz) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  geometry.translate(x, y, z);
  return geometry;
}

/** A flat plate: a convex outline of [z, y] points given thickness from x0 to x1 (fins and stripes). */
function prismZY(outline, x0, x1) {
  const positions = [];
  const n = outline.length;
  let cz = 0;
  let cy = 0;
  for (const [z, y] of outline) {
    cz += z / n;
    cy += y / n;
  }
  const triangle = (a, b, c, nx, ny, nz) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (dot >= 0) positions.push(...a, ...b, ...c);
    else positions.push(...a, ...c, ...b);
  };
  for (let i = 1; i < n - 1; i += 1) {
    const p0 = outline[0];
    const p1 = outline[i];
    const p2 = outline[i + 1];
    triangle([x1, p0[1], p0[0]], [x1, p1[1], p1[0]], [x1, p2[1], p2[0]], 1, 0, 0);
    triangle([x0, p0[1], p0[0]], [x0, p1[1], p1[0]], [x0, p2[1], p2[0]], -1, 0, 0);
  }
  for (let i = 0; i < n; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const mz = (a[0] + b[0]) / 2 - cz;
    const my = (a[1] + b[1]) / 2 - cy;
    triangle([x0, a[1], a[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], 0, my, mz);
    triangle([x0, a[1], a[0]], [x1, b[1], b[0]], [x0, b[1], b[0]], 0, my, mz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ---- shaders ------------------------------------------------------------------------------------

const ROTOR_VERTEX_SHADER = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ROTOR_FRAGMENT_SHADER = /* glsl */ `
uniform float uAngle;
uniform float uBlades;
uniform float uOpacity;
uniform float uShade;
uniform float uStrength;
uniform vec3 uColor;
uniform vec3 uTipColor;
varying vec2 vLocal;
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  float sector = 6.2831853 / uBlades;
  float a = atan(vLocal.y, vLocal.x) - uAngle;
  float f = mod(a, sector) / sector;
  // Dense right behind each blade, clear just ahead of it: the eye reads the direction of spin.
  float smear = pow(f, 7.0) + 0.3 * pow(f, 2.2);
  float body = smoothstep(0.06, 0.2, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float alpha = (0.07 + 0.5 * smear * smoothstep(0.12, 0.4, r)) * body;
  // The painted blade tips smear into a thin ring.
  float tip = smoothstep(0.87, 0.9, r) * (1.0 - smoothstep(0.92, 0.95, r));
  vec3 color = mix(uColor, uTipColor, tip * 0.75) * uShade;
  alpha += tip * (0.1 + 0.22 * smear);
  gl_FragColor = vec4(color, clamp(alpha * uOpacity * uStrength, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

const NAV_VERTEX_SHADER = /* glsl */ `
attribute vec3 aColor;
attribute float aPattern;
attribute float aPhase;
uniform float uTime;
uniform float uNight;
uniform float uPixelScale;
varying vec3 vColor;
varying float vOn;
void main() {
  float on = mix(0.6, 1.0, uNight);
  float size = 0.45;
  if (aPattern > 0.5 && aPattern < 1.5) {
    float f = fract(uTime * 0.9 + aPhase);
    on = step(f, 0.13);
    size = 0.8;
  } else if (aPattern > 1.5) {
    float f = fract(uTime * 0.7 + aPhase);
    on = step(f, 0.045) + step(0.12, f) * step(f, 0.165);
    size = 1.3;
  }
  vOn = on;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float pixels = max(mix(2.5, 4.0, uNight), size * uPixelScale / max(1.0, -mv.z));
  gl_PointSize = pixels * step(0.01, on);
  gl_Position = projectionMatrix * mv;
}
`;

const NAV_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vOn;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float core = exp(-r * 7.0);
  float halo = exp(-r * 2.2) * 0.45;
  gl_FragColor = vec4(vColor * (core * 1.8 + halo) + vec3(core * 0.6), (core + halo) * vOn);
}
`;
