// Deterministic frame renderer: loads a composition with ?render, seeks every frame, pipes JPEGs to ffmpeg.
// Splits the timeline across N headless pages in parallel, then concatenates the segments losslessly.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { launch, spawnFF, run, FFMPEG, fileUrl, mkdirp, cpuCount, log } from './util.mjs';

export async function openComp(browser, comp, { scale = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(fileUrl(comp) + '?render', { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); }
  catch (e) { throw new Error('Composition never called Brag.done(). Page errors:\n' + errs.join('\n')); }
  const info = await page.evaluate(() => window.__brag);
  await page.setViewportSize({ width: info.config.width, height: info.config.height });
  if (errs.length) log('page warnings:\n  ' + errs.slice(0, 8).join('\n  '));
  return { page, info, errs };
}

export async function timeline(comp, out) {
  const browser = await launch();
  try {
    const { info } = await openComp(browser, comp);
    if (out) { mkdirp(path.dirname(out)); fs.writeFileSync(out, JSON.stringify(info, null, 2)); }
    return info;
  } finally { await browser.close(); }
}

export async function stills(comp, times, outDir, { prefix = 'still', scale = 1 } = {}) {
  mkdirp(outDir);
  const browser = await launch();
  const files = [];
  try {
    const { page, info } = await openComp(browser, comp, { scale });
    const list = times === 'beats' ? info.scenes.flatMap((s) => [s.start + s.beats * 0.5, s.start + s.beats - 0.25]).map((b) => (b * 60) / info.config.bpm) : times;
    for (const t of list) {
      await page.evaluate((ms) => window.__seek(ms), t * 1000);
      const f = path.join(outDir, `${prefix}-${t.toFixed(2).padStart(6, '0')}s.png`);
      await page.screenshot({ path: f });
      files.push(f);
    }
    return { files, info };
  } finally { await browser.close(); }
}

export async function renderVideo(comp, outFile, { fps, from = 0, to, workers, crf = 14, preview = false } = {}) {
  const browser = await launch();
  const t0 = Date.now();
  try {
    const probe = await openComp(browser, comp);
    const info = probe.info; await probe.page.close();
    fps = +(fps || info.config.fps || 30);
    const end = to != null ? +to : info.duration;
    const first = Math.round(from * fps), last = Math.round(end * fps); // exclusive
    const total = last - first;
    const W = preview ? Math.round(info.config.width / 2) : info.config.width;
    const H = preview ? Math.round(info.config.height / 2) : info.config.height;
    const freeGB = os.freemem() / 2 ** 30; const byMem = Math.max(1, Math.floor((freeGB - 0.4) / 0.9)); // ~0.9 GB per worker (Chrome page + x264)
    const N = Math.max(1, Math.min(+(workers || Math.min(byMem, Math.max(1, Math.floor(cpuCount() / 2)))), 6, Math.ceil(total / 30)));
    const lowMem = freeGB < 3;
    log(`render ${path.basename(comp)} → ${total} frames @${fps}fps (${(total / fps).toFixed(2)}s, ${W}x${H}) with ${N} workers (${freeGB.toFixed(1)} GB free RAM)`);
    const tmp = outFile + '.parts'; fs.rmSync(tmp, { recursive: true, force: true }); mkdirp(tmp);
    let doneFrames = 0; let lastLog = 0;
    const chunk = Math.ceil(total / N);
    const jobs = Array.from({ length: N }, (_, i) => ({ i, a: first + i * chunk, b: Math.min(last, first + (i + 1) * chunk) })).filter((j) => j.b > j.a);
    await Promise.all(jobs.map(async (j) => {
      const { page } = await openComp(browser, comp);
      const seg = path.join(tmp, `seg${String(j.i).padStart(2, '0')}.mp4`);
      const ff = spawnFF(['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        ...(preview ? ['-vf', `scale=${W}:${H}:flags=lanczos`] : []),
        '-c:v', 'libx264', '-preset', preview ? 'veryfast' : lowMem ? 'medium' : 'slow', '-threads', lowMem ? '2' : '0', '-x264-params', lowMem ? 'rc-lookahead=10:ref=3' : 'rc-lookahead=40', '-crf', String(preview ? 22 : crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
        '-r', String(fps), '-video_track_timescale', String(fps * 1000), seg]);
      for (let f = j.a; f < j.b; f++) {
        await page.evaluate((ms) => window.__seek(ms), (f / fps) * 1000);
        const buf = await page.screenshot({ type: 'jpeg', quality: preview ? 85 : 95 });
        if (ff.exitCode != null) await ff.done;
        if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), ff.done]);
        doneFrames++;
        if (Date.now() - lastLog > 4000) { lastLog = Date.now(); log(`  ${doneFrames}/${total} frames (${((doneFrames / total) * 100).toFixed(0)}%)`); }
      }
      ff.stdin.end(); await ff.done; await page.close();
      j.seg = seg;
    }));
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, jobs.map((j) => `file '${j.seg.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outFile]);
    fs.rmSync(tmp, { recursive: true, force: true });
    log(`video → ${outFile} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return info;
  } finally { await browser.close(); }
}
