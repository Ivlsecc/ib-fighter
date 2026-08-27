/**
 * Procedural WebAudio SFX — no audio files, so nothing to self-host/ship for the offline
 * stand build. Lazily creates an AudioContext on first user gesture (autoplay policy).
 */
(function () {
  "use strict";

  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function envGain(ac, t0, attack, decay, peak) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay);
    return g;
  }

  function tone(freq, { type = "square", duration = 0.12, peak = 0.15, glideTo = null, delay = 0 } = {}) {
    const ac = getCtx();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
    const g = envGain(ac, t0, 0.005, duration, peak);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noiseBurst({ duration = 0.15, peak = 0.2, filterFreq = 1200, delay = 0 } = {}) {
    const ac = getCtx();
    const t0 = ac.currentTime + delay;
    const bufferSize = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const g = envGain(ac, t0, 0.002, duration, peak);
    src.connect(filter).connect(g).connect(ac.destination);
    src.start(t0);
  }

  const SFX = {
    select() {
      tone(520, { type: "square", duration: 0.05, peak: 0.08 });
    },
    throwItem() {
      tone(300, { type: "sawtooth", duration: 0.1, peak: 0.1, glideTo: 700 });
    },
    hardCounter() {
      tone(220, { type: "square", duration: 0.09, peak: 0.16 });
      tone(440, { type: "square", duration: 0.14, peak: 0.14, delay: 0.06 });
      noiseBurst({ duration: 0.08, peak: 0.12, filterFreq: 2000, delay: 0.02 });
    },
    hitBoss() {
      noiseBurst({ duration: 0.12, peak: 0.18, filterFreq: 1800 });
      tone(180, { type: "square", duration: 0.1, peak: 0.12 });
    },
    hitPlayer() {
      noiseBurst({ duration: 0.18, peak: 0.22, filterFreq: 500 });
      tone(90, { type: "sawtooth", duration: 0.18, peak: 0.14 });
    },
    timeoutPenalty() {
      tone(140, { type: "sawtooth", duration: 0.3, peak: 0.15, glideTo: 60 });
    },
    windup() {
      tone(200, { type: "sine", duration: 0.5, peak: 0.06, glideTo: 400 });
    },
    victory() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: "square", duration: 0.18, peak: 0.13, delay: i * 0.11 }));
    },
    defeat() {
      [400, 320, 260, 180].forEach((f, i) => tone(f, { type: "sawtooth", duration: 0.25, peak: 0.14, delay: i * 0.13 }));
    },
    forceMajeure() {
      for (let i = 0; i < 6; i++) {
        tone(600 + Math.random() * 800, { type: "square", duration: 0.04, peak: 0.1, delay: i * 0.05 });
      }
      noiseBurst({ duration: 0.4, peak: 0.15, filterFreq: 3000, delay: 0.05 });
    },
    menuBoop() {
      tone(660, { type: "triangle", duration: 0.07, peak: 0.09 });
    },
  };

  window.IBFighterAudio = SFX;
})();
