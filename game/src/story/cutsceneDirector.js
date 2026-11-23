// The cutscene director: takes the camera from the player for a few slow, letterboxed shots of Port
// Sarab, glides each shot from its start to its end, dips through black between shots, shows each
// shot's line as a subtitle, holds the police off and keeps the player safe, and hands the camera
// back exactly behind the player. Enter or Space skips. Also the fades to and from black. game.cutscenes.

/** Seconds of the dip to black at the end of a shot, and of the rise from it at the next. */
const DIP_OUT = 0.22;
const DIP_IN = 0.3;
/** A cutscene cannot be skipped in its first moments (a key still held from play would skip it). */
const SKIP_GUARD = 0.35;
/** Seconds the game's own view dips to black before the first shot. */
const LEAD_IN = 0.25;

/**
 * Create game.cutscenes.
 * @returns {{play:(shots:Object[], options?:{owner?:string})=>Promise<boolean>, playing:boolean, owner:string|null,
 *   skip:Function, stop:Function, fadeOut:(seconds?:number)=>Promise, fadeIn:(seconds?:number)=>Promise,
 *   fadeLevel:number, update:Function}}
 */
export function createCutsceneDirector(game) {
  const overlay = createOverlay('cutscene-fade', 'position:fixed;inset:0;background:#06080c;opacity:0;pointer-events:none;z-index:60');
  let bars = null;
  const camera = { position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, fov: game.config.render.fieldOfView };
  const fader = { level: 0, target: 0, rate: 1, waiting: [] };
  let scene = null;
  let rise = 0;

  const director = {
    playing: false,
    owner: null,
    get fadeLevel() {
      return fader.level;
    },
    play,
    skip,
    stop,
    fadeOut: (seconds = 0.6) => fadeTo(1, seconds),
    fadeIn: (seconds = 0.6) => fadeTo(0, seconds),
    update,
  };

  /**
   * Play a list of shots: [{position, lookAt (point or entity), moveTo?, seconds, fov?, fovTo?, speaker?,
   * text?, cut?: 'dip' | 'hard'}]. Resolves true when it ran to the end, false when skipped or stopped.
   */
  function play(shots, options = {}) {
    const list = (shots || []).filter((shot) => shot && shot.position && shot.lookAt);
    if (list.length === 0) return Promise.resolve(false);
    if (scene) finish(false, false);
    return new Promise((resolve) => {
      scene = {
        shots: list,
        index: 0,
        t: 0,
        elapsed: 0,
        resolve,
        owner: options.owner || null,
        previousMode: game.mode === 'cutscene' ? 'playing' : game.mode,
        held: { Enter: keyDown('Enter'), Space: keyDown('Space'), NumpadEnter: keyDown('NumpadEnter') },
        health: 0,
        armor: 0,
        invulnerable: false,
        lead: LEAD_IN,
      };
      begin(scene);
      // Out of a black screen (the script faded out first): open on the first shot and fade in.
      if (fader.target === 1) {
        scene.lead = 0;
        fadeTo(0, 0.6);
        game.cameraRig?.setCinematic?.(camera);
        startShot(0);
      }
    });
  }

  function begin(current) {
    director.playing = true;
    director.owner = current.owner;
    game.mode = 'cutscene';
    letterbox(true);
    let total = 0;
    for (const shot of current.shots) total += shot.seconds || 3;
    game.police?.suspend?.(total + 4);
    const player = game.player;
    const character = player && player.character;
    if (character) {
      current.health = character.health;
      current.armor = character.armor;
      current.invulnerable = !!character.tags.invulnerable;
      character.tags.invulnerable = true;
      game.traffic?.clearArea?.(character.pos.x, character.pos.z, 25);
    }
  }

  function startShot(index) {
    scene.index = index;
    scene.t = 0;
    const shot = scene.shots[index];
    if (shot.cut !== 'hard') rise = DIP_IN;
    placeCamera(shot, 0);
    if (shot.text) {
      const who = game.story && game.story.speaker ? game.story.speaker(shot.speaker) : { name: shot.speaker || '', color: '#fff4d6', id: null };
      game.events.emit('subtitle', { speaker: who.name, text: shot.text, seconds: Math.max(1.5, (shot.seconds || 3) - 0.2), color: who.color, id: who.id });
    }
  }

  /** Move the camera along the current shot, watch for a skip, keep the player safe. */
  function update(dt) {
    if (scene) runScene(dt);
    updateFade(dt);
  }

  function runScene(dt) {
    const current = scene;
    current.elapsed += dt;
    protectPlayer(current);
    // The lead-in: the game's own camera dips to black before the first shot opens.
    if (current.lead > 0) {
      current.lead -= dt;
      if (current.lead <= 0) {
        game.cameraRig?.setCinematic?.(camera);
        startShot(0);
      }
      return;
    }
    current.t += dt;
    const shot = current.shots[current.index];
    const duration = Math.max(0.5, shot.seconds || 3);
    placeCamera(shot, Math.min(1, current.t / duration));
    if (current.elapsed > SKIP_GUARD && skipPressed(current)) {
      skip();
      return;
    }
    if (current.t >= duration) {
      if (current.index < current.shots.length - 1) startShot(current.index + 1);
      else finish(true, false);
    }
  }

  function placeCamera(shot, progress) {
    const k = progress * progress * (3 - 2 * progress);
    const from = shot.position;
    const to = shot.moveTo || from;
    camera.position.x = from.x + (to.x - from.x) * k;
    camera.position.y = from.y + (to.y - from.y) * k;
    camera.position.z = from.z + (to.z - from.z) * k;
    const look = shot.lookAt;
    if (look.pos) {
      camera.lookAt.x = look.pos.x;
      camera.lookAt.y = look.pos.y + (look.spec ? 0.9 : 1.45);
      camera.lookAt.z = look.pos.z;
    } else {
      camera.lookAt.x = look.x;
      camera.lookAt.y = look.y === undefined ? 1.5 : look.y;
      camera.lookAt.z = look.z;
    }
    const baseFov = shot.fov || game.config.render.fieldOfView;
    camera.fov = shot.fovTo ? baseFov + (shot.fovTo - baseFov) * k : baseFov;
  }

  /** The player is frozen and safe: health held, the car braked (unless a job is driving it). */
  function protectPlayer(current) {
    const player = game.player;
    const character = player && player.character;
    if (!character) return;
    if (character.alive !== false && character.health < current.health) character.health = current.health;
    if (character.armor < current.armor) character.armor = current.armor;
    const vehicle = player.vehicle;
    if (vehicle && !(vehicle.ai && vehicle.ai.mission)) {
      const c = vehicle.controls;
      c.throttle = 0;
      c.steer = 0;
      c.brake = Math.abs(vehicle.speed) > 0.4 ? 1 : 0;
      c.handbrake = Math.abs(vehicle.speed) < 2;
    }
  }

  /** End the cutscene early (Enter or Space). */
  function skip() {
    if (!scene) return;
    game.events.emit('subtitle', { speaker: '', text: ' ', seconds: 0.01 });
    finish(false, true);
  }

  /** End the cutscene now without a fade (the job it belonged to has ended). */
  function stop() {
    if (scene) finish(false, false);
  }

  /** Hand the camera and the controls back, behind the player, exactly where play left off. */
  function finish(completed, skipped) {
    const current = scene;
    scene = null;
    director.playing = false;
    director.owner = null;
    game.cameraRig?.setCinematic?.(null);
    const player = game.player;
    const character = player && player.character;
    if (character) {
      if (character.alive !== false && character.health < current.health) character.health = current.health;
      character.tags.invulnerable = current.invulnerable;
      game.cameraRig?.setYaw?.(player.heading);
    }
    game.cameraRig?.snap?.();
    if (game.mode === 'cutscene') game.mode = current.previousMode || 'playing';
    letterbox(false);
    rise = completed || skipped ? DIP_IN * 1.4 : 0;
    current.resolve(completed);
  }

  function skipPressed(current) {
    let pressed = false;
    for (const code of SKIP_KEYS) {
      const down = keyDown(code);
      if (down && !current.held[code]) pressed = true;
      current.held[code] = down;
    }
    return pressed;
  }

  function keyDown(code) {
    return Boolean(game.input && game.input.keyDown && game.input.keyDown(code));
  }

  /** Fade the screen to black (1) or back (0) over `seconds`; resolves when it gets there. */
  function fadeTo(level, seconds) {
    for (const resolve of fader.waiting) resolve();
    fader.waiting.length = 0;
    fader.target = level;
    fader.rate = 1 / Math.max(0.01, seconds);
    if (seconds <= 0) {
      fader.level = level;
      paintFade();
      return Promise.resolve();
    }
    return new Promise((resolve) => fader.waiting.push(resolve));
  }

  function updateFade(dt) {
    if (fader.level !== fader.target) {
      const step = fader.rate * dt;
      fader.level = fader.level < fader.target ? Math.min(fader.target, fader.level + step) : Math.max(fader.target, fader.level - step);
      if (fader.level === fader.target) {
        for (const resolve of fader.waiting) resolve();
        fader.waiting.length = 0;
      }
    }
    if (rise > 0) rise = Math.max(0, rise - dt);
    paintFade();
  }

  /** The overlay shows the manual fade, the dip between shots, or the rise out of black after a cut. */
  function paintFade() {
    let dip = rise > 0 ? rise / DIP_IN : 0;
    if (scene && scene.lead > 0) {
      dip = Math.max(dip, 1 - scene.lead / LEAD_IN);
    } else if (scene) {
      const shot = scene.shots[scene.index];
      const next = scene.shots[scene.index + 1];
      const left = Math.max(0.5, shot.seconds || 3) - scene.t;
      if ((!next || next.cut !== 'hard') && left < DIP_OUT) dip = Math.max(dip, 1 - left / DIP_OUT);
    }
    const opacity = Math.min(1, Math.max(fader.level, dip));
    if (overlay && overlay.lastOpacity !== opacity) {
      overlay.lastOpacity = opacity;
      overlay.style.opacity = opacity.toFixed(3);
    }
  }

  function letterbox(on) {
    const menus = game.menus;
    if (menus && typeof menus.letterbox === 'function') {
      menus.letterbox(on);
      return;
    }
    if (!bars) {
      bars = [
        createOverlay('cutscene-bar-top', 'position:fixed;left:0;right:0;top:0;height:11vh;background:#06080c;transform:translateY(-100%);transition:transform 0.5s ease;pointer-events:none;z-index:19'),
        createOverlay('cutscene-bar-bottom', 'position:fixed;left:0;right:0;bottom:0;height:11vh;background:#06080c;transform:translateY(100%);transition:transform 0.5s ease;pointer-events:none;z-index:19'),
      ];
    }
    for (const bar of bars) if (bar) bar.style.transform = on ? 'translateY(0)' : bar.id.endsWith('top') ? 'translateY(-100%)' : 'translateY(100%)';
  }

  return director;
}

const SKIP_KEYS = ['Enter', 'Space', 'NumpadEnter'];

/** A full-window element of our own on the page (none in a page without a document). */
function createOverlay(id, css) {
  if (typeof document === 'undefined') return null;
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    node.setAttribute('aria-hidden', 'true');
    document.body.appendChild(node);
  }
  node.style.cssText = css;
  return node;
}
