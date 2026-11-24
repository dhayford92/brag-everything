// Capture the REAL product: crawl a running app, screenshot pages + prominent components at 2x,
// and run scripted flows (click / type / scroll) that save flipbook frames of the product doing its job.
import fs from 'node:fs';
import path from 'node:path';
import { launch, mkdirp, log, FFMPEG, run } from './util.mjs';

const slug = (s) => String(s).toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'root';

export async function capture(spec) {
  const out = path.resolve(spec.out || 'brag/assets/capture'); mkdirp(out);
  const base = spec.baseUrl.replace(/\/$/, '');
  const vp = spec.viewport || { width: 1440, height: 900 };
  const dpr = spec.dpr || 2;
  // wait for the dev server (a cold `npm run dev` can take a while; a race lands on chrome-error://)
  const deadline = Date.now() + (spec.serverTimeout || 90000); let up = false;
  while (Date.now() < deadline) { try { const r = await fetch(base + '/', { redirect: 'manual' }); if (r.status < 500) { up = true; break; } } catch {} await new Promise((r) => setTimeout(r, 750)); }
  if (!up) throw new Error(`${base} is not answering — start the app first (see scout.json → run.command)`);
  const browser = await launch();
  const manifest = { baseUrl: base, viewport: vp, dpr, pages: [], components: [], flows: [], brand: null, mobile: [] };
  try {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, colorScheme: spec.colorScheme || 'light', reducedMotion: 'no-preference', ...(spec.storageState ? { storageState: spec.storageState } : {}) });
    // no red spell-check squiggles in typed fields (they ruin a "postable" frame)
    const noSpell = () => { const off = () => document.querySelectorAll('textarea,input,[contenteditable]').forEach((e) => { e.spellcheck = false; }); document.addEventListener('DOMContentLoaded', off); new MutationObserver(off).observe(document, { childList: true, subtree: true }); };
    await ctx.addInitScript(noSpell);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));

    // ---------- crawl ----------
    const max = spec.crawl === false ? 0 : spec.crawl?.maxPages ?? 10;
    const queue = [...new Set(['/', ...(spec.routes || [])])]; const seen = new Set();
    while (queue.length && manifest.pages.length < Math.max(max, (spec.routes || []).length)) {
      const route = queue.shift(); if (seen.has(route)) continue; seen.add(route);
      const url = route.startsWith('http') ? route : base + route;
      try { await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }); } catch { try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); } catch (e) { log('skip ' + url + ': ' + e.message.split('\n')[0]); continue; } }
      await settle(page);
      const id = slug(route === '/' ? 'home' : route);
      const view = path.join(out, `page-${id}.png`); await page.screenshot({ path: view });
      const full = path.join(out, `page-${id}-full.png`); await page.screenshot({ path: full, fullPage: true }).catch(() => {});
      const meta = await page.evaluate(() => {
        const q = (s) => document.querySelector(s); const cs = (el) => (el ? getComputedStyle(el) : null);
        const btn = [...document.querySelectorAll('button, a[class*="btn"], a[class*="button"], [role=button]')].map((b) => cs(b).backgroundColor).filter((c) => c && !/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)|transparent/.test(c));
        const freq = {}; btn.forEach((c) => (freq[c] = (freq[c] || 0) + 1));
        return {
          title: document.title, description: q('meta[name=description]')?.content || q('meta[property="og:description"]')?.content || '',
          ogImage: q('meta[property="og:image"]')?.content || null, icon: q('link[rel~=icon]')?.href || null,
          h1: [...document.querySelectorAll('h1,h2')].slice(0, 6).map((h) => h.innerText.trim()).filter(Boolean),
          bodyFont: cs(document.body).fontFamily, headingFont: cs(q('h1') || q('h2') || document.body).fontFamily,
          bg: cs(document.body).backgroundColor, text: cs(document.body).color, buttonColors: Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4),
          links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/') && !h.startsWith('//') && !/\.(png|jpg|pdf|zip)$/.test(h)).slice(0, 80),
          images: [...document.images].filter((i) => i.naturalWidth > 200).map((i) => i.currentSrc).slice(0, 20),
        };
      });
      if (!manifest.brand) manifest.brand = { title: meta.title, description: meta.description, ogImage: meta.ogImage, icon: meta.icon, bodyFont: meta.bodyFont, headingFont: meta.headingFont, bg: meta.bg, text: meta.text, buttonColors: meta.buttonColors };
      manifest.pages.push({ route, url, view: rel(out, view), full: rel(out, full), h1: meta.h1, images: meta.images });
      for (const l of meta.links) { const clean = l.split('#')[0].split('?')[0]; if (clean && !seen.has(clean) && !queue.includes(clean)) queue.push(clean); }
      // prominent components: rounded / shadowed blocks of a useful size
      if (spec.components !== false) {
        const boxes = await page.evaluate(() => {
          const out = []; const vw = innerWidth, vh = innerHeight;
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect(); if (r.width < 220 || r.height < 120 || r.width > vw * 0.92 || r.top > vh * 2.5 || r.top < -10) continue;
            const s = getComputedStyle(el); const rad = parseFloat(s.borderTopLeftRadius) || 0; const sh = s.boxShadow !== 'none'; const bd = parseFloat(s.borderTopWidth) > 0; const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)';
            const tag = el.tagName.toLowerCase(); const sem = ['form', 'table', 'nav', 'aside', 'dialog', 'article', 'section', 'pre', 'canvas', 'video', 'svg', 'figure'].includes(tag);
            if (!((rad >= 6 && (sh || bd || bg)) || sem)) continue;
            out.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, tag, cls: String(el.className).slice(0, 60), score: (sh ? 3 : 0) + (rad >= 10 ? 2 : 0) + (sem ? 2 : 0) + Math.min(3, (r.width * r.height) / 120000) });
          }
          out.sort((a, b) => b.score - a.score);
          const keep = []; for (const b of out) { if (keep.some((k) => ovl(k, b) > 0.5)) continue; keep.push(b); if (keep.length >= 6) break; }
          function ovl(a, b) { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)); const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return (x * y) / Math.min(a.w * a.h, b.w * b.h); }
          return keep;
        });
        for (const [i, b] of boxes.entries()) {
          const f = path.join(out, `comp-${id}-${i}.png`);
          try { await page.screenshot({ path: f, fullPage: true, clip: { x: Math.max(0, b.x - 1), y: Math.max(0, b.y - 1), width: b.w + 2, height: b.h + 2 } }); manifest.components.push({ route, file: rel(out, f), tag: b.tag, cls: b.cls, w: Math.round(b.w), h: Math.round(b.h) }); } catch {}
        }
      }
    }

    // ---------- scripted flows: the product doing its job ----------
    for (const flow of spec.flows || []) {
      const fdir = path.join(out, 'flow-' + slug(flow.name)); mkdirp(fdir);
      const fp = flow.mobile ? await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage() : page;
      const frames = []; let k = 0;
      const snap = async (label, sel) => {
        const f = path.join(fdir, `${String(k++).padStart(3, '0')}-${slug(label)}.png`);
        if (sel || flow.clip) await fp.locator(sel || flow.clip).first().screenshot({ path: f }); else await fp.screenshot({ path: f });
        const box = sel || flow.clip ? await fp.locator(sel || flow.clip).first().boundingBox() : null;
        frames.push({ file: rel(out, f), label, box }); return f;
      };
      for (const st of flow.steps) {
        try {
          if (st.goto) { await fp.goto(st.goto.startsWith('http') ? st.goto : base + st.goto, { waitUntil: 'networkidle' }).catch(() => fp.goto(base + st.goto)); await settle(fp); }
          if (st.wait) await fp.waitForTimeout(st.wait);
          if (st.waitFor) await fp.locator(st.waitFor).first().waitFor({ timeout: 15000 });
          if (st.hover) await fp.locator(st.hover).first().hover();
          if (st.click) { const loc = fp.locator(st.click).first(); const bb = await loc.boundingBox(); if (bb) frames.push({ label: 'target:' + st.click, target: { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, w: bb.width, h: bb.height } }); await loc.click(); await settle(fp, st.settle); }
          if (st.fill) await fp.locator(st.fill.selector).first().fill(st.fill.text);
          if (st.type) {
            const loc = fp.locator(st.type.selector).first(); await loc.click(); const every = st.type.every || 3; const txt = st.type.text;
            for (let i = 0; i < txt.length; i++) { await fp.keyboard.type(txt[i]); if (st.type.frames && (i % every === every - 1 || i === txt.length - 1)) await snap(`type-${i + 1}`, st.type.clip); }
          }
          if (st.press) { await fp.keyboard.press(st.press); await settle(fp, st.settle); }
          if (st.scroll) { await fp.mouse.wheel(0, st.scroll); await fp.waitForTimeout(400); }
          if (st.shot) await snap(st.shot.name || st.shot || 'shot', st.shot.selector);
        } catch (e) { log(`flow "${flow.name}" step ${JSON.stringify(st)} failed: ${e.message.split('\n')[0]}`); frames.push({ error: e.message.split('\n')[0], step: st }); }
      }
      if (flow.video) { /* optional real-time clip of the final state */ }
      manifest.flows.push({ name: flow.name, dir: rel(out, fdir), frames });
    }

    // ---------- mobile pass ----------
    if (spec.mobile) {
      const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const mp = await mctx.newPage();
      for (const route of (spec.mobileRoutes || ['/']).slice(0, 6)) {
        try { await mp.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 }); await settle(mp); const f = path.join(out, `mobile-${slug(route === '/' ? 'home' : route)}.png`); await mp.screenshot({ path: f }); manifest.mobile.push({ route, file: rel(out, f) }); } catch (e) { log('mobile skip ' + route); }
      }
    }
    manifest.errors = errors.slice(0, 20);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  // contact sheet so the agent can LOOK at the real interface before planning
  try {
    const list = [...manifest.pages.map((p) => p.view), ...manifest.components.map((c) => c.file), ...manifest.mobile.map((m) => m.file)].slice(0, 30);
    if (list.length) {
      const inputs = list.flatMap((f) => ['-i', path.join(out, f)]);
      const cols = Math.min(5, list.length), rows = Math.ceil(list.length / cols);
      const filt = list.map((_, i) => `[${i}:v]scale=420:260:force_original_aspect_ratio=decrease,pad=430:270:(ow-iw)/2:(oh-ih)/2:color=white[v${i}]`).join(';') + ';' + list.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${list.length}:layout=${list.map((_, i) => `${(i % cols) * 430}_${Math.floor(i / cols) * 270}`).join('|')}:fill=white[o]`;
      if (list.length === 1) run(FFMPEG, ['-y', ...inputs, '-vf', 'scale=860:-1', path.join(out, 'contact.png')]);
      else run(FFMPEG, ['-y', ...inputs, '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', path.join(out, 'contact.png')]);
    }
  } catch (e) { log('contact sheet failed: ' + e.message.split('\n')[0]); }
  log(`captured ${manifest.pages.length} pages, ${manifest.components.length} components, ${manifest.flows.length} flows → ${out}`);
  return manifest;
}

async function settle(page, ms = 700) {
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  await page.waitForTimeout(ms);
}
const rel = (base, f) => path.relative(base, f).replace(/\\/g, '/');
