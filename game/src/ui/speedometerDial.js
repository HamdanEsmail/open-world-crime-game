// The speedometer, bottom right while Zayd drives: an arc dial in km/h that sweeps from gulf teal
// through sand gold to coral at the redline, a big digital readout, the gear, a body-damage bar
// for the car and its invented model name. It replaces the weapon block at the wheel.
import { createElement, setText, setClass, setStyle } from './uiElements.js';

/**
 * Build the dial in `container` (#hud-speedometer).
 * @returns {{update():void}}
 */
export function createSpeedometerDial(game, container) {
  const arc = dialArc(-135, 135);
  container.innerHTML = `
    <svg class="speedo-svg" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="speedo-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#1ba39c"/><stop offset="0.55" stop-color="#e9b44c"/><stop offset="1" stop-color="#e4572e"/>
        </linearGradient>
        <radialGradient id="speedo-face" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stop-color="rgba(22,40,60,0.92)"/><stop offset="1" stop-color="rgba(10,19,30,0.88)"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="97" fill="url(#speedo-face)" class="speedo-face"/>
      <path class="speedo-track" d="${arc}"/>
      <path class="speedo-redline" d="${dialArc(105, 135)}"/>
      <g class="speedo-ticks"></g>
      <path class="speedo-fill" d="${arc}" stroke="url(#speedo-sweep)" stroke-dasharray="0 999"/>
      <g class="speedo-needle"><path d="M100 22 L104.5 36 L95.5 36 Z"/></g>
      <text class="speedo-value" x="100" y="110" text-anchor="middle">0</text>
      <text class="speedo-unit" x="100" y="132" text-anchor="middle">KM/H</text>
      <rect class="speedo-gear-box" x="85" y="150" width="30" height="28" rx="4"/>
      <text class="speedo-gear" x="100" y="171" text-anchor="middle">N</text>
    </svg>
    <div class="speedo-body"><span class="speedo-body-label">BODY</span><span class="speedo-body-bar"><i></i></span></div>
    <div class="speedo-name"></div>
    <div class="speedo-class"></div>`;
  const ticks = container.querySelector('.speedo-ticks');
  const fill = container.querySelector('.speedo-fill');
  const needle = container.querySelector('.speedo-needle');
  const value = container.querySelector('.speedo-value');
  const gear = container.querySelector('.speedo-gear');
  const bodyFill = container.querySelector('.speedo-body-bar i');
  const name = container.querySelector('.speedo-name');
  const vehicleClass = container.querySelector('.speedo-class');
  let shownVehicle = null;
  let maxKmh = 240;
  let shownKmh = -1;
  let shownDash = -1;

  /** Follow the player's vehicle: speed, gear, health and model. */
  function update() {
    const vehicle = game.player && game.player.vehicle;
    if (!vehicle) return;
    if (vehicle !== shownVehicle) {
      shownVehicle = vehicle;
      const spec = vehicle.spec || {};
      maxKmh = Math.max(120, Math.ceil(((spec.topSpeed || 60) * 3.6 * 1.08) / 40) * 40);
      buildTicks(ticks, maxKmh);
      setText(name, (spec.name || 'Vehicle').toUpperCase());
      setText(vehicleClass, (spec.className || '').toUpperCase());
      shownKmh = -1;
    }
    const kmh = Math.round(Math.abs(vehicle.speed || 0) * 3.6);
    if (kmh !== shownKmh) {
      shownKmh = kmh;
      value.textContent = String(kmh);
      const fraction = Math.min(1, kmh / maxKmh);
      const dash = Math.round(fraction * ARC_LENGTH * 2) / 2;
      if (dash !== shownDash) {
        shownDash = dash;
        fill.setAttribute('stroke-dasharray', `${dash} 999`);
        needle.setAttribute('transform', `rotate(${(-135 + fraction * 270).toFixed(1)} 100 100)`);
      }
      setClass(container, 'is-redline', fraction > 0.86);
    }
    let gearText = 'N';
    if ((vehicle.speed || 0) < -0.4 || (vehicle.controls && vehicle.controls.reverse && Math.abs(vehicle.speed || 0) < 0.4)) gearText = 'R';
    else if (vehicle.gear > 0) gearText = String(vehicle.gear);
    if (gear.textContent !== gearText) gear.textContent = gearText;
    const maxHealth = (vehicle.spec && vehicle.spec.health) || 1000;
    const health = Math.max(0, Math.min(1, (vehicle.health === undefined ? maxHealth : vehicle.health) / maxHealth));
    setStyle(bodyFill, 'width', `${Math.round(health * 100)}%`);
    setClass(container, 'is-wrecking', health < 0.35);
  }

  return { update };
}

/** Tick marks every 20 km/h with numbers every 40, around the dial. */
function buildTicks(group, maxKmh) {
  let markup = '';
  for (let kmh = 0; kmh <= maxKmh; kmh += 20) {
    const angle = -135 + (kmh / maxKmh) * 270;
    const major = kmh % 40 === 0;
    const a = (angle * Math.PI) / 180;
    const r0 = major ? 62 : 66;
    const r1 = 72;
    markup += `<line class="${major ? 'speedo-tick speedo-tick--major' : 'speedo-tick'}" x1="${(100 + Math.sin(a) * r0).toFixed(1)}" y1="${(100 - Math.cos(a) * r0).toFixed(1)}" x2="${(100 + Math.sin(a) * r1).toFixed(1)}" y2="${(100 - Math.cos(a) * r1).toFixed(1)}"/>`;
    if (major && maxKmh <= 320) {
      const rt = 52;
      markup += `<text class="speedo-tick-label" x="${(100 + Math.sin(a) * rt).toFixed(1)}" y="${(104 - Math.cos(a) * rt).toFixed(1)}" text-anchor="middle">${kmh}</text>`;
    }
  }
  group.innerHTML = markup;
}

/** An arc of the dial between two angles (degrees clockwise from the top). */
function dialArc(fromDegrees, toDegrees) {
  const a0 = (fromDegrees * Math.PI) / 180;
  const a1 = (toDegrees * Math.PI) / 180;
  const large = toDegrees - fromDegrees > 180 ? 1 : 0;
  return `M${(100 + Math.sin(a0) * RADIUS).toFixed(2)} ${(100 - Math.cos(a0) * RADIUS).toFixed(2)}A${RADIUS} ${RADIUS} 0 ${large} 1 ${(100 + Math.sin(a1) * RADIUS).toFixed(2)} ${(100 - Math.cos(a1) * RADIUS).toFixed(2)}`;
}

const RADIUS = 82;
const ARC_LENGTH = (RADIUS * 270 * Math.PI) / 180;
