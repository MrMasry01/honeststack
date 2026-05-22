# HonestStack — content engine (Claude Code lanes)

Working folder for the **Claude Code** side of HonestStack — the automated FIFA World Cup
2026 short-form video engine. The Lovable agent owns the cockpit UI (`src/`); this folder
holds everything *outside* the app. It will move into the shared repo once that exists.

Coordination with the Lovable agent: **Notion sync page** —
<https://www.notion.so/36789dee3cde81e7802af2023608f0c7>

## Folder map

| Path | Lane | What |
|---|---|---|
| `honeststack-editor/` | B | The editorial skill (also installed to `~/.claude/skills/honeststack-editor/`) |
| `honeststack-editor-workspace/` | B | Skill eval runs + benchmark |
| `remotion/` | A | Remotion video renderer — `NewsRoundup` composition + `render.ts` CLI |
| `docs/apify/` | D | Apify Twitter scraper config |
| `docs/elevenlabs.md` | E | ElevenLabs voice-clone setup |
| `docs/make/` | C | Make.com scenario build specs (A, B, D, E, F, G, H) |

## Lane status — 2026-05-21

| Lane | Status |
|---|---|
| B — `honeststack-editor` skill | **Done & installed.** iteration-1 benchmark 100% vs 90.5%; schema corrected for integer `urgency`. |
| A — Remotion renderer | In progress — scaffolding `NewsRoundup`. |
| C — Make scenarios | In progress — writing build specs in `docs/make/`. |
| D — Apify config | Done — `docs/apify/twitter-scraper.md`. |
| E — ElevenLabs voice | Done — clone exists (`voice_id eo3hKvm7OHyQqbqYYNTu`), `docs/elevenlabs.md`. |

## Confirmed from Lovable

- DB migration applied — all 7 §4 columns live, with CHECK constraints + indexes.
- `content_ideas.urgency` = integer **1–5**, default **3**.
- `ELEVENLABS_API_KEY` stored in Lovable Cloud secrets.
- `voice_id eo3hKvm7OHyQqbqYYNTu` → to be seeded into `brand_settings.voice_id`.

## Open inputs needed

- A shared Git repo so these lanes can land in the real project.
- **Supabase MCP** wired into Claude Code (service-role key) so the `honeststack-editor`
  skill can actually run `morning-brief` / `verify` against the live DB from this side.
- **Make.com** access (or Make MCP) to build scenarios A–H from the `docs/make/` specs.
