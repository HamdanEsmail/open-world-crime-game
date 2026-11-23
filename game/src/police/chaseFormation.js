// The shape of a PSPD chase: every few tenths of a second each police car in the hunt is given its
// place. The nearest car behind the suspect takes the bumper, the next two his flanks, cars already
// ahead of him cut him off, the rest trail; a stopped car is boxed in from four sides (a side where
// a police car already stands is left to it); a man on foot has every car converging on him.

/** Seconds between reshuffles of the formation. */
const ROLE_INTERVAL = 0.4;
/** The four sides of a box, in the order they are filled. */
const BOX_ROLES = ['boxRear', 'boxLeft', 'boxRight', 'boxFront'];
/** Beyond this distance (metres) a car is still on its way, not yet in the formation. */
const FORMATION_REACH = 170;

/**
 * Build the formation keeper.
 * @param {Object[]} units  the roster's live units (read only)
 */
export function createChaseFormation(units) {
  const ranked = [];
  let timer = 0;

  /**
   * Give every chasing or responding police car its role for the next few tenths of a second.
   * ctx is dispatch's chase context (suspect position px/pz, direction fx/fz, right rx/rz, speed,
   * half length, onFoot, level).
   */
  function assignRoles(ctx, dt) {
    timer -= dt;
    if (timer > 0) return;
    timer = ROLE_INTERVAL;
    rankByDistance();
    if (ctx.onFoot) {
      for (let i = 0; i < ranked.length; i += 1) ranked[i].role = 'converge';
      return;
    }
    if (ctx.pspeed < 3.5) {
      assignBox(ctx);
      return;
    }
    let lead = false;
    let left = false;
    let right = false;
    let cutoffs = 0;
    for (let i = 0; i < ranked.length; i += 1) {
      const unit = ranked[i];
      const p = unit.vehicle.pos;
      const lon = (p.x - ctx.px) * ctx.fx + (p.z - ctx.pz) * ctx.fz;
      const lat = (p.x - ctx.px) * ctx.rx + (p.z - ctx.pz) * ctx.rz;
      let role;
      if (unit.distance > FORMATION_REACH) role = 'respond';
      else if (lon > 18 && cutoffs < 2 && ctx.level >= 2) {
        role = 'cutoff';
        cutoffs += 1;
      } else if (!lead) {
        role = 'lead';
        lead = true;
      } else if (ctx.level >= 2 && !right && (lat >= 0 || left)) {
        role = 'flankRight';
        right = true;
      } else if (ctx.level >= 2 && !left) {
        role = 'flankLeft';
        left = true;
      } else if (ctx.level >= 3 && cutoffs < 2) {
        role = 'cutoff';
        cutoffs += 1;
      } else role = 'trail';
      unit.role = role;
    }
  }

  /** Four sides round a stopped car, each taken by the nearest free unit; the rest hold back. */
  function assignBox(ctx) {
    for (let i = 0; i < ranked.length; i += 1) ranked[i].role = 'trail';
    const L = ctx.pHalfLength;
    for (let b = 0; b < BOX_ROLES.length; b += 1) {
      const role = BOX_ROLES[b];
      const along = role === 'boxRear' ? -(L + 3.4) : role === 'boxFront' ? L + 3.6 : 0;
      const across = role === 'boxRight' ? 3.4 : role === 'boxLeft' ? -3.4 : 0;
      const sx = ctx.px + ctx.fx * along + ctx.rx * across;
      const sz = ctx.pz + ctx.fz * along + ctx.rz * across;
      if (sideTaken(sx, sz)) continue;
      let best = null;
      let bestSq = 50 * 50;
      for (let i = 0; i < ranked.length; i += 1) {
        const unit = ranked[i];
        if (unit.role !== 'trail') continue;
        const dSq = (unit.vehicle.pos.x - sx) ** 2 + (unit.vehicle.pos.z - sz) ** 2;
        if (dSq < bestSq) {
          bestSq = dSq;
          best = unit;
        }
      }
      if (best) best.role = role;
    }
  }

  /** The police cars in the hunt (answering a call, chasing or on the way), nearest first. */
  function rankByDistance() {
    ranked.length = 0;
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.mode !== 'response' || !unit.vehicle || unit.vehicle.wrecked) continue;
      if (unit.state !== 'chasing' && unit.state !== 'responding') continue;
      let at = ranked.length;
      ranked.push(unit);
      while (at > 0 && ranked[at - 1].distance > unit.distance) {
        ranked[at] = ranked[at - 1];
        at -= 1;
      }
      ranked[at] = unit;
    }
  }

  /** A police car that is not being driven (its crew is out) already stands within 6 m of (x, z). */
  function sideTaken(x, z) {
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (!unit.vehicle || unit.state === 'chasing' || unit.state === 'responding') continue;
      const p = unit.vehicle.pos;
      if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 36) return true;
    }
    return false;
  }

  return { assignRoles };
}
