// What the Port Sarab Police Department says on the radio while a chase runs: dispatch, the patrol
// units and the crew of Shaheen-1, for every turn a pursuit can take. Each line starts with who
// speaks (D dispatch, U a patrol unit, A the helicopter) and carries {tokens} the chatter fills with
// the real street, district, heading, landmark and the suspect's car at the moment it is said.
//
// Tokens: {inVeh} "in a stolen coral Kestrel Sirocco GT" or "on foot"; {aVeh} "a stolen coral
// Kestrel Sirocco GT"; {car} "coral Kestrel"; {on} "on Vane Boulevard" or "out in the dunes";
// {street}; {district} "The Spires"; {inDistrict} "in the Spires"; {bound} "southbound" or "heading
// south-east"; {dir} "south-east"; {cross} "Al Noor and Vane"; {near} "the Grand Souk" or the street;
// {unit} a patrol callsign; {speed} km/h; {lastSeen} the street where he was last seen.

/** Patrol callsigns heard on the PSPD channel. */
export const UNIT_CALLSIGNS = ['4-Adam', '7-Oasis', '2-Falcon', '9-Lantern', '5-Corniche', '3-Dune', '6-Souk', '8-Harbour'];

/** The lines for each situation. */
export const RADIO_LINES = {
  star1: [
    'D|Units in {district}, report of a disturbance {on}. Suspect last seen {bound}.',
    'D|Any unit near {near}, we have a disturbance call. Suspect {bound} {on}.',
    'D|Caller reports trouble {on}, {district}. Who can take it?',
    'U|{unit}, I will swing by {street}. Show me en route.',
  ],
  star2: [
    'D|Suspect is now {bound} {on}. Two units, light him up.',
    'D|Upgrading the call {on}. Suspect {inVeh}, considered reckless.',
    'U|{unit} in pursuit, {inVeh}, {bound} {on}!',
    'D|All units {inDistrict}, suspect is {inVeh}. Do not let him reach the highway.',
  ],
  star3: [
    'D|All units, all units, suspect {inVeh}, {bound} {on}, {district}. Air support is spinning up.',
    'D|This is now a priority pursuit. Shaheen-1, you are cleared to launch.',
    'U|{unit}, he is not stopping! {bound} {on}, well over the limit!',
    'D|Three-star alert {inDistrict}. Set up containment around {near}.',
  ],
  star4: [
    'D|Suspect is armed and dangerous. Heavy units {inDistrict}, roadblocks are authorised.',
    'D|All units, four-star pursuit {on}. Spike strips are on the table.',
    'U|{unit}, he is tearing up {street}! Requesting backup, now!',
    'D|Enforcer units, move up. Suspect is {inVeh}, {bound}.',
  ],
  star5: [
    'D|Code black, code black. Lethal force authorised against the suspect {inDistrict}.',
    'D|Every unit in Port Sarab, converge on {district}. Shaheen-1, put your gunner in the door.',
    'A|Shaheen-1, gunner is in the door. Say the word.',
    'D|Five stars. Whoever this is, he wants to be famous. Shut him down.',
  ],
  reacquired: [
    'A|Shaheen-1 has eyes on! Suspect {bound} {on}.',
    'U|{unit}, I have him again! {inVeh}, {district}.',
    'D|Visual reacquired near {near}. All units, close in.',
    'U|{unit}, contact! He is right in front of me {on}!',
    'A|Got him. The light is on him, {on}.',
  ],
  lost: [
    'D|We have lost visual near {lastSeen}. Fan out, check the alleys.',
    'A|Shaheen-1, lost him under the rooftops {inDistrict}. Widening the search.',
    'U|{unit}, no sign of him {on}. He went dark.',
    'D|Suspect last seen on {lastSeen}. Units, start a grid search.',
    'U|{unit}, lost the vehicle. Could be anywhere {inDistrict}.',
    'D|All units, hold the perimeter. He is still {inDistrict} somewhere.',
  ],
  escaped: [
    'D|All units stand down. Suspect is gone. Somebody explain that to the Captain.',
    'D|Search is called off. Suspect has slipped the net {inDistrict}.',
    'U|{unit}, nothing out here but sand and tyre marks. Calling it.',
    'D|Code four, units back to patrol. Write it up as a ghost.',
    'D|Stand down. File the paperwork, and somebody find out who taught him to drive like that.',
    'U|{unit}, he is gone. Three cars and a helicopter, and he is gone.',
  ],
  roadblock: [
    'D|Roadblock is set on {street}. Funnel him into it.',
    'U|{unit}, we have the road shut {on}. He is coming right at us.',
    'D|Units are blocking {street}, {district}. Do not let him through.',
    'U|{unit}, cars across the road {on}. Ready when he is.',
  ],
  roadblockSpikes: [
    'D|Roadblock with spikes on {street}. Shred his tyres.',
    'U|{unit}, stinger is down {on}. One gap, and it bites.',
    'D|Spike strip deployed {on}. All units, keep clear of the gap.',
  ],
  breached: [
    'U|{unit}, he is through the roadblock on {street}! Turn around, turn around!',
    'D|Roadblock breached {on}. Pursuing units, stay on him.',
    'U|{unit}, he threaded the gap! Who left a gap?',
    'U|{unit}, he went straight through us {on}!',
  ],
  heliDispatched: [
    'A|Shaheen-1, wheels up from Headquarters. Two minutes out. Make that one.',
    'D|Shaheen-1, suspect {inVeh} {inDistrict}. You are cleared in.',
    'A|Shaheen-1 airborne, heading for {district}.',
  ],
  heliArrived: [
    'A|Shaheen-1 on station over {district}. The light is on him.',
    'A|Shaheen-1 has the suspect, {inVeh}, {bound} {on}.',
    'A|Shaheen-1 overhead. He is not losing us now.',
    'A|Shaheen-1, I see him. {bound} {on}, moving fast.',
  ],
  heliLeft: [
    'A|Shaheen-1 returning to base.',
    'A|Shaheen-1 breaking off, fuel is getting thin.',
    'D|Shaheen-1, you are released. Thanks for the light.',
  ],
  heliHit: [
    'A|Shaheen-1 taking fire! We are hit, pulling out!',
    'A|We are hit, we are hit! Shaheen-1 breaking off for Headquarters!',
    'D|Shaheen-1 is hit and withdrawing. All units, he is shooting at aircraft now.',
  ],
  heliTracking: [
    'A|Shaheen-1, still on him. {bound} {on}.',
    'A|Shaheen-1, he is passing {near}, {bound}.',
    'A|Shaheen-1, light is on the suspect, {on}. Ground units, he is all yours.',
  ],
  switchCar: [
    'D|Suspect has switched vehicles. Now {inVeh}, {district}.',
    'U|{unit}, he jumped into another car. It is {aVeh} now, {bound}.',
    'D|Update the description: suspect is {inVeh}.',
    'U|{unit}, he dumped his ride {on} and took {aVeh}!',
  ],
  stolePolice: [
    'D|Suspect has taken a police unit! I repeat, he is in one of ours!',
    'U|{unit}, he stole a cruiser! Somebody get that car back!',
  ],
  onFootNow: [
    'U|{unit}, he bailed out {on}! Suspect on foot!',
    'D|Suspect has abandoned the vehicle near {near}. He is on foot, {bound}.',
    'U|{unit}, he is running! On foot, heading {dir}.',
  ],
  officerDown: [
    'U|Officer down! Officer down {on}!',
    'D|Shots fired, shots fired, officer needs assistance {inDistrict}.',
    'D|We have an officer down near {near}. All units, he is armed.',
    'U|{unit}, we lost one {on}. Get an ambulance from Sarab General.',
    'D|Officer down. All units, this is no longer a traffic matter.',
  ],
  smoking: [
    'U|{unit}, suspect vehicle is smoking. He is not going far.',
    'A|His car is smoking, I can see it from up here.',
    'D|Suspect vehicle is damaged. Keep the pressure on.',
  ],
  burning: [
    'U|{unit}, his car is on fire! He is still driving it!',
    'D|Suspect vehicle is burning {on}. Keep your distance, it could go.',
    'A|Shaheen-1, his car is on fire. Bold choice.',
  ],
  onRims: [
    'U|{unit}, tyres are gone! He is on his rims {on}!',
    'D|Spikes got him. Suspect is on the rims, {bound}.',
    'U|{unit}, I can hear the rims from here. He is done.',
    'A|Sparks all over {street}. That car is on its rims.',
  ],
  update: [
    'D|Suspect now {bound} {on}, {district}.',
    'U|{unit}, still with him. {bound} {on}.',
    'U|{unit}, suspect {inVeh}, {bound}, doing about {speed}.',
    'D|Units ahead {on}, he is coming your way, {bound}.',
    'U|{unit}, he is weaving through traffic {on}!',
    'D|All units, suspect {bound} past {near}.',
  ],
  updateOnFoot: [
    'U|{unit}, suspect on foot {inDistrict}, heading for {near}.',
    'A|Shaheen-1, runner {on}, {bound}.',
    'D|Suspect is on foot {on}. Units {inDistrict}, block the exits.',
    'U|{unit}, he is running {dir} on {street}. Cutting him off.',
  ],
  redLight: [
    'A|Shaheen-1 has eyes on. He is running the light at {cross}.',
    'U|{unit}, he blew the red at {cross}!',
    'D|Suspect ran the light at {cross}. Cross traffic, watch out.',
  ],
  speeding: [
    'U|{unit}, he is doing {speed} {on}! I cannot keep up!',
    'A|Shaheen-1, ground units, he is doing {speed}. We will keep him.',
    'D|Suspect speed {speed} kilometres an hour {on}. Do not try to match it.',
  ],
  shotsFired: [
    'U|Shots fired, shots fired {on}!',
    'D|Suspect is firing on officers {inDistrict}. Use cover.',
    'U|{unit}, he is shooting! Taking cover {on}!',
    'U|{unit}, rounds incoming near {near}!',
  ],
  unitWrecked: [
    'U|{unit} is out, he wrecked us {on}!',
    'D|We have a unit down {on}. Send a tow and another car.',
    'U|{unit}, my car is done. He rammed us {on}.',
  ],
  arrest: [
    'U|{unit}, suspect in custody {on}. Code four.',
    'D|Suspect is in custody. Good work, everyone. The tea is on {unit}.',
    'U|{unit}, got him. Hands where I can see them.',
    'D|All units, suspect detained {inDistrict}. Resume patrol.',
  ],
  death: [
    'D|Suspect is down {on}. Ambulance to {district}.',
    'U|{unit}, suspect is down. Call Sarab General.',
    'D|All units, suspect neutralised {inDistrict}. Code four.',
    'U|{unit}, suspect down {on}. That is the end of that.',
  ],
};

/** Short answers a unit (or dispatch) may give after a call. */
export const RADIO_REPLIES = [
  'U|{unit}, copy.',
  'U|{unit}, en route.',
  'U|{unit}, moving to intercept.',
  'U|{unit} copies, two minutes out.',
  'U|{unit}, understood. Lights on.',
  'U|{unit}, roger, cutting across {street}.',
];

/** Who each speaker code is on the subtitles. */
export const RADIO_SPEAKERS = { D: 'PSPD Dispatch', A: 'Shaheen-1' };

/** How important each situation is (higher pushes past others waiting to be said). */
export const RADIO_PRIORITY = {
  star1: 2, star2: 3, star3: 4, star4: 4, star5: 4,
  reacquired: 3, lost: 3, escaped: 5, roadblock: 2, roadblockSpikes: 2, breached: 3,
  heliDispatched: 2, heliArrived: 3, heliLeft: 1, heliHit: 4, heliTracking: 1,
  switchCar: 3, stolePolice: 4, onFootNow: 3, officerDown: 4, smoking: 2, burning: 3, onRims: 3,
  update: 1, updateOnFoot: 1, redLight: 2, speeding: 1, shotsFired: 2, unitWrecked: 2, arrest: 5, death: 5,
};

/** Colour words the dispatcher uses for a car, with the paint each one stands for. */
export const COLOUR_WORDS = [
  ['white', 0xf2f2f2], ['silver', 0xb9bdc3], ['grey', 0x6e7279], ['black', 0x1c1e22], ['red', 0xc4262a],
  ['coral', 0xe4572e], ['orange', 0xf08a24], ['gold', 0xd6a732], ['yellow', 0xf1d33b], ['green', 0x2f8a3f],
  ['lime', 0x9ccc3a], ['teal', 0x1ba39c], ['blue', 0x2f6bd8], ['navy', 0x1b2a4e], ['purple', 0x6c3fa0],
  ['maroon', 0x6d1f2b], ['brown', 0x7a5232], ['sand-coloured', 0xd8c39a], ['pink', 0xe98aa8],
];
