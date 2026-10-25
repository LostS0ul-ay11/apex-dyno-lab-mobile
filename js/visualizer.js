/**
 * APEX DYNO - Engine Mechanical Visualizer & Live Dyno Graph
 * Renders real-time animated engine mechanics:
 * Reciprocating pistons & connecting rods according to real firing orders,
 * rotating crankshaft, glowing exhaust headers according to EGT,
 * spinning turbocharger turbine & supercharger belt,
 * tailpipe fireball backfires, and live dyno HP/Torque curves.
 */

class EngineVisualizer {
  constructor() {
    this.mechCanvas = null;
    this.mechCtx = null;
    this.dynoCanvas = null;
    this.dynoCtx = null;

    // Crankshaft angle
    this.crankAngle = 0;
    this.turbineAngle = 0;
    this.pulleyAngle = 0;

    // Tailpipe backfire particle system
    this.flameParticles = [];
    this.sparks = [];

    // Visual theme colors
    this.colors = {
      block: '#1f2937',
      blockBorder: '#374151',
      cylinderWall: '#111827',
      piston: '#9ca3af',
      pistonCrown: '#e5e7eb',
      conRod: '#6b7280',
      crank: '#4b5563',
      sparkFlash: '#ffea00',
      combustionFire: '#ff5500'
    };
  }

  init(mechCanvasId, dynoCanvasId) {
    this.mechCanvas = document.getElementById(mechCanvasId);
    if (this.mechCanvas) this.mechCtx = this._setupHighDpi(this.mechCanvas);

    this.dynoCanvas = document.getElementById(dynoCanvasId);
    if (this.dynoCanvas) this.dynoCtx = this._setupHighDpi(this.dynoCanvas);

    // Register global backfire visual event
    window.onEngineBackfire = (power) => {
      this.triggerFlameBurst(power);
    };
  }

  _setupHighDpi(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 480) * dpr;
    canvas.height = (rect.height || 360) * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  resize() {
    if (this.mechCanvas) this.mechCtx = this._setupHighDpi(this.mechCanvas);
    if (this.dynoCanvas) this.dynoCtx = this._setupHighDpi(this.dynoCanvas);
  }

  /**
   * Main Render Tick
   */
  render(dt, physics) {
    if (!physics || !physics.engineData) return;

    // Update crank rotation speed: angle += (RPM / 60) * 2*pi * dt
    const crankSpeed = (physics.rpm / 60) * Math.PI * 2;
    this.crankAngle = (this.crankAngle + crankSpeed * dt) % (Math.PI * 4); // 720 cycle for 4-stroke

    // Turbine rotation speed scales with boost
    const turbineSpeed = (1200 + Math.max(0, physics.boostBar) * 6500) * dt;
    this.turbineAngle = (this.turbineAngle + turbineSpeed) % (Math.PI * 2);

    this.pulleyAngle = (this.pulleyAngle + crankSpeed * 2.5 * dt) % (Math.PI * 2);

    this._updateFlameParticles(dt);

    this._drawEngineMechanics(physics);
    this._drawDynoGraph(physics);
  }

  /**
   * ENGINE MECHANICS DIAGRAM
   */
  _drawEngineMechanics(physics) {
    if (!this.mechCtx) return;
    const ctx = this.mechCtx;
    const w = this.mechCanvas.getBoundingClientRect().width;
    const h = this.mechCanvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, w, h);

    const eng = physics.engineData;
    const ind = physics.inductionData;

    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Header Glow calculation based on EGT
    const egtNorm = Math.max(0, Math.min(1.0, (physics.egtCelsius - 400) / 600));
    const glowColor = `rgba(255, ${Math.floor(80 + egtNorm * 120)}, ${Math.floor(20 + egtNorm * 40)}, ${0.2 + egtNorm * 0.7})`;

    // Draw specific layout mechanics
    switch (eng.layout) {
      case 'inline':
        this._drawInlineEngine(ctx, w, h, eng, glowColor);
        break;
      case 'v':
      case 'vr':
        this._drawVEngine(ctx, w, h, eng, glowColor);
        break;
      case 'boxer':
        this._drawBoxerEngine(ctx, w, h, eng, glowColor);
        break;
      case 'rotary':
        this._drawRotaryEngine(ctx, w, h, eng, glowColor);
        break;
      case 'w':
        this._drawWEngine(ctx, w, h, eng, glowColor);
        break;
      default:
        this._drawInlineEngine(ctx, w, h, eng, glowColor);
    }

    // Draw Forced Induction visual add-on
    if (ind.category === 'turbo') {
      this._drawTurbochargerUnit(ctx, w - 85, 75, physics.boostBar);
    } else if (ind.category === 'supercharger') {
      this._drawSuperchargerUnit(ctx, w / 2, 45, ind.type);
    }

    // Draw Tailpipe & Flames at bottom-right
    this._drawTailpipeAndFlames(ctx, w - 60, h - 50);
  }

  /**
   * INLINE ENGINE (I3, I4, I5, I6)
   */
  _drawInlineEngine(ctx, w, h, eng, glowColor) {
    const cylCount = eng.cylinders;
    const spacing = Math.min(62, (w - 120) / cylCount);
    const totalWidth = (cylCount - 1) * spacing;
    const startX = (w - totalWidth) / 2;
    const crankY = h - 100;
    const crankRadius = 24;
    const rodLength = 65;
    const boreW = 34;
    const strokeH = 80;

    // Draw Crankcase Block
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(startX - 30, crankY - strokeH - 45, totalWidth + 60, strokeH + 85, 12);
    ctx.fill();
    ctx.stroke();

    // Draw Exhaust Manifold Pipe behind cylinders with heat glow
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(startX, crankY - strokeH - 22);
    ctx.lineTo(startX + totalWidth + 25, crankY - strokeH - 22);
    ctx.stroke();
    ctx.restore();

    // Draw each cylinder
    for (let i = 0; i < cylCount; i++) {
      const cx = startX + i * spacing;
      const phaseOffset = (eng.firingDelays[i] || (i / cylCount)) * Math.PI * 4;
      const cylCrankAngle = this.crankAngle + phaseOffset;

      // Kinematics: piston position
      const crankPinX = cx + crankRadius * Math.sin(cylCrankAngle);
      const crankPinY = crankY - crankRadius * Math.cos(cylCrankAngle);

      // Piston height relative to TDC
      const pistonY = crankY - (crankRadius * Math.cos(cylCrankAngle) + Math.sqrt(rodLength * rodLength - Math.pow(crankRadius * Math.sin(cylCrankAngle), 2)));

      // Cylinder Sleeve
      ctx.fillStyle = '#090d16';
      ctx.fillRect(cx - boreW / 2, crankY - strokeH - 30, boreW, strokeH + 10);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - boreW / 2, crankY - strokeH - 30, boreW, strokeH + 10);

      // Check for combustion firing phase: when crank angle is near TDC (0 deg mod 720)
      const cycleAngleMod = (cylCrankAngle % (Math.PI * 4) + Math.PI * 4) % (Math.PI * 4);
      const isFiring = cycleAngleMod < 0.45;

      if (isFiring) {
        // Combustion flash in cylinder head
        const flashGrad = ctx.createRadialGradient(cx, crankY - strokeH - 20, 2, cx, crankY - strokeH - 20, 22);
        flashGrad.addColorStop(0, '#ffffff');
        flashGrad.addColorStop(0.3, '#ffea00');
        flashGrad.addColorStop(0.8, '#ff3700');
        flashGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(cx, crankY - strokeH - 20, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spark Plug
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx - 3, crankY - strokeH - 35, 6, 8);

      // Connecting Rod
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(crankPinX, crankPinY);
      ctx.lineTo(cx, pistonY);
      ctx.stroke();

      // Piston
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - boreW / 2 + 2, pistonY - 20, boreW - 4, 18);
      // Piston Rings
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - boreW / 2 + 1, pistonY - 17, boreW - 2, 2);
      ctx.fillRect(cx - boreW / 2 + 1, pistonY - 12, boreW - 2, 2);

      // Crankshaft counterweight
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(crankPinX, crankPinY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Engine Label
    ctx.font = '700 13px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${eng.name} • ${eng.family}`, w / 2, h - 20);
  }

  /**
   * V-ENGINE (V6, V8, V10, V12, V16) & VR-ENGINE
   */
  _drawVEngine(ctx, w, h, eng, glowColor) {
    const isVr = eng.layout === 'vr';
    const vAngleDeg = isVr ? 15 : (eng.vAngle || 90);
    const bankAngleRad = (vAngleDeg / 2) * (Math.PI / 180);

    const crankCenterX = w / 2;
    const crankCenterY = h - 90;
    const crankR = 26;
    const rodL = 72;
    const boreW = 30;
    const strokeH = 75;

    // V-Block outline
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(crankCenterX - 75, crankCenterY + 30);
    ctx.lineTo(crankCenterX + 75, crankCenterY + 30);
    ctx.lineTo(crankCenterX + 120, crankCenterY - 120);
    ctx.lineTo(crankCenterX, crankCenterY - 50);
    ctx.lineTo(crankCenterX - 120, crankCenterY - 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crankshaft Center
    ctx.beginPath();
    ctx.arc(crankCenterX, crankCenterY, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();

    // Two Banks (Left & Right)
    const banks = [
      { side: -1, angle: -bankAngleRad },
      { side: 1, angle: bankAngleRad }
    ];

    banks.forEach((bank, bIdx) => {
      const angle = bank.angle;
      const bankCrankAngle = this.crankAngle + bIdx * (isVr ? 0.3 : Math.PI);

      const pinX = crankCenterX + crankR * Math.sin(bankCrankAngle);
      const pinY = crankCenterY - crankR * Math.cos(bankCrankAngle);

      // Piston coordinates along cylinder axis
      const axisDist = strokeH + 15 + Math.cos(bankCrankAngle) * 18;
      const pistonX = crankCenterX + Math.sin(angle) * axisDist;
      const pistonY = crankCenterY - Math.cos(angle) * axisDist;

      // Connecting rod
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pinX, pinY);
      ctx.lineTo(pistonX, pistonY);
      ctx.stroke();

      // Cylinder sleeve
      ctx.save();
      ctx.translate(pistonX, pistonY);
      ctx.rotate(angle);

      // Firing flash
      const isFiring = Math.abs(bankCrankAngle % (Math.PI * 2)) < 0.4;
      if (isFiring) {
        ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(0, -22, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-boreW / 2, -18, boreW, 18);
      ctx.restore();

      // Exhaust runner glow
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pistonX, pistonY - 20);
      ctx.lineTo(pistonX + bank.side * 40, pistonY - 55);
      ctx.stroke();
      ctx.restore();
    });

    // Central rotating crank pin
    const mainPinX = crankCenterX + crankR * Math.sin(this.crankAngle);
    const mainPinY = crankCenterY - crankR * Math.cos(this.crankAngle);
    ctx.beginPath();
    ctx.arc(mainPinX, mainPinY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Label
    ctx.font = '700 13px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${eng.name} (${vAngleDeg}° Bank Angle)`, w / 2, h - 18);
  }

  /**
   * BOXER ENGINE (Horizontally Opposed Flat-4 / Flat-6)
   */
  _drawBoxerEngine(ctx, w, h, eng, glowColor) {
    const cx = w / 2;
    const cy = h / 2 + 10;
    const crankR = 24;
    const rodL = 65;
    const boreW = 32;

    // Boxer crankcase
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.fillRect(cx - 150, cy - 45, 300, 90);
    ctx.strokeRect(cx - 150, cy - 45, 300, 90);

    // Left and Right opposing pistons
    const sides = [-1, 1];
    sides.forEach((side, idx) => {
      // In Boxer, opposing pistons move away and towards each other simultaneously!
      const pistonOffset = Math.sin(this.crankAngle) * side * crankR;
      const pistonX = cx + side * (rodL + 25) + pistonOffset;

      // Connecting rod
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + side * crankR * Math.cos(this.crankAngle), cy);
      ctx.lineTo(pistonX, cy);
      ctx.stroke();

      // Piston
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(pistonX - 10, cy - boreW / 2, 20, boreW);

      // Firing flash at outer extremes
      const isFiring = (idx === 0 ? Math.sin(this.crankAngle) > 0.85 : Math.sin(this.crankAngle) < -0.85);
      if (isFiring) {
        ctx.fillStyle = 'rgba(255, 80, 0, 0.8)';
        ctx.beginPath();
        ctx.arc(pistonX + side * 15, cy, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // Exhaust headers
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(pistonX + side * 15, cy);
      ctx.lineTo(pistonX + side * 15, cy + 45);
      ctx.lineTo(cx + 80, cy + 45);
      ctx.stroke();
      ctx.restore();
    });

    // Central Crank
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();

    ctx.font = '700 13px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${eng.name} (Horizontally Opposed)`, w / 2, h - 20);
  }

  /**
   * ROTARY WANKEL ENGINE (13B / 20B / 26B)
   */
  _drawRotaryEngine(ctx, w, h, eng, glowColor) {
    const cx = w / 2;
    const cy = h / 2;
    const a = 95; // Major axis of trochoid
    const b = 75; // Minor axis

    // 1. Epitrochoid Chamber Housing
    ctx.save();
    ctx.beginPath();
    for (let theta = 0; theta <= Math.PI * 2; theta += 0.05) {
      // Parametric trochoid housing curve
      const r = 82 + 16 * Math.cos(2 * theta);
      const px = cx + r * Math.cos(theta);
      const py = cy + r * Math.sin(theta);
      if (theta === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // 2. Eccentric Shaft (turns 3x faster than rotor)
    const e = 18; // Eccentricity
    const shaftAngle = this.crankAngle * 1.5;
    const rotorAngle = this.crankAngle * 0.5; // 3:1 gear ratio

    const ecX = cx + e * Math.cos(shaftAngle);
    const ecY = cy + e * Math.sin(shaftAngle);

    // 3. Reuleaux Triangular Rotor
    ctx.save();
    ctx.translate(ecX, ecY);
    ctx.rotate(rotorAngle);

    ctx.beginPath();
    const rotorR = 64;
    for (let i = 0; i < 3; i++) {
      const vAngle = (i * Math.PI * 2) / 3;
      const nextAngle = ((i + 1) * Math.PI * 2) / 3;
      const vx = rotorR * Math.cos(vAngle);
      const vy = rotorR * Math.sin(vAngle);

      // Arc for curved flank
      if (i === 0) ctx.moveTo(vx, vy);
      const midAngle = vAngle + Math.PI / 3;
      const controlR = rotorR * 1.15;
      const cxArc = controlR * Math.cos(midAngle);
      const cyArc = controlR * Math.sin(midAngle);
      const nx = rotorR * Math.cos(nextAngle);
      const ny = rotorR * Math.sin(nextAngle);
      ctx.quadraticCurveTo(cxArc, cyArc, nx, ny);
    }
    ctx.closePath();
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Apex seals (Gold dots at vertices)
    for (let i = 0; i < 3; i++) {
      const vAngle = (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(rotorR * Math.cos(vAngle), rotorR * Math.sin(vAngle), 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    }

    // Rotor internal gear
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.stroke();

    ctx.restore();

    // Firing flash on the combustion side (left flank)
    if (Math.sin(rotorAngle * 3) > 0.4) {
      ctx.save();
      ctx.shadowColor = '#ff5500';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(255, 80, 0, 0.75)';
      ctx.beginPath();
      ctx.arc(cx - 75, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = '700 13px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${eng.name} (Epitrochoid Rotary)`, w / 2, h - 20);
  }

  /**
   * W-ENGINE (W12 / W16)
   */
  _drawWEngine(ctx, w, h, eng, glowColor) {
    // 4 cylinder rows converging
    const cx = w / 2;
    const cy = h - 85;
    const crankR = 24;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, Math.PI, 0);
    ctx.fill();
    ctx.stroke();

    // 4 banks at -45°, -15°, +15°, +45°
    const angles = [-0.78, -0.26, 0.26, 0.78];
    angles.forEach((rad, idx) => {
      const pDist = 85 + Math.sin(this.crankAngle + idx) * 16;
      const px = cx + Math.sin(rad) * pDist;
      const py = cy - Math.cos(rad) * pDist;

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.font = '700 13px "Rajdhani", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${eng.name} (Quad-Bank W-Layout)`, w / 2, h - 20);
  }

  /**
   * TURBOCHARGER HOUSING & COMPRESSOR WHEEL
   */
  _drawTurbochargerUnit(ctx, cx, cy, boostBar) {
    const isBoosting = boostBar > 0.1;
    const glow = isBoosting ? `rgba(255, 60, 0, ${Math.min(0.9, boostBar * 0.4)})` : 'transparent';

    ctx.save();
    // Turbine snail shell
    ctx.shadowColor = glow;
    ctx.shadowBlur = isBoosting ? 18 : 0;

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isBoosting ? '#ef4444' : '#475569';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Compressor inlet
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // Spinning turbine blades
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.turbineAngle);

    const bladeCount = 6;
    for (let i = 0; i < bladeCount; i++) {
      const bAngle = (i * Math.PI * 2) / bladeCount;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(10 * Math.cos(bAngle + 0.5), 10 * Math.sin(bAngle + 0.5), 16 * Math.cos(bAngle), 16 * Math.sin(bAngle));
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '700 10px "Rajdhani", sans-serif';
    ctx.fillStyle = isBoosting ? '#ef4444' : '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('TURBO', cx, cy + 44);

    ctx.restore();
  }

  /**
   * SUPERCHARGER HOUSING & PULLEY
   */
  _drawSuperchargerUnit(ctx, cx, cy, scType) {
    ctx.save();
    // Blower casing
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - 50, cy - 16, 100, 32, 6);
    ctx.fill();
    ctx.stroke();

    // Serpentine Belt Pulley
    ctx.save();
    ctx.translate(cx + 42, cy);
    ctx.rotate(this.pulleyAngle);
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Pulley spokes
    for (let i = 0; i < 3; i++) {
      const spA = (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12 * Math.cos(spA), 12 * Math.sin(spA));
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '700 10px "Rajdhani", sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(scType === 'twin_screw' ? 'WHIPPLE SCREW' : 'SUPERCHARGER', cx, cy + 3);
    ctx.restore();
  }

  /**
   * TAILPIPE & BACKFIRE FLAME SYSTEM
   */
  _drawTailpipeAndFlames(ctx, x, y) {
    // Tailpipe bezel
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner pipe
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#020617';
    ctx.fill();

    // Render active flame particles
    this.flameParticles.forEach(p => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.glow;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.restore();
    });

    // Render sparks
    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 1.5;
    this.sparks.forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.vx * 3, s.y + s.vy * 3);
      ctx.stroke();
    });
  }

  /**
   * Triggers realistic fireball burst from tailpipe
   */
  triggerFlameBurst(power = 1.0) {
    const pipeX = this.mechCanvas.getBoundingClientRect().width - 60;
    const pipeY = this.mechCanvas.getBoundingClientRect().height - 50;
    const particleCount = Math.floor(18 * power);

    for (let i = 0; i < particleCount; i++) {
      const speed = (120 + Math.random() * 220) * power;
      const angle = (Math.random() - 0.5) * 0.8 + 0; // shoot to the right
      this.flameParticles.push({
        x: pipeX + 8,
        y: pipeY + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: (8 + Math.random() * 14) * power,
        life: 0.25 + Math.random() * 0.15,
        maxLife: 0.25 + Math.random() * 0.15,
        color: Math.random() < 0.4 ? '#38bdf8' : (Math.random() < 0.7 ? '#ff5500' : '#ffea00'),
        glow: '#ff3700'
      });
    }

    for (let j = 0; j < 8; j++) {
      this.sparks.push({
        x: pipeX + 6,
        y: pipeY,
        vx: (140 + Math.random() * 180),
        vy: (Math.random() - 0.5) * 140,
        life: 0.35 + Math.random() * 0.2
      });
    }
  }

  /**
   * Triggers dual cryogenic vapor plume purge from hood/cowl
   */
  triggerNosPurgeVisual(color = '#00f0ff') {
    if (!this.mechCanvas) return;
    const w = this.mechCanvas.getBoundingClientRect().width;
    const purgeX1 = w / 2 - 36;
    const purgeX2 = w / 2 + 36;
    const purgeY = 48;

    [purgeX1, purgeX2].forEach((px, idx) => {
      for (let i = 0; i < 30; i++) {
        const speed = 190 + Math.random() * 280;
        const angle = -Math.PI / 2 + (idx === 0 ? -0.32 : 0.32) + (Math.random() - 0.5) * 0.36;
        this.flameParticles.push({
          x: px,
          y: purgeY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 7 + Math.random() * 14,
          life: 0.32 + Math.random() * 0.2,
          maxLife: 0.35,
          color: color,
          glow: color
        });
      }
    });
  }

  _updateFlameParticles(dt) {
    for (let i = this.flameParticles.length - 1; i >= 0; i--) {
      const p = this.flameParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.radius *= 0.94;
      p.life -= dt;
      if (p.life <= 0 || p.radius < 1) {
        this.flameParticles.splice(i, 1);
      }
    }

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
      }
    }
  }

  /**
   * LIVE DYNO GRAPH (HP & TORQUE CURVES)
   */
  _drawDynoGraph(physics) {
    if (!this.dynoCtx || !physics.dynoPoints || physics.dynoPoints.length === 0) return;
    const ctx = this.dynoCtx;
    const w = this.dynoCanvas.getBoundingClientRect().width;
    const h = this.dynoCanvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 45;
    const padRight = 35;
    const padTop = 30;
    const padBottom = 35;
    const graphW = w - padLeft - padRight;
    const graphH = h - padTop - padBottom;

    const points = physics.dynoPoints;
    const maxHp = Math.max(100, physics.peakHp * 1.15);
    const maxTq = Math.max(100, physics.peakTorque * 1.15);
    const maxVal = Math.max(maxHp, maxTq);

    const minRpm = points[0].rpm;
    const maxRpm = points[points.length - 1].rpm;
    const rpmRange = maxRpm - minRpm;

    // Background box
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(padLeft, padTop, graphW, graphH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(padLeft, padTop, graphW, graphH);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let r = minRpm; r <= maxRpm; r += 1000) {
      const x = padLeft + ((r - minRpm) / rpmRange) * graphW;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + graphH);
      ctx.stroke();

      ctx.font = '9px "Consolas", monospace';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'center';
      ctx.fillText(`${(r / 1000).toFixed(0)}k`, x, padTop + graphH + 14);
    }

    // 1. Draw Torque Curve (Cyan)
    ctx.save();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    points.forEach((pt, idx) => {
      const x = padLeft + ((pt.rpm - minRpm) / rpmRange) * graphW;
      const y = padTop + graphH - (pt.torque / maxVal) * graphH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // 2. Draw Horsepower Curve (Crimson Red / Orange)
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    points.forEach((pt, idx) => {
      const x = padLeft + ((pt.rpm - minRpm) / rpmRange) * graphW;
      const y = padTop + graphH - (pt.hp / maxVal) * graphH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // 3. Real-time Operating Point Cursor
    const currentNormRpm = (physics.rpm - minRpm) / rpmRange;
    if (currentNormRpm >= 0 && currentNormRpm <= 1.0) {
      const curX = padLeft + currentNormRpm * graphW;

      // Vertical line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(curX, padTop);
      ctx.lineTo(curX, padTop + graphH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point dots for HP and Torque
      const curHpY = padTop + graphH - (physics.currentHp / maxVal) * graphH;
      const curTqY = padTop + graphH - (physics.currentTorque / maxVal) * graphH;

      ctx.beginPath();
      ctx.arc(curX, Math.max(padTop, Math.min(padTop + graphH, curHpY)), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(curX, Math.max(padTop, Math.min(padTop + graphH, curTqY)), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
    }

    // Legend & Peaks header
    ctx.font = 'bold 11px "Rajdhani", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`POTÊNCIA MÁX: ${physics.peakHp} HP @ ${physics.peakHpRpm} RPM`, padLeft, padTop - 12);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#06b6d4';
    ctx.fillText(`TORQUE MÁX: ${physics.peakTorque} Nm @ ${physics.peakTorqueRpm} RPM`, padLeft + graphW, padTop - 12);
  }
}

// Global instance
window.engineVisualizer = new EngineVisualizer();
