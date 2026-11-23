// One list of the places and things worth pointing at: mission goals, shops, police units, races.
// The minimap draws each marker as a blip, the world shows a light beacon where `beacon` is set,
// and the GPS routes to whichever marker has `route: true`.

let nextMarkerId = 1;

/**
 * @typedef {Object} MapMarker
 * @property {number} id
 * @property {string} kind  'mission' | 'objective' | 'contact' | 'shop' | 'garage' | 'safehouse' | 'police' |
 *                          'enemy' | 'friend' | 'race' | 'activity' | 'pickup' | 'vehicle' | 'hospital' | 'waypoint'
 * @property {{x:number,y:number,z:number}} [pos]  fixed world position, or
 * @property {{pos:{x:number,y:number,z:number}}} [entity]  an entity to follow (a vehicle or a character)
 * @property {string} [label]   short text for the map screen
 * @property {string} [letter]  a single letter drawn in the blip (contacts)
 * @property {number} [color]   0xRRGGBB
 * @property {boolean} [beacon] show a tall light beacon and ground ring in the world
 * @property {number} [radius]  beacon ring radius in metres (default 3)
 * @property {boolean} [route]  draw the GPS route to it
 * @property {boolean} [edge]   keep the blip on the minimap's edge when it is out of range
 * @property {boolean} [flash]  blink (police during a pursuit)
 */

/** Create the shared marker list (game.markers). */
export function createMarkerRegistry(events) {
  /** @type {MapMarker[]} */
  const list = [];

  /** Add a marker; returns it (keep it to move or remove it later). */
  function add(options) {
    const marker = { id: nextMarkerId, radius: 3, color: 0xffd24a, edge: true, ...options };
    nextMarkerId += 1;
    list.push(marker);
    if (events) events.emit('marker:added', marker);
    return marker;
  }

  function remove(marker) {
    if (!marker) return;
    const index = list.indexOf(marker);
    if (index === -1) return;
    list.splice(index, 1);
    if (events) events.emit('marker:removed', marker);
  }

  /** Remove every marker whose `owner` is the given value (a mission clears its own on ending). */
  function removeByOwner(owner) {
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].owner === owner) remove(list[i]);
  }

  /** The marker's current world position (its own, or its entity's). */
  function positionOf(marker) {
    return marker.entity ? marker.entity.pos : marker.pos;
  }

  /** The marker the GPS should route to, if any. */
  function routeTarget() {
    for (let i = list.length - 1; i >= 0; i -= 1) if (list[i].route) return list[i];
    return null;
  }

  return { list, add, remove, removeByOwner, positionOf, routeTarget };
}
