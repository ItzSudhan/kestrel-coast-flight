// All sound made in code with WebAudio, no files: the engine's beat rising with rpm (two
// detuned saws through a growling filter), prop wash and wind with airspeed, the stall buzzer,
// a chime for each ring, tyre chirps, clunks for gear and flaps, rain hiss and the crash.

export function createEngineAudio() {
  let ctx = null;
  let nodes = null;
  let muted = false;

  function noiseBuffer(context) {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 6 + (Math.random() * 2 - 1) * 0.15;
    }
    return buffer;
  }

  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.4);
    }
    shaper.curve = curve;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    const oscGainB = ctx.createGain();
    oscGainB.gain.value = 0.35;
    oscA.connect(shaper);
    oscB.connect(oscGainB).connect(shaper);
    shaper.connect(filter).connect(engineGain).connect(master);
    oscA.start();
    oscB.start();
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter).connect(windGain).connect(master);
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2500;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    noise.connect(rainFilter).connect(rainGain).connect(master);
    noise.start();
    const buzz = ctx.createOscillator();
    buzz.type = 'square';
    buzz.frequency.value = 430;
    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0;
    buzz.connect(buzzGain).connect(master);
    buzz.start();
    nodes = { master, engineGain, filter, oscA, oscB, windFilter, windGain, rainGain, buzzGain, noiseBuffer: noise.buffer };
  }

  function blip(frequency, duration, type = 'sine', volume = 0.25, slide = 1) {
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(frequency * slide, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(nodes.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function burst(duration, volume, frequency) {
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nodes.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(nodes.master);
    src.start(t, Math.random());
    src.stop(t + duration);
  }

  return {
    start,
    toggleMute() {
      muted = !muted;
      if (nodes) nodes.master.gain.value = muted ? 0 : 0.5;
    },
    /** Follow the aircraft: rpm, airspeed (m/s), stall warning, rain amount, engine running. */
    update(aircraft, rain, flying) {
      if (!ctx || !nodes) return;
      const t = ctx.currentTime;
      const beat = (aircraft.rpm / 60) * 2;
      const on = flying && !aircraft.crashed;
      nodes.oscA.frequency.setTargetAtTime(Math.max(18, beat), t, 0.08);
      nodes.oscB.frequency.setTargetAtTime(Math.max(18, beat * 0.5 + 1.5), t, 0.08);
      nodes.filter.frequency.setTargetAtTime(220 + aircraft.rpm * 0.35 * (0.6 + 0.4 * aircraft.damage.engine), t, 0.1);
      nodes.engineGain.gain.setTargetAtTime(on && aircraft.engineRunning ? 0.16 + aircraft.throttle * 0.16 : 0, t, 0.15);
      const speed = aircraft.ias;
      nodes.windFilter.frequency.setTargetAtTime(300 + speed * 18, t, 0.2);
      nodes.windGain.gain.setTargetAtTime(on ? Math.min(0.5, (speed / 60) ** 2 * 0.35) : 0, t, 0.2);
      nodes.rainGain.gain.setTargetAtTime(rain * 0.18, t, 0.3);
      const buzzing = on && aircraft.stallWarning && Math.floor(t * 8) % 2 === 0;
      nodes.buzzGain.gain.setTargetAtTime(buzzing ? 0.06 : 0, t, 0.01);
    },
    ring() {
      blip(880, 0.35, 'sine', 0.22, 1.5);
      setTimeout(() => blip(1320, 0.45, 'sine', 0.18, 1.2), 90);
    },
    chirp() {
      burst(0.18, 0.35, 1800);
    },
    clunk() {
      blip(90, 0.18, 'square', 0.2, 0.6);
    },
    crash() {
      burst(1.6, 0.9, 700);
      blip(60, 1.2, 'sawtooth', 0.4, 0.3);
    },
    thunder() {
      burst(2.4, 0.35, 260);
    },
    objective() {
      blip(660, 0.2, 'triangle', 0.2, 1);
      setTimeout(() => blip(990, 0.3, 'triangle', 0.2, 1), 120);
    },
  };
}
