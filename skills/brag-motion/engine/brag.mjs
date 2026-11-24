#!/usr/bin/env node
// brag-motion CLI — see ../SKILL.md
import fs from 'node:fs';
import path from 'node:path';
import { args, ENGINE, SKILL, mkdirp, log, probeDuration, FFMPEG, run } from './lib/util.mjs';

const A = args(process.argv.slice(2));
const cmd = A._[0];
const need = (v, m) => { if (!v) { console.error(m); process.exit(2); } return v; };
const projBrag = (p) => path.resolve(p || '.', 'brag');

const FRAME_LOCKED = (fps) => { const out = []; for (let k = 8; k <= 40; k++) out.push({ bpm: +((60 * fps) / k).toFixed(3), framesPerBeat: k }); return out; };

async function main() {
  switch (cmd) {
    case 'init': {
      const proj = path.resolve(A._[1] || '.'); const B = path.join(proj, 'brag');
      for (const d of ['comp/runtime/fonts', 'assets', 'out', 'stills']) mkdirp(path.join(B, d));
      for (const f of ['brag.js', 'brag.css']) fs.copyFileSync(path.join(ENGINE, 'runtime', f), path.join(B, 'comp/runtime', f));
      const fm = { 'dm-sans': '@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', outfit: '@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2', inter: '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'jetbrains-mono': '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2' };
      for (const [k, v] of Object.entries(fm)) fs.copyFileSync(path.join(ENGINE, 'node_modules', v), path.join(B, 'comp/runtime/fonts', k + '.woff2'));
      const comp = path.join(B, 'comp/index.html');
      const existed = fs.existsSync(comp);
      if (!existed || A.force) fs.copyFileSync(path.join(SKILL, 'templates/composition.html'), comp);
      const gi = path.join(B, '.gitignore'); if (!fs.existsSync(gi)) fs.writeFileSync(gi, 'out/*.parts/\nstills/\n');
      log(`scaffolded ${B}  (runtime refreshed; comp/index.html ${existed && !A.force ? 'kept' : 'written from template'})`);
      break;
    }
    case 'scout': {
      const { scout } = await import('./lib/scout.mjs');
      const proj = path.resolve(A._[1] || '.'); const r = scout(proj); mkdirp(projBrag(proj));
      const f = path.join(projBrag(proj), 'scout.json'); fs.writeFileSync(f, JSON.stringify(r, null, 2));
      console.log(JSON.stringify({ name: r.name, title: r.title, tagline: r.tagline, stack: r.stack, run: r.run, routes: r.routes.slice(0, 12), logos: r.brand.logos.slice(0, 5), accentGuess: r.brand.accentGuess, fonts: r.brand.fonts, media: r.media.length, videos: r.videos.length, recent: r.recentCommits.slice(0, 8), tags: r.tags }, null, 2));
      log('full report → ' + f);
      break;
    }
    case 'capture': {
      const { capture } = await import('./lib/capture.mjs');
      const specFile = need(A._[1], 'usage: capture <spec.json>');
      const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
      if (!spec.out) spec.out = path.join(path.dirname(path.resolve(specFile)), 'assets/capture');
      else spec.out = path.resolve(path.dirname(path.resolve(specFile)), spec.out);
      await capture(spec);
      break;
    }
    case 'grid': {
      const fps = +(A.fps || 30); const target = +(A.target || 30); const want = +(A.bpm || 115);
      const list = FRAME_LOCKED(fps).sort((a, b) => Math.abs(a.bpm - want) - Math.abs(b.bpm - want)).slice(0, 4);
      console.log(`frame-locked tempos near ${want} BPM @${fps}fps (every beat lands exactly on a frame):`);
      for (const t of list) { const beats = Math.round((target * t.bpm) / 60 / 4) * 4; console.log(`  ${t.bpm} BPM  (${t.framesPerBeat} frames/beat)  → ${beats} beats = ${beats / 4} bars = ${((beats * 60) / t.bpm).toFixed(2)}s`); }
      break;
    }
    case 'timeline': {
      const { timeline } = await import('./lib/render.mjs');
      const comp = path.resolve(need(A._[1], 'usage: timeline <comp/index.html>'));
      const out = A.out || path.join(path.dirname(comp), '../out/timeline.json');
      const info = await timeline(comp, out);
      console.log(`${info.scenes.length} scenes · ${info.totalBeats} beats · ${info.duration.toFixed(2)}s @ ${info.config.bpm} BPM · ${info.events.length} sound events`);
      for (const s of info.scenes) console.log(`  ${String(s.start).padStart(4)}b ${((s.start * 60) / info.config.bpm).toFixed(2).padStart(6)}s  ${s.name.padEnd(18)} ${String(s.beats).padStart(3)} beats  in:${s.in.padEnd(8)} energy:${s.energy}`);
      break;
    }
    case 'stills': {
      const { stills } = await import('./lib/render.mjs');
      const comp = path.resolve(need(A._[1], 'usage: stills <comp> [--at 1,2.5] (default: two per scene)'));
      const outDir = A.out || path.join(path.dirname(comp), '../stills');
      fs.rmSync(outDir, { recursive: true, force: true });
      const times = A.at ? String(A.at).split(',').map(Number) : 'beats';
      const { files } = await stills(comp, times, outDir);
      const sheet = path.join(outDir, '_sheet.png');
      const cols = 4, rows = Math.ceil(files.length / cols);
      const inputs = files.flatMap((f) => ['-i', f]);
      const filt = files.map((_, i) => `[${i}:v]scale=480:270[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * 486}_${Math.floor(i / cols) * 276}`).join('|')}:fill=white[o]`;
      if (files.length > 1) run(FFMPEG, ['-y', ...inputs, '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', sheet]);
      log(`${files.length} stills → ${outDir}  (contact sheet: ${sheet})`);
      break;
    }
    case 'score': {
      const { compose, writeWav, guide } = await import('./lib/score.mjs');
      const tl = path.resolve(need(A._[1], 'usage: score <out/timeline.json> [--style] [--voice-bed]'));
      const info = JSON.parse(fs.readFileSync(tl, 'utf8'));
      const r = compose(info, { style: A.style, voiceBed: A['voice-bed'] ? true : undefined });
      const out = A.out || path.join(path.dirname(tl), 'score.wav'); writeWav(out, r.mix);
      log(`score → ${out}  (${r.style}, ${r.bpm} BPM, ${r.key}, ${r.seconds.toFixed(2)}s, ${r.lufs.toFixed(1)} LUFS)`);
      if (A.guide) { const lines = A.lines ? JSON.parse(fs.readFileSync(A.lines, 'utf8')) : []; const g = guide(info, r.mix, lines); const gf = path.join(path.dirname(out), 'vo-guide.wav'); writeWav(gf, g.mix); log(`recording guide → ${gf}  (count-in ${g.countIn.toFixed(3)}s — start speaking on the bar after 8 clicks)`); }
      break;
    }
    case 'render': {
      const { renderVideo, timeline } = await import('./lib/render.mjs');
      const comp = path.resolve(need(A._[1], 'usage: render <comp/index.html> [--preview] [--from s --to s] [--no-audio] [--voice take.wav]'));
      const outDir = path.resolve(A['out-dir'] || path.join(path.dirname(comp), '../out')); mkdirp(outDir);
      const name = A.name || 'brag';
      const silent = path.join(outDir, `${name}${A.preview ? '-preview' : ''}.silent.mp4`);
      const info = await renderVideo(comp, silent, { preview: !!A.preview, from: A.from != null ? +A.from : 0, to: A.to != null ? +A.to : undefined, workers: A.workers, fps: A.fps });
      fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(info, null, 2));
      if (A['no-audio']) { log('silent video only: ' + silent); break; }
      const { compose, writeWav } = await import('./lib/score.mjs');
      const { mux, mixVoice } = await import('./lib/mux.mjs');
      const voice = A.voice ? path.resolve(A.voice) : null;
      const r = compose(info, { style: A.style, voiceBed: voice ? true : undefined });
      const scoreWav = path.join(outDir, 'score.wav'); writeWav(scoreWav, r.mix);
      log(`score: ${r.style}, ${r.bpm} BPM, ${r.key}, ${r.lufs.toFixed(1)} LUFS`);
      let audio = scoreWav;
      if (voice) audio = mixVoice(scoreWav, voice, path.join(outDir, 'mix-voice.wav'), { trim: +(A.trim || 0), nudgeMs: +(A.nudge || 0) });
      let final = path.join(outDir, `${name}${A.preview ? '-preview' : ''}.mp4`);
      if (A.from != null || A.to != null) { const cut = path.join(outDir, 'score-cut.wav'); run(FFMPEG, ['-y', '-ss', String(A.from || 0), '-i', audio, ...(A.to ? ['-t', String(+A.to - +(A.from || 0))] : []), cut]); audio = cut; }
      mux(silent, audio, final);
      fs.rmSync(silent, { force: true });
      log(`DONE → ${final}`);
      break;
    }
    case 'voice': {
      const { mux, mixVoice } = await import('./lib/mux.mjs');
      const { compose, writeWav } = await import('./lib/score.mjs');
      const outDir = path.resolve(A['out-dir'] || 'brag/out'); const take = path.resolve(need(A._[1], 'usage: voice <take.wav> [--trim seconds-of-count-in] [--nudge ms]'));
      const info = JSON.parse(fs.readFileSync(path.join(outDir, 'timeline.json'), 'utf8'));
      const r = compose(info, { voiceBed: true, style: A.style }); const bed = path.join(outDir, 'score-bed.wav'); writeWav(bed, r.mix);
      const mixed = mixVoice(bed, take, path.join(outDir, 'mix-voice.wav'), { trim: +(A.trim || 0), nudgeMs: +(A.nudge || 0) });
      const video = path.join(outDir, (A.name || 'brag') + '.mp4');
      const out = path.join(outDir, (A.name || 'brag') + '-voice.mp4');
      mux(video, mixed, out);
      break;
    }
    case 'sheet': {
      const v = path.resolve(need(A._[1], 'usage: sheet <video.mp4> [--every 1]'));
      const every = +(A.every || 1); const d = probeDuration(v); const cols = 6; const rows = Math.ceil(d / every / cols);
      const out = A.out || v.replace(/\.mp4$/, '-sheet.png');
      run(FFMPEG, ['-y', '-i', v, '-vf', `fps=1/${every},scale=400:-1,tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', out]);
      log('sheet → ' + out);
      break;
    }
    case 'poster': {
      const v = path.resolve(need(A._[1], 'usage: poster <video.mp4> --at seconds'));
      const out = A.out || v.replace(/\.mp4$/, '-poster.png'); run(FFMPEG, ['-y', '-ss', String(A.at || 1), '-i', v, '-frames:v', '1', out]); log('poster → ' + out);
      break;
    }
    case 'audio-check': {
      const f = path.resolve(need(A._[1], 'usage: audio-check <file.wav|mp4>'));
      const o = run(FFMPEG, ['-hide_banner', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { quiet: true });
      break;
    }
    default:
      console.log(`brag-motion engine
  init <projectDir>                 scaffold <projectDir>/brag (comp template, runtime, fonts)
  scout <projectDir>                static scan → brag/scout.json (stack, run cmd, logos, colours, fonts, media, commits)
  capture <brag/capture.json>       screenshot the RUNNING app: pages, components, scripted flows → brag/assets/capture
  grid --bpm 115 --target 40        frame-locked tempos + beat counts for a target length
  timeline <brag/comp/index.html>   print the scene/beat table (no render)
  stills <brag/comp/index.html>     two frames per scene + contact sheet → brag/stills (fast review)
  render <brag/comp/index.html>     frames → mp4, score, mux → brag/out/brag.mp4   [--preview] [--from --to] [--style] [--voice take.wav]
  score <brag/out/timeline.json>    music+sfx only → score.wav   [--guide --lines lines.json] [--voice-bed]
  voice <take.wav> --trim <count-in> mix a recorded voice-over onto brag/out/brag.mp4 → brag-voice.mp4
  sheet <video.mp4> / poster <video.mp4> --at s`);
  }
}
main().catch((e) => { console.error(e.stack || e); process.exit(1); });
