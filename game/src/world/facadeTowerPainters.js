// The skins of Port Sarab's towers, painted for the facade atlas: The Spires' curtain walls, stone
// office grids, art-deco piers, shop podiums and lobbies, Marina Crescent's balconies, sky gardens,
// and Lantern Row's hotel balconies, coloured glass and club panels. Each draws one seamless repeat.
import { paneOfGlass, glassReflectionStreaks, shopWindow } from './facadeBrushes.js';

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

/** Stone office grid: big windows set deep in a pale limestone frame. */
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
