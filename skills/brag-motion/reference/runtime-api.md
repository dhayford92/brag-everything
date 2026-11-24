# Runtime API (`brag/comp/runtime/brag.js`)

Compositions are one HTML file. Time is in **beats**; every `at` is relative to its scene's first beat.
Coordinates are comp pixels (1920×1080 default), objects are placed by their centre.

```html
<link rel="stylesheet" href="runtime/brag.css"><script src="runtime/brag.js"></script>
<div id="brag-root"></div>
<script>
Brag.setup({ bpm: 112.5, fps: 30, accent: '#4B3BF5', accent2: '#8E80FF', ink: '#17172B', paper: '#F4F4FA', paper2: '#E6E6F2',
             font: "'Inter Variable', sans-serif", key: 'F', mode: 'major', music: 'bright-pop', seed: 11 });
Brag.scene('hook', 8, (s) => { /* build */ }, { in: 'cut', energy: 0, bg: 'paper', camera: { from: { s: 1 }, to: { s: 1.06 } } });
Brag.done();   // REQUIRED, last line
</script>
```
Bundled fonts: `'DM Sans Variable'` (default), `'Outfit Variable'`, `'Inter Variable'`, `'JetBrains Mono Variable'`.
Use the product's own font if it ships one: add an `@font-face` pointing at the copied file in `brag/assets/`.

## Scene options
`in`: `cut | blur | zoom | rise | whip | dissolve | slam` · `energy`: 0–3 (drives the music) ·
`bg`: `'paper' | 'white' | 'accent' | 'night' | {type:'paper', grid:false} | {type:'image'|'video', src, blur, dim, shafts:true}` ·
`camera`: `{from:{x,y,s,rx,ry,rz}, to:{…}}` or `false`. `s.stage` (3D world), `s.hud` (flat, on top), `s.fx`.

## Helpers
| call | notes |
|---|---|
| `Brag.words(s, 'Line one\n*accent line*', {at, stagger:.25, cls:'t t-l', x, y, align:'center'\|'left', kind:'blur'})` | word-by-word blur resolve. Sizes: `t-xxl` 220, `t-xl` 128, `t-l` 84, `t-m` 60, `t-s` 40, `t-xs` 28. `t-white`, `t-light`. Returns the text el. |
| `Brag.type(s, parentEl, 'text', {at, rate:.25, caret:true})` | typewriter, 1 char per `rate` beats. Place `parentEl` first (`Brag.place`). |
| `Brag.keys(s, {at, until, rate:.25})` | typing sounds only — under a captured typing flipbook |
| `Brag.swap(s, parentEl, ['A','*B*'], {at, every:2})` | rotating word slot |
| `Brag.marquee(s, 'What if it *just worked*', {at, size:200})` | giant line, camera tracks across |
| `Brag.card(s, src\|el, {x,y,w, rx,ry,rz,z, at, enter:'rise'\|'pop'\|'left'\|'right'\|'drop'\|'zoom'\|'blur', glow:true, radius, float})` | floated real UI with accent underglow. Returns wrapper; `.card` is the surface. |
| `Brag.window(s, src\|el, {url\|title, …card opts})` | app/browser window chrome |
| `Brag.phone(s, src\|el, {x,y,w:440, rx,ry, at, enter})` | phone frame; `.screen` holds the content |
| `Brag.flip(s, [{src, at, fade}])` | flipbook of captured states (crossfades) — pass as `src` to card/window/phone |
| `Brag.cursor(s, [{x,y,at}, {...Brag.on(img, px, py, capW, capH), at}], {clicks:[beat], kind:'arrow'\|'hand'\|'orb'})` | simulated pointer; `Brag.on` pins a point to a real element (use the capture manifest's `target` coords) |
| `Brag.toast(s, {title, sub, icon, x, y, at, out})` | only for text the product really shows |
| `Brag.slam(s, 'Big *question?*', {sub, size:150})` | full-bleed accent beat-drop frame (use with `in:'slam'`) |
| `Brag.chat(s, [{from:'me'\|'ai', text, at}], {x, top, w})` | bubbles + orb + typing dots |
| `Brag.deck(s, [{icon, label}], {at, every:1})` | stacked window cards, one per `every` beats |
| `Brag.glass(s, [{icon, text}], {x, y, at, every})` | frosted list over footage/image bg |
| `Brag.collage(s, [srcs], {count:12, every:.25, keepClear:{w,h}})` | chaos field of real fragments for hooks |
| `Brag.lockup(s, {mark, name, taglines:[…], every:2, badge:'html', at})` | outro / reveal |
| `Brag.focus(s, {x, y, at, dur, scale, center:.7, dof})` | camera push into a point |
| `Brag.confetti(s, {x, y, at, count})` | brand-colour burst |
| `Brag.count(s, parentEl, realNumber, {from, at, dur, fmt})` | ONLY real numbers |
| `Brag.in(s, el, kind, {at, dur})` / `Brag.out(s, el, kind, {at, dur})` | generic entrance / exit (`blur up down shrink fade`) |
| `Brag.anim(el, keyframes, {s, at, dur, ease, fill})` | raw paused Web Animation. Eases: `out soft inOut in back spring linear` |
| `Brag.place(s, el, {x,y,w, rx,ry,rz,z, float, anchor})` | position anything |
| `Brag.media(src, {s, at, rate, loop})` | frame-accurate `<video>` (real product clips) |
| `Brag.tick((t, beat) => …)` | per-frame hook (must be pure of time) |
| `Brag.icon(name)` | line icons: check bolt chat pin calendar code users chart lock sparkle upload globe clock bell file pen dollar grid search terminal rocket download heart star layers send image |
| `Brag.event(type, absBeat)` | extra sound event (see sound.md) |

## Animation-layer rules (why things don't fight)
- Entrances/exits animate the individual CSS properties `translate`, `scale`, `rotate`, `opacity`, `filter`.
- Placement and 3D tilt use `transform` on the `.obj` wrapper; idle float writes `translate` on the wrapper.
- Camera animates `transform` on `s.stage`; `Brag.focus` animates `scale`+`translate` on `s.stage`.
- Transitions animate the `.scene` element itself.
- Create an element's entrance before its exit (exits use `fill:'forwards'`).

## Determinism
Never use `Date.now()`, `Math.random()`, CSS `transition`, or un-paused CSS animations. Use `Brag.rng(seed)`.
Everything must be a function of time so `__seek(ms)` renders any frame identically, in any order, in parallel.
