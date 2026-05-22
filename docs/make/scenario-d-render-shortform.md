# Scenario D — Render Shortform Video

## Purpose

Receive a webhook carrying an `idea_id`, fetch the corresponding `content_ideas` row and its `script_segments` JSONB array, generate audio via ElevenLabs TTS, generate one image per segment via Nano Banana (Gemini), upload all assets to Supabase Storage, assemble a Remotion render payload, trigger the Remotion render service, poll for completion, upload the finished MP4, and finally call the `asset-callback` edge function to mark the asset ready for publishing.

## Trigger

**Type:** Webhook (Custom Webhook)
**Called by:** An external scheduler or another Make scenario. The `brand_settings` table column `make_generate_webhook` stores this webhook URL.

**Webhook payload (minimum):**
```json
{
  "idea_id": "uuid-of-the-content-ideas-row",
  "time_bucket": 0
}
```

---

## Prerequisites / Connections

| Connection | Make module type |
|------------|-----------------|
| `supabase-honeststack` | HTTP (Bearer: SUPABASE_SERVICE_KEY) |
| `elevenlabs-honeststack` | HTTP (Bearer: ELEVENLABS_API_KEY) |
| `nano-banana-gateway` | HTTP (Bearer: LOVABLE_GATEWAY_KEY) |
| `remotion-service` | HTTP (Bearer: REMOTION_SERVICE_KEY) |

---

## Modules (in order)

### Module 1 — Custom Webhook (trigger)

| Field | Value |
|-------|-------|
| Module type | `Webhooks > Custom Webhook` |
| Webhook name | `honeststack-render-trigger` |
| Data structure | Define: `idea_id` (text), `time_bucket` (number) |

Copy the generated webhook URL into `brand_settings.make_generate_webhook` in Supabase.

---

### Module 2 — HTTP: Fetch content_ideas row

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/content_ideas?id=eq.{{1.idea_id}}&select=*` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Output — the full `content_ideas` row:**
```
data[0].id
data[0].title
data[0].language           ← "en" or "ar"
data[0].urgency            ← integer 1-5
data[0].time_bucket        ← 0-3
data[0].script_segments    ← JSONB array
data[0].full_script        ← optional flat text fallback
```

**`script_segments` JSONB element structure:**
```json
{
  "index": 0,
  "text": "The script line for TTS",
  "image_prompt": "A detailed visual prompt for Nano Banana",
  "duration_hint_s": 5
}
```

---

### Module 3 — HTTP: Fetch brand_settings

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/rest/v1/brand_settings?select=voice_id,logo_url,primary_color,accent_color&limit=1` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `apikey: {{env.SUPABASE_ANON_KEY}}`, `Accept: application/json` |
| Parse response | `Yes` |
| Timeout | 10 s |

**Output variables used:**
- `data[0].voice_id` — ElevenLabs voice clone ID
- `data[0].logo_url`
- `data[0].primary_color`
- `data[0].accent_color`

---

### Module 4 — Tools: Set Multiple Variables (render context)

**Module type:** `Tools > Set Multiple Variables`

| Variable | Value |
|----------|-------|
| `idea_id` | `{{1.idea_id}}` |
| `language` | `{{2.data[0].language}}` |
| `title` | `{{2.data[0].title}}` |
| `segments` | `{{2.data[0].script_segments}}` |
| `voice_id` | `{{3.data[0].voice_id}}` |
| `logo_url` | `{{3.data[0].logo_url}}` |
| `primary_color` | `{{3.data[0].primary_color}}` |
| `accent_color` | `{{3.data[0].accent_color}}` |
| `asset_bucket` | `assets` |
| `storage_base` | `https://oddbzobxxphofaebibet.supabase.co/storage/v1/object/` |

---

### Module 5 — Iterator (segments — TTS + image generation)

**Module type:** `Flow Control > Iterator`

| Field | Value |
|-------|-------|
| Array | `{{4.segments}}` |

Each iteration processes one segment: generates audio, then image.

---

### Module 6 — HTTP: ElevenLabs TTS (per segment)

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://api.elevenlabs.io/v1/text-to-speech/{{4.voice_id}}` |
| Method | `POST` |
| Headers | `xi-api-key: {{env.ELEVENLABS_API_KEY}}`, `Content-Type: application/json`, `Accept: audio/mpeg` |
| Body type | `Raw (JSON)` |
| Parse response | `No` *(binary audio)* |
| Timeout | 30 s |

**Request body:**
```json
{
  "text": "{{5.text}}",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.4,
    "use_speaker_boost": true
  }
}
```

> Use `eleven_multilingual_v2` for both English and Arabic; the model detects language from the `text` field.

**Output:** `data` — binary MP3 blob.

---

### Module 7 — HTTP: Upload audio to Supabase Storage

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/storage/v1/object/{{4.asset_bucket}}/audio/{{4.idea_id}}/segment-{{5.index}}.mp3` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: audio/mpeg`, `x-upsert: true` |
| Body type | `Raw` |
| Body | `{{6.data}}` *(binary blob from Module 6)* |
| Parse response | `Yes` |
| Timeout | 20 s |

**Constructed audio URL:** `{{4.storage_base}}public/{{4.asset_bucket}}/audio/{{4.idea_id}}/segment-{{5.index}}.mp3`

---

### Module 8 — HTTP: Nano Banana — Generate Image (per segment)

**Module type:** `HTTP > Make a Request`

Nano Banana is accessed via the Lovable AI Gateway wrapping `google/gemini-2.0-flash-preview-image-generation`.

| Field | Value |
|-------|-------|
| URL | `https://gateway.ai.cloudflare.com/v1/{{env.LOVABLE_GATEWAY_ACCOUNT}}/honeststack/google-ai-studio/v1/models/gemini-2.0-flash-preview-image-generation:generateContent` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.LOVABLE_GATEWAY_KEY}}`, `Content-Type: application/json` |
| Body type | `Raw (JSON)` |
| Parse response | `Yes` |
| Timeout | 45 s |

> Confirm the exact gateway URL in the Lovable AI Gateway dashboard. Verify the model slug is current.

**Request body:**
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "{{5.image_prompt}} Style: cinematic, high contrast, World Cup atmosphere, 9:16 vertical format, photorealistic."
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "candidateCount": 1
  }
}
```

**Output:** `data.candidates[0].content.parts[0].inlineData.data` — base64-encoded PNG.

---

### Module 9 — Tools: Set Variable (decode image)

**Module type:** `Tools > Set Variable`

| Variable | Value |
|----------|-------|
| `image_binary` | `{{toBinary(8.data.candidates[0].content.parts[0].inlineData.data; "base64")}}` |

---

### Module 10 — HTTP: Upload image PNG to Supabase Storage

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/storage/v1/object/{{4.asset_bucket}}/images/{{4.idea_id}}/segment-{{5.index}}.png` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: image/png`, `x-upsert: true` |
| Body type | `Raw` |
| Body | `{{9.image_binary}}` |
| Parse response | `Yes` |
| Timeout | 20 s |

**Constructed image URL:** `{{4.storage_base}}public/{{4.asset_bucket}}/images/{{4.idea_id}}/segment-{{5.index}}.png`

---

### Module 11 — (End of inner iterator — segments)

The iterator completes all segments. Continue with Module 12.

---

### Module 12 — Array Aggregator: Collect segment results

**Module type:** `Flow Control > Array Aggregator`

| Field | Value |
|-------|-------|
| Source module | Module 5 (the segment iterator) |
| Aggregated fields | `{{5.index}}`, `{{5.text}}`, `{{5.duration_hint_s}}`, audio_url (constructed), image_url (constructed) |

**Output:** `segments_with_assets[]` — one entry per segment:
```json
{
  "index": 0,
  "text": "...",
  "duration_hint_s": 5,
  "audio_url": "https://oddbzobxxphofaebibet.supabase.co/storage/v1/object/public/assets/audio/idea_id/segment-0.mp3",
  "image_url": "https://oddbzobxxphofaebibet.supabase.co/storage/v1/object/public/assets/images/idea_id/segment-0.png"
}
```

---

### Module 13 — Tools: Set Variable (Remotion props JSON)

**Module type:** `Tools > Set Variable`

Assemble the full Remotion render payload and store as `remotion_payload`:

```json
{
  "compositionId": "ShortformVideo",
  "inputProps": {
    "idea_id": "{{4.idea_id}}",
    "title": "{{4.title}}",
    "language": "{{4.language}}",
    "primaryColor": "{{4.primary_color}}",
    "accentColor": "{{4.accent_color}}",
    "logoUrl": "{{4.logo_url}}",
    "segments": {{12.segments_with_assets}}
  },
  "codec": "h264",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "outputFile": "renders/{{4.idea_id}}.mp4"
}
```

---

### Module 14 — HTTP: POST to Remotion Render Service

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{env.REMOTION_SERVICE_URL}}/api/render` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.REMOTION_SERVICE_KEY}}`, `Content-Type: application/json` |
| Body type | `Raw (JSON)` |
| Body | `{{13.remotion_payload}}` |
| Parse response | `Yes` |
| Timeout | 30 s |

**Expected response:** `{ "renderId": "abc123", "status": "queued" }`

**Output variable:** `render_id` = `{{14.data.renderId}}`

---

### Module 15 — Tools: Sleep (wait for render)

**Module type:** `Tools > Sleep`

| Field | Value |
|-------|-------|
| Delay | 120 seconds |

A typical Remotion short-form render takes 60–180 s. Poll after 2 minutes.

---

### Module 16 — HTTP: Poll Render Status

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{env.REMOTION_SERVICE_URL}}/api/render/{{14.render_id}}` |
| Method | `GET` |
| Headers | `Authorization: Bearer {{env.REMOTION_SERVICE_KEY}}` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Output variables:**
- `render_status` = `{{16.data.status}}`
- `render_output_url` = `{{16.data.outputUrl}}`

---

### Module 17 — Router: Check render status

**Module type:** `Flow Control > Router`

**Route 1:** `{{16.data.status}} = done` → Module 18
**Route 2:** `{{16.data.status}} = failed` → Module 17a
**Route 3:** `{{16.data.status}} = rendering` → Module 17b (60 s extra wait + re-poll, max 3 times)

#### Module 17a — Error: Report render failure to asset-callback

```json
{
  "idea_id": "{{4.idea_id}}",
  "status": "failed",
  "error": "Remotion render failed",
  "render_id": "{{14.render_id}}"
}
```

URL: `https://oddbzobxxphofaebibet.supabase.co/functions/v1/asset-callback`
Method: `POST`
Headers: `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: application/json`

#### Module 17b — Sleep 60 s + re-poll

Add `Sleep (60 s)` then a duplicate of Module 16 feeding back into the Router. Use a counter variable to limit to 3 re-poll attempts before treating as failed.

---

### Module 18 — HTTP: Download rendered MP4

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `{{16.data.outputUrl}}` |
| Method | `GET` |
| Parse response | `No` *(binary)* |
| Timeout | 60 s |

---

### Module 19 — HTTP: Upload MP4 to Supabase Storage

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/storage/v1/object/{{4.asset_bucket}}/renders/{{4.idea_id}}.mp4` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: video/mp4`, `x-upsert: true` |
| Body type | `Raw` |
| Body | `{{18.data}}` |
| Parse response | `Yes` |
| Timeout | 90 s |

**Constructed MP4 URL:** `{{4.storage_base}}public/{{4.asset_bucket}}/renders/{{4.idea_id}}.mp4`

---

### Module 20 — HTTP: POST to asset-callback

**Module type:** `HTTP > Make a Request`

| Field | Value |
|-------|-------|
| URL | `https://oddbzobxxphofaebibet.supabase.co/functions/v1/asset-callback` |
| Method | `POST` |
| Headers | `Authorization: Bearer {{env.SUPABASE_SERVICE_KEY}}`, `Content-Type: application/json` |
| Parse response | `Yes` |
| Timeout | 15 s |

**Request body:**
```json
{
  "idea_id": "{{4.idea_id}}",
  "status": "ready",
  "kind": "video",
  "media": {
    "mp4_url": "{{4.storage_base}}public/{{4.asset_bucket}}/renders/{{4.idea_id}}.mp4",
    "render_id": "{{14.render_id}}",
    "segments": {{12.segments_with_assets}}
  },
  "time_bucket": {{1.time_bucket}}
}
```

The `asset-callback` edge function will insert into `assets` and create `posts_queue` rows for each configured platform with `status = scheduled`.

---

## Data Mapping Summary

```
Source                                     → Destination
──────────────────────────────────────────────────────────────────
Webhook idea_id                            → all downstream modules
content_ideas.script_segments[].text       → ElevenLabs TTS text
content_ideas.script_segments[].image_prompt → Nano Banana prompt
ElevenLabs response (binary)               → Storage audio/idea_id/segment-N.mp3
Nano Banana response (base64 PNG)          → Storage images/idea_id/segment-N.png
Storage audio_url + image_url              → Remotion inputProps.segments[]
brand_settings.voice_id                    → ElevenLabs voice_id
brand_settings.primary_color / logo_url   → Remotion inputProps
Remotion outputUrl                         → Storage renders/idea_id.mp4
Storage mp4_url                            → asset-callback media.mp4_url
```

---

## Edge Functions / External APIs

| Step | Endpoint | Auth |
|------|----------|------|
| Module 2 | Supabase REST `content_ideas` | Bearer SUPABASE_SERVICE_KEY |
| Module 3 | Supabase REST `brand_settings` | Bearer SUPABASE_SERVICE_KEY |
| Module 6 | `api.elevenlabs.io/v1/text-to-speech/{voice_id}` | `xi-api-key` header |
| Module 7 | Supabase Storage PUT audio | Bearer SUPABASE_SERVICE_KEY |
| Module 8 | Lovable AI Gateway (Nano Banana / Gemini) | Bearer LOVABLE_GATEWAY_KEY |
| Module 10 | Supabase Storage PUT image | Bearer SUPABASE_SERVICE_KEY |
| Module 14 | Remotion service `/api/render` | Bearer REMOTION_SERVICE_KEY |
| Module 16 | Remotion service `/api/render/{id}` | Bearer REMOTION_SERVICE_KEY |
| Module 19 | Supabase Storage PUT mp4 | Bearer SUPABASE_SERVICE_KEY |
| Module 20 | `functions/v1/asset-callback` | Bearer SUPABASE_SERVICE_KEY |

---

## Error Handling & Retries

| Failure mode | Handling |
|--------------|----------|
| `content_ideas` row not found | Check `{{2.data}}` length; if 0, stop — do not call asset-callback |
| ElevenLabs 429 (rate limit) | Retry Module 6: 3 attempts, 30 s back-off |
| Nano Banana timeout / error | Retry Module 8: 2 attempts, 20 s back-off; if both fail, substitute a branded placeholder PNG |
| Supabase Storage upload fail | Retry Modules 7/10/19: 3 attempts, 30 s interval |
| Remotion render failed | Module 17a calls asset-callback with `status: failed` |
| Remotion poll timeout (>5 min) | After 3 re-polls (Module 17b), treat as failed → Module 17a |
| asset-callback 5xx | Retry Module 20: 3 attempts, 60 s interval |

**Global scenario settings:**
- Incomplete executions: Store
- Max errors before deactivating: 3

---

## Make Environment Variables Required

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_KEY` | Supabase service-role JWT |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `LOVABLE_GATEWAY_KEY` | Lovable AI Gateway API key |
| `LOVABLE_GATEWAY_ACCOUNT` | Lovable Cloudflare account ID |
| `REMOTION_SERVICE_URL` | Base URL of your Remotion render service (no trailing slash) |
| `REMOTION_SERVICE_KEY` | Remotion service bearer token |

---

## Blueprint Export

After building and testing:

1. Open the scenario → ⋮ → **Export Blueprint**.
2. Save as:

```
docs/make/scenario-d-render-shortform.json
```
