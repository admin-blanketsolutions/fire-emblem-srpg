# Sultan of Two Banners — Source Ledger

**Status:** Ledger v0.2 · 2026-10-06 (class and weapon sections revised for the three-tier common-name class system and the added weapon types)
**Rule of the project:** the narrative is derived from authentic primary and early sources as far as possible. Every chapter, character, support scene and Codex entry has a row here, with a confidence label. Where I could not verify something, it is marked `Unverified` and kept out of the main story.

Companion documents: [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md)

---

## 1. How to read this ledger

### 1.1 Confidence labels

| Label (code) | Meaning | In-game badge |
|---|---|---|
| **Attested** (`attested`) | Recorded by at least one early or contemporary source; no significant conflict found | Attested |
| **Attested but sources differ** (`attested-differ`) | Recorded, but sources disagree on date, actors, cause or detail; the Codex shows each position | Attested, sources differ |
| **Reasonably inferred** (`inferred`) | Not recorded, but plausible from attested facts; used as connective tissue and always flagged | Reasonably inferred |
| **Fictional (game-only)** (`fictional`) | Invented for play (the Recruit, generic troops, game-device skirmishes) | Fictional |
| **Unverified** (`unverified`) | A claim I could not verify; **excluded from the main story** (see §10) | not shown |

Dialogue has a separate marker, independent of confidence: **documented** (faithful paraphrase of a recorded saying or episode, ◆), **dramatized** (original connective dialogue, ◇), or **narration**. The Codex always says which scenes are dramatized.

### 1.2 The "Checked" column

| Value | Meaning |
|---|---|
| **PD** | Read in this session in a public-domain translation of a primary source: **IS-PPTS** (Ibn Shaddad, Wilson & Conder, 1897) or **IKh-dS** (Ibn Khallikan, de Slane, 1842–71). Page numbers are from the OCR page markers and may be off by one; verify against the printed page. |
| **WEB** | Seen only in a web summary or encyclopedia page (a *finding aid*, never cited as evidence). Not used in the main story until checked against a primary or scholarly source. |
| **—** | Not yet checked. Provisional. |

### 1.3 Machine-readable IDs

The first column of every table is an ID in backticks. `tools/lint-sources.ts` parses them. Data files reference ledger IDs; the lint fails if a referenced ID is missing, if a chapter/unit/support/Codex entry has no row, or if the main story cites an `UNV-` row.

| Prefix | Entity |
|---|---|
| `SRC-` / `MOD-` | primary source / modern scholarship |
| `CH-nn[.En]` | chapter and its numbered claims |
| `CHR-` | character |
| `SUP-A-B-RANK` | support scene |
| `CLS-` | class line or term |
| `WPN-` | weapon type |
| `CDX-` | Codex entry |
| `EXC-` | excluded legend |
| `UNV-` | unverified item |

### 1.4 Quotation and translation policy

- **No fabricated quotes.** Nothing is attributed to a real person unless a source records the saying or episode; those are adapted as *documented* paraphrases with a citation. Everything else is flagged *dramatized*.
- Modern translations (Richards, Gabrieli, Gibb) are copyrighted; **I did not use them as text**. The public-domain 1897 and 19th-century translations were read for verification and are *paraphrased*, never copied.
- Where an early source uses period insults for opponents ("accursed" and so on), those words are omitted from game text; the Codex notes the source's voice where it matters.

---

## 2. Source register

Ordered as in the brief. "Read" says what I actually looked at in this session.

### 2.1 Primary and early sources

| ID | Source | Why it matters | Caveats | Read |
|---|---|---|---|---|
| `SRC-IS` | **Baha' ad-Din ibn Shaddad**, *al-Nawadir al-Sultaniyya wa'l-Mahasin al-Yusufiyya* (a life of Saladin). Judge of the army (*qadi al-'askar*) from 1188; eyewitness to Acre, Arsuf, Jaffa, Ramla, and the last illness | The best single source on Saladin's character, routine, generosity and final years; the most intimate anecdotes | **Eyewitness only from 1188.** Earlier chapters rest on Saladin's own recollections ("the Sultan said to me…") and on others. Devotional, admiring tone. Some early dates are inconsistent (first expedition given as 558 AH where Ibn Khallikan prefers 559). Chronology of the 1169–70 events is confused | **PD**: IS-PPTS full text downloaded; the chapters cited in §3–§5 were read (not every page). Richards (2001) not consulted |
| `SRC-IAI-BARQ` | **Imad ad-Din al-Isfahani**, *al-Barq al-Shami* ("Syrian Lightning"): his account of Saladin's service, c. 1166–1193; partly lost, preserved in Abu Shama | Eyewitness secretary from 1175 | Ornate rhymed prose; hyperbole, especially numbers | — |
| `SRC-IAI-FATH` | **Imad ad-Din**, *al-Fath al-Qussi fi'l-Fath al-Qudsi* (the conquest of Jerusalem, 1187–93) | Eyewitness; major source for Hattin and Jerusalem | As above | — |
| `SRC-IAT` | **Ibn al-Athir**, *al-Kamil fi'l-Ta'rikh* and *al-Ta'rikh al-Bahir fi'l-Dawla al-Atabakiyya* (history of the Zengid atabegs of Mosul) | Rich on Zengid and Nurid history, Egypt 1160s, the Fatimid fall | **Partisan.** A Mosul historian partial to the Zengids; cool or hostile to Saladin's takeover of Zengid lands, more admiring after Jerusalem. Treat his framing of Saladin–Nur ad-Din relations with care | **Indirect only:** the long extracts that Ibn Khallikan quotes from the Atabeg history (IKh-dS IV pp. 481–504). The *Kamil* itself and Richards's translation were not consulted |
| `SRC-ASH` | **Abu Shama**, *Kitab al-Rawdatayn* (the Nurid and Salahid dynasties) | Preserves long extracts from lost works (Imad, **Ibn Abi Tayy**, al-Qadi al-Fadil's letters) | Compiler; late (13th c.) | — |
| `SRC-IKH` | **Ibn Khallikan**, *Wafayat al-A'yan* (biographical dictionary, 1256–74) | Entries on Salah ad-Din, Ayyub, Shirkuh, Nur ad-Din and others. He quotes his teachers Ibn Shaddad and Ibn al-Athir, adds his own notes, and sometimes corrects dates | Later than the events; but he is careful about dates and flags uncertainty | **PD** (de Slane vols. I, III, IV: Ayyub, Shirkuh, Nur ad-Din, Saladin) |
| `SRC-IW` | **Ibn Wasil**, *Mufarrij al-Kurub* (Ayyubid history, 13th c.) | Good Ayyubid narrative from earlier lost sources | Later compiler | — |
| `SRC-IK` | **Ibn Kathir**, *al-Bidaya wa'l-Nihaya* | Late compilation; useful for cross-checks | Late (14th c.) | — |
| `SRC-DH` | **al-Dhahabi**, *Siyar A'lam al-Nubala'* | Late biographical compilation; cross-checks | Late (14th c.) | — |
| `SRC-MQ` | **al-Maqrizi**, *Itti'az al-Hunafa'* and *al-Khitat* | Fatimid court and Cairo topography | Late (15th c.) | — |
| `SRC-IJ` | **Ibn Jubayr**, *Rihla* (travels, 1183–85) | Contemporary witness for Egypt, the Hijaz, Syria and Acre in the Years of Patience | — | — |
| `SRC-UM` | **Usama ibn Munqidh**, *Kitab al-I'tibar* and his work on countries and princes | Contemporary memoir; Frankish daily life; he says he was present with Zengi at the 1132 clash at Tikrit | Memoir | **PD indirect:** the Tikrit statement as quoted in IKh-dS IV p. 482 |
| `SRC-QF` | **al-Qadi al-Fadil**, letters | Chancery letters; official record of events and diplomacy | Rhetorical; traditional account of the 1169 plot rests on one of his letters (see CH-03.E8) | — |

### 2.2 Additions to the brief's list (flagged; see DECISIONS D-009)

| ID | Source | Why added | Read |
|---|---|---|---|
| `SRC-IQ` | **Ibn al-Qalanisi**, *Dhayl Ta'rikh Dimashq* (Damascus chronicle to 1160; Gibb's translation 1932) | Contemporary Damascene eyewitness for 1148 and 1154, the Prologue and Chapter 1 period | **Not accessible this session** (the Gibb translation is lending-only on archive.org; I did not circumvent that). Outline of 1154 seen via IKh and web summaries only |
| `SRC-ABT` | **Ibn Abi Tayy** (Aleppo, d. 630/1233; Shi'i historian), lost, preserved in Abu Shama | The Fatimid-side view of Egypt 1160s–70s | — |

### 2.3 Frankish and Latin sources (used only to corroborate or to give the other side's view)

| ID | Source | Use | Read |
|---|---|---|---|
| `SRC-WT` | **William of Tyre**, *Historia* (to 1184) | Egyptian campaigns 1164–69, Baldwin IV | — |
| `SRC-ITIN` | *Itinerarium Peregrinorum et Gesta Regis Ricardi* | Third Crusade from the Frankish side | — |
| `SRC-AMB` | **Ambroise**, *Estoire de la guerre sainte* | Third Crusade from the Frankish side (verse chronicle) | — |
| `SRC-ERN` | **Ernoul** / *Eracles* continuation of William | Hattin and Jerusalem, Frankish view | — (a web summary of Ernoul's account of Raymond at Hattin seen: WEB) |

### 2.4 Modern scholarship (cross-checking only)

None of these was read this session unless stated. They are recommended for the next verification pass.

| ID | Work |
|---|---|
| `MOD-PPTS-IS` | C. W. Wilson and C. R. Conder (trans.), *The Life of Saladin by Beha ed-Din*, Palestine Pilgrims' Text Society, 1897. **PD, read.** Full text: archive.org item `lifesaladin00condgoog` |
| `MOD-DESLANE` | Baron de Slane (trans.), *Ibn Khallikan's Biographical Dictionary*, 4 vols, 1842–71. **PD, read vols. I, III, IV (parts).** Full texts: archive.org items `india.history.resource.41158` (vol. I), `india.history.resource.53346` (vol. III), `india.history.resource.53344` (vol. IV). Page numbers in this ledger follow the OCR page markers of these scans |
| `MOD-RICHARDS-IS` | D. S. Richards (trans.), *The Rare and Excellent History of Saladin*, Ashgate, 2001 |
| `MOD-RICHARDS-IAT` | D. S. Richards (trans.), *The Chronicle of Ibn al-Athir for the Crusading Period*, 3 parts, Ashgate, 2006–08 |
| `MOD-GABRIELI` | F. Gabrieli (ed.), *Arab Historians of the Crusades* (trans. E. J. Costello), 1969 |
| `MOD-GIBB-IQ` | H. A. R. Gibb (trans.), *The Damascus Chronicle of the Crusades*, 1932 |
| `MOD-GIBB-LIFE` | H. A. R. Gibb, *The Life of Saladin: from the works of Imad ad-Din and Baha' ad-Din*, 1973 |
| `MOD-LEV` | Y. Lev, *Saladin in Egypt*, Brill, 1999 (critical study of 1169–74) |
| `MOD-LYONS-JACKSON` | M. C. Lyons and D. E. P. Jackson, *Saladin: The Politics of the Holy War*, 1982 |
| `MOD-EHRENKREUTZ` | A. S. Ehrenkreutz, *Saladin*, 1972 |
| `MOD-HUMPHREYS` | R. S. Humphreys, *From Saladin to the Mongols*, 1977 |
| `MOD-HILLENBRAND` | C. Hillenbrand, *The Crusades: Islamic Perspectives*, 1999 |
| `MOD-PHILLIPS` | J. Phillips, *The Life and Legend of the Sultan Saladin*, 2019 |
| `MOD-EDDE` | A.-M. Eddé, *Saladin* (English trans. 2011) |
| `MOD-HAMILTON` | B. Hamilton, *The Leper King and His Heirs*, 2000 (Baldwin IV) |
| `MOD-SETTON` | K. M. Setton (ed.), *A History of the Crusades*, vols. I–II |
| `MOD-BORA` | F. Bora, "Did Salah al-Din destroy the Fatimids' books?" (JRAS 2019): the fate of the Fatimid library |

### 2.5 Finding aids (never evidence)

Wikipedia and similar web summaries were used to find leads and to cross-check dates. They are not cited as evidence. Anything resting only on them is marked **WEB**.

---

## 3. Chapter ledger

### 3.00 Chapter index

| ID | Chapter | Years (CE / AH) | Overall confidence | Slice | Detail |
|---|---|---|---|---|---|
| `CH-00` | Prologue: The Boats of Tikrit | 1132 / 526 (epilogue 532–534) | Attested frame; skirmish inferred | ✔ | §3.0 |
| `CH-01` | Damascus: The East Gate | 1154 / 549 | Attested frame; fighting inferred | ✔ | §3.1 |
| `CH-02` | The Road to Egypt | 1163–1167 / 558–562 | Attested, sources differ | ✔ | §3.2 |
| `CH-03` | The Vizier | 1168–1169 / 564–565 | Attested, sources differ (the 1169 uprising disputed) | ✔ | §3.3 |
| `CH-04` | The End of an Era | 1170–1173 / 565–569 | Attested, sources differ | planned | §3.4 |
| `CH-05` | After Nur ad-Din | 1174–1176 / 569–572 | Attested | planned | §3.5 |
| `CH-06` | Montgisard | 1177 / 573 | Attested; Frankish accounts differ | planned | §3.6 |
| `CH-07` | Years of Patience | 1179–1186 | Attested (not yet collated) | planned | §3.7 |
| `CH-08` | Hattin | 1187 / 583 | Attested, sources differ | planned | §3.8 |
| `CH-09` | Jerusalem | 1187 / 583 | Attested, sources differ (terms) | planned | §3.9 |
| `CH-10` | The Third Crusade: Acre | 1189–1191 / 585–587 | Attested | planned | §3.10 |
| `CH-11` | The Third Crusade: Arsuf | 1191 / 587 | Attested | planned | §3.10 |
| `CH-12` | The Third Crusade: Jaffa | 1192 / 588 | Attested | planned | §3.10 |
| `CH-FIN` | Ramla and Damascus | 1192–1193 / 588–589 | Attested | planned | §3.11 |

Each chapter below is a table of numbered claims (`CH-nn.En`). Dates give the AH date as the source has it and the conventional Julian-calendar date; see §8 for the date checks.

### 3.0 `CH-00` Prologue: The Boats of Tikrit (1132 / 526 AH), plus the exile (532–534 AH)

Overall: **Attested** frame; the playable skirmish is **inferred/dramatized** (CH-00.E4).

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-00.E1` | Ayyub and Shirkuh are sons of Shadhi (Shadi) ibn Marwan, Kurds of the Rawadiya tribe from Dvin (Duwin); Shadi settled the family at Tikrit via Baghdad | **Attested, sources differ** (on lineage) | IKh-dS IV pp. 480–481; IKh-dS I pp. 243–244; IS-PPTS p. 4 (Ayyub "born at Dvin") | PD | Ibn Khallikan records a long Arab genealogy on a roll and a later claim to Umayyad descent (Mu'izz Isma'il of Yemen); he reports that Ibn Shaddad told him Saladin rejected it as baseless. The Codex shows both |
| `CH-00.E2` | Shadi, then Ayyub, held the citadel of Tikrit under Bihruz, the Seljuk governor of Iraq (a former slave of Greek origin) | Attested | IKh-dS I pp. 243–244; IKh-dS IV pp. 481–482 | PD | Bihruz died Wed 23 Rajab 540 (Jan 1146) per IKh |
| `CH-00.E3` | At a clash near Tikrit on Thursday 12 Rabi' II 526 (≈ 2 March 1132) the army of Zengi and the Seljuk prince Mas'ud was routed by Qaraja as-Saqi, who had come to the aid of Caliph al-Mustarshid. Zengi reached Tikrit; **Ayyub supplied boats** to cross the Tigris and provisions to his followers. Bihruz sent a letter of reproach. Usama ibn Munqidh says he was present with Zengi | **Attested** (day ±1, §8) | IKh-dS IV pp. 482–483, quoting `SRC-IAT` (Atabeg history) and `SRC-UM` | PD | The Caliph's side was defending Baghdad from a Seljuk–Zengid siege; the Codex treats them without villainy. IAT is partisan to the Zengids |
| `CH-00.E4` | A pursuit skirmish at the ferry landing, with waves of pursuers | **Reasonably inferred** (game device) | none | — | A rout and a river crossing make pursuit plausible; the sources do not describe fighting at Tikrit. Codex "Game vs History" says so |
| `CH-00.E5` | Shirkuh killed a man in Tikrit; Ayyub imprisoned him and wrote to Bihruz; Bihruz, remembering their father, would not punish them but required both brothers to leave | **Attested, sources differ** (victim, cause) | IKh-dS I pp. 244–245 (an officer, the *isfahsalar*, had insulted a woman at the castle gate; Shirkuh struck him with a halberd); IKh-dS IV p. 483 quoting IAT ("a dispute with a man… killed him") | PD | Popular summaries say the victim was "a Christian scribe": **no support in the texts read** (UNV-01) |
| `CH-00.E6` | Salah ad-Din was born in 532 AH (1137–38) in the citadel of Tikrit | **Attested** | IS-PPTS p. 4 (reports it from people who inquired in order to cast his horoscope); IKh-dS IV p. 484 ("all historians agree") | PD | |
| `CH-00.E7` | The family left Tikrit "on the night of his birth", taken as an ill omen; a relative said good might come of it | **Attested, sources differ** | IKh-dS IV p. 485 (a family member's oral tradition); IS-PPTS p. 4 (says only that circumstances obliged Ayyub to leave) | PD | **Correction to a common claim:** the "night of the birth" detail is in **Ibn Khallikan**, not Ibn Shaddad. Ibn Khallikan himself computes that they left at the end of 532 or in 533 |
| `CH-00.E8` | Zengi received them at Mosul with a fief; he took Baalbek (14 Safar 534 / 10 Oct 1139 per Usama) and appointed Ayyub its *dizdar* (warden) | **Attested, sources differ** (capture date) | IKh-dS IV p. 484 (Usama's date vs Ibn al-Qalanisi's siege start, 20 Dhu'l-Hijja 532 / Aug 1138) | PD | |
| `CH-00.E9` | After Zengi's murder (1146) Ayyub was besieged at Baalbek by the Damascus army, surrendered it in exchange for a fief, and became a leading emir at Damascus; Shirkuh entered Nur ad-Din's service | **Attested** | IKh-dS IV pp. 483–484 (IAT); IS-PPTS p. 53 n. (Zengi's death at Ja'bar) | PD | |
| `CH-00.E10` | Ayyub: pious, generous, fond of holy company; founded a Sufi convent at Baalbek (the *Najmiyya*) | **Attested** | IKh-dS I p. 245; IS-PPTS p. 4 | PD | |
| `CH-00.E11` | *Shirkuh* is Persian for "lion of the mountain" | **Attested** | IKh-dS I p. 628 | PD | Codex term entry |

### 3.1 `CH-01` Damascus: The East Gate (1154 / 549 AH)

Overall: frame **attested**; the fighting is **inferred/dramatized**; the mechanism of the surrender is **not yet collated** (UNV-03).

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-01.E1` | Nur ad-Din besieged Damascus from 3 Safar 549 (≈ 18 April 1154) and took it on **Sunday 9 Safar** (≈ 25 April). Mujir ad-Din Abaq, the Burid ruler, received Homs in exchange, later Balis, and finally a pension at Baghdad | **Attested** | IKh-dS III pp. 338–339 | PD | A web summary of Ibn al-Qalanisi agrees in outline (people's welcome); not read directly |
| `CH-01.E2` | The roles of Ayyub and Shirkuh in the city's transfer (negotiation, gate) | **Unverified** (in detail) | `SRC-IAT`, `SRC-IQ`, `SRC-ASH` | WEB / — | Kept out of the main story until collated (UNV-03). The game may show Ayyub's *presence* in Damascus (attested) but not a specific gate action as fact |
| `CH-01.E3` | Ayyub, after surrendering Baalbek, lived at Damascus as one of its greatest emirs; he and his son were attached to Nur ad-Din's service | **Attested** | IKh-dS IV pp. 483–485; IS-PPTS pp. 4–5 | PD | |
| `CH-01.E4` | Salah ad-Din (aged about 16), raised under his father's care, entered Nur ad-Din's service; Nur ad-Din advanced him and admitted him among his friends | **Attested** | IS-PPTS pp. 4–5; IKh-dS IV p. 485 | PD | |
| `CH-01.E5` | Ibn Khallikan's assessment: from Nur ad-Din, Saladin learned righteousness and zeal in the war against the Franks | **Attested** (as Ibn Khallikan's view) | IKh-dS IV p. 485 | PD | Used in Codex, labelled as a later writer's verdict |
| `CH-01.E6` | Nur ad-Din: just, pious, built colleges across Syria, a hospital and a hadith school at Damascus | **Attested** | IKh-dS III p. 339 | PD | |
| `CH-01.E7` | Training in horsemanship at the Maydan (drills in Camp) | **Reasonably inferred** (game device) | none | — | Nur ad-Din's polo habits are **not verified** (UNV-11); only generic drills are shown |
| `CH-01.E8` | The 1148 siege of Damascus by the Second Crusade, with Ayyub among its emirs | Siege **attested**; Ayyub's/Saladin's roles **unverified** | `SRC-IQ`, `SRC-WT` | WEB | UNV-02. Not used in play |

### 3.2 `CH-02` The Road to Egypt (1163–1167 / 558–562 AH)

Overall: **attested**, with real disagreements on dates.

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-02.E1` | Shawar, driven out of Egypt by Dirgham (Ramadan 558 / Aug 1163), fled to Damascus (arrived 23 Dhu'l-Qa'da 558 / Oct 1163) asking Nur ad-Din for troops | **Attested** | IKh-dS IV p. 485; IS-PPTS pp. 46–47 | PD | |
| `CH-02.E2` | Nur ad-Din sent Shirkuh; Saladin went "much against his will" and was given the vanguard; they left in Jumada I 559 (Mar–Apr 1164), reached Egypt in Rajab; Dirgham was killed (28 Jumada II 559 per one author) | **Attested, sources differ** | IKh-dS IV pp. 485–486 (prefers 559, citing the hadith scholar al-Silafi, who was in Egypt); IS-PPTS p. 48 (dates the expedition 558 AH) | PD | Show **both** years in the Codex (CDX-S-EXPEDITION-DATES) |
| `CH-02.E3` | Saladin's reluctance is recorded for each expedition; of the third he later said he was the man who least wished to go | **Attested** (documented saying, paraphrased) | IS-PPTS pp. 48, 50, 53; IKh-dS IV p. 489 (quoting IS) | PD | Ibn Shaddad pairs the remark with a Qur'an verse; **omitted in the slice** (D-004) |
| `CH-02.E4` | Shirkuh decided nothing without consulting Saladin and valued his judgment | **Attested** | IS-PPTS p. 48 | PD | Support `SUP-SHIRKUH-SALAH-B` |
| `CH-02.E5` | Shawar played Shirkuh and the Franks against each other; Amalric's Franks besieged Shirkuh at Bilbays; Nur ad-Din reduced Harim (end of Ramadan 559 / Aug 1164); Shirkuh left Egypt on 24 Dhu'l-Hijja 559 (12 Nov 1164) | **Attested, sources differ** | IKh-dS IV pp. 485–487; IKh-dS III p. 339; IS-PPTS p. 48 | PD | Ibn Shaddad (as translated) gives the 7th of Dhu'l-Hijja 558; Ibn Khallikan's Saladin entry quotes him as giving the 27th, and prefers the 24th of Dhu'l-Hijja 559 |
| `CH-02.E6` | Second expedition: left Syria Rabi' I 562 (Dec 1166–Jan 1167) by Wadi al-Ghizlan, Saladin "constrained against his wish"; the Franks and Shawar joined against Shirkuh; the battle of **al-Babain** (18 March 1167) was fought near Ushmunayn in Middle Egypt | **Attested, sources differ** | IKh-dS IV pp. 487–488 (Ibn Khallikan's notes: battle near Ushmunayn); IS-PPTS pp. 49–50 (omits the battle; the 1897 editor remarks on the omission) | PD (existence and place); date from WEB | Some web summaries place Babain at Giza: **not supported** by IKh. The "feigned retreat with Saladin in the centre" is a modern reconstruction (UNV-15); shown only in the stretch map and flagged |
| `CH-02.E7` | Saladin went to **Alexandria**, fortified himself and sustained a siege by Shawar and the Egyptian army (Jumada II 562 / Mar–Apr 1167 per Ibn Khallikan's notes) while Shirkuh was in Upper Egypt; peace was made at Bilbays; Saladin was escorted to Shirkuh; they left (Shawwal–Dhu'l-Qa'da 562 / Aug–Sept 1167) | **Attested, sources differ** (length, besiegers, terms) | IKh-dS IV pp. 487–488; IKh-dS I p. 626 (Shirkuh entry); Frankish: `SRC-WT` (not consulted) | PD (outline) | Frankish figures (names of negotiators, length of siege) → UNV-09 |
| `CH-02.E8` | The Franks left Egypt in 1167 because Nur ad-Din took the Frankish fort of al-Munaytira (Rajab 562) | **Attested** | IS-PPTS pp. 50–51; IKh-dS IV p. 487 | PD | |
| `CH-02.E9` | At Alexandria Saladin often visited the hadith scholar al-Hafiz al-Silafi and learned many traditions from him | **Attested** (time unspecified) | IS-PPTS p. 10 and note; IKh-dS IV p. 486 (Silafi in Egypt, a careful dater) | PD | Camp talk and Codex only |
| `CH-02.E10` | The loyalty of Alexandria's population to Saladin ("dubious support") | **Unverified** | `SRC-WT`, modern summaries | WEB | The militia mechanic is dramatized (flagged) |

### 3.3 `CH-03` The Vizier (1168–1169 / 564–565 AH)

Overall: **attested**, with disputed episodes presented as disputed.

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-03.E1` | Amalric's Franks took Bilbays (autumn 1168) and massacred its inhabitants; Egypt appealed to Shirkuh | **Attested** | IKh-dS I p. 627 (Shirkuh entry); `SRC-WT` | PD (IKh) | Told in the Codex with restraint; never shown |
| `CH-03.E2` | Shirkuh reached Egypt in Rabi' I 564 (Dec 1168–Jan 1169) and the Franks withdrew; Shawar visited him and withheld the promised payment | **Attested** | IS-PPTS pp. 53–54; IKh-dS IV p. 489 | PD | |
| `CH-03.E3` | **Shawar's seizure:** riding beside him, Saladin seized him by the collar and ordered his escort attacked; a palace eunuch brought a written demand for the head; Shawar was beheaded; Shirkuh was invested as vizier on 17 Rabi' II 564 (≈ 18 Jan 1169) | **Attested, sources differ** | IS-PPTS p. 54; IKh-dS IV pp. 489–491 (Ibn Khallikan's note: Saladin and Jurdik met Shawar on the road while Shirkuh was away visiting the tomb of al-Shafi'i; Shirkuh had forbidden the plan; the caliph ordered the execution) | PD | Both accounts are shown. Shirkuh's presence and his part in the plan are disputed |
| `CH-03.E4` | Shirkuh was vizier two months and five days. He died on 22 Jumada II 564 (≈ 23 March 1169), of inflammation of the throat after a bout of indigestion; he ate heartily | **Attested, sources differ** (day, cause) | IS-PPTS p. 55; IKh-dS IV pp. 491–492 (suffocation/quinsy; "some say a poisoned robe"); IKh-dS I p. 627 (day given as the 28th, or the 23rd per another authority named in the OCR as "ar-Raubhi") | PD | The poison rumour appears in the Codex only as a reported rumour |
| `CH-03.E5` | **The succession:** emirs of Shirkuh's army (Ain ad-Dawla al-Yaruqi, Qutb ad-Din Khusraw ibn Talil, Sayf ad-Din Ali al-Mashtub, Shihab ad-Din al-Harimi, Saladin's maternal uncle) each aspired to power; the caliph al-Adid invited Saladin hoping to rule through a weak vizier; Saladin hesitated; the jurist **Isa al-Hakkari** won over al-Mashtub, al-Harimi and Qutb ad-Din in turn; al-Yaruqi refused and returned to Nur ad-Din; Saladin was invested and titled *al-Malik al-Nasir* | **Attested** (partisan source) | IKh-dS IV pp. 494–495, quoting IAT | PD | IAT is Zengid-partisan, but this passage is favourable to Isa and not hostile to Saladin. Investiture date 26 March 1169 is WEB only (UNV-16). Isa's appeals to Kurdish solidarity ("not to let power pass to the Turks") are shown as period politics, not as a modern ethnic message |
| `CH-03.E6` | Saladin's lasting turn to seriousness after taking power: he gave up wine and the pleasures of youth and devoted himself to work | **Attested** | IS-PPTS p. 55; IKh-dS IV p. 492 | PD | A candid, documented detail; used in narration |
| `CH-03.E7` | Nur ad-Din addressed Saladin as "the emir *isfahsalar*", and the khutba in Egypt was in Nur ad-Din's name | **Attested** | IKh-dS IV p. 496 (IAT) | PD | |
| `CH-03.E8` | **The Mu'tamin plot and the uprising of the Fatimid regiments**, 21–23 Aug 1169: Mu'tamin al-Khilafa, the palace majordomo, was said to have written to the Franks; he was executed (20 Aug); the black African (*Sudani*) infantry, joined by Armenian soldiers and Cairo's populace, fought Saladin's troops around the great square between the palaces; the Mansura quarter was burned; the survivors were driven off | **Attested, sources differ** | Not in IS or in IKh's Saladin entry (checked). Early accounts: `SRC-IAT`, `SRC-ABT` via `SRC-ASH`, `SRC-MQ`. Modern: `MOD-LEV` (doubts that the conspiracy was real; the traditional account leans on a letter of al-Qadi al-Fadil, and the "mismatched sandals" detail is a literary commonplace) | WEB only | **Must be collated against the primary texts before M7** (UNV-07). Numbers (the 50,000 figure) are omitted. See D-012 for how the regiments are portrayed |
| `CH-03.E9` | After the uprising black eunuchs were removed from the palace and Baha ad-Din Qaraqush took charge of its household | **Attested** (the later role); the 1169 timing **WEB** | IKh-dS IV p. 498 (Qaraqush placed as *ustadh-dar* before al-Adid's death in 1171) | PD (1171) / WEB (1169) | |
| `CH-03.E10` | **Damietta:** the Franks and a Byzantine fleet attacked Damietta (25 Oct–19 Dec 1169); Saladin reinforced and supplied it, sortied against the besiegers, and the allies burned their engines and left | **Attested, sources differ** (chronology) | IS-PPTS pp. 56–59; IKh-dS IV pp. 492–493; `SRC-WT` | PD (outline); dates WEB | Ibn Shaddad's narrative places Nur ad-Din's diversion at Kerak in Sha'ban 565 (spring 1170) and the 1897 editors date the settlement to 1170; later scholarship dates the siege Oct–Dec 1169 |
| `CH-03.E11` | Saladin later recalled that when God gave him Egypt so easily he understood that the conquest of the coast (*al-Sahil*) was meant for him | **Attested** (documented saying, paraphrased) | IS-PPTS p. 55; IKh-dS IV p. 492 | PD | |
| `CH-03.E12` | Nur ad-Din refused Saladin's request to bring his brothers, then, when the Franks gathered against Egypt, sent troops with them. He warned Turan-Shah to serve Saladin as lord of Egypt and Nur ad-Din's lieutenant, not as the younger man who once waited on him | **Attested** (partisan source) | IKh-dS IV pp. 496–497 (IAT) | PD | Arrival date relative to the August 1169 uprising unverified (UNV-08) |

### 3.4 `CH-04` The End of an Era (1170–1173 / 565–569 AH) — *planned*

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-04.E1` | Ayyub joined Saladin in Egypt (1170). Saladin offered him the supreme command; Ayyub declined, saying God would not have chosen him had he not found him capable, and that fortune's favours must not be redirected; Saladin made him steward of the treasury | **Attested** | IS-PPTS pp. 59–60; IKh-dS IV pp. 493–494 | PD | IS gives Jumada II 565 (Feb–Mar 1170); IKh says the true date is in his Ayyub entry. `SUP-AYYUB-SALAH-A` |
| `CH-04.E2` | **The khutba and the end of the Fatimid caliphate:** Nur ad-Din ordered the Abbasid khutba; Saladin hesitated, consulted the emirs; a Persian visitor, al-Amir al-'Alim, preached it first on the first Friday of Muharram 567; the next Friday it was general, without opposition; al-Adid, ill, was not told and died **Monday 10 Muharram 567 (≈ 13 Sept 1171)**. Saladin entered the palace; al-Adid's family were placed under guard | **Attested, sources differ** (detail) | IS-PPTS pp. 61–62; IKh-dS IV pp. 497–498 (IAT) | PD | Al-Adid's death is told with dignity; no polemic about the Fatimids (D-013) |
| `CH-04.E3` | Qaraqush guarded the palace as steward; the palace was emptied; IAT reports a library of about 100,000 books | **Attested, sources differ** | IKh-dS IV pp. 498–499; `MOD-BORA` | PD (IAT quote) | What became of the books is disputed; Codex shows the dispute |
| `CH-04.E4` | Saladin and Nur ad-Din drifted apart: Saladin did not join the Kerak expedition, citing unrest in Egypt; Nur ad-Din resolved to enter Egypt; Saladin's family and emirs met in council | **Attested, sources differ** | IKh-dS IV pp. 499–504 (IAT); IS-PPTS pp. 62–63 and 65 | PD | IAT blames Saladin; IS makes no mention of a rift beyond Saladin's own account (CH-04.E5) |
| `CH-04.E5` | **The council:** IAT: Taqi ad-Din said they would fight Nur ad-Din; Ayyub rebuked him, said he and Saladin's maternal uncle would dismount and kiss the ground before Nur ad-Din, and told Saladin privately to write offering submission. IS (Saladin's own recollection): the council urged revolt and **Saladin alone opposed it** | **Attested, sources differ** | IKh-dS IV pp. 502–504 (IAT); IS-PPTS p. 65 | PD | Both versions are shown; the Ibn al-Athir version is flagged as partisan. `SUP-AYYUB-SALAH-B` |
| `CH-04.E6` | Ayyub died after a fall from his horse while galloping and playing a mounted game (568 AH / 1173) | **Attested** | IS-PPTS pp. 63–64; IKh-dS IV p. 501 | PD | Exact dates (31 July injury, 9 Aug 1173) are WEB only (UNV-14) |
| `CH-04.E7` | Saladin sent his elder brother Turan-Shah to Yemen (Rajab 569 / Feb 1174), praising his qualities "in which he excels me" | **Attested** | IS-PPTS p. 64 | PD | |

### 3.5 `CH-05` After Nur ad-Din (1174–1176 / 569–572 AH) — *planned*

| ID | Claim | Confidence | Sources | Checked | Notes |
|---|---|---|---|---|---|
| `CH-05.E1` | Nur ad-Din died Wednesday 11 Shawwal 569 (≈ 15 May 1174) at Damascus, of an affection of the throat | **Attested** | IS-PPTS p. 65; IKh-dS III p. 339 | PD | |
| `CH-05.E2` | Saladin entered Damascus on 30 Rabi' II 570 (≈ late Nov 1174) at the invitation of Ibn al-Muqaddam; the first house he entered was his father's | **Attested** (weekday mismatch, §8) | IS-PPTS pp. 68–69 | PD | |
| `CH-05.E3` | He took Homs, then besieged Aleppo; the battle at the **Horns of Hama** on 19 Ramadan 570 (≈ 13 Apr 1175) routed the Mosul forces; he freed the prisoners | **Attested** | IS-PPTS pp. 69–71 | PD | |
| `CH-05.E4` | The battle at Tell al-Sultan (10 Shawwal 571 / 22 Apr 1176): Keukburi (then on Mosul's side) overthrew Saladin's left flank; Saladin charged in person and routed the enemy; he released the notables captured | **Attested** | IS-PPTS pp. 73–74 and note on Keukburi | PD | Keukburi later joined Saladin and married his sister (note citing IKh ii. 535) |
| `CH-05.E5` | During the siege of Azaz (from 4 Dhu'l-Qa'da 571, fell 14 Dhu'l-Hijja) the Isma'ilis tried to assassinate Saladin; he was preserved and the attackers seized | **Attested** (brief) | IS-PPTS p. 74 | PD | Imad ad-Din and Ibn al-Athir give more detail: not collated. The Masyaf "dagger" tale is excluded (EXC-05) |
| `CH-05.E6` | A young daughter of Nur ad-Din was sent to ask Saladin for the castle of Azaz; he granted it | **Attested** | IS-PPTS p. 75 | PD | A human detail for a scene |

### 3.6 `CH-06` Montgisard (1177 / 573 AH) — *planned*

| ID | Claim | Confidence | Sources | Checked | Notes |
|---|---|---|---|---|---|
| `CH-06.E1` | The Muslims were routed near Ramla (Tell Jezer) on 25 Nov 1177. Saladin gave this explanation: as the Franks advanced, some of his men changed the position of the flanks to take cover behind a tell; during the movement the Franks charged and routed them; with no stronghold near, they fled toward Egypt and lost their way; many were captured, among them the jurist **Isa** | **Attested** (Saladin's own explanation); **Frankish accounts differ** | IS-PPTS pp. 75–76 (and editor's note citing Röhricht for the date); `SRC-WT`, `SRC-IAT`, `MOD-HAMILTON` | PD (IS) / — | Baldwin IV, aged 16, led the Frankish army (WEB). Treated with dignity (D-014) |
| `CH-06.E2` | Raynald of Chatillon had been ransomed from Aleppo, where he had been held since Nur ad-Din's time | **Attested** | IS-PPTS p. 75 | PD | The year of his release (1176) is from modern references, WEB only |
| `CH-06.E3` | Saladin stayed in Egypt to remodel his army, then returned to Syria | **Attested** | IS-PPTS p. 77 | PD | The Cairo walls and Citadel (Qaraqush) are WEB |

### 3.7 `CH-07` Years of Patience (1179–1186) — *planned*

| ID | Claim | Confidence | Sources | Checked | Notes |
|---|---|---|---|---|---|
| `CH-07.E1` | The treaty with Kilij Arslan (Oct 1180); the death of al-Salih Isma'il; Mosul and Aleppo diplomacy | **Attested** | IS-PPTS pp. 77–80 | — (outline only seen) | |
| `CH-07.E2` | Marj Ayyun and Jacob's Ford (1179); Mosul (1182, 1185–86); Aleppo (1183); Kerak (1183); the Red Sea fleet under Husam ad-Din Lu'lu' (1183); truce and its breaking | **Attested** | `SRC-IAI-BARQ`, `SRC-IAT`, `SRC-IJ`, `SRC-WT` | — | To collect at implementation |
| `CH-07.E3` | Raynald's attack on a caravan under the truce; Saladin vowed to kill him | **Attested, sources differ** (date, details) | IS-PPTS p. 114; others — | PD (claim) / — (date) | |
| `CH-07.E4` | Ibn Jubayr's visit and impressions (1183–85) | **Attested** | `SRC-IJ` | — | |

### 3.8 `CH-08` Hattin (1187 / 583 AH) — *planned*

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-08.E1` | Saladin mustered at 'Ashtara and marched out on 17 Rabi' II 583 (Ibn Shaddad says he liked to move on a Friday, but the weekday does not fit the date); took Tiberias by assault (the castle held out, held by Raymond's wife); the Franks left Saffuriya; the armies met on the evening of Thursday 22nd; fighting on Friday 23rd and the decisive day Saturday **24 Rabi' II (4 July 1187)** | **Attested, sources differ** (day-by-day) | IS-PPTS pp. 110–112 (the 1897 editor notes the advance from Saffuriya was fatal for want of water) | PD | |
| `CH-08.E2` | **Raymond of Tripoli's escape:** IS says he fled early, before the fighting was serious; Frankish accounts (Ernoul) say a Muslim squadron parted and let him through; a 14th-century Muslim source says Taqi ad-Din opened the ranks | **Attested, sources differ** | IS-PPTS pp. 112–113; `SRC-ERN` (WEB); al-'Umari (WEB, late) | PD (IS) / WEB | Codex dispute entry |
| `CH-08.E3` | The Franks, surrounded on the hill of Hattin, suffered from thirst; the Muslims lit fires around them; their leaders surrendered (Guy, his brother, Raynald, Humphrey of Toron, the Master of the Templars, Hugh of Jubail, the Master of the Hospitallers) | **Attested** | IS-PPTS pp. 113–114 (note citing Imad and Ibn al-Athir) | PD | Heat/thirst and brush fires in play (Design §4.6) |
| `CH-08.E4` | **Raynald and the cup:** Saladin gave King Guy a bowl of iced rose-water sherbet; Guy passed it to Raynald; Saladin said that it was Guy, not he, who gave him drink (the Arab custom that a captive who has eaten or drunk with his captor is safe). Saladin later offered Raynald Islam, struck him with his sabre, and others finished him. Saladin told Guy it is not the way of kings to kill kings but that Raynald had gone beyond all bounds | **Attested, sources differ** (details) | IS-PPTS pp. 114–115 (Imad ad-Din and Ibn al-Athir also report it: not collated) | PD | Shown with a **scene cut** at the cup; the rest in the Codex only (D-007) |
| `CH-08.E5` | Saladin had sworn to kill Raynald because he had attacked a caravan from Egypt during the truce, ignored pleas to honour it, and insulted the Prophet | **Attested** | IS-PPTS p. 114 | PD | |
| `CH-08.E6` | The captured Templars and Hospitallers were put to death | **Attested** | IS-PPTS p. 114 | PD | Codex only; no depiction |
| `CH-08.E7` | Raymond died soon afterwards at Tripoli of pleurisy | **Attested** | IS-PPTS p. 114 | PD | |
| `CH-08.E8` | Al-Afdal's recollection of the battle (reported by Ibn al-Athir) | **Attested** (partisan source) | `SRC-IAT` | — | To verify |
| `CH-08.E9` | Keukburi distinguished himself at Hattin | **Attested** | IS-PPTS p. 73 note (citing IKh ii. 535) | PD (note) | |

### 3.9 `CH-09` Jerusalem (1187 / 583 AH) — *planned*

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-09.E1` | Saladin camped west of Jerusalem on Sunday 15 Rajab 583 (20 Sept 1187), moved to the north and attacked with mangonels; miners breached a northern corner; the Franks asked for terms | **Attested** | IS-PPTS pp. 118–119 | PD | |
| `CH-09.E2` | The city was handed over on **Friday 27 Rajab 583 (≈ 2 Oct 1187)**, the anniversary of the Night Journey; Friday prayer was held that day; the great cross on the Dome of the Rock was thrown down | **Attested** | IS-PPTS pp. 119–120 | PD | The Night Journey is mentioned as a date coincidence only; the Prophet is never depicted |
| `CH-09.E3` | **Terms:** ten Tyrian dinars per man, five per woman, one per child; those who paid were free and escorted to Tyre; over 3,000 Muslim prisoners were freed | **Attested, sources differ** | IS-PPTS p. 120; other accounts' figures and the negotiation of the poor's ransom are not collated; web summaries give a Frankish account (7,000 poor for 30,000 bezants) | PD (IS) / WEB | **Must be collated before this chapter is built** |
| `CH-09.E4` | The booty (about 220,000 dinars by one report) was distributed; Saladin kept nothing; he left Jerusalem on 25 Sha'ban 583 (30 Oct) | **Attested** | IS-PPTS p. 120 | PD | |
| `CH-09.E5` | Balian of Ibelin ("son of Barizan") as principal Frankish negotiator | **Attested** | IS names Balian among the leading coast lords (pp. 21, 385); the Jerusalem negotiation itself: `SRC-IAT`, `SRC-ERN` | PD (identity) / — | |

### 3.10 `CH-10`–`CH-12` The Third Crusade (1189–1192 / 585–588 AH) — *planned*

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-10.E1` | In a high wind one night at Acre Saladin's tent fell on him; he was unhurt because he was in the wooden alcove | **Attested** | IS-PPTS p. 24 | PD | |
| `CH-10.E2` | Saladin, suffering from boils from waist to knees, rode and drew up the army anyway: the pain left him in the saddle and returned when he dismounted | **Attested** | IS-PPTS pp. 27–28 | PD | |
| `CH-10.E3` | Between the two armies he had traditions read aloud; Ibn Shaddad remarks that this was unprecedented | **Attested** | IS-PPTS p. 22 | PD | |
| `CH-10.E4` | **Qaraqush** (governor of Acre) and **Husam ad-Din Lu'lu'** (chamberlain and commander of the fleet) wrote that provisions at Acre would last only to mid-Sha'ban 585 and kept this from the garrison | **Attested** | IS-PPTS p. 209 | PD | `SUP-QARAQUSH-LULU-C` |
| `CH-10.E5` | A young envoy from the Caliph's court (of the Prophet's family) brought naphtha experts and two loads of naphtha, and a warrant to borrow 20,000 dinars; Saladin took the naphtha men but declined the loan lest it burden his provinces | **Attested** | IS-PPTS p. 176 | PD | Spring 1190 (Rabi' I 586) |
| `CH-10.E6` | A **Damascene caldron-maker** set the Frankish towers on fire with copper pots of boiling naphtha-based compound | **Attested** (unnamed) | IS-PPTS pp. 178–179 | PD | Class anchor for the Naffat |
| `CH-10.E7` | Richard I had the Muslim garrison's hostages put to death (Aug 1191) | **Attested, sources differ** (reasons) | `SRC-IS` (not re-read), `SRC-ITIN`, `SRC-AMB` | — | To collate; never shown |
| `CH-10.E8` | The young philosopher al-Suhrawardi was put to death at Aleppo (1191) after being accused of not recognising the ordinances of the law; Saladin ordered it through his son al-Zahir; Ibn Shaddad says the body was hung on a cross for days, while the 1897 editor, citing Ibn Khallikan, says he was strangled in the castle | **Attested, sources differ** (manner; motive) | IS-PPTS pp. 10–11 and note | PD | Codex only, with a content note; never shown (D-007, D-016) |
| `CH-10.E9` | Arab brigands in Saladin's pay raided the Frankish camp at Acre, stealing money and horses and carrying off sleeping men at dagger point; some who cried out were killed | **Attested** | IS-PPTS pp. 254, 304 | PD | Anchor for the Skirmisher line and the dagger |
| `CH-11.E1` | Arsuf (7 Sept 1191): the Muslim harassment of Richard's march and the Frankish counter-charge | **Attested** | `SRC-IS`, `SRC-ITIN`, `SRC-AMB` | — | To collate |
| `CH-11.E3` | At Arsuf the Frankish infantry wore felt vests and mail so dense that Muslim arrows made no impression, and shot great arbalists that wounded horses and riders; men with up to ten arrows in them kept marching in order | **Attested** | IS-PPTS pp. 282–284 | PD | Anchor for the Crossbow line and for heavy mail |
| `CH-11.E2` | **Ascalon:** after Jaffa fell back to the Franks, Saladin's council decided to demolish Ascalon rather than lose it with its garrison; he said that he would rather lose all his children than see one stone cast down, but the Muslim cause required it. The inhabitants sold their goods for next to nothing and left | **Attested** | IS-PPTS pp. 295–299 (quote on p. 296) | PD | Sha'ban 587 / Sept 1191. `SUP-SALAH-AFDAL-B` |
| `CH-12.E1` | **Beit Nuba:** with the Franks a day from Jerusalem, Saladin's emirs would not stay unless he left his brother or a son in command; he and Ibn Shaddad kept vigil all night; reports then came of discord among the Franks, who turned back toward Ramla | **Attested** | IS-PPTS pp. 11–14 | PD | Ibn Shaddad says only "the rainy season"; the winter of 1191–92 is inferred from context (verify). `SUP-SALAH-IBNSHADDAD-A` |
| `CH-12.E2` | **Jaffa (July–Aug 1192):** Saladin took the town; Richard, landing from the sea, attacked at dawn from a handful of tents; Saladin's troops hesitated and one emir spoke rudely about booty; Saladin withdrew in anger; his emirs feared punishment, but he invited them to taste a gift of fruit from Damascus | **Attested** | IS-PPTS pp. 35–37, 372–376 | PD | |
| `CH-12.E3` | Richard fell ill and asked repeatedly for fruit and snow (pears and peaches); Saladin sent them, partly to gather information about the garrison. A messenger conveyed Richard's wish to have Ascalon | **Attested** | IS-PPTS pp. 378–380 | PD | Ibn Shaddad states Saladin's practical motive; both the courtesy and the motive are shown |
| `CH-12.E4` | Richard proposed that his sister marry al-Adil, the two to hold the coastal cities together; he later said he needed the Pope's consent and offered a niece instead | **Attested** | IS-PPTS pp. 324–325 | PD | Reported by Ibn Shaddad from the negotiations |
| `CH-12.E6` | Conrad of Montferrat was stabbed to death by two of his servants on Tuesday 13 Rabi' II 588 (≈ 28 April 1192); Ibn Shaddad says they declared they had been suborned by the king of England, while Frankish sources (cited in the 1897 editor's note) say they were Assassins sent by the Sheikh of the Mountain | **Attested, sources differ** | IS-PPTS pp. 332–333 and note | PD | Codex only; never shown (D-007) |
| `CH-12.E7` | At Jaffa on Friday 18 Rajab 588 (≈ 31 July 1192) mangonels and mines brought down the wall, and the defenders closed the breach with a wall of halberds and lances | **Attested** | IS-PPTS pp. 364–365 | PD | Anchor for the Axe Knight and spear lines |
| `CH-12.E5` | The "two horses" sent to Richard at Jaffa | **Frankish accounts only** | `SRC-ITIN`, `SRC-AMB` (not read); **not found in IS-PPTS** | PD (absence in IS) | EXC-09; may appear in the Codex as "the Frankish account" |

### 3.11 `CH-FIN` Ramla and Damascus (1192–1193 / 588–589 AH) — *planned*

| ID | Claim | Confidence | Sources and location | Checked | Notes |
|---|---|---|---|---|---|
| `CH-FIN.E1` | **The Treaty of Ramla**, dated Wednesday 22 Sha'ban 588 (≈ 2 Sept 1192): a three-year truce; Jaffa and the coast to the Franks, Ramla and Lydda shared; Ascalon to be demolished; Antioch and Tripoli included; free passage for Christian pilgrims and Muslim travellers; the Hajj road reopened | **Attested** | IS-PPTS pp. 381–387 | PD | |
| `CH-FIN.E2` | Saladin told Ibn Shaddad he feared the peace: the Franks would build fortresses on every hilltop, and the Muslims would suffer by the agreement; yet the army was exhausted and uncooperative | **Attested** (documented saying, paraphrased) | IS-PPTS pp. 386–387 | PD | |
| `CH-FIN.E3` | Frankish pilgrims came to Jerusalem; Richard asked Saladin to hinder those without his passport; Saladin said that the law forbids hindering pilgrims and received some at his table | **Attested** | IS-PPTS pp. 388–389 | PD | |
| `CH-FIN.E4` | Saladin announced the Hajj; lists of provisions were drawn up; Ibn Shaddad had suggested it on the day peace was concluded; the pilgrimage was interrupted by affairs | **Attested** | IS-PPTS pp. 8–9, 386, 389–390, 393 | PD | Ibn Shaddad gives two explanations (want of time; interruption) |
| `CH-FIN.E5` | Leaving Jerusalem on 27 Ramadan 588, Saladin advised his son al-Zahir: fear God, beware of bloodshed, win the hearts of subjects and emirs, bear no grudges | **Attested** (documented, paraphrased) | IS-PPTS pp. 392–393 | PD | `SUP-SALAH-ZAHIR-A` |
| `CH-FIN.E6` | Richard sailed on 1 Shawwal 588 (≈ 10 Oct 1192); Saladin went on to Damascus, leaving Ibn Shaddad at Jerusalem to oversee a hospital and a college he had founded | **Attested** | IS-PPTS pp. 393–394 | PD | |
| `CH-FIN.E7` | **The last illness:** a bilious fever began on Friday night; on Saturday **16 Safar 589** he was weak; physicians bled him on the fourth day; the mind wandered from about the ninth day; the household and city were in distress; al-Afdal took the emirs' oaths on conditions | **Attested** | IS-PPTS pp. 400–405 | PD | |
| `CH-FIN.E8` | Saladin did not lose patience over water that was too hot or too cold; Ibn Shaddad and al-Qadi al-Fadil wept. Another man would have thrown the cup at the servant's head | **Attested** | IS-PPTS pp. 401–402 | PD | `SUP-SALAH-FADIL-A` |
| `CH-FIN.E9` | **Death:** after the dawn prayer on **Wednesday 27 Safar 589** (conventionally 4 March 1193; the weekday fits 3 March, §8). The sheikh who recited at his bedside later said that, at a verse, Saladin said it was true | **Attested** (day of month flagged) | IS-PPTS pp. 405–406 | PD | Scripture omitted in the slice (D-004); the Codex says that recitation was heard |
| `CH-FIN.E10` | His estate was 47 *Nasiri* dirhams and one Tyrian gold dinar; no house, garden, village or land | **Attested** | IS-PPTS pp. 5–7, 19 | PD | |
| `CH-FIN.E11` | Saladin could not make up the Ramadan fasts he had missed because of illness; in his last year he fasted extra days at Jerusalem; Ibn Shaddad kept the count (the Qadi being absent) | **Attested** | IS-PPTS pp. 8–9 | PD | `SUP-SALAH-FADIL-C` |

---

## 4. Character ledger

All major named characters are historical. Fictional characters are flagged. "Class" is the game assignment (not a claim). Ages and dates are as in the sources, with caveats in the notes.

### 4.1 Playable roster (the brief's list)

| ID | Person | Class and role | Dates | Sources and location | Confidence | Checked |
|---|---|---|---|---|---|---|
| `CHR-SALAH` | **Salah ad-Din Yusuf ibn Ayyub**, al-Malik al-Nasir | Young Lord → Lord (rank event in CH-03) → Sovereign (planned); Lord | b. 532 AH (1137–38) Tikrit; d. 27 Safar 589 (early Mar 1193) Damascus | IS-PPTS pp. 4–5, 400–406; IKh-dS IV pp. 479–504 | Attested | PD |
| `CHR-ADIL` | **al-Adil Sayf ad-Din Abu Bakr** ("Safadin" in Frankish sources) | Mounted Knight; from CH-04 | b. 1145 Damascus; d. 1218 | IS-PPTS p. 25 note (citing IKh iii. 235), pp. 66, 297–298, 378–381, 390 | Attested | PD |
| `CHR-TAQI` | **Taqi ad-Din Umar**, nephew of Saladin | Mounted Knight | d. 587 AH (1191) per modern references (WEB); Ibn Shaddad records Saladin's reaction to the news while camped near Ramla | IS-PPTS pp. 15, 32; IKh ii. 394 (not read) | Attested | PD (IS) / WEB (date) |
| `CHR-AFDAL` | **al-Afdal Nur ad-Din Ali**, eldest son | Young Lord → Lord | b. 1170 (WEB) | IS-PPTS passim (pp. 25, 296, 393, 400–405) | Attested | PD (IS) / WEB (birth) |
| `CHR-ZAHIR` | **al-Zahir Ghazi**, son; lord of Aleppo from 1186/87 | Young Lord → Lord | b. 1173; d. 1216 | IS-PPTS p. 11 note (citing IKh ii. 443), pp. 36–37, 392–393 | Attested | PD |
| `CHR-SHIRKUH` | **Asad ad-Din Shirkuh ibn Shadhi**, uncle | Axe Knight (Tier II); departs by scripted death in CH-03 | d. 22 Jumada II 564 (Mar 1169) | IKh-dS I pp. 626–628; IKh-dS IV pp. 485–492; IS-PPTS pp. 46–55 | Attested (day and cause differ) | PD |
| `CHR-AYYUB` | **Najm ad-Din Ayyub ibn Shadhi**, father | Spear Knight (Tier II); CH-00–01, returns CH-04 | d. 568 AH (1173) after a fall from his horse | IKh-dS I pp. 243–246; IKh-dS IV pp. 480–485, 493–494; IS-PPTS pp. 4, 59–64 | Attested | PD |
| `CHR-KEUKBURI` | **Muzaffar ad-Din Kökböri** ("Keukburi"), lord of Arbela | Horse Marksman; from CH-05 | Lord of Arbela 1168 (aged 14); succeeded his brother 1190 | IS-PPTS p. 73 note (citing IKh ii. 535), p. 74 | Attested | PD (note) |
| `CHR-QARAQUSH` | **Baha ad-Din Qaraqush al-Asadi**, a eunuch freed by Shirkuh | Engineer; from CH-04 | d. 1201 (WEB) | IKh-dS IV p. 498; IS-PPTS p. 209 | Attested (career details WEB) | PD (partial) |
| `CHR-LULU` | **Husam ad-Din Lu'lu'**, chamberlain and fleet commander | Man-at-Arms; from CH-07 | — | IS-PPTS p. 209 | Attested | PD (one mention) |
| `CHR-IBNSHADDAD` | **Baha ad-Din ibn Shaddad**, judge of the army | Counselor (non-combat); from CH-10 | b. 1145 Mosul; made the Hajj in 1188 and then entered Saladin's service (1897 editors' introduction, IS-PPTS pp. xiii–xiv); d. 1234 (WEB) | IS-PPTS passim; IKh-dS IV (Ibn Khallikan's teacher) | Attested | PD (role, 1188) / WEB (death) |
| `CHR-IMAD` | **Imad ad-Din al-Isfahani**, secretary | Scribe → Counselor (non-combat); from CH-05 | 1125–1201; in Saladin's service from 1175 | WEB; IKh iii. 300 (not read) | Attested | WEB |
| `CHR-FADIL` | **al-Qadi al-Fadil**, chancery head and counsellor | Counselor → Vizier (strategist/support); from CH-04 | b. Ascalon 1135; d. 1200 | IS-PPTS p. 8 note (IKh ii. 111), pp. 8–9, 391, 401–402; IKh-dS IV (his letter on Jerusalem) | Attested | PD (IS) / WEB |

### 4.2 Slice characters beyond the roster

| ID | Person | Role | Sources and location | Confidence | Checked |
|---|---|---|---|---|---|
| `CHR-ZENGI` | Imad ad-Din Zengi, atabeg of Mosul and Aleppo (d. 541 / 1146) | ally NPC (CH-00) | IKh-dS IV pp. 482–484 | Attested | PD |
| `CHR-NURADDIN` | Nur ad-Din Mahmud, son of Zengi, lord of Aleppo and Damascus (d. 11 Shawwal 569 / 15 May 1174) | patron NPC (CH-01–05) | IKh-dS III pp. 338–340; IS-PPTS p. 65 | Attested | PD |
| `CHR-BIHRUZ` | Mujahid ad-Din Bihruz, Seljuk governor of Iraq (d. Jan 1146) | NPC (CH-00) | IKh-dS IV p. 482; IKh-dS I pp. 243–245 | Attested | PD |
| `CHR-QARAJA` | Qaraja as-Saqi (Bars), governor of Fars and Khuzistan, ally of the Caliph | enemy commander (CH-00) | IKh-dS IV p. 482 | Attested | PD |
| `CHR-MUJIR` | Mujir ad-Din Abaq, Burid ruler of Damascus | NPC (CH-01) | IKh-dS III p. 339 | Attested | PD |
| `CHR-SHAWAR` | Shawar, vizier of Egypt (d. 17 Rabi' II 564 / Jan 1169) | NPC (CH-02–03) | IS-PPTS pp. 46–54; IKh-dS IV pp. 485–491 | Attested | PD |
| `CHR-DIRGHAM` | Dirgham, vizier who displaced Shawar (d. 1164) | NPC (mention) | IKh-dS IV pp. 485–486 | Attested | PD |
| `CHR-ADID` | al-Adid li-Din Allah, last Fatimid caliph (d. 10 Muharram 567 / Sept 1171) | NPC (CH-03–04) | IKh-dS IV pp. 490–499; IS-PPTS pp. 61–62 | Attested | PD |
| `CHR-ISA` | Diya' ad-Din Isa al-Hakkari, jurist and emir | Counselor / ally (CH-03) | IKh-dS IV pp. 494–495; IS-PPTS p. 76 note | Attested | PD |
| `CHR-TURANSHAH` | Shams ad-Dawla Turan-Shah, Saladin's elder brother (to Yemen 1174; d. Alexandria 1180) | guest ally (CH-03) | IKh-dS IV pp. 496–497; IS-PPTS pp. 64, 75 | Attested | PD |
| `CHR-MASHTUB` | Sayf ad-Din Ali ibn Ahmad al-Hakkari, called al-Mashtub ("the scarred") | recruit by Talk (CH-03) | IKh-dS IV pp. 494–495 | Attested | PD |
| `CHR-HARIMI` | Shihab ad-Din Mahmud al-Harimi, Saladin's maternal uncle | recruit by Talk (CH-03) | IKh-dS IV p. 494 | Attested | PD |
| `CHR-QUTBKHUSRAW` | Qutb ad-Din Khusraw ibn Talil, Kurdish emir (founder of the Qutbiyya college at Cairo) | recruit by Talk (CH-03) | IKh-dS IV p. 494 | Attested | PD |
| `CHR-YARUQI` | Ain ad-Dawla al-Yaruqi, a leading Nurid emir; refused to serve Saladin and returned to Nur ad-Din | NPC (CH-03) | IKh-dS IV p. 495 | Attested | PD |
| `CHR-JURDIK` | Izz ad-Din Jurdik, freedman of Nur ad-Din; helped seize Shawar | ally (CH-03) | IKh-dS IV pp. 490–491; IS-PPTS p. 13 note | Attested | PD |
| `CHR-SILAFI` | al-Hafiz Abu Tahir al-Silafi, hadith scholar of Alexandria | NPC (CH-02) | IS-PPTS p. 10; IKh-dS IV p. 486 | Attested | PD |
| `CHR-USAMA` | Usama ibn Munqidh | cameo/witness (CH-00) | IKh-dS IV p. 482 | Attested | PD (indirect) |
| `CHR-AMALRIC` | Amalric I, king of Jerusalem (r. 1163–74) | enemy commander (CH-02–03) | `SRC-WT`; IS-PPTS mentions "the Franks" | Attested | — |
| `CHR-MUTAMIN` | Mu'tamin al-Khilafa, Fatimid palace majordomo, executed Aug 1169 | disputed NPC (CH-03) | `SRC-IAT`, `SRC-MQ`; `MOD-LEV` | **Attested, sources differ** | WEB |
| `CHR-RECRUIT` | **The Recruit**, a player-named levy | viewpoint unit (CH-00 on) | n/a | **Fictional (game-only)** | n/a |
| `CHR-GEN-*` | Generic troops: Tikrit Garrison, Caliphal Cavalry, Burid Guard, Alexandrian Militia, Fatimid Regiments, Frankish Knights, and so on | unnamed composites | n/a | **Fictional (game-only)** | n/a |

### 4.3 Later-chapter characters (stubs)

Baldwin IV, Raynald of Chatillon, Raymond III of Tripoli, Guy of Lusignan, Balian of Ibelin, Humphrey of Toron, Richard I, Conrad of Montferrat, Henry of Champagne, Eschiva of Tiberias; Sinan (Isma'ili leader). Each gets a `CHR-` row before its chapter is built. Frankish figures are drawn from Frankish *and* Arabic sources and treated as people, not villains (D-014).

---

## 5. Support-scene ledger

Each rank unlocks one scene, and each scene cites the documented anecdote it is built on. Dialogue is **dramatized** unless a saying is directly recorded (marked "doc."). Scenes marked **S** are in the vertical slice.

| ID | Pair | Rank and title | Anecdote and source | Confidence | Chapter | Checked |
|---|---|---|---|---|---|---|
| `SUP-AYYUB-SHIRKUH-C` **S** | Ayyub and Shirkuh | C: *The Halberd* | The woman at the castle gate; Shirkuh strikes the officer; Ayyub imprisons his brother and writes to Bihruz. IKh-dS I pp. 244–245; IKh-dS IV p. 483 | **Attested, sources differ** (cause/victim) | after CH-00 | PD |
| `SUP-AYYUB-SHIRKUH-B` **S** | Ayyub and Shirkuh | B: *Baalbek Surrendered* | After Zengi's death, Ayyub is besieged, surrenders on terms; Shirkuh goes to Nur ad-Din. IKh-dS IV pp. 483–484 | **Attested** | after CH-01 | PD |
| `SUP-AYYUB-SALAH-C` **S** | Ayyub and Salah ad-Din | C: *Under His Father's Roof* | Salah ad-Din raised "in his father's bosom"; first service under Ayyub's direction. IS-PPTS pp. 4–5; IKh-dS IV p. 485 | **Reasonably inferred** (facts attested, conversation dramatized) | after CH-01 | PD |
| `SUP-SHIRKUH-SALAH-C` **S** | Shirkuh and Salah ad-Din | C: *Against His Will* | Saladin goes to Egypt reluctantly; Shirkuh gives him the vanguard. IS-PPTS pp. 48, 50, 53; IKh-dS IV pp. 485–486, 489 | **Attested** (saying doc.) | start of CH-02 | PD |
| `SUP-SHIRKUH-SALAH-B` **S** | Shirkuh and Salah ad-Din | B: *Nothing Decided Without Him* | Shirkuh settles no question without consulting his nephew. IS-PPTS p. 48 | **Attested** | after CH-02 | PD |
| `SUP-SHIRKUH-SALAH-A` **S** | Shirkuh and Salah ad-Din | A: *The Vizier's Table* | Shirkuh as vizier entrusts the daily management to Saladin; his appetite and last illness. IS-PPTS pp. 54–55 | **Reasonably inferred** (facts attested, scene dramatized) | CH-03 camp, before Shirkuh's death | PD |
| `SUP-ISA-SALAH-C` **S** | Isa al-Hakkari and Salah ad-Din | C: *The Persuader* | Isa wins the emirs one by one with different arguments. IKh-dS IV pp. 494–495 (IAT); IS-PPTS p. 76 note | **Attested** (partisan source) | after CH-03 council | PD |
| `SUP-TURANSHAH-SALAH-C` **S** | Turan-Shah and Salah ad-Din | C: *Lord of Egypt* | Nur ad-Din's warning to Turan-Shah to serve his younger brother as lord of Egypt. IKh-dS IV pp. 496–497 (IAT) | **Attested** | after CH-03 | PD |
| `SUP-RECRUIT-AYYUB-C` **S** | the Recruit and Ayyub | C: *Provisions for the Retreat* | Ayyub's boats and kindness to Zengi's routed men. IKh-dS IV pp. 482–483 | **Fictional (game-only)** pair; attested backdrop | after CH-00 | PD |
| `SUP-AYYUB-SALAH-B` | Ayyub and Salah ad-Din | B: *The Rebuke* | Ayyub rebukes Taqi ad-Din at the council. IKh-dS IV pp. 502–504 (IAT) against IS-PPTS p. 65 | **Attested, sources differ** | CH-04/05 | PD |
| `SUP-AYYUB-SALAH-A` | Ayyub and Salah ad-Din | A: *Fortune's Destination* | Ayyub refuses the command Saladin offers. IS-PPTS pp. 59–60; IKh-dS IV pp. 493–494 | **Attested** | CH-04 | PD |
| `SUP-AYYUB-SALAH-BOND` | Ayyub and Salah ad-Din | Bond: *News on the Road* | Saladin, returning from Kerak, learns that his father died; he grieved at not being with him. IS-PPTS pp. 63–64 | **Attested** | after CH-04 | PD |
| `SUP-SALAH-IBNSHADDAD-C` | Salah ad-Din and Ibn Shaddad | C: *The Inkstand* | The old mamluk's petition; "there is no inkstand here"; Saladin reaches for it; "I have satisfied a petitioner" (doc.). IS-PPTS pp. 33–35 | **Attested** | CH-10 | PD |
| `SUP-SALAH-IBNSHADDAD-B` | Salah ad-Din and Ibn Shaddad | B: *The Merchant of Khilat* | A merchant sues Saladin before Ibn Shaddad's tribunal; Saladin sits beside him; the claim fails but he is rewarded. IS-PPTS pp. 16–18 | **Attested** | CH-10 | PD |
| `SUP-SALAH-IBNSHADDAD-A` | Salah ad-Din and Ibn Shaddad | A: *The Sleepless Night* | Beit Nuba; the vigil in the rain; Ibn Shaddad's counsel. IS-PPTS pp. 11–14 | **Attested** | CH-12 | PD |
| `SUP-SALAH-FADIL-C` | Salah ad-Din and al-Qadi al-Fadil | C: *The Count of Fast Days* | Al-Fadil keeps the count of Saladin's missed fasts. IS-PPTS pp. 8–9 | **Attested** | CH-FIN | PD |
| `SUP-SALAH-FADIL-B` | Salah ad-Din and al-Qadi al-Fadil | B: *The Jerusalem Letter* | Al-Fadil's letter announcing the conquest to the Caliph. IKh-dS IV (the *Risala Qudsiyya*) | **Attested** | CH-09 | PD (mention) |
| `SUP-SALAH-FADIL-A` | Salah ad-Din and al-Qadi al-Fadil | A: *The Cup* | Deathbed: the water too hot, then too cold. IS-PPTS pp. 401–402 | **Attested** | CH-FIN | PD |
| `SUP-SALAH-ADIL-C` | Salah ad-Din and al-Adil | C: *The Brother Sent South* | Saladin sends al-Adil to crush al-Kanz's revolt at Qus. IS-PPTS pp. 65–66 | **Attested** | CH-05 | PD |
| `SUP-SALAH-ADIL-B` | Salah ad-Din and al-Adil | B: *Time to Pull Down Ascalon* | Al-Adil prolongs the talks to give time for the demolition. IS-PPTS pp. 297–298 | **Attested** | CH-11 | PD |
| `SUP-SALAH-ADIL-A` | Salah ad-Din and al-Adil | A: *Fruit and Snow* | Richard's requests; the intelligence motive; the marriage plan. IS-PPTS pp. 324–325, 378–381 | **Attested** | CH-12 | PD |
| `SUP-SALAH-ADIL-BOND` | Salah ad-Din and al-Adil | Bond: *The Ground at Mar Samwil* | Al-Adil, recovering from illness, dismounts and kisses the ground before his brother. IS-PPTS p. 390 | **Attested** | CH-FIN | PD |
| `SUP-SALAH-AFDAL-B` | Salah ad-Din and al-Afdal | B: *Rather Lose All My Children* | Saladin consults his son on the demolition of Ascalon. IS-PPTS p. 296 | **Attested** | CH-11 | PD |
| `SUP-SALAH-AFDAL-BOND` | Salah ad-Din and al-Afdal | Bond: *His Father's Place* | During the illness al-Afdal sits at his father's place at table; Ibn Shaddad cannot bear the sight. IS-PPTS pp. 400–401 | **Attested** | CH-FIN | PD |
| `SUP-SALAH-ZAHIR-C` | Salah ad-Din and al-Zahir | C: *Afraid to Face His Father* | After Jaffa, al-Zahir is afraid to come into his father's sight. IS-PPTS pp. 36–37 | **Attested** | CH-12 | PD |
| `SUP-SALAH-ZAHIR-B` | Salah ad-Din and al-Zahir | B: *The Creed by Heart* | Saladin has his younger sons memorize a creed. IS-PPTS p. 5 | **Attested** | CH-10 | PD |
| `SUP-SALAH-ZAHIR-A` | Salah ad-Din and al-Zahir | A: *Beware of Bloodshed* | Saladin's parting counsel at Jerusalem. IS-PPTS pp. 392–393 | **Attested** (doc.) | CH-FIN | PD |
| `SUP-SALAH-TAQI-C` | Salah ad-Din and Taqi ad-Din | C: *Justice Even for Kin* | A Damascene complains against Taqi ad-Din; Saladin makes him appear in court. IS-PPTS p. 15 | **Attested** | CH-10 | PD |
| `SUP-SALAH-TAQI-BOND` | Salah ad-Din and Taqi ad-Din | Bond: *Rose-Water* | The news of Taqi ad-Din's death: tears, silence, rose-water on the eyes, a meal. IS-PPTS p. 32 | **Attested** | CH-11 | PD |
| `SUP-SALAH-KEUKBURI-C` | Salah ad-Din and Keukburi | C: *The Wing That Broke His Flank* | Keukburi, then on the Mosul side, breaks Saladin's left wing; later he joins Saladin. IS-PPTS pp. 73–74 and note | **Attested** | CH-05 | PD |
| `SUP-SALAH-QARAQUSH-C` | Salah ad-Din and Qaraqush | C: *The Keys of the Palace* | The steward of al-Adid's household hands everything over. IKh-dS IV p. 498 | **Attested** | CH-04 | PD |
| `SUP-QARAQUSH-LULU-C` | Qaraqush and Husam ad-Din Lu'lu' | C: *Provisions for Acre* | Their joint dispatch on food at Acre. IS-PPTS p. 209 | **Attested** | CH-10 | PD |

Supports involving Imad ad-Din (for example with al-Qadi al-Fadil or Ibn Shaddad) are **not yet sourced**; they stay out until an anecdote is verified.

---

## 6. Class, weapon and term ledger

### 6.1 Class lines (common names with historical flavour)

Each row is a three-tier line (DESIGN §6.2). Flavour names are shown in the Codex and through the *Class names* setting. A flavour name marked **game label** is not attested in the texts read (UNV-19).

| ID | Line (Tier I / II / III) | Historical flavour (I / II / III) | Anchor in the sources | Caveat | Confidence | Checked |
|---|---|---|---|---|---|---|
| `CLS-LORD` | Young Lord / Lord / Sovereign | *Fata* (game label) / *Amir* / *Sultan* | *Amir* is used throughout; Ibn Shaddad styles Saladin "the Sultan" | The dates of the Lord and Sovereign rank events are to be sourced | Attested (Amir, Sultan) / Fictional (Fata) | PD |
| `CLS-SOLDIER` | Soldier / Man-at-Arms / Bulwark | *Jundi* / *Ghulam Guard* / Amir of the Guard (game label) | *Jundi* is the ordinary word for soldier; Ibn Shaddad speaks of Saladin's and Nur ad-Din's *mamluks* (slave-soldiers) | "Levy" is a game sense; *ghulam* is not in the texts read | Attested (terms) / Inferred (roles) | PD (mamluks) / — |
| `CLS-PIKE` | Pikeman / Spear Knight / Pike Marshal | Kurdish Spearman / *Muqaddam* / Kurdish Amir (game label) | Kurdish emirs and troops throughout (Rawadiya, Hakkari); *muqaddam* appears as a title or surname (Ibn al-Muqaddam); lances throughout Ibn Shaddad | The "spearman" specialisation is a game choice | Attested (people, term) / Inferred (role) | PD |
| `CLS-SWORD` | Swordsman / Blademaster / Legend | *Jundi* swordsman (game label) / *Faris* / *Faris al-Muslimin* | *Faris* is used as an honorific: Dirgham was called *Faris al-Muslimin* (Ibn Khallikan), and a fleet commander al-Faris Badran (Ibn Shaddad); Saladin's own sabre at Hattin | The sword line has no direct class in the sources | Attested (honorifics) / Inferred (line) | PD |
| `CLS-AXE` | Axeman / Axe Knight / Warlord | axe-bearer (game label) / halberdier / Amir (game label) | Shirkuh's halberd (Ibn Khallikan); Frankish halberds at the Jaffa breach (Ibn Shaddad) | The axe-bearer (*tabardar*) office is not attested in the texts read | Attested (halberd) / Inferred (line) | PD |
| `CLS-BOW` | Archer / Marksman / Master Archer | bowman / game labels | "Marksmen posted in front" at Arsuf; an army "very strong in bowmen" at Jerusalem | | Attested (role) | PD |
| `CLS-HORSEARCHER` | Horse Archer / Horse Marksman / Steppe Lord | Turkmen Horse Archer / *Furusiyya* Master (game label) / Turkmen Amir (game label) | Turkoman emirs and "the Turkoman's Well" appear in Ibn Shaddad; mounted archery as the Turkic speciality is general knowledge, to be sourced | The *furusiyya* literature is a medieval Arabic tradition, to be sourced | Attested (people) / Inferred (role) | PD (names) |
| `CLS-CAVALRY` | Horseman / Mounted Knight / Cavalry Marshal | Mamluk Cavalry / *Faris* / *Amir* | Mamluks and knights throughout Ibn Shaddad; *faris* as above | | Attested | PD |
| `CLS-CROSSBOW` | Crossbowman / Arbalester / Crossbow Master | arbalist (Ibn Shaddad's translation) / game labels | Frankish arbalists at Damietta, Acre and Arsuf (CH-11.E3) | | Attested | PD |
| `CLS-SKIRMISH` | Skirmisher / Harrier / Vanguard | light-armed trooper / game labels | "Light cavalry" and "light-armed troops" in Ibn Shaddad; the hired Arab brigands at Acre (CH-10.E9) | | Attested (role) | PD |
| `CLS-FIRE` | Fire Thrower / Fire Master / Master of Flames | *Naffat* / game labels | "Throwers of naphtha"; the Damascene caldron-maker; naphtha on the ram at Acre | | Attested | PD |
| `CLS-ENGINEER` | Sapper / Engineer / Master Engineer | *Najjar* (carpenter, from the brief) and *naqqab* (miner) / *Muhandis* (game label) / game label | Miners, masons and workmen at Ascalon, Jerusalem and Jaffa; mangonel crews | The attested sapper term is *naqqab* | Attested (roles) / Inferred (names) | PD |
| `CLS-MEDIC` | Healer / Physician / Master Physician | *Tabib* / *Hakim* (game label) / chief physician | Saladin's physicians, including his chief physician, appear repeatedly | | Attested (role) | PD |
| `CLS-SCRIBE` | Scribe / Counselor / Vizier | *Katib* / *Qadi* / *Wazir* | Imad ad-Din "the scribe"; Ibn Shaddad "judge of the army"; al-Qadi al-Fadil called vizier | | Attested | PD |

### 6.2 Weapon types

Ten types (DESIGN §5.3). Anchors say what the texts read actually mention.

| ID | Type | Anchor in the sources | Caveat | Confidence | Checked |
|---|---|---|---|---|---|
| `WPN-SPEAR` | Spear (including the lance) | Lances and spears throughout Ibn Shaddad (for example IS-PPTS pp. 192, 298, 364, 374) | | Attested | PD |
| `WPN-SABRE` | Sabre | Saladin's sabre at Hattin (IS-PPTS p. 114); swords throughout | Curved or straight blades are not specified | Attested | PD |
| `WPN-MACE` | Mace | none found in the texts read | The mace is a standard Turkic and Persian arm in general knowledge, to be sourced (UNV-18) | Inferred | — |
| `WPN-AXE` | Axe and halberd | Shirkuh's halberd (IKh-dS I p. 244); Frankish halberds at the Jaffa breach (IS-PPTS pp. 364–365) | The battle-axe (*tabar*, *tabarzin*) is not attested in the texts read (UNV-18) | Attested (halberd) / Inferred (axe) | PD |
| `WPN-DAGGER` | Dagger | The Acre brigands' daggers (IS-PPTS pp. 254, 304); the daggers that killed Conrad of Montferrat (p. 332) | | Attested | PD |
| `WPN-BOW` | Bow | Bowmen and arrows throughout; "marksmen posted in front" at Arsuf (p. 282); a bowman-strong army at Jerusalem (p. 118) | The composite bow is not named in the texts read | Attested | PD |
| `WPN-CROSSBOW` | Crossbow (arbalest) | Frankish arbalists brought to Damietta (p. 56 and the editor's note), "great arbalists" at Arsuf (pp. 282, 284), arbalists at Acre and Jaffa (pp. 204, 214, 236, 256, 362) | | Attested | PD |
| `WPN-JAVELIN` | Javelin (thrown spear) | The mounted game *dirda* (a dart or javelin game) in which Ayyub fell (IS-PPTS p. 64 and its note); "a shower of darts" at the siege of Acre (p. 230) | Military javelin use is not attested in the texts read (UNV-18) | Inferred | PD (partial) |
| `WPN-FIRE` | Fire (naphtha) | Throwers of naphtha; the caldron-maker's pots; naphtha on the ram (IS-PPTS pp. 176, 178–179, 216) | | Attested | PD |
| `WPN-REMEDY` | Remedy | Saladin's physicians and their treatments (IS-PPTS pp. 30, 401–402) | | Attested | PD |

### 6.3 Terms

The terms *atabeg*, *iqta'* (revenue assignment for service), *khutba*, *wazir/vizier*, *dizdar* (castle warden) and *shihna* (governor) are all attested in the texts read, and each gets a Codex entry (§7).

---

## 7. Codex ledger (vertical slice)

Entries unlock by chapter. All entries carry their confidence badge and sources. "Differ" entries show each source's position.

| ID | Entry | Unlocks | Confidence | Sources | Notes |
|---|---|---|---|---|---|
| `CDX-P-SALAH` | Salah ad-Din | CH-00 | Attested | IS, IKh | birth 532 AH; genealogy note |
| `CDX-P-AYYUB` | Najm ad-Din Ayyub | CH-00 | Attested | IKh, IS | |
| `CDX-P-SHIRKUH` | Asad ad-Din Shirkuh | CH-00 | Attested | IKh, IS | the name means "lion of the mountain" |
| `CDX-P-ZENGI` | Imad ad-Din Zengi | CH-00 | Attested | IKh | |
| `CDX-P-BIHRUZ` | Mujahid ad-Din Bihruz | CH-00 | Attested | IKh | |
| `CDX-P-QARAJA` | Qaraja as-Saqi | CH-00 | Attested | IKh | the Caliph's ally; treated fairly |
| `CDX-P-USAMA` | Usama ibn Munqidh | CH-00 | Attested | IKh | witness |
| `CDX-P-NURADDIN` | Nur ad-Din Mahmud | CH-01 | Attested | IKh, IS | |
| `CDX-P-ABAQ` | Mujir ad-Din Abaq | CH-01 | Attested | IKh | |
| `CDX-P-SILAFI` | al-Hafiz al-Silafi | CH-02 | Attested | IS, IKh | |
| `CDX-P-SHAWAR` | Shawar | CH-02 | Attested | IS, IKh | |
| `CDX-P-AMALRIC` | Amalric I | CH-02 | Attested | WT (Frankish) | labelled Frankish side |
| `CDX-P-ISA` | Isa al-Hakkari | CH-03 | Attested | IKh | |
| `CDX-P-TURANSHAH` | Turan-Shah | CH-03 | Attested | IKh, IS | |
| `CDX-P-ADID` | al-Adid | CH-03 | Attested | IKh, IS | |
| `CDX-P-MUTAMIN` | Mu'tamin al-Khilafa | CH-03 | **Attested, sources differ** | IAT, MQ, Lev | disputed |
| `CDX-L-TIKRIT` | Tikrit | CH-00 | Attested | IS, IKh | |
| `CDX-L-BAALBEK` | Baalbek | CH-00 | Attested | IKh | |
| `CDX-L-DAMASCUS` | Damascus and the Ghouta | CH-01 | Attested | IKh | |
| `CDX-L-ALEXANDRIA` | Alexandria | CH-02 | Attested | IKh, IS | |
| `CDX-L-CAIRO` | Cairo: Bayn al-Qasrayn | CH-03 | Attested | IAT, MQ (not read) | |
| `CDX-L-DAMIETTA` | Damietta | CH-03 | Attested | IS, IKh | |
| `CDX-E-TIKRIT1132` | The clash at Tikrit | CH-00 | Attested | IKh (IAT, Usama) | |
| `CDX-E-EXILE` | The exile from Tikrit | CH-00 | **Attested, sources differ** | IKh, IAT | |
| `CDX-E-DAMASCUS1154` | Nur ad-Din takes Damascus | CH-01 | Attested | IKh | |
| `CDX-E-ALEXANDRIA1167` | Saladin at Alexandria | CH-02 | **Attested, sources differ** | IKh, IS | |
| `CDX-E-SHAWAR1169` | The fall of Shawar | CH-03 | **Attested, sources differ** | IS, IKh | |
| `CDX-E-SUCCESSION` | The succession of 1169 | CH-03 | Attested (partisan source) | IKh (IAT) | |
| `CDX-E-UPRISING1169` | The uprising of the Fatimid regiments | CH-03 | **Attested, sources differ** | IAT, MQ, Lev | with content note |
| `CDX-E-DAMIETTA1169` | The siege of Damietta | CH-03 | **Attested, sources differ** | IS, IKh, WT | chronology |
| `CDX-T-ATABEG` | Atabeg | CH-00 | Attested | IKh | |
| `CDX-T-IQTA` | Iqta' | CH-00 | Attested | IKh, IS | explains the promotion item |
| `CDX-T-DIZDAR` | Dizdar / shihna | CH-00 | Attested | IKh | |
| `CDX-T-KHUTBA` | Khutba | CH-03 | Attested | IS, IKh | |
| `CDX-T-WAZIR` | Vizier (wazir) of Egypt | CH-02 | Attested | IS, IKh | |
| `CDX-T-NAFFAT` | Naffat (the Fire Thrower's flavour name) | CH-02 | Attested | IS | |
| `CDX-T-HALBERD` | Shirkuh's halberd | CH-00 | Attested | IKh | Axe Knight flavour |
| `CDX-T-CROSSBOW` | Arbalists | CH-02 | Attested | IS | Crossbow line anchor |
| `CDX-S-EXPEDITION-DATES` | First Egyptian expedition: 558 or 559 AH? | CH-02 | **Attested, sources differ** | IS vs IKh (al-Silafi) | |
| `CDX-S-BIRTHNIGHT` | "The night of his birth": who says so? | CH-00 | **Attested, sources differ** | IKh vs IS | the tradition is Ibn Khallikan's |
| `CDX-S-QUARREL` | Who did Shirkuh kill, and why? | CH-00 | **Attested, sources differ** | IKh I vs IKh IV (IAT) | |
| `CDX-S-GENEALOGY` | Kurdish roots or Arab descent? | CH-00 | **Attested, sources differ** | IKh | |
| `CDX-S-SHAWAR` | Who seized Shawar? | CH-03 | **Attested, sources differ** | IS vs IKh notes | |
| `CDX-S-SHIRKUH-DEATH` | The death of Shirkuh | CH-03 | **Attested, sources differ** | IS, IKh | day and cause |
| `CDX-S-BABAIN` | Where was al-Babain? | CH-02 | **Attested, sources differ** | IKh vs summaries | |
| `CDX-S-GUIDE` | Reading the sources: who wrote what, and why | CH-00 | Attested | register in §2 | Ibn Shaddad's eyewitness window begins in 1188; Ibn al-Athir's Zengid sympathies |
| `CDX-G-CH00` | Game vs History: Prologue | CH-00 | n/a | CH-00.E4 | the pursuit skirmish; the Recruit; compressed timeline |
| `CDX-G-CH01` | Game vs History: Damascus | CH-01 | n/a | CH-01.E2, E7 | the fighting is invented; Maydan drills |
| `CDX-G-CH02` | Game vs History: Alexandria | CH-02 | n/a | CH-02.E10 | militia mechanic; waves; stretch-map feigned retreat |
| `CDX-G-CH03` | Game vs History: The Vizier | CH-03 | n/a | CH-03.E8 | council scenes; the night streets; how the uprising is framed |

---

## 8. Calendar and date checks

Pre-1582 dates in modern scholarship are **Julian-calendar** dates. Hijri dates can differ by a day from a purely tabular calculation, and the editors of the 1897 translation converted dates by hand with occasional off-by-one errors. **Display rule (D-002):** show the AH date and the Julian month and year; show the day of the month only when a source's weekday agrees with the conversion.

| Event | AH date and weekday (source) | Conventional Julian date | Weekday check | Verdict for display |
|---|---|---|---|---|
| Clash at Tikrit | Thu 12 Rabi' II 526 (IKh) | 2 Mar 1132 | 2 Mar 1132 is a **Wednesday** | month and year only |
| Baalbek taken | 14 Safar 534 (Usama via IKh) | 10 Oct 1139 | n/a | month and year |
| Damascus taken | **Sun 9 Safar 549** (IKh) | 25 Apr 1154 | ✓ Sunday | day shown |
| Shirkuh leaves Egypt | 24 Dhu'l-Hijja 559 (IKh) | 12 Nov 1164 | n/a | month and year |
| Shawar seized | **Sat 17 Rabi' II 564** (IKh, IS) | 18 Jan 1169 | ✓ Saturday | day shown |
| Shirkuh dies | **Sun 22 Jumada II 564** (IS, IKh) | 23 Mar 1169 | ✓ Sunday | day shown (alternatives 23rd, 28th noted) |
| al-Adid dies | **Mon 10 Muharram 567** (IS, IKh) | 13 Sept 1171 | ✓ Monday | day shown |
| Nur ad-Din dies | **Wed 11 Shawwal 569** (IS) | 15 May 1174 | ✓ Wednesday | day shown |
| Saladin enters Damascus | Tue 30 Rabi' II 570 (IS) | 27–28 Nov 1174 | 28 Nov 1174 is a Thursday | month and year |
| Horns of Hama | 19 Ramadan 570 (IS) | 13 Apr 1175 | n/a | month and year |
| Tell al-Sultan | **Thu 10 Shawwal 571** (IS) | 22 Apr 1176 | ✓ Thursday | day shown |
| Montgisard | no AH weekday | 25 Nov 1177 (Frankish dating; a Friday) | n/a | month and year |
| Hattin | Sat 24 Rabi' II 583 (conventional) | 4 Jul 1187 | ✓ Saturday (the 1897 editors' conversion is a day early) | day shown |
| Jerusalem | **Fri 27 Rajab 583** (IS) | 2 Oct 1187 | ✓ Friday | day shown |
| Treaty of Ramla | **Wed 22 Sha'ban 588** (IS) | 2 Sept 1192 | ✓ Wednesday | day shown |
| Saladin dies | Wed 27 Safar 589 (IS) | 4 Mar 1193 (conventional) | **4 Mar 1193 is a Thursday**; 3 Mar is the Wednesday; IS's own weekdays (Sat 16 Safar → Wed 27 Safar) agree with 3 Mar | "27 Safar 589 AH, early March 1193" |

Method: tabular Islamic calendar → Julian date and weekday, checked against each source's weekday. Method and results are in §11.

---

## 9. Excluded material

Legends and later inventions that the game does not present as history. Some may appear in the Codex as clearly labelled "legend" entries.

| ID | Item | Why excluded | Basis |
|---|---|---|---|
| `EXC-01` | Saladin knighted by a Frankish lord (the *Ordene de Chevalerie* tale) | A 13th-century Western literary legend; no Arabic source | general scholarship; verify the citation before any Codex use |
| `EXC-02` | Walter Scott's *The Talisman* scenes (the sword and the silk cushion; Saladin as a disguised physician) | Fiction | general knowledge |
| `EXC-03` | A face-to-face meeting or duel of Saladin and Richard | Negotiations ran through envoys and al-Adil; no source records a meeting | IS-PPTS pp. 324–325, 378–390 (PD); modern consensus not verified here |
| `EXC-04` | The 1920 "Saladin, we have returned" remark at his tomb | Twentieth-century anecdote | general knowledge |
| `EXC-05` | The Masyaf dagger-on-the-pillow story | Late legend; Ibn Shaddad records the attempt at Azaz and, separately, the dagger murder of Conrad of Montferrat (CH-12.E6) | IS-PPTS pp. 74, 332 (PD) |
| `EXC-06` | The shroud-as-banner deathbed legend | Absent from the eyewitness account of the last illness | IS-PPTS pp. 400–406 (PD) |
| `EXC-07` | Cinematic inventions (for example, Balian as a blacksmith) | Not from sources | n/a |
| `EXC-08` | "Saladin never smiled after…" and similar character shorthand | No source | n/a |
| `EXC-09` | Richard receiving two horses from Saladin or al-Adil at Jaffa | Frankish accounts only; **not in Ibn Shaddad's account** | IS-PPTS pp. 372–376 (PD, absence); `SRC-ITIN`, `SRC-AMB` not read |

---

## 10. Unverified items (kept out of the main story)

| ID | Item | Why unverified | Next step |
|---|---|---|---|
| `UNV-01` | The victim of Shirkuh's quarrel at Tikrit being "a Christian scribe" | The texts read say "a man" or "the *isfahsalar* who insulted a woman" | check IAT's *Kamil*, Ibn Wasil |
| `UNV-02` | Ayyub's and the young Saladin's roles in the 1148 siege of Damascus | not read | Ibn al-Qalanisi |
| `UNV-03` | Who opened which gate at Damascus in April 1154, and how Ayyub and Shirkuh negotiated | only outlines seen | IAT, Ibn al-Qalanisi, Abu Shama |
| `UNV-04` | When al-Qadi al-Fadil first met Saladin | not found in texts read | Abu Shama; `MOD-LEV` |
| `UNV-05` | Any contemporary description of Saladin's appearance | none found; sprites and portraits are generic | n/a |
| `UNV-06` | Army sizes at Babain, Hattin, Acre, Arsuf | sources inflate or conflict | omitted |
| `UNV-07` | Details of the Mu'tamin letter and its discovery | modern scholarship doubts the account | IAT, Abu Shama, Maqrizi, `MOD-LEV` |
| `UNV-08` | Turan-Shah's arrival date relative to the August 1169 uprising | IAT places it "when the Franks gathered"; web summaries place it before the uprising | IAT *Kamil*, Abu Shama |
| `UNV-09` | The Frankish negotiators at Alexandria in 1167 and details of the terms | Frankish source not read | William of Tyre XIX |
| `UNV-10` | Qaraqush's role in the 1169 succession | seen only in a web summary | IAT, Abu Shama |
| `UNV-11` | Nur ad-Din's polo habits and Saladin's training | not verified | Ibn al-Athir; Ibn Khallikan's Nur ad-Din entry (rest) |
| `UNV-12` | Ayyub's birth year | none found | n/a |
| `UNV-13` | Who led the Muslim force at Cresson (1 May 1187): the 1897 editor's note says al-Afdal | modern accounts differ | Imad, IAT; `MOD-LYONS-JACKSON` |
| `UNV-14` | Exact day of Ayyub's accident and death (31 July / 9 Aug 1173) | only web summaries | IKh I p. 246 |
| `UNV-15` | The "feigned retreat" at Babain and Saladin's centre command | modern reconstruction; not in IS | IAT, William of Tyre, `MOD-LYONS-JACKSON` |
| `UNV-16` | The date of Saladin's investiture (26 March 1169) | web summary of the surviving diploma | `SRC-QF`, `MOD-LEV` |
| `UNV-18` | The mace (Arabic *dabbus*), the battle-axe (*tabar* or *tabarzin*) and the javelin as military weapons of the period and region | not found in the texts read (Ibn Shaddad has halberds, lances, sabres, daggers and arbalists, but no mace or javelin) | Usama's *I'tibar*; Ibn Wasil; a modern military study |
| `UNV-19` | The flavour names marked as game labels (*Fata*, *Furusiyya Master*, *Hakim*, and the Tier III names) | invented for the game | none: they stay flagged as game labels |
| `UNV-17` | Yellow as the Ayyubid banner colour (and the colours given to other factions in the art palette) | a widely repeated tradition; not found in the texts read | check Ibn Shaddad (Richards) and the Itinerarium; until then, art direction only |

---

## 11. Verification log (what was actually done)

### 11.1 Method

1. Web searches to locate leads and public-domain texts. These are **finding aids only**.
2. Downloaded the full text of the public-domain **1897 translation of Ibn Shaddad** and **de Slane's translation of Ibn Khallikan**, then read the passages cited in this ledger in the actual text rather than in summaries: for Ibn Shaddad, the birth and early life, the Egyptian expeditions and vizierate, the deaths of Ayyub and Nur ad-Din, Damascus 1174, Hama and Azaz, the character chapters, Hattin, Jerusalem, selected Acre passages, Ascalon, Jaffa, Ramla and the last illness; for Ibn Khallikan, the Saladin entry (vol. IV), the Ayyub and Shirkuh entries (vol. I) and the Nur ad-Din entry (vol. III). Chapters on Arsuf, the Acre hostages and the Years of Patience were **not** read.
3. Cross-checked every cited date against the **weekday** the source gives, using a tabular Islamic calendar converted to the Julian calendar (§8).
4. Tried to read Ibn al-Qalanisi (Gibb): the copy on archive.org is lending-only and returned an authorization error; I did **not** work around it.
5. **2026-10-06 update:** searched the Ibn Shaddad text for weapon and armour terms to anchor the added weapon types (§6.2) and read the passages on the Acre brigands, Arsuf, Jaffa and the murder of Conrad.

### 11.2 Discrepancies found

| # | Finding | Where |
|---|---|---|
| 1 | The first Egyptian expedition is dated **558 AH** by Ibn Shaddad and **559 AH** by Ibn Khallikan, who argues from al-Silafi, an eyewitness | CH-02.E2 |
| 2 | "Born on the night they left Tikrit" is **Ibn Khallikan's** report of a family tradition, **not Ibn Shaddad's** (as some summaries say) | CH-00.E7 |
| 3 | The victim of Shirkuh's quarrel: "a man" (IAT) versus "the *isfahsalar* who insulted a woman" (IKh, Ayyub entry); "a Christian scribe" is unsupported in the texts read | CH-00.E5 |
| 4 | Shirkuh's day of death: 22nd, 23rd or 28th Jumada II 564 | CH-03.E4 |
| 5 | Shawar's seizure: Saladin alone (IS) versus Saladin with Jurdik while Shirkuh was elsewhere (IKh notes) | CH-03.E3 |
| 6 | Ibn Shaddad places the Damietta siege and Nur ad-Din's Kerak diversion in 1170 (565 AH); modern scholarship dates the siege Oct–Dec 1169. The 1897 editors repeat 1170 | CH-03.E10 |
| 7 | Babain's location: near Ushmunayn (IKh) versus Giza (some summaries) | CH-02.E6 |
| 8 | The council in Egypt: Ayyub rebukes Taqi ad-Din (IAT) versus Saladin says he alone opposed revolt (IS) | CH-04.E5 |
| 9 | Ibn Shaddad's text, as translated, gives the **same date** (7 Safar 570) for al-Kanz's defeat and for the Frankish naval attack on Alexandria; modern accounts (the Sicilian expedition) date the attack to late July–early August 1174 (WEB) | CH-05 (to resolve) |
| 10 | Saladin's death date: Wednesday 27 Safar 589 does not match Thursday 4 March 1193 (Julian); it matches 3 March | CH-FIN.E9, §8 |
| 11 | The 1897 editors' Hijri–Julian conversions are off by a day in places (e.g., the days of Hattin) | §8 |
| 12 | The "feigned retreat at Babain" and "two horses at Jaffa" are **not in Ibn Shaddad**; the first is a modern reconstruction, the second Frankish only | UNV-15, EXC-09 |

### 11.3 Not yet done (to complete before each chapter is built)

- Read **Ibn al-Athir's *Kamil*** and **Imad ad-Din** directly (Richards and Gabrieli translations), and **Abu Shama** for 1164–70.
- Collate the sources on **Damascus 1154**, the **uprising of 1169**, the **terms at Jerusalem**, Hattin's day-by-day and the **Acre hostages**.
- Verify the modern references in §2.4 and add exact citations.
- Re-read all PD page numbers against print.

### 11.4 Working rules going forward

- A claim enters a chapter's main story only if its row is **PD-checked** or checked against a primary source of equal standing.
- Rows marked **WEB** or **—** may appear only as inferred or dramatized elements and are flagged accordingly.
- Any new anecdote requires a ledger row before it appears in a script.
