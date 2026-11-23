// The shared brushes of the facade painters: a pane of glass that lights up at night, the sheen
// across a curtain wall, a shop window full of goods, a timber lattice screen, sun-bleached
// plaster mottling and hazard striping. Each draws through a tile painter from facadeTextures.js.

/** A pane of glass: sky reflected at the top, darker below; lit warm in the glow layer. */
export function paneOfGlass(p, x, y, w, h, mode = 'tint') {
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
export function glassReflectionStreaks(p, alpha = 0.13) {
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
export function shopWindow(p, x, y, w, h) {
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
export function mashrabiya(p, x, y, w, h) {
  p.rect('#5e4028', x, y, w, h, 'keep');
  p.lightGrad(x, y, w, h, '#a86a30', '#6a3a18');
  for (let yy = y + 2; yy < y + h - 1; yy += 3) {
    for (let xx = x + 2; xx < x + w - 1; xx += 3) p.rect('#8a6440', xx, yy, 1.5, 1.5, 'keep');
  }
  p.rect('#7a5434', x - 1, y - 2, w + 2, 2, 'keep');
  p.rect('#7a5434', x - 1, y + h, w + 2, 2, 'keep');
}

/** Sun-bleached plaster mottling. */
export function plasterMottling(p) {
  p.speckle(220, ['#e4d6be', '#fbf4e6', '#d8c6a8', '#efe3cc'], 2, 9, 0.22);
  p.speckle(120, ['#cdb898', '#fffaf0'], 1, 2, 0.4);
}

/** Yellow-and-black hazard striping in a rectangle. */
export function hazardStripes(p, x, y, w, h) {
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

/** Trace a five-pointed star (for crests). */
export function star(c, x, y, outer, inner) {
  for (let k = 0; k < 10; k += 1) {
    const r = k % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    if (k === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
}
