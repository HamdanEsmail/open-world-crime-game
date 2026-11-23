// The jobs screen of the pause menu: the running job's briefing and its steps, then the list of
// jobs Zayd has already pulled for the crew (or for the badge) with what each paid.
import { createMenuPanel } from './menuListControls.js';
import { glyphSvg } from './hudIconLibrary.js';
import { createElement, formatMoney, titleFromId } from './uiElements.js';

/**
 * Build the jobs panel in `container`.
 * @returns {{element:Element, handleKey():boolean, refresh():void}}
 */
export function createJobsLogPanel(game, container) {
  const panel = createMenuPanel(container, 'Jobs', 'THE KHAMSIN HEIST');
  panel.element.classList.add('jobs-panel');
  const body = panel.body;

  /** Rebuild from game.missions (active job and log). */
  function refresh() {
    body.textContent = '';
    const missions = game.missions || {};
    const active = missions.active;
    const current = createElement('div', 'jobs-current', body);
    if (active) {
      createElement('div', 'jobs-current-kicker', current, 'RUNNING NOW');
      createElement('div', 'jobs-current-title', current, (active.title || active.name || titleFromId(active.id)).toUpperCase());
      const briefing = active.briefing || active.description || active.summary;
      if (briefing) createElement('p', 'jobs-current-briefing', current, briefing);
      const steps = createElement('ul', 'jobs-current-steps', current);
      for (const objective of active.objectives || []) {
        const item = createElement('li', objective.done ? 'is-done' : '', steps);
        item.innerHTML = `<span class="jobs-step-box">${objective.done ? glyphSvg('check', 'jobs-step-check') : ''}</span>`;
        createElement('span', 'jobs-step-text', item, `${objective.text}${objective.optional ? ' (optional)' : ''}`);
      }
    } else {
      createElement('div', 'jobs-current-kicker', current, 'BETWEEN JOBS');
      createElement('p', 'jobs-current-briefing', current, missions.hint || 'Find a gold star on the map: someone in Port Sarab has work for a driver.');
    }
    const all = typeof missions.log === 'function' ? missions.log() || [] : Array.isArray(missions.log) ? missions.log : [];
    const log = all.filter((entry) => typeof entry !== 'object' || entry.done !== false);
    const total = missions.total || 0;
    createElement('div', 'jobs-log-title', body, total ? `DONE (${log.length} OF ${total})` : `DONE (${log.length})`);
    const list = createElement('ol', 'jobs-log', body);
    if (!log.length) createElement('li', 'jobs-log-empty', list, 'No jobs pulled yet.');
    for (const entry of log) {
      const item = createElement('li', 'jobs-log-item', list);
      const title = typeof entry === 'string' ? titleFromId(entry) : entry.title || entry.name || titleFromId(entry.id);
      createElement('span', 'jobs-log-name', item, title);
      const reward = typeof entry === 'object' ? entry.reward ?? entry.money : null;
      if (typeof reward === 'number' && reward > 0) createElement('span', 'jobs-log-reward', item, formatMoney(reward));
    }
  }

  refresh();
  return { element: panel.element, handleKey: () => false, refresh };
}
