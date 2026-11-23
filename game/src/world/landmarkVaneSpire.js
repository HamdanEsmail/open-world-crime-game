// The Vane Spire: Idris Vane's 330-metre needle of teal glass, the tallest thing in Port Sarab and
// the target of the heist. A tapering round shaft caged in a gold diagrid of counter-wound helices,
// an observation ring, the glowing gold lattice of the vault crown, and a beacon on its needle.

/** Raise the Vane Spire on its plaza block (building from the plan, ctx from the architecture). */
export function raiseVaneSpire(ctx, building) {
  const { x, z, h } = building;
  const solid = ctx.solid;
  const cage = ctx.cutout;
  const baseRadius = Math.min(building.w, building.d) / 2 - 1.5;
  const podiumTop = 12;
  const vaultBase = h - 78;
  const vaultTop = h - 44;
  const shaftR0 = baseRadius * 0.84;
  const radiusAt = (y) => {
    const t = Math.min(1, Math.max(0, (y - podiumTop) / (vaultBase - podiumTop)));
    return shaftR0 * (1 - 0.58 * Math.pow(t, 1.15));
  };

  // The plaza drum: a glass lobby under a white stone ring, with a gold canopy facing the boulevard.
  solid.use('lobbyGlass', 0xffffff);
  solid.cylinder(x, z, baseRadius - 2, 0, 6, 24, { top: false });
  solid.use('stone', 0xf6f0e2);
  solid.cylinder(x, z, baseRadius, 6, podiumTop, 24, { top: false });
  solid.use('roofGravel', 0xece6da);
  solid.cap(circle(x, z, baseRadius, 24), podiumTop, true);
  solid.use('plain', 0xf6f0e2);
  solid.cap(circle(x, z, baseRadius, 24), 6, false);
  solid.use('metalPanel', 0xe9b44c);
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const px = x + Math.cos(a) * (baseRadius - 0.8);
    const pz = z + Math.sin(a) * (baseRadius - 0.8);
    solid.box(px - 0.45, 0, pz - 0.45, px + 0.45, 6, pz + 0.45, { top: false });
  }
  solid.slab(x - 9, z + baseRadius - 2, x + 9, z + baseRadius + 3.5, 5.2, 0.5);
  solid.use('sign:vane', 0xffffff);
  solid.wall(x - 6, z + baseRadius + 3.55, x + 6, z + baseRadius + 3.55, 5.25, 5.25 + 1.7, { fit: true });
  ctx.solid.use('crownLights', 0xffd27a);
  ctx.solid.prismWalls(circle(x, z, baseRadius + 0.1, 24), podiumTop - 0.6, podiumTop, { perimeter: true });

  // The shaft: teal glass, ring upon ring, narrowing as it climbs.
  const rings = 44;
  const segments = 24;
  solid.use('glassSeamless', 0x46bdb4);
  shaftOfRings(solid, x, z, podiumTop, vaultBase, rings, segments, radiusAt);

  // The observation ring at two thirds of the way up.
  const deckY = podiumTop + (vaultBase - podiumTop) * 0.62;
  const deckR = radiusAt(deckY) + 2.2;
  solid.use('darkGlass', 0xbfe8e4);
  solid.cylinder(x, z, deckR, deckY, deckY + 6, segments);
  solid.use('plain', 0xf2f2ee);
  solid.cap(circle(x, z, deckR, segments), deckY, false);
  solid.use('crownLights', 0xfff0c8);
  solid.prismWalls(circle(x, z, deckR + 0.1, segments), deckY + 5.2, deckY + 6, { perimeter: true });

  // The gold diagrid: three helices winding each way, and gold rings where they cross.
  cage.use('metalPanel', 0xffc94a);
  const starts = 4;
  for (let k = 0; k < starts; k += 1) {
    goldHelix(cage, x, z, podiumTop + 1, vaultBase, radiusAt, 1.8, (k / starts) * Math.PI * 2, 1.0, 4.6);
    goldHelix(cage, x, z, podiumTop + 1, vaultBase, radiusAt, 1.8, (k / starts) * Math.PI * 2 + Math.PI / starts, -1.0, 4.6);
  }
  solid.use('metalPanel', 0xf2c04a);
  for (let k = 1; k <= 8; k += 1) {
    const y = podiumTop + (vaultBase - podiumTop) * (k / 8) - 1.6;
    const r = radiusAt(y) + 1.8;
    solid.prismWalls(circle(x, z, r + 0.2, segments), y, y + 1.6, { perimeter: true });
    solid.use('plain', 0xd8a838);
    solid.cap(circle(x, z, r + 0.2, segments), y, false);
    solid.use('metalPanel', 0xf2c04a);
  }

  // The vault crown: a gold drum that glows, caged in a lit diamond lattice.
  const vaultR = radiusAt(vaultBase) + 3.2;
  solid.use('metalPanel', 0xe9b44c);
  solid.prism(circle(x, z, radiusAt(vaultBase) + 0.5, segments), vaultBase - 3, vaultBase, { top: false, topScale: 1.25, perimeter: true, smooth: true });
  solid.use('plain', 0xf0d080);
  solid.cap(circle(x, z, radiusAt(vaultBase) + 0.5, segments), vaultBase - 3, false);
  solid.use('crownLights', 0xff9a18);
  solid.cylinder(x, z, vaultR - 1.4, vaultBase, vaultTop, segments, { top: false });
  cage.use('vaultLattice', 0xffd36a);
  cage.prismWalls(circle(x, z, vaultR, segments), vaultBase, vaultTop, { perimeter: true, smooth: true });
  solid.use('metalPanel', 0xe9b44c);
  solid.prism(circle(x, z, vaultR + 0.3, segments), vaultTop, vaultTop + 2, { top: false, perimeter: true });
  solid.prism(circle(x, z, vaultR + 0.3, segments), vaultTop + 2, vaultTop + 14, { top: false, topScale: 0.25, perimeter: true, smooth: true });
  solid.cap(circle(x, z, (vaultR + 0.3) * 0.25, segments), vaultTop + 14, true);

  // The needle and its beacons.
  const needleBase = vaultTop + 14;
  solid.use('metalPanel', 0xf4f0e6);
  solid.prism(circle(x, z, 1.6, 8), needleBase, h + 6, { top: false, topScale: 0.15, smooth: true, perimeter: true });
  ctx.beacon(x, h + 6.6, z, 0xffffff, 7, 1);
  ctx.beacon(x, vaultTop + 14.5, z, 0xff2a1a, 4.5, 1);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    ctx.beacon(x + Math.cos(a) * (vaultR + 0.8), vaultTop + 2.4, z + Math.sin(a) * (vaultR + 0.8), 0xffd27a, 3.2, 0);
  }
  ctx.beacon(x, deckY + 6.6, z + deckR, 0xff2a1a, 3.4, 1);
}

/** The shaft as stacked rings of quads with round shading; windows count from its base. */
function shaftOfRings(b, x, z, y0, y1, rings, segments, radiusAt) {
  const perimeter0 = Math.PI * 2 * radiusAt(y0);
  const repeats = Math.max(4, Math.round(perimeter0 / b.tileWidth));
  for (let k = 0; k < rings; k += 1) {
    const ya = y0 + (y1 - y0) * (k / rings);
    const yb = y0 + (y1 - y0) * ((k + 1) / rings);
    const ra = radiusAt(ya);
    const rb = radiusAt(yb);
    const slope = (ra - rb) / (yb - ya);
    for (let s = 0; s < segments; s += 1) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      const n0 = normal(Math.cos(a0), slope, -Math.sin(a0));
      const n1 = normal(Math.cos(a1), slope, -Math.sin(a1));
      b.quad(
        [x + ra * Math.cos(a0), ya, z - ra * Math.sin(a0)], [x + ra * Math.cos(a1), ya, z - ra * Math.sin(a1)],
        [x + rb * Math.cos(a1), yb, z - rb * Math.sin(a1)], [x + rb * Math.cos(a0), yb, z - rb * Math.sin(a0)],
        (s / segments) * repeats, (ya - y0) / b.tileHeight, ((s + 1) / segments) * repeats, (yb - y0) / b.tileHeight, false, n0, n1,
      );
    }
  }
}

/** One gold ribbon winding `turns` times round the shaft (negative turns wind the other way). */
function goldHelix(b, x, z, y0, y1, radiusAt, standOff, phase, turns, width) {
  const steps = 150;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const ya = y0 + (y1 - y0) * t0;
    const yb = y0 + (y1 - y0) * t1;
    const aa = phase + turns * Math.PI * 2 * t0;
    const ab = phase + turns * Math.PI * 2 * t1;
    const ra = radiusAt(ya) + standOff;
    const rb = radiusAt(yb) + standOff;
    const pa = [x + ra * Math.cos(aa), z - ra * Math.sin(aa)];
    const pb = [x + rb * Math.cos(ab), z - rb * Math.sin(ab)];
    const na = normal(Math.cos(aa), 0, -Math.sin(aa));
    const nb = normal(Math.cos(ab), 0, -Math.sin(ab));
    const half = width / 2;
    if (turns > 0) {
      b.quad([pa[0], ya - half, pa[1]], [pb[0], yb - half, pb[1]], [pb[0], yb + half, pb[1]], [pa[0], ya + half, pa[1]], 0, 0, 1, 1, false, na, nb);
    } else {
      b.quad([pb[0], yb - half, pb[1]], [pa[0], ya - half, pa[1]], [pa[0], ya + half, pa[1]], [pb[0], yb + half, pb[1]], 0, 0, 1, 1, false, nb, na);
    }
  }
}

/** A circle as a footprint of `segments` points in the builder's winding. */
function circle(x, z, r, segments) {
  const points = [];
  for (let s = 0; s < segments; s += 1) {
    const a = Math.PI + (s / segments) * Math.PI * 2;
    points.push([x + r * Math.cos(a), z - r * Math.sin(a)]);
  }
  return points;
}

function normal(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
