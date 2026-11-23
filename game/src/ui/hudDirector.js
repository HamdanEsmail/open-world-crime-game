// The heads-up display of KHAMSIN: Port Sarab. Builds every HUD piece into its place on the page
// (minimap with GPS, health and armour arcs, wanted stars, cash and REP, clock, job card, Cover
// meter, weapon or speedometer, toasts, subtitles, prompts, reticle) and updates them each frame.
// It shows while the city plays, dims in cutscenes and hides behind the menus.
import { createGpsRoute } from './gpsRoute.js';
import { createMinimap } from './minimap.js';
import { createHealthArmorBars } from './healthArmorBars.js';
import { createWantedStarsDisplay } from './wantedStarsDisplay.js';
import { createMoneyAndRankDisplay } from './moneyAndRankDisplay.js';
import { createClockWeatherDisplay } from './clockWeatherDisplay.js';
import { createMissionObjectivePanel } from './missionObjectivePanel.js';
import { createCoverMeterDisplay } from './coverMeterDisplay.js';
import { createWeaponAmmoDisplay } from './weaponAmmoDisplay.js';
import { createSpeedometerDial } from './speedometerDial.js';
import { createNotificationFeed } from './notificationFeed.js';
import { createInteractPrompt } from './interactPrompt.js';
import { createCrosshairAndDamage } from './crosshairAndDamage.js';
import { applySandGrainTexture, setClass, setShown } from './uiElements.js';

/**
 * Create game.hud.
 * @returns {Object} hud: { update(dt), show(), hide(), setDimmed(on), setPrompt(key, text), setPrompts(list),
 *   clearPrompt(), notify(text, kind), subtitle(speaker, text, seconds), showLocation(district, street),
 *   route, routeDistance, gps, minimap, visible, forceHidden, showPlaceBlips, cost }
 */
export function createHud(game) {
  applySandGrainTexture();
  const root = document.getElementById('hud');
  const part = (id) => document.getElementById(id) || createDetachedPart(root, id);
  const weaponBox = part('hud-weapon-ammo');
  const speedoBox = part('hud-speedometer');

  const gps = createGpsRoute(game);
  const minimap = createMinimap(game, part('hud-minimap'), gps);
  const vitals = createHealthArmorBars(game, part('hud-health-armor'));
  const wanted = createWantedStarsDisplay(game, part('hud-wanted-stars'));
  const money = createMoneyAndRankDisplay(game, part('hud-money-and-rank'));
  const clock = createClockWeatherDisplay(game, part('hud-clock-weather'));
  const jobColumn = part('hud-mission-objective');
  const job = createMissionObjectivePanel(game, jobColumn);
  // The Cover meter rides under the job card, whatever the card's height.
  const coverBox = part('hud-cover-meter');
  jobColumn.appendChild(coverBox);
  const cover = createCoverMeterDisplay(game, coverBox);
  const weapon = createWeaponAmmoDisplay(game, weaponBox);
  const speedometer = createSpeedometerDial(game, speedoBox);
  const feed = createNotificationFeed(game, {
    toasts: part('hud-notifications'),
    subtitles: part('hud-subtitles'),
    location: part('hud-district-street-name'),
    radio: part('hud-radio-station'),
  });
  const prompt = createInteractPrompt(game, part('hud-interact-prompt'));
  const reticle = createCrosshairAndDamage(game, part('hud-crosshair'), part('hud-damage-vignette'));

  const hud = {
    visible: false,
    /** Set true to keep the HUD hidden whatever the mode (a photo mode, say). */
    forceHidden: false,
    /** Show the city's shops and safehouses as minimap blips. */
    showPlaceBlips: true,
    /** Milliseconds the last update took (smoothed). */
    cost: 0,
    gps,
    minimap,
    update,
    show,
    hide,
    setDimmed,
    setPrompt: prompt.setPrompt,
    setPrompts: prompt.setPrompts,
    clearPrompt: prompt.clearPrompt,
    notify: feed.notify,
    subtitle: feed.showSubtitle,
    showLocation: feed.showLocation,
    showVehicle: feed.showVehicle,
    showRadio: feed.showRadio,
    showHit: reticle.showHit,
    /** The GPS route as a list of {x, z} from the player to the target (empty when none). */
    get route() {
      return gps.route;
    },
    /** Metres along the roads to the GPS target. */
    get routeDistance() {
      return gps.distance;
    },
  };
  let dimmed = false;
  let inVehicleShown = null;

  /** Update every piece; each writes to the page only what changed. */
  function update(dt) {
    const started = performance.now();
    const wants = wantsVisible();
    if (wants !== hud.visible) {
      if (wants) show();
      else hide();
    }
    if (!hud.visible) return;
    setClass(root, 'is-dimmed', dimmed || game.mode === 'cutscene');
    const inVehicle = Boolean(game.player && game.player.vehicle);
    if (inVehicle !== inVehicleShown) {
      inVehicleShown = inVehicle;
      setShown(weaponBox, !inVehicle);
      setShown(speedoBox, inVehicle);
    }
    try {
      gps.update();
      minimap.update(dt);
      vitals.update();
      wanted.update();
      money.update(dt);
      clock.update();
      job.update();
      cover.update();
      if (inVehicle) speedometer.update();
      else weapon.update();
      feed.update();
      reticle.update();
    } catch (error) {
      if (!hud.reportedError) {
        hud.reportedError = true;
        console.warn('HUD update failed', error);
      }
    }
    hud.cost += (performance.now() - started - hud.cost) * 0.1;
  }

  /** The HUD belongs on screen while the city is live and no full-screen menu covers it. */
  function wantsVisible() {
    if (hud.forceHidden) return false;
    const mode = game.mode;
    if (mode !== 'playing' && mode !== 'cutscene' && mode !== 'shot' && mode !== 'dead') return false;
    const menus = game.menus;
    return !(menus && menus.coversHud);
  }

  function show() {
    hud.visible = true;
    root.hidden = false;
    minimap.resize();
  }

  function hide() {
    hud.visible = false;
    root.hidden = true;
  }

  /** Fade everything but the subtitles (cutscenes, letterbox). */
  function setDimmed(on) {
    dimmed = Boolean(on);
    setClass(root, 'is-dimmed', dimmed || game.mode === 'cutscene');
  }

  game.events.on('resize', () => minimap.resize());
  return hud;
}

/** A stand-in element when the page lacks one of the HUD's containers (keeps the HUD from failing). */
function createDetachedPart(root, id) {
  const node = document.createElement('div');
  node.id = id;
  if (root) root.appendChild(node);
  return node;
}
