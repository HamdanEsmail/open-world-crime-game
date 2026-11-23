// The job card and the job's voice: objectives with their ticks, the countdown and the tally on the
// card, "Get back in the Sirocco" when Zayd wanders off, and the lines, cutscenes, phone calls and
// fades a job script plays. One per job run; the job context hands these to scripts as m.objective,
// m.say, m.timer, m.cutscene and the rest.
import { endedPromise } from './jobWaits.js';

/**
 * Build the card and voice of one job run.
 * @param {Object} game
 * @param {Object} run    the run (view, owner, timers, nag, faded, ended)
 * @param {Object} waits  the run's waits (lines, cutscenes and calls are awaited through them)
 * @param {{live:Function, fail:Function, scriptError:Function}} ops
 */
export function createJobCard(game, run, waits, ops) {
  const card = { objective, subtitle, say, timer, counter, showCounter, clearCounter, nag, cutscene, phone, fade, updateTimers };

  /** Set the current objective; a new main objective ticks the previous one done. */
  function objective(text, options = {}) {
    ops.live();
    nag(null);
    const objectives = run.view.objectives;
    const optional = !!options.optional;
    if (!optional) for (const entry of objectives) if (!entry.done && !entry.optional) entry.done = true;
    const entry = { text, done: false, optional };
    objectives.push(entry);
    trimObjectives(objectives);
    game.events.emit('mission:objective', { mission: run.view, text });
    return {
      get text() { return entry.text; },
      done() {
        entry.done = true;
      },
      fail() {
        const index = objectives.indexOf(entry);
        if (index !== -1) objectives.splice(index, 1);
        if (!run.ended) game.events.emit('notify', { text: `Failed: ${entry.text}`, kind: 'bad' });
      },
    };
  }

  /** Show a line of dialogue; lines queue so they never overlap. Resolves once it has been shown. */
  function subtitle(speaker, text, seconds) {
    if (run.ended) return endedPromise(run.endReason);
    const dialogue = game.story && game.story.dialogue;
    if (dialogue) return waits.settleOn(dialogue.add(speaker, text, seconds, run.owner));
    const shown = seconds || 2.2 + 0.045 * String(text || '').length;
    game.events.emit('subtitle', { speaker, text, seconds: shown });
    return waits.seconds(shown);
  }

  /** Several lines in order: [[speaker, text, seconds?], ...]. Resolves after the last. */
  function say(lines) {
    if (run.ended) return endedPromise(run.endReason);
    let last = null;
    for (const line of lines || []) if (line) last = subtitle(line[0], line[1], line[2]);
    return last || waits.seconds(0);
  }

  /** A countdown on the job card; fails the job when it runs out unless onExpire says otherwise. */
  function timer(label, seconds, options = {}) {
    ops.live();
    const clock = {
      display: { label, seconds },
      remaining: seconds,
      onExpire: options.onExpire === undefined ? 'fail' : options.onExpire,
      reason: options.reason || 'Out of time.',
      stopped: false,
      tick: Math.ceil(seconds),
    };
    run.timers.push(clock);
    run.view.timer = clock.display;
    return {
      get remaining() { return Math.max(0, clock.remaining); },
      stop() {
        clock.stopped = true;
        refreshTimerDisplay();
      },
      add(more) {
        clock.remaining += more;
        clock.display.seconds = Math.max(0, clock.remaining);
      },
    };
  }

  /** A tally on the job card: {set(value), clear(), value}. */
  function counter(label, value = 0, of) {
    ops.live();
    const display = showCounter(label, value, of);
    return { set(v) { display.value = v; }, clear() { clearCounter(display); }, get value() { return display.value; } };
  }

  function showCounter(label, value, of) {
    const display = { label, value, of };
    run.view.counter = display;
    return display;
  }

  function clearCounter(display) {
    if (display && run.view.counter === display) run.view.counter = null;
  }

  /** Replace the current objective's text for a while ("Get back in the Sirocco"); null restores it. */
  function nag(text) {
    const objectives = run.view.objectives;
    if (text === null) {
      if (!run.nag) return;
      if (run.nag.temporary) {
        const index = objectives.indexOf(run.nag.entry);
        if (index !== -1) objectives.splice(index, 1);
      } else {
        run.nag.entry.text = run.nag.original;
      }
      run.nag = null;
      return;
    }
    if (!run.nag) {
      let entry = null;
      for (const candidate of objectives) if (!candidate.done && !candidate.optional) entry = candidate;
      if (entry) run.nag = { entry, original: entry.text, temporary: false };
      else {
        entry = { text, done: false, optional: false };
        objectives.push(entry);
        run.nag = { entry, original: text, temporary: true };
      }
    }
    run.nag.entry.text = text;
  }

  /** A cutscene through the director (letterboxed, skippable); resolves when it is over. */
  function cutscene(shots) {
    if (run.ended) return endedPromise(run.endReason);
    const director = game.cutscenes;
    if (!director || typeof director.play !== 'function') {
      let total = 0;
      for (const shot of shots || []) {
        if (shot.text) subtitle(shot.speaker || '', shot.text, shot.seconds);
        total += shot.seconds || 3;
      }
      return waits.seconds(total);
    }
    return waits.track(director.play(shots, { owner: run.owner }));
  }

  /** The phone rings; the lines play once it is answered. Resolves after the call. */
  function phone(castId, lines) {
    if (run.ended) return endedPromise(run.endReason);
    const handset = game.phone;
    if (!handset || typeof handset.ring !== 'function') return say(lines);
    return waits.track(handset.ring(castId, lines, { owner: run.owner }));
  }

  /** Fade the screen to black (out) or back (in). */
  function fade(out, seconds) {
    if (run.ended) return endedPromise(run.endReason);
    run.faded = out;
    const director = game.cutscenes;
    const fader = director && (out ? director.fadeOut : director.fadeIn);
    if (typeof fader !== 'function') return waits.seconds(0);
    return waits.track(fader.call(director, seconds));
  }

  /** Count the clocks down (outside cutscenes); a clock that runs out fails the job or calls onExpire. */
  function updateTimers(dt) {
    for (let i = 0; i < run.timers.length; i += 1) {
      const clock = run.timers[i];
      if (clock.stopped) continue;
      clock.remaining -= dt;
      clock.display.seconds = Math.max(0, clock.remaining);
      const whole = Math.ceil(clock.remaining);
      if (whole < clock.tick) {
        clock.tick = whole;
        if (whole <= 5 && whole >= 1) game.audio?.play?.('menuMove', { volume: 0.9 });
      }
      if (clock.remaining > 0) continue;
      clock.stopped = true;
      refreshTimerDisplay();
      if (clock.onExpire === 'fail') {
        ops.fail(clock.reason);
        return;
      }
      if (typeof clock.onExpire === 'function') {
        try {
          clock.onExpire();
        } catch (error) {
          ops.scriptError(error);
        }
      }
    }
  }

  function refreshTimerDisplay() {
    run.view.timer = null;
    for (const clock of run.timers) if (!clock.stopped) run.view.timer = clock.display;
  }

  return card;
}

/** Trim the job card's checklist: keep the newest few ticked steps, every open one. */
function trimObjectives(objectives) {
  while (objectives.length > 6) {
    const index = objectives.findIndex((entry) => entry.done);
    if (index === -1) break;
    objectives.splice(index, 1);
  }
}
