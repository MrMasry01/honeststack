# Scenario A — Ingest Twitter

## Purpose

Poll the Apify Twitter scraper actor on a schedule, collect recent tweets from key football journalists and transfer-news accounts, deduplicate them, and push each new tweet as a row into the Supabase `raw_sources` table via the `ingest-source` edge function. This is the real-time pulse feed that surfaces breaking-news signals for the idea generator.

## Trigger

**Type:** Schedule
**Interval:** Every 15 minutes
**Time zone:** Cairo (Africa/Cairo, UTC+3)
**Active window:** 24 h / 7 days — run continuously during World Cup period.

---

## Modules (in order)

### Module 1 — Schedule (trigger)

| Field | Value |
|-------|-------|
| Module type | `Tools > Schedule` |
| Run every | 15 minutes |
| Start time | Any fixed anchor (e.g. 00:00 Cairo) |

No output variables — just fires the scenario.

---

### Module 2 — Set Variables (build actor input)

**Module type:** `Tools > Set Multiple Variables`

Define these variables for use downstream:

| Variable name | Value |
|---------------|-------|
| `actor_id` | `quacker/twitter-scraper` *(Apify actor slug — confirm exact slug in Apify console)* |
| `apify_api_token` | `{{env.APIFY_API_TOKEN}}` *(store in Make Environment or use a Text variable with the raw token)* |
| `handles` | `["FabrizioRomano","David_Ornstein","TransferNews_WC"]` *(JSON array; add/remove handles here)* |
| `max_tweets` | `20` *(per handle per run; keep low to stay within Apify CU budget)* |
| `search_terms` | `["World Cup 2026","#WorldCup2026","transfer","signing","injury"]` |
| `since_minutes` | `20` *(slightly longer than poll interval to avoid gaps at boundary)* |

> **Note on `TransferNews_WC`:** replace with the actual secondary handle once confirmed. Add it here; no other module needs to change.

---

### Module 3 — HTTP: Start Apify Actor Run (async)

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://api.apify.com/v2/acts/{{2.actor_id}}/runs?token={{2.apify_api_token}}` |
| Method | `POST` |
| Headers | `Content-Type: application/json` |
| Body type | `Raw (JSON)` |
| Body | See below |
| Parse response | `Yes` |
| Timeout | 30 s |

**Request body:**
```json
{
  "startUrls": [],
  "searchQueries": {{2.search_terms}},
  "twitterHandles": {{2.handles}},
  "maxTweets": {{2.max_tweets}},
  "sinceMinutes": {{2.since_minutes}},
  "addUserInfo": true,
  "scrapeTweetReplies": false
}
```

**Output variables used downstream:**
- `data.id` — actor run ID, referred to as `run_id`

---

### Module 4 — Tools: Sleep

**Module type:** `Tools > Sleep`

| Field | Value |
|-------|-------|
| Delay | 45 seconds |

Apify actor runs typically finish in 20–60 s for this workload. 45 s is a safe wait. If the poll in Module 5 finds status `RUNNING`, the error handler retries.

---

### Module 5 — HTTP: Poll Actor Run Status

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://api.apify.com/v2/actor-runs/{{3.data.id}}?token={{2.apify_api_token}}` |
| Method | `GET` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Output variables used:**
- `data.status` — e.g. `SUCCEEDED`, `RUNNING`, `FAILED`
- `data.defaultDatasetId` — dataset ID for fetching results

---

### Module 6 — Router: Check Run Status

**Module type:** `Flow Control > Router`

Create two routes:

**Route 1 — Success:** condition `{{5.data.status}} = SUCCEEDED` → continue to Module 7
**Route 2 — Not ready / failed:** condition `{{5.data.status}} != SUCCEEDED` → Module 6a (log and stop)

#### Module 6a — HTTP: Log Failed Run (Route 2)

**Module type:** `HTTP > Make a Request`

POST a minimal error record to the `ingest-source` edge function with `source_type: "error_log"` so failures are visible in Supabase. Then use `Flow Control > Break` to stop this execution without marking the scenario as an error.

```json
{
  "source_type": "error_log",
  "platform": "twitter_apify",
  "raw_content": "Actor run {{3.data.id}} ended with status {{5.data.status}}",
  "dedup_hash": "apify_run_{{3.data.id}}"
}
```

URL: `https://oddbzobxxphofaebibet.supabase.co/functions/v1/ingest-source`
Method: `POST`
Headers: `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: application/json`

---

### Module 7 — HTTP: Fetch Dataset Items

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://api.apify.com/v2/datasets/{{5.data.defaultDatasetId}}/items?token={{2.apify_api_token}}&format=json&limit=200` |
| Method | `GET` |
| Parse response | `Yes` |
| Timeout | 20 s |

**Output:** `data` — an array of tweet objects. Each item has at minimum:

```
id_str          — tweet ID (string)
full_text       — tweet body
user.screen_name
created_at      — ISO timestamp
lang
favorite_count
retweet_count
```

---

### Module 8 — Iterator

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{7.data}}` |

Iterates over each tweet object one at a time, feeding Modules 9–11.

---

### Module 9 — Tools: Set Variables (per tweet)

**Module type:** `Tools > Set Multiple Variables`

Build the fields needed for `ingest-source`. Compute `dedup_hash` as `sha1` of the tweet ID string so Supabase can reject duplicates cleanly.

| Variable | Value / expression |
|----------|--------------------|
| `tweet_id` | `{{8.id_str}}` |
| `screen_name` | `{{8.user.screen_name}}` |
| `raw_text` | `{{8.full_text}}` |
| `published_at` | `{{8.created_at}}` *(Apify returns ISO 8601)* |
| `lang` | `{{8.lang}}` |
| `likes` | `{{8.favorite_count}}` |
| `retweets` | `{{8.retweet_count}}` |
| `source_url` | `https://twitter.com/{{8.user.screen_name}}/status/{{8.id_str}}` |
| `dedup_hash` | `{{sha1(8.id_str)}}` *(Make built-in sha1 function)* |

---

### Module 10 — HTTP: POST to ingest-source

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
  "source_type": "twitter",
  "platform": "twitter",
  "external_id": "{{9.tweet_id}}",
  "author_handle": "{{9.screen_name}}",
  "raw_content": "{{9.raw_text}}",
  "published_at": "{{9.published_at}}",
  "lang": "{{9.lang}}",
  "source_url": "{{9.source_url}}",
  "engagement": {
    "likes": {{9.likes}},
    "retweets": {{9.retweets}}
  },
  "dedup_hash": "{{9.dedup_hash}}"
}
```

**Expected success response:** HTTP 200 or 201, body `{ "inserted": true }` or `{ "duplicate": true }`.
`duplicate: true` is a normal result — the edge function uses `ON CONFLICT (dedup_hash) DO NOTHING`.

---

### Module 11 — Filter: Only log errors

**Module type:** `Flow Control > Filter` (after Module 10, within iterator)

Condition: `{{10.status}} >= 400`

If true, allow Make's execution log to capture the error detail (`{{10.status}}`, `{{10.data}}`).

---

### Module 12 — Aggregator (optional, for run summary)

**Module type:** `Flow Control > Numeric Aggregator`

After the iterator completes, aggregate a count of processed tweets. Map `{{10.data.inserted}}` to know how many new items were stored this run.

---

## Data Mapping Summary

```
Apify dataset item field       → ingest-source payload field
─────────────────────────────────────────────────────────────
id_str                         → external_id, dedup_hash (sha1)
full_text                      → raw_content
user.screen_name               → author_handle
created_at                     → published_at
lang                           → lang
favorite_count                 → engagement.likes
retweet_count                  → engagement.retweets
(constructed)                  → source_url
(hardcoded "twitter")          → source_type, platform
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 3 | `api.apify.com/v2/acts/{actor}/runs` | `?token=APIFY_API_TOKEN` query param |
| Module 5 | `api.apify.com/v2/actor-runs/{run_id}` | `?token=APIFY_API_TOKEN` |
| Module 7 | `api.apify.com/v2/datasets/{id}/items` | `?token=APIFY_API_TOKEN` |
| Module 10 | `oddbzobxxphofaebibet.supabase.co/functions/v1/ingest-source` | `Authorization: Bearer SUPABASE_SERVICE_KEY` |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| Apify run status `FAILED` | Module 6a logs it, scenario stops cleanly |
| Apify run still `RUNNING` after 45 s | Module 6a breaks — next 15-min poll catches fresh tweets |
| `ingest-source` returns duplicate | `{ "duplicate": true }` is normal; no action needed |
| `ingest-source` returns 5xx | Set **Error handling > Retry** on Module 10: 3 attempts, 60 s interval |
| Apify HTTP error (4xx) | Add **Error handler > Resume** on Module 3; log and stop iterator |
| Iterator item missing `id_str` | Add a **Filter** before Module 9: `{{8.id_str}} exists` — skip malformed items |

**Global scenario settings:**
- Max errors before deactivating: 5
- Data retention: 30 days
- Incomplete executions: Store

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `APIFY_API_TOKEN` | Apify personal API token |
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT (not the anon key) |

---

## Blueprint Export

After building and testing this scenario in the Make.com UI:

1. Open the scenario.
2. Click the three-dot menu (⋮) in the top-right.
3. Select **Export Blueprint**.
4. Save the downloaded JSON as:

```
docs/make/scenario-a-ingest-twitter.json
```
