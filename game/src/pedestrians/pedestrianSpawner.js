// Who is out on the streets of Port Sarab, and where. Keeps the crowd around the player at the size
// the district, the hour, the weather and any mission ask for: new people step onto sidewalks (alone,
// as couples, in threes, or straight into a standing life) where the camera cannot see them appear,
// and people far away, long out of sight, fled, sheltering from the khamsin or lying dead are
// quietly taken away. Also hands out each person's mind: pace, lane, courage.
import { crowdSizeForStreets, walkingPaceFor } from './pedestrianRules.js';
import { streetBusynessAt, pickArchetype } from './pedestrianDayRhythm.js';

/**
 * Build the spawner for the crowd context `ctx`.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 */
export function createPedestrianSpawner(ctx) {
  const { game, rng, people, stats } = ctx;
  const population = game.config.population;
  const minds = [];
  const zones = [];
  const nearby = [];
  const spot = { walkway: null, t: 0, x: 0, z: 0 };
  let refillPending = true;
  let target = 0;
  let nextTargetTime = 0;

  const spawner = {
    update,
    requestRefill,
    keepClear,
    adopt,
    recycleMind,
    spawnPerson,
    acceptPlace,
    pickWalkwaySpot,
    get target() {
      return target;
    },
    /** Beyond this, unseen people are recycled; nobody is placed farther out. */
    recycleDistance: RECYCLE_DISTANCE,
  };

  /** Keep the crowd at its target: fill, then recycle who is no longer needed. */
  function update() {
    if (ctx.now >= nextTargetTime) {
      nextTargetTime = ctx.now + 1;
      target = targetCount();
      stats.target = target;
      expireZones();
    }
    if (refillPending && ctx.player.known) {
      refillPending = false;
      fill(true, 320);
    } else {
      const alive = livingCount();
      const deficit = target - alive;
      if (deficit > 0) fill(false, deficit > 10 ? 4 : 2);
    }
    for (let i = people.length - 1; i >= 0; i -= 1) {
      const ped = people[i];
      const mind = ped.ai;
      if (!mind || ctx.now < mind.nextCheck) continue;
      mind.nextCheck = ctx.now + 0.8 + rng.next() * 0.4;
      if (shouldRemove(ped, mind)) ctx.remove(ped);
    }
  }

  /**
   * How many people should be about: the configured crowd, times the mission multiplier, times how
   * busy the streets around the player are at this hour, thinned by the sandstorm.
   */
  function targetCount() {
    const base = population.pedestrians;
    const density = ctx.system ? ctx.system.density : 1;
    if (density <= 0) return 0;
    const hour = game.time.hour;
    const p = ctx.player;
    let local = streetBusynessAt(game.city, p.x, p.z, hour) * 2;
    let weight = 2;
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      local += streetBusynessAt(game.city, p.x + Math.sin(angle) * 90, p.z + Math.cos(angle) * 90, hour);
      weight += 1;
    }
    local /= weight;
    return crowdSizeForStreets(base, density, local, game.weather ? game.weather.sandstorm || 0 : 0);
  }

  /** Try to bring the crowd up to target; `relaxed` (after a teleport) may place people in plain view. */
  function fill(relaxed, attempts) {
    for (let a = 0; a < attempts; a += 1) {
      if (livingCount() >= target) return;
      // A sunny beach or a market in full swing draws more of the crowd than a plain street.
      const siteShare = clamp(ctx.activities.siteRoom / Math.max(1, target * 0.8), 0.25, 0.68);
      const roll = rng.next();
      if (roll < siteShare && ctx.activities.trySpawnAtSite(relaxed) > 0) continue;
      if (roll < siteShare + 0.13 && ctx.activities.trySpawnKerbLife(relaxed) > 0) continue;
      if (pickWalkwaySpot(relaxed)) spawnWalkers(spot);
    }
  }

  /**
   * A random point on a sidewalk near the player where nobody would see a person appear
   * (written into the shared spot {walkway, t, x, z}); null when this try found none.
   */
  function pickWalkwaySpot(relaxed) {
    const p = ctx.player;
    const minD = relaxed ? 5 : population.minSpawnDistance * 0.36;
    const reach = relaxed ? 12 + 110 * Math.pow(rng.next(), 1.6) : lerp(60, Math.min(RECYCLE_DISTANCE, population.spawnRadius), rng.next());
    const hit = game.roads.randomWalkwayNear(p.x, p.z, minD, Math.max(minD + 12, reach), rng);
    if (!hit) return null;
    spot.walkway = hit.walkway;
    spot.t = hit.t;
    spot.x = hit.x;
    spot.z = hit.z;
    return acceptPlace(spot.x, spot.z, relaxed) ? spot : null;
  }

  /**
   * May a person appear at (x, z) now? Not in a cleared zone or the water, in proportion to how busy
   * the district is at this hour, not on top of someone, and unseen unless `relaxed`.
   */
  function acceptPlace(x, z, relaxed, busyness, spacing = 2.2) {
    if (inClearZone(x, z)) return false;
    if (game.terrain && game.terrain.isWater(x, z)) return false;
    const busy = busyness === undefined ? streetBusynessAt(game.city, x, z, game.time.hour) : busyness;
    if (rng.next() > clamp(busy / 0.8, 0.04, 1)) return false;
    if (ctx.grid.query(x, z, spacing, nearby).length > 0) return false;
    if (relaxed) return true;
    const p = ctx.player;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < population.minSpawnDistance) return !ctx.view.inView(x, 1, z, 6);
    return !(d < POP_DISTANCE && ctx.view.canSee(x, z, POP_DISTANCE));
  }

  /** One walker, a couple or three friends on a sidewalk, heading one way or the other. */
  function spawnWalkers(at) {
    const walkway = at.walkway;
    const district = game.city.districtAt(at.x, at.z);
    const hour = game.time.hour;
    const roll = rng.next();
    const size = roll < 0.07 ? 3 : roll < 0.24 ? 2 : 1;
    // Most newcomers walk toward the player, so the streets fill where the player is.
    const towardPlayer = (ctx.player.x - at.x) * walkway.dirX + (ctx.player.z - at.z) * walkway.dirZ > 0 ? 1 : 0;
    const toEnd = rng.chance(0.75) ? towardPlayer : 1 - towardPlayer;
    const sign = toEnd === 1 ? 1 : -1;
    const fx = walkway.dirX * sign;
    const fz = walkway.dirZ * sign;
    const heading = Math.atan2(fx, fz);
    const archetype = pickArchetype(district, rng, hour);
    const laneGuess = size > 1 ? rng.range(-0.5, 0.5) : rightKeepingLane();
    const leader = spawnPerson(archetype, at.x - fz * laneGuess, at.z + fx * laneGuess, heading);
    if (!leader) return 0;
    const lm = leader.ai;
    lm.lane = laneGuess;
    if (size === 1 && joggingWeather(district, hour) && rng.chance(0.07)) {
      lm.jogger = true;
      lm.pace = rng.range(2.8, 3.4);
      lm.walkGesture = null;
    }
    ctx.walking.placeOnWalkway(leader, lm, walkway, toEnd);
    let count = 1;
    for (let i = 1; i < size; i += 1) {
      const slot = i === 1 ? (laneGuess > 0 ? -1 : 1) : 0;
      const kind = rng.chance(0.6) ? archetype : pickArchetype(district, rng, hour);
      const back = slot === 0 ? 1.1 : 0.2;
      const fxs = at.x - fz * (laneGuess + slot * 0.8) - fx * back;
      const fzs = at.z + fx * (laneGuess + slot * 0.8) - fz * back;
      const friend = spawnPerson(kind, fxs, fzs, heading);
      if (!friend) break;
      friend.ai.walkGesture = null;
      ctx.walking.formGroup(leader, friend, slot);
      count += 1;
    }
    lm.walkGesture = size > 1 ? 'talk' : lm.walkGesture;
    lm.talkSwap = ctx.now + rng.range(1, 4);
    return count;
  }

  /**
   * Put a new person into the world with a fresh mind. Their life (walking, standing) is set by the
   * caller. Returns the Character, or null when the character system refused.
   */
  function spawnPerson(archetype, x, z, heading) {
    let look = null;
    try {
      look = game.characters.randomLook(archetype, rng);
    } catch (error) {
      look = null;
    }
    const ped = game.characters.spawn({ kind: 'civilian', faction: 'civilian', archetype, look, x, z, heading });
    if (!ped) return null;
    const mind = minds.length > 0 ? minds.pop() : createPedestrianMind();
    resetMind(mind, archetype);
    ped.ai = mind;
    people.push(ped);
    stats.spawned += 1;
    return ped;
  }

  /** Give a pedestrian's life to a character another system made. */
  function adopt(character, options) {
    const mind = minds.length > 0 ? minds.pop() : createPedestrianMind();
    resetMind(mind, character.look && character.look.archetype ? character.look.archetype : 'civilian');
    character.ai = mind;
    people.push(character);
    if (options && typeof options.fromX === 'number' && options.flee !== false) {
      ctx.reactions.startFlee(character, mind, options.fromX, options.fromZ, 6, 0.9);
    } else {
      ctx.walking.rejoin(character, mind);
    }
  }

  /** Should this person leave the world now (checked about once a second each)? */
  function shouldRemove(ped, mind) {
    const p = ctx.player;
    const dx = ped.pos.x - p.x;
    const dz = ped.pos.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > population.despawnRadius) return true;
    if (ctx.view.canSee(ped.pos.x, ped.pos.z, 260)) {
      mind.unseenSince = ctx.now;
      return false;
    }
    const hidden = ctx.now - mind.unseenSince;
    if (mind.mode === 'call') return false;
    if (mind.mode === 'dead') return hidden > 2 && (ctx.now - mind.modeSince > 25 || d > 120);
    if (d > RECYCLE_DISTANCE && hidden > 4) return true;
    if ((mind.mode === 'flee' || mind.shaken) && d > 55 && hidden > 2.5) return true;
    if (mind.stuck && hidden > 2) return true;
    if (mind.lost && hidden > 1) return true;
    if (mind.sheltering && d > 22 && hidden > 1.5) return true;
    if (d > 75 && hidden > 2 && livingCount() > target + 2) return true;
    return false;
  }

  function livingCount() {
    let n = 0;
    for (let i = 0; i < people.length; i += 1) if (people[i].alive !== false) n += 1;
    return n;
  }

  /** Nobody spawns within `radius` of (x, z) for `seconds` (a cutscene's stage). */
  function keepClear(x, z, radius, seconds) {
    let zone = null;
    for (let i = 0; i < zones.length; i += 1) if (zones[i].until <= ctx.now) zone = zones[i];
    if (!zone) {
      zone = { x: 0, z: 0, radius: 0, until: 0 };
      zones.push(zone);
    }
    zone.x = x;
    zone.z = z;
    zone.radius = radius;
    zone.until = ctx.now + seconds;
  }

  function inClearZone(x, z) {
    for (let i = 0; i < zones.length; i += 1) {
      const zone = zones[i];
      if (zone.until <= ctx.now) continue;
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz < zone.radius * zone.radius) return true;
    }
    return false;
  }

  function expireZones() {
    for (let i = zones.length - 1; i >= 0; i -= 1) if (zones[i].until <= ctx.now && zones.length > 4) zones.splice(i, 1);
  }

  function requestRefill() {
    refillPending = true;
  }

  /** Keep a removed person's mind for the next newcomer (no garbage while the crowd turns over). */
  function recycleMind(mind) {
    if (mind && minds.length < 96) minds.push(mind);
  }

  /** Most people keep a little to the right; some drift left of centre. */
  function rightKeepingLane() {
    return rng.chance(0.72) ? rng.range(0.25, 1.35) : rng.range(-1.2, 0.35);
  }

  /** A fresh personality: pace by who they are, courage, a habit of walking on the phone. */
  function resetMind(mind, archetype) {
    const now = ctx.now;
    mind.owner = ctx.owner;
    mind.archetype = archetype;
    mind.mode = 'walk';
    mind.modeSince = now;
    mind.nextThink = now + rng.next() * 0.25;
    mind.nextCheck = now + 0.5 + rng.next();
    mind.pace = walkingPaceFor(archetype, rng.next());
    mind.speedNow = mind.pace;
    mind.hurry = 1;
    mind.jogger = false;
    mind.courage = courageOf(archetype);
    mind.lane = rightKeepingLane();
    mind.dodge = 0;
    mind.dodgeUntil = 0;
    mind.slowTo = 0;
    mind.slowUntil = 0;
    mind.walkway = null;
    mind.prevWalkway = null;
    mind.toEnd = 1;
    mind.walkGesture = rng.chance(archetype === 'business' ? 0.2 : 0.09) ? 'phone' : null;
    mind.waitGesture = null;
    mind.talkSwap = 0;
    mind.leader = null;
    mind.followers.length = 0;
    mind.slot = 0;
    mind.tx = 0;
    mind.tz = 0;
    mind.travelSpeed = 1.3;
    mind.travelThen = null;
    mind.detourX = 0;
    mind.detourZ = 0;
    mind.detourUntil = 0;
    mind.activity = null;
    mind.site = null;
    mind.spotX = 0;
    mind.spotZ = 0;
    mind.faceYaw = 0;
    mind.gesture = null;
    mind.actPhase = 'do';
    mind.actSpeed = 1.2;
    mind.actUntil = 0;
    mind.actTimer = 0;
    mind.partner = null;
    mind.stall = null;
    mind.altX = 0;
    mind.altZ = 0;
    mind.legX = 0;
    mind.legZ = 0;
    mind.legThen = null;
    mind.fear = 0;
    mind.shaken = false;
    mind.threatX = 0;
    mind.threatZ = 0;
    mind.threatSource = null;
    mind.calmAt = 0;
    mind.fleeSpeed = 0;
    mind.fleeMin = 40;
    mind.fleeX = 0;
    mind.fleeZ = 1;
    mind.dodgeX = 0;
    mind.dodgeZ = 0;
    mind.dodgeDive = false;
    mind.dodgeSpeed = 0;
    mind.lookX = 0;
    mind.lookZ = 0;
    mind.lookRef = null;
    mind.keepAway = 5;
    mind.reactGesture = null;
    mind.nextSwing = 0;
    mind.lowered = -1;
    mind.nextScene = now + rng.next();
    mind.reactUntil = 0;
    mind.pendingKind = null;
    mind.pendingAt = 0;
    mind.pendingX = 0;
    mind.pendingZ = 0;
    mind.pendingSource = null;
    mind.pendingStrength = 0;
    mind.lastBump = -10;
    mind.lastLook = -30;
    mind.lastScene = null;
    mind.dodgeFrom = null;
    mind.fightTarget = null;
    mind.call = null;
    mind.callAt = 0;
    mind.callPhase = '';
    mind.progressX = 0;
    mind.progressZ = 0;
    mind.progressSince = now;
    mind.unstuckFor = -1;
    mind.stuck = false;
    mind.lost = false;
    mind.sheltering = false;
    mind.unseenSince = now;
  }

  function courageOf(archetype) {
    const bold = archetype === 'worker' || archetype === 'local' ? 0.2 : archetype === 'tourist' ? 0.06 : 0.12;
    if (rng.chance(bold)) return rng.range(0.75, 1);
    return rng.range(0.1, 0.68);
  }

  function joggingWeather(district, hour) {
    const kind = district ? district.kind : '';
    return (kind === 'marina' || kind === 'beach' || kind === 'downtown' || kind === 'villas') && ((hour > 6 && hour < 10) || (hour > 17 && hour < 20.5));
  }

  return spawner;
}

/** A blank pedestrian mind (character.ai); the spawner fills in the personality. */
export function createPedestrianMind() {
  return {
    owner: 'pedestrians',
    mode: 'walk',
    followers: [],
    cross: {
      ax: 0, az: 0, bx: 0, bz: 0, ux: 0, uz: 1, length: 0, axis: 'ns', node: null, signal: false,
      slot: 0, depth: 0, waitX: 0, waitZ: 0, goX: 0, goZ: 0, speed: 2, waitSince: 0, from: null,
      nextWalkway: null, nextEnd: 1,
    },
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Within this many metres, a person who could be seen must not simply appear. */
const POP_DISTANCE = 170;
/** People farther than this who nobody can see are taken away and reborn nearer the player. */
const RECYCLE_DISTANCE = 125;
