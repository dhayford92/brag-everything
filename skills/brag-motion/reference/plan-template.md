# brag-plan.md — template

Write this to `brag/brag-plan.md` BEFORE touching the composition. Fill every field from what you actually saw
in scout.json, the capture contact sheet and the code. If the user pointed at one thing (a release, a feature,
an angle), that thing is the whole video; everything else is at most one beat of context.

```markdown
# <Project> — brag plan

**Focus:** <whole product | v2.3 release | the new X feature | one angle the user named>
**Angle (one sentence):** <the creative idea — why this is worth bragging about, in the product's own terms>
**Hook (first 2–4 s):** <the problem, shown with real UI/copy — ideally the project's own absurdity>
**Highlights (2–3):**
1. <real capability> — shown by <which captured flow / screen / component>
2. …
3. …
**Punchline:** <the line the lock-up lands on — from real copy (README/tagline) or a plain statement of what it does>
**Tone:** <e.g. confident & dry / playful / calm-premium> · **Humour:** <only if the project supplies it — quote the real absurd thing, or "none">
**Voice-over:** <yes → see voiceover-script.md | no>

## Visual identity
- Canvas: <paper | white | night> (matches the product's own UI)
- Accent: <hex from the product> · accent2: <lighter tint> · ink: <hex>
- Type: <product's font if available, else DM Sans / Outfit / Inter> · display weight <700>
- Assets reused: <logo path>, <captured pages/flows>, <real images/videos from repo>
- Rebuilt (couldn't reuse): <list, or "nothing">

## Music
- Style: <bright-pop | lofi-chic | night-drive | warm-keys>, key <F> <major>
- Tempo: **<112.5> BPM** (frame-locked: <16> frames/beat @ 30 fps) — 1 beat = <0.533> s
- Target: <30> s → **<56> beats** = <14> bars

## Storyboard (every cut on a beat; durations sum to the target)
| # | Scene | Beats | Start (beat / s) | In | Energy | What's on screen (real source) | Text | Motion |
|---|---|---|---|---|---|---|---|---|
| 1 | hook | 8 | 0 / 0.00 | cut | 0 | … (`assets/capture/…png`) | "…" | typewriter, camera drift |
| 2 | … | 4 | 8 / 4.27 | blur | 1 | … | … | … |
| … | | | | | | | | |
| n | outro | 8 | … | blur | 1 | logo lock-up | tagline swap | mark sweep + glow |
| | **Total** | **<56>** | | | | | | **= <29.87> s** |

## Postable-frame check
For each scene, the frame at its midpoint is: <headline + hero object + space>. Note any that aren't, and fix.
```

Rules of thumb
- 6–9 scenes for 25–40 s. Scenes 4–12 beats; nothing static for more than 2 beats.
- Put the `slam` right before the strongest highlight. Energy curve: low → lift → peak → rapid deck → settle.
- Every on-screen claim must be traceable to the source (code, README, real UI). No invented numbers,
  testimonials, logos or customers.
