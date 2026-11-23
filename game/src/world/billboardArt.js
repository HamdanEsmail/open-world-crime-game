// The adverts of Port Sarab, painted in code onto one 1024 x 1024 atlas: sixteen invented brands, each
// a bold flat graphic with its name and slogan, made to read from a moving car and from a thumbnail.
// Soda, cars, radio, flatbread, a gold vault, the grand hotel, couriers, respray, guns, the dunes...
import * as THREE from 'three';
import { BILLBOARD_BRANDS } from './streetFurnitureRules.js';

const ATLAS = 1024;
const AD_W = 512;
const AD_H = 128;

/** How each brand of the furniture rules is painted, in the same order: ground, ink and graphic. */
const ADVERT_LOOKS = [
  { bg: ['#ff8a1c', '#e4372e'], ink: '#fff4d6', painter: paintSodaBottle },
  { bg: ['#0e1b2a', '#1c3550'], ink: '#e9b44c', painter: paintOryxHorns },
  { bg: ['#7a1fa2', '#e4572e'], ink: '#fff4d6', painter: paintRadioDunes },
  { bg: ['#f2c14e', '#d9962b'], ink: '#2a1a08', painter: paintRecord },
  { bg: ['#fff1d0', '#f3dca8'], ink: '#2f5d2a', painter: paintFlatbread },
  { bg: ['#111111', '#2a2418'], ink: '#e9b44c', painter: paintGoldBars },
  { bg: ['#ff9e5e', '#7a3d8c'], ink: '#fff4d6', painter: paintHotelTower },
  { bg: ['#ffd23f', '#f6a21e'], ink: '#3a2205', painter: paintRunningCamel },
  { bg: ['#1ba39c', '#14636a'], ink: '#ffffff', painter: paintRainbowCar },
  { bg: ['#5b1414', '#2a0a0a'], ink: '#e9b44c', painter: paintTarget },
  { bg: ['#ffcf7a', '#f08a3c'], ink: '#4a1e05', painter: paintSunOverDunes },
  { bg: ['#0e1b2a', '#243a66'], ink: '#fff4d6', painter: paintSpire },
  { bg: ['#e4572e', '#a8321a'], ink: '#fff4d6', painter: paintWrench },
  { bg: ['#c88a4a', '#8a5a2e'], ink: '#fff4d6', painter: paintSandSwirl },
  { bg: ['#2b2420', '#3d2a1e'], ink: '#ffb347', painter: paintSkewer },
  { bg: ['#8a4b26', '#5e2e14'], ink: '#ffe8c0', painter: paintTeaGlass },
];

/** The adverts in atlas order: brand and slogan from the rules, painted with their look. */
export const ADVERTS = BILLBOARD_BRANDS.map(([brand, slogan], i) => ({ brand, slogan, ...ADVERT_LOOKS[i % ADVERT_LOOKS.length] }));

/** Paint every advert. Returns { texture, slots: [[u, v, w, h]...] } (one UV rectangle per advert). */
export function paintAdvertAtlas(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  const slots = [];
  ADVERTS.forEach((ad, i) => {
    const x = (i % 2) * AD_W;
    const y = Math.floor(i / 2) * AD_H;
    paintAdvert(ctx, x, y, ad);
    slots.push([(x + 2) / ATLAS, 1 - (y + AD_H - 2) / ATLAS, (AD_W - 4) / ATLAS, (AD_H - 4) / ATLAS]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 1);
  return { texture, slots };
}

/** One advert: gradient ground, the graphic on the left third, the name and slogan on the right. */
function paintAdvert(ctx, x, y, ad) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, AD_W, AD_H);
  ctx.clip();
  const gradient = ctx.createLinearGradient(x, y, x + AD_W, y + AD_H);
  gradient.addColorStop(0, ad.bg[0]);
  gradient.addColorStop(1, ad.bg[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, AD_W, AD_H);
  ad.painter(ctx, x, y, AD_W, AD_H, ad);
  const left = x + 168;
  const room = AD_W - 186;
  ctx.fillStyle = ad.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let size = 46;
  ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  while (ctx.measureText(ad.brand).width > room && size > 18) {
    size -= 1;
    ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
  }
  ctx.fillText(ad.brand, left, y + 64);
  let small = 24;
  ctx.font = `italic bold ${small}px Georgia, serif`;
  while (ctx.measureText(ad.slogan).width > room && small > 12) {
    small -= 1;
    ctx.font = `italic bold ${small}px Georgia, serif`;
  }
  ctx.fillText(ad.slogan, left, y + 102);
  ctx.fillRect(left, y + 74, Math.min(room, 120), 4);
  ctx.restore();
}

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function paintSodaBottle(ctx, x, y) {
  circle(ctx, x + 80, y + 64, 56, 'rgba(255,244,214,0.25)');
  ctx.fillStyle = '#1ba39c';
  ctx.beginPath();
  ctx.moveTo(x + 66, y + 118);
  ctx.lineTo(x + 66, y + 58);
  ctx.quadraticCurveTo(x + 66, y + 44, x + 74, y + 36);
  ctx.lineTo(x + 74, y + 14);
  ctx.lineTo(x + 86, y + 14);
  ctx.lineTo(x + 86, y + 36);
  ctx.quadraticCurveTo(x + 94, y + 44, x + 94, y + 58);
  ctx.lineTo(x + 94, y + 118);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(x + 66, y + 70, 28, 18);
  ctx.fillStyle = '#e4372e';
  ctx.fillRect(x + 72, y + 10, 16, 6);
  for (let i = 0; i < 9; i += 1) circle(ctx, x + 30 + ((i * 37) % 100), y + 20 + ((i * 53) % 90), 3 + (i % 3), 'rgba(255,255,255,0.7)');
}

function paintOryxHorns(ctx, x, y) {
  ctx.strokeStyle = '#e9b44c';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + 80 + side * 10, y + 100);
    ctx.quadraticCurveTo(x + 80 + side * 34, y + 60, x + 80 + side * 52, y + 8);
    ctx.stroke();
  }
  ctx.fillStyle = '#e9b44c';
  ctx.beginPath();
  ctx.ellipse(x + 80, y + 104, 20, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d0d4da';
  ctx.fillRect(x + 20, y + 112, 120, 3);
}

function paintRadioDunes(ctx, x, y) {
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(x, y + 128);
  ctx.quadraticCurveTo(x + 60, y + 70, x + 160, y + 110);
  ctx.lineTo(x + 160, y + 128);
  ctx.fill();
  ctx.strokeStyle = '#fff4d6';
  ctx.lineWidth = 5;
  for (let r = 18; r <= 66; r += 16) {
    ctx.beginPath();
    ctx.arc(x + 80, y + 62, r, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff4d6';
  ctx.fillRect(x + 77, y + 58, 6, 40);
}

function paintRecord(ctx, x, y) {
  circle(ctx, x + 82, y + 64, 54, '#151515');
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  for (let r = 22; r < 52; r += 6) {
    ctx.beginPath();
    ctx.arc(x + 82, y + 64, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  circle(ctx, x + 82, y + 64, 18, '#e4572e');
  circle(ctx, x + 82, y + 64, 4, '#151515');
}

function paintFlatbread(ctx, x, y) {
  circle(ctx, x + 80, y + 70, 50, '#d9a45a');
  circle(ctx, x + 80, y + 70, 42, '#e8bb72');
  for (let i = 0; i < 26; i += 1) circle(ctx, x + 50 + ((i * 29) % 60), y + 44 + ((i * 17) % 52), 2.5, '#4f7a2a');
  ctx.strokeStyle = '#2f5d2a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 120, y + 30);
  ctx.quadraticCurveTo(x + 140, y + 10, x + 150, y + 6);
  ctx.stroke();
}

function paintGoldBars(ctx, x, y) {
  const bar = (bx, by) => {
    ctx.fillStyle = '#e9b44c';
    ctx.beginPath();
    ctx.moveTo(bx, by + 22);
    ctx.lineTo(bx + 8, by);
    ctx.lineTo(bx + 52, by);
    ctx.lineTo(bx + 60, by + 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd98a';
    ctx.fillRect(bx + 10, by + 3, 40, 6);
  };
  bar(x + 20, y + 92);
  bar(x + 84, y + 92);
  bar(x + 52, y + 68);
  bar(x + 36, y + 44);
  bar(x + 70, y + 44);
  bar(x + 52, y + 20);
}

function paintHotelTower(ctx, x, y) {
  circle(ctx, x + 96, y + 60, 34, '#ffd27a');
  ctx.fillStyle = '#2a1640';
  ctx.beginPath();
  ctx.moveTo(x + 40, y + 128);
  ctx.lineTo(x + 52, y + 30);
  ctx.quadraticCurveTo(x + 70, y + 6, x + 88, y + 30);
  ctx.lineTo(x + 100, y + 128);
  ctx.fill();
  ctx.fillStyle = '#ffd98a';
  for (let row = 0; row < 7; row += 1) for (let col = 0; col < 3; col += 1) ctx.fillRect(x + 58 + col * 9, y + 44 + row * 11, 4, 5);
}

function paintRunningCamel(ctx, x, y) {
  ctx.fillStyle = '#3a2205';
  ctx.beginPath();
  ctx.ellipse(x + 80, y + 62, 42, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 70, y + 46, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 112, y + 26, 9, 38);
  ctx.beginPath();
  ctx.ellipse(x + 124, y + 26, 12, 7, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#3a2205';
  ctx.lineCap = 'round';
  for (const [ax, bx] of [[52, 34], [64, 76], [96, 84], [106, 124]]) {
    ctx.beginPath();
    ctx.moveTo(x + ax, y + 72);
    ctx.lineTo(x + bx, y + 112);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 44 + i * 12);
    ctx.lineTo(x + 30, y + 44 + i * 12);
    ctx.stroke();
  }
}

function paintRainbowCar(ctx, x, y) {
  const colors = ['#e4572e', '#ffb347', '#ffe066', '#7bd389', '#4cc9f0', '#9d4edd'];
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + i * 26, y + 128);
    ctx.lineTo(x + 40 + i * 26, y);
    ctx.lineTo(x + 66 + i * 26, y);
    ctx.lineTo(x + 26 + i * 26, y + 128);
    ctx.fill();
  });
  ctx.fillStyle = '#0e1b2a';
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 96);
  ctx.lineTo(x + 30, y + 74);
  ctx.lineTo(x + 70, y + 66);
  ctx.lineTo(x + 104, y + 74);
  ctx.lineTo(x + 146, y + 82);
  ctx.lineTo(x + 148, y + 98);
  ctx.closePath();
  ctx.fill();
  circle(ctx, x + 42, y + 100, 11, '#0e1b2a');
  circle(ctx, x + 120, y + 100, 11, '#0e1b2a');
}

function paintTarget(ctx, x, y) {
  for (let r = 54, i = 0; r > 6; r -= 12, i += 1) circle(ctx, x + 82, y + 64, r, i % 2 ? '#5b1414' : '#e9b44c');
  ctx.strokeStyle = '#fff4d6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 82, y + 2);
  ctx.lineTo(x + 82, y + 126);
  ctx.moveTo(x + 20, y + 64);
  ctx.lineTo(x + 144, y + 64);
  ctx.stroke();
}

function paintSunOverDunes(ctx, x, y) {
  circle(ctx, x + 84, y + 70, 44, '#fff1b8');
  ctx.fillStyle = '#c8641e';
  ctx.beginPath();
  ctx.moveTo(x, y + 128);
  ctx.quadraticCurveTo(x + 50, y + 72, x + 110, y + 100);
  ctx.quadraticCurveTo(x + 140, y + 84, x + 170, y + 96);
  ctx.lineTo(x + 170, y + 128);
  ctx.fill();
  ctx.fillStyle = '#9a4512';
  ctx.beginPath();
  ctx.moveTo(x, y + 128);
  ctx.quadraticCurveTo(x + 80, y + 98, x + 170, y + 120);
  ctx.lineTo(x + 170, y + 128);
  ctx.fill();
}

function paintSpire(ctx, x, y) {
  for (let i = 0; i < 30; i += 1) circle(ctx, x + ((i * 47) % 160), y + ((i * 29) % 60), 1.2, '#fff4d6');
  ctx.fillStyle = '#e9b44c';
  ctx.beginPath();
  ctx.moveTo(x + 64, y + 128);
  ctx.lineTo(x + 76, y + 30);
  ctx.lineTo(x + 82, y + 2);
  ctx.lineTo(x + 88, y + 30);
  ctx.lineTo(x + 100, y + 128);
  ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.fillRect(x + 80, y + 40, 4, 88);
  ctx.fillStyle = '#3c5a8a';
  ctx.fillRect(x + 24, y + 86, 30, 42);
  ctx.fillRect(x + 110, y + 76, 36, 52);
}

function paintWrench(ctx, x, y) {
  ctx.strokeStyle = '#fff4d6';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 40, y + 104);
  ctx.lineTo(x + 112, y + 32);
  ctx.stroke();
  circle(ctx, x + 116, y + 28, 20, '#fff4d6');
  circle(ctx, x + 124, y + 20, 10, '#e4572e');
  ctx.fillStyle = '#0e1b2a';
  ctx.fillRect(x + 22, y + 22, 34, 46);
  ctx.fillStyle = '#e9b44c';
  ctx.fillRect(x + 28, y + 30, 22, 8);
}

function paintSandSwirl(ctx, x, y) {
  ctx.strokeStyle = 'rgba(255,244,214,0.85)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 30 + i * 24);
    ctx.bezierCurveTo(x + 60, y + 10 + i * 24, x + 100, y + 50 + i * 24, x + 150, y + 26 + i * 24);
    ctx.stroke();
  }
  circle(ctx, x + 80, y + 64, 20, '#2f6bff');
  ctx.fillStyle = '#fff4d6';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PSPD', x + 80, y + 69);
}

function paintSkewer(ctx, x, y) {
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = i % 2 ? '#e4572e' : '#ffb347';
    ctx.beginPath();
    ctx.moveTo(x + 20 + i * 24, y + 128);
    ctx.quadraticCurveTo(x + 28 + i * 24, y + 92, x + 32 + i * 24, y + 104);
    ctx.quadraticCurveTo(x + 40 + i * 24, y + 82, x + 44 + i * 24, y + 128);
    ctx.fill();
  }
  ctx.fillStyle = '#c0c0c0';
  ctx.fillRect(x + 8, y + 60, 150, 4);
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i % 2 ? '#7a3a1a' : '#a8582a';
    ctx.fillRect(x + 24 + i * 26, y + 50, 20, 24);
  }
}

function paintTeaGlass(ctx, x, y) {
  ctx.fillStyle = 'rgba(255,232,192,0.3)';
  ctx.beginPath();
  ctx.moveTo(x + 56, y + 40);
  ctx.lineTo(x + 108, y + 40);
  ctx.lineTo(x + 100, y + 118);
  ctx.lineTo(x + 64, y + 118);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c87a3a';
  ctx.beginPath();
  ctx.moveTo(x + 59, y + 60);
  ctx.lineTo(x + 105, y + 60);
  ctx.lineTo(x + 100, y + 116);
  ctx.lineTo(x + 64, y + 116);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,214,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 66 + i * 14, y + 34);
    ctx.bezierCurveTo(x + 56 + i * 14, y + 22, x + 76 + i * 14, y + 16, x + 66 + i * 14, y + 4);
    ctx.stroke();
  }
}
