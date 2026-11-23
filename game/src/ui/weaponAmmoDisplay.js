// The weapon block, bottom right while Zayd is on foot: a silhouette of what is in his hands,
// its name, and the rounds in the clip against the reserve; bare fists when unarmed, and a
// coral reload cue when the clip runs dry.
import { weaponIconSvg, weaponClassOf } from './hudIconLibrary.js';
import { createElement, createKeyCap, setText, setClass, setShown, replayClass, titleFromId } from './uiElements.js';

/**
 * Build the block in `container` (#hud-weapon-ammo).
 * @returns {{update():void}}
 */
export function createWeaponAmmoDisplay(game, container) {
  const plate = createElement('div', 'weapon-plate', container);
  const icon = createElement('div', 'weapon-icon', plate);
  const text = createElement('div', 'weapon-text', plate);
  const name = createElement('div', 'weapon-name', text, 'FISTS');
  const ammo = createElement('div', 'weapon-ammo', text);
  const clip = createElement('b', 'weapon-clip', ammo, '0');
  const reserve = createElement('span', 'weapon-reserve', ammo, '/ 0');
  const reload = createElement('div', 'weapon-reload', container);
  createKeyCap((game.keyBindings && game.keyBindings.reload && game.keyBindings.reload[0]) || 'KeyR', reload);
  createElement('span', 'weapon-reload-text', reload, 'RELOAD');
  let shownId = undefined;
  let shownClip = -1;

  /** Follow the player's weapons and weaponIndex. */
  function update() {
    const character = game.player && game.player.character;
    if (!character) return;
    const weapons = character.weapons || [];
    const index = typeof character.weaponIndex === 'number' ? character.weaponIndex : -1;
    const slot = index >= 0 ? weapons[index] : null;
    const id = slot ? slot.id : null;
    if (id !== shownId) {
      const spec = id && game.catalog && game.catalog.weaponById ? game.catalog.weaponById(id) : null;
      const weaponClass = id ? weaponClassOf(spec, id) : 'fists';
      icon.innerHTML = weaponIconSvg(weaponClass);
      setText(name, (spec && spec.name ? spec.name : id ? titleFromId(id) : 'Fists').toUpperCase());
      const usesAmmo = Boolean(slot) && weaponClass !== 'fists' && weaponClass !== 'melee';
      setShown(ammo, usesAmmo);
      container.dataset.weaponClass = weaponClass;
      if (shownId !== undefined) replayClass(plate, 'is-switching', 0.45);
      shownId = id;
      shownClip = -1;
    }
    if (slot) {
      const inClip = Math.max(0, Math.round(slot.clip || 0));
      if (inClip !== shownClip) {
        if (shownClip > inClip) replayClass(clip, 'is-firing', 0.12);
        shownClip = inClip;
        setText(clip, inClip);
      }
      setText(reserve, `/ ${Math.max(0, Math.round(slot.ammo || 0))}`);
      const empty = inClip === 0 && container.dataset.weaponClass !== 'melee';
      setClass(ammo, 'is-empty', empty);
      setShown(reload, empty && (slot.ammo || 0) > 0);
    } else {
      setShown(reload, false);
    }
  }

  return { update };
}
