// The staged scenes behind ?shot=<name>: each one puts the real game into a telling moment using
// its real systems (the job is really running, the police really pursue, the HUD shows what it
// would show), lets it play, then freezes the frame so a screenshot is the same every time.
// Nothing here draws anything: the picture is the game's own renderer and HUD.

/** Stage the named scene, then set window.shotReady once the frozen frame has settled. */
export async function stageScreenshot(game, name) {
  const scene = SCREENSHOT_SCENES[name] || SCREENSHOT_SCENES.chase;
  const stage = createStage(game);
  game.menus.closeAll();
  game.cameraRig.setCinematic(null);
  game.mode = 'playing';
  game.input.enabled = false;
  game.time.paused = true; // the scene steps the game itself, so every take plays out the same
  game.time.clockRate = 0;
  game.settings.quality = 'high'; // a still frame can afford the full shadow map
  game.events.emit('settings:changed', { settings: game.settings, key: 'quality' });
  game.hud.show();
  await scene(game, stage);
  game.staging = null;
  game.time.paused = true;
  game.time.frozen = true; // subtitles and banners on screen stay while the frame is held
  game.cityFurniture.refresh();
  await stage.frames(50); // let the minimap tiles, shadows and textures finish drawing
  window.shotReady = true;
}

/** The scenes by name. */
export const SCREENSHOT_SCENES = {
  chase: getawayRehearsalUnderPursuit,
  dunes: buggyEscapeOverTheDunes,
  storm: vaneJobGunfightInTheKhamsin,
  title: titleScreenOverTheSpiresAtDusk,
};

/**
 * Job six, "Sand Tax": Faris's Dune Jackal buggy flying off a dune crest toward the hideout with the
 * Jackals' pickups on its tail and Port Sarab on the horizon.
 */
async function buggyEscapeOverTheDunes(game, stage) {
  game.missions.start('sand_tax', { resumeFrom: 'escape' });
  await stage.playUntil(() => game.player.vehicle && game.missions.active && game.markers.routeTarget(), 30, () => {
    if (game.cutscenes.playing) game.cutscenes.skip();
  });
  const buggy = game.player.vehicle;
  stage.driveToRouteTarget(buggy, 27);
  await stage.play(4);
  // Fly: play on until the buggy has left a crest and is well clear of the sand.
  await stage.playUntil(() => !buggy.grounded && buggy.pos.y - game.terrain.heightAt(buggy.pos.x, buggy.pos.z) > 0.9, 22);
  const chasers = game.vehicles.list
    .filter((vehicle) => vehicle !== buggy && vehicle.tags.mission && vehicle.driver && !vehicle.wrecked)
    .sort((a, b) => a.pos.distanceToSquared(buggy.pos) - b.pos.distanceToSquared(buggy.pos));
  stage.formUp(buggy, chasers, [[7, 7.5, -0.07], [-5.5, 9.5, 0.06]]);
  game.cameraRig.setDistance(2); // the close chase camera
  game.cameraRig.holdView(buggy.heading + 0.3, 0.1);
  game.cameraRig.snap();
  await stage.play(0.55); // long enough for the chasers to throw up their sand
}

/**
 * Job ten, "The Vane Job": the finale, fought across the Vane Spire's plaza inside the khamsin,
 * Zayd aiming at Vane's guards through the blowing sand.
 */
async function vaneJobGunfightInTheKhamsin(game, stage) {
  game.missions.start('the_vane_job', { resumeFrom: 'plaza' });
  const guards = () => game.characters.list.filter((person) => person.alive && person !== game.player.character && game.weapons.ai.isEngaged(person));
  await stage.playUntil(() => game.missions.active && guards().length >= 2 && game.weather.sandstorm > 0.85, 60, () => {
    if (game.cutscenes.playing) game.cutscenes.skip();
    if (game.phone.ringing) game.phone.answer();
  });
  const zayd = game.player.character;
  zayd.tags.invulnerable = true;
  await stage.play(2.5);
  const nearest = () => guards().sort((a, b) => a.pos.distanceToSquared(zayd.pos) - b.pos.distanceToSquared(zayd.pos))[0];
  // Up to the planters, as Tavi shouts, until the nearest guard is a pistol shot away.
  const first = nearest();
  if (first) {
    stage.runToward(zayd, first.pos);
    await stage.play(1.4);
    await stage.playUntil(() => zayd.pos.distanceTo(first.pos) < 13, 3);
  }
  const target = nearest();
  if (target) {
    const yaw = Math.atan2(target.pos.x - zayd.pos.x, target.pos.z - zayd.pos.z);
    game.cameraRig.holdView(yaw, 0.05);
    stage.aimAndFire(zayd, yaw, 0.02);
    await stage.play(1.1);
    // Stop on the frame a round leaves the rifle, with its flash and tracer in the air.
    const rounds = () => {
      const held = zayd.weapons[zayd.weaponIndex];
      return held ? (held.clip || 0) + (held.ammo || 0) : 0;
    };
    let before = rounds();
    await stage.playUntil(() => {
      const now = rounds();
      const fired = now < before;
      before = now;
      return fired;
    }, 1.5);
  }
  zayd.tags.invulnerable = false;
}

/**
 * The cover: job seven, "Dress Rehearsal", as it is played, seen over the bonnet with the camera
 * swung round to look back up Vane Boulevard. Three stars locked on, the clock running to the Gate,
 * PSPD strung out behind the getaway car, Shaheen-1 low over them and The Spires filling the sky.
 */
async function getawayRehearsalUnderPursuit(game, stage) {
  game.missions.start('dress_rehearsal', { resumeFrom: 'door' });
  // The job's own opening at the Spire door: the tip-off scene, the handler's call, then three stars.
  await stage.playUntil(() => game.wanted.level >= 3 && game.missions.active && game.missions.active.timer, 70, () => {
    if (game.cutscenes.playing) game.cutscenes.skip();
    if (game.phone.ringing) game.phone.answer();
  });
  const car = game.player.vehicle;
  const lane = 36.25; // the inner southbound lane of Vane Boulevard (its centre line is x = 40)
  game.vehicles.place(car, lane, -292, 0);
  game.cameraRig.setYaw(0);
  game.cameraRig.snap();
  game.traffic.density = 2; // rush hour on the boulevard
  game.traffic.populateNow();
  await stage.play(0.1);
  // Keep the two southbound lanes ahead clear for the run; the northbound side keeps its traffic.
  for (let z = -285; z <= 40; z += 16) game.traffic.clearArea(lane - 2.6, z, 8.5, 30);
  stage.driveAlong(car, [{ x: lane, z: -230 }, { x: lane, z: -170 }, { x: lane, z: -90 }, { x: lane, z: 40 }], 22);
  // Run the first planned junction, Pearl Street, and take the picture a few car lengths beyond it,
  // as dispatch calls the suspect's position.
  await stage.playUntil(() => car.pos.z > -112, 12);
  game.policeRadio.reportNow('update');
  await stage.playUntil(() => car.pos.z > -96, 3);
  // Slots are [metres to the car's left, metres ahead (negative is behind), heading offset].
  stage.gatherPursuit(car, [[-3.7, -8.5, 0.03], [0.3, -20, -0.02], [-3.5, -32, 0.02], [0.2, -47, 0]]);
  await stage.play(0.4);
  game.effects.clear(); // the dust of setting the stage, not of the chase
  game.pedestrians.refill();
  await stage.play(0.1);
  game.policeHelicopter.stageAt({
    x: car.pos.x + 4, y: 12, z: car.pos.z - 25, heading: 0.9, pitch: 0.12, roll: 0.12,
    aimX: car.pos.x, aimZ: car.pos.z - 2, light: true,
  });
  game.cameraRig.holdView(Math.PI - 0.45, 0.08);
  game.cameraRig.snap();
  await stage.play(0.3);
}

/** The start screen: the main menu over The Spires as the windows light up at dusk. */
async function titleScreenOverTheSpiresAtDusk(game, stage) {
  stage.setClock(18.75);
  game.player.teleport(62, -420, 0);
  game.traffic.populateNow();
  game.pedestrians.refill();
  await stage.play(4);
  game.cameraRig.setCinematic({ position: { x: 330, y: 74, z: -905 }, lookAt: { x: -40, y: 96, z: -410 }, fov: 46 });
  game.mode = 'menu';
  game.hud.hide();
  game.menus.showMainMenu();
  await stage.play(0.2);
}

/** The tools a scene directs the game with. */
function createStage(game) {
  let route = null;
  const stage = {
    /** Fix the time of day. */
    setClock(hour) {
      game.time.hour = hour;
      game.sky.setHour(hour);
    },
    /** Put the player at the wheel of a new car. */
    putPlayerInCar(specId, x, z, heading, color) {
      game.player.teleport(x + 3, z, heading);
      const car = game.vehicles.spawn(specId, { x, z, heading, color });
      car.tags.owned = true;
      game.player.putInVehicle(car);
      game.cameraRig.setYaw(heading);
      game.cameraRig.snap();
      return car;
    },
    /** Have a car follow a list of points at a speed (metres per second) from now on. */
    driveAlong(car, points, speed) {
      route = { car, points, speed, index: 0 };
      game.staging = { update: followRoute };
    },
    /** Have a car chase the job's current GPS target (its next checkpoint) from now on. */
    driveToRouteTarget(car, speed) {
      game.staging = {
        update() {
          const marker = game.markers.routeTarget();
          if (!marker) return;
          const goal = game.markers.positionOf(marker);
          game.vehicles.autopilot.driveToward(car, goal.x, goal.z, speed, { holdPace: true, allowReverse: false });
        },
      };
    },
    /** Have a person run toward a point (a live position works: they follow it) from now on. */
    runToward(person, point) {
      game.staging = {
        update() {
          const dx = point.x - person.pos.x;
          const dz = point.z - person.pos.z;
          const distance = Math.hypot(dx, dz) || 1;
          const intent = person.intent;
          intent.aim = false;
          intent.fire = false;
          intent.moveX = dx / distance;
          intent.moveZ = dz / distance;
          intent.pace = 'run';
        },
      };
    },
    /** Have a person on foot hold an aim along a heading and keep the trigger pulled. */
    aimAndFire(person, yaw, pitch) {
      game.staging = {
        update() {
          const intent = person.intent;
          intent.moveX = 0;
          intent.moveZ = 0;
          intent.aim = true;
          intent.aimYaw = yaw;
          intent.aimPitch = pitch;
          intent.fire = true;
        },
      };
    },
    /**
     * Put vehicles into formation round a car at its speed: each slot is
     * [metres to its left, metres ahead of it (negative is behind), heading offset].
     */
    formUp(car, vehicles, slots) {
      const sin = Math.sin(car.heading);
      const cos = Math.cos(car.heading);
      for (let i = 0; i < slots.length && i < vehicles.length; i += 1) {
        const vehicle = vehicles[i];
        const [left, ahead, turn] = slots[i];
        game.vehicles.place(vehicle, car.pos.x + sin * ahead + cos * left, car.pos.z + cos * ahead - sin * left, car.heading + turn);
        const speed = Math.abs(car.speed);
        vehicle.vel.set(Math.sin(vehicle.heading) * speed, 0, Math.cos(vehicle.heading) * speed);
        vehicle.speed = speed;
        vehicle.controls.throttle = 1;
        game.vehicles.wake(vehicle);
      }
    },
    /** Let the whole game run for some seconds of its own time (job scripts get their turns between steps). */
    async play(seconds) {
      for (let t = 0; t < seconds; t += 1 / 60) {
        game.loop.stepOnce(1 / 60, 1 / 60);
        await null;
      }
    },
    /** Let the game run until something is true (or `limit` seconds pass), doing `each` between steps. */
    async playUntil(condition, limit, each) {
      for (let t = 0; t < limit; t += 1 / 60) {
        if (condition()) return true;
        if (each) each();
        game.loop.stepOnce(1 / 60, 1 / 60);
        await null;
      }
      return false;
    },
    /** Wait for real frames to be drawn. */
    frames(count) {
      return new Promise((resolve) => {
        let left = count;
        const tick = () => {
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    /**
     * Bring the nearest pursuing police cars into formation round a car, at its speed: each slot is
     * [metres to its left, metres ahead of it (negative is behind), heading offset].
     */
    gatherPursuit(car, slots) {
      const sin = Math.sin(car.heading);
      const cos = Math.cos(car.heading);
      const units = game.police.units
        .filter((unit) => unit.vehicle && !unit.vehicle.wrecked && !unit.vehicle.tags.roadblock)
        .sort((a, b) => a.vehicle.pos.distanceToSquared(car.pos) - b.vehicle.pos.distanceToSquared(car.pos));
      for (let i = 0; i < slots.length && i < units.length; i += 1) {
        const vehicle = units[i].vehicle;
        const [left, ahead, turn] = slots[i];
        const x = car.pos.x + sin * ahead + cos * left;
        const z = car.pos.z + cos * ahead - sin * left;
        game.vehicles.place(vehicle, x, z, car.heading + turn);
        const speed = Math.abs(car.speed) + 1;
        vehicle.vel.set(Math.sin(vehicle.heading) * speed, 0, Math.cos(vehicle.heading) * speed);
        vehicle.speed = speed;
        vehicle.controls.siren = true;
        vehicle.controls.throttle = 1;
        game.vehicles.wake(vehicle);
      }
      return units.length;
    },
  };

  function followRoute() {
    if (!route) return;
    const { car, points } = route;
    let target = points[route.index];
    while (route.index < points.length - 1 && Math.hypot(target.x - car.pos.x, target.z - car.pos.z) < 22) {
      route.index += 1;
      target = points[route.index];
    }
    game.vehicles.autopilot.driveToward(car, target.x, target.z, route.speed, { holdPace: true, allowReverse: false });
  }

  return stage;
}
