// The kerbside kit of Port Sarab placed street by street: hydrants, bins, benches, parking meters,
// newspaper boxes, bike racks, planters, glass bus shelters on the boulevards, bollards along the
// plazas, and street-name blades on every corner carrying the real names. Clean modern kit in the
// rich districts, mismatched painted drums and plank benches in Al Wadi Flats, Southgate and the docks.
import { createPropRecord } from './propInstancing.js';
import { propBreaksUnderImpact } from './streetFurnitureRules.js';
import {
  buildModernBench, buildRoughBench, buildModernBin, buildDrumBin, buildHydrant, buildBollard,
  buildBusShelter, buildNameSignPole, buildParkingMeter, buildNewsBox, buildBikeRack, buildPlanter,
} from './streetPropModels.js';

/** Each kind: model, draw distance, shadow, collider (post radius or box half-size). How it falls is a rule. */
const KINDS = {
  benchModern: { build: buildModernBench, range: 130, box: [0.98, 0.32], height: 0.9, collider: 'bench' },
  benchRough: { build: buildRoughBench, range: 130, box: [0.95, 0.25], height: 0.5, collider: 'bench' },
  binModern: { build: buildModernBin, range: 110, radius: 0.27, height: 1.0, collider: 'bin' },
  binDrum: { build: buildDrumBin, range: 110, radius: 0.3, height: 1.0, collider: 'bin' },
  hydrant: { build: buildHydrant, range: 100, radius: 0.18, height: 0.9, collider: 'hydrant', water: true },
  bollard: { build: buildBollard, range: 120, radius: 0.12, height: 1.0, collider: 'bollard' },
  busShelter: { build: buildBusShelter, range: 260, box: [2.15, 0.85], height: 2.8, collider: 'shelter', shadow: true },
  nameSign: { build: buildNameSignPole, range: 140, radius: 0.08, height: 3.6, collider: 'streetSign' },
  parkingMeter: { build: buildParkingMeter, range: 90, radius: 0.08, height: 1.4, collider: 'parkingMeter' },
  newsBox: { build: buildNewsBox, range: 100, box: [0.27, 0.24], height: 1.1, collider: 'newsBox' },
  bikeRack: { build: buildBikeRack, range: 90, box: [0.72, 0.38], height: 0.9, collider: 'bikeRack' },
  planter: { build: buildPlanter, range: 150, box: [1.22, 0.52], height: 0.7, collider: 'planter' },
};

const MODERN = new Set(['spires', 'marina', 'lantern', 'jasmine']);
const ROUGH = new Set(['wadi', 'southgate', 'docks']);
const DRUM_TINTS = [0x2e6fb0, 0x2f8a4e, 0xb5482a, 0xd9a520, 0x5a6a78, 0x8a3a6a];
const PLANK_TINTS = [0x6aa6c8, 0xd96a3a, 0x7bbf6a, 0xe9c46a, 0xb07a48, 0x9a8acb];
const NEWS_TINTS = [0xd7263d, 0x1b4f9c, 0xf2b705, 0x2a9d6f, 0xffffff];
const PLANTER_TINTS = [0xf0e2c4, 0xd8c09a, 0xc86f4a];

/**
 * Place the kerbside kit along every sidewalk run and at every junction. `palms` plants the flowers
 * in the planters; `printed` prints the street names; `billboards` prints the shelter adverts.
 */
export function createStreetProps(game, kit, palms, printed, billboards) {
  const rng = kit.rng('street-props');
  const map = kit.map;
  const city = game.city;
  const lists = {};
  for (const kind of Object.keys(KINDS)) lists[kind] = [];
  const point = { x: 0, z: 0, heading: 0 };

  for (const run of map.sidewalkRuns) furnishRun(run);
  placeNameSigns();
  placePlazaBollards();

  for (const kind of Object.keys(KINDS)) {
    const spec = KINDS[kind];
    kit.addSet({ name: kind, geometry: spec.build(), material: kit.materials.prop, records: lists[kind], maxRange: spec.range, castShadow: !!spec.shadow });
  }

  /** One side of one road segment, furnished in its district's style. */
  function furnishRun(run) {
    const district = run.district ? run.district.id : '';
    const style = MODERN.has(district) ? 'modern' : ROUGH.has(district) ? 'rough' : 'old';
    const length = run.to - run.from;
    if (length < 12) return;
    const boulevard = run.kind === 'boulevard';
    if (!run.outer && rng.chance(0.75)) {
      put('hydrant', run, run.from + rng.range(2, 6), 0.55, 0, { color: style === 'rough' ? 0xc85a3c : 0xe4572e });
    }
    for (let along = run.from + rng.range(8, 16); along < run.to - 4; along += rng.range(38, 52)) {
      if (style === 'modern') put('binModern', run, along, 0.62, 0, { color: district === 'jasmine' ? 0x2f6b4f : 0x2b5f66 });
      else put('binDrum', run, along, 0.65, 0, { color: rng.pick(DRUM_TINTS) });
    }
    const benchStep = style === 'modern' ? 46 : style === 'old' ? 38 : 64;
    for (let along = run.from + rng.range(14, 26); along < run.to - 6; along += benchStep + rng.range(-6, 8)) {
      if (style === 'rough' && rng.chance(0.4)) continue;
      if (style === 'modern') put('benchModern', run, along, 4.35, 0, { color: 0xffffff });
      else put('benchRough', run, along, 4.35, 0, { color: rng.pick(PLANK_TINTS) });
    }
    if (run.kind === 'street' && style !== 'old' && district !== 'jasmine') {
      for (let along = run.from + 20; along < run.to - 16; along += 15) {
        if (rng.chance(0.45)) put('parkingMeter', run, along, 0.4, 0, { color: style === 'modern' ? 0x1b6f8a : 0x5f6f60 });
      }
    }
    if (style !== 'old' && district !== 'jasmine' && rng.chance(0.55)) {
      const along = run.from + 2.5;
      put('newsBox', run, along, 4.4, 0, { color: rng.pick(NEWS_TINTS) });
      if (rng.chance(0.5)) put('newsBox', run, along + 0.62, 4.4, 0, { color: rng.pick(NEWS_TINTS) });
    }
    if (style === 'modern' && district !== 'jasmine' && rng.chance(0.45)) put('bikeRack', run, run.from + length * rng.range(0.3, 0.7), 1.0, 0, {});
    if (style === 'modern' && boulevard && run.name !== 'The Corniche') {
      for (let along = run.from + 12; along < run.to - 8; along += 24) placePlanter(run, along);
    } else if (district === 'lantern' || (district === 'spires' && rng.chance(0.5))) {
      for (let along = run.from + 20; along < run.to - 14; along += 40) placePlanter(run, along);
    }
    if (boulevard && !run.outer && length > 80 && rng.chance(0.6)) {
      const along = run.from + length * rng.range(0.38, 0.62);
      const shelter = put('busShelter', run, along, 3.55, 0, { color: district === 'spires' || district === 'marina' ? 0x1ba39c : rng.pick([0x1ba39c, 0xe4572e, 0xe9b44c]) });
      if (shelter && billboards) {
        map.runPoint(run, along, 3.55, point);
        const yaw = point.heading;
        const back = -0.69;
        shelter.linked = [billboards.addAdvert(point.x + Math.sin(yaw) * back, shelter.y + 2.0, point.z + Math.cos(yaw) * back, yaw, 3.4, 0.85, undefined, 260)];
      }
    }
  }

  function placePlanter(run, along) {
    const planter = put('planter', run, along, 1.3, 0, { color: rng.pick(PLANTER_TINTS) });
    if (planter && palms) {
      planter.linked = [palms.plantFlowerBed(planter.x, planter.y + 0.48, planter.z, planter.yaw, 0.95)];
    }
  }

  /**
   * One prop of `kind` on `run`, `along` it and `offset` in from the kerb, facing the road (turned by
   * `turn`). options: color, claim (radius). Returns the record, or null where the ground is taken.
   */
  function put(kind, run, along, offset, turn, options) {
    if (along < run.from || along > run.to || map.inSpan(run, along, 1.2)) return null;
    map.runPoint(run, along, offset, point);
    return putAt(kind, point.x, point.z, point.heading + turn, options);
  }

  function putAt(kind, x, z, yaw, options = {}) {
    const spec = KINDS[kind];
    if (!claimFootprint(spec, x, z, yaw, options.claim)) return null;
    const y = kit.ground(x, z);
    const record = createPropRecord({ kind, x, y, z, yaw, color: options.color, footprint: spec.box ? Math.min(spec.box[0], spec.box[1]) : spec.radius });
    const fall = propBreaksUnderImpact(kind);
    record.def = { fall, height: spec.height, water: !!spec.water };
    const breakable = fall !== 'solid';
    if (spec.box) {
      const quarter = Math.abs(Math.sin(yaw)) > 0.7;
      const hx = quarter ? spec.box[1] : spec.box[0];
      const hz = quarter ? spec.box[0] : spec.box[1];
      kit.addCollider(record, { type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, y0: y, y1: y + spec.height, kind: spec.collider, breakable });
    } else {
      kit.addCollider(record, { type: 'post', x, z, radius: spec.radius, y0: y, y1: y + spec.height, kind: spec.collider, breakable });
    }
    lists[kind].push(record);
    return record;
  }

  /**
   * Take the ground under a prop: one circle for a round or squat prop, a row of circles down the
   * long side of a bench, a shelter or a planter, so neighbours can stand close without overlapping.
   */
  function claimFootprint(spec, x, z, yaw, override) {
    if (override) return map.claim(x, z, override);
    if (!spec.box) return map.claim(x, z, spec.radius + 0.25);
    const [hx, hz] = spec.box;
    const long = Math.max(hx, hz);
    const short = Math.min(hx, hz);
    const radius = short + 0.15;
    const count = long > short * 1.6 ? Math.ceil((long - short) / radius) + 1 : 1;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const spots = [];
    for (let k = 0; k < count; k += 1) {
      const l = count === 1 ? 0 : (-1 + (2 * k) / (count - 1)) * (long - short);
      const lx = hx >= hz ? l : 0;
      const lz = hx >= hz ? 0 : l;
      const px = x + lx * cos + lz * sin;
      const pz = z - lx * sin + lz * cos;
      if (!map.isFree(px, pz, radius)) return false;
      spots.push(px, pz);
    }
    for (let k = 0; k < spots.length; k += 2) map.take(spots[k], spots[k + 1], radius);
    return true;
  }

  /** A name pole on one or two corners of every junction, its blades printed with both road names. */
  function placeNameSigns() {
    const urban = city.urban;
    for (const node of game.roads.nodes) {
      if (!(node.halfNS > 0)) continue;
      const avenue = city.avenues.find((a) => a.x === node.x);
      const street = city.streets.find((s) => s.z === node.z);
      if (!avenue || !street) continue;
      const corners = node.halfNS > 10 || node.halfEW > 10 ? [[1, 1], [-1, -1]] : (node.id % 2 ? [[1, -1]] : [[-1, 1]]);
      for (const [sx, sz] of corners) {
        let cx = sx;
        let cz = sz;
        if (node.z + cz * 20 < urban.minZ || node.z + cz * 20 > urban.maxZ) cz = -cz;
        if (node.x + cx * 20 < urban.minX || node.x + cx * 20 > urban.maxX) cx = -cx;
        const x = node.x + cx * (node.halfNS + 4.1);
        const z = node.z + cz * (node.halfEW + 4.1);
        // Turn the pole so both blades reach out over the corner toward the junction.
        const yaw = cx > 0 ? (cz > 0 ? Math.PI : -Math.PI / 2) : (cz > 0 ? Math.PI / 2 : 0);
        const sign = putAt('nameSign', x, z, yaw, { claim: 0.45 });
        if (!sign || !printed) continue;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const world = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
        // Blade A runs along local X; blade B along local Z. Each shows the name of the road it parallels.
        const bladeAlongWorldX = Math.abs(cos) > 0.5;
        const nameA = bladeAlongWorldX ? street.name : avenue.name;
        const nameB = bladeAlongWorldX ? avenue.name : street.name;
        const [ax1, az1] = world(0.8, 0.026);
        const [ax2, az2] = world(0.8, -0.026);
        const [bx1, bz1] = world(0.026, 0.8);
        const [bx2, bz2] = world(-0.026, 0.8);
        sign.linked = [
          printed.addStreetName(nameA, ax1, sign.y + 3.2, az1, yaw),
          printed.addStreetName(nameA, ax2, sign.y + 3.2, az2, yaw + Math.PI),
          printed.addStreetName(nameB, bx1, sign.y + 2.84, bz1, yaw + Math.PI / 2),
          printed.addStreetName(nameB, bx2, sign.y + 2.84, bz2, yaw - Math.PI / 2),
        ];
      }
    }
  }

  /** Steel bollards along the street edges of the plazas, every couple of metres. */
  function placePlazaBollards() {
    for (const lot of city.openLots) {
      if (lot.use !== 'plaza' && lot.use !== 'spirePlaza' && lot.use !== 'palmCourt') continue;
      const block = city.blocks[lot.block];
      if (!block) continue;
      for (const edge of ['n', 's', 'w', 'e']) {
        for (const run of map.runsBesideBlockEdge(block, edge)) {
          const alongX = run.alongX;
          const from = Math.max(run.from, alongX ? lot.x0 : lot.z0) + 1.5;
          const to = Math.min(run.to, alongX ? lot.x1 : lot.z1) - 1.5;
          for (let along = from; along <= to; along += 2.4) {
            if (map.inSpan(run, along, 0.5)) continue;
            put('bollard', run, along, 4.6, 0, { color: lot.use === 'spirePlaza' ? 0x30343a : 0x8f979c, claim: 0.3 });
          }
        }
      }
    }
  }

  return { lists, kinds: KINDS };
}
