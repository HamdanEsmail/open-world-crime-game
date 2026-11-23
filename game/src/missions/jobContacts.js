// The contacts around Port Sarab where jobs are picked up: a lettered blip and a beacon on each one
// with work, the giver standing there (on the phone, leaning, waving as Zayd walks up, a line of
// greeting), and the prompt `E  Faris: "Shakedown Run"` that starts the job. Cast members pass from
// these posts into a running job and back again, so nobody is ever standing in two places.

/** Metres at which a giver appears at their contact, and beyond which they leave again. */
const GIVER_APPEARS = 120;
const GIVER_LEAVES = 160;
/** Metres from the giver at which the job is offered (on foot). */
const TALK_DISTANCE = 3;

/**
 * Create the contacts of the job board.
 * @param {Object} game
 * @param {{isBusy:()=>boolean, isRetrying:()=>boolean, start:(jobId:string)=>boolean, guide:()=>string|null,
 *   clearGuide:()=>void}} board  what the mission runner tells the contacts
 */
export function createJobContacts(game, board) {
  /** One post per contact place: where a giver stands and a blip marks the job on offer. */
  const posts = new Map();

  /**
   * Show these offers: placeId -> job. Blips are added, changed or removed to match; the guided
   * job's blip carries the GPS route.
   */
  function refresh(offers) {
    const guide = board.guide();
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
  function update(dt) {
    const player = game.player;
    if (!player || !player.character) return;
    const pos = player.pos;
    const busy = board.isBusy();
    for (const post of posts.values()) {
      const place = post.place;
      const d = Math.hypot(pos.x - place.x, pos.z - place.z);
      if (post.active && !busy) post.active = false;
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
      if (post.giver && !post.adopted) {
        // A job directing the giver (m.walkTo(m.giver, ...)) has the say until it lets go of them.
        if (!post.giver.ai) post.giver.ai = { mission: true, owner: 'contact', mode: 'idle' };
        if (post.giver.ai.owner === 'contact') idleGiver(post, d, dt);
      }
      if (!busy && post.job && d < 15 && board.guide() === post.job.id) board.clearGuide();
      if (!busy && post.job && !board.isRetrying()) offerJob(post, player, d);
    }
  }

  function idleGiver(post, distance, dt) {
    const giver = post.giver;
    const intent = giver.intent;
    intent.moveX = 0;
    intent.moveZ = 0;
    intent.fire = false;
    intent.aim = false;
    const player = game.player;
    if (distance < 12 && player.state !== 'down') {
      intent.faceYaw = Math.atan2(player.pos.x - giver.pos.x, player.pos.z - giver.pos.z);
      post.waveFor = post.greeted ? Math.max(0, post.waveFor - dt) : 1.6;
      intent.gesture = post.waveFor > 0 ? 'wave' : distance < 5 ? 'talk' : null;
      if (!post.greeted && post.job) greet(post);
      post.greeted = true;
    } else {
      intent.faceYaw = post.place.heading + Math.PI;
      intent.gesture = IDLE_GESTURE[post.castId] || null;
      if (distance > 30) post.greeted = false;
    }
  }

  /** A line when the player first comes near a giver with work (a rebuff if he brings the police). */
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
    game.prompts?.offer?.(30, 'E', `${speakerName(post.castId)}: "${post.job.title}"`);
    if (game.input.pressed('interact')) board.start(post.job.id);
  }

  /** A job has started: the other contacts hide; the running job's giver keeps standing. Returns its post. */
  function hideAllBut(job) {
    const keep = posts.get(job.contact) || null;
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
    return keep;
  }

  /** Clear every post (loading a save, a new game); givers come back as the player moves about. */
  function clear() {
    for (const post of posts.values()) {
      removeMarker(post);
      if (post.giver) despawnPerson(post.giver);
      post.giver = null;
      post.job = null;
      post.adopted = false;
      post.returned = false;
      post.active = false;
    }
  }

  /** A job asks for a cast member: hand over the one standing at a post, if any. */
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

  /** The giver standing at a job's contact now (null when nobody is, or a job has taken them). */
  function giverOf(job) {
    const post = posts.get(job.contact);
    return post && !post.adopted ? post.giver : null;
  }

  function postAt(placeId, castId) {
    let post = posts.get(placeId);
    if (post) return post;
    const place = game.city && game.city.place ? game.city.place(placeId) : null;
    if (!place) return null;
    post = { place, castId: place.person || castId, job: null, marker: null, giver: null, adopted: false, returned: false, active: false, greeted: false, waveFor: 0 };
    posts.set(placeId, post);
    return post;
  }

  function addContactMarker(post, job) {
    if (!game.markers) return { route: false };
    const place = post.place;
    const who = game.story && game.story.speaker ? game.story.speaker(post.castId) : { name: post.castId, color: '#e9b44c' };
    const name = who.name || post.castId;
    // The ring lies just in front of the giver, where Zayd stands to talk.
    const out = place.heading + Math.PI;
    const x = place.x + Math.sin(out) * 2;
    const z = place.z + Math.cos(out) * 2;
    return game.markers.add({
      kind: 'contact',
      letter: place.letter || name.charAt(0).toUpperCase(),
      pos: { x, y: game.terrain ? game.terrain.heightAt(x, z) : 0, z },
      label: `${name}: ${job.title}`,
      hint: job.hint || `${name} has work: "${job.title}"`,
      color: hexColor(who.color, 0xe9b44c),
      beacon: true,
      radius: 1.4,
      route: board.guide() === job.id,
      edge: true,
      owner: 'contacts',
      jobId: job.id,
    });
  }

  function removeMarker(post) {
    if (post.marker && game.markers) game.markers.remove(post.marker);
    post.marker = null;
  }

  function despawnPerson(person) {
    if (!person || person.despawned) return;
    person.despawned = true;
    game.characters?.despawn?.(person);
  }

  function speakerName(castId) {
    const who = game.story && game.story.speaker ? game.story.speaker(castId) : null;
    return (who && who.name) || castId;
  }

  return { refresh, update, hideAllBut, clear, adoptCast, keepCast, giverOf };
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
