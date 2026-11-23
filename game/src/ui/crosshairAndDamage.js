// The aiming reticle and the hurt cues: a fine four-tick crosshair while Zayd aims, a coral hit
// marker when his shot lands, and a red glow at the screen's edge on the side a hit came from.
// Other systems may tint the vignette element too; this file only adds its own children.
import { createElement, setShown, setClass, replayClass } from './uiElements.js';
import { playerPosition } from './gpsRoute.js';

/**
 * Build the crosshair in `crosshairContainer` (#hud-crosshair) and the damage glows inside
 * `vignetteContainer` (#hud-damage-vignette), and listen for hits.
 * @returns {{update():void}}
 */
export function createCrosshairAndDamage(game, crosshairContainer, vignetteContainer) {
  const reticle = createElement('div', 'reticle', crosshairContainer);
  reticle.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="reticle-ticks" d="M20 4v9M20 27v9M4 20h9M27 20h9"/><circle class="reticle-dot" cx="20" cy="20" r="1.8"/></svg>';
  const hitMarker = createElement('div', 'hit-marker', crosshairContainer);
  hitMarker.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 11l6 6M29 11l-6 6M11 29l6-6M29 29l-6-6"/></svg>';
  const glows = [];
  for (let i = 0; i < 4; i += 1) glows.push(createElement('div', 'damage-glow', vignetteContainer));
  const lowHealth = createElement('div', 'damage-low-health', vignetteContainer);
  let nextGlow = 0;

  /** Show the reticle while aiming; throb the edges when health is low. */
  function update() {
    const character = game.player && game.player.character;
    const aiming = Boolean(character) && !game.player.vehicle && (character.state === 'aim' || (character.intent && character.intent.aim));
    setShown(reticle, aiming);
    setClass(crosshairContainer, 'is-aiming', aiming);
    const maxHealth = (character && character.maxHealth) || 100;
    const fraction = character ? (character.health || 0) / maxHealth : 1;
    setClass(lowHealth, 'is-on', Boolean(character) && character.alive !== false && fraction > 0 && fraction < 0.25);
  }

  /** A red glow from the edge facing the source of the hit (screen-relative to the camera). */
  function showHit(sourcePos, amount) {
    const glow = glows[nextGlow];
    nextGlow = (nextGlow + 1) % glows.length;
    let angle = 0;
    let directional = false;
    const pos = playerPosition(game);
    if (sourcePos && pos) {
      const yaw = game.cameraRig && typeof game.cameraRig.yaw === 'number' ? game.cameraRig.yaw : (game.player.character?.heading || 0);
      const dx = sourcePos.x - pos.x;
      const dz = sourcePos.z - pos.z;
      const screenX = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const screenUp = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      if (Math.abs(screenX) + Math.abs(screenUp) > 0.5) {
        angle = (Math.atan2(screenX, screenUp) * 180) / Math.PI;
        directional = true;
      }
    }
    glow.style.setProperty('--hit-angle', `${angle.toFixed(1)}deg`);
    glow.style.setProperty('--hit-strength', String(Math.min(1, 0.45 + (amount || 10) / 40)));
    setClass(glow, 'is-all-round', !directional);
    replayClass(glow, 'is-hit', 0.9);
  }

  game.events.on('character:damaged', (payload) => {
    const character = game.player && game.player.character;
    if (!payload || !character || payload.character !== character) return;
    const source = payload.source;
    const sourcePos = source && source.pos ? source.pos : payload.x !== undefined ? { x: payload.x, z: payload.z } : null;
    showHit(sourcePos, payload.amount);
  });
  game.events.on('shot:fired', (payload) => {
    const character = game.player && game.player.character;
    if (!payload || !character || payload.shooter !== character || !payload.hit) return;
    replayClass(hitMarker, 'is-hit', 0.25);
  });

  return { update, showHit };
}
