// The Cover meter under the job card: Zayd's double life as two opposed bars. CREW (coral) grows
// left with the heist crew's trust, BADGE (police blue) grows right with Captain Dahan's faith,
// and a gold star marks where the balance sits. It flashes whichever side just moved.
import { eightPointStarPath } from './hudIconLibrary.js';
import { createElement, setText, setStyle, setShown, replayClass } from './uiElements.js';

/**
 * Build the meter in `container` (#hud-cover-meter).
 * @returns {{update():void}}
 */
export function createCoverMeterDisplay(game, container) {
  const labels = createElement('div', 'cover-labels', container);
  const crewLabel = createElement('span', 'cover-side cover-side--crew', labels);
  createElement('b', 'cover-side-name', crewLabel, 'CREW');
  const crewValue = createElement('span', 'cover-side-value', crewLabel, '50');
  createElement('span', 'cover-title', labels, 'COVER');
  const badgeLabel = createElement('span', 'cover-side cover-side--badge', labels);
  const badgeValue = createElement('span', 'cover-side-value', badgeLabel, '50');
  createElement('b', 'cover-side-name', badgeLabel, 'BADGE');
  const track = createElement('div', 'cover-track', container);
  const crewFill = createElement('i', 'cover-fill cover-fill--crew', track);
  const badgeFill = createElement('i', 'cover-fill cover-fill--badge', track);
  createElement('i', 'cover-midline', track);
  const marker = createElement('span', 'cover-marker', track);
  marker.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${eightPointStarPath(10, 10, 9.2)}"/></svg>`;
  let shownCrew = -1;
  let shownBadge = -1;

  /** Follow game.story.crewTrust and game.story.badge (0..100). */
  function update() {
    const story = game.story;
    setShown(container, Boolean(story) && story.coverVisible !== false);
    if (!story) return;
    const crew = Math.round(clamp100(story.crewTrust));
    const badge = Math.round(clamp100(story.badge));
    if (crew !== shownCrew) {
      if (shownCrew >= 0) replayClass(crewLabel, 'is-flashing', 0.9);
      shownCrew = crew;
      setText(crewValue, crew);
      setStyle(crewFill, 'width', `${crew / 2}%`);
    }
    if (badge !== shownBadge) {
      if (shownBadge >= 0) replayClass(badgeLabel, 'is-flashing', 0.9);
      shownBadge = badge;
      setText(badgeValue, badge);
      setStyle(badgeFill, 'width', `${badge / 2}%`);
    }
    setStyle(marker, 'left', `${50 + (badge - crew) / 2}%`);
  }

  return { update };
}

function clamp100(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 50;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
