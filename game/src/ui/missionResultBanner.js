// The end-of-job banner: a night-blue band sweeps across the screen with a flash of light and
// the verdict in huge spaced capitals: JOB DONE in sand gold with the job's name, the pay and the
// REP earned, or JOB BLOWN in coral with what went wrong. Finished races and fares raise the same
// gold banner with their own words. It stays about five seconds.
import { goldRuleMarkup } from './menuListControls.js';
import { createElement, setText, setShown, formatMoneyDelta, titleFromId } from './uiElements.js';

/**
 * Build the banner in `root` (#mission-result-banner) and listen for the end of jobs.
 * @returns {{show(result:Object):void, hide():void}}
 */
export function createMissionResultBanner(game, root) {
  root.textContent = '';
  root.classList.add('result');
  const band = createElement('div', 'result-band', root);
  createElement('div', 'result-sweep', band);
  const headline = createElement('div', 'result-headline', band);
  band.insertAdjacentHTML('beforeend', goldRuleMarkup('result-rule'));
  const title = createElement('div', 'result-title', band);
  const rewards = createElement('div', 'result-rewards', band);
  const cash = createElement('span', 'result-cash', rewards);
  const rep = createElement('span', 'result-rep', rewards);
  const reason = createElement('div', 'result-reason', band);
  const queue = [];
  let showing = false;
  let timers = [];

  /**
   * Show a result: { kind: 'done' | 'blown', headline?, title, money, rep, reason }. Queued if one
   * is showing. `headline` replaces JOB DONE (a finished race or fare prints its own).
   */
  function show(result) {
    if (showing) {
      queue.push(result);
      return;
    }
    showing = true;
    const done = result.kind !== 'blown';
    root.dataset.kind = done ? 'done' : 'blown';
    const words = (result.headline || (done ? 'JOB DONE' : 'JOB BLOWN')).toUpperCase();
    setText(headline, words);
    headline.classList.toggle('is-long', words.length > 11);
    setText(title, (result.title || '').toUpperCase());
    setShown(title, Boolean(result.title));
    const hasCash = done && typeof result.money === 'number' && result.money !== 0;
    const hasRep = done && typeof result.rep === 'number' && result.rep !== 0;
    setText(cash, hasCash ? formatMoneyDelta(result.money) : '');
    setText(rep, hasRep ? `+${Math.round(result.rep)} REP` : '');
    setShown(cash, hasCash);
    setShown(rep, hasRep);
    setShown(rewards, hasCash || hasRep);
    setText(reason, done ? '' : result.reason || 'The job fell apart.');
    setShown(reason, !done);
    root.hidden = false;
    root.classList.remove('is-showing', 'is-leaving');
    void root.offsetWidth;
    root.classList.add('is-showing');
    game.audio?.play?.(done ? 'jobDone' : 'jobBlown');
    timers.forEach(clearTimeout);
    timers = [
      setTimeout(() => root.classList.add('is-leaving'), (result.seconds || 5) * 1000),
      setTimeout(finish, (result.seconds || 5) * 1000 + 600),
    ];
  }

  function finish() {
    root.hidden = true;
    root.classList.remove('is-showing', 'is-leaving');
    showing = false;
    if (queue.length) show(queue.shift());
  }

  function hide() {
    timers.forEach(clearTimeout);
    queue.length = 0;
    finish();
  }

  game.events.on('mission:completed', (payload) => {
    const mission = (payload && payload.mission) || {};
    const reward = payload ? payload.reward : null;
    const money = typeof reward === 'number' ? reward : reward && typeof reward === 'object' ? reward.money ?? reward.cash : mission.reward && typeof mission.reward === 'object' ? mission.reward.money : mission.reward;
    const rep = reward && typeof reward === 'object' ? reward.rep ?? reward.respect : payload?.rep ?? mission.rep ?? (mission.reward && mission.reward.rep);
    show({ kind: 'done', title: mission.title || mission.name || titleFromId(mission.id), money, rep });
  });
  game.events.on('activity:completed', (payload) => {
    if (!payload) return;
    const reward = payload.reward;
    const money = typeof reward === 'number' ? reward : reward && typeof reward === 'object' ? reward.money ?? reward.cash : undefined;
    const rep = reward && typeof reward === 'object' ? reward.rep ?? reward.respect : payload.rep;
    show({ kind: 'done', headline: payload.title || 'SIDE JOB DONE', title: payload.detail || '', money, rep });
  });
  game.events.on('mission:failed', (payload) => {
    const mission = (payload && payload.mission) || {};
    show({ kind: 'blown', title: mission.title || mission.name || titleFromId(mission.id), reason: payload && payload.reason });
  });

  root.hidden = true;
  return { show, hide };
}
