# Style DNA — what the reference videos do (content stripped)

Two reference "brag" videos were analysed frame by frame (contact sheets at 2 fps, 10 fps strips on every
transition, scene-cut detection, audio tempo/key/spectrum). Product content was ignored; this is only the grammar.

| | Ref A (SaaS, 64 s) | Ref B (consumer app, 37 s) |
|---|---|---|
| Tempo | ~115 BPM, bright pop, major | ~72 BPM felt as 144, chic lo-fi, major |
| Canvas | cool off-white `#F3F4F7 → #E6E8EE`, faint grid | warm white, soft diagonal light shafts |
| Accent | one saturated orange, used on 2nd headline line, glows, slams | one deep crimson, on single key words |
| Type | geometric sans, bold, 2-line headline (ink / accent) | thin geometric sans (Futura-like), sentence case |
| Cuts | every 2–4 s, always on a beat | every 1.5–3 s, on a beat |

## 1 · Canvas & light
- Light, airy, cool-neutral background with a white radial bloom in the middle. Never pure white, never flat.
- A barely-there grid (1px lines ~7% ink, masked to the centre). Optional soft light shafts drifting slowly.
- Exactly **one** brand accent. Everything else is ink, grey, white. The accent appears as: the second line of a
  headline, a key word, the underglow of cards, the cursor, full-bleed "slam" frames.
- Dark products: same grammar on `night` (near-black + accent bloom). Pick the canvas the product itself uses.

## 2 · Surfaces — real UI, floated
- Real screenshots/components become **cards**: 16–30 px radius, white, hairline border, soft ink shadow **plus a
  wide accent-tinted underglow** (the signature look — a coloured light leaking from under every card).
- Cards live in 3D: 5–20° tilt (`rotateX/rotateY`), depth stacking, slow parallax.
- Devices: phone with thick dark bezel + island; browser/app window with traffic-light dots.
- Nothing is ever static: every object idles (a few px float), every scene camera-drifts (scale 1.00 → 1.04).

## 3 · Type motion
- **Blur-resolve**: words arrive one by one from `blur(14–18px)`, `opacity 0`, `+0.35em` y → sharp. 1/4-beat stagger.
- **Typewriter** with a caret for questions and inputs ("Is your business j|"). Grid-locked: 1 char per 16th note.
- **Word rotator**: one slot cycling words (HR → Timesheets → Payroll), each swap a blur-up.
- **Giant kinetic line**: one sentence at 200 px+ that the camera tracks across horizontally, words resolving as they
  enter frame; an accent arrow glyph leading.
- Two-line headlines: line 1 ink ("Sira Tracks Attendance"), line 2 accent ("In Real-Time"), left-aligned beside a
  device or card.

## 4 · Set pieces (the vocabulary)
| Piece | What it does | Runtime helper |
|---|---|---|
| Chaos hook | Dozens of real UI fragments scattered in depth around a central question, popping in | `Brag.collage` + `Brag.type` |
| Problem → people | Clean card + 2-line headline, element continuity into the next shot | `Brag.card` + `Brag.words` |
| Turn / "What if" | Giant kinetic line tracked by camera | `Brag.marquee` |
| Brand reveal | Mark sweeps in with a glow bloom, name letters resolve, tagline below | `Brag.lockup` |
| Conversation | Chat bubbles pop in alternating sides, assistant has a glowing orb avatar, typing dots first | `Brag.chat` |
| **Slam** | Full-bleed accent gradient, one huge white word/question resolves from blur — the beat drop | `Brag.slam` |
| Device demo | Phone/window slides in, simulated cursor/orb travels and presses, ripple, screen changes | `Brag.phone/window` + `Brag.cursor` + `Brag.flip` |
| Macro focus pull | Camera pushes into one element (an "Approved" pill, a toast) with depth-of-field | `Brag.focus` |
| Celebration | Confetti in brand colours from the button that was pressed | `Brag.confetti` |
| Frosted list | Glass panel over blurred footage, items appear one per beat with icons | `Brag.glass` |
| Feature deck | Window cards stack forward one per beat, older ones recede and blur | `Brag.deck` |
| Outro lock-up | Mark + name, tagline rotates 2–3 times, small badge/CTA settles; held ≥ 2 bars | `Brag.lockup` |

## 5 · Transitions (all on a beat)
- **Blur dissolve** (most common): outgoing blurs to 30px + fades, incoming resolves from blur. ½ beat.
- **Zoom-through**: push past the outgoing scene into the next.
- **Rise / whip**: next scene slides in with motion blur.
- **Slam**: hard cut to the full accent frame, with an impact.
- **Continuity**: an element (a card, the phone) survives the cut and the world changes around it.

## 6 · Pace & arc
Hook (problem, 2–4 bars) → turn ("what if" / slam) → reveal (logo) → 2–3 highlights, each a device demo +
2-line headline → slam before the strongest one → feature deck rapid-fire → proof (only REAL proof) → lock-up + CTA.
Scenes are 4–12 beats. The energy curve: calm hook, lift at the reveal, peak at the slam/demo, rapid-fire deck,
settle on the lock-up.

## 7 · What made them premium (keep these)
- Real UI, crisp (captured at 2×), never mocked-up abstractions.
- One accent, used with restraint; lots of air around every object.
- Soft everything: shadows, glows, blur transitions, ease-out-expo / spring curves — nothing linear, nothing bouncy-cheap.
- Film grain (~3%) and a whisper of vignette so gradients don't band.
- Any paused frame reads as a designed poster: headline + one hero object + space.

## 8 · What we deliberately do NOT copy
- Invented testimonials / review walls (Ref A had one) — only use real, attributable quotes from the source.
- Fake numbers ("$8,042 revenue") — counters only animate real values.
- Platform watermarks, other brands' logos unless the product genuinely integrates with them.
