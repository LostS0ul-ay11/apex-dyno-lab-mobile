/**
 * APEX DYNO - Drivetrain & Vehicle Physics Simulation
 * Simulates engine rotational inertia, flywheel dynamics,
 * turbo spool-up & boost curves, supercharger mechanical drive,
 * transmission gear ratios, drivetrain resistance, dyno HP/Torque,
 * and 2-step launch control.
 */

class EnginePhysics {
  constructor() {
    this.engineData = null;
    this.inductionData = null;
    this.camshaftData = null;
    this.exhaustData = null;

    // Engine dynamic state
    this.rpm = 800;
    this.targetRpm = 800;
    this.throttle = 0; // 0..1
    this.boostBar = 0; // -0.8 vacuum to +3.5 Bar
    this.targetBoost = 0;
    this.wastegateSetting = 1.0; // Wastegate multiplier (0.5 to 1.5)
    this.manifoldPressureKpa = 30; // 30 (vacuum) to 350 kPa

    // Dyno power readings
    this.currentHp = 0;
    this.currentTorque = 0; // Nm
    this.peakHp = 0;
    this.peakHpRpm = 0;
    this.peakTorque = 0;
    this.peakTorqueRpm = 0;

    // Transmission & Drivetrain
    this.gear = 0; // -1: R, 0: N, 1..7: Gears
    this.gearRatios = {
      '-1': -3.5,
      '0': 0,
      '1': 3.82,
      '2': 2.36,
      '3': 1.69,
      '4': 1.31,
      '5': 1.00,
      '6': 0.79,
      '7': 0.63
    };
    this.finalDrive = 3.73;
    this.tireRadiusMeters = 0.33; // 255/35R19 approx
    this.vehicleMassKg = 1450;
    this.vehicleSpeedKmh = 0;
    this.wheelSlip = 0;

    // Clutch & Controls
    this.clutchEngaged = 1.0; // 1 = fully connected, 0 = depressed
    this.isBraking = false;
    this.transmissionMode = 'manual'; // 'manual' or 'sequential'

    // Electronic Features & Nitrous Oxide (NOS)
    this.isTwoStepActive = false;
    this.twoStepRpm = 4500;
    this.isLimiterBouncing = false;
    this.limiterBounceTimer = 0;

    // Advanced NOS System
    this.isNosActive = false;
    this.nosArmed = true; // Armed master safety switch
    this.nosInfinite = true; // INFINITE NITROUS (never runs dry)
    this.nosShotHp = 300; // Controllable Shot: 50 to 1500 HP
    this.nosBottlePressure = 100; // %
    this.nosBottlePsi = 1050; // Optimal pressure: 950 - 1100 PSI
    this.nosTriggerMode = 'manual'; // 'manual' (hold N) or 'wot' (auto-inject at full throttle)
    this.nosDeliveryType = 'direct_port'; // 'single_fogger', 'dual_wet', 'direct_port'
    this.nosBottleHeater = true;
    this.flywheelWeight = 1.0; // 0.6 = Lightweight Racing, 1.2 = Heavy OEM

    // Telemetry & Thermals
    this.egtCelsius = 450; // Exhaust Gas Temp (400 - 1050 C)
    this.oilPressurePsi = 45;
    this.oilTempC = 90;
    this.waterTempC = 88;
    this.afr = 14.7; // Air-Fuel Ratio
  }

  setup(engineData, inductionData, camshaftData, exhaustData) {
    this.engineData = engineData;
    this.inductionData = inductionData;
    this.camshaftData = camshaftData || { hpBonus: 0, rpmBonus: 0 };
    this.exhaustData = exhaustData || { volume: 1.0, pops: 0.5 };

    this.rpm = engineData.idleRpm;
    this.targetRpm = engineData.idleRpm;
    this.boostBar = 0;
    this.vehicleSpeedKmh = 0;
    this.gear = 0; // Neutral

    this._calculateDynoCurves();
  }

  /**
   * Precomputes full power and torque curve profiles across the RPM band
   */
  _calculateDynoCurves() {
    if (!this.engineData) return;
    const eng = this.engineData;
    const ind = this.inductionData;
    const cam = this.camshaftData;

    this.dynoPoints = [];
    let maxHp = 0;
    let maxHpRpm = 0;
    let maxTq = 0;
    let maxTqRpm = 0;

    const startRpm = eng.idleRpm;
    const maxRedline = eng.redlineRpm + (cam.rpmBonus || 0);

    for (let r = 1000; r <= maxRedline + 400; r += 150) {
      const normalizedR = (r - 1000) / (maxRedline - 1000);

      // Torque shape base curve: bell curve peak around 40-70% of rev range
      let torqueFactor = Math.sin(normalizedR * Math.PI * 0.95 + 0.15);
      if (eng.category === 'v' && eng.layout === 'v' && eng.cylinders >= 8) {
        // V8/V10/V12 has flatter, meatier low-end torque
        torqueFactor = 0.7 + 0.3 * Math.sin(normalizedR * Math.PI * 0.85);
      } else if (eng.layout === 'rotary') {
        // Rotary builds torque later in the rev range
        torqueFactor = 0.5 + 0.5 * Math.pow(normalizedR, 0.7);
      }

      // Camshaft shift: moves torque curve to higher RPM
      if (cam.id === 'stage2' || cam.id === 'stage3') {
        torqueFactor = Math.pow(torqueFactor, 0.9) * (0.8 + 0.4 * normalizedR);
      }

      // Induction boost multiplier at full throttle
      let maxBoostAtRpm = 0;
      if (ind.category === 'turbo') {
        if (r >= ind.spoolRpm) {
          const spoolProgress = Math.min(1.0, (r - ind.spoolRpm) / 1200);
          maxBoostAtRpm = ind.boostMaxBar * spoolProgress * this.wastegateSetting;
        }
      } else if (ind.category === 'supercharger') {
        maxBoostAtRpm = ind.boostMaxBar * (ind.type === 'centrifugal' ? (r / maxRedline) : 1.0);
      }

      const boostTqMult = 1.0 + maxBoostAtRpm * 0.72;
      const camHpMult = 1.0 + (cam.hpBonus || 0);
      const exhaustMult = 1.0 + (this.exhaustData.id === 'straight_pipe' ? 0.06 : (this.exhaustData.id === 'sport' ? 0.03 : 0));

      const calculatedTorqueNm = eng.baseTorque * torqueFactor * boostTqMult * camHpMult * exhaustMult;
      // HP = (Torque_Nm * RPM) / 7127
      const calculatedHp = (calculatedTorqueNm * r) / 7127;

      if (calculatedHp > maxHp) {
        maxHp = calculatedHp;
        maxHpRpm = r;
      }
      if (calculatedTorqueNm > maxTq) {
        maxTq = calculatedTorqueNm;
        maxTqRpm = r;
      }

      this.dynoPoints.push({
        rpm: r,
        torque: Math.round(calculatedTorqueNm),
        hp: Math.round(calculatedHp),
        boost: maxBoostAtRpm
      });
    }

    this.peakHp = Math.round(maxHp);
    this.peakHpRpm = maxHpRpm;
    this.peakTorque = Math.round(maxTq);
    this.peakTorqueRpm = maxTqRpm;
  }

  /**
   * Main Physics Tick (delta seconds)
   */
  update(dt, inputThrottle, inputBrake, inputClutch) {
    if (!this.engineData) return;

    this.throttle = Math.max(0, Math.min(1, inputThrottle));
    this.isBraking = inputBrake > 0.05;
    this.clutchEngaged = 1.0 - Math.max(0, Math.min(1, inputClutch));

    const eng = this.engineData;
    const ind = this.inductionData;
    const effectiveRedline = eng.redlineRpm + (this.camshaftData.rpmBonus || 0);
    const maxAbsoluteRpm = eng.maxRpm + (this.camshaftData.rpmBonus || 0);

    // 1. Advanced NOS Activation & Dynamic Shot Power
    if (this.nosArmed && this.nosTriggerMode === 'wot' && this.throttle >= 0.92) {
      this.isNosActive = true;
    } else if (this.nosTriggerMode === 'wot' && this.throttle < 0.92) {
      this.isNosActive = false;
    }

    let nosTorqueBonus = 0;
    const canInjectNos = this.nosArmed && this.isNosActive && (this.nosInfinite || this.nosBottlePressure > 0);

    if (canInjectNos && this.throttle > 0.35) {
      // Direct user-controlled shot size (50 to 1500 HP) converted to Nm torque
      nosTorqueBonus = this.nosShotHp * 1.355;

      if (!this.nosInfinite) {
        const consumptionRate = (this.nosShotHp / 250) * 4.0;
        this.nosBottlePressure = Math.max(0, this.nosBottlePressure - dt * consumptionRate);
        this.nosBottlePsi = Math.round((this.nosBottlePressure / 100) * 1050);
      } else {
        this.nosBottlePressure = 100;
        this.nosBottlePsi = 1050;
      }
    } else {
      if (this.nosInfinite) {
        this.nosBottlePressure = 100;
        this.nosBottlePsi = 1050;
      }
    }

    // 2. Forced Induction Boost Dynamics
    if (ind.category === 'turbo') {
      const spoolThreshold = ind.spoolRpm;
      const canSpool = this.rpm >= spoolThreshold * 0.75;

      if (this.isTwoStepActive && this.throttle > 0.8) {
        // Anti-lag 2-step spools turbo even at standstill!
        this.targetBoost = ind.boostMaxBar * 0.85 * this.wastegateSetting;
      } else if (this.throttle > 0.1 && canSpool) {
        const rpmFactor = Math.min(1.0, Math.max(0, (this.rpm - spoolThreshold) / 1200));
        this.targetBoost = ind.boostMaxBar * this.throttle * (0.3 + 0.7 * rpmFactor) * this.wastegateSetting;
      } else {
        // Off throttle: charge pipe vents to vacuum
        this.targetBoost = -0.7 * (1.0 - this.throttle);
      }

      // Smooth spool lag
      const lagResponse = (1.0 - (ind.lagFactor || 0.3) * 0.8) * 6.0;
      this.boostBar += (this.targetBoost - this.boostBar) * Math.min(1.0, dt * lagResponse);
    } else if (ind.category === 'supercharger') {
      if (ind.type === 'centrifugal') {
        const rpmRatio = (this.rpm - eng.idleRpm) / (effectiveRedline - eng.idleRpm);
        this.targetBoost = ind.boostMaxBar * Math.pow(Math.max(0, rpmRatio), 1.8) * this.throttle;
      } else {
        // Roots / Whipple instant displacement
        this.targetBoost = ind.boostMaxBar * this.throttle;
      }
      this.boostBar += (this.targetBoost - this.boostBar) * Math.min(1.0, dt * 18.0);
    } else {
      // Naturally Aspirated: manifold vacuum
      this.boostBar = -0.75 * (1.0 - this.throttle);
    }

    // 3. Engine Rotational Dynamics (Flywheel & Drivetrain)
    const isInNeutral = this.gear === 0 || this.clutchEngaged < 0.2;

    if (this.isTwoStepActive && this.throttle > 0.4) {
      // 2-Step Launch Control RPM Lock
      this.targetRpm = this.twoStepRpm;
      if (this.rpm >= this.twoStepRpm - 50) {
        this.isLimiterBouncing = true;
        this.rpm = this.twoStepRpm + (Math.random() * 120 - 60);
      } else {
        this.isLimiterBouncing = false;
        this.rpm += 4500 * dt;
      }
    } else if (isInNeutral) {
      // Freely revving in neutral
      const revSpeed = (8200 / this.flywheelWeight) * dt;
      const decelSpeed = (4600 / this.flywheelWeight) * dt;

      if (this.throttle > 0.05) {
        this.targetRpm = eng.idleRpm + this.throttle * (effectiveRedline - eng.idleRpm + 400);
        this.rpm += (this.targetRpm - this.rpm) * Math.min(1.0, revSpeed * 0.002);
      } else {
        this.targetRpm = eng.idleRpm;
        this.rpm -= decelSpeed;
        if (this.rpm < eng.idleRpm) this.rpm = eng.idleRpm;
      }

      // Check Rev Limiter Hard Cut
      if (this.rpm >= effectiveRedline) {
        this.isLimiterBouncing = true;
        this.rpm = effectiveRedline - (Math.random() * 180 + 80);
      } else {
        this.isLimiterBouncing = false;
      }
    } else {
      // In Gear: Drivetrain connected via transmission & clutch
      const gearRatio = this.gearRatios[this.gear.toString()] || 1.0;
      const totalRatio = gearRatio * this.finalDrive;
      const speedMs = this.vehicleSpeedKmh / 3.6;

      // Theoretical sync RPM at current road speed:
      const wheelSyncRpm = (speedMs / (2 * Math.PI * this.tireRadiusMeters)) * 60 * Math.abs(totalRatio);

      // Dynamic Clutch Slip / Torque Converter Launch Assist:
      // When starting from standstill or low speed, allow engine to rev freely to build launch torque!
      const isStartingGear = (this.gear === 1 || this.gear === -1);
      const isLowSpeed = speedMs < 10.0; // below ~36 km/h

      if (isStartingGear && isLowSpeed && wheelSyncRpm < this.rpm) {
        // Engine revs up according to throttle and flywheel inertia
        const launchTargetRpm = eng.idleRpm + this.throttle * (effectiveRedline * 0.65 - eng.idleRpm);
        const engineSpinUpSpeed = (9500 / this.flywheelWeight) * dt;

        if (this.throttle > 0.05) {
          this.rpm += (launchTargetRpm - this.rpm) * Math.min(1.0, engineSpinUpSpeed * 0.003);
        } else {
          this.rpm += (eng.idleRpm - this.rpm) * Math.min(1.0, dt * 8.0);
        }

        // Clutch bite factor: smoothly increases with RPM and throttle
        const clutchSlipRatio = Math.min(1.0, (this.rpm - eng.idleRpm) / 1800);
        const clutchBite = Math.max(0.4, clutchSlipRatio) * this.clutchEngaged;

        // Calculate available engine driving torque
        const normR = Math.max(0, Math.min(1, (this.rpm - 1000) / (effectiveRedline - 1000)));
        let torqueCurve = Math.sin(normR * Math.PI * 0.95 + 0.15);
        const currentBoostFactor = 1.0 + Math.max(0, this.boostBar) * 0.72;
        const availableTorque = (eng.baseTorque * torqueCurve * currentBoostFactor + nosTorqueBonus) * Math.max(0.25, this.throttle);

        // Effective torque delivered to wheels (punchy launch torque!)
        const wheelForce = (availableTorque * clutchBite * Math.abs(totalRatio)) / this.tireRadiusMeters;

        // Resistances
        const aeroDragForce = 0.38 * speedMs * speedMs;
        const rollingResistanceForce = this.vehicleMassKg * 9.81 * 0.015;
        const brakeForce = this.isBraking ? 9500 : 0;

        let netForce = wheelForce - aeroDragForce - rollingResistanceForce - brakeForce;
        if (this.gear === -1) netForce = -netForce;

        const accelerationMs2 = netForce / this.vehicleMassKg;
        let newSpeedMs = speedMs + accelerationMs2 * dt;
        if (newSpeedMs < 0) newSpeedMs = 0;

        this.vehicleSpeedKmh = newSpeedMs * 3.6;

        // When wheel speed catches up to engine RPM, blend seamlessly into rigid lock
        const newSyncRpm = (newSpeedMs / (2 * Math.PI * this.tireRadiusMeters)) * 60 * Math.abs(totalRatio);
        if (newSyncRpm >= this.rpm) {
          this.rpm = newSyncRpm;
        }
      } else {
        // Direct locked drivetrain connection (cruising / higher gears)
        const normR = Math.max(0, Math.min(1, (this.rpm - 1000) / (effectiveRedline - 1000)));
        let torqueCurve = Math.sin(normR * Math.PI * 0.95 + 0.15);
        const currentBoostFactor = 1.0 + Math.max(0, this.boostBar) * 0.72;
        const engTorque = (eng.baseTorque * torqueCurve * currentBoostFactor + nosTorqueBonus) * this.throttle * this.clutchEngaged;

        const wheelForce = (engTorque * Math.abs(totalRatio)) / this.tireRadiusMeters;
        const aeroDragForce = 0.38 * speedMs * speedMs;
        const rollingResistanceForce = this.vehicleMassKg * 9.81 * 0.015;
        const brakeForce = this.isBraking ? 9500 : 0;

        let netForce = wheelForce - aeroDragForce - rollingResistanceForce - brakeForce;
        if (this.gear === -1) netForce = -netForce;

        const accelerationMs2 = netForce / this.vehicleMassKg;
        let newSpeedMs = speedMs + accelerationMs2 * dt;
        if (newSpeedMs < 0) newSpeedMs = 0;

        this.vehicleSpeedKmh = newSpeedMs * 3.6;

        const calculatedRpm = (newSpeedMs / (2 * Math.PI * this.tireRadiusMeters)) * 60 * Math.abs(totalRatio);
        this.rpm = Math.max(eng.idleRpm, calculatedRpm);
      }

      // Limiter bounce in gear
      if (this.rpm >= effectiveRedline) {
        this.isLimiterBouncing = true;
        this.rpm = effectiveRedline - (Math.random() * 140 + 60);
      } else {
        this.isLimiterBouncing = false;
      }
    }

    // Safety clamp
    this.rpm = Math.max(eng.idleRpm, Math.min(maxAbsoluteRpm, this.rpm));

    // 4. Live Dyno HP & Torque Calculation at current state
    const currentNormR = Math.max(0, Math.min(1, (this.rpm - 1000) / (effectiveRedline - 1000)));
    let baseTqProfile = Math.sin(currentNormR * Math.PI * 0.95 + 0.15);
    const boostMult = 1.0 + Math.max(0, this.boostBar) * 0.72;
    const camBonus = 1.0 + (this.camshaftData.hpBonus || 0);

    this.currentTorque = Math.max(0, (eng.baseTorque * baseTqProfile * boostMult * camBonus + nosTorqueBonus) * (0.15 + 0.85 * this.throttle));
    this.currentHp = Math.max(0, (this.currentTorque * this.rpm) / 7127);

    // 5. Live Thermals & Telemetry
    // EGT builds under high load and high boost
    const targetEgt = 420 + this.throttle * 400 + Math.max(0, this.boostBar) * 85;
    this.egtCelsius += (targetEgt - this.egtCelsius) * Math.min(1.0, dt * 1.5);

    // Oil pressure scales with RPM
    this.oilPressurePsi = 25 + (this.rpm / effectiveRedline) * 55;

    // AFR (rich under boost, stoich 14.7 at cruise)
    if (this.throttle > 0.8) {
      this.afr = 11.2 - Math.max(0, this.boostBar) * 0.4;
    } else if (this.throttle < 0.05) {
      this.afr = 16.5; // Decel fuel cut lean
    } else {
      this.afr = 14.7;
    }
  }

  /**
   * Gear Shift logic
   */
  shiftUp() {
    if (this.gear < 7) {
      this.gear++;
      this._applyShiftDip();
    }
  }

  shiftDown() {
    if (this.gear > -1) {
      this.gear--;
      this._applyShiftDip();
    }
  }

  setGear(g) {
    if (g >= -1 && g <= 7) {
      this.gear = g;
      this._applyShiftDip();
    }
  }

  _applyShiftDip() {
    // Quick flywheel RPM shift drop/blip
    if (this.gear > 1) {
      this.rpm = Math.max(this.engineData.idleRpm, this.rpm * 0.76);
    }
  }

  toggleTwoStep() {
    this.isTwoStepActive = !this.isTwoStepActive;
    return this.isTwoStepActive;
  }

  triggerNos(active) {
    if (!this.nosArmed) {
      this.isNosActive = false;
      return;
    }
    this.isNosActive = active && (this.nosInfinite || this.nosBottlePressure > 0);
  }
}

// Global instance
window.enginePhysics = new EnginePhysics();
