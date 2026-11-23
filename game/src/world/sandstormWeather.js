// The khamsin: the hot sandstorm wind that rolls out of the Amber Dunes and swallows Port Sarab.
// It arrives as a towering wall of dust from the south, the air turns thick amber, visibility falls
// to a few dozen metres, the sun shrinks to a pale copper coin and sand races past in gusts. The
// story's heist happens inside it. Owns game.weather: the storm's strength, the wind and visibility.
import * as THREE from 'three';
import { createSandstormDustLayers } from './sandstormDustLayers.js';

/**
 * Create the weather of Port Sarab. Returns the object the game keeps as game.weather.
 * Emits 'weather:changed' {sandstorm, state, target} when a storm starts, peaks, starts to clear and has cleared.
 */
export function createSandstormWeather(game) {
  const layers = createSandstormDustLayers(game);

  const weather = {
    /** 0 clear .. 1 a full khamsin. */
    sandstorm: 0,
    /** Metres at which the haze has swallowed 95% of what is behind it. */
    visibility: 3500,
    /** Wind velocity at street level, m/s, world axes (toward where it blows). */
    wind: new THREE.Vector3(1, 0, 3),
    /** 0..1, the pulse of the gusts right now. */
    gust: 0,
    /** 'clear' | 'arriving' | 'raging' | 'clearing' */
    state: 'clear',
    /** Metres from the camera to the advancing wall of dust, or Infinity when there is none. */
    frontDistance: Infinity,
    start,
    clear,
    set,
    update,
  };

  let target = 0;
  let rampFrom = 0;
  let rampSeconds = 0;
  let rampElapsed = 0;
  let withFront = false;
  let windClock = 0;
  const blowFrom = new THREE.Vector3();

  /**
   * Begin a khamsin rising to `intensity` (0..1) over `rampSeconds`. Starting from clear air it
   * arrives as a wall of dust from the dunes; rampSeconds 0 sets it at once (staged scenes, loading a save).
   */
  function start(intensity = 1, seconds = 50) {
    target = clamp01(intensity);
    rampFrom = weather.sandstorm;
    rampSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    rampElapsed = 0;
    if (rampSeconds === 0 || target <= rampFrom) {
      weather.sandstorm = target;
      weather.state = target > 0 ? 'raging' : 'clear';
      weather.frontDistance = Infinity;
      withFront = false;
      announce(target > 0 ? 'raging' : 'clear');
      return;
    }
    withFront = rampFrom < 0.25;
    weather.state = 'arriving';
    weather.frontDistance = withFront ? FRONT_START_DISTANCE : Infinity;
    announce('arriving');
  }

  /** Let the storm blow itself out over `rampSeconds` (0 clears at once). */
  function clear(seconds = 30) {
    target = 0;
    rampFrom = weather.sandstorm;
    rampSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    rampElapsed = 0;
    withFront = false;
    weather.frontDistance = Infinity;
    if (rampSeconds === 0 || rampFrom <= 0) {
      weather.sandstorm = 0;
      weather.state = 'clear';
      announce('clear');
      return;
    }
    weather.state = 'clearing';
    announce('clearing');
  }

  /** Set the storm's strength at once, without an arrival (for staged scenes and saved games). */
  function set(intensity) {
    start(intensity, 0);
  }

  /** Advance the storm, the wind and the visibility, and move the blowing sand. */
  function update(dt) {
    const step = Number.isFinite(dt) ? Math.max(dt, 0) : 0;
    advanceStorm(step);
    blowTheWind(step);
    measureVisibility();
    layers.update(step, weather, blowFrom);
  }

  /** Ramp the strength along the arrival or the clearing. */
  function advanceStorm(dt) {
    if (weather.state === 'arriving') {
      rampElapsed += dt;
      const p = Math.min(rampElapsed / rampSeconds, 1);
      // A little haze ahead of the wall, then the bulk of it as the wall rolls over the city.
      const rise = withFront ? 0.15 * smoothstep(0, 0.7, p) + 0.85 * smoothstep(0.5, 1, p) : smoothstep(0, 1, p);
      weather.sandstorm = rampFrom + (target - rampFrom) * rise;
      weather.frontDistance = withFront && p < FRONT_PASSES_AT ? FRONT_START_DISTANCE * (1 - p / FRONT_PASSES_AT) : Infinity;
      if (p >= 1) {
        weather.sandstorm = target;
        weather.state = 'raging';
        weather.frontDistance = Infinity;
        announce('raging');
      }
    } else if (weather.state === 'clearing') {
      rampElapsed += dt;
      const p = Math.min(rampElapsed / rampSeconds, 1);
      weather.sandstorm = rampFrom * (1 - smoothstep(0, 1, p));
      if (p >= 1) {
        weather.sandstorm = 0;
        weather.state = 'clear';
        announce('clear');
      }
    }
  }

  /** A light sea breeze in clear weather; the khamsin's hot gusts out of the south in a storm. */
  function blowTheWind(dt) {
    windClock += dt;
    const t = windClock;
    const pulse = 0.5 + 0.3 * Math.sin(t * 0.53) + 0.2 * Math.sin(t * 1.37 + 1.1) + 0.12 * Math.sin(t * 3.1 + 2.3);
    weather.gust = clamp01(pulse) * clamp01(pulse);
    const s = weather.sandstorm;
    const stormShare = smoothstep(0, 0.3, s);
    const veer = 0.12 * Math.sin(t * 0.07);
    blowFrom.set(-0.28 + veer, 0, 1).normalize();
    const breezeSpeed = 3;
    const stormSpeed = (9 + 15 * s) * (0.65 + 0.7 * weather.gust);
    weather.wind.set(
      SEA_BREEZE.x * breezeSpeed * (1 - stormShare) - blowFrom.x * stormSpeed * stormShare,
      0,
      SEA_BREEZE.z * breezeSpeed * (1 - stormShare) - blowFrom.z * stormSpeed * stormShare,
    );
  }

  /** Visibility closes in from the clear-day haze to a few dozen metres, breathing with the gusts. */
  function measureVisibility() {
    const clearVisibility = game.sky?.clearVisibility ?? 3500;
    const s = weather.sandstorm;
    if (s <= 0) {
      weather.visibility = clearVisibility;
      return;
    }
    const stormVisibility = STORM_VISIBILITY * (1.3 - 0.45 * weather.gust);
    const k = Math.pow(s, 0.6);
    weather.visibility = Math.exp(Math.log(clearVisibility) + (Math.log(stormVisibility) - Math.log(clearVisibility)) * k);
  }

  function announce(state) {
    game.events.emit('weather:changed', { sandstorm: weather.sandstorm, state, target });
  }

  return weather;
}

/** Clamp to 0..1; anything that is not a number counts as 0. */
function clamp01(value) {
  return value > 0 ? (value < 1 ? value : 1) : 0;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Visibility at the heart of a full khamsin, metres. */
const STORM_VISIBILITY = 70;
/** How far away the wall of dust first rises over the dunes, metres. */
const FRONT_START_DISTANCE = 2600;
/** The share of the arrival after which the wall has rolled past the camera. */
const FRONT_PASSES_AT = 0.72;
/** The afternoon breeze off the gulf blows toward the south-south-east. */
const SEA_BREEZE = new THREE.Vector3(0.3, 0, 1).normalize();
