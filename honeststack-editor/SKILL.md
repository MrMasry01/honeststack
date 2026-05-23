---
name: honeststack-editor
description: >-
  Editorial brain for the HonestStack World Cup 2026 short-form video engine. Use this
  whenever the user wants to draft, polish, or fact-check video scripts in colloquial
  Egyptian Arabic from scraped football news. Triggers on "morning-brief", "draft today's
  videos", "do the morning brief", "polish idea/script <id>", "tighten this script",
  "verify source/claim <id>", "honeststack-editor", or any request to turn raw_sources
  rows into content_ideas. Handles clustering 24h of football news into 4 daily videos,
  virality scoring, Egyptian-Arabic script generation, and source verification against
  Supabase. Use it even when the user does not name the skill explicitly.
---

# HonestStack Editor

This skill is the editorial loop for **HonestStack**, an automated engine that publishes
**4 short-form videos per day** about the FIFA World Cup 2026. Each video is hosted by a
**fixed Egyptian Pharaoh mascot** (bundled with the Remotion project — identical in every
video) speaking **colloquial Egyptian Arabic** (عامية مصرية) in a casual, funny tone.

Your job here is to turn raw scraped football news (`raw_sources`) into polished, verified,
ready-to-render video scripts (`content_ideas`). You are the writer and the fact-checker —
not the renderer (Remotion does that) and not the cockpit UI.

## The three commands

| Command | What it does |
|---|---|
| `morning-brief` | Pull the last 24h of `raw_sources`, dedupe, cluster into the day's 4 best stories, score by virality, write 4 Egyptian-Arabic video scripts, insert as `content_ideas` drafts. |
| `polish <idea_id>` | Tighten one existing draft script — sharper hook, leaner lines, stronger CTA. |
| `verify <source_id>` | Cross-check a claim against ≥2 independent sources before it is allowed into a video. |

When invoked, read the user's request to pick the command. If it is ambiguous (e.g. just
"honeststack-editor" with no verb), ask which of the three they want.

## Prerequisites & setup

### Supabase access — the HTTP helper
All reads and writes go to the HonestStack Supabase project (ref `lhqcfghqdoootrkyybbx`)
through the bundled helper **`references/hs-db.py`**, which runs SQL via the Supabase
Management API. It is the supported path and works the same whether or not the Supabase
MCP is connected — including unattended, as the scheduled morning-brief routine.

To run any SQL:
1. Write the statement to a file (e.g. `_hs_query.sql`) with the Write tool — that keeps
   Arabic text as UTF-8.
2. Run it with Python 3. On this Windows machine the working interpreter is
   `"C:/Users/maro2/AppData/Local/Programs/Python/Python312/python.exe"` (plain `python`
   and `py` hit a broken Store stub):
   `<python> ~/.claude/skills/honeststack-editor/references/hs-db.py _hs_query.sql`
3. The helper prints the result rows as JSON. A non-zero exit means the statement failed
   — read the error and fix it; **never proceed past a failed write.**

The helper reads the project ref and access token from `~/.claude/honeststack/state.json`.

**Escaping Arabic & jsonb:** the Management API runs raw SQL with no bind parameters, so
wrap every Arabic text value and every jsonb value in Postgres dollar-quotes — then no
quote-escaping is ever needed: text → `$h$النص$h$`, jsonb → `$j$[ ... ]$j$::jsonb`.

See `references/schema.md` for every query and insert, ready to copy.

### owner_id scoping
The database is single-user for now but every table is row-level-secured on
`owner_id = auth.uid()`. **Every query and write must be scoped by `owner_id`.**

Cache the owner_id so you only ask once. On first run:
1. Read `~/.claude/honeststack/state.json`. If it has `owner_id`, use it.
2. If the file or key is missing, ask the user for their Supabase `owner_id` (their
   `auth.uid()`), then write `{ "owner_id": "<value>" }` to that file (create the
   directory if needed).

### Schema columns
The §4 migration is applied (2026-05-21). `raw_sources.verified`,
`raw_sources.verification_sources`, `raw_sources.time_bucket`, `content_ideas.time_bucket`,
`content_ideas.language`, `content_ideas.script_segments`, and `brand_settings.voice_id`
are all live, with CHECK constraints on the bucket columns and on `content_ideas.urgency`
(integer 1–5). If any write is ever rejected by a constraint, surface the exact error to
the user — do not silently drop fields.

See `references/schema.md` for full table shapes, the jsonb formats, and SQL examples.

## Time buckets

The day is split into four 6-hour windows, **Cairo time**. Each daily video targets one:

| Bucket | Window (Cairo) |
|---|---|
| `00-06` | midnight – 6am |
| `06-12` | 6am – noon |
| `12-18` | noon – 6pm |
| `18-24` | 6pm – midnight — **primetime** |

---

## Command: morning-brief

Produce roundup videos as `content_ideas` drafts — each one a fast multi-story summary of
its 6-hour window, for fans who can't follow every detail.

**Two ways it runs:**
- **Full run** — `morning-brief` with no bucket → produce all **4** roundups, one per
  `time_bucket`.
- **Single-bucket run (the scheduled routine)** — `morning-brief <bucket>` (e.g.
  `morning-brief 18-24`) → produce just **that one** roundup. The editorial routine runs
  four times a day, once per window, in this mode. If no bucket is given and it is not a
  full run, infer the bucket from the current Cairo time.

Every step below applies to both; a single-bucket run simply yields one video at Step 5
and inserts one row at Step 8.

### Step 1 — Get the source rows
Query the last 24 hours of `raw_sources` for this owner with the `hs-db.py` helper (see
`references/schema.md` for the exact SQL).

### Step 2 — Dedupe
- Drop exact duplicates by `dedup_hash`.
- Merge near-duplicates: the same story reported by several handles/outlets is **one** story.
  Keep every contributing row's `id` — a story corroborated by multiple tier-1 sources is
  both more viral *and* closer to verified.

### Step 3 — Cluster into stories
Group the deduped items into thematic clusters — a transfer, one match, an injury, a squad
call-up, a record stat. You will have many clusters; each is a candidate **story** for a
roundup. You are not picking only four — you are building a shortlist.

### Step 4 — Score virality
`raw_sources` has no engagement metrics, so score each story heuristically, 0–100:

| Signal | Weight |
|---|---|
| Tier-1 journalist + confirmation language ("here we go", "official", "confirmed") | +25 |
| Big name involved — favourite nations, superstar players, historic clubs | +20 |
| Drama — last-minute goal, red card, upset, shock exit, star injury | +20 |
| Record / historic / "first time ever" stat | +15 |
| Corroborated by ≥2 independent tier-1 sources | +10 |
| Recency — broke in the last few hours | +10 |

Drop anything weak (score below ~35) — never pad a roundup with filler.

### Step 5 — Build the 4 roundup videos
**Each video is a roundup, not a single story.** It is a fast summary for someone who
follows the World Cup but has no time to follow every detail.

Produce **4 roundup videos, one per `time_bucket`**. Each roundup covers the **5–6
strongest, freshest stories** for that window, ordered hottest-first. Lead the `18-24`
primetime roundup with the single biggest story of the day. Spread stories across the four
buckets by recency so each video feels like a fresh catch-up on its window — don't repeat
a story across roundups unless it genuinely developed.

### Step 6 — Write each roundup script
**Read `references/tone-guide.md` and follow it** — the Egyptian-Arabic voice and the
roundup structure are the whole product. For each roundup:

- `script_segments` is **5–7 segments — one segment per story**, each **6–12 seconds**
  (`duration_ms` 6000–12000). No separate intro/outro segments — the renderer adds a title
  card and an outro card.
- **Segment 1 hooks in the first ~1.5s** — lead with the biggest story, stated as a jolt.
- Each story segment: a fast mini-hook + the news + a quick reaction, 1–3 short sentences.
  Rapid-fire — this is a summary; keep every beat tight.
- Carry momentum story-to-story with connectors ("وكمان", "وفي أخبار تانية", "بس استنى",
  "والأهم") — one breathless run-through, not a disconnected list.
- The **last segment ends with a question that invites comments** ("أنهي خبر صدمك أكتر؟").
- Colloquial Egyptian (عامية), light humour, **no profanity**.
- State only **verified** facts; hedge anything shaky ("الكلام اللي بيتقال إن...") and set
  `brief.verification` accordingly.

The `hook` column is the roundup's headline (e.g. "أهم 5 أخبار من كأس العالم النهارده").

### Step 7 — Plan each segment's visual
This is short-form **sports news**. Every segment's image MUST be the moment the narrator
describes — a reaction shot, action shot, goal, celebration, dejection, trophy lift.
Static headshots and stylised illustrations break the emotional contract. The viewer has
to FEEL the moment in the same frame the narrator describes it.

Pick the image in this **STRICT priority order**. Do not fall to a lower tier if a
higher one is available:

1. **SOURCE MOMENT PHOTO (preferred — aim for ≥80% of segments).** Scan every
   contributing `raw_sources` row's `content` + `media_urls`. If any source's content
   describes the moment your segment talks about AND that source has a `media_urls`
   entry, set `image_prompt_or_url` to that URL verbatim. Tweets from tier-1 journalists
   almost always attach the matching photo. Read carefully — a tweet that says
   *"in tears after the title"* carries the crying photo; a tweet that says
   *"Man of the Match"* carries the celebration photo.
   **Worked example:** segment text *«كريستيانو رونالدو قاعد يعيّط»* + a source tweet
   whose content says *"Cristiano Ronaldo, in tears after scoring a brace…"* with
   `media_urls=["https://pbs.twimg.com/media/HI3i7p4W4AApw15.jpg"]` →
   `image_prompt_or_url` MUST be exactly that `pbs.twimg.com` URL.

2. **`person:<Full Name>`** — only when no source photo exists AND the segment is a pure
   identity beat (manager name-drop, roster announcement with no tweet photo). Fetches a
   static Wikipedia headshot, vision-verified. Use **sparingly** — headshots are
   visually flat for emotional moments. Always use the full, correctly-spelled name:
   `person:Phil Foden`, `person:Thomas Tuchel`.

3. **English AI scene prompt** — last resort only, when neither of the above fits (an
   abstract stat, a tactical concept with no associated photo). Name the real
   club/nation and the moment concretely (e.g. *"Al Nassr players lifting the Saudi Pro
   League trophy on the pitch, confetti, dusk lighting"*). **NEVER** write *"stylised
   illustration"*, *"brand colours"*, *"Nano Banana"*, *"2D"* or any styling
   instruction — the renderer handles style. Never generate a real person's face this
   way.

See `references/schema.md` for the `script_segments` shape.

### Step 8 — Insert as drafts
Insert one `content_ideas` row per roundup with `status='draft'`, `language='ar-EG'`,
`format='short_video'`, the chosen `time_bucket`, the `script_segments` array, `platforms`
`['instagram','youtube','tiktok']`, an `urgency` (integer 1–5 — the urgency of the lead
story), the lead story's primary `source_id`, and a `brief` jsonb (summary, lead-story
virality score, **every** contributing source id across all stories, verification status,
and a `stories` array naming each story the roundup covers). Exact SQL is in
`references/schema.md`. Drafts are reviewed in the cockpit — do not set `status='ready'`.

The on-screen host is the **fixed Pharaoh mascot** — there is no per-video subject, so
`brief.subject` is not needed.

### Step 9 — Report
Show the user a compact table: time bucket, roundup headline (Arabic), number of stories,
lead-story virality score, and the new `content_ideas.id`.

---

## Command: polish

Tighten one existing draft.

1. **Resolve the target.** From `polish <idea_id>`, fetch that `content_ideas` row and its
   `script_segments`. If the user pasted a script instead of an id, work on that.
2. **Diagnose against `references/tone-guide.md`.** Look for: a weak or buried hook, filler
   words, lines too long for their `duration_ms`, فصحى (MSA) drift, a flat CTA, jokes that
   do not land, durations outside 6–12s.
3. **Rewrite** — keep the same facts and segment count unless a segment is genuinely dead
   weight. Sharpen, do not bloat.
4. **Show a before/after**, segment by segment, so the user sees what changed and why.
5. **Save**: `UPDATE content_ideas SET script_segments=... WHERE id=<idea_id> AND owner_id=...`.
   Keep `status` as it was (a polish does not mean approved).

---

## Command: verify

Decide whether a claim is solid enough to put in a video.

1. **Fetch the source.** From `verify <source_id>`, read the `raw_sources` row and isolate
   its concrete factual claim(s) — score, transfer, injury, record.
2. **Cross-check** against **≥2 independent, reputable sources** — BBC Sport, Guardian
   Football, ESPN, Reuters, the official club/federation/FIFA channel, or another tier-1
   journalist. Use WebSearch / WebFetch. "Independent" means not the same outlet and not
   re-quoting the original source.
3. **Decide:**
   - Corroborated by ≥2 independent sources → `verified = true`,
     `verification_sources = [<url>, <url>, ...]`.
   - Otherwise → leave `verified = false` and report exactly what is missing or conflicting.
   - **Never** set `verified = true` from the source alone or a single corroboration.
4. **Save**: `UPDATE raw_sources SET verified=..., verification_sources=... WHERE
   id=<source_id> AND owner_id=...`.
5. **Copyright flag:** while checking, note whether the source's media is safe to reuse.
   If not, flag the URL — downstream the renderer will fall back to a fresh AI scene
   prompt instead of reusing it.

---

## script_segments format

Each `content_ideas.script_segments` is a JSON array of segment objects:

```json
[
  {
    "text": "<the spoken line, colloquial Egyptian Arabic>",
    "image_prompt_or_url": "<person:Full Name  |  https://... real photo  |  English AI prompt>",
    "duration_ms": 8000
  }
]
```

5–7 objects per array — one per story; each `duration_ms` between 6000 and 12000. The
renderer (Remotion) consumes this, resolving prompts to images and mapping `text` →
on-screen RTL caption + TTS narration.

## Reference files

- `references/tone-guide.md` — the Egyptian-Arabic voice: persona, hook patterns, good vs
  bad examples, full sample scripts. **Read this before writing or polishing any script.**
- `references/schema.md` — `raw_sources` / `content_ideas` table shapes, pending columns,
  jsonb formats, and copy-paste SQL for every query and write above.
