# KHAMSIN: Port Sarab

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/HamdanEsmail/open-world-crime-game/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/HamdanEsmail/open-world-crime-game/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game that runs in a desktop browser from plain static files. You are
Zayd "Dust" Karam, a banned rally champion working undercover as the getaway driver of a heist crew in
**Port Sarab**, a sun-soaked boomtown where glass towers rise from golden dunes beside a turquoise gulf.
Ten story jobs build to a gold-vault robbery hidden inside a sandstorm, and a choice with two endings.
Built for make.fun's [Make GTA 6](https://make.fun/bounty/gta6-01) bounty.

## What is in it

- **A whole city of its own.** Eight districts on a street grid between the Gulf of Sarab and the
  Amber Dunes: The Spires and the 330 m Vane Spire, Marina Crescent, the market quarter of Old Sarab,
  Mina Docks, Jasmine Heights, Lantern Row, Al Wadi Flats and Southgate, plus a beach, a marina, a
  port, desert highways, an airfield, an oasis and Falcon Rock. Day and night, and the khamsin: a
  sandstorm that swallows the skyline.
- **Driving that is the point.** Fifteen invented vehicles, from the Dromo Sandpiper to the Zephyr
  Mirage S, a city bus and an armoured bullion carrier, on a tyre model with slip angles, weight
  transfer, handbrake drifts, suspension, jumps, sand that bogs a supercar and suits a buggy, and
  collisions by mass. Steal any of them.
- **A living street.** Traffic that follows lanes and signals, parks, panics and pulls over for
  sirens; pedestrians who stroll, shop, sunbathe, flee gunfire, dive from cars and phone the police.
- **A wanted level with police who respond.** Five stars, witnesses, line of sight and a search
  phase; PSPD patrols, pursuit cars that flank and PIT, officers on foot who arrest or shoot,
  roadblocks with spike strips, the helicopter Shaheen-1 with its searchlight, and dispatch chatter
  that names the street you are on.
- **A story with a secret.** Ten jobs for the crew, each with a quiet side-objective from your police
  handler. A Cover meter weighs crew trust against the badge and decides which ending you can choose.
- **Combat.** Fists, a bat and five firearms, aim assist, cover-using enemies, explosions, pickups.
- **Things to do.** Five street races, taxi fares, courier runs, a car-export list, eight stunt jumps,
  twenty hidden golden falcons, gun shops, garages with resprays and upgrades, food stands,
  safehouses to buy.
- **Feel and polish.** A chase camera that pulls back with speed, a rotating minimap with a GPS route,
  a full city map, particles, skid marks, explosions, procedural engine notes and sirens, and five
  radio stations of music generated in code. Start screen, pause menu, three save slots and an
  autosave.

Everything is original and procedural: every model, texture, sound and note of music is made in code.
The only library is three.js r160, vendored as `game/vendor/three.module.min.js`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser (Chrome or Edge). No build step and no network
requests: the game is the static files under `game/`.

## Controls

| Key | On foot | In a vehicle |
| --- | --- | --- |
| W A S D / arrows | move | accelerate, brake and reverse, steer |
| Mouse | look around | look around |
| Shift | sprint | |
| Space | jump | handbrake |
| F | enter or steal a vehicle | get out |
| E | talk, buy, accept | |
| Left mouse / right mouse | attack or shoot / aim | shoot from the window |
| R, X, Z, Tab, mouse wheel | reload, next and previous weapon, weapon wheel | |
| H, L, Q, B, C | | horn or siren, headlights, radio, look behind, camera |
| T, M, Esc, F5 | answer the phone, city map, pause, quick save | |

## How the source is laid out

`game/src/main.js` starts everything; each folder is one part of the game and each file has one job.

| Folder | What it holds |
| --- | --- |
| `core/` | the frame loop, input, events, the shared game object, saving |
| `world/` | the plan of Port Sarab, roads and lanes, terrain, collision, buildings, ground, street furniture, sky, sea, sandstorm |
| `vehicles/` | the catalogue, physics, collisions, damage, models and renderer |
| `characters/` | bodies, procedural animation, movement, ragdolls |
| `player/`, `camera/` | the player's controls and the follow camera |
| `traffic/`, `pedestrians/` | the city's drivers and walkers |
| `police/` | the wanted level, dispatch, pursuit and officer AI, helicopter, roadblocks, radio |
| `combat/` | weapons, ballistics, melee, explosions, pickups, gunfight AI |
| `missions/`, `story/` | the job engine, the ten jobs, the cast, cutscenes, the Cover meter, the endings |
| `activities/`, `economy/` | races, fares, couriers, exports, stunts, falcons, shops, safehouses, money and rank |
| `effects/`, `audio/`, `ui/` | particles and glows, synthesized sound and radio, the HUD, minimap and menus |

`main.ts` is the bounty's hand-in program: it copies `game/` and `screenshots/` to the output folder
and writes the dossier the judge reads.

---

<sub>Entered on [make.fun](https://make.fun/?ref=e8x7n9mm&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
