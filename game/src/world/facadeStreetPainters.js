// The low-rise walls of Port Sarab, painted for the facade atlas: Old Sarab's plaster, arches,
// battlements, wind-tower slats and timber doors; the docks' corrugated steel, roller doors and cold
// panels; villa windows and loggias; Al Wadi's flats; Southgate's shop rows and motel doors.
import { paneOfGlass, shopWindow, mashrabiya, plasterMottling, hazardStripes } from './facadeBrushes.js';

/** Old Sarab plaster: small deep-set windows, timber lintels, shutters and the odd lattice screen. */
export function plasterWindows(p) {
  const bw = p.w / 3;
  const sh = p.h / 2;
  p.base('#f3eadb');
  plasterMottling(p);
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      const cx = i * bw + bw / 2 + (p.rng.next() - 0.5) * 6;
      const y = j * sh + 18;
      if (j === 0 && p.rng.chance(0.35)) {
        mashrabiya(p, cx - 9, y - 6, 18, 28);
        continue;
      }
      p.rect('#c8b597', cx - 6, y - 1, 12, 20);
      p.rect('#2b221c', cx - 5, y + 1, 10, 17, 'keep');
      p.lightGrad(cx - 5, y + 1, 10, 17, '#ffcf88', '#e08a3c');
      p.rect('#6b4a2e', cx - 8, y - 4, 16, 3, 'keep');
      if (p.rng.chance(0.45)) {
        const shutter = p.rng.pick(['#3f7f86', '#2f5f8a', '#7a5a3a', '#3d7a5c', '#b8862e']);
        p.rect(shutter, cx - 11, y + 1, 5, 17, 'keep');
        p.rect(shutter, cx + 6, y + 1, 5, 17, 'keep');
      }
    }
    p.rect('#e2d4bc', 0, j * sh + sh - 2, p.w, 2);
  }
}

/** Old Sarab ground floor: three arched openings on dark shop interiors full of spice and carpets. */
export function plasterArches(p) {
  const bw = p.w / 3;
  p.base('#f1e7d6');
  plasterMottling(p);
  for (let i = 0; i < 3; i += 1) {
    const cx = i * bw + bw / 2;
    const half = 12;
    const top = 30;
    const pointed = i !== 1;
    const arch = (inset) => (c) => {
      const h = half + inset;
      c.moveTo(cx - h, 112);
      c.lineTo(cx - h, top + h);
      if (pointed) {
        c.quadraticCurveTo(cx - h, top - inset - 4, cx, top - inset - 10);
        c.quadraticCurveTo(cx + h, top - inset - 4, cx + h, top + h);
      } else {
        c.arc(cx, top + h, h, Math.PI, 0);
      }
      c.lineTo(cx + h, 112);
      c.closePath();
    };
    p.shape(arch(3), '#d8c6a6');
    p.shape(arch(0), '#2a211b', 'keep');
    p.lightShape(arch(0), '#e8a050');
    for (let k = 0; k < 9; k += 1) {
      const gx = cx - 10 + p.rng.next() * 20;
      const gy = 70 + p.rng.next() * 38;
      const fill = p.rng.pick(['#d9772e', '#b8322a', '#e8b42c', '#8a3a6a', '#c86a2a', '#3d7a8a']);
      p.rect(fill, gx - 2, gy, 4 + p.rng.next() * 4, 3 + p.rng.next() * 5, 'keep');
    }
    p.light('#ffd090', cx - 6, top + 2, 12, 10);
  }
  p.rect('#d8c8aa', 0, 108, p.w, 4);
}

/** Bare Old Sarab plaster, mottled, cracked and sun-bleached. */
export function plasterBlank(p) {
  p.base('#f1e8d8');
  plasterMottling(p);
  for (let i = 0; i < 3; i += 1) {
    let x = p.rng.next() * p.w;
    let y = p.rng.next() * p.h;
    p.line((c) => {
      c.moveTo(x, y);
      for (let k = 0; k < 5; k += 1) {
        x += (p.rng.next() - 0.5) * 10;
        y += 4 + p.rng.next() * 6;
        c.lineTo(x, y);
      }
    }, '#8a7658', 0.8, 0.35);
  }
}

/** Stepped battlements along an Old Sarab parapet; the gaps are cut away against the sky. */
export function crenellation(p) {
  p.base('#f2e8d6');
  plasterMottling(p);
  p.rect('#f2e8d6', 0, 0, p.w, 62, 'cut');
  for (let k = 0; k < 2; k += 1) {
    const cx = k * 56 + 28;
    p.rect('#f2e8d6', cx - 18, 42, 36, 20);
    p.rect('#f2e8d6', cx - 12, 24, 24, 20);
    p.rect('#f2e8d6', cx - 6, 8, 12, 18);
    p.rect('#fffaf0', cx - 18, 42, 36, 2, null);
    p.rect('#fffaf0', cx - 12, 24, 24, 2, null);
    p.rect('#fffaf0', cx - 6, 8, 12, 2, null);
    p.rect('#d6c6a8', cx + 4, 10, 2, 16, null);
    p.rect('#d6c6a8', cx + 10, 26, 2, 16, null);
    p.rect('#d6c6a8', cx + 16, 44, 2, 18, null);
  }
  p.rect('#fffaf0', 0, 62, p.w, 2);
  p.rect('#d9c9ac', 0, 108, p.w, 4);
}

/** The slatted head of a wind tower: tall slots between plaster piers, a timber tie across. */
export function windTowerSlats(p) {
  p.base('#f0e5d2');
  plasterMottling(p);
  const slots = 5;
  const pitch = p.w / slots;
  for (let i = 0; i < slots; i += 1) {
    const x = i * pitch + 5;
    p.shape((c) => {
      c.moveTo(x, 96);
      c.lineTo(x, 26);
      c.lineTo(x + 6, 18);
      c.lineTo(x + 12, 26);
      c.lineTo(x + 12, 96);
      c.closePath();
    }, '#f0e5d2', 'cut');
  }
  p.rect('#6e4a2c', 0, 55, p.w, 3, 'keep');
  p.rect('#fbf4e6', 0, 12, p.w, 2);
  p.rect('#d6c6a8', 0, 96, p.w, 2);
}

/** An arched timber door with studs and a ring handle; outside the arch is cut away. */
export function doorArch(p) {
  p.base('#ece3cc', 'cut');
  const outline = (inset) => (c) => {
    c.moveTo(8 + inset, 112);
    c.lineTo(8 + inset, 52);
    c.arc(56, 52, 48 - inset, Math.PI, 0);
    c.lineTo(104 - inset, 112);
    c.closePath();
  };
  p.shape(outline(0), '#e9dcc0', 'keep');
  p.shape(outline(6), '#f0f0ee');
  p.line((c) => { for (let x = 22; x < 100; x += 12) { c.moveTo(x, 12); c.lineTo(x, 112); } }, '#9a9a96', 1.5);
  p.line((c) => { c.moveTo(56, 8); c.lineTo(56, 112); }, '#7a7a76', 2);
  for (let y = 30; y < 110; y += 22) {
    for (let x = 22; x < 96; x += 14) p.shape((c) => c.arc(x, y, 2, 0, Math.PI * 2), '#3a3a38', 'keep');
  }
  p.shape((c) => c.arc(66, 70, 5, 0, Math.PI * 2), '#c9962e', 'keep');
  p.shape((c) => c.arc(66, 70, 3, 0, Math.PI * 2), '#f0f0ee');
}

/** Corrugated steel sheeting with rust streaks and patched panels. */
export function corrugated(p) {
  p.base('#e8eaec');
  for (let i = 0; i < 3; i += 1) p.rect(p.rng.pick(['#dde2e5', '#eef0f1', '#d6dadc']), p.rng.int(0, 3) * 28, 0, 28, p.h);
  for (let x = 0; x < p.w; x += 7) {
    p.rect('#f7f9fa', x, 0, 3, p.h, null);
    p.rect('#b2b9be', x + 4, 0, 2, p.h, null);
  }
  p.rect('#8f969b', 0, 55, p.w, 1, null);
  p.streaks(16, 'rgba(150,78,38,0.95)', 18, 70, 0.4);
  p.vgrad(0, 92, p.w, 20, 'rgba(120,100,80,0)', 'rgba(120,100,80,0.45)', null);
}

/** A roller shutter door in a yellow-and-black hazard frame. */
export function rollerDoor(p) {
  p.base('#dfe2e4');
  for (let y = 14; y < 106; y += 4) p.rect('#a6adb2', 10, y, 92, 1, null);
  hazardStripes(p, 0, 0, 10, p.h);
  hazardStripes(p, 102, 0, 10, p.h);
  p.rect('#454a4e', 10, 0, 92, 12, 'keep');
  p.rect('#2e3236', 10, 106, 92, 6, 'keep');
  p.vgrad(10, 90, 92, 16, 'rgba(90,80,70,0)', 'rgba(90,80,70,0.4)', null);
  p.rect('#ffd27a', 50, 3, 12, 5, 'keep');
  p.light('#ffd27a', 50, 3, 12, 5);
}

/** Cold-store cladding: smooth insulated panels, seams and louvred vents. */
export function coldPanels(p) {
  p.base('#f2f3f1');
  for (let x = 0; x < p.w; x += 14) {
    p.rect('#c4c8c7', x, 0, 1, p.h, null);
    p.rect('#ffffff', x + 1, 0, 1, p.h, null);
  }
  p.rect('#c4c8c7', 0, 56, p.w, 1, null);
  for (const [vx, vy] of [[18, 20], [74, 76]]) {
    p.rect('#d4d8d8', vx, vy, 22, 14, null);
    for (let k = 2; k < 14; k += 3) p.rect('#8e9696', vx + 1, vy + k, 20, 1, null);
  }
  p.streaks(8, 'rgba(110,110,100,0.8)', 10, 40, 0.18);
}

/** A Jasmine Heights villa wall: arched windows with sage shutters on warm white render. */
export function villaWindows(p) {
  p.base('#fbf8f0');
  p.speckle(90, ['#efe9dc', '#ffffff'], 1, 4, 0.35);
  for (let i = 0; i < 2; i += 1) {
    const x = i * 56 + 16;
    const arch = (c) => {
      c.moveTo(x, 96);
      c.lineTo(x, 34);
      c.arc(x + 12, 34, 12, Math.PI, 0);
      c.lineTo(x + 24, 96);
      c.closePath();
    };
    p.shape(arch, '#e6dfd0');
    p.shape((c) => {
      c.moveTo(x + 2, 94);
      c.lineTo(x + 2, 34);
      c.arc(x + 12, 34, 10, Math.PI, 0);
      c.lineTo(x + 22, 94);
      c.closePath();
    }, '#34444e', 'keep');
    p.lightShape(arch, '#ffd8a0');
    p.rect('#f6f2ea', x + 11, 24, 2, 72, 'keep');
    p.rect('#5b8a6a', x - 10, 26, 9, 70, 'keep');
    p.rect('#5b8a6a', x + 25, 26, 9, 70, 'keep');
    p.line((c) => { for (let k = 30; k < 94; k += 5) { c.moveTo(x - 10, k); c.lineTo(x - 1, k); c.moveTo(x + 25, k); c.lineTo(x + 34, k); } }, '#3f6a4e', 1);
    p.rect('#e2dccd', x - 3, 96, 30, 4);
  }
  p.vgrad(0, 0, p.w, 6, '#cfc8b8', '#fbf8f0');
}

/** A villa's shaded loggia: round arches open on a cool terrace with glass doors behind. */
export function villaArcade(p) {
  p.base('#fbf8f0');
  for (let i = 0; i < 2; i += 1) {
    const x = i * 56 + 8;
    const arch = (c) => {
      c.moveTo(x, 112);
      c.lineTo(x, 36);
      c.arc(x + 20, 36, 20, Math.PI, 0);
      c.lineTo(x + 40, 112);
      c.closePath();
    };
    p.shape(arch, '#6e5a4a', 'keep');
    p.vgrad(x + 6, 50, 28, 62, '#3c4850', '#28323a', 'keep');
    p.lightGrad(x + 6, 50, 28, 62, '#ffe0b0', '#d89a5a');
    p.rect('#e8e2d4', x + 19, 50, 2, 62, 'keep');
    p.vgrad(x, 16, 40, 30, 'rgba(40,30,20,0.55)', 'rgba(40,30,20,0)', null);
    p.shape((c) => c.arc(x + 4, 106, 6, 0, Math.PI * 2), '#4e7a3a', 'keep');
  }
  p.rect('#efe8da', 0, 0, p.w, 6);
}

/** Al Wadi render: aluminium windows, half-drawn shutters, AC boxes and their drip stains. */
export function flatsWindows(p) {
  const bw = p.w / 3;
  const sh = p.h / 2;
  p.base('#f4eee2');
  p.speckle(160, ['#e6decc', '#fbf8f0', '#dcd2bc'], 1, 4, 0.35);
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      const x = i * bw + 10;
      const y = j * sh + 10;
      p.rect('#c8ccce', x - 1.5, y - 1.5, 21, 31, 'keep');
      paneOfGlass(p, x, y, 18, 28, 'keep');
      p.rect('#d6d6d0', x - 2, y - 5, 22, 4, 'keep');
      const shutter = p.rng.next();
      if (shutter > 0.4) {
        const drop = 28 * (shutter - 0.3);
        p.rect('#b8b4aa', x, y, 18, drop, 'keep');
        for (let k = 2; k < drop; k += 2.5) p.rect('#9e9a90', x, y + k, 18, 0.7, 'keep');
        p.light('#000', x, y, 18, drop);
      }
      if (p.rng.chance(0.55)) {
        const ax = x + p.rng.next() * 6;
        p.rect('#ecece8', ax, y + 32, 12, 8, 'keep');
        p.shape((c) => c.arc(ax + 6, y + 36, 3, 0, Math.PI * 2), '#6a6e70', 'keep');
        p.vgrad(ax + 5, y + 40, 2, 14, 'rgba(110,90,60,0.45)', 'rgba(110,90,60,0)', null);
      }
    }
  }
}

/** Al Wadi balconies: dark recesses with railings, shade cloths and washing on the line. */
export function flatsBalconies(p) {
  const bw = p.w / 3;
  const sh = p.h / 2;
  p.base('#f2ebdc');
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      const x = i * bw + 3;
      const y = j * sh + 6;
      const w = bw - 6;
      p.rect('#4a4036', x, y, w, 44, 'keep');
      p.vgrad(x + 6, y + 6, 12, 38, '#3e4c54', '#252e34', 'keep');
      p.lightGrad(x + 6, y + 6, 12, 38, '#ffd9a0', '#d88a48');
      if (p.rng.chance(0.6)) {
        const cloth = p.rng.pick(['#2a9d8f', '#e76f51', '#3a6ea5', '#6a994e', '#c44536', '#e9c46a']);
        p.rect(cloth, x, y, w, 12, 'keep');
        p.rect('rgba(0,0,0,0.25)', x, y + 11, w, 2, 'keep');
      }
      if (p.rng.chance(0.5)) {
        for (let k = 0; k < 4; k += 1) p.rect(p.rng.pick(['#ffffff', '#e9c46a', '#e76f51', '#8ab4f8', '#f4a1c1']), x + 3 + k * 7, y + 16, 5, 7 + p.rng.next() * 5, 'keep');
      }
      p.rect('#e8e4dc', x, y + 30, w, 2, 'keep');
      for (let k = 0; k < w; k += 3) p.rect('#d8d4cc', x + k, y + 30, 1, 14, 'keep');
    }
    p.rect('#ddd4c2', 0, j * sh + sh - 4, p.w, 4);
  }
}

/** A row of small shops: a faded sign band, glass fronts full of goods, one shutter half down. */
export function shopStrip(p) {
  const bw = p.w / 3;
  p.base('#f2ece0');
  p.rect('#e2d8c6', 0, 0, p.w, 24);
  for (let i = 0; i < 3; i += 1) {
    let x = i * bw + 8;
    while (x < i * bw + bw - 10) {
      const lw = 3 + p.rng.next() * 4;
      p.rect('rgba(70,55,40,0.55)', x, 8, lw, 9, null);
      x += lw + 1.5 + (p.rng.chance(0.2) ? 4 : 0);
    }
  }
  p.rect('#bdb2a0', 0, 24, p.w, 3);
  for (let i = 0; i < 3; i += 1) {
    const x = i * bw + 3;
    shopWindow(p, x, 30, bw - 6, 74);
    if (p.rng.chance(0.4)) {
      const drop = 20 + p.rng.next() * 40;
      p.rect('#b9b5ab', x, 30, bw - 6, drop, 'keep');
      for (let k = 2; k < drop; k += 2.5) p.rect('#9a968c', x, 30 + k, bw - 6, 0.7, 'keep');
      p.light('#000', x, 30, bw - 6, drop);
    }
  }
  p.rect('#d6ccb8', 0, 104, p.w, 8);
}

/** Motel rooms along a gallery: bright doors, curtained windows, a lamp between. */
export function motelDoors(p) {
  p.base('#f6efe2');
  p.speckle(80, ['#ece2d0', '#fffaf0'], 1, 3, 0.35);
  for (let i = 0; i < 2; i += 1) {
    const x = i * 56;
    const door = i === 0 ? '#2c9c98' : '#e0714f';
    p.rect('#e0d6c4', x + 7, 28, 16, 84);
    p.rect(door, x + 8, 30, 14, 82, 'keep');
    p.rect('#ffffff', x + 13, 40, 4, 3, 'keep');
    p.shape((c) => c.arc(x + 19, 74, 1.5, 0, Math.PI * 2), '#d8b24a', 'keep');
    p.rect('#ddd2bc', x + 29, 33, 23, 49);
    paneOfGlass(p, x + 30, 34, 21, 47, 'keep');
    p.rect('#ead2b0', x + 30, 34, 8, 47, 'keep');
    p.light('#c88a50', x + 30, 34, 8, 47);
    p.rect('#ffe7a8', x + 25, 22, 3, 5, 'keep');
    p.light('#ffe7a8', x + 24, 21, 5, 7);
  }
  p.rect('#d9cdb6', 0, 0, p.w, 5);
}
