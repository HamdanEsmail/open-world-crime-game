// The standing lives of Port Sarab: friends chatting on the kerb, someone on the phone, a man leaning
// on a wall, shoppers browsing Old Sarab's stalls while the keepers call out, office workers on the
// Spire plaza, valets at the Mirage Grand, dock hands in hi-vis in the yards, sunbathers, paddlers and
// strollers on Corniche Beach. After a while each walks on and someone else takes their place.
import { createStandingLifeSpawns, pickWeighted } from './standingLifeSpawns.js';
import { buildPedestrianSites, siteOccupancyWanted, findSiteSpot, stallsOf, siteExitOf, crowded, frontYawOf } from './pedestrianSites.js';
import { moveToward, standStill, headingToward, isSpotFree } from './pedestrianSteering.js';

/**
 * Build the standing-life behaviour.
 * @param {Object} ctx  the crowd context from pedestrianSystem.js
 */
export function createPedestrianActivities(ctx) {
  const { game, rng } = ctx;
  let sites = null;
  const neighbours = [];
  const spot = { x: 0, z: 0 };
  const kerb = { walkway: null, x: 0, z: 0 };

  const spawns = createStandingLifeSpawns(ctx, { beginActivity, settleIn, sites: ensureSites });
  const activities = {
    modes: ['activity'],
    think,
    drive,
    trySpawnAtSite: spawns.trySpawnAtSite,
    trySpawnKerbLife: spawns.trySpawnKerbLife,
    maybeStopWhileWalking,
    arrived,
    resume,
    abandon,
    forget,
    end,
    /** Free places at the standing-life sites near the player, as found by the last spawn try. */
    get siteRoom() {
      return spawns.siteRoom;
    },
    get sites() {
      return ensureSites();
    },
  };

  /** Walk to the spot, then stand there doing the thing (facing the right way, with its gesture). */
  function drive(ped, mind) {
    if (mind.actPhase === 'go') {
      const d = moveToward(ped, mind.spotX, mind.spotZ, mind.actSpeed, ctx.speeds);
      ped.intent.gesture = mind.activity === 'inspect' && mind.gesture === 'phone' ? 'phone' : null;
      if (d < 0.35) {
        mind.actPhase = 'do';
        settleIn(ped, mind);
      }
      return;
    }
    standStill(ped, mind.faceYaw, mind.gesture);
  }

  /** Now and then: take turns talking, call to customers, move to the next stall, wade, end. */
  function think(ped, mind) {
    const storm = game.weather ? game.weather.sandstorm || 0 : 0;
    if (storm > 0.45 && mind.activity !== 'keeper') mind.actUntil = Math.min(mind.actUntil, ctx.now + rng.range(0, 3));
    if (ctx.now >= mind.actUntil) {
      end(ped, mind);
      return;
    }
    if (mind.actPhase !== 'do') return;
    switch (mind.activity) {
      case 'chat': thinkChat(ped, mind); break;
      case 'keeper': thinkKeeper(ped, mind); break;
      case 'browse': if (ctx.now >= mind.actTimer) goToStall(ped, mind); break;
      case 'paddle': if (ctx.now >= mind.actTimer) wade(ped, mind); break;
      case 'shoreWalk':
      case 'inspect':
      case 'valet': if (ctx.now >= mind.actTimer) walkOn(mind); break;
      case 'photo':
        if (ctx.now >= mind.actTimer) {
          mind.gesture = mind.gesture === 'phone' ? null : 'phone';
          mind.actTimer = ctx.now + rng.range(2, 5);
        }
        break;
      case 'stand':
        if (ctx.now >= mind.actTimer) {
          mind.gesture = rng.chance(0.3) ? 'phone' : null;
          mind.faceYaw += rng.range(-0.8, 0.8);
          mind.actTimer = ctx.now + rng.range(4, 10);
        }
        break;
      default: break;
    }
  }

  /** Arrived at the spot: face the right way and take up the pose. */
  function settleIn(ped, mind) {
    switch (mind.activity) {
      case 'chat':
        mind.gesture = rng.chance(0.5) ? 'talk' : null;
        mind.actTimer = ctx.now + rng.range(1.5, 4);
        if (mind.partner) mind.faceYaw = headingToward(ped.pos.x, ped.pos.z, mind.partner.pos.x, mind.partner.pos.z);
        break;
      case 'phone': mind.gesture = 'phone'; break;
      case 'lean': mind.gesture = 'lean'; break;
      case 'sit': mind.gesture = 'sit'; break;
      case 'sunbathe':
        mind.gesture = 'sit';
        mind.faceYaw = Math.PI + rng.range(-0.45, 0.45);
        break;
      case 'paddle':
        mind.gesture = null;
        mind.faceYaw = Math.PI + rng.range(-0.8, 0.8);
        mind.actTimer = ctx.now + rng.range(6, 16);
        break;
      case 'keeper':
        mind.gesture = null;
        mind.faceYaw = mind.stall ? mind.stall.faceYaw : mind.faceYaw;
        mind.actTimer = ctx.now + rng.range(2, 6);
        break;
      case 'browse':
        mind.gesture = rng.chance(0.35) ? 'talk' : null;
        if (mind.stall) mind.faceYaw = headingToward(ped.pos.x, ped.pos.z, mind.stall.cx, mind.stall.cz);
        mind.actTimer = ctx.now + rng.range(5, 12);
        break;
      case 'photo':
        mind.gesture = 'phone';
        mind.faceYaw = headingToward(ped.pos.x, ped.pos.z, mind.altX, mind.altZ);
        mind.actTimer = ctx.now + rng.range(3, 6);
        break;
      case 'shoreWalk':
      case 'inspect':
        mind.gesture = mind.activity === 'inspect' && rng.chance(0.3) ? 'phone' : null;
        mind.faceYaw = mind.activity === 'shoreWalk' ? Math.PI + rng.range(-0.5, 0.5) : ped.heading;
        mind.actTimer = ctx.now + rng.range(2, 6);
        break;
      case 'valet':
        mind.gesture = null;
        mind.faceYaw = frontYawOf(mind.site);
        mind.actTimer = ctx.now + rng.range(10, 25);
        break;
      default:
        mind.gesture = null;
        mind.actTimer = ctx.now + rng.range(4, 10);
        break;
    }
  }

  /** Two people chatting take turns to talk; if the other walks off, this one takes out a phone. */
  function thinkChat(ped, mind) {
    const partner = mind.partner;
    if (!partner || !partner.ai || partner.ai.partner !== ped || partner.alive === false) {
      mind.partner = null;
      mind.activity = 'phone';
      mind.gesture = rng.chance(0.5) ? 'phone' : null;
      mind.actUntil = Math.min(mind.actUntil, ctx.now + rng.range(2, 8));
      return;
    }
    mind.faceYaw = headingToward(ped.pos.x, ped.pos.z, partner.pos.x, partner.pos.z);
    if (ctx.now >= mind.actTimer) {
      mind.gesture = partner.ai.gesture === 'talk' ? null : rng.chance(0.7) ? 'talk' : null;
      mind.actTimer = ctx.now + rng.range(1.8, 4.5);
    }
  }

  /** A stall keeper talks with whoever is browsing at the stall, or waves to passers-by. */
  function thinkKeeper(ped, mind) {
    const stall = mind.stall;
    if (!stall) return;
    ctx.grid.query(stall.frontX, stall.frontZ, 1.6, neighbours, ped);
    let customer = null;
    for (let i = 0; i < neighbours.length; i += 1) {
      const other = neighbours[i];
      if (other.ai && other.ai.activity === 'browse' && other.ai.actPhase === 'do') customer = other;
    }
    if (customer) {
      mind.faceYaw = headingToward(ped.pos.x, ped.pos.z, customer.pos.x, customer.pos.z);
      if (ctx.now >= mind.actTimer) {
        mind.gesture = customer.ai.gesture === 'talk' ? null : 'talk';
        mind.actTimer = ctx.now + rng.range(1.5, 3.5);
      }
      return;
    }
    if (ctx.now >= mind.actTimer) {
      mind.faceYaw = stall.faceYaw + rng.range(-0.6, 0.6);
      mind.gesture = mind.gesture === null && rng.chance(0.35) ? 'wave' : null;
      mind.actTimer = ctx.now + (mind.gesture ? rng.range(1.5, 2.5) : rng.range(4, 11));
    }
  }

  /** A shopper moves on to a nearby stall along the aisle, staffed if possible. */
  function goToStall(ped, mind) {
    const site = mind.site;
    if (!site) return;
    const stalls = stallsOf(game, site);
    if (stalls.length === 0) {
      mind.actUntil = ctx.now;
      return;
    }
    let stall = null;
    let best = Infinity;
    for (let tries = 0; tries < 7; tries += 1) {
      const option = stalls[Math.floor(rng.next() * stalls.length)];
      if (option === mind.stall) continue;
      const d = Math.hypot(option.frontX - ped.pos.x, option.frontZ - ped.pos.z);
      const otherAisle = Math.abs((option.frontZ - ped.pos.z) * option.fz + (option.frontX - ped.pos.x) * option.fx) > 2;
      const score = Math.abs(d - 6) + (option.keeper ? 0 : 8) + (otherAisle ? 6 : 0);
      if (score < best) {
        best = score;
        stall = option;
      }
    }
    const side = rng.range(-0.9, 0.9);
    const sx = stall ? stall.frontX + stall.fz * side : 0;
    const sz = stall ? stall.frontZ - stall.fx * side : 0;
    if (!stall || !isSpotFree(game.colliders, sx, sz, 0.35) || crowded(site, sx, sz, 0.9)) {
      mind.actTimer = ctx.now + 2;
      return;
    }
    mind.stall = stall;
    mind.spotX = sx;
    mind.spotZ = sz;
    mind.actPhase = 'go';
    mind.actSpeed = Math.min(mind.pace, 1.15);
  }

  /** A paddler wades a few steps along the shallows. */
  function wade(ped, mind) {
    const x = ped.pos.x + rng.range(-4, 4);
    const z = game.city.coastZ(x) - rng.range(2.5, 7.5);
    if (game.terrain && game.terrain.isWater(x, z)) {
      mind.actTimer = ctx.now + 3;
      return;
    }
    mind.spotX = x;
    mind.spotZ = z;
    mind.actPhase = 'go';
    mind.actSpeed = 0.7;
  }

  /** Waterline strollers, dock inspectors and valets pace between two points. */
  function walkOn(mind) {
    const x = mind.altX;
    const z = mind.altZ;
    mind.altX = mind.spotX;
    mind.altZ = mind.spotZ;
    mind.spotX = x;
    mind.spotZ = mind.activity === 'shoreWalk' ? game.city.coastZ(x) + 1.3 : z;
    mind.actPhase = 'go';
    mind.actSpeed = mind.activity === 'valet' ? 1.6 : Math.min(mind.pace, 1.3) * 0.85;
  }

  /** Done here: walk on along the sidewalk, or out of the site to the nearest one. */
  function end(ped, mind) {
    const site = mind.site;
    abandon(ped, mind);
    if (!site) {
      if (mind.walkway) ctx.walking.placeOnWalkway(ped, mind, mind.walkway, rng.chance(0.5) ? 1 : 0);
      else ctx.walking.rejoin(ped, mind);
      return;
    }
    const exit = siteExitOf(game, site);
    const speed = Math.max(1.1, mind.pace) * mind.hurry;
    if (exit && site.via) {
      mind.legX = exit.x;
      mind.legZ = exit.z;
      mind.legThen = 'walkway';
      ctx.walking.travelTo(ped, mind, site.via.x, site.via.z, speed, 'leg');
    } else if (exit) {
      ctx.walking.travelTo(ped, mind, exit.x, exit.z, speed, 'walkway');
    } else if (site.kind === 'market' && mind.hurry <= 1) {
      // No way out found from this enclosed square: keep shopping until taken away unseen.
      beginActivity(ped, mind, site, 'browse', ped.pos.x, ped.pos.z, 'do');
      mind.actTimer = ctx.now;
    } else {
      mind.lost = true;
      ctx.walking.rejoin(ped, mind);
    }
  }

  /** Leave the spot (a fright, an errand) without walking anywhere yet. */
  function abandon(ped, mind) {
    const site = mind.site;
    if (site) {
      const index = site.occupants.indexOf(ped);
      if (index !== -1) site.occupants.splice(index, 1);
    }
    if (mind.stall && mind.stall.keeper === ped) mind.stall.keeper = null;
    const partner = mind.partner;
    if (partner && partner.ai && partner.ai.partner === ped) {
      partner.ai.partner = null;
      partner.ai.actUntil = Math.min(partner.ai.actUntil, ctx.now + rng.range(0.6, 2.5));
    }
    mind.partner = null;
    mind.stall = null;
    mind.site = null;
    mind.activity = null;
    mind.gesture = null;
  }

  function forget(ped, mind) {
    if (mind) abandon(ped, mind);
  }

  /** Arrived (from a walk) at the planned spot: start the standing life. */
  function arrived(ped, mind) {
    if (!mind.activity) {
      ctx.walking.rejoin(ped, mind);
      return;
    }
    ctx.setMode(ped, 'activity');
    mind.actPhase = 'do';
    settleIn(ped, mind);
  }

  /** After a minor fright: go back to the spot if it is still close, else walk on. */
  function resume(ped, mind) {
    if (!mind.activity) return false;
    if (Math.hypot(mind.spotX - ped.pos.x, mind.spotZ - ped.pos.z) > 12) {
      abandon(ped, mind);
      return false;
    }
    ctx.setMode(ped, 'activity');
    mind.actPhase = 'go';
    mind.actSpeed = Math.min(mind.pace, 1.3);
    return true;
  }

  /**
   * Set someone up for a standing life at (x, z): 'do' starts it there and then, 'go' walks there
   * first. `site` is null for kerb life on a sidewalk.
   */
  function beginActivity(ped, mind, site, kind, x, z, phase) {
    if (site && site.occupants.indexOf(ped) === -1) site.occupants.push(ped);
    mind.site = site;
    mind.activity = kind;
    mind.spotX = x;
    mind.spotZ = z;
    mind.actPhase = phase;
    mind.actSpeed = Math.min(mind.pace, 1.35);
    mind.actUntil = ctx.now + rng.range(DURATIONS[kind][0], DURATIONS[kind][1]);
    mind.actTimer = ctx.now + 1;
    mind.gesture = null;
    if (site) mind.faceYaw = headingToward(x, z, site.cx, site.cz) + rng.range(-0.6, 0.6);
    ctx.setMode(ped, 'activity');
    if (phase === 'do') settleIn(ped, mind);
  }

  /**
   * A walker may stop: to greet someone they know, take a call, look in a window, or wander into a
   * market, plaza or onto the beach close by. Returns true if they stopped.
   */
  function maybeStopWhileWalking(ped, mind) {
    if (mind.followers.length > 0 || mind.leader || mind.jogger || mind.hurry > 1.1 || mind.fear > 0.3) return false;
    const roll = rng.next();
    if (roll < 0.004) return greetSomeone(ped, mind);
    if (roll < 0.0052) return stopOnKerb(ped, mind);
    if (roll < 0.013) return visitSite(ped, mind);
    return false;
  }

  /** Two people who know each other meet on the sidewalk and stop to talk by the wall. */
  function greetSomeone(ped, mind) {
    ctx.grid.query(ped.pos.x, ped.pos.z, 2.6, neighbours, ped);
    for (let i = 0; i < neighbours.length; i += 1) {
      const other = neighbours[i];
      const om = other.ai;
      if (!om || om.mode !== 'walk' || om.followers.length > 0 || om.jogger || om.walkway !== mind.walkway) continue;
      if (om.toEnd === mind.toEnd) continue;
      if (!spawns.kerbSpot(mind.walkway, (ped.pos.x + other.pos.x) / 2, (ped.pos.z + other.pos.z) / 2, 1.2, kerb)) return false;
      const w = mind.walkway;
      beginActivity(ped, mind, null, 'chat', kerb.x + w.dirX * 0.55, kerb.z + w.dirZ * 0.55, 'go');
      beginActivity(other, om, null, 'chat', kerb.x - w.dirX * 0.55, kerb.z - w.dirZ * 0.55, 'go');
      mind.partner = other;
      om.partner = ped;
      om.actUntil = mind.actUntil;
      return true;
    }
    return false;
  }

  /** Step to the building side to take a call, look in a shop window or lean on the wall. */
  function stopOnKerb(ped, mind) {
    const w = mind.walkway;
    if (!w) return false;
    const kind = pickWeighted(KERB_STOPS, rng);
    const toRoad = ctx.walking.roadSideOf(w);
    if (!spawns.kerbSpot(w, ped.pos.x, ped.pos.z, kind === 'phone' ? 1.2 : 2.05, kerb)) return false;
    if (kind !== 'phone' && !spawns.wallBehind(w, kerb.x, kerb.z, toRoad)) return false;
    beginActivity(ped, mind, null, kind, kerb.x, kerb.z, 'go');
    const roadYaw = Math.atan2(-w.dirZ * toRoad, w.dirX * toRoad);
    mind.faceYaw = kind === 'window' ? roadYaw + Math.PI : roadYaw + (kind === 'phone' ? rng.range(-1.2, 1.2) : 0);
    return true;
  }

  /** Wander off the sidewalk into a site whose way out is right here. */
  function visitSite(ped, mind) {
    const list = ensureSites();
    const hour = game.time.hour;
    const storm = game.weather ? game.weather.sandstorm || 0 : 0;
    for (let i = 0; i < list.length; i += 1) {
      const site = list[i];
      if (Math.abs(site.cx - ped.pos.x) > 60 || Math.abs(site.cz - ped.pos.z) > 60) continue;
      const exit = siteExitOf(game, site);
      if (!exit || site.via) continue;
      if (Math.hypot(exit.x - ped.pos.x, exit.z - ped.pos.z) > 12) continue;
      if (siteOccupancyWanted(site, hour, storm) - site.occupants.length <= 0) continue;
      let kind = pickWeighted(site.activities, rng);
      if (kind === 'chat') kind = 'stand';
      if (kind === 'browse') {
        if (stallsOf(game, site).length === 0) continue;
        beginActivity(ped, mind, site, 'browse', ped.pos.x, ped.pos.z, 'do');
        goToStall(ped, mind);
        if (mind.actPhase === 'go') return true;
        abandon(ped, mind);
        ctx.walking.placeOnWalkway(ped, mind, mind.walkway, mind.toEnd);
        return false;
      }
      const zone = site.kind === 'beach' ? (kind === 'paddle' ? 'shallows' : kind === 'shoreWalk' ? 'shore' : 'sand') : null;
      if (!findSiteSpot(game, site, zone, spot, rng)) continue;
      beginActivity(ped, mind, site, kind, spot.x, spot.z, 'go');
      spawns.prepareRoute(ped, mind, site);
      mind.actPhase = 'go';
      return true;
    }
    return false;
  }

  function ensureSites() {
    if (!sites) sites = buildPedestrianSites(game);
    return sites;
  }

  return activities;
}

/** How long each standing life lasts, seconds [min, max]. */
const DURATIONS = {
  chat: [18, 55], phone: [10, 32], lean: [20, 60], sit: [40, 120], stand: [14, 40], photo: [8, 20], window: [6, 16],
  keeper: [400, 900], valet: [300, 700], browse: [40, 110], sunbathe: [90, 300], paddle: [40, 120], shoreWalk: [60, 150],
  inspect: [40, 120],
};
const KERB_STOPS = { phone: 5, window: 3, lean: 1 };
