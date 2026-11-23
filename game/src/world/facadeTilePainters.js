// The landmark emblems and plain materials of the facade atlas: the Vane Spire's gold vault lattice,
// helipads, the Sundial Tower's dial, the hospital's emblem, the PSPD crest, mosaic domes, and the
// stone, metal, gravel, pool water, greenery, awnings, roof tiles, neon tubes and timber of the city.
import { hazardStripes, plasterMottling, star } from './facadeBrushes.js';

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
  const crescent = (c) => {
    c.arc(56, 56, 36, Math.PI * 0.15, Math.PI * 0.85);
    c.arc(56, 40, 30, Math.PI * 0.92, Math.PI * 0.08, true);
    c.closePath();
  };
  p.base('#fbfbfb', 'keep');
  p.shape((c) => c.arc(56, 56, 50, 0, Math.PI * 2), '#1ba39c', 'keep');
  p.shape((c) => c.arc(56, 56, 44, 0, Math.PI * 2), '#ffffff', 'keep');
  p.shape(crescent, '#1ba39c', 'keep');
  p.line((c) => {
    c.moveTo(26, 50);
    c.bezierCurveTo(36, 36, 46, 64, 56, 50);
    c.bezierCurveTo(66, 36, 76, 64, 86, 50);
  }, '#1ba39c', 6);
  p.lightShape((c) => c.arc(56, 56, 50, 0, Math.PI * 2), '#0c4a46');
  p.lightShape(crescent, '#5ff0e4', 4);
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

/** Dressed limestone in big courses with staggered joints. */
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

/** Board-marked concrete with sparse form-tie holes. */
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
