// Keyboard and mouse input for KHAMSIN. Systems never read DOM events: they ask
// game.input.held('sprint'), game.input.pressed('enterVehicle') or game.input.moveX.

/** Every action the game knows, with the keys (KeyboardEvent.code) or mouse buttons bound to it. */
export const KEY_BINDINGS = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  handbrake: ['Space'],
  enterVehicle: ['KeyF', 'Enter'],
  interact: ['KeyE'],
  fire: ['Mouse0', 'ControlLeft'],
  aim: ['Mouse2'],
  reload: ['KeyR'],
  nextWeapon: ['KeyX'],
  previousWeapon: ['KeyZ'],
  weaponWheel: ['Tab'],
  horn: ['KeyH'],
  headlights: ['KeyL'],
  nextRadio: ['KeyQ'],
  lookBehind: ['KeyB'],
  changeCamera: ['KeyC', 'KeyV'],
  phone: ['KeyT'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  quickSave: ['F5'],
  crouch: ['KeyG'],
};

/** What the help screens print for each action. */
export const ACTION_LABELS = {
  moveForward: 'Walk / accelerate',
  moveBack: 'Back / brake and reverse',
  moveLeft: 'Left / steer left',
  moveRight: 'Right / steer right',
  sprint: 'Sprint',
  jump: 'Jump',
  handbrake: 'Handbrake (in a vehicle)',
  enterVehicle: 'Enter, steal or leave a vehicle',
  interact: 'Talk, buy, accept, pick up',
  fire: 'Punch or shoot',
  aim: 'Aim',
  reload: 'Reload',
  nextWeapon: 'Next weapon (or mouse wheel)',
  previousWeapon: 'Previous weapon',
  weaponWheel: 'Weapon wheel (hold)',
  horn: 'Horn / siren',
  headlights: 'Headlights',
  nextRadio: 'Next radio station',
  lookBehind: 'Look behind',
  changeCamera: 'Change camera',
  phone: 'Answer or open the phone',
  map: 'City map',
  pause: 'Pause',
  quickSave: 'Quick save',
  crouch: 'Crouch',
};

/**
 * Listen on `target` (the window) and the canvas, and return the input state.
 * Call `endFrame()` once per frame after every system has read it.
 */
export function createInputControls(canvas, target = window) {
  const down = new Set();
  const pressedThisFrame = new Set();
  const releasedThisFrame = new Set();
  /** Key codes that went down since the last frame, however briefly they were held. */
  const codesPressedThisFrame = new Set();
  const codeToActions = new Map();
  for (const action of Object.keys(KEY_BINDINGS)) {
    for (const code of KEY_BINDINGS[action]) {
      if (!codeToActions.has(code)) codeToActions.set(code, []);
      codeToActions.get(code).push(action);
    }
  }

  const input = {
    /** -1 (left) .. 1 (right) and -1 (back) .. 1 (forward), from the movement keys. */
    moveX: 0,
    moveZ: 0,
    /** Mouse movement since the last frame, in pixels (only while the pointer is locked or dragged). */
    lookX: 0,
    lookY: 0,
    /** Wheel notches since the last frame: positive scrolls down. */
    wheel: 0,
    /** Pointer position over the canvas, in CSS pixels. */
    pointerX: 0,
    pointerY: 0,
    pointerLocked: false,
    /** When false the game ignores play input (a menu is open). */
    enabled: true,
    /** True while any key bound to the action is down. */
    held(action) {
      if (!input.enabled) return false;
      const codes = KEY_BINDINGS[action];
      if (!codes) return false;
      for (let i = 0; i < codes.length; i += 1) if (down.has(codes[i])) return true;
      return false;
    },
    /** True only on the frame the action went down. */
    pressed(action) {
      return input.enabled && pressedThisFrame.has(action);
    },
    released(action) {
      return input.enabled && releasedThisFrame.has(action);
    },
    /** Raw key state by KeyboardEvent.code, for menus (works while `enabled` is false). */
    keyDown: (code) => down.has(code),
    /** True on the frame after a key went down, even if it was tapped and let go between two frames. */
    keyPressed: (code) => codesPressedThisFrame.has(code),
    rawPressed: (action) => pressedThisFrame.has(action),
    /** Ask the browser to capture the mouse for camera look; safe to call from a click. */
    lockPointer() {
      if (canvas.requestPointerLock && document.pointerLockElement !== canvas) {
        try {
          const result = canvas.requestPointerLock();
          if (result && result.catch) result.catch(() => {});
        } catch (error) {
          /* the browser refused (no user gesture yet): the game still plays with keys */
        }
      }
    },
    unlockPointer() {
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    },
    /** Forget every key (used when the window loses focus or a menu opens). */
    releaseAll() {
      down.clear();
      input.moveX = 0;
      input.moveZ = 0;
    },
    /** Clear the per-frame edges; the game loop calls this last. */
    endFrame() {
      pressedThisFrame.clear();
      releasedThisFrame.clear();
      codesPressedThisFrame.clear();
      input.lookX = 0;
      input.lookY = 0;
      input.wheel = 0;
    },
  };

  function refreshAxes() {
    const right = down.has('KeyD') || down.has('ArrowRight') ? 1 : 0;
    const left = down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0;
    const forward = down.has('KeyW') || down.has('ArrowUp') ? 1 : 0;
    const back = down.has('KeyS') || down.has('ArrowDown') ? 1 : 0;
    input.moveX = right - left;
    input.moveZ = forward - back;
  }

  function press(code) {
    if (down.has(code)) return;
    down.add(code);
    codesPressedThisFrame.add(code);
    const actions = codeToActions.get(code);
    if (actions) for (let i = 0; i < actions.length; i += 1) pressedThisFrame.add(actions[i]);
    refreshAxes();
  }

  function release(code) {
    if (!down.delete(code)) return;
    const actions = codeToActions.get(code);
    if (actions) for (let i = 0; i < actions.length; i += 1) releasedThisFrame.add(actions[i]);
    refreshAxes();
  }

  const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F5']);
  target.addEventListener('keydown', (event) => {
    if (PREVENT.has(event.code)) event.preventDefault();
    if (!event.repeat) press(event.code);
  });
  target.addEventListener('keyup', (event) => release(event.code));
  target.addEventListener('blur', () => input.releaseAll());
  canvas.addEventListener('mousedown', (event) => press(`Mouse${event.button}`));
  target.addEventListener('mouseup', (event) => release(`Mouse${event.button}`));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  target.addEventListener('mousemove', (event) => {
    input.pointerX = event.clientX;
    input.pointerY = event.clientY;
    if (input.pointerLocked || down.has('Mouse2') || down.has('Mouse1')) {
      input.lookX += event.movementX || 0;
      input.lookY += event.movementY || 0;
    }
  });
  canvas.addEventListener('wheel', (event) => {
    input.wheel += Math.sign(event.deltaY);
    event.preventDefault();
  }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });

  return input;
}
