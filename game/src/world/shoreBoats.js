// The boats moored in Marina Crescent: motor yachts with flybridges, sailing yachts with furled sails,
// and small launches, white hulls under teal or coral canopies, berthed along the piers and the
// breakwater walls. All of them are one mesh; they bob, roll and pitch on the swell in the vertex
// shader, so the only work each frame is advancing one clock.
import * as THREE from 'three';
import { createPropBuilder } from './groundPropBuilder.js';

const HULL = 0xfbfaf6;
const BOTTOM = 0x243048;
const TEAK = 0xc89a64;
const GLASS = 0x1e2a36;
const CANOPIES = [0x1ba39c, 0xe4572e, 0x1ba39c, 0x2c6cb4, 0xe4572e, 0xf0b64c];

/**
 * Moor about twenty boats along the marina's piers and breakwater walls.
 * @returns {{ mesh: THREE.Mesh|null, boats: Object[], update: (dt:number) => void }}
 */
export function createMooredBoats(game) {
  const marina = game.city.coast.marina;
  const seaLevel = game.config.world.seaLevel;
  const rng = game.rng.fork('marina-boats');
  const props = createPropBuilder();
  const boats = [];
  const lines = [];
  for (const px of marina.piers) {
    lines.push({ x: px - marina.pierHalfWidth, side: -1 }, { x: px + marina.pierHalfWidth, side: 1 });
  }
  lines.push({ x: marina.minX + marina.breakwaterHalfWidth, side: 1 }, { x: marina.maxX - marina.breakwaterHalfWidth, side: -1 });
  for (const line of lines) {
    let z = marina.pierEndZ + 4;
    while (z < marina.maxZ - 10) {
      const kind = rng.weighted(['motor', 'sail', 'launch'], [4, 3, 2]);
      const length = kind === 'motor' ? rng.range(18, 28) : kind === 'sail' ? rng.range(12, 17) : rng.range(8, 11);
      const beam = kind === 'motor' ? length * 0.25 : kind === 'sail' ? length * 0.3 : length * 0.36;
      if (z + length > marina.maxZ - 4) break;
      if (rng.chance(0.42)) {
        const x = line.x + line.side * (beam / 2 + 0.9);
        const cz = z + length / 2;
        const heading = rng.chance(0.5) ? 0 : Math.PI;
        const canopy = rng.pick(CANOPIES);
        const phase = rng.range(0, 40);
        props.tagged([x, cz, phase], () => {
          props.with(x, seaLevel, cz, heading, 0, 0, () => {
            if (kind === 'motor') buildMotorYacht(props, length, beam, canopy);
            else if (kind === 'sail') buildSailingYacht(props, length, beam, canopy);
            else buildLaunch(props, length, beam, canopy);
          });
        });
        boats.push({ kind, x, z: cz, length, beam, heading });
      }
      z += length + rng.range(2.5, 5);
    }
  }
  const time = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.boatTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 boatPivot;
        uniform float boatTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float t = boatTime + boatPivot.z;
          vec3 pivot = vec3(boatPivot.x, ${seaLevel.toFixed(2)}, boatPivot.y);
          vec3 rel = transformed - pivot;
          float roll = 0.03 * sin(t * 1.05) + 0.012 * sin(t * 2.3 + 1.0);
          float pitch = 0.014 * sin(t * 0.83 + 1.7);
          rel.xy = vec2(cos(roll) * rel.x - sin(roll) * rel.y, sin(roll) * rel.x + cos(roll) * rel.y);
          rel.zy = vec2(cos(pitch) * rel.z - sin(pitch) * rel.y, sin(pitch) * rel.z + cos(pitch) * rel.y);
          transformed = pivot + rel;
          transformed.y += 0.1 * sin(t * 0.9 + 0.6);
        }`);
  };
  material.customProgramCacheKey = () => 'port-sarab-bobbing-boats';
  const mesh = props.build(material, 'shore-moored-boats', 'boatPivot', 3);
  if (mesh) mesh.frustumCulled = true;
  return {
    mesh,
    boats,
    /** Advance the swell. */
    update(dt) {
      time.value += dt;
    },
  };
}

/**
 * A boat hull lofted from a deck outline: stations from stern (z = -L/2) to bow (+L/2), white topsides
 * over a dark bottom, a teak or white deck.
 */
function buildHull(props, length, beam, freeboard, deckColour, stripe) {
  const stations = 9;
  const outline = [];
  for (let i = 0; i <= stations; i += 1) {
    const t = i / stations;
    const z = -length / 2 + length * t;
    const bow = t > 0.6 ? Math.pow(Math.cos(((t - 0.6) / 0.4) * Math.PI * 0.5), 0.75) : 1;
    const stern = t < 0.08 ? 0.86 + t * 1.75 : 1;
    const half = (beam / 2) * Math.max(0.02, bow) * stern;
    const sheer = freeboard + (t > 0.7 ? (t - 0.7) * 1.6 : 0);
    outline.push({ z, half, sheer });
  }
  const keel = -0.75;
  for (let i = 0; i < stations; i += 1) {
    const a = outline[i];
    const b = outline[i + 1];
    for (const side of [-1, 1]) {
      const ax = side * a.half;
      const bx = side * b.half;
      const quad = (p0, p1, p2, p3, colour) => (side > 0 ? props.quad(p0, p1, p2, p3, colour) : props.quad(p1, p0, p3, p2, colour));
      quad([ax * 0.7, keel, a.z], [bx * 0.7, keel, b.z], [bx, 0.05, b.z], [ax, 0.05, a.z], BOTTOM);
      quad([ax, 0.05, a.z], [bx, 0.05, b.z], [bx, b.sheer - 0.22, b.z], [ax, a.sheer - 0.22, a.z], HULL);
      quad([ax, a.sheer - 0.22, a.z], [bx, b.sheer - 0.22, b.z], [bx, b.sheer, b.z], [ax, a.sheer, a.z], stripe);
    }
    props.quad([-a.half, a.sheer, a.z], [-b.half, b.sheer, b.z], [b.half, b.sheer, b.z], [a.half, a.sheer, a.z], deckColour);
  }
  const s = outline[0];
  props.quad([s.half, keel, s.z], [-s.half, keel, s.z], [-s.half, s.sheer, s.z], [s.half, s.sheer, s.z], HULL);
}

/** A motor yacht: long white hull, a two-level superstructure with tinted glass and a canopied flybridge. */
function buildMotorYacht(props, length, beam, canopy) {
  const freeboard = 1.5;
  buildHull(props, length, beam, freeboard, TEAK, canopy);
  const cabinLength = length * 0.48;
  const cz = -length * 0.06;
  const w = beam * 0.72;
  props.box(0, freeboard + 0.9, cz, w, 1.8, cabinLength, HULL);
  props.box(0, freeboard + 1.15, cz, w + 0.06, 0.6, cabinLength + 0.06, GLASS);
  props.box(0, freeboard + 1.15, cz + cabinLength / 2 + 0.6, w * 0.8, 0.9, 1.2, GLASS);
  const fly = cabinLength * 0.6;
  props.box(0, freeboard + 2.2, cz - cabinLength * 0.1, w * 0.86, 0.6, fly, HULL);
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    props.box(px * w * 0.38, freeboard + 3.2, cz - cabinLength * 0.1 + pz * fly * 0.4, 0.1, 1.4, 0.1, 0xdddddd);
  }
  props.box(0, freeboard + 3.95, cz - cabinLength * 0.1, w * 0.86, 0.14, fly * 0.95, canopy);
  props.box(0, freeboard + 4.4, cz - cabinLength * 0.05, 0.12, 0.9, 0.12, 0xdddddd);
}

/** A sailing yacht: slim hull, low cabin, a tall mast and boom with the sail furled under a coloured cover. */
function buildSailingYacht(props, length, beam, canopy) {
  const freeboard = 1.1;
  buildHull(props, length, beam, freeboard, TEAK, HULL);
  props.box(0, freeboard + 0.4, length * 0.06, beam * 0.55, 0.8, length * 0.36, HULL);
  props.box(0, freeboard + 0.5, length * 0.06, beam * 0.56, 0.3, length * 0.37, GLASS);
  const mastZ = length * 0.12;
  const mastHeight = length * 1.25;
  props.box(0, freeboard + mastHeight / 2, mastZ, 0.2, mastHeight, 0.2, 0xe8e8e8);
  props.box(0, freeboard + 1.6, mastZ - length * 0.2, 0.16, 0.16, length * 0.4, 0xe0e0e0);
  props.box(0, freeboard + 1.85, mastZ - length * 0.2, 0.45, 0.4, length * 0.38, canopy);
  props.beam(0, freeboard + mastHeight, mastZ, 0, freeboard + 0.1, length / 2 - 0.3, 0.04, 0x9aa0a8);
  props.beam(0, freeboard + mastHeight, mastZ, 0, freeboard + 0.1, -length / 2 + 0.3, 0.04, 0x9aa0a8);
  props.box(0, freeboard + 1.7, -length * 0.3, beam * 0.7, 0.08, length * 0.18, canopy);
}

/** A small launch: open hull, a centre console and a sun canopy on four posts. */
function buildLaunch(props, length, beam, canopy) {
  const freeboard = 0.8;
  buildHull(props, length, beam, freeboard, HULL, canopy);
  props.box(0, freeboard + 0.5, 0, beam * 0.4, 1.0, 1.2, HULL);
  props.box(0, freeboard + 1.05, 0.45, beam * 0.38, 0.35, 0.1, GLASS);
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.box(px * beam * 0.32, freeboard + 1.1, pz * 1.2, 0.06, 2.2, 0.06, 0xdddddd);
  props.box(0, freeboard + 2.2, 0, beam * 0.75, 0.1, 3, canopy);
}
