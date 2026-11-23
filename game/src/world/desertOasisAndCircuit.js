// Two gathering places of the Amber Dunes. Ain Zahra Oasis: a green pond ringed with reeds, a stone
// well, striped nomad tents and low mud-brick walls (its palms come from the planting system). The
// Wadi Circuit paddock: a concrete apron, a grandstand of coloured seat rows under a sail canopy, a
// timing tower, tyre stacks, flags, and a chequered start gantry over the Wadi Road.
import { SURFACE } from './groundSurfaceAtlas.js';

const TAU = Math.PI * 2;

/** The oasis and the paddock lie on ground the plan keeps flat; they need no extra pads. */
export function oasisAndPaddockPads() {
  return [];
}

/** Ain Zahra: pond, muddy rim, reeds, well, a ring of tents and broken mud-brick walls. */
export function buildOasis(game, ground, props, mark, rng) {
  const { x, z } = mark;
  const sides = 14;
  const outline = [];
  for (let i = 0; i < sides; i += 1) outline.push(17 + rng.range(-3, 4));
  const pointAt = (i, scale) => {
    const angle = (i / sides) * TAU;
    const k = Math.floor(i);
    const f = i - k;
    const r = (outline[k % sides] * (1 - f) + outline[(k + 1) % sides] * f) * scale;
    return [x + Math.sin(angle) * r, z + Math.cos(angle) * r];
  };
  for (let i = 0; i < sides; i += 1) {
    ground.polygon('paint', [pointAt(i, 1.0), pointAt(i + 1, 1.0), pointAt(i + 1, 1.35), pointAt(i, 1.35)], 0.01, SURFACE.EARTH, { tint: 0xc8b496, jitter: 0.1 });
    ground.polygon('paint', [pointAt(i, 1.35), pointAt(i + 1, 1.35), pointAt(i + 1, 1.75), pointAt(i, 1.75)], 0.008, SURFACE.LAWN, { tint: 0xe8f0c0, jitter: 0.14 });
  }
  const pond = [];
  for (let i = 0; i < sides; i += 1) pond.push(pointAt(i, 1.02));
  ground.polygon('paint', pond, 0.02, SURFACE.POOL, { tint: 0x7ab8a0, jitter: 0.06 });
  // Reeds: thin blades in clumps around the water.
  for (let k = 0; k < 34; k += 1) {
    const i = rng.int(0, sides - 1);
    const [px, pz] = pointAt(i + rng.next(), rng.range(1.05, 1.3));
    for (let b = 0; b < 5; b += 1) {
      const angle = rng.next() * TAU;
      const h = rng.range(1.2, 2.4);
      const bx = px + Math.sin(angle) * 0.4;
      const bz = pz + Math.cos(angle) * 0.4;
      const lean = rng.range(-0.4, 0.4);
      const colour = rng.pick([0x7a8a3a, 0x8f9a44, 0xc8b060]);
      const a = [bx - 0.08, 0, bz];
      const c = [bx + 0.08, 0, bz];
      const tip = [bx + lean, h, bz + lean * 0.5];
      props.triangle(a, c, tip, colour);
      props.triangle(c, a, tip, colour);
    }
  }
  // The well: a round stone kerb, a timber frame and a bucket beam.
  const wx = x + 24;
  const wz = z - 6;
  props.cylinder(wx, 0, wz, 1.3, 1.2, 0.9, 10, 0xc8b49a, { capTop: false });
  props.cylinder(wx, 0.85, wz, 1.2, 1.2, 0.05, 10, 0x2a3a3a, { capTop: true });
  props.beam(wx - 1.2, 0, wz, wx - 0.2, 2.6, wz, 0.15, 0x6b4a32);
  props.beam(wx + 1.2, 0, wz, wx + 0.2, 2.6, wz, 0.15, 0x6b4a32);
  props.box(wx, 2.6, wz, 2.2, 0.16, 0.16, 0x6b4a32);
  // Nomad tents facing the pond.
  for (let k = 0; k < 6; k += 1) {
    const angle = (k / 6) * TAU + 0.35;
    const tx = x + Math.sin(angle) * 38;
    const tz = z + Math.cos(angle) * 38;
    pitchTent(props, tx, tz, angle + Math.PI, rng);
    ground.rect('paint', tx - Math.sin(angle) * 5 - 1.5, tz - Math.cos(angle) * 5 - 1.1, tx - Math.sin(angle) * 5 + 1.5, tz - Math.cos(angle) * 5 + 1.1, 0.012, SURFACE.ZELLIGE, { tint: 0xffd0c0 });
  }
  // Low mud-brick walls in broken arcs.
  for (let k = 0; k < 7; k += 1) {
    const start = (k / 7) * TAU + 0.15;
    const span = rng.range(0.35, 0.6);
    const steps = Math.ceil((span * 52) / 4.5);
    for (let s = 0; s < steps; s += 1) {
      const a0 = start + (span * s) / steps;
      const a1 = start + (span * (s + 1)) / steps;
      const h = 1.3 + rng.range(-0.25, 0.15);
      props.beam(x + Math.sin(a0) * 52, h / 2, z + Math.cos(a0) * 52, x + Math.sin(a1) * 52, h / 2, z + Math.cos(a1) * 52, 0.7, 0xc8956a);
      props.beam(x + Math.sin(a0) * 52, h, z + Math.cos(a0) * 52, x + Math.sin(a1) * 52, h, z + Math.cos(a1) * 52, 0.4, 0xdcae80);
    }
  }
}

/** A long low tent of dark woven cloth with a red band, its open side toward `heading`. */
function pitchTent(props, x, z, heading, rng) {
  const length = rng.range(7, 9.5);
  const depth = 4.6;
  const ridge = 2.4;
  const eave = 1.2;
  props.with(x, 0, z, heading, 0, 0, () => {
    const L = length / 2;
    const D = depth / 2;
    for (const [z0, z1, y0, y1, colour] of [[-D, -D * 0.55, eave, eave + (ridge - eave) * 0.45, 0x3a2e28], [-D * 0.55, -D * 0.35, eave + (ridge - eave) * 0.45, eave + (ridge - eave) * 0.65, 0xa8452a], [-D * 0.35, 0, eave + (ridge - eave) * 0.65, ridge, 0x3a2e28]]) {
      props.quad([L, y0, z0], [-L, y0, z0], [-L, y1, z1], [L, y1, z1], colour);
      props.quad([-L, y0, -z0], [L, y0, -z0], [L, y1, -z1], [-L, y1, -z1], colour);
    }
    props.quad([L, 0, -D], [-L, 0, -D], [-L, eave, -D], [L, eave, -D], 0x4a3a30, 0.8);
    props.quad([-L, 0, D], [L, 0, D], [L, eave, D], [-L, eave, D], 0x241a16, 0.8);
    props.triangle([L, eave, -D], [L, ridge, 0], [L, eave, D], 0x342822);
    props.triangle([-L, eave, D], [-L, ridge, 0], [-L, eave, -D], 0x342822);
    props.quad([L, 0, -D], [L, eave, -D], [L, eave, D], [L, 0, D], 0x342822, 0.8);
    props.quad([-L, 0, D], [-L, eave, D], [-L, eave, -D], [-L, 0, -D], 0x342822, 0.8);
    for (const px of [-L + 0.3, 0, L - 0.3]) props.box(px, ridge / 2, D + 0.2, 0.12, ridge, 0.12, 0x6b4a32);
  });
}

/**
 * The Wadi Circuit paddock: a concrete apron, the grandstand standing on the plan's footprint and
 * facing north toward the course, a timing tower, tyre stacks, flags, and the start gantry.
 */
export function buildCircuitPaddock(game, ground, props, mark, rng) {
  const { x, z } = mark;
  const w = mark.w || 50;
  const d = mark.d || 24;
  const apron = [];
  for (let k = 0; k < 8; k += 1) {
    const angle = (k / 8) * TAU + TAU / 16;
    apron.push([x + Math.sin(angle) * 38, z + Math.cos(angle) * 38]);
  }
  ground.polygon('paint', apron, 0.01, SURFACE.CONCRETE, { tint: 0xe6e2da, jitter: 0.08 });
  ground.rect('paint', x - w / 2, z - d / 2 - 9, x + w / 2, z - d / 2 - 8.4, 0.022, SURFACE.PAINT, { tint: 0xfffaf0 });
  // Grandstand: a plinth, seven stepped tiers of coloured seats rising to the south, a back wall, a sail roof.
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  props.box(x, 0.6, z, w, 1.2, d, 0xd8d2c6);
  const tiers = 7;
  const seats = [0x1ba39c, 0xe4572e, 0xe9b44c];
  for (let k = 0; k < tiers; k += 1) {
    const front = z0 + 2 + k * 2.4;
    const y = 1.2 + k * 0.65;
    props.box(x, y + 0.3, (front + z1 - 1.5) / 2, w - 1, 0.6, z1 - 1.5 - front, 0xe2dcd0);
    props.box(x, y + 0.82, front + 0.55, w - 1.6, 0.45, 0.5, seats[k % 3]);
  }
  props.box(x, 4.2, z1 - 0.6, w, 8.4, 1.2, 0xd2ccc0);
  for (let px = x0 + 2; px <= x1 - 1; px += (w - 4) / 4) props.beam(px, 8.4, z1 - 0.6, px, 10.4, z1 - 0.6, 0.35, 0xf2f2f2);
  props.quad([x0 - 1, 10.4, z1 + 0.5], [x1 + 1, 10.4, z1 + 0.5], [x1 + 1, 8.6, z0 + 3], [x0 - 1, 8.6, z0 + 3], 0xfbf7f0);
  props.quad([x1 + 1, 10.4, z1 + 0.5], [x0 - 1, 10.4, z1 + 0.5], [x0 - 1, 8.6, z0 + 3], [x1 + 1, 8.6, z0 + 3], 0xd8d4cc);
  for (let px = x0; px <= x1; px += w / 4) props.beam(px, 0, z0 + 3, px, 8.6, z0 + 3, 0.25, 0xf2f2f2);
  // Timing tower.
  props.box(x1 + 8, 7, z0 + 2, 3, 14, 3, 0xf4f0e8);
  props.box(x1 + 8, 12.6, z0 + 2, 3.1, 1.6, 3.1, 0x1c2430);
  props.box(x1 + 8, 14.4, z0 + 2, 3.6, 0.3, 3.6, 0xe4572e);
  // Tyre stacks along the front of the apron, painted white and red.
  for (let k = 0; k < 14; k += 1) {
    const tx = x0 - 8 + k * ((w + 16) / 13);
    const tz = z0 - 14 + Math.sin(k * 0.8) * 0.6;
    for (let t = 0; t < 3; t += 1) props.cylinder(tx, t * 0.26, tz, 0.38, 0.38, 0.24, 7, t === 2 ? (k % 2 ? 0xe4572e : 0xfbf7f0) : 0x1a1a1e, { capTop: t === 2 });
  }
  // Flags on tall poles.
  const flags = [0xe4572e, 0x1ba39c, 0xe9b44c, 0xfbf7f0, 0x2c6cb4, 0xe4572e];
  for (let k = 0; k < flags.length; k += 1) {
    const fx = x0 - 4 + k * ((w + 8) / (flags.length - 1));
    const fz = z0 - 6;
    props.box(fx, 3, fz, 0.12, 6, 0.12, 0xdddddd);
    const sway = Math.sin(k * 1.7) * 0.4;
    const a = [fx, 5.9, fz];
    const b = [fx + 2.0, 5.7 + sway * 0.3, fz + sway];
    const c = [fx + 2.0, 4.5 + sway * 0.3, fz + sway];
    const e = [fx, 4.6, fz];
    props.quad(a, b, c, e, flags[k]);
    props.quad(b, a, e, c, flags[k]);
  }
  raiseStartGantry(props, game, rng);
}

/** A chequered start gantry over the Wadi Road beside the rally start. */
function raiseStartGantry(props, game) {
  const start = game.city.places.find((place) => place.kind === 'raceStart' && place.race === 'dunes');
  const road = game.city.desertRoads.find((r) => r.name === 'Wadi Road');
  if (!start || !road) return;
  let best = null;
  for (let i = 0; i < road.points.length - 1; i += 1) {
    const [ax, az] = road.points[i];
    const [bx, bz] = road.points[i + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const t = Math.max(0, Math.min(1, ((start.x - ax) * (bx - ax) + (start.z - az) * (bz - az)) / (length * length)));
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    const d = Math.hypot(start.x - px, start.z - pz);
    if (!best || d < best.d) best = { d, x: px, z: pz, heading: Math.atan2(bx - ax, bz - az) };
  }
  const half = game.city.roadKinds[road.kind].width / 2 + 1.5;
  props.with(best.x, 0, best.z, best.heading, 0, 0, () => {
    for (const side of [-1, 1]) {
      props.box(side * half, 3.5, 0, 0.6, 7, 0.6, 0xe8e8e8);
      props.box(side * half, 0.3, 0, 1.4, 0.6, 1.4, 0xcfc6b8);
    }
    props.box(0, 7.2, 0, half * 2 + 0.6, 1.6, 0.5, 0x1c1c20);
    const squares = 16;
    for (let k = 0; k < squares; k += 1) {
      for (let row = 0; row < 2; row += 1) {
        if ((k + row) % 2 === 0) continue;
        const sx = -half + ((k + 0.5) * half * 2) / squares;
        props.box(sx, 6.75 + row * 0.8, 0, (half * 2) / squares, 0.72, 0.56, 0xfbf7f0);
      }
    }
  });
}
