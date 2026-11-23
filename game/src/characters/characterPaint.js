// The painted clothes and faces of Port Sarab's people. Every body part is drawn with one shared
// Lambert shader that takes two colours per instance and paints details from the part's own local
// coordinates: eyes, brows and mouths, the coral rally stripe on Zayd's jacket, hi-vis bands, suit
// shirts and ties, PSPD badges, robe trims, check head cloths, shoe soles and sandals.
// paintBody(look, rig) turns a look into the list of parts one person is drawn with.
import * as THREE from 'three';
import { PART, PART_INFO } from './characterPartShapes.js';
import { FRAME } from './characterRig.js';

/** Torso patterns by look name. */
export const TORSO_PATTERN = {
  plain: 0, rally: 1, hivis: 2, suit: 3, police: 4, robe: 5, sash: 6, dots: 7, stripes: 8, yoke: 9,
  armor: 10, dressTrim: 11, openJacket: 12,
};

/** Flags painted on limbs (summed): sleeves, stripes, patches, cuffs, shorts, socks, boots, soles. */
export const LIMB_FLAG = { SHORT_SLEEVE: 1, STRIPE: 2, PATCH: 4, RIGHT_SIDE: 8 };

/** Entry kinds that change every frame. */
export const DYNAMIC = { NONE: 0, GRIP_L: 1, GRIP_R: 2, SKIRT: 3, FACE: 4 };

/**
 * The parts one person is drawn with: [{part, frame, color, colorB, pattern, sx, sy, sz, near, dynamic}],
 * colours as linear RGB arrays. Built once per person (at spawn or when the look changes).
 */
export function paintBody(look, rig) {
  const list = [];
  const h = rig.height;
  const w = rig.bulk;
  const skin = look.skin;
  const top = look.top || {};
  const bottom = look.bottom || {};
  const shoes = look.shoes || {};
  const garment = look.garment;
  const headwear = look.headwear;
  const short = top.sleeves === 'short';
  const sleeve = top.sleeveColor || top.color;
  const covered = headwear && (headwear.kind === 'headCloth' || headwear.kind === 'headScarf' || headwear.kind === 'helmet');
  const add = (part, frame, color, colorB, pattern, sx, sy, sz, near = false, dynamic = DYNAMIC.NONE) => {
    list.push({ part, frame, color: linear(color), colorB: linear(colorB), pattern, sx, sy, sz, near, dynamic, shadow: PART_INFO[part].shadow });
  };

  const hipColour = garment && garment.length > 0.9 ? garment.color : bottom.color;
  add(PART.PELVIS, FRAME.PELVIS, hipColour, bottom.colorB || 0x2a1e16, bottom.belt && !garment ? 1 : 0, w * (rig.hips || 1), h, w);
  add(PART.TORSO, FRAME.CHEST, top.color, top.colorB, TORSO_PATTERN[top.pattern] || 0, Math.pow(w, 0.85) * rig.shoulders, h, w);
  const headScale = 0.97 + 0.03 * h;
  add(PART.HEAD, FRAME.HEAD, skin, look.eyes || 0x1a120c, 0, headScale, headScale, headScale, false, DYNAMIC.FACE);

  const armBulk = Math.pow(w, 0.7);
  for (let side = 0; side < 2; side += 1) {
    let flags = side ? LIMB_FLAG.RIGHT_SIDE : 0;
    let sleeveB = skin;
    if (short) flags += LIMB_FLAG.SHORT_SLEEVE;
    else if (top.sleevePattern === 'rally') {
      flags += LIMB_FLAG.STRIPE;
      sleeveB = top.colorB;
    }
    if (top.sleevePattern === 'patch') flags += LIMB_FLAG.PATCH;
    add(PART.UPPER_ARM, side ? FRAME.UPPER_ARM_R : FRAME.UPPER_ARM_L, sleeve, sleeveB, flags, armBulk, h, armBulk);
    const foreColour = short ? skin : sleeve;
    add(PART.FOREARM, side ? FRAME.FOREARM_R : FRAME.FOREARM_L, foreColour, top.cuff || foreColour, !short && top.cuff ? 1 : 0, armBulk, h, armBulk);
    add(PART.HAND, side ? FRAME.HAND_R : FRAME.HAND_L, look.gloves || skin, look.gloves || skin, 0, 1, h, 1, true, side ? DYNAMIC.GRIP_R : DYNAMIC.GRIP_L);
  }

  const legBulk = Math.pow(w, 0.8);
  const shinBulk = Math.pow(w, 0.6);
  for (let side = 0; side < 2; side += 1) {
    add(PART.THIGH, side ? FRAME.THIGH_R : FRAME.THIGH_L, bottom.color, skin, bottom.shorts ? 1 : 0, legBulk, h, legBulk);
    let shinB = bottom.color;
    let shinFlags = 0;
    if (bottom.shorts) {
      if (bottom.socks) { shinFlags = 1; shinB = bottom.socks; }
    } else if (bottom.boots) {
      shinFlags = 2;
      shinB = bottom.boots;
    }
    add(PART.SHIN, side ? FRAME.SHIN_R : FRAME.SHIN_L, bottom.shorts ? skin : bottom.color, shinB, shinFlags, shinBulk, h, shinBulk);
    const sole = shoes.sandals ? skin : shoes.sole || shoes.color;
    add(PART.FOOT, side ? FRAME.FOOT_R : FRAME.FOOT_L, shoes.color, sole, shoes.sandals ? 2 : shoes.sole ? 1 : 0, 1, 1, h, true);
  }

  let hairStyle = look.hairStyle;
  if (headwear && hairStyle === 'volume') hairStyle = 'short';
  if (!covered && hairStyle && hairStyle !== 'none') {
    const long = hairStyle === 'long';
    const s = hairStyle === 'volume' ? [1.15, 1.08, 1.13] : hairStyle === 'buzz' ? [0.988, 0.986, 0.988] : [1, 1, 1];
    add(long ? PART.HAIR_LONG : PART.HAIR_SHORT, FRAME.HEAD, look.hair, look.hair, 0, s[0] * headScale, s[1] * headScale, s[2] * headScale);
  }
  if (look.beard) add(PART.BEARD, FRAME.HEAD, look.beard, shade(look.beard, 0.35), 0, headScale, headScale, headScale, true);
  if (headwear) {
    const kind = HEADWEAR_PART[headwear.kind];
    if (kind !== undefined) {
      const pattern = HEADWEAR_PATTERN[headwear.pattern] || 0;
      add(kind, FRAME.HEAD, headwear.color, headwear.colorB === undefined ? headwear.color : headwear.colorB, pattern, headScale, headScale, headScale);
    }
  }
  if (garment) {
    const length = garment.length || 1;
    const spread = w * (rig.hips || 1);
    add(PART.SKIRT, FRAME.SKIRT, garment.color, garment.trim || garment.color, garment.trim ? 1 : 0, spread, length * h, spread, false, DYNAMIC.SKIRT);
  }
  if (look.scarf) add(PART.NECK_SCARF, FRAME.CHEST, look.scarf.color, look.scarf.colorB, 1, Math.pow(w, 0.85) * rig.shoulders, h, w, true);
  return list;
}

const HEADWEAR_PART = {
  cap: PART.CAP, helmet: PART.HELMET, hardHat: PART.HELMET, sunHat: PART.SUN_HAT,
  headCloth: PART.HEAD_CLOTH, headScarf: PART.HEAD_SCARF,
};
const HEADWEAR_PATTERN = { plain: 0, badge: 1, twoTone: 2, visor: 1, ridge: 0, band: 1, check: 1, trim: 1 };

/** Shared light settings of the painted material: a warm rim that lifts people off the city. */
export const PAINT_UNIFORMS = {
  uRimColor: { value: new THREE.Color(0xffe2b0) },
  uRimStrength: { value: 0.32 },
};

/**
 * The material of one part kind: Lambert lighting, two instance colours (instanceColor and the
 * instanceColorB attribute) and a per-instance pattern number (instancePattern).
 */
export function createPaintedMaterial(partKind, doubleSided) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPartKind = { value: partKind };
    shader.uniforms.uRimColor = PAINT_UNIFORMS.uRimColor;
    shader.uniforms.uRimStrength = PAINT_UNIFORMS.uRimStrength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PAINT_VERTEX_HEADER}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${PAINT_VERTEX_COLOR}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${PAINT_VERTEX_RIM}`);
    const fragmentHasColor = shader.fragmentShader.includes('#include <color_fragment>');
    let fragment = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PAINT_FRAGMENT_HEADER}`);
    if (fragmentHasColor) fragment = fragment.replace('#include <color_fragment>', PAINT_FRAGMENT_COLOR);
    const output = fragment.includes('#include <opaque_fragment>') ? '#include <opaque_fragment>' : '#include <output_fragment>';
    fragment = fragment.replace(output, `${PAINT_FRAGMENT_RIM}\n${output}`);
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => 'port-sarab-painted-person';
  return material;
}

/** A colour (0xRRGGBB, sRGB) as linear RGB numbers, the way the renderer wants instance colours. */
export function linear(hex) {
  _colour.setHex(hex === undefined || hex === null ? 0xff00ff : hex);
  return [_colour.r, _colour.g, _colour.b];
}

/** Darken (factor < 1) a 0xRRGGBB colour. */
function shade(hex, factor) {
  const r = Math.round(((hex >> 16) & 255) * factor);
  const g = Math.round(((hex >> 8) & 255) * factor);
  const b = Math.round((hex & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

const _colour = new THREE.Color();

const PAINT_VERTEX_HEADER = `
attribute vec3 instanceColorB;
attribute float instancePattern;
varying vec3 vPaintB;
varying vec3 vPartPos;
varying float vPattern;
varying vec3 vRimNormal;
varying vec3 vRimView;
`;

const PAINT_VERTEX_COLOR = `
vPaintB = instanceColorB;
vPattern = instancePattern;
vPartPos = position;
`;

const PAINT_VERTEX_RIM = `
vRimNormal = normalize(transformedNormal);
vRimView = -mvPosition.xyz;
`;

const PAINT_FRAGMENT_HEADER = `
uniform float uPartKind;
uniform vec3 uRimColor;
uniform float uRimStrength;
varying vec3 vPaintB;
varying vec3 vPartPos;
varying float vPattern;
varying vec3 vRimNormal;
varying vec3 vRimView;

float inBand(float v, float a, float b) { return step(a, v) * step(v, b); }
float hasFlag(float pattern, float flag) { return mod(floor(pattern / flag + 0.001), 2.0); }

// toB mixes toward the second colour; fixedC.rgb is a fixed paint (shirt cream, badge gold) mixed by fixedC.a.
void paintPart(float kind, float pattern, vec3 p, out float toB, out vec4 fixedC) {
  toB = 0.0;
  fixedC = vec4(0.0);
  float front = step(0.0, p.z);
  if (kind < 0.5) {
    if (pattern > 0.5) {
      toB = inBand(p.y, 0.042, 0.084);
      fixedC = vec4(0.62, 0.45, 0.12, toB * step(abs(p.x), 0.02) * step(0.05, p.z));
    }
  } else if (kind < 1.5) {
    float ax = abs(p.x);
    if (pattern < 0.5) {
    } else if (pattern < 1.5) {
      toB = max(inBand(p.y, 0.245, 0.292), inBand(p.y, 0.307, 0.324));
      fixedC = vec4(0.05, 0.04, 0.035, 0.75 * step(ax, 0.004) * step(0.06, p.z) * step(p.y, 0.44));
    } else if (pattern < 2.5) {
      toB = max(inBand(p.y, 0.12, 0.158), inBand(p.y, 0.25, 0.288));
    } else if (pattern < 3.5) {
      float vee = step(0.2, p.y) * step(ax, (p.y - 0.2) * 0.42) * step(0.05, p.z);
      float tie = vee * step(ax, 0.011 + (0.46 - p.y) * 0.035) * step(p.y, 0.452);
      fixedC = vec4(0.86, 0.84, 0.79, vee * (1.0 - tie));
      toB = tie;
    } else if (pattern < 4.5) {
      toB = step(0.372, p.y) * step(0.105, ax);
      toB = max(toB, step(ax, 0.005) * step(0.06, p.z) * step(p.y, 0.44));
      toB = max(toB, inBand(p.y, 0.282, 0.298) * inBand(ax, 0.04, 0.12) * step(0.06, p.z));
      float badge = step(length(vec2(p.x - 0.078, p.y - 0.33)), 0.017) * step(0.06, p.z);
      fixedC = vec4(0.72, 0.5, 0.13, badge);
    } else if (pattern < 5.5) {
      toB = max(step(ax, 0.009) * step(0.3, p.y) * step(0.06, p.z), inBand(p.y, 0.446, 0.52));
    } else if (pattern < 6.5) {
      toB = step(abs(p.x * 0.9 - (p.y - 0.24)), 0.034);
    } else if (pattern < 7.5) {
      vec2 cell = fract(vec2((p.x + p.z) * 21.0, p.y * 21.0)) - 0.5;
      vec2 cell2 = fract(vec2((p.x - p.z) * 21.0 + 0.5, p.y * 21.0 + 0.5)) - 0.5;
      toB = max(step(length(cell), 0.27), step(length(cell2), 0.16));
    } else if (pattern < 8.5) {
      toB = step(0.55, fract(p.y * 17.0));
    } else if (pattern < 9.5) {
      toB = step(0.355, p.y);
    } else if (pattern < 10.5) {
      toB = step(ax, 0.135) * inBand(p.y, 0.07, 0.43);
      fixedC = vec4(0.55, 0.56, 0.52, inBand(p.y, 0.3, 0.345) * step(ax, 0.085) * step(p.z, -0.06));
    } else if (pattern < 11.5) {
      toB = max(inBand(p.y, 0.43, 0.52), step(ax, 0.011) * step(0.22, p.y) * step(0.06, p.z));
    } else {
      toB = step(ax, 0.048) * step(0.06, p.z) * step(0.02, p.y);
    }
  } else if (kind < 2.5) {
    float face = step(0.065, p.z);
    vec2 e = vec2(abs(p.x) - 0.036, p.y - 0.186);
    float eye = pattern > 0.5
      ? step(abs(e.y + 0.001), 0.0022) * step(abs(e.x), 0.0145)
      : step(length(e / vec2(0.0135, 0.0105)), 1.0);
    float brow = step(abs(p.y - 0.209 - (abs(p.x) - 0.036) * 0.14), 0.0042) * step(abs(abs(p.x) - 0.038), 0.019);
    float mouth = step(abs(p.y - 0.127 - p.x * p.x * 3.0), 0.0026) * step(abs(p.x), 0.021);
    toB = max(eye, max(brow * 0.85, mouth * 0.55)) * face;
  } else if (kind < 3.5) {
    float side = hasFlag(pattern, 8.0) > 0.5 ? -1.0 : 1.0;
    float outer = p.x * side;
    if (hasFlag(pattern, 1.0) > 0.5) toB = step(p.y, -0.125);
    if (hasFlag(pattern, 2.0) > 0.5) toB = max(toB, step(0.03, outer) * step(abs(p.z), 0.016) * step(-0.27, p.y));
    if (hasFlag(pattern, 4.0) > 0.5) fixedC = vec4(0.72, 0.5, 0.13, step(0.032, outer) * inBand(p.y, -0.085, -0.03) * step(abs(p.z), 0.024));
  } else if (kind < 4.5) {
    if (pattern > 0.5) toB = inBand(p.y, -0.26, -0.212);
  } else if (kind < 5.5) {
  } else if (kind < 6.5) {
    if (pattern > 0.5) toB = step(p.y, -0.262);
  } else if (kind < 7.5) {
    if (pattern > 1.5) toB = step(p.y, -0.29);
    else if (pattern > 0.5) toB = step(p.y, -0.34);
  } else if (kind < 8.5) {
    if (pattern > 1.5) toB = step(-0.052, p.y) * step(-0.03, p.z) * (1.0 - inBand(p.z, 0.03, 0.062));
    else if (pattern > 0.5) toB = step(p.y, -0.066);
  } else if (kind < 11.5) {
    if (kind > 10.5) toB = step(abs(p.y - 0.127 - p.x * p.x * 3.0), 0.0032) * step(abs(p.x), 0.024) * step(0.08, p.z);
  } else if (kind < 12.5) {
    if (pattern > 1.5) toB = step(0.112, p.z) * step(p.y, 0.222);
    else if (pattern > 0.5) fixedC = vec4(0.72, 0.5, 0.13, step(0.095, p.z) * step(abs(p.x), 0.019) * inBand(p.y, 0.25, 0.288));
  } else if (kind < 13.5) {
    if (pattern > 0.5) toB = step(0.045, p.z) * inBand(p.y, 0.168, 0.214);
  } else if (kind < 14.5) {
    if (pattern > 0.5) toB = inBand(p.y, 0.244, 0.264) * step(length(p.xz), 0.112);
  } else if (kind < 15.5) {
    float agal = max(inBand(p.y, 0.226, 0.239), inBand(p.y, 0.247, 0.261));
    if (pattern > 0.5) toB = 0.55 * step(0.6, fract((p.x + p.z) * 26.0)) + 0.55 * step(0.6, fract(p.y * 26.0));
    fixedC = vec4(0.012, 0.011, 0.012, agal);
  } else if (kind < 16.5) {
    if (pattern > 0.5) toB = step(0.068, p.z) * inBand(p.y, 0.05, 0.245);
  } else if (kind < 17.5) {
    if (pattern > 0.5) toB = step(p.y, -0.79);
  } else if (kind < 18.5) {
    vec2 cell = fract(vec2((p.x + p.z) * 30.0, p.y * 30.0)) - 0.5;
    toB = step(length(cell), 0.2);
  } else if (kind < 22.5) {
    float wz = -(p.y + 0.075);
    toB = max(step(p.z, -0.006), step(wz, -0.09));
  } else {
    float wz = -(p.y + 0.075);
    toB = step(wz, 0.15);
  }
}
`;

const PAINT_FRAGMENT_COLOR = `
float paintToB = 0.0;
vec4 paintFixed = vec4(0.0);
paintPart(uPartKind, vPattern, vPartPos, paintToB, paintFixed);
vec3 paintColour = mix(mix(vColor, vPaintB, clamp(paintToB, 0.0, 1.0)), paintFixed.rgb, clamp(paintFixed.a, 0.0, 1.0));
diffuseColor.rgb *= paintColour;
`;

const PAINT_FRAGMENT_RIM = `
float rimFacing = 1.0 - abs(dot(normalize(vRimNormal), normalize(vRimView)));
outgoingLight += diffuseColor.rgb * uRimColor * pow(rimFacing, 3.0) * uRimStrength;
`;
