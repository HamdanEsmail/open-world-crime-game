// The menus of KHAMSIN: Port Sarab. Opens and closes every screen (title, pause, city map, shops)
// as a stack, pauses the city and hands the keyboard to the menu while one is open, frees and
// recaptures the mouse, and runs the overlays that sit over play: weapon wheel, end-of-job banner,
// arrest and knock-out screen, cutscene bars, the phone, and the loading screen.
import { createMainMenuScreen } from './mainMenuScreen.js';
import { createPauseMenuScreen } from './pauseMenuScreen.js';
import { createCityMapScreen } from './cityMapScreen.js';
import { createShopMenuScreen } from './shopMenuScreen.js';
import { createWeaponWheel } from './weaponWheel.js';
import { createMissionResultBanner } from './missionResultBanner.js';
import { createArrestedKnockedOutScreen } from './arrestedKnockedOutScreen.js';
import { createCutsceneLetterbox } from './cutsceneLetterbox.js';
import { createPhoneCallScreen } from './phoneCallScreen.js';
import { loadSettings } from './settingsScreen.js';
import { applySandGrainTexture } from './uiElements.js';

/**
 * Create game.menus.
 * @returns {Object} menus: { isOpen, current, coversHud, showMainMenu(), hideMainMenu(), openPause(), openMap(),
 *   openShop(config), closeShop(), close(name), closeAll(), letterbox(on), phone, wheel, banner, knockout,
 *   setLoading(fraction, text), showLoading(text), hideLoading(), update(dt) }
 */
export function createMenus(game) {
  applySandGrainTexture();
  loadSettings(game);
  const part = (id) => document.getElementById(id) || createDetachedPart(id);
  const director = {
    close: (name) => close(name),
    openMap: () => openMap(),
    finishMainMenu,
    finishLoad,
    quitToTitle,
  };
  const screens = {
    main: createMainMenuScreen(game, part('main-menu'), director),
    pause: createPauseMenuScreen(game, part('pause-menu'), director),
    map: createCityMapScreen(game, part('city-map-screen'), director),
    shop: createShopMenuScreen(game, part('shop-menu'), director),
  };
  for (const screen of Object.values(screens)) part(screenElementId(screen.name)).hidden = true;
  const wheel = createWeaponWheel(game, part('weapon-wheel'));
  const banner = createMissionResultBanner(game, part('mission-result-banner'));
  const knockout = createArrestedKnockedOutScreen(game, part('busted-wasted-screen'));
  const bars = createCutsceneLetterbox(game, part('cutscene-letterbox'));
  const phone = createPhoneCallScreen(game, part('phone-handler-calls'));

  const stack = [];
  const menus = {
    isOpen: false,
    current: null,
    coversHud: false,
    showMainMenu,
    hideMainMenu: () => close('main'),
    openPause,
    openMap,
    openShop,
    closeShop: () => close('shop'),
    close,
    closeAll,
    letterbox: (on) => bars.set(on),
    phone,
    wheel,
    banner,
    knockout,
    screens,
    setLoading,
    showLoading,
    hideLoading,
    update,
  };
  let pausedBefore = false;
  let expectingUnlock = false;
  let pointerWasLocked = false;
  let ignoreEscapeUntil = 0;

  /** The title screen over the live city. */
  function showMainMenu() {
    closeAll(true);
    game.mode = 'menu';
    open('main');
  }

  function openPause() {
    if (stack.length) return;
    if (game.mode !== 'playing' && game.mode !== 'cutscene') return;
    open('pause');
  }

  function openMap() {
    if (stack.length && stack[stack.length - 1].name === 'map') return;
    if (!stack.length && game.mode !== 'playing') return;
    open('map');
  }

  /** A shop: { title, subtitle, items: [{id, name, price, description, owned, disabled}], onBuy(item), onClose() }. */
  function openShop(config) {
    if (stack.some((screen) => screen.name === 'shop')) close('shop');
    open('shop', config);
  }

  function open(name, options) {
    const screen = screens[name];
    if (!screen) return;
    if (wheel.isOpen) wheel.close(false);
    if (!stack.length) pausedBefore = game.time.paused;
    stack.push(screen);
    screen.open(options);
    if (name !== 'main') game.audio?.play?.('menuOpen');
    applyModalState();
  }

  /** Close the named screen (or the top one) and whatever was opened above it. */
  function close(name) {
    if (!stack.length) return;
    let index = name ? stack.findIndex((screen) => screen.name === name) : stack.length - 1;
    if (index < 0) return;
    while (stack.length > index) stack.pop().close();
    applyModalState();
  }

  /** Close every screen; `quiet` keeps the mouse free (going back to the title). */
  function closeAll(quiet = false) {
    while (stack.length) stack.pop().close();
    applyModalState(quiet);
  }

  function finishMainMenu(eventName, payload) {
    close('main');
    if (game.mode === 'menu') game.mode = 'playing';
    game.events.emit(eventName, payload);
    capturePointer();
  }

  function finishLoad(slot) {
    closeAll();
    game.events.emit('menu:load', { slot });
  }

  function quitToTitle() {
    closeAll(true);
    game.events.emit('menu:quit', {});
    showMainMenu();
  }

  /** Pause, release the mouse and silence play input while anything modal is open; undo it after. */
  function applyModalState(quiet = false) {
    const top = stack[stack.length - 1] || null;
    menus.isOpen = stack.length > 0;
    menus.current = top ? top.name : null;
    menus.coversHud = stack.some((screen) => screen.coversHud);
    if (menus.isOpen) {
      game.time.paused = stack.some((screen) => screen.pauses) || pausedBefore;
      game.input.enabled = false;
      game.input.releaseAll();
      releasePointer();
      if (game.hud && menus.coversHud) game.hud.hide();
    } else {
      game.time.paused = pausedBefore;
      game.input.enabled = true;
      game.input.releaseAll();
      if (!quiet) capturePointer();
    }
  }

  function releasePointer() {
    if (document.pointerLockElement) expectingUnlock = true;
    game.input.unlockPointer();
  }

  function capturePointer() {
    if (game.mode === 'playing' && !menus.isOpen) game.input.lockPointer();
  }

  /** Keys go to the top screen while one is open; otherwise Escape/P pauses and M opens the map. */
  function onKeyDown(event) {
    const code = event.code;
    const top = stack[stack.length - 1];
    if (top) {
      if (code === 'Escape' && performance.now() < ignoreEscapeUntil) {
        event.preventDefault();
        return;
      }
      if (code === 'Tab' || code === 'F5') event.preventDefault();
      if (top.handleKey(code, event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.repeat || wheel.isOpen) return;
    const bindings = game.keyBindings || {};
    if ((bindings.pause || ['Escape', 'KeyP']).includes(code) && (game.mode === 'playing' || game.mode === 'cutscene')) {
      event.preventDefault();
      event.stopPropagation();
      openPause();
    } else if ((bindings.map || ['KeyM']).includes(code) && game.mode === 'playing') {
      event.preventDefault();
      event.stopPropagation();
      openMap();
    }
  }

  /** Losing the mouse during play (Escape in the browser, another window) pauses the game. */
  function onPointerLockChange() {
    const locked = Boolean(document.pointerLockElement);
    if (!locked && pointerWasLocked && !expectingUnlock && !stack.length && !wheel.isOpen && game.mode === 'playing') {
      ignoreEscapeUntil = performance.now() + 300;
      openPause();
    }
    if (!locked) expectingUnlock = false;
    pointerWasLocked = locked;
  }

  /** Per frame while the city runs: the weapon wheel on Tab, the phone key, overlay timers. */
  function update(dt) {
    if (!stack.length && game.mode === 'playing' && !wheel.isOpen && game.input.keyDown('Tab') && game.player && game.player.character) {
      wheel.open();
    }
    wheel.update(dt);
    phone.update(dt);
  }

  /** The loading screen in the page: progress 0..1 and a line of text. */
  function setLoading(fraction, text) {
    const screen = document.getElementById('loading-screen');
    if (!screen) return;
    screen.hidden = false;
    screen.classList.remove('is-leaving');
    const bar = screen.querySelector('#loading-bar i');
    if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction || 0)) * 100)}%`;
    const step = document.getElementById('loading-step');
    if (step && text) step.textContent = text;
  }

  function showLoading(text) {
    setLoading(0, text);
  }

  function hideLoading() {
    const screen = document.getElementById('loading-screen');
    if (!screen || screen.hidden) return;
    screen.classList.add('is-leaving');
    setTimeout(() => {
      screen.hidden = true;
      screen.classList.remove('is-leaving');
    }, 650);
  }

  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  return menus;
}

function screenElementId(name) {
  return { main: 'main-menu', pause: 'pause-menu', map: 'city-map-screen', shop: 'shop-menu' }[name];
}

function createDetachedPart(id) {
  const node = document.createElement('div');
  node.id = id;
  node.hidden = true;
  document.body.appendChild(node);
  return node;
}
