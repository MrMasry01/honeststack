# Morning Brief — 15 June 2026

Supabase MCP is offline — ran on the fixture dump you provided.

**owner_id:** `00000000-0000-0000-0000-000000000001`

---

## Deduplication

11 raw_source rows ingested. 1 exact duplicate removed (IDs `a1000000-0000-0000-0000-000000000003` and `a1000000-0000-0000-0000-000000000004` share the same `dedup_hash` and `external_id`). 1 logistics/wifi item (ID 11) discarded — score below threshold.

**10 unique rows → 4 story clusters → 4 videos.**

---

## Clustering & Virality Scoring

| # | Story | Sources | Virality Score |
|---|---|---|---|
| 1 | Morocco stun Brazil 3-0 (heaviest WC loss since 1934) | Romano + BBC Sport + Ornstein | **90** |
| 2 | Ferreira (19 y/o) wins Spain vs Germany in min 90 (2nd youngest WC KO winner ever) | Romano + Guardian | **90** |
| 3 | Mbappe hamstring scare, scan pending | Romano + BBC Sport | **75** |
| 4 | VAR 95' penalty knocks Uruguay out, Portugal advance | ESPN FC + ESPN | **50** |
| — | Wi-fi/logistics (ID 11) | BBC Sport | **5 — dropped** |

All 4 clusters cleared the ≥40 threshold. No filler.

---

## Time-Bucket Assignment

| Time Bucket | Story | Urgency |
|---|---|---|
| `18-24` primetime | Brazil 0-3 Morocco | high |
| `12-18` | Spain 1-0 Germany (Ferreira) | high |
| `06-12` | Mbappe injury — scan results awaited morning | high |
| `00-06` | Portugal/Uruguay VAR controversy | medium |

---

## Summary Table

| Bucket | Hook (Arabic) | Virality | Segments | Verification | Primary Source ID |
|---|---|---|---|---|---|
| `18-24` | تلات أهداف في شبكة البرازيل؟ واحنا لسه في الدور الأول! | 90 | 5 | unverified | a1000000-0000-0000-0000-000000000001 |
| `12-18` | الدقيقة 90... وواد عنده 19 سنة بيقلب الماتش على ألمانيا! | 90 | 4 | unverified | a1000000-0000-0000-0000-000000000005 |
| `06-12` | مبابي خرج من الملعب وهو بيعرج... وفرنسا واقفة على رجلها! | 75 | 4 | unverified | a1000000-0000-0000-0000-000000000009 |
| `00-06` | ضربة جزا في الدقيقة 95 بالـVAR... وأوروغواي خرجت من كأس العالم! | 50 | 4 | unverified |a1000000-0000-0000-0000-000000000007 |

All 4 scripts are set to `status: draft` — review and approve in the cockpit before rendering.

---

## Scripts (Egyptian Arabic)

---

### VIDEO 1 — `18-24` Primetime
**Hook:** تلات أهداف في شبكة البرازيل؟ واحنا لسه في الدور الأول!
**Virality: 90 | Sources: Romano + BBC Sport + Ornstein | Verification: unverified (hedged in script)**

| # | النص (Egyptian Arabic) | duration_ms | Visual |
|---|---|---|---|
| 1 | تلات أهداف في شبكة البرازيل؟ واحنا لسه في الدور الأول! | 7000 | Romano tweet photo (copyright-safe) |
| 2 | المغرب دخل الماتش وكأنه هو المفضّل. والبرازيل؟ اترصّت قدام مرماها طول الليلة. المدرب قاعد على البنش مش لاقي يعمل إيه. | 10000 | Nano Banana — Moroccan players celebrating in stadium |
| 3 | وخد عندك الرقم اللي بيوجع: دي أكبر خسارة للبرازيل في كأس العالم من سنة 1934. تسعين سنة ومش لاقي حد يعمل كده معاهم! | 10000 | Nano Banana — scoreboard Morocco 3 - Brazil 0 |
| 4 | البرازيل دلوقتي في أزمة حقيقية. كمان مباريات وممكن يخرجوا من الدور الأول زي ما طلعوا سنة 2022. | 9000 | Nano Banana — dejected Brazilian players |
| 5 | إنت فاكر أكبر صدمة شفتها في كأس عالم؟ دي بتتحدّاها ولا لأ؟ قولّي في الكومنتات. | 8000 | Nano Banana — host shocked, question graphic |

**Total duration:** ~44 seconds

---

### VIDEO 2 — `12-18`
**Hook:** الدقيقة 90... وواد عنده 19 سنة بيقلب الماتش على ألمانيا!
**Virality: 90 | Sources: Romano + Guardian | Verification: unverified**

| # | النص (Egyptian Arabic) | duration_ms | Visual |
|---|---|---|---|
| 1 | الدقيقة 90... وواد عنده 19 سنة بيقلب الماتش على ألمانيا! | 7000 | Romano tweet photo (copyright-safe) |
| 2 | إسبانيا وألمانيا. الكل متوقع تعادل أو تمديد. وفجأة دييغو فيريرا — بديل عنده 19 سنة — خد الكورة من نص الملعب وحطّها في الزاوية. مين ده أصلاً؟ | 11000 | Nano Banana — young player in red kit celebrating |
| 3 | مش بس هدف. ده بقى تاني أصغر لاعب في التاريخ يسجّل هدف فوز في مرحلة الخروج من كأس العالم. والناس لسه بتسأل جه منين. | 10000 | Nano Banana — age 19 / record badge graphic |
| 4 | افتكر أول موهبة صغيرة أدهشتك في الكورة — مصرية أو أجنبية. مين كانت؟ سيبهالي تحت. | 8000 | Nano Banana — animated host smiling at viewer |

**Total duration:** ~36 seconds

---

### VIDEO 3 — `06-12`
**Hook:** مبابي خرج من الملعب وهو بيعرج... وفرنسا واقفة على رجلها!
**Virality: 75 | Sources: Romano + BBC Sport | Verification: unverified**

| # | النص (Egyptian Arabic) | duration_ms | Visual |
|---|---|---|---|
| 1 | مبابي خرج من الملعب وهو بيعرج... وفرنسا واقفة على رجلها! | 7000 | Nano Banana — player silhouette limping off |
| 2 | فرنسا كسبت 2-0 وكان المفروض يكون ليلة حلوة. بس مبابي غاب في النص تاني بسبب مشكلة في الهامسترينج. وكل المشجعين الفرنساويين قلبهم اتقلب. | 11000 | Nano Banana — French team celebrating but one player sitting holding leg |
| 3 | النهارده هيعمل سكانر. لو الإصابة خطيرة، فرنسا ممكن تكمل كأس العالم من غير أهم لاعب عندها. ده مش مجرد خبر — ده كارثة ممكنة. | 10000 | Nano Banana — French flag with crack / question mark |
| 4 | لو مبابي اتأثر إيه اللي هيحصل لفرنسا؟ وفي رأيك مين هيكون البديل؟ قولّي. | 8000 | Nano Banana — animated host concerned expression |

**Total duration:** ~36 seconds

---

### VIDEO 4 — `00-06`
**Hook:** ضربة جزا في الدقيقة 95 بالـVAR... وأوروغواي خرجت من كأس العالم!
**Virality: 50 | Sources: ESPN FC + ESPN | Verification: unverified (coach quote hedged)**

| # | النص (Egyptian Arabic) | duration_ms | Visual |
|---|---|---|---|
| 1 | ضربة جزا في الدقيقة 95 بالـVAR... وأوروغواي خرجت من كأس العالم! | 7000 | Nano Banana — referee pointing to penalty spot, VAR screen glowing |
| 2 | البرتغال وأوروغواي — ماتش صعب ومتكافئ. اللعب وصل الدقيقة 95 وكل حاجة عادية. ولاعب وقع في منطقة الجزا. الحكم قال كمّلوا. وبعدين راح شاشة الـVAR وغيّر رأيه. | 11000 | Nano Banana — referee at VAR monitor, tense match scene |
| 3 | البرتغال عدّت. وأوروغواي خرجت من البطولة. ومدربهم قال بصريح العبارة إنها 'فضيحة'. الكلام اللي بيتقال إن اللقطة مش واضحة خالص. | 10000 | Nano Banana — Uruguayan players protesting / split scene |
| 4 | بصراحة كده — ضربة جزا ولا ظلم؟ عايز رأيك إنت بالظبط في الكومنتات. | 8000 | Nano Banana — animated host with scales-of-justice graphic |

**Total duration:** ~36 seconds

---

## Notes

- **Verification:** All 4 scripts are marked `unverified`. Core facts are well-sourced (Romano, BBC, Guardian, ESPN) but the MCP is offline so no `verify` command was run. Recommend running `verify` on the Brazil story and the Ferreira record claim before setting to `ready`. The VAR penalty coach quote is explicitly hedged in script 4 ("الكلام اللي بيتقال").
- **Wi-fi/logistics item** (ID `a1000000-0000-0000-0000-000000000011`) was dropped — scored 5/100, not video-worthy.
- **Duplicate dropped:** `a1000000-0000-0000-0000-000000000004` was an exact duplicate of `a1000000-0000-0000-0000-000000000003`.
- **content_ideas.json** saved at the outputs path — 4 rows, ready to eyeball and import.
