// Deterministic random numbers: the same seed always builds the same Port Sarab, and each system
// forks its own stream so adding a palm tree never moves a mission.

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A seeded generator (mulberry32) with the helpers the game uses everywhere. */
export function createSeededRandom(seed = 1) {
  let state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rng = {
    /** 0 <= value < 1 */
    next,
    /** min <= value < max */
    range: (min, max) => min + (max - min) * next(),
    /** integer, min <= value <= max */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** -1 or 1 */
    sign: () => (next() < 0.5 ? -1 : 1),
    /** Pick by weight: weights is a parallel array of non-negative numbers. */
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
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
      return list;
    },
    /** An independent stream named by `label`, stable whatever else has drawn numbers. */
    fork: (label) => createSeededRandom(hashString(`${seed}:${label}`)),
  };
  return rng;
}
