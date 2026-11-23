// The painters of the facade atlas: one function per tile, each drawing a seamless repeat of a
// Port Sarab facade (so many metres wide, so many storeys high) with canvas brushes. Light neutral
// tones take each building's tint; doors, shutters, awnings, goods and signs keep their own colours,
// and the glow layer holds what lights up after dark.

/** Teal-gold curtain wall: square panes on a slim mullion grid, four bays by four storeys. */
export function glassGrid(p) {
  const bw = p.w / 4;
  const sh = p.h / 4;
  p.base('#e8eef0');
  for (let j = 0; j < 4; j += 1) {
    const y = j * sh;
    p.rect('#c3cdd1', 0, y + sh - 6, p.w, 6);
    p.rect('#f7f9fa', 0, y + sh - 6, p.w, 1);
    for (let i = 0; i < 4; i += 1) {
      const x = i * bw;
      paneOfGlass(p, x + 2, y + 2, bw - 4, sh - 9);
      p.rect('#d4dcdf', x + bw / 2 - 0.5, y + 2, 1, sh - 9);
    }
  }
  glassReflectionStreaks(p);
}

/** Ribbon windows: continuous glass bands between pale spandrels, the classic office look. */
export function glassRibbon(p) {
  const sh = p.h / 4;
  p.base('#e9e6de');
  for (let j = 0; j < 4; j += 1) {
    const y = j * sh;
    paneOfGlass(p, 0, y + 1, p.w, sh - 10);
    for (let i = 0; i < 8; i += 1) p.rect('#c9d0d2', i * (p.w / 8), y + 1, 1, sh - 10);
    p.rect('#a9a59c', 0, y + sh - 9, p.w, 2);
    p.rect('#f6f3ec', 0, y + sh - 7, p.w, 1);
  }
  glassReflectionStreaks(p);
}

/** Deep vertical fins: narrow panes between lit-and-shaded blades, seven bays across. */
export function glassFins(p) {
  const bays = 7;
  const bw = p.w / bays;
  const sh = p.h / 4;
  p.base('#dfe6e8');
  for (let j = 0; j < 4; j += 1) {
    const y = j * sh;
    for (let i = 0; i < bays; i += 1) paneOfGlass(p, i * bw + 4, y + 1, bw - 4, sh - 4);
    p.rect('#9aa6ab', 0, y + sh - 3, p.w, 3);
  }
  for (let i = 0; i < bays; i += 1) {
    p.rect('#fbfcfc', i * bw, 0, 2, p.h);
    p.rect('#b5bec2', i * bw + 2, 0, 2, p.h);
  }
  glassReflectionStreaks(p);
}

/** Seamless glass: big panes, hairline joints, all reflection. */
export function glassSeamless(p) {
  const sh = p.h / 4;
  for (let j = 0; j < 4; j += 1) {
    const y = j * sh;
    paneOfGlass(p, 0, y, p.w, sh);
    p.rect('#aebdc4', 0, y + sh - 2, p.w, 1.5);
  }
  for (let i = 0; i < 4; i += 1) p.rect('#9fb0b8', i * (p.w / 4), 0, 1, p.h);
  glassReflectionStreaks(p, 0.22);
}

/** Stone office grid: deep-set windows punched in a pale limestone frame. */
export function officePunched(p) {
  const bw = p.w / 4;
  const sh = p.h / 4;
  p.base('#f5f1e8');
  p.speckle(120, ['#ebe5d8', '#fbf9f4'], 1, 3, 0.3);
  for (let j = 0; j < 4; j += 1) {
    for (let i = 0; i < 4; i += 1) {
      const x = i * bw + 4;
      const y = j * sh + 3;
      p.rect('#a89e8e', x - 1.5, y - 1.5, 21.5, 1.5);
      p.rect('#c4bbac', x - 1.5, y, 1.5, 21);
      paneOfGlass(p, x, y, 20, 21, 'keep');
      p.rect('#dfe6e8', x + 10, y, 1, 21, 'keep');
      p.rect('#ffffff', x - 1.5, y + 21, 23, 1);
    }
  }
}

/** Art-deco stepped-tower skin: bold stone piers, gold chevron spandrels, tall narrow windows. */
export function decoFins(p) {
  const bw = p.w / 4;
  const sh = p.h / 4;
  p.base('#ece3d0');
  for (let j = 0; j < 4; j += 1) {
    for (let i = 0; i < 4; i += 1) {
      const x = i * bw;
      const y = j * sh;
      paneOfGlass(p, x + 9, y + 3, 17, 18, 'keep');
      p.rect('#d9c9a4', x + 9, y + 21, 17, 6);
      p.line((c) => {
        for (let k = 0; k < 3; k += 1) {
          c.moveTo(x + 9 + k * 6, y + 22);
          c.lineTo(x + 12 + k * 6, y + 26);
          c.lineTo(x + 15 + k * 6, y + 22);
        }
      }, '#a88d5a', 1);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const x = i * bw;
    p.rect('#fbf6ea', x, 0, 2, p.h);
    p.rect('#efe7d6', x + 2, 0, 3, p.h);
    p.rect('#c8bca4', x + 5, 0, 2, p.h);
  }
}

/** Street-level podium: white stone pilasters, a fascia, two lit shop windows and a door. */
export function podiumShops(p) {
  p.base('#f1eadc');
  p.rect('#d9cfbd', 0, 18, p.w, 2);
  p.rect('#fbf7ee', 0, 20, p.w, 1);
  for (let b = 0; b < 2; b += 1) {
    const x = b * 56;
    p.rect('#e2d8c4', x, 22, 5, 90);
    p.rect('#fbf7ee', x + 5, 22, 1, 90);
    const gx = x + 8;
    const gw = b === 0 ? 45 : 30;
    shopWindow(p, gx, 25, gw, 80);
    if (b === 1) {
      p.vgrad(x + 41, 32, 13, 74, '#4e5c62', '#232b2f', 'keep');
      p.rect('#c8c2b4', x + 47, 32, 1, 74, 'keep');
      p.lightGrad(x + 41, 32, 13, 74, '#ffe8bc', '#c89058');
    }
  }
  p.rect('#d4c9b4', 0, 106, p.w, 6);
}

/** A tower lobby: double-height glass, a warm lit ceiling, the reception desk and a revolving door. */
export function lobbyGlass(p) {
  p.base('#e8eef0');
  p.vgrad(2, 8, p.w - 4, p.h - 8, '#6e7e84', '#2a3236', 'keep');
  p.lightGrad(2, 8, p.w - 4, p.h - 8, '#fff1d2', '#d49a5c');
  p.rect('#3a3026', 30, 82, 52, 14, 'keep');
  p.light('#7a5030', 30, 82, 52, 14);
  p.rect('#e8eef0', 0, 40, p.w, 2);
  for (let i = 0; i <= 8; i += 1) p.rect('#e8eef0', i * 14, 8, 1.5, p.h - 8);
  p.shape((c) => c.arc(56, 112, 14, Math.PI, 0), '#1e2528', 'keep');
  p.rect('#fbf8f0', 0, 6, p.w, 2);
}

/** The wall behind a deep balcony: sliding glass doors, curtains, the slab's shadow above. */
export function balconyDeep(p) {
  const bw = p.w / 3;
  const sh = p.h / 2;
  p.base('#f4f2ec');
  for (let j = 0; j < 2; j += 1) {
    const y = j * sh;
    for (let i = 0; i < 3; i += 1) {
      const x = i * bw;
      p.vgrad(x + 5, y + 7, bw - 7, sh - 9, '#6c8890', '#2c3c44', 'tint');
      p.lightGrad(x + 5, y + 7, bw - 7, sh - 9, '#ffe2b4', '#e8a868');
      p.rect('#f4f2ec', x + 5 + (bw - 7) / 2, y + 7, 1.5, sh - 9);
      if (p.rng.chance(0.6)) {
        const left = p.rng.chance(0.5);
        const cw = 6 + p.rng.next() * 7;
        p.rect('#efe4cc', left ? x + 5 : x + bw - 2 - cw, y + 7, cw, sh - 9, 'keep');
        p.light('#c88850', left ? x + 5 : x + bw - 2 - cw, y + 7, cw, sh - 9);
      }
    }
    p.vgrad(0, y, p.w, 7, '#7c7a74', '#c8c6be');
  }
}

/** A balcony's front edge: the white slab and the glass rail above it, repeated along a tower. */
export function balconyRail(p) {
  p.base('#f8f8f5');
  p.vgrad(0, 8, p.w, 54, '#d9efec', '#b7d6d3');
  p.light('#5a5a5a', 0, 8, p.w, 54);
  p.rect('#ffffff', 0, 0, p.w, 6);
  p.rect('#9aa8a8', 0, 6, p.w, 2);
  for (let i = 0; i < 3; i += 1) p.rect('#e6eeee', i * (p.w / 3), 8, 2, 54);
  p.rect('#d2d4d0', 0, 62, p.w, 2);
  p.rect('#b5b7b0', 0, 106, p.w, 6);
}

/** White apartment wall: tall windows, some with louvred shutters folded back. */
export function apartmentWindows(p) {
  const bw = p.w / 3;
  const sh = p.h / 2;
  p.base('#f5f3ee');
  p.speckle(120, ['#ebe7de', '#fbfaf7'], 1, 4, 0.4);
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      const x = i * bw + 9;
      const y = j * sh + 10;
      p.rect('#d9d6ce', x - 1, y - 1, 21, 36);
      paneOfGlass(p, x, y, 19, 34);
      p.rect('#eeeeea', x + 9, y, 1, 34);
      if (p.rng.chance(0.5)) {
        p.rect('#cfd6d4', x - 7, y, 6, 34, 'keep');
        p.rect('#cfd6d4', x + 20, y, 6, 34, 'keep');
        p.line((c) => { for (let k = 2; k < 34; k += 3) { c.moveTo(x - 7, y + k); c.lineTo(x - 1, y + k); c.moveTo(x + 20, y + k); c.lineTo(x + 26, y + k); } }, '#9fa8a6', 0.8);
      }
    }
    p.rect('#e1ded6', 0, j * sh + sh - 3, p.w, 3);
  }
}

/** A sky garden: a double-height open floor with trees and warm light behind white columns. */
export function skyGarden(p) {
  p.base('#f4f2ec');
  p.vgrad(0, 6, p.w, p.h - 12, '#4a463c', '#2e2c26', 'keep');
  p.lightGrad(0, 6, p.w, 20, '#ffdca0', '#5a3818');
  for (let i = 0; i < 26; i += 1) {
    const x = p.rng.next() * p.w;
    const r = 6 + p.rng.next() * 12;
    const fill = p.rng.pick(['#5f8f3e', '#4b7a34', '#79a84a', '#3e6a2e']);
    p.shape((c) => c.arc(x, 82 - p.rng.next() * 20, r, 0, Math.PI * 2), fill, 'keep');
  }
  for (let i = 0; i < 4; i += 1) p.rect('#f4f2ec', i * 28, 6, 4, p.h - 12);
  p.rect('#c9c6be', 0, p.h - 8, p.w, 8);
}

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
  p.line((c) => c.moveTo(56, 8) || c.lineTo(56, 112), '#7a7a76', 2);
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

/** Lantern Row hotel: framed balconies in the hotel's colour, glass doors, white slab edges. */
export function hotelBalconies(p) {
  const bw = p.w / 4;
  const sh = p.h / 2;
  p.base('#f6f2ee');
  for (let j = 0; j < 2; j += 1) {
    for (let i = 0; i < 4; i += 1) {
      const x = i * bw;
      const y = j * sh;
      p.vgrad(x + 5, y + 4, bw - 6, sh - 12, '#4a5a64', '#232c32', 'keep');
      p.lightGrad(x + 5, y + 4, bw - 6, sh - 12, '#ffe6b8', '#e09a58');
      p.rect('#dfe8ea', x + 5 + (bw - 6) / 2, y + 4, 1, sh - 12, 'keep');
      p.rect('#fafaf8', x + 4, y + 34, bw - 4, 1.5, 'keep');
      for (let k = 0; k < 4; k += 1) p.rect('#fafaf8', x + 6 + k * 6, y + 34, 1, 10, 'keep');
      p.rect('#ffffff', x, y + sh - 8, bw, 8, 'keep');
      p.rect('#b8b4ae', x, y + sh - 1, bw, 1, 'keep');
    }
  }
  for (let i = 0; i < 4; i += 1) p.rect('#e4dcd6', i * bw, 0, 4, p.h);
}

/** Hotel glass: coloured glazing in a staggered pattern of wide and narrow panes. */
export function hotelGlass(p) {
  const bw = p.w / 4;
  const sh = p.h / 4;
  p.base('#ece6de');
  for (let j = 0; j < 4; j += 1) {
    for (let i = 0; i < 4; i += 1) {
      const x = i * bw;
      const y = j * sh;
      const split = j % 2 === 0 ? 10 : 18;
      paneOfGlass(p, x + 1, y + 1, split - 1, sh - 5);
      paneOfGlass(p, x + split + 1, y + 1, bw - split - 2, sh - 5);
    }
    p.rect('#fbf8f4', 0, j * sh + sh - 4, p.w, 2);
  }
  glassReflectionStreaks(p, 0.16);
}

/** Night-club cladding: dark panels with a geometric inlay that takes the club's colour. */
export function clubPanels(p) {
  p.base('#2a2234', 'keep');
  const stroke = (trace, width) => {
    for (const [ctx, fill] of [[p.c, '#f4f0f8'], [p.m, '#ffffff']]) {
      ctx.save();
      ctx.beginPath();
      trace(ctx);
      ctx.strokeStyle = fill;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();
    }
  };
  stroke((c) => {
    for (let k = -1; k <= 2; k += 1) {
      c.moveTo(k * 56, 0);
      c.lineTo(k * 56 + 28, 56);
      c.lineTo(k * 56 + 56, 0);
      c.moveTo(k * 56, 112);
      c.lineTo(k * 56 + 28, 56);
      c.lineTo(k * 56 + 56, 112);
    }
  }, 2.5);
  p.rect('#3a3048', 0, 54, p.w, 4, 'keep');
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

/** The Vane Spire's vault crown: a glowing diamond lattice of gold. */
export function vaultLattice(p) {
  p.base('#ffffff', 'cut');
  const bars = (c) => {
    for (let k = -2; k <= 2; k += 1) {
      c.moveTo(k * 56, 0);
      c.lineTo(k * 56 + 112, 112);
      c.moveTo(k * 56 + 112, 0);
      c.lineTo(k * 56, 112);
    }
  };
  for (const [ctx, fill] of [[p.c, '#ffffff'], [p.m, '#ffffff']]) {
    ctx.save();
    ctx.beginPath();
    bars(ctx);
    ctx.strokeStyle = fill;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
  }
  p.rect('#ffffff', 0, 0, p.w, 5);
  p.rect('#ffffff', 0, 107, p.w, 5);
  p.g.save();
  p.g.beginPath();
  bars(p.g);
  p.g.strokeStyle = '#e88a10';
  p.g.lineWidth = 6;
  p.g.shadowColor = '#c86a00';
  p.g.shadowBlur = 6;
  p.g.stroke();
  p.g.restore();
}

/** A rooftop helipad: the yellow ring, the white H and a circle of landing lights. */
export function helipad(p) {
  p.base('#3e4246', 'keep');
  p.rect('#e9e9e4', 2, 2, p.w - 4, 3, 'keep');
  p.rect('#e9e9e4', 2, p.h - 5, p.w - 4, 3, 'keep');
  p.rect('#e9e9e4', 2, 2, 3, p.h - 4, 'keep');
  p.rect('#e9e9e4', p.w - 5, 2, 3, p.h - 4, 'keep');
  p.c.save();
  p.c.beginPath();
  p.c.arc(56, 56, 40, 0, Math.PI * 2);
  p.c.strokeStyle = '#f2c014';
  p.c.lineWidth = 5;
  p.c.stroke();
  p.c.restore();
  p.rect('#f4f4f0', 38, 34, 9, 44, 'keep');
  p.rect('#f4f4f0', 65, 34, 9, 44, 'keep');
  p.rect('#f4f4f0', 47, 52, 18, 8, 'keep');
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2;
    const x = 56 + Math.cos(a) * 47;
    const y = 56 + Math.sin(a) * 47;
    p.lightShape((c) => c.arc(x, y, 2.5, 0, Math.PI * 2), '#8fd8ff', 3);
  }
}

/** The great face of the Sundial Tower: a cream dial, a gold ring, hour lines and a sun at its heart. */
export function sundialFace(p) {
  p.base('#efe2c6');
  plasterMottling(p);
  p.shape((c) => c.arc(56, 56, 52, 0, Math.PI * 2), '#c9962e', 'keep');
  p.shape((c) => c.arc(56, 56, 48, 0, Math.PI * 2), '#f6ecd4', 'keep');
  p.lightShape((c) => c.arc(56, 56, 48, 0, Math.PI * 2), '#6a5432');
  p.line((c) => {
    for (let k = 0; k < 24; k += 1) {
      const a = (k / 24) * Math.PI * 2;
      const r0 = k % 2 === 0 ? 26 : 38;
      c.moveTo(56 + Math.cos(a) * r0, 56 + Math.sin(a) * r0);
      c.lineTo(56 + Math.cos(a) * 45, 56 + Math.sin(a) * 45);
    }
  }, '#5a4630', 2);
  p.shape((c) => c.arc(56, 56, 12, 0, Math.PI * 2), '#e0a83a', 'keep');
  p.line((c) => {
    for (let k = 0; k < 12; k += 1) {
      const a = (k / 12) * Math.PI * 2;
      c.moveTo(56 + Math.cos(a) * 13, 56 + Math.sin(a) * 13);
      c.lineTo(56 + Math.cos(a) * 20, 56 + Math.sin(a) * 20);
    }
  }, '#c9962e', 2.5);
  p.lightShape((c) => c.arc(56, 56, 13, 0, Math.PI * 2), '#ffcf70', 6);
}

/** Sarab General's emblem: a teal crescent cradling a wave on a white disc. */
export function hospitalEmblem(p) {
  p.base('#fbfbfb', 'keep');
  p.shape((c) => c.arc(56, 56, 50, 0, Math.PI * 2), '#1ba39c', 'keep');
  p.shape((c) => c.arc(56, 56, 44, 0, Math.PI * 2), '#ffffff', 'keep');
  p.shape((c) => {
    c.arc(56, 56, 36, Math.PI * 0.15, Math.PI * 0.85);
    c.arc(56, 40, 30, Math.PI * 0.92, Math.PI * 0.08, true);
    c.closePath();
  }, '#1ba39c', 'keep');
  p.line((c) => {
    c.moveTo(26, 50);
    c.bezierCurveTo(36, 36, 46, 64, 56, 50);
    c.bezierCurveTo(66, 36, 76, 64, 86, 50);
  }, '#1ba39c', 6);
  p.lightShape((c) => c.arc(56, 56, 50, 0, Math.PI * 2), '#0c4a46');
  p.lightShape((c) => {
    c.arc(56, 56, 36, Math.PI * 0.15, Math.PI * 0.85);
    c.arc(56, 40, 30, Math.PI * 0.92, Math.PI * 0.08, true);
    c.closePath();
  }, '#5ff0e4', 4);
}

/** The PSPD crest: a night-blue shield edged in gold, a falcon's chevrons and a star. */
export function policeCrest(p) {
  p.base('#16264a', 'keep');
  const shield = (inset) => (c) => {
    c.moveTo(18 + inset, 12 + inset);
    c.lineTo(94 - inset, 12 + inset);
    c.lineTo(94 - inset, 58);
    c.quadraticCurveTo(94 - inset, 92 - inset, 56, 104 - inset);
    c.quadraticCurveTo(18 + inset, 92 - inset, 18 + inset, 58);
    c.closePath();
  };
  p.shape(shield(0), '#e9b44c', 'keep');
  p.shape(shield(5), '#1f3a6e', 'keep');
  p.line((c) => {
    for (let k = 0; k < 3; k += 1) {
      c.moveTo(32, 54 + k * 12);
      c.lineTo(56, 70 + k * 12);
      c.lineTo(80, 54 + k * 12);
    }
  }, '#e9b44c', 4);
  p.shape((c) => star(c, 56, 36, 13, 5.5), '#fff4d6', 'keep');
  p.lightShape(shield(0), '#8a6420');
  p.lightShape(shield(5), '#0a1430');
  p.lightShape((c) => star(c, 56, 36, 13, 5.5), '#fff0c0', 5);
}

/** Glazed mosaic for the odd Old Sarab dome. */
export function tiledDome(p) {
  p.base('#d0d8d8');
  for (let y = 0; y < p.h; y += 7) {
    for (let x = 0; x < p.w; x += 7) {
      p.rect(p.rng.pick(['#f6fbfb', '#e8f2f2', '#ffffff', '#dcebea']), x + 0.6, y + 0.6, 5.8, 5.8);
    }
  }
}

/** Flat white for trims, slabs and posts. */
export function plain(p) {
  p.base('#f7f7f5');
  p.speckle(30, ['#efefec', '#ffffff'], 1, 4, 0.4);
}

/** Roof gravel and membrane. */
export function roofGravel(p) {
  p.base('#dcd6ca');
  p.speckle(500, ['#bfb7a8', '#ece8e0', '#a89f90', '#f4f0e8'], 0.8, 1.8, 0.7);
}

/** Dressed limestone courses with staggered joints. */
export function stone(p) {
  p.base('#f1e9da');
  p.speckle(80, ['#e8decc', '#f8f2e6'], 1, 3, 0.35);
  for (let r = 0; r < 4; r += 1) {
    const y = r * 14;
    p.rect('#dcd0bb', 0, y + 13, p.w, 1);
    const offset = r % 2 === 0 ? 0 : 14;
    for (let x = offset; x < p.w + 28; x += 28) p.rect('#dcd0bb', x % p.w, y, 1, 13);
  }
}

/** Brushed metal cladding for crowns, exoskeletons and plant rooms. */
export function metalPanel(p) {
  p.vgrad(0, 0, p.w, p.h, '#eef0f2', '#d0d4d8');
  for (let k = 0; k < 2; k += 1) {
    p.rect('#a8aeb4', k * 28, 0, 1, p.h);
    p.rect('#a8aeb4', 0, k * 28, p.w, 1);
    p.rect('#ffffff', k * 28 + 1, 0, 1, p.h);
  }
}

/** Rooftop pool water: turquoise with dancing caustics; its underwater lights glow at night. */
export function poolWater(p) {
  p.vgrad(0, 0, p.w, p.h, '#38c4cf', '#1c9cae', 'keep');
  p.line((c) => {
    for (let k = 0; k < 7; k += 1) {
      const y = k * 8 + 3;
      c.moveTo(0, y);
      for (let x = 0; x <= p.w; x += 7) c.lineTo(x, y + Math.sin((x + k * 11) * 0.35) * 2.5);
    }
  }, '#a8f4f4', 1.2, 0.55);
  p.light('#123c48', 0, 0, p.w, p.h);
}

/** Leaves in their own greens, dotted with blossom that takes the tint (pink makes bougainvillea). */
export function greenery(p) {
  p.base('#4e7a34', 'keep');
  const blob = (fill, mode, count, rMin, rMax) => {
    for (let i = 0; i < count; i += 1) {
      const x = p.rng.next() * p.w;
      const y = p.rng.next() * p.h;
      const r = rMin + p.rng.next() * (rMax - rMin);
      const color = Array.isArray(fill) ? p.rng.pick(fill) : fill;
      for (const [ox, oy] of [[0, 0], [-p.w, 0], [p.w, 0], [0, -p.h], [0, p.h]]) p.shape((c) => c.arc(x + ox, y + oy, r, 0, Math.PI * 2), color, mode);
    }
  };
  blob(['#6a9a44', '#3e6a2a', '#82b052', '#5a8a3a'], 'keep', 60, 2, 5);
  blob(['#ffffff', '#e8e8e8'], 'tint', 28, 1.5, 3.5);
}

/** Striped souk awning cloth with a scalloped hem. */
export function awningStripes(p) {
  p.base('#ffffff');
  for (let x = 0; x < p.w; x += 14) p.rect('#f4ead6', x + 7, 0, 7, p.h, 'keep');
  p.rect('#ffffff', 0, 46, p.w, 10, 'cut');
  for (let x = 0; x < p.w; x += 7) {
    p.shape((c) => { c.moveTo(x, 46); c.arc(x + 3.5, 46, 3.5, Math.PI, 0); c.lineTo(x + 7, 46); c.lineTo(x + 7, 50); c.arc(x + 3.5, 50, 3.5, 0, Math.PI); c.closePath(); }, x % 14 < 7 ? '#ffffff' : '#f4ead6', x % 14 < 7 ? 'tint' : 'keep');
  }
  p.rect('rgba(0,0,0,0.12)', 0, 0, p.w, 2, null);
}

/** Barrel roof tiles in rows. */
export function terracotta(p) {
  p.base('#d98a5e');
  for (let x = 0; x < p.w; x += 7) {
    p.rect('#e8a47c', x + 2, 0, 3, p.h);
    p.rect('#b8683e', x, 0, 1, p.h);
  }
  for (let y = 0; y < p.h; y += 7) p.rect('rgba(90,40,20,0.35)', 0, y, p.w, 1.5, null);
  p.speckle(40, ['#c07040', '#f0b090'], 1, 3, 0.4);
}

/** A neon tube or LED strip: white, glowing in whatever colour it is tinted. */
export function neonTube(p) {
  p.base('#ffffff');
  p.light('#ffffff', 0, 0, p.w, p.h);
}

/** Yellow-and-black hazard striping. */
export function hazard(p) {
  hazardStripes(p, 0, 0, p.w, p.h);
}

/** Crown lighting: pale metal with three bright LED bands. */
export function crownLights(p) {
  p.base('#e4e6e8');
  for (let k = 0; k < 3; k += 1) {
    p.rect('#ffffff', 0, k * 19 + 6, p.w, 4);
    p.light('#ffffff', 0, k * 19 + 6, p.w, 4);
    p.light('#555555', 0, k * 19 + 4, p.w, 8);
  }
}

/** Plain dark glass for lift cores, bridges and canopies. */
export function darkGlass(p) {
  p.vgrad(0, 0, p.w, p.h, '#74888f', '#33424a');
  p.light('#7a7a7a', 0, 0, p.w, p.h);
  p.rect('#a9b6bc', 0, 27, p.w, 1);
}

/** Solar panels on Al Wadi and villa roofs. */
export function solarPanel(p) {
  p.base('#c8ccd0', 'keep');
  p.rect('#1f2f4f', 2, 2, p.w - 4, p.h - 4, 'keep');
  for (let k = 1; k < 4; k += 1) p.rect('#6a7fa8', 2 + k * 13, 2, 1, p.h - 4, 'keep');
  for (let k = 1; k < 6; k += 1) p.rect('#6a7fa8', 2, 2 + k * 9, p.w - 4, 1, 'keep');
  p.light('#5a5a5a', 2, 2, p.w - 4, p.h - 4);
}

/** Board-marked concrete with form-tie holes. */
export function concrete(p) {
  p.base('#dedcd6');
  p.speckle(160, ['#cfccc5', '#e8e6e0', '#c4c0b8'], 1, 3, 0.4);
  p.rect('#cfccc4', 0, 27, p.w, 1, null);
  for (let y = 14; y < p.h; y += 28) for (let x = 14; x < p.w; x += 28) p.shape((c) => c.arc(x, y, 0.9, 0, Math.PI * 2), '#b8b4ac');
}

/** Timber slats for pergolas and screens; the gaps are cut through. */
export function woodSlats(p) {
  p.base('#8a5a34', 'cut');
  for (let y = 0; y < p.h; y += 11) {
    p.rect('#8a5a34', 0, y, p.w, 7, 'keep');
    p.rect('#a8764a', 0, y, p.w, 1.5, 'keep');
    p.rect('#6a4224', 0, y + 6, p.w, 1, 'keep');
  }
}

/** Timber beam ends poking through a plaster band under an Old Sarab parapet. */
export function beamEnds(p) {
  p.base('#f1e7d6');
  plasterMottling(p);
  for (let k = 0; k < 2; k += 1) {
    const x = k * 28 + 10;
    p.rect('#3a2818', x + 1, 22, 9, 24, null);
    p.rect('#6a4426', x, 18, 9, 22, 'keep');
    p.rect('#8a5e38', x, 18, 9, 3, 'keep');
    p.vgrad(x, 40, 10, 12, 'rgba(70,50,30,0.35)', 'rgba(70,50,30,0)', null);
  }
}

// ---- shared brushes -------------------------------------------------------------------------

/** A pane of glass: sky reflected at the top, darker below; lit warm in the glow layer. */
function paneOfGlass(p, x, y, w, h, mode = 'tint') {
  if (mode === 'keep') p.vgrad(x, y, w, h, '#8fb0c0', '#2e4654', mode);
  else p.vgrad(x, y, w, h, '#90a9b3', '#3a525d', mode);
  p.lightGrad(x, y, w, h, '#ffe4b4', '#eda866');
  if (p.rng.chance(0.25)) {
    const blind = h * (0.2 + p.rng.next() * 0.5);
    p.rect('#b9c4c6', x, y, w, blind, mode);
    p.light('#c08c58', x, y, w, blind);
  }
  if (p.rng.chance(0.35)) p.light('#6a4020', x + w * p.rng.next() * 0.6, y + h * 0.62, w * 0.3, h * 0.38);
}

/** Faint diagonal sheens across a glass tile, wrapping at its edges. */
function glassReflectionStreaks(p, alpha = 0.13) {
  const c = p.c;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = '#ffffff';
  for (const ox of [-p.w, 0, p.w]) {
    c.beginPath();
    c.moveTo(ox + 10, p.h);
    c.lineTo(ox + 34, p.h);
    c.lineTo(ox + 84, 0);
    c.lineTo(ox + 60, 0);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(ox + 50, p.h);
    c.lineTo(ox + 58, p.h);
    c.lineTo(ox + 108, 0);
    c.lineTo(ox + 100, 0);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** A shop window: dark glass, shelves of bright goods, lit warm at night. */
function shopWindow(p, x, y, w, h) {
  p.vgrad(x, y, w, h, '#56646a', '#222a2e', 'keep');
  p.lightGrad(x, y, w, h, '#fff0cc', '#e8b070');
  for (let k = 0; k < 3; k += 1) p.rect('#8a8478', x, y + h * (0.35 + k * 0.22), w, 1, 'keep');
  for (let k = 0; k < Math.round(w / 3); k += 1) {
    const gx = x + p.rng.next() * (w - 4);
    const gy = y + h * (0.2 + p.rng.next() * 0.75);
    const fill = p.rng.pick(['#e76f51', '#2a9d8f', '#e9c46a', '#f4a261', '#8ab4f8', '#f4f1de', '#c44536']);
    p.rect(fill, gx, gy, 2 + p.rng.next() * 3, 3 + p.rng.next() * 4, 'keep');
  }
  p.rect('#d6d0c4', x, y, w, 1, 'keep');
}

/** A carved timber lattice screen over an upper window. */
function mashrabiya(p, x, y, w, h) {
  p.rect('#5e4028', x, y, w, h, 'keep');
  p.lightGrad(x, y, w, h, '#a86a30', '#6a3a18');
  for (let yy = y + 2; yy < y + h - 1; yy += 3) {
    for (let xx = x + 2; xx < x + w - 1; xx += 3) p.rect('#8a6440', xx, yy, 1.5, 1.5, 'keep');
  }
  p.rect('#7a5434', x - 1, y - 2, w + 2, 2, 'keep');
  p.rect('#7a5434', x - 1, y + h, w + 2, 2, 'keep');
}

/** Sun-bleached plaster mottling and a darker damp band near the foot of the tile. */
function plasterMottling(p) {
  p.speckle(220, ['#e4d6be', '#fbf4e6', '#d8c6a8', '#efe3cc'], 2, 9, 0.22);
  p.speckle(120, ['#cdb898', '#fffaf0'], 1, 2, 0.4);
}

function hazardStripes(p, x, y, w, h) {
  p.rect('#f2c014', x, y, w, h, 'keep');
  const c = p.c;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = '#1e1e1e';
  for (let k = -h; k < w + h; k += 10) {
    c.beginPath();
    c.moveTo(x + k, y + h);
    c.lineTo(x + k + 5, y + h);
    c.lineTo(x + k + 5 + h, y);
    c.lineTo(x + k + h, y);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function star(c, x, y, outer, inner) {
  for (let k = 0; k < 10; k += 1) {
    const r = k % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    if (k === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
}
