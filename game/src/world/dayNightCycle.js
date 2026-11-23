// Day and night over Port Sarab. Owns the scene's only real lights (the sun, which becomes the moon
// by night, and the blue-sky and warm-sand bounce), the haze and the camera exposure, all driven by
// the clock in game.time.hour. It walks the sun along its arc from the dunes in the east to the gulf
// in the west-north-west, keeps the sun's shadow box on the player, and tells the city when night falls.
import * as THREE from 'three';
import { createSkyDome } from './skyDome.js';
import { createTimeOfDayState, sampleTimeOfDay } from './skyLightingKeyframes.js';

/**
 * Create the day-night cycle with its sky dome, sun, bounce light and haze.
 * Returns the object the game keeps as game.sky.
 * Emits 'time:nightfall' {hour} and 'time:daybreak' {hour} as `night` crosses one half.
 */
export function createDayNightCycle(game) {
  const { scene, renderer, camera } = game;
  const shadowEdgeFade = installShadowEdgeFade();
  const state = createTimeOfDayState();
  const dome = createSkyDome(game);

  const sunLight = new THREE.DirectionalLight(0xffffff, 3);
  sunLight.name = 'sunAndMoonLight';
  sunLight.castShadow = true;
  const shadowBox = configureSunShadow(sunLight, game.config.render);
  scene.add(sunLight, sunLight.target);

  const hemisphereLight = new THREE.HemisphereLight(0xb8d6f6, 0xdcbc8c, 1.3);
  hemisphereLight.name = 'skyAndSandBounce';
  scene.add(hemisphereLight);

  scene.fog = new THREE.FogExp2(0xf7c98a, 0.0006);

  const colors = {
    sun: new THREE.Color(),      // light from the sun (or moon) on a white surface facing it
    ambient: new THREE.Color(),  // light from the sky on a white surface facing up
    ground: new THREE.Color(),   // bounce from the sand on a white surface facing down
    zenith: new THREE.Color(),
    mid: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    glow: new THREE.Color(),
    band: new THREE.Color(),     // the sunset band along the horizon under a low sun
    dust: new THREE.Color(),     // the colour the khamsin's air takes at this hour, lit
  };

  const sky = {
    /** Unit vector toward the light that is up: the sun by day, the moon by night. */
    sunDirection: new THREE.Vector3(0, 1, 0),
    /** Unit vector toward the real sun, below the horizon at night. */
    trueSunDirection: new THREE.Vector3(0, 1, 0),
    moonDirection: new THREE.Vector3(0, 0.5, -0.86),
    sunElevation: 0,
    sunLight,
    hemisphereLight,
    dome,
    night: 0,
    lightIntensity: 0,
    glowStrength: 0,
    fogDensity: 0.0005,
    clearVisibility: 3500,
    exposure: 1,
    phase: '',
    shadowEdgeFade,
    colors,
    setHour,
    update,
  };

  const lightDir = new THREE.Vector3(0, 1, 0);
  const appliedLightDir = new THREE.Vector3(0, 1, 0);
  const center = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tint = new THREE.Color();
  let isNight = null;

  /** Jump the clock to `hour` (0..24) and relight at once. */
  function setHour(hour) {
    game.time.hour = ((hour % 24) + 24) % 24;
    update(0);
  }

  /** Relight the world for the current hour and weather, and move the shadow box. */
  function update(dt) {
    const hour = Number.isFinite(game.time.hour) ? game.time.hour : 12;
    sampleTimeOfDay(hour, state);
    sunPathDirection(hour, sky.trueSunDirection);
    moonPathDirection(hour, sky.moonDirection);
    const sun = sky.trueSunDirection;
    sky.sunElevation = Math.asin(sun.y);
    sky.phase = state.name;
    sky.night = state.night;

    const storm = clamp01(game.weather?.sandstorm ?? 0);
    chooseActiveLight(sun, sky.moonDirection, state, storm);
    mixSkyAndHaze(state, storm);
    lightTheWorld(state, storm);
    paintTheDome(state, storm);
    dome.update(dt);
    followShadowFocus();
    announceNightAndDay(hour);
  }

  /** The sun by day, the moon by night; the swap happens while both are dark, below the horizon. */
  function chooseActiveLight(sun, moon, key, storm) {
    const useSun = sun.y > -0.06;
    const weight = useSun ? smoothstep(-0.05, 0.02, sun.y) : 1 - smoothstep(-0.12, -0.07, sun.y);
    lightDir.copy(useSun ? sun : moon);
    sky.sunDirection.copy(lightDir);
    sky.lightIntensity = key.lightIntensity * weight * (1 - 0.85 * storm);
  }

  /** The sky's three bands and the haze, thickened toward the khamsin's dust. */
  function mixSkyAndHaze(key, storm) {
    const thick = 1 - Math.pow(1 - storm, 2.2);
    colors.dust.copy(key.dust);
    colors.horizon.copy(key.horizon).lerp(colors.dust, thick);
    colors.mid.copy(key.mid).lerp(colors.dust, thick * 0.92);
    colors.zenith.copy(key.zenith).lerp(colors.dust, thick * 0.78 + storm * storm * 0.22);
    colors.fog.copy(colors.horizon);
    colors.glow.copy(key.glow);
    colors.band.copy(key.band);
    sky.glowStrength = key.glowStrength * (1 - 0.7 * storm);

    sky.clearVisibility = FOG_VISIBILITY_FACTOR / key.fogDensity;
    let density = key.fogDensity;
    const visibility = game.weather?.visibility;
    if (storm > 0.0005 && visibility > 0) density = Math.max(density, FOG_VISIBILITY_FACTOR / visibility);
    sky.fogDensity = density;
    if (scene.fog && scene.fog.isFogExp2) {
      scene.fog.color.copy(colors.fog);
      scene.fog.density = density;
    }
  }

  /** Sun colour and strength, the sky-and-sand bounce, and the camera exposure. */
  function lightTheWorld(key, storm) {
    tint.setHex(STORM_SUN_COPPER);
    sunLight.color.copy(key.light).lerp(tint, storm * 0.5);
    sunLight.intensity = sky.lightIntensity;
    colors.sun.copy(sunLight.color).multiplyScalar(sky.lightIntensity / Math.PI);

    tint.copy(colors.dust).multiplyScalar(1.3);
    hemisphereLight.color.copy(key.hemiSky).lerp(tint, storm * 0.8);
    hemisphereLight.groundColor.copy(key.hemiGround).lerp(colors.dust, storm * 0.6);
    hemisphereLight.intensity = key.hemiIntensity * (1 + 0.05 * storm);
    colors.ambient.copy(hemisphereLight.color).multiplyScalar(hemisphereLight.intensity / Math.PI);
    colors.ground.copy(hemisphereLight.groundColor).multiplyScalar(hemisphereLight.intensity / Math.PI);

    sky.exposure = key.exposure * (1 + 0.08 * storm);
    renderer.toneMappingExposure = sky.exposure;
  }

  /** Hand the colours of this moment to the sky dome's shader. */
  function paintTheDome(key, storm) {
    const u = dome.uniforms;
    u.uZenith.value.copy(colors.zenith);
    u.uMid.value.copy(colors.mid);
    u.uHorizon.value.copy(colors.horizon);
    u.uSunDir.value.copy(sky.trueSunDirection);
    u.uGlowColor.value.copy(colors.glow);
    u.uBandColor.value.copy(colors.band);
    u.uGlowStrength.value = sky.glowStrength;

    tint.setHex(STORM_DISC_COPPER);
    u.uDiscColor.value.copy(key.disc).lerp(tint, storm);
    const nearHorizon = 1 - smoothstep(0.0, 0.25, sky.trueSunDirection.y);
    u.uDiscSize.value = SUN_DISC_RADIUS * (1 + 0.3 * nearHorizon) * (1 + 0.25 * storm);
    u.uDiscAlpha.value = 1 - 0.55 * storm;

    u.uMoonDir.value.copy(sky.moonDirection);
    u.uMoonAlpha.value = smoothstep(0.2, 0.75, key.night) * (1 - 0.8 * storm);
    u.uCloudLit.value.copy(key.cloudLit);
    u.uCloudShade.value.copy(key.cloudShade);
    u.uCloudCover.value = key.cloudCover;
    u.uCloudOpacity.value = key.cloudOpacity;
    u.uStars.value = key.stars * (1 - storm);
    u.uStorm.value = storm;
  }

  /**
   * Keep the sun's shadow box on the player (a little ahead, where the camera looks), snapped to
   * whole shadow texels in the light's own frame so shadow edges hold still as the player moves.
   */
  function followShadowFocus() {
    if (1 - appliedLightDir.dot(lightDir) > LIGHT_DIRECTION_STEP) appliedLightDir.copy(lightDir);
    const rigFocus = game.cameraRig?.focus;
    const focus = rigFocus && rigFocus.isVector3 ? rigFocus : camera.position;
    camera.getWorldDirection(forward);
    forward.y = 0;
    const length = forward.length();
    if (length > 1e-4) forward.multiplyScalar((shadowBox.half * SHADOW_LOOK_AHEAD) / length);
    else forward.set(0, 0, 0);
    let groundY = focus.y;
    if (!(rigFocus && rigFocus.isVector3)) groundY = game.terrain?.heightAt?.(focus.x, focus.z) ?? 0;
    center.set(focus.x + forward.x, groundY, focus.z + forward.z);

    const L = appliedLightDir;
    right.set(L.z, 0, -L.x);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(L, right);
    const cx = Math.round(center.dot(right) / shadowBox.texel) * shadowBox.texel;
    const cy = Math.round(center.dot(up) / shadowBox.texel) * shadowBox.texel;
    const cz = center.dot(L);
    sunLight.target.position.set(0, 0, 0).addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(L, cz);
    sunLight.position.copy(sunLight.target.position).addScaledVector(L, SUN_LIGHT_DISTANCE);
  }

  /** Tell the city once each time night falls or the day breaks. */
  function announceNightAndDay(hour) {
    if (isNight === null) {
      isNight = sky.night > 0.5;
      return;
    }
    if (!isNight && sky.night > 0.52) {
      isNight = true;
      game.events.emit('time:nightfall', { hour });
    } else if (isNight && sky.night < 0.48) {
      isNight = false;
      game.events.emit('time:daybreak', { hour });
    }
  }

  update(0);
  return sky;
}

/**
 * Where the sun is at `hour`, as a unit vector toward it. It rises in the east-north-east at 06:00,
 * stands high in the south at midday and sets over the gulf in the west-north-west at 18:36,
 * lingering low through the long golden hour. Below the horizon it keeps circling under the north.
 */
export function sunPathDirection(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  const dayLength = SUNSET_HOUR - SUNRISE_HOUR;
  const t = (h - SUNRISE_HOUR) / dayLength;
  let elevation;
  let azimuth;
  if (t >= 0 && t <= 1) {
    elevation = NOON_ELEVATION * Math.pow(Math.sin(Math.PI * t), 1.35);
    const u = 2 * t - 1;
    azimuth = Math.PI + AZIMUTH_SWING * Math.sign(u) * Math.pow(Math.abs(u), 0.42);
  } else {
    const s = (((h - SUNSET_HOUR) % 24) + 24) % 24 / (24 - dayLength);
    elevation = -NIGHT_DEPTH * Math.sin(Math.PI * s);
    azimuth = Math.PI + AZIMUTH_SWING + (2 * Math.PI - 2 * AZIMUTH_SWING) * s;
  }
  return compassToVector(azimuth, elevation, out);
}

/** Where the moon is at `hour`: it hangs over the gulf through the night, so its light paints a path on the sea. */
export function moonPathDirection(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  const m = (((h - 18) % 24) + 24) % 24 / 12;
  const night = Math.min(Math.max(m, 0), 1);
  const azimuth = THREE.MathUtils.degToRad(38 - 76 * night);
  const elevation = THREE.MathUtils.degToRad(14 + 17 * Math.sin(Math.PI * night));
  return compassToVector(azimuth, elevation, out);
}

/** Compass bearing (0 north, clockwise) and elevation to a world vector: north is -Z, east is +X. */
function compassToVector(azimuth, elevation, out) {
  const flat = Math.cos(elevation);
  return out.set(flat * Math.sin(azimuth), Math.sin(elevation), -flat * Math.cos(azimuth));
}

/** Size the sun's shadow map and its orthographic box from the render settings. */
function configureSunShadow(light, render) {
  const size = render?.shadowMapSize || 2048;
  const half = render?.shadowDistance || 110;
  light.shadow.mapSize.set(size, size);
  const box = light.shadow.camera;
  box.left = -half;
  box.right = half;
  box.top = half;
  box.bottom = -half;
  box.near = 1;
  box.far = SUN_LIGHT_DISTANCE + 1600;
  box.updateProjectionMatrix();
  light.shadow.bias = -0.00005;
  light.shadow.normalBias = 0.12;
  light.shadow.radius = 1.4;
  return { half, texel: (2 * half) / size };
}

/**
 * Fade the sun's shadows out before the edge of the shadow box, so they never end in a hard line.
 * Wraps three.js's directional shadow lookup once, for every material compiled afterwards.
 * @returns {boolean} whether the fade is in place
 */
function installShadowEdgeFade() {
  const chunks = THREE.ShaderChunk;
  const chunk = chunks.shadowmap_pars_fragment;
  if (typeof chunk !== 'string') return false;
  if (chunk.includes('getShadowFadedAtEdge')) return true;
  if (!chunk.includes(SHADOW_LOOKUP_SIGNATURE)) return false;
  chunks.shadowmap_pars_fragment = chunk + SHADOW_EDGE_FADE_GLSL;
  return true;
}

/** Clamp to 0..1; anything that is not a number counts as 0. */
function clamp01(value) {
  return value > 0 ? (value < 1 ? value : 1) : 0;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const SUNRISE_HOUR = 6.0;
const SUNSET_HOUR = 18.6;
const NOON_ELEVATION = THREE.MathUtils.degToRad(70);
const NIGHT_DEPTH = THREE.MathUtils.degToRad(50);
const AZIMUTH_SWING = THREE.MathUtils.degToRad(115);
const SUN_LIGHT_DISTANCE = 900;
const SHADOW_LOOK_AHEAD = 0.35;
const LIGHT_DIRECTION_STEP = 2e-7;
const SUN_DISC_RADIUS = 0.021;
/** Exponential-squared haze reaches 95% at this many metres divided by its density. */
const FOG_VISIBILITY_FACTOR = 1.73;
const STORM_SUN_COPPER = 0xe0915a;
const STORM_DISC_COPPER = 0xf4caa0;

const SHADOW_LOOKUP_SIGNATURE = 'float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord )';
const SHADOW_EDGE_FADE_GLSL = /* glsl */ `
#ifdef USE_SHADOWMAP
float getShadowFadedAtEdge( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
  vec2 edge = abs( shadowCoord.xy / shadowCoord.w * 2.0 - 1.0 );
  float fade = smoothstep( 0.72, 0.97, max( edge.x, edge.y ) );
  if ( fade >= 1.0 ) return 1.0;
  return mix( getShadow( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord ), 1.0, fade );
}
#define getShadow getShadowFadedAtEdge
#endif
`;
