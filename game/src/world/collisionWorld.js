// The static collision world of Port Sarab: every building, wall, container, lamp post and palm
// as a box or a round post in a spatial hash. Cars ask it for contacts, people are pushed out of
// it, bullets and the camera cast rays through it, and the police use it for line of sight.
import * as THREE from 'three';

const CELL = 40;

/** Build game.colliders. */
export function createCollisionWorld(game) {
  const cells = new Map();
  let stamp = 1;
  let count = 0;

  /** Add an axis-aligned box: {minX, minZ, maxX, maxZ, y0, y1, kind, breakable, ref}. */
  function addBox(options) {
    const collider = {
      type: 'box', minX: options.minX, minZ: options.minZ, maxX: options.maxX, maxZ: options.maxZ,
      y0: options.y0 === undefined ? 0 : options.y0, y1: options.y1 === undefined ? 10 : options.y1,
      kind: options.kind || 'building', breakable: !!options.breakable, ref: options.ref || null, stamp: 0, removed: false,
    };
    insert(collider);
    return collider;
  }

  /** Add a round post (lamp, palm trunk, bollard): {x, z, radius, y0, y1, kind, breakable, ref}. */
  function addPost(options) {
    const r = options.radius;
    const collider = {
      type: 'post', x: options.x, z: options.z, radius: r,
      minX: options.x - r, minZ: options.z - r, maxX: options.x + r, maxZ: options.z + r,
      y0: options.y0 === undefined ? 0 : options.y0, y1: options.y1 === undefined ? 6 : options.y1,
      kind: options.kind || 'post', breakable: !!options.breakable, ref: options.ref || null, stamp: 0, removed: false,
    };
    insert(collider);
    return collider;
  }

  /** Take a collider out of the world (a lamp post knocked flat). */
  function remove(collider) {
    if (!collider || collider.removed) return;
    collider.removed = true;
    count -= 1;
    forEachCell(collider.minX, collider.minZ, collider.maxX, collider.maxZ, (list) => {
      const index = list.indexOf(collider);
      if (index !== -1) list.splice(index, 1);
    }, false);
  }

  /** Every collider whose bounds touch the circle; fills and returns `out`. */
  function query(x, z, radius, out) {
    out.length = 0;
    stamp += 1;
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const list = cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i += 1) {
          const c = list[i];
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.minX > x + radius || c.maxX < x - radius || c.minZ > z + radius || c.maxZ < z - radius) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  const circleContact = { nx: 0, nz: 0, depth: 0, collider: null };
  /**
   * Move pos (x, z) out of anything static that a circle of `radius` between heights y0..y1 overlaps.
   * Returns the deepest contact {nx, nz, depth, collider} (reused object) or null when nothing touched.
   */
  function pushOutCircle(pos, radius, y0, y1) {
    let deepest = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      let touched = false;
      const x0 = Math.floor((pos.x - radius) / CELL);
      const x1 = Math.floor((pos.x + radius) / CELL);
      const z0 = Math.floor((pos.z - radius) / CELL);
      const z1 = Math.floor((pos.z + radius) / CELL);
      stamp += 1;
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cz = z0; cz <= z1; cz += 1) {
          const list = cells.get(cellKey(cx, cz));
          if (!list) continue;
          for (let i = 0; i < list.length; i += 1) {
            const c = list[i];
            if (c.stamp === stamp) continue;
            c.stamp = stamp;
            if (c.y1 < y0 || c.y0 > y1) continue;
            let nx = 0;
            let nz = 0;
            let depth = 0;
            if (c.type === 'post') {
              const dx = pos.x - c.x;
              const dz = pos.z - c.z;
              const reach = radius + c.radius;
              const d2 = dx * dx + dz * dz;
              if (d2 >= reach * reach) continue;
              const d = Math.sqrt(d2) || 0.0001;
              nx = dx / d;
              nz = dz / d;
              depth = reach - d;
            } else {
              const px = pos.x < c.minX ? c.minX : pos.x > c.maxX ? c.maxX : pos.x;
              const pz = pos.z < c.minZ ? c.minZ : pos.z > c.maxZ ? c.maxZ : pos.z;
              const dx = pos.x - px;
              const dz = pos.z - pz;
              const d2 = dx * dx + dz * dz;
              if (d2 >= radius * radius) continue;
              if (d2 > 1e-8) {
                const d = Math.sqrt(d2);
                nx = dx / d;
                nz = dz / d;
                depth = radius - d;
              } else {
                // The centre is inside the box: leave through the nearest face.
                const left = pos.x - c.minX;
                const right = c.maxX - pos.x;
                const near = pos.z - c.minZ;
                const far = c.maxZ - pos.z;
                const least = Math.min(left, right, near, far);
                if (least === left) nx = -1;
                else if (least === right) nx = 1;
                else if (least === near) nz = -1;
                else nz = 1;
                depth = least + radius;
              }
            }
            pos.x += nx * depth;
            pos.z += nz * depth;
            touched = true;
            if (depth > deepest) {
              deepest = depth;
              circleContact.nx = nx;
              circleContact.nz = nz;
              circleContact.depth = depth;
              circleContact.collider = c;
            }
          }
        }
      }
      if (!touched) break;
    }
    return deepest > 0 ? circleContact : null;
  }

  const contactPool = [];
  let contactsUsed = 0;
  function takeContact() {
    if (contactsUsed === contactPool.length) contactPool.push({ nx: 0, nz: 0, depth: 0, px: 0, pz: 0, collider: null });
    const contact = contactPool[contactsUsed];
    contactsUsed += 1;
    return contact;
  }
  const cornersX = [0, 0, 0, 0];
  const cornersZ = [0, 0, 0, 0];

  /**
   * Contacts of an oriented box (a vehicle: centre, half width, half length, heading, heights y0..y1)
   * with the static world. Fills `out` with {nx, nz, depth, px, pz, collider}; (nx, nz) points from the
   * collider toward the box, (px, pz) is where they touch. The contact objects are reused on the next call.
   */
  function boxContacts(cx, cz, halfWidth, halfLength, heading, y0, y1, out) {
    out.length = 0;
    contactsUsed = 0;
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    // forward = (s, c); left = (c, -s)
    const ex = Math.abs(s) * halfLength + Math.abs(c) * halfWidth;
    const ez = Math.abs(c) * halfLength + Math.abs(s) * halfWidth;
    cornersX[0] = cx + s * halfLength + c * halfWidth; cornersZ[0] = cz + c * halfLength - s * halfWidth;
    cornersX[1] = cx + s * halfLength - c * halfWidth; cornersZ[1] = cz + c * halfLength + s * halfWidth;
    cornersX[2] = cx - s * halfLength + c * halfWidth; cornersZ[2] = cz - c * halfLength - s * halfWidth;
    cornersX[3] = cx - s * halfLength - c * halfWidth; cornersZ[3] = cz - c * halfLength + s * halfWidth;
    const x0 = Math.floor((cx - ex) / CELL);
    const x1 = Math.floor((cx + ex) / CELL);
    const z0 = Math.floor((cz - ez) / CELL);
    const z1 = Math.floor((cz + ez) / CELL);
    stamp += 1;
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gz = z0; gz <= z1; gz += 1) {
        const list = cells.get(cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i += 1) {
          const b = list[i];
          if (b.stamp === stamp) continue;
          b.stamp = stamp;
          if (b.y1 < y0 || b.y0 > y1) continue;
          if (b.minX > cx + ex || b.maxX < cx - ex || b.minZ > cz + ez || b.maxZ < cz - ez) continue;
          if (b.type === 'post') {
            const rx = b.x - cx;
            const rz = b.z - cz;
            const lf = rx * s + rz * c;
            const ll = rx * c - rz * s;
            const qf = lf < -halfLength ? -halfLength : lf > halfLength ? halfLength : lf;
            const ql = ll < -halfWidth ? -halfWidth : ll > halfWidth ? halfWidth : ll;
            const df = lf - qf;
            const dl = ll - ql;
            const d2 = df * df + dl * dl;
            if (d2 >= b.radius * b.radius) continue;
            const contact = takeContact();
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              contact.nx = -(s * df + c * dl) / d;
              contact.nz = -(c * df - s * dl) / d;
              contact.depth = b.radius - d;
              contact.px = cx + s * qf + c * ql;
              contact.pz = cz + c * qf - s * ql;
            } else {
              const toFront = halfLength - Math.abs(lf);
              const toSide = halfWidth - Math.abs(ll);
              if (toFront < toSide) {
                const sign = lf > 0 ? -1 : 1;
                contact.nx = s * sign;
                contact.nz = c * sign;
                contact.depth = toFront + b.radius;
              } else {
                const sign = ll > 0 ? -1 : 1;
                contact.nx = c * sign;
                contact.nz = -s * sign;
                contact.depth = toSide + b.radius;
              }
              contact.px = b.x;
              contact.pz = b.z;
            }
            contact.collider = b;
            out.push(contact);
            continue;
          }
          // Separating-axis test: the world's X and Z, then the box's forward and left.
          const bcx = (b.minX + b.maxX) / 2;
          const bcz = (b.minZ + b.maxZ) / 2;
          const bhx = (b.maxX - b.minX) / 2;
          const bhz = (b.maxZ - b.minZ) / 2;
          const overlapX = ex + bhx - Math.abs(cx - bcx);
          if (overlapX <= 0) continue;
          const overlapZ = ez + bhz - Math.abs(cz - bcz);
          if (overlapZ <= 0) continue;
          const overlapF = halfLength + bhx * Math.abs(s) + bhz * Math.abs(c) - Math.abs((cx - bcx) * s + (cz - bcz) * c);
          if (overlapF <= 0) continue;
          const overlapL = halfWidth + bhx * Math.abs(c) + bhz * Math.abs(s) - Math.abs((cx - bcx) * c - (cz - bcz) * s);
          if (overlapL <= 0) continue;
          let depth = overlapX;
          let nx = cx > bcx ? 1 : -1;
          let nz = 0;
          let worldAxis = true;
          if (overlapZ < depth) {
            depth = overlapZ;
            nx = 0;
            nz = cz > bcz ? 1 : -1;
          }
          if (overlapF < depth - 0.01) {
            depth = overlapF;
            const sign = (cx - bcx) * s + (cz - bcz) * c > 0 ? 1 : -1;
            nx = s * sign;
            nz = c * sign;
            worldAxis = false;
          }
          if (overlapL < depth - 0.01) {
            depth = overlapL;
            const sign = (cx - bcx) * c - (cz - bcz) * s > 0 ? 1 : -1;
            nx = c * sign;
            nz = -s * sign;
            worldAxis = false;
          }
          const contact = takeContact();
          contact.nx = nx;
          contact.nz = nz;
          contact.depth = depth;
          contact.collider = b;
          let sumX = 0;
          let sumZ = 0;
          let n = 0;
          if (worldAxis) {
            // The box's corners pressed deepest into the collider.
            let least = Infinity;
            for (let k = 0; k < 4; k += 1) least = Math.min(least, cornersX[k] * nx + cornersZ[k] * nz);
            for (let k = 0; k < 4; k += 1) {
              if (cornersX[k] * nx + cornersZ[k] * nz <= least + 0.06) {
                sumX += cornersX[k];
                sumZ += cornersZ[k];
                n += 1;
              }
            }
          } else {
            // The collider's corners pressed deepest into the box.
            let most = -Infinity;
            for (let k = 0; k < 4; k += 1) {
              const px = k & 1 ? b.maxX : b.minX;
              const pz = k & 2 ? b.maxZ : b.minZ;
              most = Math.max(most, px * nx + pz * nz);
            }
            for (let k = 0; k < 4; k += 1) {
              const px = k & 1 ? b.maxX : b.minX;
              const pz = k & 2 ? b.maxZ : b.minZ;
              if (px * nx + pz * nz >= most - 0.06) {
                sumX += px;
                sumZ += pz;
                n += 1;
              }
            }
          }
          contact.px = sumX / n;
          contact.pz = sumZ / n;
          out.push(contact);
        }
      }
    }
    return out;
  }

  const rayHit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
  /**
   * Cast a ray (origin and unit direction with x, y, z) through the static world and the ground.
   * Returns {distance, point, normal, collider} (reused object; collider is null for the ground) or null.
   */
  function raycast(origin, direction, maxDistance) {
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;
    let best = maxDistance;
    let hitCollider = null;
    let hitNx = 0;
    let hitNy = 1;
    let hitNz = 0;
    let found = false;

    let cx = Math.floor(ox / CELL);
    let cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? CELL / Math.abs(dx) : Infinity;
    const tDeltaZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx) : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz) : Infinity;
    let travelled = 0;
    stamp += 1;
    for (let guard = 0; guard < 400 && travelled <= best; guard += 1) {
      const list = cells.get(cellKey(cx, cz));
      if (list) {
        for (let i = 0; i < list.length; i += 1) {
          const c = list[i];
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.type === 'post') {
            const a = dx * dx + dz * dz;
            if (a < 1e-9) continue;
            const fx = ox - c.x;
            const fz = oz - c.z;
            const b = fx * dx + fz * dz;
            const disc = b * b - a * (fx * fx + fz * fz - c.radius * c.radius);
            if (disc < 0) continue;
            const t = (-b - Math.sqrt(disc)) / a;
            if (t < 0 || t >= best) continue;
            const y = oy + dy * t;
            if (y < c.y0 || y > c.y1) continue;
            best = t;
            hitCollider = c;
            hitNx = (ox + dx * t - c.x) / c.radius;
            hitNy = 0;
            hitNz = (oz + dz * t - c.z) / c.radius;
            found = true;
            continue;
          }
          // Slab test against the box.
          let tNear = -Infinity;
          let tFar = Infinity;
          let axis = 0;
          if (dx !== 0) {
            let t1 = (c.minX - ox) / dx;
            let t2 = (c.maxX - ox) / dx;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tNear) { tNear = t1; axis = 0; }
            if (t2 < tFar) tFar = t2;
          } else if (ox < c.minX || ox > c.maxX) continue;
          if (dy !== 0) {
            let t1 = (c.y0 - oy) / dy;
            let t2 = (c.y1 - oy) / dy;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tNear) { tNear = t1; axis = 1; }
            if (t2 < tFar) tFar = t2;
          } else if (oy < c.y0 || oy > c.y1) continue;
          if (dz !== 0) {
            let t1 = (c.minZ - oz) / dz;
            let t2 = (c.maxZ - oz) / dz;
            if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
            if (t1 > tNear) { tNear = t1; axis = 2; }
            if (t2 < tFar) tFar = t2;
          } else if (oz < c.minZ || oz > c.maxZ) continue;
          if (tNear > tFar || tFar < 0 || tNear < 0 || tNear >= best) continue;
          best = tNear;
          hitCollider = c;
          hitNx = axis === 0 ? (dx > 0 ? -1 : 1) : 0;
          hitNy = axis === 1 ? (dy > 0 ? -1 : 1) : 0;
          hitNz = axis === 2 ? (dz > 0 ? -1 : 1) : 0;
          found = true;
        }
      }
      if (tMaxX < tMaxZ) {
        travelled = tMaxX;
        tMaxX += tDeltaX;
        cx += stepX;
      } else {
        travelled = tMaxZ;
        tMaxZ += tDeltaZ;
        cz += stepZ;
      }
    }

    // The ground: a plane in the flat city, a march over dunes and beach elsewhere.
    const terrain = game.terrain;
    if (terrain) {
      const endX = ox + dx * best;
      const endZ = oz + dz * best;
      if (terrain.isFlatCity(ox, oz) && terrain.isFlatCity(endX, endZ)) {
        if (dy < 0) {
          const t = -oy / dy;
          if (t >= 0 && t < best) {
            best = t;
            hitCollider = null;
            hitNx = 0; hitNy = 1; hitNz = 0;
            found = true;
          }
        }
      } else {
        const step = 3;
        let previous = 0;
        for (let t = step; t <= best + step; t += step) {
          const tt = t > best ? best : t;
          if (oy + dy * tt < terrain.heightAt(ox + dx * tt, oz + dz * tt)) {
            let lo = previous;
            let hi = tt;
            for (let k = 0; k < 5; k += 1) {
              const mid = (lo + hi) / 2;
              if (oy + dy * mid < terrain.heightAt(ox + dx * mid, oz + dz * mid)) hi = mid;
              else lo = mid;
            }
            best = hi;
            hitCollider = null;
            hitNx = 0; hitNy = 1; hitNz = 0;
            found = true;
            break;
          }
          previous = tt;
          if (tt === best) break;
        }
      }
    }

    if (!found) return null;
    rayHit.distance = best;
    rayHit.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
    rayHit.normal.set(hitNx, hitNy, hitNz);
    rayHit.collider = hitCollider;
    return rayHit;
  }

  const sightDirection = new THREE.Vector3();
  /** True when nothing static stands between points a and b (each with x, y, z). */
  function lineOfSight(a, b) {
    sightDirection.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const distance = sightDirection.length();
    if (distance < 0.01) return true;
    sightDirection.multiplyScalar(1 / distance);
    return raycast(a, sightDirection, distance - 0.05) === null;
  }

  /** Register the plan's buildings, garden walls, containers and landmark footprints. */
  function addCityPlan(city) {
    for (const building of city.buildings) {
      addBox({ minX: building.x - building.w / 2, maxX: building.x + building.w / 2, minZ: building.z - building.d / 2, maxZ: building.z + building.d / 2, y0: 0, y1: building.h, kind: 'building', ref: building });
    }
    for (const wall of city.walls) addBox({ minX: wall.minX, maxX: wall.maxX, minZ: wall.minZ, maxZ: wall.maxZ, y0: 0, y1: wall.h, kind: 'wall', ref: wall });
    for (const box of city.containers) {
      addBox({ minX: box.x - box.w / 2, maxX: box.x + box.w / 2, minZ: box.z - box.d / 2, maxZ: box.z + box.d / 2, y0: 0, y1: box.h, kind: 'container', ref: box });
    }
    for (const landmark of city.landmarks) {
      if (landmark.building !== undefined || landmark.h <= 0) continue;
      if (landmark.kind === 'portCranes' || landmark.kind === 'solarFarm' || landmark.kind === 'airfield' || landmark.kind === 'oasis') continue;
      if (landmark.radius) addPost({ x: landmark.x, z: landmark.z, radius: landmark.radius, y0: -10, y1: landmark.h, kind: 'landmark', ref: landmark });
      else if (landmark.w) addBox({ minX: landmark.x - landmark.w / 2, maxX: landmark.x + landmark.w / 2, minZ: landmark.z - landmark.d / 2, maxZ: landmark.z + landmark.d / 2, y0: -10, y1: landmark.h, kind: 'landmark', ref: landmark });
    }
  }

  function insert(collider) {
    count += 1;
    forEachCell(collider.minX, collider.minZ, collider.maxX, collider.maxZ, (list) => list.push(collider), true);
  }

  function forEachCell(minX, minZ, maxX, maxZ, visit, create) {
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const key = cellKey(cx, cz);
        let list = cells.get(key);
        if (!list) {
          if (!create) continue;
          list = [];
          cells.set(key, list);
        }
        visit(list);
      }
    }
  }

  return {
    addBox, addPost, remove, query, pushOutCircle, boxContacts, raycast, lineOfSight, addCityPlan,
    get count() { return count; },
  };
}

function cellKey(cx, cz) {
  return (cx + 2048) * 4096 + (cz + 2048);
}
