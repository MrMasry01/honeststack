# Egyptian-Arabic tone guide

The voice **is** the product. A correct fact in flat Arabic is a failed video. Read this
before writing (`morning-brief`) or rewriting (`polish`) any script.

## The voice — three Egyptian icons blended into one host

The host is a fusion of three Egyptian voice traditions. Pick the dominant pattern per
segment based on the story type — but it is the *same person* across them all.

1. **Bassem Youssef (الترسو) — sarcastic observational.** Mock-serious flat delivery for
   absurdity. Catchphrases: *«حلو الكلام ده»* (after something stupid), *«لأ مش معقول»*
   (mock disbelief), *«تعالى نفهم سوا»* (sarcastic invitation). Use for absurd defeats,
   predictable mistakes, "I told you so" moments.

2. **Amr Adib (القاهرة اليوم) — emotional crescendo.** Dramatic repetition, drawn-out
   shock vowels, direct address to the viewer. Catchphrases: *«إيه ده؟ إيه ده؟»*, *«آآآه»*,
   *«إنت اللي قاعد قدام الموبايل ده»*. Use for shocking stats, big transfers, viral
   moments.

3. **Modern sports influencers — Marwan Serry (إرزع), Mogzz / إياد المجي, Nso7y — match-reaction
   energy.** Fast, opinionated, conversational. Catchphrases: *«خد عندك»*, *«اللي حصل ده»*,
   *«إنت فاهم؟»*, *«وبينا بس»*. Use for match moments, tactical hot takes, squad
   announcements.

**North star:** before you keep any line, ask — *which of the three would say this, and
would it sound right coming out of their mouth?* If it sounds like a news anchor or a
Wikipedia entry, rewrite it.

> See **`references/voice-cheatsheet.md`** for the full per-source catchphrase library and
> which pattern fits which story type. The cheatsheet also covers the **TTS mechanics**:
> when to write English names in Latin script vs Arabic, the punctuation rules that direct
> ElevenLabs' pauses and intonation, and when to add تشكيل. **Read it before writing.**

## The format — a roundup

Every video is a **roundup**: a fast catch-up on the World Cup for fans who can't follow
every detail. Not one story told slowly — **5–7 stories, rapid-fire, one per segment.**

- `script_segments` = **5–7 segments, one story each.** The renderer adds the title card
  and the outro card; the segments are pure content.
- **Segment 1 = the biggest story**, landing in the first 1.5 seconds — it hooks the whole
  video.
- Each story segment: a quick mini-hook + the news + a one-line reaction, 1–3 short
  sentences. Tight — about 7 seconds per story, no room to ramble.
- **Connect every segment** so the video runs as one breath: «وكمان» «وفي أخبار تانية»
  «بس استنى الجامد» «والأهم». Momentum only climbs.
- **The last segment lands the comment-bait** ("أنهي خبر فيهم صدمك؟").
- The sample scripts further down show the **voice and energy**; under this format each of
  those stories collapses into a **single punchy segment**.

## Core rules

1. **عامية مصرية شبابية only.** The modern way creators actually talk online. Zero فصحى —
   MSA instantly kills it.
2. **React, don't report.** You're watching the news happen *with* the viewer: "سيبك من
   اللي بتعمله", "تعالى نتفرّج", "خليني أوجعك بالرقم".
3. **It must FLOW** — one continuous riff, not 4 separate sentences. See the Flow section —
   this is the single biggest thing.
4. **Sharp, witty, a little savage.** Light roasting and irony are the whole flavour. No
   profanity though — the wit does the work, not shock.
5. **It's a roundup.** Each video summarises 5–7 stories, one segment per story — see
   "The format" above. Each beat still gets full energy; rapid-fire, never flat.
6. **Facts only.** Never invent a scoreline, stat, quote, or detail. If the sources don't
   give it, the script doesn't say it. Unverified → hedge ("الكلام اللي بيتقال") or drop.

## The hook — first ~1.5 seconds

Most viewers leave in 2 seconds. Segment 1 must *grab*, hard, before it explains. Open with:

- **A "stop everything" jolt:** "سيبك من أي حاجة بتعملها دلوقتي..."
- **A shocking number, said twice:** "البرازيل أكلت تلاتة. تلاتة!"
- **A question that pokes the viewer:** "إنت لما كنت 19 سنة كنت بتعمل إيه؟"

Never open with setup ("النهارده هنتكلم عن"), a greeting, or a slow windup. Drop them into
the most insane part first.

## Flow — the #1 fix

The script is **one breath**, not four. Each segment grabs the momentum of the line before
it and runs. The host is mid-thought, building — the energy only goes *up*.

- Open segments 2/3/4 with a **connector** that hands off from the previous beat:
  «طب تعالى نفهم» · «بس استنى، فيه أحلى» · «وده لسه مش الجامد» · «وخليني أوجعك بالرقم» ·
  «المهم» · «وهنا بقى».
- Never let a segment "reset" to neutral. No segment starts cold.
- **Test:** read the whole script out loud in one go. If it stalls between two segments,
  the connector is wrong — fix it.
- Think relay race: each segment passes the baton, it doesn't start a new race.

## Writing for TTS — punctuation is the secret pacing layer

The host's voice runs through ElevenLabs' `eleven_multilingual_v2`. Punctuation directly
controls pauses and intonation. Sparse punctuation = flat, rushed read; deliberate
punctuation = a real person reacting.

- **`,`** ≈ 0.2s pause (group words, clause separators)
- **`.`** ≈ 0.5s + sentence-end fall
- **`…`** ≈ 1s dramatic pause — for suspense, "wait for it"
- **`—`** sharp pivot — for sudden contrast or direction change
- **`?`** rising intonation — questions, rhetorical or real
- **`!`** punch + emphasis — reactions, exclamations
- **`:`** setup-payoff — stat reveals, "the number is:"

Every segment should have at least **2-3 punctuation marks** beyond the final mark. Look
at Sample A below: ellipsis for the build, period for the shock, exclamation for the
punch — that's the rhythm. **Never** use `<` `>` brackets, SSML tags, or any markup —
punctuation IS the markup.

**English / Western names — write them in Latin script directly inside the Arabic line.**
Multilingual v2 switches phonology mid-sentence when it sees Latin characters. Writing
"ترينت ألكسندر-أرنولد" makes ElevenLabs read each Arabic letter through Arabic phonology
and get the name wrong. Writing `Trent Alexander-Arnold` makes it pronounce the English
name correctly.

Keep Arabic only for names Egyptians say in Arabic naturally — **محمد صلاح**, **رونالدو**,
**ميسي**, **مبابي**, **نيمار**, **ريال مدريد**, **برشلونة**, **بايرن**, **إنجلترا**,
**كأس العالم**. Everything else (Foden, Tuchel, Trent, Iniesta, Manchester City, etc.)
in Latin. Full list and worked examples are in `references/voice-cheatsheet.md`.

**Diacritics (تشكيل)** on tricky words tell ElevenLabs how to read them — *يَعِيّط*,
*اتحَطّ*, *صَلاح*, *بَتعمل*. Don't over-do them on everyday words, but never leave a
rare or stress-sensitive word bare.

## Humour & attitude

Sharp, witty, a satirical edge — blending **Bassem Youssef's sarcasm**, **Amr Adib's
crescendo**, and **modern influencer match-reaction speed**. **Light roasting is good**
("الدفاع كان بيرد على التليفون", "المدرب فاكر نفسه في الاستديو"). Irony, comic
exaggeration, playful disbelief, dramatic repetition. Punch *up* or punch at the absurdity
of the moment — **never** punch down at nations, accents, looks, religions. Zero
profanity.

See `references/voice-cheatsheet.md` for the per-source pattern library and worked
examples (when to use Bassem's `«حلو الكلام ده»` flat delivery vs Adib's `«إيه ده؟ إيه
ده؟»` crescendo vs influencer's `«خد عندك»` hot take).

## Egyptian-context bridging

When it lands naturally, tie the story to Egyptian football life — it makes a global story
personal. Once per script, max: "تخيّل ده حصل في الأهلي..." / "ده زي ما الزمالك يخسر
الكلاسيكو كده." Forced bridges are worse than none — if it doesn't fit, skip it.

## The CTA

Close on a **specific, divisive question** that begs a reply — and keep the creator voice:
"أنا قاعد بقرا" / "عايز رأيك إنت بالظبط" / "سيبهالي تحت". Banned: generic "اشتركوا في
القناة" / "شكرًا للمشاهدة". A flat sign-off gets scrolled past.

## Register — talk like the timeline

Modern young Egyptian, the way creators actually speak. Reach for: «يا جماعة» «سيبك»
«تعالى» «المهم» «بصراحة» «على فكرة» «خد عندك» «اللي حصل ده» «مش طبيعي» «اللعيب ده» «جامد»
«وحش» «كسر» «اتفرّج» «إنت فاهم؟». Never: هذا/الذي/سوف/لقد/الآن/يعتبر — and never a sentence
you'd find in a newspaper. Numbers and everyday words always in the Egyptian form
(تلاتة، اتنين، عشرة).

## Red lines

- No profanity, no insults, no sexual content.
- No mocking countries, accents, religions, or appearances.
- No politics, no sectarian references.
- No real broadcast match footage in `image_prompt_or_url`. Allowed sources: photos posted
  by tier-1 football journalists on Twitter/X (Fabrizio Romano, David Ornstein, the
  beat-reporters whose tweets you scraped — the de-facto standard for short-form sports
  content); Wikipedia/Wikimedia images; stock photography; AI-generated scenes from your
  own prompt; and copyright-safe press images. Never raw broadcaster match frames.
- No invented specifics — no fabricated scoreline, stat, quote, date, or name.

---

## Full sample scripts — the target quality

These samples illustrate the **voice, hook, and connector flow** — not the segment count.
The real format is **5–7 segments per roundup, one per story**. The 4-segment samples below
are single-story deep-dives; for a roundup, you'd compress each story into one segment and
chain 5–7 of them with connectors. Notice in each sample how each line flows into the next.

### Sample A — a big upset

| # | text | duration_ms |
|---|---|---|
| 1 | سيبك من أي حاجة بتعملها دلوقتي... البرازيل اتحطّ في شبكتها تلات أهداف. تلاتة! وإحنا لسه في أول البطولة. | 7000 |
| 2 | طب تعالى نفهم اللي حصل. منتخب فيه نجوم بالملايين، طلع الملعب اتفرّج وبس. الدفاع كإنه بيرد على التليفون، والمدرب قاعد متفرّج معانا. | 10000 |
| 3 | وخليني أوجعك بالرقم: دي أوحش خسارة للبرازيل في كأس العالم من سنة 1934. يعني آخر مرة حصلت، جدّك كان لسه مولود. | 9000 |
| 4 | أنا عايز رأيك بصراحة — دي البرازيل وقعت، ولا الفريق التاني عمل المعجزة؟ انزل كومنت، أنا قاعد بقرا. | 8000 |

### Sample B — a teenager wins it late

| # | text | duration_ms |
|---|---|---|
| 1 | الدقيقة 90... وواحد عندوش 19 سنة بيقلب الماتش لوحده. إنت لما كنت 19 كنت بتعمل إيه؟ | 7000 |
| 2 | المهم، الكل كان مستنّي التعادل وخلاص. وفجأة الواد الصغير ده مسك الكورة، عدّى الدفاع كله، وحطّها في الزاوية. | 9000 |
| 3 | وده مش أي هدف — ده بقى تاني أصغر لاعب يسجّل هدف فوز في تاريخ كأس العالم. اللاعب لسه مكمّلش جامعة. | 9000 |
| 4 | قولّي بصراحة، فاكر أول موهبة صغيّرة بهرتك في الكورة؟ سيبهالي تحت، عايز أعرف. | 7000 |

### Sample C — a VAR controversy

| # | text | duration_ms |
|---|---|---|
| 1 | تخيّل تطلع من كأس العالم بسبب ضربة جزا الـVAR لقطها في الدقيقة 95. ده اللي حصل بالظبط. | 8000 |
| 2 | تعالى نتفرّج سوا. اللاعب وقع جوّه منطقة الجزا، الحكم قال «كمّلوا»، وبعدين راح الشاشة، بصّ شوية، وقلب رأيه. | 10000 |
| 3 | فريق راح يحتفل، وفريق راح بيوته. والمدرب طالع يقول «دي فضيحة». والنت؟ النت ولّع طبعًا. | 8000 |
| 4 | بصراحة كده وبينا بس — دي ضربة جزا صح، ولا الراجل اتظلم؟ عايز رأيك إنت بالظبط. | 8000 |

---

## Good vs bad

**Hook** — Bad (فصحى, slow): "في تطور مثير، تمكن المنتخب البرازيلي من تلقي ثلاثة أهداف."
Good: "البرازيل أكلت تلاتة. تلاتة! وإحنا لسه في أول البطولة."

**Flow** — Bad (disconnected): "إسبانيا كسبت ألمانيا. اللاعب الصغير سجّل. ده رقم كبير."
Good (connected): "إسبانيا كسبت ألمانيا — بس استنى، مين اللي سجّل؟ واحد عندوش 19 سنة...
وده لسه مش الجامد."

**CTA** — Bad: "شكرًا للمشاهدة، لا تنسوا الاشتراك." Good: "دي ضربة جزا ولا ظلم؟ عايز رأيك
إنت بالظبط."

## Self-check before saving a script

**Voice & structure:**
- [ ] Sounds like Bassem / Adib / Serry / Mogzz reacting — not a news anchor.
- [ ] عامية شبابية throughout — zero فصحى.
- [ ] Hook jolts in the first sentence of segment 1.
- [ ] It FLOWS — every segment after the first opens on a connector; reads as one breath.
- [ ] Sharp wit / light roasting present; zero red-line content.
- [ ] 5–7 segments — one per story, each 6–12s. Roundup, not single-story.
- [ ] Each segment maps to ONE dominant voice pattern (Bassem / Adib / Influencer).
- [ ] Closes on a specific, divisive, reply-worthy question.
- [ ] Every stated fact is in the sources — nothing invented.

**TTS mechanics (the `voice-cheatsheet.md` rules):**
- [ ] Every Western/Latin name written in Latin script — `Phil Foden`, not `فيل فودين`.
- [ ] Established Arabic names stay Arabic — `صلاح`, `رونالدو`, `ميسي`, `مبابي`.
- [ ] At least 2-3 punctuation marks per segment beyond the final mark.
- [ ] At least one `…`, `—`, or `?` somewhere in the script for dynamic pacing.
- [ ] تشكيل on any rare / stress-sensitive / Egyptian-specific vowel-pattern word.
- [ ] No `<` `>` brackets, no SSML tags, no literal markup.
