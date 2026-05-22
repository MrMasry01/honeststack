# ElevenLabs — Egyptian-Arabic host voice (Lane E)

## Status — done

The voice clone exists and is wired up:

| Item | Value |
|---|---|
| `voice_id` | `eo3hKvm7OHyQqbqYYNTu` |
| Stored in | `brand_settings.voice_id` — single source of truth, edited on the cockpit `/settings` page |
| API key | `ELEVENLABS_API_KEY` — in Lovable Cloud secrets; used by Make Scenario D |

Downstream consumers: Make **Scenario D** (Render Shortform) calls ElevenLabs TTS; the
resulting MP3 becomes the Remotion `host_voice_url`.

## How to (re)create the clone

1. **Record a 1–3 minute reference** of the target voice — quiet room, consistent mic,
   mono WAV/MP3. Critically: record in the **exact energy and tone** the videos need —
   casual, funny, نبرة بنت/ولد بلد. The clone copies vibe, not just timbre.
2. ElevenLabs → **Voices → Add Voice → Instant Voice Clone** → upload the reference →
   name it "HonestStack Host".
3. Copy the **Voice ID** from the voice's page.
4. Paste it into the cockpit **`/settings`** → it writes `brand_settings.voice_id`.

## Reference recording script (Egyptian Arabic — read naturally, with energy)

Read this aloud the way the host should sound. If it runs under a minute, keep going in
the same spirit until you have 1–3 minutes of clean audio.

> أهلاً يا جماعة! أنا هنا النهارده عشان أحكيلكوا أحلى وأغرب أخبار كأس العالم.
> تخيّلوا معايا — فريق كامل من النجوم بيخسر بتلات أهداف، والجمهور مش مصدّق اللي بيحصل
> قدامه. الكورة دي جنان، كل يوم فيها حاجة جديدة تقلب الدنيا. فيه ماتشات بتخلص في الثانية
> الأخيرة، وفيه لاعيبة صغيّرين عندهم تمنتاشر سنة بيعملوا اللي الكبار معملوهوش.
> أنا بحب الكورة عشان مفيهاش حاجة مضمونة — ممكن الضعيف يكسب القوي، وممكن الحكم بضربة جزا
> واحدة يقلب كل حاجة. خليكوا معايا، وكل يوم هنتفرّج سوا على أحلى اللقطات وأكتر الأرقام
> اللي تكسر الدماغ. وإنتوا، إيه أكتر ماتش اتبسطتوا فيه في حياتكوا؟ قولّولي في الكومنتات.
> يلا بينا، الحكاية لسه في أولها!

## TTS settings — Make Scenario D

- **Model:** `eleven_multilingual_v2` (handles Arabic well). `eleven_turbo_v2_5` is an
  option if speed/cost matters more than nuance.
- **voice_id:** read from `brand_settings.voice_id` at runtime — never hard-code it.
- **Voice settings:** `stability` ≈ 0.40–0.50 (lower = livelier, more varied — good for
  this host), `similarity_boost` ≈ 0.75, `style` ≈ 0.30–0.45, `speaker_boost` on.
- **Input:** the segment `text` from `script_segments` (colloquial Egyptian Arabic).
  Generate **per segment** so each clip length tracks its `duration_ms` target, or
  generate the whole script and split on segment boundaries.
- **Output:** MP3 → upload to Supabase Storage `assets` bucket → the public URL is the
  Remotion `host_voice_url`.

## Notes

- ElevenLabs reads Arabic script directly; عامية spelling improves pronunciation. Leave
  loanwords like "VAR" as-is.
- Watch the ElevenLabs character quota — 4 videos/day × ~4 segments is modest, but monitor
  it as cadence scales.
