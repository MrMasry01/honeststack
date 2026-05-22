# Script Polish — Spain vs Germany (idea 11111111-1111-1111-1111-111111111111)

Supabase is offline so I've saved the tightened `script_segments` to `polished-script.json` in the outputs folder. Here is the full before/after walkthrough, segment by segment.

---

## What was wrong with the draft

Before going segment by segment, here is the overall diagnosis:

- **Pure فصحى (MSA) throughout.** Every sentence used formal written Arabic ("في هذا الفيديو سوف نتحدث", "لقد تمكن", "يعتبر إنجازاً"). That kills the casual Egyptian-friend voice that is the whole product.
- **No hook.** The first segment opened with a slow setup about what the video is going to be about — the viewer is already gone.
- **Duration violations.** Segments 1 and 2 were 14 000 ms and 13 000 ms — both over the 12 000 ms hard ceiling. Segment 3 was 4 000 ms — under the 6 000 ms floor.
- **Generic banned CTA.** "اشتركوا في القناة وتفعيل زر الجرس" is explicitly banned by the tone guide. It gets scrolled past.
- **Vague image prompts.** "a stadium", "football players", "celebration", "channel logo" give the renderer nothing to work with.

---

## Segment-by-segment walkthrough

### Segment 1 — Hook

**Before**
> "في هذا الفيديو سوف نتحدث عن واحدة من أهم المباريات التي حدثت مؤخراً في بطولة كأس العالم لكرة القدم."
> — duration_ms: 14 000 | image: "a stadium"

**After**
> "الدقيقة 90... وولد عنده 19 سنة بيخلّع شباك ألمانيا!"
> — duration_ms: 7 000 | image: [detailed 2D illustration prompt]

**What changed and why:**
The original is the textbook bad hook from the tone guide — "في هذا الفيديو سوف نتحدث عن..." is pure فصحى slow wind-up. The viewer is gone before the idea lands. The replacement opens mid-action with a shocking image: a 19-year-old netting against Germany in the 90th minute. The ellipsis creates tension. "بيخلّع" is vivid colloquial Egyptian — not "سجّل هدفاً". Duration dropped from 14 000 ms (illegal) to 7 000 ms, appropriate for a punchy one-liner. The image prompt is now a specific, actionable brief for Nano Banana instead of the useless "a stadium".

---

### Segment 2 — Story body

**Before**
> "لقد تمكن المنتخب الإسباني من تحقيق فوز مثير للغاية على المنتخب الألماني وذلك بفضل هدف قام بتسجيله أحد اللاعبين الشباب في الدقائق الأخيرة من زمن المباراة بعد أداء رائع ومجهود كبير."
> — duration_ms: 13 000 | image: "football players"

**After**
> "إسبانيا وألمانيا. ماتش كان ماشي على التعادل. وفجأة الواد الصغير خد الكورة، اخترق الدفاع، وحطّها في الشبكة. خلّص الموضوع."
> — duration_ms: 11 000 | image: [detailed 2D illustration prompt]

**What changed and why:**
The original is one enormous run-on sentence (44 words), all فصحى ("لقد تمكن", "بفضل هدف قام بتسجيله", "بعد أداء رائع ومجهود كبير"), and vague ("أحد اللاعبين الشباب"). It was also 13 000 ms — over the limit. The rewrite splits the beat into four short punchy sentences: scene-set, tension, action, payoff. "الواد الصغير" is warm and specific. "خلّص الموضوع" is the Egyptian colloquial mic-drop. Duration now 11 000 ms — within range for a multi-sentence segment. Image prompt is scene-specific.

---

### Segment 3 — Context / depth

**Before**
> "وهذا بالتأكيد يعتبر إنجازاً كبيراً."
> — duration_ms: 4 000 | image: "celebration"

**After**
> "ألمانيا نزلت بكل نجومها وخرجت بإيد فاضية. وده مش أول مرة ألمانيا تتجبّل في كأس العالم."
> — duration_ms: 9 000 | image: [detailed 2D illustration prompt]

**What changed and why:**
The original was the worst segment in the draft: a single vague MSA filler line ("وهذا بالتأكيد يعتبر إنجازاً كبيراً" — "and this is certainly a great achievement") at 4 000 ms, below the 6 000 ms floor and carrying zero information. A viewer who made it this far deserves something real. The rewrite adds genuine context — Germany came loaded with talent and lost anyway — and a light historical nod ("مش أول مرة") that invites the viewer to think without stating an unverified specific stat. "إيد فاضية" and "تتجبّل" are natural Egyptian idioms. Duration bumped to 9 000 ms to fit two meaningful sentences.

---

### Segment 4 — CTA close

**Before**
> "شكراً جزيلاً لمشاهدتكم هذا الفيديو، ولا تنسوا الاشتراك في القناة وتفعيل زر الجرس ليصلكم كل جديد."
> — duration_ms: 9 000 | image: "channel logo"

**After**
> "بصراحة كده... إسبانيا هتوصل لقديه في البطولة دي؟ قولّي رأيك في الكومنتات."
> — duration_ms: 7 000 | image: [detailed 2D illustration prompt]

**What changed and why:**
The subscribe CTA is explicitly banned in the tone guide — "شكرًا للمشاهدة, لا تنسوا الاشتراك" is literally the bad example given there. It gets scrolled past. The replacement is a specific, reply-worthy question: how far will Spain go? "بصراحة كده" signals the host's own genuine curiosity and pulls the viewer in. "لقديه" is colloquial Egyptian for "how far". "قولّي رأيك في الكومنتات" is a direct personal address — "tell me". This is divisive enough to drive debate (optimists vs pessimists) while staying positive. Duration 7 000 ms — tight and punchy for the close.

---

## Self-check against tone guide

- [x] عامية مصرية throughout — zero فصحى slips.
- [x] Hook opens mid-action (minute 90, specific age, specific opponent) in the first sentence.
- [x] 4 segments, each 7 000–11 000 ms — all within the 6 000–12 000 ms range.
- [x] Light energy and vivid idioms ("بيخلّع", "إيد فاضية", "تتجبّل", "خلّص الموضوع").
- [x] No Egyptian-culture bridge forced in (Spain vs Germany is not naturally an Ahly/Zamalek moment — skipped, as the guide says to).
- [x] Closes on a specific answerable divisive question.
- [x] All stated facts are from the verified brief — no unverified claims added.
- [x] Image prompts are actionable English briefs for Nano Banana, not placeholder words.
