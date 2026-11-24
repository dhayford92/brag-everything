---
name: brag-motion
description: Make a premium motion-graphic "brag" video (launch / feature / release promo, 1080p MP4 with an original beat-locked score) for the project you're in — built from the REAL running product (captured screens, flows, logo, copy), never mock-ups. Use when asked to "brag about", "make a promo / launch / hype / showcase / demo video", "motion graphic", "announce this release/feature as a video", or "/brag-motion". Asks about voice-over first, scouts and runs the app, writes brag-plan.md, renders, mixes, and offers re-rolls.
---

# brag-motion

Turns the current project into a 20–60 s motion-graphic video in the style distilled from two reference brag videos
(light airy canvas, one accent, real UI floated as glowing 3D cards, blur-resolving type, full-bleed accent "slams",
simulated clicks/typing, confetti, logo lock-up) with an original score where music and effects are one piece on one
beat grid.

Everything is driven by the engine CLI. `E` below means the engine dir:
`E=~/.claude/skills/brag-motion/engine` (Windows: `C:/Users/<you>/.claude/skills/brag-motion/engine`).
All other paths are relative to the **project root** you were invoked in. Output lives in `<project>/brag/`.

Read before building: [reference/style-dna.md](reference/style-dna.md) (the look), [reference/runtime-api.md](reference/runtime-api.md)
(the helpers), [reference/sound.md](reference/sound.md) (score rules), [reference/plan-template.md](reference/plan-template.md),
and if voice = yes, [reference/voiceover.md](reference/voiceover.md). A complete, rendered example composition:
[templates/composition.html](templates/composition.html).

## 0 · Ask first (one AskUserQuestion call, before any work)
1. **"Do you want to add your own voice-over?"** — Yes (I'll write a script + recording guide) / No (music only). *Always ask this.*
2. Length — 20 s / 30 s (default) / 45 s / 60 s.
3. Focus — whole product / latest release or recent commits / a specific feature (they name it) — skip if the request already says.
4. Tone — confident & clean (default) / playful / calm-premium / dark & technical.

## 1 · One-time engine setup (skip if `$E/node_modules` exists)
```bash
cd "$E" && npm install
```
Needs Node 18+ and Google Chrome or Edge installed (found automatically; override with `BRAG_CHROME=<path>`).
ffmpeg ships via `ffmpeg-static` — nothing else to install.

## 2 · Scout, then run and capture the REAL product (never assume the interface)
```bash
node "$E/brag.mjs" init .          # scaffolds brag/ (comp/, runtime + fonts, assets/, out/)
node "$E/brag.mjs" scout .         # → brag/scout.json: stack, run command + port, routes, logos, colours, fonts, media, recent commits
```
- Copy the real logo (`scout.brand.logos[0]`) and any real product images/videos you'll reuse into `brag/assets/`.
- **Start the app** with `scout.run.command` (background shell; for a static site serve its folder). For focus =
  release/feature, read `recentCommits`/`changelog` and the code of that feature to know what to show.
- **Read the code** (routes, components, the core action's handler/selectors) and write `brag/capture.json`:
```json
{ "baseUrl": "http://localhost:4173", "viewport": {"width": 1440, "height": 900}, "dpr": 2,
  "crawl": {"maxPages": 6}, "routes": ["/", "/pricing"], "mobile": true,
  "flows": [{ "name": "core-job", "steps": [
    {"goto": "/"}, {"shot": {"name": "empty"}},
    {"type": {"selector": "#input", "text": "real-looking input", "frames": true, "every": 6, "clip": ".panel"}},
    {"click": "#go"}, {"shot": {"name": "result"}}, {"shot": {"name": "result-panel", "selector": ".output"}} ]}] }
```
  Step keys: `goto wait waitFor hover click fill type{selector,text,frames,every,clip} press scroll shot{name,selector}`;
  `"mobile": true` on a flow captures it at 390×844 @3×. Logins: use the project's seed/fixture/test credentials
  (never the user's real passwords) or a `storageState` file.
```bash
node "$E/brag.mjs" capture brag/capture.json   # waits for the server, then → brag/assets/capture/ + manifest.json + contact.png
```
- **Look at `brag/assets/capture/contact.png` and the key flow frames** (Read them). Decide the story from what the
  product really does on screen. Click targets for the cursor are in `manifest.json → flows[].frames[].target`.
- Non-web projects: CLI → run the real commands and show real output in a `.term` card (type the command with
  `Brag.type`); library → real code + real output; mobile (Expo/RN) → `npx expo start --web` and capture with
  `"mobile": true`, or use simulator screenshots the user provides. Design/marketing images already in the repo count as real.

## 3 · Plan → `brag/brag-plan.md`
Follow [reference/plan-template.md](reference/plan-template.md): angle, hook, 2–3 highlights, punchline, tone, visual
identity, music, and a scene-by-scene storyboard whose beats sum to the target. Pick a frame-locked tempo now:
```bash
node "$E/brag.mjs" grid --bpm 115 --target 30      # e.g. 112.5 BPM (16 frames/beat) → 56–60 beats
```
If the user pointed at one thing (new version, one feature, one angle), that is the video.

**Creative rules** — 1 · *Show the thing*: reuse the real UI, components, copy, images, videos and animations from the
source; rebuild only what can't be reused; prefer the working app doing its job over a landing page describing it.
Small illustrative UI text while showing the product in use (a filename, an "Exported" toast) is fine; invented claims,
numbers, customers or testimonials are not. Never abstract filler. 2 · *Make it alive*: things appear one by one,
simulated clicks, swipes and typing beat static slides. 3 · *Funny earns its place*: humour only from the project's own
absurdity (a real commit message, error, edge case), never from trying. 4 · *Every frame postable*: any paused frame
should be worth sharing — headline + one hero object + air.

## 4 · Voice-over (only if they said yes)
Write `brag/voiceover-script.md` + `brag/out/vo-lines.json` per [reference/voiceover.md](reference/voiceover.md),
then after step 6's render make the recording guide:
```bash
node "$E/brag.mjs" score brag/out/timeline.json --guide --lines brag/out/vo-lines.json   # → brag/out/vo-guide.wav
```
Hand them the script + guide and wait for the take. Then:
```bash
node "$E/brag.mjs" voice <path/to/take.wav> --trim <count-in seconds from the guide log>   # → brag/out/brag-voice.mp4
```

## 5 · Build `brag/comp/index.html`
Start from `templates/composition.html` (copy it over the scaffolded file) and rewrite it for this project. Use the
helpers in [reference/runtime-api.md](reference/runtime-api.md); the accent/ink/paper colours and font come from the
product. Every scene: whole beats, an `in` transition, an `energy` for the music. Last line `Brag.done();`.
Live preview while editing: open `brag/comp/index.html` in a browser (scrubber + score once rendered).

## 6 · Review, render, check
```bash
node "$E/brag.mjs" timeline brag/comp/index.html    # scene/beat table — must match the plan, beats sum to the target
node "$E/brag.mjs" stills brag/comp/index.html      # 2 frames per scene → brag/stills/_sheet.png  (READ IT; fix any frame that isn't postable)
node "$E/brag.mjs" render brag/comp/index.html      # frames → score → mux → brag/out/brag.mp4 (+ score.wav, timeline.json)
node "$E/brag.mjs" sheet brag/out/brag.mp4          # 1 frame/s contact sheet → READ IT
```
Flags: `render --preview` (half-res, fast), `--from 8 --to 14` (one scene), `--style lofi-chic`, `--voice take.wav --trim s`,
`--workers N`. `stills --at 3.2,9.1` for specific seconds. `poster brag/out/brag.mp4 --at <s>` for a thumbnail.
Loudness check: `"$(node -p "require('$E/node_modules/ffmpeg-static')")" -i brag/out/brag.mp4 -af ebur128=peak=true -f null -` → ≈ –14 LUFS, peak ≤ –1.

## 7 · Deliver (exactly this shape)
- Where the video and copy are: `brag/out/brag.mp4` (+ `brag-voice.mp4`), `brag/brag-plan.md`, `brag/voiceover-script.md`
  if any, poster PNG if made. Send the MP4 with SendUserFile when available.
- **One sentence** on the creative angle.
- Offer: **re-roll a scene** (name them from the storyboard) or **try another tone** (e.g. `lofi-chic` calm / `night-drive` dark).
Re-rolling one scene = edit that scene, `stills --at`, then full `render` (audio must be re-scored for the whole piece).

## Gotchas (hit while building this skill)
- **Capture raced the dev server** → `chrome-error://chromewebdata/`. `capture` now polls `baseUrl` for up to 90 s
  (`"serverTimeout"` in the spec to change). Still start the server *before* capturing.
- **Red spell-check squiggles** under typed text ruined frames → capture disables `spellcheck` on all inputs via an init script.
- **`x264 [error]: malloc … failed`** on a machine with ~1 GB free RAM: the renderer now sizes workers by free memory
  (~0.9 GB each) and drops to `-preset medium -threads 2` when < 3 GB free. If it still fails: `--workers 1`, close Chrome tabs.
- `write EOF` from Node means ffmpeg died — the real ffmpeg error is now printed instead.
- Use system **Chrome/Edge** (H.264 `<video>` in comps); Playwright's bundled Chromium can't decode H.264 → use WebM there.
- Single-line text must not wrap: `.t` is `nowrap`; use `\n` for line breaks. Typed lines grow from the centre (like the refs).
- `Brag.focus` `center` (0–1, default 0.7) slides the target toward frame centre while pushing in — needed for a
  bottom-right toast, but it drags side-by-side headlines off-frame: use `center: 0` when text shares the scene.
- Render speed is RAM-bound: 32 s @1080p took ~2 min of stills but **12.7 min** to render on 1 worker with 1 GB free.
  Iterate with `stills` and `render --preview`; do the full render once, in a background shell.
- A toast/state the app really renders is already in the captured frame — push in on it instead of faking a `Brag.toast`.
- Cursor targets: use `Brag.on(img, target.x, target.y, viewport.w, viewport.h)` from the manifest so the pointer stays
  glued to the real button through float/tilt/camera moves. Hand-typed comp coordinates drift.
- `Brag.done()` must be the last call; `render`/`stills` time out with the page's errors if it never runs.
- `init` refreshes `brag/comp/runtime/` every time (safe) but never overwrites `comp/index.html` without `--force`.

## Troubleshooting
| symptom | fix |
|---|---|
| `Composition never called Brag.done()` + errors | JS error in the comp — read the printed page errors |
| `… is not answering — start the app first` | start `scout.run.command`, check the port in capture.json |
| flow step `failed:` in capture log | wrong selector — read the component source, re-run capture |
| blank/black frames | asset path wrong (paths are relative to `brag/comp/`), or `Brag.done()` missing |
| music too loud vs effects / harsh | don't boost FX bus; lower the event's dB in `score.mjs`; keep FX ≤ –24 dB |
