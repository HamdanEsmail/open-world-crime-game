// The rules of the road in Port Sarab: busy hours, following gaps, the lights, who gives way, which
// way cars turn, when drivers pull over or bail out, and where cars park.

/** Share of full traffic out at an hour: quiet before dawn, rush at 08:00 and 17:30. */
export function trafficDensityAtHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 2; i < BY_HOUR.length; i += 2) {
    if (h <= BY_HOUR[i]) {
      const h0 = BY_HOUR[i - 2];
      return BY_HOUR[i - 1] + ((BY_HOUR[i + 1] - BY_HOUR[i - 1]) * (h - h0)) / (BY_HOUR[i] - h0);
    }
  }
  return BY_HOUR[1];
}

/** Gap (m) kept to what is ahead, growing with speed and closing speed. */
export function followingGapAtSpeed(speed, closing, minGap, headway, accel, decel) {
  return minGap + Math.max(0, speed * headway + (speed * closing) / (2 * Math.sqrt(accel * decel)));
}

/** Stop at the light? On red; on amber if it can stop comfortably. */
export function mustStopForSignal(signal, toLine, speed, decel) {
  if (signal === 'red') return true;
  return signal === 'yellow' && toLine >= (speed * speed) / (2 * decel * 1.4);
}

/** Give way on a crossing path? Lights: left turns wait. Else first come, then the right. */
export function mustGiveWay(lights, myTurn, otherTurn, myEta, otherEta, myArrival, otherArrival, fromRight, patient) {
  if (lights) {
    if (myTurn === 'left' && otherTurn !== 'left') return otherEta < 3.8;
    if (otherTurn === 'left' && myTurn !== 'left') return false;
    return otherEta < myEta - 0.4;
  }
  if (otherArrival >= 0) {
    if (myArrival < 0 || otherArrival < myArrival - SAME_MOMENT) return true;
    return otherArrival <= myArrival + SAME_MOMENT && fromRight && patient;
  }
  return myArrival < 0 && fromRight && otherEta < myEta + 0.8;
}

/** Weight of a turn: inner lane turns left, kerb lane right. */
export function turnWeight(turn, lane, lanes, atBend) {
  if (!atBend && lanes > 1 && ((turn === 'left' && lane !== 0) || (turn === 'right' && lane !== lanes - 1))) return 0;
  return TURN_WEIGHTS[turn] || 1;
}

/** Lane after a turn: straight keeps it, left takes the inner lane, right the kerb lane. */
export function laneAfterTurn(turn, lane, lanesThere, atBend) {
  if (atBend || turn === 'straight') return Math.min(lane, lanesThere - 1);
  return turn === 'left' ? 0 : lanesThere - 1;
}

/** Pull over for a siren `along` m ahead (negative: behind), closing at `closing` m/s? */
export function pullOverForSiren(distance, along, across, closing) {
  if (distance > 70 || along > -3 || Math.abs(across) > 10) return false;
  return closing > 0.5 || along > -25;
}

/** Chance a driver near trouble stops and runs. */
export function bailOutChance(speed, distance, ahead) {
  return 0.22 + (speed < 5 ? 0.25 : 0) + (ahead && distance < 30 ? 0.25 : 0) + (distance < 14 ? 0.15 : 0);
}

/** Panic range (m): from a shooter, a bullet's landing, or an explosion. */
export function panicRange(kind, radius) {
  return kind === 'shot' ? 60 : kind === 'hit' ? 26 : Math.max(90, (radius || 0) * 5);
}

/** Chance a car-park bay of this use holds a car (0: none). */
export function parkedCarChanceForLot(use) {
  return LOT_CHANCE[use] || 0;
}

const BY_HOUR = [0, 0.42, 1, 0.28, 2, 0.2, 4, 0.2, 5, 0.3, 6, 0.58, 7, 0.88, 8, 1, 9, 0.86, 11, 0.74, 13, 0.8,
  15, 0.8, 16.5, 0.94, 17.5, 1, 19, 0.86, 21, 0.68, 23, 0.52, 24, 0.42];
const SAME_MOMENT = 0.6;
const TURN_WEIGHTS = { straight: 6, right: 2.2, left: 1.9, uturn: 0.4 };
const LOT_CHANCE = { parking: 0.75, carLot: 1.1, policeYard: 0.95, truckYard: 0.8, hotelForecourt: 0.85 };
