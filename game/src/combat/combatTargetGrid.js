// Who and what stands where in this frame of a fight: every person and vehicle of Port Sarab dropped
// into 8 m cells once a frame, so a bullet only looks at what lies along its path, and a punch, a blast
// or the aim assist only at what is near. Built lazily the first time anyone asks in a frame.

const CELL = 8;
const BUCKETS = 2048;
const BUCKET_MASK = BUCKETS - 1;
/** Bounding radius (m) of a person: covers someone lying on the ground. */
const PERSON_RADIUS = 1.0;

/**
 * Create the grid. Entities are numbered densely each build: people first, then vehicles.
 * @returns {{
 *   refresh: () => void,
 *   gatherNear: (x:number, z:number, radius:number, out:Object[], what?:number) => Object[],
 *   gatherAlongRay: (ox:number, oz:number, dirX:number, dirZ:number, length:number, out:Object[], what?:number) => Object[],
 *   PEOPLE: number, VEHICLES: number, BOTH: number,
 * }}
 */
export function createCombatTargetGrid(game) {
  const head = new Int32Array(BUCKETS).fill(-1);
  let next = new Int32Array(2048);
  let entryDense = new Int32Array(2048);
  let used = 0;
  /** Dense list of this build's entities and their kind (1 person, 2 vehicle). */
  const dense = [];
  let denseKind = new Uint8Array(512);
  let visit = new Int32Array(512);
  let stamp = 1;
  let builtFrame = -1;
  let builtAt = -1;

  /** Rebuild when the frame has moved on since the last build. */
  function refresh() {
    const frame = game.time ? game.time.frame : 0;
    const now = game.time ? game.time.elapsed : 0;
    if (frame === builtFrame && now === builtAt) return;
    builtFrame = frame;
    builtAt = now;
    head.fill(-1);
    used = 0;
    dense.length = 0;
    const people = game.characters && game.characters.list;
    const vehicles = game.vehicles && game.vehicles.list;
    const total = (people ? people.length : 0) + (vehicles ? vehicles.length : 0);
    if (total > denseKind.length) {
      denseKind = new Uint8Array(total * 2);
      visit = new Int32Array(total * 2);
    }
    if (people) {
      for (let i = 0; i < people.length; i += 1) {
        const person = people[i];
        if (!person || !person.pos) continue;
        insert(person, 1, person.pos.x, person.pos.z, PERSON_RADIUS);
      }
    }
    if (vehicles) {
      for (let i = 0; i < vehicles.length; i += 1) {
        const vehicle = vehicles[i];
        if (!vehicle || !vehicle.pos || !vehicle.spec) continue;
        const r = Math.sqrt(vehicle.spec.length * vehicle.spec.length + vehicle.spec.width * vehicle.spec.width) * 0.5 + 0.3;
        insert(vehicle, 2, vehicle.pos.x, vehicle.pos.z, r);
      }
    }
  }

  function insert(entity, kind, x, z, r) {
    const d = dense.length;
    dense.push(entity);
    denseKind[d] = kind;
    visit[d] = 0;
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        if (used === next.length) grow();
        const bucket = bucketOf(cx, cz);
        next[used] = head[bucket];
        entryDense[used] = d;
        head[bucket] = used;
        used += 1;
      }
    }
  }

  function grow() {
    const bigger = new Int32Array(next.length * 2);
    bigger.set(next);
    next = bigger;
    const biggerDense = new Int32Array(entryDense.length * 2);
    biggerDense.set(entryDense);
    entryDense = biggerDense;
  }

  /** People (what = 1), vehicles (2) or both (3) whose cells touch the circle; fills and returns `out`. */
  function gatherNear(x, z, radius, out, what = 3) {
    refresh();
    out.length = 0;
    stamp += 1;
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) collectCell(cx, cz, out, what);
    }
    return out;
  }

  /**
   * Everything whose cells lie along a ray on the ground plane, from (ox, oz) along the unit
   * direction (dirX, dirZ) for `length` metres. A vertical shot gathers its own cell. With `wide`
   * the cells beside the path come too (a cone around the ray, for the aim assist).
   */
  function gatherAlongRay(ox, oz, dirX, dirZ, length, out, what = 3, wide = false) {
    refresh();
    out.length = 0;
    stamp += 1;
    let cx = Math.floor(ox / CELL);
    let cz = Math.floor(oz / CELL);
    const planar = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (planar < 1e-6) {
      collectNeighbourhood(cx, cz, out, what);
      return out;
    }
    const dx = dirX / planar;
    const dz = dirZ / planar;
    const reach = length * planar;
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? CELL / Math.abs(dx) : Infinity;
    const tDeltaZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx) : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz) : Infinity;
    for (let guard = 0; guard < 128; guard += 1) {
      if (wide) collectNeighbourhood(cx, cz, out, what);
      else collectCell(cx, cz, out, what);
      if (tMaxX < tMaxZ) {
        if (tMaxX > reach) break;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        if (tMaxZ > reach) break;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }
    return out;
  }

  function collectNeighbourhood(cx, cz, out, what) {
    for (let ix = -1; ix <= 1; ix += 1) {
      for (let iz = -1; iz <= 1; iz += 1) collectCell(cx + ix, cz + iz, out, what);
    }
  }

  function collectCell(cx, cz, out, what) {
    for (let e = head[bucketOf(cx, cz)]; e !== -1; e = next[e]) {
      const d = entryDense[e];
      if (visit[d] === stamp) continue;
      visit[d] = stamp;
      if ((denseKind[d] & what) === 0) continue;
      out.push(dense[d]);
    }
  }

  return {
    refresh,
    gatherNear,
    gatherAlongRay,
    PEOPLE: 1,
    VEHICLES: 2,
    BOTH: 3,
    get entityCount() { return dense.length; },
  };
}

function bucketOf(cx, cz) {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & BUCKET_MASK;
}
