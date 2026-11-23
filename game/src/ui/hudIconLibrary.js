// The drawn icons of the KHAMSIN interface, all inline SVG written by hand: the eight-pointed
// star (two overlapped squares) that marks wanted levels, the compass and the ornaments, weapon
// silhouettes for the HUD and the weapon wheel, and the sun, moon and sandstorm of the clock.

/**
 * SVG path data of an eight-pointed star (the outline of two squares turned 45 degrees apart).
 * @param {number} cx @param {number} cy @param {number} radius  tip radius
 */
export function eightPointStarPath(cx, cy, radius) {
  const inner = radius * 0.7654;
  let d = '';
  for (let i = 0; i < 16; i += 1) {
    const r = i % 2 === 0 ? radius : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 8;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(angle) * r).toFixed(2)} ${(cy + Math.sin(angle) * r).toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Trace the same star on a 2D canvas context (call fill or stroke after). */
export function traceEightPointStar(ctx, cx, cy, radius) {
  const inner = radius * 0.7654;
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const r = i % 2 === 0 ? radius : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 8;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** A small star ornament as an inline SVG string (for titles and rules). */
export function starOrnamentSvg(className = 'star-ornament') {
  return `<svg class="${className}" viewBox="0 0 20 20" aria-hidden="true"><path d="${eightPointStarPath(10, 10, 9.5)}"/><circle cx="10" cy="10" r="2.6" class="star-ornament-eye"/></svg>`;
}

/**
 * The weapon silhouette for a weapon class, as an SVG string drawn in currentColor.
 * Classes: fists, melee, pistol, smg, rifle, shotgun, sniper, launcher, thrown.
 */
export function weaponIconSvg(weaponClass) {
  const body = WEAPON_SHAPES[weaponClass] || WEAPON_SHAPES.pistol;
  return `<svg class="weapon-glyph" viewBox="0 0 64 32" aria-hidden="true">${body}</svg>`;
}

/** Work out a weapon's class from its catalogue entry or, failing that, from words in its id. */
export function weaponClassOf(spec, id) {
  const declared = spec && (spec.model || spec.className || spec.class || spec.kind || spec.category || spec.type);
  if (declared && WEAPON_SHAPES[declared]) return declared;
  if (declared === 'bat' || declared === 'knife' || declared === 'blade') return 'melee';
  const text = `${declared || ''} ${id || ''} ${spec?.name || ''}`.toLowerCase();
  if (!id || text.includes('fist') || text.includes('unarmed')) return 'fists';
  if (text.includes('snip') || text.includes('marksman')) return 'sniper';
  if (text.includes('shot') || text.includes('scatter')) return 'shotgun';
  if (text.includes('smg') || text.includes('sub')) return 'smg';
  if (text.includes('rifle') || text.includes('carbine') || text.includes('assault')) return 'rifle';
  if (text.includes('rocket') || text.includes('launch') || text.includes('rpg')) return 'launcher';
  if (text.includes('grenade') || text.includes('flash') || text.includes('molotov') || text.includes('bomb')) return 'thrown';
  if (text.includes('knife') || text.includes('bat') || text.includes('club') || text.includes('blade') || text.includes('wrench') || text.includes('melee')) return 'melee';
  return 'pistol';
}

/** Clock and weather glyphs: 'sun', 'moon', 'sandstorm', 'dusk'. */
export function skyIconSvg(kind) {
  if (kind === 'moon') {
    return '<svg class="sky-glyph sky-glyph--moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.2a8.6 8.6 0 1 0 5.3 14.6A7.2 7.2 0 0 1 15.5 3.2z"/></svg>';
  }
  if (kind === 'sandstorm') {
    return '<svg class="sky-glyph sky-glyph--storm" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 7.5c3-2 5.5 1.6 9 0s5-2.4 8-.6M4 12.5c3-2 5.5 1.6 9 0s5-2.4 9-.4M2 17.5c3-2 5.5 1.6 9 0s5-2.4 8-.6" fill="none" stroke-width="2.3" stroke-linecap="round"/></svg>';
  }
  if (kind === 'dusk') {
    return `<svg class="sky-glyph sky-glyph--dusk" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16a7 7 0 0 1 14 0z"/>${sunRays(12, 16, 9.2, 11.8, [-150, -120, -90, -60, -30])}<rect x="2" y="18" width="20" height="2" rx="1"/></svg>`;
  }
  return `<svg class="sky-glyph sky-glyph--sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.6"/>${sunRays(12, 12, 7.4, 10.6, [0, 45, 90, 135, 180, 225, 270, 315])}</svg>`;
}

/** A plain glyph by name: 'health', 'armor', 'phone', 'car', 'cash', 'radio', 'pin', 'check'. */
export function glyphSvg(name, className = 'glyph') {
  const body = GLYPHS[name] || GLYPHS.pin;
  return `<svg class="${className} ${className}--${name}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

function sunRays(cx, cy, r0, r1, degrees) {
  let d = '';
  for (const degree of degrees) {
    const a = (degree * Math.PI) / 180;
    d += `M${(cx + Math.cos(a) * r0).toFixed(2)} ${(cy + Math.sin(a) * r0).toFixed(2)}L${(cx + Math.cos(a) * r1).toFixed(2)} ${(cy + Math.sin(a) * r1).toFixed(2)}`;
  }
  return `<path d="${d}" fill="none" stroke-width="2.2" stroke-linecap="round"/>`;
}

const WEAPON_SHAPES = {
  fists:
    '<path d="M18 9c0-2.2 1.8-3.6 3.9-3.6s3.7 1.4 3.7 3.6V8c0-2.2 1.8-3.6 3.9-3.6S33.3 5.8 33.3 8v.6c0-2.2 1.8-3.6 3.9-3.6s3.8 1.4 3.8 3.6v1.6c.2-2 1.9-3.2 3.8-3.2 2.1 0 3.7 1.5 3.7 3.7v8.6c0 6.6-5.3 10.7-12.3 10.7h-6.6c-5.4 0-9.5-2.6-11.2-6.6l-2.6-6.2c-.8-1.9.1-4 2-4.6 1.4-.5 2.9 0 3.8 1.2l.4.6z"/><path d="M23 18.5h16" fill="none" stroke="rgba(14,27,42,.55)" stroke-width="1.6" stroke-linecap="round"/>',
  melee:
    '<path d="M4 18.5 40 12.6l3.2 1.4-.2 4.3L4.6 21.6c-1.6.2-2.4-2.8-.6-3.1z"/><rect x="42.5" y="11" width="4" height="10" rx="1.2"/><path d="M46.5 13.4h12.2c1.6 0 2.8 1.2 2.8 2.6s-1.2 2.6-2.8 2.6H46.5z"/>',
  pistol:
    '<path d="M12 7h37.5c1.4 0 2.5 1.1 2.5 2.5V15H12z"/><path d="M14 15h17l-1.6 3.4H25c-1 0-1.8.7-2 1.6l-1.8 8H11.6c-1.2 0-2-1.1-1.7-2.3L14 15z"/><path d="M29.4 18.4h-4.6l-1 4.2c3.2.6 5.2-1.3 5.6-4.2z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  smg:
    '<rect x="14" y="8" width="34" height="9" rx="1.5"/><rect x="47" y="10.5" width="12" height="4" rx="1"/><path d="M28 17h6l-1.5 12h-5.5z"/><path d="M17 17h6l-2.6 9h-5.6z"/><path d="M3 9.5h11v5H6.8L4.5 18H2.2z"/>',
  rifle:
    '<path d="M2 11.5 16 9v9.2L3.2 21c-1 .2-1.7-.5-1.7-1.5z"/><rect x="15" y="8.6" width="30" height="8.4" rx="1.4"/><rect x="44" y="10.8" width="18" height="3.2" rx="1"/><rect x="24" y="5.4" width="12" height="3.6" rx="1"/><path d="M30 17h6.2l-2 11.6h-5.8l1.6-6.6z"/><path d="M19 17h5.4l-2.4 8.4h-5.4z"/>',
  shotgun:
    '<path d="M2 12 18 9.5v8.4L3 20.6c-1 .2-1.6-.5-1.6-1.5z"/><rect x="17" y="9" width="17" height="8" rx="1.4"/><rect x="33" y="9.6" width="29" height="3.4" rx="1"/><rect x="38" y="13.6" width="15" height="4.4" rx="1.6"/><path d="M21 17h5.4l-2.4 8.4h-5.4z"/>',
  sniper:
    '<path d="M2 12.5 17 10v8.6L3 21.4c-1 .2-1.6-.5-1.6-1.5z"/><rect x="16" y="10" width="24" height="7" rx="1.2"/><rect x="39" y="12" width="24" height="2.6" rx="1"/><rect x="20" y="4.4" width="17" height="4.2" rx="2"/><rect x="26" y="8.4" width="3" height="2"/><path d="M22 17h5l-2.2 8h-5z"/>',
  launcher:
    '<rect x="5" y="9" width="52" height="9" rx="3"/><path d="M57 8h5v11h-5z"/><path d="M24 18h5.4l-2.4 8h-5.2z"/><path d="M34 18h5l-.8 5H33.4z"/><rect x="26" y="5" width="8" height="4" rx="1"/>',
  thrown:
    '<ellipse cx="32" cy="18.5" rx="8.6" ry="9.4"/><rect x="28.2" y="6.4" width="7.6" height="4.4" rx="1"/><path d="M35.8 8.6c4.4-.4 7 1.6 7.6 5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M26 15.5h12M25.4 21h13.2" stroke="rgba(14,27,42,.5)" stroke-width="1.4"/>',
};

const GLYPHS = {
  health: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  armor: '<path d="M12 2.2 20.5 5v6.2c0 5.2-3.6 9.2-8.5 10.6-4.9-1.4-8.5-5.4-8.5-10.6V5z"/>',
  phone: '<path d="M6.6 2.8 9.8 2l2 4.9-2.1 1.7a11.6 11.6 0 0 0 5.7 5.7l1.7-2.1 4.9 2-.8 3.2c-.3 1.2-1.4 2-2.6 1.9C10 18.8 5.2 14 4.7 5.4c-.1-1.2.7-2.3 1.9-2.6z"/>',
  car: '<path d="M5.2 10.4 7 6.2c.4-.8 1.2-1.3 2-1.3h6c.8 0 1.6.5 2 1.3l1.8 4.2c1.4.4 2.4 1.6 2.4 3.1V17h-2v1.8c0 .7-.5 1.2-1.2 1.2h-1.6c-.7 0-1.2-.5-1.2-1.2V17H8.8v1.8c0 .7-.5 1.2-1.2 1.2H6c-.7 0-1.2-.5-1.2-1.2V17h-2v-3.5c0-1.5 1-2.7 2.4-3.1zm2.4-.2h8.8l-1.3-3.2H8.9z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3.2" fill="rgba(14,27,42,.6)"/>',
  radio: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8 17 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8.5" cy="14" r="3" fill="rgba(14,27,42,.6)"/><rect x="14" y="11" width="5" height="2" rx="1" fill="rgba(14,27,42,.6)"/>',
  pin: '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  timer: '<circle cx="12" cy="13.5" r="7.8" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 9v5l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="9" y="2" width="6" height="2.6" rx="1"/>',
  wrench: '<path d="M20.6 6.4 17 10l-3-3 3.6-3.6a5.4 5.4 0 0 0-7.2 6.8L3.6 17a2 2 0 0 0 2.8 2.8l6.8-6.8a5.4 5.4 0 0 0 7.4-6.6z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
};
