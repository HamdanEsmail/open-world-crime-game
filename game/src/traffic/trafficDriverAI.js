// The mind of one civilian driver in Port Sarab. It knows where its car is along its lane, looks down
// the road for cars, wrecks and people in its path, watches the lights, waits its turn at a junction,
// honks at a blockage and then changes lane, pulls round it on the wrong side or backs out, and slows
// to let a siren by. Looking around is staggered across frames; the wheel and pedals act every frame.
import { pointAhead, projectAhead, measureOnLane } from './trafficLanePath.js';
import { mustStopForSignal } from './trafficRules.js';
import { steerTowardPoint, idmAcceleration, applyPedals, backOut, holdStill } from './trafficCarControls.js';

/** Speed (m/s) a driver slows to before a junction without lights, to look both ways. */
const GIVE_WAY_SPEED = 4.6;
/** Speed (m/s) while squeezing past an obstacle on the wrong side of the road. */
const BYPASS_SPEED = 6.5;
/** Sideways speed (m/s) of a lane change or a pull-over. */
const SIDESTEP_RATE = 1.35;
/** How far right (metres) a driver pulls over for a siren. */
const PULL_OVER = 1.7;
/** Seconds into a red light that a turning car still waiting from the green may clear the junction. */
const CLEARING_TIME = 4;

/**
 * Build the driver brains shared by every traffic car.
 * @param {Object} game
 * @param {Object} traffic    the traffic system (grid, drivers, night, stats)
 * @param {Object} junctions  the junction rules (trafficJunctions.js)
 */
export function createTrafficDriverAI(game, traffic, junctions) {
  const point = { x: 0, z: 0, dirX: 0, dirZ: 1 };
  const found = { along: 0, lateral: 0, dirX: 0, dirZ: 1 };
  const onCurve = { distance: 0, piece: 0, lateral: 0, dirX: 0, dirZ: 1 };
  const nearby = new Array(64);
  let alignX = 0;
  let alignZ = 1;
  const alignedWithCar = (lane) => lane.dirX * alignX + lane.dirZ * alignZ > 0.55;
  const laneWidth = game.roads && game.roads.laneWidth ? game.roads.laneWidth : 3.5;

  /**
   * A new driver for a traffic car, with a temperament of its own: most keep a little under the
   * limit and a comfortable gap; a few are in a hurry.
   */
  function createDriverState(vehicle, rng) {
    const hurried = rng.chance(0.08);
    const temperament = hurried ? rng.range(1.13, 1.22) : rng.range(0.8, 1.08);
    const calm = Math.max(0, Math.min(1, (1.15 - temperament) / 0.35));
    const heavy = vehicle.dynamics.profile.heavy;
    return {
      system: 'traffic',
      role: 'driver',
      vehicle,
      driver: null,
      passenger: null,
      lane: null,
      s: 0,
      lateral: 0,
      path: null,
      phase: 0,
      pathS: 0,
      pathPiece: 0,
      committed: false,
      commitColor: null,
      arrivedAt: -1,
      distToLine: Infinity,
      signalGo: true,
      lastColor: null,
      colorSince: 0,
      waitedOnGreen: false,
      refusedSince: -1,
      lastCrashAt: -10,
      waitingFor: null,
      temperament,
      headway: 0.95 + 0.75 * calm + (heavy ? 0.4 : 0),
      minGap: 1.9 + 0.9 * calm,
      comfortAccel: heavy ? 0.85 : 1.25 + 0.9 * (1 - calm),
      comfortDecel: heavy ? 1.8 : 2.1 + 0.9 * (1 - calm),
      reaction: 0.3 + 0.55 * rng.next() * (0.4 + calm),
      mode: 'cruise',
      modeTime: 0,
      haltReason: null,
      threatX: 0,
      threatZ: 0,
      offset: 0,
      offsetTarget: 0,
      bypassRef: null,
      bypassTime: 0,
      obstacleGap: Infinity,
      obstacleSpeed: 0,
      obstacle: null,
      obstacleIsPerson: false,
      stopGap: Infinity,
      accel: 0,
      startDelay: 0,
      blockedTime: 0,
      backoffs: 0,
      hornTime: 0,
      hornCooldown: 0,
      stillTime: 0,
      unstickTime: 0,
      reverseTime: 0,
      reverseSteer: 0,
      astrayTime: 0,
      lost: false,
      lastThink: 0,
      wobble: rng.next() * 6.28,
      confrontStep: 0,
    };
  }

  /** Put the driver on `lane`, `s` metres along it, and decide where it turns at the end. */
  function placeOnLane(state, lane, s) {
    state.lane = lane;
    state.phase = 0;
    state.s = s;
    state.lateral = 0;
    state.offset = 0;
    state.offsetTarget = 0;
    resetJunctionPlan(state);
    choosePath(state, null);
  }

  /**
   * One frame of driving: follow the lane, look around if it is this car's turn to think, then steer
   * and work the pedals (or back out, or sit still when the driver has left the car).
   * @param {boolean} think  this frame the driver looks around and makes its decisions
   */
  function driveTrafficCar(state, dt, think) {
    const vehicle = state.vehicle;
    tickTimers(state, dt);
    if (state.mode === 'abandoned' || state.mode === 'confront' || vehicle.wrecked) {
      holdStill(vehicle, true);
      return;
    }
    trackProgress(state, dt);
    const now = game.time.elapsed;
    if (think) {
      const thinkDt = Math.min(0.5, now - state.lastThink);
      state.lastThink = now;
      lookAhead(state);
      decideAtJunction(state, now);
      handleBlockage(state, thinkDt);
      if (state.reverseTime > 0 && !traffic.grid.rearIsClear(vehicle)) state.reverseTime = 0;
      vehicle.controls.headlights = traffic.night;
    } else {
      const speed = vehicle.speed > 0 ? vehicle.speed : 0;
      state.obstacleGap -= (speed - state.obstacleSpeed) * dt;
      state.stopGap -= speed * dt;
    }
    vehicle.controls.horn = state.hornTime > 0;
    if (state.reverseTime > 0) {
      backOut(vehicle, state, dt);
      return;
    }
    state.offset = approach(state.offset, state.offsetTarget, SIDESTEP_RATE * dt);
    steer(state);
    workPedals(state, dt);
  }

  /** Steer after a point on the road ahead, shifted sideways by the driver's offset. */
  function steer(state) {
    const vehicle = state.vehicle;
    const speed = vehicle.speed > 0 ? vehicle.speed : 0;
    const look = state.phase === 1 ? clampNumber(3.4 + speed * 0.36, 3.6, 9) : clampNumber(4.6 + speed * 0.5, 5, 16);
    pointAhead(state, look, point, junctions);
    let offset = state.offset;
    if (state.mode === 'flee') offset += Math.sin(game.time.elapsed * 1.9 + state.wobble) * 0.55;
    const alpha = steerTowardPoint(vehicle, point.x - point.dirZ * offset, point.z + point.dirX * offset);
    // Facing the wrong way at a crawl (after a crash or a spin): back round instead of circling.
    if (Math.abs(alpha) > 2.1 && speed < 2.5 && state.reverseTime <= 0) startReversing(state, 1.6, alpha > 0 ? 1 : -1);
  }

  /** The speed the driver would like right now, then the IDM, then throttle and brake. */
  function workPedals(state, dt) {
    const vehicle = state.vehicle;
    const speed = vehicle.speed > 0 ? vehicle.speed : 0;
    let accel = idmAcceleration(state, speed, desiredSpeed(state));
    if (state.obstacleGap < 0.4) accel = -vehicle.dynamics.profile.braking;
    // A moment's reaction before moving off from a standstill: queues pull away in a ripple.
    if (speed < 0.4 && accel > 0.15) {
      if (state.startDelay < state.reaction) {
        state.startDelay += dt;
        accel = -1;
      }
    } else if (speed > 1.2) {
      state.startDelay = 0;
    }
    applyPedals(vehicle, state, accel, dt, state.mode === 'flee' && accel > 0.5);
  }

  /** The open-road speed the driver aims for: the limit and its temperament, eased for turns and junctions. */
  function desiredSpeed(state) {
    const lane = state.lane;
    const path = state.path;
    const fleeing = state.mode === 'flee';
    let v0 = lane.speed * state.temperament;
    if (fleeing) v0 = Math.max(lane.speed * 1.45, 19);
    if (state.phase === 0) {
      if (path) {
        let corner = path.safeSpeed * (fleeing ? 1.3 : state.temperament > 1.1 ? 1.08 : 1);
        if (!state.committed && !fleeing && slowsToGiveWay(path)) corner = Math.min(corner, GIVE_WAY_SPEED);
        const room = lane.length - state.s - 2;
        const reachable = Math.sqrt(corner * corner + 2 * state.comfortDecel * (room > 0 ? room : 0));
        if (reachable < v0) v0 = reachable;
      }
    } else {
      const share = state.pathS / path.length;
      const corner = path.safeSpeed * (fleeing ? 1.3 : 1);
      const exit = path.to.speed * state.temperament;
      const through = share < 0.55 ? corner : corner + (exit - corner) * ((share - 0.55) / 0.45);
      if (through < v0) v0 = through;
    }
    if (state.offsetTarget < 0 || state.offset < -1) v0 = Math.min(v0, BYPASS_SPEED);
    if (state.mode === 'yield') v0 = Math.min(v0, 3.5);
    if (state.mode === 'halt' || state.lost) v0 = 0;
    return v0;
  }

  /** Where the car is along its lane or crossing curve; moves on to the next lane at the curve's end. */
  function trackProgress(state, dt) {
    const vehicle = state.vehicle;
    const pos = vehicle.pos;
    if (state.phase === 0) {
      measureOnLane(state, state.lane, vehicle.dynamics.profile.halfLength);
      if (state.s >= state.lane.length - 0.2 && state.path) enterCrossing(state);
    } else {
      junctions.projectOnPath(state.path, pos.x, pos.z, state.pathPiece, onCurve);
      state.pathS = onCurve.distance;
      state.pathPiece = onCurve.piece;
      state.lateral = onCurve.lateral;
      if (state.pathS >= state.path.length - 0.3) leaveCrossing(state);
    }
    const astray = Math.abs(state.lateral - state.offset) > 6 || (state.phase === 0 && state.s < -8);
    state.astrayTime = astray ? state.astrayTime + dt : 0;
    if (state.astrayTime > 0.6) findLaneAgain(state);
  }

  /** The front of the car crosses the stop line: it is in the junction now, whatever happens. */
  function enterCrossing(state) {
    const node = state.lane.to;
    const permitted = state.commitColor === 'green' || state.commitColor === 'yellow' || state.commitColor === 'clearing';
    if (node.signal && !permitted && game.roads.signalFor(state.lane) === 'red') {
      if (state.mode === 'flee') traffic.stats.panicRedRuns += 1;
      else {
        traffic.stats.redLightsRun += 1;
        traffic.noteIncident(`red run #${state.vehicle.id} lane ${state.lane.id} at ${state.vehicle.speed.toFixed(1)} m/s, committed ${state.committed} on ${state.commitColor}`);
      }
    }
    state.phase = 1;
    state.pathS = 0;
    state.pathPiece = 0;
    state.committed = true;
  }

  /** Out of the junction and into the next lane; pick the turn after that. */
  function leaveCrossing(state) {
    const lane = state.path.to;
    state.lane = lane;
    state.phase = 0;
    const pos = state.vehicle.pos;
    state.s = (pos.x - lane.x0) * lane.dirX + (pos.z - lane.z0) * lane.dirZ;
    resetJunctionPlan(state);
    choosePath(state, null);
  }

  /** Knocked off its lane (a crash, a shove, a spin): find the nearest lane running its way. */
  function findLaneAgain(state) {
    const vehicle = state.vehicle;
    state.astrayTime = 0;
    alignX = Math.sin(vehicle.heading);
    alignZ = Math.cos(vehicle.heading);
    const hit = game.roads.nearestLane(vehicle.pos.x, vehicle.pos.z, 18, alignedWithCar);
    if (!hit) {
      state.lost = true;
      return;
    }
    state.lost = false;
    state.offsetTarget = 0;
    state.bypassRef = null;
    placeOnLane(state, hit.lane, hit.t * hit.lane.length);
    state.offset = clampNumber(state.lateral, -4, 4);
  }

  /** Choose the turn at the end of the lane (a fleeing driver turns away from the trouble). */
  function choosePath(state, avoid) {
    const lane = state.lane;
    let awayX = 0;
    let awayZ = 0;
    if (state.mode === 'flee') {
      awayX = state.vehicle.pos.x - state.threatX;
      awayZ = state.vehicle.pos.z - state.threatZ;
      const length = Math.sqrt(awayX * awayX + awayZ * awayZ);
      if (length > 0.01) {
        awayX /= length;
        awayZ /= length;
      }
    }
    const next = junctions.chooseNextLane(lane, state.vehicle.spec.className, avoid, awayX, awayZ);
    state.path = next ? junctions.pathBetween(lane, next) : null;
  }

  function resetJunctionPlan(state) {
    state.committed = false;
    state.commitColor = null;
    state.arrivedAt = -1;
    state.signalGo = true;
    state.waitedOnGreen = false;
    state.refusedSince = -1;
    state.waitingFor = null;
    state.pathS = 0;
    state.pathPiece = 0;
  }

  /**
   * Look down the road: the nearest vehicle or person in the car's own path (its lane, the crossing
   * curve, the next lane), allowing for how wide each one is across that path. A person is a
   * standing obstacle; a vehicle moves at its speed along the path.
   */
  function lookAhead(state) {
    const vehicle = state.vehicle;
    const profile = vehicle.dynamics.profile;
    const speed = vehicle.speed > 0 ? vehicle.speed : 0;
    const reach = clampNumber(16 + speed * 2.6, 22, 70);
    const hx = Math.sin(vehicle.heading);
    const hz = Math.cos(vehicle.heading);
    const count = traffic.grid.query(vehicle.pos.x + hx * reach * 0.45, vehicle.pos.z + hz * reach * 0.45, reach * 0.62, nearby);
    const panic = state.mode === 'flee';
    let bestGap = Infinity;
    let bestSpeed = 0;
    let best = null;
    let person = false;
    for (let k = 0; k < count; k += 1) {
      const thing = nearby[k];
      if (thing === vehicle) continue;
      const isVehicle = thing.dynamics !== undefined;
      if (!isVehicle && thing.vehicle) continue;
      if (!projectAhead(state, thing.pos.x, thing.pos.z, reach, found)) continue;
      if (found.along < 0.3) continue;
      let halfAlong = 0.3;
      let halfAcross = 0.3;
      let margin = panic ? 0.25 : 0.85;
      if (isVehicle) {
        const other = thing.dynamics.profile;
        const cos = Math.abs(Math.sin(thing.heading) * found.dirX + Math.cos(thing.heading) * found.dirZ);
        const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
        halfAlong = other.halfLength * cos + other.halfWidth * sin;
        halfAcross = other.halfWidth * cos + other.halfLength * sin;
        margin = panic ? 0.12 : 0.4;
      }
      if (Math.abs(found.lateral - state.offset) > profile.halfWidth + halfAcross + margin) continue;
      const gap = found.along - profile.halfLength - halfAlong;
      if (gap < bestGap) {
        bestGap = gap;
        best = thing;
        person = !isVehicle;
        bestSpeed = isVehicle ? thing.vel.x * found.dirX + thing.vel.z * found.dirZ : 0;
      }
    }
    state.obstacleGap = bestGap;
    state.obstacleSpeed = bestSpeed;
    state.obstacle = best;
    state.obstacleIsPerson = person;
  }

  /**
   * The stop line ahead: stop for a red light, for a yellow one when there is room to stop, and for a
   * busy junction or a full exit; otherwise commit to crossing once inside braking distance. Sets
   * state.stopGap (the room left to the line, or Infinity).
   */
  function decideAtJunction(state, now) {
    state.stopGap = Infinity;
    state.waitingFor = null;
    if (state.phase !== 0) return;
    const vehicle = state.vehicle;
    const lane = state.lane;
    if (!state.path) {
      state.stopGap = Math.max(0, state.distToLine - 1);
      return;
    }
    const fleeing = state.mode === 'flee';
    const speed = vehicle.speed > 0 ? vehicle.speed : 0;
    const toLine = state.distToLine - 0.8;
    const node = lane.to;
    // Only the first car in the queue takes its turn; the ones behind simply follow it.
    const headOfQueue = state.obstacleGap > toLine + 1.5;
    if (state.committed) {
      // A committed car keeps its turn unless something stopped in front of it, or (committed on a
      // green further back) the light changes while it can still stop comfortably.
      if (headOfQueue || state.obstacleSpeed > 1) {
        if (!node.signal || fleeing || state.commitColor === 'clearing' || game.roads.signalFor(lane) === 'green') return;
        if (!mustStopForSignal('yellow', toLine - 1, speed, state.comfortDecel)) return;
      }
      state.committed = false;
      state.commitColor = null;
    }
    let go = true;
    let color = null;
    if (node.signal) {
      color = game.roads.signalFor(lane);
      if (color !== state.lastColor) {
        state.lastColor = color;
        state.colorSince = now;
      }
      if (!fleeing) {
        if (color === 'red') {
          // A turn that waited all through the green for oncoming traffic clears the junction as
          // the light changes, as if it had been waiting out in the box.
          go = state.waitedOnGreen && toLine < 3 && now - state.colorSince < CLEARING_TIME;
          if (go) color = 'clearing';
        } else if (color === 'yellow' && !state.waitedOnGreen) {
          go = !mustStopForSignal(color, toLine, speed, state.comfortDecel);
        }
      }
      state.signalGo = go && color !== 'clearing';
    }
    if (!headOfQueue || toLine > 8) state.arrivedAt = -1;
    else if (state.arrivedAt < 0 && toLine < 5 && speed < 4.5) state.arrivedAt = now;
    const decisionPoint = Math.max(3, (speed * speed) / (2 * state.comfortDecel) + 4);
    if (toLine > decisionPoint + 20 || !headOfQueue || !go || fleeing) state.refusedSince = -1;
    if (toLine > decisionPoint + 20 || !headOfQueue) {
      if (!go) state.stopGap = toLine;
      return;
    }
    if (go && !fleeing) {
      const clear = junctions.mayEnter(state, now);
      if (clear) state.refusedSince = -1;
      else if (state.refusedSince < 0) state.refusedSince = now;
      if (!clear && color === 'green') state.waitedOnGreen = true;
      go = clear && junctions.exitHasRoom(state);
    }
    if (go && toLine <= decisionPoint) {
      state.committed = true;
      state.commitColor = color;
      return;
    }
    if (!go) state.stopGap = toLine;
  }

  /**
   * Stuck behind something that is not just a queue (a wreck, a parked car, a person standing in the
   * road, a car whose driver got out): honk after a few seconds, then change lane or pull round it on
   * the oncoming side when that is clear, and after about eight seconds back up and take another way.
   */
  function handleBlockage(state, thinkDt) {
    const vehicle = state.vehicle;
    if (state.offsetTarget < 0) followBypass(state, thinkDt);
    let blocked = false;
    if (Math.abs(vehicle.speed) < 0.8 && state.obstacleGap < 6 && state.obstacleGap < state.stopGap) {
      const thing = state.obstacle;
      if (state.obstacleIsPerson) blocked = true;
      else if (thing) {
        const other = thing.ai;
        const queueing = other && other.system === 'traffic' && other.role === 'driver' && !thing.wrecked
          && other.mode !== 'abandoned' && other.mode !== 'confront' && other.blockedTime < 3;
        blocked = !queueing;
      }
    }
    state.blockedTime = blocked ? state.blockedTime + thinkDt : Math.max(0, state.blockedTime - thinkDt * 3);
    if (!blocked) {
      if (state.blockedTime === 0) state.backoffs = 0;
      return;
    }
    if (state.blockedTime > (state.obstacleIsPerson ? 1.2 : 2.6) && state.hornCooldown <= 0) {
      state.hornTime = 0.3 + Math.random() * 0.8 * state.temperament;
      state.hornCooldown = state.hornTime + 1.2 + Math.random() * 2.4;
    }
    if (state.blockedTime > 5 && state.offsetTarget === 0 && state.phase === 0 && state.reverseTime <= 0 && startBypass(state)) return;
    if (state.blockedTime > 8.5 && state.reverseTime <= 0 && state.backoffs < 3) {
      state.backoffs += 1;
      state.blockedTime = 4.2;
      startReversing(state, 2.2, Math.random() < 0.5 ? -0.45 : 0.45);
      if (state.phase === 0 && state.path) choosePath(state, state.path.to);
    }
  }

  /** Change into the next lane the same way if it is clear, or borrow the oncoming lane of a street. */
  function startBypass(state) {
    const lane = state.lane;
    const edge = lane.edge;
    const ahead = state.obstacleGap;
    for (let i = 0; i < edge.lanes.length; i += 1) {
      const sibling = edge.lanes[i];
      if (sibling.from !== lane.from || Math.abs(sibling.index - lane.index) !== 1) continue;
      const side = (sibling.index - lane.index) * laneWidth;
      if (!stretchClear(state, side - 1.6, side + 1.6, -10, ahead + 14)) continue;
      moveToLane(state, sibling);
      return true;
    }
    if (edge.lanesEachWay !== 1 || !state.obstacle) return false;
    if (lane.length - state.s < ahead + 22) return false;
    if (!stretchClear(state, -laneWidth - 1.7, -laneWidth + 1.7, -4, ahead + 60)) return false;
    state.offsetTarget = -laneWidth;
    state.bypassRef = state.obstacle;
    state.bypassTime = 0;
    if (ahead < 3) startReversing(state, 0.9, 0);
    return true;
  }

  /** Passing on the wrong side: back into lane once past, or if someone comes the other way first. */
  function followBypass(state, thinkDt) {
    state.bypassTime += thinkDt;
    const ref = state.bypassRef;
    const lane = state.lane;
    const halfLength = state.vehicle.dynamics.profile.halfLength;
    let passed = !ref || ref.despawned === true;
    let alongside = false;
    if (!passed) {
      const along = (ref.pos.x - lane.x0) * lane.dirX + (ref.pos.z - lane.z0) * lane.dirZ - state.s;
      const refHalf = ref.dynamics ? ref.dynamics.profile.halfLength : 0.4;
      passed = along < -(refHalf + halfLength + 2.5);
      alongside = along < refHalf + halfLength + 1;
    }
    const oncoming = !alongside && !stretchClear(state, -laneWidth - 1.6, -laneWidth + 1.6, 0, 32);
    if (passed || oncoming || state.bypassTime > 14 || state.phase !== 0 || lane.length - state.s < 10) {
      state.offsetTarget = 0;
      state.bypassRef = null;
    }
  }

  /** Is a stretch of road beside or ahead of the car (in its lane's terms) free of vehicles and people? */
  function stretchClear(state, latMin, latMax, alongMin, alongMax) {
    return traffic.grid.stretchIsClear(state.lane, state.s, latMin, latMax, alongMin, alongMax, state.vehicle);
  }

  /** Back up for `seconds` with the wheel at `steer`, if the way behind is clear. */
  function startReversing(state, seconds, steer) {
    if (!traffic.grid.rearIsClear(state.vehicle)) return false;
    state.reverseTime = seconds;
    state.reverseSteer = steer;
    return true;
  }

  /** Switch to a neighbouring lane the same way; the sideways offset then eases the car across. */
  function moveToLane(state, lane) {
    state.lane = lane;
    state.phase = 0;
    measureOnLane(state, lane, state.vehicle.dynamics.profile.halfLength);
    state.offset = clampNumber(state.lateral, -laneWidth * 1.2, laneWidth * 1.2);
    state.offsetTarget = 0;
    state.blockedTime = 0;
    resetJunctionPlan(state);
    choosePath(state, null);
  }

  /** Horn bursts, the mode clock, the pull-over offset, and catching a car that is pushing against a wall. */
  function tickTimers(state, dt) {
    const vehicle = state.vehicle;
    if (state.hornTime > 0) state.hornTime -= dt;
    if (state.hornCooldown > 0) state.hornCooldown -= dt;
    const speed = Math.abs(vehicle.speed);
    state.stillTime = speed < 0.3 ? state.stillTime + dt : 0;
    if (state.mode === 'flee' || state.mode === 'yield') {
      state.modeTime -= dt;
      if (state.modeTime <= 0) {
        state.mode = 'cruise';
        if (state.offsetTarget > 0) state.offsetTarget = 0;
      }
    }
    if (state.mode === 'yield') {
      const lane = state.lane;
      const inner = lane && lane.edge.lanesEachWay > 1 && lane.index < lane.edge.lanesEachWay - 1;
      state.offsetTarget = inner ? 0 : PULL_OVER;
    } else if (state.mode === 'halt') {
      state.offsetTarget = 1.1;
    }
    const c = vehicle.controls;
    if (c.throttle > 0.5 && speed < 0.4 && state.reverseTime <= 0) state.unstickTime += dt;
    else state.unstickTime = 0;
    if (state.unstickTime > 1.8) {
      state.unstickTime = 0;
      startReversing(state, 1.4, c.steer > 0 ? -0.8 : 0.8);
    }
  }

  /** Look down the road and at the junction ahead right now (a car just placed on a lane). */
  function lookAround(state) {
    lookAhead(state);
    decideAtJunction(state, game.time.elapsed);
  }

  return { createDriverState, placeOnLane, driveTrafficCar, lookAround, choosePath };
}

/** A junction without lights (and not a highway running straight through) is taken at a crawl. */
function slowsToGiveWay(path) {
  const node = path.node;
  if (node.signal || node.edges.length < 3) return false;
  return !(path.from.kind === 'highway' && path.to.kind === 'highway');
}

function approach(value, target, step) {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}

function clampNumber(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
