// The staged scenes behind ?shot=<name>: each one puts the real game into a telling moment using
// its real systems (the player drives, the police really pursue, the job is really running), lets
// it play for a few seconds, then freezes the frame so a screenshot is the same every time.
// Nothing here draws anything: the picture is the game's own renderer and HUD.

/** Stage the named scene, then set window.shotReady once the frame has settled. */
export async function stageScreenshot(game, name) {
  const scene = SCREENSHOT_SCENES[name] || SCREENSHOT_SCENES.chase;
  const stage = createStage(game);
  game.menus.closeAll();
  game.cameraRig.setCinematic(null);
  game.mode = 'playing';
  game.input.enabled = false;
  game.time.clockRate = 0;
  game.hud.show();
  await scene(game, stage);
  game.staging = null;
  game.cityFurniture.refresh();
  await stage.frames(45); // let the minimap tiles, shadows and particles finish drawing
  game.time.paused = true;
  await stage.frames(4);
  window.shotReady = true;
}

/** The scenes by name. */
export const SCREENSHOT_SCENES = {
  chase: policeChaseDownVaneBoulevard,
  title: titleScreenOverTheSpiresAtDusk,
};

/** The start screen: the main menu over The Spires as the windows light up at dusk. */
async function titleScreenOverTheSpiresAtDusk(game, stage) {
  stage.setClock(18.75);
  game.player.teleport(62, -420, 0);
  game.traffic.populateNow();
  game.pedestrians.refill();
  stage.play(4);
  game.cameraRig.setCinematic({ position: { x: 330, y: 74, z: -905 }, lookAt: { x: -40, y: 96, z: -410 }, fov: 46 });
  game.mode = 'menu';
  game.hud.hide();
  game.menus.showMainMenu();
  stage.play(0.2);
}

/**
 * The cover: a four-star pursuit down Vane Boulevard at golden hour, seen looking back past the
 * player's Sirocco at the PSPD cars, the helicopter Shaheen-1 and the Vane Spire.
 */
async function policeChaseDownVaneBoulevard(game, stage) {
  stage.setClock(17.6);
  const lane = 36.25; // the inner southbound lane of Vane Boulevard (x = 40)
  const car = stage.putPlayerInCar('kestrel_sirocco', lane, -470, 0, 0xe4572e);
  game.pedestrians.refill();
  stage.driveAlong(car, [{ x: lane, z: -330 }, { x: lane, z: -150 }, { x: lane, z: 20 }, { x: lane, z: 200 }], 23);
  stage.play(2);
  game.wanted.set(4);
  game.wanted.lock(4);
  stage.play(15);
  stage.gatherPursuit(car, [[-3.4, -17, 0.08], [3.6, -27, -0.05], [-0.4, -41, 0]]);
  game.policeHelicopter.stageAt({
    x: car.pos.x + 13, y: 27, z: car.pos.z - 46, heading: 0.25, pitch: 0.16, roll: -0.06,
    aimX: car.pos.x, aimZ: car.pos.z, light: true,
  });
  game.cameraRig.holdView(Math.PI + 0.36, 0.06);
  game.cameraRig.snap();
  stage.play(0.7);
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
    /** Let the whole game run for some seconds of its own time. */
    play(seconds) {
      game.loop.stepOnce(seconds, 1 / 60);
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
     * Bring the nearest pursuing police cars into formation behind a car: each slot is
     * [metres to the left, metres ahead (negative is behind), heading offset].
     */
    gatherPursuit(car, slots) {
      const sin = Math.sin(car.heading);
      const cos = Math.cos(car.heading);
      const units = game.police.units
        .filter((unit) => unit.vehicle && !unit.vehicle.wrecked)
        .sort((a, b) => a.vehicle.pos.distanceToSquared(car.pos) - b.vehicle.pos.distanceToSquared(car.pos));
      for (let i = 0; i < slots.length && i < units.length; i += 1) {
        const vehicle = units[i].vehicle;
        const [left, ahead, turn] = slots[i];
        const x = car.pos.x + sin * ahead + cos * left;
        const z = car.pos.z + cos * ahead - sin * left;
        game.vehicles.place(vehicle, x, z, car.heading + turn);
        const speed = Math.abs(car.speed) + 1.5;
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
