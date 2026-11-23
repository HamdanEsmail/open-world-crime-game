// The skyline of Port Sarab as a pilot sees it: grids holding the tallest thing in every cell (glass
// towers, the Vane Spire, hotels, gantry cranes, the radio mast, Falcon Rock), widened so a rotor
// never brushes a wall. A fine 4 m grid covers the city and the shore, a coarse 20 m one the whole
// map. Shaheen-1 asks it in one lookup how high it must fly at a point, which leaves the open air
// above the boulevards free to fly low between the towers.

/** The fine grid's extent: the street grid, the marina, the port and a margin. */
const CITY_BOUNDS = { minX: -1160, maxX: 1260, minZ: -960, maxZ: 920 };

/**
 * Build the clearance grids once from game.city.
 * @returns {{highestNear: (x:number, z:number) => number, highestAt: (x:number, z:number) => number, margin: number}}
 */
export function createHelicopterClearanceMap(game) {
  const world = game.config.world;
  const city = createHeightGrid(CITY_BOUNDS.minX, CITY_BOUNDS.minZ, CITY_BOUNDS.maxX, CITY_BOUNDS.maxZ, 4, 3);
  const map = createHeightGrid(world.minX - 100, world.minZ - 100, world.maxX + 100, world.maxZ + 100, 20, 1);
  stampCity(game.city, (x0, z0, x1, z1, h) => {
    city.stamp(x0, z0, x1, z1, h);
    map.stamp(x0, z0, x1, z1, h);
  });
  city.widen();
  map.widen();

  /** The highest roof within about 12 m (in town) or 20 m (out of town) of (x, z): fly 20 m above it. */
  function highestNear(x, z) {
    return city.contains(x, z) ? city.near(x, z) : map.near(x, z);
  }

  /** The highest roof right under (x, z). */
  function highestAt(x, z) {
    return city.contains(x, z) ? city.at(x, z) : map.at(x, z);
  }

  return { highestNear, highestAt, margin: 12 };
}

/** Everything tall in the plan: buildings, container stacks, and the landmarks that are not buildings. */
function stampCity(plan, stamp) {
  if (!plan) return;
  for (const b of plan.buildings || []) stamp(b.x - b.w / 2, b.z - b.d / 2, b.x + b.w / 2, b.z + b.d / 2, b.h);
  for (const c of plan.containers || []) stamp(c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2, c.h);
  for (const landmark of plan.landmarks || []) {
    if (landmark.building !== undefined || !(landmark.h > 0)) continue;
    if (landmark.positions) {
      // Gantry cranes stand along the quay: each a tall frame with a boom out over the water.
      for (const [px, pz] of landmark.positions) stamp(px - 16, landmark.z + pz - 40, px + 16, landmark.z + pz + 16, landmark.h + 4);
      continue;
    }
    const rx = landmark.radius || (landmark.w || 10) / 2;
    const rz = landmark.radius || (landmark.d || 10) / 2;
    stamp(landmark.x - rx, landmark.z - rz, landmark.x + rx, landmark.z + rz, landmark.h);
  }
}

/**
 * A grid of heights over a rectangle, `cell` metres a side; widen() spreads each height
 * `marginCells` cells every way (a separable max), and near() reads the widened grid.
 */
function createHeightGrid(minX, minZ, maxX, maxZ, cell, marginCells) {
  const columns = Math.ceil((maxX - minX) / cell);
  const rows = Math.ceil((maxZ - minZ) / cell);
  const raw = new Float32Array(columns * rows);
  const widened = new Float32Array(columns * rows);

  function stamp(x0, z0, x1, z1, height) {
    const c0 = Math.max(0, Math.floor((x0 - minX) / cell));
    const c1 = Math.min(columns - 1, Math.floor((x1 - minX) / cell));
    const r0 = Math.max(0, Math.floor((z0 - minZ) / cell));
    const r1 = Math.min(rows - 1, Math.floor((z1 - minZ) / cell));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const i = r * columns + c;
        if (height > raw[i]) raw[i] = height;
      }
    }
  }

  function widen() {
    const across = new Float32Array(columns * rows);
    for (let r = 0; r < rows; r += 1) {
      const row = r * columns;
      for (let c = 0; c < columns; c += 1) {
        let highest = 0;
        const c1 = Math.min(columns - 1, c + marginCells);
        for (let k = Math.max(0, c - marginCells); k <= c1; k += 1) if (raw[row + k] > highest) highest = raw[row + k];
        across[row + c] = highest;
      }
    }
    for (let r = 0; r < rows; r += 1) {
      const r1 = Math.min(rows - 1, r + marginCells);
      for (let c = 0; c < columns; c += 1) {
        let highest = 0;
        for (let k = Math.max(0, r - marginCells); k <= r1; k += 1) {
          const h = across[k * columns + c];
          if (h > highest) highest = h;
        }
        widened[r * columns + c] = highest;
      }
    }
  }

  function contains(x, z) {
    return x >= minX && x < maxX && z >= minZ && z < maxZ;
  }

  function index(x, z) {
    const cx = Math.floor((x - minX) / cell);
    const cz = Math.floor((z - minZ) / cell);
    if (cx < 0 || cz < 0 || cx >= columns || cz >= rows) return -1;
    return cz * columns + cx;
  }

  return {
    stamp, widen, contains,
    near(x, z) {
      const i = index(x, z);
      return i < 0 ? 0 : widened[i];
    },
    at(x, z) {
      const i = index(x, z);
      return i < 0 ? 0 : raw[i];
    },
  };
}
