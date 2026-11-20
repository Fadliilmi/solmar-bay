// Solmar Bay — all sound is synthesized with WebAudio. No audio files.
// Master gain 0.5. Engine hum, police sirens, gunfire, chimes and an
// original chiptune loop on Radio Solmar.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenNext = 0;
    this.radioOn = false;
    this.radioStep = 0;
    this.radioNext = 0;
    // Radio Solmar: 16 eighth-note steps at 112 BPM.
    this.bassLine = [130.8, 130.8, 110, 110, 87.3, 87.3, 98, 98, 130.8, 130.8, 110, 110, 87.3, 87.3, 98, 123.5];
    this.leadLine = [523, 0, 659, 784, 0, 659, 523, 0, 440, 0, 523, 659, 0, 784, 880, 0];
  }

  // Must be called from a user gesture at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: sawtooth through a low-pass filter, gain follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();

    // Siren: one triangle oscillator, flipped between two pitches.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 650;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setEngine(speed, inCar) {
    if (!this.ctx) return;
    const ratio = Math.min(1, Math.abs(speed) / 560);
    this.engineOsc.frequency.setTargetAtTime(60 + ratio * 160, this.ctx.currentTime, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + ratio * 900, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(inCar ? 0.05 + ratio * 0.09 : 0, this.ctx.currentTime, 0.1);
  }

  setSiren(wanted) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (wanted > 0) {
      if (now >= this.sirenNext) {
        this.sirenNext = now + 0.38;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setValueAtTime(this.sirenHigh ? 950 : 650, now);
      }
      this.sirenGain.gain.setTargetAtTime(0.05, now, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, now, 0.1);
    }
  }

  tone(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const t = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, lowFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq || 3000;
    const gain = this.ctx.createGain();
    gain.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shot() {
    this.noise(0.12, 0.35, 2500);
    this.tone(180, 0.08, 'square', 0.18);
  }

  punch() {
    this.noise(0.09, 0.25, 500);
  }

  pickup() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.tone(660, 0.12, 'triangle', 0.22, t);
    this.tone(880, 0.18, 'triangle', 0.22, t + 0.1);
  }

  coin() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.tone(988, 0.12, 'triangle', 0.22, t);
    this.tone(1319, 0.22, 'triangle', 0.22, t + 0.1);
  }

  missionDone() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, t + i * 0.14));
  }

  wasted() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.18, t + i * 0.2));
  }

  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.radioOn && this.ctx) {
      this.radioStep = 0;
      this.radioNext = this.ctx.currentTime + 0.05;
    }
    return this.radioOn;
  }

  // Called every frame; schedules radio notes a little ahead of time.
  updateRadio() {
    if (!this.ctx || !this.radioOn) return;
    const stepDur = 60 / 112 / 2; // eighth notes at 112 BPM
    while (this.radioNext < this.ctx.currentTime + 0.15) {
      const i = this.radioStep % 16;
      const bass = this.bassLine[i];
      const lead = this.leadLine[i];
      this.tone(bass, stepDur * 0.9, 'triangle', 0.16, this.radioNext);
      if (lead > 0) this.tone(lead, stepDur * 0.9, 'square', 0.07, this.radioNext);
      this.radioNext += stepDur;
      this.radioStep++;
    }
  }
}
