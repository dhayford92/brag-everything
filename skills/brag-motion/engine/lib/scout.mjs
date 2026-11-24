// Static scan of a project: what it is, how to run it, what real brand assets / media / copy already exist.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.turbo', '.vercel', '.cache', 'coverage', 'brag', '.expo', 'Pods', '.dart_tool', 'vendor', '__pycache__', '.venv', 'venv', 'target']);
const IMG = /\.(png|jpe?g|webp|gif|svg|avif)$/i, VID = /\.(mp4|webm|mov|m4v)$/i, FONT = /\.(woff2?|ttf|otf)$/i;

function walk(dir, depth = 0, out = []) {
  if (depth > 7) return out;
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.storybook') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, depth + 1, out); }
    else out.push(p);
    if (out.length > 20000) break;
  }
  return out;
}
const read = (p, max = 400000) => { try { const s = fs.statSync(p); if (s.size > max) return ''; return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const sz = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };

export function scout(dir) {
  dir = path.resolve(dir);
  const files = walk(dir); const rel = (p) => path.relative(dir, p).replace(/\\/g, '/');
  const pkgPath = path.join(dir, 'package.json'); const pkg = fs.existsSync(pkgPath) ? JSON.parse(read(pkgPath) || '{}') : null;
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (d) => Object.keys(deps).some((k) => k === d || k.startsWith(d + '/'));
  const stack = [];
  for (const [k, n] of [['next', 'Next.js'], ['vite', 'Vite'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['@sveltejs/kit', 'SvelteKit'], ['astro', 'Astro'], ['nuxt', 'Nuxt'], ['@angular/core', 'Angular'], ['expo', 'Expo'], ['react-native', 'React Native'], ['electron', 'Electron'], ['tailwindcss', 'Tailwind'], ['framer-motion', 'Framer Motion'], ['three', 'three.js'], ['@remix-run/react', 'Remix'], ['express', 'Express'], ['fastify', 'Fastify']]) if (has(k)) stack.push(n);
  if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) stack.push('Flutter');
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'requirements.txt'))) stack.push('Python');
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) stack.push('Rust');
  if (fs.existsSync(path.join(dir, 'go.mod'))) stack.push('Go');

  // how to run it
  const scripts = pkg?.scripts || {}; const runCmd = ['dev', 'start', 'serve', 'preview', 'storybook'].find((s) => scripts[s]);
  const pm = fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock')) ? 'bun' : 'npm';
  let port = null; const sc = runCmd ? scripts[runCmd] : '';
  const pm_ = sc.match(/(?:--port|-p)\s+(\d{2,5})/); if (pm_) port = +pm_[1];
  else if (stack.includes('Next.js') || stack.includes('Remix') || stack.includes('Nuxt')) port = 3000; else if (stack.includes('Vite') || stack.includes('SvelteKit')) port = 5173; else if (stack.includes('Astro')) port = 4321; else if (stack.includes('Angular')) port = 4200;
  const staticIndex = ['index.html', 'public/index.html', 'docs/index.html', 'site/index.html'].map((p) => path.join(dir, p)).find((p) => fs.existsSync(p));

  // story
  const readmeP = files.find((f) => /^readme\.md$/i.test(path.basename(f)) && path.dirname(f) === dir);
  const readme = readmeP ? read(readmeP) : '';
  const title = readme.match(/^#\s+(.+)$/m)?.[1]?.replace(/<[^>]+>/g, '').trim() || pkg?.name || path.basename(dir);
  const paras = readme.replace(/<[^>]+>/g, '').split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#') && !s.startsWith('![') && !s.startsWith('[!') && !s.startsWith('```') && s.length > 30);
  const tagline = pkg?.description || paras[0]?.split('\n').join(' ').slice(0, 240) || '';
  const features = (readme.match(/^\s*[-*]\s+(.{8,120})$/gm) || []).slice(0, 24).map((s) => s.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '').trim());
  let git = [];
  const g = spawnSync('git', ['-C', dir, 'log', '-n', '40', '--pretty=format:%h %ad %s', '--date=short'], { encoding: 'utf8' });
  if (g.status === 0) git = g.stdout.split('\n').filter(Boolean);
  const tags = spawnSync('git', ['-C', dir, 'tag', '--sort=-creatordate'], { encoding: 'utf8' }).stdout?.split('\n').filter(Boolean).slice(0, 5) || [];
  const changelogP = files.find((f) => /^changelog\.md$/i.test(path.basename(f)));
  const changelog = changelogP ? read(changelogP).slice(0, 4000) : '';

  // brand: logos, colours, fonts
  const logos = files.filter((f) => IMG.test(f) && /(logo|brand|mark|icon|favicon|wordmark|apple-touch)/i.test(rel(f)) && !/node_modules/.test(f)).sort((a, b) => score(b) - score(a)).slice(0, 12).map(rel);
  function score(f) { const r = rel(f).toLowerCase(); return (r.includes('logo') ? 5 : 0) + (r.endsWith('.svg') ? 3 : 0) + (r.includes('public') ? 2 : 0) - (r.includes('favicon') ? 1 : 0) - r.split('/').length * 0.2; }
  const colorFiles = files.filter((f) => /\.(css|scss|sass|less)$/i.test(f) || /tailwind\.config\.(js|ts|cjs|mjs)$/.test(f) || /(theme|tokens|colors?)\.(ts|js|json)$/i.test(path.basename(f))).slice(0, 80);
  const vars = {}; const hexCount = {};
  for (const f of colorFiles) {
    const s = read(f);
    for (const m of s.matchAll(/--([\w-]*(?:primary|accent|brand|main|highlight|secondary|background|foreground|ink|text)[\w-]*)\s*:\s*([^;]+);/gi)) vars[m[1]] = vars[m[1]] || m[2].trim();
    for (const m of s.matchAll(/(?:primary|accent|brand)[\w-]*['"]?\s*:\s*['"]?(#[0-9a-f]{3,8}|rgb[^'"]+|hsl[^'"]+|oklch[^'"]+)/gi)) vars['cfg:' + m[0].split(/[:'"]/)[0].trim()] = m[1];
    for (const m of s.matchAll(/#([0-9a-f]{6})\b/gi)) { const k = '#' + m[1].toLowerCase(); hexCount[k] = (hexCount[k] || 0) + 1; }
  }
  const sat = (hx) => { const n = parseInt(hx.slice(1), 16); const r = (n >> 16) & 255, g_ = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, g_, b), mn = Math.min(r, g_, b); return mx ? (mx - mn) / mx : 0; };
  const palette = Object.entries(hexCount).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, c]) => ({ hex: k, uses: c, saturation: +sat(k).toFixed(2) }));
  const accentGuess = palette.filter((p) => p.saturation > 0.45).sort((a, b) => b.uses - a.uses)[0]?.hex || null;
  const fonts = new Set();
  for (const f of files.filter((x) => /\.(css|scss|tsx?|jsx?|html|vue|svelte|astro)$/.test(x)).slice(0, 400)) {
    const s = read(f, 200000);
    for (const m of s.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) fonts.add(m[1].split(',')[0].replace(/['"]/g, '').trim());
    for (const m of s.matchAll(/from\s+['"]next\/font\/google['"]/g)) { const im = s.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google/); if (im) im[1].split(',').forEach((x) => fonts.add(x.trim().replace(/_/g, ' '))); }
    for (const m of s.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"')]+)/g)) fonts.add(decodeURIComponent(m[1]).split(':')[0].replace(/\+/g, ' '));
  }
  const fontFiles = files.filter((f) => FONT.test(f)).slice(0, 12).map(rel);

  const media = files.filter((f) => (IMG.test(f) || VID.test(f)) && !logos.includes(rel(f))).map((f) => ({ path: rel(f), kb: Math.round(sz(f) / 1024) })).filter((m) => m.kb > 4).sort((a, b) => b.kb - a.kb).slice(0, 60);
  const videos = media.filter((m) => VID.test(m.path));
  const routes = files.map(rel).filter((r) => /(^|\/)(app|pages|src\/routes|src\/pages)\/.+\/(page|index|\+page)\.(tsx?|jsx?|svelte|vue|astro|mdx?)$/.test(r) || /(^|\/)(app|pages)\/(page|index)\.(tsx?|jsx?)$/.test(r)).slice(0, 60)
    .map((r) => '/' + r.replace(/^(src\/)?(app|pages|routes)\//, '').replace(/\/?(page|index|\+page)\.\w+$/, '').replace(/\(.*?\)\/?/g, '').replace(/\[([^\]]+)\]/g, ':$1')).filter((v, i, a) => a.indexOf(v) === i);
  const seeds = files.map(rel).filter((r) => /(seed|fixture|mock|example\.env|\.env\.example|demo-data)/i.test(r)).slice(0, 20);
  const tests = files.map(rel).filter((r) => /(playwright\.config|cypress\.config|e2e\/|\.spec\.(t|j)sx?$)/.test(r)).slice(0, 10);

  return {
    dir, name: pkg?.name || path.basename(dir), title, tagline, features, stack,
    run: { packageManager: pm, script: runCmd || null, command: runCmd ? `${pm} run ${runCmd}` : null, port, staticIndex: staticIndex ? rel(staticIndex) : null },
    routes, recentCommits: git, tags, changelog: changelog ? changelog.slice(0, 1500) : null,
    brand: { logos, cssVars: vars, accentGuess, palette: palette.slice(0, 14), fonts: [...fonts].filter((f) => f && !/inherit|var\(|system-ui|sans-serif|monospace/.test(f)).slice(0, 10), fontFiles },
    media, videos, seeds, tests,
  };
}
