// The event bus every system talks through, so no system has to import another.
// game.events.on('crime', handler) / game.events.emit('crime', payload).

/** Create the publish/subscribe hub shared by all game systems. */
export function createEventBus() {
  const handlers = new Map();

  /** Subscribe; returns a function that unsubscribes. */
  function on(name, handler) {
    let list = handlers.get(name);
    if (!list) {
      list = [];
      handlers.set(name, list);
    }
    list.push(handler);
    return () => off(name, handler);
  }

  function off(name, handler) {
    const list = handlers.get(name);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index !== -1) list.splice(index, 1);
  }

  /** Subscribe for a single delivery. */
  function once(name, handler) {
    const stop = on(name, (payload) => {
      stop();
      handler(payload);
    });
    return stop;
  }

  /** Deliver to every subscriber. A handler that throws is reported and never stops the others. */
  function emit(name, payload) {
    const list = handlers.get(name);
    if (!list || list.length === 0) return;
    const snapshot = list.length === 1 ? list : list.slice();
    for (let i = 0; i < snapshot.length; i += 1) {
      try {
        snapshot[i](payload);
      } catch (error) {
        console.error(`event "${name}" handler failed`, error);
      }
    }
  }

  return { on, off, once, emit };
}
