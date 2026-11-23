// The light of Port Sarab hour by hour: the colours of the sky, the sun's colour and strength, the
// bounce off the sand, the haze and the camera exposure at each key moment of the day, from a
// moonlit night through a hard white noon to the long golden hour and the magenta dusk over the gulf.
import * as THREE from 'three';

/**
 * Blend the keyframes around `hour` (0..24) into `out` (made by createTimeOfDayState()).
 * Neighbouring keyframes are eased into each other, so the light never jumps.
 * @param {number} hour
 * @param {ReturnType<typeof createTimeOfDayState>} out
 */
export function sampleTimeOfDay(hour, out) {
  const h = ((hour % 24) + 24) % 24;
  let index = KEYFRAMES.length - 1;
  for (let i = 0; i < KEYFRAMES.length; i += 1) {
    if (KEYFRAMES[i].hour <= h) index = i;
  }
  const a = KEYFRAMES[index];
  const b = KEYFRAMES[(index + 1) % KEYFRAMES.length];
  let span = b.hour - a.hour;
  if (span <= 0) span += 24;
  let into = h - a.hour;
  if (into < 0) into += 24;
  const t = easeBetweenKeys(into / span);

  for (let i = 0; i < COLOR_KEYS.length; i += 1) {
    const key = COLOR_KEYS[i];
    out[key].copy(a[key]).lerp(b[key], t);
  }
  for (let i = 0; i < NUMBER_KEYS.length; i += 1) {
    const key = NUMBER_KEYS[i];
    out[key] = a[key] + (b[key] - a[key]) * t;
  }
  // Haze thickness changes by orders of magnitude (a clear noon against a storm), so blend it in log space.
  out.fogDensity = Math.exp(Math.log(a.fogDensity) + (Math.log(b.fogDensity) - Math.log(a.fogDensity)) * t);
  out.name = t < 0.5 ? a.name : b.name;
  return out;
}

/** A blank lighting state for sampleTimeOfDay() to fill. Colours are THREE.Color in linear space. */
export function createTimeOfDayState() {
  const state = { name: '', fogDensity: 0.0005 };
  for (let i = 0; i < COLOR_KEYS.length; i += 1) state[COLOR_KEYS[i]] = new THREE.Color();
  for (let i = 0; i < NUMBER_KEYS.length; i += 1) state[NUMBER_KEYS[i]] = 0;
  return state;
}

/** The named moments of the day, for menus and debugging: [{ name, hour }]. */
export function listTimeOfDayKeyframes() {
  return KEYFRAMES.map((key) => ({ name: key.name, hour: key.hour }));
}

/** Ease-in-out between two keyframes. */
function easeBetweenKeys(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Turn a row of the table below into a keyframe with THREE.Color values. */
function toKeyframe(row) {
  const key = { ...row };
  for (let i = 0; i < COLOR_KEYS.length; i += 1) {
    const name = COLOR_KEYS[i];
    key[name] = new THREE.Color(row[name] ?? row.glow);
  }
  return key;
}

/*
 * What each keyframe holds (colours are written as sRGB hex and kept linear once loaded):
 *   zenith, mid, horizon   the sky from overhead down to the horizon band; the horizon is also the haze colour
 *   glow, glowStrength     the broad bloom around the sun
 *   band                   the sunset band along the horizon under a low sun (the glow colour if left out)
 *   disc                   the sun's disc
 *   light, lightIntensity  the one directional light: the sun by day, the moon by night
 *   hemiSky, hemiGround, hemiIntensity   blue light from the sky above, warm bounce from the sand below
 *   fogDensity             exponential-squared haze; distant towers melt into it
 *   exposure               the camera's exposure under ACES tone mapping
 *   cloudLit, cloudShade, cloudCover, cloudOpacity   the high streaks of cloud (cover is a threshold: higher is fewer)
 *   stars, night           star brightness, and how much the city should think it is night (lamps, windows)
 *   dust                   the colour the khamsin turns the air at this hour
 */
const COLOR_KEYS = ['zenith', 'mid', 'horizon', 'glow', 'band', 'disc', 'light', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudShade', 'dust'];
const NUMBER_KEYS = ['glowStrength', 'lightIntensity', 'hemiIntensity', 'exposure', 'cloudCover', 'cloudOpacity', 'stars', 'night'];

const NIGHT = {
  zenith: 0x071226, mid: 0x0f2244, horizon: 0x1e3a5f,
  glow: 0x2d4a7a, glowStrength: 0.0, disc: 0xdfe8ff,
  light: 0x9ab8ff, lightIntensity: 1.3,
  hemiSky: 0x2a4aa0, hemiGround: 0x1c2448, hemiIntensity: 3.2,
  fogDensity: 0.00044, exposure: 1.55,
  cloudLit: 0x2c3d60, cloudShade: 0x141d36, cloudCover: 0.6, cloudOpacity: 0.5,
  stars: 1, night: 1, dust: 0x3a3036,
};

const KEYFRAMES = [
  { name: 'night', hour: 0.0, ...NIGHT },
  { name: 'night', hour: 4.4, ...NIGHT },
  {
    name: 'pre-dawn', hour: 5.2,
    zenith: 0x0f1f42, mid: 0x2a3c68, horizon: 0x6c5f80,
    glow: 0xe0907a, glowStrength: 0.35, disc: 0xffd0a0,
    light: 0x8aa0d6, lightIntensity: 0.5,
    hemiSky: 0x4a5cb0, hemiGround: 0x3a3050, hemiIntensity: 2.5,
    fogDensity: 0.0005, exposure: 1.45,
    cloudLit: 0xa07a8c, cloudShade: 0x3a3a5a, cloudCover: 0.58, cloudOpacity: 0.65,
    stars: 0.55, night: 0.85, dust: 0x5a4448,
  },
  {
    name: 'sunrise', hour: 6.05,
    zenith: 0x2c4f8c, mid: 0x9c94b4, horizon: 0xf2b48e,
    glow: 0xffb070, band: 0xff8c50, glowStrength: 0.95, disc: 0xffe2b4,
    light: 0xffae72, lightIntensity: 2.0,
    hemiSky: 0xa8a8d8, hemiGround: 0xc09078, hemiIntensity: 1.55,
    fogDensity: 0.0006, exposure: 1.2,
    cloudLit: 0xffb890, cloudShade: 0x9a7a9c, cloudCover: 0.56, cloudOpacity: 0.85,
    stars: 0.04, night: 0.3, dust: 0xb87a52,
  },
  {
    name: 'morning', hour: 7.3,
    zenith: 0x3772c0, mid: 0x8ab6de, horizon: 0xf0d8b8,
    glow: 0xffd8a0, glowStrength: 0.5, disc: 0xfff2d6,
    light: 0xffdcae, lightIntensity: 3.0,
    hemiSky: 0xbcc8ec, hemiGround: 0xe0b890, hemiIntensity: 1.65,
    fogDensity: 0.0005, exposure: 1.05,
    cloudLit: 0xfff0e0, cloudShade: 0xb8c4dc, cloudCover: 0.6, cloudOpacity: 0.8,
    stars: 0, night: 0, dust: 0xc89058,
  },
  {
    name: 'bright morning', hour: 9.5,
    zenith: 0x2a6fd0, mid: 0x7ab4ec, horizon: 0xe8e6dc,
    glow: 0xfff2d8, glowStrength: 0.35, disc: 0xfffaf0,
    light: 0xfff0dc, lightIntensity: 3.2,
    hemiSky: 0xc4caf0, hemiGround: 0xe4c494, hemiIntensity: 1.7,
    fogDensity: 0.00042, exposure: 0.98,
    cloudLit: 0xffffff, cloudShade: 0xc4d4ea, cloudCover: 0.62, cloudOpacity: 0.75,
    stars: 0, night: 0, dust: 0xcc9455,
  },
  {
    name: 'noon', hour: 12.3,
    zenith: 0x2266cc, mid: 0x6aaaf0, horizon: 0xeeeadf,
    glow: 0xfffaf0, glowStrength: 0.3, disc: 0xffffff,
    light: 0xfffaf0, lightIntensity: 3.4,
    hemiSky: 0xc8c8f0, hemiGround: 0xe4c89a, hemiIntensity: 1.75,
    fogDensity: 0.0004, exposure: 0.9,
    cloudLit: 0xffffff, cloudShade: 0xc8d8ee, cloudCover: 0.63, cloudOpacity: 0.7,
    stars: 0, night: 0, dust: 0xd09a5a,
  },
  {
    name: 'afternoon', hour: 15.2,
    zenith: 0x2667c4, mid: 0x76b0e8, horizon: 0xf2e2c6,
    glow: 0xfff0d0, glowStrength: 0.4, disc: 0xfff6e0,
    light: 0xffefd2, lightIntensity: 3.4,
    hemiSky: 0xc4c6ee, hemiGround: 0xe6c08c, hemiIntensity: 1.7,
    fogDensity: 0.00045, exposure: 0.97,
    cloudLit: 0xfffaf0, cloudShade: 0xc8d4e8, cloudCover: 0.62, cloudOpacity: 0.75,
    stars: 0, night: 0, dust: 0xcc9050,
  },
  {
    name: 'golden hour', hour: 16.4,
    zenith: 0x2862b4, mid: 0x8db6da, horizon: 0xf6d5a2,
    glow: 0xffc878, glowStrength: 0.65, disc: 0xfff0c8,
    light: 0xffd08a, lightIntensity: 3.8,
    hemiSky: 0xbcc0e4, hemiGround: 0xebba84, hemiIntensity: 1.7,
    fogDensity: 0.0005, exposure: 1.0,
    cloudLit: 0xffe0b0, cloudShade: 0xc8b0b8, cloudCover: 0.6, cloudOpacity: 0.8,
    stars: 0, night: 0, dust: 0xd49450,
  },
  {
    name: 'golden hour', hour: 17.5,
    zenith: 0x1d5aa6, mid: 0x86bcd8, horizon: 0xf7c98a,
    glow: 0xffae50, band: 0xff9438, glowStrength: 1.0, disc: 0xfff4d0,
    light: 0xffb35e, lightIntensity: 4.2,
    hemiSky: 0xb4b6e2, hemiGround: 0xeeb078, hemiIntensity: 1.75,
    fogDensity: 0.00054, exposure: 1.0,
    cloudLit: 0xffcc94, cloudShade: 0xc4a2b2, cloudCover: 0.56, cloudOpacity: 0.85,
    stars: 0, night: 0, dust: 0xd28a48,
  },
  {
    name: 'sunset', hour: 18.35,
    zenith: 0x1c3f7a, mid: 0xa28aa8, horizon: 0xff9e5e,
    glow: 0xff8a3c, band: 0xff5a24, glowStrength: 1.2, disc: 0xffc070,
    light: 0xff8442, lightIntensity: 2.6,
    hemiSky: 0xa49cd4, hemiGround: 0xd8906c, hemiIntensity: 1.7,
    fogDensity: 0.00065, exposure: 1.15,
    cloudLit: 0xff8c60, cloudShade: 0x7c5a80, cloudCover: 0.55, cloudOpacity: 0.95,
    stars: 0, night: 0.1, dust: 0xa85c38,
  },
  {
    name: 'dusk', hour: 18.95,
    zenith: 0x16306a, mid: 0x5a6aa8, horizon: 0x4f9aa8,
    glow: 0xd8609a, band: 0xff7a4c, glowStrength: 0.95, disc: 0xff9060,
    light: 0xb090c0, lightIntensity: 0.4,
    hemiSky: 0x8a86c4, hemiGround: 0x7a5a78, hemiIntensity: 1.8,
    fogDensity: 0.0006, exposure: 1.35,
    cloudLit: 0xf06a8a, cloudShade: 0x4a3a6a, cloudCover: 0.56, cloudOpacity: 0.9,
    stars: 0.1, night: 0.45, dust: 0x6a4048,
  },
  {
    name: 'blue hour', hour: 19.6,
    zenith: 0x0d2250, mid: 0x1d3d78, horizon: 0x3a6c98,
    glow: 0x9a5a92, band: 0xd8705c, glowStrength: 0.4, disc: 0xff9060,
    light: 0x8fa8e0, lightIntensity: 0.7,
    hemiSky: 0x4058b0, hemiGround: 0x2c3058, hemiIntensity: 2.6,
    fogDensity: 0.0005, exposure: 1.5,
    cloudLit: 0x5a5a8a, cloudShade: 0x1c2448, cloudCover: 0.58, cloudOpacity: 0.7,
    stars: 0.5, night: 0.8, dust: 0x40344a,
  },
  { name: 'night', hour: 20.6, ...NIGHT },
].map(toKeyframe);
