// Solmar Bay — all tuning data in one place. Numbers, colours, car models,
// districts, fixed places, Sun Coins and the six story missions live here so
// the simulation, renderer and screenshot staging all read the same values.

export const VIEW_W = 1280;
export const VIEW_H = 800;
export const STEP = 1 / 60;

export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const GRID = 300;
export const ROAD_W = 46;
export const SAND_Y = 2220;
export const SEA_Y = 2400;
export const HARBOUR_X = 3420;

export const COLORS = {
  grass: '#4d7a3f',
  parkGrass: '#5d8f47',
  sand: '#d9c184',
  sea: '#1d5f7a',
  deepSea: '#144a63',
  road: '#33373d',
  roadEdge: '#23262b',
  sidewalk: '#8d8d84',
  lane: '#d8c95a',
  roof: '#6b5d4f',
  text: '#f2f0e6',
  muted: '#b9b7a8',
  hudPanel: 'rgba(12,14,18,0.72)',
  hudBorder: 'rgba(255,255,255,0.18)',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4fc3f7',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Six stealable cars. top = top speed (world units / second).
export const CAR_MODELS = [
  { name: 'Vela Sedan', top: 430, accel: 300, grip: 2.6, len: 64, wid: 30,
    colors: ['#c23b2e', '#3f6fb5', '#c9c9c2', '#3e7d4e'] },
  { name: 'Cometa GT', top: 560, accel: 420, grip: 3.1, len: 62, wid: 28,
    colors: ['#e8a020', '#c22e5e', '#22242a', '#d8d8d8'] },
  { name: 'Rancho Pickup', top: 400, accel: 260, grip: 2.3, len: 70, wid: 32,
    colors: ['#5a6e3f', '#8a6d3b', '#4a4a52'] },
  { name: 'Brisa Convertible', top: 500, accel: 360, grip: 2.9, len: 60, wid: 28,
    colors: ['#e86a8a', '#2fa8a0', '#f2f2f2'] },
  { name: 'Carguero Van', top: 360, accel: 220, grip: 2.0, len: 76, wid: 34,
    colors: ['#d8d3c0', '#5b7a99', '#7a7a7a'] },
  { name: 'Bajito Lowrider', top: 440, accel: 300, grip: 2.4, len: 66, wid: 30,
    colors: ['#7a2ea6', '#2ea66a', '#c98a2e'] },
];

// Districts are tested in order; the first match wins.
export function districtAt(x, y) {
  if (x >= 3000 && y >= 900 && y < 2100) return 'Marina';
  if (x >= 1350 && x < 1950 && y >= 1500 && y < 1800) return 'Palm Park';
  if (y >= 1800) return 'Beachfront';
  if (x >= 1200 && x < 3000 && y >= 600 && y < 1800) return 'Downtown';
  if (x < 900 && y >= 600 && y < 1500) return 'Old Town';
  if (x >= 2700 && y < 900) return 'Industrial';
  return 'Suburbs';
}

// Roof colours, building heights and night window tint per district.
export const DISTRICT_STYLE = {
  Downtown: { roofs: ['#5d6b7a', '#7a6a5d', '#4f5a68', '#8a7a5a'], hMin: 42, hMax: 78, window: '#ffd76a' },
  'Old Town': { roofs: ['#a9805a', '#8a6a4a', '#b59a72'], hMin: 18, hMax: 34, window: '#ffcf7a' },
  Industrial: { roofs: ['#6a6a6a', '#7d7468', '#555c66'], hMin: 14, hMax: 26, window: '#cfe8ff' },
  Marina: { roofs: ['#e8e2d2', '#7fa8b8', '#d8c9a8'], hMin: 16, hMax: 36, window: '#ffe9a8' },
  Beachfront: { roofs: ['#e8e2d2', '#d8b48a', '#f2ead8'], hMin: 14, hMax: 30, window: '#ffe9a8' },
  Suburbs: { roofs: ['#a85a4a', '#7a8a6a', '#8a7a5a', '#6a7a8a'], hMin: 12, hMax: 22, window: '#ffd76a' },
  'Palm Park': { roofs: ['#5d8f47'], hMin: 8, hMax: 12, window: '#ffd76a' },
};

export const PLACES = [
  { name: "Carmen's Garage", short: 'Garage', x: 465, y: 465, color: '#f2c94c', letter: 'C' },
  { name: 'Ammo-Nation Gun Shop', short: 'Gun Shop', x: 1350, y: 750, color: '#e5534b', letter: 'G' },
  { name: "Pay 'n Spray", short: "Pay 'n Spray", x: 2550, y: 1650, color: '#4fc3f7', letter: 'P' },
  { name: 'Solmar General Hospital', short: 'Hospital', x: 1050, y: 1650, color: '#7ee787', letter: 'H' },
  { name: 'Solmar Bank', short: 'Bank', x: 1950, y: 750, color: '#f2c94c', letter: '$' },
  { name: 'Safehouse', short: 'Safehouse', x: 750, y: 1950, color: '#7ee787', letter: 'S' },
];

export const PLAYER = {
  walkSpeed: 230,
  radius: 14,
  health: 100,
  armour: 100,
  pistolDamage: 34,
  pistolRange: 420,
  pistolAmmoStart: 48,
  fistDamage: 18,
  fistRange: 46,
  startCash: 120,
  startX: 465,
  startY: 540,
};

export const WANTED = {
  heatPerStar: 20,
  maxHeat: 110,
  decayDelay: 12,
  decayRate: 1.6,
  stealCar: 22,
  killPed: 24,
  killCop: 40,
  shootNearCop: 12,
  crashCar: 3,
};

export const SUN_COINS = [
  { x: 1650, y: 1650, label: 'Palm Park pond' },
  { x: 750, y: 2250, label: 'beach pier' },
  { x: 3330, y: 1950, label: 'marina south dock' },
  { x: 450, y: 750, label: 'Old Town plaza' },
  { x: 2850, y: 450, label: 'industrial yard' },
  { x: 750, y: 450, label: 'suburbs cul-de-sac' },
  { x: 2250, y: 1350, label: 'downtown alley' },
  { x: 2550, y: 1950, label: 'beachfront boardwalk' },
];
export const COIN_VALUE = 250;

// Six story missions. A step is one of:
//   steal | goto {x,y} | kill {count,x,y} | collect {x,y} | timed {seconds,x,y} | escape {x,y}
export const MISSIONS = [
  {
    title: 'First Wheels',
    reward: 150,
    intro: "TIA CARMEN: Rico, you need wheels. Grab any car on the street and bring it to my garage.",
    steps: [
      { kind: 'steal', label: 'Steal a car', hint: 'Walk up to a parked car and press E' },
      { kind: 'goto', x: 465, y: 465, label: "Drive to Carmen's Garage", hint: 'Follow the yellow marker' },
    ],
  },
  {
    title: 'Beachfront Heat',
    reward: 300,
    intro: 'TIA CARMEN: The Lobos crew is muscling in on my beach turf. Go down there and send them packing.',
    steps: [
      { kind: 'goto', x: 1650, y: 2070, label: 'Go to the beachfront', hint: 'Head south to the sand' },
      { kind: 'kill', count: 4, x: 1650, y: 2070, label: 'Deal with the Lobos crew (0/4)', hint: 'Aim with the mouse, click to shoot' },
      { kind: 'goto', x: 465, y: 465, label: 'Report back to Carmen', hint: 'Drive back to the garage' },
    ],
  },
  {
    title: 'The Marina Pickup',
    reward: 350,
    intro: 'TIA CARMEN: A package is waiting at the marina docks. Pick it up — and keep your eyes open.',
    steps: [
      { kind: 'goto', x: 3300, y: 1350, label: 'Go to the marina docks', hint: 'East side, by the water' },
      { kind: 'collect', x: 3300, y: 1350, label: 'Pick up the package', hint: 'Press E at the marker' },
      { kind: 'goto', x: 465, y: 465, label: 'Deliver the package to Carmen', hint: 'Cops may be watching — stay cool' },
    ],
  },
  {
    title: 'Old Town Payback',
    reward: 500,
    intro: 'TIA CARMEN: The Lobos torched one of my stores in Old Town. Make them regret it.',
    steps: [
      { kind: 'goto', x: 450, y: 1050, label: 'Go to Old Town', hint: 'West side of the city' },
      { kind: 'kill', count: 5, x: 450, y: 1050, label: 'Take out the Lobos crew (0/5)', hint: 'They are armed — use cover' },
      { kind: 'goto', x: 465, y: 465, label: 'Report back to Carmen', hint: 'The garage is north-west' },
    ],
  },
  {
    title: 'Night Run',
    reward: 600,
    intro: 'TIA CARMEN: A buyer waits at the industrial yard. Night run, no headlights off — I mean, keep them on. Be quick.',
    steps: [
      { kind: 'goto', x: 3150, y: 450, label: 'Reach the industrial yard', hint: 'North-east corner' },
      { kind: 'timed', seconds: 75, x: 465, y: 465, label: 'Get back to the garage before time runs out', hint: '75 seconds. Drive fast, drive clean.' },
    ],
  },
  {
    title: 'The Solmar Score',
    reward: 2500,
    intro: 'TIA CARMEN: This is the big one, Rico. The Solmar Bank. In, out, and gone before the whole SBPD wakes up.',
    steps: [
      { kind: 'goto', x: 1950, y: 750, label: 'Go to Solmar Bank', hint: 'Downtown, east side' },
      { kind: 'collect', x: 1950, y: 750, label: 'Grab the cash', hint: 'Press E at the vault door' },
      { kind: 'escape', x: 750, y: 1950, label: 'Lose the cops and reach the safehouse', hint: 'Five stars. Get to the green marker and stay out of sight.' },
    ],
  },
];

export const SAVE_KEY = 'solmar-bay.save.v1';
