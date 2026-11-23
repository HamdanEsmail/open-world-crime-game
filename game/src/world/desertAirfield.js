// Sarab Airfield in the Amber Dunes: a 300 m runway with threshold bars, centre line and its numbers
// 18 and 36 painted in seven-stroke figures, an apron with a taxi line, the barrel-roofed Hangar 2,
// an orange windsock and two parked high-wing light aircraft of the local flying club.
import { SURFACE } from './groundSurfaceAtlas.js';

const PAINT = 0.014;

/** The paved rectangles of the airfield (runway, apron) for the terrain to tuck under. */
export function airfieldPads(city, mark) {
  const r = runwayRect(mark);
  return [r, { x0: r.x1 - 0.5, z0: mark.z - 120, x1: r.x1 + 28, z1: mark.z - 58 }];
}

/** Lay the runway, apron and markings and raise the hangar, windsock and aircraft. */
export function buildAirfield(game, ground, props, mark, hangar, lights, rng) {
  const terrain = game.terrain;
  const r = runwayRect(mark);
  const cx = mark.x;
  const drape = (x, z) => Math.max(0, terrain.baseHeightAt(x, z)) + 0.02;
  const columns = [r.x0, r.x0 + 1.5, cx - 12, cx, cx + 12, r.x1 - 1.5, r.x1];
  const rows = [];
  for (let z = r.z0; z <= r.z1 + 0.01; z += 15) rows.push(z);
  const tint = ground.tintOf(0xe8e2da);
  ground.grid('base', SURFACE.ASPHALT_BLEACHED, rows.length, columns.length, (i, j, out) => {
    out.x = columns[j];
    out.z = rows[i];
    out.y = drape(out.x, out.z);
    out.u = out.x / 4;
    out.v = out.z / 4;
    const shade = (j === 0 || j === columns.length - 1 ? 0.88 : 1) * ground.wobble(out.x, out.z, 0.08);
    out.r = tint[0] * shade;
    out.g = tint[1] * shade;
    out.b = tint[2] * shade;
  });
  const paintRect = (x0, z0, x1, z1, colour = 0xfffaf0) => {
    ground.polygon('paint', [[x0, z0, drape(x0, z0) + PAINT], [x1, z0, drape(x1, z0) + PAINT], [x1, z1, drape(x1, z1) + PAINT], [x0, z1, drape(x0, z1) + PAINT]], 0, SURFACE.PAINT, { tint: colour, jitter: 0.03 });
  };
  for (let z = r.z0; z < r.z1 - 0.1; z += 15) {
    paintRect(r.x0 + 1.6, z, r.x0 + 2.5, Math.min(r.z1, z + 15));
    paintRect(r.x1 - 2.5, z, r.x1 - 1.6, Math.min(r.z1, z + 15));
  }
  for (let z = r.z0 + 66; z < r.z1 - 80; z += 50) paintRect(cx - 0.45, z, cx + 0.45, z + 30);
  for (const [end, dir] of [[r.z0, 1], [r.z1, -1]]) {
    for (let k = 0; k < 6; k += 1) {
      for (const side of [-1, 1]) {
        const x = cx + side * (3.6 + k * 3.8);
        const za = end + dir * 6;
        const zb = end + dir * 36;
        paintRect(x - 0.9, Math.min(za, zb), x + 0.9, Math.max(za, zb));
      }
    }
    for (const side of [-1, 1]) {
      const za = end + dir * 112;
      const zb = end + dir * 136;
      paintRect(cx + side * 7, Math.min(za, zb), cx + side * 11, Math.max(za, zb));
    }
  }
  paintFigures(paintRect, '18', cx, r.z0 + 44, 1);
  paintFigures(paintRect, '36', cx, r.z1 - 44, -1);

  // Apron and taxi line to Hangar 2.
  const apron = airfieldPads(null, mark)[1];
  ground.rect('base', apron.x0, apron.z0, apron.x1, apron.z1, drape((apron.x0 + apron.x1) / 2, (apron.z0 + apron.z1) / 2) - 0.005, SURFACE.CONCRETE, { tint: 0xe4e0d8, jitter: 0.08, cell: 30 });
  const taxiZ = (apron.z0 + apron.z1) / 2;
  paintRect(cx + 2, taxiZ - 0.25, apron.x1 - 2, taxiZ + 0.25, 0xf2c230);
  paintFigures(paintRect, '2', apron.x0 + 13, apron.z0 + 6, 1, 0xf2c230);
  if (hangar) raiseHangar(props, hangar);
  raiseWindsock(props, r.x1 + 9, r.z0 + 22);
  for (const [x, z, colour] of [[apron.x0 + 8, apron.z0 + 18, 0x1ba39c], [apron.x0 + 8, apron.z1 - 16, 0xe4572e]]) {
    parkLightAircraft(props, x, drape(x, z) - 0.02, z, -Math.PI / 2 + rng.range(-0.15, 0.15), colour);
  }
  lights.push({ x: r.x1 + 9, y: 7.4, z: r.z0 + 22, color: 0xff3020, size: 1.6, flicker: true });
}

function runwayRect(mark) {
  const w = mark.w || 60;
  const d = mark.d || 300;
  return { x0: mark.x - w / 2, x1: mark.x + w / 2, z0: mark.z - d / 2, z1: mark.z + d / 2 };
}

/**
 * Paint figures in seven strokes, 12 m tall, read by a pilot rolling along `up` (+1: toward +z).
 * @param {(x0:number, z0:number, x1:number, z1:number, colour?:number) => void} paintRect
 */
function paintFigures(paintRect, text, cx, baseZ, up, colour = 0xfffaf0) {
  const width = 6;
  const height = 12;
  const stroke = 1.1;
  const gap = 2.4;
  const total = text.length * width + (text.length - 1) * gap;
  for (let n = 0; n < text.length; n += 1) {
    const segments = SEVEN_STROKES[text[n]] || '';
    const left = -total / 2 + n * (width + gap);
    // Facing +z the pilot's right is -x; facing -z it is +x.
    const toWorld = (u, v) => [cx - up * (left + u), baseZ + up * v];
    const rect = (u0, v0, u1, v1) => {
      const [ax, az] = toWorld(u0, v0);
      const [bx, bz] = toWorld(u1, v1);
      paintRect(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), colour);
    };
    for (const s of segments) {
      if (s === 'a') rect(0, height - stroke, width, height);
      else if (s === 'b') rect(width - stroke, height / 2, width, height - stroke);
      else if (s === 'c') rect(width - stroke, stroke, width, height / 2);
      else if (s === 'd') rect(0, 0, width, stroke);
      else if (s === 'e') rect(0, stroke, stroke, height / 2);
      else if (s === 'f') rect(0, height / 2, stroke, height - stroke);
      else if (s === 'g') rect(stroke, height / 2 - stroke / 2, width - stroke, height / 2 + stroke / 2);
    }
  }
}

/** Hangar 2: a barrel-vaulted shed of ribbed metal, its big doors facing the runway. */
function raiseHangar(props, mark) {
  const x0 = mark.x - mark.w / 2;
  const x1 = mark.x + mark.w / 2;
  const half = mark.d / 2;
  const wall = 3.5;
  const rise = (mark.h || 14) - wall;
  const segments = 14;
  const arch = [];
  for (let k = 0; k <= segments; k += 1) {
    const angle = (k / segments) * Math.PI;
    arch.push([mark.z + Math.cos(angle) * half, wall + Math.sin(angle) * rise]);
  }
  for (let k = 0; k < segments; k += 1) {
    const [za, ya] = arch[k];
    const [zb, yb] = arch[k + 1];
    props.quad([x1, ya, za], [x1, yb, zb], [x0, yb, zb], [x0, ya, za], k % 2 === 0 ? 0xdfe3e6 : 0xccd2d8);
  }
  props.quad([x0, 0, mark.z + half], [x1, 0, mark.z + half], [x1, wall, mark.z + half], [x0, wall, mark.z + half], 0xc4cad0, 0.85);
  props.quad([x1, 0, mark.z - half], [x0, 0, mark.z - half], [x0, wall, mark.z - half], [x1, wall, mark.z - half], 0xc4cad0, 0.85);
  for (const [x, facing] of [[x1, 1], [x0, -1]]) {
    const centre = [x, 0, mark.z];
    const rim = [[x, 0, mark.z + half], ...arch.map(([z, y]) => [x, y, z]), [x, 0, mark.z - half]];
    for (let k = 0; k < rim.length - 1; k += 1) {
      if (facing > 0) props.triangle(centre, rim[k + 1], rim[k], 0xe6e8ea);
      else props.triangle(centre, rim[k], rim[k + 1], 0xe6e8ea);
    }
  }
  props.box(x0 - 0.06, 5, mark.z, 0.1, 10, half * 1.2, 0x2a2e36);
  props.box(x0 - 0.3, 5.2, mark.z - half * 0.62, 0.3, 10.4, half * 0.55, 0xb8bec6);
  props.box(x0 - 0.3, 5.2, mark.z + half * 0.62, 0.3, 10.4, half * 0.55, 0xb8bec6);
  props.box(x0 - 0.12, 11.2, mark.z, 0.2, 1.6, half * 1.0, 0xe4572e);
}

/** A windsock on a mast: a red-and-white striped cone streaming in the breeze off the gulf. */
function raiseWindsock(props, x, z) {
  props.cylinder(x, 0, z, 0.12, 0.08, 7.2, 6, 0xe8e8e8);
  props.with(x, 6.9, z, -Math.PI / 2 - 0.4, 1.35, 0, () => {
    for (let k = 0; k < 4; k += 1) {
      props.cylinder(0, k * 0.9, 0, 0.6 - k * 0.1, 0.5 - k * 0.1, 0.9, 8, k % 2 === 0 ? 0xf06a2a : 0xfbf7f0);
    }
  });
}

/** A small high-wing single-engine aircraft, white with a coloured cheat line. */
function parkLightAircraft(props, x, y, z, heading, colour) {
  props.with(x, y, z, heading, 0, 0, () => {
    props.box(0, 1.35, 0.4, 1.15, 1.25, 4.6, 0xf8f8f6);
    props.box(0, 1.2, -2.8, 0.7, 0.8, 2.4, 0xf8f8f6);
    props.box(0, 1.35, 0.6, 1.17, 0.18, 4.4, colour);
    props.box(0, 1.65, 1.3, 1.18, 0.45, 1.4, 0x2a3644);
    props.box(0, 2.08, 0.8, 10.8, 0.14, 1.5, 0xf8f8f6);
    props.box(-5.0, 2.09, 0.8, 0.8, 0.15, 1.52, colour);
    props.box(5.0, 2.09, 0.8, 0.8, 0.15, 1.52, colour);
    props.box(0, 1.25, -3.9, 3.4, 0.1, 0.9, 0xf8f8f6);
    props.box(0, 2.0, -3.9, 0.1, 1.5, 1.0, colour);
    props.box(0, 1.35, 2.85, 0.5, 0.5, 0.3, 0x30343a);
    props.box(0, 1.35, 3.05, 0.12, 1.9, 0.06, 0x30343a);
    for (const side of [-1, 1]) {
      props.beam(side * 0.55, 1.0, 0.6, side * 1.3, 0.35, 0.6, 0.08, 0x8a8e96);
      props.cylinder(side * 1.3, 0, 0.6, 0.33, 0.33, 0.2, 8, 0x1c1c20);
      props.beam(side * 0.5, 1.9, 0.9, side * 2.6, 2.05, 0.8, 0.07, 0x8a8e96);
    }
    props.cylinder(0, 0, 2.3, 0.25, 0.25, 0.15, 8, 0x1c1c20);
  });
}

/** Which of the seven strokes (a top, b c right, d bottom, e f left, g middle) draw each figure. */
const SEVEN_STROKES = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
