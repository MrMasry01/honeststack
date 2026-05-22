# Scenario F — Publish to YouTube Shorts

## Purpose

Poll `posts_queue` for scheduled YouTube posts that are due, retrieve the MP4 and metadata from Supabase, upload the video to YouTube as a Short using the YouTube Data API v3 resumable upload protocol, set the video metadata (title, description, tags, category), and call `post-callback` to record the video ID and mark the queue row as published.

## Trigger

**Type:** Schedule
**Interval:** Every 5 minutes
**Time zone:** Cairo (Africa/Cairo, UTC+3)

---

## Prerequisites / Connections

| Connection | Details |
|------------|---------|
| `supabase-honeststack` | HTTP Custom API, Bearer: SUPABASE_SERVICE_KEY |
| `youtube-honeststack` | Google / YouTube Data API v3 OAuth. Required scopes: `youtube.upload`, `youtube`. Connect via Make → Connections → Google YouTube. |

**YouTube Shorts requirement:** A video is automatically classified as a Short if its duration is 60 seconds or less AND its aspect ratio is 9:16 (1080×1920). The Remotion service produces exactly this format. No special API flag is needed.

---

## Modules (in order)

### Module 1 — Schedule (trigger)

| Field | Value |
|-------|-------|
| Module type | `Tools > Schedule` |
| Run every | 5 minutes |
| Time zone | Africa/Cairo |

---

### Module 2 — HTTP: Query posts_queue for due YouTube posts

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/posts_queue?platform=eq.youtube&status=eq.scheduled&publish_at=lte.{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}&select=id,asset_id,caption,hashtags,publish_at&limit=3` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

> Limit to 3 per run. YouTube quota is 10,000 units/day; each upload costs 1,600 units. 4 uploads/day = 6,400 units, well within quota.

---

### Module 3 — Iterator (queue rows)

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{2.data}}` |

---

### Module 4 — HTTP: Mark post as "publishing"

**Module type:** `HTTP > Make a Request`

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

### Module 6 — Tools: Set Multiple Variables (video metadata)

**Module type:** `Tools > Set Multiple Variables`

| Variable | Expression |
|----------|------------|
| `mp4_url` | `{{5.data[0].media.mp4_url}}` |
| `caption_raw` | `{{if(3.caption; 3.caption; 5.data[0].caption)}}` |
| `hashtags` | `{{if(3.hashtags; 3.hashtags; 5.data[0].hashtags)}}` |
| `hashtag_string` | `{{join(6.hashtags; " ")}}` |
| `yt_title` | `{{left(6.caption_raw; 100)}}` *(YouTube title max 100 chars)* |
| `yt_description` | `{{6.caption_raw}}\n\n{{6.hashtag_string}}\n\n#Shorts #WorldCup2026 #Football` |
| `yt_tags` | `{{join(6.hashtags; ",")}}` *(comma-separated, no # prefix — strip # from each tag)* |
| `queue_row_id` | `{{3.id}}` |

> To strip `#` from tags: use `split(replace(6.hashtag_string; "#"; ""); " ")` to produce an array, then `join(...; ",")`.

---

### Module 7 — HTTP: Download MP4 binary

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{6.mp4_url}}` |
| Method | `GET` |
| Parse response | `No` *(binary)* |
| Timeout | 90 s |

**Output:** `data` — binary MP4 blob.

---

### Module 8 — HTTP: Initiate YouTube Resumable Upload Session

**Module type:** `HTTP > Make a Request`

The YouTube Data API v3 resumable upload sends metadata first; YouTube returns a session URI.

| Field | Value |
|-------|-------|
| URL | `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.YOUTUBE_ACCESS_TOKEN}}`, `Content-Type: application/json`, `X-Upload-Content-Type: video/mp4` |
| Body type | `Raw (JSON)` |
| Parse response | `No` *(we need the `Location` response header)* |
| Read response headers | `Yes` *(enable in Make HTTP module settings)* |
| Timeout | 15 s |

**Request body:**
```json
{
  "snippet": {
    "title": "{{6.yt_title}}",
    "description": "{{6.yt_description}}",
    "tags": [{{6.yt_tags}}],
    "categoryId": "17",
    "defaultLanguage": "en",
    "defaultAudioLanguage": "en"
  },
  "status": {
    "privacyStatus": "public",
    "selfDeclaredMadeForKids": false,
    "madeForKids": false
  }
}
```

> **Category 17** = Sports. Use `22` (People & Blogs) as a fallback if Sports is rejected.

**Output:** `headers.location` — the resumable session URI.

---

### Module 9 — HTTP: Upload MP4 via Resumable Session URI

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{8.headers.location}}` *(the resumable session URI)* |
| Method | `PUT` |
| Headers | `Content-Type: video/mp4` |
| Body type | `Raw` |
| Body | `{{7.data}}` *(binary MP4)* |
| Parse response | `Yes` |
| Timeout | 300 s *(5 minutes — large file upload)* |

**Expected response:**
```json
{
  "kind": "youtube#video",
  "id": "dQw4w9WgXcQ",
  "status": { "uploadStatus": "uploaded" }
}
```

**Output variable:** `yt_video_id` = `{{9.data.id}}`

---

### Module 10 — Router: Check upload status

**Module type:** `Flow Control > Router`

**Route 1:** `{{9.data.status.uploadStatus}} = uploaded` → Module 11
**Route 2:** Else → Module 10a (error: revert queue to `scheduled`)

---

### Module 11 — HTTP: POST to post-callback

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
  "platform": "youtube",
  "external_post_id": "{{9.data.id}}",
  "external_url": "https://youtube.com/shorts/{{9.data.id}}",
  "status": "published",
  "published_at": "{{formatDate(now; \"YYYY-MM-DDTHH:mm:ssZ\")}}"
}
```

---

## Data Mapping Summary

```
posts_queue.id             → queue_row_id → post-callback
posts_queue.asset_id       → assets table lookup
posts_queue.caption        → yt_title (truncated to 100), yt_description
posts_queue.hashtags[]     → yt_tags (# stripped), appended to description

assets.media.mp4_url       → downloaded binary → YouTube resumable upload
assets.caption             → fallback if posts_queue.caption null
assets.hashtags[]          → fallback if posts_queue.hashtags null

YouTube API video.id       → external_post_id
"https://youtube.com/shorts/{id}" → external_url
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 2 | Supabase REST `posts_queue` | Bearer SUPABASE_SERVICE_KEY |
| Module 4 | Supabase REST `posts_queue` PATCH | Bearer SUPABASE_SERVICE_KEY |
| Module 5 | Supabase REST `assets` | Bearer SUPABASE_SERVICE_KEY |
| Module 7 | Supabase Storage (public MP4 URL) | None (public bucket) |
| Module 8 | `googleapis.com/upload/youtube/v3/videos` | Bearer YOUTUBE_ACCESS_TOKEN |
| Module 9 | Resumable session URI (from Module 8 Location header) | None (auth in URI) |
| Module 11 | `functions/v1/post-callback` | Bearer SUPABASE_SERVICE_KEY |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| No due posts | Iterator empty; scenario ends cleanly |
| Asset row missing | Check array length; PATCH queue to `failed` |
| YouTube 403 quota exceeded | Returns `quotaExceeded`; PATCH queue back to `scheduled`; quota resets next day |
| Upload timeout | Retry Module 9: 2 attempts, 60 s back-off; if both fail, revert queue to `scheduled` |
| Video stuck in processing | `uploadStatus: uploaded` is sufficient to confirm receipt; Shorts processing continues asynchronously |
| `post-callback` 5xx | Retry: 3 attempts, 60 s; store incomplete execution if all fail |
| OAuth token expired | Make auto-refreshes; if refresh grant revoked, reconnect `youtube-honeststack` |

**Global scenario settings:**
- Incomplete executions: Store
- Max errors before deactivating: 3

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `YOUTUBE_ACCESS_TOKEN` | Managed automatically by Make OAuth connection |

---

## Blueprint Export

After building and testing:

1. Open the scenario → ⋮ → **Export Blueprint**.
2. Save as:

```
docs/make/scenario-f-publish-youtube.json
```
