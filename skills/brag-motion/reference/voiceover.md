# Voice-over script — how to write it

Only when the user said **yes** to adding their voice. Write `brag/voiceover-script.md` AND
`brag/out/vo-lines.json` (`[{ "beat": 8, "text": "…" }]`) from the final storyboard.

## Writing
- One line per scene (or none — silence over a slam or the deck is good). Lines START on the scene's first beat
  or one beat in; they must END a beat before the next cut.
- Budget: **≤ 2.3 words per second** of the line's window (≈ 140 wpm with breaths). Count it. Cut words, not pace.
- Speak like the founder showing a friend, not an ad: short, concrete, first person or "you". Say what the screen
  shows a beat before or as it appears — never describe what already happened.
- The on-screen text and the voice must not say the same sentence. Voice gives the why; text gives the label.
- No claims the product can't back. Humour only if it's the project's own (read the real commit/error/copy).

## Script file format
```markdown
# Voice-over — <Project>  (<duration> s · <bpm> BPM · count-in 8 clicks)

Record with headphones on `brag/out/vo-guide.wav`. Start recording BEFORE pressing play; the guide has
8 count-in clicks (<count-in> s), a soft metronome, and a bell one beat before each line. Speak on the beat after the bell.

| # | Cue (beat / time) | Window | Words (max) | Line | Direction |
|---|---|---|---|---|---|
| 1 | b1 · 0:00.53 | 3.2 s | 7 | "Every release, I write this." | dry, half-smile |
| 2 | … | | | | |

Tips: one take straight through is fine; leave 1 s of room tone at the start; 44.1/48 kHz WAV or M4A.
Then tell me: "here's my take: <path>" — I'll trim the count-in, clean it, duck the music and remux.
```

## Making the guide
```
node <engine>/brag.mjs score brag/out/timeline.json --guide --lines brag/out/vo-lines.json
```
→ `brag/out/vo-guide.wav` (count-in printed in the log). The final mix uses
`node <engine>/brag.mjs voice <take> --trim <count-in seconds> [--nudge ms]` (run from the project root).
If the take started late/early against the guide, `--nudge` it in ms (positive = speech earlier).
