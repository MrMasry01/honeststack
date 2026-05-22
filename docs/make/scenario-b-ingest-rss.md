# Scenario B — Ingest RSS

## Purpose

Poll three authoritative football RSS feeds (BBC Sport, Guardian Football, ESPN FC) on a schedule, parse each item, and push new articles into the Supabase `raw_sources` table via the `ingest-source` edge function. This is the structured editorial signal source that complements the real-time Twitter feed.

## Trigger

**Type:** Schedule
**Interval:** Every 30 minutes
**Time zone:** Cairo (Africa/Cairo, UTC+3)
**Active window:** 24 h / 7 days during World Cup period.

---

## Feed URLs

| Source | RSS URL |
|--------|---------|
| BBC Sport Football | `https://feeds.bbci.co.uk/sport/football/rss.xml` |
| Guardian Football | `https://www.theguardian.com/football/rss` |
| ESPN FC | `https://www.espn.com/espn/rss/soccer/news` |

> If ESPN FC's public RSS becomes unavailable, substitute `https://www.espn.com/espn/rss/news` and filter by category in Module 5.

---

## Modules (in order)

### Module 1 — Schedule (trigger)

| Field | Value |
|-------|-------|
| Module type | `Tools > Schedule` |
| Run every | 30 minutes |
| Time zone | Africa/Cairo |

---

### Module 2 — Tools: Set Multiple Variables (feed list)

**Module type:** `Tools > Set Multiple Variables`

| Variable | Value |
|----------|-------|
| `feeds` | JSON array — see below |

```json
[
  {
    "name": "bbc_sport",
    "url": "https://feeds.bbci.co.uk/sport/football/rss.xml",
    "lang": "en"
  },
  {
    "name": "guardian_football",
    "url": "https://www.theguardian.com/football/rss",
    "lang": "en"
  },
  {
    "name": "espn_fc",
    "url": "https://www.espn.com/espn/rss/soccer/news",
    "lang": "en"
  }
]
```

---

### Module 3 — Iterator (feeds)

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{2.feeds}}` |

Iterates three times (once per feed). Each iteration runs Modules 4–13.

---

### Module 4 — HTTP: Fetch RSS Feed

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{3.url}}` |
| Method | `GET` |
| Headers | `User-Agent: HonestStack/1.0 (+https://honeststack.io)` |
| Parse response | `No` *(raw XML text)* |
| Timeout | 15 s |
| Follow redirects | Yes |

**Output:** `data` — raw XML string.

---

### Module 5 — XML: Parse XML

**Module type:** `XML > Parse XML`

| Field | Value |
|-------|-------|
| XML content | `{{4.data}}` |

Make's XML parser converts the RSS 2.0 or Atom feed into a structured object.

**Output structure (RSS 2.0 — BBC Sport, ESPN FC):**
```
channel.item[].title
channel.item[].link
channel.item[].description
channel.item[].pubDate       ← "Fri, 09 May 2025 14:22:00 GMT"
channel.item[].guid._value
channel.item[].category
```

**Output structure (Atom — Guardian Football):**
```
feed.entry[].title._value
feed.entry[].link[0]._href
feed.entry[].summary._value
feed.entry[].updated        ← ISO 8601
feed.entry[].id
```

> **Builder note:** Use the Make XML module's output inspector after a test run to confirm the exact key paths for each feed.

---

### Module 6 — Tools: Set Variable (item array)

**Module type:** `Tools > Set Variable`

Normalize the item array regardless of feed format:

| Variable | Expression |
|----------|------------|
| `items` | `{{if(5.channel.item; 5.channel.item; 5.feed.entry)}}` |

---

### Module 7 — Iterator (articles)

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{6.items}}` |

Iterates over each article in this feed.

---

### Module 8 — Tools: Set Multiple Variables (normalize article)

**Module type:** `Tools > Set Multiple Variables`

Normalize fields across RSS 2.0 and Atom formats:

| Variable | Expression |
|----------|------------|
| `title` | `{{if(7.title._value; 7.title._value; 7.title)}}` |
| `url` | `{{if(7.link; 7.link; 7.link[1]._href)}}` |
| `summary` | `{{if(7.description; stripHTML(7.description); if(7.summary._value; stripHTML(7.summary._value); ""))}}` |
| `published_at` | `{{if(7.pubDate; parseDate(7.pubDate; "ddd, DD MMM YYYY HH:mm:ss ZZ"); if(7.updated; 7.updated; now))}}` |
| `raw_guid` | `{{if(7.guid._value; 7.guid._value; if(7.id; 7.id; 8.url))}}` |
| `dedup_hash` | `{{sha1(8.raw_guid)}}` |
| `source_name` | `{{3.name}}` |
| `lang` | `{{3.lang}}` |

> **stripHTML** is a Make built-in text function. **parseDate** handles the RSS 2.0 date format.

---

### Module 9 — Filter: Skip old articles

**Module type:** `Flow Control > Filter`

Condition: `{{8.published_at}} >= {{addMinutes(now; -35)}}`

Only process articles published within the last 35 minutes (slightly longer than the 30-min poll interval).

---

### Module 10 — Filter: Skip if title empty

**Module type:** `Flow Control > Filter`

Condition: `{{length(8.title)}} > 3`

Skip malformed items with no meaningful title.

---

### Module 11 — HTTP: POST to ingest-source

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/functions/v1/ingest-source` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: application/json` |
| Body type | `Raw (JSON)` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Request body:**
```json
{
  "source_type": "rss",
  "platform": "{{8.source_name}}",
  "external_id": "{{8.raw_guid}}",
  "source_url": "{{8.url}}",
  "title": "{{8.title}}",
  "raw_content": "{{8.summary}}",
  "published_at": "{{formatDate(8.published_at; \"YYYY-MM-DDTHH:mm:ssZ\")}}",
  "lang": "{{8.lang}}",
  "dedup_hash": "{{8.dedup_hash}}"
}
```

**Expected responses:**
- `200 / 201` + `{ "inserted": true }` — new article saved.
- `200` + `{ "duplicate": true }` — already in `raw_sources`; no action.

---

### Module 12 — Filter: Catch errors

**Module type:** `Flow Control > Filter`

Condition: `{{11.status}} >= 400`

If true, log `{{11.status}}`, `{{11.data}}`, and `{{8.url}}` to the Make execution log or a data store.

---

### Module 13 — (End of inner iterator — articles)

The iterator automatically moves to the next article. After all articles in a feed are processed, the outer iterator (Module 3) moves to the next feed.

---

## Data Mapping Summary

```
RSS / Atom field              → ingest-source payload field
──────────────────────────────────────────────────────────
item.guid / entry.id          → external_id, dedup_hash (sha1)
item.title / entry.title      → title
item.link / entry.link._href  → source_url
item.description / entry.sum  → raw_content (HTML stripped)
item.pubDate / entry.updated  → published_at (ISO 8601)
feed config: lang             → lang
feed config: name             → platform
(hardcoded "rss")             → source_type
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 4 | BBC / Guardian / ESPN RSS URLs | None (public) |
| Module 11 | `oddbzobxxphofaebibet.supabase.co/functions/v1/ingest-source` | `Authorization: Bearer SUPABASE_SERVICE_KEY` |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| Feed returns non-200 (e.g. 503) | Add **Error handler > Resume** on Module 4; set fallback `data` to `<rss/>` (empty XML); Module 6 resolves to empty array; inner iterator skips |
| XML parse failure | Add **Error handler > Resume** on Module 5; log source name and break |
| `ingest-source` 5xx | Set **Retry** on Module 11: 3 attempts, 60 s interval |
| `ingest-source` duplicate (expected) | `{ "duplicate": true }` is normal; Filter in Module 12 ignores it |
| Date parse failure | Fallback to `now` in Module 8 — row is still inserted with approximate timestamp |
| Feed URL changes | Update the `feeds` array in Module 2 only |

**Global scenario settings:**
- Incomplete executions: Store
- Max errors before deactivating: 10

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT |

---

## Blueprint Export

After building and testing:

1. Open the scenario → ⋮ → **Export Blueprint**.
2. Save as:

```
docs/make/scenario-b-ingest-rss.json
```
