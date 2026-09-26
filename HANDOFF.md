# Mijn Thuisbar — overdracht naar Claude Code

Dit project is begonnen als een Claude.ai-artifact en wordt vanaf hier verder gebouwd in Claude Code.
Dit document geeft de nieuwe sessie (of jij zelf) alle context die nodig is om verder te gaan zonder
terug te hoeven naar het oorspronkelijke gesprek.

## Wat dit is

Een persoonlijke cocktail-app, horend bij een zelfgemaakte thuisbarcursus. Functies:

- **Voorraad** — aanvinken welke ingrediënten je in huis hebt, per categorie, met een inline
  "voeg toe"-veld per categorie (net toegevoegd — zie "Recent afgerond" hieronder).
- **Wat kan ik maken** — alle recepten, gesorteerd op wat je al kunt maken met je voorraad.
  Zoekbalk erboven.
- **Schaler** — een recept opschalen naar een gekozen aantal glazen.
- **Logboek** — eigen aantekeningen (beoordeling + notities) per gemaakte cocktail.
- **Eigen recepten** — zelf een compleet nieuw recept toevoegen (naam, familie, glas,
  ingrediënten, bereiding), dat meteen meetelt in de andere tabbladen.

## Direct starten

```bash
npm install
npm run dev
```

## Bestandsstructuur

```
index.html
src/
  main.jsx           — React entry point, rendert <ThuisbarApp />
  ThuisbarApp.jsx     — de volledige app: alle tabs, styling, logica in één component-bestand
  recipes.js          — data: INGREDIENTS, CATEGORY_ORDER, RECIPES (158 recepten)
```

Bewust als één groot component-bestand gehouden omdat het oorspronkelijk een Claude.ai-artifact
was (die moeten single-file zijn). Nu we in een normaal project zitten, mag je dit gerust
opsplitsen in aparte bestanden per tab (VoorraadTab.jsx, MakenTab.jsx, etc.) — dat was de
volgende opschoning die ik toch had willen doen.

## Belangrijke technische kanttekening: opslag

In de Claude.ai-artifactomgeving gebruikte de app een speciale `window.storage` API voor
persistente data. **Die API bestaat niet buiten Claude.ai.** Ik heb dit bij de overdracht al
vervangen door `localStorage` (zie de `useStorage`-hook bovenin `ThuisbarApp.jsx`), dus de app
werkt out-of-the-box. Let op: `localStorage` is per browser/apparaat, dus data synct niet tussen
bijvoorbeeld telefoon en laptop. Als je dat wilt, is de volgende stap een echte backend (of iets
simpels als Supabase/Firebase) in plaats van `localStorage`.

## Ontwerpsysteem — "Bar Register"

Bewust NIET de generieke SaaS-look (afgeronde kaartjes, zachte schaduwen overal). In plaats
daarvan een aesthetic die aansluit bij het onderwerp: een ouderwets bar-register / flessenboek.

Kleuren (bovenin `ThuisbarApp.jsx` als losse constanten):
- `INK` #2B2620 — lichaamstekst, warm antraciet i.p.v. puur zwart
- `PAPER` #F3ECDD — verweerd papier, achtergrond
- `PAPER_DEEP` #EAE0C9 — verdiept paneel (formulieren)
- `BOTTLE` #1F3D36 — primaire kleur, diep flessengroen
- `BRASS` #B8862E — accentkleur, messing
- `BURGUNDY` #7A2E2A — status "ontbreekt"
- `SAGE` #5C7A52 — status "maakbaar"
- `MUTED` #8A8171 — secundaire tekst
- `BORDER` #DED2B8 — dunne lijnen

Typografie: Georgia (serif) voor cocktailnamen/titels, systeem-sans voor UI. Lijst-stijl met
dunne lijntjes tussen items in plaats van losse kaartjes met schaduw — dat is het belangrijkste
visuele onderscheid t.o.v. de vorige (afgekeurde) versie.

## Data — hoe recepten werken

Elk recept in `recipes.js`:
```js
{ id: "old_fashioned", name: "Old Fashioned", family: "Spirit-forward", glass: "Rocks",
  ingredients: [
    { id: "bourbon", amount: 60, unit: "ml" },
    { id: "sugar_syrup", amount: 5, unit: "ml" },
    { id: "angostura", amount: 2, unit: "dash" }
  ],
  method: "Roer met ijs 20-30 sec in het glas zelf." }
```
`unit` is `"ml"`, `"dash"` of `"stuk"`. `optional: true` op een ingrediënt betekent dat het niet
meetelt bij het bepalen of een recept "maakbaar" is.

Eigen recepten (via de "Eigen recepten"-tab) gebruiken ingrediënten met een `name`-veld in
plaats van een `id` — matching gebeurt dan op naam (case-insensitive) in plaats van op ID. Zie
de `isOwned()`-functie in `ThuisbarApp.jsx` voor hoe beide vormen worden afgehandeld.

De 158 recepten zijn gebaseerd op de officiële IBA-cocktaillijst (International Bartenders
Association, editie 2024/2026, 102 erkende cocktails) plus een reeks andere breed erkende
klassiekers (shooters, dessert-cocktails, mocktails). Hoeveelheden zijn gebruikelijke,
standaard bartending-verhoudingen — niet letterlijk van de IBA-site gekopieerd (die geeft vaak
alleen ingrediënten, geen exacte ml's), dus behandel ze als een goede eerste versie, geen
heilige tekst.

## Recent afgerond (laatste sessie voor overdracht)

1. Recepten uitgebreid van 50 naar 158, gebaseerd op de IBA-lijst.
2. Nieuwe ingrediënten toegevoegd aan `INGREDIENTS` om die recepten te ondersteunen
   (~90 ingrediënten totaal nu).
3. "Zelf toevoegen" is per categorie gemaakt in plaats van één aparte bak onderaan — een
   ingrediënt zoals Passoa die je toevoegt bij "Likeuren & versterkte wijnen" verschijnt nu
   gewoon tussen de andere likeuren, niet in een apart hokje.
4. Node.js was nog niet geïnstalleerd op deze Mac — LTS v24.21.0 (officiële tarball van
   nodejs.org, checksum geverifieerd) staat nu in `~/.local/node`, met PATH-export in
   `~/.zshenv` zodat `node`/`npm` overal werken (ook in nieuwe Terminal-tabs).
5. Datamodel statisch gevalideerd (Python-script, geen JS-runtime nodig): 158 unieke
   recept-ids, 105 unieke ingrediënt-ids, geen ontbrekende ingrediënt-referenties, alle
   categorieën kloppen met `CATEGORY_ORDER`.
6. App end-to-end getest in de browser (dev-server via Vite): voorraad aanvinken/eigen
   ingrediënt toevoegen, "Wat kan ik maken" sortering + uitklappen, schaler, logboek-item
   toevoegen, eigen recept toevoegen — telt meteen mee in "Wat kan ik maken".
7. Bug gevonden en gefixt in de schaler: bij "stuk"/"dash" werd het meervoud (stuks/dashes)
   bepaald op basis van de ongeschaalde hoeveelheid in plaats van de geschaalde — bijv.
   "3 stuk" i.p.v. "3 stuks". Zie `SchalerTab` in `ThuisbarApp.jsx`.
9. Vier verdere aanpassingen op verzoek van de gebruiker:
   - **Winkelmandje als eigen tabblad** (`WinkelmandjeTab`) i.p.v. een paneel binnen "Wat kan
     ik maken". Elk item toont "Toegevoegd voor: [cocktail(s)]" (de reden dat het is
     toegevoegd) én live berekend "Ontgrendelt ook: [cocktails]" (andere recepten die nu nog
     maar dit ene ingrediënt missen — dezelfde logica als het Koopadvies, maar dan per item).
     Datamodel: `shoppingList`-items hebben nu een `recipes: string[]`-veld; `addToShoppingList`
     in `ThuisbarApp` merget dat veld als hetzelfde ingrediënt vanuit meerdere cocktails wordt
     toegevoegd, i.p.v. het simpelweg te skippen.
   - **Feestplanner: onbeperkt cocktails kiezen** i.p.v. vast op 3 — "+ Extra cocktail
     toevoegen" en een verwijderknop per rij (zichtbaar zodra er >1 is). De gekozen lijst
     (`chosen`) is verplaatst naar `ThuisbarApp` (`thuisbar-feest-chosen` in localStorage) zodat
     de nieuwe Feestmenu-tab er ook een menu in kan zetten.
   - **Zoekbare, alfabetische cocktailkeuze**: nieuwe gedeelde `RecipePicker`-component
     (tekstveld + `<datalist>`, zelfde patroon als de ingrediënt-autocomplete in "Eigen
     recepten") vervangt de gewone `<select>` in zowel Feestplanner als Feestmenu.
   - **Nieuwe tab "Smaakbalans"** (`SmaakbalansTab`, oorspronkelijk "Feestmenu" geheten —
     hernoemd op verzoek omdat die naam niet lekker zat, en het onderliggende idee ook is
     omgegooid). Eerste versie liet de app per rol één cocktail kiezen die je kon overschrijven;
     de gebruiker wilde liever **zelf het menu opbouwen** en er meer van leren. Nu: je zoekt en
     voegt zelf willekeurig veel cocktails toe (`smaakMenu` in `ThuisbarApp`, persistent via
     `thuisbar-smaakbalans-menu`), en de app classificeert elke toevoeging automatisch in een
     rol (`getMenuRole()`, gemapt op bestaande `family`-waarden in `MENU_ROLES`) en toont een
     live balk per rol (aantal cocktails erin). Rollen op 0 tonen meteen de "waarom dit
     belangrijk is"-tekst als zachte hint — geen automatische aanvulling, de gebruiker ontdekt
     de gaten zelf. Klikken op de rol-tag bij een cocktail in de lijst klapt diezelfde uitleg
     open (leert de indeling herkennen). Verder ongewijzigd: "efficiënt inkopen" (gedeelde
     ingrediënten tussen de gekozen cocktails) en de knop die het menu doorzet naar de
     Feestplanner (`onUseInFeestplanner` → `setFeestChosen` + tabwissel). De rollen-mapping
     bevat nu ook een `overig`-vangnet (`MENU_ROLES.overig`) voor recepten die in geen van de
     vier hoeken passen, zodat `getMenuRole()` nooit `null` teruggeeft.

   Bronnen voor de menu-principes (webonderzoek, september 2026):
   - [Provi — The Ultimate Guide to Building a Better Cocktail Menu](https://www.provi.com/resources/the-provi-guide-how-to-build-a-cocktail-menu) — de "flavor matrix" met vier hoeken.
   - [Southern Glazer's Proof — How to Build a Balanced Cocktail Menu](https://shop.sgproof.com/articles/generic-articles/how-to-build-a-balanced-cocktail-menu) — flavor matrix + basisdranken-variatie.
   - [Spec — What Every Great Cocktail Menu Has in Common](https://www.specapp.com/blog/2025/5/6/what-every-great-cocktail-menu-has-in-common) — het "B.L.E.N.D."-framework, ABV-variatie, batchen van gestirde cocktails.
   - [Thirsty Bartender — How To Plan A Cocktail Party Menu](https://thirstybartender.ca/blogs/blog/cocktail-party-menu) en [Eat Healthy 365 — How Many Drinks for a Cocktail Party?](https://eathealthy365.com/your-ultimate-guide-to-cocktail-party-drink-planning/) — vuistregels voor een housefeestje (2 drankjes/gast eerste uur, 1 per uur erna, ±16 drankjes per fles van 70cl, hou het menu klein).

   Belangrijke kanttekening: dit is algemene, publiek beschikbare menu-theorie uit
   bartending-/horeca-artikelen, niet een letterlijke cursus die ik heb ingezien — behandel de
   "waarom"-teksten in `MENU_ROLES` als een praktische samenvatting, geen citaat.
9. Twee gerichte fixes op eerder gesignaleerde tekortkomingen:
   - **Bewerkfunctie** i.p.v. alleen toevoegen/verwijderen. Eigen ingrediënten (Voorraad-tab):
     potlood-icoon naast een custom chip zet 'm in een inline tekstveld (`renameCustomIngredient`
     in `ThuisbarApp`, past alleen `name` aan, `id` blijft gelijk). Eigen recepten
     ("Eigen recepten"-tab): potlood-icoon vult het bovenste formulier met de bestaande waarden
     (`startEdit` in `EigenRecepten`), de opslaan-knop wisselt naar "Wijzigingen opslaan" en er
     verschijnt een "Annuleren"-knop; opslaan tijdens bewerken vervangt het bestaande record
     i.p.v. een nieuwe toe te voegen.
   - **Aantal flessen in voorraad**: tot nu toe was voorraad puur aan/uit, dus de Feestplanner
     nam aan dat "in bezit" ook "genoeg voor het feest" betekende. Eerste versie gebruikte een
     vol/halfvol/bijna-op-niveau (max 1 fles) — de gebruiker wees er terecht op dat dit niet
     kan uitdrukken dat je bijv. 3 flessen wodka in huis hebt. Herontworpen naar een numeriek
     `voorraadAantal`-map in `ThuisbarApp` (persistent via `thuisbar-voorraad-aantal`, default 1
     zodra je een ingrediënt aanvinkt): het aantal flessen, in stappen van 0,5 (dekt zowel
     "meerdere volle flessen" als "de laatste is aangebroken" in één getal). In de Voorraad-tab
     staat per bezit-chip een inline stepper (−/+, `adjustAantal`). Alleen de Feestplanner
     rekent hiermee: beschikbare ml = `aantal × meta.bottleMl`; is de benodigde hoeveelheid
     groter, dan komt er een regel bij zoals "1 fles in voorraad — 1 bijkopen · €15,00" i.p.v.
     simpelweg "al in voorraad" (bij >1 fles: "al in voorraad (3 flessen)"). Bewust *niet*
     doorgevoerd in de binaire `isOwned()`-check die overal elders wordt gebruikt
     (Maakbaar/Mist-status, Koopadvies, Smaakbalans) — een bijna lege fles telt daar nog gewoon
     als "ik heb dit", wat correct is voor die vraag; alleen de volumeberekening in de
     Feestplanner heeft baat bij het fijnere onderscheid. `formatAantal()` (top-level helper)
     zet het getal om naar Nederlandse notatie (bijv. `1.5` → "1,5").

   Tijdens het testen bleek de klikzone van de eerste (dots-)versie te klein — een paar keer
   werd per ongeluk de hele chip uitgevinkt in plaats van het niveau te wisselen. Ook dat loste
   vanzelf op met de nieuwe stepper (expliciete −/+ knoppen i.p.v. een kleine cyclus-tap).
10. Vier nieuwe features op verzoek van de gebruiker, allemaal client-side/localStorage
   (geen backend):
   - **Koopadvies** (`MakenTab`): telt per ontbrekend ingrediënt in hoeveel "Mist 1"-recepten
     het voorkomt en toont de top 4 ("Koop X en ontgrendel N cocktails").
   - **Boodschappenlijstje**: gedeelde state in `ThuisbarApp` (`thuisbar-shopping-list` in
     localStorage). Per recept een knop "Voeg ontbrekende toe", een paneel bovenaan
     "Wat kan ik maken" met per item een vinkje (zet in voorraad + verwijder) en een kruisje
     (alleen verwijderen). Ook gevuld vanuit de Feestplanner.
   - **Filters + "Verras me"** in `MakenTab`: filter op familie/glas/sterke-drank-basis
     (`getBaseSpirit()` pakt het eerste "Sterke drank"-ingrediënt van een recept). "Verras me"
     kiest een willekeurig maakbaar recept binnen de huidige filters en zet de zoekbalk erop.
   - **Feestplanner** (nieuwe 6e tab, `FeestplannerTab`): aantal gasten × cocktails per gast →
     kiest 3 willekeurige maakbare recepten (herschudbaar, ook los per recept aan te passen),
     verdeelt het aantal glazen, telt de benodigde hoeveelheid per ingrediënt op en rekent om
     naar aantal flessen/stuks + geschatte prijs. Alles wat al in voorraad is telt niet mee in
     het bedrag.

   Prijsdata zit in `recipes.js` als `bottleMl`/`bottlePrice` (voor flessen) of `unitPrice`
   (voor losse stuks als citroen, munt, ei) per ingrediënt, plus `PRICES_UPDATED = "2026-09"`.
   Dit zijn **richtprijzen** die ik handmatig heb opgezocht op drankdozijn.nl (spirits/likeuren/
   bitters/wijn) en met redelijke schattingen aangevuld voor supermarktproducten (sap, tonic,
   room, vers fruit) die daar niet verkocht worden — er is geen live koppeling. Werk
   `PRICES_UPDATED` bij als je de prijzen ooit handmatig ververst.

11. Grote uitbreiding op verzoek van de gebruiker (beginnend cocktailmaker, wil leren en een
    "beleving" bouwen voor vrienden/verjaardagen van ~15 man): verhaal, techniek, sfeer,
    voorbereiding en een herstructurering van Smaakbalans. Alles hieronder is client-side,
    geen backend, geen live AI — dus geen "vraag het live"-functionaliteit in de app zelf.
    - **`STORIES` in `recipes.js`**: een kort (1-3 zinnen), feitelijk oorsprongsverhaal per
      recept, voor alle 158 ingebouwde recepten (gevalideerd: elke recept-id heeft precies één
      entry, zie het validatiescript dat ik gebruikte). Bij twijfelachtige/betwiste oorsprong
      staat dat er expliciet bij ("zou zijn ontstaan...", "meerdere claimen de eer") i.p.v. één
      versie als absolute waarheid te presenteren — dit is samengevatte, algemeen bekende
      cocktailgeschiedenis, geen citaat uit één bron. Eigen (custom) recepten hebben geen
      entry; de UI toont dan een eerlijke fallback-tekst i.p.v. iets te verzinnen.
    - **Sfeer/mood**: hergebruikt de bestaande `MENU_ROLES` (Smaakbalans-indeling) i.p.v. een
      apart mood-systeem — elke rol kreeg er een `sfeer`-omschrijving en `gradient` (twee
      kleuren) bij. Geen foto's (kan de app niet genereren zonder beeld-API), wel een
      kleurverloop + sfeerzin per smaakhoek, zodat elke cocktail toch een "gevoel" oproept.
    - **Technieken automatisch afgeleid, niet handmatig getagd**: `TECHNIQUE_GUIDE` (9
      technieken met uitleg + veelgemaakte-fout-tip) en `inferTechniques(method)` — een
      keyword-parser die de bestaande Nederlandse `method`-tekst scant (bijv. "dry shake",
      "roer", "muddle", "dubbel zeven") en er techniek-tags uit haalt. Werkt daardoor ook
      automatisch voor eigen recepten, zonder dat er 158× een techniek-veld handmatig
      ingevuld hoefde te worden.
    - **Nieuwe tab "Verhaal"** (`VerhaalTab`, 7e tab): kies een cocktail → sfeer-paneel
      (kleurverloop + sfeerzin), het verhaal, klikbare techniek-tags die hun tip tonen, een
      "batch-tip" (zichtbaar als rol=sterk én techniek is uitsluitend stirred/build — dan kun
      je 'm vooraf mixen), en de ingrediënten/bereiding in rustige, grote weergave — dit is
      bewust ook de "bereidingsmodus" (rustig scherm om naast je shaker te leggen), zodat er
      geen aparte derde tab nodig was.
    - **Voorbereiding-sectie in de Feestplanner**: onder de inkooplijst een blok met een
      ijs-vuistregel (~150 g per drankje), welke glazen je moet koelen (per glastype, met
      aantal), welke "Vers"-ingrediënten je vooraf moet snijden/klaarzetten, en welke gekozen
      cocktails je vooraf kunt batchen (rol sterk + alleen stirred/build-technieken, dus geen
      vers sap/ei/muddle).
    - **Smaakbalans herstructureren**: de gebruiker gaf aan dat je pas ná het aanvinken zag in
      welke categorie een cocktail viel — niet handig. Het ene algemene zoekvak is vervangen
      door **5 aparte zoekvakken, één per smaakhoek** (`recipesByRole` filtert per rol), zodat
      je bewust binnen een categorie kiest i.p.v. achteraf ontdekt waar iets in valt.

    Bekende beperking: dit is een grote content-toevoeging (STORIES) die ik in één keer heb
    geschreven op basis van algemene kennis — behandel het als een degelijke eerste versie,
    geen absoluut historisch naslagwerk. Corrigeer gerust een verhaal als je een fout tegenkomt.

12. **STORIES flink uitgebreid (2026-09-15)** — de gebruiker vond de verhalen "1 regel" te
    dun: "iets waar je mee kan aankomen bij je gasten". Alle 158 entries in `STORIES`
    (src/recipes.js) zijn herschreven van 1 zin naar 4-6 zinnen per cocktail: ontstaansjaar
    en -plaats, een concrete anekdote/legende/bekende persoon, en vaak een expliciete
    "vertel je gasten dat..."-haak zodat de tekst direct hardop voorleesbaar is aan tafel.
    Disputen/legendes blijven gehedged ("naar verluidt", "zou zijn ontstaan", "de bronnen
    spreken elkaar tegen") — geen feiten verzonnen, wel rijker verteld. Validatie: 158
    recepten / 158 stories, 1:1 dekking, geen wees-ids in beide richtingen (zelfde
    Python-controle als bij de eerste versie). `VerhaalTab` kreeg een `maxWidth: 640` en
    `lineHeight: 1.7` op de verhaal-paragraaf voor betere leesbaarheid van de langere tekst.
    Live getest op Whiskey Sour en Zombie (langste verhaal) — layout blijft netjes.

    Zijstap tijdens het testen: `read_console_messages` bleef exact dezelfde
    `voorraadNiveau is not defined` / `NIVEAU_LABEL is not defined`-fouten tonen (met
    identieke timestamps) zelfs ná een volledige herstart van de dev-server ***en*** het
    wissen van `node_modules/.vite`. Dat bewijst definitief dat dit een vaste, historische
    buffer in de consoletool is — geen live bug. Broncode bevat sinds de niveau→aantal-
    flessen-redesign nul keer deze identifiers (herhaaldelijk gegrept). Geen actie nodig;
    dit is puur een kwirk van hoe de testtool oude entries cachet.

13. **Visuele "next level"-upgrade (2026-09-16)** — de gebruiker vroeg om een professionelere,
    luxere uitstraling en om afbeeldingen/illustraties bij de cocktails in de Verhaal-tab.
    Zonder beeldgeneratie in deze omgeving is gekozen voor een **zelfgetekend SVG-glassysteem**
    in plaats van foto's:
    - `GLASS_SHAPES` (ThuisbarApp.jsx) — handgetekende lijntekeningen voor 9 glasvormen
      (Coupe, Highball, Rocks, Hurricane, Champagneflute, Koperen beker, Wijnglas, Glazen mok,
      Julep beker), gekozen via `normalizeGlass(recipe.glass)`.
    - `inferGarnish(recipe, allIngredients)` — leidt een garnering af uit de **echte**
      ingrediënten van het recept (kers, olijf, munt, ananas/kokos, limoen, citroen,
      sinaasappel/grapefruit, of cacao/nootmuskaat-"dust" voor Zuivel & dessert/Warme dranken;
      standaard een sinaasappelschil-twist). Niets is verzonnen — glasvorm en garnering komen
      1-op-1 uit recipe-data.
    - `<GlassArt glass colors garnish mono size />` rendert dit: gevuld met de sfeerkleuren-
      gradient van de smaakhoek (kleur), of als klein monochroom lijnicoontje (`mono`) naast
      elke rij in "Wat kan ik maken". Gebruikt in de Verhaal-tab hero (groot, in kleur) en de
      receptenlijst (klein, mono) — dezelfde component, twee weergaves.
    - Werkt ook voor eigen recepten (onbekend glas → valt terug op Coupe; geen garnering-match
      → sinaasappeltwist) — getest met "Passoa Fizz", geen crash, nette fallback.

    Daarnaast een algemene stijl-upgrade:
    - **Typografie**: Playfair Display (serif, italic voor namen/koppen) + Inter (sans) via
      Google Fonts in `index.html`, vervangt Georgia/system-sans — direct een veel luxere
      uitstraling zonder verder iets aan de lay-out te veranderen.
    - **Nieuw `src/index.css`** (globale laag, niet eerder aanwezig): zachte hover/active-
      transities op alle knoppen, een goudkleurige focusring op inputs/knoppen (i.p.v. de
      blauwe browser-default), dunne custom scrollbar, en een heel subtiele papier-textuur/
      vignet op de achtergrond.
    - **Schaduw-tokens** (`SHADOW_CARD`, `SHADOW_HERO`, `SHADOW_CTA`) en `RADIUS` (8) toegevoegd
      aan de design tokens — bewust *alleen* gebruikt op uitgelichte panelen (info-boxen,
      formulier-containers, de Verhaal-hero) en primaire call-to-action-knoppen. De
      ledger-stijl lijst-rijen (Wat kan ik maken, Winkelmandje, Logboek, …) blijven bewust plat
      zonder schaduw — dat onderscheid ("dit is een uitgelicht moment" vs. "dit is een
      herhalende rij") is het hele punt van de oorspronkelijke Bar Register-stijl en is intact
      gelaten, alleen aangescherpt.
    - **Header** kreeg een radiale donkergroene vignet-achtergrond, een rond brass-omrand
      Martini-icoon, en een cursieve Playfair-titel. **Tabbalk** kreeg een lucide-icoon per
      tab (Refrigerator/Martini/ShoppingCart/Scale/Sparkles/BookOpen/PartyPopper/NotebookPen/
      FlaskConical) plus een lichte blur/schaduw omdat hij sticky is.
    - Getest: alle 9 tabs doorlopen op desktop-breedte én op mobiel (375px) — geen horizontale
      overflow, hero-panel in Verhaal stapelt netjes op mobiel, console blijft foutloos.

    Bekende beperking: de glasillustraties zijn gestileerde lijntekeningen, geen foto's of
    AI-beelden — dat kán deze omgeving niet genereren. Ze zijn bewust ontworpen om bij de
    bestaande "gegraveerde bar-menukaart"-esthetiek te passen in plaats van dat te compenseren.

14. **Receptenuitbreiding naar 214 (2026-09-16)** — de gebruiker vroeg om "alle cocktails uit
    het boek The Cocktail Bible" toe te voegen. Belangrijke kanttekening die ik ook aan de
    gebruiker heb teruggegeven: ik ken de exacte inhoudsopgave van dat specifieke boek niet
    betrouwbaar (er bestaan meerdere boeken met die titel van verschillende auteurs), en zou
    sowieso geen samengestelde, gecureerde receptenlijst uit een specifiek copyright-boek
    reproduceren. Cocktailrecepten zelf (ingrediënten + methode) zijn algemeen bekende,
    functionele feiten — geen auteursrechtelijk beschermde uitdrukking — dus in plaats daarvan
    is de app uitgebreid met **56 extra, algemeen bekende klassieke en moderne cocktails**
    (van 158 naar 214), verspreid over alle bestaande families:
    - Sours: Algonquin, Bacardi Cocktail, Kamikaze, Pink Lady, Scofflaw, Twentieth Century, Diamondback
    - Highballs: Ranch Water, Kentucky Buck, Jamaican Mule, Shandy, Presbyterian, Gin Buck
    - Spirit-forward: Toronto, Black Manhattan, Red Hook, Greenpoint, Old Pal, Oaxaca Old Fashioned, Improved Whiskey Cocktail
    - Stirred-down: Perfect Martini, Metropolitan, Journalist, Satan's Whiskers, Income Tax Cocktail, Adonis, Brooklyn
    - Fizz/Flip: Death in the Afternoon, Air Mail, French 76, Poinsettia, Seelbach
    - Modern/Tiki: Cable Car, Kingston Negroni, Fog Cutter, Rum Runner, Corn 'n Oil, Planter's Punch, Dr. Funk, Nuclear Daiquiri
    - Moderne klassiekers: Gold Rush, Brown Derby, Eastside, The Final Ward
    - Zuivel & dessert: Pink Squirrel, Nutty Irishman, Separator, B-52, Melon Ball, Bushwacker
    - Warme dranken: Hot Buttered Rum, Tom and Jerry, Mulled Wine (Glühwein)
    - Mocktail/alcoholvrij: Virgin Piña Colada, Roy Rogers, Cinderella

    Elk kreeg een volwaardig STORIES-verhaal in dezelfde uitgebreide stijl als de rest (zie
    punt 12), correct gevalideerd (214 recepten, 214 stories, 1:1 dekking, nul foutieve
    ingrediënt-referenties). Er zijn 10 nieuwe ingrediënten toegevoegd aan `INGREDIENTS` waar
    nodig: `irish_cream` (Baileys — ontbrak überhaupt nog, ook relevant voor toekomstig gebruik
    elders), `creme_de_noyaux`, `banana_liqueur`, `melon_liqueur`, `lemonade`, `milk`, `butter`,
    `cucumber`, `strawberry`, `cinnamon_stick`. Alle nieuwe glassoorten (Wijnglas, Champagneflute,
    Glazen mok, Koperen beker, …) waren al gedekt door `normalizeGlass()` uit de eerdere
    visuele upgrade, dus de glasillustraties werken direct voor alle nieuwe cocktails zonder
    verdere aanpassing.

    Getest op alle 9 tabbladen met minstens één nieuwe cocktail per tab: Voorraad (nieuwe
    ingrediënten correct per categorie), Wat kan ik maken (glasicoon + koopadvies + winkelmandje-
    knop), Winkelmandje (toegevoegde items correct), Schaler (opschalen 1→3 glazen correct
    berekend), Smaakbalans (rol-toewijzing en balansbalk correct, bijv. Nutty Irishman → Comfort),
    Verhaal (verhaal + sfeer + glas + garnering + techniek, bijv. Fog Cutter), Feestplanner
    (inkooplijst met nieuwe ingrediëntprijzen + voorbereidingssectie), Logboek (216 opties in
    dropdown = 215 recepten + "eigen creatie"), Eigen recepten (116 ingrediënten in datalist).
    Geen crashes, geen ontbrekende afbeeldingen/iconen.

## Nog te doen / ideeën voor vervolg

- [ ] Overwegen: `recipes.js` opsplitsen per familie (sours.js, highballs.js, ...) nu het
      bestand groot wordt (500+ regels).
- [ ] `ThuisbarApp.jsx` opsplitsen in losse componentbestanden (nu ~1500 regels in één file).
- [ ] Verder aanvullen richting nog meer recepten — 214 is een gedegen stap richting de
      eerder genoemde 250, geen eindpunt.
- [ ] Mogelijk: exportknop voor het logboek (bijv. als JSON of CSV-download).
- [ ] Mogelijk: sync tussen apparaten (zie kanttekening over `localStorage` hierboven).
- [ ] Als de gebruiker de app permanent op zijn telefoon wil zonder dat de eigen laptop hoeft
      te draaien: overwegen om te deployen naar een gratis host (Netlify/Vercel/Cloudflare
      Pages) zodat er een echte, altijd-bereikbare URL is in plaats van een lokaal IP-adres.
      Dat is de laatste stap richting "voelt als een echte app" die ik nog niet heb gedaan
      omdat het een hostingkeuze van de gebruiker vereist.

15. **App-branding / PWA-polish (2026-09-16)** — de gebruiker gaf aan dat de app "als een
    echte app moet voelen en niet speciaal voor mij gemaakt". Kernprobleem: er was geen
    favicon, geen app-icoon, geen web-manifest — de browser toonde een generiek/leeg
    tabblad-icoon en "Toevoegen aan beginscherm" op de telefoon gaf een screenshot-achtig
    icoon in plaats van een eigen logo. Opgelost met een volledig eigen (niet-AI, geen
    bestaand personage) merkicoon — een lijntekening van een martiniglas in een cirkel,
    in dezelfde bottle-green/brass-kleuren als de rest van de app, consistent met het
    bestaande rondje-icoon in de header:
    - `public/favicon.svg` — het brongrafiek (vector, rechtstreeks bruikbaar als moderne
      browser-favicon).
    - Gerasterd naar PNG met macOS' ingebouwde `qlmanage -t` (QuickLook-thumbnailer kan SVG
      renderen; geen extra dependency nodig) + `sips` voor de resizes: `favicon-32.png`,
      `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`.
    - `public/manifest.json` toegevoegd — naam, iconen, `theme_color` (#1F3D36),
      `background_color` (#F3ECDD), `display: "standalone"` — dit zorgt dat "Toevoegen aan
      beginscherm" op iPhone/Android de app zonder browserbalk opent, met eigen icoon en
      eigen laadkleur, net als een geïnstalleerde app.
    - `index.html` kreeg de bijbehorende `<link>`/`<meta>`-tags (icon, apple-touch-icon,
      manifest, theme-color, apple-mobile-web-app-*, en een `<meta name="description">`).

    Getest: alle icoon-bestanden en het manifest laden met status 200 vanaf de dev-server;
    het gerenderde icoon is gecontroleerd en ziet er scherp en consistent uit op alle
    formaten. "Toevoegen aan beginscherm" zelf kan ik niet vanuit deze omgeving simuleren —
    vraag de gebruiker dit op zijn eigen telefoon te testen (Safari → deelknop → "Zet op
    beginscherm") om te bevestigen dat het icoon en de naam goed verschijnen.

    Nog niet opgelost (zie ook de losse to-do hierboven): de app draait nog altijd op het
    lokale IP-adres van de laptop van de gebruiker, niet op een eigen domein — dat is de
    resterende reden waarom het nog niet 100% als een "onafhankelijke" app aanvoelt. Een
    gratis deploy (Netlify/Vercel) zou dat oplossen, maar is een aparte keuze die ik niet
    zonder overleg heb doorgevoerd.

16. **Cursus-tab met toetssysteem (2026-09-16)** — de gebruiker vroeg eerst om een uitgebreide,
    op zichzelf staande cursus ("waardig voor €1000") als PDF, en daarna om diezelfde cursus
    als lessenstructuur + toetsen in de app te verwerken. Beide zijn volledig eigen geschreven
    op basis van algemene, vakgebied-brede bartending-kennis (geschiedenis, techniek,
    ingrediëntenleer) — niets is overgenomen uit een bestaand boek of bestaande cursus.
    - **PDF-versie**: `cursus/cursus.html` → `cursus/Van-Basis-tot-Pro-Thuisbar-Cursus.pdf`
      (55 pagina's, A4, Bar Register-huisstijl), gegenereerd met headless Chrome
      (`--print-to-pdf`, geen extra dependency nodig — macOS had geen pandoc/wkhtmltopdf maar
      wél Chrome al geïnstalleerd). Puur een op-zichzelf-staand naslagdocument, niet gekoppeld
      aan de app-code.
    - **In-app versie**: nieuw bestand `src/course.js` met `COURSE_PARTS` (5 delen) en
      `COURSE_LESSONS` (20 lessen, elk met `blocks[]` — een klein eigen "content-blok"-systeem
      met types `h3`/`p`/`table`/`box` — plus `takeaways[]` en `quiz[]` met 4
      meerkeuzevragen per les, elk met `explain`-toelichting).
    - Nieuwe **Cursus-tab** in `ThuisbarApp.jsx` (GraduationCap-icoon): een overzicht
      gegroepeerd per deel met per les een statuscirkel (nummer → groen vinkje na voltooien)
      en beste score, een lesweergave (`LessonView`) die de content-blokken rendert plus een
      "Kernpunten"-box, en een toetscomponent (`QuizBlock`) die per vraag direct goed/fout
      terugkoppelt met kleur en uitleg, een eindscore toont (geslaagd vanaf 70%) en een
      "Opnieuw proberen"-knop heeft.
    - Voortgang wordt bijgehouden in `localStorage` onder `thuisbar-cursus-voortgang`
      (`{ [lessonId]: { completed, bestScore, total } }`) — een les is "voltooid" zodra de
      toets één keer is afgerond, ongeacht score; de score wordt apart getoond zodat leren
      vrijblijvend blijft in plaats van hard af te dwingen (consistent met de eerdere
      voorkeur van de gebruiker voor een vrije, niet-rigide structuur).
    - Getest: volledige flow doorlopen (les 1 lezen → toets starten → 4 vragen beantwoorden →
      controleren → 4/4 geslaagd → terug naar overzicht → voortgang correct bijgewerkt naar
      1/20 met groen vinkje en score). Ook getest op mobiel (375px) — rendert en wrapt goed.
      Alle 20 lessen × 4 vragen (80 vragen totaal) gevalideerd via een Node-script op
      structuur (4 opties, geldige correct-index).

    Bekende beperking / vervolgidee: de PDF en de in-app cursus zijn nu twee losse
    contentbronnen die handmatig gesynchroniseerd moeten blijven als er ooit iets wijzigt —
    zou op termijn samengevoegd kunnen worden tot één brondata-bestand dat beide genereert.

17. **Productonderzoek + drie verbeteringen (2026-09-17)** — op verzoek van de gebruiker heb
    ik een korte discovery-vragenlijst afgenomen (gebruikspatroon, frictie, sociale kant,
    leerwens) om te bepalen wat écht de moeite waard is om te bouwen, in plaats van blind
    features te verzinnen. Belangrijkste vondst: de gebruiker vertrouwt de receptdata zelf
    nog niet — hij zoekt recepten nog op internet op omdat de bereiding "te vaag" is en er
    geen afwerk-/garneerinstructie bij staat. Twee andere ideeën werden expliciet afgewezen
    (handsfree-modus — nooit een probleem geweest; kostendashboard — spreekt niet aan) en
    twee werden bevestigd (gasten willen zelf iets kunnen inzien op hun telefoon; de cursus
    mag uitgebreider met een eindtoets). Op basis daarvan zijn drie dingen gebouwd:

    - **Alle 214 recepten uitgebreid met een preciezere bereiding + expliciete garnering.**
      Elk recept had voorheen een methode van één zin (bijv. "Shake met ijs, zeven in gekoeld
      glas."). Elk recept heeft nu een nieuw `garnish`-veld (bijv. "Cocktailkers en een
      schijfje sinaasappel op een prikker.") en een uitgebreidere `method` (2-4 zinnen met
      concrete techniekdetails: dry-shake-timing, dubbel zeven, drijflaag-volgorde, etc.).
      Dit is **eigen geschreven vakkennis** (dezelfde bron als de cursus), geen overname uit
      een bestaand receptenboek. Uitgevoerd via een Python-transformatiescript dat alle 214
      `method:`-regels in `recipes.js` gericht verving zonder de rest van elk record aan te
      raken; gevalideerd op 214/214 dekking (geen ontbrekende of foutieve garnish/method).
      `garnish` wordt nu getoond in Wat kan ik maken, Schaler, Verhaal, en is ook toegevoegd
      als optioneel veld aan het "Eigen recepten"-formulier.
    - **"Deel dit menu"-knop in de Feestplanner** — genereert een link
      (`?menu=id1,id2,id3`) via de Web Share API (met clipboard-fallback voor browsers zonder
      `navigator.share`). Een nieuwe **`GuestMenuView`**-component in `ThuisbarApp.jsx` toont
      bij het openen van zo'n link een schone, alleen-lezen paginaweergave (geen tabbladen,
      geen voorraadlogica) met per cocktail de sfeerkaart, quote en ingrediënten — precies de
      "simpel deelbaar linkje"-optie die de gebruiker koos boven live meestemmen (dat laatste
      zou een backend vereisen, wat een fundamentele wijziging t.o.v. de bewust
      volledig-lokale architectuur zou zijn).
      **Bekende beperking**: een gedeeld menu kan alleen ingebouwde recepten tonen, geen
      eigen creaties van de gastheer — die leven alleen in de localStorage van dát ene
      apparaat en zijn niet beschikbaar op het apparaat van een gast. De view valt hier netjes
      op terug met een duidelijk bericht i.p.v. te crashen.
    - Eindtoets voor de cursus (20-25 vragen over alle 5 delen) staat nog open — is expliciet
      benoemd als vervolgstap, nog niet gebouwd.

    Getest: garnish/method zichtbaar in Wat kan ik maken (Bee's Knees-voorbeeld), deel-knop
    met foutafhandeling bevestigd (via directe JS-dispatch, want de browser-testtool zelf kon
    geen geldig klembord-schrijfrecht krijgen in de sandbox — dat is een beperking van de
    testomgeving, niet van de app), en de gast-weergave getest op desktop én mobiel (375px)
    met een 3-cocktail-menu.

18. **Eindtoets + rustigere intro-animatie (2026-09-17)** — twee kleine, gerichte verzoeken.
    - **Splash iets langzamer**: totale duur van 2.3s naar 3.6s, met evenredig uitgerekte
      vertragingen voor het glas-vul-effect (0.85s → 1.7s), titel (2.15s) en subtitel
      (2.45s) — voelt merkbaar rustiger zonder traag te worden.
    - **Eindtoets voor de cursus**: `FINAL_EXAM` (25 nieuwe, origineel geschreven vragen,
      5 per deel, anders geformuleerd dan de losse lesvragen zodat het een echte
      "ken je de hele stof"-toets is) toegevoegd aan `course.js`. Nieuwe
      `FinalExamView`-component + een uitgelichte kaart onderaan het Cursus-overzicht
      (toont voortgang: "X lessen nog te gaan" of "Alle lessen voltooid", en de beste
      score na een poging). Voortgang wordt bijgehouden onder `progress.eindtoets` in
      dezelfde `thuisbar-cursus-voortgang`-opslag als de losse lessen — geen aparte
      localStorage-sleutel nodig.
    - **Bug gevonden en gefixt tijdens het testen**: `QuizBlock` gebruikte
      `setAnswers({ ...answers, [i]: oi })` — een klassieke stale-closure-valkuil. Bij een
      geautomatiseerde test die alle 25 vragen razendsnel achter elkaar beantwoordde (zonder
      dat React tussendoor kon re-renderen) overschreven latere antwoorden de eerdere,
      waardoor uiteindelijk maar 1 van de 25 antwoorden werd onthouden. Voor een echte
      gebruiker die na elke klik even pauzeert was dit onzichtbaar (React re-rendert dan
      steeds op tijd), maar het was een latent risico bij snel achter elkaar klikken. Gefixt
      door de functionele updater-vorm te gebruiken: `setAnswers(prev => ({ ...prev, [i]: oi }))`
      — dit patroon is nu bestand tegen elke klaksnelheid, ongeacht React's batching-gedrag.
      Bevestigd via een herhaalde geautomatiseerde test: na de fix registreerden alle 25
      klikken correct en gaf de eindscore het juiste resultaat.

19. **Splash-timing gecorrigeerd + rijkere glasillustraties in Verhaal (2026-09-17)** —
    twee verzoeken kort na elkaar.
    - **Splash trager + tekst leesbaar**: de gebruiker meldde dat "Mijn Thuisbar" en de
      welkomstzin te snel voorbijkwamen. Root cause: de subtitel was nog middenin zijn
      fade-in-animatie op het moment dat de hele overlay al begon te verdwijnen — geen
      enkel moment was beide teksten statisch en volledig leesbaar. Volledig herijkt naar
      5,5s totaal (was 3,6s): titel en subtitel krijgen nu allebei 1,5-2+ seconden stilstaand
      leestijd vóórdat de fade-out (4,9s-5,5s) begint.
    - **Rijkere, kleur-op-maat glasillustraties in Verhaal**: de gebruiker vroeg om een
      "mooie afbeelding" per cocktail, in dezelfde stijl. Echte foto's/AI-beelden kunnen in
      deze omgeving niet gegenereerd worden — in plaats daarvan is het bestaande
      `GlassArt`-illustratiesysteem flink uitgebreid:
      - Nieuwe `getLiquidColor(recipe, allIngredients)` (`ThuisbarApp.jsx`) leidt een
        realistische drankkleur af uit de daadwerkelijke ingrediënten (bijv. romig-tan bij
        zuivel, campari-rood bij Campari/cranberry/grenadine, amber bij whiskey/rum,
        koffiebruin, blauw bij blue curaçao, groen bij menthe/Chartreuse, etc.) via een
        prioriteiten-lijst van ingrediënt-ids — in plaats van de generieke, gedeelde
        smaakhoek-kleur die voorheen alle ~40 cocktails per rol identiek kleurde.
      - `GlassArt` kreeg een optionele `plinth`-prop die een zachte, radiale schaduw onder
        het glas tekent voor een "product shot"-gevoel.
      - In de Verhaal-hero is de illustratie vergroot van 104 naar 168px en gebruikt nu
        `getLiquidColor(...)` in plaats van `roleInfo.gradient` — de hero-achtergrond zelf
        blijft wel de smaakhoek-kleur (sfeer/mood), maar het glas erin toont nu de kleur van
        de specifieke cocktail. Alle 214 illustraties komen nog altijd uit hetzelfde
        parametrische systeem, dus de stijl blijft gegarandeerd 100% consistent.
      Getest: White Russian (romig-tan) en Negroni (campari-rood i.p.v. de generieke
      "sterk"-bruine hoek-kleur) bevestigen zichtbaar verschillende, kloppende kleuren; ook
      getest op mobiel (375px) — grote illustratie met schaduw rendert netjes.

## Context over de gebruiker (voor toon/vervolgkeuzes)

- Nederlandstalig, freelance WordPress-developer, ook personal trainer/coach.
- Wil vrije, niet te rigide structuur — vandaar de expliciete keuze voor "voeg zelf toe"
  overal in plaats van vaste dropdowns.
- Waardeert directe, concrete communicatie zonder overbodige uitleg.
