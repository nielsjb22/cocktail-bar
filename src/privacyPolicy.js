// Eén bron voor het privacybeleid: het scherm in de app (Instellingen →
// Privacybeleid) en de losse webpagina /privacy (voor App Store Connect)
// lezen allebei deze tekst. Wijzig je iets, pas dan ook BIJGEWERKT aan.
// Een sectie heeft een kop, tekst, optioneel punten (een opsomming) en
// optioneel naTekst (een alinea onder de opsomming).

export const PRIVACY_BIJGEWERKT = "23 oktober 2026";

// Wie verantwoordelijk is voor de gegevens (je naam, of je bedrijfsnaam als
// je een eenmanszaak hebt). Zolang het leeg is, staat er "de maker van Mijn
// Thuisbar" — vul het in vóór de App Store-release.
export const VERANTWOORDELIJKE = "";

// Vul hier het contactadres in; zolang het leeg is, verwijst de tekst naar
// de App Store-vermelding.
export const CONTACT_EMAIL = "nielsbenedictus@ziggo.nl";

const wie = VERANTWOORDELIJKE || "de maker van Mijn Thuisbar";

export const PRIVACY_INTRO =
  "Mijn Thuisbar is een persoonlijke app voor het bijhouden van je thuisbar, cocktailrecepten en check-ins met vrienden. Dit beleid legt uit welke gegevens de app verzamelt, waarvoor, met wie ze gedeeld worden en welke rechten je hebt.";

export const PRIVACY_SECTIES = [
  {
    kop: "Wie is verantwoordelijk",
    tekst: `Verantwoordelijk voor de verwerking van je gegevens is ${wie}. Je bereikt ons via het contactadres onderaan dit beleid.`,
  },
  {
    kop: "Welke gegevens",
    tekst: "E-mailadres en naam (voor je account), een optionele profielfoto, je voorraad, favorieten, boodschappenlijst, cursusvoortgang en eigen recepten, je check-ins (cocktailnaam, foto, locatie die je zelf kiest, beoordeling, notities), en — als je die functies gebruikt — vriendschappen, geblokkeerde gebruikers, reacties en proosts, je feesten en de antwoorden van gasten op een gedeelde smaaktest (smaakvoorkeuren, optioneel hun naam). Zet je pushmeldingen aan, dan bewaren we een technisch apparaattoken. Meld je iets, dan bewaren we die melding. De app gebruikt geen advertenties, geen analysediensten en geen tracking.",
  },
  {
    kop: "Waarvoor en op welke grond",
    tekst: "We gebruiken je gegevens alleen om de app te laten werken. Per doel is dit de grond volgens de privacywet (AVG):",
    punten: [
      "Je account, voorraad, check-ins, vrienden, feesten en meldingen: nodig om de app te leveren die je gebruikt (uitvoering van de overeenkomst).",
      "De bartender en het flessen scannen (AI), pushmeldingen en je profielfoto: alleen met jouw toestemming, die je altijd kunt intrekken.",
      "Anonieme tellingen om de app slimmer te maken, en het afhandelen van meldingen om de app veilig te houden: ons gerechtvaardigd belang. Je kunt daartegen bezwaar maken via het contactadres.",
    ],
    naTekst: "Niets wordt gebruikt voor advertenties of verkocht aan anderen. De app volgt je niet over andere apps of websites.",
  },
  {
    kop: "Hoe de app slimmer wordt",
    tekst: "De app leert van wat gebruikers samen doen: welke cocktails mensen met een vergelijkbare smaak hoog waarderen (de tips onder \"Voor jou\"), welke merknamen mensen aan een drank koppelen, en naar welke cocktails mensen zoeken die nog niet in de app staan. Die signalen worden bij je account opgeslagen, zodat niemand dubbel telt, en verdwijnen als je je account verwijdert. Gebruikt worden alleen tellingen: niemand anders kan zien wie wat deed, en een uitkomst telt pas mee als meerdere mensen hetzelfde deden.",
  },
  {
    kop: "De bartender en flessen scannen (AI)",
    tekst: "Gebruik je de bartender of scan je je flessen, dan gaan je vraag of foto, de namen van de flessen in je voorraad (bij de bartender alleen als je daarvoor kiest), je smaakprofiel (bijvoorbeeld \"houdt van fris en bitter\"), de namen en cijfers van cocktails die je hoog of laag beoordeelde of onlangs dronk, en een lijst recepten uit de app naar Claude, een AI-dienst van Anthropic, om een antwoord te maken. Je naam, e-mailadres, vrienden en de notities, plekken en foto's van je check-ins gaan niet mee. Wij bewaren je vragen en foto's niet; we houden alleen bij hoeveel vragen en scans je per dag doet, voor de daglimiet. Volgens de zakelijke voorwaarden van Anthropic worden deze gegevens niet gebruikt om AI-modellen te trainen en bewaart Anthropic ze maar beperkte tijd, onder meer om misbruik te kunnen opsporen. Je geeft hier eenmalig toestemming voor en kunt die altijd intrekken in Profiel → Instellingen. Zonder toestemming werkt de rest van de app gewoon.",
  },
  {
    kop: "Wie je gegevens verwerkt",
    tekst: "Alleen deze partijen verwerken gegevens voor ons, elk alleen voor de genoemde taak:",
    punten: [
      "Supabase (database, bestandsopslag, inloggen en account-e-mails) — servers in de EU.",
      "Anthropic (de AI achter de bartender en het scannen, alleen met je toestemming) — Verenigde Staten.",
      "Apple (pushmeldingen, en de kaart op je profiel: daarvoor gaan de locaties van je check-ins naar Apple Maps) — Verenigde Staten.",
      "OpenStreetMap Foundation (kaarttegels en het opzoeken van plaatsnamen bij een locatie) — Verenigd Koninkrijk.",
      "Netlify (hosting van de webpagina's, zoals gedeelde menukaarten, de smaaktest voor gasten en dit privacybeleid) — Verenigde Staten.",
    ],
    naTekst: "Je gegevens worden met niemand anders gedeeld, behalve als de wet ons daartoe verplicht.",
  },
  {
    kop: "Gegevens buiten de EU",
    tekst: "Anthropic, Apple en Netlify zitten in de Verenigde Staten. Doorgifte daarheen gebeurt op basis van het EU-VS-gegevensprivacykader (Data Privacy Framework) of de standaardcontractbepalingen van de Europese Commissie. Voor het Verenigd Koninkrijk heeft de Europese Commissie vastgesteld dat de bescherming daar passend is.",
  },
  {
    kop: "Hoe lang we gegevens bewaren",
    punten: [
      "Je accountgegevens, check-ins, foto's, vrienden, feesten en instellingen: zolang je account bestaat. Verwijder je iets of je hele account, dan is het direct weg; uit back-ups van de database verdwijnt het automatisch na korte tijd.",
      "Antwoorden van gasten op je smaaktest: tot je het feest of je account verwijdert.",
      "Het apparaattoken voor pushmeldingen: tot je meldingen uitzet of je account verwijdert.",
      "Meldingen van ongepaste inhoud: zolang nodig om ze af te handelen en herhaling te voorkomen. Verwijdert de melder zijn account, dan blijft de melding bewaard zonder te zeggen wie meldde.",
    ],
    tekst: "",
  },
  {
    kop: "Waar",
    tekst: "Sommige instellingen (zoals je voorraad) staan ook lokaal op je toestel. Gebruik je de app zonder account, dan blijft alles (ook je check-ins) alleen op je toestel; maak je later een account, dan gaan je check-ins mee naar je account. Verwijder je de app zonder account, dan zijn deze gegevens weg.",
  },
  {
    kop: "Alcohol",
    tekst: "Mijn Thuisbar is bedoeld voor volwassenen van 18 jaar en ouder. We verzamelen bewust geen gegevens van minderjarigen. Geniet met mate.",
  },
  {
    kop: "Jouw rechten",
    tekst: "Je hebt het recht om je gegevens in te zien, te laten corrigeren, te laten verwijderen en mee te nemen, en om bezwaar te maken of je toestemming in te trekken.",
    punten: [
      "Downloaden: via Profiel → Instellingen → Download mijn gegevens krijg je een bestand met al je gegevens.",
      "Verwijderen: via Profiel → Instellingen → Account verwijderen. Dat verwijdert je profiel, check-ins, foto's, vriendschappen, feesten en meldingen-inschrijvingen definitief.",
      "Toestemming intrekken: voor de AI en pushmeldingen in Profiel → Instellingen.",
      "Al het andere: mail ons via het contactadres hieronder. We reageren binnen een maand.",
    ],
    naTekst: "Ben je het niet eens met hoe we met je gegevens omgaan, dan kun je een klacht indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).",
  },
  {
    kop: "Wijzigingen",
    tekst: "We passen dit beleid aan als de app verandert. De datum bovenaan laat zien wanneer het voor het laatst is bijgewerkt. Bij belangrijke wijzigingen laten we het je in de app weten.",
  },
];

export function privacyContactTekst() {
  return CONTACT_EMAIL
    ? `Vragen over dit beleid of over je gegevens? Mail naar ${CONTACT_EMAIL}.`
    : "Vragen over dit beleid of over je gegevens? Neem contact op via de contactgegevens in de App Store-vermelding van Mijn Thuisbar.";
}
