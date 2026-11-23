// The job card, top left: the running job's title in small gold capitals, its current objective
// large and white on a night-blue plate, a checklist of every step, and a countdown or a tally
// when the job has one. Races and fares show here too between story jobs, and with neither
// running it points the way to the next contact who has work.
import { eightPointStarPath, glyphSvg } from './hudIconLibrary.js';
import { createElement, setText, setClass, setShown, replayClass, formatTimer, formatDistance, titleFromId } from './uiElements.js';
import { playerPosition } from './gpsRoute.js';
import { currentObjectiveIndex } from './hudAndMenuGuide.js';

/**
 * Build the job card in `container` (#hud-mission-objective).
 * @returns {{update():void}}
 */
export function createMissionObjectivePanel(game, container) {
  const card = createElement('div', 'job-card', container);
  const head = createElement('div', 'job-head', card);
  head.innerHTML = `<svg class="job-star" viewBox="0 0 20 20" aria-hidden="true"><path d="${eightPointStarPath(10, 10, 9.4)}"/></svg>`;
  const kicker = createElement('span', 'job-kicker', head, 'JOB');
  const title = createElement('span', 'job-title', head);
  const distanceChip = createElement('span', 'job-distance', head);
  distanceChip.innerHTML = glyphSvg('pin', 'job-distance-glyph');
  const distanceText = createElement('span', 'job-distance-text', distanceChip);
  const current = createElement('div', 'job-current', card);
  const currentText = createElement('span', 'job-current-text', current);
  const meter = createElement('div', 'job-meter', card);
  meter.innerHTML = glyphSvg('timer', 'job-meter-glyph');
  const meterLabel = createElement('span', 'job-meter-label', meter);
  const meterValue = createElement('span', 'job-meter-value', meter);
  const steps = createElement('ol', 'job-steps', card);
  const hint = createElement('div', 'job-hint', container);
  hint.innerHTML = `<svg class="job-star" viewBox="0 0 20 20" aria-hidden="true"><path d="${eightPointStarPath(10, 10, 9.4)}"/></svg>`;
  const hintBody = createElement('div', 'job-hint-body', hint);
  const hintKicker = createElement('span', 'job-hint-kicker', hintBody, 'NEXT JOB');
  const hintText = createElement('span', 'job-hint-text', hintBody);
  const hintDistance = createElement('span', 'job-hint-distance', hint);
  setShown(card, false);
  setShown(hint, false);

  const stepNodes = [];
  const shownTexts = [];
  const shownDone = [];
  let shownMission = null;
  let shownCurrent = '';
  let nextHintAt = 0;

  /**
   * Follow the story job (game.missions.active), else the running side activity (a race, a fare:
   * game.activities.active, same shape); between them, refresh the hint twice a second.
   */
  function update() {
    const job = game.missions ? game.missions.active : null;
    const sideJob = !job && game.activities ? game.activities.active : null;
    const active = job || sideJob || null;
    if (active !== shownMission) {
      shownMission = active;
      setShown(card, Boolean(active));
      setClass(card, 'is-side-job', Boolean(sideJob));
      if (active) {
        setText(kicker, active.kicker || (sideJob || active.side ? 'SIDE JOB' : 'JOB'));
        setText(title, (active.title || active.name || titleFromId(active.id)).toUpperCase());
        replayClass(card, 'is-entering', 0.7);
      }
      shownCurrent = '';
    }
    if (active) {
      setShown(hint, false);
      updateObjectives(active);
      updateMeter(active);
      const distance = game.hud && game.hud.route && game.hud.route.length > 1 ? game.hud.routeDistance : 0;
      setShown(distanceChip, distance > 0);
      if (distance > 0) setText(distanceText, formatDistance(distance));
    } else {
      updateHint();
    }
  }

  function updateObjectives(active) {
    const objectives = Array.isArray(active.objectives) ? active.objectives : [];
    while (stepNodes.length < objectives.length) {
      const item = createElement('li', 'job-step', steps);
      item.innerHTML = `<span class="job-step-box">${glyphSvg('check', 'job-step-check')}</span>`;
      const text = createElement('span', 'job-step-text', item);
      const tag = createElement('span', 'job-step-tag', item, 'OPTIONAL');
      stepNodes.push({ item, text, tag });
      shownTexts.push(null);
      shownDone.push(null);
    }
    const currentIndex = currentObjectiveIndex(objectives);
    for (let i = 0; i < stepNodes.length; i += 1) {
      const node = stepNodes[i];
      const objective = objectives[i];
      setShown(node.item, Boolean(objective));
      if (!objective) continue;
      if (shownTexts[i] !== objective.text) {
        shownTexts[i] = objective.text;
        setText(node.text, objective.text);
      }
      const done = Boolean(objective.done);
      if (shownDone[i] !== done) {
        if (done && shownDone[i] === false) replayClass(node.item, 'is-ticked', 0.8);
        shownDone[i] = done;
        setClass(node.item, 'is-done', done);
      }
      setClass(node.item, 'is-current', i === currentIndex);
      setClass(node.item, 'is-optional', Boolean(objective.optional));
    }
    setShown(steps, objectives.length > 1);
    const text = currentIndex >= 0 ? objectives[currentIndex].text : active.summary || '';
    if (text !== shownCurrent) {
      shownCurrent = text;
      setText(currentText, text);
      replayClass(current, 'is-new', 0.6);
    }
  }

  function updateMeter(active) {
    const timer = active.timer;
    const counter = active.counter;
    if (timer && typeof timer.seconds === 'number') {
      setShown(meter, true);
      setText(meterLabel, (timer.label || 'TIME').toUpperCase());
      setText(meterValue, formatTimer(timer.seconds));
      setClass(meter, 'is-urgent', timer.seconds <= 10);
      setClass(meter, 'is-counter', false);
    } else if (counter && typeof counter.value === 'number') {
      setShown(meter, true);
      setText(meterLabel, (counter.label || 'COUNT').toUpperCase());
      setText(meterValue, counter.of ? `${counter.value} / ${counter.of}` : String(counter.value));
      setClass(meter, 'is-urgent', false);
      setClass(meter, 'is-counter', true);
    } else {
      setShown(meter, false);
    }
  }

  /** Between jobs: the missions system's hint, else the nearest job or contact marker. */
  function updateHint() {
    const now = performance.now();
    if (now < nextHintAt) return;
    nextHintAt = now + 500;
    const missions = game.missions;
    const pos = playerPosition(game);
    let text = missions && typeof missions.hint === 'string' ? missions.hint : '';
    let distance = null;
    if (!text && game.markers && pos) {
      let best = null;
      let bestDistance = Infinity;
      for (const marker of game.markers.list) {
        if (marker.kind !== 'mission' && marker.kind !== 'contact') continue;
        const p = game.markers.positionOf(marker);
        if (!p) continue;
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < bestDistance) {
          bestDistance = d;
          best = marker;
        }
      }
      if (best) {
        text = best.hint || best.label || 'A contact has work for you';
        distance = bestDistance;
      }
    }
    setShown(hint, Boolean(text));
    setText(hintText, text);
    setText(hintDistance, distance !== null ? formatDistance(distance) : '');
    setText(hintKicker, missions && missions.hintTitle ? missions.hintTitle : 'NEXT JOB');
  }

  return { update };
}
