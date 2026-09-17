// Som ambiente sintetizado com Web Audio: ruído filtrado vira chuva e vento,
// osciladores curtos viram grilos, um estouro grave vira trovão. Nenhum arquivo
// externo. Só começa depois de um clique (política de autoplay).
(function () {
  const MIX = {
    rest: { rain: 0, wind: 0.05, crickets: 0 },
    clear: { rain: 0, wind: 0.06, crickets: 0 },
    cloudy: { rain: 0, wind: 0.14, crickets: 0 },
    fog: { rain: 0, wind: 0.08, crickets: 0 },
    rain: { rain: 0.55, wind: 0.16, crickets: 0 },
    snow: { rain: 0, wind: 0.22, crickets: 0 },
    storm: { rain: 0.8, wind: 0.32, crickets: 0 },
    night: { rain: 0, wind: 0.05, crickets: 0.28 },
  };

  let context = null;
  let master = null;
  let nodes = null;
  let enabled = false;
  let theme = 'rest';
  let cricketTimer = null;

  function noiseBuffer(ctx, seconds = 2) {
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function noiseSource(ctx) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.loop = true;
    source.start();
    return source;
  }

  function build() {
    context = new (window.AudioContext || window.webkitAudioContext)();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    // Chuva: ruído em banda média, com "granulação" de amplitude.
    const rainGain = context.createGain();
    rainGain.gain.value = 0;
    const rainFilter = context.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1800;
    rainFilter.Q.value = 0.5;
    const rainHigh = context.createBiquadFilter();
    rainHigh.type = 'highpass';
    rainHigh.frequency.value = 600;
    noiseSource(context).connect(rainFilter).connect(rainHigh).connect(rainGain).connect(master);

    // Vento: ruído grave com LFO lento na amplitude e no corte.
    const windGain = context.createGain();
    windGain.gain.value = 0;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 380;
    windFilter.Q.value = 1.2;
    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    lfo.start();
    const gust = context.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.07;
    const gustGain = context.createGain();
    gustGain.gain.value = 0.35;
    const windTrim = context.createGain();
    windTrim.gain.value = 0.65;
    gust.connect(gustGain).connect(windTrim.gain);
    gust.start();
    noiseSource(context).connect(windFilter).connect(windTrim).connect(windGain).connect(master);

    // Grilos: bursts curtos de um oscilador agudo.
    const cricketGain = context.createGain();
    cricketGain.gain.value = 0;
    cricketGain.connect(master);

    // Trovão: estouro grave que decai.
    const thunderFilter = context.createBiquadFilter();
    thunderFilter.type = 'lowpass';
    thunderFilter.frequency.value = 140;
    const thunderGain = context.createGain();
    thunderGain.gain.value = 0;
    noiseSource(context).connect(thunderFilter).connect(thunderGain).connect(master);

    nodes = { rainGain, windGain, cricketGain, thunderGain };
  }

  function chirp() {
    if (!enabled || !nodes || theme !== 'night') return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 3800 + Math.random() * 900;
    const env = context.createGain();
    env.gain.value = 0;
    osc.connect(env).connect(nodes.cricketGain);
    const pulses = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = now + i * 0.085;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.8, t + 0.012);
      env.gain.linearRampToValueAtTime(0, t + 0.05);
    }
    osc.start(now);
    osc.stop(now + pulses * 0.09 + 0.05);
    cricketTimer = setTimeout(chirp, 400 + Math.random() * 1400);
  }

  function ramp(param, value, seconds) {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function applyMix() {
    if (!nodes) return;
    const mix = MIX[theme] || MIX.rest;
    ramp(nodes.rainGain.gain, mix.rain, 2.5);
    ramp(nodes.windGain.gain, mix.wind, 2.5);
    ramp(nodes.cricketGain.gain, mix.crickets, 2.5);
    clearTimeout(cricketTimer);
    if (theme === 'night' && enabled) cricketTimer = setTimeout(chirp, 600);
  }

  function thunder() {
    if (!enabled || !nodes || theme !== 'storm') return;
    const now = context.currentTime + 0.4 + Math.random() * 1.2;
    const g = nodes.thunderGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(0.9, now + 0.08);
    g.exponentialRampToValueAtTime(0.001, now + 2.8 + Math.random() * 1.5);
  }

  window.addEventListener('sky:flash', thunder);

  window.gallerySound = {
    get enabled() {
      return enabled;
    },
    async toggle() {
      if (!context) build();
      if (context.state === 'suspended') await context.resume();
      enabled = !enabled;
      ramp(master.gain, enabled ? 0.9 : 0, enabled ? 1.8 : 0.8);
      applyMix();
      return enabled;
    },
    setTheme(name) {
      theme = name;
      applyMix();
    },
  };
})();
