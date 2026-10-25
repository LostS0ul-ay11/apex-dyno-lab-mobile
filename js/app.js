/**
 * APEX DYNO - Main Application Controller
 * Manages user interactions, pedal inputs, keyboard shortcuts,
 * engine swap selection, tuning shop modifications, and animation loop.
 */

class ApexDynoApp {
  constructor() {
    this.selectedEngineId = 'v8_crossplane';
    this.selectedInductionId = 'supercharger_whipple';
    this.selectedCamId = 'stage1';
    this.selectedExhaustId = 'straight_pipe';

    this.isEngineRunning = false;
    this.isCranking = false;

    // Pedals & input state
    this.inputThrottle = 0;
    this.inputBrake = 0;
    this.inputClutch = 0;
    this.isGasPedalPressed = false;

    // Keys pressed set
    this.keysPressed = {};

    this.lastFrameTime = performance.now();
  }

  init() {
    // Populate Engine Selection Dropdowns / Lists
    this._populateEngineSelector();
    this._populateInductionSelector();
    this._populateCamSelector();
    this._populateExhaustSelector();

    // Setup Engine & Physics
    this.loadEngineConfiguration();

    // Init Gauges and Visualizer
    window.cockpitGauges.init('tachCanvas', 'speedCanvas', 'boostCanvas');
    window.engineVisualizer.init('mechCanvas', 'dynoCanvas');

    // Bind UI Events
    this._bindControls();
    this._bindKeyboard();
    this._bindWindowResize();

    // Start requestAnimationFrame loop
    requestAnimationFrame((t) => this._loop(t));
  }

  /**
   * Loads active configuration into physics and audio
   */
  loadEngineConfiguration() {
    const eng = ENGINE_DATABASE.find(e => e.id === this.selectedEngineId) || ENGINE_DATABASE[0];
    const ind = INDUCTION_SYSTEMS.find(i => i.id === this.selectedInductionId) || INDUCTION_SYSTEMS[0];
    const cam = CAMSHAFT_PROFILES.find(c => c.id === this.selectedCamId) || CAMSHAFT_PROFILES[0];
    const exh = EXHAUST_CONFIGS.find(x => x.id === this.selectedExhaustId) || EXHAUST_CONFIGS[0];

    window.enginePhysics.setup(eng, ind, cam, exh);

    // Update UI info displays
    this._updateEngineInfoCards(eng, ind, cam, exh);

    if (this.isEngineRunning) {
      window.engineAudio.startEngine(eng, ind, exh);
    }
  }

  _populateEngineSelector() {
    const select = document.getElementById('engineSelect');
    if (!select) return;
    select.innerHTML = '';

    const categories = {
      'inline': 'Em Linha (Inline)',
      'v': 'Motores em V (V-Engines)',
      'boxer': 'Motores Boxer (Opostos)',
      'rotary': 'Motores Rotativos (Wankel)',
      'vr': 'Motores VR (V Estreito)',
      'w': 'Motores em W (W-Engines)'
    };

    Object.keys(categories).forEach(catKey => {
      const optGroup = document.createElement('optgroup');
      optGroup.label = categories[catKey];

      const enginesInCat = ENGINE_DATABASE.filter(e => e.category === catKey);
      enginesInCat.forEach(eng => {
        const opt = document.createElement('option');
        opt.value = eng.id;
        opt.textContent = `${eng.name} (${eng.baseHp} HP)`;
        if (eng.id === this.selectedEngineId) opt.selected = true;
        optGroup.appendChild(opt);
      });

      select.appendChild(optGroup);
    });

    select.addEventListener('change', (e) => {
      this.selectedEngineId = e.target.value;
      const eng = ENGINE_DATABASE.find(item => item.id === this.selectedEngineId);
      if (eng && eng.defaultInduction) {
        this.selectedInductionId = eng.defaultInduction;
        const indSelect = document.getElementById('inductionSelect');
        if (indSelect) indSelect.value = this.selectedInductionId;
      }
      this.loadEngineConfiguration();
    });
  }

  _populateInductionSelector() {
    const select = document.getElementById('inductionSelect');
    if (!select) return;
    select.innerHTML = '';

    INDUCTION_SYSTEMS.forEach(ind => {
      const opt = document.createElement('option');
      opt.value = ind.id;
      opt.textContent = `${ind.icon} ${ind.name}`;
      if (ind.id === this.selectedInductionId) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      this.selectedInductionId = e.target.value;
      this.loadEngineConfiguration();
    });
  }

  _populateCamSelector() {
    const select = document.getElementById('camSelect');
    if (!select) return;
    select.innerHTML = '';

    CAMSHAFT_PROFILES.forEach(cam => {
      const opt = document.createElement('option');
      opt.value = cam.id;
      opt.textContent = cam.name;
      if (cam.id === this.selectedCamId) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      this.selectedCamId = e.target.value;
      this.loadEngineConfiguration();
    });
  }

  _populateExhaustSelector() {
    const select = document.getElementById('exhaustSelect');
    if (!select) return;
    select.innerHTML = '';

    EXHAUST_CONFIGS.forEach(exh => {
      const opt = document.createElement('option');
      opt.value = exh.id;
      opt.textContent = exh.name;
      if (exh.id === this.selectedExhaustId) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      this.selectedExhaustId = e.target.value;
      this.loadEngineConfiguration();
    });
  }

  _updateEngineInfoCards(eng, ind, cam, exh) {
    const nameEl = document.getElementById('cardEngineName');
    const familyEl = document.getElementById('cardEngineFamily');
    const descEl = document.getElementById('cardEngineDesc');
    const hpEl = document.getElementById('cardPeakHp');
    const tqEl = document.getElementById('cardPeakTq');
    const redlineEl = document.getElementById('cardRedline');

    if (nameEl) nameEl.textContent = eng.name;
    if (familyEl) familyEl.textContent = eng.family;
    if (descEl) descEl.textContent = eng.description;

    const effectiveRedline = eng.redlineRpm + (cam.rpmBonus || 0);
    if (hpEl) hpEl.textContent = `${window.enginePhysics.peakHp} HP`;
    if (tqEl) tqEl.textContent = `${window.enginePhysics.peakTorque} Nm`;
    if (redlineEl) redlineEl.textContent = `${effectiveRedline} RPM`;

    // Boost controller slider limit sync
    const boostSlider = document.getElementById('wastegateSlider');
    const boostValEl = document.getElementById('wastegateVal');
    if (boostSlider && boostValEl) {
      if (ind.category === 'turbo') {
        boostSlider.disabled = false;
        boostValEl.textContent = `${(ind.boostMaxBar * window.enginePhysics.wastegateSetting).toFixed(1)} Bar`;
      } else {
        boostSlider.disabled = true;
        boostValEl.textContent = ind.category === 'supercharger' ? `${ind.boostMaxBar} Bar (Fixo)` : '0.0 Bar (N/A)';
      }
    }
  }

  /**
   * UI Controls (Pedals, Buttons, Sliders)
   */
  _bindControls() {
    // Start / Ignition Button
    const startBtn = document.getElementById('btnStartEngine');
    const startOverlay = document.getElementById('startOverlay');
    const startMainBtn = document.getElementById('startMainBtn');

    const triggerStart = (e) => {
      if (e) {
        // Do not trigger start if clicking on the install button inside the overlay
        if (e.target && (e.target.id === 'pwaInstallBtn' || e.target.closest('#pwaInstallBtn'))) {
          return;
        }
        e.preventDefault();
      }

      if (!this.isEngineRunning) {
        window.engineAudio.initContext();
        this.isEngineRunning = true;
        this.loadEngineConfiguration();

        if (startOverlay) {
          startOverlay.classList.add('hidden');
          startOverlay.style.display = 'none';
        }
        if (startBtn) {
          startBtn.classList.add('running');
          startBtn.innerHTML = '<span>⚡</span> MOTOR LIGADO (DESLIGAR)';
        }
      } else {
        this.isEngineRunning = false;
        window.engineAudio.stopEngine();
        if (startBtn) {
          startBtn.classList.remove('running');
          startBtn.innerHTML = '<span>⚡</span> DAR PARTIDA NO MOTOR';
        }
      }
    };

    window.triggerEngineStart = triggerStart;

    if (startBtn) {
      startBtn.addEventListener('click', triggerStart);
      startBtn.addEventListener('touchstart', triggerStart, { passive: false });
    }
    if (startMainBtn) {
      startMainBtn.addEventListener('click', triggerStart);
      startMainBtn.addEventListener('touchstart', triggerStart, { passive: false });
    }
    if (startOverlay) {
      startOverlay.addEventListener('click', triggerStart);
    }

    // Interactive Gas Pedal (Hold to accelerate)
    const gasPedal = document.getElementById('gasPedal');
    if (gasPedal) {
      const pressGas = (e) => {
        e.preventDefault();
        this.isGasPedalPressed = true;
        this.inputThrottle = 1.0;
        gasPedal.classList.add('active');
        if (!this.isEngineRunning) triggerStart();
      };

      const releaseGas = (e) => {
        e.preventDefault();
        this.isGasPedalPressed = false;
        this.inputThrottle = 0.0;
        gasPedal.classList.remove('active');
      };

      gasPedal.addEventListener('mousedown', pressGas);
      window.addEventListener('mouseup', releaseGas);
      gasPedal.addEventListener('touchstart', pressGas, { passive: false });
      window.addEventListener('touchend', releaseGas);
    }

    // Brake Pedal
    const brakePedal = document.getElementById('brakePedal');
    if (brakePedal) {
      const pressBrake = (e) => {
        e.preventDefault();
        this.inputBrake = 1.0;
        brakePedal.classList.add('active');
      };
      const releaseBrake = (e) => {
        e.preventDefault();
        this.inputBrake = 0.0;
        brakePedal.classList.remove('active');
      };
      brakePedal.addEventListener('mousedown', pressBrake);
      window.addEventListener('mouseup', releaseBrake);
      brakePedal.addEventListener('touchstart', pressBrake, { passive: false });
      window.addEventListener('touchend', releaseBrake);
    }

    // Clutch Pedal
    const clutchPedal = document.getElementById('clutchPedal');
    if (clutchPedal) {
      const pressClutch = (e) => {
        e.preventDefault();
        this.inputClutch = 1.0;
        clutchPedal.classList.add('active');
      };
      const releaseClutch = (e) => {
        e.preventDefault();
        this.inputClutch = 0.0;
        clutchPedal.classList.remove('active');
      };
      clutchPedal.addEventListener('mousedown', pressClutch);
      window.addEventListener('mouseup', releaseClutch);
      clutchPedal.addEventListener('touchstart', pressClutch, { passive: false });
      window.addEventListener('touchend', releaseClutch);
    }

    const throttleSlider = document.getElementById('throttleSlider');
    if (throttleSlider) {
      throttleSlider.addEventListener('input', (e) => {
        if (!this.isGasPedalPressed) {
          this.inputThrottle = parseFloat(e.target.value) / 100;
          if (!this.isEngineRunning && this.inputThrottle > 0) triggerStart();
        }
      });
      // Double click slider to reset to 0
      throttleSlider.addEventListener('dblclick', () => {
        throttleSlider.value = 0;
        this.inputThrottle = 0;
      });
    }

    // Quick WOT Dyno Pull Button & Idle Button
    const btnWot = document.getElementById('btnWotPull');
    if (btnWot) {
      btnWot.addEventListener('click', () => {
        if (!this.isEngineRunning) triggerStart();
        if (this.inputThrottle < 0.9) {
          this.inputThrottle = 1.0;
          if (throttleSlider) throttleSlider.value = 100;
          btnWot.textContent = '⏸️ SOLTAR (IDLE)';
          btnWot.classList.add('active');
        } else {
          this.inputThrottle = 0.0;
          if (throttleSlider) throttleSlider.value = 0;
          btnWot.textContent = '🚀 PÉ NO PORÃO (WOT)';
          btnWot.classList.remove('active');
        }
      });
    }

    // Shifter Buttons (-1 to 7)
    document.querySelectorAll('.gear-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const g = parseInt(btn.getAttribute('data-gear'));
        window.enginePhysics.setGear(g);
        this._updateShifterUI();
      });
    });

    // Shift Up / Down Buttons
    const btnShiftUp = document.getElementById('btnShiftUp');
    const btnShiftDown = document.getElementById('btnShiftDown');
    if (btnShiftUp) {
      btnShiftUp.addEventListener('click', () => {
        window.enginePhysics.shiftUp();
        this._updateShifterUI();
      });
    }
    if (btnShiftDown) {
      btnShiftDown.addEventListener('click', () => {
        window.enginePhysics.shiftDown();
        this._updateShifterUI();
      });
    }

    // 2-Step Launch Control Button
    const btnTwoStep = document.getElementById('btnTwoStep');
    if (btnTwoStep) {
      btnTwoStep.addEventListener('click', () => {
        const active = window.enginePhysics.toggleTwoStep();
        btnTwoStep.classList.toggle('active', active);
      });
    }

    // NOS Button
    const btnNos = document.getElementById('btnNos');
    if (btnNos) {
      const pressNos = (e) => {
        e.preventDefault();
        window.enginePhysics.triggerNos(true);
        window.engineAudio.playNosPurge();
        btnNos.classList.add('active');
      };
      const releaseNos = (e) => {
        e.preventDefault();
        window.enginePhysics.triggerNos(false);
        btnNos.classList.remove('active');
      };
      btnNos.addEventListener('mousedown', pressNos);
      window.addEventListener('mouseup', releaseNos);
      btnNos.addEventListener('touchstart', pressNos, { passive: false });
      window.addEventListener('touchend', releaseNos);
    }

    // Wastegate Slider
    const wastegateSlider = document.getElementById('wastegateSlider');
    const wastegateVal = document.getElementById('wastegateVal');
    if (wastegateSlider && wastegateVal) {
      wastegateSlider.addEventListener('input', (e) => {
        const factor = parseFloat(e.target.value) / 100;
        window.enginePhysics.wastegateSetting = factor;
        window.enginePhysics._calculateDynoCurves();
        const ind = window.enginePhysics.inductionData;
        wastegateVal.textContent = `${(ind.boostMaxBar * factor).toFixed(1)} Bar`;
      });
    }

    // Flywheel Weight Slider
    const flywheelSelect = document.getElementById('flywheelSelect');
    if (flywheelSelect) {
      flywheelSelect.addEventListener('change', (e) => {
        window.enginePhysics.flywheelWeight = parseFloat(e.target.value);
      });
    }

    // Speed unit toggle (KM/H vs MPH)
    const unitToggle = document.getElementById('btnUnitToggle');
    if (unitToggle) {
      unitToggle.addEventListener('click', () => {
        const unit = window.cockpitGauges.toggleSpeedUnit();
        unitToggle.textContent = unit.toUpperCase();
      });
    }

    // Volume Slider & Mute
    const volSlider = document.getElementById('volSlider');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        window.engineAudio.setMasterVolume(parseFloat(e.target.value) / 100);
      });
    }

    // ================= GARAGE TAB SWITCHER =================
    document.querySelectorAll('.garage-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const targetTabId = tabBtn.getAttribute('data-tab');
        document.querySelectorAll('.garage-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetPane = document.getElementById(targetTabId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // ================= DEDICATED NOS LAB CONTROLS =================
    // Infinite NOS Toggle
    const chkInfinite = document.getElementById('chkInfiniteNos');
    if (chkInfinite) {
      chkInfinite.addEventListener('change', (e) => {
        window.enginePhysics.nosInfinite = e.target.checked;
        const nosBar = document.getElementById('nosBottleLevel');
        if (nosBar && e.target.checked) nosBar.style.width = '100%';
      });
    }

    // Master Safety Arm Switch
    const btnArm = document.getElementById('btnNosArmSwitch');
    if (btnArm) {
      btnArm.addEventListener('click', () => {
        window.enginePhysics.nosArmed = !window.enginePhysics.nosArmed;
        btnArm.textContent = window.enginePhysics.nosArmed ? 'ARMADO' : 'DESARMADO';
        btnArm.classList.toggle('active', window.enginePhysics.nosArmed);
        btnArm.classList.toggle('disarmed', !window.enginePhysics.nosArmed);
        if (!window.enginePhysics.nosArmed) {
          window.enginePhysics.isNosActive = false;
          const btnNosEl = document.getElementById('btnNos');
          if (btnNosEl) btnNosEl.classList.remove('active');
        }
      });
    }

    // Shot Size Slider & Presets
    const nosSlider = document.getElementById('nosShotSlider');
    const nosBadge = document.getElementById('nosShotValBadge');
    const nosPowerReadout = document.getElementById('nosPowerReadout');
    const nosTorqueReadout = document.getElementById('nosTorqueReadout');

    const updateShotUI = (val) => {
      window.enginePhysics.nosShotHp = val;
      const tqBonus = Math.round(val * 1.355);
      if (nosBadge) nosBadge.textContent = `+${val} HP`;
      if (nosPowerReadout) nosPowerReadout.textContent = `+${val} HP`;
      if (nosTorqueReadout) nosTorqueReadout.textContent = `+${tqBonus} Nm Torque Extra`;
      document.querySelectorAll('.nos-preset-btn').forEach(pb => {
        pb.classList.toggle('active', parseInt(pb.getAttribute('data-shot')) === val);
      });
    };

    if (nosSlider) {
      nosSlider.addEventListener('input', (e) => {
        updateShotUI(parseInt(e.target.value));
      });
    }

    document.querySelectorAll('.nos-preset-btn').forEach(pb => {
      pb.addEventListener('click', () => {
        const shotVal = parseInt(pb.getAttribute('data-shot'));
        if (nosSlider) nosSlider.value = shotVal;
        updateShotUI(shotVal);
      });
    });

    // Trigger Mode & Delivery Selectors
    const triggerModeSelect = document.getElementById('nosTriggerModeSelect');
    if (triggerModeSelect) {
      triggerModeSelect.addEventListener('change', (e) => {
        window.enginePhysics.nosTriggerMode = e.target.value;
      });
    }

    const deliverySelect = document.getElementById('nosDeliverySelect');
    if (deliverySelect) {
      deliverySelect.addEventListener('change', (e) => {
        window.enginePhysics.nosDeliveryType = e.target.value;
      });
    }

    // Purge Valve Button & Color Picker
    this.currentPurgeColor = '#00f0ff';
    const btnPurge = document.getElementById('btnPurgeNos');
    if (btnPurge) {
      btnPurge.addEventListener('click', () => {
        window.engineAudio.playNosPurge();
        if (window.engineVisualizer && window.engineVisualizer.triggerNosPurgeVisual) {
          window.engineVisualizer.triggerNosPurgeVisual(this.currentPurgeColor);
        }
      });
    }

    document.querySelectorAll('.purge-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.purge-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        this.currentPurgeColor = dot.getAttribute('data-color');
      });
    });
  }

  /**
   * Keyboard Shortcuts
   */
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keysPressed[e.code] = true;

      // Throttle: Space or W or ArrowUp
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.inputThrottle = 1.0;
        const gasPedal = document.getElementById('gasPedal');
        if (gasPedal) gasPedal.classList.add('active');

        if (!this.isEngineRunning) {
          window.engineAudio.initContext();
          this.isEngineRunning = true;
          this.loadEngineConfiguration();
          const startOverlay = document.getElementById('startOverlay');
          if (startOverlay) startOverlay.classList.add('hidden');
        }
      }

      // Brake: S or ArrowDown
      if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.inputBrake = 1.0;
        const brakePedal = document.getElementById('brakePedal');
        if (brakePedal) brakePedal.classList.add('active');
      }

      // Clutch: C
      if (e.code === 'KeyC') {
        this.inputClutch = 1.0;
        const clutchPedal = document.getElementById('clutchPedal');
        if (clutchPedal) clutchPedal.classList.add('active');
      }

      // Shift Up: E
      if (e.code === 'KeyE') {
        window.enginePhysics.shiftUp();
        this._updateShifterUI();
      }

      // Shift Down: Q
      if (e.code === 'KeyQ') {
        window.enginePhysics.shiftDown();
        this._updateShifterUI();
      }

      // 2-Step: L
      if (e.code === 'KeyL') {
        const active = window.enginePhysics.toggleTwoStep();
        const btnTwoStep = document.getElementById('btnTwoStep');
        if (btnTwoStep) btnTwoStep.classList.toggle('active', active);
      }

      // NOS: N
      if (e.code === 'KeyN') {
        window.enginePhysics.triggerNos(true);
        window.engineAudio.playNosPurge();
        const btnNos = document.getElementById('btnNos');
        if (btnNos) btnNos.classList.add('active');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;

      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        this.inputThrottle = 0.0;
        const gasPedal = document.getElementById('gasPedal');
        if (gasPedal) gasPedal.classList.remove('active');
      }

      if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        this.inputBrake = 0.0;
        const brakePedal = document.getElementById('brakePedal');
        if (brakePedal) brakePedal.classList.remove('active');
      }

      if (e.code === 'KeyC') {
        this.inputClutch = 0.0;
        const clutchPedal = document.getElementById('clutchPedal');
        if (clutchPedal) clutchPedal.classList.remove('active');
      }

      if (e.code === 'KeyN') {
        window.enginePhysics.triggerNos(false);
        const btnNos = document.getElementById('btnNos');
        if (btnNos) btnNos.classList.remove('active');
      }
    });
  }

  _updateShifterUI() {
    const curGear = window.enginePhysics.gear;
    document.querySelectorAll('.gear-btn').forEach(btn => {
      const g = parseInt(btn.getAttribute('data-gear'));
      btn.classList.toggle('active', g === curGear);
    });
  }

  _bindWindowResize() {
    window.addEventListener('resize', () => {
      window.cockpitGauges.resize();
      window.engineVisualizer.resize();
    });
  }

  /**
   * Main Simulation & Render Loop
   */
  _loop(timestamp) {
    const dt = Math.min(0.05, (timestamp - this.lastFrameTime) / 1000);
    this.lastFrameTime = timestamp;

    const physics = window.enginePhysics;

    if (this.isEngineRunning) {
      physics.update(dt, this.inputThrottle, this.inputBrake, this.inputClutch);
      window.engineAudio.update(
        physics.rpm,
        physics.throttle,
        physics.boostBar,
        physics.isLimiterBouncing,
        physics.isTwoStepActive,
        physics.isNosActive
      );
    }

    // Render Gauges and Visualizers
    window.cockpitGauges.render(physics);
    window.engineVisualizer.render(dt, physics);

    // Update Telemetry Badges
    this._updateLiveTelemetry(physics);

    requestAnimationFrame((t) => this._loop(t));
  }

  _updateLiveTelemetry(physics) {
    const curHpEl = document.getElementById('liveHp');
    const curTqEl = document.getElementById('liveTq');
    const curEgtEl = document.getElementById('liveEgt');
    const curOilEl = document.getElementById('liveOil');
    const curAfrEl = document.getElementById('liveAfr');
    const nosBarEl = document.getElementById('nosBottleLevel');

    if (curHpEl) curHpEl.textContent = `${Math.round(physics.currentHp)} HP`;
    if (curTqEl) curTqEl.textContent = `${Math.round(physics.currentTorque)} Nm`;
    if (curEgtEl) curEgtEl.textContent = `${Math.round(physics.egtCelsius)} °C`;
    if (curOilEl) curOilEl.textContent = `${Math.round(physics.oilPressurePsi)} PSI`;
    if (nosBarEl) {
      if (physics.nosInfinite) {
        nosBarEl.style.width = '100%';
        nosBarEl.style.background = 'linear-gradient(90deg, #00f0ff, #a855f7)';
      } else {
        nosBarEl.style.width = `${physics.nosBottlePressure}%`;
        nosBarEl.style.background = 'linear-gradient(90deg, #00f0ff, #38bdf8)';
      }
    }
  }
}

// Instantiate and initialize on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.apexApp = new ApexDynoApp();
  window.apexApp.init();
});
