/* brag-motion runtime v1
 * Deterministic, beat-locked motion compositions in plain HTML.
 *  - Every animation is a paused Web Animation; window.__seek(ms) sets all of them → frame-exact renders.
 *  - Time is authored in BEATS. Scene i starts on a beat; every helper takes `at` in beats relative to its scene.
 *  - Helpers record sound events (cut / whoosh / impact / pop / click / key / swap / confetti) on the same grid,
 *    so the score engine can place effects exactly where the picture moves.
 */
(() => {
  const B = (window.Brag = {});
  const C = {
    bpm: 120, fps: 30, width: 1920, height: 1080,
    accent: '#FF6A13', accent2: '#FFB547', ink: '#101218', muted: '#6B7080', paper: '#F3F4F7', paper2: '#E6E8EE',
    font: "'DM Sans Variable', system-ui, sans-serif", display: null,
    grain: 0.035, vignette: true, seed: 7,
    key: 'F', mode: 'major', music: 'bright-pop', title: 'brag', voice: false,
  };
  const ticks = [];
  const events = [];
  const scenes = [];
  const mediaEls = [];
  let totalBeats = 0;
  let root, grainEl;
  B.config = C;
  B.scenes = scenes;

  /* ---------------- utils ---------------- */
  const spb = () => 60 / C.bpm;
  B.ms = (beats) => beats * spb() * 1000;
  B.sec = (beats) => beats * spb();
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    out: (t) => 1 - Math.pow(1 - t, 4),
    inOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    in: (t) => t * t * t,
    lin: (t) => t,
  };
  B.ease = ease;
  // spring as a CSS linear() easing (Chrome 113+) — the soft overshoot the references use on pops
  const springCss = (() => {
    const pts = []; const k = 170, d = 15; let x = 0, v = 0; const dt = 1 / 600;
    for (let i = 0; i <= 600; i++) { if (i % 15 === 0) pts.push(+x.toFixed(4)); const a = k * (1 - x) - d * v; v += a * dt; x += v * dt; }
    pts[pts.length - 1] = 1; return `linear(${pts.join(',')})`;
  })();
  const EASE = {
    out: 'cubic-bezier(.16,1,.3,1)', soft: 'cubic-bezier(.22,1,.36,1)', inOut: 'cubic-bezier(.65,0,.35,1)',
    in: 'cubic-bezier(.7,0,.84,0)', back: 'cubic-bezier(.34,1.45,.64,1)', spring: springCss, linear: 'linear',
  };
  B.EASE = EASE;
  let _seed = 1;
  const rng = (s) => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; };
  B.rng = rng;
  const hexRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  const h = (tag, attrs = {}, kids = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of [].concat(kids)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  B.h = h;

  B.event = (type, beat, data = {}) => { events.push({ type, beat: +beat.toFixed(4), ...data }); };

  /* ---------------- core animation ---------------- */
  // at/dur in beats, relative to scene `s` (or absolute if s is null)
  B.anim = (el, kf, { s = null, at = 0, dur = 1, ease: e = 'out', fill = 'both' } = {}) => {
    const abs = (s ? s.start : 0) + at;
    const a = el.animate(kf, { delay: B.ms(abs), duration: Math.max(1, B.ms(dur)), easing: EASE[e] || e, fill });
    a.pause();
    a.currentTime = 0;
    return a;
  };
  B.tick = (fn) => ticks.push(fn);

  /* ---------------- config / scaffold ---------------- */
  B.setup = (opts = {}) => {
    Object.assign(C, opts);
    const r = document.documentElement.style;
    const [ar, ag, ab] = hexRgb(C.accent);
    r.setProperty('--W', C.width + 'px'); r.setProperty('--H', C.height + 'px');
    r.setProperty('--accent', C.accent); r.setProperty('--accent-rgb', `${ar},${ag},${ab}`); r.setProperty('--accent2', C.accent2);
    r.setProperty('--ink', C.ink); r.setProperty('--muted', C.muted); r.setProperty('--paper', C.paper); r.setProperty('--paper2', C.paper2);
    r.setProperty('--font', C.font); r.setProperty('--display', C.display || C.font); r.setProperty('--grain', C.grain);
    root = document.getElementById('brag-root') || document.body.appendChild(h('div', { id: 'brag-root' }));
    if (C.vignette) root.append(h('div', { id: 'brag-vignette' }));
    grainEl = h('div', { id: 'brag-grain' }); root.append(grainEl);
    grainEl.style.backgroundImage = `url(${makeGrain()})`;
    _seed = C.seed;
    return B;
  };
  function makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const d = x.createImageData(256, 256); const r = rng(99);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c.toDataURL();
  }

  /* ---------------- scenes ---------------- */
  // B.scene(name, beats, build(s), { in:'cut'|'blur'|'zoom'|'rise'|'whip'|'slam'|'dissolve', bg, energy:0-3, camera })
  B.scene = (name, beats, build, opt = {}) => {
    const start = totalBeats; totalBeats += beats;
    const el = h('section', { class: 'scene', 'data-name': name });
    const bg = h('div', { class: 'bg' }); const stage = h('div', { class: 'stage' }); const fx = h('div', { class: 'fx' }); const hud = h('div', { class: 'hud' });
    el.append(bg, stage, fx, hud);
    root.insertBefore(el, document.getElementById('brag-vignette') || grainEl);
    const s = { name, start, beats, end: start + beats, el, bg, stage, fx, hud, opt, energy: opt.energy ?? 1, in: opt.in || 'cut' };
    s.at = (b) => start + b;
    scenes.push(s);
    B.background(s, opt.bg ?? 'paper');
    if (opt.camera !== false) B.camera(s, opt.camera || { from: { s: 1 }, to: { s: 1.035 } });
    B.event('cut', start, { scene: name, in: s.in, energy: s.energy, beats });
    if (build) build(s);
    return s;
  };

  B.background = (s, kind) => {
    const k = typeof kind === 'string' ? { type: kind } : kind;
    s.bg.className = 'bg';
    if (k.type === 'paper') s.bg.classList.add('bg-paper', ...(k.grid === false ? [] : ['bg-grid']));
    else if (k.type === 'white') s.bg.classList.add('bg-white');
    else if (k.type === 'accent') s.bg.classList.add('bg-accent');
    else if (k.type === 'night') s.bg.classList.add('bg-night', ...(k.grid === false ? [] : ['bg-grid']));
    else if (k.type === 'image' || k.type === 'video') {
      s.bg.classList.add('bg-media'); s.bg.style.setProperty('--dim', k.dim ?? 0.18);
      const m = k.type === 'image' ? h('img', { src: k.src }) : B.media(k.src, { s, at: k.at || 0, rate: k.rate || 1 });
      m.style.filter = `blur(${k.blur ?? 0}px) saturate(${k.saturate ?? 1})`;
      s.bg.append(m);
      B.anim(m, [{ scale: 1.08 }, { scale: 1.0 }], { s, at: 0, dur: s.beats, ease: 'linear' });
    }
    if (k.shafts) { s.bg.classList.add('bg-shafts'); B.tick((t, beat) => s.bg.style.setProperty('--shaft-x', ((beat - s.start) * 14).toFixed(1) + 'px')); }
  };

  // camera: {from:{x,y,s,rx,ry,rz}, to:{...}, ease}
  B.camera = (s, { from = {}, to = {}, at = 0, dur, ease: e = 'inOut' } = {}) => {
    const tf = (o) => `translate3d(${o.x || 0}px, ${o.y || 0}px, 0) rotateX(${o.rx || 0}deg) rotateY(${o.ry || 0}deg) rotateZ(${o.rz || 0}deg) scale(${o.s ?? 1})`;
    if (s._cam) s._cam.cancel();
    s._cam = B.anim(s.stage, [{ transform: tf(from) }, { transform: tf(to) }], { s, at, dur: dur ?? s.beats - at, ease: e });
    return s._cam;
  };

  /* ---------------- media (seekable video) ---------------- */
  B.media = (src, { s = null, at = 0, rate = 1, loop = false } = {}) => {
    const v = h('video', { src, muted: true, playsinline: true, preload: 'auto' });
    v.muted = true;
    const start = (s ? s.start : 0) + at;
    mediaEls.push({ v, start, rate, loop });
    return v;
  };

  /* ---------------- placement ---------------- */
  // Place an object centred at (x,y) in comp px, optional static 3D tilt, optional idle float.
  B.place = (s, el, { x = C.width / 2, y = C.height / 2, w, rx = 0, ry = 0, rz = 0, z = 0, float = 0.6, parent, anchor = 'center' } = {}) => {
    const o = h('div', { class: 'obj' });
    o.style.left = x + 'px'; o.style.top = y + 'px';
    if (w) o.style.width = w + 'px';
    const tr = anchor === 'center' ? 'translate(-50%,-50%)' : anchor === 'left' ? 'translate(0,-50%)' : 'translate(-100%,-50%)';
    o.style.transform = `${tr} translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
    o.append(el);
    (parent || s.stage).append(o);
    if (float) {
      const ph = (_seed = (_seed * 9301 + 49297) % 233280) / 233280 * Math.PI * 2;
      const amp = 7 * float;
      B.tick((t, beat) => { const b = beat - s.start; o.style.translate = `${(Math.cos(b * 0.37 + ph) * amp * 0.6).toFixed(2)}px ${(Math.sin(b * 0.5 + ph) * amp).toFixed(2)}px`; });
    }
    return o;
  };

  /* ---------------- entrances / exits ---------------- */
  const INS = {
    blur: [{ opacity: 0, filter: 'blur(18px)', translate: '0 40px' }, { opacity: 1, filter: 'blur(0px)', translate: '0 0' }],
    rise: [{ opacity: 0, translate: '0 140px', scale: 0.96 }, { opacity: 1, translate: '0 0', scale: 1 }],
    pop: [{ opacity: 0, scale: 0.82, filter: 'blur(10px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)' }],
    left: [{ opacity: 0, translate: '-220px 0', filter: 'blur(14px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }],
    right: [{ opacity: 0, translate: '220px 0', filter: 'blur(14px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }],
    drop: [{ opacity: 0, translate: '0 -160px', filter: 'blur(14px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }],
    zoom: [{ opacity: 0, scale: 1.35, filter: 'blur(20px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
  };
  const OUTS = {
    blur: [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(18px)' }],
    up: [{ opacity: 1, translate: '0 0', filter: 'blur(0px)' }, { opacity: 0, translate: '0 -90px', filter: 'blur(12px)' }],
    down: [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 160px' }],
    shrink: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }],
    fade: [{ opacity: 1 }, { opacity: 0 }],
  };
  B.in = (s, el, kind = 'blur', { at = 0, dur = 1, ease: e, sound = 'pop' } = {}) => {
    const a = B.anim(el, INS[kind] || kind, { s, at, dur, ease: e || (kind === 'pop' || kind === 'rise' ? 'spring' : 'out') });
    if (sound) B.event(sound, s.start + at);
    return a;
  };
  B.out = (s, el, kind = 'blur', { at, dur = 0.75, ease: e = 'in' } = {}) =>
    B.anim(el, OUTS[kind] || kind, { s, at: at ?? s.beats - dur, dur, ease: e, fill: 'forwards' });

  /* ---------------- type ---------------- */
  // "*word*" = accent colour, "\n" = line break. Words resolve from blur, one by one, on the grid.
  B.words = (s, text, { at = 0, stagger = 0.25, dur = 1, cls = 't t-l', x, y, w, parent, align = 'center', kind = 'blur', sound = 'word', place = true } = {}) => {
    const el = h('div', { class: cls });
    el.style.textAlign = align;
    if (w) el.style.width = w + 'px';
    let i = 0;
    for (const line of String(text).split('\n')) {
      const ln = h('div');
      for (const raw of line.split(/(\s+)/)) {
        if (!raw) continue;
        if (/^\s+$/.test(raw)) { ln.append(' '); continue; }
        const acc = /^\*.*\*[.,!?:;]*$/.test(raw);
        const word = raw.replace(/\*/g, '');
        const sp = h('span', { class: 'w' + (acc ? ' accent' : ''), text: word });
        ln.append(sp);
        B.anim(sp, INS[kind] || INS.blur, { s, at: at + i * stagger, dur, ease: 'out' });
        if (sound && i === 0) B.event(sound, s.start + at);
        i++;
      }
      el.append(ln);
    }
    el.wordCount = i;
    el.endBeat = at + (i - 1) * stagger + dur;
    if (place) return B.place(s, el, { x, y, w, float: 0.25, parent, anchor: align === 'left' ? 'left' : align === 'right' ? 'right' : 'center' }), el;
    (parent || s.stage).append(el);
    return el;
  };

  // Typewriter, locked to the grid: `rate` = beats per character (0.25 = one char per 16th note).
  B.type = (s, parent, text, { at = 0, rate = 0.25, caret = true, keepCaret = false, cls } = {}) => {
    const el = h('span', { class: cls || '' });
    const txt = h('span'); el.append(txt);
    const car = caret ? h('span', { class: 'caret' }) : null; if (car) el.append(car);
    parent.append(el);
    const n = text.length; const t0 = s.start + at; const t1 = t0 + n * rate;
    for (let i = 0; i < n; i++) if (text[i] !== ' ') B.event('key', t0 + i * rate);
    B.tick((t, beat) => {
      const k = clamp(Math.floor((beat - t0) / rate) + 1, 0, n);
      txt.textContent = beat < t0 ? '' : text.slice(0, k);
      if (car) {
        const typing = beat >= t0 && beat < t1;
        const blinkOn = Math.floor((beat - t0) * 2) % 2 === 0;
        car.style.opacity = typing ? 1 : (beat > t1 + 1 && !keepCaret) ? 0 : blinkOn ? 1 : 0;
      }
    });
    el.endBeat = at + n * rate;
    return el;
  };

  // Typing sound events only (for captured typing flipbooks): one key per `rate` beats.
  B.keys = (s, { at = 0, until, rate = 0.25 } = {}) => { for (let b = at; b < until - 1e-6; b += rate) B.event('key', s.start + b); };

  // Word rotator: one slot, words swap with a blur-up on the grid.
  B.swap = (s, parent, words, { at = 0, every = 2, cls = '', hold = true } = {}) => {
    const box = h('span', { class: 'swap ' + cls, style: { position: 'relative', display: 'inline-grid' } });
    words.forEach((wd, i) => {
      const sp = h('span', { class: 'w', html: wd.replace(/\*(.+?)\*/g, '<span class="accent">$1</span>'), style: { gridArea: '1/1' } });
      box.append(sp);
      B.anim(sp, INS.blur, { s, at: at + i * every, dur: 0.75 });
      if (!(hold && i === words.length - 1)) B.anim(sp, OUTS.up, { s, at: at + (i + 1) * every - 0.5, dur: 0.5, ease: 'in', fill: 'forwards' });
      B.event('swap', s.start + at + i * every);
    });
    parent.append(box);
    return box;
  };

  // Giant kinetic line the camera tracks across (the "What if you had one smart system" move).
  B.marquee = (s, text, { at = 0, dur, size = 200, from = 140, to, cls = 't' } = {}) => {
    const row = h('div', { class: 'marquee ' + cls, style: { fontSize: size + 'px' } });
    const words = String(text).split(' ');
    const spans = words.map((wd) => { const acc = /^\*.*\*$/.test(wd); const sp = h('span', { class: 'w' + (acc ? ' accent' : ''), text: wd.replace(/\*/g, '') }); row.append(sp); return sp; });
    s.stage.append(row);
    const D = dur ?? s.beats - at;
    // measure after fonts load (finalized in B.done)
    s._marquee = () => {
      const total = row.scrollWidth; const end = to ?? -(total - C.width + 140);
      B.anim(row, [{ translate: `${from}px -50%` }, { translate: `${end}px -50%` }], { s, at, dur: D, ease: 'inOut' });
      let acc = 0;
      spans.forEach((sp, i) => {
        const cx = acc + sp.offsetWidth / 2; acc += sp.offsetWidth + size * 0.28;
        const frac = clamp((cx + from - C.width * 0.55) / Math.max(1, (from - end)), 0, 1);
        const wb = at + frac * D * 0.92;
        B.anim(sp, [{ opacity: 0, filter: 'blur(24px)', translate: '0 0.25em' }, { opacity: 1, filter: 'blur(0px)', translate: '0 0' }], { s, at: wb, dur: 0.9 });
        if (i === 0) B.event('word', s.start + wb);
      });
    };
    return row;
  };

  /* ---------------- surfaces ---------------- */
  B.card = (s, src, { x, y, w = 900, rx = 0, ry = 0, rz = 0, z = 0, glow = true, radius, fill, at = 0, enter = 'rise', dur = 1.25, float = 0.6, parent, cls = '' } = {}) => {
    const c = h('div', { class: `card ${glow ? 'glow' : ''} ${fill ? 'fill' : ''} ${cls}` });
    if (radius != null) c.style.borderRadius = radius + 'px';
    if (typeof src === 'string') c.append(h('img', { src })); else if (src) c.append(src);
    const o = B.place(s, c, { x, y, w, rx, ry, rz, z, float, parent });
    if (enter) B.in(s, c, enter, { at, dur });
    o.card = c;
    return o;
  };
  B.window = (s, src, { title = '', url = '', ...o } = {}) => {
    const wrap = h('div');
    const bar = h('div', { class: 'win-bar' }, [h('i'), h('i'), h('i'), url ? h('span', { class: 'url', text: url }) : title ? h('span', { text: title }) : null]);
    wrap.append(bar);
    if (typeof src === 'string') wrap.append(h('img', { src, style: { display: 'block', width: '100%' } })); else if (src) wrap.append(src);
    return B.card(s, wrap, o);
  };
  B.phone = (s, src, { w = 440, ...o } = {}) => {
    const p = h('div', { class: 'phone' }); const sc = h('div', { class: 'screen' }); p.append(sc, h('div', { class: 'island' }));
    if (typeof src === 'string') sc.append(h('img', { src })); else if (src) sc.append(src);
    const obj = B.place(s, p, { w, ...o });
    if (o.enter !== false) B.in(s, p, o.enter || 'rise', { at: o.at || 0, dur: o.dur || 1.25 });
    obj.screen = sc; obj.phone = p;
    return obj;
  };
  // flipbook of captured app states: frames = [{src, at}] (at in beats, scene-relative)
  B.flip = (s, frames, { fade = 0.12 } = {}) => {
    const f = h('div', { class: 'flip' });
    frames.forEach((fr, i) => {
      const img = h('img', { src: fr.src }); f.append(img);
      if (i > 0) B.anim(img, [{ opacity: 0 }, { opacity: 1 }], { s, at: fr.at, dur: fr.fade ?? fade, ease: 'linear' });
    });
    return f;
  };

  /* ---------------- interaction ---------------- */
  const ARROW = '<svg width="44" height="56" viewBox="0 0 22 28"><path d="M2 1.5v21.2l5.3-5.1 3.4 8.1 3.6-1.5-3.3-7.9h7.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const HAND = '<svg width="54" height="60" viewBox="0 0 27 30"><path d="M9.5 2.5c1.1 0 2 .9 2 2v8.1l.6-.1V9.8c0-1.1.9-2 2-2s2 .9 2 2v2.9l.5-.1v-1.5c0-1.1.9-2 2-2s2 .9 2 2v2.2l.4-.1c0-1.1.9-1.9 2-1.9s2 .9 2 2v6.6c0 4.4-3.2 7.6-7.5 7.6h-2.3c-2.4 0-4.4-1.1-5.9-3l-5-6.6c-.7-.9-.5-2.2.4-2.9.9-.7 2.1-.5 2.8.3l1.9 2.3V4.5c0-1.1.9-2 2-2z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  // path: [{x,y,at}] in comp px / scene beats. clicks: [beat,...]. kind: 'orb' | 'arrow' | 'hand'
  B.cursor = (s, path, { clicks = [], kind = 'arrow', parent, hideAfter } = {}) => {
    const el = h('div', { class: 'cursor' + (kind === 'orb' ? ' orb-c' : ''), html: kind === 'arrow' ? ARROW : kind === 'hand' ? HAND : '' });
    (parent || s.hud).append(el);
    const P0 = path.map((p) => ({ ...p, at: s.start + p.at }));
    let P = P0;
    const C0 = clicks.map((c) => s.start + c);
    const ripples = C0.map((cb) => {
      B.event('click', cb);
      const rp = h('div', { class: 'ripple' });
      (parent || s.hud).append(rp);
      B.anim(rp, [{ opacity: 0, scale: 0.2 }, { opacity: 1, scale: 0.5, offset: 0.15 }, { opacity: 0, scale: 2.2 }], { at: cb, dur: 1.25, ease: 'out' });
      return { rp, cb };
    });
    function posAt(beat) {
      if (beat <= P[0].at) return P[0];
      for (let i = 1; i < P.length; i++) {
        if (beat <= P[i].at) {
          const a = P[i - 1], b = P[i]; const t = ease.inOut(clamp((beat - a.at) / Math.max(0.001, b.at - a.at)));
          const dx = b.x - a.x, dy = b.y - a.y; const arc = Math.sin(t * Math.PI) * Math.min(80, Math.hypot(dx, dy) * 0.12);
          const len = Math.hypot(dx, dy) || 1;
          return { x: lerp(a.x, b.x, t) + (-dy / len) * arc, y: lerp(a.y, b.y, t) + (dx / len) * arc };
        }
      }
      return P[P.length - 1];
    }
    B.anim(el, INS.fade, { at: P[0].at - 0.25, dur: 0.5 });
    if (hideAfter != null) B.anim(el, OUTS.fade, { at: s.start + hideAfter, dur: 0.5, fill: 'forwards' });
    B.tick((t, beat) => {
      P = P0.map(resolvePt);
      for (const r of ripples) { const q = posAt(r.cb); r.rp.style.left = q.x + 'px'; r.rp.style.top = q.y + 'px'; }
      const p = posAt(beat);
      let press = 1;
      for (const cb of C0) { const d = beat - cb; if (d > -0.12 && d < 0.35) press = Math.min(press, d < 0 ? 1 - (d + 0.12) / 0.12 * 0.18 : 0.82 + (d / 0.35) * 0.18); }
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${press.toFixed(3)})`;
    });
    return el;
  };

  // A point ON a real element (e.g. a captured screenshot): follows it through float, tilt and camera moves.
  // B.on(img, pageX, pageY, pageW, pageH) — pass the capture manifest's target coords + the capture viewport.
  B.on = (el, px, py, pw = 1, ph = 1) => ({ on: el, u: px / pw, v: py / ph });
  function resolvePt(p) {
    if (!p.on) return p;
    const r = p.on.getBoundingClientRect(); const R = root.getBoundingClientRect(); const k = R.width / C.width || 1;
    return { ...p, x: (r.left - R.left + p.u * r.width) / k + (p.dx || 0), y: (r.top - R.top + p.v * r.height) / k + (p.dy || 0) };
  }
  B.resolvePt = resolvePt;

  B.toast = (s, { title, sub, icon = 'check', x = C.width / 2, y = 160, at = 0, out } = {}) => {
    const t = h('div', { class: 'toast' }, [h('div', { class: 'ico', html: ICON(icon) }), h('div', {}, [title, sub ? h('small', { text: sub }) : null])]);
    const o = B.place(s, t, { x, y, float: 0.3, parent: s.hud });
    B.in(s, t, 'drop', { at, dur: 1, ease: 'spring', sound: 'pop' });
    if (out != null) B.out(s, t, 'up', { at: out, dur: 0.5 });
    return o;
  };

  /* ---------------- set pieces ---------------- */
  // Full-bleed accent "slam" — the beat-drop interstitial. Big white words resolve from blur.
  B.slam = (s, text, { sub, size = 150, at = 0, stagger = 0.25 } = {}) => {
    B.background(s, 'accent');
    B.event('impact', s.start + at);
    const el = B.words(s, text, { at, stagger, cls: `t t-white`, sound: null });
    el.style.fontSize = size + 'px';
    el.style.textShadow = '0 8px 40px rgba(0,0,0,.12)';
    if (sub) { const sb = B.words(s, sub, { at: at + 1, cls: 't t-s t-white', y: C.height / 2 + size * 0.95, sound: null }); sb.style.opacity = 0.9; }
    return el;
  };

  // Conversation: bubbles pop in one by one, alternating sides, with an orb avatar for the assistant.
  B.chat = (s, msgs, { x = C.width / 2, top = 220, gap = 34, w = 1300, orb = true, typing = true } = {}) => {
    const col = h('div', { style: { position: 'absolute', left: x - w / 2 + 'px', top: top + 'px', width: w + 'px', height: C.height - top + 'px' } });
    s.stage.append(col);
    let yy = 0;
    msgs.forEach((m) => {
      const me = m.from === 'me' || m.from === 'user';
      const b = h('div', { class: 'bubble ' + (me ? 'me' : 'ai') });
      b.style.top = yy + 'px';
      if (me) b.style.right = '0px'; else b.style.left = (orb ? 84 : 0) + 'px';
      const body = h('div'); b.append(body);
      if (m.html) body.innerHTML = m.html; else body.textContent = m.text;
      col.append(b);
      const est = Math.ceil((m.text || '').length / 42) * 41 + 44;
      if (!me && typing) {
        const dots = h('div', { class: 'bubble ai', style: { top: yy + 'px', left: (orb ? 84 : 0) + 'px' } }, [h('span', { class: 'dots' }, [h('b'), h('b'), h('b')])]);
        col.append(dots);
        B.anim(dots, INS.pop, { s, at: m.at - 1, dur: 0.5, ease: 'spring' });
        B.anim(dots, OUTS.fade, { s, at: m.at - 0.1, dur: 0.1, fill: 'forwards' });
        [...dots.querySelectorAll('b')].forEach((d, i) => B.tick((t, beat) => { d.style.opacity = 0.3 + 0.6 * Math.max(0, Math.sin((beat - s.start) * Math.PI * 2 - i * 0.9)); }));
      }
      if (!me && orb) {
        const o = h('div', { class: 'orb', style: { position: 'absolute', left: '0px', top: yy + 4 + 'px' } }); col.append(o);
        B.anim(o, INS.pop, { s, at: m.at - (typing ? 1 : 0), dur: 0.75, ease: 'spring' });
      }
      B.anim(b, [{ opacity: 0, scale: 0.9, translate: '0 30px', filter: 'blur(8px)' }, { opacity: 1, scale: 1, translate: '0 0', filter: 'blur(0px)' }], { s, at: m.at, dur: 0.9, ease: 'spring' });
      b.style.transformOrigin = me ? '100% 100%' : '0% 100%';
      B.event('pop', s.start + m.at, { voice: me ? 'me' : 'ai' });
      yy += (m.h || est) + gap;
    });
    return col;
  };

  // Feature deck: window cards stack forward one per `every` beats; older cards recede.
  B.deck = (s, items, { at = 0, every = 1, y = C.height / 2 } = {}) => {
    const wrap = h('div', { style: { position: 'absolute', inset: 0, transformStyle: 'preserve-3d' } }); s.stage.append(wrap);
    const cards = items.map((it, i) => {
      const c = h('div', { class: 'deck-card', style: { top: y + 'px' } }, [h('div', { class: 'dots3' }, [h('b'), h('b'), h('b')]), h('div', { class: 'burger' }), h('span', { html: ICON(it.icon || 'sparkle') }), h('span', { text: it.label })]);
      wrap.append(c);
      const t = at + i * every;
      B.anim(c, [{ opacity: 0, translate: '0 260px', scale: 1.04, filter: 'blur(6px)' }, { opacity: 1, translate: '0 0', scale: 1, filter: 'blur(0px)' }], { s, at: t, dur: every * 0.9, ease: 'spring' });
      B.event('pop', s.start + t, { voice: 'deck', i });
      return { c, t };
    });
    cards.forEach(({ c }, i) => {
      for (let k = i + 1; k < cards.length && k <= i + 3; k++) {
        const d = k - i;
        B.anim(c, [{ translate: `0 ${-(d - 1) * 46}px`, scale: 1 - (d - 1) * 0.05, opacity: d - 1 >= 2 ? 0 : 1, filter: `blur(${(d - 1) * 2}px)` },
                   { translate: `0 ${-d * 46}px`, scale: 1 - d * 0.05, opacity: d >= 3 ? 0 : 1 - d * 0.12, filter: `blur(${d * 2}px)` }],
          { s, at: cards[k].t, dur: every * 0.8, ease: 'out', fill: 'forwards' });
      }
    });
    return wrap;
  };

  // Brand lock-up: mark sweeps in with a glow bloom, name resolves, taglines rotate beneath, badge settles.
  B.lockup = (s, { mark, name, taglines = [], every = 2, badge, at = 0 } = {}) => {
    const L = h('div', { class: 'lockup' }); const row = h('div', { class: 'mark-row' });
    let m = null;
    if (mark) { m = h('img', { class: 'mark', src: mark }); row.append(m); }
    const nm = h('div', { class: 'name t' }); row.append(nm); L.append(row);
    if (name) [...name].forEach((ch, i) => { const sp = h('span', { class: 'w', text: ch }); nm.append(sp); B.anim(sp, [{ opacity: 0, filter: 'blur(16px)', translate: '0 0.2em' }, { opacity: 1, filter: 'blur(0px)', translate: '0 0' }], { s, at: at + 0.5 + i * 0.125, dur: 0.75 }); });
    if (m) B.anim(m, [{ opacity: 0, translate: '-240px 0', scale: 0.6, rotate: '-18deg', filter: 'blur(18px) drop-shadow(0 0 0 rgba(0,0,0,0))' }, { opacity: 1, translate: '0 0', scale: 1, rotate: '0deg', filter: `blur(0px) drop-shadow(0 18px 40px rgba(${hexRgb(C.accent).join(',')},.45))` }], { s, at, dur: 1.25, ease: 'spring' });
    B.event('impact', s.start + at, { soft: true });
    if (taglines.length) { const tg = h('div', { class: 'tag' }); L.append(tg); B.swap(s, tg, taglines, { at: at + 2, every }); tg.lastChild.style.position = 'relative'; }
    if (badge) { const bd = h('div', { class: 'badge', html: badge }); L.append(bd); B.anim(bd, INS.blur, { s, at: at + 2.5, dur: 1 }); }
    s.stage.append(L);
    return L;
  };

  // Chaos field for problem hooks: real screenshots scattered in depth, popping in on the grid, drifting.
  B.collage = (s, srcs, { count = 12, at = 0, every = 0.25, keepClear = { w: 900, h: 260 }, seed = 3, w = [300, 520] } = {}) => {
    const r = rng(seed); const out = [];
    for (let i = 0; i < count; i++) {
      let x, y, tries = 0;
      do { x = 120 + r() * (C.width - 240); y = 90 + r() * (C.height - 180); tries++; }
      while (tries < 40 && Math.abs(x - C.width / 2) < keepClear.w / 2 + 120 && Math.abs(y - C.height / 2) < keepClear.h / 2 + 90);
      const ww = lerp(w[0], w[1], r());
      const o = B.card(s, srcs[i % srcs.length], { x, y, w: ww, rx: (r() - 0.5) * 22, ry: (r() - 0.5) * 30, rz: (r() - 0.5) * 16, z: -r() * 300, at: at + i * every, enter: 'pop', dur: 1, float: 1.4, radius: 16 });
      out.push(o);
    }
    return out;
  };

  // Frosted list over footage: items appear one per `every` beats.
  B.glass = (s, items, { x = C.width / 2, y = C.height / 2, at = 0, every = 1 } = {}) => {
    const g = h('div', { class: 'glass' });
    items.forEach((it, i) => { const row = h('div', { class: 'row' }, [h('span', { html: ICON(it.icon || 'check') }), h('span', { text: it.text })]); g.append(row); B.anim(row, INS.blur, { s, at: at + i * every, dur: 0.75 }); B.event('pop', s.start + at + i * every, { soft: true }); });
    B.place(s, g, { x, y, float: 0.3 });
    B.anim(g, [{ opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1 }], { s, at: at - 0.25, dur: 0.75 });
    return g;
  };

  // Push the camera into a point (comp px) — macro focus pull; optional depth-of-field blur on the stage.
  // `center` (0..1) = how far the target travels toward frame centre while the camera pushes in.
  B.focus = (s, { x, y, at = 0, dur = 2, scale = 2.2, dof = 0, center = 0.7 } = {}) => {
    s.stage.style.transformOrigin = `${x}px ${y}px`;
    const tx = (C.width / 2 - x) * center, ty = (C.height / 2 - y) * center;
    B.anim(s.stage, [{ scale: 1, translate: '0 0' }, { scale, translate: `${tx}px ${ty}px` }], { s, at, dur, ease: 'inOut', fill: 'forwards' });
    if (dof) B.anim(s.bg, [{ filter: 'blur(0px)' }, { filter: `blur(${dof}px)` }], { s, at, dur, ease: 'inOut', fill: 'forwards' });
  };

  // Deterministic confetti burst in the brand palette.
  B.confetti = (s, { x = C.width / 2, y = C.height / 2, at = 0, count = 140, spread = 1, colors } = {}) => {
    const cv = h('canvas', { width: C.width, height: C.height, style: { position: 'absolute', inset: 0 } }); s.fx.append(cv);
    const ctx = cv.getContext('2d'); const r = rng(77 + count);
    const pal = colors || [C.accent, C.accent2, C.ink, '#FFFFFF', C.accent];
    const P = Array.from({ length: count }, () => ({ a: -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.3 * spread, v: 900 + r() * 1500, w: 8 + r() * 14, h: 5 + r() * 8, c: pal[Math.floor(r() * pal.length)], spin: (r() - 0.5) * 18, rot: r() * 6, drag: 0.9 + r() * 0.8 }));
    const t0 = s.start + at;
    B.event('confetti', t0);
    B.tick((t, beat) => {
      ctx.clearRect(0, 0, C.width, C.height);
      const dt = (beat - t0) * spb(); if (dt < 0 || dt > 4) return;
      for (const p of P) {
        const k = p.drag; const decay = (1 - Math.exp(-k * dt)) / k;
        const px = x + Math.cos(p.a) * p.v * decay; const py = y + Math.sin(p.a) * p.v * decay + 520 * dt * dt;
        ctx.save(); ctx.globalAlpha = clamp(1.6 - dt * 0.55); ctx.translate(px, py); ctx.rotate(p.rot + p.spin * dt); ctx.scale(1, Math.cos(p.spin * dt * 0.7));
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
    });
  };

  // Counter for REAL numbers only (stars, versions, stats from the source).
  B.count = (s, parent, to, { from = 0, at = 0, dur = 2, fmt = (v) => Math.round(v).toLocaleString('en-US') } = {}) => {
    const el = h('span', { text: fmt(from) }); parent.append(el);
    B.tick((t, beat) => { const k = ease.out(clamp((beat - s.start - at) / dur)); el.textContent = fmt(lerp(from, to, k)); });
    return el;
  };

  /* ---------------- icons (minimal line set) ---------------- */
  const IC = {
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .8 3.2 2.6 3.5 5.2"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', lock: '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 018 0v3"/>',
    sparkle: '<path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>', file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>', dollar: '<path d="M12 3v18M16.5 7.5C16 6 14.3 5 12 5s-4.5 1.2-4.5 3.2c0 4.6 9 2.4 9 7 0 2-2 3.3-4.5 3.3s-4.3-1.1-4.8-2.8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', terminal: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9l3 3-3 3M12.5 15H17"/>',
    rocket: '<path d="M12 15l-3-3c1.5-5 4.5-8 10-9-1 5.5-4 8.5-9 10z"/><path d="M9 12l-4 1 2-4M12 15l-1 4 4-2"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    heart: '<path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0112 7a4.5 4.5 0 018 2.5C20 15.2 12 20 12 20z"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  };
  const ICON = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[n] || IC.sparkle}</svg>`;
  B.icon = ICON;

  /* ---------------- transitions + finalize ---------------- */
  const PRE = { cut: 0, slam: 0, blur: 0.5, zoom: 0.5, rise: 0.5, whip: 0.375, dissolve: 0.5 };
  B.done = async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    for (const s of scenes) if (s._marquee) s._marquee();
    for (let i = 1; i < scenes.length; i++) {
      const cur = scenes[i], prev = scenes[i - 1], c = cur.start, T = cur.in;
      const pre = PRE[T] ?? 0;
      if (T === 'blur') {
        B.anim(prev.el, [{ filter: 'blur(0px)', opacity: 1, scale: 1 }, { filter: 'blur(30px)', opacity: 0, scale: 1.05 }], { at: c - pre, dur: pre + 0.25, ease: 'in', fill: 'forwards' });
        B.anim(cur.el, [{ filter: 'blur(30px)', opacity: 0, scale: 1.06 }, { filter: 'blur(0px)', opacity: 1, scale: 1 }], { at: c - pre, dur: pre + 0.75, ease: 'out' });
      } else if (T === 'zoom') {
        B.anim(prev.el, [{ scale: 1, filter: 'blur(0px)', opacity: 1 }, { scale: 1.7, filter: 'blur(24px)', opacity: 0 }], { at: c - pre, dur: pre + 0.25, ease: 'in', fill: 'forwards' });
        B.anim(cur.el, [{ scale: 0.82, filter: 'blur(16px)', opacity: 0 }, { scale: 1, filter: 'blur(0px)', opacity: 1 }], { at: c - pre * 0.5, dur: 1, ease: 'out' });
      } else if (T === 'rise') {
        B.anim(prev.el, [{ translate: '0 0', opacity: 1 }, { translate: '0 -22%', opacity: 0.0 }], { at: c - pre, dur: pre + 0.5, ease: 'inOut', fill: 'forwards' });
        B.anim(cur.el, [{ translate: '0 100%' }, { translate: '0 0' }], { at: c - pre, dur: pre + 0.5, ease: 'inOut' });
      } else if (T === 'whip') {
        B.anim(prev.el, [{ translate: '0 0', filter: 'blur(0px)' }, { translate: '-100% 0', filter: 'blur(26px)' }], { at: c - pre, dur: pre * 2, ease: 'inOut', fill: 'forwards' });
        B.anim(cur.el, [{ translate: '100% 0', filter: 'blur(26px)' }, { translate: '0 0', filter: 'blur(0px)' }], { at: c - pre, dur: pre * 2, ease: 'inOut' });
      } else if (T === 'dissolve') {
        B.anim(cur.el, [{ opacity: 0 }, { opacity: 1 }], { at: c - pre, dur: pre * 2, ease: 'inOut' });
      } else if (T === 'slam') {
        B.event('impact', c);
      }
      if (pre > 0) B.event('whoosh', c, { lead: pre, kind: T });
      cur._pre = pre; prev._post = T === 'dissolve' || T === 'cut' || T === 'slam' ? (T === 'dissolve' ? pre : 0) : 0.25 + (T === 'whip' ? pre : 0);
    }
    // visibility windows
    for (const s of scenes) {
      const a = s.start - (s._pre || 0), b = s.end + (s._post || 0);
      B.tick((t, beat) => { s.el.style.display = beat >= a - 0.0001 && beat < b ? '' : 'none'; });
    }
    events.sort((x, y) => x.beat - y.beat);
    const info = {
      config: { ...C }, totalBeats, duration: B.sec(totalBeats),
      scenes: scenes.map((s) => ({ name: s.name, start: s.start, beats: s.beats, energy: s.energy, in: s.in, music: s.opt.music || null })),
      events,
    };
    window.__brag = info;
    window.__ready = true;
    if (!/[?&]render\b/.test(location.search)) startPreview(info);
    return info;
  };

  /* ---------------- seeking ---------------- */
  window.__seek = async (ms) => {
    const beat = ms / 1000 / spb();
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
    for (const fn of ticks) fn(ms / 1000, beat);
    if (grainEl) { const f = Math.floor((ms / 1000) * C.fps); grainEl.style.backgroundPosition = `${(f * 73) % 256}px ${(f * 151) % 256}px`; }
    const waits = [];
    for (const m of mediaEls) {
      const local = Math.max(0, (ms / 1000 - B.sec(m.start)) * m.rate);
      const dur = m.v.duration || Infinity; const target = m.loop && isFinite(dur) ? local % dur : Math.min(local, (isFinite(dur) ? dur - 0.04 : local));
      if (Math.abs(m.v.currentTime - target) > 0.001) {
        waits.push(new Promise((res) => { const done = () => { m.v.removeEventListener('seeked', done); res(); }; m.v.addEventListener('seeked', done); m.v.currentTime = target; setTimeout(res, 3000); }));
      }
    }
    if (waits.length) await Promise.all(waits);
  };

  /* ---------------- live preview (open index.html in a browser) ---------------- */
  function startPreview(info) {
    const fit = () => { const k = Math.min(innerWidth / C.width, (innerHeight - 40) / C.height); root.style.transformOrigin = '0 0'; root.style.transform = `scale(${k})`; };
    document.body.style.width = '100vw'; document.body.style.height = '100vh'; fit(); addEventListener('resize', fit);
    const bar = h('div', { id: 'brag-scrub' }); const btn = h('button', { text: '❚❚' }); const rng_ = h('input', { type: 'range', min: 0, max: info.duration * 1000, step: 1, value: 0 }); const lab = h('span');
    bar.append(btn, rng_, lab); document.body.append(bar);
    const au = new Audio('../out/score.wav'); au.onerror = () => {}; let playing = true, t0 = performance.now(), off = 0;
    const play = () => { t0 = performance.now(); au.currentTime = off / 1000; au.play().catch(() => {}); };
    btn.onclick = () => { playing = !playing; btn.textContent = playing ? '❚❚' : '▶'; if (playing) play(); else { off = cur(); au.pause(); } };
    rng_.oninput = () => { off = +rng_.value; t0 = performance.now(); if (playing) au.currentTime = off / 1000; };
    const cur = () => (playing ? off + performance.now() - t0 : off) % (info.duration * 1000);
    play();
    const loop = async () => { const ms = cur(); await window.__seek(ms); rng_.value = ms; lab.textContent = `${(ms / 1000).toFixed(2)}s · beat ${(ms / 1000 / spb()).toFixed(2)}`; requestAnimationFrame(loop); };
    loop();
  }
})();
