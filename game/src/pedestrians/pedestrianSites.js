// The places where Port Sarab's people stand about rather than walk: Old Sarab's market lots and the
// Grand Souk square with their stall keepers, the Sundial Square, the Spire plaza and downtown palm
// courts, the Mirage Grand's forecourt, the dock yards, pool decks, playgrounds and strips of Corniche
// Beach. Each site knows how many people it holds at this hour, finds free spots, lays out stalls
// and the way back out to a sidewalk.
import { busynessAt } from './pedestrianDayRhythm.js';
import { isSpotFree } from './pedestrianSteering.js';

/**
 * Build the list of standing-life sites from the city plan (lots by their use, plus the beach).
 * @param {Object} game
 * @returns {Object[]} sites
 */
export function buildPedestrianSites(game) {
  const city = game.city;
  const sites = [];
  for (const lot of city.openLots) {
    const rule = SITE_RULES[lot.use];
    if (!rule) continue;
    const x0 = Math.min(lot.x0, lot.x1);
    const x1 = Math.max(lot.x0, lot.x1);
    const z0 = Math.min(lot.z0, lot.z1);
    const z1 = Math.max(lot.z0, lot.z1);
    if (x1 - x0 < 6 || z1 - z0 < 6) continue;
    const area = (x1 - x0) * (z1 - z0);
    const scale = rule.perArea ? clamp(area / rule.perArea, 0.5, 1.6) : 1;
    sites.push(makeSite(sites.length, lot.use, rule, x0, z0, x1, z1, city.districtById[lot.district] || null, lot.front || 's', scale));
  }
  const coast = city.coast;
  const beachRule = SITE_RULES.beach;
  const corniche = city.districtById.corniche || null;
  for (let x = BEACH_FROM_X; x <= BEACH_TO_X; x += BEACH_STEP) {
    const shore = city.coastZ(x);
    sites.push(makeSite(sites.length, 'beach', beachRule, x - BEACH_STEP / 2 + 2, shore - 10, x + BEACH_STEP / 2 - 2, coast.beachTopZ - 8, corniche, 's', 1));
  }
  return sites;
}

/**
 * How many people a site should hold right now: its capacity times its hour curve, thinned by the
 * sandstorm (nobody sunbathes in a khamsin).
 */
export function siteOccupancyWanted(site, hour, sandstorm) {
  const busy = busynessAt(site.profile, hour);
  const storm = 1 - smooth(0.3, 0.7, sandstorm || 0);
  return Math.floor(site.capacity * busy * storm + 0.35);
}

/**
 * A free spot inside a site for one person (written to out {x, z}): clear of buildings, stalls and
 * containers, not in deep water, and not on top of anyone already there. `zone` narrows the beach:
 * 'sand' (sunbathers), 'shallows' (paddlers) or 'shore' (the waterline). Returns false if none.
 */
export function findSiteSpot(game, site, zone, out, rng) {
  const terrain = game.terrain;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let x = site.x0 + 1.5 + (site.x1 - site.x0 - 3) * rng.next();
    let z = site.z0 + 1.5 + (site.z1 - site.z0 - 3) * rng.next();
    if (site.kind === 'beach') {
      const shore = game.city.coastZ(x);
      if (zone === 'shallows') z = shore - rng.range(2.5, 8);
      else if (zone === 'shore') z = shore + rng.range(0.8, 2);
      else z = rng.range(shore + 5, game.city.coast.beachTopZ - 10);
    } else if (zone === 'front' || zone === 'back') {
      const front = zone === 'front' ? site.front : opposite(site.front);
      if (front === 's') z = site.z1 - rng.range(1.2, 2.5);
      else if (front === 'n') z = site.z0 + rng.range(1.2, 2.5);
      else if (front === 'e') x = site.x1 - rng.range(1.2, 2.5);
      else x = site.x0 + rng.range(1.2, 2.5);
    }
    if (terrain && terrain.isWater(x, z)) continue;
    if (!isSpotFree(game.colliders, x, z, 0.5)) continue;
    if (crowded(site, x, z, 1.4)) continue;
    out.x = x;
    out.z = z;
    return true;
  }
  return false;
}

/**
 * The stalls of a market site, laid out once: rows facing the aisles, each with the spot where its
 * keeper stands and the heading the keeper faces. Stall colliders placed by the city's furniture
 * (any static collider whose kind mentions a stall) are used when present.
 */
export function stallsOf(game, site) {
  if (site.stalls) return site.stalls;
  const stalls = [];
  site.stalls = stalls;
  const found = [];
  if (game.colliders) game.colliders.query(site.cx, site.cz, Math.hypot(site.x1 - site.x0, site.z1 - site.z0) / 2, found);
  for (let i = 0; i < found.length; i += 1) {
    const c = found[i];
    if (typeof c.kind !== 'string' || c.kind.toLowerCase().indexOf('stall') === -1) continue;
    const sx = c.type === 'post' ? c.x : (c.minX + c.maxX) / 2;
    const sz = c.type === 'post' ? c.z : (c.minZ + c.maxZ) / 2;
    if (sx < site.x0 || sx > site.x1 || sz < site.z0 || sz > site.z1) continue;
    // The stall's counter faces its prop's yaw when known, else the middle of the market.
    let fx;
    let fz;
    if (c.ref && typeof c.ref.yaw === 'number') {
      fx = Math.sin(c.ref.yaw);
      fz = Math.cos(c.ref.yaw);
    } else {
      const alongX = Math.abs(sx - site.cx) * (site.z1 - site.z0) > Math.abs(sz - site.cz) * (site.x1 - site.x0);
      fx = alongX ? -Math.sign(sx - site.cx) || 1 : 0;
      fz = alongX ? 0 : -Math.sign(sz - site.cz) || 1;
    }
    const quarter = Math.abs(fx) > 0.7;
    const depth = c.type === 'post' ? c.radius : quarter ? (c.maxX - c.minX) / 2 : (c.maxZ - c.minZ) / 2;
    const width = c.type === 'post' ? c.radius : quarter ? (c.maxZ - c.minZ) / 2 : (c.maxX - c.minX) / 2;
    const frontX = sx + fx * (depth + 0.85);
    const frontZ = sz + fz * (depth + 0.85);
    // The keeper stands behind the counter; with stalls back to back, beside it instead.
    let kx = sx - fx * (depth + 0.6);
    let kz = sz - fz * (depth + 0.6);
    if (!isSpotFree(game.colliders, kx, kz, 0.33)) {
      kx = sx + fz * (width + 0.55) + fx * 0.2;
      kz = sz - fx * (width + 0.55) + fz * 0.2;
      if (!isSpotFree(game.colliders, kx, kz, 0.33)) continue;
    }
    if (!isSpotFree(game.colliders, frontX, frontZ, 0.33)) continue;
    stalls.push({ x: kx, z: kz, faceYaw: Math.atan2(fx, fz), fx, fz, cx: sx, cz: sz, frontX, frontZ, keeper: null });
  }
  if (stalls.length > 0) return stalls;
  // No stall furniture: imagine rows of stalls along the long sides and a double row down the middle.
  const wide = site.x1 - site.x0 >= site.z1 - site.z0;
  const length = wide ? site.x1 - site.x0 : site.z1 - site.z0;
  const depth = wide ? site.z1 - site.z0 : site.x1 - site.x0;
  const rows = depth > 40 ? [2.2, depth / 2 - 1.6, depth / 2 + 1.6, depth - 2.2] : depth > 14 ? [2.2, depth - 2.2] : [depth / 2];
  for (let r = 0; r < rows.length; r += 1) {
    const across = rows[r];
    const facesIn = across < depth / 2 ? 1 : -1;
    const faceOut = depth > 40 && r > 0 && r < rows.length - 1 ? -facesIn : facesIn;
    for (let along = 4; along <= length - 4; along += 6.5) {
      const x = wide ? site.x0 + along : site.x0 + across;
      const z = wide ? site.z0 + across : site.z0 + along;
      if (!isSpotFree(game.colliders, x, z, 0.6)) continue;
      const fx = wide ? 0 : faceOut;
      const fz = wide ? faceOut : 0;
      stalls.push({ x, z, faceYaw: Math.atan2(fx, fz), fx, fz, cx: x + fx * 0.8, cz: z + fz * 0.8, frontX: x + fx * 1.7, frontZ: z + fz * 1.7, keeper: null });
    }
  }
  return stalls;
}

/**
 * The way out of a site to a sidewalk: site.exit {x, z} on the walkway, and site.via {x, z} (a
 * corner to walk round first) or null. Both null when the site has no clear way out.
 */
export function siteExitOf(game, site) {
  if (site.exitKnown) return site.exit;
  site.exitKnown = true;
  site.exit = null;
  site.via = null;
  const roads = game.roads;
  const colliders = game.colliders;
  const from = EYE_A.set(site.cx, 1, site.cz);
  if (site.kind === 'beach') {
    const hit = roads.nearestWalkway(site.cx, game.city.coast.beachTopZ + 4, 30);
    if (hit) site.exit = { x: hit.x, z: hit.z };
    return site.exit;
  }
  const hx = (site.x1 - site.x0) / 2;
  const hz = (site.z1 - site.z0) / 2;
  // Straight out through the middle of a side, front side first.
  const sides = SIDE_ORDER[site.front] || SIDE_ORDER.s;
  for (let i = 0; i < sides.length; i += 1) {
    const [sx, sz] = SIDE_VECTORS[sides[i]];
    const ex = site.cx + sx * (hx + 3);
    const ez = site.cz + sz * (hz + 3);
    const hit = roads.nearestWalkway(ex, ez, 12);
    if (!hit) continue;
    if (!colliders || colliders.lineOfSight(from, EYE_B.set(hit.x, 1, hit.z))) {
      site.exit = { x: hit.x, z: hit.z };
      return site.exit;
    }
  }
  // Round a corner: out to a point beyond one corner of the site, then to the sidewalk.
  for (let i = 0; i < CORNERS.length; i += 1) {
    const [cx, cz] = CORNERS[i];
    for (const reach of [6, 14]) {
      const vx = site.cx + cx * (hx + reach);
      const vz = site.cz + cz * (hz + reach);
      if (!isSpotFree(colliders, vx, vz, 0.6)) continue;
      from.set(site.cx, 1, site.cz);
      if (colliders && !colliders.lineOfSight(from, EYE_B.set(vx, 1, vz))) continue;
      const hit = roads.nearestWalkway(vx, vz, 40);
      if (!hit) continue;
      if (colliders && !colliders.lineOfSight(from.set(vx, 1, vz), EYE_B.set(hit.x, 1, hit.z))) continue;
      site.via = { x: vx, z: vz };
      site.exit = { x: hit.x, z: hit.z };
      return site.exit;
    }
  }
  return null;
}

/** The heading that faces out of a site through its front (valets watch the street). */
export function frontYawOf(site) {
  if (!site) return 0;
  return site.front === 's' ? 0 : site.front === 'n' ? Math.PI : site.front === 'e' ? Math.PI / 2 : -Math.PI / 2;
}

/** Is anyone of this site already standing within `radius` of (x, z)? */
export function crowded(site, x, z, radius) {
  const list = site.occupants;
  for (let i = 0; i < list.length; i += 1) {
    const ped = list[i];
    const mind = ped.ai;
    const px = mind && mind.site === site ? mind.spotX : ped.pos.x;
    const pz = mind && mind.site === site ? mind.spotZ : ped.pos.z;
    const dx = px - x;
    const dz = pz - z;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function makeSite(id, use, rule, x0, z0, x1, z1, district, front, scale) {
  return {
    id, use, kind: rule.kind, profile: rule.profile,
    x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
    district, front,
    capacity: Math.max(1, Math.round(rule.capacity * scale)),
    keepers: rule.keepers || 0,
    people: rule.people,
    activities: rule.activities,
    occupants: [],
    stalls: null,
    exitKnown: false,
    exit: null,
    via: null,
  };
}

function opposite(side) {
  return side === 's' ? 'n' : side === 'n' ? 's' : side === 'e' ? 'w' : 'e';
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function smooth(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * What each kind of open lot holds. people: archetype weights; activities: weights of what people do
 * there; keepers: stall keepers or valets among the capacity; perArea: capacity is for this many m².
 */
export const SITE_RULES = {
  marketSquare: { kind: 'market', profile: 'market', capacity: 22, keepers: 8, people: { local: 6, tourist: 3, civilian: 2 }, activities: { browse: 1 } },
  marketStalls: { kind: 'market', profile: 'market', capacity: 6, keepers: 2, perArea: 700, people: { local: 5, civilian: 2, tourist: 2 }, activities: { browse: 1 } },
  courtyard: { kind: 'courtyard', profile: 'square', capacity: 3, perArea: 600, people: { local: 5, civilian: 1 }, activities: { sit: 3, chat: 2, phone: 1 } },
  sundialSquare: { kind: 'square', profile: 'square', capacity: 9, people: { tourist: 4, local: 4, civilian: 2 }, activities: { chat: 3, photo: 2, stand: 1, sit: 1 } },
  spirePlaza: { kind: 'plaza', profile: 'office', capacity: 9, people: { business: 6, civilian: 2, tourist: 1 }, activities: { chat: 4, phone: 2, stand: 1, photo: 1 } },
  plaza: { kind: 'plaza', profile: 'office', capacity: 4, perArea: 1500, people: { business: 4, civilian: 2 }, activities: { chat: 3, phone: 2, stand: 1 } },
  palmCourt: { kind: 'plaza', profile: 'office', capacity: 4, perArea: 1500, people: { business: 3, civilian: 2, tourist: 1 }, activities: { chat: 3, sit: 1, phone: 1 } },
  hotelForecourt: { kind: 'hotel', profile: 'hotel', capacity: 6, keepers: 2, people: { tourist: 4, business: 2 }, activities: { stand: 2, phone: 2, chat: 2 } },
  containerYard: { kind: 'yard', profile: 'shift', capacity: 4, perArea: 2500, people: { worker: 1 }, activities: { chat: 3, inspect: 2, phone: 1 } },
  truckYard: { kind: 'yard', profile: 'shift', capacity: 3, perArea: 2000, people: { worker: 1 }, activities: { chat: 2, inspect: 2, phone: 1 } },
  poolDeck: { kind: 'pool', profile: 'sunbathing', capacity: 4, perArea: 1200, people: { tourist: 4, civilian: 2 }, activities: { sunbathe: 3, chat: 1 } },
  playground: { kind: 'playground', profile: 'family', capacity: 3, perArea: 1200, people: { civilian: 3, local: 2 }, activities: { stand: 2, chat: 2, sit: 1 } },
  beach: { kind: 'beach', profile: 'sunbathing', capacity: 9, people: { tourist: 6, civilian: 3, local: 1 }, activities: { sunbathe: 5, paddle: 2, shoreWalk: 2, chat: 2 } },
};

/** Corniche Beach runs between the marina and the port: strips of sand this wide along it. */
const BEACH_FROM_X = -575;
const BEACH_TO_X = 455;
const BEACH_STEP = 52;
const SIDE_VECTORS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const SIDE_ORDER = { s: ['s', 'n', 'e', 'w'], n: ['n', 's', 'e', 'w'], e: ['e', 'w', 's', 'n'], w: ['w', 'e', 's', 'n'] };
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const EYE_A = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const EYE_B = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
