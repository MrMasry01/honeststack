# Scenario G — Publish to TikTok

## Purpose

Poll `posts_queue` for scheduled TikTok posts that are due, retrieve the MP4 and metadata from Supabase, and attempt to publish via TikTok's Content Posting API. If the API is unavailable or the account lacks Content Posting API access (approval can take weeks), fall back to uploading the MP4 to Google Drive and sending a reminder email so the video can be posted manually. Call `post-callback` in both paths to update the queue row.

## Trigger

**Type:** Schedule
**Interval:** Every 5 minutes
**Time zone:** Cairo (Africa/Cairo, UTC+3)

---

## Prerequisites / Connections

| Connection | Details |
|------------|---------|
| `supabase-honeststack` | HTTP Custom API, Bearer: SUPABASE_SERVICE_KEY |
| `tiktok-honeststack` | TikTok Content Posting API OAuth. Required scopes: `video.upload`, `video.publish`. Connect via Make's TikTok module or a custom OAuth2 connection using TikTok developer app credentials. |
| `google-drive-honeststack` | Google Drive OAuth (fallback). Scope: `drive.file`. |
| `gmail-honeststack` | Gmail OAuth (fallback). Scope: `gmail.send`. |

**TikTok Content Posting API status note (as of May 2026):**
The Content Posting API requires explicit approval from TikTok for Business. Apply at developers.tiktok.com. This scenario is designed so the fallback path keeps the engine running while approval is pending. Once approved, set `TIKTOK_API_APPROVED = true` to disable the fallback.

---

## Modules (in order)

### Module 1 — Schedule (trigger)

| Field | Value |
|-------|-------|
| Module type | `Tools > Schedule` |
| Run every | 5 minutes |
| Time zone | Africa/Cairo |

---

### Module 2 — HTTP: Query posts_queue for due TikTok posts

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/posts_queue?platform=eq.tiktok&status=eq.scheduled&publish_at=lte.{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}&select=id,asset_id,caption,hashtags,publish_at&limit=3` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

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

---

### Module 6 — Tools: Set Multiple Variables (video metadata)

**Module type:** `Tools > Set Multiple Variables`

| Variable | Expression |
|----------|------------|
| `mp4_url` | `{{5.data[0].media.mp4_url}}` |
| `caption_raw` | `{{if(3.caption; 3.caption; 5.data[0].caption)}}` |
| `hashtags` | `{{if(3.hashtags; 3.hashtags; 5.data[0].hashtags)}}` |
| `hashtag_string` | `{{join(6.hashtags; " ")}}` |
| `tiktok_caption` | `{{left(6.caption_raw; 2200)}} {{6.hashtag_string}}` *(TikTok caption max ~2,200 chars)* |
| `queue_row_id` | `{{3.id}}` |
| `api_approved` | `{{env.TIKTOK_API_APPROVED}}` |

---

### Module 7 — Router: API approved or fallback?

**Module type:** `Flow Control > Router`

**Route 1 (API path):** `{{6.api_approved}} = true` → Module 8
**Route 2 (Fallback path):** `{{6.api_approved}} != true` → Module 14

---

## Route 1 — TikTok Content Posting API Path

### Module 8 — HTTP: TikTok — Init Video Upload

**Module type:** `HTTP > Make a Request`

TikTok Content Posting API: init → (upload) → publish. Using `PULL_FROM_URL` source means TikTok fetches the MP4 from Supabase Storage directly.

| Field | Value |
|-------|-------|
| URL | `https://open.tiktokapis.com/v2/post/publish/video/init/` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.TIKTOK_ACCESS_TOKEN}}`, `Content-Type: application/json; charset=UTF-8` |
| Body type | `Raw (JSON)` |
| Parse response | `Yes` |
| Timeout | 20 s |

**Request body:**
```json
{
  "post_info": {
    "title": "{{6.tiktok_caption}}",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_duet": false,
    "disable_comment": false,
    "disable_stitch": false,
    "video_cover_timestamp_ms": 1000
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "video_url": "{{6.mp4_url}}",
    "video_size": 0,
    "chunk_size": 0,
    "total_chunk_count": 1
  }
}
```

**Expected response:**
```json
{
  "data": { "publish_id": "v_pub_url~v4.123456" },
  "error": { "code": "ok" }
}
```

**Output variable:** `publish_id` = `{{8.data.data.publish_id}}`

---

### Module 9 — Tools: Sleep (wait for TikTok to process)

**Module type:** `Tools > Sleep`

| Field | Value |
|-------|-------|
| Delay | 30 seconds |

---

### Module 10 — HTTP: TikTok — Query Post Status

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://open.tiktokapis.com/v2/post/publish/status/fetch/` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.TIKTOK_ACCESS_TOKEN}}`, `Content-Type: application/json; charset=UTF-8` |
| Body | `{"publish_id": "{{8.data.data.publish_id}}"}` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Expected status values:** `PROCESSING_UPLOAD`, `PROCESSING_DOWNLOAD`, `SEND_TO_USER_INBOX`, `PUBLISH_COMPLETE`, `FAILED`

---

### Module 11 — Router: Check TikTok publish status

**Module type:** `Flow Control > Router`

**Route 1:** `{{10.data.data.status}} = PUBLISH_COMPLETE` → Module 12
**Route 2:** `{{10.data.data.status}} = FAILED` → Module 11a (revert + post-callback failed)
**Route 3:** Processing states → Module 11b (extra 20 s wait, max 3 re-polls)

---

### Module 12 — HTTP: POST to post-callback (API path)

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
  "platform": "tiktok",
  "external_post_id": "{{8.data.data.publish_id}}",
  "status": "published",
  "published_at": "{{formatDate(now; \"YYYY-MM-DDTHH:mm:ssZ\")}}"
}
```

---

## Route 2 — Manual Fallback Path (TikTok API Not Yet Approved)

### Module 14 — HTTP: Download MP4 binary

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{6.mp4_url}}` |
| Method | `GET` |
| Parse response | `No` *(binary)* |
| Timeout | 90 s |

---

### Module 15 — Google Drive: Upload MP4

**Module type:** `Google Drive > Upload a File`

| Field | Value |
|-------|-------|
| Connection | `google-drive-honeststack` |
| Drive | My Drive |
| Folder | `HonestStack/TikTok-Pending` *(create this folder manually in Drive first)* |
| File name | `tiktok-{{6.queue_row_id}}-{{formatDate(now; "YYYY-MM-DD-HHmm")}}.mp4` |
| Data | `{{14.data}}` *(binary MP4)* |
| Convert to Google Docs format | No |

**Output:** `id` (Drive file ID), `webViewLink`

---

### Module 16 — HTTP: Create Drive Share Link (anyone with link can view)

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://www.googleapis.com/drive/v3/files/{{15.id}}/permissions` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.GOOGLE_DRIVE_ACCESS_TOKEN}}`, `Content-Type: application/json` |
| Body | `{"role": "reader", "type": "anyone"}` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Construct:** `drive_url` = `https://drive.google.com/file/d/{{15.id}}/view`

---

### Module 17 — Gmail: Send Reminder Email

**Module type:** `Gmail > Send an Email`

| Field | Value |
|-------|-------|
| Connection | `gmail-honeststack` |
| To | `{{env.TIKTOK_MANUAL_EMAIL}}` |
| Subject | `[HonestStack] TikTok post ready for manual upload — {{formatDate(now; "YYYY-MM-DD HH:mm")}} Cairo` |
| Content type | HTML |

**Email body:**
```html
<h2>TikTok Post Ready for Manual Upload</h2>
<p><strong>Caption:</strong><br>{{6.tiktok_caption}}</p>
<p><strong>MP4 download link:</strong><br>
<a href="{{16.drive_url}}">Download from Google Drive</a></p>
<p><strong>Steps:</strong></p>
<ol>
  <li>Download the MP4 from the Drive link above.</li>
  <li>Open TikTok on your phone and tap the + button.</li>
  <li>Upload the video.</li>
  <li>Paste the caption (above) into TikTok.</li>
</ol>
<p>Queue row ID: <code>{{6.queue_row_id}}</code></p>
<hr>
<p><em>HonestStack automated notification. TikTok Content Posting API approval pending.</em></p>
```

---

### Module 18 — HTTP: POST to post-callback (fallback path)

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
  "platform": "tiktok",
  "external_post_id": null,
  "status": "manual_pending",
  "notes": "MP4 uploaded to Drive: {{16.drive_url}}",
  "published_at": null
}
```

> The `post-callback` edge function should handle `manual_pending` by updating `posts_queue.status = manual_pending`. Add a `notes` text column to `posts_queue` if not already present.

---

## Switching from Fallback to API Mode

Once TikTok Content Posting API is approved:

1. Set `TIKTOK_API_APPROVED = true` in Make → Organization → Environment Variables.
2. The Router (Module 7) routes to the API path automatically.
3. No other changes are needed.

---

## Data Mapping Summary

```
posts_queue.asset_id       → assets table lookup
assets.media.mp4_url       → TikTok PULL_FROM_URL / Drive upload
assets.caption + hashtags  → tiktok_caption

TikTok API publish_id      → external_post_id (API path)
Drive file URL             → notes field + email body (fallback path)
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 2 | Supabase REST `posts_queue` | Bearer SUPABASE_SERVICE_KEY |
| Module 4 | Supabase REST `posts_queue` PATCH | Bearer SUPABASE_SERVICE_KEY |
| Module 5 | Supabase REST `assets` | Bearer SUPABASE_SERVICE_KEY |
| Module 8 | `open.tiktokapis.com/v2/post/publish/video/init/` | Bearer TIKTOK_ACCESS_TOKEN |
| Module 10 | `open.tiktokapis.com/v2/post/publish/status/fetch/` | Bearer TIKTOK_ACCESS_TOKEN |
| Module 12 / 18 | `functions/v1/post-callback` | Bearer SUPABASE_SERVICE_KEY |
| Module 14 | Supabase Storage (public MP4 URL) | None (public bucket) |
| Module 15 | Google Drive API | OAuth google-drive-honeststack |
| Module 17 | Gmail API | OAuth gmail-honeststack |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| No due posts | Iterator empty; end cleanly |
| TikTok API error (not `ok`) | Check `{{8.data.error.code}} = ok`; if not, fall through to fallback path |
| TikTok `FAILED` publish status | Module 11a triggers fallback |
| TikTok token expired | Make OAuth auto-refreshes; if revoked, reconnect `tiktok-honeststack` — scenario runs fallback in the meantime |
| Drive upload fails | Add error handler on Module 15; skip Drive step, send email with Supabase Storage URL directly |
| Gmail send fails | Log error; PATCH queue to `manual_pending` with note |
| `post-callback` 5xx | Retry: 3 attempts, 60 s each |

**Global scenario settings:**
- Incomplete executions: Store
- Max errors before deactivating: 5

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `TIKTOK_ACCESS_TOKEN` | Managed by Make TikTok OAuth connection |
| `TIKTOK_API_APPROVED` | `"true"` or `"false"` — controls API vs fallback routing |
| `TIKTOK_MANUAL_EMAIL` | Email address to receive manual posting reminders |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | Managed by Make Google Drive OAuth |

---

## Blueprint Export

After building and testing:

1. Open the scenario → ⋮ → **Export Blueprint**.
2. Save as:

```
docs/make/scenario-g-publish-tiktok.json
```
