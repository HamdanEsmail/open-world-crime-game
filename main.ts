// KHAMSIN: Port Sarab, handed in (Node 22, standard library only).
//
// The game is the game/ folder beside this file: plain static files a desktop browser loads offline
// (game/index.html, its ES modules under game/src/, the stylesheets, and three.js vendored as
// game/vendor/three.module.min.js). This program copies game/ and screenshots/ to the output
// directory and writes dossier.json there with make.fun's library, exactly as the kit's starter does.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameSource = join(here, 'game');
const screenshotSource = join(here, 'screenshots');

// The whole game (the page, its source, the stylesheets, the vendored library), then its four
// screenshots: the cover first by name, staged from the game's own ?shot=<name> scenes.
mkdirSync(out, { recursive: true });
cpSync(gameSource, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(screenshotSource)) cpSync(screenshotSource, join(out, 'screenshots'), { recursive: true });

// The gate's own limits: only text_max_bytes shapes the dossier's bytes; the others refuse what the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files or 48 MiB
// under game/; a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
