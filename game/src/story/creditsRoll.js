// The last pages of the story: the ending's title card and epilogue lines laid over slow shots of
// Port Sarab, then the credits (the cast, the city, a nod to twenty hidden falcons) over a golden-hour
// flight across the city, and the card that hands it back: "the city is still yours".
import { spireStage, gateStage } from '../missions/jobs/finaleSceneHelpers.js';

/**
 * The credits after an ending: a flight over Port Sarab at golden hour with the cast on screen,
 * then the closing card. Skippable like any cutscene; free play resumes afterwards.
 * @param {Object} m  the job context
 * @param {'badge'|'crew'} [ending]
 * @param {{set:Function}} [clock]  the job's held clock, if it holds one
 */
export async function playCredits(m, ending, clock) {
  const shots = creditFlight(m);
  await m.fadeOut(1.1);
  if (clock) clock.set(17.6);
  else m.setTime(17.6);
  m.setWeather(0, 0.5);
  const card = openStoryCard({ kicker: 'KHAMSIN', title: 'PORT SARAB', lines: [], tone: 'credits' });
  const roll = startCreditRoll(card, CREDIT_LINES, shots.reduce((sum, shot) => sum + shot.seconds, 0));
  try {
    await m.cutscene(shots);
  } finally {
    roll.stop();
    card.close();
  }
  const reward = ending === 'crew'
    ? 'Your Zephyr Mirage S is waiting at the Dune Hideout.'
    : ending === 'badge' ? 'Your PSPD Interceptor is parked outside the flat.' : '';
  await playStoryCard(m, {
    kicker: 'THE END',
    title: 'THE CITY IS STILL YOURS',
    lines: [
      'Side jobs, races, stunt jumps and twenty golden falcons are waiting.',
      reward,
      'Port Sarab never sleeps through a fine evening.',
    ].filter(Boolean),
    shots: [closingOrbit(m)],
  });
}

/**
 * A title card with lines that appear one after another, over `shots` (a slow cutscene behind it).
 * Resolves when the shots are over or skipped; the card always leaves the screen.
 */
export async function playStoryCard(m, { kicker, title, lines = [], shots, tone = 'ending' }) {
  const card = openStoryCard({ kicker, title, lines, tone });
  try {
    await m.cutscene(shots);
  } finally {
    card.close();
  }
}

/**
 * The card on screen: a kicker in spaced gold capitals, a big cream title, a gold rule and the lines
 * fading in one by one. Sits above the letterbox and the fade-to-black. Returns { setLine, close }.
 */
export function openStoryCard({ kicker = '', title = '', lines = [], tone = 'ending' }) {
  if (typeof document === 'undefined') return { setLine() {}, close() {} };
  const old = document.getElementById(CARD_ID);
  if (old) old.remove();
  const root = document.createElement('div');
  root.id = CARD_ID;
  root.setAttribute('role', 'presentation');
  const credits = tone === 'credits';
  root.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:66', 'pointer-events:none', 'display:flex', 'flex-direction:column',
    `align-items:${credits ? 'flex-start' : 'center'}`, `justify-content:${credits ? 'flex-end' : 'center'}`,
    `padding:${credits ? '0 0 15vh 8vw' : '0 8vw'}`, 'box-sizing:border-box', 'opacity:0', 'transition:opacity 1.1s ease',
    `background:${credits ? 'linear-gradient(90deg, rgba(6,8,12,0.62), rgba(6,8,12,0) 55%)' : 'radial-gradient(ellipse at center, rgba(14,27,42,0.5), rgba(6,8,12,0.88))'}`,
    `font-family:${FONT}`, 'color:#fff4d6', 'text-align:' + (credits ? 'left' : 'center'),
  ].join(';');
  const kickerNode = element('div', `font-size:${credits ? 13 : 14}px;letter-spacing:0.55em;margin-right:-0.55em;color:#e9b44c;font-weight:600;margin-bottom:14px`, kicker);
  const titleNode = element('div', `font-size:${credits ? 46 : 68}px;line-height:1.05;font-weight:800;letter-spacing:0.16em;margin-right:-0.16em;text-shadow:0 4px 0 rgba(0,0,0,0.3),0 0 40px rgba(233,180,76,0.25)`, title);
  const rule = element('div', `width:${credits ? 90 : 150}px;height:2px;background:#e9b44c;margin:20px 0 24px;box-shadow:0 0 12px rgba(233,180,76,0.6)`, '');
  const list = element('div', `display:flex;flex-direction:column;gap:12px;max-width:760px;align-items:${credits ? 'flex-start' : 'center'}`, '');
  root.append(kickerNode, titleNode, rule, list);
  document.body.appendChild(root);
  const lineNodes = [];
  const timers = [];
  const addLine = (text, delay) => {
    const node = element('div', `font-size:${credits ? 22 : 19}px;line-height:1.35;letter-spacing:0.03em;color:#fff4d6;opacity:0;transform:translateY(8px);transition:opacity 0.9s ease, transform 0.9s ease;text-shadow:0 2px 6px rgba(0,0,0,0.7)`, text);
    list.appendChild(node);
    lineNodes.push(node);
    timers.push(setTimeout(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateY(0)';
    }, delay));
  };
  lines.forEach((text, index) => addLine(text, 1300 + index * LINE_GAP_MS));
  requestAnimationFrame(() => {
    root.style.opacity = '1';
  });
  let closed = false;
  return {
    /** Replace the card's heading and lines (the credits change them shot by shot). */
    setLine(nextKicker, nextTitle, nextLines = []) {
      if (closed) return;
      kickerNode.textContent = nextKicker;
      titleNode.textContent = nextTitle;
      for (const node of lineNodes.splice(0, lineNodes.length)) node.remove();
      nextLines.forEach((text, index) => addLine(text, 250 + index * 500));
    },
    close() {
      if (closed) return;
      closed = true;
      for (const timer of timers) clearTimeout(timer);
      root.style.opacity = '0';
      setTimeout(() => root.remove(), 1200);
    },
  };
}

/** Cycle the credit pages on the card in step with the flight. */
function startCreditRoll(card, pages, totalSeconds) {
  const each = Math.max(2.5, totalSeconds / pages.length) * 1000;
  let index = 0;
  card.setLine(pages[0][0], pages[0][1], pages[0][2] || []);
  const timer = setInterval(() => {
    index += 1;
    if (index >= pages.length) return;
    const page = pages[index];
    card.setLine(page[0], page[1], page[2] || []);
  }, each);
  return { stop: () => clearInterval(timer) };
}

/** Slow golden-hour passes over the landmarks of the story, in the order the story visited them. */
function creditFlight(m) {
  const spire = spireStage(m);
  const gate = gateStage(m);
  const souk = m.landmark('grandSouk') || { x: -260, z: -30 };
  const ship = m.landmark('containerShip') || { x: 800, z: -896 };
  const falcon = m.landmark('falconRock') || { x: -420, z: 1790 };
  const haddad = m.landmark('haddadMotors') || { x: 120, z: 780 };
  return [
    { position: { x: spire.x - 260, y: 40, z: spire.z - 330 }, lookAt: { x: spire.x, y: 190, z: spire.z }, moveTo: { x: spire.x - 190, y: 120, z: spire.z - 280 }, seconds: 6, fov: 55 },
    { position: { x: souk.x + 110, y: 55, z: souk.z + 120 }, lookAt: { x: souk.x, y: 4, z: souk.z }, moveTo: { x: souk.x + 60, y: 42, z: souk.z + 90 }, seconds: 5.5, fov: 52 },
    { position: { x: haddad.x - 70, y: 22, z: haddad.z + 70 }, lookAt: { x: haddad.x, y: 4, z: haddad.z }, moveTo: { x: haddad.x - 30, y: 18, z: haddad.z + 60 }, seconds: 5, fov: 52 },
    { position: { x: ship.x - 160, y: 70, z: ship.z + 220 }, lookAt: { x: ship.x, y: 20, z: ship.z }, moveTo: { x: ship.x - 60, y: 60, z: ship.z + 200 }, seconds: 5.5, fov: 54 },
    { position: { x: gate.x - 50, y: 16, z: gate.z - 70 }, lookAt: { x: gate.x, y: 12, z: gate.z }, moveTo: { x: gate.x - 20, y: 40, z: gate.z + 60 }, seconds: 5.5, fov: 56 },
    { position: { x: falcon.x + 220, y: 60, z: falcon.z - 160 }, lookAt: { x: falcon.x, y: 30, z: falcon.z }, moveTo: { x: falcon.x + 150, y: 50, z: falcon.z - 190 }, seconds: 6, fov: 54 },
  ];
}

/** The last shot: high over the whole city, turning slowly. */
function closingOrbit(m) {
  const spire = spireStage(m);
  return { position: { x: spire.x + 520, y: 260, z: spire.z + 980 }, lookAt: { x: spire.x, y: 60, z: spire.z }, moveTo: { x: spire.x + 300, y: 300, z: spire.z + 1060 }, seconds: 9, fov: 50 };
}

function element(tag, css, text) {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.textContent = text;
  return node;
}

const CARD_ID = 'story-card';
const FONT = '"Bahnschrift", "DIN Alternate", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const LINE_GAP_MS = 1500;

/** The credit pages: [kicker, title, lines]. Everyone here is from Port Sarab. */
const CREDIT_LINES = [
  ['A STORY OF PORT SARAB', 'KHAMSIN', ['Ten jobs, one storm, four hundred kilos of gold.']],
  ['THE DRIVER', 'Zayd "Dust" Karam', ['Three-time Wadi Rally champion. Four, if you ask him.']],
  ['THE HANDLER', 'Captain Rasha Dahan', ['PSPD Major Crimes. She always phones.']],
  ['THE CREW', 'Mina Okoro', ['The planner. Three plans; you knew about one.']],
  ['THE CREW', '"Uncle" Faris Haddad', ['The mechanic. An engine is a heart, apparently.']],
  ['THE CREW', 'Tavi Rourke', ['The inside man. Trusts nobody. Mostly right.']],
  ['THE MARK', 'Idris Vane', ['Owner of the Vane Spire. Speaks fluent brochure.']],
  ['AND', 'Sayf and the Dune Jackals', ['Red and black, scarves up, never far away.']],
  ['FILMED ON LOCATION', 'Port Sarab', ['The Corniche, the Grand Souk, Mina Docks and the Amber Dunes.', 'Catered entirely in karak tea.']],
  ['A NOTE', 'No falcons were harmed', ['Twenty golden ones are still hidden around the city.']],
];
