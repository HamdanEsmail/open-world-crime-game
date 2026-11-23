// Paints the plan of Port Sarab as a map: the turquoise gulf and its beach, the marina basin and
// the port quay, the Amber Dunes, district-tinted blocks and buildings, sidewalks, boulevards and
// desert highways, landmarks; and, for the big city map, the district, street and landmark names.
// The rotating minimap and the pause-screen city map both draw with this one painter.

/**
 * Prepare the painter for game.city. A view is { scale (px per metre), originX, originZ }:
 * canvasX = (x - originX) * scale, canvasY = (z - originZ) * scale (north up).
 */
export function createCityMapPainter(game) {
  const city = game.city;
  const world = game.config.world;
  const districtColors = {};
  const groundColors = {};
  const buildingColors = {};
  for (const id of Object.keys(DISTRICT_TINTS)) {
    districtColors[id] = DISTRICT_TINTS[id];
    groundColors[id] = mixHex(DISTRICT_TINTS[id], MAP_COLORS.ground, 0.8);
    buildingColors[id] = mixHex(DISTRICT_TINTS[id], MAP_COLORS.ground, 0.32);
  }
  const districtLabels = computeDistrictLabels(city);
  const cityEdge = (city.roadKinds.boulevard.width / 2) + city.roadKinds.street.sidewalk;

  /** Paint every static layer of the region the view and canvas size cover. */
  function paintRegion(ctx, view, widthPx, heightPx, options = {}) {
    const x0 = view.originX;
    const z0 = view.originZ;
    const x1 = x0 + widthPx / view.scale;
    const z1 = z0 + heightPx / view.scale;
    const box = { x0, z0, x1, z1 };
    ctx.save();
    ctx.setTransform(view.scale, 0, 0, view.scale, -x0 * view.scale, -z0 * view.scale);
    paintDesert(ctx, box, view);
    paintShore(ctx, box, view);
    paintCityGround(ctx, box);
    paintBlocks(ctx, box, view);
    paintRoads(ctx, box, view, options);
    paintBuildings(ctx, box, view);
    paintDesertLandmarks(ctx, box, view);
    ctx.restore();
  }

  /** The sand of the Amber Dunes with soft ridges, so the desert never reads as a flat fill. */
  function paintDesert(ctx, box, view) {
    ctx.fillStyle = MAP_COLORS.desert;
    ctx.fillRect(box.x0, box.z0, box.x1 - box.x0, box.z1 - box.z0);
    const step = 90;
    const lineWidth = Math.max(1 / view.scale, 9);
    ctx.lineWidth = lineWidth;
    const startZ = Math.floor(Math.max(box.z0, city.coast.beachTopZ) / step) * step;
    for (let z = startZ; z < box.z1 + step; z += step) {
      ctx.strokeStyle = (Math.round(z / step) & 1) ? MAP_COLORS.duneLight : MAP_COLORS.duneDark;
      ctx.beginPath();
      for (let x = Math.floor(box.x0 / 60) * 60 - 60; x <= box.x1 + 60; x += 60) {
        const y = z + 26 * Math.sin(x * 0.006 + z * 0.01) + 12 * Math.sin(x * 0.017 - z * 0.004);
        if (x === Math.floor(box.x0 / 60) * 60 - 60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Beach, open water with a lighter shallow band, the marina basin with its piers, and the port quay. */
  function paintShore(ctx, box, view) {
    const coast = city.coast;
    if (box.z0 > coast.beachTopZ) return;
    const top = Math.min(box.z0, world.minZ) - 200;
    ctx.fillStyle = MAP_COLORS.beach;
    ctx.fillRect(box.x0, top, box.x1 - box.x0, coast.beachTopZ - top);
    const step = Math.max(8, 4 / view.scale);
    const startX = Math.floor(box.x0 / step) * step - step;
    const endX = box.x1 + step;
    // Shallow band, then the deep water inside it.
    for (const [color, inset] of [[MAP_COLORS.seaShallow, 0], [MAP_COLORS.sea, 22], [MAP_COLORS.seaDeep, 140]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(startX, top);
      for (let x = startX; x <= endX; x += step) ctx.lineTo(x, city.coastZ(x) - inset);
      ctx.lineTo(endX, top);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = MAP_COLORS.foam;
    ctx.lineWidth = Math.max(1.2 / view.scale, 3);
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (x === startX) ctx.moveTo(x, city.coastZ(x));
      else ctx.lineTo(x, city.coastZ(x));
    }
    ctx.stroke();

    const marina = coast.marina;
    const bw = marina.breakwaterHalfWidth;
    const mx0 = marina.minX - bw;
    const mx1 = marina.maxX + bw;
    ctx.fillStyle = MAP_COLORS.sea;
    ctx.fillRect(mx0, top, mx1 - mx0, marina.maxZ - top);
    ctx.fillStyle = MAP_COLORS.seaShallow;
    ctx.fillRect(marina.minX + bw, marina.minZ, marina.maxX - marina.minX - bw * 2, marina.maxZ - marina.minZ);
    ctx.fillStyle = MAP_COLORS.quay;
    ctx.fillRect(mx0, marina.maxZ, mx1 - mx0, coast.beachTopZ - marina.maxZ + 1);
    ctx.fillRect(mx0, marina.minZ, bw * 2, marina.maxZ - marina.minZ);
    ctx.fillRect(marina.maxX - bw, marina.minZ, bw * 2, marina.maxZ - marina.minZ);
    for (const pier of marina.piers) ctx.fillRect(pier - marina.pierHalfWidth, marina.pierEndZ, marina.pierHalfWidth * 2, marina.maxZ - marina.pierEndZ);

    const port = coast.port;
    ctx.fillStyle = MAP_COLORS.seaDeep;
    ctx.fillRect(port.minX, top, port.maxX - port.minX, port.edgeZ - top);
    ctx.fillStyle = MAP_COLORS.quay;
    ctx.fillRect(port.minX, port.edgeZ, port.maxX - port.minX, coast.beachTopZ - port.edgeZ + 1);
    ctx.strokeStyle = MAP_COLORS.quayEdge;
    ctx.lineWidth = Math.max(1.5 / view.scale, 2.5);
    ctx.beginPath();
    ctx.moveTo(port.minX, port.edgeZ);
    ctx.lineTo(port.maxX, port.edgeZ);
    ctx.stroke();
  }

  /** The paved floor of the street grid: pavement first; the block lots and roads go on top. */
  function paintCityGround(ctx, box) {
    const urban = city.urban;
    const x0 = urban.minX - cityEdge;
    const x1 = urban.maxX + cityEdge;
    const z0 = city.coast.beachTopZ;
    const z1 = urban.maxZ + cityEdge;
    if (x1 < box.x0 || x0 > box.x1 || z1 < box.z0 || z0 > box.z1) return;
    ctx.fillStyle = MAP_COLORS.pavement;
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  }

  /** Each block's lot in its district's ground colour, and its open lots: palm courts, pools, yards. */
  function paintBlocks(ctx, box) {
    for (const block of city.blocks) {
      const lot = block.lot;
      if (lot.x1 < box.x0 || lot.x0 > box.x1 || lot.z1 < box.z0 || lot.z0 > box.z1) continue;
      ctx.fillStyle = groundColors[block.district] || MAP_COLORS.ground;
      ctx.fillRect(lot.x0, lot.z0, lot.x1 - lot.x0, lot.z1 - lot.z0);
    }
    for (const lot of city.openLots) {
      if (lot.x1 < box.x0 || lot.x0 > box.x1 || lot.z1 < box.z0 || lot.z0 > box.z1) continue;
      const color = OPEN_LOT_COLORS[lot.use];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(lot.x0 + 2, lot.z0 + 2, lot.x1 - lot.x0 - 4, lot.z1 - lot.z0 - 4);
    }
  }

  /** Sidewalk casings, then the carriageways, boulevard medians and the desert highways. */
  function paintRoads(ctx, box, view, options) {
    const margin = 40;
    const visible = (edge) => !(Math.max(edge.a.x, edge.b.x) < box.x0 - margin || Math.min(edge.a.x, edge.b.x) > box.x1 + margin
      || Math.max(edge.a.z, edge.b.z) < box.z0 - margin || Math.min(edge.a.z, edge.b.z) > box.z1 + margin);
    const edges = game.roads ? game.roads.edges : [];
    ctx.lineJoin = 'round';
    // Desert roads: a darker shoulder, then the asphalt.
    ctx.lineCap = 'round';
    for (const edge of edges) {
      if (edge.grid || !visible(edge)) continue;
      ctx.strokeStyle = MAP_COLORS.shoulder;
      ctx.lineWidth = edge.width + 8;
      strokeSegment(ctx, edge.a.x, edge.a.z, edge.b.x, edge.b.z);
    }
    for (const edge of edges) {
      if (edge.grid || !visible(edge)) continue;
      ctx.strokeStyle = edge.kind === 'track' ? MAP_COLORS.track : MAP_COLORS.highway;
      ctx.lineWidth = Math.max(edge.width, 2.2 / view.scale);
      strokeSegment(ctx, edge.a.x, edge.a.z, edge.b.x, edge.b.z);
    }
    ctx.lineCap = 'square';
    for (const edge of edges) {
      if (!edge.grid || !visible(edge)) continue;
      ctx.strokeStyle = edge.kind === 'boulevard' ? MAP_COLORS.roadMajor : MAP_COLORS.road;
      ctx.lineWidth = Math.max(edge.width, 2 / view.scale);
      strokeSegment(ctx, edge.a.x, edge.a.z, edge.b.x, edge.b.z);
    }
    if (view.scale > 0.6 || options.medians) {
      ctx.lineCap = 'butt';
      ctx.strokeStyle = MAP_COLORS.median;
      for (const edge of edges) {
        if (!visible(edge) || edge.median <= 0) continue;
        ctx.lineWidth = Math.max(edge.median * 0.6, 1 / view.scale);
        const trimA = edge.a.trim || 0;
        const trimB = edge.b.trim || 0;
        strokeSegment(ctx, edge.a.x + edge.dirX * trimA, edge.a.z + edge.dirZ * trimA, edge.b.x - edge.dirX * trimB, edge.b.z - edge.dirZ * trimB);
      }
    }
  }

  /** Buildings as soft district-tinted blocks with a short shadow; landmarks picked out in gold. */
  function paintBuildings(ctx, box, view) {
    const shadow = Math.min(7, 2.5 / view.scale + 1);
    ctx.fillStyle = MAP_COLORS.buildingShadow;
    for (const b of city.buildings) {
      const hx = b.w / 2;
      const hz = b.d / 2;
      if (b.x + hx < box.x0 || b.x - hx > box.x1 || b.z + hz < box.z0 || b.z - hz > box.z1) continue;
      const lift = Math.min(shadow * (0.5 + b.h / 120), shadow * 2.2);
      ctx.fillRect(b.x - hx + lift * 0.6, b.z - hz + lift, b.w, b.d);
    }
    for (const b of city.buildings) {
      const hx = b.w / 2;
      const hz = b.d / 2;
      if (b.x + hx < box.x0 || b.x - hx > box.x1 || b.z + hz < box.z0 || b.z - hz > box.z1) continue;
      ctx.fillStyle = b.landmark ? MAP_COLORS.landmark : buildingColors[b.district] || MAP_COLORS.building;
      ctx.fillRect(b.x - hx, b.z - hz, b.w, b.d);
      if (b.h > 60 && !b.landmark) {
        ctx.fillStyle = MAP_COLORS.roofLight;
        ctx.fillRect(b.x - hx + b.w * 0.18, b.z - hz + b.d * 0.18, b.w * 0.64, b.d * 0.64);
      }
    }
    ctx.fillStyle = MAP_COLORS.wall;
    for (const w of city.walls) {
      if (w.maxX < box.x0 || w.minX > box.x1 || w.maxZ < box.z0 || w.minZ > box.z1) continue;
      ctx.fillRect(w.minX, w.minZ, Math.max(w.maxX - w.minX, 1 / view.scale), Math.max(w.maxZ - w.minZ, 1 / view.scale));
    }
    for (const c of city.containers) {
      if (c.x < box.x0 - 10 || c.x > box.x1 + 10 || c.z < box.z0 - 10 || c.z > box.z1 + 10) continue;
      ctx.fillStyle = CONTAINER_COLORS[c.colorIndex % CONTAINER_COLORS.length];
      ctx.fillRect(c.x - c.w / 2, c.z - c.d / 2, c.w, c.d);
    }
  }

  /** The airfield, the solar array, Falcon Rock, the oasis, the ship and cranes at the port. */
  function paintDesertLandmarks(ctx, box, view) {
    for (const mark of city.landmarks) {
      const reach = Math.max(mark.radius || 0, (mark.w || 0) / 2, (mark.d || 0) / 2) + 20;
      if (mark.x + reach < box.x0 || mark.x - reach > box.x1 || mark.z + reach < box.z0 || mark.z - reach > box.z1) continue;
      const kind = mark.kind;
      if (kind === 'airfield') {
        ctx.fillStyle = MAP_COLORS.runway;
        ctx.fillRect(mark.x - mark.w / 2, mark.z - mark.d / 2, mark.w, mark.d);
        ctx.strokeStyle = MAP_COLORS.runwayMark;
        ctx.lineWidth = Math.max(1.5, 1 / view.scale);
        ctx.setLineDash([14, 12]);
        strokeSegment(ctx, mark.x, mark.z - mark.d / 2 + 10, mark.x, mark.z + mark.d / 2 - 10);
        ctx.setLineDash([]);
      } else if (kind === 'solarFarm') {
        ctx.fillStyle = MAP_COLORS.solar;
        for (let row = -mark.d / 2; row < mark.d / 2; row += 16) ctx.fillRect(mark.x - mark.w / 2, mark.z + row, mark.w, 9);
      } else if (kind === 'mesa') {
        ctx.fillStyle = MAP_COLORS.mesa;
        fillCircle(ctx, mark.x, mark.z, mark.radius);
        ctx.fillStyle = MAP_COLORS.mesaTop;
        fillCircle(ctx, mark.x - mark.radius * 0.15, mark.z - mark.radius * 0.15, mark.radius * 0.62);
      } else if (kind === 'oasis') {
        ctx.fillStyle = MAP_COLORS.palm;
        fillCircle(ctx, mark.x, mark.z, mark.radius);
        ctx.fillStyle = MAP_COLORS.seaShallow;
        fillCircle(ctx, mark.x, mark.z, mark.radius * 0.55);
      } else if (kind === 'containerShip') {
        ctx.fillStyle = MAP_COLORS.shipHull;
        ctx.beginPath();
        ctx.moveTo(mark.x - mark.w / 2, mark.z - mark.d / 2);
        ctx.lineTo(mark.x + mark.w / 2 - 20, mark.z - mark.d / 2);
        ctx.lineTo(mark.x + mark.w / 2, mark.z);
        ctx.lineTo(mark.x + mark.w / 2 - 20, mark.z + mark.d / 2);
        ctx.lineTo(mark.x - mark.w / 2, mark.z + mark.d / 2);
        ctx.closePath();
        ctx.fill();
        for (let i = 0; i < 9; i += 1) {
          ctx.fillStyle = CONTAINER_COLORS[i % CONTAINER_COLORS.length];
          ctx.fillRect(mark.x - mark.w / 2 + 30 + i * 20, mark.z - mark.d / 2 + 6, 16, mark.d - 12);
        }
      } else if (kind === 'portCranes') {
        ctx.fillStyle = MAP_COLORS.crane;
        for (const [px] of mark.positions || []) ctx.fillRect(px - 9, mark.z - 30, 18, 46);
      } else if (kind === 'raceway' || kind === 'hangar') {
        ctx.fillStyle = MAP_COLORS.runway;
        ctx.fillRect(mark.x - mark.w / 2, mark.z - mark.d / 2, mark.w, mark.d);
      } else if (kind === 'shipwreck') {
        ctx.fillStyle = MAP_COLORS.wreck;
        ctx.save();
        ctx.translate(mark.x, mark.z);
        ctx.rotate(0.5);
        ctx.fillRect(-mark.radius, -mark.radius * 0.32, mark.radius * 2, mark.radius * 0.64);
        ctx.restore();
      } else if (kind === 'gate') {
        ctx.fillStyle = MAP_COLORS.landmark;
        ctx.fillRect(mark.x - mark.w / 2, mark.z - mark.d / 2, 6, mark.d);
        ctx.fillRect(mark.x + mark.w / 2 - 6, mark.z - mark.d / 2, 6, mark.d);
      }
    }
  }

  /** District names in spaced capitals, boulevard and street names, landmark names (big map only). */
  function paintLabels(ctx, view, widthPx, heightPx) {
    const toX = (x) => (x - view.originX) * view.scale;
    const toY = (z) => (z - view.originZ) * view.scale;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Street names along the grid, once per road, where they fit.
    if (view.scale > 0.34) {
      const size = Math.round(Math.min(15, 8 + view.scale * 4));
      ctx.font = `600 ${size}px ${LABEL_FONT}`;
      ctx.fillStyle = 'rgba(14,27,42,0.92)';
      const centerZ = view.originZ + heightPx / view.scale / 2;
      const centerX = view.originX + widthPx / view.scale / 2;
      for (const avenue of city.avenues) {
        const px = toX(avenue.x);
        if (px < -20 || px > widthPx + 20) continue;
        if (avenue.kind !== 'boulevard' && view.scale < 0.8) continue;
        const z = clampNumber(centerZ + 130, city.urban.minZ + 160, city.urban.maxZ - 160);
        drawRotatedText(ctx, avenue.name.toUpperCase(), px, toY(z), -Math.PI / 2, avenue.kind === 'boulevard');
      }
      for (const street of city.streets) {
        const py = toY(street.z);
        if (py < -20 || py > heightPx + 20) continue;
        if (street.kind !== 'boulevard' && view.scale < 0.8) continue;
        const x = clampNumber(centerX - 190, city.urban.minX + 160, city.urban.maxX - 160);
        drawRotatedText(ctx, street.name.toUpperCase(), toX(x), py, 0, street.kind === 'boulevard');
      }
      for (const road of city.desertRoads) {
        if (road.kind !== 'highway') continue;
        const [ax, az] = road.points[1];
        const [bx, bz] = road.points[2];
        const mx = toX((ax + bx) / 2);
        const my = toY((az + bz) / 2);
        if (mx < -40 || mx > widthPx + 40 || my < -40 || my > heightPx + 40) continue;
        let angle = Math.atan2(bz - az, bx - ax);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        drawRotatedText(ctx, road.name.toUpperCase(), mx, my, angle, true);
      }
    }
    // Landmark names under their icons.
    if (view.scale > 0.22) {
      ctx.font = `700 ${Math.round(Math.min(14, 9 + view.scale * 3))}px ${LABEL_FONT}`;
      for (const mark of city.landmarks) {
        const px = toX(mark.x);
        const py = toY(mark.z);
        if (px < -60 || px > widthPx + 60 || py < -60 || py > heightPx + 60) continue;
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = 'rgba(14,27,42,0.9)';
        ctx.strokeText(mark.name, px, py + 17);
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(mark.name, px, py + 17);
      }
    }
    // District names last, largest, spaced capitals.
    const districtSize = Math.round(clampNumber(10 + view.scale * 22, 13, 30));
    ctx.font = `800 ${districtSize}px ${LABEL_FONT}`;
    for (const label of districtLabels) {
      const px = toX(label.x);
      const py = toY(label.z);
      if (px < -200 || px > widthPx + 200 || py < -60 || py > heightPx + 60) continue;
      const text = spaced(label.name.toUpperCase());
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(14,27,42,0.85)';
      ctx.strokeText(text, px, py);
      ctx.fillStyle = label.color;
      ctx.fillText(text, px, py);
    }
    ctx.restore();
  }

  return { paintRegion, paintLabels, districtColors, districtLabels, colors: MAP_COLORS };
}

/** Where each district's name sits on the big map: the middle of its blocks, or a fixed spot. */
function computeDistrictLabels(city) {
  const sums = {};
  for (const block of city.blocks) {
    const entry = sums[block.district] || (sums[block.district] = { x: 0, z: 0, n: 0 });
    entry.x += block.centerX;
    entry.z += block.centerZ;
    entry.n += 1;
  }
  const labels = [];
  for (const district of city.districts) {
    let x;
    let z;
    if (sums[district.id]) {
      x = sums[district.id].x / sums[district.id].n;
      z = sums[district.id].z / sums[district.id].n;
    } else if (FIXED_LABELS[district.id]) {
      [x, z] = FIXED_LABELS[district.id];
    } else continue;
    if (LABEL_NUDGE[district.id]) {
      x += LABEL_NUDGE[district.id][0];
      z += LABEL_NUDGE[district.id][1];
    }
    labels.push({ id: district.id, name: district.name, x, z, color: mixHex(DISTRICT_TINTS[district.id] || '#fff4d6', '#ffffff', 0.45) });
  }
  return labels;
}

function strokeSegment(ctx, ax, az, bx, bz) {
  ctx.beginPath();
  ctx.moveTo(ax, az);
  ctx.lineTo(bx, bz);
  ctx.stroke();
}

function fillCircle(ctx, x, z, radius) {
  ctx.beginPath();
  ctx.arc(x, z, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawRotatedText(ctx, text, x, y, angle, major) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = major ? 'rgba(14,27,42,0.95)' : 'rgba(14,27,42,0.8)';
  ctx.fillText(text, 0, 0.5);
  ctx.restore();
}

function spaced(text) {
  return text.split('').join(' ');
}

function clampNumber(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Mix two '#rrggbb' colours: t = 0 gives a, t = 1 gives b. */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

const LABEL_FONT = '"Bahnschrift", "DIN Alternate", "Segoe UI", Arial, sans-serif';

/** The map's colours: the gulf in teal, the dunes in sand, the city in night-blue slate with cream roads. */
export const MAP_COLORS = {
  sea: '#167a84',
  seaShallow: '#2fb3ad',
  seaDeep: '#0f5266',
  foam: 'rgba(255,244,214,0.55)',
  beach: '#ecc983',
  quay: '#58606b',
  quayEdge: '#e9b44c',
  desert: '#c8954c',
  duneLight: 'rgba(255,230,170,0.16)',
  duneDark: 'rgba(110,62,20,0.12)',
  pavement: '#5d6470',
  ground: '#2a3441',
  road: '#e6dabb',
  roadMajor: '#fbf0d2',
  highway: '#f1c764',
  track: '#e0bf8a',
  shoulder: 'rgba(90,55,22,0.35)',
  median: '#8f8a78',
  building: '#4e5b6b',
  buildingShadow: 'rgba(8,14,22,0.38)',
  roofLight: 'rgba(255,255,255,0.1)',
  landmark: '#f2c35a',
  wall: '#7a5a3a',
  runway: '#4b4f57',
  runwayMark: '#fff4d6',
  solar: '#36507a',
  mesa: '#9a5a2e',
  mesaTop: '#b8703c',
  palm: '#4f8a4a',
  shipHull: '#7c2a24',
  crane: '#f0b43c',
  wreck: '#5a3d2a',
};

/** Each district's own tint: steel-blue Spires, teal Marina, sand Old Sarab, pink Lantern Row ... */
export const DISTRICT_TINTS = {
  spires: '#7fb2e0',
  marina: '#4fd1c5',
  oldsarab: '#e6a75e',
  docks: '#a3a9b4',
  jasmine: '#93c76c',
  lantern: '#ef7fc0',
  wadi: '#d4b08c',
  southgate: '#c79a58',
  corniche: '#f2d08a',
  dunes: '#f0bf6a',
  gulf: '#6fe0d8',
};

const OPEN_LOT_COLORS = {
  plaza: '#4b5462',
  palmCourt: '#3e6a4c',
  poolDeck: '#2f8d97',
  garden: '#3e6a44',
  courtyard: '#6a5638',
  marketStalls: '#8a6a3c',
  parking: '#434a55',
  playground: '#3e6a4c',
  truckYard: '#454a52',
  carLot: '#434a55',
  containerYard: '#3d434c',
  spirePlaza: '#6a6248',
  marketSquare: '#8a6a3c',
  sundialSquare: '#7a6a48',
  hotelForecourt: '#4c6a5a',
  policeYard: '#3c4a66',
  scrapYard: '#5a4a3a',
};

const CONTAINER_COLORS = ['#c4453a', '#2e7fc1', '#d9a520', '#2f9e62', '#e0702a', '#8a9098'];

const FIXED_LABELS = {
  corniche: [-260, -770],
  dunes: [-260, 1260],
  gulf: [120, -1160],
};

const LABEL_NUDGE = {
  spires: [0, 20],
  docks: [0, -30],
  southgate: [0, 30],
};
