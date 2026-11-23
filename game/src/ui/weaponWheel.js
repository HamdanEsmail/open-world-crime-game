// The weapon wheel: hold Tab and the city slows to a quarter speed while eight wedges fan out
// around the screen's centre, one per kind of weapon Zayd carries (pistol, SMG, shotgun, rifle,
// marksman, thrown and heavy, fists, blades). Point with the mouse, release Tab to equip.
import { weaponIconSvg, weaponClassOf } from './hudIconLibrary.js';
import { createElement, setText, titleFromId } from './uiElements.js';

/**
 * Build the wheel in `root` (#weapon-wheel).
 * @returns {{open():void, close(apply:boolean):void, update():void, isOpen:boolean, selected:number}}
 */
export function createWeaponWheel(game, root) {
  root.textContent = '';
  root.classList.add('weapon-wheel');
  createElement('div', 'wheel-veil', root);
  const holder = createElement('div', 'wheel-holder', root);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 400 400');
  svg.setAttribute('class', 'wheel-svg');
  holder.appendChild(svg);
  const centre = createElement('div', 'wheel-centre', holder);
  const centreKicker = createElement('div', 'wheel-centre-kicker', centre, 'SLOW MOTION');
  const centreName = createElement('div', 'wheel-centre-name', centre);
  const centreAmmo = createElement('div', 'wheel-centre-ammo', centre);
  createElement('div', 'wheel-centre-hint', centre, 'Release Tab to equip');
  const wedges = [];
  const wheel = { open, close, update, isOpen: false, selected: 0 };
  let slots = [];
  let aimX = 0;
  let aimY = 0;
  let savedScale = 1;

  for (let i = 0; i < SLOT_CLASSES.length; i += 1) {
    const a0 = (i - 0.5) * (360 / SLOT_CLASSES.length) + 1.4;
    const a1 = (i + 0.5) * (360 / SLOT_CLASSES.length) - 1.4;
    const group = document.createElementNS(svgNS, 'g');
    group.setAttribute('class', 'wheel-wedge');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', wedgePath(a0, a1, 96, 192));
    path.setAttribute('class', 'wheel-wedge-shape');
    group.appendChild(path);
    const mid = (i * 360) / SLOT_CLASSES.length;
    const [ix, iy] = polar(mid, 143);
    const icon = document.createElementNS(svgNS, 'g');
    icon.setAttribute('class', 'wheel-wedge-icon');
    icon.setAttribute('transform', `translate(${(ix - 34).toFixed(1)} ${(iy - 26).toFixed(1)})`);
    group.appendChild(icon);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', ix.toFixed(1));
    label.setAttribute('y', (iy + 26).toFixed(1));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'wheel-wedge-label');
    group.appendChild(label);
    svg.appendChild(group);
    group.addEventListener('mouseenter', () => select(i));
    wedges.push({ group, icon, label });
  }

  /** Fill the wedges from the player's weapons and slow the city. */
  function open() {
    const character = game.player && game.player.character;
    if (!character || wheel.isOpen) return;
    slots = SLOT_CLASSES.map((slotClass) => ({ slotClass, index: slotClass === 'fists' ? -1 : null, id: null, spec: null }));
    (character.weapons || []).forEach((weapon, index) => {
      const spec = game.catalog && game.catalog.weaponById ? game.catalog.weaponById(weapon.id) : null;
      let weaponClass = weaponClassOf(spec, weapon.id);
      if (weaponClass === 'launcher') weaponClass = 'thrown';
      const slot = slots.find((s) => s.slotClass === weaponClass) || slots.find((s) => s.slotClass === 'pistol');
      if (slot.index === null) Object.assign(slot, { index, id: weapon.id, spec, weapon });
    });
    slots.forEach((slot, i) => {
      const empty = slot.index === null;
      const iconClass = slot.slotClass === 'fists' ? 'fists' : empty ? slot.slotClass : weaponClassOf(slot.spec, slot.id);
      wedges[i].icon.innerHTML = weaponIconSvg(iconClass).replace('<svg', '<svg width="68" height="34"');
      wedges[i].label.textContent = empty ? '' : slotName(slot).toUpperCase();
      wedges[i].group.classList.toggle('is-empty', empty);
    });
    const current = typeof character.weaponIndex === 'number' ? character.weaponIndex : -1;
    const start = slots.findIndex((slot) => slot.index === current);
    select(start >= 0 ? start : 6, true);
    aimX = 0;
    aimY = 0;
    savedScale = game.time.scale;
    game.time.scale = 0.25;
    game.input.enabled = false;
    wheel.isOpen = true;
    root.hidden = false;
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
    game.audio?.play?.('menuMove');
  }

  /** Close; with `apply`, equip the chosen weapon. */
  function close(apply) {
    if (!wheel.isOpen) return;
    wheel.isOpen = false;
    root.hidden = true;
    game.time.scale = savedScale || 1;
    game.input.enabled = !(game.menus && game.menus.isOpen);
    const slot = slots[wheel.selected];
    const character = game.player && game.player.character;
    if (apply && slot && slot.index !== null && character) {
      if (character.weaponIndex !== slot.index) {
        character.weaponIndex = slot.index;
        game.events.emit('weapon:selected', { character, index: slot.index, id: slot.id });
      }
      game.audio?.play?.('menuSelect');
    }
  }

  /** Close when Tab is let go. */
  function update() {
    if (wheel.isOpen && !game.input.keyDown('Tab')) close(true);
  }

  function select(i, silent = false) {
    const next = ((i % wedges.length) + wedges.length) % wedges.length;
    if (next !== wheel.selected && !silent) game.audio?.play?.('menuMove');
    wedges[wheel.selected].group.classList.remove('is-selected');
    wheel.selected = next;
    wedges[next].group.classList.add('is-selected');
    const slot = slots[next];
    if (!slot) return;
    const empty = slot.index === null;
    setText(centreName, empty ? 'EMPTY' : slotName(slot).toUpperCase());
    const usesAmmo = slot.weapon && slot.slotClass !== 'melee';
    setText(centreAmmo, usesAmmo ? `${slot.weapon.clip || 0} / ${slot.weapon.ammo || 0}` : slot.slotClass === 'fists' ? 'Bare knuckles' : empty ? 'Nothing carried' : 'Close quarters');
    setText(centreKicker, SLOT_TITLES[slot.slotClass]);
  }

  window.addEventListener('mousemove', (event) => {
    if (!wheel.isOpen) return;
    if (document.pointerLockElement) {
      aimX += event.movementX || 0;
      aimY += event.movementY || 0;
      const length = Math.hypot(aimX, aimY);
      if (length > 120) {
        aimX = (aimX / length) * 120;
        aimY = (aimY / length) * 120;
      }
    } else {
      aimX = event.clientX - window.innerWidth / 2;
      aimY = event.clientY - window.innerHeight / 2;
    }
    if (Math.hypot(aimX, aimY) < 28) return;
    const angle = (Math.atan2(aimX, -aimY) * 180) / Math.PI;
    const step = 360 / wedges.length;
    select(Math.round((((angle % 360) + 360) % 360) / step) % wedges.length);
  });
  window.addEventListener('keydown', (event) => {
    if (!wheel.isOpen) return;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') select(wheel.selected + 1);
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') select(wheel.selected - 1);
  });

  root.hidden = true;
  return wheel;
}

function slotName(slot) {
  if (slot.slotClass === 'fists') return 'Fists';
  if (slot.spec && slot.spec.name) return slot.spec.name;
  return slot.id ? titleFromId(slot.id) : '';
}

function polar(degrees, radius) {
  const a = (degrees * Math.PI) / 180;
  return [200 + Math.sin(a) * radius, 200 - Math.cos(a) * radius];
}

function wedgePath(a0, a1, r0, r1) {
  const [x0, y0] = polar(a0, r1);
  const [x1, y1] = polar(a1, r1);
  const [x2, y2] = polar(a1, r0);
  const [x3, y3] = polar(a0, r0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r1} ${r1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}

/** The eight wedges, clockwise from the top. */
const SLOT_CLASSES = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'thrown', 'fists', 'melee'];
const SLOT_TITLES = {
  pistol: 'SIDEARM', smg: 'SUBMACHINE GUN', shotgun: 'SHOTGUN', rifle: 'RIFLE', sniper: 'MARKSMAN',
  thrown: 'THROWN AND HEAVY', fists: 'UNARMED', melee: 'BLADES AND CLUBS',
};
