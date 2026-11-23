// What the people of Port Sarab look like: skin tones, hair, clothes and headwear for every kind of
// person in the boomtown, from tourists in loud shirts and suited bankers to robed locals, PSPD
// officers, the Dune Jackals gang and Zayd "Dust" Karam himself. A look is plain data (it can be
// saved); characterPaint.js turns it into colours on the body parts.
import { CHARACTER_ARCHETYPES } from './characterAnimationRules.js';

/** Every archetype randomLook() understands. */
export const LOOK_ARCHETYPES = CHARACTER_ARCHETYPES;

/**
 * A random look for one person of the given archetype.
 * @param {string} archetype  one of LOOK_ARCHETYPES (unknown ones fall back to 'civilian')
 * @param {{next:Function}} [rng]  a seeded stream (game.rng.fork(...)); Math.random when missing
 * @returns {Object} look
 */
export function randomLook(archetype = 'civilian', rng) {
  const r = wrapRandom(rng);
  const dress = LOOK_DRESSERS[archetype] || LOOK_DRESSERS.civilian;
  const look = baseLook(archetype, r);
  dress(look, r);
  return look;
}

/** The fixed looks of the story's cast, by id: 'zayd', 'mina', 'faris', 'tavi', 'rasha', 'idris'. */
export function castLook(id) {
  const r = wrapRandom({ next: seededSequence(id) });
  const look = baseLook('crew', r);
  const cast = CAST_LOOKS[id];
  if (!cast) return randomLook('crew', r);
  cast(look);
  return look;
}

const LOOK_DRESSERS = {
  civilian(look, r) {
    const female = look.figure === 'f';
    look.top.color = r.pick(EVERYDAY_TOPS);
    look.top.pattern = r.weighted(['plain', 'stripes', 'yoke', 'openJacket'], [5, 2, 2, 2]);
    look.top.colorB = look.top.pattern === 'openJacket' ? r.pick(TEE_COLOURS) : r.pick(EVERYDAY_TOPS);
    look.top.sleeves = r.chance(0.6) ? 'short' : 'long';
    look.bottom.color = r.pick(TROUSER_COLOURS);
    look.bottom.belt = r.chance(0.5);
    look.bottom.colorB = r.pick(BELT_COLOURS);
    if (r.chance(0.18)) look.bottom.shorts = true;
    look.shoes.color = r.pick(SHOE_COLOURS);
    look.shoes.sole = r.chance(0.5) ? 0xf1ede4 : null;
    if (female && r.chance(0.35)) look.garment = { kind: 'skirt', color: r.pick(SKIRT_COLOURS), trim: null, length: 0.56 };
    if (!female && r.chance(0.12)) look.headwear = { kind: 'cap', color: r.pick(CAP_COLOURS), colorB: r.pick(CAP_COLOURS), pattern: 'twoTone' };
  },
  tourist(look, r) {
    look.top.color = r.pick(BRIGHT_SHIRTS);
    look.top.colorB = r.pick([0xfff4d6, 0xf7e36a, 0x1ba39c, 0xffffff, 0xff9f80]);
    look.top.pattern = r.weighted(['dots', 'plain', 'stripes'], [4, 2, 1]);
    look.top.sleeves = 'short';
    look.bottom.color = r.pick([0xe9dcc0, 0xf4f1e8, 0x2f4a6d, 0xb59f78, 0x8fb3c9]);
    look.bottom.shorts = r.chance(0.8);
    look.bottom.socks = r.chance(0.3) ? 0xf4f1e8 : null;
    look.shoes.color = r.pick([0xf1ede4, 0x6b4a2f, 0x1ba39c, 0x2b2b2b]);
    look.shoes.sole = 0xf1ede4;
    if (r.chance(0.55)) look.headwear = { kind: 'sunHat', color: r.pick([0xe6cf8f, 0xf4f1e8, 0xd8c08a]), colorB: r.pick([0x1ba39c, 0xe4572e, 0x2f4a6d, 0x3b2618]), pattern: 'band' };
    else if (r.chance(0.3)) look.headwear = { kind: 'cap', color: r.pick([0xf4f1e8, 0x1ba39c, 0xe4572e]), colorB: 0xf4f1e8, pattern: 'twoTone' };
    look.skin = r.weighted(SKIN_TONES, TOURIST_SKIN_WEIGHTS);
    if (look.headwear && look.hairStyle === 'volume') look.hairStyle = 'short';
  },
  business(look, r) {
    const suit = r.pick([0x2b2f36, 0x1e2a44, 0x16181c, 0x5b5f66, 0xc8b48e, 0x3d3a36]);
    look.top.color = suit;
    look.top.colorB = r.pick([0x7a1f2b, 0x1e3a6e, 0x1ba39c, 0xc28f2c, 0x16181c, 0xe4572e]);
    look.top.pattern = 'suit';
    look.top.sleeves = 'long';
    look.top.cuff = 0xf4f1e8;
    look.bottom.color = suit;
    look.bottom.belt = true;
    look.bottom.colorB = 0x16120e;
    look.shoes.color = r.pick([0x16120e, 0x4a2e1c]);
    if (look.figure === 'f' && r.chance(0.5)) look.garment = { kind: 'skirt', color: suit, trim: null, length: 0.56 };
  },
  worker(look, r) {
    look.top.color = r.pick([0xff7a1a, 0xe8e23a, 0xff9a2e]);
    look.top.colorB = 0xd9dde0;
    look.top.pattern = 'hivis';
    look.top.sleeves = r.chance(0.5) ? 'short' : 'long';
    look.top.sleeveColor = r.pick([0x3c5f8a, 0x6c727a, 0x2f4a6d, 0xe9dcc0]);
    look.bottom.color = r.pick([0x2f3e56, 0x8a7a5c, 0x4a4f57]);
    look.bottom.boots = r.pick([0x5a3a22, 0x3a2a1e]);
    look.shoes.color = look.bottom.boots;
    look.gloves = r.chance(0.5) ? 0xc9a66b : null;
    look.headwear = { kind: 'hardHat', color: r.pick([0xf2c12e, 0xf4f1e8, 0xff7a1a, 0x2f6bff]), colorB: 0x000000, pattern: 'ridge' };
  },
  local(look, r) {
    if (look.figure === 'm') {
      const robe = r.pick([0xf6f3ea, 0xf6f3ea, 0xeee6d4, 0xd8ccb2, 0xc9d3d6, 0x9fa6a8]);
      look.top.color = robe;
      look.top.colorB = shade(robe, 0.86);
      look.top.pattern = 'robe';
      look.top.sleeves = 'long';
      look.bottom.color = robe;
      look.garment = { kind: 'robe', color: robe, trim: null, length: 1 };
      look.shoes.color = r.pick([0x6b4a2f, 0x3a2a1e, 0x8a6a48]);
      look.shoes.sandals = true;
      const checked = r.chance(0.4);
      look.headwear = { kind: 'headCloth', color: 0xf8f6f0, colorB: 0xb8282c, pattern: checked ? 'check' : 'plain' };
      look.beard = r.chance(0.7) ? look.hair : null;
      look.hairStyle = 'none';
    } else {
      const abaya = r.pick([0x16151a, 0x16151a, 0x1c2233, 0x2e1f2b, 0x1d3236, 0x3a2f2a]);
      look.top.color = abaya;
      look.top.colorB = r.pick([0xc9a24a, 0x1ba39c, 0xb8865a, 0xd9c7a0]);
      look.top.pattern = r.chance(0.6) ? 'dressTrim' : 'plain';
      look.top.sleeves = 'long';
      look.top.cuff = r.chance(0.5) ? look.top.colorB : null;
      look.bottom.color = abaya;
      look.garment = { kind: 'dress', color: abaya, trim: r.chance(0.5) ? look.top.colorB : null, length: 1 };
      look.shoes.color = r.pick([0x16120e, 0x3a2a1e, 0x6b4a2f]);
      const scarf = r.chance(0.6) ? abaya : r.pick([0x3b3f55, 0x5a3b4a, 0x2f4a4d, 0x6b5a48, 0xe9dcc0]);
      look.headwear = { kind: 'headScarf', color: scarf, colorB: look.top.colorB, pattern: r.chance(0.3) ? 'trim' : 'plain' };
      look.hairStyle = 'none';
    }
  },
  officer(look, r) {
    look.top.color = 0xc9a66b;
    look.top.colorB = 0x1c2b45;
    look.top.pattern = 'police';
    look.top.sleeves = r.chance(0.5) ? 'short' : 'long';
    look.top.sleevePattern = 'patch';
    look.bottom.color = 0x1c2b45;
    look.bottom.belt = true;
    look.bottom.colorB = 0x121417;
    look.bottom.boots = 0x121417;
    look.shoes.color = 0x121417;
    look.headwear = { kind: 'cap', color: 0x1c2b45, colorB: 0x1c2b45, pattern: 'badge' };
    look.hairStyle = look.figure === 'f' ? 'short' : r.pick(['short', 'buzz']);
  },
  swat(look, r) {
    look.top.color = 0x343a42;
    look.top.colorB = 0x1d2127;
    look.top.pattern = 'armor';
    look.top.sleeves = 'long';
    look.top.sleeveColor = 0x2b3038;
    look.bottom.color = 0x2b3038;
    look.bottom.belt = true;
    look.bottom.colorB = 0x15181c;
    look.bottom.boots = 0x15181c;
    look.shoes.color = 0x15181c;
    look.gloves = 0x15181c;
    look.headwear = { kind: 'helmet', color: 0x22262b, colorB: 0x0c0f14, pattern: 'visor' };
    look.build.bulk = Math.max(look.build.bulk, 1.12);
    look.hairStyle = 'none';
  },
  gang(look, r) {
    const red = r.pick([0x8e2f25, 0x6a1f1c, 0xa23a26, 0x7d2a22]);
    const dark = r.pick([0x1d1a1a, 0x24201f, 0x2e2826]);
    const redTop = r.chance(0.5);
    look.top.color = redTop ? red : dark;
    look.top.colorB = redTop ? dark : red;
    look.top.pattern = r.weighted(['sash', 'yoke', 'plain'], [3, 2, 1]);
    look.top.sleeves = r.chance(0.55) ? 'short' : 'long';
    look.bottom.color = r.pick([0x1d1a1a, 0x2c3340, 0x7a6a50, 0x3a332c]);
    look.bottom.boots = r.chance(0.6) ? r.pick([0x2a1e16, 0x16120e]) : null;
    look.shoes.color = look.bottom.boots || r.pick([0x16120e, 0xe9dcc0]);
    look.scarf = { color: r.chance(0.6) ? red : 0xe9b44c, colorB: 0x16120e };
    if (r.chance(0.3)) look.headwear = { kind: 'cap', color: dark, colorB: red, pattern: 'twoTone' };
    if (look.figure === 'm' && r.chance(0.45)) look.beard = look.hair;
  },
  crew(look, r) {
    look.top.color = r.pick([0x22252b, 0x2f3a2e, 0x3a2f2a, 0x1e2a44]);
    look.top.colorB = r.pick([0x1ba39c, 0xe9b44c, 0xe4572e]);
    look.top.pattern = r.pick(['openJacket', 'yoke', 'plain']);
    look.top.sleeves = 'long';
    look.bottom.color = r.pick([0x1d1f24, 0x2c3340, 0x4a4136]);
    look.bottom.belt = true;
    look.bottom.colorB = 0x16120e;
    look.shoes.color = r.pick([0x16120e, 0x3a2a1e]);
    look.gloves = r.chance(0.5) ? 0x1b1b1d : null;
  },
  player(look) {
    CAST_LOOKS.zayd(look);
  },
};

const CAST_LOOKS = {
  /** Zayd "Dust" Karam: a worn tan rally jacket with a coral stripe, dark trousers, driving gloves. */
  zayd(look) {
    look.archetype = 'player';
    look.figure = 'm';
    look.build = { height: 1.0, bulk: 1.0, shoulders: 1.05, hips: 0.97 };
    look.skin = 0xc68e62;
    look.hair = 0x1d1712;
    look.hairStyle = 'short';
    look.beard = 0x7a5640;
    look.top = { color: 0xb8925a, colorB: 0xe4572e, pattern: 'rally', sleeves: 'long', sleeveColor: null, sleevePattern: 'rally', cuff: 0x3a2a1e };
    look.bottom = { color: 0x2a2d33, colorB: 0x3a2a1e, belt: true, shorts: false, boots: 0x3a2a1e, socks: null };
    look.shoes = { color: 0x3a2a1e, sole: 0x1a1512, sandals: false };
    look.gloves = 0x5a3a24;
    look.garment = null;
    look.headwear = null;
    look.scarf = null;
  },
  /** Mina Okoro, the planner: a sharp teal-lined black jacket, cropped natural hair. */
  mina(look) {
    look.figure = 'f';
    look.build = { height: 0.97, bulk: 0.94, shoulders: 0.92, hips: 1.04 };
    look.skin = 0x6f4429;
    look.hair = 0x16110d;
    look.hairStyle = 'volume';
    look.beard = null;
    look.top = { color: 0x1d1f24, colorB: 0x1ba39c, pattern: 'openJacket', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: 0x1ba39c };
    look.bottom = { color: 0x23262d, colorB: 0x16120e, belt: true, shorts: false, boots: 0x16120e, socks: null };
    look.shoes = { color: 0x16120e, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = null;
  },
  /** "Uncle" Faris Haddad, the old mechanic: grease-stained sand overalls, grey beard, cap. */
  faris(look) {
    look.figure = 'm';
    look.build = { height: 0.96, bulk: 1.22, shoulders: 1.02, hips: 1.05 };
    look.skin = 0xb07548;
    look.hair = 0x9a948c;
    look.hairStyle = 'buzz';
    look.beard = 0xa8a198;
    look.top = { color: 0x8a7a5c, colorB: 0x5e4b34, pattern: 'yoke', sleeves: 'short', sleeveColor: null, sleevePattern: null, cuff: null };
    look.bottom = { color: 0x8a7a5c, colorB: 0x3a2a1e, belt: true, shorts: false, boots: 0x3a2a1e, socks: null };
    look.shoes = { color: 0x3a2a1e, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = { kind: 'cap', color: 0x2f4a6d, colorB: 0xe9b44c, pattern: 'twoTone' };
  },
  /** Tavi Rourke, the inside man: a cream security-firm suit with a coral tie. */
  tavi(look) {
    look.figure = 'm';
    look.build = { height: 1.04, bulk: 0.92, shoulders: 1.0, hips: 0.95 };
    look.skin = 0xf0c9a8;
    look.hair = 0xb5652e;
    look.hairStyle = 'short';
    look.beard = null;
    look.top = { color: 0xd9c9a6, colorB: 0xe4572e, pattern: 'suit', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: 0xf4f1e8 };
    look.bottom = { color: 0xd9c9a6, colorB: 0x4a2e1c, belt: true, shorts: false, boots: null, socks: null };
    look.shoes = { color: 0x4a2e1c, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = null;
  },
  /** Captain Rasha Dahan, the handler: PSPD dress uniform, hair in a dark scarf. */
  rasha(look) {
    look.figure = 'f';
    look.build = { height: 0.99, bulk: 0.98, shoulders: 0.95, hips: 1.02 };
    look.skin = 0xc68a5f;
    look.hair = 0x16110d;
    look.hairStyle = 'none';
    look.beard = null;
    look.top = { color: 0xc9a66b, colorB: 0x1c2b45, pattern: 'police', sleeves: 'long', sleeveColor: null, sleevePattern: 'patch', cuff: null };
    look.bottom = { color: 0x1c2b45, colorB: 0x121417, belt: true, shorts: false, boots: 0x121417, socks: null };
    look.shoes = { color: 0x121417, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = { kind: 'headScarf', color: 0x1c2b45, colorB: 0xc9a24a, pattern: 'trim' };
  },
  /** Idris Vane, the tycoon: an ivory robe with a gold-trimmed cloak line and a white head cloth. */
  idris(look) {
    look.figure = 'm';
    look.build = { height: 1.02, bulk: 1.12, shoulders: 1.0, hips: 1.04 };
    look.skin = 0xd9a57c;
    look.hair = 0x3b2618;
    look.hairStyle = 'none';
    look.beard = 0x3b2618;
    look.top = { color: 0xfaf6ec, colorB: 0xc9a24a, pattern: 'robe', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: 0xc9a24a };
    look.bottom = { color: 0xfaf6ec, colorB: 0x16120e, belt: false, shorts: false, boots: null, socks: null };
    look.shoes = { color: 0x4a2e1c, sole: null, sandals: true };
    look.gloves = null;
    look.garment = { kind: 'robe', color: 0xfaf6ec, trim: 0xc9a24a, length: 1 };
    look.headwear = { kind: 'headCloth', color: 0xfdfbf5, colorB: 0xb8282c, pattern: 'plain' };
  },
};

/** The parts every look shares: figure, build, skin, hair and a plain outfit the dressers then change. */
function baseLook(archetype, r) {
  const figure = archetype === 'swat' ? (r.chance(0.12) ? 'f' : 'm') : r.chance(archetype === 'gang' ? 0.25 : 0.46) ? 'f' : 'm';
  const female = figure === 'f';
  const heavy = r.chance(0.16);
  const hair = r.weighted(HAIR_COLOURS, HAIR_WEIGHTS);
  const look = {
    archetype,
    figure,
    build: {
      height: female ? r.range(0.92, 0.99) : r.range(0.96, 1.06),
      bulk: heavy ? r.range(1.18, 1.34) : r.range(0.9, 1.1),
      shoulders: female ? r.range(0.88, 0.94) : r.range(0.98, 1.08),
      hips: female ? r.range(1.03, 1.09) : r.range(0.94, 1.0),
    },
    skin: pickSkin(r),
    hair,
    hairStyle: female ? r.weighted(['long', 'volume', 'short'], [6, 2, 2]) : r.weighted(['short', 'buzz', 'volume', 'none'], [6, 3, 2, 1]),
    beard: !female && r.chance(0.28) ? hair : null,
    eyes: r.pick([0x1a120c, 0x2a1a10, 0x1d2a24]),
    top: { color: 0xf4f1e8, colorB: 0xf4f1e8, pattern: 'plain', sleeves: 'short', sleeveColor: null, sleevePattern: null, cuff: null },
    bottom: { color: 0x3d5a80, colorB: 0x2a1e16, belt: false, shorts: false, boots: null, socks: null },
    shoes: { color: 0x2b2b2b, sole: null, sandals: false },
    gloves: null,
    garment: null,
    headwear: null,
    scarf: null,
  };
  return look;
}

function pickSkin(r) {
  return r.weighted(SKIN_TONES, SKIN_WEIGHTS);
}

/** A colour darkened (factor < 1) or lightened toward white (factor > 1). */
export function shade(hex, factor) {
  let red = (hex >> 16) & 255;
  let green = (hex >> 8) & 255;
  let blue = hex & 255;
  if (factor <= 1) {
    red *= factor; green *= factor; blue *= factor;
  } else {
    const t = Math.min(1, factor - 1);
    red += (255 - red) * t; green += (255 - green) * t; blue += (255 - blue) * t;
  }
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
}

/** Give any random source (or none) the helpers the dressers use. */
function wrapRandom(rng) {
  const next = rng && typeof rng.next === 'function' ? () => rng.next() : Math.random;
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length) % list.length],
    weighted(list, weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i += 1) total += weights[i];
      let roll = next() * total;
      for (let i = 0; i < list.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) return list[i];
      }
      return list[list.length - 1];
    },
  };
}

/** A tiny deterministic stream from a word, so each cast member always looks the same. */
function seededSequence(word) {
  let state = 2166136261;
  for (let i = 0; i < word.length; i += 1) state = Math.imul(state ^ word.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN_TONES = [0xf6d7bd, 0xeec29d, 0xe0aa80, 0xcf9467, 0xb87a4e, 0x9c6340, 0x7d4b2e, 0x5c3721];
const SKIN_WEIGHTS = [2, 3, 4, 4, 4, 3, 3, 2];
const TOURIST_SKIN_WEIGHTS = [5, 5, 4, 3, 2, 1, 1, 1];
const HAIR_COLOURS = [0x16110d, 0x2a1d14, 0x4a2f1c, 0x6e3f22, 0xb8863f, 0x8c8780, 0xd8d2c6];
const HAIR_WEIGHTS = [8, 6, 4, 2, 2, 1, 0.5];
const EVERYDAY_TOPS = [0xf4f1e8, 0x2f4a6d, 0x1ba39c, 0xe4572e, 0xe9b44c, 0x6b7a3a, 0x8fb3c9, 0x6c727a, 0x22252b, 0xb24a6a, 0x4d9de0, 0xd8c08a];
const TEE_COLOURS = [0xf4f1e8, 0x22252b, 0xe9b44c, 0x8fb3c9, 0xe4572e];
const BRIGHT_SHIRTS = [0xff6f59, 0x2ec4b6, 0xffd23f, 0xf78fb3, 0x7bd389, 0x4d9de0, 0xff9f1c, 0xb388eb];
const TROUSER_COLOURS = [0x3d5a80, 0x2c3e5c, 0xb59f78, 0x22252b, 0x6c727a, 0xe9dcc0, 0x5a6638, 0x8a6a48];
const SKIRT_COLOURS = [0x2f4a6d, 0xe4572e, 0x1ba39c, 0x22252b, 0xe9b44c, 0xb24a6a, 0xf4f1e8];
const BELT_COLOURS = [0x2a1e16, 0x16120e, 0x6b4a2f];
const SHOE_COLOURS = [0xf1ede4, 0x2b2b2b, 0x6b4a2f, 0x3a2a1e, 0x8fb3c9, 0xe4572e];
const CAP_COLOURS = [0x22252b, 0xf4f1e8, 0x1ba39c, 0xe4572e, 0x2f4a6d, 0xe9b44c];
