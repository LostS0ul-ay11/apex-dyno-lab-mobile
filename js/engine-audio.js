/**
 * APEX DYNO - Ultra-Realistic Automotive Acoustic Synthesizer v3.0
 * ================================================================
 * Physically-modeled engine sound synthesis:
 *
 * EXHAUST COLUMN MODEL:
 *   - 6-layer harmonic stack with per-engine Fourier coefficients
 *   - Asymmetric blowdown shockwave (fast rise / exponential fall / rarefaction dip)
 *   - Tube acoustic saturation via asymmetric WaveShaper (no clipping artifacts)
 *   - 4-stage exhaust resonator chain (primary runner → collector → mid-pipe → tailpipe)
 *   - Dynamic EQ that changes character from idle muffle to full-rev scream
 *
 * PER-ENGINE ACOUSTIC DNA:
 *   - V8 Crossplane: 90° firing irregular burble, deep crossplane sub-bass thump
 *   - V8 Flatplane: high-freq Ferrari/F1 shriek, clean harmonics, no burble
 *   - Boxer UEL: syncopated Subaru rumble, phase-offset pulses
 *   - Rotary: buzzing brap at idle, turbine-like whirr at high RPM
 *   - I5: warbling 5-cyl syncopation, unique odd-order harmonics
 *   - VR6: narrow-angle metallic trombone rasp
 *   - V12/V10: symphony of dense, smooth high-frequency harmonics
 *
 * INTAKE MODEL:
 *   - Helmholtz intake roar with ITB-style bark at WOT snap
 *   - Induction noise that fills in the mid at high RPM
 *
 * FORCED INDUCTION:
 *   - Turbo: multi-harmonic whistle, airflow hiss, turbine whirr, BOV flutter
 *   - Supercharger: Roots pulsation, twin-screw helical mesh scream
 *
 * TRANSIENT EVENTS:
 *   - Rev limiter ignition cut with hard decel pop
 *   - 2-step anti-lag machine gun with tunable randomness
 *   - Natural overrun crackle on throttle lift
 *   - NOS injection surge and crack
 *   - BOV multi-stage flutter release ("pssh-tu-tu-tu-tu")
 */

class EngineAudioSystem {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.isMuted = false;
    this.masterGain = null;

    this.currentEngine = null;
    this.currentInduction = null;
    this.currentExhaust = null;

    // PeriodicWave objects per engine
    this.primaryWave = null;
    this.raspWave = null;
    this.burbleWave = null;

    this.nodes = {};

    // State tracking
    this.prevThrottle = 0;
    this.prevRpm = 0;
    this.prevBoost = 0;
    this.lastBackfireTime = 0;
    this.isBovActive = false;
    this.jitterPhase = 0;
    this.overrunBurblePhase = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CONTEXT INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  initContext() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 44100 });

      // Master brickwall limiter – prevents digital clipping
      this.nodes.limiter = this.ctx.createDynamicsCompressor();
      this.nodes.limiter.threshold.setValueAtTime(-2.0, this.ctx.currentTime);
      this.nodes.limiter.knee.setValueAtTime(3.0, this.ctx.currentTime);
      this.nodes.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
      this.nodes.limiter.attack.setValueAtTime(0.0005, this.ctx.currentTime);
      this.nodes.limiter.release.setValueAtTime(0.08, this.ctx.currentTime);

      // Master gain with slight warmth EQ
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.82, this.ctx.currentTime);

      // Subtle warmth shelf to knock off harsh digital edge
      this.nodes.masterEQ = this.ctx.createBiquadFilter();
      this.nodes.masterEQ.type = 'highshelf';
      this.nodes.masterEQ.frequency.setValueAtTime(8000, this.ctx.currentTime);
      this.nodes.masterEQ.gain.setValueAtTime(-3.5, this.ctx.currentTime);

      this.nodes.limiter.connect(this.nodes.masterEQ);
      this.nodes.masterEQ.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.isInitialized = true;
      return true;
    } catch (e) {
      console.error('AudioContext init failed:', e);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PERIODIC WAVE BUILDER  (Fourier synthesis from firing order)
  // ─────────────────────────────────────────────────────────────────────────

  _buildEngineWaves(eng) {
    if (!this.ctx) return;

    const H  = 96;   // harmonics
    const N  = 2048; // integration samples

    const rP = new Float32Array(H), iP = new Float32Array(H); // primary exhaust pulse
    const rR = new Float32Array(H), iR = new Float32Array(H); // high-freq metallic rasp
    const rB = new Float32Array(H), iB = new Float32Array(H); // sub-bass burble / chug

    const delays     = eng.firingDelays || [0, 0.5];
    const cylCount   = eng.cylinders || delays.length;
    const sharpness  = (eng.acousticProfile && eng.acousticProfile.pulseSharpness) || 0.82;
    const bassWeight = (eng.acousticProfile && eng.acousticProfile.bassWeight)     || 0.6;
    const raspWeight = (eng.acousticProfile && eng.acousticProfile.exhaustRasp)    || 0.8;
    const isRotary   = eng.layout === 'rotary';
    const isFlatPlane = (eng.layout === 'v' && eng.acousticProfile && eng.acousticProfile.character === 'flatplane_shriek');
    const isCrossplane = eng.acousticProfile && eng.acousticProfile.character === 'crossplane_rumble';
    const isBoxerUEL   = eng.acousticProfile && eng.acousticProfile.character === 'subie_rumble';
    const isI5         = eng.acousticProfile && eng.acousticProfile.character === 'i5_warble';

    const wP = new Float32Array(N);
    const wR = new Float32Array(N);
    const wB = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const t = i / N;
      let pSum = 0, rSum = 0, bSum = 0;

      for (let c = 0; c < delays.length; c++) {
        let dt = (t - delays[c]) % 1.0;
        if (dt < 0) dt += 1.0;

        // Pulse width narrows with more cylinders (more tightly packed firing events)
        const pulseWidth = Math.max(0.04, (isRotary ? 0.22 : 0.26) / Math.sqrt(cylCount));

        if (dt < pulseWidth) {
          const ph = dt / pulseWidth; // normalized 0→1 within pulse

          // ── PRIMARY EXHAUST PULSE ─────────────────────────────────────────
          // Physical model: exhaust valve snaps open → blowdown pressure spike
          // then rarefaction dip as gases exit, then pipe resonance tail
          const rise    = Math.pow(Math.sin(ph * Math.PI * 0.5), 0.6);    // fast rise
          const decay   = Math.exp(-ph * (3.5 + sharpness * 3.0));         // exponential decay
          const rarefy  = -0.28 * Math.sin(ph * Math.PI) * Math.exp(-ph * 2.5); // rarefaction dip
          const pipeTail = 0.12 * Math.sin(ph * Math.PI * 2.2) * Math.exp(-ph * 5.0); // pipe resonance

          let pulse = rise * decay + rarefy + pipeTail;

          // Crossplane V8: alternating bank uneven intervals create the "potato" burble
          if (isCrossplane) {
            pulse *= (1.0 + 0.35 * Math.sin(ph * Math.PI * 0.5 + c * 1.2));
          }
          // Boxer UEL: asymmetric header lengths cause phase smearing
          if (isBoxerUEL && c % 2 === 1) {
            pulse *= 0.78; // one bank quieter due to longer header
            // additional timing smear
            let dt2 = (t - (delays[c] + 0.05)) % 1.0;
            if (dt2 < 0) dt2 += 1.0;
            if (dt2 < pulseWidth) {
              const ph2 = dt2 / pulseWidth;
              pulse += 0.4 * Math.sin(ph2 * Math.PI) * Math.exp(-ph2 * 4.0);
            }
          }

          pSum += pulse;

          // ── HIGH-FREQ METALLIC RASP ──────────────────────────────────────
          // Models compression shockwave harmonics exiting the exhaust valve seat
          const raspShock = Math.sin(ph * Math.PI * (isFlatPlane ? 4 : 2.5))
                          * Math.exp(-ph * (isRotary ? 6 : 9.0))
                          * raspWeight;
          // Rotary adds a buzzy harmonic packet (3 combustion events per rotor revolution)
          const rotaryBuzz = isRotary
            ? 0.4 * Math.sin(ph * Math.PI * 6) * Math.exp(-ph * 12) : 0;
          rSum += raspShock + rotaryBuzz;

          // ── SUB-BASS BURBLE / CHUG ────────────────────────────────────────
          // Models the low-frequency pressure wave that rattles your chest
          const chugPulse = Math.sin(ph * Math.PI * (isCrossplane ? 0.5 : 1.0))
                          * Math.exp(-ph * 2.0)
                          * bassWeight;
          bSum += chugPulse;
        }
      }

      // I5 warble: add extra 5th-order intermodulation to break up the regularity
      if (isI5) {
        const warble = 0.18 * Math.sin(t * 2 * Math.PI * 2.5) * Math.sin(t * 2 * Math.PI * 3.0);
        wP[i] = pSum + warble;
      } else {
        wP[i] = pSum;
      }
      wR[i] = rSum;
      wB[i] = bSum;
    }

    // DFT → PeriodicWave coefficients
    for (let m = 1; m < H; m++) {
      let spP = 0, scP = 0, spR = 0, scR = 0, spB = 0, scB = 0;
      const w = 2 * Math.PI * m / N;
      for (let i = 0; i < N; i++) {
        const c = Math.cos(w * i), s = Math.sin(w * i);
        spP += wP[i] * s; scP += wP[i] * c;
        spR += wR[i] * s; scR += wR[i] * c;
        spB += wB[i] * s; scB += wB[i] * c;
      }
      rP[m] = (scP / N) * 2;  iP[m] = (spP / N) * 2;
      rR[m] = (scR / N) * 2;  iR[m] = (spR / N) * 2;
      rB[m] = (scB / N) * 2;  iB[m] = (spB / N) * 2;
    }

    this.primaryWave = this.ctx.createPeriodicWave(rP, iP, { disableNormalization: false });
    this.raspWave    = this.ctx.createPeriodicWave(rR, iR, { disableNormalization: false });
    this.burbleWave  = this.ctx.createPeriodicWave(rB, iB, { disableNormalization: false });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  WAVESHAPER CURVES
  // ─────────────────────────────────────────────────────────────────────────

  /** Asymmetric acoustic tube saturation – models exhaust pipe non-linearity */
  _exhaustSaturationCurve() {
    const n = 4096;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Positive side: fast compression wavefront (hard-sided shockwave)
      // Negative side: gentler rarefaction (lower acoustic impedance on exhaust port)
      if (x >= 0) {
        c[i] = (Math.tanh(x * 3.2) * 0.72 + Math.tanh(x * 1.1) * 0.28);
      } else {
        c[i] = Math.tanh(x * 2.0) * 0.9;
      }
    }
    return c;
  }

  /** Gentle odd-harmonic saturation for intake roar */
  _intakeSaturationCurve() {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = Math.tanh(x * 1.8) * 0.85 + x * 0.15 * Math.sign(x);
    }
    return c;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  NOISE BUFFERS
  // ─────────────────────────────────────────────────────────────────────────

  /** Pink-ish noise via 3-pole IIR (Paul Kellet method) */
  _makePinkNoise(seconds, amplitude = 1.0) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362) * 0.11 * amplitude;
      b6 = w * 0.115926;
    }
    return buf;
  }

  /** White noise for high-freq hiss and turbo airflow */
  _makeWhiteNoise(seconds, amplitude = 1.0) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * amplitude;
    return buf;
  }

  /** Mechanical clatter: bandlimited impulse train noise */
  _makeMechNoise(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // High-pass to remove DC, then mix with short-correlated signal for metallic ring
      const hp = w - prev * 0.97;
      prev = w;
      d[i] = hp * 0.18;
    }
    return buf;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  ENGINE START — builds entire audio graph
  // ─────────────────────────────────────────────────────────────────────────

  startEngine(engineData, inductionData, exhaustData) {
    if (!this.initContext()) return;
    this.stopEngine();

    this.currentEngine    = engineData;
    this.currentInduction = inductionData;
    this.currentExhaust   = exhaustData || { bassBoost: 1, trebleBoost: 1, volume: 1, pops: 0.5 };

    const t   = this.ctx.currentTime;
    const eng = engineData;
    const profile = eng.acousticProfile || {};

    // ── 1. Build per-engine Fourier waves ─────────────────────────────────
    this._buildEngineWaves(eng);

    // ── 2. WaveShaper (exhaust tube saturation) ───────────────────────────
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._exhaustSaturationCurve();
    shaper.oversample = '4x';
    this.nodes.shaper = shaper;

    // ── 3. PRIMARY OSCILLATOR BANK ────────────────────────────────────────
    // Layer A: Primary exhaust pulse (dominant body of the sound)
    const oscA = this.ctx.createOscillator();
    oscA.setPeriodicWave(this.primaryWave);
    this.nodes.oscA = oscA;

    const gainA = this.ctx.createGain();
    gainA.gain.setValueAtTime(0.75, t);
    this.nodes.gainA = gainA;

    // Layer B: Metallic rasp / high-order harmonics
    const oscB = this.ctx.createOscillator();
    oscB.setPeriodicWave(this.raspWave);
    this.nodes.oscB = oscB;

    const gainB = this.ctx.createGain();
    gainB.gain.setValueAtTime(0.28, t);
    this.nodes.gainB = gainB;

    // Layer C: Sub-bass burble / chug (runs at half-cycle for 4-stroke piston engines)
    const oscC = this.ctx.createOscillator();
    oscC.setPeriodicWave(this.burbleWave);
    this.nodes.oscC = oscC;

    const gainC = this.ctx.createGain();
    gainC.gain.setValueAtTime(profile.bassWeight || 0.6, t);
    this.nodes.gainC = gainC;

    // Layer D: Pure sub-bass sine thump (valve-train & piston slap)
    const oscD = this.ctx.createOscillator();
    oscD.type = 'sine';
    this.nodes.oscD = oscD;

    const gainD = this.ctx.createGain();
    gainD.gain.setValueAtTime(0.18, t);
    this.nodes.gainD = gainD;

    // Connect oscillator bank → shaper
    oscA.connect(gainA); gainA.connect(shaper);
    oscB.connect(gainB); gainB.connect(shaper);
    oscC.connect(gainC); gainC.connect(shaper);
    oscD.connect(gainD); gainD.connect(shaper);

    // ── 4. EXHAUST RESONATOR CHAIN ────────────────────────────────────────
    // Models: cylinder head port → primary runner → collector → mid pipe → muffler → tip
    const baseRes = profile.resonanceFreq || 260;

    // Stage 1: Primary runner resonance (100–400 Hz band boost)
    const res1 = this.ctx.createBiquadFilter();
    res1.type = 'peaking';
    res1.frequency.setValueAtTime(baseRes, t);
    res1.gain.setValueAtTime(10.0, t);
    res1.Q.setValueAtTime(3.5, t);
    this.nodes.res1 = res1;

    // Stage 2: Collector / X-pipe resonance (raises the "mid bark")
    const res2 = this.ctx.createBiquadFilter();
    res2.type = 'peaking';
    res2.frequency.setValueAtTime(baseRes * 2.4, t);
    res2.gain.setValueAtTime(6.5, t);
    res2.Q.setValueAtTime(2.8, t);
    this.nodes.res2 = res2;

    // Stage 3: Mid-pipe / cat-back frequency response
    const res3 = this.ctx.createBiquadFilter();
    res3.type = 'peaking';
    res3.frequency.setValueAtTime(baseRes * 4.8, t);
    res3.gain.setValueAtTime(4.5, t);
    res3.Q.setValueAtTime(3.0, t);
    this.nodes.res3 = res3;

    // Stage 4: Tailpipe high-freq rasp shelf
    const res4 = this.ctx.createBiquadFilter();
    res4.type = 'highshelf';
    res4.frequency.setValueAtTime(2800, t);
    res4.gain.setValueAtTime(0, t); // driven dynamically
    this.nodes.res4 = res4;

    // Stage 5: Low-cut for clean sub (remove sub-bass mud below fundamental)
    const lowCut = this.ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.setValueAtTime(28, t);
    lowCut.Q.setValueAtTime(0.7, t);
    this.nodes.lowCut = lowCut;

    // Stage 6: Combustion band-pass gate (muffles at idle, opens at WOT)
    const combFilter = this.ctx.createBiquadFilter();
    combFilter.type = 'lowpass';
    combFilter.frequency.setValueAtTime(600, t);
    combFilter.Q.setValueAtTime(1.8, t);
    this.nodes.combFilter = combFilter;

    const exhaustGain = this.ctx.createGain();
    exhaustGain.gain.setValueAtTime(0.52, t);
    this.nodes.exhaustGain = exhaustGain;

    // Wire exhaust chain
    shaper.connect(lowCut);
    lowCut.connect(combFilter);
    combFilter.connect(res1);
    res1.connect(res2);
    res2.connect(res3);
    res3.connect(res4);
    res4.connect(exhaustGain);
    exhaustGain.connect(this.nodes.limiter);

    // ── 5. INTAKE ROAR (Helmholtz + ITB bark) ────────────────────────────
    const intakeOsc = this.ctx.createOscillator();
    intakeOsc.type = 'triangle';
    this.nodes.intakeOsc = intakeOsc;

    const intakeShaper = this.ctx.createWaveShaper();
    intakeShaper.curve = this._intakeSaturationCurve();
    intakeShaper.oversample = '2x';
    this.nodes.intakeShaper = intakeShaper;

    const intakeBP = this.ctx.createBiquadFilter();
    intakeBP.type = 'bandpass';
    intakeBP.frequency.setValueAtTime(300, t);
    intakeBP.Q.setValueAtTime(1.8, t);
    this.nodes.intakeBP = intakeBP;

    const intakeGain = this.ctx.createGain();
    intakeGain.gain.setValueAtTime(0.0, t);
    this.nodes.intakeGain = intakeGain;

    intakeOsc.connect(intakeShaper);
    intakeShaper.connect(intakeBP);
    intakeBP.connect(intakeGain);
    intakeGain.connect(this.nodes.limiter);

    // ── 6. MECHANICAL VALVETRAIN NOISE ───────────────────────────────────
    const mechSrc = this.ctx.createBufferSource();
    mechSrc.buffer = this._makeMechNoise(3.0);
    mechSrc.loop = true;
    this.nodes.mechSrc = mechSrc;

    const mechHP = this.ctx.createBiquadFilter();
    mechHP.type = 'highpass';
    mechHP.frequency.setValueAtTime(1500, t);
    mechHP.Q.setValueAtTime(1.2, t);
    this.nodes.mechHP = mechHP;

    const mechGain = this.ctx.createGain();
    mechGain.gain.setValueAtTime(0.025, t);
    this.nodes.mechGain = mechGain;

    mechSrc.connect(mechHP);
    mechHP.connect(mechGain);
    mechGain.connect(this.nodes.limiter);
    mechSrc.start(t);

    // ── 7. TURBOCHARGER SYNTHESIS ────────────────────────────────────────
    this.nodes.turboGain = this.ctx.createGain();
    this.nodes.turboGain.gain.setValueAtTime(0.0, t);
    this.nodes.turboGain.connect(this.nodes.limiter);

    // 7a. Turbine blade-pass whistle (sinusoidal, tracks boost)
    const turboWhistle = this.ctx.createOscillator();
    turboWhistle.type = 'sine';
    turboWhistle.frequency.setValueAtTime(2200, t);
    this.nodes.turboWhistle = turboWhistle;

    const turboWhistleBP = this.ctx.createBiquadFilter();
    turboWhistleBP.type = 'bandpass';
    turboWhistleBP.frequency.setValueAtTime(2200, t);
    turboWhistleBP.Q.setValueAtTime(8.0, t);
    this.nodes.turboWhistleBP = turboWhistleBP;

    turboWhistle.connect(turboWhistleBP);
    turboWhistleBP.connect(this.nodes.turboGain);

    // 7b. Turbo airflow rush (pink noise, bandpass)
    const turboHissSrc = this.ctx.createBufferSource();
    turboHissSrc.buffer = this._makePinkNoise(3.0, 0.9);
    turboHissSrc.loop = true;
    this.nodes.turboHissSrc = turboHissSrc;

    const turboHissBP = this.ctx.createBiquadFilter();
    turboHissBP.type = 'bandpass';
    turboHissBP.frequency.setValueAtTime(3800, t);
    turboHissBP.Q.setValueAtTime(2.5, t);
    this.nodes.turboHissBP = turboHissBP;

    const turboHissGain = this.ctx.createGain();
    turboHissGain.gain.setValueAtTime(0.0, t);
    this.nodes.turboHissGain = turboHissGain;

    turboHissSrc.connect(turboHissBP);
    turboHissBP.connect(turboHissGain);
    turboHissGain.connect(this.nodes.limiter);
    turboHissSrc.start(t);

    // 7c. Turbo whirr harmonic (secondary blade frequency)
    const turboWhirr = this.ctx.createOscillator();
    turboWhirr.type = 'sawtooth';
    turboWhirr.frequency.setValueAtTime(4400, t);
    this.nodes.turboWhirr = turboWhirr;

    const turboWhirrBP = this.ctx.createBiquadFilter();
    turboWhirrBP.type = 'bandpass';
    turboWhirrBP.frequency.setValueAtTime(4400, t);
    turboWhirrBP.Q.setValueAtTime(12.0, t);
    this.nodes.turboWhirrBP = turboWhirrBP;

    const turboWhirrGain = this.ctx.createGain();
    turboWhirrGain.gain.setValueAtTime(0.0, t);
    this.nodes.turboWhirrGain = turboWhirrGain;

    turboWhirr.connect(turboWhirrBP);
    turboWhirrBP.connect(turboWhirrGain);
    turboWhirrGain.connect(this.nodes.limiter);

    // ── 8. SUPERCHARGER SYNTHESIS ────────────────────────────────────────
    this.nodes.scMasterGain = this.ctx.createGain();
    this.nodes.scMasterGain.gain.setValueAtTime(0.0, t);
    this.nodes.scMasterGain.connect(this.nodes.limiter);

    // 8a. Primary lobe mesh frequency (sawtooth, very high Q bandpass)
    const scOsc1 = this.ctx.createOscillator();
    scOsc1.type = 'sawtooth';
    scOsc1.frequency.setValueAtTime(1800, t);
    this.nodes.scOsc1 = scOsc1;

    const scBP1 = this.ctx.createBiquadFilter();
    scBP1.type = 'bandpass';
    scBP1.frequency.setValueAtTime(1800, t);
    scBP1.Q.setValueAtTime(18.0, t);
    this.nodes.scBP1 = scBP1;

    // 8b. Second harmonic mesh frequency
    const scOsc2 = this.ctx.createOscillator();
    scOsc2.type = 'sawtooth';
    scOsc2.frequency.setValueAtTime(3600, t);
    this.nodes.scOsc2 = scOsc2;

    const scBP2 = this.ctx.createBiquadFilter();
    scBP2.type = 'bandpass';
    scBP2.frequency.setValueAtTime(3600, t);
    scBP2.Q.setValueAtTime(14.0, t);
    this.nodes.scBP2 = scBP2;

    // 8c. Roots pulsation (low-freq amplitude wobble texture)
    const scRootsPulse = this.ctx.createOscillator();
    scRootsPulse.type = 'sine';
    scRootsPulse.frequency.setValueAtTime(120, t);
    this.nodes.scRootsPulse = scRootsPulse;

    const scRootsGain = this.ctx.createGain();
    scRootsGain.gain.setValueAtTime(0.0, t);
    this.nodes.scRootsGain = scRootsGain;

    scOsc1.connect(scBP1); scBP1.connect(this.nodes.scMasterGain);
    scOsc2.connect(scBP2); scBP2.connect(this.nodes.scMasterGain);
    scRootsPulse.connect(scRootsGain); scRootsGain.connect(this.nodes.scMasterGain);

    // ── 9. START ALL OSCILLATORS ──────────────────────────────────────────
    [oscA, oscB, oscC, oscD, intakeOsc,
     turboWhistle, turboWhirr, scOsc1, scOsc2, scRootsPulse].forEach(o => o.start(t));
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  REAL-TIME UPDATE  (called every animation frame ~60fps)
  // ─────────────────────────────────────────────────────────────────────────

  update(rpm, throttle, boostBar, isLimiterBouncing, isTwoStepActive, isNosActive = false) {
    if (!this.ctx || !this.isInitialized || !this.currentEngine || this.isMuted) return;

    const t   = this.ctx.currentTime;
    const eng = this.currentEngine;
    const ind = this.currentInduction;
    const exh = this.currentExhaust;
    const profile = eng.acousticProfile || {};

    // ── Cycle-to-cycle jitter (prevents "organ pipe" synth feel) ──────────
    this.jitterPhase += 0.28;
    const microJitter = (
        Math.sin(this.jitterPhase * 1.67) * 0.5
      + Math.sin(this.jitterPhase * 2.83) * 0.3
      + Math.sin(this.jitterPhase * 5.1)  * 0.2
    ) * 0.015;

    // ── Fundamental crank cycle frequency ─────────────────────────────────
    // 4-stroke: 1 complete firing cycle = 2 crankshaft revs → f = RPM / 120
    // Rotary:   1 cycle = 1 eccentric shaft rev → f = RPM / 60
    const isRotary = eng.layout === 'rotary';
    const cycleDivisor = isRotary ? 60 : 120;
    const baseCycleFreq = rpm / cycleDivisor;
    const cycleFreq = Math.max(4, baseCycleFreq * (1 + microJitter));

    // Sub-bass runs at half cycle (piston slap / flywheel thump)
    const subFreq = Math.max(12, (rpm / 60) * (isRotary ? 1 : 0.5));

    const rpmNorm = Math.max(0, Math.min(1.0, (rpm - eng.idleRpm) / (eng.redlineRpm - eng.idleRpm)));
    const loadFactor = throttle * 0.7 + rpmNorm * 0.3; // combined RPM+throttle "engine load"

    // ── A. Update oscillator frequencies ──────────────────────────────────
    const TC = 0.010; // frequency time constant (fast enough to feel responsive)

    if (this.nodes.oscA) this.nodes.oscA.frequency.setTargetAtTime(cycleFreq, t, TC);
    if (this.nodes.oscB) this.nodes.oscB.frequency.setTargetAtTime(cycleFreq, t, TC);
    if (this.nodes.oscC) this.nodes.oscC.frequency.setTargetAtTime(cycleFreq * (isRotary ? 3 : 1), t, TC);
    if (this.nodes.oscD) this.nodes.oscD.frequency.setTargetAtTime(subFreq, t, TC * 1.5);

    // ── B. Dynamic oscillator gain mix ────────────────────────────────────
    // At idle: heavy on sub-bass burble. At WOT: rasp and primary dominate.
    const raspBoost = 0.15 + loadFactor * 0.55;
    const burbleAmt = (profile.bassWeight || 0.6) * (1.0 - loadFactor * 0.35);

    if (this.nodes.gainA) this.nodes.gainA.gain.setTargetAtTime(0.6 + loadFactor * 0.3, t, 0.018);
    if (this.nodes.gainB) this.nodes.gainB.gain.setTargetAtTime(raspBoost * (profile.exhaustRasp || 0.8), t, 0.018);
    if (this.nodes.gainC) this.nodes.gainC.gain.setTargetAtTime(burbleAmt, t, 0.025);
    if (this.nodes.gainD) this.nodes.gainD.gain.setTargetAtTime(0.10 + rpmNorm * 0.06, t, 0.03);

    // ── C. Exhaust resonator chain EQ ─────────────────────────────────────
    const baseRes = profile.resonanceFreq || 260;

    // Combustion lowpass: sealed off at idle, rips open under load
    const targetCutoff = 400 + rpmNorm * 3200 + throttle * 4000;
    if (this.nodes.combFilter) {
      this.nodes.combFilter.frequency.setTargetAtTime(targetCutoff, t, 0.022);
      this.nodes.combFilter.Q.setTargetAtTime(1.5 + throttle * 0.8, t, 0.03);
    }

    // Primary runner resonance peak slides with thermal expansion
    if (this.nodes.res1) {
      this.nodes.res1.frequency.setTargetAtTime(baseRes * (1 + rpmNorm * 0.18), t, 0.04);
      this.nodes.res1.gain.setTargetAtTime(8.0 + loadFactor * 5.0, t, 0.03);
    }

    // Collector resonance
    if (this.nodes.res2) {
      this.nodes.res2.frequency.setTargetAtTime(baseRes * 2.4 * (1 + rpmNorm * 0.12), t, 0.04);
      this.nodes.res2.gain.setTargetAtTime(5.0 + loadFactor * 4.0, t, 0.03);
    }

    // Mid pipe — gains high-freq energy at high RPM+throttle
    if (this.nodes.res3) {
      this.nodes.res3.gain.setTargetAtTime(3.0 + loadFactor * 5.5, t, 0.03);
    }

    // Tailpipe rasp shelf: flat at idle, screaming at redline under WOT
    if (this.nodes.res4) {
      const raspShelf = (exh.trebleBoost || 1.0) * (-2 + loadFactor * 16);
      this.nodes.res4.gain.setTargetAtTime(raspShelf, t, 0.025);
    }

    // Master exhaust gain
    if (this.nodes.exhaustGain) {
      const vol = (0.38 + rpmNorm * 0.38 + throttle * 0.3) * (exh.volume || 1.0);
      this.nodes.exhaustGain.gain.setTargetAtTime(Math.min(1.1, vol), t, 0.018);
    }

    // ── D. Intake roar ────────────────────────────────────────────────────
    if (this.nodes.intakeOsc && this.nodes.intakeGain) {
      const firingFreq = isRotary
        ? (rpm / 60) * (eng.rotors || 2)
        : (rpm / 60) * (eng.cylinders / 2);
      this.nodes.intakeOsc.frequency.setTargetAtTime(Math.max(15, firingFreq * 0.45), t, 0.015);

      // ITB bark: intake opens sharp at throttle snap
      const intakeRoarProfile = profile.intakeRoar || 0.85;
      const intakeLoad = Math.pow(throttle, 1.5) * intakeRoarProfile;
      this.nodes.intakeGain.gain.setTargetAtTime(0.015 + intakeLoad * 0.5, t, 0.018);

      if (this.nodes.intakeBP) {
        this.nodes.intakeBP.frequency.setTargetAtTime(200 + rpmNorm * 600, t, 0.02);
      }
    }

    // ── E. Valvetrain mechanical noise ────────────────────────────────────
    if (this.nodes.mechGain && this.nodes.mechHP) {
      this.nodes.mechHP.frequency.setTargetAtTime(1200 + rpmNorm * 2500, t, 0.04);
      this.nodes.mechGain.gain.setTargetAtTime(0.018 + rpmNorm * 0.048, t, 0.04);
    }

    // ── F. TURBOCHARGER ───────────────────────────────────────────────────
    if (ind && ind.category === 'turbo') {
      const maxPsi    = ind.boostMaxPsi || 22;
      const curPsi    = boostBar * 14.5038;
      const boostRatio = Math.max(0, Math.min(1.0, curPsi / maxPsi));
      const spoolNorm  = Math.max(0, Math.min(1.0, (rpm - (ind.spoolRpm || 2500)) / 3500));

      // Blade-pass whistle: 1.8 kHz at idle spool → 8 kHz at full boost
      const whistlePitch = 1800 + boostRatio * 6200 + spoolNorm * 800;
      if (this.nodes.turboWhistle) {
        this.nodes.turboWhistle.frequency.setTargetAtTime(whistlePitch, t, 0.03);
        this.nodes.turboWhistleBP.frequency.setTargetAtTime(whistlePitch, t, 0.03);
      }

      // Secondary whirr harmonic (1.9× primary pitch, sawtooth for richness)
      const whirrPitch = whistlePitch * 1.92;
      if (this.nodes.turboWhirr) {
        this.nodes.turboWhirr.frequency.setTargetAtTime(whirrPitch, t, 0.03);
        this.nodes.turboWhirrBP.frequency.setTargetAtTime(whirrPitch, t, 0.03);
      }

      // Airflow hiss band tracks boost pressure
      if (this.nodes.turboHissBP) {
        this.nodes.turboHissBP.frequency.setTargetAtTime(2800 + boostRatio * 4000, t, 0.04);
      }

      // Volume: barely audible at idle spool, loud when charged
      const whineLevel = ind.whineLevel || 0.75;
      const turboVol = (boostRatio * 0.45 + spoolNorm * 0.08) * whineLevel;
      if (this.nodes.turboGain) {
        this.nodes.turboGain.gain.setTargetAtTime(turboVol, t, 0.03);
      }
      if (this.nodes.turboWhirrGain) {
        this.nodes.turboWhirrGain.gain.setTargetAtTime(turboVol * 0.4, t, 0.03);
      }
      if (this.nodes.turboHissGain) {
        this.nodes.turboHissGain.gain.setTargetAtTime(turboVol * 0.65, t, 0.04);
      }

      // BOV trigger: big drop in throttle from high boost
      if (this.prevThrottle > 0.60 && throttle < 0.18 && this.prevBoost > 0.45 && !this.isBovActive) {
        this.triggerBlowOffValve(this.prevBoost, ind.type);
      }

      // Disable supercharger when turbo is active
      if (this.nodes.scMasterGain) {
        this.nodes.scMasterGain.gain.setTargetAtTime(0, t, 0.05);
      }

    } else if (ind && ind.category === 'supercharger') {
      // ── G. SUPERCHARGER ───────────────────────────────────────────────
      const crankFreq   = rpm / 60;
      const pulleyRatio = ind.whinePitchRatio || 3.0;
      // Lobe mesh frequency: crank × pulley × 4 lobes (typical Roots 4-lobe)
      const meshFreq    = Math.max(200, crankFreq * pulleyRatio * (ind.type === 'roots' ? 4 : 6));

      if (this.nodes.scOsc1) {
        this.nodes.scOsc1.frequency.setTargetAtTime(meshFreq, t, 0.012);
        this.nodes.scBP1.frequency.setTargetAtTime(meshFreq, t, 0.012);
      }
      if (this.nodes.scOsc2) {
        this.nodes.scOsc2.frequency.setTargetAtTime(meshFreq * 2.0, t, 0.012);
        this.nodes.scBP2.frequency.setTargetAtTime(meshFreq * 2.0, t, 0.012);
      }
      // Roots pulsation wobble speed
      if (this.nodes.scRootsPulse) {
        this.nodes.scRootsPulse.frequency.setTargetAtTime(crankFreq * pulleyRatio * 0.5, t, 0.02);
        this.nodes.scRootsGain.gain.setTargetAtTime(
          ind.type === 'roots' ? (rpmNorm * 0.06 + throttle * 0.04) : 0, t, 0.03);
      }

      const whineLevel = ind.whineLevel || 0.8;
      const scVol = (rpmNorm * 0.25 + throttle * 0.45) * whineLevel
                  * (ind.type === 'twin_screw' ? 1.5 : 1.0);
      if (this.nodes.scMasterGain) {
        this.nodes.scMasterGain.gain.setTargetAtTime(Math.min(0.85, scVol), t, 0.02);
      }

      // Silence turbo layers
      if (this.nodes.turboGain) this.nodes.turboGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.nodes.turboWhirrGain) this.nodes.turboWhirrGain.gain.setTargetAtTime(0, t, 0.05);
      if (this.nodes.turboHissGain) this.nodes.turboHissGain.gain.setTargetAtTime(0, t, 0.05);

    } else {
      // N/A — silence both
      if (this.nodes.turboGain)    this.nodes.turboGain.gain.setTargetAtTime(0, t, 0.06);
      if (this.nodes.turboWhirrGain) this.nodes.turboWhirrGain.gain.setTargetAtTime(0, t, 0.06);
      if (this.nodes.turboHissGain)  this.nodes.turboHissGain.gain.setTargetAtTime(0, t, 0.06);
      if (this.nodes.scMasterGain)   this.nodes.scMasterGain.gain.setTargetAtTime(0, t, 0.06);
    }

    // ── H. LIMITER BOUNCE & 2-STEP ────────────────────────────────────────
    const now = Date.now();
    if (isLimiterBouncing || isTwoStepActive) {
      const cutCycle = Math.floor(now / 38) % 2;
      if (this.nodes.exhaustGain) {
        this.nodes.exhaustGain.gain.setValueAtTime(cutCycle === 0 ? 0.06 : 0.72, t);
      }
      if (now - this.lastBackfireTime > (isTwoStepActive ? 55 : 80)) {
        this.lastBackfireTime = now;
        this.triggerBackfire(isTwoStepActive ? 1.0 : 0.75, exh.pops || 0.5);
      }
    } else {
      // Overrun / throttle lift crackle
      if (this.prevThrottle > 0.5 && throttle < 0.08 && rpmNorm > 0.3) {
        if (Math.random() < (exh.pops || 0.45) * 0.5 && now - this.lastBackfireTime > 140) {
          this.lastBackfireTime = now;
          this.triggerBackfire(0.38 + Math.random() * 0.2, exh.pops || 0.5);
        }
      }
    }

    // NOS surge crackle
    if (isNosActive && Math.random() < 0.12 && now - this.lastBackfireTime > 200) {
      this.lastBackfireTime = now;
      this.triggerBackfire(0.6 + Math.random() * 0.4, 1.0);
    }

    this.prevThrottle = throttle;
    this.prevRpm      = rpm;
    this.prevBoost    = boostBar;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  TRANSIENT EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Blow-Off Valve – multi-stage venting: PSHHH + flutter pulses
   * "pssh-tu-tu-tu-tu-tu"
   */
  triggerBlowOffValve(boostBar, turboType) {
    if (!this.ctx || this.isMuted) return;
    this.isBovActive = true;
    const t = this.ctx.currentTime;
    const intensity = Math.min(1.0, boostBar / 1.6);
    const flutterCount = turboType === 'quad' ? 8 : turboType === 'twin' ? 6 : 4;

    // Initial vent burst (pink noise, highpass filtered)
    const pshBuf = this._makeWhiteNoise(0.28, 0.9);
    const pshSrc = this.ctx.createBufferSource();
    pshSrc.buffer = pshBuf;

    const pshHP = this.ctx.createBiquadFilter();
    pshHP.type = 'highpass';
    pshHP.frequency.setValueAtTime(2800, t);

    const pshBP = this.ctx.createBiquadFilter();
    pshBP.type = 'bandpass';
    pshBP.frequency.setValueAtTime(4500, t);
    pshBP.Q.setValueAtTime(2.0, t);

    const pshGain = this.ctx.createGain();
    pshGain.gain.setValueAtTime(0.55 * intensity, t);
    pshGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    pshSrc.connect(pshHP); pshHP.connect(pshBP); pshBP.connect(pshGain);
    pshGain.connect(this.nodes.limiter);
    pshSrc.start(t);

    // Flutter pulses — each is a short resonant sine burst + noise click
    for (let i = 0; i < flutterCount; i++) {
      const delay = 0.10 + i * 0.058;
      const decay = Math.pow(0.68, i);

      // Resonant sine "tu" click
      const pulseOsc = this.ctx.createOscillator();
      pulseOsc.type = 'sine';
      pulseOsc.frequency.setValueAtTime(1400 - i * 90, t + delay);

      const pulseGain = this.ctx.createGain();
      pulseGain.gain.setValueAtTime(0.001, t);
      pulseGain.gain.setValueAtTime(0.32 * intensity * decay, t + delay);
      pulseGain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.038);

      // Noise burst under each flutter pulse
      const flutterNoise = this.ctx.createBufferSource();
      flutterNoise.buffer = this._makeWhiteNoise(0.04, 0.4 * intensity * decay);
      const flutterBP = this.ctx.createBiquadFilter();
      flutterBP.type = 'bandpass';
      flutterBP.frequency.setValueAtTime(3200, t + delay);
      flutterBP.Q.setValueAtTime(3.0, t + delay);

      pulseOsc.connect(pulseGain); pulseGain.connect(this.nodes.limiter);
      flutterNoise.connect(flutterBP); flutterBP.connect(this.nodes.limiter);

      pulseOsc.start(t + delay); pulseOsc.stop(t + delay + 0.042);
      flutterNoise.start(t + delay); flutterNoise.stop(t + delay + 0.042);
    }

    setTimeout(() => { this.isBovActive = false; }, 650);
  }

  /**
   * Exhaust backfire / overrun pop / 2-step bang
   * Layered: low-freq cavity resonance + mid crack + high transient click
   */
  triggerBackfire(power = 1.0, popLevel = 0.5) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Layer 1: Deep exhaust cavity boom
    const boomDur = 0.08 + power * 0.1;
    const boomBuf = this._makeWhiteNoise(boomDur, 0.8);
    const boomSrc = this.ctx.createBufferSource();
    boomSrc.buffer = boomBuf;

    const boomBP = this.ctx.createBiquadFilter();
    boomBP.type = 'bandpass';
    boomBP.frequency.setValueAtTime(90 + Math.random() * 120, t);
    boomBP.Q.setValueAtTime(2.8, t);

    const boomGain = this.ctx.createGain();
    boomGain.gain.setValueAtTime((0.35 + power * 0.6) * popLevel, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + boomDur);

    boomSrc.connect(boomBP); boomBP.connect(boomGain); boomGain.connect(this.nodes.limiter);
    boomSrc.start(t);

    // Layer 2: Mid-range crack (combustion shockwave)
    const crackDur = 0.022 + power * 0.025;
    const crackBuf = this._makeWhiteNoise(crackDur, 0.9);
    const crackSrc = this.ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackBP = this.ctx.createBiquadFilter();
    crackBP.type = 'bandpass';
    crackBP.frequency.setValueAtTime(450 + Math.random() * 300, t);
    crackBP.Q.setValueAtTime(3.5, t);

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime((0.28 + power * 0.55) * popLevel, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDur);

    crackSrc.connect(crackBP); crackBP.connect(crackGain); crackGain.connect(this.nodes.limiter);
    crackSrc.start(t);

    // Layer 3: High transient click (valve impact + muffler rattle)
    if (power > 0.5) {
      const clickBuf = this._makeWhiteNoise(0.008, 0.7);
      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = clickBuf;

      const clickHP = this.ctx.createBiquadFilter();
      clickHP.type = 'highpass';
      clickHP.frequency.setValueAtTime(2000, t);

      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.28 * popLevel * power, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.008);

      clickSrc.connect(clickHP); clickHP.connect(clickGain); clickGain.connect(this.nodes.limiter);
      clickSrc.start(t);
    }

    if (window.onEngineBackfire) window.onEngineBackfire(power);
  }

  /**
   * Nitrous oxide injection purge hiss
   */
  playNosPurge() {
    if (!this.initContext() || this.isMuted) return;
    const t = this.ctx.currentTime;
    const dur = 0.65;

    const noiseBuf = this._makeWhiteNoise(dur, 0.85);
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.setValueAtTime(3500, t);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(5500, t); bp.Q.setValueAtTime(2.2, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.setValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noiseSrc.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.nodes.limiter);
    noiseSrc.start(t);
  }

  /**
   * Dashboard shift beep (cockpit LED alarm)
   */
  playShiftBeep() {
    if (!this.ctx || this.isMuted || !this.isInitialized) return;
    try {
      const t = this.ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 0 ? 2200 : 2600, t + i * 0.045);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.12, t + i * 0.045);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + 0.035);
        osc.connect(g); g.connect(this.masterGain);
        osc.start(t + i * 0.045); osc.stop(t + i * 0.045 + 0.038);
      }
    } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  CLEANUP & CONTROL
  // ─────────────────────────────────────────────────────────────────────────

  stopEngine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const oscNames = ['oscA','oscB','oscC','oscD','intakeOsc',
                      'turboWhistle','turboWhirr','scOsc1','scOsc2','scRootsPulse',
                      'mechSrc','turboHissSrc'];
    oscNames.forEach(name => {
      if (this.nodes[name]) {
        try { this.nodes[name].stop(t); this.nodes[name].disconnect(); } catch (e) {}
        this.nodes[name] = null;
      }
    });
  }

  setMasterVolume(val) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.2, val)), this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.82, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }
}

// Global singleton
window.engineAudio = new EngineAudioSystem();
