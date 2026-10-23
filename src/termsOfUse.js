// Eén bron voor de gebruiksvoorwaarden: het scherm in de app (Instellingen →
// Gebruiksvoorwaarden), het akkoordscherm en de webpagina /voorwaarden lezen
// allemaal deze tekst.
//
// Verhoog VOORWAARDEN_VERSIE alleen bij een wijziging waar gebruikers opnieuw
// mee akkoord moeten gaan; iedereen met een account krijgt dan bij de
// volgende start het akkoordscherm. Tekstuele verbeteringen: alleen
// VOORWAARDEN_BIJGEWERKT aanpassen.
import { CONTACT_EMAIL, VERANTWOORDELIJKE } from "./privacyPolicy";

export const VOORWAARDEN_VERSIE = "2026-10-23";
export const VOORWAARDEN_BIJGEWERKT = "23 oktober 2026";

const wie = VERANTWOORDELIJKE || "de maker van Mijn Thuisbar";

export const VOORWAARDEN_INTRO =
  `Deze voorwaarden gelden voor het gebruik van de app Mijn Thuisbar en de bijbehorende webpagina's. Mijn Thuisbar wordt aangeboden door ${wie} ("wij"). Door een account te maken ga je akkoord met deze voorwaarden en met ons privacybeleid. Gebruik je de app zonder account, dan gelden ze ook, voor zover ze over die functies gaan.`;

export const VOORWAARDEN_SECTIES = [
  {
    kop: "Alleen voor volwassenen",
    tekst: "Mijn Thuisbar gaat over alcoholische dranken en is alleen bedoeld voor mensen van 18 jaar en ouder. Door de app te gebruiken bevestig je dat je 18 jaar of ouder bent.",
  },
  {
    kop: "Je account",
    tekst: "Een account is persoonlijk. Gebruik je echte naam of een naam waaronder vrienden je kennen, en geef je niet uit voor iemand anders. Houd je wachtwoord geheim; je bent verantwoordelijk voor wat er met je account gebeurt. Je kunt je account altijd zelf verwijderen via Profiel → Instellingen → Account verwijderen.",
  },
  {
    kop: "Wat je deelt",
    tekst: "Check-ins, foto's, beoordelingen, reacties, eigen recepten en feestgegevens blijven van jou. Je geeft ons alleen toestemming om ze op te slaan en te tonen aan de mensen met wie jij ze deelt (zoals je vrienden of gasten van je feest), zolang ze in de app staan. Je deelt alleen wat je zelf mag delen: plaats geen foto's van anderen zonder hun toestemming en geen werk waarop iemand anders rechten heeft.",
  },
  {
    kop: "Geen ruimte voor ongepaste inhoud",
    tekst: "We tolereren geen ongepaste inhoud of gedrag. Niet toegestaan is onder meer:",
    punten: [
      "beledigen, pesten, bedreigen of discrimineren van anderen;",
      "naakt, seksuele of gewelddadige inhoud;",
      "inhoud waarop minderjarigen te zien zijn in combinatie met alcohol, of die minderjarigen aanzet tot drinken;",
      "aanzetten tot overmatig drinken, rijden onder invloed of ander gevaarlijk gedrag;",
      "spam, reclame of oplichting;",
      "persoonlijke gegevens van anderen delen zonder hun toestemming;",
      "iets wat in strijd is met de wet of met rechten van anderen.",
    ],
    naTekst: "Zie je zoiets? Meld het via de ··· bij de check-in of het profiel, en blokkeer de gebruiker als je wilt. We bekijken meldingen binnen 24 uur. Inhoud die deze regels overtreedt, verwijderen we, en wie de regels overtreedt kunnen we waarschuwen, schorsen of verwijderen, zonder voorafgaande aankondiging.",
  },
  {
    kop: "Verantwoord drinken",
    tekst: "Geniet met mate. Drink niet als je moet rijden, zwanger bent, medicijnen gebruikt die niet samengaan met alcohol, of om een andere reden beter niet kunt drinken. Recepten kunnen allergenen bevatten, zoals ei, melk, noten of gluten: controleer zelf de ingrediënten en de etiketten van wat je gebruikt. Rauw eiwit en eigeel brengen een klein risico op salmonella met zich mee.",
  },
  {
    kop: "De bartender (AI)",
    tekst: "De bartender en het flessen scannen werken met AI. Antwoorden en herkende flessen kunnen fout of onvolledig zijn. Zie ze als suggesties, niet als professioneel, medisch of voedingsadvies, en controleer zelf wat je maakt en drinkt. Er geldt een daglimiet, en de functie is alleen voor persoonlijk gebruik binnen de app.",
  },
  {
    kop: "Prijzen, winkels en merken",
    tekst: "Prijzen en winkels in de app zijn richtprijzen ter informatie. Ze kunnen verouderd zijn of afwijken van wat de winkel rekent; de prijs bij de winkel zelf geldt. Wij verkopen niets en hebben geen samenwerking met de genoemde winkels of merken. Merknamen zijn eigendom van hun eigenaren en worden alleen genoemd om een drank aan te duiden. Links naar andere websites vallen onder de voorwaarden van die websites.",
  },
  {
    kop: "Inhoud van de app",
    tekst: "De teksten, recepten, cursus, tekeningen en het ontwerp van de app zijn van ons of worden gebruikt met toestemming of onder een licentie. Foto's van anderen staan met naam en licentie onder Instellingen → Fotoverantwoording, en de gebruikte open-sourcesoftware en lettertypes onder Instellingen → Licenties. Je mag de inhoud gebruiken voor jezelf, maar niet kopiëren of verspreiden voor andere doeleinden.",
  },
  {
    kop: "Beschikbaarheid",
    tekst: "De app is gratis. We doen ons best om hem goed en veilig te laten werken, maar we beloven niet dat hij altijd beschikbaar, foutloos of ongewijzigd is. We kunnen functies aanpassen, toevoegen of stoppen. Er is geen garantie op beschikbaarheid (geen SLA).",
  },
  {
    kop: "Aansprakelijkheid",
    tekst: "Je gebruikt de app op eigen verantwoordelijkheid. Voor zover de wet dat toestaat, zijn wij niet aansprakelijk voor schade door het gebruik van de app, door fouten in recepten, prijzen of AI-antwoorden, of door wat andere gebruikers delen. Dit geldt niet bij opzet of grove nalatigheid van onze kant, en het beperkt geen rechten die je als consument volgens de wet hebt.",
  },
  {
    kop: "Stoppen en schorsen",
    tekst: "Je kunt op elk moment stoppen en je account verwijderen. Wij kunnen je account schorsen of verwijderen als je deze voorwaarden overtreedt of de app misbruikt.",
  },
  {
    kop: "Wijzigingen",
    tekst: "We kunnen deze voorwaarden aanpassen. Bij een belangrijke wijziging vragen we je in de app opnieuw om akkoord. Ga je niet akkoord, dan kun je je account verwijderen.",
  },
  {
    kop: "Apple",
    tekst: "Deze voorwaarden zijn een afspraak tussen jou en ons, niet met Apple. Apple is niet verantwoordelijk voor de app of de inhoud ervan en hoeft er geen onderhoud of ondersteuning voor te geven. Voor het downloaden van de app gelden daarnaast de voorwaarden van de App Store.",
  },
  {
    kop: "Toepasselijk recht",
    tekst: "Op deze voorwaarden is Nederlands recht van toepassing. Heb je een klacht, neem dan eerst contact met ons op; we zoeken samen naar een oplossing. Lukt dat niet, dan kun je naar de bevoegde rechter in Nederland.",
  },
];

export function voorwaardenContactTekst() {
  return CONTACT_EMAIL
    ? `Vragen of klachten? Mail naar ${CONTACT_EMAIL}.`
    : "Vragen of klachten? Neem contact op via de contactgegevens in de App Store-vermelding van Mijn Thuisbar.";
}
