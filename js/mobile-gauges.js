/**
 * APEX DYNO LAB - MOBILE GAUGES CONTROLLER
 * Canvas gauges ultra-otimizados para telas touch e alta densidade de pixels (Retina/AMOLED)
 */
class MobileGauges {
    constructor() {
        this.tachCanvas = null;
        this.speedCanvas = null;
        this.tachCtx = null;
        this.speedCtx = null;

        // Current display values (interpolated smoothly)
        this.currentRpm = 0;
        this.targetRpm = 0;
        this.currentSpeed = 0;
        this.targetSpeed = 0;
        this.currentBoost = 0;
        this.targetBoost = 0;

        this.redlineRpm = 7500;
        this.maxRpm = 9000;
        this.maxSpeed = 340;

        this.isMetric = true;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap DPR for performance
    }

    init(tachId, speedId) {
        this.tachCanvas = document.getElementById(tachId);
        this.speedCanvas = document.getElementById(speedId);

        if (this.tachCanvas) {
            this.tachCtx = this.tachCanvas.getContext('2d');
            this._setupHiDPI(this.tachCanvas, this.tachCtx);
        }
        if (this.speedCanvas) {
            this.speedCtx = this.speedCanvas.getContext('2d');
            this._setupHiDPI(this.speedCanvas, this.speedCtx);
        }

        window.addEventListener('resize', () => {
            if (this.tachCanvas) this._setupHiDPI(this.tachCanvas, this.tachCtx);
            if (this.speedCanvas) this._setupHiDPI(this.speedCanvas, this.speedCtx);
        });
    }

    _setupHiDPI(canvas, ctx) {
        const rect = canvas.getBoundingClientRect();
        const size = Math.min(rect.width || 140, 160);
        canvas.width = size * this.dpr;
        canvas.height = size * this.dpr;
        ctx.resetTransform?.();
        ctx.scale(this.dpr, this.dpr);
    }

    setEngine(engine) {
        if (!engine) return;
        this.redlineRpm = engine.redline || 7500;
        this.maxRpm = Math.ceil((this.redlineRpm * 1.15) / 1000) * 1000;
    }

    update(rpm, speedKmh, boostBar, redlineRpm) {
        this.targetRpm = rpm || 0;
        this.targetSpeed = speedKmh || 0;
        this.targetBoost = boostBar || 0;
        if (redlineRpm) this.redlineRpm = redlineRpm;

        // Smooth visual dampening (crisp 60fps response)
        this.currentRpm += (this.targetRpm - this.currentRpm) * 0.35;
        this.currentSpeed += (this.targetSpeed - this.currentSpeed) * 0.30;
        this.currentBoost += (this.targetBoost - this.currentBoost) * 0.25;

        this._renderTachometer();
        this._renderSpeedometer();
    }

    _renderTachometer() {
        if (!this.tachCtx || !this.tachCanvas) return;
        const ctx = this.tachCtx;
        const rect = this.tachCanvas.getBoundingClientRect();
        const size = (this.tachCanvas.width / this.dpr);
        const cx = size / 2;
        const cy = size / 2;
        const radius = size * 0.42;

        ctx.clearRect(0, 0, size, size);

        // Background Track
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 2.25;
        const totalAngle = endAngle - startAngle;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = size * 0.08;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Redline Arc
        const redlinePct = (this.redlineRpm) / this.maxRpm;
        const redlineStartAngle = startAngle + (totalAngle * Math.min(redlinePct, 1.0));
        ctx.beginPath();
        ctx.arc(cx, cy, radius, redlineStartAngle, endAngle);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.lineWidth = size * 0.08;
        ctx.stroke();

        // Active RPM Arc
        const rpmNorm = Math.min(Math.max(this.currentRpm / this.maxRpm, 0), 1);
        const activeAngle = startAngle + (totalAngle * rpmNorm);

        // Dynamic Glow & Color (changes to intense red near redline)
        const isRedline = this.currentRpm >= this.redlineRpm;
        const grad = ctx.createLinearGradient(0, size, size, 0);
        if (isRedline) {
            grad.addColorStop(0, '#ef4444');
            grad.addColorStop(1, '#ff003c');
        } else {
            grad.addColorStop(0, '#00e5ff');
            grad.addColorStop(0.7, '#3b82f6');
            grad.addColorStop(1, '#ec4899');
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, activeAngle);
        ctx.strokeStyle = grad;
        ctx.lineWidth = size * 0.085;
        ctx.lineCap = 'round';
        ctx.shadowColor = isRedline ? 'rgba(239, 68, 68, 0.8)' : 'rgba(0, 229, 255, 0.6)';
        ctx.shadowBlur = isRedline ? 14 : 8;
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

        // Center Digital Display
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = isRedline ? '#ff4d4d' : '#f8fafc';
        ctx.font = `900 ${Math.round(size * 0.22)}px 'Share Tech Mono', monospace`;
        ctx.fillText(Math.round(this.currentRpm), cx, cy - 2);

        ctx.fillStyle = '#64748b';
        ctx.font = `700 ${Math.round(size * 0.085)}px 'Outfit', sans-serif`;
        ctx.fillText('RPM x1000', cx, cy + size * 0.18);
    }

    _renderSpeedometer() {
        if (!this.speedCtx || !this.speedCanvas) return;
        const ctx = this.speedCtx;
        const size = (this.speedCanvas.width / this.dpr);
        const cx = size / 2;
        const cy = size / 2;
        const radius = size * 0.42;

        ctx.clearRect(0, 0, size, size);

        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 2.25;
        const totalAngle = endAngle - startAngle;

        // Background Track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = size * 0.08;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Speed Arc
        const speedNorm = Math.min(Math.max(this.currentSpeed / this.maxSpeed, 0), 1);
        const activeAngle = startAngle + (totalAngle * speedNorm);

        const grad = ctx.createLinearGradient(0, size, size, 0);
        grad.addColorStop(0, '#00e5ff');
        grad.addColorStop(1, '#10b981');

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, activeAngle);
        ctx.strokeStyle = grad;
        ctx.lineWidth = size * 0.085;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0, 229, 255, 0.5)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Center Digital Display
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const displaySpeed = this.isMetric ? this.currentSpeed : (this.currentSpeed * 0.621371);
        ctx.fillStyle = '#f8fafc';
        ctx.font = `900 ${Math.round(size * 0.22)}px 'Share Tech Mono', monospace`;
        ctx.fillText(Math.round(displaySpeed), cx, cy - 2);

        ctx.fillStyle = '#64748b';
        ctx.font = `700 ${Math.round(size * 0.085)}px 'Outfit', sans-serif`;
        ctx.fillText(this.isMetric ? 'KM/H' : 'MPH', cx, cy + size * 0.18);
    }
}

window.MobileGauges = MobileGauges;
