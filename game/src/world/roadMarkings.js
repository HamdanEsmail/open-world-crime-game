// The paint on the streets of Port Sarab: dashed lane dividers, solid edge lines, zebra crossings on
// every arm of every junction, stop lines, turn arrows before the signals, parking-bay ticks, red bus
// lanes down the boulevards and the teal cycle track of the Corniche, plus the patches, manhole
// covers and oil stains that make the asphalt look driven on.
import { SURFACE } from './groundSurfaceAtlas.js';
import { CROSSING, STREET_LEVELS } from './roadSurfaces.js';
import { roadMarkingsForKind, crosswalkStripesAcross } from './groundSurfaceRules.js';

const WHITE = 0xfffaf0;
const LINE = 0.15;
const PAINT_Y = 0.012;
const COLOURED_LANE_Y = 0.006;
const STAIN_Y = 0.002;

/**
 * Paint the whole street grid into the ground builder's paint layer.
 * @param {Object} layout   what buildRoadSurfaces returned (crosswalks, medians)
 */
export function buildRoadMarkings(game, ground, layout) {
  const rng = game.rng.fork('road-markings');
  for (const edge of game.roads.edges) {
    if (!edge.grid) continue;
    const lane = laneFrame(edge);
    paintLaneLines(ground, edge, lane, game.city);
    paintStopLinesAndArrows(ground, edge, lane);
    if (edge.kind === 'street') paintParkingBays(ground, edge, lane);
    weatherAsphalt(ground, edge, lane, rng);
  }
  for (const crossing of layout.crosswalks) paintCrosswalk(ground, crossing);
}

/**
 * A frame along one grid edge: s runs along the road, offsets run across it from the centre line.
 * start/end are where the lane markings begin and end, just past the stop lines.
 */
function laneFrame(edge) {
  const alongX = edge.grid === 'ew';
  const crossA = alongX ? edge.a.halfNS : edge.a.halfEW;
  const crossB = alongX ? edge.b.halfNS : edge.b.halfEW;
  const a = alongX ? edge.a.x : edge.a.z;
  const b = alongX ? edge.b.x : edge.b.z;
  const centre = alongX ? edge.a.z : edge.a.x;
  return {
    alongX, centre, a, b,
    stopA: a + crossA + CROSSING.stopLine,
    stopB: b - crossB - CROSSING.stopLine,
    start: a + crossA + CROSSING.stopLine + 0.4,
    end: b - crossB - CROSSING.stopLine - 0.4,
    point: (s, offset) => (alongX ? [s, centre + offset] : [centre + offset, s]),
    // Traffic arriving at the edge's first node drives on this side of the centre line (right-hand rule):
    // westbound keeps to the north (-z) half, northbound to the east (+x) half.
    sideA: alongX ? -1 : 1,
  };
}

/** Lane dividers, edge lines, bay lines and the coloured bus or cycle lanes. */
function paintLaneLines(ground, edge, lane, city) {
  const line = (offset, width, dash, gap, tint, surface = SURFACE.PAINT, y = PAINT_Y) => {
    if (dash <= 0) {
      const [ax, az] = lane.point(lane.start, offset);
      const [bx, bz] = lane.point(lane.end, offset);
      ground.bar('paint', ax, az, bx, bz, width, y, surface, { tint, jitter: 0.03 });
      return;
    }
    const length = lane.end - lane.start;
    const pitch = dash + gap;
    const count = Math.floor((length - dash) / pitch);
    const lead = (length - count * pitch - dash) / 2;
    for (let k = 0; k <= count; k += 1) {
      const s = lane.start + lead + k * pitch;
      const [ax, az] = lane.point(s, offset);
      const [bx, bz] = lane.point(s + dash, offset);
      ground.bar('paint', ax, az, bx, bz, width, y, surface, { tint, jitter: 0.03 });
    }
  };
  const rule = roadMarkingsForKind(edge.kind);
  if (edge.kind === 'street') {
    line(0, 0.13, rule.centre[0], rule.centre[1], WHITE);
    line(rule.bayLine, 0.12, 0, 0, WHITE);
    line(-rule.bayLine, 0.12, 0, 0, WHITE);
    return;
  }
  const corniche = edge.name === city.streets[0].name;
  const [fromMedian, dash, gap] = rule.divider;
  for (const side of [-1, 1]) {
    line(side * (edge.median / 2 + fromMedian), LINE, dash, gap, WHITE);
    line(side * (edge.median / 2 + rule.edge), LINE, 0, 0, WHITE);
    if (corniche) {
      const [centre, width] = rule.cycleLane;
      line(side * centre, width, 0, 0, 0x34a89e, SURFACE.PAINT, COLOURED_LANE_Y);
      line(side * (centre - width / 2 - 0.3), 0.12, 1.2, 1.2, WHITE);
      line(side * (centre + width / 2 + 0.3), 0.12, 0, 0, WHITE);
    } else {
      const [centre, width] = rule.busLane;
      line(side * centre, width, 0, 0, 0xb85a44, SURFACE.PAINT, COLOURED_LANE_Y);
      line(side * (centre + width / 2 + 0.1), 0.2, 0, 0, WHITE);
    }
  }
}

/** Stop lines on the arriving lanes at both ends, and turn arrows before signalled junctions. */
function paintStopLinesAndArrows(ground, edge, lane) {
  const inner = edge.median / 2 + 0.2;
  const outer = edge.kind === 'street' ? 4.7 : edge.median / 2 + 7.0;
  for (const [stop, node, side, toward] of [[lane.stopA, edge.a, lane.sideA, -1], [lane.stopB, edge.b, -lane.sideA, 1]]) {
    const [ax, az] = lane.point(stop - toward * 0.2, side * inner);
    const [bx, bz] = lane.point(stop - toward * 0.2, side * outer);
    ground.bar('paint', ax, az, bx, bz, 0.45, PAINT_Y, SURFACE.PAINT, { tint: WHITE, jitter: 0.02 });
    if (!node.signal || edge.kind !== 'boulevard') continue;
    for (let index = 0; index < edge.lanesEachWay; index += 1) {
      const offset = side * (edge.median / 2 + 3.5 * (index + 0.5));
      const tipS = stop - toward * 10;
      paintTurnArrow(ground, lane, tipS, offset, toward, index === 0 ? 'left' : 'right', side);
    }
  }
}

/**
 * A painted arrow in a lane: a straight arrow with a branch toward `turn`. `toward` is the direction of
 * travel along s (+1 or -1); `side` is which side of the centre line the lane is on.
 */
function paintTurnArrow(ground, lane, tipS, offset, toward, turn, side) {
  const options = { tint: WHITE, jitter: 0.02 };
  const at = (along, across) => lane.point(tipS - toward * along, offset + across);
  // Travelling with +s, the driver's left lies toward the side of the centre line the lane is on... flipped by the side sign.
  const leftSign = -side;
  const [s0x, s0z] = at(5.2, 0);
  const [s1x, s1z] = at(1.6, 0);
  ground.bar('paint', s0x, s0z, s1x, s1z, 0.3, PAINT_Y, SURFACE.PAINT, options);
  ground.polygon('paint', [at(1.7, -0.55), at(0, 0), at(1.7, 0.55)], PAINT_Y, SURFACE.PAINT, options);
  const branch = turn === 'left' ? leftSign : -leftSign;
  const [b0x, b0z] = at(4.0, 0);
  const [b1x, b1z] = at(2.9, branch * 0.95);
  ground.bar('paint', b0x, b0z, b1x, b1z, 0.28, PAINT_Y, SURFACE.PAINT, options);
  ground.polygon('paint', [at(3.3, branch * 0.55), at(2.35, branch * 1.45), at(2.45, branch * 0.55)], PAINT_Y, SURFACE.PAINT, options);
}

/** The ticks between parking bays along both kerbs, where the plan parks its cars. */
function paintParkingBays(ground, edge, lane) {
  const clear = 34;
  const spacing = roadMarkingsForKind('street').bays;
  const first = lane.a + clear;
  const last = lane.b - clear;
  if (last < first) return;
  for (const side of [-1, 1]) {
    for (let s = first - spacing / 2; s <= last + spacing / 2 + 0.01; s += spacing) {
      const [ax, az] = lane.point(s, side * 4.86);
      const [bx, bz] = lane.point(s, side * 7.25);
      ground.bar('paint', ax, az, bx, bz, 0.12, PAINT_Y, SURFACE.PAINT, { tint: WHITE, jitter: 0.02 });
    }
  }
}

/** Repair patches, manhole covers and oil drips: the asphalt of a city that is driven on. */
function weatherAsphalt(ground, edge, lane, rng) {
  const lanes = edge.lanesEachWay;
  const laneCentre = (side, index) => side * (edge.median / 2 + 3.5 * (index + 0.5));
  const length = lane.end - lane.start;
  const patches = rng.int(0, 3);
  for (let k = 0; k < patches; k += 1) {
    const s = lane.start + rng.range(0.1, 0.9) * length;
    const side = rng.sign();
    const offset = laneCentre(side, rng.int(0, lanes - 1)) + rng.range(-0.3, 0.3);
    const along = rng.range(2, Math.min(7, length * 0.08));
    const across = rng.range(1.2, 2.0);
    const corners = [lane.point(s, offset - across / 2), lane.point(s + along, offset - across / 2), lane.point(s + along, offset + across / 2), lane.point(s, offset + across / 2)];
    ground.polygon('paint', corners, STAIN_Y, SURFACE.ASPHALT, { tint: rng.chance(0.6) ? 0xb0b0b8 : 0xffffff, jitter: 0.04, scale: 0.83 });
  }
  for (let s = lane.start + rng.range(10, 40); s < lane.end - 8; s += rng.range(45, 90)) {
    const [cx, cz] = lane.point(s, laneCentre(rng.sign(), rng.int(0, lanes - 1)));
    ground.polygon('paint', [[cx - 0.4, cz - 0.4], [cx + 0.4, cz - 0.4], [cx + 0.4, cz + 0.4], [cx - 0.4, cz + 0.4]], STAIN_Y, SURFACE.KERB, { tint: 0x6a6660, jitter: 0.05, scale: 0.25 });
  }
}

/** A zebra crossing across one arm of a junction, and the tactile paving where it meets each kerb. */
function paintCrosswalk(ground, crossing) {
  const { alongX, from, to, line, half } = crossing;
  const { count, pitch, bar } = crosswalkStripesAcross(half * 2);
  const first = line - (count * pitch) / 2 + (pitch - bar) / 2 + bar / 2;
  for (let k = 0; k < count; k += 1) {
    const c = first + k * pitch;
    if (alongX) ground.bar('paint', from, c, to, c, bar, PAINT_Y, SURFACE.PAINT, { tint: WHITE, jitter: 0.03 });
    else ground.bar('paint', c, from, c, to, bar, PAINT_Y, SURFACE.PAINT, { tint: WHITE, jitter: 0.03 });
  }
  for (const landing of crossing.landings) {
    const outward = landing.line > line ? 1 : -1;
    const k0 = landing.line + outward * 0.4;
    const k1 = landing.line + outward * 1.0;
    const y = STREET_LEVELS.dropped + PAINT_Y;
    const options = { tint: 0xf0d6a8, jitter: 0.04, scale: 0.4 };
    if (landing.axis === 'x') ground.rect('paint', landing.a + 0.2, Math.min(k0, k1), landing.b - 0.2, Math.max(k0, k1), y, SURFACE.COBBLES, options);
    else ground.rect('paint', Math.min(k0, k1), landing.a + 0.2, Math.max(k0, k1), landing.b - 0.2, y, SURFACE.COBBLES, options);
  }
}
