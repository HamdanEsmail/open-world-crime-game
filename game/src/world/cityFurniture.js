// Port Sarab's street furniture and greenery, raised in one go: palms and planting, street lamps,
// traffic signals that follow the live phase, benches and the rest of the kerbside kit, the souk's
// awnings and stalls, the Corniche beach, billboards and the stunt ramps. All instanced; lamps, bins,
// hydrants and stalls are solid and break when a car hits them hard enough.
import * as THREE from 'three';
import { createFurnitureMaterials } from './propMaterials.js';
import { createPropInstanceRegistry, createPropInstanceSet } from './propInstancing.js';
import { createStreetPlacementMap } from './streetPlacementMap.js';
import { createPalmTrees } from './palmTrees.js';
import { createStreetSignals } from './streetSignals.js';
import { createStreetLamps } from './streetLamps.js';
import { createStreetProps } from './streetProps.js';
import { createPrintedFaces } from './propPrintAtlas.js';
import { createMarketStalls } from './marketStalls.js';
import { createBeachProps } from './beachProps.js';
import { createBillboards } from './billboards.js';
import { createStuntRamps } from './stuntRamps.js';
import { createPropBreaking } from './propBreaking.js';

/**
 * Build every piece of street furniture from game.city, game.roads, game.terrain and game.colliders,
 * add it to game.scene and return game.cityFurniture:
 *   update(dt)    sway, night glow, live signals, falling props, refills what is near the camera
 *   refresh()     refill every set for the camera's current place now (after a camera jump)
 *   stats()       copies per kind, draw calls, triangles, colliders and glows
 *   placements()  [{kind, x, z, radius}] every footprint on the ground, for checks
 */
export function createCityFurniture(game) {
  const group = new THREE.Group();
  group.name = 'city-furniture';
  game.scene.add(group);
  const materials = createFurnitureMaterials(game);
  const registry = createPropInstanceRegistry(game);
  const map = createStreetPlacementMap(game);
  const owner = { name: 'city-furniture' };
  const allRecords = [];
  const glowRecords = [];
  const staticMeshes = [];
  const updaters = [];
  let colliderCount = 0;
  let glowCount = 0;
  let glowsRegistered = false;

  const kit = {
    game,
    group,
    materials,
    registry,
    map,
    owner,
    /** A seeded stream of its own for each part of the furniture. */
    rng: (label) => game.rng.fork(`furniture-${label}`),
    /** Ground height under a point. */
    ground: (x, z) => (game.terrain ? game.terrain.heightAt(x, z) : 0),
    /** Make an instanced set of one kind (see createPropInstanceSet) and show it. */
    addSet(options) {
      const set = createPropInstanceSet(options);
      group.add(set.mesh);
      registry.add(set);
      for (const record of options.records) adopt(record);
      return set;
    },
    /** A static mesh that is not instanced (the stunt ramps). */
    addStaticMesh(mesh, triangles) {
      mesh.userData.triangles = triangles;
      staticMeshes.push(mesh);
      group.add(mesh);
      return mesh;
    },
    /** Give a record its collider: spec {type 'post'|'box', x, z, radius | minX..maxZ, y0, y1, kind, breakable}. */
    addCollider(record, spec) {
      adopt(record);
      record.colliderSpec = spec;
      record.collider = addColliderFromSpec(spec, record);
      return record.collider;
    },
    /** Give a record its night glows: [{x, y, z, color, size, flicker?}] in world space. */
    addGlows(record, specs) {
      adopt(record);
      record.glowSpecs = specs;
      glowRecords.push(record);
    },
    /** Run a function every frame (live signals, falling props). */
    onUpdate(fn) {
      updaters.push(fn);
    },
    addColliderFromSpec,
  };

  function adopt(record) {
    if (record.owner === owner) return;
    record.owner = owner;
    allRecords.push(record);
  }

  function addColliderFromSpec(spec, record) {
    const colliders = game.colliders;
    if (!colliders) return null;
    colliderCount += 1;
    if (spec.type === 'box') {
      return colliders.addBox({ minX: spec.minX, minZ: spec.minZ, maxX: spec.maxX, maxZ: spec.maxZ, y0: spec.y0, y1: spec.y1, kind: spec.kind, breakable: !!spec.breakable, ref: record });
    }
    return colliders.addPost({ x: spec.x, z: spec.z, radius: spec.radius, y0: spec.y0, y1: spec.y1, kind: spec.kind, breakable: !!spec.breakable, ref: record });
  }

  // Order matters only for who gets the ground first: signals and lamps, then street palms, then the
  // kerbside kit, the souk, the beach, billboards and ramps, and last the gardens and lots.
  const roadNames = [...game.city.avenues.map((a) => a.name), ...game.city.streets.map((s) => s.name)];
  const palms = createPalmTrees(game, kit);
  const printed = createPrintedFaces(game, kit, roadNames);
  const billboards = createBillboards(game, kit);
  const ramps = createStuntRamps(game, kit);
  const signals = createStreetSignals(game, kit);
  const lamps = createStreetLamps(game, kit);
  palms.placeStreetPalms();
  const props = createStreetProps(game, kit, palms, printed, billboards);
  const market = createMarketStalls(game, kit, printed);
  const beach = createBeachProps(game, kit, printed);
  billboards.place();
  palms.placeGardensAndLots();
  palms.finish();
  billboards.finish();
  printed.finish();
  const breaking = createPropBreaking(game, kit);
  kit.onUpdate((dt) => breaking.update(dt));
  registry.update(true);

  /** Hand every lamp and lantern glow to the effects system in one batch, once it exists. */
  function registerGlows() {
    const glows = game.effects && game.effects.glows;
    if (!glows || typeof glows.addBatch !== 'function') return;
    glowsRegistered = true;
    const specs = [];
    const owners = [];
    for (const record of glowRecords) {
      if (record.hidden) continue;
      for (const spec of record.glowSpecs) {
        specs.push({ x: spec.x, y: spec.y, z: spec.z, color: spec.color, size: spec.size, intensity: spec.intensity, flicker: spec.flicker || 0, nightOnly: true });
        owners.push(record);
      }
    }
    const handles = glows.addBatch(specs) || [];
    for (let i = 0; i < owners.length; i += 1) {
      const record = owners[i];
      if (!record.glows) record.glows = [];
      if (handles[i]) record.glows.push(handles[i]);
    }
    glowCount = handles.length;
  }

  const furniture = {
    group,
    map,
    materials,
    registry,
    palms,
    signals,
    lamps,
    props,
    market,
    beach,
    billboards,
    ramps,
    breaking,
    get colliderCount() {
      return colliderCount;
    },

    /** Sway, night glow, live signals and falling props; refill the sets near the camera. */
    update(dt) {
      materials.update(dt);
      registry.update(false);
      for (let i = 0; i < updaters.length; i += 1) updaters[i](dt);
      if (!glowsRegistered) registerGlows();
    },

    /** Refill every set for where the camera is now (call after moving the camera in one jump). */
    refresh() {
      registry.update(true);
    },

    /** Copies per kind, what is drawn now, colliders and glows. */
    stats() {
      const s = registry.stats();
      for (const mesh of staticMeshes) {
        if (mesh.visible) {
          s.drawCalls += 1;
          s.triangles += mesh.userData.triangles || 0;
        }
      }
      s.staticMeshes = staticMeshes.length;
      s.colliders = colliderCount;
      s.glows = glowCount;
      s.glowSpecs = glowRecords.reduce((n, r) => n + r.glowSpecs.length, 0);
      s.records = allRecords.length;
      return s;
    },

    /** Every footprint on the ground: [{kind, x, z, radius}]. */
    placements() {
      const out = [];
      for (const record of allRecords) {
        if (record.footprint > 0) out.push({ kind: record.kind, x: record.x, z: record.z, radius: record.footprint });
      }
      return out;
    },

    /** Every record (for tools and checks). */
    records: allRecords,
  };
  return furniture;
}
