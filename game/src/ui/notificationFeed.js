// The HUD's messages: toasts down the right side ('notify'), film-style subtitles with the speaker
// in gold ('subtitle'), the district and street name sliding in bottom right as Zayd crosses into
// a new part of Port Sarab, the model name of the car he just took, and the radio station banner.
import { createElement, setText, setShown, replayClass } from './uiElements.js';
import { glyphSvg } from './hudIconLibrary.js';
import { playerPosition } from './gpsRoute.js';

/**
 * Wire the message areas of the HUD and listen for their events.
 * @param {{toasts:Element, subtitles:Element, location:Element, radio:Element}} containers
 */
export function createNotificationFeed(game, containers) {
  const toastList = createElement('div', 'toast-list', containers.toasts);
  const subtitle = createElement('div', 'subtitle', containers.subtitles);
  const subtitleSpeaker = createElement('b', 'subtitle-speaker', subtitle);
  const subtitleText = createElement('span', 'subtitle-text', subtitle);
  const vehicleCard = createElement('div', 'vehicle-card', containers.location);
  const vehicleName = createElement('div', 'vehicle-card-name', vehicleCard);
  const vehicleClass = createElement('div', 'vehicle-card-class', vehicleCard);
  const locationCard = createElement('div', 'location-card', containers.location);
  const districtName = createElement('div', 'location-district', locationCard);
  const streetName = createElement('div', 'location-street', locationCard);
  const radio = createElement('div', 'radio-card', containers.radio);
  radio.innerHTML = glyphSvg('radio', 'radio-glyph');
  const radioName = createElement('span', 'radio-name', radio);
  const radioTagline = createElement('span', 'radio-tagline', radio);
  for (const node of [subtitle, vehicleCard, locationCard, radio]) setShown(node, false);

  const toasts = [];
  const hideAt = { subtitle: 0, vehicle: 0, location: 0, radio: 0 };
  let nextLocationCheck = 0;
  let shownDistrict = null;

  /** A toast on the right: kind 'info' | 'good' | 'bad' | 'cash' | 'wanted'. */
  function notify(text, kind = 'info', seconds = 4.5) {
    if (!text) return;
    const node = createElement('div', `toast toast--${kind}`, null);
    createElement('i', 'toast-edge', node);
    createElement('span', 'toast-text', node, text);
    toastList.prepend(node);
    toasts.unshift({ node, hideAt: performance.now() + seconds * 1000 });
    while (toasts.length > 4) toasts.pop().node.remove();
  }

  /** A line of dialogue at the bottom centre; `color` tints the speaker's name (each of the cast has one). */
  function showSubtitle(speaker, text, seconds, color) {
    if (!text) {
      hideAt.subtitle = 0;
      return;
    }
    subtitleSpeaker.style.color = typeof color === 'string' ? color : '';
    setText(subtitleSpeaker, speaker ? String(speaker).toUpperCase() : '');
    setShown(subtitleSpeaker, Boolean(speaker));
    setText(subtitleText, text);
    setShown(subtitle, true);
    replayClass(subtitle, 'is-new', 0.35);
    const words = String(text).split(/\s+/).length;
    hideAt.subtitle = performance.now() + 1000 * (seconds || Math.min(8, Math.max(2.6, 1.6 + words * 0.32)));
  }

  /** District and street, bottom right. */
  function showLocation(district, street, seconds = 6) {
    setText(districtName, (district || '').toUpperCase());
    setText(streetName, street || '');
    setShown(streetName, Boolean(street));
    setShown(locationCard, true);
    replayClass(locationCard, 'is-new', 0.6);
    hideAt.location = performance.now() + seconds * 1000;
  }

  /** The car's model and class, bottom right, when Zayd gets in. */
  function showVehicle(vehicle, seconds = 4) {
    const spec = (vehicle && vehicle.spec) || {};
    setText(vehicleName, (spec.name || 'Vehicle').toUpperCase());
    setText(vehicleClass, (spec.className || '').toUpperCase());
    setShown(vehicleCard, true);
    replayClass(vehicleCard, 'is-new', 0.6);
    hideAt.vehicle = performance.now() + seconds * 1000;
  }

  /** The station banner, top centre. */
  function showRadio(station, seconds = 3.6) {
    setText(radioName, station ? (station.name || 'Radio').toUpperCase() : 'RADIO OFF');
    setText(radioTagline, station ? station.tagline || '' : '');
    setShown(radio, true);
    replayClass(radio, 'is-new', 0.5);
    hideAt.radio = performance.now() + seconds * 1000;
  }

  /** Age toasts and timed cards; check the district twice a second. */
  function update() {
    const now = performance.now();
    for (let i = toasts.length - 1; i >= 0; i -= 1) {
      const toast = toasts[i];
      if (now > toast.hideAt && !toast.leaving) {
        toast.leaving = true;
        toast.node.classList.add('is-leaving');
        toast.removeAt = now + 400;
      }
      if (toast.leaving && now > toast.removeAt) {
        toast.node.remove();
        toasts.splice(i, 1);
      }
    }
    if (hideAt.subtitle && now > hideAt.subtitle) { hideAt.subtitle = 0; setShown(subtitle, false); }
    if (hideAt.vehicle && now > hideAt.vehicle) { hideAt.vehicle = 0; setShown(vehicleCard, false); }
    if (hideAt.location && now > hideAt.location) { hideAt.location = 0; setShown(locationCard, false); }
    if (hideAt.radio && now > hideAt.radio) { hideAt.radio = 0; setShown(radio, false); }
    if (now >= nextLocationCheck) {
      nextLocationCheck = now + 500;
      checkDistrict();
    }
  }

  function checkDistrict() {
    const city = game.city;
    const pos = playerPosition(game);
    if (!city || !pos || !city.districtAt) return;
    const district = city.districtAt(pos.x, pos.z);
    if (!district || district === shownDistrict) return;
    shownDistrict = district;
    showLocation(district.name, city.streetNameAt ? city.streetNameAt(pos.x, pos.z) : '');
  }

  game.events.on('notify', (payload) => notify(payload && payload.text, payload && payload.kind, payload && payload.seconds));
  game.events.on('subtitle', (payload) => payload && showSubtitle(payload.speaker, payload.text, payload.seconds, payload.color));
  game.events.on('radio:changed', (payload) => showRadio(payload && payload.station));
  game.events.on('player:enteredVehicle', (payload) => {
    if (payload && payload.vehicle) showVehicle(payload.vehicle);
  });

  return { update, notify, showSubtitle, showLocation, showVehicle, showRadio };
}
