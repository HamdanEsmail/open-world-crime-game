// The wheel every vehicle in Port Sarab rolls on: a chunky tyre with a rounded shoulder and a deep
// sidewall, and a five-spoke rim in light metal (tinted per model) over a dark recess. Built once at unit
// radius and unit width with its face toward +X, then scaled per vehicle by the renderer.
import * as THREE from 'three';
import { createShapeKit } from './vehicleShapeKit.js';

const SEGMENTS = 14;

/**
 * Build the shared wheel: x from -0.5 (inner) to +0.5 (outer face), radius 1 around the X axis.
 * @returns {THREE.BufferGeometry}
 */
export function buildWheelGeometry() {
  const kit = createShapeKit({ length: 2, width: 1, height: 2 });
  buildTyre(kit);
  buildRim(kit);
  return kit.finalize();
}

/** The tyre: a lathe of the cross-section around the axle, closed at the back. */
function buildTyre(kit) {
  const profile = [[0.5, 0.68], [0.5, 0.86], [0.4, 0.99], [-0.4, 0.99], [-0.5, 0.86], [-0.5, 0.68]];
  const edgeParts = ['tyreWall', 'tyre', 'tyre', 'tyre', 'tyreWall'];
  const groups = edgeParts.map(() => kit.newGroup());
  for (let j = 0; j < profile.length - 1; j += 1) {
    const [x0, r0] = profile[j];
    const [x1, r1] = profile[j + 1];
    const mx = (x0 + x1) / 2;
    const mr = (r0 + r1) / 2 - 0.83;
    for (let k = 0; k < SEGMENTS; k += 1) {
      const a0 = (k / SEGMENTS) * Math.PI * 2;
      const a1 = ((k + 1) / SEGMENTS) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const hint = [mx, mr * Math.cos(am), mr * Math.sin(am)];
      kit.quad(ring(x0, r0, a0), ring(x0, r0, a1), ring(x1, r1, a1), ring(x1, r1, a0), edgeParts[j], hint, groups[j]);
    }
  }
  disc(kit, -0.5, 0.68, 'tyreWall', [-1, 0, 0]);
}

/** The rim: outer lip, a dark barrel and recess, five spokes and a hub. */
function buildRim(kit) {
  const lip = kit.newGroup();
  const barrel = kit.newGroup();
  for (let k = 0; k < SEGMENTS; k += 1) {
    const a0 = (k / SEGMENTS) * Math.PI * 2;
    const a1 = ((k + 1) / SEGMENTS) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    kit.quad(ring(0.47, 0.57, a0), ring(0.47, 0.57, a1), ring(0.5, 0.68, a1), ring(0.5, 0.68, a0), 'rim', [1, 0.2 * Math.cos(am), 0.2 * Math.sin(am)], lip);
    kit.quad(ring(0.47, 0.57, a0), ring(0.47, 0.57, a1), ring(0.12, 0.6, a1), ring(0.12, 0.6, a0), 'rimRecess', [0, -Math.cos(am), -Math.sin(am)], barrel);
  }
  disc(kit, 0.16, 0.62, 'rimRecess', [1, 0, 0]);
  for (let s = 0; s < 5; s += 1) {
    const angle = (s / 5) * Math.PI * 2 + Math.PI / 2;
    kit.box(0.4, Math.cos(angle) * 0.36, Math.sin(angle) * 0.36, 0.08, 0.46, 0.13, 'rim', { rx: angle });
  }
  const hub = new THREE.CylinderGeometry(0.13, 0.16, 0.14, 6, 1, false);
  hub.rotateZ(-Math.PI / 2);
  hub.translate(0.43, 0, 0);
  kit.addGeometry(hub, () => {}, 'rim');
}

/** A flat fan disc at x of the given radius, facing along `hint`. */
function disc(kit, x, radius, part, hint) {
  const group = kit.newGroup();
  for (let k = 0; k < SEGMENTS; k += 1) {
    const a0 = (k / SEGMENTS) * Math.PI * 2;
    const a1 = ((k + 1) / SEGMENTS) * Math.PI * 2;
    kit.triangle([x, 0, 0], ring(x, radius, a0), ring(x, radius, a1), part, hint, group);
  }
}

/** A point at axial position x and radius r, angle a around the X axis. */
function ring(x, r, a) {
  return [x, Math.cos(a) * r, Math.sin(a) * r];
}
