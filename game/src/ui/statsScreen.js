// The stats screen: Zayd's record in Port Sarab as a wall of tiles, cash, REP, the two sides of
// his Cover, jobs done and every figure the economy keeps (cars stolen, distance driven, falcons
// found ...).
import { createMenuPanel } from './menuListControls.js';
import { createElement, formatMoney, titleFromId } from './uiElements.js';

/**
 * Build the stats panel in `container`.
 * @returns {{element:Element, handleKey():boolean, refresh():void}}
 */
export function createStatsPanel(game, container) {
  const panel = createMenuPanel(container, 'Stats', 'THE WHEELMAN\'S RECORD');
  panel.element.classList.add('stats-panel');
  const grid = createElement('div', 'stats-grid', panel.body);

  /** Rebuild the tiles from the current game state. */
  function refresh() {
    grid.textContent = '';
    const economy = game.economy || {};
    const story = game.story || {};
    const tiles = [];
    tiles.push({ label: 'Cash', value: formatMoney(economy.money || 0), accent: 'cash' });
    tiles.push({ label: 'REP', value: typeof economy.rank === 'number' ? `${economy.rank}${economy.rankName ? ` - ${economy.rankName}` : ''}` : economy.rankName || economy.rank || '-', accent: 'sand' });
    tiles.push({ label: 'Crew trust', value: `${Math.round(story.crewTrust ?? 50)} / 100`, accent: 'crew' });
    tiles.push({ label: 'Badge', value: `${Math.round(story.badge ?? 50)} / 100`, accent: 'badge' });
    if (typeof economy.rep === 'number') tiles.push({ label: 'REP points', value: formatNumber(economy.rep), accent: 'sand' });
    const missions = game.missions || {};
    if (typeof missions.completedCount === 'number') {
      tiles.push({ label: 'Jobs done', value: missions.total ? `${missions.completedCount} / ${missions.total}` : String(missions.completedCount) });
    } else if (typeof missions.log === 'function') {
      tiles.push({ label: 'Jobs done', value: String(missions.log().filter((entry) => entry.done !== false).length) });
    }
    const source = economy.stats || economy.statistics || {};
    const stats = typeof source.all === 'function' ? source.all() || {} : source;
    const shown = new Set(tiles.map((tile) => tile.label.toLowerCase()));
    for (const key of Object.keys(stats)) {
      const value = stats[key];
      if (typeof value === 'object' || typeof value === 'function') continue;
      const label = /\s/.test(key) ? key : titleFromId(key.replace(/([a-z])([A-Z])/g, '$1 $2'));
      if (shown.has(label.toLowerCase())) continue;
      shown.add(label.toLowerCase());
      tiles.push({ label, value: typeof value === 'number' ? formatNumber(value) : String(value) });
    }
    const hours = Math.floor((game.time?.elapsed || 0) / 3600);
    const minutes = Math.floor(((game.time?.elapsed || 0) % 3600) / 60);
    tiles.push({ label: 'Time in Port Sarab', value: `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m` });
    for (const tile of tiles) {
      const node = createElement('div', `stats-tile${tile.accent ? ` stats-tile--${tile.accent}` : ''}`, grid);
      createElement('span', 'stats-tile-label', node, tile.label.toUpperCase());
      createElement('span', 'stats-tile-value', node, tile.value);
    }
  }

  refresh();
  return { element: panel.element, handleKey: () => false, refresh };
}

function formatNumber(value) {
  const rounded = Math.abs(value) >= 100 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
