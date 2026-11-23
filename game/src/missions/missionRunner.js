// The job board of Port Sarab: registers the story's jobs, decides which are on offer (the story
// outline), shows them at their contacts, runs a job's script when Zayd takes it, pays out on success,
// and on failure offers a quick retry from the last checkpoint. Fails the job when Zayd is knocked out
// or arrested; saves and loads progress. Becomes game.missions.
import { JOB_LIST } from './jobList.js';
import { createJobRun } from './jobContext.js';
import { createJobContacts } from './jobContacts.js';
import { isJobEnded } from './jobWaits.js';
import { jobsOnOffer, nextJobAfter, rewardForJob, jobIsFinale, STORY_JOBS } from './storyJobOutline.js';

/** Seconds the quick retry stays on offer after a failure. */
const RETRY_SECONDS = 15;
/** Leftovers of a finished job vanish once the player is this far away, or after this long. */
const LEFTOVER_DISTANCE = 110;
const LEFTOVER_SECONDS = 150;

/**
 * Create game.missions.
 * @returns {Object} missions: active, start(id, options?), abort(reason), fail(reason), isCompleted(id),
 *   completedCount, total, log(), available(), guideTo(jobId), reset(), hint, hintTitle, update(dt),
 *   serialize(), deserialize(data)
 */
export function createMissionRunner(game) {
  const jobs = JOB_LIST.filter(isUsableJob).slice().sort((a, b) => (a.order || 99) - (b.order || 99));
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const outlineIds = new Set(STORY_JOBS.map((entry) => entry.id));
  warnWhereJobsDisagreeWithOutline(jobs);
  const completed = new Set();
  const leftovers = [];
  let run = null;
  let retry = null;
  let guide = null;
  let refreshIn = 0;
  const contacts = createJobContacts(game, {
    isBusy: () => run !== null,
    isRetrying: () => retry !== null,
    start: (id) => start(id),
    guide: () => guide,
    clearGuide: () => {
      guide = null;
    },
  });

  const missions = {
    /** The running job as the HUD reads it: {id, title, giver, objectives, timer, counter}, or null. */
    active: null,
    /** A line for the HUD's "next job" card when the runner has something to say (a retry). */
    hint: '',
    hintTitle: '',
    jobs,
    start,
    abort,
    fail,
    isCompleted: (id) => completed.has(id),
    get completedCount() {
      return completed.size;
    },
    get total() {
      return Math.max(STORY_JOBS.length, jobs.length);
    },
    log,
    available,
    guideTo,
    reset,
    /** End a playing cutscene now (its m.cutscene resolves on the next frame). */
    skipCutscene: () => game.cutscenes?.skip?.(),
    update,
    serialize,
    deserialize,
    /** The run in progress (for tools and tests). */
    get run() {
      return run;
    },
  };

  /**
   * Start a job now. options.resumeFrom names the checkpoint to restart from.
   * @returns {boolean} false when a job is already running or the id is unknown
   */
  function start(id, options = {}) {
    if (run) return false;
    const job = jobById.get(id);
    if (!job) {
      console.warn(`missions: no job called "${id}"`);
      return false;
    }
    retry = null;
    setHint('', '');
    if (guide === id) guide = null;
    const thisRun = createJobRun(game, job, {
      resumeFrom: options.resumeFrom || null,
      giver: () => contacts.giverOf(job),
      fail: (failing, reason) => finish(failing, 'failed', reason),
      scriptError: reportScriptError,
      adoptCast: (castId) => contacts.adoptCast(castId) || adoptLeftover(castId),
      keepCast: (person) => contacts.keepCast(person),
      leftover: (entity) => leftovers.push({ entity, age: 0 }),
    });
    run = thisRun;
    missions.active = thisRun.view;
    contacts.hideAllBut(job);
    game.events.emit('mission:started', { mission: thisRun.view, resumeFrom: thisRun.resumeFrom });
    Promise.resolve()
      .then(() => job.run(thisRun.m))
      .then(() => {
        if (!thisRun.ended) complete(thisRun);
      }, (error) => {
        if (thisRun.ended) return;
        if (isJobEnded(error)) finish(thisRun, 'failed', error.message);
        else reportScriptError(thisRun, error);
      });
    return true;
  }

  /** End the running job without counting it as blown (loading a save, a new game). */
  function abort(reason = 'aborted') {
    if (reason === 'load' || reason === 'newGame') {
      retry = null;
      clearLeftovers();
      contacts.clear();
      refreshIn = 0;
    }
    if (!run) return false;
    const ending = run;
    ending.end('aborted', reason);
    run = null;
    missions.active = null;
    refreshIn = 0;
    game.events.emit('mission:aborted', { mission: ending.view, reason });
    return true;
  }

  /** Blow the running job now with a reason ("The crew made you"). */
  function fail(reason) {
    if (!run) return false;
    finish(run, 'failed', reason || 'The job fell apart.');
    return true;
  }

  /** The script returned: pay out, tick it off, unlock what follows, ring any calls it left. */
  function complete(ending) {
    const job = ending.job;
    ending.end('completed');
    run = null;
    missions.active = null;
    completed.add(job.id);
    const reward = job.reward || rewardForJob(job.id) || {};
    const economy = game.economy;
    if (economy && reward.money) economy.addMoney(reward.money, `Job: ${job.title}`);
    if (economy && reward.rep) economy.addRep?.(reward.rep, job.title);
    game.events.emit('mission:completed', { mission: ending.view, reward, finale: jobIsFinale(job.id) });
    if (!game.menus) game.events.emit('notify', { text: `${job.title}: done${reward.money ? `  +$${reward.money.toLocaleString('en-US')}` : ''}`, kind: 'cash', seconds: 6 });
    for (const call of ending.afterCalls) {
      if (game.phone && typeof game.phone.schedule === 'function') game.phone.schedule(call.castId, call.lines, call.delay);
      else game.story?.say?.(call.lines);
    }
    refreshIn = 0;
  }

  /** The job is blown: clear it away, tell everyone, and offer the quick retry. */
  function finish(ending, outcome, reason) {
    if (ending.ended) return;
    ending.end(outcome, reason);
    if (run === ending) {
      run = null;
      missions.active = null;
    }
    refreshIn = 0;
    game.events.emit('mission:failed', { mission: ending.view, reason });
    if (!game.menus) game.events.emit('notify', { text: `Job blown: ${reason}`, kind: 'bad', seconds: 6 });
    retry = { id: ending.job.id, title: ending.job.title, checkpoint: ending.checkpoint, left: RETRY_SECONDS };
  }

  function reportScriptError(failing, error) {
    if (failing.ended) return;
    console.warn(`job "${failing.job.id}" stopped on an error:`, error);
    finish(failing, 'failed', 'Something went wrong');
  }

  /** Every frame: the running job, the retry offer, the contacts and their givers, the leftovers. */
  function update(dt) {
    if (run) run.update(dt);
    updateRetry(dt);
    refreshIn -= dt;
    if (refreshIn <= 0) {
      refreshIn = 0.5;
      contacts.refresh(currentOffers());
    }
    contacts.update(dt);
    updateLeftovers(dt);
  }

  // ---- What is on offer ------------------------------------------------------------------------

  /**
   * The jobs that could be taken now. The story outline decides for its ten jobs (done, requirements
   * done, open at this hour); a loaded job the outline does not know goes by its own requirements.
   */
  function available() {
    const hour = game.time.hour;
    const offered = [];
    for (const entry of jobsOnOffer(Array.from(completed), hour)) {
      const job = jobById.get(entry.id);
      if (job && placeOf(job.contact)) offered.push(job);
    }
    for (const job of jobs) {
      if (outlineIds.has(job.id) || completed.has(job.id) || !placeOf(job.contact)) continue;
      if ((job.requires || []).every((id) => completed.has(id)) && withinHours(job.hours, hour)) offered.push(job);
    }
    return offered;
  }

  /** contact place id -> the first job on offer there (nothing while a job runs). */
  function currentOffers() {
    const offers = new Map();
    if (run) return offers;
    for (const job of available()) if (!offers.has(job.contact)) offers.set(job.contact, job);
    return offers;
  }

  /** The story so far for the pause menu: all ten jobs in order, done or not, with their briefings. */
  function log() {
    const open = new Set(available().map((job) => job.id));
    const entries = STORY_JOBS.map((entry) => {
      const job = jobById.get(entry.id);
      const next = nextJobAfter(entry.id);
      return { id: entry.id, order: entry.order, title: entry.title, giver: entry.giver, done: completed.has(entry.id), available: open.has(entry.id), briefing: job ? job.briefing || '' : '', next: next ? next.id : null, finale: jobIsFinale(entry.id) };
    });
    for (const job of jobs) {
      if (!outlineIds.has(job.id)) entries.push({ id: job.id, order: job.order, title: job.title, giver: job.giver, done: completed.has(job.id), available: open.has(job.id), briefing: job.briefing || '', next: null, finale: false });
    }
    return entries;
  }

  /** Put the GPS on a job's contact until the player gets there (the new-game hint). */
  function guideTo(jobId) {
    guide = jobId;
    refreshIn = 0;
  }

  /** Forget all progress (a new game). */
  function reset() {
    abort('newGame');
    completed.clear();
    retry = null;
    guide = null;
    setHint('', '');
    refreshIn = 0;
  }

  // ---- Retry, leftovers, saving ---------------------------------------------------------------

  function updateRetry(dt) {
    if (!retry) return;
    const player = game.player;
    if (!player || player.state === 'down' || game.mode === 'dead') return;
    retry.left -= dt;
    if (retry.left <= 0 || run) {
      retry = null;
      setHint('', '');
      return;
    }
    setHint(`Press E to retry "${retry.title}"`, 'JOB BLOWN');
    if (game.mode !== 'playing') return;
    game.prompts?.offer?.(30, 'E', `Retry "${retry.title}"`);
    if (game.input.pressed('interact')) retryNow();
  }

  /** Back to the last checkpoint (or the contact), through a quick fade. */
  function retryNow() {
    const again = retry;
    retry = null;
    setHint('', '');
    game.wanted?.clear?.();
    const job = jobById.get(again.id);
    const restart = () => {
      if (!again.checkpoint && job) placePlayerAtContact(job);
      start(again.id, { resumeFrom: again.checkpoint || null });
      game.cutscenes?.fadeIn?.(0.6);
    };
    const director = game.cutscenes;
    if (director && typeof director.fadeOut === 'function') director.fadeOut(0.35).then(restart);
    else restart();
  }

  function placePlayerAtContact(job) {
    const place = placeOf(job.contact);
    const player = game.player;
    if (!place || !player || !player.character) return;
    const out = place.heading + Math.PI;
    player.teleport(place.x + Math.sin(out) * 2.6, place.z + Math.cos(out) * 2.6, place.heading);
  }

  /** What a finished job left near the player goes once he has driven off (or after a while). */
  function updateLeftovers(dt) {
    const player = game.player;
    for (let i = leftovers.length - 1; i >= 0; i -= 1) {
      const item = leftovers[i];
      const entity = item.entity;
      item.age += dt;
      if (entity.despawned) {
        leftovers.splice(i, 1);
        continue;
      }
      if (player && player.vehicle === entity) {
        entity.tags.mission = false;
        leftovers.splice(i, 1);
        continue;
      }
      const far = !player || !player.character || Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) > LEFTOVER_DISTANCE;
      if (far || item.age > LEFTOVER_SECONDS) {
        leftovers.splice(i, 1);
        removeEntity(entity);
      }
    }
  }

  /** A cast member left over from the last job is reused rather than standing in two places. */
  function adoptLeftover(castId) {
    for (let i = 0; i < leftovers.length; i += 1) {
      const entity = leftovers[i].entity;
      if (entity.tags && entity.tags.castId === castId && entity.alive !== false && !entity.despawned) {
        leftovers.splice(i, 1);
        return entity;
      }
    }
    return null;
  }

  function clearLeftovers() {
    for (const item of leftovers.splice(0, leftovers.length)) removeEntity(item.entity);
  }

  function removeEntity(entity) {
    const player = game.player;
    if (entity.spec) {
      if (player && player.vehicle === entity) return;
      for (const occupant of (entity.passengers || []).concat(entity.driver ? [entity.driver] : [])) {
        if (occupant && !(player && occupant === player.character)) game.characters?.exitVehicle?.(occupant, { instant: true });
      }
      game.vehicles?.despawn?.(entity);
    } else if (!entity.despawned) {
      game.weapons?.ai?.disengage?.(entity);
      entity.despawned = true;
      game.characters?.despawn?.(entity);
    }
  }

  /** Finished jobs, and the job in progress with its checkpoint (offered as a retry after loading). */
  function serialize() {
    return {
      completed: Array.from(completed),
      resume: run ? { id: run.job.id, checkpoint: run.checkpoint } : retry ? { id: retry.id, checkpoint: retry.checkpoint } : null,
    };
  }

  function deserialize(data) {
    completed.clear();
    for (const id of (data && data.completed) || []) if (jobById.has(id)) completed.add(id);
    const resume = data && data.resume;
    const job = resume && jobById.get(resume.id);
    retry = job && !completed.has(job.id) ? { id: job.id, title: job.title, checkpoint: resume.checkpoint || null, left: RETRY_SECONDS } : null;
    refreshIn = 0;
  }

  function setHint(text, title) {
    missions.hint = text;
    missions.hintTitle = title;
  }

  function placeOf(id) {
    return game.city && game.city.place ? game.city.place(id) : null;
  }

  game.events.on('player:died', () => fail('You were knocked out.'));
  game.events.on('player:arrested', () => fail('You were arrested.'));

  return missions;
}

/** A job module the runner can use: an id, a title, a contact and a run() script. */
function isUsableJob(job) {
  const usable = job && typeof job.id === 'string' && typeof job.run === 'function' && typeof job.contact === 'string';
  if (!usable) console.warn('missions: a job in the list is missing its id, contact or run()', job);
  return usable;
}

/** Say once, at start-up, where a loaded job module differs from the story outline. */
function warnWhereJobsDisagreeWithOutline(jobs) {
  const notes = [];
  for (const job of jobs) {
    const entry = STORY_JOBS.find((item) => item.id === job.id);
    if (!entry) {
      notes.push(`${job.id} (not in the outline)`);
      continue;
    }
    for (const field of ['order', 'title', 'giver', 'contact']) if (job[field] !== entry[field]) notes.push(`${job.id}.${field}`);
    if ((job.requires || []).join(',') !== entry.requires.join(',')) notes.push(`${job.id}.requires`);
    const reward = job.reward || {};
    if (reward.money !== entry.reward.money || reward.rep !== entry.reward.rep) notes.push(`${job.id}.reward`);
  }
  if (notes.length) console.warn(`missions: job modules disagree with the story outline: ${notes.join(', ')}`);
}

/** Whether the hour falls in [from, to) of a job's hours (which may wrap past midnight). */
function withinHours(hours, hour) {
  if (!hours) return true;
  const from = hours[0];
  const to = hours[1];
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}
