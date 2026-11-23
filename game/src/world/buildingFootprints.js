// The footprints Port Sarab's buildings are extruded from: rectangles, chamfered and rounded
// plans, ellipses, the street face of a block, and the insets, scalings and turns that make
// setbacks, parapets and twisting towers. All outlines share one winding (SW, SE, NE, NW).

/** Points of a rectangle footprint in the builder's winding order (SW, SE, NE, NW). */
export function rectPoints(cx, cz, w, d) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  return [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
}

/**
 * One side of a rectangular footprint as seen from the street: its left end a, right end b,
 * the unit direction t from a to b and the outward normal n. `side` is 'n', 's', 'e' or 'w'.
 */
export function faceOf(cx, cz, w, d, side) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  if (side === 's') return { ax: x0, az: z1, bx: x1, bz: z1, tx: 1, tz: 0, nx: 0, nz: 1, length: w };
  if (side === 'n') return { ax: x1, az: z0, bx: x0, bz: z0, tx: -1, tz: 0, nx: 0, nz: -1, length: w };
  if (side === 'e') return { ax: x1, az: z1, bx: x1, bz: z0, tx: 0, tz: -1, nx: 1, nz: 0, length: d };
  return { ax: x0, az: z0, bx: x0, bz: z1, tx: 0, tz: 1, nx: -1, nz: 0, length: d };
}

/** A rectangle with its four corners cut at 45 degrees by `cut` metres. */
export function chamferPoints(cx, cz, w, d, cut) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const c = Math.min(cut, w * 0.45, d * 0.45);
  return [
    [x0 + c, z1], [x1 - c, z1], [x1, z1 - c], [x1, z0 + c],
    [x1 - c, z0], [x0 + c, z0], [x0, z0 + c], [x0, z1 - c],
  ];
}

/** A rectangle with rounded corners of radius `r`, `segments` facets per corner. */
export function roundedPoints(cx, cz, w, d, r, segments = 3) {
  const rr = Math.min(r, w * 0.49, d * 0.49);
  const x0 = cx - w / 2 + rr;
  const x1 = cx + w / 2 - rr;
  const z0 = cz - d / 2 + rr;
  const z1 = cz + d / 2 - rr;
  const centers = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
  const points = [];
  for (let k = 0; k < 4; k += 1) {
    const start = Math.PI + k * Math.PI / 2;
    for (let s = 0; s <= segments; s += 1) {
      const a = start + (s / segments) * Math.PI / 2;
      points.push([centers[k][0] + rr * Math.cos(a), centers[k][1] - rr * Math.sin(a)]);
    }
  }
  return points;
}

/** An ellipse (or circle) of `segments` facets. */
export function ellipsePoints(cx, cz, rx, rz, segments = 16, rotation = 0) {
  const points = [];
  for (let s = 0; s < segments; s += 1) {
    const a = Math.PI + rotation + (s / segments) * Math.PI * 2;
    points.push([cx + rx * Math.cos(a), cz - rz * Math.sin(a)]);
  }
  return points;
}

/** Shrink a convex footprint by moving every side `inset` metres inward (negative grows it). */
export function insetPoints(points, inset) {
  const n = points.length;
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    // the outward normal is (-dz, dx); move the side against it
    const nx = -dz / len;
    const nz = dx / len;
    lines.push({ px: a[0] - nx * inset, pz: a[1] - nz * inset, dx: dx / len, dz: dz / len });
  }
  const result = [];
  for (let i = 0; i < n; i += 1) {
    const l1 = lines[(i + n - 1) % n];
    const l2 = lines[i];
    const cross = l1.dx * l2.dz - l1.dz * l2.dx;
    if (Math.abs(cross) < 1e-6) {
      result.push([l2.px, l2.pz]);
      continue;
    }
    const t = ((l2.px - l1.px) * l2.dz - (l2.pz - l1.pz) * l2.dx) / cross;
    result.push([l1.px + l1.dx * t, l1.pz + l1.dz * t]);
  }
  return result;
}

/** Scale a footprint about (cx, cz). */
export function scalePoints(points, cx, cz, sx, sz = sx) {
  return points.map(([x, z]) => [cx + (x - cx) * sx, cz + (z - cz) * sz]);
}

/** Rotate a footprint about (cx, cz) by `angle` radians (seen from above). */
export function rotatePoints(points, cx, cz, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return points.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    return [cx + dx * c - dz * s, cz + dx * s + dz * c];
  });
}
