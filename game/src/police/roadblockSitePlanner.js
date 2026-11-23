// Where PSPD puts its next roadblock: it walks the lanes ahead of the fleeing driver (straight on
// first, then one turn either way) to points 250 to 400 m out on a straight stretch, clear of
// junctions and of other cars, and keeps only a spot the driver cannot see right now: outside the
// camera's view or hidden behind buildings. A roadblock never appears before the player's eyes.
import * as THREE from 'three';
import { ROADBLOCK_NEAREST as MIN_AHEAD, ROADBLOCK_FARTHEST as MAX_AHEAD } from './policeHeavyResponseRules.js';

const SPACING = 28;
const END_CLEARANCE = 26;
const MIN_LANE_LENGTH = 70;
const JUNCTION_GAP = 24;
const MAX_CANDIDATES = 28;
const MAX_TURNS = 1;

/**
 * Create the planner. begin() collects candidate spots ahead of the player; step() tests a few per
 * frame; when it reports 'found', `site` holds the lane, its parameter t and the point.
 */
export function createRoadblockSitePlanner(game) {
  const candidates = [];
  for (let i = 0; i < MAX_CANDIDATES; i += 1) candidates.push({ lane: null, t: 0, x: 0, z: 0, distance: 0, turns: 0 });
  const site = { lane: null, t: 0, x: 0, z: 0, distance: 0 };
  const frustum = new THREE.Frustum();
  const projectionScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const sightTarget = new THREE.Vector3();
  let count = 0;
  let cursor = 0;
  let headingX = 0;
  let headingZ = 1;
  let avoidX = [];
  let avoidZ = [];
  const sameWay = (lane) => lane.dirX * headingX + lane.dirZ * headingZ > 0.5;
  const otherTraffic = (vehicle) => !(vehicle.tags && vehicle.tags.roadblock) && !vehicle.isPlayer;

  /**
   * Gather candidate spots ahead of a driver at (x, z) moving along (dirX, dirZ). `keepAway` lists
   * {x, z} of roadblocks already standing. Returns false when the driver is not on a road.
   */
  function begin(x, z, dirX, dirZ, keepAway) {
    count = 0;
    cursor = 0;
    const length = Math.hypot(dirX, dirZ) || 1;
    headingX = dirX / length;
    headingZ = dirZ / length;
    avoidX = keepAway ? keepAway.map((p) => p.x) : [];
    avoidZ = keepAway ? keepAway.map((p) => p.z) : [];
    const roads = game.roads;
    if (!roads || !roads.nearestLane) return false;
    const found = roads.nearestLane(x, z, 26, sameWay);
    if (!found) return false;
    walk(found.lane, found.t, 0, 0);
    return count > 0;
  }

  /** Test up to `budget` candidates against the player's view. 'found' | 'failed' | 'pending'. */
  function step(budget) {
    updateFrustum();
    for (let n = 0; n < budget; n += 1) {
      if (cursor >= count) return 'failed';
      const candidate = candidates[cursor];
      cursor += 1;
      if (!isClear(candidate)) continue;
      if (!isHiddenFromPlayer(candidate)) continue;
      copySite(candidate);
      return 'found';
    }
    return cursor >= count ? 'failed' : 'pending';
  }

  /** Stop a plan in progress. */
  function cancel() {
    count = 0;
    cursor = 0;
  }

  /**
   * A site on the lane nearest (x, z) running along `heading`, at that point: for staged scenes and
   * missions that want a roadblock in a chosen place. Returns the site or null.
   */
  function siteAt(x, z, heading) {
    headingX = Math.sin(heading);
    headingZ = Math.cos(heading);
    const found = game.roads && game.roads.nearestLane ? game.roads.nearestLane(x, z, 40, sameWay) : null;
    if (!found) return null;
    site.lane = found.lane;
    site.t = found.t;
    site.x = found.x;
    site.z = found.z;
    site.distance = 0;
    return site;
  }

  /**
   * Depth-first along the lanes from (lane, t), straight on first, collecting spots whose distance
   * along the road lies between 250 and 400 m and that keep clear of both ends of their lane.
   */
  function walk(lane, startT, travelled, turns) {
    if (count >= MAX_CANDIDATES || travelled > MAX_AHEAD) return;
    const length = lane.length;
    const start = startT * length;
    if (length >= MIN_LANE_LENGTH) {
      const first = Math.max(start, END_CLEARANCE, start + MIN_AHEAD - travelled);
      const last = Math.min(length - END_CLEARANCE, start + MAX_AHEAD - travelled);
      for (let s = first; s <= last && count < MAX_CANDIDATES; s += SPACING) {
        const candidate = candidates[count];
        candidate.lane = lane;
        candidate.t = s / length;
        candidate.x = lane.x0 + (lane.x1 - lane.x0) * candidate.t;
        candidate.z = lane.z0 + (lane.z1 - lane.z0) * candidate.t;
        candidate.distance = travelled + s - start;
        candidate.turns = turns;
        count += 1;
      }
    }
    const reached = travelled + length - start + JUNCTION_GAP;
    if (reached > MAX_AHEAD) return;
    for (const wanted of TURN_ORDER) {
      for (let i = 0; i < lane.next.length; i += 1) {
        // One lane per road is enough: a roadblock closes the whole carriageway.
        if (lane.turns[i] !== wanted || lane.next[i].index !== 0) continue;
        const nextTurns = turns + (wanted === 'straight' ? 0 : 1);
        if (nextTurns > MAX_TURNS) continue;
        walk(lane.next[i], 0, reached, nextTurns);
      }
    }
  }

  /** No other car parked or passing on the spot, and well away from roadblocks already standing. */
  function isClear(candidate) {
    for (let i = 0; i < avoidX.length; i += 1) {
      if (Math.hypot(candidate.x - avoidX[i], candidate.z - avoidZ[i]) < 140) return false;
    }
    if (game.vehicles && game.vehicles.nearest(candidate.x, candidate.z, 16, otherTraffic)) return false;
    if (game.terrain && game.terrain.isWater && game.terrain.isWater(candidate.x, candidate.z)) return false;
    return true;
  }

  /** Outside the camera's view, or inside it but behind buildings from every angle across the road. */
  function isHiddenFromPlayer(candidate) {
    sphere.center.set(candidate.x, 1.5, candidate.z);
    sphere.radius = 12;
    if (!frustum.intersectsSphere(sphere)) return true;
    const colliders = game.colliders;
    if (!colliders) return false;
    const eye = game.camera.position;
    const lane = candidate.lane;
    const acrossX = -lane.dirZ;
    const acrossZ = lane.dirX;
    const ground = game.terrain ? game.terrain.heightAt(candidate.x, candidate.z) : 0;
    for (let k = -1; k <= 1; k += 1) {
      sightTarget.set(candidate.x + acrossX * 6 * k, ground + 1.4, candidate.z + acrossZ * 6 * k);
      if (colliders.lineOfSight(eye, sightTarget)) return false;
    }
    return true;
  }

  function copySite(candidate) {
    site.lane = candidate.lane;
    site.t = candidate.t;
    site.x = candidate.x;
    site.z = candidate.z;
    site.distance = candidate.distance;
  }

  function updateFrustum() {
    const camera = game.camera;
    camera.updateMatrixWorld();
    projectionScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionScreen);
  }

  /** Is a point (with a radius) in the camera's view right now? */
  function inView(x, y, z, radius) {
    updateFrustum();
    sphere.center.set(x, y, z);
    sphere.radius = radius;
    return frustum.intersectsSphere(sphere);
  }

  return {
    begin, step, cancel, siteAt, inView, site,
    get candidateCount() { return count; },
  };
}

const TURN_ORDER = ['straight', 'left', 'right'];
