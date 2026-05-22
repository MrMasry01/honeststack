# HonestStack — Make.com Scenario Specs

This directory contains build specifications for every Make.com automation scenario that powers HonestStack's World Cup 2026 short-form video engine (4 videos/day, publishing to Instagram, YouTube Shorts, and TikTok).

## Scenario Index

| File | ID | Purpose | Trigger |
|------|----|---------|---------|
| [scenario-a-ingest-twitter.md](scenario-a-ingest-twitter.md) | A | Poll Apify Twitter scraper, push tweets to Supabase `raw_sources` | Every 15 min |
| [scenario-b-ingest-rss.md](scenario-b-ingest-rss.md) | B | Poll BBC Sport / Guardian Football / ESPN FC RSS, push items to `raw_sources` | Every 30 min |
| [scenario-d-render-shortform.md](scenario-d-render-shortform.md) | D | Webhook → ElevenLabs TTS + Nano Banana images → Remotion MP4 → `asset-callback` | Webhook (idea_id) |
| [scenario-e-publish-instagram.md](scenario-e-publish-instagram.md) | E | Publish approved MP4 to Instagram Reels via Graph API | Every 5 min (queue poll) |
| [scenario-f-publish-youtube.md](scenario-f-publish-youtube.md) | F | Publish approved MP4 to YouTube Shorts via Data API v3 | Every 5 min (queue poll) |
| [scenario-g-publish-tiktok.md](scenario-g-publish-tiktok.md) | G | Publish approved MP4 to TikTok via Content Posting API (manual fallback) | Every 5 min (queue poll) |
| [scenario-h-collect-metrics.md](scenario-h-collect-metrics.md) | H | Pull views/likes/comments/shares/saves from all platforms → `post_metrics` | Every 6 hours |

## Architecture Overview

```
[Sources]                [Make Ingest]           [Supabase]
Twitter (Apify) ──► Scenario A ──────────────► raw_sources
RSS Feeds       ──► Scenario B ──────────────► raw_sources
                                                    │
                                          [Edge fn: idea generator]
                                                    │
                                             content_ideas
                                                    │
                              Scenario D ◄──────────┘
                         (webhook: idea_id)
                              │
                    ElevenLabs TTS
                    Nano Banana images
                    Remotion render
                              │
                           assets ──────────────► posts_queue
                                                    │
                         Scenarios E/F/G ◄──────────┘
                         (queue poll every 5 min)
                              │
                    IG / YouTube / TikTok
                              │
                    post-callback edge fn ──────► posts_queue.external_post_id
                                                    │
                              Scenario H ◄──────────┘
                              (every 6 h)
                              │
                           post_metrics
```

## Shared Credentials (set up once in Make → Connections)

| Connection name | Type | Used by |
|-----------------|------|---------|
| `supabase-honeststack` | HTTP / Custom API (Bearer: Supabase service-role key) | A, B, D, E, F, G, H |
| `elevenlabs-honeststack` | HTTP / Custom API (Bearer: ELEVENLABS_API_KEY) | D |
| `nano-banana-gateway` | HTTP / Custom API (Bearer: Lovable AI Gateway key) | D |
| `remotion-service` | HTTP / Custom API (Bearer: Remotion service key) | D |
| `instagram-honeststack` | Facebook / Instagram Graph API (OAuth) | E, H |
| `youtube-honeststack` | Google / YouTube Data API v3 (OAuth) | F, H |
| `tiktok-honeststack` | TikTok / Content Posting API (OAuth) | G, H |
| `google-drive-honeststack` | Google Drive (OAuth) | G (fallback) |
| `gmail-honeststack` | Gmail / SMTP | G (fallback) |

## Time Buckets (Cairo time = UTC+3)

| Bucket | Window | Render fires at |
|--------|--------|----------------|
| 0 | 00:00–06:00 | 05:45 |
| 1 | 06:00–12:00 | 11:45 |
| 2 | 12:00–18:00 | 17:45 |
| 3 | 18:00–24:00 | 23:45 |

## Blueprint JSON Files

After building and testing each scenario in the Make.com UI, export the blueprint and save it alongside this spec:

```
docs/make/scenario-a-ingest-twitter.json
docs/make/scenario-b-ingest-rss.json
docs/make/scenario-d-render-shortform.json
docs/make/scenario-e-publish-instagram.json
docs/make/scenario-f-publish-youtube.json
docs/make/scenario-g-publish-tiktok.json
docs/make/scenario-h-collect-metrics.json
```

Export path in Make: Scenario → ⋮ (three-dot menu) → Export Blueprint → save as the filename above.

## Supabase Project Reference

Project ref: `oddbzobxxphofaebibet`
Base URL: `https://oddbzobxxphofaebibet.supabase.co`
Edge function base: `https://oddbzobxxphofaebibet.supabase.co/functions/v1/`
