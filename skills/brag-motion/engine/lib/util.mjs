import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL = path.resolve(ENGINE, '..');

export const FFMPEG = process.env.BRAG_FFMPEG || require('ffmpeg-static');
export const FFPROBE = process.env.BRAG_FFPROBE || require('ffprobe-static').path;

export function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2); const nxt = argv[i + 1];
      if (nxt == null || nxt.startsWith('--')) out[k] = true; else { out[k] = nxt; i++; }
    } else out._.push(a);
  }
  return out;
}

export function findChrome() {
  if (process.env.BRAG_CHROME && fs.existsSync(process.env.BRAG_CHROME)) return process.env.BRAG_CHROME;
  const L = process.env.LOCALAPPDATA || '';
  const cands = process.platform === 'win32' ? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'D:/Program Files/Google/Chrome/Application/chrome.exe', path.join(L, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null; // fall back to playwright's bundled chromium (npx playwright install chromium)
}

export async function launch(opts = {}) {
  const { chromium } = await import('playwright-core');
  const exe = findChrome();
  return chromium.launch({
    executablePath: exe || undefined, headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none', '--allow-file-access-from-files', ...(opts.args || [])],
  });
}

export function run(bin, argv, { quiet = true } = {}) {
  const r = spawnSync(bin, argv, { stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} failed (${r.status}):\n${r.stderr?.toString().slice(-3000)}`);
  return r.stdout?.toString() || '';
}

export function spawnFF(argv) {
  const p = spawn(FFMPEG, argv, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  p.stdin.on('error', () => {}); // a dying ffmpeg surfaces through p.done with its stderr, not an EPIPE crash
  p.done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c + '\n' + err.slice(-3000))))));
  return p;
}

export function probeDuration(file) {
  const o = run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(o);
}

export const cpuCount = () => (os.availableParallelism ? os.availableParallelism() : os.cpus().length);
export const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });
export const fileUrl = (p) => 'file:///' + path.resolve(p).replace(/\\/g, '/').replace(/^\/+/, '');
export const log = (...a) => console.log('[brag]', ...a);
