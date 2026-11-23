// The Cover meter: Zayd's double life as two numbers. Crew trust rises when he does what the heist
// crew wants; the badge rises when he does what Captain Dahan asks, and often one costs the other.
// Trust at zero and the crew smells a cop (the job is blown); badge at zero and Dahan cuts him loose.
// Becomes game.story, which also keeps the saved story flags, the ending, the cast and the line queue.
import { STORY_CAST, spawnCast, speakerOf, createDialogueQueue } from './storyCast.js';

/** Both halves of the meter start here, out of 100. */
const STARTING_COVER = 50;
/** Where crew trust settles after the crew has blown a job on him: Faris talks them round. */
const SECOND_CHANCE_TRUST = 12;
/** The vault's two endings need at least this much of their side. */
const ENDING_THRESHOLD = 35;

/**
 * Create game.story.
 * @returns {Object} story: crewTrust, badge, addTrust(n, why), addBadge(n, why), flags, flag(name, value?),
 *   ending, setEnding(which), cast, castMember(id), spawnCast(castId, x, z, heading), dialogue, say(lines),
 *   canCallItIn, canTakeTheGold, serialize(), deserialize(data), reset(), update(dt)
 */
export function createCoverMeter(game) {
  const dialogue = createDialogueQueue(game);
  let secondChanceIn = 0;
  let raisingStars = false;

  const story = {
    crewTrust: STARTING_COVER,
    badge: STARTING_COVER,
    /** Saved story facts: choices made, side objectives met, cutLoose, ending, owned safehouses. */
    flags: {},
    /** null until the vault: 'badge' (called it in) or 'crew' (took the gold). */
    ending: null,
    cast: STORY_CAST,
    dialogue,

    /** Move crew trust by n (a toast shows the reason: "CREW TRUST +6: Faris is impressed"). */
    addTrust(n, why) {
      change('trust', n, why);
    },
    /** Move the badge by n. */
    addBadge(n, why) {
      change('badge', n, why);
    },
    /** Read a flag, or set it when a value is given. */
    flag(name, value) {
      if (arguments.length < 2) return story.flags[name];
      story.flags[name] = value;
      game.events.emit('story:flag', { name, value });
      return value;
    },
    /** The vault's choice: 'badge' or 'crew'. */
    setEnding(which) {
      story.ending = which;
      story.flags.ending = which;
      game.events.emit('story:ending', { ending: which });
    },
    castMember: (id) => STORY_CAST[id] || null,
    speaker: speakerOf,
    spawnCast: (castId, x, z, heading) => spawnCast(game, castId, x, z, heading),
    say: (lines, owner) => dialogue.say(lines, owner),
    get canCallItIn() {
      return story.badge >= ENDING_THRESHOLD && !story.flags.cutLoose;
    },
    get canTakeTheGold() {
      return story.crewTrust >= ENDING_THRESHOLD;
    },

    update(dt) {
      dialogue.update(dt);
      if (secondChanceIn > 0) {
        secondChanceIn -= dt;
        if (secondChanceIn <= 0 && story.crewTrust < SECOND_CHANCE_TRUST) {
          const delta = SECOND_CHANCE_TRUST - story.crewTrust;
          story.crewTrust = SECOND_CHANCE_TRUST;
          game.events.emit('cover:changed', { crewTrust: story.crewTrust, badge: story.badge, delta, which: 'trust', why: 'Faris vouched for you again' });
          game.events.emit('notify', { text: 'Faris vouched for you again. The crew is watching.', kind: 'info' });
        }
      }
    },

    serialize() {
      return { crewTrust: story.crewTrust, badge: story.badge, flags: JSON.parse(JSON.stringify(story.flags)), ending: story.ending };
    },
    deserialize(data) {
      if (!data) return;
      story.crewTrust = clampCover(data.crewTrust, STARTING_COVER);
      story.badge = clampCover(data.badge, STARTING_COVER);
      story.flags = data.flags && typeof data.flags === 'object' ? data.flags : {};
      story.ending = data.ending || null;
      secondChanceIn = 0;
      dialogue.clear();
    },
    reset() {
      story.crewTrust = STARTING_COVER;
      story.badge = STARTING_COVER;
      story.flags = {};
      story.ending = null;
      secondChanceIn = 0;
      dialogue.clear();
    },
  };

  /** Move one side of the meter, tell the player why, and apply what happens at zero. */
  function change(which, n, why) {
    const amount = Number(n) || 0;
    if (amount === 0) return;
    const key = which === 'trust' ? 'crewTrust' : 'badge';
    const before = story[key];
    const after = clampCover(before + amount, before);
    story[key] = after;
    const delta = after - before;
    if (delta === 0) return;
    game.events.emit('cover:changed', { crewTrust: story.crewTrust, badge: story.badge, delta, which, why: why || '' });
    const label = which === 'trust' ? 'CREW TRUST' : 'BADGE';
    const sign = delta > 0 ? '+' : '';
    game.events.emit('notify', { text: `${label} ${sign}${Math.round(delta)}${why ? `: ${why}` : ''}`, kind: delta > 0 ? 'good' : 'bad' });
    if (after > 0 || before <= 0) return;
    if (which === 'trust') crewSmellsACop();
    else handlerCutsLoose();
  }

  /** Trust hit zero: the crew made him. The job in hand is blown; Faris talks them round afterwards. */
  function crewSmellsACop() {
    game.events.emit('cover:blown', { which: 'trust' });
    const missions = game.missions;
    if (missions && missions.active && typeof missions.fail === 'function') missions.fail('The crew made you');
    secondChanceIn = 6;
  }

  /** The badge hit zero: one warning call from Dahan, then PSPD stops holding back. */
  function handlerCutsLoose() {
    if (story.flags.cutLoose) return;
    story.flags.cutLoose = true;
    game.events.emit('cover:cutLoose', {});
    const lines = [
      ['dahan', 'Karam. You have gone dark on me one time too many.'],
      ['dahan', 'As of now, PSPD stops holding back. You are on your own.'],
    ];
    if (game.phone && typeof game.phone.ring === 'function') game.phone.ring('dahan', lines);
    else dialogue.say(lines);
  }

  // Cut loose: every pursuit starts a star higher than the crime alone would bring.
  game.events.on('wanted:changed', (event) => {
    if (!story.flags.cutLoose || raisingStars || !event || event.previous !== 0 || !(event.level > 0) || event.level >= 5) return;
    const wanted = game.wanted;
    if (!wanted || wanted.locked) return;
    raisingStars = true;
    try {
      if (typeof wanted.add === 'function') wanted.add(1);
      else wanted.set?.(event.level + 1);
    } finally {
      raisingStars = false;
    }
  });

  return story;
}

function clampCover(value, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
