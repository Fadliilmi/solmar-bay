// Fully synthesized sound for Solmar Bay: no audio files, no network.
// Engine hum, two-tone SBPD sirens, gunfire, pickups, and Radio Solmar —
// a looping original chiptune — all built from WebAudio oscillators and noise.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let radioTimer = null;
  let radioOn = false;
  let radioStep = 0;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (or any start): unlocks audio. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    startEngine();
  }

  function startEngine() {
    if (engineOsc || !ctx) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  /** Engine note follows speed: 0 at rest, rising with the car. */
  function setEngine(speed, inCar) {
    if (!ctx || !engineGain) return;
    const target = inCar ? 0.05 + Math.min(Math.abs(speed) / 560, 1) * 0.11 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(48 + Math.min(Math.abs(speed), 560) * 0.32, ctx.currentTime, 0.08);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function gunshot() {
    noiseBurst(0.14, 0.5, 2400);
    blip(160, 0.08, 'square', 0.18);
  }
  function punch() {
    noiseBurst(0.09, 0.35, 500);
  }
  function pickup() {
    blip(880, 0.12, 'sine', 0.25);
    blip(1320, 0.18, 'sine', 0.25, 0.09);
  }
  function coin() {
    blip(1046, 0.1, 'triangle', 0.28);
    blip(1568, 0.22, 'triangle', 0.28, 0.08);
  }
  function missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.26, i * 0.11));
  }
  function wasted() {
    [392, 330, 262, 196].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.2, i * 0.16));
  }

  function setSiren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      let high = true;
      sirenTimer = window.setInterval(() => {
        if (!sirenOsc) return;
        high = !high;
        sirenOsc.frequency.setTargetAtTime(high ? 950 : 650, ctx.currentTime, 0.03);
      }, 380);
    } else if (!on && sirenOsc) {
      window.clearInterval(sirenTimer);
      sirenTimer = null;
      sirenOsc.stop();
      sirenOsc.disconnect();
      sirenOsc = null;
    }
  }

  // Radio Solmar: an original 16-step loop. Bass walks C–A–F–G while a square
  // lead plays a sunny melody over it. 112 BPM, eighth-note steps.
  const RADIO_BASS = [130.8, 130.8, 110, 110, 87.3, 87.3, 98, 98, 130.8, 130.8, 110, 110, 87.3, 87.3, 98, 123.5];
  const RADIO_LEAD = [523, 0, 659, 784, 0, 659, 523, 0, 440, 0, 523, 659, 0, 784, 880, 0];

  function radioTick() {
    if (!radioOn || !ctx) return;
    const step = radioStep % 16;
    const bass = RADIO_BASS[step];
    const lead = RADIO_LEAD[step];
    if (bass) blip(bass, 0.24, 'triangle', 0.16);
    if (lead) blip(lead, 0.2, 'square', 0.06);
    radioStep += 1;
  }

  function setRadio(on) {
    if (on && !radioOn) {
      if (!ensure()) return false;
      radioOn = true;
      radioStep = 0;
      radioTimer = window.setInterval(radioTick, 60 / 112 / 2 * 1000);
      return true;
    }
    if (!on && radioOn) {
      radioOn = false;
      window.clearInterval(radioTimer);
      radioTimer = null;
    }
    return radioOn;
  }

  return {
    unlock, setEngine, gunshot, punch, pickup, coin, missionDone, wasted,
    setSiren, setRadio,
    isRadioOn: () => radioOn,
  };
}
