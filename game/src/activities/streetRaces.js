// Street racing in Port Sarab: five races started from their flags around the city in any car
// ("E  Race: Corniche Sprint ($200 entry)"). Rivals line up on a grid, the lights count 3-2-1-GO with
// everyone held on the line, beacons mark the next checkpoint, the HUD shows the place and the lap,
// and the purse, the reputation and the best time are handed out at the line. Winning a race opens a
// harder rematch with faster rivals and a bigger purse.
import { buildStreetRaceRoutes, gridSlot } from './raceRoutes.js';
import { createRaceRivalDrivers, RIVAL_DRIVERS } from './raceRivalDrivers.js';
import { racePrizeForPlace, raceRepForPlace } from './activityRules.js';

/** Names of the harder rematches, by how many times the race has been won. */
const TIER_NAMES = ['', 'Pro', 'Elite', 'Legend'];
/** Seconds the player may spend out of a car before the race is lost. */
const OUT_OF_CAR_LIMIT = 15;
const RACE_PURPLE = 0xd78bff;

/**
 * Build the street races (game.activities.races).
 * @returns {{id:string, routes:Object[], records:Object, start(raceId:string, options?:{free?:boolean}):boolean, stop(reason:string):void,
 *   update(dt:number):void, serialize():Object, deserialize(data:Object):void, current:Object|null}}
 */
export function createStreetRaces(game, activities) {
  const routes = buildStreetRaceRoutes();
  const drivers = createRaceRivalDrivers(game);
  const records = {};
  const starts = [];
  for (const route of routes) {
    records[route.id] = { best: null, wins: 0, runs: 0 };
    const place = game.city.place(route.placeId);
    if (!place) continue;
    starts.push({ route, place, pose: activities.kerbPose(place), prompt: '', poorPrompt: '', marker: null });
  }
  refreshStartPrompts();
  showStartMarkers(true);

  const slot = { x: 0, z: 0, heading: 0 };
  const card = {
    id: '', title: '', giver: 'activity', kicker: 'STREET RACE', side: true,
    objectives: [{ text: '', done: false }, { text: 'Finish in the top three', done: false, optional: true }],
    timer: null,
    counter: { label: 'Position', value: 1, of: 1 },
    race: { position: 1, racers: 1, lap: 1, laps: 1, checkpoint: 0, checkpoints: 0, elapsed: 0, best: null },
  };
  const countdownTimer = { label: 'Start', seconds: 3 };
  const outOfCarTimer = { label: 'Get back in', seconds: OUT_OF_CAR_LIMIT };
  let race = null;
  let savedTrafficDensity = null;

  const module = {
    id: 'races',
    routes,
    records,
    start,
    stop,
    update,
    serialize,
    deserialize,
    get current() {
      return race;
    },
  };

  /** Each frame: run the race, or offer a race to a driver stopped at a start flag. */
  function update(dt) {
    if (race) {
      updateRace(dt);
      return;
    }
    if (game.mode !== 'playing') return;
    const vehicle = activities.playerVehicle();
    if (!vehicle || Math.abs(vehicle.speed) > 7 || !activities.canStart()) return;
    for (let i = 0; i < starts.length; i += 1) {
      const flag = starts[i];
      const dx = vehicle.pos.x - flag.pose.x;
      const dz = vehicle.pos.z - flag.pose.z;
      if (dx * dx + dz * dz > 18 * 18) continue;
      const entry = entryFee(flag.route);
      const affordable = !game.economy || game.economy.money >= entry;
      if (activities.offer(22, 'E', affordable ? flag.prompt : flag.poorPrompt)) {
        if (affordable) start(flag.route.id);
        else activities.toast(`You need ${activities.money(entry)} for the entry fee`, 'bad');
      }
      return;
    }
  }

  /**
   * Line up on the grid and start the countdown. The player must be driving.
   * @param {string} raceId 'corniche'|'spires'|'docks'|'dunes'|'highway'
   */
  function start(raceId, options) {
    const route = routes.find((candidate) => candidate.id === raceId);
    if (!route) return false;
    if (race) finishCleanup();
    if (!activities.canStart()) return false;
    const vehicle = activities.playerVehicle();
    if (!vehicle) {
      activities.toast('Races are for drivers: get a car first', 'bad');
      return false;
    }
    const record = records[route.id];
    const tier = Math.min(TIER_NAMES.length - 1, record.wins);
    const entry = entryFee(route);
    if (!(options && options.free) && game.economy && !game.economy.spend(entry, `Race entry: ${route.name}`)) {
      activities.toast(`You need ${activities.money(entry)} for the entry fee`, 'bad');
      return false;
    }

    const points = [];
    for (let lap = 0; lap < route.laps; lap += 1) for (const point of route.points) points.push(point);
    race = {
      route, tier, entry, points, grid: route.grid,
      laps: route.laps,
      lapLength: route.points.length,
      state: 'countdown',
      countdown: 3.999,
      lastCount: 4,
      elapsed: 0,
      racers: [],
      player: null,
      finished: 0,
      outOfCar: 0,
      overFor: 0,
      lastPosition: 0,
      lingering: 0,
      tauntCooldown: 4,
      next: null,
      after: null,
      title: tier > 0 ? `${route.name} ${TIER_NAMES[tier]}` : route.name,
    };
    drivers.prepareRaceLine(race);

    // Rivals on the front slots, the player at the back of the grid.
    const lineup = route.rivals.slice();
    if (tier > 0) lineup[lineup.length - 1] = route.proRival;
    clearGrid(route, lineup.length + 1, vehicle);
    const cast = pickRivalCast(route, lineup.length);
    for (let i = 0; i < lineup.length; i += 1) {
      gridSlot(route.grid, i, slot);
      const rival = drivers.spawnRival(race, lineup[i], slot, cast[i], i);
      if (rival) race.racers.push(rival);
    }
    gridSlot(route.grid, lineup.length, slot);
    game.vehicles.place(vehicle, slot.x, slot.z, slot.heading);
    game.cameraRig?.setYaw?.(slot.heading);
    game.cameraRig?.snap?.();
    race.player = { isPlayer: true, name: 'You', next: 0, progress: 0, finished: false, finishTime: 0, place: 0, dnf: false };
    race.racers.push(race.player);

    showStartMarkers(false);
    race.next = game.markers.add({ kind: 'objective', owner: 'streetRace', pos: { x: 0, y: 0, z: 0 }, beacon: true, route: true, color: RACE_PURPLE, radius: 6, label: 'Checkpoint' });
    race.after = game.markers.add({ kind: 'objective', owner: 'streetRace', pos: { x: 0, y: 0, z: 0 }, beacon: true, route: false, color: 0x6b4a8a, radius: 3, edge: false, label: 'Next checkpoint' });
    pointCheckpointMarkers();
    thinTraffic(true);

    card.id = `race_${route.id}`;
    card.title = race.title;
    card.objectives[0].text = 'Wait for the lights';
    card.objectives[0].done = false;
    card.objectives[1].done = false;
    countdownTimer.seconds = 3;
    card.timer = countdownTimer;
    card.counter.value = race.racers.length;
    card.counter.of = race.racers.length;
    card.race.racers = race.racers.length;
    card.race.laps = route.laps;
    card.race.lap = 1;
    card.race.checkpoints = route.points.length;
    card.race.checkpoint = 0;
    card.race.elapsed = 0;
    card.race.best = record.best;
    activities.begin(module, card);
    const rival = race.racers[0];
    if (rival && rival.profile) activities.say(rival.name, rival.profile.taunt, 3.2);
    game.economy?.stats?.add?.('racesEntered', 1);
    return true;
  }

  function updateRace(dt) {
    const r = race;
    if (r.state === 'countdown') {
      r.countdown -= dt;
      holdPlayerOnLine();
      const count = Math.ceil(r.countdown);
      if (count !== r.lastCount) {
        r.lastCount = count;
        if (count > 0) {
          activities.banner(String(count), r.title, 'info', 0.9);
          game.events.emit('activity:countdown', { count });
          game.audio?.play?.('menuMove');
        }
      }
      countdownTimer.seconds = Math.max(0, r.countdown);
      if (r.countdown <= 0) {
        r.state = 'racing';
        card.timer = null;
        activities.banner('GO!', r.title, 'good', 1.2);
        game.events.emit('activity:countdown', { count: 0 });
        game.audio?.play?.('menuSelect');
        refreshObjective();
      }
      for (let i = 0; i < r.racers.length; i += 1) if (!r.racers[i].isPlayer) drivers.driveRival(r.racers[i], r, dt, 0);
      return;
    }

    if (r.state === 'racing') r.elapsed += dt;
    const player = r.player;
    if (r.state === 'racing') updatePlayerRacer(dt);
    if (!race) return;
    for (let i = 0; i < r.racers.length; i += 1) {
      const racer = r.racers[i];
      if (racer.isPlayer) continue;
      const wasFinished = racer.finished;
      drivers.driveRival(racer, r, dt, player.progress);
      if (racer.finished && !wasFinished) {
        r.finished += 1;
        racer.place = r.finished;
        if (r.state === 'racing') activities.toast(`${racer.name} crosses the line ${activities.ordinal(racer.place)}`, 'info');
      }
    }
    if (r.state === 'over') {
      r.overFor += dt;
      const pos = game.player ? game.player.pos : null;
      const far = pos ? Math.hypot(pos.x - r.points[r.points.length - 1].x, pos.z - r.points[r.points.length - 1].z) > 160 : true;
      if (r.overFor > 12 || (far && r.overFor > 3)) finishCleanup();
      return;
    }
    rankRacers(dt);
  }

  /** The player's side of the race: checkpoints, laps, leaving the car, the finish line. */
  function updatePlayerRacer(dt) {
    const r = race;
    const player = r.player;
    const vehicle = activities.playerVehicle();
    if (!vehicle) {
      r.outOfCar += dt;
      outOfCarTimer.seconds = Math.max(0, OUT_OF_CAR_LIMIT - r.outOfCar);
      if (card.timer !== outOfCarTimer) {
        card.timer = outOfCarTimer;
        card.objectives[0].text = 'Get back in a car';
      }
      if (r.outOfCar > OUT_OF_CAR_LIMIT) loseRace('You walked away from the race');
      return;
    }
    if (r.outOfCar > 0) {
      r.outOfCar = 0;
      card.timer = null;
      refreshObjective();
    }
    if (!drivers.checkpointPassed(r, player.next, vehicle.pos.x, vehicle.pos.z)) return;
    player.next += 1;
    game.audio?.play?.('pickup');
    const total = r.points.length;
    if (player.next >= total) {
      player.finished = true;
      player.finishTime = r.elapsed;
      r.finished += 1;
      player.place = r.finished;
      winOrLose();
      return;
    }
    const lapDone = player.next % r.lapLength === 0;
    game.events.emit('race:checkpoint', { index: player.next, total, lap: Math.floor(player.next / r.lapLength) + 1 });
    if (lapDone) {
      const lap = player.next / r.lapLength + 1;
      activities.banner(lap === r.laps ? 'FINAL LAP' : `LAP ${lap}`, activities.clock(r.elapsed), 'info', 1.6);
    }
    pointCheckpointMarkers();
    refreshObjective();
  }

  /** Places by distance covered; a rival who passes the player gets a word in. */
  function rankRacers(dt) {
    const r = race;
    const player = r.player;
    for (let i = 0; i < r.racers.length; i += 1) drivers.measureProgress(r.racers[i], r);
    let position = 1;
    let justAhead = null;
    let justAheadGap = Infinity;
    for (let i = 0; i < r.racers.length; i += 1) {
      const racer = r.racers[i];
      if (racer === player || racer.dnf) continue;
      const gap = racer.progress - player.progress;
      if (gap > 0) {
        position += 1;
        if (gap < justAheadGap) {
          justAheadGap = gap;
          justAhead = racer;
        }
      }
    }
    r.tauntCooldown -= dt;
    if (r.lastPosition && position > r.lastPosition && justAhead && justAhead.profile && r.tauntCooldown <= 0) {
      activities.say(justAhead.name, justAhead.profile.passed, 2.6);
      r.tauntCooldown = 9;
    }
    r.lastPosition = position;
    card.counter.value = position;
    card.race.position = position;
    card.race.elapsed = r.elapsed;
    card.objectives[1].done = position <= 3;

    // Everyone else is home: the race will not wait forever.
    if (r.finished >= r.racers.length - 1 && !player.finished && r.state === 'racing') {
      r.lingering += dt;
      if (r.lingering > 45) loseRace('Everyone else has gone home');
    }
  }

  /** Across the line: purse and reputation by place, best time, and a rematch for a winner. */
  function winOrLose() {
    const r = race;
    const route = r.route;
    const record = records[route.id];
    const place = r.player.place;
    const time = r.player.finishTime;
    const newBest = record.best === null || time < record.best;
    if (newBest) record.best = time;
    record.runs += 1;
    const prize = racePrizeForPlace(place, r.entry);
    const rep = raceRepForPlace(place, r.entry);
    const timeText = `${activities.clock(time)}${newBest ? '  NEW BEST' : ''}`;
    activities.banner(`${activities.ordinal(place).toUpperCase()} PLACE`, timeText, place === 1 ? 'good' : place <= 3 ? 'info' : 'bad', 4);
    game.events.emit('race:finished', { raceId: route.id, position: place, time, best: record.best, newBest });
    endRace();
    if (place === 1) {
      record.wins += 1;
      game.economy?.stats?.add?.('racesWon', 1);
      const runnerUp = race.racers.find((racer) => racer.place === 2 && racer.profile);
      if (runnerUp) activities.say(runnerUp.name, runnerUp.profile.beaten, 3);
      if (record.wins < TIER_NAMES.length) {
        activities.toast(`Rematch open: ${route.name} ${TIER_NAMES[Math.min(TIER_NAMES.length - 1, record.wins)]}`, 'good');
      }
      refreshStartPrompts();
    }
    if (place <= 3) {
      activities.complete(module, { title: r.title, reward: prize, rep, detail: `${activities.ordinal(place)} place · ${timeText}` });
    } else {
      game.economy?.addRep?.(rep, r.title);
      activities.fail(module, `Finished ${activities.ordinal(place)} · ${activities.clock(time)}`);
    }
  }

  function loseRace(reason) {
    endRace();
    activities.fail(module, reason);
  }

  /** The race is decided: markers off, traffic back; rivals cruise home for a few seconds. */
  function endRace() {
    const r = race;
    r.state = 'over';
    r.overFor = 0;
    game.markers.removeByOwner('streetRace');
    r.next = null;
    r.after = null;
    thinTraffic(false);
    showStartMarkers(true);
  }

  /** Stopped from outside (a story job, knocked out, arrested): clear everything at once. */
  function stop() {
    if (!race) return;
    if (race.state !== 'over') endRace();
    finishCleanup();
  }

  function finishCleanup() {
    if (!race) return;
    for (const racer of race.racers) if (!racer.isPlayer) drivers.releaseRival(racer);
    game.markers.removeByOwner('streetRace');
    thinTraffic(false);
    showStartMarkers(true);
    race = null;
  }

  /** Keep the player's car on the line while the lights count down. */
  function holdPlayerOnLine() {
    const vehicle = activities.playerVehicle();
    if (!vehicle) return;
    const c = vehicle.controls;
    c.brake = 1;
    c.handbrake = true;
    c.steer = 0;
  }

  /** The beacons: the next checkpoint (routed by the GPS) and the one after it. */
  function pointCheckpointMarkers() {
    const r = race;
    const next = r.points[r.player.next];
    const after = r.points[r.player.next + 1];
    if (r.next && next) {
      r.next.pos.x = next.x;
      r.next.pos.z = next.z;
      r.next.radius = Math.min(9, next.r * 0.6);
      r.next.color = r.player.next === r.points.length - 1 ? 0xfff4d6 : RACE_PURPLE;
      r.next.label = r.player.next === r.points.length - 1 ? 'Finish line' : 'Checkpoint';
    }
    if (r.after) {
      if (after) {
        r.after.pos.x = after.x;
        r.after.pos.z = after.z;
        r.after.beacon = true;
      } else {
        r.after.beacon = false;
        r.after.pos.x = next ? next.x : 0;
        r.after.pos.z = next ? next.z : 0;
      }
    }
  }

  function refreshObjective() {
    const r = race;
    const next = r.player.next;
    const lap = Math.min(r.laps, Math.floor(next / r.lapLength) + 1);
    const inLap = (next % r.lapLength) + 1;
    card.race.lap = lap;
    card.race.checkpoint = next;
    card.objectives[0].text = next === r.points.length - 1
      ? 'Cross the finish line'
      : r.laps > 1 ? `Lap ${lap} / ${r.laps} · checkpoint ${inLap} / ${r.lapLength}` : `Checkpoint ${inLap} / ${r.lapLength}`;
  }

  /** Clear parked and unattended cars off the grid so the racers do not spawn into them. */
  function clearGrid(route, count, keep) {
    const list = game.vehicles.list;
    const front = route.grid;
    const reach = 10 + Math.ceil(count / 2) * 8;
    const fx = Math.sin(front.heading);
    const fz = Math.cos(front.heading);
    const cx = front.x - fx * (reach / 2 - 6);
    const cz = front.z - fz * (reach / 2 - 6);
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const vehicle = list[i];
      if (vehicle === keep || vehicle.isPlayer || vehicle.tags.owned || vehicle.tags.missionTarget || vehicle.tags.mission) continue;
      if (vehicle.driver || vehicle.faction === 'police') continue;
      if (Math.hypot(vehicle.pos.x - cx, vehicle.pos.z - cz) < reach) game.vehicles.despawn(vehicle);
    }
    game.traffic?.clearArea?.(cx, cz, reach);
  }

  /** Who races today: the right number of named rivals, the same faces for the same race. */
  function pickRivalCast(route, count) {
    const cast = [];
    const offset = route.id.length + routes.indexOf(route) * 3;
    for (let i = 0; i < count; i += 1) cast.push(RIVAL_DRIVERS[(offset + i * 3) % RIVAL_DRIVERS.length]);
    return cast;
  }

  /** Ask the traffic system for quieter roads while a race runs, if it offers a density control. */
  function thinTraffic(on) {
    const traffic = game.traffic;
    if (!traffic) return;
    if (on && savedTrafficDensity === null) {
      if (typeof traffic.setDensity === 'function') {
        savedTrafficDensity = typeof traffic.density === 'number' ? traffic.density : 1;
        traffic.setDensity(savedTrafficDensity * 0.35);
      } else if (typeof traffic.density === 'number') {
        savedTrafficDensity = traffic.density;
        traffic.density = savedTrafficDensity * 0.35;
      }
    } else if (!on && savedTrafficDensity !== null) {
      if (typeof traffic.setDensity === 'function') traffic.setDensity(savedTrafficDensity);
      else traffic.density = savedTrafficDensity;
      savedTrafficDensity = null;
    }
  }

  /** The flags on the map while no race runs. */
  function showStartMarkers(on) {
    for (const start of starts) {
      if (on && !start.marker) {
        start.marker = game.markers.add({
          kind: 'race', owner: 'raceStarts', pos: { x: start.place.x, y: 0, z: start.place.z }, edge: false,
          color: RACE_PURPLE, label: start.route.name,
        });
      } else if (!on && start.marker) {
        game.markers.remove(start.marker);
        start.marker = null;
      }
    }
  }

  function entryFee(route) {
    const tier = Math.min(TIER_NAMES.length - 1, records[route.id].wins);
    return Math.round(route.entry * (1 + 0.5 * tier));
  }

  /** Prompt texts are built once per change, not every frame. */
  function refreshStartPrompts() {
    for (const start of starts) {
      const route = start.route;
      const record = records[route.id];
      const tier = Math.min(TIER_NAMES.length - 1, record.wins);
      const name = tier > 0 ? `${route.name} ${TIER_NAMES[tier]}` : route.name;
      const fee = activities.money(entryFee(route));
      const best = record.best !== null ? ` · best ${activities.clock(record.best)}` : '';
      start.prompt = `Race: ${name} (${fee} entry)${best}`;
      start.poorPrompt = `Race: ${name} (needs ${fee})`;
    }
  }

  function serialize() {
    const out = {};
    for (const id of Object.keys(records)) out[id] = { best: records[id].best, wins: records[id].wins, runs: records[id].runs };
    return { records: out };
  }

  function deserialize(data) {
    stop();
    const saved = (data && data.records) || {};
    for (const id of Object.keys(records)) {
      const entry = saved[id] || {};
      records[id].best = typeof entry.best === 'number' ? entry.best : null;
      records[id].wins = entry.wins || 0;
      records[id].runs = entry.runs || 0;
    }
    refreshStartPrompts();
  }

  return module;
}
