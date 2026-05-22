# Morning Brief — 16 June 2026 🇪🇬⚽

## Step 1 — Dedup

Raw dump: **11 rows.**

| Action | Details |
|---|---|
| Duplicate removed | `tw_5500014` (David Ornstein, Brazil/Morocco) appeared twice — same `external_id` + same `dedup_hash`. Kept the earlier timestamp (row id `a1000000-…-003`), discarded `a1000000-…-004`. |
| Low-value dropped | BBC "wi-fi / gate times" logistics item (`h_wifi_logistics`) — zero narrative value, not a story. |

After dedup + filter: **9 unique, usable sources.**

---

## Step 2 — Clusters

| Cluster | Sources | Key facts |
|---|---|---|
| A — Brazil 0-3 Morocco | ids …001, …002, …003 | 3× tier-1 sources (Romano, BBC, Ornstein); historic stat "worst WC defeat since 1934" |
| B — Spain 1-0 Germany (Ferreira 90') | ids …005, …006 | 19-year-old substitute, 2nd-youngest WC knockout winner |
| C — Portugal VAR vs Uruguay | ids …007, …008 | 95th-min VAR penalty; Uruguay coach calls it "a scandal" |
| D — Mbappé hamstring | ids …009, …010 | Limped off at HT; scans pending |

---

## Step 3 — Virality Scores & Time-Bucket Assignment

| Cluster | Virality | Time bucket | Reasoning |
|---|---|---|---|
| A — Brazil/Morocco | **88** | **18-24** | Biggest upset, 3 corroborating sources, historic stat = primetime slot |
| B — Spain/Germany Ferreira | **78** | **12-18** | High drama + feel-good young-star angle |
| C — Portugal/Uruguay VAR | **72** | **06-12** | Strong debate bait; one fewer top-tier source |
| D — Mbappé injury | **65** | **00-06** | Important but uncertainty pending scans reduces urgency |

---

## Step 4 — Scripts (Egyptian Arabic / عامية مصرية)

---

### Video 1 — مبابي والإصابة `[00-06]`
**Hook:** مبابي طلع من الملعب وهو بيعرج... وفرنسا عمالة تصلي!

| # | النص | duration_ms |
|---|---|---|
| 1 | مبابي طلع من الملعب وهو بيعرج... وفرنسا عمالة تصلي! | 7000 |
| 2 | في نص الماتش، مبابي حس بحاجة في الفخدة. المدرب غيّره على طول. محدش كان عايز يتكلم في الأول. | 9000 |
| 3 | دلوقتي بيستنّوا نتيجة الأشعة. لو الإصابة جدية، فرنسا ممكن تكمل في كأس العالم من غير أهم لاعب عندها. | 9000 |
| 4 | أيوه، فرنسا معاها لاعبين تانيين. بس فريق من غير نجمه الأساسي... بتفتكر يعدّي؟ قولّي رأيك في الكومنتات. | 8000 |

---

### Video 2 — البرتغال والـVAR `[06-12]`
**Hook:** ضربة جزا في الدقيقة الأخيرة... بسببها الـVAR ولّع النت كله!

| # | النص | duration_ms |
|---|---|---|
| 1 | ضربة جزا في الدقيقة الأخيرة... بسببها الـVAR ولّع النت كله! | 7000 |
| 2 | اللاعب وقع جوه منطقة الجزا، الحكم قال كمّلوا. وبعدين رجع لشاشة الـVAR... وغيّر رأيه. | 9000 |
| 3 | البرتغال ضربت الجزا وكسبت. الأوروغواي خرجت من البطولة. والمدرب قال عليها إنها فضيحة. | 9000 |
| 4 | بصراحة كده... دي ضربة جزا ولا ظلم؟ عايز رأيك إنت بالظبط. | 8000 |

---

### Video 3 — فيريرا وهدف إسبانيا `[12-18]`
**Hook:** الدقيقة 90... وواد عنده 19 سنة بيقلب الماتش لوحده!

| # | النص | duration_ms |
|---|---|---|
| 1 | الدقيقة 90... وواد عنده 19 سنة بيقلب الماتش لوحده! | 6000 |
| 2 | الكل كان مستني التعادل. إسبانيا وألمانيا ماتش حلو بس مفيش نتيجة. وبعدين الواد الصغير خد الكورة وحطها في الزاوية. | 9000 |
| 3 | دييغو فيريرا، 19 سنة. بقى تاني أصغر لاعب يسجل هدف فوز في تاريخ كأس العالم من دور الـ16. والناس لسه بتسأل جه منين. | 9000 |
| 4 | إسبانيا في ربع النهائي. وألمانيا تاني مرة ترجع بيوت بدري. افتكر أول موهبة صغيرة بهرتك في الكورة... مين كانت؟ سيبهالي تحت. | 8000 |

---

### Video 4 — البرازيل 0-3 المغرب `[18-24]` ⭐ PRIMETIME
**Hook:** تلات أهداف في شبكة البرازيل؟ ايوه... واحنا لسه في الدور الأول!

| # | النص | duration_ms |
|---|---|---|
| 1 | تلات أهداف في شبكة البرازيل؟ ايوه... واحنا لسه في الدور الأول! | 7000 |
| 2 | منتخب كله نجوم، وكل اللي عمله إنه اترص قدام مرماه. والمدرب قاعد على البنش مش لاقي يعمل إيه. | 9000 |
| 3 | وخد عندك الرقم اللي بيوجع: دي أكبر خسارة للبرازيل في كأس العالم من سنة 1934. يعني أكتر من تسعين سنة! | 9000 |
| 4 | المغرب لعبت كأس عالم. مش حظ، مش مصادفة. فريق عنده نظام وقلب. تخيل بس لو ده حصل للأهلي... كنت هتعمل إيه؟ قولّي في الكومنتات. | 8000 |

---

## Summary Table

| # | Story | Virality | Bucket | Sources | Urgency | Hook (AR) |
|---|---|---|---|---|---|---|
| 1 | Mbappé hamstring scare | 65 | 00-06 | 2 | high | مبابي طلع من الملعب وهو بيعرج... وفرنسا عمالة تصلي! |
| 2 | Portugal VAR vs Uruguay | 72 | 06-12 | 2 | high | ضربة جزا في الدقيقة الأخيرة... بسببها الـVAR ولّع النت كله! |
| 3 | Ferreira 90' Spain 1-0 Germany | 78 | 12-18 | 2 | high | الدقيقة 90... وواد عنده 19 سنة بيقلب الماتش لوحده! |
| 4 | Brazil 0-3 Morocco (UPSET) | **88** | **18-24** | **3** | high | تلات أهداف في شبكة البرازيل؟ ايوه... واحنا لسه في الدور الأول! |

**Excluded:**
- Wi-fi / gate-times logistics item (BBC, `h_wifi_logistics`) — no story angle.
- Duplicate Ornstein Brazil/Morocco row (`tw_5500014`, second copy) — deduped out.

4 videos ready for review. All set to `status: draft`, `language: ar-EG`, `format: short_video`.
