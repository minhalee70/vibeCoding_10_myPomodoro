/**
 * FocusFlow Web Audio Engine
 * Pure Web Audio API procedural synthesis for ambient soundscapes & alarm chimes.
 * 100% offline capable, zero external latency, no broken CORS/CDN links.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.alarmGain = null;

    this.currentAmbient = null; // 'waves' | 'rain' | 'birds' | null
    this.activeNodes = [];
    this.intervalIds = [];

    this.volume = 0.6;
    this.isMuted = false;
    this.previousVolume = 0.6;

    // Shared noise buffers
    this.pinkNoiseBuffer = null;
    this.whiteNoiseBuffer = null;
  }

  /**
   * Initializes or resumes the AudioContext on user gesture
   */
  async init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Ambient Bus Gain
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      // Alarm Bus Gain
      this.alarmGain = this.ctx.createGain();
      this.alarmGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.alarmGain.connect(this.masterGain);

      // Pre-build noise buffers
      this._generateNoiseBuffers();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Creates pink noise and white noise buffers
   */
  _generateNoiseBuffers() {
    const bufferSize = this.ctx.sampleRate * 5; // 5-second seamless loop buffer
    const whiteBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const whiteData = whiteBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }
    this.whiteNoiseBuffer = whiteBuffer;

    // Pink noise buffer (Paul Kellet's filter method)
    const pinkBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const pinkData = pinkBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    this.pinkNoiseBuffer = pinkBuffer;
  }

  /**
   * Sets Master Volume (0.0 ~ 1.0)
   */
  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (!this.isMuted && this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Toggles Mute status
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      const target = this.isMuted ? 0 : this.volume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  /**
   * Stops all currently playing ambient sound nodes
   */
  stopAmbient() {
    this.activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch (e) {
        // Ignore already stopped nodes
      }
    });
    this.activeNodes = [];

    this.intervalIds.forEach(id => clearInterval(id));
    this.intervalIds = [];

    this.currentAmbient = null;
  }

  /**
   * Plays selected ambient soundscape ('waves' | 'rain' | 'birds')
   */
  async playAmbient(soundType) {
    await this.init();

    // If same sound requested, toggle off
    if (this.currentAmbient === soundType) {
      this.stopAmbient();
      return null;
    }

    this.stopAmbient();
    this.currentAmbient = soundType;

    switch (soundType) {
      case 'waves':
        this._createOceanWaves();
        break;
      case 'rain':
        this._createRainSound();
        break;
      case 'birds':
        this._createBirdSong();
        break;
    }

    return this.currentAmbient;
  }

  /**
   * Synthesizes Ocean Waves (Pink noise + LFO modulation of volume and cutoff)
   */
  _createOceanWaves() {
    const t0 = this.ctx.currentTime;

    // Pink noise buffer source
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.pinkNoiseBuffer;
    noiseSource.loop = true;

    // Low-pass filter simulating water mass
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t0);
    filter.Q.setValueAtTime(1.8, t0);

    // Dynamic wave swell gain
    const waveGain = this.ctx.createGain();
    waveGain.gain.setValueAtTime(0.2, t0);

    // LFO for wave cycle (period ~ 6.5 seconds)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.15, t0); // ~6.6s per cycle

    // Modulation depth for volume
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.35, t0);
    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);

    // Modulation for filter frequency
    const lfoFilterGain = this.ctx.createGain();
    lfoFilterGain.gain.setValueAtTime(260, t0);
    lfo.connect(lfoFilterGain);
    lfoFilterGain.connect(filter.frequency);

    // Fade-in envelope
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0.001, t0);
    envelope.gain.exponentialRampToValueAtTime(0.7, t0 + 1.2);

    // Connect graph
    noiseSource.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(envelope);
    envelope.connect(this.ambientGain);

    noiseSource.start();
    lfo.start();

    this.activeNodes.push(noiseSource, lfo, filter, waveGain, lfoGain, lfoFilterGain, envelope);
  }

  /**
   * Synthesizes Rain Sound (Filtered noise + random droplet bursts)
   */
  _createRainSound() {
    const t0 = this.ctx.currentTime;

    // Pink noise source for gentle steady rain
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.pinkNoiseBuffer;
    noiseSource.loop = true;

    const filter1 = this.ctx.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.setValueAtTime(1100, t0);
    filter1.Q.setValueAtTime(0.75, t0);

    // Highpass filter to remove low rumbling
    const highpass = this.ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(450, t0);

    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(0.001, t0);
    rainGain.gain.exponentialRampToValueAtTime(0.65, t0 + 1.0);

    noiseSource.connect(filter1);
    filter1.connect(highpass);
    highpass.connect(rainGain);
    rainGain.connect(this.ambientGain);

    noiseSource.start();
    this.activeNodes.push(noiseSource, filter1, highpass, rainGain);

    // Subtle individual raindrop generator (random periodic pings)
    const dropInterval = setInterval(() => {
      if (this.currentAmbient !== 'rain' || !this.ctx) return;
      if (Math.random() > 0.4) {
        this._synthesizeDrop();
      }
    }, 180);

    this.intervalIds.push(dropInterval);
  }

  /**
   * Single raindrop impact sound
   */
  _synthesizeDrop() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = 1800 + Math.random() * 1600;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.04);

    gain.gain.setValueAtTime(0.02 + Math.random() * 0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.ambientGain);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * Synthesizes Forest Birds Sound (Gentle breeze + realistic melodic chirps)
   */
  _createBirdSong() {
    const t0 = this.ctx.currentTime;

    // Gentle background breeze noise
    const breeze = this.ctx.createBufferSource();
    breeze.buffer = this.pinkNoiseBuffer;
    breeze.loop = true;

    const breezeFilter = this.ctx.createBiquadFilter();
    breezeFilter.type = 'lowpass';
    breezeFilter.frequency.setValueAtTime(400, t0);

    const breezeGain = this.ctx.createGain();
    breezeGain.gain.setValueAtTime(0.001, t0);
    breezeGain.gain.exponentialRampToValueAtTime(0.12, t0 + 1.5);

    breeze.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(this.ambientGain);

    breeze.start();
    this.activeNodes.push(breeze, breezeFilter, breezeGain);

    // Initial bird chirp
    setTimeout(() => this._playBirdChirpMotif(), 400);

    // Periodic randomized bird chirping
    const birdInterval = setInterval(() => {
      if (this.currentAmbient !== 'birds' || !this.ctx) return;
      if (Math.random() > 0.3) {
        this._playBirdChirpMotif();
      }
    }, 2400);

    this.intervalIds.push(birdInterval);
  }

  /**
   * Synthesizes a natural, multi-note bird chirp motif
   */
  _playBirdChirpMotif() {
    if (!this.ctx || this.currentAmbient !== 'birds') return;

    const baseT = this.ctx.currentTime;
    const notesCount = 2 + Math.floor(Math.random() * 3); // 2 to 4 rapid chirps
    const baseFreq = 2600 + Math.random() * 1200;

    for (let i = 0; i < notesCount; i++) {
      const noteTime = baseT + i * (0.07 + Math.random() * 0.05);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';

      // Sweep frequency up then down
      const f1 = baseFreq + (i * 200) + (Math.random() * 300 - 150);
      const f2 = f1 + 600 + Math.random() * 400;

      osc.frequency.setValueAtTime(f1, noteTime);
      osc.frequency.linearRampToValueAtTime(f2, noteTime + 0.035);
      osc.frequency.exponentialRampToValueAtTime(f1 * 0.9, noteTime + 0.07);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.16, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.07);

      osc.connect(gain);
      gain.connect(this.ambientGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.08);
    }
  }

  /**
   * Plays a celestial bell chime when session finishes
   * @param {string} mode - 'focus' (end of focus -> transition to break) or 'break' (end of break -> transition to focus)
   */
  async playAlarm(mode = 'focus') {
    await this.init();

    const t = this.ctx.currentTime;

    if (mode === 'focus') {
      // Focus complete: Rich Zen singing bowl / celestial harmonic chord
      // Root: 528Hz (Solfeggio frequency for transformation & clarity)
      const freqs = [528, 792, 1056, 1584];
      const gains = [0.45, 0.28, 0.16, 0.09];

      freqs.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(gains[idx], t + 0.03);
        // Long exponential decay for singing bowl effect
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

        osc.connect(gain);
        gain.connect(this.alarmGain);

        osc.start(t);
        osc.stop(t + 3.3);
      });
    } else {
      // Break complete: Refreshing, energetic 3-tone arpeggio (C5 -> E5 -> G5 -> C6)
      const melody = [
        { freq: 523.25, time: 0 },       // C5
        { freq: 659.25, time: 0.15 },    // E5
        { freq: 783.99, time: 0.30 },    // G5
        { freq: 1046.50, time: 0.48 }    // C6
      ];

      melody.forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const noteStart = t + note.time;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, noteStart);

        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.linearRampToValueAtTime(0.35, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 1.2);

        osc.connect(gain);
        gain.connect(this.alarmGain);

        osc.start(noteStart);
        osc.stop(noteStart + 1.3);
      });
    }
  }
}

// Global Sound Engine Instance
window.soundEngine = new SoundEngine();
