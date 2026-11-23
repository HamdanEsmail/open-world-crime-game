// Being caught by the PSPD: at one or two stars an officer who stays within cuffing reach of a
// player who has stopped fighting (on foot, or sitting in a car that has all but stopped) makes the
// arrest. The player is warned the moment it starts and can still bolt; above two stars there are
// no arrests, only gunfire.

/** Metres from the player an officer must stay within to make the arrest, on foot and at a car door. */
const CUFF_REACH = 3;
const CUFF_REACH_AT_CAR = 3.6;
/** Seconds the officer must hold him. */
const CUFF_SECONDS = 1.5;
/** A car slower than this (m/s) counts as stopped. */
const STOPPED_SPEED = 2;

/**
 * Build the arrest procedure.
 * @param {Object} game
 */
export function createArrestProcedure(game) {
  const arrest = {
    /** 0..1 of the way to the cuffs. */
    progress: 0,
    /** The officer doing the cuffing, or null. */
    officer: null,
    /** Arrests made this session. */
    arrests: 0,
    update,
    reset,
  };
  let hold = 0;
  let warned = false;
  let calmTime = 0;

  /**
   * Once a frame (after the officers have moved). ctx comes from dispatch: level, onFoot,
   * playerVehicle, pspeed, playerCharacter, playerDown, fighting, units.
   */
  function update(dt, ctx) {
    if (!ctx.hasPlayer || ctx.playerDown || ctx.level < 1 || ctx.level > 2 || ctx.suspended) {
      reset();
      return;
    }
    const inCar = !!ctx.playerVehicle;
    if (inCar && ctx.pspeed >= STOPPED_SPEED) {
      decay(dt);
      return;
    }
    const officer = nearestOfficerOnFoot(ctx, inCar ? CUFF_REACH_AT_CAR : CUFF_REACH);
    if (!officer || ctx.fighting) {
      decay(dt);
      return;
    }
    calmTime = 0;
    arrest.officer = officer;
    hold += dt;
    arrest.progress = Math.min(1, hold / CUFF_SECONDS);
    if (!warned) {
      warned = true;
      game.events.emit('notify', { text: 'An officer is trying to cuff you: move!', kind: 'wanted' });
    }
    if (hold >= CUFF_SECONDS) makeArrest(officer);
  }

  /** The cuffs go on: the player system takes it from here (and clears the stars). */
  function makeArrest(officer) {
    arrest.arrests += 1;
    hold = 0;
    arrest.progress = 0;
    warned = false;
    game.events.emit('police:arrest', { officer });
    game.events.emit('subtitle', { speaker: 'PSPD Officer', text: 'You are under arrest.', seconds: 2.6 });
    game.player?.arrest?.();
  }

  /** The hold slips away while nobody is close; the warning can come again after a calm spell. */
  function decay(dt) {
    hold = Math.max(0, hold - dt * 2);
    arrest.progress = Math.min(1, hold / CUFF_SECONDS);
    if (hold === 0) {
      arrest.officer = null;
      calmTime += dt;
      if (calmTime > 4) warned = false;
    }
  }

  function reset() {
    hold = 0;
    arrest.progress = 0;
    arrest.officer = null;
    warned = false;
    calmTime = 0;
  }

  /** The closest standing officer on foot within `reach` of the player, or null. */
  function nearestOfficerOnFoot(ctx, reach) {
    let best = null;
    let bestSq = reach * reach;
    const units = ctx.units;
    for (let i = 0; i < units.length; i += 1) {
      const officers = units[i].officers;
      for (let k = 0; k < officers.length; k += 1) {
        const officer = officers[k];
        if (officer.vehicle || officer.alive === false) continue;
        const state = officer.state;
        if (state === 'ragdoll' || state === 'getUp' || state === 'dead' || state === 'exitVehicle' || state === 'enterVehicle') continue;
        const dx = officer.pos.x - ctx.px;
        const dz = officer.pos.z - ctx.pz;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestSq) {
          bestSq = dSq;
          best = officer;
        }
      }
    }
    return best;
  }

  return arrest;
}
