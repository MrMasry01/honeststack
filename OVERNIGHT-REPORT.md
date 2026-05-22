# HonestStack — Overnight Work Report

*2026-05-22, autonomous session. Written to be honest, not flattering.*

---

## TL;DR

I fixed the cockpit (it was fully broken), audited every component, and ran the editorial
brain on real data so the engine finally has **4 real video scripts** instead of test junk.

But the blunt truth: **HonestStack is a well-built set of parts, not yet a running engine.**
Nothing runs on a schedule, the pipeline has never completed end-to-end on real data on its
own, the avatar doesn't meet your brief, and publishing doesn't exist. It's roughly a
**60–65% v1** — the plumbing is in, the integration and the autonomy are not.

---

## What I fixed tonight

1. **Cockpit blank "blue page" — root-caused & fixed.** It used `@supabase/auth-ui-react`,
   a deprecated library that crashes under React 19; with no error boundary the whole app
   unmounted. Removed the library, hand-built the login form, added an ErrorBoundary.
2. **Cockpit Railway build was failing** — nixpacks built on Node 18, Vite 8 needs Node 20+.
   Pinned Node 22. Redeployed — **the cockpit is now live and working** at
   `https://cockpit-production-be35.up.railway.app`.
3. **4 real bugs found in a code audit of the cockpit** and fixed: the "Videos Rendered"
   counter was hard-capped at 1; invalid `direction:auto` CSS broke Arabic alignment; a
   dead Make link; a wrong automation description.
4. **Ran `morning-brief` on the 92 real scraped sources** → inserted **4 real
   content_ideas** (drafts): England squad shock (Foden), Salah captains Egypt, Ronaldo +
   Al Nassr, Neuer un-retires. Written in the Serry/Mogzz Egyptian voice.

## What I verified

- Edge functions `ingest-twitter` / `ingest-rss` — code is sound, deployed, auth gates work,
  real data landed (92 rows: 52 RSS + 40 Twitter).
- `render-shortform` — deployed; has produced 2 test videos end-to-end.
- DB schema, RLS, brand_settings — all correct.

---

## The honest state — what works vs what doesn't

### Works
- Supabase DB (9 tables, RLS, constraints).
- Scraping: both ingest edge functions, on TwitterAPI.io + RSS.
- The `honeststack-editor` skill — it just produced 4 genuinely good drafts.
- The render pipeline mechanically works (TTS → images → Remotion → MP4 → storage).
- The cockpit dashboard (now fixed).
- Brand identity (logo, mascot, palette) — created and in `brand_settings`.

### Doesn't work / incomplete — the real gaps

1. **The engine is not running.** All 3 Make scenarios exist but are inactive — nothing
   scrapes, drafts, or renders on a schedule. HonestStack has never run a full cycle
   autonomously.

2. **The editorial step is not automated.** Nothing turns `raw_sources` → `content_ideas`
   on its own. The `honeststack-editor` skill needs Claude to run it (I did, manually,
   tonight). Even if you switch the Make scenarios on, **no videos would be produced** —
   render-shortform looks for `status='ready'` ideas and nothing creates them. This is the
   single biggest architectural gap.

3. **The avatar does not meet your brief.** I pulled frames from the latest render: the
   avatar is a **tiny, generic cartoon figure at the bottom-centre** — it does not resemble
   the player and overlaps the caption. Root cause: the AI generates the character small
   inside a mostly-empty canvas, and `Host.tsx`'s `objectFit:contain` faithfully renders it
   tiny. I did **not** blind-patch the renderer (I can't render-verify cheaply and Railway
   credit is nearly gone) — see "Decisions" below; this one genuinely needs you.

4. **Publishing doesn't exist.** No path to post to Instagram / YouTube / TikTok. `posts_queue`
   and `post_metrics` are empty by design — Phase 2 was never started.

5. **No review/approval path.** Drafts can't be promoted to `ready` from the cockpit, so the
   render step has no input even manually.

6. **Railway credit is nearly out — "$4.98 / 30 days left".** The cockpit AND the Remotion
   render service both run on Railway. When that runs dry, both go offline.

7. Minor: all 92 sources are `verified=false` (the verify step never ran); the ESPN RSS feed
   returned nothing (likely a stale URL).

---

## Decisions I need from you

1. **Editorial automation.** How should `raw_sources → content_ideas` run unattended?
   - **Option A — scheduled Claude routine** runs `morning-brief` (best script quality;
     matches the original design). Needs the `/schedule` setup.
   - **Option B — a server-side edge function calling Gemini** (cheaper, fully autonomous,
     lower script quality).
   My recommendation: **A** — the Egyptian-comedy writing is the product; Gemini is weaker
   at it.

2. **The avatar.** Auto-generating a recognisable likeness of a different player every
   single video is fragile and, as seen, often fails. Honest recommendation: **use the
   fixed Pharaoh mascot** (already designed) as the consistent host, and show the actual
   player in the backdrop. Reliable, on-brand, no per-video AI lottery. If you still want
   per-subject likeness, it needs hands-on, render-by-render iteration with your eye on it.

3. **Railway** — top up / move to a paid plan, or both services go down within ~30 days.

4. **Go-live** — activating the 3 Make scenarios is the "switch on" moment (it starts
   spending on APIs and, once publishing exists, posts publicly). That's your call, not mine.

---

## What I deliberately did NOT do (and why)

- **Did not blind-fix the avatar renderer.** Root cause is known, but a fix must be
  render-verified, and each render burns scarce Railway credit on a result that still
  needs your creative direction. Guessing at pixel values unverified is not "fixing."
- **Did not activate the Make scenarios.** Going live spends your money and (later) posts
  publicly — that's your decision.
- **Did not do the cockpit brand recolour** (task #18) — cosmetic, and Railway build budget
  is scarce. The cockpit works; recolour can wait.

---

## Suggested next steps, in priority order

1. Decide editorial automation (A or B) — without it there is no autonomous engine.
2. Decide the avatar approach (mascot vs per-subject) — then iterate it properly.
3. Sort Railway billing before it lapses.
4. Review the 4 drafted ideas in the cockpit (`/ideas`) — they're real; approve/edit them.
5. Build Phase 2 (publishing) — needs Meta/Google/TikTok developer apps from you.
6. Wire a draft→ready approval action in the cockpit.

The 4 drafts are in the database now — log into the cockpit and you'll see real content
for the first time.
