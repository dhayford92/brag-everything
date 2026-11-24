# brag-motion

A Claude Code skill that turns the project you're in into a premium 20–60 s motion-graphic "brag" video
(1080p MP4 with an original beat-locked score) — built from the **real running product** (captured screens,
flows, logo, copy), never mock-ups.

Ask Claude for a "launch video", "promo", "hype / showcase video", or run `/brag-motion`.

## Install

**Option 1 — skills CLI**

```bash
npx skills add <your-github-username>/brag-everything
```

**Option 2 — manual**

```bash
git clone https://github.com/<your-github-username>/brag-everything.git
cp -r brag-everything/skills/brag-motion ~/.claude/skills/brag-motion      # macOS / Linux
# Windows (PowerShell):
# Copy-Item -Recurse brag-everything\skills\brag-motion $env:USERPROFILE\.claude\skills\brag-motion
```

Then install the render engine's dependencies once (Playwright, ffmpeg, fonts):

```bash
cd ~/.claude/skills/brag-motion/engine
npm install
```

Restart Claude Code; the skill appears as `brag-motion`.

## Requirements

- Node.js 18+
- A Chromium/Chrome install usable by `playwright-core`

## What's inside

| Path | Purpose |
| --- | --- |
| `skills/brag-motion/SKILL.md` | Skill entry point and workflow |
| `skills/brag-motion/engine/` | Deterministic HTML → MP4 renderer + beat-locked score synth |
| `skills/brag-motion/reference/` | Style DNA, runtime API, sound and voice-over rules |
| `skills/brag-motion/templates/` | A complete rendered example composition |

## License

MIT
