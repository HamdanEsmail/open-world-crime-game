// The frame loop: measures time, clamps long frames, keeps the in-game clock, and calls the game's
// update and render once per animation frame. It also keeps the frame-rate figure the pause menu shows.

/**
 * Start the loop. `update(dt)` runs while the game is not paused; `render()` always runs.
 * Returns { stop, stepOnce } (stepOnce advances a fixed time for staged screenshots).
 */
export function startGameLoop(game, update, render) {
  const time = game.time;
  let last = performance.now();
  let running = true;
  let fpsFrames = 0;
  let fpsSince = last;

  function advance(dt) {
    time.dt = dt;
    time.elapsed += dt;
    time.frame += 1;
    const dark = time.hour >= 20.5 || time.hour < 5.5;
    time.hour = (time.hour + ((dt * 24) / game.config.dayLengthSeconds) * time.clockRate * (dark ? game.config.nightClockRate : 1)) % 24;
    update(dt);
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const rawDt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time.realDt = rawDt;
    if (!time.paused) advance(rawDt * time.scale);
    render();
    game.input.endFrame();
    fpsFrames += 1;
    if (now - fpsSince >= 500) {
      time.fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
    }
  }

  requestAnimationFrame(frame);
  return {
    stop() {
      running = false;
    },
    /** Advance the simulation by `seconds` in fixed steps without waiting for frames. */
    stepOnce(seconds, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) advance(step);
    },
  };
}
