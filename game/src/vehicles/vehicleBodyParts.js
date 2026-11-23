// The shared body parts of Port Sarab's vehicles: the lower shell with its wheel arches, tumblehome and
// tapered nose, the glasshouse with its painted roof, and the pieces most cars carry: lamp clusters,
// plates, door seams and handles, mirrors, the PSPD light bar and push bar, and the Sarab Cab roof sign.
import { archedSideOutline, roundPolyline } from './vehicleShapeKit.js';

/**
 * The lower body: the side silhouette `r.upper` ([z, y, cornerRadius?] from the front-bottom corner over
 * the bonnet and deck to the rear-bottom corner), closed along the sill with arches over the wheels and
 * extruded across the width with rounded edges, a tapered nose and tail, and tumblehome.
 * @returns {{archRadius:number, wheels:{z:number, y:number}[]}}
 */
export function buildLowerBody(kit, spec, r) {
  const wheels = [
    { z: spec.wheelbase / 2, y: spec.wheelRadius },
    { z: -spec.wheelbase / 2, y: spec.wheelRadius },
  ];
  const archRadius = spec.wheelRadius + (r.archGap ?? 0.06);
  const cut = r.noArches ? [] : wheels;
  const outline = archedSideOutline(r.upper, { clear: r.clear, wheels: cut, archRadius });
  kit.profileShell(outline, {
    width: r.bodyWidth ?? spec.width,
    bevel: r.bevel ?? 0.07,
    bevelSegments: r.bevelSegments ?? 3,
    deform: lowerBodyDeform(spec, r),
    classify: lowerBodyClassifier(r.part ?? 'paint', cut, archRadius),
  });
  return { archRadius, wheels };
}

/**
 * The glasshouse: a closed side outline extruded narrower than the body and leaning in toward the roof.
 * glass 'wrap': dark glass all round under a painted roof (blacked-out pillars, a floating roof);
 * glass 'panel': painted sides with a glass windscreen (and rear window when rearGlass), for vans and cabs
 * whose side windows are added as decals.
 */
export function buildCabin(kit, spec, c) {
  const roofY = c.roofY ?? spec.height;
  const baseY = c.baseY;
  const span = Math.max(0.1, roofY - baseY);
  kit.profileShell(roundPolyline(c.outline), {
    width: spec.width * c.width,
    bevel: c.bevel ?? 0.06,
    bevelSegments: 3,
    deform: (x, y) => x * (1 - c.tumble * Math.min(1, Math.max(0, (y - baseY) / span))),
    classify: cabinClassifier(c),
  });
}

/** Headlamp lenses on both sides of the nose; their centres become headlight anchors. */
export function headlamps(kit, x0, x1, y0, y1, options = {}) {
  kit.decal('front', x0, x1, y0, y1, 'headLens', { cols: 6, rows: 2, offset: 0.012, lamp: 'head', mirror: true, ...options });
}

/** Tail lamp lenses on both sides of the tail; their centres become tail and brake light anchors. */
export function taillamps(kit, x0, x1, y0, y1, options = {}) {
  kit.decal('rear', x0, x1, y0, y1, 'tailLens', { cols: 5, rows: 2, offset: 0.012, lamp: 'tail', mirror: true, ...options });
}

/** White reversing lamps on both sides of the tail. */
export function reverseLamps(kit, x0, x1, y0, y1) {
  kit.decal('rear', x0, x1, y0, y1, 'reverseLens', { cols: 1, rows: 1, offset: 0.014, lamp: 'reverse', mirror: true });
}

/** Number plates, front and rear, at the given heights (bottom edges). */
export function numberPlates(kit, frontY, rearY, width = 0.5) {
  if (frontY !== null) kit.decal('front', -width / 2, width / 2, frontY, frontY + 0.11, 'plate', { cols: 2, rows: 1, offset: 0.016 });
  if (rearY !== null) kit.decal('rear', -width / 2, width / 2, rearY, rearY + 0.11, 'plate', { cols: 2, rows: 1, offset: 0.016 });
}

/** Thin dark door shut-lines down both sides at each z, from y0 to y1. */
export function doorSeams(kit, zs, y0, y1) {
  for (const z of zs) kit.decal('left', z - 0.008, z + 0.008, y0, y1, 'trim', { cols: 1, rows: 3, offset: 0.004, mirror: true });
}

/** Small chrome door handles, starting at each z, at height y. */
export function doorHandles(kit, zs, y) {
  for (const z of zs) kit.decal('left', z - 0.16, z, y, y + 0.035, 'chrome', { cols: 1, rows: 1, offset: 0.012, mirror: true });
}

/** A dark rubbing strip or sill cover along both sides. */
export function sideStrip(kit, z0, z1, y0, y1, part = 'trim') {
  kit.decal('left', z0, z1, y0, y1, part, { cols: 6, rows: 1, offset: 0.007, mirror: true });
}

/** Door mirrors on stalks: housing in `part` (paint by default) standing off the body at (z, y). */
export function sideMirrors(kit, z, y, { size = 1, part = 'paint' } = {}) {
  const hit = kit.raycast(50, y, z, -1, 0, 0);
  const sideX = hit ? hit.x : 0.9;
  for (const side of [1, -1]) {
    const x = side * (sideX + 0.12 * size);
    kit.box(side * (sideX + 0.04 * size), y - 0.02, z, 0.1 * size, 0.04, 0.06, 'trim');
    kit.box(x, y + 0.02, z - 0.03, 0.08 * size, 0.11 * size, 0.17 * size, part, { ry: side * 0.12 });
    kit.box(x, y + 0.02, z - 0.115 * size, 0.07 * size, 0.09 * size, 0.01, 'glass', { ry: side * 0.12 });
  }
}

/**
 * The PSPD roof light bar: a black base with a red lens on the left and blue on the right, set on the
 * roof at z. Registers siren anchors at both ends of each colour.
 */
export function policeLightBar(kit, z, width = 1.2) {
  const roof = kit.raycast(0, 50, z, 0, -1, 0);
  const roofY = roof ? roof.y : 1.5;
  const half = width / 2;
  kit.box(0, roofY + 0.03, z, width + 0.04, 0.06, 0.32, 'trim');
  kit.box(half * 0.5 + 0.02, roofY + 0.11, z, half - 0.06, 0.11, 0.27, 'sirenRed');
  kit.box(-half * 0.5 - 0.02, roofY + 0.11, z, half - 0.06, 0.11, 0.27, 'sirenBlue');
  kit.box(0, roofY + 0.1, z, 0.1, 0.09, 0.25, 'chrome');
  for (const side of [1, -1]) {
    kit.box(side * (half - 0.1), roofY + 0.012, z + 0.1, 0.06, 0.03, 0.06, 'trim');
    kit.box(side * (half - 0.1), roofY + 0.012, z - 0.1, 0.06, 0.03, 0.06, 'trim');
  }
  kit.lamp('sirenRed', half * 0.8, roofY + 0.12, z, 0, 1, 0);
  kit.lamp('sirenBlue', -half * 0.8, roofY + 0.12, z, 0, 1, 0);
  return roofY;
}

/** A black push bar on the nose: two uprights and two rails, with a pair of small blue flashers. */
export function pushBar(kit, frontZ, y0, y1, halfWidth) {
  const z = frontZ + 0.1;
  for (const side of [1, -1]) {
    kit.tube([side * halfWidth, y0, z], [side * halfWidth, y1, z], 0.035, 'trim');
    kit.tube([side * halfWidth, y0 + 0.05, z], [side * (halfWidth - 0.05), y0 + 0.05, frontZ - 0.05], 0.025, 'trim');
  }
  kit.box(0, y0 + 0.14, z, halfWidth * 2 + 0.08, 0.07, 0.07, 'trim');
  kit.box(0, y1 - 0.05, z, halfWidth * 2 + 0.08, 0.07, 0.07, 'trim');
  kit.box(halfWidth * 0.45, y1 - 0.05, z + 0.04, 0.12, 0.045, 0.02, 'sirenRed');
  kit.box(-halfWidth * 0.45, y1 - 0.05, z + 0.04, 0.12, 0.045, 0.02, 'sirenBlue');
}

/** The Sarab Cab roof sign: a lit cream box on a black foot. Registers sign glow anchors. */
export function taxiRoofSign(kit, z) {
  const roof = kit.raycast(0, 50, z, 0, -1, 0);
  const roofY = roof ? roof.y : 1.45;
  kit.box(0, roofY + 0.02, z, 0.6, 0.05, 0.26, 'trim');
  kit.box(0, roofY + 0.13, z, 0.66, 0.18, 0.22, 'signLamp');
  kit.box(0, roofY + 0.228, z, 0.62, 0.018, 0.18, 'trim');
  kit.lamp('sign', 0, roofY + 0.13, z + 0.13, 0, 0, 1);
  kit.lamp('sign', 0, roofY + 0.13, z - 0.13, 0, 0, -1);
}

/** Squash x toward the centre line: the nose and tail rounded in plan, the shoulders tucked in. */
function lowerBodyDeform(spec, r) {
  const halfLength = spec.length / 2;
  const start = r.taperStart ?? 0.55;
  const nose = r.noseTaper ?? 0.08;
  const tail = r.tailTaper ?? 0.05;
  const tuck = r.tuck ?? 0.05;
  const tuckFrom = r.tuckFrom ?? 0.8;
  const tuckSpan = r.tuckSpan ?? 0.35;
  const sillY = r.clear + 0.1;
  return (x, y, z) => {
    const f = Math.min(1, Math.max(0, (Math.abs(z) / halfLength - start) / (1 - start)));
    let k = 1 - (z > 0 ? nose : tail) * f * f;
    if (y > tuckFrom) k *= 1 - tuck * Math.min(1, (y - tuckFrom) / tuckSpan);
    if (y < sillY) k *= 1 - 0.04 * Math.min(1, (sillY - y) / 0.2);
    return x * k;
  };
}

/** Underside and wheel-well faces turn dark; everything else is `part`. */
function lowerBodyClassifier(part, wheels, archRadius) {
  const reach = (archRadius + 0.05) * (archRadius + 0.05);
  return (c, n) => {
    if (n.y < -0.6) return 'under';
    for (const wheel of wheels) {
      const dz = c.z - wheel.z;
      const dy = c.y - wheel.y;
      if (dz * dz + dy * dy < reach && Math.abs(n.x) < 0.6 && dz * n.z + dy * n.y < 0) return 'under';
    }
    return part;
  };
}

/** Roof, glass and pillars of the glasshouse by face direction and position along the car. */
function cabinClassifier(c) {
  const roofFront = c.roofFront;
  const roofRear = c.roofRear;
  if (c.glass === 'panel') {
    return (centre, n) => {
      if (n.y < -0.5) return 'trim';
      if (n.z > 0.3 && n.y < 0.93 && centre.z > roofFront - 0.15) return 'glass';
      if (c.rearGlass && n.z < -0.3 && n.y > -0.2 && centre.z < roofRear + 0.15) return 'glass';
      return 'paint';
    };
  }
  return (centre, n) => {
    if (n.y < -0.5) return 'trim';
    if (n.y > 0.55 && centre.z < roofFront - 0.02 && centre.z > roofRear + 0.02) return 'paint';
    return 'glass';
  };
}
