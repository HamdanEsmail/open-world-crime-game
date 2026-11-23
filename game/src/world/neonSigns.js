// The signs of Port Sarab: Lantern Row's neon (hotels, clubs and bars that blaze after dark), the
// corporate crowns of The Spires, the faded painted boards of Southgate and the docks, and the
// names of the landmarks. Each sign is painted once into the facade atlas and hung on buildings
// as a board on a wall, a blade sticking out over the pavement, or a rooftop sign on posts.
import { signNameForLanternRow } from './districtArchitectureStyles.js';

/**
 * Every sign in the city. style: 'neon' | 'corporate' | 'civic' | 'painted' | 'hand'.
 * board is the backing colour, ink the letters by day, glow their light by night (false: unlit).
 * group says where a sign is hung: 'lantern', 'spires', 'southgate', 'docks' or a landmark id.
 */
export const SIGN_CATALOG = [
  // Lantern Row: hotels, clubs and bars (their names are kept in districtArchitectureStyles.js)
  lanternNeon(0, 'clubSimoom', '#1c1026', '#ffb8f0', '#ff3fc8'),
  lanternNeon(1, 'hotelQamar', '#0e1b2a', '#c8fbff', '#3ee8ff'),
  lanternNeon(2, 'brassFalcon', '#22160c', '#ffe6a8', '#ffb627'),
  lanternNeon(3, 'nightjar', '#160f2a', '#e0ccff', '#9d5cff'),
  lanternNeon(4, 'velvetCaravan', '#260c18', '#ffc4d8', '#ff4f8b'),
  lanternNeon(5, 'hotelLumen', '#101820', '#f0f8ff', '#a8d8ff'),
  lanternNeon(6, 'coralRoom', '#200c0a', '#ffd0c0', '#ff6a3d'),
  lanternNeon(7, 'saffronSky', '#1e1208', '#ffe0b0', '#ff9a1f'),
  lanternNeon(8, 'neonDhow', '#081a1e', '#c0fff4', '#22f0c8'),
  lanternNeon(9, 'stardune', '#140c24', '#f0d0ff', '#d24dff'),
  lanternNeon(10, 'hotelAzura', '#081428', '#cce0ff', '#3d7bff'),
  lanternNeon(11, 'oasisNights', '#0a1c10', '#d0ffd8', '#3dff7a'),
  lanternNeon(12, 'goldenScarab', '#1c1406', '#fff0b8', '#ffd23d'),
  lanternNeon(13, 'moonwell', '#0c1424', '#e8f0ff', '#b8c8ff'),
  lanternNeon(14, 'jinnTonic', '#061a1a', '#c8fff0', '#3dffd8'),
  lanternNeon(15, 'khamsinBar', '#1e0a06', '#ffd0b0', '#ff4a1f'),
  lanternNeon(16, 'palmPearl', '#14101e', '#fff0fa', '#ff8ad8'),
  lanternNeon(17, 'fataMorgana', '#1a0a22', '#ffd8ff', '#e040ff'),
  // The Spires: the names on the crowns of the towers
  { id: 'oryxBank', text: 'ORYX BANK', style: 'corporate', board: '#1d262c', ink: '#f4f4f0', glow: '#ffffff', group: 'spires' },
  { id: 'najmTelecom', text: 'NAJM TELECOM', style: 'corporate', board: '#0f2a2c', ink: '#9ff5ec', glow: '#40f0e0', group: 'spires' },
  { id: 'sabkhaEnergy', text: 'SABKHA ENERGY', style: 'corporate', board: '#2a1f10', ink: '#ffd98a', glow: '#ffc040', group: 'spires' },
  { id: 'zafranAir', text: 'ZAFRAN AIR', style: 'corporate', board: '#2c1410', ink: '#ffc0a8', glow: '#ff7a50', group: 'spires' },
  // Landmarks
  { id: 'pspd', text: 'PSPD', style: 'civic', board: '#16264a', ink: '#fff4d6', glow: '#d8e8ff', group: 'policeHQ' },
  { id: 'sarabGeneral', text: 'SARAB GENERAL HOSPITAL', style: 'civic', board: '#fbfbfb', ink: '#127a74', glow: '#5ff0e4', group: 'hospital' },
  { id: 'mirageGrand', text: 'MIRAGE GRAND', style: 'corporate', board: '#1a1208', ink: '#ffe6a0', glow: '#ffc94a', group: 'grandHotel' },
  { id: 'haddadMotors', text: 'HADDAD MOTORS', style: 'hand', board: '#f2e6c8', ink: '#b02a1e', glow: '#d0784a', group: 'garage' },
  { id: 'vane', text: 'VANE', style: 'corporate', board: '#0e1b2a', ink: '#f6d27a', glow: '#ffd36a', group: 'vaneSpire' },
  { id: 'yachtClub', text: 'CRESCENT YACHT CLUB', style: 'civic', board: '#ffffff', ink: '#1d3c6e', glow: '#bcd8ff', group: 'yachtClub' },
  { id: 'customsHouse', text: 'MINA CUSTOMS HOUSE', style: 'civic', board: '#eadcbc', ink: '#5a3a1a', glow: '#ffd890', group: 'customsHouse' },
  { id: 'grandSouk', text: 'THE GRAND SOUK', style: 'civic', board: '#f0e2c4', ink: '#1b6f6a', glow: '#ffc870', group: 'soukHall' },
  // Southgate and the docks: sun-faded painted boards
  { id: 'sandpiperMotel', text: 'SANDPIPER MOTEL', style: 'painted', board: '#e8d8a8', ink: '#b8432e', glow: '#ff7050', group: 'southgate' },
  { id: 'desertRose', text: 'DESERT ROSE MOTEL', style: 'painted', board: '#f0d8cc', ink: '#2c7a74', glow: '#ff8aa8', group: 'southgate' },
  { id: 'alWahaTyres', text: 'AL WAHA TYRES', style: 'painted', board: '#2c3a46', ink: '#f2c014', glow: false, group: 'southgate' },
  { id: 'sunstopMarket', text: 'SUNSTOP MARKET', style: 'painted', board: '#f6e7b8', ink: '#2f5f8a', glow: '#ffe0a0', group: 'southgate' },
  { id: 'minaLogistics', text: 'MINA LOGISTICS', style: 'painted', board: '#1f4f6e', ink: '#f4f4ee', glow: false, group: 'docks' },
  { id: 'sarabShipping', text: 'SARAB SHIPPING CO.', style: 'painted', board: '#a8402e', ink: '#fff4e0', glow: false, group: 'docks' },
];

/** A Lantern Row neon sign: the index-th name of the strip on a dark board, in its own colours. */
function lanternNeon(index, id, board, ink, glow) {
  return { id, text: signNameForLanternRow(index), style: 'neon', board, ink, glow, group: 'lantern' };
}

/** The ids of the signs hung in one group, in catalogue order. */
export function signsOfGroup(group) {
  return SIGN_CATALOG.filter((sign) => sign.group === group).map((sign) => sign.id);
}

/**
 * Paint one sign into its atlas slot through the facade painter `p` (see facadeTextures.js):
 * the board and letters as seen by day, and the light they give at night.
 */
export function paintSignTile(p, sign) {
  const { w, h, c, g } = p;
  p.base(sign.board, 'keep');
  if (sign.style === 'painted') {
    p.speckle(90, ['#ffffff', '#000000'], 1, 4, 0.08);
  }
  const font = SIGN_FONTS[sign.style] || SIGN_FONTS.civic;
  const size = sign.style === 'civic' && sign.text.length <= 6 ? h * 0.82 : h * 0.66;
  const text = sign.text;
  const draw = (ctx, fill, stroke, strokeWidth) => {
    ctx.save();
    ctx.font = `${font.weight} ${Math.round(size)}px ${font.family}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = font.spacing;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const measured = ctx.measureText(text).width;
    const room = w - 14;
    const squeeze = measured > room ? room / measured : 1;
    ctx.translate(w / 2, h / 2 + 1);
    ctx.scale(squeeze, 1);
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(text, 0, 0);
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillText(text, 0, 0);
    }
    ctx.restore();
  };

  if (sign.style === 'neon') {
    // Tubes by day: pale glass letters with a dark outline; by night, the coloured fire around them.
    p.rect(sign.glow, 2, 2, w - 4, 1.5, 'keep');
    p.rect(sign.glow, 2, h - 3.5, w - 4, 1.5, 'keep');
    draw(c, sign.ink, '#000000', 3);
    g.save();
    g.shadowColor = sign.glow;
    g.shadowBlur = 7;
    draw(g, sign.glow, sign.glow, 3);
    g.restore();
    draw(g, mixHex(sign.glow, '#ffffff', 0.55), null, 0);
    g.fillStyle = sign.glow;
    g.fillRect(2, 2, w - 4, 1.5);
    g.fillRect(2, h - 3.5, w - 4, 1.5);
  } else if (sign.style === 'corporate') {
    draw(c, sign.ink, null, 0);
    g.save();
    g.shadowColor = sign.glow;
    g.shadowBlur = 4;
    draw(g, sign.glow, null, 0);
    g.restore();
  } else if (sign.style === 'civic') {
    p.rect(mixHex(sign.board, '#000000', 0.25), 0, h - 3, w, 3, 'keep');
    draw(c, sign.ink, null, 0);
    if (sign.glow) {
      g.save();
      g.shadowColor = sign.glow;
      g.shadowBlur = 5;
      draw(g, sign.glow, null, 0);
      g.restore();
    }
  } else if (sign.style === 'hand') {
    p.rect('#e4572e', 0, h - 9, w, 3, 'keep');
    p.rect('#e9b44c', 0, h - 6, w, 3, 'keep');
    p.rect('#1ba39c', 0, h - 3, w, 3, 'keep');
    draw(c, sign.ink, '#fff4d6', 2);
    g.fillStyle = '#3a2410';
    g.fillRect(0, 0, w, h);
    draw(g, sign.glow, null, 0);
  } else {
    // Painted and sun-faded, lit from above by gooseneck lamps (if at all).
    draw(c, sign.ink, null, 0);
    p.speckle(160, [sign.board], 1, 3, 0.35);
    if (sign.glow) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#5a4630');
      grad.addColorStop(1, '#140e08');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      draw(g, sign.glow, null, 0);
    }
  }
}

/**
 * A sign board flat on a wall. `face` is faceOf(...) of the building side; the board is centred
 * at `along` metres from the face's left end (default the middle), from y0 to y0 + height.
 */
export function hangWallSign(builder, face, signId, y0, width, height, along = face.length / 2, standOff = 0.12) {
  const half = width / 2;
  const ox = face.nx * standOff;
  const oz = face.nz * standOff;
  const ax = face.ax + face.tx * (along - half) + ox;
  const az = face.az + face.tz * (along - half) + oz;
  const bx = face.ax + face.tx * (along + half) + ox;
  const bz = face.az + face.tz * (along + half) + oz;
  builder.use(`sign:${signId}`, 0xffffff);
  builder.wall(ax, az, bx, bz, y0, y0 + height, { fit: true });
}

/**
 * A blade sign: a tall double-sided box sticking out from the wall over the pavement, its name
 * running up both faces. Placed `along` metres from the face's left end.
 */
export function hangBladeSign(builder, face, signId, y0, height, reach, along, frameTint) {
  const thickness = 0.5;
  const x0 = face.ax + face.tx * (along - thickness / 2);
  const z0 = face.az + face.tz * (along - thickness / 2);
  const x1 = face.ax + face.tx * (along + thickness / 2);
  const z1 = face.az + face.tz * (along + thickness / 2);
  const ex = face.nx * reach;
  const ez = face.nz * reach;
  // The frame: a thin box of the hotel's colour.
  builder.use('plain', frameTint);
  const minX = Math.min(x0, x1, x0 + ex, x1 + ex);
  const maxX = Math.max(x0, x1, x0 + ex, x1 + ex);
  const minZ = Math.min(z0, z1, z0 + ez, z1 + ez);
  const maxZ = Math.max(z0, z1, z0 + ez, z1 + ez);
  builder.box(minX, y0 - 0.4, minZ, maxX, y0 + height + 0.4, maxZ, { bottom: true });
  // Both faces carry the name, turned to run up the blade.
  builder.use(`sign:${signId}`, 0xffffff);
  const inset = 0.25;
  const px = face.nx * inset;
  const pz = face.nz * inset;
  const qx = ex - face.nx * inset;
  const qz = ez - face.nz * inset;
  const off = 0.02;
  // The side facing along the street one way (+t), then the other (-t).
  builder.wall(x1 + face.tx * off + qx, z1 + face.tz * off + qz, x1 + face.tx * off + px, z1 + face.tz * off + pz, y0, y0 + height, { fit: true, rotate: true });
  builder.wall(x0 - face.tx * off + px, z0 - face.tz * off + pz, x0 - face.tx * off + qx, z0 - face.tz * off + qz, y0, y0 + height, { fit: true, rotate: true });
}

/**
 * A rooftop sign: a board on two posts standing on a roof at (x, z, roofY), facing `face.n`
 * (the street), its name on the street side and its back on the other.
 */
export function raiseRooftopSign(builder, face, signId, x, z, roofY, width, height, lift = 1.2, postTint = 0x5a5f66) {
  const half = width / 2;
  const ax = x - face.tx * half;
  const az = z - face.tz * half;
  const bx = x + face.tx * half;
  const bz = z + face.tz * half;
  builder.use('metalPanel', postTint);
  for (const t of [-0.3, 0.3]) {
    const px = x + face.tx * width * t;
    const pz = z + face.tz * width * t;
    builder.box(px - 0.25, roofY, pz - 0.25, px + 0.25, roofY + lift + height * 0.9, pz + 0.25);
  }
  const depth = 0.35;
  const bx0 = Math.min(ax, bx) - Math.abs(face.nx) * depth / 2;
  const bx1 = Math.max(ax, bx) + Math.abs(face.nx) * depth / 2;
  const bz0 = Math.min(az, bz) - Math.abs(face.nz) * depth / 2;
  const bz1 = Math.max(az, bz) + Math.abs(face.nz) * depth / 2;
  builder.use('plain', 0x2a2a30);
  builder.box(bx0, roofY + lift, bz0, bx1, roofY + lift + height, bz1, { bottom: true });
  builder.use(`sign:${signId}`, 0xffffff);
  const off = depth / 2 + 0.03;
  builder.wall(ax + face.nx * off, az + face.nz * off, bx + face.nx * off, bz + face.nz * off, roofY + lift + 0.1, roofY + lift + height - 0.1, { fit: true });
  builder.wall(bx - face.nx * off, bz - face.nz * off, ax - face.nx * off, az - face.nz * off, roofY + lift + 0.1, roofY + lift + height - 0.1, { fit: true });
}

const SIGN_FONTS = {
  neon: { weight: 'italic 700', family: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif', spacing: '1px' },
  corporate: { weight: '600', family: '"Segoe UI", "Helvetica Neue", Arial, sans-serif', spacing: '4px' },
  civic: { weight: '800', family: '"Arial Black", "Segoe UI", Arial, sans-serif', spacing: '2px' },
  painted: { weight: '700', family: 'Georgia, "Times New Roman", serif', spacing: '1px' },
  hand: { weight: 'italic 700', family: 'Georgia, "Times New Roman", serif', spacing: '0px' },
};

/** Blend two #rrggbb colours. */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
