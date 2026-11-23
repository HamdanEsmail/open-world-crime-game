// Who is where on Port Sarab's streets, as the traffic sees it: every vehicle and every person on
// foot near the player filed under a 12 m cell once a frame, so a driver looking down the road only
// checks what is close to it, never every car and person in the city.

const CELL = 12;
/** Hash table size (a power of two). */
const BUCKETS = 2048;
/** Only things within this distance of the player are filed. */
const FILE_RANGE = 460;
/** Half the length of the longest vehicle: a query reaches this far past its circle. */
const LONGEST_HALF = 6;

/**
 * Build the traffic's spatial grid.
 * @param {Object} game
 */
export function createTrafficObstacleGrid(game) {
  const heads = new Int32Array(BUCKETS);
  let next = new Int32Array(256);
  let marks = new Uint32Array(256);
  const items = [];
  let count = 0;
  let stamp = 1;
  heads.fill(-1);

  /** File every vehicle and every person on foot within FILE_RANGE of (focusX, focusZ). */
  function rebuild(focusX, focusZ) {
    heads.fill(-1);
    count = 0;
    const rangeSq = FILE_RANGE * FILE_RANGE;
    const vehicles = game.vehicles ? game.vehicles.list : null;
    if (vehicles) {
      for (let i = 0; i < vehicles.length; i += 1) {
        const vehicle = vehicles[i];
        const dx = vehicle.pos.x - focusX;
        const dz = vehicle.pos.z - focusZ;
        if (dx * dx + dz * dz < rangeSq) insert(vehicle);
      }
    }
    const people = game.characters ? game.characters.list : null;
    if (people) {
      for (let i = 0; i < people.length; i += 1) {
        const person = people[i];
        if (!person || person.vehicle) continue;
        const dx = person.pos.x - focusX;
        const dz = person.pos.z - focusZ;
        if (dx * dx + dz * dz < rangeSq) insert(person);
      }
    }
  }

  /**
   * Fill `out` with the vehicles and people whose centres lie within `radius` (plus the longest
   * vehicle's half length) of (x, z). Returns how many were written.
   */
  function query(x, z, radius, out) {
    const reach = radius + LONGEST_HALF;
    const reachSq = reach * reach;
    const x0 = Math.floor((x - reach) / CELL);
    const x1 = Math.floor((x + reach) / CELL);
    const z0 = Math.floor((z - reach) / CELL);
    const z1 = Math.floor((z + reach) / CELL);
    stamp += 1;
    let found = 0;
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        for (let e = heads[bucketOf(cx, cz)]; e !== -1; e = next[e]) {
          if (marks[e] === stamp) continue;
          marks[e] = stamp;
          const thing = items[e];
          const dx = thing.pos.x - x;
          const dz = thing.pos.z - z;
          if (dx * dx + dz * dz > reachSq) continue;
          if (found < out.length) {
            out[found] = thing;
            found += 1;
          }
        }
      }
    }
    return found;
  }

  /**
   * How many metres from the start of `lane` are free of vehicles standing or crawling in it (up to
   * `reach`). A vehicle already moving away down the lane leaves room behind it and does not count.
   */
  function freeLengthOnLane(lane, reach, self) {
    const midX = lane.x0 + lane.dirX * reach * 0.5;
    const midZ = lane.z0 + lane.dirZ * reach * 0.5;
    const found = query(midX, midZ, reach * 0.5 + 3, scratch);
    let free = reach;
    for (let i = 0; i < found; i += 1) {
      const thing = scratch[i];
      if (thing === self || thing.dynamics === undefined) continue;
      const rx = thing.pos.x - lane.x0;
      const rz = thing.pos.z - lane.z0;
      const lateral = rz * lane.dirX - rx * lane.dirZ;
      if (lateral > 2.4 || lateral < -2.4) continue;
      const along = rx * lane.dirX + rz * lane.dirZ;
      const half = thing.dynamics.profile.halfLength;
      if (along + half < -1 || along - half > reach) continue;
      const moving = thing.vel.x * lane.dirX + thing.vel.z * lane.dirZ;
      if (moving > 3) continue;
      const room = along - half;
      if (room < free) free = room;
    }
    return free;
  }

  function insert(thing) {
    if (count === next.length) {
      const grownNext = new Int32Array(next.length * 2);
      grownNext.set(next);
      next = grownNext;
      const grownMarks = new Uint32Array(marks.length * 2);
      grownMarks.set(marks);
      marks = grownMarks;
    }
    const bucket = bucketOf(Math.floor(thing.pos.x / CELL), Math.floor(thing.pos.z / CELL));
    items[count] = thing;
    next[count] = heads[bucket];
    heads[bucket] = count;
    count += 1;
  }

  const scratch = new Array(48);

  return {
    rebuild,
    query,
    freeLengthOnLane,
    get count() {
      return count;
    },
  };
}

function bucketOf(cx, cz) {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & (BUCKETS - 1);
}
