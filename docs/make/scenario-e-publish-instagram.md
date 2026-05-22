# Scenario E — Publish to Instagram

## Purpose

Poll the `posts_queue` table for scheduled Instagram posts that are due, retrieve the associated MP4 and caption data from Supabase, publish the video as an Instagram Reel via the Instagram Graph API, and call the `post-callback` edge function to record the external post ID and mark the queue row as published.

## Trigger

**Type:** Schedule
**Interval:** Every 5 minutes
**Time zone:** Cairo (Africa/Cairo, UTC+3)

---

## Prerequisites / Connections

| Connection | Details |
|------------|---------|
| `supabase-honeststack` | HTTP Custom API, Bearer: SUPABASE_SERVICE_KEY |
| `instagram-honeststack` | Facebook/Instagram Graph API OAuth. Required permissions: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`. Connect via Make → Connections → Instagram for Business. |

**Required setup outside Make:**
- A Facebook Page linked to the HonestStack Instagram Business account.
- Instagram Business or Creator account.
- Facebook Page ID and Instagram Business Account ID stored as environment variables.

---

## Modules (in order)

### Module 1 — Schedule (trigger)

| Field | Value |
|-------|-------|
| Module type | `Tools > Schedule` |
| Run every | 5 minutes |
| Time zone | Africa/Cairo |

---

### Module 2 — HTTP: Query posts_queue for due Instagram posts

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/posts_queue?platform=eq.instagram&status=eq.scheduled&publish_at=lte.{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}&select=id,asset_id,caption,hashtags,publish_at&limit=5` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Output:** `data[]` — array of up to 5 due queue rows.

---

### Module 3 — Iterator (queue rows)

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{2.data}}` |

---

### Module 4 — HTTP: Mark post as "publishing" (optimistic lock)

**Module type:** `HTTP > Make a Request`

Immediately flip `status` to `publishing` to prevent concurrent double-posting.

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/posts_queue?id=eq.{{3.id}}` |
| Method | `PATCH` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Content-Type: application/json`, `Prefer: return=minimal` |
| Body | `{"status": "publishing"}` |
| Parse response | `No` |
| Timeout | 10 s |

---

### Module 5 — HTTP: Fetch asset row

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/assets?id=eq.{{3.asset_id}}&select=id,kind,media,caption,hashtags` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Output:** `data[0].media.mp4_url`, `data[0].caption`, `data[0].hashtags[]`

---

### Module 6 — Tools: Set Multiple Variables (post content)

**Module type:** `Tools > Set Multiple Variables`

| Variable | Expression |
|----------|------------|
| `mp4_url` | `{{5.data[0].media.mp4_url}}` |
| `caption_text` | `{{if(3.caption; 3.caption; 5.data[0].caption)}}` |
| `hashtag_string` | `{{join(if(3.hashtags; 3.hashtags; 5.data[0].hashtags); " ")}}` |
| `full_caption` | `{{6.caption_text}}\n\n{{6.hashtag_string}}` |
| `ig_account_id` | `{{env.IG_BUSINESS_ACCOUNT_ID}}` |
| `queue_row_id` | `{{3.id}}` |

---

### Module 7 — HTTP: IG Graph API — Create Media Container

**Module type:** `HTTP > Make a Request`

Instagram Reels publication requires two steps: create a container, then publish it.

| Field | Value |
|-------|-------|
| URL | `https://graph.facebook.com/v19.0/{{6.ig_account_id}}/media` |
| Method | `POST` |
| Headers | `Content-Type: application/json` |
| Body type | `Raw (JSON)` |
| Parse response | `Yes` |
| Timeout | 30 s |

**Request body:**
```json
{
  "media_type": "REELS",
  "video_url": "{{6.mp4_url}}",
  "caption": "{{6.full_caption}}",
  "share_to_feed": true,
  "access_token": "{{env.IG_PAGE_ACCESS_TOKEN}}"
}
```

> The `video_url` must be publicly accessible. Supabase Storage objects in a public bucket are suitable.

**Output:** `container_id` = `{{7.data.id}}`

---

### Module 8 — Tools: Sleep (wait for IG to process video)

**Module type:** `Tools > Sleep`

| Field | Value |
|-------|-------|
| Delay | 30 seconds |

Short videos (< 90 s) typically process in 15–45 s.

---

### Module 9 — HTTP: IG Graph API — Check Container Status

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://graph.facebook.com/v19.0/{{7.data.id}}?fields=status_code&access_token={{env.IG_PAGE_ACCESS_TOKEN}}` |
| Method | `GET` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Expected `status_code` values:** `FINISHED`, `IN_PROGRESS`, `ERROR`, `PUBLISHED`

---

### Module 10 — Router: Check container status

**Module type:** `Flow Control > Router`

**Route 1:** `{{9.data.status_code}} = FINISHED` → Module 11
**Route 2:** `{{9.data.status_code}} = ERROR` → Module 10a
**Route 3:** `{{9.data.status_code}} = IN_PROGRESS` → Module 10b (extra 20 s wait + re-poll, max 4 times)

#### Module 10a — Error: Revert queue + call post-callback(failed)

PATCH queue: `{"status": "failed"}`. Then call `post-callback` with `{ "queue_id": "{{6.queue_row_id}}", "status": "failed", "platform": "instagram" }`.

#### Module 10b — Sleep 20 s + re-poll Module 9

Add `Sleep (20 s)` then duplicate Module 9, feeding back into the Router. Allow max 4 re-polls.

---

### Module 11 — HTTP: IG Graph API — Publish Container

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://graph.facebook.com/v19.0/{{6.ig_account_id}}/media_publish` |
| Method | `POST` |
| Headers | `Content-Type: application/json` |
| Body type | `Raw (JSON)` |
| Parse response | `Yes` |
| Timeout | 20 s |

**Request body:**
```json
{
  "creation_id": "{{7.data.id}}",
  "access_token": "{{env.IG_PAGE_ACCESS_TOKEN}}"
}
```

**Output:** `ig_post_id` = `{{11.data.id}}`

---

### Module 12 — HTTP: POST to post-callback

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/functions/v1/post-callback` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: application/json` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Request body:**
```json
{
  "queue_id": "{{6.queue_row_id}}",
  "platform": "instagram",
  "external_post_id": "{{11.data.id}}",
  "status": "published",
  "published_at": "{{formatDate(now; \"YYYY-MM-DDTHH:mm:ssZ\")}}"
}
```

---

## Data Mapping Summary

```
posts_queue.id             → queue_row_id → post-callback
posts_queue.asset_id       → assets table lookup
posts_queue.caption        → full_caption (overrides asset.caption)
posts_queue.hashtags[]     → appended to full_caption

assets.media.mp4_url       → IG Graph API video_url
assets.caption             → fallback if posts_queue.caption is null
assets.hashtags[]          → fallback if posts_queue.hashtags is null

IG media_publish.id        → external_post_id
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 2 | Supabase REST `posts_queue` | Bearer SUPABASE_SERVICE_KEY |
| Module 4 | Supabase REST `posts_queue` PATCH | Bearer SUPABASE_SERVICE_KEY |
| Module 5 | Supabase REST `assets` | Bearer SUPABASE_SERVICE_KEY |
| Module 7 | `graph.facebook.com/v19.0/{ig_id}/media` | `access_token` param |
| Module 9 | `graph.facebook.com/v19.0/{container_id}` | `access_token` param |
| Module 11 | `graph.facebook.com/v19.0/{ig_id}/media_publish` | `access_token` param |
| Module 12 | `functions/v1/post-callback` | Bearer SUPABASE_SERVICE_KEY |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| No due posts | Iterator is empty; scenario ends cleanly |
| `assets` row not found | Check array length; if 0, PATCH queue to `failed`, skip |
| IG container status `ERROR` | Module 10a reverts queue, calls post-callback with `failed` |
| IG `media_publish` 4xx | Retry Module 11: 2 attempts, 30 s; if still failing, revert queue to `scheduled` |
| `post-callback` 5xx | Retry Module 12: 3 attempts, 60 s |
| MP4 URL not publicly accessible | Switch Supabase Storage bucket to public, or add a signed URL generation step before Module 7 |
| Instagram token expired | Make OAuth auto-refreshes long-lived tokens; if revoked, reconnect `instagram-honeststack` |

**Global scenario settings:**
- Incomplete executions: Store
- Max errors before deactivating: 5

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `IG_BUSINESS_ACCOUNT_ID` | Instagram Business Account numeric ID |
| `IG_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token (managed via Make OAuth) |

---

## Blueprint Export

After building and testing:

1. Open the scenario → ⋮ → **Export Blueprint**.
2. Save as:

```
docs/make/scenario-e-publish-instagram.json
```
