// Tiny synthesised sound effects (no audio files to license).
let ctx: AudioContext | null = null;

function tone(freqs: number[], dur: number, type: OscillatorType, gain = 0.08) {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = type;
      o.frequency.value = f;
      const s = t0 + i * dur;
      g.gain.setValueAtTime(gain, s);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(s);
      o.stop(s + dur);
    });
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  hit: (on: boolean) => on && tone([520, 780], 0.08, "triangle"),
  miss: (on: boolean) => on && tone([200, 140], 0.12, "sawtooth", 0.05),
  victory: (on: boolean) => on && tone([523, 659, 784, 1046], 0.12, "triangle"),
  level: (on: boolean) => on && tone([392, 523, 659, 784, 1046], 0.1, "square", 0.04),
  heal: (on: boolean) => on && tone([660, 880], 0.1, "sine"),
};
