// The plan of Port Sarab: a desert-coast boomtown laid out as data. Eight districts on a street
// grid between the Gulf of Sarab (north) and the Amber Dunes (south), every building footprint,
// the landmarks, the desert highways, and the places the story and the side jobs happen in.
// Nothing here draws; the city meshes, traffic, minimap and missions all read this plan.

/** Build the whole plan, the same every time for the same world seed. Becomes game.city. */
export function createPortSarabCityPlan(game) {
  const rng = game.rng.fork('city-plan');
  const city = {
    name: 'Port Sarab',
    avenues: AVENUES,
    streets: STREETS,
    roadKinds: ROAD_KINDS,
    desertRoads: DESERT_ROADS,
    districts: DISTRICTS,
    districtById: {},
    urban: { minX: AVENUES[0].x, maxX: AVENUES[AVENUES.length - 1].x, minZ: STREETS[0].z, maxZ: STREETS[STREETS.length - 1].z },
    coast: COAST,
    blocks: [],
    buildings: [],
    walls: [],
    containers: [],
    openLots: [],
    landmarks: [],
    places: [],
    placeById: {},
    parkingSpots: [],
    stuntRamps: STUNT_RAMPS,
    flatZones: FLAT_ZONES,
  };
  for (const district of DISTRICTS) city.districtById[district.id] = district;

  layOutBlocks(city);
  for (const block of city.blocks) raiseBuildingsOnBlock(city, block, rng.fork(`block-${block.col}-${block.row}`));
  placeDesertLandmarks(city);
  markStoryAndShopPlaces(city);
  scatterCollectibleFalcons(city, rng.fork('falcons'));
  layOutParkingSpots(city, rng.fork('parking'));

  city.districtAt = (x, z) => districtAt(city, x, z);
  city.blockAt = (x, z) => blockAt(city, x, z);
  city.streetNameAt = (x, z) => streetNameAt(city, x, z);
  city.coastZ = coastZ;
  city.place = (id) => city.placeById[id] || null;
  city.placesOfKind = (kind) => city.places.filter((place) => place.kind === kind);
  return city;
}

/** The shoreline: the z at which the beach meets the water for a given x. */
export function coastZ(x) {
  return COAST.baseZ - 40 * Math.sin(x * 0.004 + 1) - 22 * Math.sin(x * 0.011);
}

/** Which district a point is in: a city block's district, the beach, the sea or the dunes. */
function districtAt(city, x, z) {
  const block = blockAt(city, x, z);
  if (block) return city.districtById[block.district];
  const urban = city.urban;
  if (z < COAST.beachTopZ) {
    if (x > COAST.port.minX && x < COAST.port.maxX && z > COAST.port.edgeZ) return city.districtById.docks;
    if (x > COAST.marina.minX - 40 && x < COAST.marina.maxX + 40 && z > COAST.marina.minZ - 20) return city.districtById.marina;
    return z < coastZ(x) ? city.districtById.gulf : city.districtById.corniche;
  }
  if (x < urban.minX - 20 || x > urban.maxX + 20 || z > urban.maxZ + 20) return city.districtById.dunes;
  return city.districtById[DISTRICT_GRID[rowOf(z)][columnOf(x)]];
}

/** The city block containing a point (between its four roads), or null on a road or outside the grid. */
function blockAt(city, x, z) {
  const urban = city.urban;
  if (x <= urban.minX || x >= urban.maxX || z <= urban.minZ || z >= urban.maxZ) return null;
  const block = city.blocks[rowOf(z) * COLUMNS + columnOf(x)];
  const lot = block.lot;
  return x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1 ? block : null;
}

/** The name of the nearest street, for the HUD. */
function streetNameAt(city, x, z) {
  let best = '';
  let bestDistance = 60;
  const urban = city.urban;
  if (z > urban.minZ - 30 && z < urban.maxZ + 30) {
    for (const avenue of AVENUES) {
      const d = Math.abs(x - avenue.x);
      if (d < bestDistance) { bestDistance = d; best = avenue.name; }
    }
  }
  if (x > urban.minX - 30 && x < urban.maxX + 30) {
    for (const street of STREETS) {
      const d = Math.abs(z - street.z);
      if (d < bestDistance) { bestDistance = d; best = street.name; }
    }
  }
  for (const road of DESERT_ROADS) {
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const d = distanceToRoadSegment(x, z, road.points[i][0], road.points[i][1], road.points[i + 1][0], road.points[i + 1][1]);
      if (d < bestDistance) { bestDistance = d; best = road.name; }
    }
  }
  return best;
}

/** Cut the grid into its 80 blocks, each with its district and its buildable lot inside the sidewalks. */
function layOutBlocks(city) {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      const west = AVENUES[col];
      const east = AVENUES[col + 1];
      const north = STREETS[row];
      const south = STREETS[row + 1];
      const lot = {
        x0: west.x + ROAD_KINDS[west.kind].width / 2 + SIDEWALK,
        x1: east.x - ROAD_KINDS[east.kind].width / 2 - SIDEWALK,
        z0: north.z + ROAD_KINDS[north.kind].width / 2 + SIDEWALK,
        z1: south.z - ROAD_KINDS[south.kind].width / 2 - SIDEWALK,
      };
      city.blocks.push({
        id: row * COLUMNS + col, col, row,
        district: DISTRICT_GRID[row][col],
        lot,
        centerX: (lot.x0 + lot.x1) / 2,
        centerZ: (lot.z0 + lot.z1) / 2,
        special: SPECIAL_BLOCKS[`${col},${row}`] || null,
        buildings: [],
      });
    }
  }
}

/** Fill one block with buildings in its district's style, or with its landmark. */
function raiseBuildingsOnBlock(city, block, rng) {
  if (block.special) {
    raiseLandmarkBlock(city, block, rng);
    return;
  }
  const district = city.districtById[block.district];
  const style = BLOCK_STYLES[district.kind];
  const lot = block.lot;
  const columns = rng.pick(style.columns);
  const rows = rng.pick(style.rows);
  const gap = style.gap;
  const cellW = (lot.x1 - lot.x0 - gap * (columns - 1)) / columns;
  const cellD = (lot.z1 - lot.z0 - gap * (rows - 1)) / rows;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const x0 = lot.x0 + i * (cellW + gap);
      const z0 = lot.z0 + j * (cellD + gap);
      const cell = { x0, z0, x1: x0 + cellW, z1: z0 + cellD };
      const onEdgeX = i === 0 ? 'w' : i === columns - 1 ? 'e' : null;
      const onEdgeZ = j === 0 ? 'n' : j === rows - 1 ? 's' : null;
      const front = onEdgeZ && (!onEdgeX || rng.chance(0.5)) ? onEdgeZ : onEdgeX || 's';
      if (rng.chance(style.openChance)) {
        city.openLots.push({ ...cell, use: rng.pick(style.openUses), district: district.id, block: block.id, front });
        continue;
      }
      if (district.kind === 'docks' && rng.chance(0.35)) {
        stackContainerYard(city, cell, district, block, rng);
        continue;
      }
      const inset = style.inset + rng.range(0, style.insetJitter);
      const maxW = cellW - inset * 2;
      const maxD = cellD - inset * 2;
      const w = Math.max(8, maxW * rng.range(style.fill[0], style.fill[1]));
      const d = Math.max(8, maxD * rng.range(style.fill[0], style.fill[1]));
      const cx = (cell.x0 + cell.x1) / 2 + (maxW - w) * rng.range(-0.5, 0.5);
      const cz = (cell.z0 + cell.z1) / 2 + (maxD - d) * rng.range(-0.5, 0.5);
      const tall = rng.next();
      const h = style.minHeight + (style.maxHeight - style.minHeight) * Math.pow(tall, style.heightCurve);
      const building = addBuilding(city, block, {
        x: cx, z: cz, w, d, h: Math.round(h * 2) / 2,
        style: rng.weighted(style.styles, style.styleWeights),
        front, variant: rng.int(0, 7), tint: rng.next(),
        windTower: district.kind === 'oldtown' && rng.chance(0.3),
      });
      if (district.kind === 'villas') wallVillaGarden(city, cell, building, front);
    }
  }
}

/** A landmark block: the Vane Spire, police headquarters, the hospital, the Grand Souk and the rest. */
function raiseLandmarkBlock(city, block, rng) {
  const lot = block.lot;
  const cx = block.centerX;
  const cz = block.centerZ;
  const special = block.special;
  const mark = (building, kind) => {
    building.landmark = kind;
    city.landmarks.push({ id: kind, name: building.name, kind, x: building.x, z: building.z, h: building.h, building: building.id });
  };
  if (special === 'vaneSpire') {
    mark(addBuilding(city, block, { x: cx, z: cz, w: 62, d: 62, h: 330, style: 'vaneSpire', front: 's', name: 'Vane Spire' }), 'vaneSpire');
    city.openLots.push({ ...lot, use: 'spirePlaza', district: block.district, block: block.id, front: 's' });
  } else if (special === 'policeHQ') {
    mark(addBuilding(city, block, { x: cx - 24, z: cz - 28, w: 96, d: 62, h: 28, style: 'policeHQ', front: 's', name: 'PSPD Headquarters' }), 'policeHQ');
    addBuilding(city, block, { x: cx + 52, z: cz + 44, w: 40, d: 36, h: 12, style: 'policeGarage', front: 'w', name: 'PSPD Motor Pool' });
    city.openLots.push({ x0: lot.x0, z0: cz + 14, x1: cx + 24, z1: lot.z1, use: 'policeYard', district: block.district, block: block.id, front: 's' });
  } else if (special === 'hospital') {
    mark(addBuilding(city, block, { x: cx, z: cz - 20, w: 110, d: 60, h: 34, style: 'hospital', front: 's', name: 'Sarab General Hospital' }), 'hospital');
    city.openLots.push({ x0: lot.x0, z0: cz + 22, x1: lot.x1, z1: lot.z1, use: 'parking', district: block.district, block: block.id, front: 's' });
  } else if (special === 'grandSouk') {
    // Four long market halls around an open square, with lanes between them.
    const hall = 20;
    addBuilding(city, block, { x: cx, z: lot.z0 + hall / 2 + 2, w: lot.x1 - lot.x0 - 60, d: hall, h: 9, style: 'soukHall', front: 's', name: 'Grand Souk North Hall' });
    addBuilding(city, block, { x: cx, z: lot.z1 - hall / 2 - 2, w: lot.x1 - lot.x0 - 60, d: hall, h: 9, style: 'soukHall', front: 'n', name: 'Grand Souk South Hall' });
    addBuilding(city, block, { x: lot.x0 + hall / 2 + 2, z: cz, w: hall, d: lot.z1 - lot.z0 - 70, h: 9, style: 'soukHall', front: 'e', name: 'Spice Arcade' });
    addBuilding(city, block, { x: lot.x1 - hall / 2 - 2, z: cz, w: hall, d: lot.z1 - lot.z0 - 70, h: 9, style: 'soukHall', front: 'w', name: 'Copper Arcade' });
    city.openLots.push({ x0: cx - 46, z0: cz - 36, x1: cx + 46, z1: cz + 36, use: 'marketSquare', district: block.district, block: block.id, front: 's' });
    city.landmarks.push({ id: 'grandSouk', name: 'The Grand Souk', kind: 'grandSouk', x: cx, z: cz, h: 9 });
  } else if (special === 'sundial') {
    mark(addBuilding(city, block, { x: cx, z: cz, w: 12, d: 12, h: 46, style: 'clockTower', front: 's', name: 'Sundial Tower' }), 'sundialTower');
    city.openLots.push({ ...lot, use: 'sundialSquare', district: block.district, block: block.id, front: 's' });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      addBuilding(city, block, { x: cx + sx * 62, z: cz + sz * 52, w: 36, d: 30, h: rng.range(7, 11), style: 'souk', front: sz < 0 ? 'n' : 's', variant: rng.int(0, 7), tint: rng.next(), windTower: rng.chance(0.5) });
    }
  } else if (special === 'grandHotel') {
    mark(addBuilding(city, block, { x: cx, z: cz - 18, w: 120, d: 46, h: 128, style: 'grandHotel', front: 's', name: 'Mirage Grand Hotel' }), 'grandHotel');
    city.openLots.push({ x0: lot.x0, z0: cz + 14, x1: lot.x1, z1: lot.z1, use: 'hotelForecourt', district: block.district, block: block.id, front: 's' });
  } else if (special === 'haddadMotors') {
    mark(addBuilding(city, block, { x: lot.x0 + 44, z: lot.z1 - 30, w: 64, d: 40, h: 9, style: 'garage', front: 's', name: 'Haddad Motors' }), 'haddadMotors');
    addBuilding(city, block, { x: lot.x1 - 40, z: lot.z0 + 36, w: 60, d: 52, h: 8, style: 'retail', front: 'n', variant: rng.int(0, 7), tint: rng.next() });
    addBuilding(city, block, { x: lot.x0 + 36, z: lot.z0 + 30, w: 52, d: 40, h: 7, style: 'workshop', front: 'n', variant: rng.int(0, 7), tint: rng.next() });
    city.openLots.push({ x0: cx + 4, z0: cz, x1: lot.x1, z1: lot.z1, use: 'scrapYard', district: block.district, block: block.id, front: 's' });
  } else if (special === 'yachtClub') {
    mark(addBuilding(city, block, { x: cx, z: lot.z0 + 34, w: 90, d: 44, h: 16, style: 'yachtClub', front: 'n', name: 'Crescent Yacht Club' }), 'yachtClub');
    addBuilding(city, block, { x: lot.x0 + 34, z: lot.z1 - 40, w: 48, d: 56, h: 74, style: 'apartmentTower', front: 's', variant: rng.int(0, 7), tint: rng.next() });
    addBuilding(city, block, { x: lot.x1 - 34, z: lot.z1 - 40, w: 48, d: 56, h: 96, style: 'apartmentTower', front: 's', variant: rng.int(0, 7), tint: rng.next() });
  } else if (special === 'customsHouse') {
    mark(addBuilding(city, block, { x: cx - 30, z: cz, w: 70, d: 90, h: 22, style: 'customsHouse', front: 'w', name: 'Mina Customs House' }), 'customsHouse');
    stackContainerYard(city, { x0: cx + 20, z0: lot.z0, x1: lot.x1, z1: lot.z1 }, city.districtById[block.district], block, rng);
  }
}

/** Add one building to the plan and to its block. */
function addBuilding(city, block, fields) {
  const building = {
    id: city.buildings.length,
    block: block.id,
    district: block.district,
    variant: 0, tint: 0.5, front: 's', windTower: false, name: null, landmark: null,
    ...fields,
  };
  city.buildings.push(building);
  block.buildings.push(building);
  return building;
}

/** A shipping-container yard: rows of stacked containers, each a small collider. */
function stackContainerYard(city, cell, district, block, rng) {
  const length = 12.2;
  const width = 2.6;
  const alongX = rng.chance(0.5);
  const rowPitch = width + rng.pick([0.4, 3.4, 3.4]);
  const usableX = cell.x1 - cell.x0 - 16;
  const usableZ = cell.z1 - cell.z0 - 16;
  const columns = Math.floor((alongX ? usableX : usableZ) / (length + 1.2));
  const rows = Math.floor((alongX ? usableZ : usableX) / rowPitch);
  for (let r = 0; r < rows; r += 1) {
    if (r % 5 === 4) continue; // a driving lane through the yard
    for (let c = 0; c < columns; c += 1) {
      if (rng.chance(0.22)) continue;
      const along = 8 + c * (length + 1.2) + length / 2;
      const across = 8 + r * rowPitch + width / 2;
      const stack = rng.weighted([1, 2, 3], [3, 4, 2]);
      city.containers.push({
        x: alongX ? cell.x0 + along : cell.x0 + across,
        z: alongX ? cell.z0 + across : cell.z0 + along,
        w: alongX ? length : width,
        d: alongX ? width : length,
        h: stack * 2.6,
        stack,
        colorIndex: rng.int(0, 5),
        district: district.id,
        block: block.id,
      });
    }
  }
  city.openLots.push({ ...cell, use: 'containerYard', district: district.id, block: block.id, front: 's' });
}

/** A villa's garden walls on the three sides away from its street. */
function wallVillaGarden(city, cell, building, front) {
  const t = 0.5;
  const h = 2.3;
  const m = 1.5;
  const x0 = cell.x0 + m;
  const x1 = cell.x1 - m;
  const z0 = cell.z0 + m;
  const z1 = cell.z1 - m;
  if (front !== 'n') city.walls.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z0 + t, h, building: building.id });
  if (front !== 's') city.walls.push({ minX: x0, maxX: x1, minZ: z1 - t, maxZ: z1, h, building: building.id });
  if (front !== 'w') city.walls.push({ minX: x0, maxX: x0 + t, minZ: z0, maxZ: z1, h, building: building.id });
  if (front !== 'e') city.walls.push({ minX: x1 - t, maxX: x1, minZ: z0, maxZ: z1, h, building: building.id });
}

/** The lighthouse, the container ship, and what stands out in the Amber Dunes. */
function placeDesertLandmarks(city) {
  city.landmarks.push(
    { id: 'lighthouse', name: 'Crescent Light', kind: 'lighthouse', x: COAST.marina.minX - 6, z: COAST.marina.minZ + 6, h: 38, radius: 4 },
    { id: 'containerShip', name: 'MV Amber Star', kind: 'containerShip', x: 800, z: COAST.port.edgeZ - 34, h: 30, w: 240, d: 38 },
    { id: 'portCranes', name: 'Mina Gantry Cranes', kind: 'portCranes', x: 800, z: COAST.port.edgeZ + 22, h: 62, positions: [[560, 0], [720, 0], [880, 0], [1040, 0]] },
    { id: 'falconRock', name: 'Falcon Rock', kind: 'mesa', x: -420, z: 1790, h: 46, radius: 58 },
    { id: 'oasis', name: 'Ain Zahra Oasis', kind: 'oasis', x: -1180, z: 1480, h: 0, radius: 60 },
    { id: 'airfield', name: 'Sarab Airfield', kind: 'airfield', x: 820, z: 1770, h: 0, w: 60, d: 300 },
    { id: 'airfieldHangar', name: 'Hangar 2', kind: 'hangar', x: 900, z: 1680, h: 14, w: 46, d: 36 },
    { id: 'solarFarm', name: 'Sunfield Solar Array', kind: 'solarFarm', x: 1490, z: 1010, h: 3, w: 280, d: 220 },
    { id: 'wadiCircuit', name: 'Wadi Circuit Paddock', kind: 'raceway', x: -684, z: 1150, h: 6, w: 50, d: 24 },
    { id: 'shipwreck', name: 'The Rusted Dhow', kind: 'shipwreck', x: -1480, z: -800, h: 8, radius: 14 },
    { id: 'radioMast', name: 'Dune FM Mast', kind: 'mast', x: 420, z: 1560, h: 90, radius: 3 },
    { id: 'cityGate', name: 'Port Sarab Gate', kind: 'gate', x: 47, z: 900, h: 24, w: 50, d: 6 },
  );
}

/** Where the story's people, the shops, the safehouses and the side jobs are. */
function markStoryAndShopPlaces(city) {
  const add = (id, kind, name, col, row, side, along, extra) => {
    const block = city.blocks[row * COLUMNS + col];
    const spot = frontageOf(block, side, along);
    const place = { id, kind, name, district: block.district, block: block.id, ...spot, ...extra };
    city.places.push(place);
    city.placeById[id] = place;
    return place;
  };
  const addAt = (id, kind, name, x, z, heading, extra) => {
    const place = { id, kind, name, x, z, heading, curbX: x, curbZ: z, district: districtAt(city, x, z).id, ...extra };
    city.places.push(place);
    city.placeById[id] = place;
    return place;
  };

  // Homes
  add('safehouse_flat', 'safehouse', "Zayd's Flat, Al Wadi", 7, 4, 's', 0.3, { owned: true, price: 0 });
  add('safehouse_marina', 'safehouse', 'Crescent Penthouse', 1, 0, 's', 0.7, { owned: false, price: 180000 });
  addAt('safehouse_dunes', 'safehouse', 'Dune Hideout', -690, 1118, 0, { owned: false, price: 45000 });

  // The cast (letters show on the minimap)
  add('contact_faris', 'contact', 'Uncle Faris, Haddad Motors', 5, 7, 's', 0.22, { letter: 'F', person: 'faris' });
  add('contact_mina', 'contact', 'Mina, the Grand Souk', 3, 3, 's', 0.5, { letter: 'M', person: 'mina' });
  add('contact_tavi', 'contact', 'Tavi, Mina Docks', 8, 1, 'w', 0.5, { letter: 'T', person: 'tavi' });
  addAt('contact_dahan', 'contact', 'Captain Dahan, Corniche Pier', 210, -752, Math.PI, { letter: 'D', person: 'dahan' });
  add('vane_spire_door', 'landmarkDoor', 'Vane Spire Lobby', 4, 1, 's', 0.5, {});

  // Law and medicine
  add('police_hq', 'policeStation', 'PSPD Headquarters', 6, 2, 's', 0.4, {});
  add('police_docks', 'policeStation', 'PSPD Docks Precinct', 9, 2, 's', 0.5, {});
  add('police_south', 'policeStation', 'PSPD Southgate Post', 2, 7, 'n', 0.5, {});
  add('hospital', 'hospital', 'Sarab General Hospital', 6, 4, 's', 0.5, {});
  add('clinic_marina', 'hospital', 'Marina Clinic', 0, 1, 'e', 0.5, {});

  // Shops
  add('gunshop_souk', 'gunShop', 'Brass & Barrel, Old Sarab', 2, 4, 'n', 0.6, {});
  add('gunshop_docks', 'gunShop', 'Brass & Barrel, Docks', 7, 2, 's', 0.3, {});
  add('garage_haddad', 'garage', 'Haddad Motors', 5, 7, 's', 0.4, { drive: true });
  add('respray_marina', 'garage', 'Chroma Bay Respray', 0, 1, 's', 0.5, { drive: true });
  add('respray_wadi', 'garage', 'Chroma Bay Respray', 8, 5, 'n', 0.5, { drive: true });
  add('respray_lantern', 'garage', 'Chroma Bay Respray', 4, 6, 's', 0.5, { drive: true });
  add('food_corniche', 'food', 'Zaatar & Co.', 3, 0, 'n', 0.5, {});
  add('food_souk', 'food', 'Saffron Skewer', 4, 3, 's', 0.3, {});
  add('food_lantern', 'food', 'Midnight Falafel', 3, 5, 's', 0.8, {});
  add('food_wadi', 'food', 'Karak Corner', 8, 3, 's', 0.5, {});
  add('food_southgate', 'food', 'Dune Diner', 6, 7, 'n', 0.5, {});

  // Side jobs
  add('taxi_depot', 'taxiDepot', 'Sarab Cab Depot', 6, 5, 'w', 0.5, { drive: true });
  add('courier_depot', 'courierDepot', 'Swift Camel Couriers', 7, 6, 'n', 0.4, { drive: true });
  add('export_dock', 'exportDock', 'Pier 9 Export Crane', 9, 0, 'n', 0.5, { drive: true });
  add('race_corniche', 'raceStart', 'Corniche Sprint', 2, 0, 'n', 0.2, { drive: true, race: 'corniche' });
  add('race_spires', 'raceStart', 'Spires Circuit', 5, 2, 's', 0.5, { drive: true, race: 'spires' });
  add('race_docks', 'raceStart', 'Dockside Dash', 8, 2, 's', 0.6, { drive: true, race: 'docks' });
  addAt('race_dunes', 'raceStart', 'Wadi Circuit Rally', -672, 1066, 2.6, { drive: true, race: 'dunes' });
  addAt('race_highway', 'raceStart', 'Dune Highway Run', 52, 960, 0, { drive: true, race: 'highway' });
}

/** Twenty golden falcon statuettes hidden on roofs' shadows, piers, dunes and back lots. */
function scatterCollectibleFalcons(city, rng) {
  const fixed = [
    [-1016, -896], [-760, -850], [214, -790], [-240, -770], [1090, -850], [820, -846], [-420, 1748], [-1180, 1478],
    [900, 1700], [1490, 1010], [420, 1552], [-1480, -792], [40, 912],
  ];
  let index = 0;
  for (const [x, z] of fixed) {
    city.places.push({ id: `falcon_${index}`, kind: 'collectible', name: 'Golden Falcon', x, z, heading: 0, curbX: x, curbZ: z, district: districtAt(city, x, z).id });
    index += 1;
  }
  const lots = city.openLots.slice();
  rng.shuffle(lots);
  for (const lot of lots) {
    if (index >= 20) break;
    if (lot.use === 'spirePlaza' || lot.use === 'containerYard') continue;
    const x = lot.x0 + (lot.x1 - lot.x0) * rng.range(0.2, 0.8);
    const z = lot.z0 + (lot.z1 - lot.z0) * rng.range(0.2, 0.8);
    city.places.push({ id: `falcon_${index}`, kind: 'collectible', name: 'Golden Falcon', x, z, heading: 0, curbX: x, curbZ: z, district: lot.district });
    index += 1;
  }
  for (const place of city.places) city.placeById[place.id] = place;
}

/** Kerbside bays where parked cars may stand: both sides of every two-lane street. */
function layOutParkingSpots(city, rng) {
  const spacing = 7.5;
  const clear = 34;
  const addRun = (fixed, from, to, alongZ, side, kind, districtProbe) => {
    const offset = ROAD_KINDS[kind].width / 2 - 1.35;
    for (let s = from + clear; s <= to - clear; s += spacing) {
      if (!rng.chance(0.2)) continue;
      const x = alongZ ? fixed + side * offset : s;
      const z = alongZ ? s : fixed + side * offset;
      // Right-hand traffic: a car parked on a side faces the way that side drives.
      const heading = alongZ ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      city.parkingSpots.push({ x, z, heading, district: districtProbe(x, z) });
    }
  };
  const probe = (x, z) => city.districtById[DISTRICT_GRID[rowOf(z)][columnOf(x)]].id;
  for (const avenue of AVENUES) {
    if (avenue.kind !== 'street') continue;
    for (let row = 0; row < ROWS; row += 1) {
      addRun(avenue.x, STREETS[row].z, STREETS[row + 1].z, true, 1, avenue.kind, probe);
      addRun(avenue.x, STREETS[row].z, STREETS[row + 1].z, true, -1, avenue.kind, probe);
    }
  }
  for (const street of STREETS) {
    if (street.kind !== 'street') continue;
    for (let col = 0; col < COLUMNS; col += 1) {
      addRun(street.z, AVENUES[col].x, AVENUES[col + 1].x, false, 1, street.kind, probe);
      addRun(street.z, AVENUES[col].x, AVENUES[col + 1].x, false, -1, street.kind, probe);
    }
  }
}

/**
 * A point on the sidewalk in front of one side of a block ('n', 's', 'e', 'w'), `along` (0..1) of the
 * way down that side, with the heading that faces the block and the kerb point on the road beside it.
 */
function frontageOf(block, side, along) {
  const lot = block.lot;
  const walk = SIDEWALK / 2;
  const kerb = SIDEWALK + 2.2;
  if (side === 'n') {
    const x = lot.x0 + (lot.x1 - lot.x0) * along;
    return { x, z: lot.z0 - walk, heading: 0, curbX: x, curbZ: lot.z0 - kerb };
  }
  if (side === 's') {
    const x = lot.x0 + (lot.x1 - lot.x0) * along;
    return { x, z: lot.z1 + walk, heading: Math.PI, curbX: x, curbZ: lot.z1 + kerb };
  }
  if (side === 'w') {
    const z = lot.z0 + (lot.z1 - lot.z0) * along;
    return { x: lot.x0 - walk, z, heading: Math.PI / 2, curbX: lot.x0 - kerb, curbZ: z };
  }
  const z = lot.z0 + (lot.z1 - lot.z0) * along;
  return { x: lot.x1 + walk, z, heading: -Math.PI / 2, curbX: lot.x1 + kerb, curbZ: z };
}

function columnOf(x) {
  for (let i = COLUMNS - 1; i > 0; i -= 1) if (x >= AVENUES[i].x) return i;
  return 0;
}

function rowOf(z) {
  for (let j = ROWS - 1; j > 0; j -= 1) if (z >= STREETS[j].z) return j;
  return 0;
}

function distanceToRoadSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  let t = lengthSq === 0 ? 0 : ((px - ax) * abx + (pz - az) * abz) / lengthSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Width of a sidewalk, metres. */
export const SIDEWALK = 5;

/** The kinds of road: total width, lanes each way, median, speed limit (m/s). */
export const ROAD_KINDS = {
  boulevard: { width: 28, lanes: 2, median: 4, speed: 21, sidewalk: SIDEWALK },
  street: { width: 15, lanes: 1, median: 0, speed: 14, sidewalk: SIDEWALK },
  highway: { width: 22, lanes: 2, median: 2, speed: 31, sidewalk: 0 },
  track: { width: 9, lanes: 1, median: 0, speed: 17, sidewalk: 0 },
};

/** North-south roads, west to east. */
export const AVENUES = [
  { x: -1040, name: 'West Ring Road', kind: 'boulevard' },
  { x: -800, name: 'Pelican Street', kind: 'street' },
  { x: -560, name: 'Falcon Avenue', kind: 'boulevard' },
  { x: -360, name: 'Lighthouse Street', kind: 'street' },
  { x: -160, name: 'Pearl Street', kind: 'street' },
  { x: 40, name: 'Vane Boulevard', kind: 'boulevard' },
  { x: 240, name: 'Saffron Street', kind: 'street' },
  { x: 440, name: 'Copper Street', kind: 'street' },
  { x: 680, name: 'Dockside Avenue', kind: 'boulevard' },
  { x: 920, name: 'Crane Street', kind: 'street' },
  { x: 1120, name: 'East Ring Road', kind: 'boulevard' },
];

/** East-west roads, north to south. */
export const STREETS = [
  { z: -700, name: 'The Corniche', kind: 'boulevard' },
  { z: -500, name: 'Sail Street', kind: 'street' },
  { z: -300, name: 'Gold Street', kind: 'street' },
  { z: -120, name: 'Al Noor Boulevard', kind: 'boulevard' },
  { z: 60, name: 'Souk Street', kind: 'street' },
  { z: 240, name: 'Tamarind Street', kind: 'street' },
  { z: 420, name: 'Lantern Row', kind: 'boulevard' },
  { z: 620, name: 'Oasis Street', kind: 'street' },
  { z: 820, name: 'Dune Parkway', kind: 'boulevard' },
];

const COLUMNS = AVENUES.length - 1;
const ROWS = STREETS.length - 1;

/** The roads that leave the grid for the Amber Dunes, as polylines of [x, z]. */
export const DESERT_ROADS = [
  { name: 'Dune Highway', kind: 'highway', points: [[40, 820], [60, 1040], [300, 1270], [700, 1390], [1060, 1230], [1120, 820]] },
  { name: 'Wadi Road', kind: 'highway', points: [[-560, 820], [-640, 1060], [-980, 1250], [-1350, 1110], [-1420, 770], [-1040, 620]] },
  { name: 'Falcon Rock Track', kind: 'track', points: [[300, 1270], [-60, 1560], [-420, 1640], [-760, 1500], [-980, 1250]] },
  { name: 'Airfield Road', kind: 'track', points: [[700, 1390], [820, 1620]] },
];

/** The shore: the beach starts north of the Corniche promenade; the marina basin and the port quay cut into it. */
export const COAST = {
  baseZ: -810,
  beachTopZ: -720,
  marina: { minX: -1000, maxX: -640, minZ: -900, maxZ: -744, piers: [-930, -850, -770, -700], pierHalfWidth: 3, pierEndZ: -866, breakwaterHalfWidth: 7 },
  port: { minX: 480, maxX: 1160, edgeZ: -862 },
};

/** Ground that is kept flat among the dunes: [centreX, centreZ, radius]. */
export const FLAT_ZONES = [
  [820, 1770, 205], [-1180, 1480, 80], [-420, 1790, 86], [1490, 1010, 190], [-690, 1128, 72], [420, 1560, 30],
];

/** Stunt ramps: a rectangle of ground that rises along its heading to `height`. */
export const STUNT_RAMPS = [
  { id: 'ramp_beach', name: 'Beach Kicker', x: 130, z: -764, heading: -Math.PI / 2, length: 16, width: 8, height: 3.2 },
  { id: 'ramp_quay', name: 'Quay Leap', x: 1010, z: -842, heading: Math.PI / 2, length: 18, width: 9, height: 3.6 },
  { id: 'ramp_gate', name: 'Gate Jump', x: 40, z: 980, heading: 0, length: 18, width: 9, height: 3.4 },
  { id: 'ramp_dune_east', name: 'Highway Hop', x: 520, z: 1338, heading: 1.28, length: 20, width: 10, height: 4.2 },
  { id: 'ramp_wadi', name: 'Wadi Flyer', x: -820, z: 1162, heading: -1.06, length: 20, width: 10, height: 4.4 },
  { id: 'ramp_falcon', name: 'Falcon Launch', x: -250, z: 1606, heading: -1.36, length: 22, width: 10, height: 5.0 },
  { id: 'ramp_airfield', name: 'Runway Rocket', x: 820, z: 1690, heading: 0, length: 22, width: 10, height: 4.6 },
  { id: 'ramp_southgate', name: 'Parkway Pop', x: -300, z: 834, heading: Math.PI / 2, length: 16, width: 6, height: 2.6 },
];

/** The districts of Port Sarab. `traffic` names the vehicle mix; `people` weights who walks there. */
export const DISTRICTS = [
  { id: 'spires', name: 'The Spires', kind: 'downtown', traffic: 'downtown', density: 1.0, wealth: 0.9, people: { business: 5, civilian: 3, tourist: 2, local: 2, worker: 1 } },
  { id: 'marina', name: 'Marina Crescent', kind: 'marina', traffic: 'marina', density: 0.8, wealth: 1.0, people: { tourist: 4, civilian: 3, business: 2, local: 2 } },
  { id: 'oldsarab', name: 'Old Sarab', kind: 'oldtown', traffic: 'oldtown', density: 1.0, wealth: 0.4, people: { local: 6, civilian: 3, tourist: 2, worker: 1 } },
  { id: 'docks', name: 'Mina Docks', kind: 'docks', traffic: 'docks', density: 0.55, wealth: 0.3, people: { worker: 7, civilian: 2, local: 1 } },
  { id: 'jasmine', name: 'Jasmine Heights', kind: 'villas', traffic: 'villas', density: 0.5, wealth: 0.95, people: { local: 4, civilian: 3, business: 2, tourist: 1 } },
  { id: 'lantern', name: 'Lantern Row', kind: 'strip', traffic: 'strip', density: 1.0, wealth: 0.75, people: { tourist: 5, civilian: 4, business: 1, local: 2 } },
  { id: 'wadi', name: 'Al Wadi Flats', kind: 'flats', traffic: 'flats', density: 0.9, wealth: 0.35, people: { civilian: 5, local: 4, worker: 3 } },
  { id: 'southgate', name: 'Southgate', kind: 'southgate', traffic: 'flats', density: 0.6, wealth: 0.4, people: { worker: 4, civilian: 4, local: 2 } },
  { id: 'corniche', name: 'Corniche Beach', kind: 'beach', traffic: 'marina', density: 0.7, wealth: 0.8, people: { tourist: 6, civilian: 3, local: 1 } },
  { id: 'dunes', name: 'The Amber Dunes', kind: 'desert', traffic: 'desert', density: 0.25, wealth: 0.2, people: { worker: 2, local: 2, civilian: 1 } },
  { id: 'gulf', name: 'Gulf of Sarab', kind: 'sea', traffic: 'marina', density: 0, wealth: 0, people: {} },
];

/** District of each block: rows north to south, columns west to east. */
const DISTRICT_GRID = [
  ['marina', 'marina', 'spires', 'spires', 'spires', 'spires', 'spires', 'docks', 'docks', 'docks'],
  ['marina', 'marina', 'spires', 'spires', 'spires', 'spires', 'spires', 'docks', 'docks', 'docks'],
  ['jasmine', 'jasmine', 'spires', 'spires', 'spires', 'spires', 'spires', 'docks', 'docks', 'docks'],
  ['jasmine', 'jasmine', 'oldsarab', 'oldsarab', 'oldsarab', 'oldsarab', 'wadi', 'wadi', 'wadi', 'wadi'],
  ['jasmine', 'jasmine', 'oldsarab', 'oldsarab', 'oldsarab', 'oldsarab', 'wadi', 'wadi', 'wadi', 'wadi'],
  ['jasmine', 'jasmine', 'lantern', 'lantern', 'lantern', 'lantern', 'wadi', 'wadi', 'wadi', 'wadi'],
  ['southgate', 'southgate', 'lantern', 'lantern', 'lantern', 'lantern', 'southgate', 'southgate', 'southgate', 'southgate'],
  ['southgate', 'southgate', 'southgate', 'southgate', 'southgate', 'southgate', 'southgate', 'southgate', 'southgate', 'southgate'],
];

/** Blocks given over to a landmark, by "column,row". */
const SPECIAL_BLOCKS = {
  '4,1': 'vaneSpire',
  '6,2': 'policeHQ',
  '6,4': 'hospital',
  '3,3': 'grandSouk',
  '4,4': 'sundial',
  '3,5': 'grandHotel',
  '5,7': 'haddadMotors',
  '0,0': 'yachtClub',
  '8,1': 'customsHouse',
};

/** How each kind of district is built up: lots per block, how much of a lot a building fills, heights, looks. */
const BLOCK_STYLES = {
  downtown: { columns: [2, 3, 3], rows: [2, 3], gap: 10, inset: 3, insetJitter: 4, fill: [0.78, 1], minHeight: 54, maxHeight: 230, heightCurve: 1.7, openChance: 0.09, openUses: ['plaza', 'palmCourt'], styles: ['glassTower', 'steppedTower', 'officeSlab'], styleWeights: [5, 3, 2] },
  marina: { columns: [2, 3], rows: [2], gap: 12, inset: 6, insetJitter: 5, fill: [0.7, 0.92], minHeight: 36, maxHeight: 118, heightCurve: 1.2, openChance: 0.12, openUses: ['poolDeck', 'palmCourt'], styles: ['apartmentTower', 'glassTower'], styleWeights: [5, 1] },
  docks: { columns: [2], rows: [2], gap: 10, inset: 7, insetJitter: 4, fill: [0.8, 1], minHeight: 9, maxHeight: 17, heightCurve: 1, openChance: 0.08, openUses: ['truckYard'], styles: ['warehouse', 'coldStore', 'workshop'], styleWeights: [5, 2, 2] },
  villas: { columns: [3], rows: [3], gap: 0, inset: 9, insetJitter: 4, fill: [0.7, 0.95], minHeight: 6.5, maxHeight: 10, heightCurve: 1, openChance: 0.06, openUses: ['garden'], styles: ['villa'], styleWeights: [1] },
  oldtown: { columns: [4, 5], rows: [4], gap: 6, inset: 0.4, insetJitter: 1.2, fill: [0.86, 1], minHeight: 5, maxHeight: 13, heightCurve: 1.3, openChance: 0.1, openUses: ['courtyard', 'marketStalls'], styles: ['souk', 'riad'], styleWeights: [4, 2] },
  flats: { columns: [3, 4], rows: [2, 3], gap: 8, inset: 5, insetJitter: 4, fill: [0.72, 0.95], minHeight: 14, maxHeight: 38, heightCurve: 1.2, openChance: 0.12, openUses: ['parking', 'playground'], styles: ['apartmentBlock', 'balconyBlock'], styleWeights: [3, 2] },
  strip: { columns: [3], rows: [2], gap: 10, inset: 5, insetJitter: 5, fill: [0.72, 0.95], minHeight: 22, maxHeight: 86, heightCurve: 1.4, openChance: 0.14, openUses: ['parking', 'poolDeck'], styles: ['hotel', 'neonClub', 'glassTower'], styleWeights: [4, 3, 1] },
  southgate: { columns: [2, 3], rows: [2], gap: 10, inset: 8, insetJitter: 6, fill: [0.62, 0.9], minHeight: 6, maxHeight: 12, heightCurve: 1, openChance: 0.28, openUses: ['parking', 'carLot', 'truckYard'], styles: ['retail', 'workshop', 'motel'], styleWeights: [4, 3, 2] },
};
