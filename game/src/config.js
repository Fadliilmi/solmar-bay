// Every tuning number, colour, car model, district and mission in one place.
// The playfield is a fixed 1280x800 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const VIEW = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The city of Solmar Bay, in world units. Roads sit on a 300-unit grid. */
export const WORLD = {
  width: 3600,
  height: 2600,
  roadSpacing: 300,
  roadWidth: 46,
  beachY: 2220, // sand starts here; the sea is the strip below it
  seaY: 2400,
  marinaX: 3420, // the harbour water starts here, on the east edge
};

export const PALETTE = {
  grass: '#4d7a3f',
  parkGrass: '#5d8f47',
  sand: '#d9c184',
  sea: '#1d5f7a',
  seaDeep: '#144a63',
  road: '#33373d',
  roadEdge: '#23262b',
  sidewalk: '#8d8d84',
  laneMark: '#d8c95a',
  buildingRoof: '#6b5d4f',
  text: '#f2f0e6',
  muted: '#b9b7a8',
  hudPanel: 'rgba(12, 14, 18, 0.72)',
  hudBorder: 'rgba(255, 255, 255, 0.18)',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4fc3f7',
};

/** Six stealable car models. Top speed is world units per second. */
export const CAR_MODELS = [
  { id: 'vela', name: 'Vela Sedan', topSpeed: 430, accel: 300, grip: 2.6, length: 64, width: 30, colors: ['#c23b2e', '#3f6fb5', '#c9c9c2', '#3e7d4e'] },
  { id: 'cometa', name: 'Cometa GT', topSpeed: 560, accel: 420, grip: 3.1, length: 62, width: 28, colors: ['#e8a020', '#c22e5e', '#22242a', '#d8d8d8'] },
  { id: 'rancho', name: 'Rancho Pickup', topSpeed: 400, accel: 260, grip: 2.3, length: 70, width: 32, colors: ['#5a6e3f', '#8a6d3b', '#4a4a52'] },
  { id: 'brisa', name: 'Brisa Convertible', topSpeed: 500, accel: 360, grip: 2.9, length: 60, width: 28, colors: ['#e86a8a', '#2fa8a0', '#f2f2f2'] },
  { id: 'carguero', name: 'Carguero Van', topSpeed: 360, accel: 220, grip: 2.0, length: 76, width: 34, colors: ['#d8d3c0', '#5b7a99', '#7a7a7a'] },
  { id: 'bajito', name: 'Bajito Lowrider', topSpeed: 440, accel: 300, grip: 2.4, length: 66, width: 30, colors: ['#7a2ea6', '#2ea66a', '#c98a2e'] },
];

/** Districts, by block centre. Order matters: first match wins. */
export const DISTRICTS = [
  { id: 'marina', name: 'Marina', test: (x, y) => x >= 3000 && y >= 900 && y < 2100 },
  { id: 'park', name: 'Palm Park', test: (x, y) => x >= 1350 && x < 1950 && y >= 1500 && y < 1800 },
  { id: 'beach', name: 'Beachfront', test: (x, y) => y >= 1800 },
  { id: 'downtown', name: 'Downtown', test: (x, y) => x >= 1200 && x < 3000 && y >= 600 && y < 1800 },
  { id: 'oldtown', name: 'Old Town', test: (x, y) => x < 900 && y >= 600 && y < 1500 },
  { id: 'industrial', name: 'Industrial', test: (x, y) => x >= 2700 && y < 900 },
  { id: 'suburbs', name: 'Suburbs', test: () => true },
];

export const DISTRICT_STYLE = {
  downtown: { roof: ['#5d6b7a', '#7a6a5d', '#4f5a68', '#8a7a5a'], height: [42, 78], windows: '#ffd76a' },
  oldtown: { roof: ['#a9805a', '#8a6a4a', '#b59a72'], height: [18, 34], windows: '#ffcf7a' },
  industrial: { roof: ['#6a6a6a', '#7d7468', '#555c66'], height: [14, 26], windows: '#cfe8ff' },
  marina: { roof: ['#e8e2d2', '#7fa8b8', '#d8c9a8'], height: [16, 36], windows: '#ffe9a8' },
  beach: { roof: ['#e8e2d2', '#d8b48a', '#f2ead8'], height: [14, 30], windows: '#ffe9a8' },
  suburbs: { roof: ['#a85a4a', '#7a8a6a', '#8a7a5a', '#6a7a8a'], height: [12, 22], windows: '#ffd76a' },
  park: { roof: ['#5d8f47'], height: [8, 12], windows: '#ffd76a' },
};

/** The six story missions of Rico Vega and his fixer, Tia Carmen. */
export const MISSIONS = [
  {
    id: 'm1',
    title: 'First Wheels',
    intro: 'TIA CARMEN: Rico, you need wheels. Grab any car on the street and bring it to my garage.',
    reward: 150,
    steps: [
      { type: 'steal', label: 'Steal a car', hint: 'Walk up to a parked car and press E' },
      { type: 'goto', x: 465, y: 465, label: 'Drive to Carmen\u2019s Garage', hint: 'Follow the yellow marker' },
    ],
  },
  {
    id: 'm2',
    title: 'Beachfront Heat',
    intro: 'TIA CARMEN: The Lobos crew is muscling in on my beach turf. Go down there and send them packing.',
    reward: 300,
    steps: [
      { type: 'goto', x: 1650, y: 2070, label: 'Go to the beachfront', hint: 'Head south to the sand' },
      { type: 'kill', count: 4, x: 1650, y: 2070, label: 'Deal with the Lobos crew (0/4)', hint: 'Aim with the mouse, click to shoot' },
      { type: 'goto', x: 465, y: 465, label: 'Report back to Carmen', hint: 'Drive back to the garage' },
    ],
  },
  {
    id: 'm3',
    title: 'The Marina Pickup',
    intro: 'TIA CARMEN: A package is waiting at the marina docks. Pick it up — and keep your eyes open.',
    reward: 350,
    steps: [
      { type: 'goto', x: 3300, y: 1350, label: 'Go to the marina docks', hint: 'East side, by the water' },
      { type: 'collect', x: 3300, y: 1350, label: 'Pick up the package', hint: 'Press E at the marker' },
      { type: 'goto', x: 465, y: 465, label: 'Deliver the package to Carmen', hint: 'Cops may be watching — stay cool' },
    ],
  },
  {
    id: 'm4',
    title: 'Old Town Payback',
    intro: 'TIA CARMEN: The Lobos torched one of my stores in Old Town. Make them regret it.',
    reward: 500,
    steps: [
      { type: 'goto', x: 450, y: 1050, label: 'Go to Old Town', hint: 'West side of the city' },
      { type: 'kill', count: 5, x: 450, y: 1050, label: 'Take out the Lobos crew (0/5)', hint: 'They are armed — use cover' },
      { type: 'goto', x: 465, y: 465, label: 'Report back to Carmen', hint: 'The garage is north-west' },
    ],
  },
  {
    id: 'm5',
    title: 'Night Run',
    intro: 'TIA CARMEN: A buyer waits at the industrial yard. Night run, no headlights off — I mean, keep them on. Be quick.',
    reward: 600,
    steps: [
      { type: 'goto', x: 3150, y: 450, label: 'Reach the industrial yard', hint: 'North-east corner' },
      { type: 'timed', seconds: 75, x: 465, y: 465, label: 'Get back to the garage before time runs out', hint: '75 seconds. Drive fast, drive clean.' },
    ],
  },
  {
    id: 'm6',
    title: 'The Solmar Score',
    intro: 'TIA CARMEN: This is the big one, Rico. The Solmar Bank. In, out, and gone before the whole SBPD wakes up.',
    reward: 2500,
    steps: [
      { type: 'goto', x: 1950, y: 750, label: 'Go to Solmar Bank', hint: 'Downtown, east side' },
      { type: 'collect', x: 1950, y: 750, label: 'Grab the cash', hint: 'Press E at the vault door' },
      { type: 'escape', x: 750, y: 1950, label: 'Lose the cops and reach the safehouse', hint: 'Five stars. Get to the green marker and stay out of sight.' },
    ],
  },
];

/** Eight hidden Sun Coins, scattered across Solmar Bay. */
export const SUN_COINS = [
  { x: 1650, y: 1650, hint: 'Palm Park pond' },
  { x: 750, y: 2250, hint: 'Beach pier' },
  { x: 3330, y: 1950, hint: 'Marina south dock' },
  { x: 450, y: 750, hint: 'Old Town plaza' },
  { x: 2850, y: 450, hint: 'Industrial yard' },
  { x: 750, y: 450, hint: 'Suburbs cul-de-sac' },
  { x: 2250, y: 1350, hint: 'Downtown alley' },
  { x: 2550, y: 1950, hint: 'Beachfront boardwalk' },
];

/** Fixed city services the player can use. */
export const PLACES = {
  garage: { x: 465, y: 465, name: 'Carmen\u2019s Garage', color: '#f2c94c' },
  gunshop: { x: 1350, y: 750, name: 'Ammo-Nation Gun Shop', color: '#e5534b' },
  spray: { x: 2550, y: 1650, name: 'Pay \u2019n Spray', color: '#4fc3f7' },
  hospital: { x: 1050, y: 1650, name: 'Solmar General Hospital', color: '#7ee787' },
  bank: { x: 1950, y: 750, name: 'Solmar Bank', color: '#f2c94c' },
  safehouse: { x: 750, y: 1950, name: 'Safehouse', color: '#7ee787' },
};

export const PLAYER = {
  walkSpeed: 230,
  radius: 14,
  health: 100,
  armor: 100,
  pistolDamage: 34,
  pistolRange: 420,
  pistolAmmoStart: 48,
  fistDamage: 18,
  fistRange: 46,
};

export const WANTED = {
  decayDelay: 12, // seconds without a crime before heat starts falling
  decayRate: 1.6, // heat per second while cooling down
  heatPerStar: 20,
  maxHeat: 110,
  crime: { steal: 22, killPed: 24, killCop: 40, shootNearCop: 12, damageCar: 3 },
};

export const SAVE_KEY = 'solmar-bay.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
