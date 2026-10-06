// Menukaart voor gasten: gedeelde logica voor de gastenpagina (GuestMenuView),
// de deelbare afbeelding (1080×1920 PNG) en de printbare A5-PDF. Alles komt
// uit de receptdata zelf, zodat elke cocktail — ook een minder bekende — een
// ingrediëntregel, sterkte, allergeen-notitie en korte beschrijving krijgt.

// ---------- Kleuren en lettertypes (gastenmenu, donkere stijl) ----------
export const MENU_COLORS = {
  bg: "#0F1F1B",
  text: "#F1E9D8",
  body: "#C9CFCB",
  subtle: "#8E9A94",
  gold: "#C6A15B",
  divider: "#22332E",
};
export const MENU_SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const MENU_SANS = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";

// ---------- Ingrediëntregel ----------
// Korte, kleine namen voor op de kaart; de rest wordt afgeleid uit de
// ingrediëntnaam (haakjes weg, eerste alternatief, kleine letters).
const SHORT_NAMES = {
  angostura: "angostura", peychauds: "peychaud's", orange_bitters: "sinaasappelbitter",
  irish_cream: "baileys", coffee_liqueur: "koffielikeur", prosecco: "prosecco",
  creme_de_noyaux: "crème de noyaux", melon_liqueur: "meloenlikeur",
  apricot_brandy: "abrikozenlikeur", cherry_brandy: "kersenlikeur", allspice_liqueur: "piment-likeur",
  orgeat: "amandelsiroop", ginger_wine: "gemberwijn", sour_apple_liqueur: "appellikeur",
  chambord: "frambozenlikeur", frangelico: "hazelnootlikeur", galliano: "galliano",
  tomato_juice: "tomatensap", passion_fruit_juice: "passievrucht", soda_water: "soda",
  tequila_blanco: "tequila", espresso: "espresso", hot_coffee: "koffie",
  hot_water: null, // geen ingrediënt dat je op een menukaart zet
};
function shortName(ing, meta) {
  const id = meta?.id || ing.id;
  if (id in SHORT_NAMES) return SHORT_NAMES[id];
  const name = meta?.name || ing.name || id || "";
  if (/\(garnering\)/i.test(name)) return null;
  // "Citroensap" → "citroen", "Ananassap" → "ananas": korter en zo staat het op een kaart.
  return name.replace(/\s*\(.*?\)\s*/g, " ").split(" / ")[0].trim().toLowerCase().replace(/sap$/, "");
}

// ---------- Sterkte ----------
// Op basis van de hoeveelheid sterke drank, afgezet tegen het hele glas:
// geschat aantal ml pure alcohol (sterke drank ±40%, likeuren en versterkte
// wijnen ±20%, wijn/bubbels ±12%, bier ±5%; bitters in dashes tellen niet)
// gedeeld door het totale volume. Zo is een Old Fashioned "Sterk", een
// Whiskey Sour "Middel" en een Gin-Tonic "Licht". Een glas met heel veel
// alcohol (Long Island-achtig) is altijd Sterk.
const ABV_BY_ID = { prosecco: 0.12, white_wine: 0.12, red_wine: 0.13, beer: 0.05, stout: 0.045, sake: 0.15, absinthe: 0.6, peach_schnapps: 0.2 };
const ABV_BY_CAT = { "Sterke drank": 0.4, "Likeuren & versterkte wijnen": 0.2 };
function alcoholEstimate(recipe, findMeta) {
  let alcohol = 0, total = 0;
  for (const ing of recipe.ingredients) {
    if (ing.unit !== "ml") continue;
    const meta = findMeta(ing);
    const id = meta?.id || ing.id;
    const abv = ABV_BY_ID[id] ?? ABV_BY_CAT[meta?.cat] ?? 0;
    alcohol += (ing.amount || 0) * abv;
    total += ing.amount || 0;
  }
  return { alcohol, ratio: total > 0 ? alcohol / total : 0 };
}
export function menuStrength(recipe, findMeta) {
  const { alcohol, ratio } = alcoholEstimate(recipe, findMeta);
  if (alcohol <= 0.5) return { level: 0, label: "Alcoholvrij" };
  if (ratio >= 0.3 || alcohol >= 32) return { level: 3, label: "Sterk" };
  if (ratio >= 0.13) return { level: 2, label: "Middel" };
  return { level: 1, label: "Licht" };
}

// ---------- Allergenen / let op ----------
const RAW_EGG = ["egg_white", "egg_yolk"];
const LACTOSE = ["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter"];
const NUTS = ["orgeat", "amaretto", "frangelico", "creme_de_noyaux"];
export function menuNotes(recipe, findMeta) {
  const ids = new Set(recipe.ingredients.map(ing => findMeta(ing)?.id || ing.id));
  const notes = [];
  if (RAW_EGG.some(id => ids.has(id))) notes.push("bevat rauw ei" + (ids.has("egg_white") && !ids.has("egg_yolk") ? "wit" : ""));
  if (LACTOSE.some(id => ids.has(id))) notes.push("bevat lactose");
  if (NUTS.some(id => ids.has(id))) notes.push("bevat noten");
  return notes;
}

// ---------- Beschrijving ----------
// Handgeschreven voor de bekendste cocktails; gewone taal, max. twee zinnen.
const DESCRIPTIONS = {
  whiskey_sour: "Fris en zuur, met een zacht schuimlaagje erop. Dé klassieker voor wie van whisky houdt.",
  daiquiri: "Licht, fris en net niet te zoet. Simpel, maar precies goed.",
  margarita: "Pittig en fris, met een zoutrandje dat alles net wat spannender maakt.",
  tommys_margarita: "Een pure margarita met agave in plaats van sinaasappellikeur. Fris, met de tequila goed voorop.",
  mojito: "Fris en licht bruisend, met munt en limoen. Makkelijk weg te drinken.",
  virgin_mojito: "Munt, limoen en bubbels, zonder alcohol. Net zo fris als het origineel.",
  old_fashioned: "Whisky met een vleugje suiker en bitters. Rustig, warm en stevig.",
  negroni: "Bitter, kruidig en een tikje zoet. Voor wie van uitgesproken smaken houdt.",
  boulevardier: "Een negroni met whisky in plaats van gin: wat ronder en warmer.",
  americano: "Campari en vermout, aangelengd met bubbels. Licht bitter en verfrissend.",
  espresso_martini: "Koude koffie, wodka en een romig schuimlaagje. Wakker en lekker tegelijk.",
  aperol_spritz: "Licht bitter, bruisend en oranje. Het terrasdrankje bij uitstek.",
  moscow_mule: "Wodka met gemberbier en limoen. Fris met een pittige gemberkick.",
  dark_n_stormy: "Donkere rum met pittig gemberbier. Kruidig en verfrissend.",
  gin_tonic: "Gin met tonic en veel ijs. Droog, fris en licht bitter.",
  pina_colada: "Romig, zoet en tropisch, met ananas en kokos.",
  virgin_pina_colada: "Ananas en kokos, romig en zoet. Helemaal zonder alcohol.",
  cosmopolitan: "Fris en fruitig met cranberry en limoen. Licht zuur, mooi roze.",
  mai_tai: "Rum met limoen en amandel. Tropisch, maar niet zoetig.",
  manhattan: "Whisky met zoete vermout en bitters. Zacht, rond en stevig.",
  martini: "Gin met een vleugje droge vermout. Strak, koud en puur.",
  vesper: "Gin, wodka en Lillet, ijskoud geserveerd. Strak en stevig.",
  french_75: "Gin en citroen, aangevuld met bubbels. Fris en feestelijk.",
  paloma: "Tequila met grapefruit en een snufje zout. Fris, licht bitter en dorstlessend.",
  caipirinha: "Cachaça met gemuddelde limoen en suiker. Fris, zuur en stevig.",
  tom_collins: "Gin met citroen en bruisend water. Licht, fris en lang.",
  sidecar: "Cognac met sinaasappellikeur en citroen. Fris met een warme ondertoon.",
  paper_plane: "Bourbon, Aperol, amaro en citroen in gelijke delen. Bitterzoet en goed in balans.",
  porn_star_martini: "Vanille en passievrucht, met een glaasje bubbels ernaast. Fruitig en zoet.",
  mint_julep: "Bourbon met verse munt over crushed ijs. Koel, zoet en stevig.",
  white_russian: "Wodka, koffielikeur en room. Zoet, zacht en romig.",
  black_russian: "Wodka met koffielikeur. Zoet, donker en stevig.",
  irish_coffee: "Warme koffie met whiskey en een laag room. Warm en troostend.",
  bramble: "Gin, citroen en braambessenlikeur over crushed ijs. Fris en fruitig.",
  penicillin: "Whisky met honing, gember en citroen. Warm, kruidig en een tikje rokerig.",
  sazerac: "Rye whisky met bitters en een vleugje absint. Kruidig en stevig.",
  last_word: "Gin, groene Chartreuse, maraschino en limoen. Kruidig, fris en uitgesproken.",
  cuba_libre: "Rum met cola en limoen. Simpel en verfrissend.",
  sex_on_the_beach: "Wodka met perzik, sinaasappel en cranberry. Zoet en fruitig.",
  bloody_mary: "Wodka met gekruid tomatensap. Hartig, pittig en fris.",
  zombie: "Twee soorten rum met ananas, limoen en een beetje grenadine. Fruitig en tropisch.",
  singapore_sling: "Gin met kers, ananas en limoen. Fruitig, licht bruisend en lang.",
  gin_fizz: "Gin met citroen, suiker en bruiswater. Licht, fris en schuimig.",
  clover_club: "Gin met framboos en citroen, met een zacht schuimlaagje. Fris en fruitig.",
  pisco_sour: "Pisco met limoen en een dikke schuimkraag. Fris en zijdezacht.",
  amaretto_sour: "Amaretto met citroen. Zoet, fris en een beetje nootachtig.",
  gimlet: "Gin met limoen en een beetje suiker. Strak en fris.",
  bees_knees: "Gin met honing en citroen. Fris, licht zoet en zacht.",
  lemon_drop: "Wodka met citroen en een suikerrandje. Zoet en zuur tegelijk.",
  french_martini: "Wodka met framboos en ananas. Fruitig, zacht en licht schuimig.",
  aviation: "Gin met maraschino, citroen en een vleugje viooltjes. Fris en bloemig.",
  corpse_reviver_2: "Gin, citroen, sinaasappellikeur en Lillet. Fris, droog en licht kruidig.",
  jungle_bird: "Donkere rum met Campari en ananas. Tropisch met een bittere rand.",
  dons_special_daiquiri: "Twee soorten rum met passievrucht en honing. Fruitig en rond.",
  tequila_sunrise: "Tequila met sinaasappel en een laagje grenadine. Zoet en fruitig.",
  gin_basil_smash: "Gin met verse basilicum en citroen. Fris, groen en kruidig.",
  grasshopper: "Muntlikeur, cacao en room. Zoet en romig, als een toetje.",
  brandy_alexander: "Cognac met cacao en room. Romig en zoet, mooi na het eten.",
  alexander: "Gin met cacao en room. Romig en zoet.",
  kir_royale: "Bubbels met een scheutje cassis. Licht, fruitig en feestelijk.",
  mimosa: "Bubbels met sinaasappelsap. Licht en fris.",
  bellini: "Bubbels met perzik. Zacht, fruitig en licht.",
  cinderella: "Sinaasappel, citroen en ananas zonder alcohol. Fris en fruitig.",
  roy_rogers: "Cola met grenadine, zonder alcohol. Zoet en bruisend.",
  mulled_wine: "Warme rode wijn met sinaasappel en kruiden. Zoet en kruidig.",
  hot_toddy: "Warme whisky met honing en citroen. Zacht en verwarmend.",
  godfather: "Whisky met amaretto. Zoet, warm en stevig.",
  rusty_nail: "Whisky met Drambuie. Zoet, kruidig en stevig.",
  rob_roy: "Scotch met zoete vermout en bitters. Rond en stevig.",
  naked_and_famous: "Mezcal, Aperol en gele Chartreuse met limoen. Rokerig, bitterzoet en fris.",
  oaxaca_old_fashioned: "Tequila en mezcal met agave en bitters. Rokerig en stevig.",
  eastside: "Gin met komkommer, munt en limoen. Heel fris en licht.",
  south_side: "Gin met citroen en verse munt. Fris en licht zoet.",
  southside: "Gin met citroen en verse munt. Fris en licht zoet.",
  el_diablo: "Tequila met cassis, limoen en gemberbier. Fruitig en pittig.",
  painkiller: "Donkere rum met ananas, sinaasappel en kokos. Romig en tropisch.",
  hurricane: "Rum met passievrucht en citrus. Zoet, fruitig en stevig.",
  planters_punch: "Donkere rum met citrus en een beetje zoet. Fruitig en warm.",
  blue_lagoon: "Wodka met blauwe curaçao en limonade. Zoet, fris en knalblauw.",
  mudslide: "Wodka, koffielikeur en room. Zoet en romig, als een toetje.",
  b52: "Drie laagjes likeur: koffie, room en sinaasappel. Zoet en klein.",
  lychee_martini: "Wodka met lychee en een vleugje limoen. Zacht, bloemig en fruitig.",
  apple_martini: "Wodka met appellikeur. Fris, zuur en zoet.",
  hanky_panky: "Gin met zoete vermout en Fernet. Kruidig met een bittere afdronk.",
};

// Afgeleide beschrijving voor recepten zonder handgeschreven tekst.
const SPIRIT_WORDS = {
  bourbon: "bourbon", rye: "rye whisky", scotch: "whisky", irish_whiskey: "whiskey",
  white_rum: "rum", dark_rum: "donkere rum", cachaca: "cachaça", gin: "gin", tequila_blanco: "tequila",
  mezcal: "mezcal", vodka: "wodka", vanilla_vodka: "vanillewodka", pisco: "pisco", cognac: "cognac",
  calvados: "calvados", genever: "jenever", grappa: "grappa",
};
function deriveDescription(recipe, findMeta, taste) {
  const ids = recipe.ingredients.map(ing => findMeta(ing)?.id || ing.id);
  const has = (...list) => list.some(id => ids.includes(id));
  const strength = menuStrength(recipe, findMeta).level;

  let first;
  if (has("heavy_cream", "milk", "irish_cream", "coconut_cream", "advocaat")) first = "Romig en zacht";
  else if (has("espresso", "hot_coffee", "coffee_liqueur")) first = "Met koffie, zacht en donker";
  else if (taste.bitter >= 3) first = taste.zoet >= 2 ? "Bitterzoet en kruidig" : "Bitter en kruidig";
  else if (taste.zuur >= 2 && taste.zoet >= 3) first = "Zoet en fris";
  else if (taste.zuur >= 2) first = "Fris en zuur";
  else if (taste.zoet >= 4) first = "Zoet en fruitig";
  else if (has("prosecco", "tonic", "soda_water", "ginger_beer", "ginger_ale", "cola", "lemonade", "grapefruit_soda")) first = "Licht en bruisend";
  else if (strength >= 3) first = "Stevig en puur";
  else first = "Zacht en goed in balans";

  const extras = [];
  if (has("egg_white")) extras.push("met een zacht schuimlaagje erop");
  else if (has("mint")) extras.push("met verse munt");
  else if (has("ginger_beer", "ginger_root", "honey_ginger_syrup")) extras.push("met een pittige gemberkick");
  else if (has("prosecco") && !first.includes("bruisend")) extras.push("aangevuld met bubbels");
  else if (has("chili", "tabasco")) extras.push("met een pittig randje");
  else if (has("basil", "cucumber")) extras.push("met iets fris en groens");
  const sentence1 = `${first}${extras.length ? `, ${extras[0]}` : ""}.`;

  const base = recipe.ingredients
    .map(ing => findMeta(ing))
    .find(meta => meta?.cat === "Sterke drank");
  let sentence2 = "";
  if (strength === 0) sentence2 = "Helemaal zonder alcohol.";
  else if (base && SPIRIT_WORDS[base.id]) sentence2 = `Met ${SPIRIT_WORDS[base.id]} als basis.`;
  return sentence2 ? `${sentence1} ${sentence2}` : sentence1;
}

// ---------- Alles samen per cocktail ----------
export function menuCocktailInfo(recipe, ingredients, taste) {
  const findMeta = (ing) => ingredients.find(x => x.id === ing.id) || null;
  const names = recipe.ingredients.map(ing => shortName(ing, findMeta(ing))).filter(Boolean);
  const glass = (recipe.glass || "").toLowerCase();
  if (glass.includes("zoutrand")) names.push("zoutrandje");
  if (glass.includes("suikerrand")) names.push("suikerrandje");
  return {
    id: recipe.id,
    name: recipe.name,
    ingredientsLine: [...new Set(names)].join(" · "),
    description: DESCRIPTIONS[recipe.id] || deriveDescription(recipe, findMeta, taste || { zoet: 0, zuur: 0, bitter: 0 }),
    strength: menuStrength(recipe, findMeta),
    notes: menuNotes(recipe, findMeta),
  };
}

// ---------- Feestgegevens in de deellink ----------
// Alles staat in de link zelf (?menu=…&t=…&h=…&d=…&a=…): de gast heeft geen
// account, en zo hoeft de feestentabel niet openbaar leesbaar te zijn.
export function partyMenuQuery({ ids, title, host, startsAt, address }) {
  const p = new URLSearchParams();
  p.set("menu", ids.join(","));
  if (title) p.set("t", title);
  if (host) p.set("h", host);
  if (startsAt) p.set("d", startsAt);
  if (address) p.set("a", address);
  return p.toString().replace(/%2C/g, ",");
}
export function readPartyFromSearch(search) {
  const p = new URLSearchParams(search);
  const d = p.get("d");
  const date = d ? new Date(d) : null;
  return {
    title: p.get("t") || "",
    host: p.get("h") || "",
    startsAt: date && !isNaN(date) ? date : null,
    address: p.get("a") || "",
  };
}

// Datum en tijd zoals de host ze bedoelde (Nederlandse tijd), ook als de
// gast in een andere tijdzone zit.
const TZ = "Europe/Amsterdam";
export function formatMenuDate(date, { short = false } = {}) {
  if (!date) return "";
  return date.toLocaleDateString("nl-NL", short
    ? { weekday: "short", day: "numeric", month: "short", timeZone: TZ }
    : { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).replace(/\./g, "");
}
export function formatMenuTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
export function partySubtitle({ host, startsAt }) {
  return [host ? `bij ${host}` : "", formatMenuDate(startsAt), formatMenuTime(startsAt)].filter(Boolean).join(" · ");
}

// ---------- Agenda (.ics) ----------
function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsDate(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
export function buildIcs({ title, startsAt, address, description, url }) {
  const start = startsAt;
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // standaard 4 uur
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mijn Thuisbar//Menukaart//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsDate(start)}-${Math.random().toString(36).slice(2)}@mijnthuisbar`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(title || "Cocktailavond")}`,
    address ? `LOCATION:${icsEscape(address)}` : null,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    url ? `URL:${url}` : null,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}
