/**
 * APEX DYNO LAB - MOBILE CONTROLLER
 * Full touch interactions, haptic feedback, tab overlays, NOS lab and telemetry
 */
class ApexMobileApp {
    constructor() {
        this.audio = window.engineAudio;
        this.physics = window.enginePhysics;
        this.gauges = new MobileGauges();

        this.isStarted = false;
        this.hapticsEnabled = true;
        this.speedUnit = 'kmh'; // 'kmh' or 'mph'

        // Touch states
        this.gasPressed = false;
        this.brakePressed = false;
        this.clutchPressed = false;
        this.nosPressed = false;
        this.twoStepPressed = false;

        this.activeTab = 'cockpit';
    }

    init() {
        this._bindStartOverlay();
        this._initTabs();
        this._populateSelectors();
        this._bindPedalsAndSliders();
        this._bindGearsAndActions();
        this._bindGarageControls();
        this._bindNosLabControls();
        this._bindSettings();

        // Audio and physics hooks
        this._setupPhysicsCallbacks();

        // Animation frame loop
        requestAnimationFrame(() => this._loop());
    }

    _vibrate(pattern) {
        if (!this.hapticsEnabled || !navigator.vibrate) return;
        try {
            navigator.vibrate(pattern);
        } catch (e) {
            // Ignored if browser restricts without user activation
        }
    }

    _bindStartOverlay() {
        const startBtn = document.getElementById('startAppBtn');
        const overlay = document.getElementById('startOverlay');

        const launch = async () => {
            if (this.isStarted) return;
            this.isStarted = true;

            // Audio Context resume on first touch/click
            if (this.audio) {
                await this.audio.init();
                this.audio.startEngine();
            }

            if (this.gauges) {
                this.gauges.init('tachCanvas', 'speedCanvas');
                const curEngine = this.physics ? this.physics.currentEngine : null;
                if (curEngine) this.gauges.setEngine(curEngine);
            }

            this._vibrate([50, 40, 70]);

            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.pointerEvents = 'none';
                setTimeout(() => overlay.remove(), 400);
            }

            this._updateEngineInfoDisplay();
        };

        if (startBtn) {
            startBtn.addEventListener('click', launch);
            startBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                launch();
            }, { passive: false });
        }
    }

    _initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const panels = {
            cockpit: null,
            garage: document.getElementById('panel-garage'),
            nos: document.getElementById('panel-nos'),
            settings: document.getElementById('panel-settings')
        };

        tabBtns.forEach(btn => {
            const handleTab = (e) => {
                e.preventDefault();
                const target = btn.dataset.tab;
                if (!target) return;

                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeTab = target;

                this._vibrate(15);

                // Close all panel overlays
                Object.keys(panels).forEach(key => {
                    if (panels[key]) panels[key].classList.remove('active');
                });

                // If not cockpit, open selected panel
                if (target !== 'cockpit' && panels[target]) {
                    panels[target].classList.add('active');
                }
            };

            btn.addEventListener('click', handleTab);
            btn.addEventListener('touchstart', handleTab, { passive: false });
        });

        // Close buttons inside panel headers
        document.querySelectorAll('.panel-close-btn').forEach(closeBtn => {
            const close = (e) => {
                e.preventDefault();
                const panel = closeBtn.closest('.panel-overlay');
                if (panel) panel.classList.remove('active');
                tabBtns.forEach(b => {
                    if (b.dataset.tab === 'cockpit') b.classList.add('active');
                    else b.classList.remove('active');
                });
                this.activeTab = 'cockpit';
                this._vibrate(15);
            };
            closeBtn.addEventListener('click', close);
            closeBtn.addEventListener('touchstart', close, { passive: false });
        });
    }

    _populateSelectors() {
        // Engines
        const engineSelect = document.getElementById('engineSelect');
        if (engineSelect && window.ENGINE_DATABASE) {
            engineSelect.innerHTML = '';
            window.ENGINE_DATABASE.forEach(eng => {
                const opt = document.createElement('option');
                opt.value = eng.id;
                opt.textContent = `${eng.name} (${eng.layout} - ${eng.displacement}L)`;
                engineSelect.appendChild(opt);
            });
        }

        // Induction
        const indSelect = document.getElementById('inductionSelect');
        if (indSelect && window.INDUCTION_SYSTEMS) {
            indSelect.innerHTML = '';
            window.INDUCTION_SYSTEMS.forEach(ind => {
                const opt = document.createElement('option');
                opt.value = ind.id;
                opt.textContent = `${ind.name} (Boost: ${ind.maxBoost} bar)`;
                indSelect.appendChild(opt);
            });
        }

        // Cams
        const camSelect = document.getElementById('camSelect');
        if (camSelect && window.CAMSHAFT_PROFILES) {
            camSelect.innerHTML = '';
            window.CAMSHAFT_PROFILES.forEach(cam => {
                const opt = document.createElement('option');
                opt.value = cam.id;
                opt.textContent = `${cam.name} (${cam.idleRpm} RPM Idle)`;
                camSelect.appendChild(opt);
            });
        }

        // Exhaust
        const exhSelect = document.getElementById('exhaustSelect');
        if (exhSelect && window.EXHAUST_CONFIGS) {
            exhSelect.innerHTML = '';
            window.EXHAUST_CONFIGS.forEach(exh => {
                const opt = document.createElement('option');
                opt.value = exh.id;
                opt.textContent = `${exh.name}`;
                exhSelect.appendChild(opt);
            });
        }
    }

    _bindPedalsAndSliders() {
        const gasPedal = document.getElementById('pedalGas');
        const brakePedal = document.getElementById('pedalBrake');
        const clutchPedal = document.getElementById('pedalClutch');
        const throttleSlider = document.getElementById('throttleSlider');
        const throttlePct = document.getElementById('throttlePct');

        // Gas Pedal (Touch & Hold)
        if (gasPedal) {
            const startGas = (e) => {
                e.preventDefault();
                this.gasPressed = true;
                gasPedal.classList.add('pressed');
                this._vibrate(25);
                if (throttleSlider) throttleSlider.value = 100;
                if (throttlePct) throttlePct.textContent = '100%';
                if (this.physics) this.physics.setThrottle(1.0);
            };
            const endGas = (e) => {
                e.preventDefault();
                this.gasPressed = false;
                gasPedal.classList.remove('pressed');
                if (throttleSlider) throttleSlider.value = 0;
                if (throttlePct) throttlePct.textContent = '0%';
                if (this.physics) this.physics.setThrottle(0);
            };

            gasPedal.addEventListener('touchstart', startGas, { passive: false });
            gasPedal.addEventListener('touchend', endGas, { passive: false });
            gasPedal.addEventListener('mousedown', startGas);
            gasPedal.addEventListener('mouseup', endGas);
            gasPedal.addEventListener('mouseleave', endGas);
        }

        // Brake Pedal
        if (brakePedal) {
            const startBrake = (e) => {
                e.preventDefault();
                this.brakePressed = true;
                brakePedal.classList.add('pressed');
                this._vibrate(20);
                if (this.physics) this.physics.setBrake(1.0);
            };
            const endBrake = (e) => {
                e.preventDefault();
                this.brakePressed = false;
                brakePedal.classList.remove('pressed');
                if (this.physics) this.physics.setBrake(0);
            };
            brakePedal.addEventListener('touchstart', startBrake, { passive: false });
            brakePedal.addEventListener('touchend', endBrake, { passive: false });
            brakePedal.addEventListener('mousedown', startBrake);
            brakePedal.addEventListener('mouseup', endBrake);
            brakePedal.addEventListener('mouseleave', endBrake);
        }

        // Clutch Pedal
        if (clutchPedal) {
            const startClutch = (e) => {
                e.preventDefault();
                this.clutchPressed = true;
                clutchPedal.classList.add('pressed');
                this._vibrate(20);
                if (this.physics) this.physics.setClutch(1.0);
            };
            const endClutch = (e) => {
                e.preventDefault();
                this.clutchPressed = false;
                clutchPedal.classList.remove('pressed');
                if (this.physics) this.physics.setClutch(0);
            };
            clutchPedal.addEventListener('touchstart', startClutch, { passive: false });
            clutchPedal.addEventListener('touchend', endClutch, { passive: false });
            clutchPedal.addEventListener('mousedown', startClutch);
            clutchPedal.addEventListener('mouseup', endClutch);
            clutchPedal.addEventListener('mouseleave', endClutch);
        }

        // Precision Throttle Slider
        if (throttleSlider) {
            throttleSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value) / 100;
                if (throttlePct) throttlePct.textContent = `${Math.round(val * 100)}%`;
                if (this.physics) this.physics.setThrottle(val);
            });
        }
    }

    _bindGearsAndActions() {
        const shiftUpBtn = document.getElementById('shiftUpBtn');
        const shiftDownBtn = document.getElementById('shiftDownBtn');
        const neutralBtn = document.getElementById('shiftNeutralBtn');

        if (shiftUpBtn) {
            const handleUp = (e) => {
                e.preventDefault();
                if (this.physics) {
                    this.physics.shiftUp();
                    this._vibrate([20, 10, 20]);
                }
            };
            shiftUpBtn.addEventListener('click', handleUp);
            shiftUpBtn.addEventListener('touchstart', handleUp, { passive: false });
        }

        if (shiftDownBtn) {
            const handleDown = (e) => {
                e.preventDefault();
                if (this.physics) {
                    this.physics.shiftDown();
                    this._vibrate([25, 15]);
                }
            };
            shiftDownBtn.addEventListener('click', handleDown);
            shiftDownBtn.addEventListener('touchstart', handleDown, { passive: false });
        }

        if (neutralBtn) {
            const handleNeutral = (e) => {
                e.preventDefault();
                if (this.physics) {
                    this.physics.setGear(0);
                    this._vibrate(15);
                }
            };
            neutralBtn.addEventListener('click', handleNeutral);
            neutralBtn.addEventListener('touchstart', handleNeutral, { passive: false });
        }

        // Quick Action Buttons (NOS, 2-Step, Ignition)
        const nosBtn = document.getElementById('btnActionNos');
        if (nosBtn) {
            const startNos = (e) => {
                e.preventDefault();
                this.nosPressed = true;
                nosBtn.classList.add('active');
                this._vibrate(40);
                if (this.physics) this.physics.triggerNos(true);
            };
            const endNos = (e) => {
                e.preventDefault();
                this.nosPressed = false;
                nosBtn.classList.remove('active');
                if (this.physics) this.physics.triggerNos(false);
            };
            nosBtn.addEventListener('touchstart', startNos, { passive: false });
            nosBtn.addEventListener('touchend', endNos, { passive: false });
            nosBtn.addEventListener('mousedown', startNos);
            nosBtn.addEventListener('mouseup', endNos);
        }

        const twoStepBtn = document.getElementById('btnAction2Step');
        if (twoStepBtn) {
            const start2Step = (e) => {
                e.preventDefault();
                twoStepBtn.classList.add('active');
                this._vibrate([30, 20, 30]);
                if (this.physics) this.physics.setTwoStep(true);
            };
            const end2Step = (e) => {
                e.preventDefault();
                twoStepBtn.classList.remove('active');
                if (this.physics) this.physics.setTwoStep(false);
            };
            twoStepBtn.addEventListener('touchstart', start2Step, { passive: false });
            twoStepBtn.addEventListener('touchend', end2Step, { passive: false });
            twoStepBtn.addEventListener('mousedown', start2Step);
            twoStepBtn.addEventListener('mouseup', end2Step);
        }

        const ignBtn = document.getElementById('btnTopIgnition');
        if (ignBtn) {
            ignBtn.addEventListener('click', () => {
                if (!this.audio) return;
                if (this.audio.isRunning) {
                    this.audio.stopEngine();
                    ignBtn.classList.remove('running');
                    this._vibrate(60);
                } else {
                    this.audio.startEngine();
                    ignBtn.classList.add('running');
                    this._vibrate([40, 30, 80]);
                }
            });
        }
    }

    _bindGarageControls() {
        const engSelect = document.getElementById('engineSelect');
        const indSelect = document.getElementById('inductionSelect');
        const camSelect = document.getElementById('camSelect');
        const exhSelect = document.getElementById('exhaustSelect');
        const wgSlider = document.getElementById('wastegateSlider');
        const wgVal = document.getElementById('wastegateVal');

        if (engSelect) {
            engSelect.addEventListener('change', (e) => {
                const id = e.target.value;
                if (this.physics && window.ENGINE_DATABASE) {
                    const eng = window.ENGINE_DATABASE.find(x => x.id === id);
                    if (eng) {
                        this.physics.setEngine(eng);
                        if (this.audio) this.audio.setEngine(eng);
                        if (this.gauges) this.gauges.setEngine(eng);
                        this._updateEngineInfoDisplay();
                        this._vibrate(30);
                    }
                }
            });
        }

        if (indSelect) {
            indSelect.addEventListener('change', (e) => {
                const id = e.target.value;
                if (this.physics && window.INDUCTION_SYSTEMS) {
                    const ind = window.INDUCTION_SYSTEMS.find(x => x.id === id);
                    if (ind) {
                        this.physics.setInduction(ind);
                        if (this.audio) this.audio.setInduction(ind);
                        this._vibrate(25);
                    }
                }
            });
        }

        if (camSelect) {
            camSelect.addEventListener('change', (e) => {
                const id = e.target.value;
                if (this.physics && window.CAMSHAFT_PROFILES) {
                    const cam = window.CAMSHAFT_PROFILES.find(x => x.id === id);
                    if (cam) {
                        this.physics.setCamshaft(cam);
                        this._vibrate(20);
                    }
                }
            });
        }

        if (exhSelect) {
            exhSelect.addEventListener('change', (e) => {
                const id = e.target.value;
                if (this.physics && window.EXHAUST_CONFIGS) {
                    const exh = window.EXHAUST_CONFIGS.find(x => x.id === id);
                    if (exh) {
                        this.physics.setExhaust(exh);
                        this._vibrate(20);
                    }
                }
            });
        }

        if (wgSlider) {
            wgSlider.addEventListener('input', (e) => {
                const bar = parseFloat(e.target.value);
                if (wgVal) wgVal.textContent = `${bar.toFixed(1)} BAR`;
                if (this.physics) this.physics.setTargetBoost(bar);
            });
        }
    }

    _bindNosLabControls() {
        const infiniteToggle = document.getElementById('nosInfiniteToggle');
        const shotSlider = document.getElementById('nosShotSlider');
        const shotVal = document.getElementById('nosShotVal');
        const purgeBtn = document.getElementById('nosPurgeBtn');
        const refillBtn = document.getElementById('nosRefillBtn');
        const presetBtns = document.querySelectorAll('.nos-preset-btn');

        if (infiniteToggle) {
            infiniteToggle.addEventListener('change', (e) => {
                const isInf = e.target.checked;
                if (this.physics) this.physics.nosInfinite = isInf;
                const statusBadge = document.getElementById('nosStatusBadge');
                if (statusBadge) {
                    statusBadge.textContent = isInf ? 'INFINITO' : 'NORMAL';
                    statusBadge.className = isInf ? 'nos-badge infinite' : 'nos-badge normal';
                }
                this._vibrate(25);
            });
        }

        const setNosShot = (hp) => {
            if (this.physics) this.physics.nosShotHp = hp;
            if (shotSlider) shotSlider.value = hp;
            if (shotVal) shotVal.textContent = `+${hp} HP`;
            const headerHp = document.getElementById('nosHeaderHp');
            if (headerHp) headerHp.textContent = `+${hp} HP`;

            presetBtns.forEach(btn => {
                if (parseInt(btn.dataset.hp, 10) === hp) btn.classList.add('active');
                else btn.classList.remove('active');
            });
            this._vibrate(15);
        };

        if (shotSlider) {
            shotSlider.addEventListener('input', (e) => {
                setNosShot(parseInt(e.target.value, 10));
            });
        }

        presetBtns.forEach(btn => {
            const applyPreset = (e) => {
                e.preventDefault();
                const hp = parseInt(btn.dataset.hp, 10);
                if (hp) setNosShot(hp);
            };
            btn.addEventListener('click', applyPreset);
            btn.addEventListener('touchstart', applyPreset, { passive: false });
        });

        if (purgeBtn) {
            const purge = (e) => {
                e.preventDefault();
                if (this.physics) this.physics.purgeNos();
                if (this.audio) this.audio.playPurgeSound();
                this._vibrate([30, 20, 50]);
            };
            purgeBtn.addEventListener('click', purge);
            purgeBtn.addEventListener('touchstart', purge, { passive: false });
        }

        if (refillBtn) {
            const refill = (e) => {
                e.preventDefault();
                if (this.physics) this.physics.refillNos();
                this._vibrate(40);
            };
            refillBtn.addEventListener('click', refill);
            refillBtn.addEventListener('touchstart', refill, { passive: false });
        }
    }

    _bindSettings() {
        const hapticsToggle = document.getElementById('settingHaptics');
        const unitToggle = document.getElementById('settingUnit');
        const volSlider = document.getElementById('settingVolume');

        if (hapticsToggle) {
            hapticsToggle.addEventListener('change', (e) => {
                this.hapticsEnabled = e.target.checked;
                if (this.hapticsEnabled) this._vibrate(30);
            });
        }

        if (unitToggle) {
            unitToggle.addEventListener('change', (e) => {
                this.speedUnit = e.target.value;
                if (this.gauges) this.gauges.isMetric = (this.speedUnit === 'kmh');
            });
        }

        if (volSlider) {
            volSlider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value) / 100;
                if (this.audio && this.audio.masterGain) {
                    this.audio.masterGain.gain.setValueAtTime(vol, this.audio.ctx.currentTime);
                }
            });
        }
    }

    _setupPhysicsCallbacks() {
        if (!this.physics) return;

        // Limiter bounce haptic
        this.physics.onRevLimiter = () => {
            this._vibrate([40, 10]);
        };

        // Backfire / bang haptic
        this.physics.onBackfire = (intensity) => {
            const dur = Math.round(30 + intensity * 40);
            this._vibrate([dur, 15, dur]);
        };

        // Gear shift sound/haptic
        this.physics.onShift = () => {
            this._vibrate([25, 10, 20]);
        };
    }

    _updateEngineInfoDisplay() {
        if (!this.physics || !this.physics.currentEngine) return;
        const eng = this.physics.currentEngine;

        const nameEl = document.getElementById('infoEngineName');
        const specEl = document.getElementById('infoEngineSpec');
        const redlineEl = document.getElementById('infoEngineRedline');

        if (nameEl) nameEl.textContent = eng.name;
        if (specEl) specEl.textContent = `${eng.layout} · ${eng.displacement}L · ${eng.baseHp} CV`;
        if (redlineEl) redlineEl.textContent = `${eng.redline} RPM`;
    }

    _updateShiftLEDs(rpmNorm, isRedline) {
        const leds = document.querySelectorAll('.shift-led');
        if (!leds.length) return;

        const totalLeds = leds.length;
        const activeCount = Math.floor(rpmNorm * totalLeds);

        leds.forEach((led, i) => {
            if (isRedline) {
                led.className = 'shift-led red flash';
            } else if (i < activeCount) {
                if (i < 5) led.className = 'shift-led green active';
                else if (i < 9) led.className = 'shift-led yellow active';
                else led.className = 'shift-led red active';
            } else {
                led.className = 'shift-led';
            }
        });
    }

    _updateTelemetry(rpm, speed, hp, tq, boost, gear) {
        const teleHp = document.getElementById('teleHp');
        const teleTq = document.getElementById('teleTq');
        const teleBoost = document.getElementById('teleBoost');
        const teleSpeed = document.getElementById('teleSpeed');
        const teleGear = document.getElementById('teleGear');
        const gearBadge = document.getElementById('currentGearBadge');

        if (teleHp) teleHp.textContent = Math.round(hp);
        if (teleTq) teleTq.textContent = Math.round(tq);
        if (teleBoost) teleBoost.textContent = boost.toFixed(2);
        if (teleSpeed) teleSpeed.textContent = Math.round(speed);

        const gearStr = gear === 0 ? 'N' : gear === -1 ? 'R' : `${gear}`;
        if (teleGear) teleGear.textContent = gearStr;
        if (gearBadge) gearBadge.textContent = gearStr;

        // NOS Bottle display in NOS Panel
        if (this.physics) {
            const nosLevel = this.physics.nosLevel || 0;
            const bar = document.getElementById('nosBottleBar');
            const pct = document.getElementById('nosBottlePct');
            if (bar) bar.style.width = `${Math.round(nosLevel * 100)}%`;
            if (pct) pct.textContent = `${Math.round(nosLevel * 100)}%`;
        }
    }

    _loop() {
        if (this.isStarted && this.physics) {
            // Update physics step (dt ~ 1/60)
            this.physics.update(1 / 60);

            const rpm = this.physics.rpm;
            const speed = this.physics.speedKmh;
            const boost = this.physics.boostBar;
            const hp = this.physics.hp;
            const tq = this.physics.torqueNm;
            const gear = this.physics.currentGear;
            const redline = this.physics.currentEngine.redline;

            // Audio update
            if (this.audio) {
                this.audio.update(rpm, this.physics.throttle, boost, this.physics.load);
            }

            // Gauges update
            if (this.gauges) {
                this.gauges.update(rpm, speed, boost, redline);
            }

            // Shift LEDs
            const rpmNorm = Math.min(Math.max((rpm - 2000) / (redline - 2000), 0), 1);
            const isRedline = rpm >= redline;
            this._updateShiftLEDs(rpmNorm, isRedline);

            // Telemetry badges
            this._updateTelemetry(rpm, speed, hp, tq, boost, gear);
        }

        requestAnimationFrame(() => this._loop());
    }
}

// Auto-instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.apexMobileApp = new ApexMobileApp();
    window.apexMobileApp.init();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('[PWA] Service Worker registrado com sucesso:', reg.scope);
        }).catch(err => {
            console.log('[PWA] Falha ao registrar Service Worker:', err);
        });
    }
});
