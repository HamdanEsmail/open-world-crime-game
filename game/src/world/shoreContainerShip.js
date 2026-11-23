// The MV Amber Star, the 240 m container ship moored at the Mina Docks quay: navy hull over red
// antifouling, a white bridge block and wings at the stern, an amber funnel with a white star, and a
// deck stacked with containers bay by bay (the boxes themselves are drawn by shoreContainerStacks.js).

const NAVY = 0x1f3a5c;
const ANTIFOULING = 0xb8362a;
const WHITE = 0xf6f2ea;
const WINDOWS = 0x22303c;
const AMBER = 0xe9b44c;

/**
 * Build the hull and superstructure into the prop builder and return the container slots on deck.
 * @param {Object} props   the prop builder
 * @param {{x:number, z:number, w:number, d:number, h:number}} mark   the containerShip landmark
 * @returns {{x:number, y:number, z:number, length:number, width:number, tiers:number, colorIndex:number, alongX:boolean}[]}
 */
export function buildContainerShip(props, mark, rng) {
  const length = mark.w || 240;
  const beam = mark.d || 38;
  const x0 = mark.x - length / 2;
  const x1 = mark.x + length / 2;
  const north = mark.z - beam / 2;
  const south = mark.z + beam / 2;
  const deck = 7;
  const hull = [
    [x0, mark.z], [x0 + 22, north + 3], [x0 + 52, north], [x1 - 14, north], [x1 - 2, north + 4], [x1, mark.z - 6],
    [x1, mark.z + 6], [x1 - 2, south - 4], [x1 - 14, south], [x0 + 52, south], [x0 + 22, south - 3],
  ];
  props.prism(hull, -10, -0.6, ANTIFOULING, { capTop: false });
  props.prism(hull, -0.6, deck - 0.45, NAVY, { capTop: false });
  props.prism(hull, deck - 0.45, deck, WHITE, { topColor: 0x5e6e68 });
  const bowDeck = hull.filter((p) => p[0] <= x0 + 30).concat([[x0 + 30, south - 1.5], [x0 + 30, north + 1.5]]);
  props.prism(sortClockwise(bowDeck, x0 + 18, mark.z), deck, deck + 2.4, NAVY, { topColor: 0x5e6e68 });
  props.box(x0 + 14, deck + 8, mark.z, 0.6, 12, 0.6, WHITE);
  props.box(x0 + 14, deck + 11, mark.z, 0.3, 0.3, 6, WHITE);

  // Bridge block, decks banded with windows, and the wings spanning the full beam.
  const bridgeX = x1 - 34;
  props.box(bridgeX, deck + 11.5, mark.z, 14, 23, 20, WHITE);
  for (let y = deck + 3; y < deck + 21; y += 2.9) props.box(bridgeX, y, mark.z, 14.2, 0.9, 20.2, WINDOWS);
  props.box(bridgeX, deck + 22, mark.z, 10, 2.4, beam + 0.6, WHITE);
  props.box(bridgeX - 5.05, deck + 22.2, mark.z, 0.2, 1.1, beam + 0.4, WINDOWS);
  props.box(bridgeX, deck + 23.6, mark.z, 6, 0.8, 8, WHITE);
  props.box(bridgeX + 2, deck + 27, mark.z, 0.4, 6, 0.4, 0xdddddd);
  // Funnel: amber with a black crown and a white star on each side.
  const funnelX = x1 - 16;
  props.box(funnelX, deck + 13, mark.z, 9, 26, 8, AMBER);
  props.box(funnelX, deck + 26.6, mark.z, 9.1, 1.4, 8.1, 0x1c1c20);
  for (const side of [-1, 1]) {
    const sz = mark.z + side * 4.06;
    props.with(funnelX, deck + 17, sz, 0, 0, Math.PI / 4, () => props.box(0, 0, 0, 2.6, 2.6, 0.06, WHITE));
  }
  props.box(x1 - 6, deck + 1.5, mark.z, 10, 3, 24, WHITE);

  // Hatch covers and the stacked bays from the bow deck to the bridge.
  const slots = [];
  const bays = Math.floor((bridgeX - 9 - (x0 + 34)) / 13.4);
  const rows = 13;
  const pitch = 2.5;
  for (let b = 0; b < bays; b += 1) {
    const bx = x0 + 34 + 6.7 + b * 13.4;
    props.box(bx, deck + 0.25, mark.z, 13, 0.5, rows * pitch + 0.6, 0x6e7a74);
    const crest = 3 + Math.round(2.5 * Math.sin((b / Math.max(1, bays - 1)) * Math.PI));
    for (let r = 0; r < rows; r += 1) {
      const tiers = Math.max(1, crest + rng.int(-1, 1) - (r === 0 || r === rows - 1 ? 1 : 0));
      slots.push({ x: bx, y: deck + 0.5, z: mark.z + (r - (rows - 1) / 2) * pitch, length: 12.2, width: 2.44, tiers, colorIndex: rng.int(0, 5), alongX: true });
    }
  }
  return slots;
}

/** Order a convex polygon's corners clockwise on a north-up map around a centre point. */
function sortClockwise(points, cx, cz) {
  return points.slice().sort((p, q) => Math.atan2(-(p[1] - cz), p[0] - cx) - Math.atan2(-(q[1] - cz), q[0] - cx)).reverse();
}
