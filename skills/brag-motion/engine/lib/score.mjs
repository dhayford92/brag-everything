// brag-motion score engine.
// Writes music and sound effects as ONE piece: same key, same chord at every moment, same reverb space,
// same beat grid counted from frame 0. Effects are derived from the composition's own event list
// (cuts, whooshes, impacts, pops, clicks, keys, confetti), quantised to 1/16 notes, voiced from the
// chord that is sounding at that instant, and mixed softly under the music.
import fs from 'node:fs';

const SR = 48000;
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const dB = (d) => Math.pow(10, d / 20);

// ---------- style presets (tuned against the reference tracks: ~115 BPM bright pop, ~72/144 BPM chic lo-fi) ----------
export const STYLES = {
  'bright-pop': { mode: 'major', prog: [[0], [4], [5], [3]], seventh: false, kit: 'pop', keys: 'pad', lead: 'pluck', bpm: [104, 128], swingless: true },
  'lofi-chic': { mode: 'major', prog: [[3, 7], [2, 7], [5, 7], [0, 7]], seventh: true, kit: 'lofi', keys: 'ep', lead: 'bell', bpm: [68, 92] },
  'night-drive': { mode: 'minor', prog: [[0], [5], [2], [6]], seventh: false, kit: 'drive', keys: 'pad', lead: 'pluck', bpm: [110, 132] },
  'warm-keys': { mode: 'major', prog: [[0, 7], [5, 7], [3, 7], [4]], seventh: true, kit: 'soft', keys: 'ep', lead: 'pluck', bpm: [84, 104] },
};

// ---------- deterministic noise ----------
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296) * 2 - 1; }; }

// ---------- biquad (RBJ) ----------
function biquad(type, f, q = 0.707, gainDb = 0) {
  const w = (2 * Math.PI * f) / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'hs') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
  else if (type === 'ls') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function filt(buf, ...fs_) { for (const F of fs_) { let { b0, b1, b2, a1, a2 } = F, x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < buf.length; i++) { const x = buf[i]; const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; buf[i] = y; } } return buf; }
const filtSt = (st, mk) => { filt(st[0], ...mk()); filt(st[1], ...mk()); return st; };

// ---------- buses ----------
const bus = (n) => [new Float32Array(n), new Float32Array(n)];
function add(st, mono, at, gain = 1, pan = 0) {
  const s0 = Math.round(at); const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const L = st[0], R = st[1];
  for (let i = 0; i < mono.length; i++) { const k = s0 + i; if (k < 0) continue; if (k >= L.length) break; L[k] += mono[i] * gl; R[k] += mono[i] * gr; }
}

// ---------- band-limited saw table ----------
const TBL = (() => { const N = 4096, t = new Float32Array(N); for (let h = 1; h <= 28; h++) for (let i = 0; i < N; i++) t[i] += (Math.sin((2 * Math.PI * h * i) / N) / h) * (h % 2 ? 1 : 0.92); let m = 0; for (const v of t) m = Math.max(m, Math.abs(v)); for (let i = 0; i < N; i++) t[i] /= m; return t; })();

// ---------- instruments (each returns a mono Float32Array) ----------
const I = {
  kick(f0) { const n = Math.round(SR * 0.5), o = new Float32Array(n); let ph = 0; const r = rng(11);
    for (let i = 0; i < n; i++) { const t = i / SR; const f = f0 + (f0 * 3.2) * Math.exp(-t / 0.028); ph += (2 * Math.PI * f) / SR; const env = Math.min(1, t / 0.0015) * Math.exp(-t / 0.2); o[i] = Math.tanh(1.6 * Math.sin(ph)) * env * 0.9 + r() * Math.exp(-t / 0.002) * 0.05; }
    return o; },
  clap(bodyHz) { const n = Math.round(SR * 0.35), o = new Float32Array(n); const r = rng(23);
    for (let i = 0; i < n; i++) { const t = i / SR; let e = 0; for (const d of [0, 0.011, 0.022]) if (t >= d) e = Math.max(e, Math.exp(-(t - d) / 0.007)); e = Math.max(e, t > 0.022 ? 0.55 * Math.exp(-(t - 0.022) / 0.11) : 0); o[i] = r() * e * 0.6 + Math.sin(2 * Math.PI * bodyHz * t) * Math.exp(-t / 0.05) * 0.25; }
    return filt(o, biquad('bp', 1500, 0.7), biquad('lp', 7000)); },
  rim(hz) { const n = Math.round(SR * 0.12), o = new Float32Array(n); const r = rng(5);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(2 * Math.PI * hz * t) * 0.7 + r() * 0.3) * Math.exp(-t / 0.018); } return filt(o, biquad('bp', 1800, 1.2)); },
  hat(open = false, seed = 3) { const n = Math.round(SR * (open ? 0.32 : 0.08)), o = new Float32Array(n); const r = rng(seed);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] = r() * Math.min(1, t / 0.0015) * Math.exp(-t / (open ? 0.12 : 0.024)); } return filt(o, biquad('hp', 7200, 0.6), biquad('lp', 11500)); },
  shaker(seed = 9) { const n = Math.round(SR * 0.09), o = new Float32Array(n); const r = rng(seed);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] = r() * Math.sin(Math.PI * Math.min(1, t / 0.09)); } return filt(o, biquad('bp', 6000, 0.8), biquad('lp', 9000)); },
  bass(hz, dur) { const n = Math.round(SR * (dur + 0.08)), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * hz) / SR; const env = Math.min(1, t / 0.006) * (t < dur ? 0.75 + 0.25 * Math.exp(-t / 0.15) : 0.75 * Math.exp(-(t - dur) / 0.025)); o[i] = Math.tanh(1.4 * (Math.sin(ph) + 0.28 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph))) * env; }
    return filt(o, biquad('lp', 750, 0.8)); },
  pad(hzs, dur, bright = 0.5) { const rel = 0.9, n = Math.round(SR * (dur + rel)), o = new Float32Array(n); const att = Math.min(0.5, dur * 0.4);
    hzs.forEach((hz, j) => { for (const det of [-0.11, 0, 0.12]) { let ph = (((j * 0.37 + det) % 1) + 1) % 1; const inc = (hz * Math.pow(2, det / 12)) / SR;
      for (let i = 0; i < n; i++) { const t = i / SR; const env = Math.min(1, t / att) * (t < dur ? 1 : Math.exp(-(t - dur) / (rel / 3))); ph += inc; if (ph >= 1) ph -= 1; o[i] += TBL[(ph * 4096) | 0] * env * 0.16; } } });
    return filt(o, biquad('lp', 1400 + bright * 3600, 0.6), biquad('hp', 160)); },
  ep(hzs, dur) { const n = Math.round(SR * (dur + 1.2)), o = new Float32Array(n);
    hzs.forEach((hz) => { let pc = 0, pm = 0; for (let i = 0; i < n; i++) { const t = i / SR; const idx = 1.6 * Math.exp(-t / 0.35) + 0.25; pm += (2 * Math.PI * hz) / SR; pc += (2 * Math.PI * hz) / SR; const env = Math.min(1, t / 0.004) * Math.exp(-t / 1.4) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.18)); o[i] += Math.sin(pc + idx * Math.sin(pm)) * env * 0.22; } });
    return filt(o, biquad('lp', 3800, 0.6), biquad('hp', 120)); },
  pluck(hz, seed = 1, bright = 0.5) { const n = Math.round(SR * 1.1), o = new Float32Array(n); const L = Math.max(2, Math.round(SR / hz)); const d = new Float32Array(L); const r = rng(seed * 131 + 7);
    let lp = 0; for (let i = 0; i < L; i++) { lp += (r() - lp) * (0.3 + bright * 0.5); d[i] = lp; }
    let p = 0; const decay = 0.9965; for (let i = 0; i < n; i++) { const a = d[p], b = d[(p + 1) % L]; const v = (a + b) * 0.5 * decay; d[p] = v; o[i] = a * Math.min(1, i / 48); p = (p + 1) % L; }
    return filt(o, biquad('hp', 180), biquad('lp', 5200)); },
  bell(hz, len = 1.6) { const n = Math.round(SR * len), o = new Float32Array(n); let pc = 0, pm = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; pc += (2 * Math.PI * hz) / SR; pm += (2 * Math.PI * hz * 3.5) / SR; const env = Math.min(1, t / 0.003) * Math.exp(-t / (len * 0.35)); o[i] = Math.sin(pc + 1.2 * Math.exp(-t / 0.25) * Math.sin(pm)) * env * 0.5; }
    return filt(o, biquad('lp', 6500)); },
  blip(hz) { const n = Math.round(SR * 0.22), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * hz * (1 + 0.04 * Math.exp(-t / 0.01))) / SR; o[i] = Math.sin(ph) * Math.min(1, t / 0.004) * Math.exp(-t / 0.055); } return filt(o, biquad('lp', 5000)); },
  tock(hz) { const n = Math.round(SR * 0.09), o = new Float32Array(n); let ph = 0; const r = rng(17);
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * hz * (1 + 0.6 * Math.exp(-t / 0.006))) / SR; o[i] = (Math.sin(ph) * 0.8 + r() * 0.15 * Math.exp(-t / 0.003)) * Math.min(1, t / 0.0025) * Math.exp(-t / 0.022); } return filt(o, biquad('lp', 4500)); },
  key(seed) { const n = Math.round(SR * 0.03), o = new Float32Array(n); const r = rng(seed);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] = r() * Math.min(1, t / 0.001) * Math.exp(-t / 0.006); } return filt(o, biquad('bp', 3400 + (seed % 7) * 180, 1.4), biquad('lp', 6000)); },
  swish(len, f1, f2, seed = 4) { const n = Math.round(SR * len), o = new Float32Array(n); const r = rng(seed); let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const t = i / n; const fc = f1 * Math.pow(f2 / f1, t * t); const g = 2 * Math.sin((Math.PI * fc) / SR); const q = 0.35; const x = r(); const hp = x - s2 - q * s1; s1 += g * hp; s2 += g * s1; const env = Math.pow(t, 2.2) * (t > 0.97 ? (1 - t) / 0.03 : 1); o[i] = s1 * env * 0.55; }
    return filt(o, biquad('hp', 250), biquad('lp', 7500)); },
  sub(hz, len = 1.4) { const n = Math.round(SR * len), o = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += (2 * Math.PI * hz * (1 + 1.0 * Math.exp(-t / 0.05))) / SR; o[i] = Math.sin(ph) * Math.min(1, t / 0.003) * Math.exp(-t / (len * 0.4)); } return o; },
  air(len, seed = 2) { const n = Math.round(SR * len), o = new Float32Array(n); const r = rng(seed);
    for (let i = 0; i < n; i++) { const t = i / SR; o[i] = r() * Math.min(1, t / 0.004) * Math.exp(-t / (len * 0.3)); } return filt(o, biquad('hp', 2500), biquad('lp', 9000)); },
  click() { const n = Math.round(SR * 0.04), o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t / 0.008); } return o; },
};

// ---------- reverb (Freeverb-style, one shared room = "the same space") ----------
function reverb(st, { room = 0.8, damp = 0.35, pre = 0.022, wet = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((x) => Math.round((x * SR) / 44100));
  const alls = [556, 441, 341, 225].map((x) => Math.round((x * SR) / 44100));
  const n = st[0].length; const out = bus(n); const pd = Math.round(pre * SR);
  for (let ch = 0; ch < 2; ch++) {
    const spread = ch ? 23 : 0; const inp = st[ch]; const o = out[ch];
    const cs = combs.map((L) => ({ b: new Float32Array(L + spread), p: 0, f: 0 })); const as = alls.map((L) => ({ b: new Float32Array(L + spread), p: 0 }));
    for (let i = 0; i < n; i++) {
      const x = (i >= pd ? inp[i - pd] : 0) * 0.015; let y = 0;
      for (const c of cs) { const v = c.b[c.p]; c.f = v * (1 - damp) + c.f * damp; c.b[c.p] = x + c.f * room; if (++c.p >= c.b.length) c.p = 0; y += v; }
      for (const a of as) { const v = a.b[a.p]; const z = -y + v; a.b[a.p] = y + v * 0.5; if (++a.p >= a.b.length) a.p = 0; y = z; }
      o[i] = y * wet;
    }
  }
  return out;
}

// ---------- dynamics ----------
function sidechain(n, kicks, depth, rel = 0.14) { const g = new Float32Array(n).fill(1); for (const k of kicks) { const s0 = Math.round(k); for (let i = 0; i < SR * 0.6; i++) { const j = s0 + i; if (j < 0 || j >= n) continue; const t = i / SR; const d = depth * (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / rel)); g[j] = Math.min(g[j], 1 - d); } } return g; }
const applyGain = (st, g) => { for (let ch = 0; ch < 2; ch++) for (let i = 0; i < g.length; i++) st[ch][i] *= g[i]; };
function glue(st, { thr = -16, ratio = 2, att = 0.01, rel = 0.18 } = {}) {
  const a = Math.exp(-1 / (att * SR)), r = Math.exp(-1 / (rel * SR)); let env = 0;
  for (let i = 0; i < st[0].length; i++) { const x = Math.max(Math.abs(st[0][i]), Math.abs(st[1][i])); env = x > env ? a * env + (1 - a) * x : r * env + (1 - r) * x; const lv = 20 * Math.log10(env + 1e-9); const over = lv - thr; const gr = over > 0 ? dB(-over * (1 - 1 / ratio)) : 1; st[0][i] *= gr; st[1][i] *= gr; }
}
function limiter(st, ceilDb = -1.0) {
  const c = dB(ceilDb), n = st[0].length, look = Math.round(0.005 * SR); const g = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(st[0][i]), Math.abs(st[1][i])); if (p > c) { const need = c / p; for (let k = Math.max(0, i - look); k <= i; k++) g[k] = Math.min(g[k], need + (1 - need) * ((i - k) / look) * 0); } }
  const rel = Math.exp(-1 / (0.08 * SR)); let cur = 1; for (let i = 0; i < n; i++) { cur = g[i] < cur ? g[i] : rel * cur + (1 - rel) * Math.min(1, g[i]); cur = Math.min(cur, g[i] < 1 ? g[i] : cur); st[0][i] *= cur; st[1][i] *= cur; }
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) st[ch][i] = Math.max(-c, Math.min(c, st[ch][i]));
}
export function lufs(st) { // ITU-R BS.1770 integrated loudness (gated)
  const k = st.map((ch) => filt(Float32Array.from(ch), { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585, x1: 0, x2: 0, y1: 0, y2: 0 }, { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621, x1: 0, x2: 0, y1: 0, y2: 0 }));
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR); const zs = [];
  for (let s = 0; s + blk <= k[0].length; s += hop) { let z = 0; for (let ch = 0; ch < 2; ch++) for (let i = s; i < s + blk; i++) z += k[ch][i] * k[ch][i]; zs.push(z / blk); }
  const L = (z) => -0.691 + 10 * Math.log10(z + 1e-12);
  const g1 = zs.filter((z) => L(z) > -70); if (!g1.length) return -70; const m1 = g1.reduce((a, b) => a + b) / g1.length;
  const g2 = g1.filter((z) => L(z) > L(m1) - 10); return L(g2.reduce((a, b) => a + b) / g2.length);
}

// ---------- WAV ----------
export function writeWav(file, st, bits = 24) {
  const n = st[0].length, bps = bits / 8, data = Buffer.alloc(n * 2 * bps); const r = rng(1234); let o = 0; const max = (1 << (bits - 1)) - 1;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 2; ch++) { const d = bits === 16 ? (r() + r()) * 0.5 / max : 0; let v = Math.round(Math.max(-1, Math.min(1, st[ch][i] + d)) * max); if (bits === 24) { data.writeIntLE(v, o, 3); o += 3; } else { data.writeInt16LE(v, o); o += 2; } }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2 * bps, 28); h.writeUInt16LE(2 * bps, 32); h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
export function readPcmF32(file) { const b = fs.readFileSync(file); const n = b.length / 8; const L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = b.readFloatLE(i * 8); R[i] = b.readFloatLE(i * 8 + 4); } return [L, R]; }

// =====================================================================================
export function compose(info, opt = {}) {
  const C = info.config; const bpm = C.bpm; const spb = 60 / bpm; const S = (beat) => beat * spb * SR;
  const styleName = opt.style || C.music || 'bright-pop'; const ST = STYLES[styleName] || STYLES['bright-pop'];
  const mode = C.mode || ST.mode; const scale = SCALES[mode] || SCALES.major; const root = NOTE[C.key] ?? 5;
  const voiceBed = !!(opt.voiceBed ?? C.voice);
  const totalBeats = info.totalBeats; const tail = 2.5; const n = Math.round(S(totalBeats) + tail * SR);
  const bars = Math.ceil(totalBeats / 4);
  const scenes = info.scenes; const last = scenes[scenes.length - 1];
  const sceneAt = (beat) => scenes.find((s) => beat >= s.start && beat < s.start + s.beats) || last;
  const energyAt = (beat) => sceneAt(beat).energy ?? 1;
  const isOutro = (beat) => sceneAt(beat) === last && scenes.length > 2;

  // chord for any beat — the single source of harmony for music AND effects
  const deg = (d, oct) => { const k = ((d % 7) + 7) % 7; return 12 * (oct + 1) + root + scale[k] + 12 * Math.floor(d / 7); };
  const chordAt = (beat) => {
    if (isOutro(beat)) return { d: 0, ext: ST.seventh ? 7 : 9 };
    const bar = Math.floor(beat / 4); const p = ST.prog[bar % ST.prog.length]; return { d: p[0], ext: p[1] || 0 };
  };
  const chordNotes = (beat, oct = 4) => { const c = chordAt(beat); const ns = [deg(c.d, oct), deg(c.d + 2, oct), deg(c.d + 4, oct)]; if (c.ext === 7) ns.push(deg(c.d + 6, oct)); if (c.ext === 9) ns.push(deg(c.d + 8, oct)); return ns; };
  const bassHz = (beat) => { let m = deg(chordAt(beat).d, 1); while (mtof(m) < 41) m += 12; while (mtof(m) > 82) m -= 12; return mtof(m); };
  const kickHz = mtof((() => { let m = 12 + root; while (mtof(m) < 42) m += 12; return m; })());

  const D = bus(n), BS = bus(n), K = bus(n), LD = bus(n), FX = bus(n), UI = bus(n); const kicks = [];
  // optional per-comp overrides: Brag.setup({ sfx: { click, key, pop }, mixDb: { D, BS, K, LD, FX, UI } }) — dB
  const SFX = C.sfx || {}; const MIXDB = C.mixDb || {};
  const send = { keys: 0.22, lead: 0.3, fx: 0.55, drums: 0.08 };

  // ---------- figure out "drops": a scene that enters as slam or jumps >=2 in energy gets a 1-beat stop before it ----------
  const stops = new Set();
  scenes.forEach((s, i) => { if (!i) return; const p = scenes[i - 1]; if (s.in === 'slam' || (s.energy - p.energy >= 2)) stops.add(s.start - 1); });
  const inStop = (beat) => [...stops].some((b) => beat >= b && beat < b + 1);
  const fills = new Set(); scenes.forEach((s, i) => { if (i && s.energy > scenes[i - 1].energy && !stops.has(s.start - 1) && s.energy >= 2) fills.add(s.start - 1); });

  // ---------- drums ----------
  const kit = ST.kit; const kick = I.kick(kickHz); const clap = I.clap(mtof(deg(4, 3))); const hatC = [I.hat(false, 3), I.hat(false, 8)], hatO = I.hat(true, 5); const shk = I.shaker(); const rim = I.rim(mtof(deg(4, 5)));
  const outroStart = scenes.length > 2 ? last.start : Infinity;
  for (let b16 = 0; b16 < totalBeats * 4; b16++) {
    const beat = b16 / 4; const inBar = beat % 4; const e = energyAt(beat); const at = S(beat);
    if (inStop(beat)) continue;
    if (beat >= outroStart) { if (beat === outroStart) { add(D, kick, at, dB(-3)); kicks.push(at); } if (beat >= outroStart && beat < outroStart + 4 && inBar % 1 === 0.5) add(D, hatC[0], at, dB(-30), 0.3); continue; }
    const on = (x) => Math.abs(inBar - x) < 1e-6;
    let k = false, c = false, hc = 0, ho = 0;
    if (kit === 'pop' || kit === 'drive') {
      if (e >= 2) k = Number.isInteger(beat); else if (e === 1) k = on(0) || on(2);
      if (e >= 3 && on(3.5) && Math.floor(beat / 4) % 2 === 1) k = true;
      c = e >= 2 && (on(1) || on(3));
      if (e >= 1 && beat % 0.5 === 0) hc = beat % 1 === 0.5 ? -21 : -27;
      if (e >= 3 && beat % 0.5 === 0.25) hc = -33;
      if (e === 0 && beat % 0.5 === 0) hc = -34;
      if (e >= 2 && beat % 1 === 0.5 && kit === 'pop' && on(1.5) === false && inBar % 2 === 1.5) ho = -28;
    } else if (kit === 'lofi' || kit === 'soft') {
      k = e >= 1 && (on(0) || on(2.5) || (e >= 3 && on(1.75)));
      c = e >= 1 && (on(1) || on(3));
      if (beat % 0.5 === 0) hc = beat % 1 === 0.5 ? -26 : -30; if (e === 0 && beat % 0.5 === 0) hc = -34;
    }
    if (k) { add(D, kick, at, dB(e >= 2 ? -2 : -4)); kicks.push(at); }
    if (c) add(D, kit === 'lofi' && e < 2 ? rim : clap, at, dB(kit === 'lofi' ? -10 : -9), 0.05);
    if (hc) add(D, hatC[b16 % 2], at, dB(hc), 0.25);
    if (ho) add(D, hatO, at, dB(ho), -0.2);
    if (e >= 2 && kit !== 'pop' && beat % 0.25 === 0 && kit === 'drive') add(D, shk, at, dB(-36), -0.3);
  }
  for (const f of fills) for (let i = 0; i < 4; i++) add(D, clap, S(f + i * 0.25), dB(-22 + i * 3), 0);

  // ---------- bass ----------
  for (let beat = 0; beat < Math.min(totalBeats, outroStart); beat += 0.5) {
    const e = energyAt(beat); if (e === 0 || inStop(beat)) continue; const inBar = beat % 4; const hz = bassHz(beat);
    let play = false, len = 0.45;
    if (kit === 'drive') { play = e >= 1; len = 0.4 * spb; if (play) add(BS, I.bass(hz * (beat % 1 === 0.5 && e >= 3 ? 2 : 1), len), S(beat), dB(-9)); continue; }
    if (e === 1) { play = inBar === 0 || inBar === 2.5; len = inBar === 0 ? 2.2 * spb : 1.2 * spb; }
    else { play = [0, 1.5, 2, 2.5, 3.5].includes(inBar); len = (inBar === 0 ? 1.4 : 0.45) * spb; }
    if (play) add(BS, I.bass(hz * (e >= 3 && inBar === 3.5 ? 2 : 1), len), S(beat), dB(-8));
  }
  if (outroStart < Infinity) add(BS, I.bass(bassHz(outroStart), 4 * spb), S(outroStart), dB(-9));

  // ---------- keys / pad ----------
  for (let bar = 0; bar < bars; bar++) {
    const beat = bar * 4; if (beat >= totalBeats) break; const e = energyAt(beat); const ns = chordNotes(beat, 3).map((m) => (m < 52 ? m + 12 : m)).map(mtof);
    const len = Math.min(4, totalBeats - beat) * spb + (beat >= outroStart ? tail : 0);
    if (ST.keys === 'ep') { for (const off of e >= 1 ? [0, 1.5, 2.5] : [0]) if (beat + off < totalBeats) add(K, I.ep(ns, (off ? 0.8 : 1.4) * spb), S(beat + off), dB(off ? -8 : -5), 0); }
    else add(K, I.pad(ns, len, Math.min(1, 0.25 + e * 0.25)), S(beat), dB(-2 - (e === 0 ? 2 : 0)), 0);
  }
  // ---------- lead: arps + a short motif (pluck / bell), always chord tones ----------
  const pr = rng(C.seed || 7);
  for (let b8 = 0; b8 < totalBeats * 2; b8++) {
    const beat = b8 / 2; const e = energyAt(beat); if (inStop(beat)) continue;
    const ns = chordNotes(beat, 5); const pat = [0, 1, 2, 1, 3 % ns.length, 2, 1, 2];
    let play = false, g = -16;
    if (beat >= outroStart) { play = beat % 1 === 0 && beat < outroStart + 6; g = -18 - (beat - outroStart) * 1.5; }
    else if (e === 0) { play = beat % 4 === 0 || beat % 4 === 2.5; g = -19; }
    else if (e === 1) { play = beat % 1 === 0; g = -18; }
    else { play = true; g = e >= 3 ? -15 : -17; if (beat % 1 === 0) g += 2; }
    if (!play) continue;
    const m = ns[pat[b8 % 8] % ns.length];
    const voice = ST.lead === 'bell' ? I.bell(mtof(m), 1.2) : I.pluck(mtof(m), b8 + 1, 0.35 + e * 0.12);
    add(LD, voice, S(beat), dB(g - (voiceBed ? 5 : 0)), ((b8 % 4) - 1.5) * 0.18);
    if (e >= 3 && beat % 2 === 0 && pr() > -0.2) add(LD, I.bell(mtof(ns[0] + 12), 0.9), S(beat), dB(-27), 0.3);
  }

  // ---------- effects, from the picture's own events ----------
  const q16 = (b) => Math.round(b * 4) / 4; let popIx = 0; let lastKey = -1; const keyEvents = info.events.filter((e) => e.type === 'key').length;
  for (const ev of info.events) {
    const beat = q16(ev.beat); const at = S(beat); if (beat > totalBeats + 1) continue;
    const ns = chordNotes(beat, 6);
    switch (ev.type) {
      case 'whoosh': { const L = Math.max(0.5, ev.lead || 0.5) * spb + 0.35 * spb; const top = mtof(chordNotes(beat, 5)[1]); add(FX, I.swish(L, 260, Math.min(6500, top * 6)), at - L * SR, dB(-17), ev.kind === 'whip' ? 0.4 : 0); break; }
      case 'impact': { if (ev.soft) { chordNotes(beat, 5).forEach((m, i) => add(FX, I.bell(mtof(m), 2.4), at, dB(-24 - i * 2), (i - 1) * 0.3)); add(FX, I.sub(kickHz, 1.4), at, dB(-14)); }
        else { add(FX, I.sub(kickHz, 1.8), at, dB(-9)); add(FX, I.air(1.6, 31), at, dB(-24)); add(D, kick, at, dB(-3)); kicks.push(at); chordNotes(beat, 4).forEach((m, i) => add(FX, I.pluck(mtof(m), 50 + i, 0.6), at, dB(-20), (i - 1) * 0.35)); }
        break; }
      case 'pop': { const ch = chordNotes(beat, 6); const m = ch[popIx++ % ch.length]; add(FX, I.blip(mtof(m)), at, dB((ev.soft ? -5 : 0) + (SFX.pop ?? -27)), ((popIx % 3) - 1) * 0.35); break; }
      case 'click': if (SFX.click != null) { add(UI, I.tock(mtof(ns[0]) * 2), at, dB(SFX.click), 0.1); add(UI, I.tock(mtof(ns[0])), at, dB(SFX.click - 6), 0.1); } else add(FX, I.tock(mtof(ns[0])), at, dB(-24), 0.1); break;
      case 'key': { if (beat === lastKey) break; lastKey = beat; add(SFX.key != null ? UI : FX, I.key((beat * 4) | 0), at, dB(SFX.key ?? (keyEvents > 40 ? -36 : -33)), 0.15 * Math.sin(beat * 7)); break; }
      case 'swap': add(FX, I.pluck(mtof(ns[1] - 12), (beat * 8) | 0, 0.3), at, dB(-27), -0.2); break;
      case 'word': add(FX, I.swish(0.35 * spb + 0.08, 900, 3800, (beat * 3) | 0), at - (0.35 * spb + 0.08) * SR, dB(-34), 0); break;
      case 'confetti': chordNotes(beat, 6).concat(chordNotes(beat, 7)).forEach((m, i) => add(FX, I.bell(mtof(m), 1.4), S(beat + i * 0.25), dB(-27 - i), (i % 2 ? 0.4 : -0.4))); break;
      case 'cut': if (energyAt(beat) === 0 && beat > 0 && ev.in === 'cut') add(FX, I.sub(kickHz * 2, 0.5), at, dB(-24)); break;
      default: break;
    }
  }

  // ---------- mix ----------
  filtSt(D, () => [biquad('hp', 30)]);
  filtSt(BS, () => [biquad('hp', 35), biquad('lp', 900)]);
  filtSt(K, () => [biquad('hp', 160), biquad('peak', 2500, 0.8, voiceBed ? -4 : -1)]);
  filtSt(LD, () => [biquad('hp', 260), biquad('lp', 8500), biquad('peak', 3000, 0.9, voiceBed ? -4 : 0)]);
  filtSt(FX, () => [biquad('hp', 140), biquad('lp', 8000), biquad('hs', 6000, 0.7, -3)]); // effects: soft, never spiky
  const sc = (d) => sidechain(n, kicks, d);
  applyGain(BS, sc(0.55)); applyGain(K, sc(0.35)); applyGain(LD, sc(0.22)); applyGain(FX, sc(0.18));
  // shared space
  const rvIn = bus(n); for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) rvIn[ch][i] = K[ch][i] * send.keys + LD[ch][i] * send.lead + FX[ch][i] * send.fx + D[ch][i] * send.drums;
  const RV = reverb(rvIn, { room: 0.82, damp: 0.42 }); filtSt(RV, () => [biquad('hp', 280), biquad('lp', 6500)]); applyGain(RV, sc(0.3));
  filtSt(UI, () => [biquad('hp', 180), biquad('lp', 9000)]); // UI clicks: dry, not ducked by the kick
  const G = { D: dB(MIXDB.D ?? -5), BS: dB(MIXDB.BS ?? -7), K: dB(MIXDB.K ?? -2), LD: dB(MIXDB.LD ?? 1), FX: dB(MIXDB.FX ?? -2), RV: dB(MIXDB.RV ?? -7), UI: dB(MIXDB.UI ?? 0) };
  const M = bus(n);
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) M[ch][i] = D[ch][i] * G.D + BS[ch][i] * G.BS + K[ch][i] * G.K + LD[ch][i] * G.LD + FX[ch][i] * G.FX + RV[ch][i] * G.RV + UI[ch][i] * G.UI;
  filtSt(M, () => [biquad('hp', 30), biquad('ls', 110, 0.7, -2), biquad('peak', 2200, 0.7, 1.5), biquad('hs', 8000, 0.7, 1)]);
  glue(M, { thr: -18, ratio: 2 });
  // fade the ring-out
  const fadeFrom = Math.round(S(totalBeats) + 0.3 * SR); for (let i = fadeFrom; i < n; i++) { const g = Math.max(0, 1 - (i - fadeFrom) / (n - fadeFrom)); M[0][i] *= g * g; M[1][i] *= g * g; }
  // loudness: -14 LUFS for music-only, -19 for a voice bed (voice sits on top later)
  const target = opt.lufs ?? (voiceBed ? -19 : -14);
  const cur = lufs(M); const gain = dB(target - cur); for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) M[ch][i] *= gain;
  limiter(M, -1.0);
  return { mix: M, lufs: lufs(M), bpm, key: `${C.key} ${mode}`, style: styleName, seconds: n / SR, kicks: kicks.length };
}

// Recording guide: 2-bar count-in + soft metronome + a cue bell one beat before each script line.
export function guide(info, mix, lines = []) {
  const spb = 60 / info.config.bpm; const pre = Math.round(8 * spb * SR); const n = pre + mix[0].length; const G = bus(n);
  for (let ch = 0; ch < 2; ch++) G[ch].set(mix[ch].map((v) => v * 0.6), pre);
  const clk = I.click(); const hi = I.blip(1760);
  for (let b = 0; b < 8 + info.totalBeats; b++) add(G, b % 4 === 0 ? hi : clk, b * spb * SR, dB(b < 8 ? -8 : -20));
  for (const l of lines) add(G, I.bell(1318.5, 0.6), pre + (l.beat - 1) * spb * SR, dB(-14));
  return { mix: G, countIn: pre / SR };
}
