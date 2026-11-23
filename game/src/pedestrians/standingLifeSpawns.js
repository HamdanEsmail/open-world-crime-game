// Newcomers who arrive already in a standing life: stall keepers at Old Sarab's counters and the
// shoppers in front of them, valets at the Mirage Grand's kerb, sunbathers, paddlers and strollers on
// Corniche Beach, office workers chatting on the Spire plaza, and on the sidewalks friends talking,
// someone on the phone, a man leaning on a wall or looking in a shop window.
import { isSpotFree, headingToward } from './pedestrianSteering.js';
import { siteOccupancyWanted, findSiteSpot, stallsOf, crowded, frontYawOf } from './pedestrianSites.js';
import { pickArchetype } from './pedestrianDayRhythm.js';

/**
 * Build the standing-life spawns.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 * @param {{beginActivity:Function, settleIn:Function, sites:Function}} life  from pedestrianActivities.js
 */
export function createStandingLifeSpawns(ctx, life) {
  const { game, rng } = ctx;
  const candidates = [];
  const spot = { x: 0, z: 0 };
  const kerb = { walkway: null, x: 0, z: 0 };
  const pseudoDistrict = { kind: '', people: null };

  const spawns = {
    trySpawnAtSite,
    trySpawnKerbLife,
    prepareRoute,
    kerbSpot,
    wallBehind,
    /** Free places at the sites near the player, as found by the last try. */
    siteRoom: 0,
  };

  /** Spawn one or two people into a site near the player that wants more. Returns how many. */
  function trySpawnAtSite(relaxed) {
    const list = life.sites();
    const p = ctx.player;
    const hour = game.time.hour;
    const storm = game.weather ? game.weather.sandstorm || 0 : 0;
    const reach = ctx.spawner.recycleDistance + 10;
    candidates.length = 0;
    let free = 0;
    for (let i = 0; i < list.length; i += 1) {
      const site = list[i];
      const dx = site.cx - p.x;
      const dz = site.cz - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      const room = siteOccupancyWanted(site, hour, storm) - site.occupants.length;
      if (room <= 0) continue;
      candidates.push(site);
      free += room;
    }
    spawns.siteRoom = free;
    if (candidates.length === 0) return 0;
    // The emptier a site, the likelier it gets the newcomer.
    let roll = rng.next() * free;
    let site = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i += 1) {
      roll -= siteOccupancyWanted(candidates[i], hour, storm) - candidates[i].occupants.length;
      if (roll <= 0) {
        site = candidates[i];
        break;
      }
    }
    return populateSite(site, relaxed, siteOccupancyWanted(site, hour, storm));
  }

  function populateSite(site, relaxed, wanted) {
    if (site.keepers > 0) {
      let keepers = 0;
      for (let i = 0; i < site.occupants.length; i += 1) {
        const kind = site.occupants[i].ai ? site.occupants[i].ai.activity : null;
        if (kind === 'keeper' || kind === 'valet') keepers += 1;
      }
      const keepersWanted = Math.min(site.keepers, Math.ceil((wanted * site.keepers) / site.capacity + 0.3));
      if (keepers < keepersWanted) return spawnKeeper(site, relaxed);
    }
    const kind = pickWeighted(site.activities, rng);
    if (kind === 'browse') return spawnShopper(site, relaxed);
    const zone = site.kind === 'beach' ? (kind === 'paddle' ? 'shallows' : kind === 'shoreWalk' ? 'shore' : 'sand') : site.kind === 'hotel' ? 'back' : null;
    if (!findSiteSpot(game, site, zone, spot, rng)) return 0;
    if (!ctx.spawner.acceptPlace(spot.x, spot.z, relaxed, 1, 1.3)) return 0;
    const ped = spawnFor(site, spot.x, spot.z);
    if (!ped) return 0;
    const mind = ped.ai;
    if (kind === 'chat' && site.occupants.length + 2 <= site.capacity + 1) {
      life.beginActivity(ped, mind, site, 'chat', spot.x, spot.z, 'do');
      return 1 + addPartner(ped, mind, site);
    }
    life.beginActivity(ped, mind, site, kind === 'chat' ? 'stand' : kind, spot.x, spot.z, 'do');
    prepareRoute(ped, mind, site);
    return 1;
  }

  /** Waypoints and look targets for the pacing and photographing kinds. */
  function prepareRoute(ped, mind, site) {
    if (mind.activity === 'shoreWalk') {
      mind.altX = clamp(mind.spotX + rng.sign() * rng.range(22, 42), BEACH_MIN_X, BEACH_MAX_X);
      mind.altZ = game.city.coastZ(mind.altX) + 1.3;
    } else if (mind.activity === 'inspect' || mind.activity === 'valet') {
      if (findSiteSpot(game, site, mind.activity === 'valet' ? 'front' : null, spot, rng)) {
        mind.altX = spot.x;
        mind.altZ = spot.z;
      } else {
        mind.altX = mind.spotX;
        mind.altZ = mind.spotZ;
      }
    } else if (mind.activity === 'photo') {
      mind.altX = site.kind === 'beach' ? mind.spotX : site.cx;
      mind.altZ = site.kind === 'beach' ? mind.spotZ - 50 : site.cz;
      life.settleIn(ped, mind);
    }
  }

  /** Someone to chat with, standing a step away and facing them. */
  function addPartner(ped, mind, site) {
    const angle = rng.next() * Math.PI * 2;
    const x = mind.spotX + Math.sin(angle) * 1.15;
    const z = mind.spotZ + Math.cos(angle) * 1.15;
    if (!isSpotFree(game.colliders, x, z, 0.4) || (game.terrain && game.terrain.isWater(x, z))) return 0;
    const friend = site ? spawnFor(site, x, z) : spawnLocal(x, z);
    if (!friend) return 0;
    const fm = friend.ai;
    if (!site) fm.walkway = mind.walkway;
    life.beginActivity(friend, fm, site, 'chat', x, z, 'do');
    mind.partner = friend;
    fm.partner = ped;
    fm.actUntil = mind.actUntil + rng.range(-3, 3);
    mind.faceYaw = headingToward(mind.spotX, mind.spotZ, x, z);
    fm.faceYaw = headingToward(x, z, mind.spotX, mind.spotZ);
    fm.gesture = mind.gesture === 'talk' ? null : 'talk';
    return 1;
  }

  /** A stall keeper at a free stall, or a valet at the hotel's kerb. */
  function spawnKeeper(site, relaxed) {
    if (site.kind === 'hotel') {
      if (!findSiteSpot(game, site, 'front', spot, rng)) return 0;
      if (!ctx.spawner.acceptPlace(spot.x, spot.z, relaxed, 1)) return 0;
      const valet = ctx.spawner.spawnPerson('business', spot.x, spot.z, frontYawOf(site));
      if (!valet) return 0;
      life.beginActivity(valet, valet.ai, site, 'valet', spot.x, spot.z, 'do');
      prepareRoute(valet, valet.ai, site);
      valet.ai.courage = Math.max(valet.ai.courage, 0.5);
      return 1;
    }
    const stalls = stallsOf(game, site);
    if (stalls.length === 0) return 0;
    const stall = stalls[Math.floor(rng.next() * stalls.length)];
    if (stall.keeper) return 0;
    if (!ctx.spawner.acceptPlace(stall.x, stall.z, relaxed, 1, 0.9)) return 0;
    const keeper = ctx.spawner.spawnPerson(rng.chance(0.75) ? 'local' : 'civilian', stall.x, stall.z, stall.faceYaw);
    if (!keeper) return 0;
    stall.keeper = keeper;
    keeper.ai.stall = stall;
    life.beginActivity(keeper, keeper.ai, site, 'keeper', stall.x, stall.z, 'do');
    return 1;
  }

  /** A shopper at the counter of a stall (a staffed one when the dice allow). */
  function spawnShopper(site, relaxed) {
    const stalls = stallsOf(game, site);
    if (stalls.length === 0) return 0;
    let stall = stalls[Math.floor(rng.next() * stalls.length)];
    for (let tries = 0; tries < 4 && !stall.keeper; tries += 1) stall = stalls[Math.floor(rng.next() * stalls.length)];
    const side = rng.range(-0.8, 0.8);
    const x = stall.frontX + stall.fz * side;
    const z = stall.frontZ - stall.fx * side;
    if (crowded(site, x, z, 0.9) || !ctx.spawner.acceptPlace(x, z, relaxed, 1, 0.9)) return 0;
    const ped = spawnFor(site, x, z);
    if (!ped) return 0;
    life.beginActivity(ped, ped.ai, site, 'browse', x, z, 'do');
    ped.ai.stall = stall;
    life.settleIn(ped, ped.ai);
    return 1;
  }

  function spawnFor(site, x, z) {
    pseudoDistrict.kind = site.district ? site.district.kind : '';
    pseudoDistrict.people = site.people;
    return ctx.spawner.spawnPerson(pickArchetype(pseudoDistrict, rng, game.time.hour), x, z, rng.range(-Math.PI, Math.PI));
  }

  function spawnLocal(x, z) {
    return ctx.spawner.spawnPerson(pickArchetype(game.city.districtAt(x, z), rng, game.time.hour), x, z, rng.range(-Math.PI, Math.PI));
  }

  /** People standing about on a sidewalk: a chat, a phone call, a lean on the wall, a shop window. */
  function trySpawnKerbLife(relaxed) {
    const at = ctx.spawner.pickWalkwaySpot(relaxed);
    if (!at) return 0;
    if (!kerbSpot(at.walkway, at.x, at.z, 1.35, kerb)) return 0;
    const kind = pickWeighted(KERB_LIFE, rng);
    let x = kerb.x;
    let z = kerb.z;
    const w = at.walkway;
    const toRoad = ctx.walking.roadSideOf(w);
    const roadYaw = Math.atan2(-w.dirZ * toRoad, w.dirX * toRoad);
    const wall = (kind === 'lean' || kind === 'window') && kerbSpot(w, at.x, at.z, 2.05, kerb) && wallBehind(w, kerb.x, kerb.z, toRoad);
    if (wall) {
      x = kerb.x;
      z = kerb.z;
    }
    const ped = spawnLocal(x, z);
    if (!ped) return 0;
    const mind = ped.ai;
    mind.walkway = w;
    mind.toEnd = rng.chance(0.5) ? 1 : 0;
    const actual = wall ? kind : kind === 'chat' ? 'chat' : 'phone';
    life.beginActivity(ped, mind, null, actual, x, z, 'do');
    if (actual === 'lean') mind.faceYaw = roadYaw;
    else if (actual === 'window') mind.faceYaw = roadYaw + Math.PI;
    else if (actual === 'phone') mind.faceYaw = roadYaw + rng.range(-1.4, 1.4);
    if (actual === 'chat') return 1 + addPartner(ped, mind, null);
    return 1;
  }

  /** A point on the building side of a sidewalk, `inset` from its centre line (into out {x, z}). */
  function kerbSpot(walkway, x, z, inset, out) {
    const lat = -ctx.walking.roadSideOf(walkway) * inset;
    out.walkway = walkway;
    out.x = x - walkway.dirZ * lat;
    out.z = z + walkway.dirX * lat;
    return isSpotFree(game.colliders, out.x, out.z, 0.4);
  }

  /** Is there a wall just behind a kerb spot (to lean on, or a shop window to look into)? */
  function wallBehind(walkway, x, z, toRoad) {
    return !isSpotFree(game.colliders, x + walkway.dirZ * toRoad * 0.8, z - walkway.dirX * toRoad * 0.8, 0.3);
  }

  return spawns;
}

/** Pick a key of `weights` ({name: weight}) at random by weight. */
export function pickWeighted(weights, rng) {
  let total = 0;
  for (const key in weights) total += weights[key];
  let roll = rng.next() * total;
  for (const key in weights) {
    roll -= weights[key];
    if (roll <= 0) return key;
  }
  for (const key in weights) return key;
  return 'stand';
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

const KERB_LIFE = { chat: 4, phone: 3, lean: 2, window: 2 };
const BEACH_MIN_X = -590;
const BEACH_MAX_X = 470;
