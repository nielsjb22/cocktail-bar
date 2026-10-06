// Smaaktest (gastenkant + host-overzicht): alle keuzes op één plek.
// Elke keuze heeft een vaste `key` (wordt opgeslagen) en waar zinnig de
// ingrediënt-id's uit recipes.js, zodat de menusuggesties en de inkooplijst
// er later mee kunnen rekenen. Zelf ingetypte keuzes van gasten worden als
// "~<tekst>" opgeslagen.

export const SURVEY_SPIRITS = [
  { key: "gin", label: "Gin", ids: ["gin"] },
  { key: "wodka", label: "Wodka", ids: ["vodka", "vanilla_vodka"] },
  { key: "witte_rum", label: "Witte rum", ids: ["white_rum", "cachaca"] },
  { key: "donkere_rum", label: "Donkere rum", ids: ["dark_rum"] },
  { key: "whisky", label: "Whisky", ids: ["scotch", "irish_whiskey", "rye"] },
  { key: "bourbon", label: "Bourbon", ids: ["bourbon"] },
  { key: "tequila", label: "Tequila", ids: ["tequila_blanco"] },
  { key: "mezcal", label: "Mezcal", ids: ["mezcal"] },
  { key: "cognac", label: "Cognac", ids: ["cognac", "calvados"] },
  { key: "jenever", label: "Jenever", ids: ["genever"] },
  { key: "pisco", label: "Pisco", ids: ["pisco"] },
];

export const SURVEY_LIQUEURS = [
  { key: "aperol", label: "Aperol", ids: ["aperol"] },
  { key: "campari", label: "Campari", ids: ["campari"] },
  { key: "vermout", label: "Vermout", ids: ["sweet_vermouth", "dry_vermouth"] },
  { key: "limoncello", label: "Limoncello", ids: [] },
  { key: "amaretto", label: "Amaretto", ids: ["amaretto"] },
  { key: "koffielikeur", label: "Koffielikeur", ids: ["coffee_liqueur"] },
  { key: "baileys", label: "Baileys", ids: ["irish_cream"] },
  { key: "triple_sec", label: "Triple sec", ids: ["triple_sec", "grand_marnier"] },
  { key: "chartreuse", label: "Chartreuse", ids: ["green_chartreuse", "yellow_chartreuse"] },
  { key: "sloe_gin", label: "Sloe gin", ids: ["sloe_gin"] },
  { key: "port", label: "Port", ids: ["port"] },
  { key: "sherry", label: "Sherry", ids: ["sherry"] },
  { key: "absint", label: "Absint", ids: ["absinthe"] },
  { key: "bessenlikeur", label: "Bessenlikeur", ids: ["creme_de_cassis", "creme_de_mure", "chambord"] },
];

export const SURVEY_MIXERS = [
  { key: "tonic", label: "Tonic", ids: ["tonic"], group: "bruisend" },
  { key: "gemberbier", label: "Gemberbier", ids: ["ginger_beer"], group: "bruisend" },
  { key: "ginger_ale", label: "Ginger ale", ids: ["ginger_ale"], group: "bruisend" },
  { key: "cola", label: "Cola", ids: ["cola"], group: "bruisend" },
  { key: "soda", label: "Soda", ids: ["soda_water"], group: "bruisend" },
  { key: "prosecco", label: "Prosecco", ids: ["prosecco"], group: "bruisend" },
  { key: "limonade", label: "Limonade", ids: ["lemonade"], group: "bruisend" },
  { key: "sinaasappel", label: "Sinaasappel", ids: ["orange_juice"], group: "sap" },
  { key: "ananas", label: "Ananas", ids: ["pineapple_juice"], group: "sap" },
  { key: "cranberry", label: "Cranberry", ids: ["cranberry_juice"], group: "sap" },
  { key: "grapefruit", label: "Grapefruit", ids: ["grapefruit_juice", "grapefruit_soda"], group: "sap" },
  { key: "passievrucht", label: "Passievrucht", ids: ["passion_fruit_juice", "passion_fruit_puree"], group: "sap" },
  { key: "tomaat", label: "Tomaat", ids: ["tomato_juice"], group: "sap" },
  { key: "kokos", label: "Kokos", ids: ["coconut_cream"], group: "sap" },
];

// `legacy` = de oude smaak-sleutel (fruitig/zoet/zuur/bitter) waar de
// bestaande menusuggesties mee rekenen.
export const SURVEY_TASTES = [
  { key: "fris_zuur", label: "Fris en zuur", legacy: "zuur" },
  { key: "zoet", label: "Zoet", legacy: "zoet" },
  { key: "bitter", label: "Bitter", legacy: "bitter" },
  { key: "fruitig", label: "Fruitig", legacy: "fruitig" },
  { key: "kruidig", label: "Kruidig" },
  { key: "romig", label: "Romig" },
  { key: "rokerig", label: "Rokerig" },
  { key: "pittig", label: "Pittig" },
  { key: "bloemig", label: "Bloemig" },
  { key: "citrus", label: "Citrus", legacy: "zuur" },
  { key: "tropisch", label: "Tropisch", legacy: "fruitig" },
  { key: "koffie", label: "Koffie" },
  { key: "chocolade", label: "Chocolade" },
  { key: "munt", label: "Munt" },
  { key: "gember", label: "Gember" },
];

export const SURVEY_STYLES = [
  { key: "kort_sterk", label: "Kort en sterk", example: "zoals een Old Fashioned", glass: "rocks" },
  { key: "fris_zuur", label: "Fris en zuur", example: "zoals een Daiquiri", glass: "coupe" },
  { key: "lang_bruisend", label: "Lang en bruisend", example: "zoals een Mojito", glass: "highball" },
  { key: "romig", label: "Romig of dessert", example: "zoals een Espresso Martini", glass: "martini" },
  { key: "tropisch", label: "Tropisch", example: "zoals een Piña Colada", glass: "tiki" },
  { key: "bubbels", label: "Bubbels", example: "zoals een French 75", glass: "flute" },
];

export const SURVEY_STRENGTHS = [
  { key: "alcoholvrij", label: "Alcoholvrij", hint: "geen alcohol", level: 0, legacy: 1 },
  { key: "licht", label: "Licht", hint: "zoals een Gin-Tonic", level: 1, legacy: 2 },
  { key: "middel", label: "Middel", hint: "zoals een Margarita", level: 2, legacy: 3 },
  { key: "sterk", label: "Sterk", hint: "zoals een Martini", level: 3, legacy: 5 },
];

export const SURVEY_ALLERGIES = [
  { key: "noten", label: "Noten" },
  { key: "lactose", label: "Lactose" },
  { key: "rauw_ei", label: "Rauw ei" },
  { key: "glutenvrij", label: "Gluten" },
  { key: "vegan", label: "Veganistisch" },
];

export const SURVEY_CHOICE_GROUPS = {
  spirits: SURVEY_SPIRITS,
  liqueurs: SURVEY_LIQUEURS,
  mixers: SURVEY_MIXERS,
  tastes: SURVEY_TASTES,
};

export const CUSTOM_PREFIX = "~";
export function choiceLabel(group, key) {
  if (key.startsWith(CUSTOM_PREFIX)) return key.slice(CUSTOM_PREFIX.length);
  return SURVEY_CHOICE_GROUPS[group]?.find(o => o.key === key)?.label || key;
}

export function emptyAnswers() {
  return {
    v: 1,
    spirits: { like: [], dislike: [] },
    liqueurs: { like: [], dislike: [] },
    mixers: { like: [], dislike: [] },
    tastes: { like: [], dislike: [] },
    styles: [],
    strength: null,
    allergies: [],
    favorites: [],
    note: "",
  };
}

// Oude velden van party_survey_responses, afgeleid uit de nieuwe antwoorden,
// zodat bestaande suggesties/waarschuwingen blijven werken.
const SPIRIT_TO_LEGACY = { gin: "gin", wodka: "wodka", witte_rum: "rum", donkere_rum: "rum", whisky: "whiskey", bourbon: "whiskey", tequila: "tequila", mezcal: "tequila", cognac: "cognac" };
export function legacyFieldsFromAnswers(a) {
  const legacyTaste = (keys) => [...new Set(keys.map(k => SURVEY_TASTES.find(t => t.key === k)?.legacy).filter(Boolean))];
  const strength = SURVEY_STRENGTHS.find(s => s.key === a.strength);
  const favSpirit = a.spirits.like.map(k => SPIRIT_TO_LEGACY[k]).find(Boolean) || null;
  return {
    taste_tags: legacyTaste(a.tastes.like),
    dislike_tags: legacyTaste(a.tastes.dislike),
    strength: strength ? strength.legacy : 3,
    alcohol_free: a.strength === "alcoholvrij",
    favorite_spirit: favSpirit,
    favorite_cocktail_ids: a.favorites,
    dietary: a.allergies,
  };
}

// Ingrediënt-id's die gasten lekker of juist niet lekker vinden (voor de
// menusuggesties); per id het aantal gasten.
export function ingredientPreferenceCounts(responses) {
  const like = {}, dislike = {};
  const add = (target, group, key) => {
    const opt = SURVEY_CHOICE_GROUPS[group]?.find(o => o.key === key);
    (opt?.ids || []).forEach(id => { target[id] = (target[id] || 0) + 1; });
  };
  responses.forEach(r => {
    const a = r.answers;
    if (!a) return;
    ["spirits", "liqueurs", "mixers"].forEach(g => {
      (a[g]?.like || []).forEach(k => add(like, g, k));
      (a[g]?.dislike || []).forEach(k => add(dislike, g, k));
    });
  });
  return { like, dislike };
}

// Telling per keuze over alle reacties: [{ key, label, like, dislike }],
// gesorteerd op meeste "lekker".
export function tallyChoices(responses, group) {
  const map = new Map();
  responses.forEach(r => {
    const g = r.answers?.[group];
    if (!g) return;
    (g.like || []).forEach(k => { const e = map.get(k) || { key: k, label: choiceLabel(group, k), like: 0, dislike: 0 }; e.like++; map.set(k, e); });
    (g.dislike || []).forEach(k => { const e = map.get(k) || { key: k, label: choiceLabel(group, k), like: 0, dislike: 0 }; e.dislike++; map.set(k, e); });
  });
  return [...map.values()].sort((x, y) => y.like - x.like || x.dislike - y.dislike);
}
