// Momenten van het jaar: lijstjes cocktails die bij een feestdag of seizoen
// passen (Ontdekken → Momenten). Met de hand samengesteld, met per cocktail
// een korte reden; de app laat alleen recepten zien die er echt zijn.
//
// van/tot: MM-DD, het lijstje telt als "nu" in die periode (mag over de
// jaarwisseling lopen). dag: de feestdag zelf, voor "over 8 dagen".

export const MOMENTS = [
  {
    id: "dry_january", titel: "Dry January", kop: "Een frisse start", van: "01-01", tot: "01-31",
    tekst: "Een maand zonder alcohol hoeft niet saai te zijn. Deze drankjes zijn net zo doordacht als elke cocktail.",
    items: [
      ["virgin_mojito", "Munt, limoen en bubbels, precies als het origineel"],
      ["espresso_tonic", "Bitter en verfrissend, voor koffieliefhebbers"],
      ["virgin_paloma", "Grapefruit en limoen met een zoutrandje"],
      ["virgin_hugo", "Vlierbloesem, munt en limoen: licht en bloemig"],
      ["grapefruit_tonic", "Bitterzoet, met grapefruit en tonic"],
      ["pornstar_mocktail", "Passievrucht en vanille, feestelijk zonder alcohol"],
      ["basil_lemonade", "Basilicum en citroen: kruidig en fris"],
      ["virgin_margarita", "Zuur en zilt, met een zoutrand"],
      ["apple_ginger_fizz", "Appel en gember, met een pittig randje"],
      ["limonana", "Munt-citroenlimonade uit het Midden-Oosten"],
    ],
  },
  {
    id: "valentijn", titel: "Valentijn", kop: "Roze en romantisch", van: "02-01", tot: "02-14", dag: "02-14",
    tekst: "Rood, roze en een beetje zoet: cocktails om samen te drinken.",
    items: [
      ["valentine_martini", "De naam zegt genoeg: roze en fruitig"],
      ["kir_royale", "Bubbels met cassis, voor een toast met z'n tweeën"],
      ["clover_club", "Framboos en een zijdezachte schuimkraag"],
      ["french_martini", "Framboos en ananas: zacht en fruitig"],
      ["porn_star_martini", "Passievrucht met een glaasje bubbels ernaast"],
      ["cosmopolitan", "Roze, fris en een tikje stoer"],
      ["rossini", "Aardbei met prosecco"],
      ["chocolate_martini", "Een dessert in een glas"],
      ["raspberry_lemonade", "Frambozenlimonade, zonder alcohol"],
    ],
  },
  {
    id: "lente", titel: "Lente", kop: "Bloesem en bubbels", van: "03-20", tot: "05-20",
    tekst: "De eerste zonnige dagen vragen om iets lichts, bloemigs en fris.",
    items: [
      ["hugo", "Vlierbloesem, munt en bubbels: de lente in een glas"],
      ["elderflower_collins", "Lang, licht en bloemig"],
      ["aviation", "Bloemig, met violetlikeur"],
      ["gin_basil_smash", "Vers basilicum en citroen"],
      ["french_75", "Gin, citroen en bubbels"],
      ["bees_knees", "Honing en citroen, zacht en zonnig"],
      ["eastside", "Komkommer en munt: knisperend fris"],
      ["english_garden_fizz", "Een tuin vol frisse smaken in één glas"],
      ["virgin_hugo", "De Hugo zonder alcohol"],
    ],
  },
  {
    id: "koningsdag", titel: "Koningsdag", kop: "Oranje boven", van: "04-13", tot: "04-27", dag: "04-27",
    tekst: "Alles wat oranje is, voor op het terras of de vrijmarkt.",
    items: [
      ["aperol_spritz", "Hét oranje terrasdrankje"],
      ["screwdriver", "Wodka met sinaasappelsap: helemaal oranje"],
      ["tequila_sunrise", "Van oranje naar rood, als een zonsopgang"],
      ["mimosa", "Bubbels met sinaasappelsap, voor bij het ontbijt"],
      ["garibaldi", "Campari met sinaasappelsap: bitter en oranje"],
      ["aperol_sour", "Aperol met citroen en een schuimkraag"],
      ["harvey_wallbanger", "Een Screwdriver met een scheut Galliano"],
      ["virgin_sunrise", "De Tequila Sunrise zonder alcohol"],
    ],
  },
  {
    id: "zomer", titel: "Zomer", kop: "Terrasweer", van: "06-01", tot: "08-31",
    tekst: "Lang, koud en vol fruit: voor de warmste dagen van het jaar.",
    items: [
      ["mojito", "Munt, limoen en veel ijs"],
      ["paloma", "Tequila met grapefruit: Mexicaans zomerdrankje"],
      ["pina_colada", "Ananas en kokos, vakantie in een glas"],
      ["tinto_de_verano", "Rode wijn met limonade, zoals in Spanje"],
      ["ranch_water", "Tequila, limoen en bruiswater: droog en verfrissend"],
      ["mai_tai", "Rum, limoen en amandel: de tiki-klassieker"],
      ["caipirinha", "Cachaça met verse limoen"],
      ["gin_tonic", "Simpel en altijd goed op een warme avond"],
      ["painkiller", "Rum, ananas, sinaasappel en kokos"],
      ["watermelon_cooler", "Watermeloen en limoen, zonder alcohol"],
    ],
  },
  {
    id: "herfst", titel: "Herfst", kop: "Lange avonden", van: "09-22", tot: "11-30",
    tekst: "Als de avonden korter worden: stevig, kruidig en warm.",
    items: [
      ["boulevardier", "Een Negroni met bourbon: voller en warmer"],
      ["penicillin", "Whisky, gember en honing: warm en pittig"],
      ["old_pal", "Rogge, vermout en Campari: droog en bitter"],
      ["paper_plane", "Bourbon, amaro en Aperol, mooi in balans"],
      ["jack_rose", "Appelbrandewijn met grenadine"],
      ["rusty_nail", "Whisky met Drambuie: honing en kruiden"],
      ["vieux_carre", "Rijk en kruidig, uit New Orleans"],
      ["hot_toddy", "Warme whisky met honing en citroen"],
      ["hot_apple_toddy", "Warme appel met calvados en kaneel"],
    ],
  },
  {
    id: "halloween", titel: "Halloween", kop: "Donker en spannend", van: "10-10", tot: "10-31", dag: "10-31",
    tekst: "Bloedrood, inktzwart of met een naam die griezelt: cocktails die op een Halloween-feest opvallen.",
    items: [
      ["blood_and_sand", "Bloedrood, met een naam die erbij past"],
      ["corpse_reviver_2", "De 'lijkenopwekker', met een vleugje absint"],
      ["zombie", "Sterk, donker en berucht"],
      ["black_manhattan", "Een donkere Manhattan met amaro"],
      ["satans_whiskers", "De snor van de duivel"],
      ["el_diablo", "De duivel: tequila met cassis en gemberbier"],
      ["espresso_martini", "Inktzwart met een romige kraag"],
      ["black_russian", "Wodka en koffielikeur: diep donker"],
      ["bloody_mary", "Bloedrood en pittig"],
    ],
  },
  {
    id: "sinterklaas", titel: "Sinterklaas", kop: "Pakjesavond", van: "11-15", tot: "12-05", dag: "12-05",
    tekst: "Nootachtig, romig en kruidig: lekker bij pepernoten en chocoladeletters.",
    items: [
      ["egg_nog", "Romig en kruidig, met nootmuskaat"],
      ["toasted_almond", "Amandel, koffie en room"],
      ["nutty_irishman", "Hazelnoot en Ierse room"],
      ["cafe_amaretto", "Warme koffie met amaretto"],
      ["baileys_coffee", "Koffie met Ierse room en slagroom"],
      ["hot_chocolate_brandy", "Warme chocolademelk met cognac"],
      ["godfather", "Whisky met amaretto: zacht en nootachtig"],
      ["amaretto_sour", "Zoetzuur, met de smaak van marsepein"],
    ],
  },
  {
    id: "kerst", titel: "Kerst", kop: "Warm en feestelijk", van: "12-06", tot: "12-26", dag: "12-25",
    tekst: "Warme klassiekers voor koude avonden en iets feestelijks voor aan tafel.",
    items: [
      ["egg_nog", "Al eeuwenlang hét kerstdrankje"],
      ["mulled_wine", "Warme wijn met kruiden"],
      ["glogg", "De Scandinavische glühwein met port"],
      ["tom_and_jerry", "Warm en schuimig, met rum en cognac"],
      ["irish_coffee", "Koffie, whiskey en een laagje room"],
      ["poinsettia", "Bubbels met cranberry: kerstrood"],
      ["brandy_alexander", "Cognac, cacao en room: een toetje"],
      ["white_russian", "Romig en zoet, voor bij de open haard"],
      ["witte_gluhwein", "Warme witte wijn met honing en sinaasappel"],
    ],
  },
  {
    id: "oud_en_nieuw", titel: "Oud en nieuw", kop: "Proosten op het nieuwe jaar", van: "12-27", tot: "01-01", dag: "12-31",
    tekst: "Bubbels voor de laatste avond van het jaar en de toast om middernacht.",
    items: [
      ["champagne_cocktail", "Bubbels met cognac en een paar druppels bitters"],
      ["french_75", "Gin, citroen en champagne"],
      ["kir_royale", "Bubbels met cassis"],
      ["bellini", "Perzik met prosecco"],
      ["air_mail", "Rum, limoen, honing en bubbels"],
      ["death_in_the_afternoon", "Absint met champagne, Hemingways favoriet"],
      ["sbagliato", "Campari, vermout en prosecco"],
      ["russian_spring_punch", "Wodka, cassis en bubbels"],
      ["virgin_bellini", "Bubbels zonder alcohol, voor iedereen"],
    ],
  },
  {
    id: "winter", titel: "Winter", kop: "Warm de winter door", van: "12-01", tot: "02-28",
    tekst: "Warme drankjes om binnen bij weg te kruipen.",
    items: [
      ["hot_toddy", "Warme whisky met honing en citroen"],
      ["hot_buttered_rum", "Rum met boter en kruiden"],
      ["irish_coffee", "Koffie, whiskey en room"],
      ["mulled_wine", "Warme wijn met kruiden"],
      ["bombardino", "De Italiaanse wintersportklassieker"],
      ["jagertee", "Warme thee met rum en wijn"],
      ["spanish_coffee", "Koffie met Licor 43"],
      ["warm_apple_cinnamon", "Warme appel met kaneel, zonder alcohol"],
    ],
  },
];

const md = (s) => s.split("-").map(Number);
function inWindow(date, van, tot) {
  const [m, d] = [date.getMonth() + 1, date.getDate()];
  const v = md(van), t = md(tot);
  const cur = m * 100 + d, a = v[0] * 100 + v[1], b = t[0] * 100 + t[1];
  return a <= b ? cur >= a && cur <= b : cur >= a || cur <= b;
}
// Eerstvolgende datum (vandaag of later) voor MM-DD.
function nextDate(date, mmdd) {
  const [m, d] = md(mmdd);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let x = new Date(date.getFullYear(), m - 1, d);
  if (x < today) x = new Date(date.getFullYear() + 1, m - 1, d);
  return x;
}
const DAY = 86400000;
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

// Alle momenten met hun status voor vandaag, in volgorde: wat nu is, dan wat
// eraan komt, dan de rest van het jaar.
export function momentsFor(date = new Date()) {
  return MOMENTS.map(m => {
    const nu = inWindow(date, m.van, m.tot);
    const start = nextDate(date, m.van);
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dagenTotStart = Math.round((start - today) / DAY);
    const dagenTotDag = m.dag ? Math.round((nextDate(date, m.dag) - today) / DAY) : null;
    let label;
    if (nu && dagenTotDag != null && dagenTotDag <= 31) label = dagenTotDag === 0 ? "Vandaag" : dagenTotDag === 1 ? "Morgen" : `Over ${dagenTotDag} dagen`;
    else if (nu) label = "Nu";
    else label = `Vanaf ${start.getDate()} ${MAANDEN[start.getMonth()]}`;
    const sort = nu ? (dagenTotDag ?? 40) : 100 + dagenTotStart;
    return { ...m, nu, label, sort };
  }).sort((a, b) => a.sort - b.sort);
}
