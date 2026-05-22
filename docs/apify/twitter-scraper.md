# Apify — Twitter ingestion (Lane D)

How HonestStack scrapes tier-1 football journalists into `raw_sources`.

## Actor

Use **apidojo/tweet-scraper** — "Tweet Scraper V2", actor ID `61RPP7dywgiy0JPD0` on Apify.
It scrapes tweets by handle with no logged-in session and is the most reliable public
option as of 2026. **Do not** use the legacy `apify/twitter-scraper` (broken since the API
changes).

## Handles scraped

Tier-1 football journalists — their **own original posts only** (no replies, no retweets):

| Handle | Who | Why |
|---|---|---|
| `FabrizioRomano` | Fabrizio Romano | transfers, "here we go", official confirmations |
| `David_Ornstein` | David Ornstein (The Athletic) | reliable UK / transfers / breaking |
| *(third handle — confirm with user)* | secondary World Cup reporter | e.g. a tournament-specific beat writer; add to `twitterHandles` once chosen |

RSS (BBC Sport, Guardian Football, ESPN FC) is handled separately by Make Scenario B —
not Apify.

## Input JSON (per run)

```json
{
  "twitterHandles": ["FabrizioRomano", "David_Ornstein"],
  "maxItems": 60,
  "sort": "Latest",
  "includeSearchTerms": false,
  "onlyImage": false,
  "onlyVideo": false,
  "onlyQuote": false,
  "start": "{{ now minus 12h, ISO 8601 }}",
  "end": "{{ now, ISO 8601 }}"
}
```

- `maxItems` 60 ≈ 20–30 tweets per handle per run — sized for a 3-hourly cadence.
- `start` / `end`: Make injects a rolling 12-hour window so nothing is missed; the
  `dedup_hash` on `raw_sources` drops the overlap.
- Keep to original posts. If the actor exposes a replies/retweets toggle, exclude both.

## Cadence

Make **Scenario A** triggers this actor **every 3 hours**. `raw_sources` accumulates
continuously; `morning-brief` reads the last 24 h, and renders fire per 6-hour bucket —
so ingestion runs more often than rendering to keep sources fresh.

## Output → `ingest-source`

Make maps each scraped tweet to the `ingest-source` edge-function payload:
`source_type='twitter'`, `source_handle`, `external_id` (tweet id), `url`, `author`,
`content` (tweet text), `media_urls` (photo URLs only — skip video), `dedup_hash`
(hash of handle + normalised text). Full module steps: `docs/make/scenario-a-ingest-twitter.md`.

## Cost & copyright

- Apify bills per actor run / per result — 8 runs/day × ~60 items is low cost; monitor the
  Apify usage dashboard.
- Use a tweet's photo **only** if it is the journalist's own or a clear press image.
  Otherwise the visual is recreated by Nano Banana downstream. Never pull broadcast video.
