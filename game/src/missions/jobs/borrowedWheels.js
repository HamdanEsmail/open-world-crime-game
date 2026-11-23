// Job 2, "Borrowed Wheels": Mina needs a clean luxury SUV. Zayd lifts an Oryx Summit off the Mirage
// Grand Hotel forecourt from under a sleepy valet, shakes the two-star heat it brings and delivers it
// to Haddad Motors barely scratched. Captain Dahan's condition on the side: nobody gets hurt.

export const job = {
  id: 'borrowed_wheels',
  order: 2,
  title: 'Borrowed Wheels',
  giver: 'mina',
  contact: 'contact_mina',
  requires: ['shakedown_run'],
  hours: null,
  reward: { money: 1200, rep: 90 },
  hint: 'Mina has work at the Grand Souk.',
  briefing: 'The crew needs a clean luxury SUV. Take the Oryx Summit from the Mirage Grand Hotel forecourt, lose the heat it brings, and deliver it to Haddad Motors barely scratched. Dahan asks one thing: nobody gets hurt.',

  async run(m) {
    const stall = m.place('contact_mina');
    const drop = m.place('garage_haddad');
    const dropPoint = { x: drop.curbX, z: drop.curbZ + 1.4 };
    const forecourt = hotelForecourt(m);
    const suv = m.spawnVehicle('oryx_summit', { x: forecourt.x, z: forecourt.z, heading: Math.PI / 2, color: 0xf4f1e8, parked: true });

    let valet = null;
    if (m.resumeFrom === 'heat') {
      m.playerInto(suv);
    } else {
      valet = m.spawnPerson({ archetype: 'business', kind: 'civilian', name: 'Valet', x: forecourt.x - 2.5, z: forecourt.z - 3.2, heading: Math.PI });
      const mina = m.giver || m.spawnCast('mina', stall.x, stall.z, stall.heading + Math.PI);
      m.teleportPlayer(stall.x - 1.4, stall.z + 2.6, Math.PI - 0.5);
      if (mina && mina.intent) {
        mina.intent.faceYaw = Math.atan2(m.player.pos.x - mina.pos.x, m.player.pos.z - mina.pos.z);
        mina.intent.gesture = 'talk';
      }
      await m.cutscene(introShots(stall, mina, m.player.character, forecourt));
      m.objective('Steal the Oryx Summit at the Mirage Grand Hotel');
    }

    // Dahan's condition, kept on the side of the job card until the car is delivered.
    let hurt = false;
    const clean = m.objective('Dahan: nobody gets hurt', { optional: true });
    const noteHarm = (victim, culprit) => {
      if (hurt || !victim || !isBystander(victim) || !byPlayer(m, culprit)) return;
      hurt = true;
      clean.fail();
      m.say([['dahan', 'I said nobody gets hurt, Karam.']]);
    };
    m.on('character:damaged', (event) => noteHarm(event.character, event.source));
    m.on('vehicle:hitCharacter', (event) => noteHarm(event.character, event.vehicle));

    if (m.resumeFrom !== 'heat') {
      m.phone('dahan', [
        ['dahan', 'A car theft for Mina? Fine. Here is my condition.'],
        ['dahan', 'Nobody gets hurt. Not the valet, not a pedestrian.'],
        ['zayd', 'And if somebody steps in front of me?'],
        ['dahan', 'Then you brake, Karam. You used to be good at that.'],
      ]);
      m.until(() => m.distanceTo(suv) < 20).then(() => {
        if (!valet || valet.alive === false) return;
        valet.intent.gesture = 'handsUp';
        m.say([['Valet', 'Sir? Sir! That is a guest\'s car!']]);
      }, () => {});
      await m.inVehicle(suv, { label: 'Oryx Summit' });
      if (valet && valet.alive !== false) valet.intent.gesture = 'cower';
      m.checkpoint('heat');
    }

    m.failIfDestroyed(suv, 'The Oryx is wrecked. Mina wanted it clean.');
    m.failIfLeft(suv, 160, 'You abandoned the Oryx.');
    m.wanted.set(2);
    m.objective('Lose the police');
    if (!m.game.phone || !m.game.phone.inCall) m.say([['mina', 'Two stars. So the valet was awake after all.'], ['mina', 'Shake them off. Back streets, Dust. Not the Corniche.']]);
    await m.lostWanted();

    m.say([['mina', 'Clean. Now Haddad Motors, and barely a scratch, remember.']]);
    for (;;) {
      m.objective('Deliver the Oryx to Haddad Motors');
      const arrived = m.reach(dropPoint, 8, { inVehicle: suv, stopped: true, label: 'Haddad Motors' });
      const heat = m.until(() => m.wanted.level > 0);
      if ((await m.any([arrived, heat])) === 0) break;
      m.objective('Lose the police before the garage');
      m.say([['mina', 'Not with a tail! Faris will skin us both.']]);
      await m.lostWanted();
    }

    const condition = suv.health / Math.max(1, suv.maxHealth);
    if (condition >= 0.85) m.trust(6, 'Mina is impressed');
    else if (condition >= 0.55) m.trust(2, 'Mina shrugs at the dents');
    else m.trust(-3, 'Mina hates the dents');
    if (!hurt) {
      clean.done();
      m.badge(6, 'Nobody got hurt');
    } else {
      m.badge(-3, 'Civilians got hurt');
    }

    const faris = m.spawnCast('faris', dropPoint.x - 3.2, dropPoint.z - 6.2, 0.4);
    const outro = m.cutscene(outroShots(dropPoint, suv, faris, condition));
    await m.seconds(0.24);
    m.teleportPlayer(dropPoint.x - 1.2, dropPoint.z - 5.2, -2.6);
    await outro;
  },
};

/** Where the Oryx waits: the east side of the hotel's forecourt, beside the valet stand. */
function hotelForecourt(m) {
  const hotel = m.landmark('grandHotel');
  if (hotel) return { x: hotel.x + 28, z: hotel.z + 56 };
  return { x: -232, z: 366 };
}

/** A passer-by Dahan cares about: anyone who is not the crew, the police or a gang. */
function isBystander(person) {
  return person.kind === 'civilian' || person.kind === 'target' || person.name === 'Valet';
}

/** Whether a source of harm is the player or the car he is driving. */
function byPlayer(m, culprit) {
  const player = m.player;
  if (!culprit || !player) return false;
  return culprit === player.character || culprit === player.vehicle || culprit.isPlayer === true || culprit.kind === 'player';
}

function introShots(stall, mina, zayd, forecourt) {
  const sx = stall.x;
  const sz = stall.z;
  const lookMina = mina || { x: sx, y: 1.6, z: sz };
  const lookZayd = zayd || { x: sx - 1.4, y: 1.6, z: sz + 2.6 };
  return [
    { position: { x: sx + 14, y: 5, z: sz + 16 }, moveTo: { x: sx + 9, y: 3.6, z: sz + 11 }, lookAt: { x: sx - 0.5, y: 1.8, z: sz + 1 }, seconds: 4.4, speaker: 'mina', text: 'So you are Faris\'s miracle. You look like you sleep in your car.' },
    { position: { x: sx + 1.2, y: 1.8, z: sz - 1.4 }, moveTo: { x: sx + 1.0, y: 1.78, z: sz - 1.1 }, lookAt: lookZayd, seconds: 2.4, speaker: 'zayd', text: 'Only on good nights.' },
    { position: { x: sx - 2.4, y: 1.75, z: sz + 4.4 }, moveTo: { x: sx - 1.9, y: 1.72, z: sz + 3.7 }, lookAt: lookMina, seconds: 4.2, speaker: 'mina', text: 'We need a clean luxury SUV. The Oryx Summit outside the Mirage Grand.' },
    { position: { x: forecourt.x + 16, y: 4.5, z: forecourt.z + 14 }, moveTo: { x: forecourt.x + 10, y: 3, z: forecourt.z + 10 }, lookAt: { x: forecourt.x, y: 1, z: forecourt.z }, seconds: 4.0, speaker: 'mina', text: 'The valet sleeps on his feet. Take it, lose the heat, bring it to Faris.' },
    { position: { x: sx - 2.2, y: 1.7, z: sz + 3.8 }, moveTo: { x: sx - 1.8, y: 1.7, z: sz + 3.2 }, lookAt: lookMina, seconds: 3.6, speaker: 'mina', text: 'Barely scratched, Dust. Scratches are fingerprints.' },
  ];
}

function outroShots(dropPoint, suv, faris, condition) {
  const lookFaris = faris || { x: dropPoint.x - 3, y: 1.6, z: dropPoint.z - 6 };
  const verdict = condition >= 0.85 ? 'Not a scratch. Mina will pretend she is not impressed.' : 'Dents, Dust. Mina will add them to your bill.';
  return [
    { position: { x: dropPoint.x + 10, y: 2.2, z: dropPoint.z + 6 }, moveTo: { x: dropPoint.x + 6, y: 1.6, z: dropPoint.z + 5 }, lookAt: suv, seconds: 4.2, fov: 50, speaker: 'faris', text: verdict },
    { position: { x: dropPoint.x - 6, y: 1.8, z: dropPoint.z - 2.5 }, moveTo: { x: dropPoint.x - 5.2, y: 1.75, z: dropPoint.z - 3.2 }, lookAt: lookFaris, seconds: 3.2, speaker: 'zayd', text: 'It handles like a sofa, Uncle.' },
    { position: { x: dropPoint.x - 0.5, y: 1.8, z: dropPoint.z - 3.4 }, moveTo: { x: dropPoint.x - 1.0, y: 1.78, z: dropPoint.z - 3.9 }, lookAt: lookFaris, seconds: 4.0, speaker: 'faris', text: 'A sofa that pays rent. Leave her with me.' },
  ];
}
