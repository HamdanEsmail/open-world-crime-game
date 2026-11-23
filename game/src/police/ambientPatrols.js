// The PSPD's everyday presence in Port Sarab when nobody is wanted: two or three cruisers driving
// the lanes near the player like careful traffic (stopping at red lights, braking for people), and
// pairs of officers walking a beat outside the police stations, on the Vane Spire plaza and along
// Lantern Row after dark. They are the eyes that turn a crime into a star, and the first to answer.

/** Patrol cars appear this far from the player, out of his sight, and leave beyond DESPAWN. */
const CRUISER_SPAWN = [150, 320];
const CRUISER_DESPAWN = 460;
/** Seconds between two new patrol cars. */
const CRUISER_INTERVAL = 5;
/** A foot post is manned while the player is within this range, and stood down beyond the second. */
const POST_ACTIVE = 210;
const POST_RELEASE = 290;
/** Mid-block points on the north pavement of Lantern Row, manned after dark. */
const LANTERN_ROW_POSTS = [-262, -58, 142];

/**
 * Build the everyday patrols.
 * @param {Object} game
 * @param {Object} roster   policeUnitRoster
 * @param {Object} driver   pursuitDriverAI (for its road helpers)
 * @param {Object} officers officerAI
 * @param {Object} sight    policeSight
 */
export function createAmbientPatrols(game, roster, driver, officers, sight) {
  const rng = game.rng.fork('police-patrols');
  const posts = buildFootPosts(game);
  const cruise = { x: 0, z: 0, speed: 0, stop: false, stopX: 0, stopZ: 0 };
  const cruiseOptions = { aggression: 0.25, allowReverse: true, stopAtTarget: false, arriveRadius: 3 };
  const stopOptions = { aggression: 0.25, allowReverse: false, stopAtTarget: true, arriveRadius: 2.5 };
  let spawnTimer = 1.5;
  let postTimer = 0;
  let postCursor = 0;

  const patrols = {
    /** Foot posts: [{x, z, beatX, beatZ, nightOnly, name, unit}]. */
    posts,
    /** Patrol cars on the road now. */
    cruisers: 0,
    update,
  };

  /** Once a frame: drive the cruisers, keep their number up, man and stand down the foot posts. */
  function update(dt, ctx) {
    if (!ctx.hasPlayer) return;
    let cruisers = 0;
    const units = roster.units;
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const unit = units[i];
      if (unit.mode !== 'patrol') continue;
      if (!unit.vehicle || unit.vehicle.wrecked) {
        // The car is gone (stolen or burnt out): the crew answer on foot, or walk off if nobody is wanted.
        unit.mode = ctx.level > 0 ? 'response' : 'leaving';
        unit.modeTime = 0;
        continue;
      }
      cruisers += 1;
      driveCruiser(unit, dt, ctx);
      if ((unit.distance > CRUISER_DESPAWN && !unit.visibleToPlayer) || (unit.stuckTime > 12 && !unit.visibleToPlayer)) {
        roster.removeUnit(unit);
        cruisers -= 1;
      }
    }
    patrols.cruisers = cruisers;
    spawnTimer -= dt;
    if (ctx.level === 0 && !ctx.playerDown && spawnTimer <= 0 && cruisers < cruisersWanted(ctx)) {
      spawnTimer = spawnCruiser(ctx) ? CRUISER_INTERVAL : 1;
    }
    postTimer -= dt;
    if (postTimer <= 0 && posts.length > 0) {
      postTimer = 0.4;
      postCursor = (postCursor + 1) % posts.length;
      tendPost(posts[postCursor], ctx);
    }
  }

  /** Drive like careful traffic: follow the lanes, stop for red lights, brake for whatever is ahead. */
  function driveCruiser(unit, dt, ctx) {
    const vehicle = unit.vehicle;
    const autopilot = game.vehicles && game.vehicles.autopilot;
    if (!autopilot) return;
    const c = vehicle.controls;
    const drive = unit.drive;
    c.siren = false;
    c.headlights = ctx.night > 0.35;
    driver.roads.cruiseLanes(drive, vehicle, cruise);
    if (cruise.stop) autopilot.driveToward(vehicle, cruise.stopX, cruise.stopZ, cruise.speed, stopOptions);
    else autopilot.driveToward(vehicle, cruise.x, cruise.z, cruise.speed, cruiseOptions);
    const speed = Math.abs(vehicle.speed);
    drive.obstacleTimer -= dt;
    if (drive.obstacleTimer <= 0) {
      drive.obstacleTimer = 0.2;
      const ahead = autopilot.obstacleAhead(vehicle, 8 + speed * 1.2);
      const room = 4 + speed * 0.9;
      drive.obstacleBrake = ahead.distance < room ? Math.max(0.3, Math.min(1, 1.2 - ahead.distance / room)) : 0;
    }
    if (drive.obstacleBrake > 0) {
      c.throttle = 0;
      c.brake = Math.max(c.brake, drive.obstacleBrake);
    }
    // Stuck: no progress for a while although nothing holds it back.
    drive.progressTimer += dt;
    if (drive.progressTimer >= 1) {
      const moved = Math.hypot(vehicle.pos.x - drive.progressX, vehicle.pos.z - drive.progressZ);
      drive.progressX = vehicle.pos.x;
      drive.progressZ = vehicle.pos.z;
      const waiting = cruise.stop || drive.obstacleBrake > 0;
      unit.stuckTime = !waiting && moved < 1 ? unit.stuckTime + drive.progressTimer : 0;
      drive.progressTimer = 0;
    }
  }

  /** Put a new cruiser on a lane out of the player's sight. Returns true when one was placed. */
  function spawnCruiser(ctx) {
    const roads = game.roads;
    if (!roads || !roads.randomLaneNear || !game.vehicles) return false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const hit = roads.randomLaneNear(ctx.px, ctx.pz, CRUISER_SPAWN[0], CRUISER_SPAWN[1], rng);
      if (!hit) continue;
      const x = hit.x;
      const z = hit.z;
      const lane = hit.lane;
      if (game.vehicles.nearest(x, z, 12)) continue;
      if (sight.playerVisibleFrom(x, 1.4, z, 260)) continue;
      const unit = roster.spawnCarUnit({ specId: 'pspd_interceptor', x, z, heading: lane.heading, crew: 2, mode: 'patrol' });
      if (!unit) return false;
      unit.drive.lane = lane;
      unit.drive.nextLane = null;
      driver.roads.joinLanes(unit.drive, x, z);
      unit.role = 'patrol';
      unit.state = 'patrolling';
      unit.drive.progressX = x;
      unit.drive.progressZ = z;
      return true;
    }
    return false;
  }

  /** More patrols downtown, on the strip and in the old town; one out in the dunes; none at sea. */
  function cruisersWanted(ctx) {
    const city = game.city;
    const district = city && city.districtAt ? city.districtAt(ctx.px, ctx.pz) : null;
    const kind = district ? district.kind : 'downtown';
    if (kind === 'sea') return 0;
    if (kind === 'desert') return 1;
    if (kind === 'downtown' || kind === 'strip' || kind === 'oldtown') return 3;
    return 2;
  }

  /** Man a foot post when the player comes near (after dark for Lantern Row), stand it down when he leaves. */
  function tendPost(post, ctx) {
    const d = Math.hypot(post.x - ctx.px, post.z - ctx.pz);
    const open = !post.nightOnly || ctx.night > 0.5;
    if (post.unit && post.unit.removed) post.unit = null;
    if (!post.unit) {
      if (!open || ctx.level > 0 || ctx.playerDown || d > POST_ACTIVE) return;
      if (d < 90 && sight.playerVisibleFrom(post.x, 1.6, post.z, 120)) return;
      const unit = roster.spawnFootUnit({ x: post.x, z: post.z, heading: Math.atan2(post.beatX, post.beatZ), count: 2, mode: 'footPatrol', home: post });
      if (!unit) return;
      for (let i = 0; i < unit.officers.length; i += 1) {
        const side = i === 0 ? 0 : 1.5;
        officers.startPatrol(unit.officers[i], post.x - post.beatZ * side, post.z + post.beatX * side, post.beatX, post.beatZ);
      }
      post.unit = unit;
      return;
    }
    const unit = post.unit;
    if (unit.mode !== 'footPatrol') return;
    if (d > POST_RELEASE || (!open && d > 120 && !unit.visibleToPlayer)) {
      roster.removeUnit(unit);
      post.unit = null;
    }
  }

  return patrols;
}

/** The posts officers on foot keep: each police station, the Vane Spire plaza, and Lantern Row at night. */
function buildFootPosts(game) {
  const posts = [];
  const city = game.city;
  if (!city) return posts;
  const addPost = (x, z, alongX, name, nightOnly) => {
    posts.push({ x, z, beatX: alongX ? 1 : 0, beatZ: alongX ? 0 : 1, name, nightOnly, unit: null });
  };
  const stations = city.placesOfKind ? city.placesOfKind('policeStation') : [];
  for (let i = 0; i < stations.length; i += 1) {
    const place = stations[i];
    const alongX = Math.abs(Math.sin(place.heading || 0)) < 0.5;
    addPost(place.x, place.z, alongX, place.name, false);
  }
  const spire = city.place ? city.place('vane_spire_door') : null;
  if (spire) addPost(spire.x + 14, spire.z, Math.abs(Math.sin(spire.heading || 0)) < 0.5, 'Vane Spire plaza', false);
  const lantern = city.streets ? city.streets.find((street) => street.name === 'Lantern Row') : null;
  if (lantern) {
    const half = city.roadKinds[lantern.kind].width / 2 + 2.5;
    for (let i = 0; i < LANTERN_ROW_POSTS.length; i += 1) addPost(LANTERN_ROW_POSTS[i], lantern.z - half, true, 'Lantern Row', true);
  }
  return posts;
}
