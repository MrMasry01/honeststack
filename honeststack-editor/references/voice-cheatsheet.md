# Voice cheatsheet — TTS-friendly Egyptian Arabic

The voice is the product. This cheatsheet is the single source of truth for the
mechanical writing rules that make ElevenLabs sound like a real Egyptian sports
creator, not a machine reading Arabic letters. Read this whenever you write or
polish a script.

The HonestStack TTS uses **ElevenLabs `eleven_multilingual_v2`** (multilingual,
handles mid-sentence language switching) with a custom Egyptian voice clone.
Every rule below is tuned for that model.

---

## 1. English names — Latin or Arabic?

The single biggest fluency win. ElevenLabs reads Arabic letters with Arabic
phonology — `ترينت ألكسندر-أرنولد` becomes a thick Arabic-accented mash of
sounds that aren't even close to the right name. Multilingual v2 happily
**switches phonology mid-sentence** when it sees Latin characters, so the
fix is: write Western names in Latin script directly inside the Arabic line.

**Rule:** use Arabic only if the name has an established Arabic spelling that
Egyptians read as a real Arabic word. Otherwise use Latin script as-is.

### Keep in Arabic
Names Egyptians say in Arabic every day — they ARE Arabic words now.

| Latin | Use this |
|---|---|
| Mohamed Salah | محمد صلاح |
| Cristiano Ronaldo | رونالدو |
| Lionel Messi | ميسي |
| Kylian Mbappé | مبابي |
| Neymar | نيمار |
| Karim Benzema | بنزيمة |
| Luka Modrić | مودريتش |
| Real Madrid | ريال مدريد |
| Barcelona | برشلونة |
| Liverpool | ليفربول |
| Manchester United | مانشستر يونايتد |
| Bayern Munich | بايرن ميونخ |
| England / Spain / Brazil / Portugal | إنجلترا / إسبانيا / البرازيل / البرتغال |
| Egypt / Saudi Arabia / Morocco | مصر / السعودية / المغرب |
| World Cup | كأس العالم |
| Premier League | البريميرليج |
| Champions League | دوري الأبطال |

### Use Latin script directly
Western names, modern players, foreign coaches — anyone whose Arabic
transliteration is ugly or unfamiliar.

| Name | Write this |
|---|---|
| Trent Alexander-Arnold | `Trent Alexander-Arnold` |
| Phil Foden | `Phil Foden` |
| Thomas Tuchel | `Thomas Tuchel` |
| Pep Guardiola | `Pep Guardiola` (or `بيب` if informal) |
| Andres Iniesta | `Andres Iniesta` |
| Emiliano Martinez | `Emiliano Martinez` (or `ديبو`/`ديبو مارتينيز` informally) |
| Manuel Neuer | `Manuel Neuer` |
| Erling Haaland | `Erling Haaland` |
| Vinicius Jr | `Vinicius Jr` |
| Jude Bellingham | `Jude Bellingham` |
| Manchester City | `Manchester City` (or `مانشستر سيتي`) |
| PSG | `PSG` |
| Al Nassr | `Al Nassr` (or `النصر` for the Saudi audience tie-in) |

### Mixed sentence — worked examples

❌ Don't:
> توماس توخل اختار ترينت ألكسندر-أرنولد في القايمة بدل فيل فودين

✅ Do:
> توماس Tuchel اختار Trent Alexander-Arnold في القايمة بدل Phil Foden

❌ Don't:
> ديبو مارتينيز اتكسر — كسر صغير في صباع إيده

✅ Do (informal nickname is fine, last name in Latin):
> ديبو Martinez اتكسر — كسر صغير في صباع إيده

❌ Don't:
> ميسي مع PSG... بس النهارده مع Inter Miami

✅ Do (PSG and Inter Miami in Latin, ميسي stays Arabic):
> ميسي مع PSG... بس النهارده مع Inter Miami

---

## 2. Punctuation — the secret pacing layer

Punctuation is how you direct ElevenLabs' pauses and intonation. Scripts with
sparse punctuation read flat and rushed. Scripts with deliberate punctuation
sound like a real person reacting.

| Mark | TTS effect | When to use |
|---|---|---|
| `,` | ~0.2s pause | After every clause, group related words |
| `.` | ~0.5s pause + sentence-end fall | End of a statement |
| `…` (ellipsis) | ~1s dramatic pause | Trailing thought, suspense, "wait for it" |
| `—` (em-dash) | Sharp pivot pause | Sudden shift in direction, contrast |
| `?` | Rising intonation | Question — rhetorical or real |
| `!` | Punch + emphasis | Reactions, exclamations, "you won't believe" |
| `:` | Pause + setup | Stat reveals, "let me tell you the number:" |
| `;` | — | **Avoid** — not natural in colloquial Arabic |

> **Never** use `<` `>` brackets or SSML tags. ElevenLabs reads them as
> literal text. There are no markup tags — punctuation IS the markup.

### Punctuation patterns by intent

**Reactive opener** (segment 1 hook):
> `سيبك من أي حاجة بتعملها دلوقتي… البرازيل اتحطّ في شبكتها تلات أهداف. تلاتة!`
>
> `…` builds suspense, `.` lands the shock, `!` is the punch.

**Stat / number reveal:**
> `وخليني أوجعك بالرقم: ده أوحش أداء للمنتخب ده من سنة 1934.`
>
> `:` sets up the punchline, `.` lands it.

**Rhetorical question hook:**
> `إنت لما كنت 19 سنة كنت بتعمل إيه؟`
>
> `?` makes it conversational, not robotic.

**Mid-segment pivot:**
> `الكل كان مستنّي التعادل — وفجأة الواد الصغير ده مسك الكورة، عدّى الدفاع كله، وحطّها في الزاوية.`
>
> `—` is the pivot, `,` groups the action sequence, `.` lands.

**Repetition for emotional crescendo (Adib pattern):**
> `إيه ده؟ إيه ده؟ ده Cristiano Ronaldo بيعيّط… على المباشر!`
>
> `?` after each repeat = rising tone each time, `…` for the build, `!` for landing.

**Dry sarcasm (Bassem pattern):**
> `الدفاع كان بيرد على التليفون. حلو الكلام ده.`
>
> `.` after each — flat delivery, sarcasm comes from contrast.

**List of three (classic comedic rhythm):**
> `الفريق راح يحتفل, الفريق التاني راح بيوته, والنت ولّع طبعًا.`
>
> Commas group the three beats, sentence ends on the punch.

### How much punctuation is enough?
Rule of thumb: **every line should have at least 2-3 punctuation marks beyond
the final `.` or `?`**. If a segment has 30 words and only one period at the
end, it'll sound rushed and monotone.

---

## 3. Diacritics (تشكيل) — when to add

Diacritics tell ElevenLabs how to read a tricky word. Don't add them to
everyday words everyone reads correctly — overuse looks like a textbook. Add
them when:

- The word could be mis-stressed: `يَعِيّط` (not يعيط), `اتحَطّ` (not اتحط)
- Egyptian-specific vowel pattern needs clarifying: `بَتعمل` (Egyptian "you're doing", not MSA)
- Foreign names that could be misread when they DO need to stay Arabic: `صَلاح` (so the engine doesn't read "saluh")
- Rare words: `وَرّاه`, `مَدّاه`, `كَسَّر`

If you're unsure whether ElevenLabs will get a word right, add diacritics. Cost
is nothing, upside is real.

---

## 4. Humor — voice patterns by source

The HonestStack host blends three Egyptian voice icons. Pick ONE dominant
pattern per segment based on the story type.

### Bassem Youssef (الترسو) — sarcastic observational
Use for: absurd takes, failures, predictable mistakes, "I told you so" moments.

Patterns:
- Mock-serious flat delivery for absurdity: `الدفاع كان بيرد على التليفون. حلو الكلام ده.`
- Mock disbelief: `لأ مش معقول… ده مش يتصدّق.`
- Sarcastic invitation: `تعالى نفهم سوا — كيف منتخب فيه نجوم بالملايين خسر من فريق ميعرفهوش حد؟`
- Self-aware aside: `أنا عارف إنك بتقول "إيه الكلام ده" — بس سيبني أكمّل.`

### Amr Adib (القاهرة اليوم) — emotional crescendo
Use for: shocking news, dramatic stats, viral moments, big transfers.

Patterns:
- Dramatic repetition: `إيه ده؟ إيه ده؟ إيه ده؟`
- Drawn-out shock vowels: `آآآه`, `ياااااه`, `يعنييي`
- Direct address: `إنت اللي قاعد قدام الموبايل ده، خد بالك.`
- Slow-down-for-impact: short sentence, `.`, the punchline alone: `Cristiano Ronaldo. بيعيّط. على المباشر.`
- Stat punch: `الرقم… 47 سنة. 47!`

### Sports influencers (Marwan Serry / Mogzz / Nso7y) — match-reaction energy
Use for: match moments, tactical takes, transfers, squad announcements.

Patterns:
- Fast tactical hot takes: `ده لاعب مش بيلعب أصلاً, إزاي اتحطّ في القايمة؟`
- Conversational hooks: `خد عندك`, `اللي حصل ده`, `إنت فاهم؟`, `وبينا بس`
- Speed + opinion: short reactive sentences strung together
- Roast with affection: `الدفاع ده محتاج أكواب شاي قبل الماتش`

### Blending — which pattern when?
| Story type | Lead pattern |
|---|---|
| Shocking stat / record | Adib crescendo |
| Absurd defeat / managerial fail | Bassem sarcasm |
| Big transfer / signing | Adib + Influencer |
| Match moment / tactical | Influencer |
| Player drama / quote | Adib direct address |
| Squad announcement | Influencer hot take |

You can also blend WITHIN a segment — open with influencer speed, land on
Adib crescendo, close on Bassem sarcasm. The voice is the same person across
all three.

---

## 5. Red lines (still apply)

- Zero profanity, zero insults
- No mocking nations, accents, religions, appearances
- No politics, no sectarian references
- Light roasting is fine — punch up or punch at the absurdity, never down
- Facts only — never invent a stat, scoreline, quote, name, date

---

## 6. Quick self-check before saving

Before saving any script, scan for:

- [ ] Every Western name in Latin script (unless in the "keep Arabic" list)
- [ ] Every Arab/Egyptian/established name in Arabic
- [ ] At least 2-3 punctuation marks per segment beyond the final mark
- [ ] At least one `…`, `—`, or `?` per script (somewhere) for dynamic pacing
- [ ] Diacritics on any tricky / rare / Egyptian-specific word
- [ ] Each segment maps to ONE of the three voice patterns (Bassem / Adib / Influencer)
- [ ] One identifiable catchphrase or signature pattern somewhere in the script
- [ ] No `<` `>` brackets, no SSML tags, no markup characters

If a segment fails ANY check, fix it before saving.
