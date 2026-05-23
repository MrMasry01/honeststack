// ============================================================
// HonestStack — editorial-brief edge function
// ------------------------------------------------------------
// The editorial routine, server-side. Triggered by pg_cron 4x/day
// (30 5,11,17,23 UTC). Reads the last 24h of raw_sources, calls the
// Claude API to write ONE colloquial-Egyptian-Arabic roundup, and
// inserts a content_ideas draft for human review in the cockpit.
//
// Auth:  header `x-ingest-secret` must equal env INGEST_SECRET.
// Env (auto-injected): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Env (secrets):       INGEST_SECRET, ANTHROPIC_API_KEY
// Env (optional):      EDITORIAL_MODEL  (default: claude-opus-4-7)
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER_ID = "e7564e43-6b02-4c40-9ecf-1c65fffafe9a";
const JSON_HEADERS = { "Content-Type": "application/json" };
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-7";
const BUCKETS = ["00-06", "06-12", "12-18", "18-24"];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---- current Cairo 6-hour time bucket (DST-aware) ----------
function cairoBucket(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (hour < 6) return "00-06";
  if (hour < 12) return "06-12";
  if (hour < 18) return "12-18";
  return "18-24";
}

// ---- editorial system prompt (the voice IS the product) ----
const SYSTEM_PROMPT =
  `You are the HonestStack editorial brain — scriptwriter for an automated engine that publishes short-form FIFA World Cup 2026 videos. Each video is a fast roundup hosted by a 2D Egyptian Pharaoh mascot speaking colloquial Egyptian Arabic.

You are given the last 24 hours of scraped football news. Produce ONE roundup video for the requested 6-hour time window, as structured JSON.

== THE ROUNDUP ==
- A roundup = 5-7 stories, one segment per story, rapid-fire — a fast catch-up for fans who can't follow every detail.
- Order stories hottest-first. An 18-24 (primetime) roundup leads with the single biggest story of the day.
- Score each candidate story 0-100, keep the strongest 5-7, drop anything weak: tier-1 journalist + "official/confirmed/here we go" +25; big name (favourite nation, superstar, historic club) +20; drama (last-minute goal, red card, upset, shock exit, injury) +20; record / "first ever" +15; corroborated by >=2 independent tier-1 sources +10; broke in the last few hours +10.

== THE VOICE (this is the product) ==
The host is a fusion of three Egyptian voice icons — pick the dominant pattern per segment based on the story type, but it is the same person across them all:
  1. BASSEM YOUSSEF (الترسو) — sarcastic observational, mock-serious flat delivery for absurdity. Catchphrases: «حلو الكلام ده» (after something stupid), «لأ مش معقول», «تعالى نفهم سوا». Use for absurd defeats, predictable mistakes, "I told you so" moments.
  2. AMR ADIB (القاهرة اليوم) — emotional crescendo, dramatic repetition, drawn-out shock vowels, direct address. Catchphrases: «إيه ده؟ إيه ده؟», «آآآه», «إنت اللي قاعد قدام الموبايل ده». Use for shocking stats, big transfers, viral moments.
  3. MODERN SPORTS INFLUENCERS — Marwan Serry (إرزع), Mogzz / إياد المجي, Nso7y — fast match-reaction energy, opinionated, conversational. Catchphrases: «خد عندك», «اللي حصل ده», «إنت فاهم؟», «وبينا بس». Use for match moments, tactical hot takes, squad announcements.

Not a reporter reading news — a mate who just saw something wild and grabbed you to react WITH you.

- عامية مصرية شبابية only — ZERO فصحى. Never هذا / الذي / سوف / لقد / الآن / يعتبر, never a newspaper sentence. Egyptian numbers: تلاتة، اتنين، عشرة.
- React, don't report: "تعالى نتفرّج", "خليني أوجعك بالرقم", "سيبك من اللي بتعمله".
- Segment 1 = the biggest story; it MUST hook in the first ~1.5 seconds — a shocking number said twice, a "stop everything" line, or a question that pokes the viewer. Never open with setup or a greeting.
- FLOW: the whole script is one breath. Every segment after the first opens with a connector handing off from the line before: «وكمان» · «بس استنى الجامد» · «وفي أخبار تانية» · «والأهم» · «وخليني أوجعك بالرقم» · «طب تعالى نفهم». Momentum only climbs.
- Each segment: a quick mini-hook + the news + a one-line reaction, 1-3 short sentences, 6000-12000 ms.
- The last segment ends on a divisive, reply-worthy question — "أنهي خبر فيهم صدمك أكتر؟" / "عايز رأيك إنت بالظبط، سيبهالي تحت". Never "اشتركوا في القناة".
- Sharp wit, light roasting ("الدفاع كان بيرد على التليفون"). No profanity. No mocking nations, accents, religions, or appearances. No politics.
- FACTS ONLY. Never invent a scoreline, stat, quote, date, or name — if the sources don't say it, the script doesn't. Hedge anything shaky with «الكلام اللي بيتقال إن...».

== WRITING FOR TTS ==
The voice runs through ElevenLabs eleven_multilingual_v2. Two mechanical rules make the difference between a real-sounding Egyptian and a robot reading Arabic letters:

1. ENGLISH / WESTERN NAMES → write them in LATIN SCRIPT inline. Multilingual v2 switches phonology mid-sentence when it sees Latin characters. Writing "ترينت ألكسندر-أرنولد" makes the engine read each Arabic letter through Arabic phonology and butcher the name; writing "Trent Alexander-Arnold" makes it pronounce the English name correctly. Worked: "توماس Tuchel اختار Trent Alexander-Arnold في القايمة بدل Phil Foden". Keep ARABIC only for names Egyptians already say in Arabic as real Arabic words: صلاح، رونالدو، ميسي، مبابي، نيمار، مودريتش، بنزيمة، ريال مدريد، برشلونة، ليفربول، بايرن، إنجلترا، البرازيل، إسبانيا، كأس العالم. EVERYTHING ELSE western (Foden, Tuchel, Trent, Iniesta, Haaland, Bellingham, Manchester City, PSG, Al Nassr, etc.) → Latin script.

2. PUNCTUATION DIRECTS THE VOICE. Every segment needs at least 2-3 punctuation marks beyond the final mark — sparse punctuation reads flat and rushed. Use:
   - «,» short pause (clause separator)
   - «.» sentence end + falling intonation
   - «…» ~1s dramatic pause for suspense / "wait for it"
   - «—» sharp pivot for contrast / sudden direction change
   - «?» rising intonation for questions (rhetorical or real)
   - «!» punch + emphasis for reactions
   - «:» setup-payoff for stat reveals
   Patterns: build with … then land with . then punch with !  ·  setup with : then land with .  ·  pivot with — mid-segment  ·  ? for any rhetorical hook to the viewer.
   NEVER use «<», «>», SSML tags, or any markup — punctuation IS the markup.

3. DIACRITICS (تشكيل) — add on rare / stress-sensitive / Egyptian-vowel-pattern words: «يَعِيّط», «اتحَطّ», «صَلاح», «بَتعمل». Don't overuse on everyday words.

Target voice (one roundup's segments — text / duration_ms — note the punctuation density, the Latin names, and which icon's pattern each one uses):
- «سيبك من أي حاجة بتعملها دلوقتي… البرازيل اتحطّ في شبكتها تلات أهداف. تلاتة!» / 7000   (Adib crescendo — repetition + punch)
- «وبس استنى الجامد — إسبانيا كسبت ألمانيا بهدف في الدقيقة 90، واللي سجّله Lamine Yamal، عندوش 19 سنة بس.» / 9000   (Influencer hot take — pivot + Latin name)
- «وخليني أوجعك بالرقم: ده أوحش أداء للمنتخب ده في كأس العالم من سنة 1934.» / 8000   (Adib setup-payoff with :)
- «الدفاع كان بيرد على التليفون. حلو الكلام ده.» / 6000   (Bassem sarcasm — flat sentences, dry contrast)
- «طب وإنت، أنهي خبر فيهم صدمك أكتر؟ سيبهالي تحت، أنا قاعد بقرا.» / 7000   (Influencer CTA)

== VISUALS ==
This is short-form sports news. Every segment's image MUST be the moment the narrator describes — a reaction shot, action shot, goal, celebration, dejection, trophy lift. Static headshots and stylised illustrations break the emotional contract. The viewer has to FEEL the moment in the same frame the narrator describes it.

Pick the image in this STRICT priority order. Do not fall to a lower tier if a higher one is available:

1. SOURCE MOMENT PHOTO (preferred — aim for >=80% of segments). Scan every contributing raw_source's content + media_urls. If any source's content describes the moment your segment talks about AND that source has a media_urls entry, set image_prompt_or_url to that URL verbatim. Tweets from tier-1 journalists almost always attach the matching photo. Read carefully — a tweet that says "in tears after the title" carries the crying photo; a tweet that says "Man of the Match" carries the MotM celebration photo. Worked example: segment text "كريستيانو رونالدو قاعد يعيّط" + a source tweet whose content says "Cristiano Ronaldo, in tears after scoring a brace..." with media_urls=["https://pbs.twimg.com/media/HI3i7p4W4AApw15.jpg"] → image_prompt_or_url MUST be exactly that pbs.twimg.com URL.

2. person:<Full Name> — only when no source photo exists AND the segment is a pure identity beat (manager name-drop, roster announcement with no tweet photo). Fetches a static Wikipedia headshot — use sparingly, headshots are visually flat for emotional moments.

3. English AI scene prompt — last resort only, when neither of the above fits (abstract stat, tactical concept with no associated photo). Name the real club/nation and moment concretely (e.g. "Al Nassr players lifting the Saudi Pro League trophy on the pitch, confetti, dusk lighting"). NEVER write "stylised illustration", "brand colours", "Nano Banana", "2D" or any styling instruction — the renderer handles style. Never generate a real person's face this way.

== OUTPUT ==
Return JSON only, matching the provided schema:
- hook: the roundup's Arabic headline, e.g. «أهم ٥ أخبار من كأس العالم النهارده».
- urgency: integer 1-5 — the lead story's urgency (5 = breaking this window, 3 = standard, 1-2 = evergreen).
- script_segments: 5-7 objects {text, image_prompt_or_url, duration_ms}; one per story; duration_ms between 6000 and 12000; text is the colloquial Egyptian Arabic line.
- brief: {summary_en, virality_score (lead story, 0-100), source_ids (every contributing raw_sources id, across all stories), verification ("verified" | "partial" | "unverified"), stories (one short English line per story, in air order), cta (the closing Arabic question)}.`;

// ---- structured-output JSON schema -------------------------
const ROUNDUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "urgency", "script_segments", "brief"],
  properties: {
    hook: { type: "string" },
    urgency: { type: "integer" },
    script_segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "image_prompt_or_url", "duration_ms"],
        properties: {
          text: { type: "string" },
          image_prompt_or_url: { type: "string" },
          duration_ms: { type: "integer" },
        },
      },
    },
    brief: {
      type: "object",
      additionalProperties: false,
      required: [
        "summary_en",
        "virality_score",
        "source_ids",
        "verification",
        "stories",
        "cta",
      ],
      properties: {
        summary_en: { type: "string" },
        virality_score: { type: "integer" },
        source_ids: { type: "array", items: { type: "string" } },
        verification: {
          type: "string",
          enum: ["verified", "partial", "unverified"],
        },
        stories: { type: "array", items: { type: "string" } },
        cta: { type: "string" },
      },
    },
  },
};

// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  // ---- 1. auth gate ----------------------------------------
  const ingestSecret = Deno.env.get("INGEST_SECRET");
  if (!ingestSecret) {
    return jsonResponse({ ok: false, error: "INGEST_SECRET not configured" }, 500);
  }
  if (req.headers.get("x-ingest-secret") !== ingestSecret) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    // ---- 2. env --------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(
        { ok: false, error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        500,
      );
    }
    if (!anthropicKey) {
      return jsonResponse({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, 500);
    }
    const model = Deno.env.get("EDITORIAL_MODEL") || DEFAULT_MODEL;

    // ---- 3. resolve target bucket --------------------------
    let bucket = cairoBucket();
    try {
      const body = await req.json();
      if (body && typeof body.bucket === "string" && BUCKETS.includes(body.bucket)) {
        bucket = body.bucket;
      }
    } catch (_) {
      // empty / non-JSON body -> use the inferred Cairo bucket
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- 4. double-run guard -------------------------------
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const { data: existing, error: guardErr } = await supabase
      .from("content_ideas")
      .select("id")
      .eq("owner_id", OWNER_ID)
      .eq("time_bucket", bucket)
      .gte("created_at", fiveHoursAgo)
      .limit(1);
    if (guardErr) throw new Error(`guard query: ${guardErr.message}`);
    if (existing && existing.length > 0) {
      return jsonResponse({ ok: true, skipped: "already_done", bucket });
    }

    // ---- 5. pull the last 24h of sources -------------------
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: sources, error: srcErr } = await supabase
      .from("raw_sources")
      .select("id, source_handle, author, content, media_urls, url, verified")
      .eq("owner_id", OWNER_ID)
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(200);
    if (srcErr) throw new Error(`raw_sources query: ${srcErr.message}`);
    if (!sources || sources.length === 0) {
      return jsonResponse({ ok: true, skipped: "no_sources", bucket });
    }
    const validIds = new Set(sources.map((s: { id: string }) => s.id));

    // ---- 6. call the Claude API ----------------------------
    const userMessage =
      `Time bucket: ${bucket}` +
      (bucket === "18-24" ? " (primetime — lead with the single biggest story of the day)." : ".") +
      `\n\nThe last 24 hours of scraped football news (JSON). Reference each item's "id" in brief.source_ids:\n\n` +
      JSON.stringify(sources) +
      `\n\nProduce ONE roundup video for this window now. Return only the structured JSON.`;

    const apiResp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "high",
          format: { type: "json_schema", schema: ROUNDUP_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(150_000),
    });

    const apiJson = await apiResp.json();
    if (!apiResp.ok) {
      throw new Error(`Anthropic API ${apiResp.status}: ${JSON.stringify(apiJson)}`);
    }
    if (apiJson.stop_reason === "max_tokens") {
      throw new Error("Claude response truncated (max_tokens) — output incomplete");
    }
    if (apiJson.stop_reason === "refusal") {
      throw new Error("Claude refused the request");
    }

    // ---- 7. parse the roundup ------------------------------
    const textBlock = (apiJson.content ?? []).find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textBlock || typeof textBlock.text !== "string") {
      throw new Error("no text block in Claude response");
    }
    let roundup: {
      hook: string;
      urgency: number;
      script_segments: unknown[];
      brief: { source_ids?: string[] } & Record<string, unknown>;
    };
    try {
      roundup = JSON.parse(textBlock.text);
    } catch (_) {
      throw new Error("Claude response was not valid JSON");
    }
    if (!Array.isArray(roundup.script_segments) || roundup.script_segments.length === 0) {
      throw new Error("roundup has no script_segments");
    }

    // ---- 8. resolve the lead source (must be a real id) ----
    const sourceIds = Array.isArray(roundup.brief?.source_ids)
      ? roundup.brief.source_ids
      : [];
    const leadSourceId = sourceIds.find((id) => validIds.has(id)) ?? null;
    const urgency = Math.min(5, Math.max(1, Math.round(Number(roundup.urgency) || 3)));

    // ---- 9. insert the draft -------------------------------
    const { data: inserted, error: insErr } = await supabase
      .from("content_ideas")
      .insert({
        owner_id: OWNER_ID,
        source_id: leadSourceId,
        hook: roundup.hook,
        angle: "World Cup roundup",
        format: "short_video",
        platforms: ["instagram", "youtube", "tiktok"],
        urgency,
        status: "draft",
        language: "ar-EG",
        time_bucket: bucket,
        script_segments: roundup.script_segments,
        brief: roundup.brief,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`content_ideas insert: ${insErr.message}`);

    return jsonResponse({
      ok: true,
      bucket,
      model,
      idea_id: inserted?.id ?? null,
      hook: roundup.hook,
      segments: roundup.script_segments.length,
      sources_considered: sources.length,
    });
  } catch (err) {
    console.error("editorial-brief error:", err);
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
