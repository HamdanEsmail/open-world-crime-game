// The job board of Port Sarab: registers the story's jobs, decides which are on offer, puts a lettered
// blip on each offered contact and stands the giver there, offers the job when Zayd walks up, runs its
// script, pays out on success, and on failure offers a quick retry from the last checkpoint. Fails the
// job when Zayd is knocked out or arrested; saves and loads progress. Becomes game.missions.
import { JOB_LIST } from './jobList.js';
import { createJobRun } from './jobContext.js';
import { isJobEnded } from './jobWaits.js';

/** Metres at which a giver appears at their contact, and beyond which they leave again. */
const GIVER_APPEARS = 120;
const GIVER_LEAVES = 160;
/** Metres from the giver at which the job is offered (on foot). */
const TALK_DISTANCE = 3;
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
  const completed = new Set();
  /** One post per contact place: where a giver stands and a blip marks the job on offer. */
  const posts = new Map();
  const leftovers = [];
  let run = null;
  let retry = null;
  let guide = null;
  let refreshIn = 0;

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
      return jobs.length;
    },
    log,
    available,
    guideTo,
    reset,
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
    const post = postOfJob(job);
    const thisRun = createJobRun(game, job, {
      resumeFrom: options.resumeFrom || null,
      giver: () => (post && !post.adopted ? post.giver : null),
      fail: (failing, reason) => finish(failing, 'failed', reason),
      scriptError: reportScriptError,
      adoptCast,
      keepCast,
      leftover: (entity) => leftovers.push({ entity, age: 0 }),
    });
    run = thisRun;
    missions.active = thisRun.view;
    hidePosts(post);
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
      clearPosts();
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
    const reward = job.reward || {};
    const economy = game.economy;
    if (economy && reward.money) economy.addMoney(reward.money, `Job: ${job.title}`);
    if (economy && reward.rep) economy.addRep?.(reward.rep, job.title);
    game.events.emit('mission:completed', { mission: ending.view, reward });
    if (!game.menus) game.events.emit('notify', { text: `${job.title}: done${reward.money ? `  +$${reward.money.toLocaleString('en-US')}` : ''}`, kind: 'cash', seconds: 6 });
    for (const call of ending.afterCalls) {
      if (game.phone && typeof game.phone.schedule === 'function') game.phone.schedule(call.castId, call.lines, call.delay);
      else game.story?.say?.(call.lines);
    }
    refreshIn = 0;
  }

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

  /** Every frame: the running job, the retry offer, the posts and their givers, the leftovers. */
  function update(dt) {
    if (run) run.update(dt);
    updateRetry(dt);
    refreshIn -= dt;
    if (refreshIn <= 0) {
      refreshIn = 0.5;
      refreshPosts();
    }
    updatePosts(dt);
    updateLeftovers(dt);
  }

  // ---- What is on offer ------------------------------------------------------------------------

  /** The jobs that could be taken now: not done, their requirements done, within their hours. */
  function available() {
    const hour = game.time.hour;
    return jobs.filter((job) => !completed.has(job.id) && (job.requires || []).every((id) => completed.has(id)) && withinHours(job.hours, hour) && placeOf(job.contact));
  }

  /** The story so far, for the pause menu. */
  function log() {
    const open = new Set(available().map((job) => job.id));
    return jobs.map((job) => ({ id: job.id, order: job.order, title: job.title, giver: job.giver, done: completed.has(job.id), available: open.has(job.id), briefing: job.briefing || '' }));
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

  /** Which job each contact offers now; blips added, changed or removed to match. */
  function refreshPosts() {
    const offers = new Map();
    if (!run) {
      for (const job of available()) {
        if (!offers.has(job.contact)) offers.set(job.contact, job);
      }
    }
    for (const [placeId, job] of offers) {
      const post = postAt(placeId, job.giver);
      if (!post) continue;
      if (post.job !== job) {
        post.job = job;
        post.greeted = false;
        removeMarker(post);
      }
      if (!post.marker) post.marker = addContactMarker(post, job);
      const wantRoute = guide === job.id;
      if (post.marker.route !== wantRoute) post.marker.route = wantRoute;
    }
    for (const post of posts.values()) {
      if (offers.has(post.place.id)) continue;
      post.job = null;
      removeMarker(post);
    }
  }

  /** Givers appear when the player comes near, idle, greet him, and offer the job when he walks up. */
  function updatePosts(dt) {
    const player = game.player;
    if (!player || !player.character) return;
    const pos = player.pos;
    for (const post of posts.values()) {
      const place = post.place;
      const d = Math.hypot(pos.x - place.x, pos.z - place.z);
      if (post.active && !run) post.active = false;
      const wanted = post.job !== null || post.returned || post.active;
      if (!post.giver && wanted && !post.adopted && d < GIVER_APPEARS && game.story && game.characters) {
        post.giver = game.story.spawnCast(post.castId, place.x, place.z, place.heading + Math.PI);
        if (post.giver) post.giver.ai = { mission: true, owner: 'contact', mode: 'idle' };
      }
      if (post.giver && (post.giver.alive === false || post.giver.despawned)) post.giver = null;
      if (post.giver && !post.adopted && (d > GIVER_LEAVES || (!wanted && d > 60))) {
        despawnPerson(post.giver);
        post.giver = null;
        post.returned = false;
      }
      if (post.giver && !post.adopted) idleGiver(post, d, dt);
      if (!run && post.job && d < 15 && guide === post.job.id) guide = null;
      if (!run && post.job && !retry) offerJob(post, player, d);
    }
  }

  function idleGiver(post, distance, dt) {
    const giver = post.giver;
    const intent = giver.intent;
    const place = post.place;
    intent.moveX = 0;
    intent.moveZ = 0;
    intent.fire = false;
    intent.aim = false;
    const player = game.player;
    if (distance < 12 && player.state !== 'down') {
      intent.faceYaw = Math.atan2(player.pos.x - giver.pos.x, player.pos.z - giver.pos.z);
      post.waveFor = post.greeted ? Math.max(0, (post.waveFor || 0) - dt) : 1.6;
      intent.gesture = post.waveFor > 0 ? 'wave' : distance < 5 ? 'talk' : null;
      if (!post.greeted && post.job) greet(post);
      post.greeted = true;
    } else {
      intent.faceYaw = place.heading + Math.PI;
      intent.gesture = IDLE_GESTURE[post.castId] || null;
      if (distance > 30) post.greeted = false;
    }
  }

  /** A line when the player first comes near a giver with work. */
  function greet(post) {
    const wantedLevel = game.wanted ? game.wanted.level || 0 : 0;
    const lines = wantedLevel > 0 ? WANTED_REBUFF[post.castId] : GREETINGS[post.castId];
    if (lines && game.story) game.story.say([lines[Math.floor(Math.random() * lines.length)]], 'contact');
  }

  function offerJob(post, player, distance) {
    if (player.vehicle || player.state !== 'onFoot' || game.mode !== 'playing') return;
    const giver = post.giver;
    const near = giver ? Math.hypot(player.pos.x - giver.pos.x, player.pos.z - giver.pos.z) : distance;
    if (near > TALK_DISTANCE) return;
    if (game.wanted && game.wanted.level > 0) return;
    const name = speakerName(post.castId);
    game.prompts?.offer?.(30, 'E', `${name}: "${post.job.title}"`);
    if (game.input.pressed('interact')) start(post.job.id);
  }

  /** While a job runs, the other contacts hide; the running job's giver keeps standing. */
  function hidePosts(keep) {
    for (const post of posts.values()) {
      removeMarker(post);
      post.job = null;
      post.active = post === keep;
      if (post !== keep && post.giver && !post.adopted) {
        despawnPerson(post.giver);
        post.giver = null;
        post.returned = false;
      }
    }
  }

  function clearPosts() {
    for (const post of posts.values()) {
      removeMarker(post);
      if (post.giver) despawnPerson(post.giver);
      post.giver = null;
      post.job = null;
      post.adopted = false;
      post.returned = false;
    }
    refreshIn = 0;
  }

  /** The post at a contact place, made on first use. */
  function postAt(placeId, castId) {
    let post = posts.get(placeId);
    if (post) return post;
    const place = placeOf(placeId);
    if (!place) return null;
    post = { place, castId: place.person || castId, job: null, marker: null, giver: null, adopted: false, returned: false, active: false, greeted: false, waveFor: 0 };
    posts.set(placeId, post);
    return post;
  }

  function postOfJob(job) {
    return posts.get(job.contact) || null;
  }

  function addContactMarker(post, job) {
    if (!game.markers) return { route: false };
    const place = post.place;
    const who = game.story && game.story.speaker ? game.story.speaker(post.castId) : { name: post.castId, color: '#e9b44c' };
    const name = who.name || post.castId;
    return game.markers.add({
      kind: 'contact',
      letter: place.letter || name.charAt(0).toUpperCase(),
      pos: { x: place.x, y: game.terrain ? game.terrain.heightAt(place.x, place.z) : 0, z: place.z },
      label: `${name}: ${job.title}`,
      hint: job.hint || `${name} has work: "${job.title}"`,
      color: hexColor(who.color, 0xe9b44c),
      beacon: true,
      radius: 1.4,
      route: guide === job.id,
      edge: true,
      owner: 'contacts',
      jobId: job.id,
    });
  }

  function removeMarker(post) {
    if (post.marker && game.markers) game.markers.remove(post.marker);
    post.marker = null;
  }

  // ---- Cast members moving between the posts and the running job --------------------------------

  /** A job asks for a cast member: hand over the one standing at a post (or left over) if any. */
  function adoptCast(castId) {
    for (const post of posts.values()) {
      if (post.giver && post.castId === castId && !post.adopted) {
        const person = post.giver;
        post.giver = null;
        post.adopted = true;
        post.returned = false;
        return person;
      }
    }
    for (let i = 0; i < leftovers.length; i += 1) {
      const entity = leftovers[i].entity;
      if (entity.tags && entity.tags.castId === castId && entity.alive !== false && !entity.despawned) {
        leftovers.splice(i, 1);
        return entity;
      }
    }
    return null;
  }

  /** A job has ended: a cast member near their own post goes back to standing there. */
  function keepCast(person) {
    const castId = person.tags.castId;
    if (person.alive === false || person.vehicle) return false;
    for (const post of posts.values()) {
      if (post.castId !== castId || (post.giver && post.giver !== person)) continue;
      if (Math.hypot(person.pos.x - post.place.x, person.pos.z - post.place.z) > 25) continue;
      post.giver = person;
      post.adopted = false;
      post.returned = true;
      person.ai = { mission: true, owner: 'contact', mode: 'idle' };
      return true;
    }
    for (const post of posts.values()) if (post.castId === castId) post.adopted = false;
    return false;
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

  function clearLeftovers() {
    for (const item of leftovers.splice(0, leftovers.length)) removeEntity(item.entity);
  }

  function removeEntity(entity) {
    if (entity.spec) {
      const player = game.player;
      if (player && player.vehicle === entity) return;
      for (const occupant of (entity.passengers || []).concat(entity.driver ? [entity.driver] : [])) {
        if (occupant && !(player && occupant === player.character)) game.characters?.exitVehicle?.(occupant, { instant: true });
      }
      game.vehicles?.despawn?.(entity);
    } else {
      despawnPerson(entity);
    }
  }

  function despawnPerson(person) {
    if (!person || person.despawned) return;
    game.weapons?.ai?.disengage?.(person);
    person.despawned = true;
    game.characters?.despawn?.(person);
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

  function speakerName(castId) {
    const who = game.story && game.story.speaker ? game.story.speaker(castId) : null;
    return (who && who.name) || castId;
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

/** Whether the hour falls in [from, to) of a job's hours (which may wrap past midnight). */
function withinHours(hours, hour) {
  if (!hours) return true;
  const from = hours[0];
  const to = hours[1];
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

function hexColor(css, fallback) {
  if (typeof css === 'number') return css;
  const value = typeof css === 'string' ? parseInt(css.replace('#', ''), 16) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

/** What each giver does while waiting at their contact. */
const IDLE_GESTURE = { mina: 'phone', tavi: 'phone', faris: null, dahan: 'lean', sayf: null, vane: null };

/** First words when Zayd walks up to a giver with work. */
const GREETINGS = {
  faris: [['faris', 'Dust! Come, come. The engines missed you.'], ['faris', 'There he is. Coffee is cold, work is hot.']],
  mina: [['mina', 'Dust. Perfect timing. I hate perfect timing.'], ['mina', 'Over here. Try to look like a customer.']],
  tavi: [['tavi', 'Karam. You took your time.'], ['tavi', 'Walk like you belong on a dock.']],
  dahan: [['dahan', 'Not here. Walk with me.']],
};

/** What a giver says when Zayd shows up with the police on him. */
const WANTED_REBUFF = {
  faris: [['faris', 'Not with sirens on you! Lose them, then come back.']],
  mina: [['mina', 'You brought the police to my stall? Lose them first.']],
  tavi: [['tavi', 'Cops on your tail? Get lost. Then get back here.']],
  dahan: [['dahan', 'Lose the patrol first, Karam.']],
};
