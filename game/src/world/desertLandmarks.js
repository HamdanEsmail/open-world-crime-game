// What stands out in the Amber Dunes: Falcon Rock, a 46 m butte of banded sandstone; the Port Sarab
// Gate arching over the highway south of the city; the red-and-white lattice of the Dune FM mast; the
// Rusted Dhow half-buried on the west beach; kilometre posts and bend chevrons along the highways; and
// (from their own files) the airfield, the oasis, the Wadi Circuit paddock and the solar farm.
import { buildAirfield, airfieldPads } from './desertAirfield.js';
import { buildOasis, buildCircuitPaddock, oasisAndPaddockPads } from './desertOasisAndCircuit.js';

/** Paved ground of the desert landmarks that the terrain tucks itself under: [{x0, z0, x1, z1} | {x, z, r}]. */
export function desertPads(city) {
  const pads = [];
  for (const mark of city.landmarks) {
    if (mark.kind === 'airfield') pads.push(...airfieldPads(city, mark));
  }
  pads.push(...oasisAndPaddockPads(city));
  return pads;
}

/**
 * Raise every desert landmark: ground pads go to the ground builder, standing structures to `props`.
 * @param {Object[]} signs   kilometre posts and chevrons placed by the highways
 * @returns {{ lights: {x:number, y:number, z:number, color:number, size:number}[], gateLegs: Object[] }}
 */
export function buildDesertLandmarks(game, ground, props, signs) {
  const city = game.city;
  const rng = game.rng.fork('desert-landmarks');
  const lights = [];
  let gateLegs = [];
  for (const mark of city.landmarks) {
    if (mark.kind === 'mesa') raiseFalconRock(props, mark, game, rng);
    else if (mark.kind === 'gate') gateLegs = raiseCityGate(props, mark, game);
    else if (mark.kind === 'mast') raiseRadioMast(props, mark, lights);
    else if (mark.kind === 'shipwreck') wreckTheDhow(props, mark, game, rng);
    else if (mark.kind === 'airfield') buildAirfield(game, ground, props, mark, city.landmarks.find((m) => m.kind === 'hangar'), lights, rng);
    else if (mark.kind === 'oasis') buildOasis(game, ground, props, mark, rng);
    else if (mark.kind === 'raceway') buildCircuitPaddock(game, ground, props, mark, rng);
  }
  for (const sign of signs) {
    if (sign.kind === 'km') kilometrePost(props, sign);
    else chevronBoard(props, sign);
  }
  return { lights, gateLegs };
}

/**
 * Falcon Rock: a butte of stacked sandstone strata, each band a little narrower than the one below,
 * cliffs ochre, rust, cream and rose, a flat crown, fallen blocks around its foot.
 */
function raiseFalconRock(props, mark, game, rng) {
  const { x, z } = mark;
  const height = mark.h || 46;
  const radius = (mark.radius || 58) - 1;
  const sides = 22;
  const strata = [0xdb9c64, 0xc47a4c, 0xeed2a4, 0xd68e5e, 0xe6ac78, 0xbd6c44, 0xeac492, 0xd08654];
  const noise = [];
  for (let i = 0; i < sides; i += 1) noise.push(0.84 + rng.next() * 0.22);
  const layers = 8;
  const thickness = [];
  for (let k = 0; k < layers; k += 1) thickness.push(rng.range(0.55, 1.6));
  const totalThickness = thickness.reduce((a, b) => a + b, 0);
  const levels = [0];
  for (let k = 0; k < layers; k += 1) levels.push(levels[k] + (thickness[k] / totalThickness) * height);
  const shrinks = [1];
  for (let k = 1; k <= layers; k += 1) shrinks.push(Math.max(0.6, shrinks[k - 1] - (k === 1 ? 0.08 : rng.range(0.0, 0.07))));
  let previous = null;
  for (let k = 0; k <= layers; k += 1) {
    const y = levels[k];
    const shrink = shrinks[k];
    const ring = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = (i / sides) * Math.PI * 2;
      const wobble = noise[i] * (0.94 + 0.12 * game.math.valueNoise2D(i * 0.7, k * 1.3, 91));
      const r = radius * shrink * wobble;
      ring.push([x + Math.sin(angle) * r, y, z + Math.cos(angle) * r]);
    }
    if (previous) {
      const colour = strata[k % strata.length];
      for (let i = 0; i < sides; i += 1) {
        const j = (i + 1) % sides;
        const lower = previous;
        // A cliff band from the ledge of the layer below up to this layer, then the ledge itself.
        const p0 = [ring[i][0] + (lower[i][0] - ring[i][0]) * 0.45, lower[i][1], ring[i][2] + (lower[i][2] - ring[i][2]) * 0.45];
        const p1 = [ring[j][0] + (lower[j][0] - ring[j][0]) * 0.45, lower[j][1], ring[j][2] + (lower[j][2] - ring[j][2]) * 0.45];
        props.quad(p0, p1, ring[j], ring[i], colour, 0.82);
        props.quad(lower[i], lower[j], p1, p0, k === 1 ? 0xd8a070 : 0xe0b486);
      }
    }
    previous = ring;
  }
  const top = previous;
  for (let i = 0; i < sides; i += 1) props.triangle([x, height + 0.6, z], top[i], top[(i + 1) % sides], 0xe8c08c);
  // The falcon: a weathered pinnacle perched on the crown's western rim, looking toward the city.
  const px = x - radius * shrinks[layers] * 0.55;
  const pz = z - radius * 0.12;
  props.cylinder(px, height - 0.5, pz, 9, 7.5, 6, 9, 0xd08654, { capTop: true, phase: 0.3 });
  props.cylinder(px + 0.6, height + 5.5, pz, 6.5, 4.6, 6.5, 8, 0xeac492, { capTop: true, phase: 0.1 });
  props.cylinder(px + 0.9, height + 12, pz + 0.4, 4.2, 3.0, 5, 7, 0xc47a4c, { capTop: true, phase: 0.5 });
  props.boulder(px + 1.4, height + 18, pz + 0.6, 3.6, 0xd99a62, rng, 0.9);
  for (let k = 0; k < 26; k += 1) {
    const angle = rng.next() * Math.PI * 2;
    const r = radius * rng.range(0.86, 1.0);
    props.boulder(x + Math.sin(angle) * r, 0.4, z + Math.cos(angle) * r, rng.range(1.5, 4.2), rng.pick(strata), rng, 0.6);
  }
}

/**
 * The Port Sarab Gate: two pylons leaning together over the Dune Highway, joined by a shallow arched
 * lintel crowned with a gold crescent, banded in teal tile. Centred on the highway where it passes.
 * Returns the two leg footprints.
 */
function raiseCityGate(props, mark, game) {
  const road = game.city.desertRoads.find((r) => r.points[0][0] === 40) || game.city.desertRoads[0];
  const [ax, az] = road.points[0];
  const [bx, bz] = road.points[1];
  const z = mark.z;
  const t = (z - az) / (bz - az);
  const cx = ax + (bx - ax) * t;
  const depth = mark.d || 6;
  const height = mark.h || 24;
  const span = Math.max(17.5, (mark.w || 44) / 2 - 2.8);
  const cream = 0xfff4d6;
  const gold = 0xe9b44c;
  const teal = 0x1ba39c;
  const legs = [];
  for (const side of [-1, 1]) {
    const footX = cx + side * span;
    const outline = (y, inset) => {
      const lean = (y / height) * 2.2 * -side;
      const w = 2.6 - inset;
      return [[footX + lean - w, z - depth / 2 + inset * 0.3], [footX + lean + w, z - depth / 2 + inset * 0.3], [footX + lean + w, z + depth / 2 - inset * 0.3], [footX + lean - w, z + depth / 2 - inset * 0.3]];
    };
    props.prism(outline(0, 0), -0.5, 2.2, 0xe8dcc0);
    for (let k = 0; k < 6; k += 1) {
      const y0 = 2.2 + ((height - 4.5) * k) / 6;
      const y1 = 2.2 + ((height - 4.5) * (k + 1)) / 6;
      const shape = outline((y0 + y1) / 2, 0.35 + k * 0.08);
      props.prism(shape, y0, y1, k === 3 ? teal : cream, { capTop: k === 5 });
    }
    props.prism(outline(height - 6, 0.1), height - 6.2, height - 5.6, gold);
    legs.push({ minX: footX - 2.8, maxX: footX + 2.8, minZ: z - depth / 2, maxZ: z + depth / 2 });
  }
  const segments = 7;
  for (let k = 0; k < segments; k += 1) {
    const u0 = k / segments;
    const u1 = (k + 1) / segments;
    const x0 = cx - span + 2.2 + (span * 2 - 4.4) * u0;
    const x1 = cx - span + 2.2 + (span * 2 - 4.4) * u1;
    const y0 = height - 4 + Math.sin(u0 * Math.PI) * 2.2;
    const y1 = height - 4 + Math.sin(u1 * Math.PI) * 2.2;
    props.quad([x0, y0, z + depth / 2], [x1, y1, z + depth / 2], [x1, y1 + 3.2, z + depth / 2], [x0, y0 + 3.2, z + depth / 2], cream, 0.9);
    props.quad([x1, y1, z - depth / 2], [x0, y0, z - depth / 2], [x0, y0 + 3.2, z - depth / 2], [x1, y1 + 3.2, z - depth / 2], cream, 0.9);
    props.quad([x0, y0 + 3.2, z + depth / 2], [x1, y1 + 3.2, z + depth / 2], [x1, y1 + 3.2, z - depth / 2], [x0, y0 + 3.2, z - depth / 2], cream);
    props.quad([x0, y0, z - depth / 2], [x1, y1, z - depth / 2], [x1, y1, z + depth / 2], [x0, y0, z + depth / 2], 0xe0d2b4);
    props.quad([x0, y0 + 2.2, z + depth / 2 + 0.05], [x1, y1 + 2.2, z + depth / 2 + 0.05], [x1, y1 + 2.7, z + depth / 2 + 0.05], [x0, y0 + 2.7, z + depth / 2 + 0.05], gold);
    props.quad([x1, y1 + 2.2, z - depth / 2 - 0.05], [x0, y0 + 2.2, z - depth / 2 - 0.05], [x0, y0 + 2.7, z - depth / 2 - 0.05], [x1, y1 + 2.7, z - depth / 2 - 0.05], gold);
  }
  // The crescent: a gold arc standing on the crown of the lintel.
  const crownY = height + 1.4;
  for (let k = 0; k < 9; k += 1) {
    const a0 = -1.2 + (2.4 * k) / 9;
    const a1 = -1.2 + (2.4 * (k + 1)) / 9;
    const r0 = 4.2 - Math.abs(a0) * 0.9;
    const r1 = 4.2 - Math.abs(a1) * 0.9;
    props.beam(cx + Math.sin(a0) * 5, crownY + Math.cos(a0) * r0, z, cx + Math.sin(a1) * 5, crownY + Math.cos(a1) * r1, z, 0.7, gold);
  }
  return legs;
}

/** The Dune FM mast: a 90 m triangular lattice banded red and white, guyed at three heights, red lamps. */
function raiseRadioMast(props, mark, lights) {
  const { x, z } = mark;
  const height = mark.h || 90;
  const side = 2.2;
  const corners = [0, 1, 2].map((k) => [x + Math.sin((k / 3) * Math.PI * 2) * side * 0.577, z + Math.cos((k / 3) * Math.PI * 2) * side * 0.577]);
  const level = 3;
  props.box(x, 0.4, z, 4, 0.8, 4, 0xcfc6b8);
  for (let y = 0; y < height; y += level) {
    const colour = Math.floor(y / 9) % 2 === 0 ? 0xd8432e : 0xfbf7f0;
    for (let k = 0; k < 3; k += 1) {
      const [px, pz] = corners[k];
      const [qx, qz] = corners[(k + 1) % 3];
      props.beam(px, y, pz, px, y + level, pz, 0.22, colour);
      props.beam(px, y + level, pz, qx, y + level, qz, 0.12, colour);
      props.beam(px, y, pz, qx, y + level, qz, 0.1, colour);
    }
  }
  props.box(x, height + 2, z, 0.25, 4, 0.25, 0xd8432e);
  for (const h of [height * 0.33, height * 0.66, height]) {
    for (let k = 0; k < 3; k += 1) {
      const angle = (k / 3) * Math.PI * 2 + 0.5;
      const reach = 18 + h * 0.42;
      props.beam(x, h - 1, z, x + Math.sin(angle) * reach, 0.6, z + Math.cos(angle) * reach, 0.06, 0x50545c);
    }
    lights.push({ x, y: h + (h === height ? 4.2 : 0.3), z, color: 0xff2a1a, size: 2.2, flicker: true });
  }
  for (let k = 0; k < 3; k += 1) {
    const angle = (k / 3) * Math.PI * 2 + 0.5;
    const reach = 18 + height * 0.42;
    props.box(x + Math.sin(angle) * reach, 0.5, z + Math.cos(angle) * reach, 1.6, 1, 1.6, 0xcfc6b8);
  }
}

/** The Rusted Dhow: an old wooden trading boat heeled over and half-buried on the beach, ribs showing. */
function wreckTheDhow(props, mark, game, rng) {
  const { x, z } = mark;
  const ground = game.terrain.baseHeightAt(x, z);
  const length = 24;
  const beam = 6.4;
  props.with(x, ground - 1.3, z, 0.7, 0.06, 0.32, () => {
    const stations = 10;
    const outline = [];
    for (let i = 0; i <= stations; i += 1) {
      const t = i / stations;
      const zz = -length / 2 + length * t;
      const half = (beam / 2) * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) ** 0.6;
      const sheer = 2.4 + (t > 0.8 ? (t - 0.8) * 9 : 0) + (t < 0.15 ? (0.15 - t) * 8 : 0);
      outline.push({ zz, half, sheer });
    }
    const planks = [0x6b4a32, 0x5a3c28, 0x7a5638, 0x4e3424];
    for (let i = 0; i < stations; i += 1) {
      const a = outline[i];
      const b = outline[i + 1];
      for (const side of [-1, 1]) {
        const broken = side > 0 && i >= 3 && i <= 6;
        for (let band = 0; band < 3; band += 1) {
          if (broken && band >= 1) continue;
          const y0 = (band / 3) * a.sheer;
          const y1 = ((band + 1) / 3) * a.sheer;
          const yb0 = (band / 3) * b.sheer;
          const yb1 = ((band + 1) / 3) * b.sheer;
          const w0 = 0.55 + 0.45 * (band + 1) / 3;
          const w1 = 0.55 + 0.45 * band / 3;
          const p = [[side * a.half * w1, y0, a.zz], [side * b.half * w1, yb0, b.zz], [side * b.half * w0, yb1, b.zz], [side * a.half * w0, y1, a.zz]];
          const colour = band === 2 && rng.chance(0.3) ? 0x8a4a2a : planks[(i + band) % planks.length];
          if (side > 0) props.quad(p[1], p[0], p[3], p[2], colour, 0.8);
          else props.quad(p[0], p[1], p[2], p[3], colour, 0.8);
        }
        if (broken) {
          props.beam(side * a.half * 0.62, a.sheer * 0.33, a.zz, side * a.half, a.sheer, a.zz, 0.22, 0x4e3424);
        }
      }
    }
    props.box(0, 1.0, -length * 0.42, beam * 0.5, 0.4, 1.2, 0x5a3c28);
    props.beam(0, 1.2, length * 0.05, 1.8, 9, length * 0.2, 0.35, 0x5a3c28);
    props.beam(-0.4, 6.5, length * 0.1, 1.6, 8.2, -length * 0.25, 0.18, 0x4e3424);
  });
}

/** A white kilometre post with a green plate. */
function kilometrePost(props, sign) {
  props.with(sign.x, 0, sign.z, sign.heading, 0, 0, () => {
    props.box(0, 0.6, 0, 0.18, 1.2, 0.18, 0xf4f0e8);
    props.box(0, 1.35, 0, 0.7, 0.45, 0.06, 0x1f7a4a);
    props.box(0, 1.35, 0.035, 0.4, 0.08, 0.02, 0xf4f0e8);
  });
}

/** A yellow chevron board on two posts, pointing the way round a bend. */
function chevronBoard(props, sign) {
  props.with(sign.x, 0, sign.z, sign.heading, 0, 0, () => {
    props.box(-0.5, 0.75, 0, 0.1, 1.5, 0.1, 0x8a8e96);
    props.box(0.5, 0.75, 0, 0.1, 1.5, 0.1, 0x8a8e96);
    props.box(0, 1.6, 0, 1.4, 0.9, 0.06, 0xf2c230);
    const s = sign.outward > 0 ? 1 : -1;
    props.with(0.12 * s, 1.6, 0.04, 0, 0, 0.6 * s, () => props.box(0, 0.18, 0, 0.18, 0.5, 0.02, 0x1c1c20));
    props.with(0.12 * s, 1.6, 0.04, 0, 0, -0.6 * s, () => props.box(0, -0.18, 0, 0.18, 0.5, 0.02, 0x1c1c20));
  });
}
