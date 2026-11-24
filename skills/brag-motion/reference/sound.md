# Sound — one piece, one grid

The score engine (`engine/lib/score.mjs`) writes music and effects together. Read this before overriding anything.

## Rules (non-negotiable)
1. **One piece.** Effects are voiced from the chord sounding at that instant (pops climb the chord tones, impacts
   land on the root, whoosh resonances track the chord's 3rd/5th, confetti is an arpeggio of the chord). They go
   through the **same reverb** as the music (one shared room), so they are blended in, not laid on top.
2. **A real mix.** Buses: drums, bass, keys, lead, fx, shared reverb. Kick sidechains bass/keys/lead/fx. FX bus is
   high-passed 140 Hz, low-passed 8 kHz, with a –3 dB shelf above 6 kHz — soft, never spiky. Repeated little sounds
   (keys, pops) sit at –27…–36 dB, in the background. Glue compressor, true-peak ceiling –1 dBFS, –14 LUFS
   integrated (–19 LUFS for a voice bed, voice added on top at –16 then the sum normalised to –14).
3. **One grid, counted from frame 0.** Tempo is chosen in the plan and must be **frame-locked**:
   `bpm = 60 × fps / framesPerBeat` (30 fps → 112.5, 120, 105.88, 128.57 …; run `brag.mjs grid`). Every cut is on a
   beat (scenes are whole beats). Every event the picture emits is quantised to 1/16 notes. Drums, bass, melody and
   effects are all placed from the same sample clock; nothing is humanised, swung or nudged — so nothing drifts or flams.

## Arrangement comes from the storyboard
Each scene has `energy` 0–3 → the band responds:
- 0: pad + soft hats, sparse plucks (hooks, quiet setups)
- 1: kick on 1 & 3, hats, quarter-note arp (problem, outro)
- 2: four-on-the-floor + claps, bass groove, 8th arp (reveal, demos)
- 3: + 16th hats, octave bass pickups, bell sparkles (the peak demo)

Automatic moments:
- A scene entering `in: 'slam'` or jumping ≥ 2 energy gets a **one-beat stop** before it (drums+bass drop out, the
  whoosh fills it) and an impact on the downbeat.
- A rise in energy (without a stop) gets a 16th-note clap fill.
- The **last scene** resolves to the tonic: one kick, sustained chord, slow arp, ring-out tail faded after the picture ends.

## Styles (`Brag.setup({ music })` or `--style`)
| style | feel | tempo band | use when |
|---|---|---|---|
| `bright-pop` | plucky, optimistic, major (ref A) | 104–128 | SaaS, productivity, launches |
| `lofi-chic` | Rhodes/bells, mellow, maj7 (ref B) | 68–92 (feels 2×) | consumer, lifestyle, design |
| `night-drive` | minor, pulsing 8ths | 110–132 | dev tools, dark UIs, infra |
| `warm-keys` | EP + soft kit | 84–104 | personal projects, calm tone |

`key` (C…B) and `mode` are set in `Brag.setup`; pick a key that suits the tone (F/G major bright, D/A minor moody).

## Event → sound map (what each helper emits)
| event | from | sound |
|---|---|---|
| `cut` | every scene | (drum grid marks it; soft sub-thud in energy-0 sections) |
| `whoosh` | blur/zoom/rise/whip transitions | filtered-noise swell ending exactly on the cut, resonance in key |
| `impact` | `slam`, `lockup` | sub-drop on the key root + kick + chord pluck (soft variant = chord bells) |
| `pop` | `in`, `chat`, `deck`, `glass`, `toast` | sine blip on the next chord tone, panned |
| `click` | `cursor` clicks | short tuned "tock" on the chord root |
| `key` | `type`, `keys` | tiny band-passed tick, –33…–36 dB |
| `swap` | `swap`, `lockup` taglines | soft pluck on the chord 3rd |
| `word` | first word of a `words` reveal | barely-there air swish into the downbeat |
| `confetti` | `confetti` | rising chord-tone bell arpeggio on 16ths |

Add your own with `Brag.event(type, absoluteBeat)` — only the types above are voiced.

## Voice-over
- `render --voice take.wav --trim <count-in seconds>` or later `voice take.wav --trim …`.
- Voice chain: HPF 85 Hz, –2.5 dB @250 Hz, +2 dB @3.5 kHz, 3:1 compression, loudnorm –16 LUFS.
- Music is re-scored as a **voice bed** (lead –5 dB, 2.5–3 kHz carved) and ducked –9 dB under speech
  (30 ms attack / 350 ms release) — it breathes back up between lines.
- The guide track (`score … --guide --lines lines.json`) has an 8-click count-in, a soft metronome and a cue bell
  one beat before every line, so the take lands on the grid.

## Checking the mix
`ffmpeg -i brag/out/brag.mp4 -af ebur128=peak=true -f null -` → integrated ≈ –14 LUFS, true peak ≤ –1 dBTP.
Listen on headphones for: anything poking out above the music (lower it), clicks at note ends (envelopes),
flams between kick and impacts (they share the same sample index by construction — if you hear one, an event
was authored off-grid).
