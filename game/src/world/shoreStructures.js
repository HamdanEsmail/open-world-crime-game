// The waterfront of Port Sarab: the Marina Crescent promenade and its stone quay, four timber piers,
// two rock-armoured breakwaters with the striped lighthouse Crescent Light on the west arm, and the
// concrete apron of Mina Docks with its crane rails, bollards and fenders under four towering gantry
// cranes. Ground surfaces go to the ground builder; standing structures to the prop builder.
import { SURFACE } from './groundSurfaceAtlas.js';
import { STREET_LEVELS } from './roadSurfaces.js';

const CORAL = 0xe4572e;
const CREAM = 0xfff4d6;
const IRON = 0x2c3038;

/**
 * Lay the marina and the port quay, raise the lighthouse and the cranes.
 * @returns {{ lamp: {x:number, y:number, z:number}, craneLegs: {x:number, z:number, radius:number}[], craneLights: Object[] }}
 */
export function buildShoreStructures(game, ground, props) {
  const city = game.city;
  const rng = game.rng.fork('shore-structures');
  layMarina(game, ground, props, rng);
  layPortQuay(game, ground, props);
  const lighthouse = city.landmarks.find((mark) => mark.kind === 'lighthouse');
  const cranes = city.landmarks.find((mark) => mark.kind === 'portCranes');
  const lamp = lighthouse ? raiseLighthouse(props, lighthouse) : null;
  const craneLegs = [];
  const craneLights = [];
  if (cranes) {
    for (const [px, dz] of cranes.positions || [[cranes.x, 0]]) {
      const offsetX = cranes.x + px;
      const x = offsetX > city.coast.port.minX && offsetX < city.coast.port.maxX ? offsetX : px;
      const z = cranes.z + dz;
      raiseGantryCrane(props, x, z, cranes.h, craneLegs, craneLights);
    }
  }
  return { lamp, craneLegs, craneLights };
}

/** The marina: promenade and quay wall, basin floor, piers on piles, breakwaters with rock armour. */
function layMarina(game, ground, props, rng) {
  const terrain = game.terrain;
  const marina = game.city.coast.marina;
  const bw = marina.breakwaterHalfWidth;
  const west = marina.minX - bw;
  const east = marina.maxX + bw;
  const top = marina.maxZ;
  const corniche = game.city.streets[0];
  const promenadeEnd = corniche.z - game.city.roadKinds[corniche.kind].width / 2 - game.city.roadKinds.street.sidewalk;
  // The promenade, piers and breakwaters stand where game.terrain puts them, the basin floor below.
  const WALK = terrain.baseHeightAt((west + east) / 2, (top + promenadeEnd) / 2);
  const floor = terrain.baseHeightAt((marina.minX + marina.maxX) / 2 + 20, (marina.minZ + top) / 2);
  // Promenade: pale stone with a teak boardwalk along the water's edge.
  ground.rect('base', west, top, east, promenadeEnd, WALK, SURFACE.GRANITE, { tint: 0xfff8ec, scale: 0.55, jitter: 0.05, cell: 40 });
  ground.rect('paint', marina.minX + bw, top, marina.maxX - bw, top + 4.5, WALK + 0.012, SURFACE.DECKING, { tint: 0xfff0e2, jitter: 0.06, cell: 30 });
  for (let x = west + 10; x < east - 6; x += 24) {
    ground.ring('paint', x, top + 14, 0, 2.2, 0, Math.PI * 2, WALK + 0.012, SURFACE.ZELLIGE, { tint: 0xffffff, step: 1.2 });
  }
  // The basin: a sand floor and stone quay walls with a dark wet band below the waterline.
  ground.rect('base', marina.minX + bw, marina.minZ, marina.maxX - bw, top, floor, SURFACE.SAND, { tint: 0x7cc4c0, jitter: 0.1, cell: 40 });
  quayWall(ground, marina.minX + bw, top, marina.maxX - bw, top, 0, 1, floor, WALK);
  quayWall(ground, marina.minX + bw, marina.minZ, marina.minX + bw, top, 1, 0, floor, WALK);
  quayWall(ground, marina.maxX - bw, marina.minZ, marina.maxX - bw, top, -1, 0, floor, WALK);
  wallFace(ground, marina.minX + bw, marina.minZ, marina.maxX - bw, marina.minZ, 0, -1, -6.6, floor, 0x5a7a78);
  // Breakwaters: concrete walkway, a low parapet on the seaward side, rock armour below.
  for (const [x0, x1, seaward] of [[west, marina.minX + bw, -1], [marina.maxX - bw, east, 1]]) {
    ground.rect('base', x0, marina.minZ, x1, top, WALK, SURFACE.CONCRETE, { tint: 0xece6da, scale: 0.4, jitter: 0.06, cell: 40 });
    const edge = seaward < 0 ? x0 : x1;
    const parapetX0 = seaward < 0 ? x0 : x1 - 0.7;
    ground.box('solid', parapetX0, marina.minZ + 2, parapetX0 + 0.7, top - 1, WALK, WALK + 0.75, SURFACE.CONCRETE, SURFACE.CONCRETE, { tint: 0xf2ece2, jitter: 0.05 });
    seaFace(ground, terrain, edge, marina.minZ, edge, promenadeEnd, seaward, WALK);
    wallFace(ground, x0, marina.minZ, x1, marina.minZ, 0, -1, -6.8, WALK, 0xd8d0c4);
    for (let z = marina.minZ + 1; z < top + 20; z += rng.range(2.6, 3.6)) {
      const r = rng.range(1.3, 2.1);
      props.boulder(edge + seaward * rng.range(0.6, 2.2), Math.min(terrain.baseHeightAt(edge + seaward * 2, z), -0.2) + r * 0.25, z, r, rng.pick([0xb8aa96, 0xa89a88, 0xc4b6a0]), rng);
    }
    for (let k = 0; k < 7; k += 1) {
      const angle = Math.PI * (0.5 + k / 6) * -seaward;
      const r = rng.range(1.5, 2.3);
      props.boulder((x0 + x1) / 2 + Math.sin(angle) * 8, -1.2, marina.minZ - 1 + Math.cos(angle) * 3.5 - 2, r, 0xa89a88, rng);
    }
    for (let z = marina.minZ + 8; z < top - 4; z += 16) bollard(props, seaward < 0 ? x1 - 0.6 : x0 + 0.6, WALK, z);
  }
  // Piers: teak decks on dark piles, with cleats along both edges.
  for (const px of marina.piers) {
    const hw = marina.pierHalfWidth;
    ground.rect('base', px - hw, marina.pierEndZ, px + hw, top, WALK, SURFACE.DECKING, { tint: 0xfff2e6, jitter: 0.08, cell: 20 });
    for (const [x, sign] of [[px - hw, -1], [px + hw, 1]]) wallFace(ground, x, marina.pierEndZ, x, top, sign, 0, -0.35, WALK, 0x8a6448);
    wallFace(ground, px - hw, marina.pierEndZ, px + hw, marina.pierEndZ, 0, -1, -0.35, WALK, 0x8a6448);
    for (let z = marina.pierEndZ + 1; z < top - 1; z += 4.5) {
      props.box(px - hw + 0.25, -2.6, z, 0.35, 4.6, 0.35, 0x4a3628);
      props.box(px + hw - 0.25, -2.6, z, 0.35, 4.6, 0.35, 0x4a3628);
    }
    for (let z = marina.pierEndZ + 6; z < top - 4; z += 12) {
      props.box(px - hw + 0.3, WALK + 0.12, z, 0.25, 0.24, 0.7, 0x30343a);
      props.box(px + hw - 0.3, WALK + 0.12, z, 0.25, 0.24, 0.7, 0x30343a);
    }
  }
}

/** The quay apron of Mina Docks: concrete at road level, crane rails, yellow lines, bollards and fenders. */
function layPortQuay(game, ground, props) {
  const terrain = game.terrain;
  const port = game.city.coast.port;
  const corniche = game.city.streets[0];
  const back = corniche.z - game.city.roadKinds[corniche.kind].width / 2 - game.city.roadKinds.street.sidewalk;
  const edge = port.edgeZ;
  const y = STREET_LEVELS.road;
  ground.rect('base', port.minX, edge, port.maxX, back, y, SURFACE.CONCRETE, { tint: 0xd6d2cc, jitter: 0.1, cell: 40 });
  const paint = y + 0.012;
  const yellow = { tint: 0xf2c230, jitter: 0.03 };
  ground.rect('paint', port.minX + 2, edge + 0.8, port.maxX - 2, edge + 1.1, paint, SURFACE.PAINT, yellow);
  for (const rail of [edge + 6, edge + 38]) {
    ground.rect('paint', port.minX + 1, rail - 0.6, port.maxX - 1, rail + 0.6, paint - 0.006, SURFACE.CONCRETE, { tint: 0xf2efe8, jitter: 0.03, scale: 0.3 });
    ground.rect('paint', port.minX + 1, rail - 0.08, port.maxX - 1, rail + 0.08, paint, SURFACE.KERB, { tint: 0x6a6e76, jitter: 0.02, scale: 0.4 });
  }
  for (const lane of [edge + 52, edge + 70, edge + 88]) {
    for (let x = port.minX + 6; x < port.maxX - 8; x += 9) ground.rect('paint', x, lane - 0.1, x + 4.5, lane + 0.1, paint, SURFACE.PAINT, yellow);
  }
  for (let x = port.minX + 30; x < port.maxX - 30; x += 60) {
    for (let k = 0; k < 6; k += 1) ground.bar('paint', x - 6 + k * 2.4, edge + 12, x - 3 + k * 2.4, edge + 18, 0.5, paint, SURFACE.PAINT, yellow);
  }
  wallFace(ground, port.minX, edge, port.maxX, edge, 0, -1, -8.7, y, 0xcac4ba);
  seaFace(ground, terrain, port.minX, edge, port.minX, back, -1, y);
  seaFace(ground, terrain, port.maxX, edge, port.maxX, back, 1, y);
  for (let x = port.minX + 10; x < port.maxX - 5; x += 20) {
    bollard(props, x, y, edge + 1.8);
    props.box(x + 10, -1.2, edge - 0.35, 2.2, 2.6, 0.7, 0x24262a);
  }
}

/** The lighthouse Crescent Light: a red-and-white banded tower, gallery, glazed lamp room and red dome. */
function raiseLighthouse(props, mark) {
  const { x, z } = mark;
  const h = mark.h || 38;
  props.cylinder(x, -1.5, z, 6.2, 6.2, 1.65, 12, 0xe8e0d0, { capTop: true });
  props.cylinder(x, 0.15, z, 4.4, 4.2, 2.4, 10, 0xf4efe6, { capTop: true });
  props.box(x + 4.4, 1.35, z, 1.2, 2.2, 1.6, 0x3a6070);
  const towerTop = h * 0.79;
  const bands = 7;
  for (let k = 0; k < bands; k += 1) {
    const y0 = 2.5 + ((towerTop - 2.5) * k) / bands;
    const y1 = 2.5 + ((towerTop - 2.5) * (k + 1)) / bands;
    const r0 = 3.5 - (1.1 * (y0 - 2.5)) / (towerTop - 2.5);
    const r1 = 3.5 - (1.1 * (y1 - 2.5)) / (towerTop - 2.5);
    props.cylinder(x, y0, z, r0, r1, y1 - y0, 16, k % 2 === 0 ? 0xfbf7f0 : 0xd8432e);
    if (k % 2 === 1) props.box(x - r0 * 0.98, (y0 + y1) / 2, z, 0.1, 0.9, 0.7, 0x2a4450);
  }
  props.cylinder(x, towerTop, z, 3.7, 3.7, 0.35, 16, 0x30363e, { capTop: true, capBottom: true });
  for (let k = 0; k < 16; k += 1) {
    const angle = (k / 16) * Math.PI * 2;
    props.box(x + Math.sin(angle) * 3.5, towerTop + 0.85, z + Math.cos(angle) * 3.5, 0.08, 1.0, 0.08, 0x30363e);
  }
  props.cylinder(x, towerTop + 1.3, z, 3.55, 3.55, 0.08, 16, 0x30363e);
  props.cylinder(x, towerTop + 0.35, z, 2.1, 2.1, 0.5, 12, 0x30363e);
  props.cylinder(x, towerTop + 0.85, z, 2.0, 2.0, 3.6, 12, 0x9fe4f0);
  for (let k = 0; k < 6; k += 1) {
    const angle = (k / 6) * Math.PI * 2;
    props.box(x + Math.sin(angle) * 2.02, towerTop + 2.65, z + Math.cos(angle) * 2.02, 0.12, 3.6, 0.12, 0x30363e);
  }
  props.cylinder(x, towerTop + 4.45, z, 2.4, 0.2, 2.6, 12, 0xc8402c);
  props.cylinder(x, towerTop + 7.0, z, 0.12, 0.05, 1.4, 4, 0x30363e);
  return { x, y: towerTop + 2.6, z };
}

/**
 * A ship-to-shore gantry crane straddling the quay rails: coral legs and portal, a cream boom reaching
 * out over the water past the berth, an A-frame apex with stays, machinery house, trolley and spreader.
 */
function raiseGantryCrane(props, x, z, height, legs, lights) {
  const rails = [z - 16, z + 16];
  const portal = height * 0.62;
  const boomY = portal + 2.5;
  const apex = height;
  const reachZ = z - 108;
  const backZ = z + 34;
  for (const lz of rails) {
    for (const lx of [x - 9, x + 9]) {
      props.box(lx, portal / 2, lz, 1.5, portal, 1.5, CORAL);
      props.box(lx, 0.9, lz, 2.2, 1.8, 3.6, 0x3a3e46);
      legs.push({ x: lx, z: lz, radius: 1.1 });
    }
  }
  for (const lx of [x - 9, x + 9]) {
    props.box(lx, portal, z, 1.8, 2.2, 34, CORAL);
    props.box(lx, 2.6, z, 1.2, 1.4, 34, CORAL);
    props.beam(lx, 3.2, rails[0], lx, portal - 1, rails[1], 0.7, CORAL);
  }
  for (const lz of rails) props.box(x, portal, lz, 19.8, 2.2, 1.8, CORAL);
  for (const bx of [x - 3.2, x + 3.2]) {
    props.box(bx, boomY, (reachZ + backZ) / 2, 1.1, 2.6, backZ - reachZ, CREAM);
    props.box(bx, boomY + 1.6, (reachZ + backZ) / 2, 0.5, 0.6, backZ - reachZ, 0xe8dcc0);
  }
  for (let bz = reachZ + 6; bz < backZ; bz += 12) props.box(x, boomY - 1.1, bz, 7.4, 0.4, 0.4, CREAM);
  for (const ax of [x - 3.2, x + 3.2]) {
    props.beam(ax, portal + 1, rails[0], ax, apex, z - 4, 0.9, CORAL);
    props.beam(ax, portal + 1, rails[1], ax, apex, z - 4, 0.9, CORAL);
    props.beam(ax, apex, z - 4, ax, boomY + 1.2, reachZ + 4, 0.35, 0x4a4e56);
    props.beam(ax, apex, z - 4, ax, boomY + 1.2, reachZ + 40, 0.3, 0x4a4e56);
    props.beam(ax, apex, z - 4, ax, boomY + 1.2, backZ - 2, 0.35, 0x4a4e56);
  }
  props.box(x, apex + 0.6, z - 4, 8, 1.2, 1.4, CORAL);
  props.box(x, boomY + 3.2, backZ - 7, 9, 4.2, 10, 0xf6f2ea, { topColor: 0xd8d2c6 });
  props.box(x, boomY + 3.2, backZ - 1.9, 9.05, 0.6, 0.2, CORAL);
  const trolleyZ = z - 72;
  props.box(x, boomY - 1.8, trolleyZ, 8, 1.6, 4, 0x3a3e46);
  props.box(x, boomY - 6, trolleyZ - 2, 1.6, 2.4, 1.8, 0xf4f0e6);
  for (const cx of [x - 2.5, x + 2.5]) props.beam(cx, boomY - 2.6, trolleyZ, cx, 20.6, trolleyZ, 0.12, IRON);
  props.box(x, 20, trolleyZ, 13, 1.2, 2.8, 0xf2c230);
  lights.push({ x, y: apex + 1.4, z: z - 4 }, { x, y: boomY + 1, z: reachZ + 1 });
}

/** A mooring bollard: a squat iron post with a mushroom cap. */
function bollard(props, x, y, z) {
  props.cylinder(x, y, z, 0.32, 0.26, 0.6, 6, IRON);
  props.cylinder(x, y + 0.6, z, 0.42, 0.42, 0.14, 6, IRON, { capTop: true });
}

/** A vertical stone quay face from the walk down to the floor, pale above the water, dark and wet below. */
function quayWall(ground, x0, z0, x1, z1, nx, nz, floor, top) {
  wallFace(ground, x0, z0, x1, z1, nx, nz, -1.25, top, 0xe2d8c6);
  wallFace(ground, x0, z0, x1, z1, nx, nz, floor - 0.2, -1.25, 0x5c6e64);
}

/** The outer face of a quay or breakwater dropping to the beach or sea floor beside it. */
function seaFace(ground, terrain, x0, z0, x1, z1, outX, top) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8));
  for (let i = 0; i < steps; i += 1) {
    const ax = x0 + ((x1 - x0) * i) / steps;
    const az = z0 + ((z1 - z0) * i) / steps;
    const bx = x0 + ((x1 - x0) * (i + 1)) / steps;
    const bz = z0 + ((z1 - z0) * (i + 1)) / steps;
    const bottom = Math.min(terrain.baseHeightAt(ax + outX * 1.5, az), terrain.baseHeightAt(bx + outX * 1.5, bz)) - 0.8;
    wallFace(ground, ax, az, bx, bz, outX, 0, bottom, top, 0xd8cebe);
  }
}

/** A plain vertical face between two points, facing (nx, nz). */
function wallFace(ground, x0, z0, x1, z1, nx, nz, bottom, top, tint) {
  const fx = z1 - z0;
  const fz = -(x1 - x0);
  const options = { tint, jitter: 0.06, shadeBottom: 0.75 };
  if (fx * nx + fz * nz >= 0) ground.face('base', x0, z0, x1, z1, bottom, top, bottom, top, SURFACE.CONCRETE, options);
  else ground.face('base', x1, z1, x0, z0, bottom, top, bottom, top, SURFACE.CONCRETE, options);
}
