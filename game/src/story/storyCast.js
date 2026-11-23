// The story's cast: Zayd "Dust" Karam, his handler Captain Rasha Dahan, the heist crew (Mina Okoro,
// "Uncle" Faris Haddad, Tavi Rourke), the mark Idris Vane and Sayf of the Dune Jackals. Their names,
// subtitle colours and roles, a fixed hand-dressed look for each so they are known at a glance, and
// the line queue that puts what they say on screen one line at a time, never two at once.

import { STORY_CAST_NAMES } from './coverMeterRules.js';

/** Everyone who speaks in the story, by the id job scripts use as a speaker: names, subtitle colour, body. */
export const STORY_CAST = {
  zayd: castMember('zayd', '#e9b44c', 'crew', 'crew', 'player'),
  dahan: castMember('dahan', '#6fb7ff', 'officer', 'police', 'business'),
  mina: castMember('mina', '#2ec4b6', 'crew', 'crew', 'worker'),
  faris: castMember('faris', '#f4a259', 'crew', 'crew', 'worker'),
  tavi: castMember('tavi', '#ffb627', 'crew', 'crew', 'worker'),
  vane: castMember('vane', '#fff4d6', 'target', 'vane', 'business'),
  sayf: castMember('sayf', '#ff6f59', 'gang', 'gang', 'gang'),
  dispatch: castMember('dispatch', '#8fb3c9'),
  radio: castMember('radio', '#e9dcc0'),
};

/**
 * Bring a cast member into the world in their own look, tagged with their cast id.
 * @returns {Object|null} the Character
 */
export function spawnCast(game, castId, x, z, heading = 0) {
  const member = STORY_CAST[castId];
  if (!member || !game.characters) return null;
  const person = game.characters.spawn({
    kind: member.kind || 'crew',
    faction: member.faction || 'crew',
    archetype: member.archetype || 'crew',
    x,
    z,
    heading,
    name: member.fullName,
    look: castLook(game, castId),
    health: 150,
  });
  if (!person) return null;
  person.tags.castId = castId;
  person.tags.story = true;
  person.tags.mission = true;
  return person;
}

/**
 * The fixed look of a cast member: a seeded random look of their kind, then dressed by hand.
 * @returns {Object} look
 */
export function castLook(game, castId) {
  const member = STORY_CAST[castId] || STORY_CAST.zayd;
  const stream = game.rng && game.rng.fork ? game.rng.fork(`cast-${castId}`) : null;
  const look = game.characters.randomLook(member.archetype || 'crew', stream);
  const dress = CAST_WARDROBE[castId];
  if (dress) dress(look);
  return look;
}

/** The display name and subtitle colour of a speaker (a cast id or a plain name). */
export function speakerOf(speaker) {
  const member = STORY_CAST[speaker];
  if (member) return { id: member.id, name: member.name, fullName: member.fullName, color: member.color, role: member.role };
  const name = speaker ? String(speaker) : '';
  return { id: null, name, fullName: name, color: '#fff4d6', role: '' };
}

/**
 * The line queue (game.story.dialogue): lines from jobs, phone calls and the intro wait their turn.
 * add() returns the line, whose `done` turns true once it has been shown.
 */
export function createDialogueQueue(game) {
  const queue = [];
  let current = null;
  let gap = 0;

  const dialogue = {
    /** Queue one line; seconds defaults to 2.2 + 0.045 per character. */
    add(speaker, text, seconds, owner = null) {
      const who = speakerOf(speaker);
      const words = String(text || '');
      const line = {
        speakerId: who.id,
        speaker: who.name,
        color: who.color,
        text: words,
        seconds: seconds || 2.2 + 0.045 * words.length,
        owner,
        left: 0,
        done: false,
        failed: false,
      };
      queue.push(line);
      if (!current && gap <= 0) startNext();
      return line;
    },
    /** Queue several [speaker, text, seconds?] lines; returns the last line. */
    say(lines, owner = null) {
      let last = null;
      for (const entry of lines || []) if (entry) last = dialogue.add(entry[0], entry[1], entry[2], owner);
      return last;
    },
    /** Drop the waiting lines of one owner (a failed job), or every line when no owner is given. */
    clear(owner) {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (owner === undefined || queue[i].owner === owner) {
          queue[i].failed = true;
          queue.splice(i, 1);
        }
      }
      if (current && (owner === undefined || current.owner === owner)) {
        current.done = true;
        current = null;
        gap = 0.1;
      }
    },
    update(dt) {
      if (current) {
        current.left -= dt;
        if (current.left > 0) return;
        current.done = true;
        current = null;
        gap = 0.18;
      }
      if (gap > 0) {
        gap -= dt;
        if (gap > 0) return;
      }
      if (queue.length > 0) startNext();
    },
    get busy() {
      return current !== null || queue.length > 0;
    },
    get current() {
      return current;
    },
  };

  function startNext() {
    current = queue.shift() || null;
    if (!current) return;
    current.left = current.seconds;
    game.events.emit('subtitle', { speaker: current.speaker, text: current.text, seconds: current.seconds, color: current.color, id: current.speakerId });
  }

  return dialogue;
}

/** One cast entry: the names and role from the story's cast list, plus how they look and speak. */
function castMember(id, color, kind, faction, archetype) {
  return { id, ...STORY_CAST_NAMES[id], color, kind, faction, archetype };
}

/** Hand-picked outfits, applied over each member's seeded random look. */
const CAST_WARDROBE = {
  zayd() {},
  /** Mina: teal work overalls over a cream tee, cropped natural hair. */
  mina(look) {
    look.figure = 'f';
    look.build = { height: 0.97, bulk: 0.94, shoulders: 0.92, hips: 1.04 };
    look.skin = 0x6f4429;
    look.hair = 0x16110d;
    look.hairStyle = 'volume';
    look.beard = null;
    look.top = { color: 0x1ba39c, colorB: 0x12756f, pattern: 'yoke', sleeves: 'short', sleeveColor: 0xfff4d6, sleevePattern: null, cuff: null };
    look.bottom = { color: 0x1ba39c, colorB: 0x0f5e59, belt: true, shorts: false, boots: 0x22252b, socks: null };
    look.shoes = { color: 0x22252b, sole: 0xf1ede4, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = null;
    look.scarf = null;
  },
  /** Faris: an oil-stained saffron work shirt, dark trousers, a grey beard under a flat cap. */
  faris(look) {
    look.figure = 'm';
    look.build = { height: 0.96, bulk: 1.24, shoulders: 1.03, hips: 1.06 };
    look.skin = 0xb07548;
    look.hair = 0x9a948c;
    look.hairStyle = 'buzz';
    look.beard = 0xa8a198;
    look.top = { color: 0xf4a259, colorB: 0x5e4b34, pattern: 'yoke', sleeves: 'short', sleeveColor: null, sleevePattern: null, cuff: null };
    look.bottom = { color: 0x4a4136, colorB: 0x2a1e16, belt: true, shorts: false, boots: 0x3a2a1e, socks: null };
    look.shoes = { color: 0x3a2a1e, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = { kind: 'cap', color: 0x3b3f4a, colorB: 0x2a2d33, pattern: 'twoTone' };
    look.scarf = null;
  },
  /** Tavi: a dock foreman's hi-vis vest over a navy shirt, red hair, work boots. */
  tavi(look) {
    look.figure = 'm';
    look.build = { height: 1.04, bulk: 0.95, shoulders: 1.02, hips: 0.95 };
    look.skin = 0xf0c9a8;
    look.hair = 0xb5652e;
    look.hairStyle = 'short';
    look.beard = null;
    look.top = { color: 0xff7a1a, colorB: 0xd9dde0, pattern: 'hivis', sleeves: 'long', sleeveColor: 0x2f3e56, sleevePattern: null, cuff: null };
    look.bottom = { color: 0x2f3e56, colorB: 0x16120e, belt: true, shorts: false, boots: 0x3a2a1e, socks: null };
    look.shoes = { color: 0x3a2a1e, sole: null, sandals: false };
    look.gloves = 0xc9a66b;
    look.garment = null;
    look.headwear = null;
    look.scarf = null;
  },
  /** Captain Dahan: a sand blazer over a navy shirt, hair under a dark scarf. */
  dahan(look) {
    look.figure = 'f';
    look.build = { height: 0.99, bulk: 0.98, shoulders: 0.95, hips: 1.02 };
    look.skin = 0xc68a5f;
    look.hair = 0x16110d;
    look.hairStyle = 'none';
    look.beard = null;
    look.top = { color: 0xc8b48e, colorB: 0x1c2b45, pattern: 'suit', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: 0xf4f1e8 };
    look.bottom = { color: 0x2b2f36, colorB: 0x16120e, belt: true, shorts: false, boots: null, socks: null };
    look.shoes = { color: 0x16120e, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = { kind: 'headScarf', color: 0x1c2b45, colorB: 0xc9a24a, pattern: 'trim' };
    look.scarf = null;
  },
  /** Idris Vane: a white suit with a gold tie, a trimmed beard, pale shoes. */
  vane(look) {
    look.figure = 'm';
    look.build = { height: 1.02, bulk: 1.1, shoulders: 1.02, hips: 1.02 };
    look.skin = 0xd9a57c;
    look.hair = 0x3b2618;
    look.hairStyle = 'short';
    look.beard = 0x3b2618;
    look.top = { color: 0xf6f3ea, colorB: 0xc9a24a, pattern: 'suit', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: 0xc9a24a };
    look.bottom = { color: 0xf6f3ea, colorB: 0xc9a24a, belt: true, shorts: false, boots: null, socks: null };
    look.shoes = { color: 0xe9dcc0, sole: null, sandals: false };
    look.gloves = null;
    look.garment = null;
    look.headwear = null;
    look.scarf = null;
  },
  /** Sayf: Jackal red and black, a checked head cloth and a red scarf over the mouth. */
  sayf(look) {
    look.figure = 'm';
    look.build = { height: 1.03, bulk: 1.04, shoulders: 1.06, hips: 0.97 };
    look.skin = 0x9c6340;
    look.hair = 0x16110d;
    look.hairStyle = 'short';
    look.beard = 0x16110d;
    look.top = { color: 0x8e2f25, colorB: 0x1d1a1a, pattern: 'sash', sleeves: 'long', sleeveColor: null, sleevePattern: null, cuff: null };
    look.bottom = { color: 0x1d1a1a, colorB: 0x16120e, belt: true, shorts: false, boots: 0x16120e, socks: null };
    look.shoes = { color: 0x16120e, sole: null, sandals: false };
    look.gloves = 0x16120e;
    look.garment = null;
    look.headwear = { kind: 'headCloth', color: 0x1d1a1a, colorB: 0x8e2f25, pattern: 'check' };
    look.scarf = { color: 0x8e2f25, colorB: 0x16120e };
  },
};
