// Zayd's cash and street reputation, top right under the wanted stars: the dollar figure ticks up
// green when a job pays and down red when the PSPD take their cut, with the change floating beside
// it, and beneath it the REP rank he has earned with Port Sarab's underworld.
import { createElement, setText, setClass, setShown, setStyle, replayClass, formatMoney, formatMoneyDelta } from './uiElements.js';

/**
 * Build the money and rank lines in `container` (#hud-money-and-rank).
 * @returns {{update(dt:number):void}}
 */
export function createMoneyAndRankDisplay(game, container) {
  const moneyRow = createElement('div', 'money-row', container);
  const delta = createElement('span', 'money-delta', moneyRow);
  const value = createElement('span', 'money-value', moneyRow, '$0');
  const rankRow = createElement('div', 'rank-row', container);
  const rankChip = createElement('span', 'rank-chip', rankRow, 'REP 1');
  const rankName = createElement('span', 'rank-name', rankRow);
  const rankBar = createElement('span', 'rank-bar', container);
  const rankFill = createElement('i', 'rank-bar-fill', rankBar);
  let shownMoney = null;
  let targetMoney = 0;
  let deltaTotal = 0;
  let deltaHideAt = 0;

  /** Tick the shown figure toward the wallet; write the DOM only when a digit changes. */
  function update(dt) {
    const economy = game.economy;
    if (!economy) return;
    const money = Math.round(economy.money || 0);
    if (shownMoney === null) {
      shownMoney = money;
      targetMoney = money;
      setText(value, formatMoney(money));
    }
    if (money !== targetMoney) {
      const change = money - targetMoney;
      deltaTotal = performance.now() < deltaHideAt ? deltaTotal + change : change;
      targetMoney = money;
      setText(delta, formatMoneyDelta(deltaTotal));
      setClass(delta, 'is-loss', deltaTotal < 0);
      setClass(container, 'is-gain', change > 0);
      setClass(container, 'is-loss', change < 0);
      replayClass(delta, 'is-shown', 2.6);
      deltaHideAt = performance.now() + 2600;
    }
    if (shownMoney !== targetMoney) {
      const gap = targetMoney - shownMoney;
      const step = Math.max(1, Math.abs(gap) * Math.min(1, (game.time?.realDt || dt || 0.016) * 5));
      shownMoney = Math.abs(gap) <= step ? targetMoney : shownMoney + Math.sign(gap) * Math.round(step);
      setText(value, formatMoney(shownMoney));
      if (shownMoney === targetMoney) {
        setClass(container, 'is-gain', false);
        setClass(container, 'is-loss', false);
      }
    }
    updateRank(economy);
  }

  function updateRank(economy) {
    const rank = economy.rank;
    const name = economy.rankName || (typeof rank === 'string' ? rank : '');
    const number = typeof rank === 'number' ? rank : null;
    setText(rankChip, number !== null ? `REP ${number}` : 'REP');
    setText(rankName, name);
    const progress = typeof economy.rankProgress === 'number' ? economy.rankProgress : null;
    setShown(rankBar, progress !== null);
    if (progress !== null) setStyle(rankFill, 'width', `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`);
  }

  return { update };
}
