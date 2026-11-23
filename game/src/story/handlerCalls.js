// Zayd's phone: Captain Dahan, his handler, and the crew calling him. A call buzzes with its ringtone
// until he answers with T (it answers itself after six seconds), then the lines play as subtitles.
// Between jobs the phone also rings by itself now and then: Dahan checking in when Zayd lingers in
// the city, Mina, Faris or Tavi nudging him toward the next job. Becomes game.phone.

/** Seconds a call rings before it answers itself. */
const AUTO_ANSWER = 6;
/** Seconds between rings of the ringtone. */
const RING_EVERY = 2.6;
/** Seconds of idling between jobs before the phone rings by itself, and the least gap between such calls. */
const QUIET_BEFORE_CALL = 200;
const UNSCRIPTED_COOLDOWN = 480;

/**
 * Create game.phone.
 * @returns {{ring:(castId:string, lines:Array, options?:{owner?:string})=>Promise<boolean>,
 *   schedule:(castId:string, lines:Array, delaySeconds?:number)=>void, cancel:(owner?:string)=>void,
 *   answer:Function, ringing:boolean, inCall:boolean, caller:string|null, update:Function}}
 */
export function createHandlerCalls(game) {
  const queue = [];
  const scheduled = [];
  let call = null;
  let quiet = 0;
  let lastUnscripted = -UNSCRIPTED_COOLDOWN * 0.5;
  let unscriptedCount = 0;
  let answering = false;

  const phone = {
    ring,
    schedule,
    cancel,
    answer,
    update,
    /** True while a call is ringing and not yet answered. */
    get ringing() {
      return Boolean(call && call.state === 'ringing');
    },
    /** True from the first ring to the last line. */
    get inCall() {
      return call !== null;
    },
    /** The cast id of whoever is on the line. */
    get caller() {
      return call ? call.castId : null;
    },
  };

  /**
   * Ring the phone with a call from `castId`; the lines ([speaker, text, seconds?]) play once it is
   * answered. Calls queue behind each other. Resolves true when the call ends, false if cancelled.
   */
  function ring(castId, lines, options = {}) {
    return new Promise((resolve) => {
      queue.push({ castId, lines: lines || [], owner: options.owner || null, resolve, state: 'queued', t: 0, ringIn: 0, line: null, left: 0, index: 0 });
    });
  }

  /** Ring later: `delaySeconds` of play from now, once no cutscene is running. */
  function schedule(castId, lines, delaySeconds = 6) {
    scheduled.push({ castId, lines, left: delaySeconds });
  }

  /** Hang up the calls of one owner (a job that has ended), or every call. */
  function cancel(owner) {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (owner === undefined || queue[i].owner === owner) {
        queue[i].resolve(false);
        queue.splice(i, 1);
      }
    }
    if (call && (owner === undefined || call.owner === owner)) endCall(false);
  }

  /** Pick up the ringing call (the T key, or the phone on screen). */
  function answer() {
    if (!call || call.state !== 'ringing') return;
    call.state = 'talking';
    const card = phoneCard();
    answering = true;
    if (card && card.ringing && typeof card.accept === 'function') {
      card.accept();
    } else {
      game.audio?.play?.('phonePickup');
      game.events.emit('phone:answered', { from: call.name, castId: call.castId });
    }
    answering = false;
    const dialogue = game.story && game.story.dialogue;
    if (dialogue) call.line = dialogue.say(call.lines, call.owner);
    else call.left = 0;
  }

  function update(dt) {
    for (let i = scheduled.length - 1; i >= 0; i -= 1) {
      const pending = scheduled[i];
      if (canRing()) pending.left -= dt;
      if (pending.left > 0) continue;
      scheduled.splice(i, 1);
      ring(pending.castId, pending.lines);
    }
    if (!call && queue.length > 0 && canRing()) startCall(queue.shift());
    if (call) updateCall(dt);
    else checkUnscriptedCall(dt);
  }

  function startCall(next) {
    call = next;
    call.state = 'ringing';
    call.t = 0;
    call.ringIn = 0;
    const who = speaker(call.castId);
    call.name = who.fullName || who.name;
    game.events.emit('phone:incoming', { from: call.name, castId: call.castId, name: who.name, role: who.role, color: who.color });
  }

  function updateCall(dt) {
    if (call.state === 'ringing') {
      call.t += dt;
      // The phone card on screen rings and shows the key itself; without it, ring and prompt here.
      if (!phoneCard()) {
        call.ringIn -= dt;
        if (call.ringIn <= 0) {
          call.ringIn = RING_EVERY;
          game.audio?.play?.('phoneRing');
        }
        game.prompts?.offer?.(35, 'T', `Answer: ${speaker(call.castId).name}`);
      }
      if ((game.input && game.input.pressed('phone')) || call.t >= AUTO_ANSWER) answer();
      return;
    }
    if (call.line) {
      if (call.line.done || call.line.failed) endCall(true);
      return;
    }
    // No line queue in this game: show the lines one by one ourselves.
    call.left -= dt;
    if (call.left > 0) return;
    const entry = call.lines[call.index];
    if (!entry) {
      endCall(true);
      return;
    }
    call.index += 1;
    const who = speaker(entry[0]);
    call.left = entry[2] || 2.2 + 0.045 * String(entry[1] || '').length;
    game.events.emit('subtitle', { speaker: who.name, text: entry[1], seconds: call.left, color: who.color });
  }

  function endCall(finished) {
    const ended = call;
    call = null;
    if (!ended) return;
    const card = phoneCard();
    if (card && card.ringing && typeof card.dismiss === 'function') card.dismiss();
    game.events.emit('phone:ended', { from: ended.name || ended.castId, castId: ended.castId });
    ended.resolve(finished);
  }

  /** The phone card the menus draw (it rings, shows the caller and answers on T), when there is one. */
  function phoneCard() {
    return game.menus && game.menus.phone ? game.menus.phone : null;
  }

  /** Between jobs, after a long quiet spell, someone calls: the next job's giver, or Dahan checking in. */
  function checkUnscriptedCall(dt) {
    const missions = game.missions;
    const wantedLevel = game.wanted ? game.wanted.level || 0 : 0;
    if (game.mode !== 'playing' || (missions && missions.active) || wantedLevel > 0) {
      if (missions && missions.active) quiet = 0;
      return;
    }
    quiet += dt;
    const now = game.time.elapsed;
    if (quiet < QUIET_BEFORE_CALL || now - lastUnscripted < UNSCRIPTED_COOLDOWN) return;
    const lines = pickUnscriptedLines();
    quiet = 0;
    lastUnscripted = now;
    if (!lines) return;
    unscriptedCount += 1;
    ring(lines[0][0], lines);
  }

  function pickUnscriptedLines() {
    const missions = game.missions;
    const story = game.story;
    const offered = missions && typeof missions.available === 'function' ? missions.available() : [];
    const done = missions ? missions.completedCount || 0 : 0;
    const handlerTurn = done > 0 && story && !story.flags.cutLoose && unscriptedCount % 2 === 1;
    if (handlerTurn || offered.length === 0) {
      if (done === 0 || !story || story.flags.cutLoose) return null;
      if (story.badge < 35) return DAHAN_CHECK_INS.lowBadge;
      if (story.crewTrust < 30) return DAHAN_CHECK_INS.lowTrust;
      if (story.crewTrust > 70) return DAHAN_CHECK_INS.tooComfortable;
      return DAHAN_CHECK_INS.steady;
    }
    const giver = offered[0].giver;
    const options = NUDGES[giver];
    if (!options) return null;
    return options[Math.floor(unscriptedCount / 2) % options.length];
  }

  function canRing() {
    return game.mode === 'playing' && !(game.cutscenes && game.cutscenes.playing);
  }

  function speaker(castId) {
    if (game.story && typeof game.story.speaker === 'function') return game.story.speaker(castId);
    return { id: castId, name: castId, role: '', color: '#fff4d6' };
  }

  game.events.on('phone:answered', () => {
    if (!answering) answer();
  });

  return phone;
}

/** What the crew says when they want Zayd at their door. */
const NUDGES = {
  faris: [
    [['faris', 'Dust! The Sirocco is warm and so is my temper. Come by.']],
    [['faris', 'Habibi, the garage misses you. Also, I have work.'], ['zayd', 'On my way, Uncle.']],
  ],
  mina: [
    [['mina', 'My stall, the Grand Souk. Bring your driving face.']],
    [['mina', 'Plans do not wait, Dust. Mine do, but not forever.']],
  ],
  tavi: [
    [['tavi', 'Docks, Karam. Show up or I find a driver who does.']],
    [['tavi', 'Still breathing? Good. I have work that pays.']],
  ],
};

/** Dahan checking in, by how the Cover meter stands. */
const DAHAN_CHECK_INS = {
  steady: [['dahan', 'Checking in. Quiet is good. Stay close to them.'], ['zayd', 'Close as a shadow, Captain.']],
  lowBadge: [['dahan', 'My lieutenant thinks you have turned, Karam.'], ['dahan', 'Prove him wrong. Soon.']],
  lowTrust: [['dahan', 'They are watching you. Give them a reason to stop.']],
  tooComfortable: [['dahan', 'You sound happy, Karam. Remember who you work for.'], ['zayd', 'Every day, Captain.']],
};
