# Schema & SQL reference

Everything `honeststack-editor` reads or writes. Supabase project ref `lhqcfghqdoootrkyybbx`.
Every table is RLS'd on `owner_id = auth.uid()` — **always** include `owner_id` in `WHERE`
and `INSERT`.

## Running SQL

Run every statement through the bundled helper **`references/hs-db.py`**, which executes
SQL against the project via the Supabase Management API — with or without the Supabase MCP.
Write the statement to a `.sql` file (UTF-8, via the Write tool), then:

```bash
<python> ~/.claude/skills/honeststack-editor/references/hs-db.py _hs_query.sql
```

It prints the result rows as JSON; a non-zero exit means the statement failed.

**Escaping.** The Management API runs raw SQL with no bind parameters. Use Postgres
**dollar-quoting** for every Arabic text value and every jsonb value — it needs no
escaping at all:
- text:  `$h$أهم ٥ أخبار النهارده$h$`
- jsonb: `$j$[{"text":"..."}]$j$::jsonb`

The schema below is current — the §4 migration was applied 2026-05-21 (all columns live,
with CHECK constraints and indexes). To re-confirm a column at any time, inspect it:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'content_ideas';
```

---

## Table: raw_sources

Scraped items from Twitter (TwitterAPI.io) and RSS (BBC/Guardian/ESPN).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | RLS key |
| `source_type` | text | `'twitter'` \| `'rss'` |
| `source_handle` | text | e.g. `FabrizioRomano`, `BBCSport` |
| `external_id` | text | tweet id / article guid |
| `url` | text | canonical link |
| `author` | text | display name |
| `content` | text | tweet / article text |
| `media_urls` | text[] | attached image/video URLs |
| `dedup_hash` | text | exact-duplicate key |
| `created_at` | timestamptz | ingest time |
| `verified` | boolean | default `false` |
| `verification_sources` | text[] | corroborating URLs |
| `time_bucket` | text | `'00-06'\|'06-12'\|'12-18'\|'18-24'` (CHECK-constrained) |

### morning-brief — Step 1 query (last 24h)

```sql
select id, source_type, source_handle, external_id, url, author, content,
       media_urls, dedup_hash, verified, verification_sources, created_at
from raw_sources
where owner_id = '<OWNER_ID>'
  and created_at >= now() - interval '24 hours'
order by created_at desc;
```

### verify — fetch one source

```sql
select id, source_type, source_handle, url, author, content, media_urls,
       verified, verification_sources
from raw_sources
where id = '<SOURCE_ID>' and owner_id = '<OWNER_ID>';
```

### verify — write result

```sql
update raw_sources
set verified = true,
    verification_sources = array['<URL1>','<URL2>']
where id = '<SOURCE_ID>' and owner_id = '<OWNER_ID>';
```

If not corroborated, leave `verified = false` and do not write `verification_sources`.

---

## Table: content_ideas

Drafted video angles. `morning-brief` inserts these; `polish` updates them.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `owner_id` | uuid | RLS key |
| `source_id` | uuid | primary `raw_sources.id` for the story |
| `hook` | text | the one-line hook, Egyptian Arabic |
| `angle` | text | the editorial angle (short, can be English) |
| `format` | text | use `'short_video'` |
| `platforms` | text[] | `['instagram','youtube','tiktok']` |
| `urgency` | integer | **1–5** (CHECK-constrained), default `3` — see note below |
| `status` | text | `draft` \| `ready` \| `scheduled` \| `posted` — insert as `draft` |
| `brief` | jsonb | structured editorial brief — shape below |
| `created_at` | timestamptz | |
| `time_bucket` | text | one of the 4 windows (CHECK-constrained) |
| `language` | text | default `'ar-EG'` |
| `script_segments` | jsonb | array of segments, shape below |

> **`urgency`** is an integer **1–5** (CHECK-constrained), default **3**. It scores how
> time-sensitive the story is — not how viral. `5` = breaking, must publish this window;
> `3` = standard; `1–2` = evergreen / explainer. Derive it from recency and how fast the
> story decays. It is separate from `brief.virality_score` (0–100), which scores reach.

### morning-brief — Step 8 insert (one row per roundup)

Dollar-quote the Arabic `hook` and both jsonb columns — no escaping needed:

```sql
insert into content_ideas
  (owner_id, source_id, hook, angle, format, platforms, urgency, status,
   language, time_bucket, script_segments, brief)
values
  ('<OWNER_ID>', '<LEAD_SOURCE_ID>', $h$<HOOK_AR>$h$, '<ANGLE>', 'short_video',
   array['instagram','youtube','tiktok'], 4, 'draft',
   'ar-EG', '<TIME_BUCKET>', $seg$<SCRIPT_SEGMENTS_JSON>$seg$::jsonb,
   $brf$<BRIEF_JSON>$brf$::jsonb)
returning id;
```

### polish — fetch one idea

```sql
select id, hook, angle, status, time_bucket, script_segments, brief
from content_ideas
where id = '<IDEA_ID>' and owner_id = '<OWNER_ID>';
```

### polish — write the tightened script

```sql
update content_ideas
set script_segments = $seg$<SCRIPT_SEGMENTS_JSON>$seg$::jsonb
where id = '<IDEA_ID>' and owner_id = '<OWNER_ID>';
```

Update `hook` too if the polished hook changed. Do not change `status`.

---

## jsonb shapes

### `script_segments`

```json
[
  {
    "text": "تلات أهداف في شبكة البرازيل؟! اللي شفته صح.",
    "image_prompt_or_url": "https://pbs.twimg.com/media/realphoto.jpg",
    "duration_ms": 7000
  },
  {
    "text": "منتخب السامبا اترص قدام مرماه طول الماتش والمدرب ملقاش حل.",
    "image_prompt_or_url": "https://pbs.twimg.com/media/realphoto-defenders.jpg",
    "duration_ms": 9000
  }
]
```

- 5–7 segments — one per story. Each `duration_ms` 6000–12000.
- `image_prompt_or_url` takes three forms, in this STRICT priority order:
  1. **A real photo URL** (starts with `http`) — **preferred for ≥80% of segments**. Use the
     `media_urls` entry from a contributing `raw_sources` row whose `content` describes the
     moment the segment narrates. Tier-1 journalist tweets almost always attach the photo.
  2. **`person:<Full Name>`** — the renderer fetches a real Wikipedia headshot and
     vision-verifies the face. Use ONLY when no source photo exists AND the segment is a
     pure identity beat. Static and visually flat — sparing use.
  3. **An English AI scene prompt** — last resort. Name real clubs/nations and the actual
     moment concretely. Never write "stylised", "brand colours", "Nano Banana", or "2D" —
     the renderer handles style.
- `text` is colloquial Egyptian Arabic — the renderer uses it for both the RTL caption and
  the ElevenLabs TTS narration.

### `brief`

A roundup covers several stories, so the brief lists them all:

```json
{
  "summary_en": "Evening roundup, 5 stories: England drop Foden from the squad; Salah named Egypt captain; Ronaldo's Al Nassr future; Neuer reverses retirement; Mbappé hat-trick.",
  "virality_score": 85,
  "source_ids": ["3f9a...uuid", "7c21...uuid", "9b04...uuid"],
  "verification": "partial",
  "stories": [
    "England leave Phil Foden out of the World Cup squad",
    "Mohamed Salah confirmed as Egypt captain",
    "Cristiano Ronaldo's Al Nassr future in doubt"
  ],
  "cta": "أنهي خبر فيهم صدمك أكتر؟"
}
```

- `virality_score`: 0–100 — the **lead story's** score from the morning-brief rubric.
- `source_ids`: **every** contributing `raw_sources.id`, across all stories in the roundup.
- `verification`: `"verified"` (all core claims corroborated), `"partial"`, or
  `"unverified"` — the weakest story sets it.
- `stories`: one short English line naming each story the roundup covers, in air order.
- The on-screen host is the fixed Pharaoh mascot — there is no per-video `subject`.

---

## Table: brand_settings (read-only here)

Per-owner brand kit. Relevant fields: `primary_color`, `accent_color`, `logo_url`,
`voice_style`, and `voice_id` (the ElevenLabs voice-clone id). This skill does not write
brand_settings; the renderer and Make scenarios consume it.
