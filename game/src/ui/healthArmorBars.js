// Zayd's health and body armour as two thick arcs hugging the minimap's gold ring: health on the
// right in fresh green, armour on the left in police blue. They fill from the bottom, flash white
// when he is hit, and the health arc turns coral and throbs when he is close to lights out.
import { glyphSvg } from './hudIconLibrary.js';
import { setClass, replayClass } from './uiElements.js';

/**
 * Fill `container` (#hud-health-armor, laid over the minimap) with the two arcs.
 * @returns {{update():void}}
 */
export function createHealthArmorBars(game, container) {
  const healthArc = arcPath(HEALTH_FROM, HEALTH_TO, 0);
  const armorArc = arcPath(ARMOR_FROM, ARMOR_TO, 1);
  container.innerHTML = `
    <svg class="vitals-svg" viewBox="0 0 100 100" aria-hidden="true">
      <path class="vitals-casing" d="${healthArc}"/>
      <path class="vitals-casing" d="${armorArc}"/>
      <path class="vitals-track" d="${healthArc}"/>
      <path class="vitals-track" d="${armorArc}"/>
      <path class="vitals-fill vitals-fill--health" d="${healthArc}" stroke-dasharray="0 200"/>
      <path class="vitals-fill vitals-fill--armor" d="${armorArc}" stroke-dasharray="0 200"/>
    </svg>
    <span class="vitals-icon vitals-icon--health">${glyphSvg('health', 'vitals-glyph')}</span>
    <span class="vitals-icon vitals-icon--armor">${glyphSvg('armor', 'vitals-glyph')}</span>`;
  const healthFill = container.querySelector('.vitals-fill--health');
  const armorFill = container.querySelector('.vitals-fill--armor');
  let shownHealth = -1;
  let shownArmor = -1;

  /** Read the player's character and redraw only what changed. */
  function update() {
    const character = game.player && game.player.character;
    if (!character) return;
    const maxHealth = character.maxHealth || game.config?.player?.maxHealth || 100;
    const maxArmor = game.config?.player?.maxArmor || 100;
    const health = clamp01((character.health || 0) / maxHealth);
    const armor = clamp01((character.armor || 0) / maxArmor);
    const healthStep = Math.round(health * 200) / 200;
    const armorStep = Math.round(armor * 200) / 200;
    if (healthStep !== shownHealth) {
      if (shownHealth >= 0 && healthStep < shownHealth) replayClass(container, 'is-hurt', 0.45);
      if (shownHealth >= 0 && healthStep > shownHealth + 0.02) replayClass(container, 'is-healed', 0.8);
      shownHealth = healthStep;
      healthFill.style.strokeDasharray = `${(ARC_LENGTH * healthStep).toFixed(2)} 200`;
      setClass(container, 'is-critical', healthStep > 0 && healthStep < 0.3);
    }
    if (armorStep !== shownArmor) {
      if (shownArmor >= 0 && armorStep < shownArmor) replayClass(container, 'is-armor-hit', 0.45);
      shownArmor = armorStep;
      armorFill.style.strokeDasharray = `${(ARC_LENGTH * armorStep).toFixed(2)} 200`;
      setClass(container, 'has-no-armor', armorStep <= 0);
    }
  }

  return { update };
}

/** An SVG arc around the minimap between two compass angles (degrees clockwise from the top). */
function arcPath(fromDegrees, toDegrees, sweep) {
  const [x0, y0] = polar(fromDegrees);
  const [x1, y1] = polar(toDegrees);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${RADIUS} ${RADIUS} 0 0 ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function polar(degrees) {
  const a = (degrees * Math.PI) / 180;
  return [50 + RADIUS * Math.sin(a), 50 - RADIUS * Math.cos(a)];
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value || 0;
}

const RADIUS = 47.2;
const HEALTH_FROM = 154;
const HEALTH_TO = 26;
const ARMOR_FROM = 206;
const ARMOR_TO = 334;
const ARC_LENGTH = (RADIUS * (HEALTH_FROM - HEALTH_TO) * Math.PI) / 180;
