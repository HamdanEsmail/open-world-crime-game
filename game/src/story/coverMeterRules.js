// The rules of the Cover meter, Zayd's double life as crew trust against the badge: what each side
// allows at the vault, what happens at zero, how a change is told, and who the story's cast are.

/** Which endings the vault allows: calling it in needs the badge, taking the gold the crew's trust. */
export function endingsAllowed(crewTrust, badge) {
  return { callItIn: badge >= ENDING_THRESHOLD, takeTheGold: crewTrust >= ENDING_THRESHOLD };
}

/** At zero trust the crew smells a cop: the job in hand is blown. */
export function crewSmellsACop(crewTrust) {
  return crewTrust <= 0;
}

/** At zero badge Captain Dahan cuts Zayd loose: one warning call, then PSPD stops holding back. */
export function handlerCutsLoose(badge) {
  return badge <= 0;
}

/** A meter value kept within 0..100 (the starting 50 when it is not a number). */
export function clampCover(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return STARTING_COVER;
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

/** The toast for a change, such as "CREW TRUST +6: Faris is impressed". */
export function coverToastText(which, delta, why) {
  const label = which === 'trust' ? 'CREW TRUST' : 'BADGE';
  return `${label} ${delta > 0 ? '+' : ''}${Math.round(delta)}${why ? `: ${why}` : ''}`;
}

/** Both sides of the meter start here. */
export const STARTING_COVER = 50;
/** Each ending at the vault needs at least this much of its side. */
export const ENDING_THRESHOLD = 35;
/** Where trust settles after the crew blew a job on him: Faris talks them round. */
export const SECOND_CHANCE_TRUST = 12;

/** Everyone who speaks in the story: the name on a subtitle, the full name, the role. */
export const STORY_CAST_NAMES = {
  zayd: { name: 'Zayd', fullName: 'Zayd "Dust" Karam', role: 'Getaway driver, undercover' },
  dahan: { name: 'Dahan', fullName: 'Captain Rasha Dahan', role: 'PSPD Major Crimes, your handler' },
  mina: { name: 'Mina', fullName: 'Mina Okoro', role: 'The planner' },
  faris: { name: 'Faris', fullName: '"Uncle" Faris Haddad', role: 'The mechanic' },
  tavi: { name: 'Tavi', fullName: 'Tavi Rourke', role: 'The inside man' },
  vane: { name: 'Vane', fullName: 'Idris Vane', role: 'Owner of the Vane Spire' },
  sayf: { name: 'Sayf', fullName: 'Sayf of the Dune Jackals', role: 'Leader of the Dune Jackals' },
  dispatch: { name: 'PSPD Dispatch', fullName: 'PSPD Dispatch', role: 'Police radio' },
  radio: { name: 'Sarab Gold 98.6', fullName: 'Sarab Gold 98.6', role: 'The news' },
};
