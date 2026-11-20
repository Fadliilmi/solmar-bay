// Seeded random numbers (mulberry32) so one seed always builds one city.
// State is a single unsigned 32-bit integer; every draw advances it by the
// fixed constant 0x6D2B79F5 with 32-bit wraparound.

export function makeRng(seed) {
  let s = (seed | 0) >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return {
    // One uniform float in [0, 1).
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // A float in [min, max).
    range(min, max) {
      return min + this.next() * (max - min);
    },
    // An integer in [min, max], both ends inclusive.
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    // One element of a list, chosen uniformly.
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
    // True with the given probability.
    chance(p) {
      return this.next() < p;
    },
  };
}
