// The traffic lights of Port Sarab: at every signalled junction, a mast-arm signal on each approach,
// standing at the stop line on the right-hand kerb with one head hung over the lanes and one on the
// pole, facing the arriving traffic. The lenses show the junction's live phase, bright enough to read
// in full sun, and are refreshed a few times a second.
import * as THREE from 'three';
import { createShapeBuilder, rgb } from './propShapes.js';
import { createPropRecord, setRecordColor } from './propInstancing.js';

const POLE = rgb(0x2c2f34);
const HOUSING = rgb(0x1d1f22);
const BACKPLATE = rgb(0xe9b44c);
const ARM_LENGTH = 7.2;

/** Where the heads sit in the signal's own space (+Z faces the traffic, the arm reaches toward -X). */
const HEADS = [
  { x: -ARM_LENGTH + 0.45, y: 5.55, z: 0 },
  { x: 0, y: 3.05, z: 0.27 },
];
const LENS_SPACING = 0.34;
const LENS_FORWARD = 0.17;

/** Lit and dark colours of the red, amber and green lenses (linear, drawn without tone mapping). */
const LENS_COLORS = {
  red: { on: [1.0, 0.07, 0.04], off: [0.1, 0.012, 0.01] },
  yellow: { on: [1.0, 0.52, 0.02], off: [0.1, 0.055, 0.006] },
  green: { on: [0.08, 1.0, 0.42], off: [0.007, 0.075, 0.035] },
};
const LENS_ORDER = ['red', 'yellow', 'green'];
const UPDATE_INTERVAL = 0.2;

/** Place the signals of every signalled junction and keep their lenses on the live phase. */
export function createStreetSignals(game, kit) {
  const roads = game.roads;
  const map = kit.map;
  const poles = [];
  const lenses = [];
  const approaches = [];

  for (const node of roads.nodes) {
    if (!node.signal) continue;
    for (const edge of node.edges) placeApproachSignal(node, edge);
  }

  kit.addSet({ name: 'signalPole', geometry: buildSignalMast(), material: kit.materials.prop, records: poles, maxRange: 520, castShadow: true });
  const lensSet = kit.addSet({ name: 'signalLens', geometry: buildSignalLens(), material: kit.materials.lens, records: lenses, maxRange: 420, receiveShadow: false });

  let clock = UPDATE_INTERVAL;
  showPhases();
  kit.onUpdate((dt) => {
    clock -= dt;
    if (clock > 0) return;
    clock = UPDATE_INTERVAL;
    if (showPhases()) lensSet.dirty = true;
  });

  /** One mast-arm signal for traffic arriving at `node` along `edge`. */
  function placeApproachSignal(node, edge) {
    const other = edge.a === node ? edge.b : edge.a;
    const length = Math.hypot(node.x - other.x, node.z - other.z) || 1;
    const dx = (node.x - other.x) / length;
    const dz = (node.z - other.z) / length;
    const rightX = -dz;
    const rightZ = dx;
    let x = 0;
    let z = 0;
    let placed = false;
    for (const extra of [0, 0.6, -0.8, 1.4]) {
      const back = node.trim + 0.3 + extra;
      x = node.x - dx * back + rightX * (edge.half + 0.7);
      z = node.z - dz * back + rightZ * (edge.half + 0.7);
      if (map.claim(x, z, 0.55)) {
        placed = true;
        break;
      }
    }
    if (!placed) return;
    const yaw = Math.atan2(-dx, -dz);
    const y = kit.ground(x, z);
    const pole = createPropRecord({ kind: 'signal', x, y, z, yaw, footprint: 0.22 });
    kit.addCollider(pole, { type: 'post', x, z, radius: 0.2, y0: y, y1: y + 6.8, kind: 'signal' });
    poles.push(pole);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const approach = { node, axis: Math.abs(dx) > Math.abs(dz) ? 'ew' : 'ns', lenses: [], state: '' };
    for (const head of HEADS) {
      for (let k = 0; k < 3; k += 1) {
        const lx = head.x;
        const ly = head.y + (1 - k) * LENS_SPACING;
        const lz = head.z + LENS_FORWARD;
        const lens = createPropRecord({ kind: 'signalLens', x: x + lx * cos + lz * sin, y: y + ly, z: z - lx * sin + lz * cos, yaw, footprint: 0 });
        lens.lensColor = LENS_ORDER[k];
        lenses.push(lens);
        approach.lenses.push(lens);
      }
    }
    pole.linked = approach.lenses;
    approaches.push(approach);
  }

  /** Read each junction's phase and relight the lenses that changed; true when any did. */
  function showPhases() {
    let changed = false;
    for (let i = 0; i < approaches.length; i += 1) {
      const approach = approaches[i];
      const phase = roads.signalPhase(approach.node);
      const state = approach.axis === 'ew' ? phase.ew : phase.ns;
      if (state === approach.state) continue;
      approach.state = state;
      changed = true;
      for (let k = 0; k < approach.lenses.length; k += 1) {
        const lens = approach.lenses[k];
        const colors = LENS_COLORS[lens.lensColor];
        setRecordColor(lens, lens.lensColor === state ? colors.on : colors.off);
      }
    }
    return changed;
  }

  return { approaches, poles, lenses };
}

/**
 * The mast: pole on a plinth, a tapered arm with a brace, a hanging head at the arm's end and a second
 * head on the pole, each with a sand-gold backplate and visors over the lenses (lenses are separate).
 */
export function buildSignalMast() {
  const b = createShapeBuilder();
  b.cylinder(0.24, 0.3, 0.6, 6, { y: 0.05, color: rgb(0x8a8478) });
  b.cylinder(0.11, 0.14, 6.6, 6, { y: 0.3 + 3.3, color: POLE, open: true });
  b.cylinder(0.06, 0.1, ARM_LENGTH, 5, { x: -ARM_LENGTH / 2, y: 6.35, rz: Math.PI / 2, color: POLE, open: true });
  b.tube([[0, 5.3, 0], [-2.6, 6.3, 0]], 0.04, 4, { color: POLE });
  b.cylinder(0.02, 0.02, 0.35, 3, { x: HEADS[0].x, y: 6.2, color: POLE, open: true });
  for (const head of HEADS) {
    b.box(0.42, 1.16, 0.3, { x: head.x, y: head.y, z: head.z, color: HOUSING });
    b.box(0.72, 1.46, 0.04, { x: head.x, y: head.y, z: head.z - 0.17, color: BACKPLATE });
    // One hood over the three lenses, open at the front.
    b.box(0.44, 0.04, 0.2, { x: head.x, y: head.y + LENS_SPACING + 0.17, z: head.z + 0.24, color: HOUSING });
    for (const side of [-1, 1]) b.box(0.03, 1.12, 0.16, { x: head.x + side * 0.2, y: head.y, z: head.z + 0.23, color: HOUSING });
  }
  b.box(0.18, 0.28, 0.14, { y: 1.15, z: 0.14, color: rgb(0xe9b44c) });
  return b.build();
}

/** One round lens, facing +Z. */
export function buildSignalLens() {
  const b = createShapeBuilder();
  b.part(new THREE.CircleGeometry(0.135, 10), { color: [1, 1, 1] });
  return b.build();
}
