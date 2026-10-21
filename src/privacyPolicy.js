// Eén bron voor het privacybeleid: het scherm in de app (Instellingen →
// Privacybeleid) en de losse webpagina /privacy (voor App Store Connect)
// lezen allebei deze tekst. Wijzig je iets, pas dan ook BIJGEWERKT aan.

export const PRIVACY_BIJGEWERKT = "21 oktober 2026";

// Vul hier het contactadres in; zolang het leeg is, verwijst de tekst naar
// de App Store-vermelding.
export const CONTACT_EMAIL = "nielsbenedictus@ziggo.nl";

export const PRIVACY_INTRO =
  "Mijn Thuisbar is een persoonlijke app voor het bijhouden van je thuisbar, cocktailrecepten en check-ins met vrienden. Dit beleid legt uit welke gegevens de app verzamelt en waarvoor.";

export const PRIVACY_SECTIES = [
  {
    kop: "Welke gegevens",
    tekst: "E-mailadres en naam (voor je account), een optionele profielfoto, je voorraad en eigen recepten, je check-ins (cocktailnaam, foto, locatie, beoordeling, notities), en — als je die functie gebruikt — vriendschappen, reacties en proosts op check-ins van jou en anderen. Bij een gedeelde smaaktest voor een feest worden ook de antwoorden van je gasten (smaakvoorkeuren, optioneel hun naam) opgeslagen. Zet je pushmeldingen aan, dan bewaren we een technisch apparaattoken om meldingen te kunnen bezorgen.",
  },
  {
    kop: "Waarvoor",
    tekst: "Uitsluitend om de app te laten werken: je eigen gegevens tonen, je voortgang bewaren, en — als je vrienden hebt toegevoegd — hun check-ins met je delen en andersom. Niets wordt gebruikt voor advertenties of doorverkocht aan derden. De app volgt je niet over andere apps of websites.",
  },
  {
    kop: "Hoe de app slimmer wordt",
    tekst: "De app leert van wat alle gebruikers samen doen, altijd anoniem: welke cocktails mensen met een vergelijkbare smaak hoog waarderen (voor de tips onder \"Voor jou\"), welke merknamen mensen aan een drank koppelen, en naar welke cocktails mensen zoeken die nog niet in de app staan. Daarbij worden alleen tellingen gebruikt; niemand kan zien wie wat deed, en een uitkomst telt pas mee als meerdere mensen hetzelfde deden. Je voorraad, favorieten, boodschappenlijst en cursusvoortgang worden bij je account bewaard, zodat ze op al je apparaten hetzelfde zijn.",
  },
  {
    kop: "Waar",
    tekst: "Je gegevens staan opgeslagen bij Supabase (databasehosting in de EU). Sommige instellingen (zoals je voorraad) staan lokaal op je toestel. Gebruik je de app zonder account, dan blijft alles (ook je check-ins) alleen op je toestel; maak je later een account, dan gaan je check-ins mee naar je account. Verwijder je de app zonder account, dan zijn deze gegevens weg.",
  },
  {
    kop: "Delen met derden",
    tekst: "Alleen wat nodig is om de app te laten draaien: databasehosting (Supabase), de kaart op je profiel (Apple Maps; daarvoor worden de locaties van je check-ins naar Apple gestuurd om ze op de kaart te tonen), het opzoeken van plaatsnamen bij een locatie (OpenStreetMap), en — als je pushmeldingen aanzet — de meldingendienst van Apple. Nooit voor marketingdoeleinden.",
  },
  {
    kop: "Alcohol",
    tekst: "Mijn Thuisbar is bedoeld voor volwassenen van 18 jaar en ouder. Geniet met mate.",
  },
  {
    kop: "Jouw rechten",
    tekst: "Je kan je gegevens op elk moment verwijderen via Instellingen → Account verwijderen. Dat verwijdert je profiel, check-ins, vriendschappen en meldingen-inschrijvingen definitief. Je kunt ook vragen welke gegevens we van je hebben of ze laten corrigeren via het contactadres hieronder.",
  },
];

export function privacyContactTekst() {
  return CONTACT_EMAIL
    ? `Vragen over dit beleid of over je gegevens? Mail naar ${CONTACT_EMAIL}.`
    : "Vragen over dit beleid of over je gegevens? Neem contact op via de contactgegevens in de App Store-vermelding van Mijn Thuisbar.";
}
