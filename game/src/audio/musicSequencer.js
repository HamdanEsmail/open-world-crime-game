// The step sequencer behind every music station: a composer describes songs (key, tempo, form, motifs)
// and bars (a list of hits and notes on a sixteen-step grid); the sequencer plays them a little ahead
// on the audio clock, swings the off-steps, and moves from song to song forever. Songs and bars are
// pure functions of a seed, so a station can be joined mid-song exactly where it "would" be.
// Also here: the scales, chords, voice leading and motif writing the composers share.
import { playInstrument } from './synthInstruments.js';

/** Silence between two songs, in seconds. */
export const SONG_GAP = 0.8;

/**
 * Run a composer on a context.
 * @param {BaseAudioContext} ctx
 * @param {Object<string, AudioNode>} channels  mixer inputs by channel name
 * @param {{makeSong:(rng:Object, index:number)=>Object, composeBar:(song:Object, bar:number, rng:Object)=>Object[]}} composer
 * @param {number} seed
 * @param {(song:Object)=>void} [onSong]  told when each new song begins
 */
export function createSequencer(ctx, channels, composer, seed, onSong) {
  let songIndex = 0;
  let song = null;
  let barIndex = 0;
  let barStart = 0;
  let events = [];
  let cursor = 0;

  function songAt(index) {
    return composer.makeSong(createMusicRandom(mixSeed(seed, index * 7919 + 13)), index);
  }

  function begin(index, bar, time) {
    songIndex = index;
    song = songAt(index);
    barIndex = bar;
    barStart = time;
    prepareBar();
    if (onSong) onSong(song);
  }

  function prepareBar() {
    events = composer.composeBar(song, barIndex, createMusicRandom(mixSeed(seed, songIndex * 100003 + barIndex * 31 + 7)));
    events.sort(byStep);
    cursor = 0;
  }

  function stepTime(step) {
    const whole = Math.floor(step);
    return barStart + step * song.stepSeconds + (whole % 2 === 1 ? song.swing * song.stepSeconds : 0);
  }

  /**
   * Join the broadcast `elapsed` seconds after it began, starting on the next bar line at `time`.
   */
  function seek(elapsed, time) {
    let accumulated = 0;
    for (let index = 0; index < 5000; index += 1) {
      const s = songAt(index);
      const length = s.totalBars * s.barSeconds + SONG_GAP;
      if (accumulated + length > elapsed) {
        const bar = Math.ceil(Math.max(0, elapsed - accumulated) / s.barSeconds);
        if (bar >= s.totalBars) begin(index + 1, 0, time);
        else begin(index, bar, time);
        return;
      }
      accumulated += length;
    }
    begin(0, 0, time);
  }

  /** Play every event due before `until`. Events already late by the time we reach them are skipped. */
  function scheduleAhead(until, now = ctx.currentTime) {
    if (!song) begin(0, 0, now + 0.05);
    for (let guard = 0; guard < 64; guard += 1) {
      while (cursor < events.length) {
        const ev = events[cursor];
        const t = stepTime(ev.step);
        if (t > until) return;
        cursor += 1;
        if (t < now - 0.03) continue;
        ev.dur = (ev.len || 1) * song.stepSeconds;
        playInstrument(ctx, channels, ev, t);
      }
      barStart += song.barSeconds;
      barIndex += 1;
      // Asleep in a background tab: skip whole bars rather than burst them out late.
      while (barStart + song.barSeconds < now && barIndex < song.totalBars) {
        barStart += song.barSeconds;
        barIndex += 1;
      }
      if (barIndex >= song.totalBars) begin(songIndex + 1, 0, Math.max(barStart + SONG_GAP, now + 0.05));
      else prepareBar();
      if (barStart > until) return;
    }
  }

  return {
    seek,
    scheduleAhead,
    get song() {
      return song;
    },
    get bar() {
      return barIndex;
    },
  };
}

function byStep(a, b) {
  return a.step - b.step;
}

/** The modes and scales the stations write in, as semitones above the root. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
};

/** The note of scale degree `degree` (any integer: it wraps into higher and lower octaves). */
export function scaleNote(root, scale, degree) {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  const index = ((degree % n) + n) % n;
  return root + octave * 12 + scale[index];
}

/** A chord on a scale degree: `size` notes stacked in thirds (3 a triad, 4 a seventh, 5 a ninth). */
export function scaleChord(root, scale, degree, size = 4) {
  const notes = [];
  for (let i = 0; i < size; i += 1) notes.push(scaleNote(root, scale, degree + i * 2));
  return notes;
}

/**
 * Voice a chord near `centre`: each note moved by octaves to sit as close to the centre as it can,
 * and, when the last voicing is given, as close as possible to the notes it had before.
 */
export function voiceChord(notes, centre, previous) {
  const voiced = [];
  for (const note of notes) {
    let best = note;
    let bestCost = Infinity;
    for (let octave = -4; octave <= 4; octave += 1) {
      const candidate = note + octave * 12;
      let cost = Math.abs(candidate - centre);
      if (previous && previous.length) {
        let nearest = Infinity;
        for (const p of previous) nearest = Math.min(nearest, Math.abs(candidate - p));
        cost = cost * 0.4 + nearest;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = candidate;
      }
    }
    if (voiced.indexOf(best) === -1) voiced.push(best);
  }
  return voiced.sort((a, b) => a - b);
}

/**
 * Write a motif: a rhythm of onsets within `length` steps and a mostly stepwise contour of scale
 * degrees that comes to rest on a chord tone. Returns [{step, len, degree}].
 */
export function makeMotif(rng, { length = 32, density = 0.5, span = 5, start = 0, syncopation = 0.25 } = {}) {
  const notes = [];
  let degree = start;
  let step = 0;
  while (step < length) {
    if (notes.length === 0 || rng.next() < density) {
      let len = rng.weighted(MOTIF_LENGTHS, MOTIF_WEIGHTS);
      if (step + len > length) len = length - step;
      notes.push({ step, len, degree });
      degree = Math.max(-span, Math.min(span + 2, degree + rng.weighted(MOTIF_MOVES, MOTIF_MOVE_WEIGHTS)));
      step += len;
      if (rng.next() < syncopation) step += 1;
    } else {
      step += 2;
    }
  }
  if (notes.length) notes[notes.length - 1].degree = rng.pick([0, 2, 4, 7]);
  return notes;
}

const MOTIF_LENGTHS = [1, 2, 3, 4, 6];
const MOTIF_WEIGHTS = [2, 5, 1.5, 2.5, 1];
const MOTIF_MOVES = [-3, -2, -1, 0, 1, 2, 3, 4];
const MOTIF_MOVE_WEIGHTS = [0.8, 2, 5, 1, 5, 2, 0.8, 0.4];

/** A variation of a motif: some notes nudged, some split in two, the ending changed. */
export function varyMotif(rng, motif, amount = 0.3) {
  const out = [];
  for (let i = 0; i < motif.length; i += 1) {
    const n = motif[i];
    if (i > 0 && rng.next() < amount * 0.25) continue;
    let degree = n.degree;
    if (rng.next() < amount) degree += rng.pick([-2, -1, 1, 2]);
    if (n.len >= 2 && rng.next() < amount * 0.6) {
      const half = Math.floor(n.len / 2);
      out.push({ step: n.step, len: half, degree });
      out.push({ step: n.step + half, len: n.len - half, degree: degree + rng.pick([-1, 1]) });
    } else {
      out.push({ step: n.step, len: n.len, degree });
    }
  }
  if (out.length) out[out.length - 1].degree = rng.pick([0, 2, 4, -3]);
  return out;
}

/**
 * Add one bar of a two-bar (32-step) motif to `events`: the notes whose steps fall in bar `half`
 * (0 or 1), snapped to the chord on the beat, gliding from the previous note when `glide` is set.
 */
export function motifBar(events, motif, half, song, chordDegree, register, inst, p, vel, glide = false) {
  let previous = null;
  for (let i = 0; i < motif.length; i += 1) {
    const n = motif[i];
    const local = n.step - half * 16;
    let degree = n.step % 4 === 0 ? snapToChord(n.degree, chordDegree) : n.degree;
    if (song.avoid && song.avoid.indexOf(((degree % 7) + 7) % 7) !== -1) degree -= 1;
    const midi = scaleNote(song.root + register, song.scale, degree);
    if (local >= 0 && local < 16) {
      events.push({ step: local, inst, midi, len: Math.min(n.len, 16 - local + 2), vel: vel * (n.step % 4 === 0 ? 1 : 0.85), p, from: glide && previous !== null && Math.abs(previous - midi) <= 5 ? previous : undefined });
    }
    previous = midi;
  }
}

/** Move a melody degree to the nearest tone of the chord built on `chordDegree` (7-note scales). */
export function snapToChord(degree, chordDegree) {
  let best = degree;
  let bestDistance = Infinity;
  for (const tone of [0, 2, 4]) {
    const target = chordDegree + tone;
    const base = degree - (((degree - target) % 7) + 7) % 7;
    for (const candidate of [base, base + 7]) {
      const d = Math.abs(candidate - degree);
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * Lay out a song's form from [[sectionName, bars], ...]: returns {sections, totalBars} where each
 * section knows its first bar.
 */
export function buildForm(template) {
  const sections = [];
  let bar = 0;
  for (const [name, bars] of template) {
    sections.push({ name, start: bar, bars });
    bar += bars;
  }
  return { sections, totalBars: bar };
}

/** Where a bar falls in the form: the section, the bar within it, and whether a phrase ends here. */
export function sectionAt(song, bar) {
  const sections = song.sections;
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    const s = sections[i];
    if (bar >= s.start) {
      const barIn = bar - s.start;
      return {
        name: s.name,
        index: i,
        barIn,
        bars: s.bars,
        phraseEnd: barIn % 4 === 3 || barIn === s.bars - 1,
        sectionEnd: barIn === s.bars - 1,
        next: sections[i + 1] ? sections[i + 1].name : null,
      };
    }
  }
  return { name: sections[0].name, index: 0, barIn: 0, bars: sections[0].bars, phraseEnd: false, sectionEnd: false, next: null };
}

/** Tempo bookkeeping shared by every composer: seconds per sixteenth step and per bar. */
export function setTempo(song, bpm, swing = 0) {
  song.bpm = bpm;
  song.stepSeconds = 60 / bpm / 4;
  song.barSeconds = song.stepSeconds * 16;
  song.swing = swing;
  return song;
}

/** A song title from two word lists, and an artist from a third. */
export function nameSong(rng, firstWords, secondWords, artists) {
  return { title: `${rng.pick(firstWords)} ${rng.pick(secondWords)}`, artist: rng.pick(artists) };
}

/** A small seeded random source (mulberry32) for composing, independent of the world's streams. */
export function createMusicRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
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

/** Combine a seed and a number into a new well-mixed seed. */
export function mixSeed(seed, n) {
  let h = (seed ^ Math.imul(n | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
