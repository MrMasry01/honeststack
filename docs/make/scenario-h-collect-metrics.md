# Scenario H — Collect Metrics

## Purpose

Every 6 hours, query `posts_queue` for recently published posts that have an `external_post_id`, pull the latest engagement stats (views, likes, comments, shares, saves) from each platform's API, and upsert the results into the `post_metrics` table. This provides performance data for the idea generator and editorial dashboard.

## Trigger

**Type:** Schedule
**Interval:** Every 6 hours
**Time zone:** Cairo (Africa/Cairo, UTC+3)
**Suggested run times:** 02:00, 08:00, 14:00, 20:00 Cairo

---

## Prerequisites / Connections

| Connection | Details |
|------------|---------|
| `supabase-honeststack` | HTTP Custom API, Bearer: SUPABASE_SERVICE_KEY |
| `instagram-honeststack` | Instagram Graph API OAuth — same connection as Scenario E |
| `youtube-honeststack` | YouTube Data API v3 OAuth — same connection as Scenario F |
| `tiktok-honeststack` | TikTok API OAuth — same connection as Scenario G |

---

## Modules (in order)

### Module 1 — Schedule (trigger)

| Field | Value |
|-------|-------|
| Module type | `Tools > Schedule` |
| Run every | 6 hours |
| Time zone | Africa/Cairo |
| First run | 02:00 Cairo |

---

### Module 2 — HTTP: Fetch recent published posts

**Module type:** `HTTP > Make a Request`

Fetch posts published within the last 7 days that have an `external_post_id`.

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/posts_queue?status=eq.published&external_post_id=not.is.null&publish_at=gte.{{formatDate(addDays(now; -7); "YYYY-MM-DDTHH:mm:ssZ")}}&select=id,platform,external_post_id,asset_id&order=publish_at.desc&limit=50` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Output:** `data[]` — array of published posts.

---

### Module 3 — Iterator (posts)

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{2.data}}` |

Iterates over each post; runs Modules 4–16 per post.

---

### Module 4 — Router: Branch by platform

**Module type:** `Flow Control > Router`

**Route 1:** `{{3.platform}} = instagram` → Module 5 (IG metrics)
**Route 2:** `{{3.platform}} = youtube` → Module 8 (YT metrics)
**Route 3:** `{{3.platform}} = tiktok` → Module 11 (TikTok metrics)
**Route 4:** else → Module 14 (unknown platform log; skip upsert)

---

## Route 1 — Instagram Metrics

### Module 5 — HTTP: IG Graph API — Media Insights

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://graph.facebook.com/v19.0/{{3.external_post_id}}/insights?metric=impressions,reach,likes,comments,shares,saved,plays&access_token={{env.IG_PAGE_ACCESS_TOKEN}}` |
| Method | `GET` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Expected response:**
```json
{
  "data": [
    { "name": "plays", "values": [{ "value": 15000 }] },
    { "name": "likes", "values": [{ "value": 430 }] },
    { "name": "comments", "values": [{ "value": 52 }] },
    { "name": "shares", "values": [{ "value": 87 }] },
    { "name": "saved", "values": [{ "value": 34 }] }
  ]
}
```

> For Reels, `plays` = video views. Check the Graph API changelog if a metric returns an error — remove unavailable ones from the URL.

---

### Module 6 — Tools: Set Multiple Variables (IG metrics)

**Module type:** `Tools > Set Multiple Variables`

Use `find` on the `data[]` array to extract each metric value:

| Variable | Expression |
|----------|------------|
| `views` | `{{5.data[find(5.data; "name"; "plays")].values[0].value}}` |
| `likes` | `{{5.data[find(5.data; "name"; "likes")].values[0].value}}` |
| `comments` | `{{5.data[find(5.data; "name"; "comments")].values[0].value}}` |
| `shares` | `{{5.data[find(5.data; "name"; "shares")].values[0].value}}` |
| `saves` | `{{5.data[find(5.data; "name"; "saved")].values[0].value}}` |
| `platform` | `instagram` |
| `post_id` | `{{3.id}}` |

Then proceed to Module 15 (upsert).

---

## Route 2 — YouTube Metrics

### Module 8 — HTTP: YouTube Data API v3 — Video Statistics

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://www.googleapis.com/youtube/v3/videos?id={{3.external_post_id}}&part=statistics&key={{env.YOUTUBE_API_KEY}}` |
| Method | `GET` |
| Parse response | `Yes` |
| Timeout | 15 s |

> Use `YOUTUBE_API_KEY` (server key) for read-only statistics.

**Expected response:**
```json
{
  "items": [{
    "statistics": {
      "viewCount": "18420",
      "likeCount": "612",
      "commentCount": "48"
    }
  }]
}
```

YouTube does not expose share count or save count via the public API.

---

### Module 9 — Tools: Set Multiple Variables (YT metrics)

| Variable | Expression |
|----------|------------|
| `views` | `{{8.data.items[0].statistics.viewCount}}` |
| `likes` | `{{8.data.items[0].statistics.likeCount}}` |
| `comments` | `{{8.data.items[0].statistics.commentCount}}` |
| `shares` | `0` *(not available)* |
| `saves` | `0` *(not available)* |
| `platform` | `youtube` |
| `post_id` | `{{3.id}}` |

Then proceed to Module 15.

---

## Route 3 — TikTok Metrics

### Module 11 — HTTP: TikTok — Query Video Data

**Module type:** `HTTP > Make a Request`

Use the Content Posting API status fetch for basic confirmation, or the TikTok Research API for engagement stats if approved.

| Field | Value |
|-------|-------|
| URL | `https://open.tiktokapis.com/v2/post/publish/status/fetch/` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.TIKTOK_ACCESS_TOKEN}}`, `Content-Type: application/json; charset=UTF-8` |
| Body | `{"publish_id": "{{3.external_post_id}}"}` |
| Parse response | `Yes` |
| Timeout | 15 s |

> If TikTok Research API access is granted, switch to: `POST https://open.tiktokapis.com/v2/research/video/query/` with `filters: { video_ids: ["{{3.external_post_id}}"] }` and `fields: ["view_count","like_count","comment_count","share_count"]`.

---

### Module 12 — Tools: Set Multiple Variables (TikTok metrics)

| Variable | Expression |
|----------|------------|
| `views` | `{{if(11.data.data.view_count; 11.data.data.view_count; 0)}}` |
| `likes` | `{{if(11.data.data.like_count; 11.data.data.like_count; 0)}}` |
| `comments` | `{{if(11.data.data.comment_count; 11.data.data.comment_count; 0)}}` |
| `shares` | `{{if(11.data.data.share_count; 11.data.data.share_count; 0)}}` |
| `saves` | `0` *(not available in Content Posting API)* |
| `platform` | `tiktok` |
| `post_id` | `{{3.id}}` |

Then proceed to Module 15.

---

## Module 15 — HTTP: Upsert post_metrics row (all routes merge here)

**Module type:** `HTTP > Make a Request`

All three platform routes set the same variable names (`views`, `likes`, `comments`, `shares`, `saves`, `platform`, `post_id`), so this single module handles all platforms.

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/post_metrics` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Content-Type: application/json`, `Prefer: resolution=merge-duplicates` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Request body:**
```json
{
  "post_id": "{{post_id}}",
  "platform": "{{platform}}",
  "collected_at": "{{formatDate(now; \"YYYY-MM-DDTHH:mm:ssZ\")}}",
  "views": {{views}},
  "likes": {{likes}},
  "comments": {{comments}},
  "shares": {{shares}},
  "saves": {{saves}}
}
```

> The `Prefer: resolution=merge-duplicates` header enables upsert. Requires a unique constraint on `post_metrics`. Recommended SQL:

```sql
CREATE TABLE post_metrics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid REFERENCES posts_queue(id) ON DELETE CASCADE,
  platform     text NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  views        bigint DEFAULT 0,
  likes        bigint DEFAULT 0,
  comments     bigint DEFAULT 0,
  shares       bigint DEFAULT 0,
  saves        bigint DEFAULT 0,
  UNIQUE (post_id, date_trunc('hour', collected_at))
);
```

---

### Module 16 — Filter: Log upsert errors

**Module type:** `Flow Control > Filter`

Condition: `{{15.status}} >= 400`

If true, log `{{15.status}}` and `{{15.data}}` to the Make execution log.

---

## Data Mapping Summary

```
posts_queue.external_post_id   → IG: media ID in insights URL
                               → YT: video ID in statistics URL
                               → TikTok: publish_id in status fetch
posts_queue.platform           → Router branching

IG plays                       → post_metrics.views
IG likes / comments / shares / saved → post_metrics fields
YT viewCount / likeCount / commentCount → post_metrics fields
TikTok view/like/comment/share_count → post_metrics fields
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 2 | Supabase REST `posts_queue` | Bearer SUPABASE_SERVICE_KEY |
| Module 5 | `graph.facebook.com/v19.0/{media_id}/insights` | `access_token` param |
| Module 8 | `googleapis.com/youtube/v3/videos` | `key` param (YOUTUBE_API_KEY) |
| Module 11 | `open.tiktokapis.com/v2/post/publish/status/fetch/` | Bearer TIKTOK_ACCESS_TOKEN |
| Module 15 | Supabase REST `post_metrics` (upsert) | Bearer SUPABASE_SERVICE_KEY |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| No published posts | `data[]` is empty; scenario ends cleanly |
| IG media deleted / not found | Graph API returns error 100; add error handler on Module 5: set all metrics to 0, optionally PATCH post to `archived` |
| YouTube video private/deleted | `items[]` is empty; check length before Module 9; if 0, set metrics to 0 |
| TikTok metrics unavailable | Modules 11/12 return 0 for all — partial data is acceptable |
| Supabase upsert constraint violation | `Prefer: resolution=merge-duplicates` prevents this; if it occurs, verify the unique constraint definition |
| Rate limits (IG: 200 calls/hour, YT: 10k units/day) | 50 posts × 1 call = 50 calls per 6-hour run — well within limits |
| `post_metrics` INSERT 5xx | Retry Module 15: 2 attempts, 30 s; store incomplete execution if both fail |

**Global scenario settings:**
- Incomplete executions: Store
- Max errors before deactivating: 10 (metric collection failures are not blocking)

---

## Extending to Additional Metrics

When new metrics become available:
1. Add the column to `post_metrics` in Supabase (SQL migration).
2. Add the field to Module 15's request body.
3. Extract the value in the relevant platform's Set Variables module.

No other modules need to change.

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `IG_PAGE_ACCESS_TOKEN` | Instagram Page Access Token (same as Scenario E) |
| `YOUTUBE_API_KEY` | YouTube Data API server key (for read-only stats) |
| `TIKTOK_ACCESS_TOKEN` | TikTok OAuth access token (managed by Make) |

---

## Blueprint Export

After building and testing:

1. Open the scenario → ⋮ → **Export Blueprint**.
2. Save as:

```
docs/make/scenario-h-collect-metrics.json
```
