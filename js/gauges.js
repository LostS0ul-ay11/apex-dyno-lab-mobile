/**
 * APEX DYNO - High-Precision Digital & Analog Cockpit Gauges
 * Renders high-DPI Canvas Tachometer, Speedometer, and Boost Gauge
 * with LED shift-lights, needle inertia, glowing redlines, and OLED telemetry.
 */

class CockpitGauges {
  constructor() {
    this.tachCanvas = null;
    this.tachCtx = null;
    this.speedCanvas = null;
    this.speedCtx = null;
    this.boostCanvas = null;
    this.boostCtx = null;

    // Smoothed needle positions
    this.smoothRpm = 800;
    this.smoothSpeed = 0;
    this.smoothBoost = 0;

    this.unit = 'kmh'; // 'kmh' or 'mph'
    this.isShiftLightBlinking = false;
  }

  init(tachId, speedId, boostId) {
    this.tachCanvas = document.getElementById(tachId);
    if (this.tachCanvas) this.tachCtx = this._setupHighDpiCanvas(this.tachCanvas);

    this.speedCanvas = document.getElementById(speedId);
    if (this.speedCanvas) this.speedCtx = this._setupHighDpiCanvas(this.speedCanvas);

    this.boostCanvas = document.getElementById(boostId);
    if (this.boostCanvas) this.boostCtx = this._setupHighDpiCanvas(this.boostCanvas);
  }

  _setupHighDpiCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 320) * dpr;
    canvas.height = (rect.height || 320) * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  resize() {
    if (this.tachCanvas) this.tachCtx = this._setupHighDpiCanvas(this.tachCanvas);
    if (this.speedCanvas) this.speedCtx = this._setupHighDpiCanvas(this.speedCanvas);
    if (this.boostCanvas) this.boostCtx = this._setupHighDpiCanvas(this.boostCanvas);
  }

  render(physics) {
    if (!physics || !physics.engineData) return;

    // Interpolation for silky smooth needles
    this.smoothRpm += (physics.rpm - this.smoothRpm) * 0.28;
    this.smoothSpeed += (physics.vehicleSpeedKmh - this.smoothSpeed) * 0.22;
    this.smoothBoost += (physics.boostBar - this.smoothBoost) * 0.25;

    this._drawTachometer(physics);
    this._drawSpeedometer(physics);
    this._drawBoostGauge(physics);
  }

  /**
   * TACHOMETER (RPM GAUGE) WITH OPTIMAL SHIFT POINT INDICATOR
   */
  _drawTachometer(physics) {
    if (!this.tachCtx) return;
    const ctx = this.tachCtx;
    const w = this.tachCanvas.getBoundingClientRect().width;
    const h = this.tachCanvas.getBoundingClientRect().height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 14;

    ctx.clearRect(0, 0, w, h);

    const eng = physics.engineData;
    const redline = eng.redlineRpm + (physics.camshaftData.rpmBonus || 0);
    const maxGaugeRpm = Math.ceil((eng.maxRpm + 600) / 1000) * 1000;
    const optimalShiftRpm = redline * 0.92;
    const isShiftPoint = physics.gear > 0 && physics.gear < 7 && this.smoothRpm >= optimalShiftRpm;

    // Trigger cockpit shift beep when hitting optimal shift point
    const now = Date.now();
    if (isShiftPoint && (!this.lastShiftBeepTime || now - this.lastShiftBeepTime > 650)) {
      this.lastShiftBeepTime = now;
      if (window.engineAudio && window.engineAudio.playShiftBeep) {
        window.engineAudio.playShiftBeep();
      }
    }

    // Dial Angles: from 135° (bottom-left) to 405° (bottom-right) -> 270° sweep
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;

    // 1. Bezel Outer Ring with Metallic Brushed Finish
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = isShiftPoint ? 'rgba(0, 240, 255, 0.4)' : (this.smoothRpm >= redline ? 'rgba(255, 30, 30, 0.5)' : 'rgba(255, 255, 255, 0.08)');
    ctx.lineWidth = 3;
    ctx.stroke();

    // Dark Carbon Dial Face
    const rimGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, r);
    rimGrad.addColorStop(0, '#0f172a');
    rimGrad.addColorStop(0.65, '#070a10');
    rimGrad.addColorStop(1, '#020408');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Subtle Carbon Weave Rings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let cr = r - 28; cr > 55; cr -= 14) {
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Track Arcs (Normal track, Optimal Shift Zone & Redline Danger Zone)
    const redlineAngle = startAngle + (redline / maxGaugeRpm) * totalAngle;
    const shiftAngle = startAngle + (optimalShiftRpm / maxGaugeRpm) * totalAngle;

    // Safe zone arc (Cyan)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 15, startAngle, shiftAngle);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Optimal Shift Window Arc (Neon Amber / Gold)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 15, shiftAngle, redlineAngle);
    ctx.strokeStyle = isShiftPoint ? 'rgba(245, 158, 11, 0.9)' : 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = isShiftPoint ? 7 : 4;
    if (isShiftPoint) {
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Redline danger zone arc (Vivid Crimson)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 15, redlineAngle, endAngle);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = this.smoothRpm >= redline ? 16 : 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Tick Marks and RPM Numerals
    const step = 1000;
    ctx.font = 'bold 13px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let rpmVal = 0; rpmVal <= maxGaugeRpm; rpmVal += 500) {
      const angle = startAngle + (rpmVal / maxGaugeRpm) * totalAngle;
      const isMajor = rpmVal % step === 0;
      const tickLen = isMajor ? 14 : 7;
      const isRed = rpmVal >= redline;
      const isShiftZone = rpmVal >= optimalShiftRpm && rpmVal < redline;

      const innerX = cx + (r - 18 - tickLen) * Math.cos(angle);
      const innerY = cy + (r - 18 - tickLen) * Math.sin(angle);
      const outerX = cx + (r - 18) * Math.cos(angle);
      const outerY = cy + (r - 18) * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.strokeStyle = isRed ? '#ef4444' : (isShiftZone ? '#f59e0b' : (isMajor ? '#ffffff' : 'rgba(255,255,255,0.4)'));
      ctx.lineWidth = isMajor ? 2.5 : 1.2;
      ctx.stroke();

      // Number label
      if (isMajor) {
        const textR = r - 42;
        const tx = cx + textR * Math.cos(angle);
        const ty = cy + textR * Math.sin(angle);
        ctx.fillStyle = isRed ? '#ff4d4d' : (isShiftZone ? '#fbbf24' : '#f8fafc');
        ctx.fillText((rpmVal / 1000).toString(), tx, ty);
      }
    }

    // 4. Shift-Light LED Arc Indicator (above dial)
    const rpmRatio = (this.smoothRpm - eng.idleRpm) / (redline - eng.idleRpm);
    this._drawShiftLights(ctx, cx, cy - r + 30, rpmRatio, physics.isLimiterBouncing, isShiftPoint);

    // 5. Digital Center Cluster (Gear badge & digital RPM)
    const centerGrad = ctx.createRadialGradient(cx, cy + 22, 10, cx, cy + 22, 46);
    centerGrad.addColorStop(0, '#111827');
    centerGrad.addColorStop(1, '#090d16');

    ctx.fillStyle = centerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy + 22, 46, 0, Math.PI * 2);
    ctx.fill();

    // Flashing border when optimal shift point is hit!
    let ringBorderColor = 'rgba(255, 255, 255, 0.15)';
    if (physics.isLimiterBouncing) {
      ringBorderColor = (Math.floor(Date.now() / 60) % 2 === 0) ? '#ef4444' : 'rgba(239, 68, 68, 0.2)';
    } else if (isShiftPoint) {
      ringBorderColor = (Math.floor(Date.now() / 80) % 2 === 0) ? '#00f0ff' : '#f59e0b';
    }
    ctx.strokeStyle = ringBorderColor;
    ctx.lineWidth = isShiftPoint ? 3 : 1.5;
    ctx.stroke();

    // Gear text
    let gearText = 'N';
    if (physics.gear === -1) gearText = 'R';
    else if (physics.gear > 0) gearText = physics.gear.toString();

    let gearColor = physics.gear === 0 ? '#38bdf8' : (physics.gear === -1 ? '#f97316' : '#22c55e');
    if (isShiftPoint) gearColor = '#00f0ff';
    if (physics.isLimiterBouncing) gearColor = '#ef4444';

    ctx.font = '900 32px "Rajdhani", sans-serif';
    ctx.fillStyle = gearColor;
    ctx.fillText(gearText, cx, cy + 18);

    // Digital RPM small text below gear
    ctx.font = '700 13px "Consolas", monospace';
    ctx.fillStyle = isShiftPoint ? '#00f0ff' : (this.smoothRpm >= redline ? '#ef4444' : '#e2e8f0');
    ctx.fillText(`${Math.round(this.smoothRpm)} RPM`, cx, cy + 44);

    // 6. HUD Shift Indicator Prompt Banner
    if (isShiftPoint) {
      const bannerFlash = (Math.floor(Date.now() / 90) % 2 === 0);
      const bannerY = cy - 22;
      
      ctx.save();
      ctx.fillStyle = bannerFlash ? 'rgba(0, 240, 255, 0.95)' : 'rgba(245, 158, 11, 0.95)';
      ctx.shadowColor = bannerFlash ? '#00f0ff' : '#f59e0b';
      ctx.shadowBlur = 14;

      ctx.beginPath();
      ctx.roundRect(cx - 68, bannerY - 14, 136, 26, 6);
      ctx.fill();

      ctx.font = '900 13px "Rajdhani", sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.fillText(`▲ TROQUE (E) • ${physics.gear}→${physics.gear + 1}`, cx, bannerY + 4);
      ctx.restore();
    } else if (physics.isLimiterBouncing) {
      const bannerY = cy - 22;
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.92)';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 16;

      ctx.beginPath();
      ctx.roundRect(cx - 74, bannerY - 14, 148, 26, 6);
      ctx.fill();

      ctx.font = '900 12px "Rajdhani", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ CORTE DE GIRO', cx, bannerY + 4);
      ctx.restore();
    }

    // 7. Dynamic Glowing Needle
    const currentNeedleAngle = startAngle + (Math.max(0, this.smoothRpm) / maxGaugeRpm) * totalAngle;

    // Glowing Needle Trail
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 24, startAngle, currentNeedleAngle);
    let trailColor = 'rgba(6, 182, 212, 0.25)';
    if (this.smoothRpm >= redline) trailColor = 'rgba(239, 68, 68, 0.45)';
    else if (isShiftPoint) trailColor = 'rgba(0, 240, 255, 0.45)';
    ctx.strokeStyle = trailColor;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    // The Precision Needle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentNeedleAngle);

    ctx.shadowColor = this.smoothRpm >= redline ? '#ff0000' : (isShiftPoint ? '#00f0ff' : '#00ffff');
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(-18, -2.5);
    ctx.lineTo(r - 22, -1);
    ctx.lineTo(r - 22, 1);
    ctx.lineTo(-18, 2.5);
    ctx.closePath();
    ctx.fillStyle = this.smoothRpm >= redline ? '#ff2b2b' : (isShiftPoint ? '#00f0ff' : '#38bdf8');
    ctx.fill();

    // Needle hub cap
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  /**
   * SPEEDOMETER GAUGE
   */
  _drawSpeedometer(physics) {
    if (!this.speedCtx) return;
    const ctx = this.speedCtx;
    const w = this.speedCanvas.getBoundingClientRect().width;
    const h = this.speedCanvas.getBoundingClientRect().height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 16;

    ctx.clearRect(0, 0, w, h);

    const isMph = this.unit === 'mph';
    const displaySpeed = isMph ? this.smoothSpeed * 0.621371 : this.smoothSpeed;
    const maxSpeed = isMph ? 240 : 400;

    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;

    // Dial Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#080a0f';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Speed Track
    ctx.beginPath();
    ctx.arc(cx, cy, r - 16, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Speed Ticks
    const step = isMph ? 20 : 40;
    ctx.font = 'bold 12px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let s = 0; s <= maxSpeed; s += (step / 2)) {
      const angle = startAngle + (s / maxSpeed) * totalAngle;
      const isMajor = s % step === 0;
      const tickLen = isMajor ? 12 : 6;

      const innerX = cx + (r - 20 - tickLen) * Math.cos(angle);
      const innerY = cy + (r - 20 - tickLen) * Math.sin(angle);
      const outerX = cx + (r - 20) * Math.cos(angle);
      const outerY = cy + (r - 20) * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.strokeStyle = isMajor ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isMajor ? 2.2 : 1;
      ctx.stroke();

      if (isMajor) {
        const textR = r - 40;
        const tx = cx + textR * Math.cos(angle);
        const ty = cy + textR * Math.sin(angle);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(s.toString(), tx, ty);
      }
    }

    // Digital Speed Display at center
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy + 20, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = '900 32px "Rajdhani", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(Math.round(displaySpeed).toString(), cx, cy + 14);

    ctx.font = '700 11px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(isMph ? 'MPH' : 'KM/H', cx, cy + 38);

    // Speed Needle
    const currentNeedleAngle = startAngle + (Math.max(0, Math.min(maxSpeed, displaySpeed)) / maxSpeed) * totalAngle;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentNeedleAngle);

    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(-15, -2);
    ctx.lineTo(r - 24, -1);
    ctx.lineTo(r - 24, 1);
    ctx.lineTo(-15, 2);
    ctx.closePath();
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  /**
   * TURBO BOOST & VACUUM GAUGE
   */
  _drawBoostGauge(physics) {
    if (!this.boostCtx) return;
    const ctx = this.boostCtx;
    const w = this.boostCanvas.getBoundingClientRect().width;
    const h = this.boostCanvas.getBoundingClientRect().height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    const minBar = -1.0;
    const maxBar = 3.5;
    const range = maxBar - minBar;

    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalAngle = endAngle - startAngle;

    // Rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#080a0f';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Zero Bar angle (transition from vacuum to boost)
    const zeroAngle = startAngle + ((0 - minBar) / range) * totalAngle;

    // Vacuum arc (Cyan)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 12, startAngle, zeroAngle);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Boost arc (Amber to Red)
    ctx.beginPath();
    ctx.arc(cx, cy, r - 12, zeroAngle, endAngle);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Ticks
    ctx.font = 'bold 10px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let b = -1.0; b <= 3.5; b += 0.5) {
      const angle = startAngle + ((b - minBar) / range) * totalAngle;
      const isMajor = b % 1.0 === 0 || b === 0;
      const tickLen = isMajor ? 8 : 4;

      const innerX = cx + (r - 14 - tickLen) * Math.cos(angle);
      const innerY = cy + (r - 14 - tickLen) * Math.sin(angle);
      const outerX = cx + (r - 14) * Math.cos(angle);
      const outerY = cy + (r - 14) * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.strokeStyle = b >= 0 ? (b > 2.0 ? '#ef4444' : '#f59e0b') : '#06b6d4';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.stroke();

      if (isMajor) {
        const textR = r - 28;
        ctx.fillStyle = b >= 0 ? '#f8fafc' : '#06b6d4';
        ctx.fillText(b.toFixed(0), cx + textR * Math.cos(angle), cy + textR * Math.sin(angle));
      }
    }

    // Digital Boost / PSI Center
    const currentBar = this.smoothBoost;
    const currentPsi = currentBar * 14.5038;

    ctx.font = '800 18px "Rajdhani", sans-serif';
    ctx.fillStyle = currentBar >= 0 ? '#ef4444' : '#06b6d4';
    ctx.fillText(`${currentBar >= 0 ? '+' : ''}${currentBar.toFixed(2)}`, cx, cy + 4);

    ctx.font = '700 9px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`BAR (${Math.round(currentPsi)} PSI)`, cx, cy + 20);

    // Boost Needle
    const clampedBoost = Math.max(minBar, Math.min(maxBar, currentBar));
    const needleAngle = startAngle + ((clampedBoost - minBar) / range) * totalAngle;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);

    ctx.shadowColor = currentBar >= 0 ? '#ef4444' : '#06b6d4';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(-8, -1.5);
    ctx.lineTo(r - 18, -0.8);
    ctx.lineTo(r - 18, 0.8);
    ctx.lineTo(-8, 1.5);
    ctx.closePath();
    ctx.fillStyle = currentBar >= 0 ? '#ef4444' : '#06b6d4';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * LED Shift-Light Strip (Green -> Yellow -> Amber -> Red -> Blue Flash on Shift Point)
   */
  _drawShiftLights(ctx, startX, y, rpmRatio, isLimiter, isShiftPoint) {
    const ledCount = 11;
    const ledSpacing = 14;
    const totalWidth = (ledCount - 1) * ledSpacing;
    const originX = startX - totalWidth / 2;
    const isFlashingFrame = Math.floor(Date.now() / 65) % 2 === 0;

    for (let i = 0; i < ledCount; i++) {
      const ledThreshold = 0.45 + (i / (ledCount - 1)) * 0.48;
      const isLit = rpmRatio >= ledThreshold;

      let ledColor = '#131b26';
      let glowColor = 'transparent';

      if (isLimiter) {
        // Redline cut - flash full row red
        if (isFlashingFrame) {
          ledColor = '#ff0033';
          glowColor = '#ff0033';
        }
      } else if (isShiftPoint) {
        // Optimal shift point - flash whole row intense cyan/magenta/white
        if (isFlashingFrame) {
          ledColor = '#00f0ff';
          glowColor = '#00f0ff';
        } else {
          ledColor = '#f59e0b';
          glowColor = '#f59e0b';
        }
      } else if (isLit) {
        if (i < 4) {
          ledColor = '#10b981'; // Green (build up)
          glowColor = '#10b981';
        } else if (i < 8) {
          ledColor = '#f59e0b'; // Amber (warning)
          glowColor = '#f59e0b';
        } else {
          ledColor = '#ef4444'; // Red (shift zone)
          glowColor = '#ef4444';
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(originX + i * ledSpacing, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = ledColor;
      if (glowColor !== 'transparent') {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = (isShiftPoint || isLimiter) ? 14 : 8;
      }
      ctx.fill();
      ctx.restore();
    }
  }

  toggleSpeedUnit() {
    this.unit = this.unit === 'kmh' ? 'mph' : 'kmh';
    return this.unit;
  }
}

// Global instance
window.cockpitGauges = new CockpitGauges();
