// The five-star wanted level of Port Sarab: every crime the PSPD hears about adds heat, heat buys
// stars, a pursuit runs while any unit has eyes on the player, and once they lose him a search timer
// runs down until he is clear. Becomes game.wanted; crimeReporting decides which crimes reach it,
// wantedLevelRules holds the numbers.
import { createCrimeReporting } from './crimeReporting.js';
import {
  heatForCrime, starsForHeat, minimumStarsForCrime, searchSecondsForStars, starsAfterCutLoose, STAR_THRESHOLDS,
} from './wantedLevelRules.js';

/** Heat at which each star is earned (index = stars). */
const STAR_HEAT = STAR_THRESHOLDS;
/** Heat lost per second with no stars, and above the current star while the police search. */
const COOL_CLEAR = 0.5;
const COOL_SEARCHING = 1.2;
/** Seconds the police keep track of the player after seeing a crime, and after being given a fix on him (set). */
const SIGHT_GRACE = 1.6;
const FIX_GRACE = 8;

/**
 * Build game.wanted.
 * @param {Object} game
 */
export function createWantedLevel(game) {
  const maxStars = (game.config.wanted && game.config.wanted.maxStars) || 5;
  const evadePerStar = (game.config.wanted && game.config.wanted.evadeSecondsPerStar) || 9;
  let lockedLevel = null;
  let sightGrace = 0;
  let searchElapsed = 0;
  let lastSeenVehicle = null;

  const wanted = {
    /** Stars, 0..5. */
    level: 0,
    get stars() {
      return wanted.level;
    },
    /** 0..1 toward the next star. */
    heat: 0,
    /** Raw heat points (STAR_HEAT is the scale). */
    points: 0,
    /** 'clear' | 'pursuit' | 'search' */
    state: 'clear',
    /** 0..1: how far the search has run down. */
    searchProgress: 0,
    /** Seconds the search lasts at the current level. */
    searchSeconds: 0,
    /** A police unit (or the helicopter) sees the player now. */
    seen: false,
    /** Where the police last knew the player to be. */
    lastKnown: { x: 0, z: 0 },
    /** While searching: the circle the units comb, growing the longer the player stays hidden. */
    searchArea: null,
    /** Seconds since the current pursuit began. */
    pursuitTime: 0,
    /** Times the player has shaken off the PSPD. */
    escapes: 0,
    get locked() {
      return lockedLevel !== null;
    },
    report,
    add,
    set,
    lower,
    clear,
    lock,
    update,
    serialize,
    deserialize,
    crimes: null,
  };
  const area = { x: 0, z: 0, radius: 60 };

  /**
   * The PSPD has learned of a crime at (x, z). Heat is added and stars earned; a crime the police saw
   * puts them on the player at once, one phoned in sends them to search where it happened.
   * @param {string} crimeType  one of the keys of CRIME_HEAT (wantedLevelRules)
   * @param {{victim?:Object, witnessed?:boolean, severity?:number, heat?:number}} [options]
   */
  function report(crimeType, x, z, options) {
    if (lockedLevel !== null) return;
    const o = options || {};
    const amount = typeof o.heat === 'number' ? o.heat * (o.severity > 0 ? o.severity : 1) : heatForCrime(crimeType, o);
    wanted.points += amount;
    const earned = Math.min(maxStars, Math.max(starsForHeat(wanted.points), minimumStarsForCrime(crimeType)));
    if (earned > 0) wanted.points = Math.max(wanted.points, STAR_HEAT[earned]);
    const next = Math.max(wanted.level, Math.min(maxStars, starsAfterCutLoose(earned, cutLoose())));
    const px = Number.isFinite(x) ? x : playerX();
    const pz = Number.isFinite(z) ? z : playerZ();
    if (o.witnessed) {
      sightGrace = SIGHT_GRACE;
      wanted.lastKnown.x = playerX();
      wanted.lastKnown.z = playerZ();
    } else if (wanted.state !== 'pursuit' && next > 0) {
      // A fresh lead: the search moves to where it happened and starts again.
      wanted.lastKnown.x = px;
      wanted.lastKnown.z = pz;
      beginSearch(px, pz, wanted.state === 'clear');
    }
    changeLevel(next);
    refreshHeat();
    game.events.emit('crime:reported', { type: crimeType, x: px, z: pz, witnessed: !!o.witnessed, heat: amount, level: wanted.level });
  }

  /** Raise the level by `stars` (missions, cheats). */
  function add(stars) {
    set(wanted.level + (stars || 1));
  }

  /**
   * Put the level at `level`. Raising it (a mission's alarm) also gives the police a fix on the player
   * for a few seconds; a lower level is the same as lower() and gives them nothing.
   */
  function set(level) {
    if (lockedLevel !== null) return;
    const wantedLevel = Math.max(0, Math.min(maxStars, Math.round(level)));
    if (wantedLevel < wanted.level) lower(wanted.level - wantedLevel);
    else if (wantedLevel > wanted.level) setLevelNow(wantedLevel, true);
  }

  /**
   * Drop the level by `stars` (a fine paid at a police desk, a respray, a safehouse rest): no new
   * sight for the police, lastKnown untouched. Down to zero is clear().
   */
  function lower(stars = 1) {
    if (lockedLevel !== null || wanted.level === 0) return;
    const next = wanted.level - Math.max(1, Math.round(stars));
    if (next <= 0) {
      clear();
      return;
    }
    const heatStars = cutLoose() ? Math.max(0, next - 1) : next;
    wanted.points = STAR_HEAT[heatStars];
    changeLevel(next);
    refreshHeat();
  }

  /** Forget everything: no stars, no heat, no lock (on death, arrest and new games). */
  function clear() {
    lockedLevel = null;
    wanted.points = 0;
    sightGrace = 0;
    searchElapsed = 0;
    wanted.searchArea = null;
    wanted.searchProgress = 0;
    wanted.pursuitTime = 0;
    wanted.seen = false;
    changeLevel(0);
    wanted.state = 'clear';
    refreshHeat();
  }

  /**
   * Hold the level where a mission scripts it: crimes add nothing and the search never ends.
   * lock(null) hands the stars back to the streets.
   */
  function lock(levelOrNull) {
    if (levelOrNull === null || levelOrNull === undefined) {
      lockedLevel = null;
      return;
    }
    lockedLevel = Math.max(0, Math.min(maxStars, Math.round(levelOrNull)));
    setLevelNow(lockedLevel, false);
  }

  /** Once a frame: who sees the player, the pursuit and the search timer, cooling heat. */
  function update(dt) {
    if (wanted.crimes) wanted.crimes.update(dt);
    if (wanted.level === 0) {
      wanted.state = 'clear';
      wanted.seen = false;
      if (wanted.points > 0) wanted.points = Math.max(0, wanted.points - COOL_CLEAR * dt);
      refreshHeat();
      return;
    }
    const player = game.player;
    const frozen = (game.police && game.police.suspended) || !player || !player.character || player.state === 'down';
    if (frozen) return;

    sightGrace = Math.max(0, sightGrace - dt);
    const seen = sightGrace > 0 || !!(game.police && game.police.seesPlayer) || !!(game.policeHelicopter && game.policeHelicopter.seesPlayer);
    wanted.seen = seen;
    if (seen) {
      if (wanted.state !== 'pursuit') {
        wanted.state = 'pursuit';
        game.events.emit('wanted:spotted', { x: playerX(), z: playerZ(), level: wanted.level });
      }
      wanted.lastKnown.x = playerX();
      wanted.lastKnown.z = playerZ();
      wanted.pursuitTime += dt;
      wanted.searchArea = null;
      wanted.searchProgress = 0;
      searchElapsed = 0;
      lastSeenVehicle = player.vehicle;
    } else {
      if (wanted.state === 'pursuit') {
        beginSearch(wanted.lastKnown.x, wanted.lastKnown.z, false);
        game.events.emit('wanted:search', { x: wanted.lastKnown.x, z: wanted.lastKnown.z, level: wanted.level });
      }
      // Until a unit reaches the area the search barely runs: nobody is looking yet.
      searchElapsed += dt * (searchersArrived() ? 1 : 0.5);
      area.radius = Math.min(240, 60 + searchElapsed * 5);
      wanted.searchSeconds = searchSecondsForStars(wanted.level, evadePerStar);
      wanted.searchProgress = Math.min(1, searchElapsed / Math.max(1, wanted.searchSeconds));
      if (wanted.points > STAR_HEAT[wanted.level]) wanted.points = Math.max(STAR_HEAT[wanted.level], wanted.points - COOL_SEARCHING * dt);
      if (wanted.searchProgress >= 1 && lockedLevel === null) escape();
    }
    refreshHeat();
  }

  /** The search ran out: the player got away. */
  function escape() {
    const level = wanted.level;
    wanted.escapes += 1;
    game.events.emit('wanted:escaped', { level });
    game.economy?.addRep?.(10 + level * 15, 'Lost the PSPD');
    game.economy?.stats?.add?.('policeEscapes', 1);
    game.events.emit('notify', { text: level >= 3 ? 'You shook off the PSPD' : 'Lost the PSPD', kind: 'good' });
    wanted.points = 0;
    wanted.searchArea = null;
    wanted.searchProgress = 0;
    wanted.pursuitTime = 0;
    searchElapsed = 0;
    changeLevel(0);
    wanted.state = 'clear';
  }

  /** Start (or restart) a search around (x, z). */
  function beginSearch(x, z, fresh) {
    wanted.state = 'search';
    area.x = x;
    area.z = z;
    area.radius = 60;
    wanted.searchArea = area;
    searchElapsed = 0;
    wanted.searchProgress = 0;
    wanted.pursuitTime = fresh ? 0 : wanted.pursuitTime;
  }

  /** Some unit has reached the search area. */
  function searchersArrived() {
    const units = game.police && game.police.units;
    if (!units || !wanted.searchArea) return false;
    const reach = area.radius + 40;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      const at = unit.vehicle ? unit.vehicle.pos : unit.officers.length ? unit.officers[0].pos : null;
      if (!at || unit.mode !== 'response') continue;
      if ((at.x - area.x) * (at.x - area.x) + (at.z - area.z) * (at.z - area.z) < reach * reach) return true;
    }
    return false;
  }

  /**
   * Put the level at `level` (heat to match). With `raise` the police get a fix on the player, and a
   * player cut loose by his handler gets one star more (the heat stays that of `level`, so the extra
   * star is never counted twice).
   */
  function setLevelNow(level, raise) {
    const asked = Math.max(0, Math.min(maxStars, Math.round(level)));
    if (asked === 0) {
      const keepLock = lockedLevel;
      clear();
      lockedLevel = keepLock;
      return;
    }
    const next = raise ? Math.min(maxStars, starsAfterCutLoose(asked, cutLoose())) : asked;
    wanted.points = Math.max(STAR_HEAT[asked], Math.min(wanted.points, asked < maxStars ? STAR_HEAT[asked + 1] - 1 : wanted.points));
    if (raise || next > wanted.level) {
      if (wanted.state === 'clear') {
        wanted.state = 'pursuit';
        wanted.pursuitTime = 0;
      }
      sightGrace = FIX_GRACE;
      wanted.lastKnown.x = playerX();
      wanted.lastKnown.z = playerZ();
    }
    changeLevel(next);
    refreshHeat();
  }

  /** The handler has dropped the player (story flag): every level from one star up is one star worse. */
  function cutLoose() {
    return !!(game.story && game.story.flags && game.story.flags.cutLoose);
  }

  function changeLevel(next) {
    const previous = wanted.level;
    if (next === previous) return;
    wanted.level = next;
    if (previous === 0 && next > 0 && wanted.state === 'clear') wanted.state = sightGrace > 0 ? 'pursuit' : 'search';
    game.events.emit('wanted:changed', { level: next, previous });
  }

  function refreshHeat() {
    const level = wanted.level;
    if (level >= maxStars) {
      wanted.heat = 1;
      return;
    }
    const low = STAR_HEAT[level];
    const high = STAR_HEAT[level + 1];
    wanted.heat = Math.max(0, Math.min(1, (wanted.points - low) / (high - low)));
  }

  /** What a save keeps: the stars and the heat. */
  function serialize() {
    return { level: wanted.level, points: Math.round(wanted.points) };
  }

  /** Restore saved stars: the police resume a search where the player stands. */
  function deserialize(data) {
    clear();
    if (!data || !(data.level > 0)) {
      wanted.points = data && data.points > 0 ? Math.min(data.points, STAR_HEAT[1] - 1) : 0;
      refreshHeat();
      return;
    }
    const level = Math.min(maxStars, Math.round(data.level));
    wanted.points = Math.max(STAR_HEAT[level], data.points || 0);
    wanted.lastKnown.x = playerX();
    wanted.lastKnown.z = playerZ();
    beginSearch(wanted.lastKnown.x, wanted.lastKnown.z, true);
    changeLevel(level);
    refreshHeat();
  }

  // A different car while nobody is watching: the police are now looking for the wrong one.
  game.events.on('player:enteredVehicle', ({ vehicle }) => {
    if (wanted.state !== 'search' || !vehicle || vehicle === lastSeenVehicle) return;
    const total = searchSecondsForStars(wanted.level, evadePerStar);
    searchElapsed += Math.max(0, total - searchElapsed) / 3;
    lastSeenVehicle = vehicle;
    game.events.emit('notify', { text: 'New wheels: the PSPD is looking for another car', kind: 'info' });
  });

  function playerX() {
    const player = game.player;
    return player && player.character ? player.pos.x : wanted.lastKnown.x;
  }

  function playerZ() {
    const player = game.player;
    return player && player.character ? player.pos.z : wanted.lastKnown.z;
  }

  wanted.crimes = createCrimeReporting(game, wanted);
  return wanted;
}
