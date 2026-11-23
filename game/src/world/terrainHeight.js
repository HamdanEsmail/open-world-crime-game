// The ground of Port Sarab as a function: flat city streets, a beach sloping into the gulf, the
// marina basin with its piers, the port quay, rolling dunes around the city, and the stunt ramps.
// Cars, people, the camera and the terrain mesh all ask this one place how high the ground is.

/** Sidewalks and the floors of city blocks stand this far above the road surface. */
const KERB_HEIGHT = 0.14;
const ROAD = 0;
const SIDEWALK = 1;
const PLAZA = 2;

/** Build game.terrain: heightAt(x, z), surfaceAt(x, z), isWater(x, z), normalAt(x, z, out). */
export function createTerrainHeight(game) {
  const city = game.city;
  const { smoothstep, fractalNoise2D, clamp } = game.math;
  const seaLevel = game.config.world.seaLevel;
  const coast = city.coast;
  const marina = coast.marina;
  const port = coast.port;
  const urban = city.urban;
  const ramps = city.stuntRamps.map((ramp) => ({
    ...ramp, sin: Math.sin(ramp.heading), cos: Math.cos(ramp.heading), reachSq: (ramp.length + ramp.width) * (ramp.length + ramp.width),
  }));
  const desertSegments = [];
  for (const road of city.desertRoads) {
    const half = city.roadKinds[road.kind].width / 2;
    for (let i = 0; i < road.points.length - 1; i += 1) {
      desertSegments.push({ ax: road.points[i][0], az: road.points[i][1], bx: road.points[i + 1][0], bz: road.points[i + 1][1], half });
    }
  }
  const avenueX = city.avenues.map((avenue) => avenue.x);
  const avenueHalf = city.avenues.map((avenue) => city.roadKinds[avenue.kind].width / 2);
  const streetZ = city.streets.map((street) => street.z);
  const streetHalf = city.streets.map((street) => city.roadKinds[street.kind].width / 2);
  const sidewalk = city.roadKinds.street.sidewalk;
  const edge = 14 + sidewalk; // the ring roads' outer kerb, measured from their centre lines

  /** Height of the ground at a point, metres. */
  function heightAt(x, z) {
    let height = baseHeightAt(x, z);
    for (let i = 0; i < ramps.length; i += 1) {
      const ramp = ramps[i];
      const dx = x - ramp.x;
      const dz = z - ramp.z;
      if (dx * dx + dz * dz > ramp.reachSq) continue;
      const along = dx * ramp.sin + dz * ramp.cos;
      const across = dx * ramp.cos - dz * ramp.sin;
      if (along < 0 || along > ramp.length || Math.abs(across) > ramp.width / 2) continue;
      const t = along / ramp.length;
      const lift = ramp.height * t * t * (1.6 - 0.6 * t);
      if (lift > height) height = lift;
    }
    return height;
  }

  /** The ground without the ramps: city, shore and dunes. */
  function baseHeightAt(x, z) {
    if (z < coast.beachTopZ) return shoreHeightAt(x, z);
    const outside = distanceOutsideCity(x, z);
    if (outside <= 24) return outside <= edge && cityPavingAt(x, z) !== ROAD ? KERB_HEIGHT : 0;
    return duneHeightAt(x, z, outside);
  }

  /** Inside the street grid: ROAD, SIDEWALK or PLAZA (the floor of a block). Roads are at 0, the rest a kerb higher. */
  function cityPavingAt(x, z) {
    let nearAvenue = 1e9;
    let halfAvenue = 0;
    for (let i = 0; i < avenueX.length; i += 1) {
      const d = Math.abs(x - avenueX[i]);
      if (d < nearAvenue) {
        nearAvenue = d;
        halfAvenue = avenueHalf[i];
      }
    }
    let nearStreet = 1e9;
    let halfStreet = 0;
    for (let j = 0; j < streetZ.length; j += 1) {
      const d = Math.abs(z - streetZ[j]);
      if (d < nearStreet) {
        nearStreet = d;
        halfStreet = streetHalf[j];
      }
    }
    if (nearAvenue < halfAvenue || nearStreet < halfStreet) return ROAD;
    if (nearAvenue < halfAvenue + sidewalk || nearStreet < halfStreet + sidewalk) return SIDEWALK;
    return PLAZA;
  }

  /** North of the Corniche: marina, port quay, or beach sliding under the water. */
  function shoreHeightAt(x, z) {
    const bw = marina.breakwaterHalfWidth;
    if (x > marina.minX - bw && x < marina.maxX + bw) {
      if (z >= marina.maxZ) return 0; // the marina promenade
      if (z < marina.minZ) return -6.5; // open water beyond the basin
      if (x < marina.minX + bw || x > marina.maxX - bw) return 0; // the two breakwater arms
      if (z > marina.pierEndZ) {
        for (let i = 0; i < marina.piers.length; i += 1) if (Math.abs(x - marina.piers[i]) < marina.pierHalfWidth) return 0;
      }
      return -5; // the basin
    }
    if (x > port.minX && x < port.maxX) return z >= port.edgeZ ? 0 : -8.5; // the quay, then the dredged harbour
    const shore = city.coastZ(x);
    if (z > shore) {
      const t = (coast.beachTopZ - z) / (coast.beachTopZ - shore);
      return seaLevel * Math.pow(t, 1.4) + 0.22 * Math.sin(x * 0.05) * Math.sin(z * 0.09) * t * (1 - t) * 4;
    }
    return Math.max(-9, seaLevel - (shore - z) * 0.05);
  }

  /** How far a point is outside the rectangle of the street grid (0 inside it). */
  function distanceOutsideCity(x, z) {
    const dx = x < urban.minX ? urban.minX - x : x > urban.maxX ? x - urban.maxX : 0;
    const dz = z < urban.minZ ? urban.minZ - z : z > urban.maxZ ? z - urban.maxZ : 0;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Dunes: long soft swells with sharper crescent ridges, pressed flat beside roads and landmarks. */
  function duneHeightAt(x, z, outside) {
    let amount = smoothstep(24, 150, outside) * smoothstep(coast.beachTopZ, coast.beachTopZ + 130, z);
    if (amount <= 0) return 0;
    const road = distanceToDesertRoad(x, z);
    amount *= smoothstep(road.half + 2, road.half + 44, road.distance);
    const zones = city.flatZones;
    for (let i = 0; i < zones.length; i += 1) {
      const d = Math.hypot(x - zones[i][0], z - zones[i][1]);
      amount *= smoothstep(zones[i][2] * 0.8, zones[i][2] * 1.3, d);
    }
    if (amount <= 0.0005) return 0;
    const swell = fractalNoise2D(x / 230, z / 160, 3, 11);
    const ridge = 1 - Math.abs(2 * fractalNoise2D(x / 110 + 31, z / 76, 2, 23) - 1);
    return amount * (10 * swell + 5.5 * ridge * ridge);
  }

  const nearestRoad = { distance: 0, half: 0 };
  function distanceToDesertRoad(x, z) {
    let best = 1e9;
    let half = 11;
    for (let i = 0; i < desertSegments.length; i += 1) {
      const s = desertSegments[i];
      const abx = s.bx - s.ax;
      const abz = s.bz - s.az;
      let t = ((x - s.ax) * abx + (z - s.az) * abz) / (abx * abx + abz * abz);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (s.ax + abx * t);
      const dz = z - (s.az + abz * t);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d - s.half < best - half) {
        best = d;
        half = s.half;
      }
    }
    nearestRoad.distance = best;
    nearestRoad.half = half;
    return nearestRoad;
  }

  /** What the ground is made of: 'road', 'sidewalk', 'plaza', 'sand', 'beach' or 'water'. */
  function surfaceAt(x, z) {
    if (z < coast.beachTopZ) {
      if (baseHeightAt(x, z) < seaLevel - 0.25) return 'water';
      const bw = marina.breakwaterHalfWidth;
      if (x > marina.minX - bw && x < marina.maxX + bw) return 'plaza';
      if (x > port.minX && x < port.maxX) return 'plaza';
      return 'beach';
    }
    if (distanceOutsideCity(x, z) <= edge) {
      const paving = cityPavingAt(x, z);
      return paving === ROAD ? 'road' : paving === SIDEWALK ? 'sidewalk' : 'plaza';
    }
    const road = distanceToDesertRoad(x, z);
    return road.distance < road.half ? 'road' : 'sand';
  }

  /** True where the water is deep enough to sink a car or make a person swim. */
  function isWater(x, z) {
    return z < coast.beachTopZ && baseHeightAt(x, z) < seaLevel - 0.6;
  }

  /** The upward unit normal of the ground at a point, written into `out` (x, y, z). */
  function normalAt(x, z, out) {
    const e = 0.6;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    const inv = 1 / Math.sqrt(dx * dx + dz * dz + 4 * e * e);
    out.x = -dx * inv;
    out.y = 2 * e * inv;
    out.z = -dz * inv;
    return out;
  }

  /** True where the ground is the flat city floor (lets ray tests take a shortcut). */
  function isFlatCity(x, z) {
    return z >= coast.beachTopZ && x > urban.minX - 20 && x < urban.maxX + 20 && z < urban.maxZ + 20;
  }

  // kerbHeight is 0 for the vehicle suspension: the kerb is already in heightAt, so it must not be added twice.
  return { heightAt, baseHeightAt, surfaceAt, isWater, normalAt, isFlatCity, seaLevel, clampToWorld, kerbHeight: 0, sidewalkHeight: KERB_HEIGHT };

  /** Keep a point inside the playable world; returns true when it had to be moved. */
  function clampToWorld(pos) {
    const world = game.config.world;
    const x = clamp(pos.x, world.minX, world.maxX);
    const z = clamp(pos.z, world.minZ, world.maxZ);
    const moved = x !== pos.x || z !== pos.z;
    pos.x = x;
    pos.z = z;
    return moved;
  }
}
