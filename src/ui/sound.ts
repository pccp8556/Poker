/** Short, quiet feedback sounds synthesised with Web Audio (no audio files). */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playFeedback(kind: 'ok' | 'ko') {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  if (kind === 'ok') {
    tone(c, 880, t, 0.12, 0.06);
    tone(c, 1318.5, t + 0.07, 0.18, 0.05);
  } else {
    tone(c, 220, t, 0.22, 0.07, 'triangle');
    tone(c, 174.6, t + 0.09, 0.26, 0.05, 'triangle');
  }
}
