// Money, reputation and the record of what the player has done in Port Sarab. Cash is earned
// from jobs, races, fares and theft and spent in shops; reputation points raise the player's rank
// from "Nobody" to "Legend of the Dunes", which unlocks weapons, cars and jobs. Becomes game.economy.

/** The ranks, each with the reputation needed to reach it. */
export const REPUTATION_RANKS = [
  { name: 'Nobody', rep: 0 },
  { name: 'Errand Boy', rep: 60 },
  { name: 'Wheelman', rep: 180 },
  { name: 'Night Driver', rep: 380 },
  { name: 'Corniche Ghost', rep: 700 },
  { name: 'Souk Fixer', rep: 1150 },
  { name: 'Dune Runner', rep: 1750 },
  { name: 'Spire Breaker', rep: 2500 },
  { name: 'King of the Khamsin', rep: 3500 },
  { name: 'Legend of the Dunes', rep: 5000 },
];

/** Build the wallet, the reputation ladder and the statistics book. */
export function createWalletAndRank(game) {
  const counters = new Map();
  const economy = {
    money: 350,
    rep: 0,
    rank: 1,
    rankName: REPUTATION_RANKS[0].name,
    ranks: REPUTATION_RANKS,

    /** Earn money; `reason` shows in the notification ("Fare", "Job: Borrowed Wheels"). */
    addMoney(amount, reason) {
      const delta = Math.round(amount);
      if (delta === 0) return;
      economy.money += delta;
      if (delta > 0) counters.set('moneyEarned', (counters.get('moneyEarned') || 0) + delta);
      game.events.emit('money:changed', { money: economy.money, delta, reason: reason || '' });
    },

    /** Pay if the player can afford it (or regardless when `force`); returns whether it was paid. */
    spend(amount, reason, force = false) {
      const cost = Math.round(amount);
      if (cost <= 0) return true;
      if (!force && economy.money < cost) return false;
      economy.money = Math.max(0, economy.money - cost);
      counters.set('moneySpent', (counters.get('moneySpent') || 0) + cost);
      game.events.emit('money:changed', { money: economy.money, delta: -cost, reason: reason || '' });
      return true;
    },

    canAfford: (amount) => economy.money >= amount,

    /** Earn reputation; climbing a rank is announced. */
    addRep(points, reason) {
      if (points <= 0) return;
      economy.rep += Math.round(points);
      const before = economy.rank;
      refreshRank();
      game.events.emit('rep:changed', { rep: economy.rep, delta: points, reason: reason || '' });
      if (economy.rank > before) {
        game.events.emit('rank:changed', { rank: economy.rank, rankName: economy.rankName });
        game.events.emit('notify', { text: `Rank up: ${economy.rankName}`, kind: 'good' });
      }
    },

    /** Reputation still needed for the next rank, and progress toward it (0..1). */
    get nextRankProgress() {
      const next = REPUTATION_RANKS[economy.rank];
      if (!next) return 1;
      const base = REPUTATION_RANKS[economy.rank - 1].rep;
      return (economy.rep - base) / (next.rep - base);
    },

    /** Counters for the statistics screen: stats.add('vehiclesStolen', 1), stats.get(name), stats.all(). */
    stats: {
      add(name, amount = 1) {
        counters.set(name, (counters.get(name) || 0) + amount);
      },
      max(name, value) {
        if (value > (counters.get(name) || 0)) counters.set(name, value);
      },
      get: (name) => counters.get(name) || 0,
      all() {
        const out = {};
        for (const [name, value] of counters) out[name] = value;
        return out;
      },
    },

    update(dt) {
      counters.set('secondsPlayed', (counters.get('secondsPlayed') || 0) + dt);
      const player = game.player;
      if (player && player.character && game.mode === 'playing') {
        const metres = player.speed * dt;
        counters.set(player.vehicle ? 'metresDriven' : 'metresOnFoot', (counters.get(player.vehicle ? 'metresDriven' : 'metresOnFoot') || 0) + metres);
        if (player.vehicle) economy.stats.max('topSpeedKmh', Math.round(player.speed * 3.6));
      }
    },

    serialize() {
      return { money: economy.money, rep: economy.rep, stats: economy.stats.all() };
    },
    deserialize(data) {
      if (!data) return;
      economy.money = data.money || 0;
      economy.rep = data.rep || 0;
      counters.clear();
      for (const name of Object.keys(data.stats || {})) counters.set(name, data.stats[name]);
      refreshRank();
    },
    reset() {
      economy.money = 350;
      economy.rep = 0;
      counters.clear();
      refreshRank();
    },
  };

  function refreshRank() {
    let rank = 1;
    for (let i = 0; i < REPUTATION_RANKS.length; i += 1) if (economy.rep >= REPUTATION_RANKS[i].rep) rank = i + 1;
    economy.rank = rank;
    economy.rankName = REPUTATION_RANKS[rank - 1].name;
  }

  // The world keeps score by itself.
  game.events.on('vehicle:destroyed', () => economy.stats.add('vehiclesDestroyed'));
  game.events.on('wanted:escaped', () => economy.stats.add('pursuitsEscaped'));
  game.events.on('wanted:changed', (event) => economy.stats.max('highestWantedLevel', event.level));
  game.events.on('player:arrested', () => economy.stats.add('timesArrested'));
  game.events.on('player:died', () => economy.stats.add('timesKnockedOut'));
  game.events.on('mission:completed', () => economy.stats.add('jobsDone'));
  game.events.on('mission:failed', () => economy.stats.add('jobsBlown'));
  game.events.on('vehicle:landed', (event) => {
    if (event.vehicle && event.vehicle.isPlayer && event.airTime) economy.stats.max('longestJumpSeconds', Math.round(event.airTime * 10) / 10);
  });
  return economy;
}
