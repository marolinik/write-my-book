# Prilagođavanje piscu: kako aplikacija da nauči kako pisac radi

*Istraživanje, 23. 9. 2026. Bez koda. Dokazi: `tmp-audit/WRITER-PATTERNS-EVIDENCE.md` (tvoji stvarni podaci, 3 knjige, ~34 sata aktivnosti) i današnja merenja Jev sudova.*

---

## Kratak odgovor

Da, i to je verovatno najjača stvar koju proizvod može da uradi. Ali ne onako kako zvuči na prvu loptu.

„Kako pisac radi" ima dva sloja, i samo jedan od njih je posao za Jev:

| Sloj | Primer | Čime se meri |
|---|---|---|
| **Ponašanje** — šta pisac radi | radi noću; prihvata zanatske primedbe, odbija tvrdnje o svetu priče; beta izveštaje ne čita | **Brojanje.** Vreme, redosled, stope po kategoriji. Za ovo ne treba nikakav model, i ne treba ga koristiti — brojevi su tačni, sud nije. |
| **Značenje** — zašto to radi | „ovo sam ti već objasnio, to su dva različita predmeta"; „greška je u Bibliji, ne u rukopisu" | **Jev**, jer je signal tekst: poruke u nitima, sopstvene izmene posle nalaza, ručno izmenjeni dokumenti. |

Današnja lekcija (vidi `memory/jev-judging-lessons`) važi i ovde: **sud je dobar koliko dokaz koji mu daš, i pitanje mora imati odgovor u tekstu.** „Kakav je ovo pisac?" nema odgovor. „Da li ova poruka brani namernu odluku?" ima.

---

## Šta tvoji podaci pokazuju (sa brojevima)

1. **Ne pišeš ovde, uređuješ ovde.** 26 od 28 poglavlja uvezeno odjednom; 0 sesija pisanja poglavlja.
2. **Radiš noću, u kratkim sesijama.** 71% sesija počinje 22–02h.
3. **Pokreneš, pa pregledaš — ne ćaskaš.** 118 sesija, 1 tvoja poruka („prihvati sve").
4. **Jedno poglavlje u krugu.** Dev-edit na pogl. 1→4 na ~11 min, primena medijana 6.4 min posle.
5. **Prihvataš zanat, odbijaš tvrdnje o svetu.** 6/7 primena su proza/POV/dijalog; 12/21 odbacivanja su kontinuitet/struktura. Stopa primene dev-editora: 29%.
6. **Beta izveštaj ne čitaš.** 156/157 beta nalaza netaknuto (0.6%), dev-edit 75%.
7. **Razlog ne kucaš u polje, nego ga objašnjavaš u niti.** 0 upisanih razloga; 5/5 odbacivanja kontinuiteta imala su nit.
8. **Ispravke ne drže.** Pravilo o dva predmeta sačuvano dvaput, a dev-editor ga je sutradan prekršio. (Izmereno danas: memorija *stiže* do agenta; on je ne poštuje.)
9. **Prihvatiš sve, pa odsečeš.** Restrukturiranje: „prihvati sve", pa 5 od 8 poteza poništeno u minuti.
10. **Ispravljaš dokumente koje je AI napravio** (otisak, arhitektura) i ponovo pokrećeš postavljanje.

**Upozorenje o dokazu:** ovo je jedan pisac, 34 sata. Dovoljno da se vidi *oblik* problema, nedovoljno za dan-u-nedelji ili navike. Svaka adaptacija mora da krene od razumnog podrazumevanog ponašanja i da se pomera tek sa dokazima tog pisca.

---

## Predlog: profil pisca (WriterProfile)

Jedan red po piscu × knjizi, koji se **računa**, ne pogađa, i koji pisac može da vidi i ispravi.

| Polje | Izvor | Kako | Gde menja proizvod |
|---|---|---|---|
| `mode`: piše-ovde / uređuje-uvezeno | poreklo poglavlja, sesije | brojanje | sledeći korak, početni ekran |
| `categoryApplyRate` po kategoriji | odluke o nalazima | brojanje, sa glatkim priorom (min. ~5 odluka pre nego što se pomeri) | rang u Lekturi |
| `talksToAgents` | poruke po sesiji | brojanje | da li workflow počinje pitanjima ili izveštajem |
| `readsBeta` | stopa odluka o beta nalazima | brojanje | beta kao pun spisak ili sažetak |
| `acceptsInBulk` | „prihvati sve" + brzi undo | brojanje | restrukturiranje potez-po-potez |
| `activeHours` | početak sesija | brojanje (tek posle ~2 nedelje) | kada ponuditi noćni batch |
| **pravila pisca** (postoji: `WriterMemory`) | niti, izmene | **Jev** + postojeći REMEMBER | sve (vidi P2) |

Ništa od ovoga ne zahteva model osim pravila. To je namerno.

---

## Predlozi po prioritetu

### P1 — Lektura rangirana po tome šta *ti* prihvataš *(najveći efekat, mali rizik)*
Trijaža danas meri „koliko bi ovo pomoglo čitaocu". Dodati drugu osu: **koliko ovaj pisac prihvata ovu vrstu primedbe.** Tvoj slučaj: zanat gore, tvrdnje o svetu niže (ali ne sakriveno — kontinuitet greške postoje).
- Jev: ne treba novi sud; rang = uticaj × prior po kategoriji. Politika u kodu, kao i sad.
- Mera uspeha: stopa odluka i vreme do odluke po sesiji.
- Pošteno: sa 21 odlukom prior je slab; zato glatko (Bayes) i vidljivo („rangirano i po tvojim ranijim odlukama").

### P2 — Nit postaje pravilo, i pravilo se ne duplira *(rešava „već sam ti objasnio")*
Danas REMEMBER radi samo kad ga model sam ponudi. Predlog:
1. Kad se nit završi odbacivanjem, Jev pita: *„Da li pisac u ovoj niti brani namernu odluku o svojoj knjizi?"* (Noul, dokaz = nit + nalaz). Ako da → predloži pravilo piscu jednim klikom.
2. Pre čuvanja: *„Da li ovo pravilo kaže isto što i neko postojeće?"* → spoji umesto duplikata.
3. Za primenu: trijaža već spušta nalaze u sukobu sa pravilima. **Danas sam izmerio da blokiranje pri nastanku nije dovoljno pouzdano** (tačno ponavljanje iz Prologa 0.77, ali izvorni slučaj samo 0.21) — zato *ne* blokirati, nego rangirati i označiti „ide protiv tvog pravila: …".
- Pre gradnje: izmeriti pitanje (1) na tvojih 7 niti — treba da razdvoji 5 „branim odluku" od ostalih.

### P3 — Sledeći korak iz tvog stvarnog toka, ne iz fiksne mape *(mali rizik)*
Danas „predloženo sledeće" je fiksna mapa (dev-edit → line-edit → beta). Za tebe: posle čišćenja nalaza jednog poglavlja → **dev-edit sledećeg poglavlja**; nikad „napiši poglavlje" piscu koji uvozi.
- Bez Jev. Čisto brojanje + pravilo.

### P4 — Workflow bez razgovora za pisca koji ne ćaska
118 sesija, 1 poruka. Workflow za tebe treba da krene izveštajem, ne pitanjem. Coach pita samo kad mora (kao što stavka 5 sad radi za postavljanje).

### P5 — Beta kao sažetak, ili pitati jednom
156 nepročitanih beta nalaza je šum koji zakopava sve ostalo. Za pisca koji ih ne čita: jedan sažetak po poglavlju (presuda + 3 najjače reakcije), a nalazi iza „prikaži sve". Pitati jednom: „Da li želiš beta nalaze kao spisak?"

### P6 — Restrukturiranje potez po potez
Za pisca koji „prihvati sve pa poništi": ponuditi pojedinačne poteze umesto „prihvati sve".

### P7 — Ručno ispravljen dokument je autoritet
Ako je pisac ručno menjao otisak/arhitekturu, ponovno postavljanje ga ne sme pregaziti bez upozorenja.

### P8 — Noćni batch *(čeka dokaze)*
Kad `activeHours` ima dve nedelje podataka: na kraju kasne sesije ponuditi da teški prolazi (lektura cele knjige) rade preko noći.

---

## Šta ne raditi

- **Ne izvlačiti „tip pisca" ili ličnost.** Nema odgovora u tekstu, i piscu je neprijatno.
- **Ne prilagođavati nevidljivo.** Svaka promena ponašanja mora biti vidljiva („Primetio sam da beta nalaze ne otvaraš — da ih sažimam?") i poništiva. Pisac mora da zna zašto aplikacija radi drugačije nego juče.
- **Ne koristiti LLM za brojanje.** Stope, vremena i redosledi su tačni kad se izbroje.
- **Ne blokirati nalaze po pravilima** dok sud ne bude pouzdaniji (izmereno danas).

---

## Preduslov: bez ovoga se ne može meriti

Pre bilo kakve adaptacije, proizvod mora da **beleži** ponašanje. Danas ne može:
- nalaz nema `dismissedAt` (ne zna se kada je odbačen);
- potez restrukturiranja nema `undoneAt`;
- **dnevnik odluka (`EditAction`) je izgubljen** — 126 redova obrisano posle poslednjeg restarta baze, uzrok neutvrđen; kod ih ne briše;
- podešavanja nemaju istoriju;
- nema događaja „pisac je otvorio nalaz / proveo X sekundi".

Ovo je **korak 0** i jeftin je: nekoliko kolona i jedan dnevnik koji se ne briše.

---

## Kako znati da pomaže

| Mera | Danas (tvoji podaci) | Cilj |
|---|---|---|
| Stopa odluka o nalazima (dev-edit) | 75% | ↑ |
| Stopa primene dev-editora | 29% | ↑ (manje šuma, ne više poslušnosti) |
| Beta nalazi odlučeni | 0.6% | nebitno ako je sažetak pročitan |
| „Već sam ti objasnio" u nitima | 1 od 8 poruka | 0 |
| Poništenih poteza posle „prihvati sve" | 5/8 | ↓ |

---

## Predlog redosleda

1. **Korak 0** — beležiti ponašanje (`dismissedAt`, `undoneAt`, dnevnik koji se ne gubi).
2. **P2** — nit → pravilo, bez duplikata (rešava tvoj najglasniji problem; prvo izmeriti na 7 niti).
3. **P1** — rang po tvojim odlukama.
4. **P5, P3, P4** — beta sažetak, sledeći korak, workflow bez razgovora.
5. **P6, P7** — restrukturiranje i autoritet ručnih izmena.
6. **P8** — kad bude dve nedelje podataka.
