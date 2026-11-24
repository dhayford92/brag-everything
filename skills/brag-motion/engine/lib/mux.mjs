// Final mix + mux. Optional voice-over: cleaned, levelled, and the music is ducked under it with a
// smooth sidechain so the voice sits on top of the same track rather than fighting it.
import fs from 'node:fs';
import path from 'node:path';
import { FFMPEG, run, log } from './util.mjs';
import { writeWav, readPcmF32, lufs } from './score.mjs';

const SR = 48000;
const dB = (d) => Math.pow(10, d / 20);

function decode(file, tmp) { run(FFMPEG, ['-y', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', tmp]); const st = readPcmF32(tmp); fs.rmSync(tmp, { force: true }); return st; }

export function mixVoice(musicWav, voiceFile, outWav, { trim = 0, nudgeMs = 0, duckDb = -9 } = {}) {
  const M = decode(musicWav, outWav + '.m.f32');
  // voice chain: high-pass, de-mud, presence, gentle compression, loudness to -16 LUFS
  const vtmp = outWav + '.v.f32';
  run(FFMPEG, ['-y', '-ss', String(Math.max(0, trim + nudgeMs / 1000)), '-i', voiceFile, '-af',
    'highpass=f=85,lowpass=f=14000,equalizer=f=250:t=q:w=1.2:g=-2.5,equalizer=f=3500:t=q:w=1.0:g=2,acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=2,loudnorm=I=-16:TP=-2:LRA=9',
    '-ac', '2', '-ar', String(SR), '-f', 'f32le', vtmp]);
  const V = readPcmF32(vtmp); fs.rmSync(vtmp, { force: true });
  const n = M[0].length; const env = new Float32Array(n);
  const a = Math.exp(-1 / (0.03 * SR)), r = Math.exp(-1 / (0.35 * SR)); let e = 0;
  for (let i = 0; i < n; i++) { const x = i < V[0].length ? Math.max(Math.abs(V[0][i]), Math.abs(V[1][i])) : 0; e = x > e ? a * e + (1 - a) * x : r * e + (1 - r) * x; env[i] = e; }
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const talk = Math.min(1, env[i] / 0.05); const g = 1 + (dB(duckDb) - 1) * talk;
    for (let ch = 0; ch < 2; ch++) out[ch][i] = M[ch][i] * g + (i < V[ch].length ? V[ch][i] : 0);
  }
  const L = lufs(out); const k = dB(-14 - L);
  for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) out[ch][i] = Math.max(-0.89, Math.min(0.89, out[ch][i] * k));
  writeWav(outWav, out);
  log(`voice mixed → ${outWav} (music ducked ${duckDb} dB under voice)`);
  return outWav;
}

export function mux(video, audio, out) {
  run(FFMPEG, ['-y', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]);
  log(`final → ${out}`);
  return out;
}

export function sheet(video, outPng, { cols = 6, every = 1 } = {}) {
  run(FFMPEG, ['-y', '-i', video, '-vf', `fps=1/${every},scale=480:-1,tile=${cols}x${Math.ceil(60 / every / cols)}:padding=6:color=white`, '-frames:v', '1', outPng]);
  return outPng;
}

export function poster(video, t, outPng) { run(FFMPEG, ['-y', '-ss', String(t), '-i', video, '-frames:v', '1', outPng]); return outPng; }
export { path };
