// Vervangers per ingrediënt: "Kan ik dit maken zonder …?".
// Vaste, handmatig gecontroleerde tabel (geen AI), zodat het antwoord altijd
// hetzelfde en gratis is. Per vervanger: [id, factor, wat er verandert].
//   factor = hoeveelheid t.o.v. het origineel (0.8 = 20% minder)
// Volgorde = voorkeur; in de app komt wat je in huis hebt bovenaan.
// Alleen vervangers die in een gewone cocktail echt werken: geen vervanger
// is beter dan een slechte.
export const SUBSTITUTES = {
  // Vers en siropen
  lime_juice: [["lemon_juice", 1, "Iets zachter en minder tropisch; werkt in de meeste sours."]],
  lemon_juice: [["lime_juice", 1, "Scherper en tropischer van smaak."]],
  sugar_syrup: [
    ["agave_nectar", 0.75, "Zoeter, dus iets minder. Zachte, ronde smaak."],
    ["honey_syrup", 1, "Geeft een zachte honingtoon."],
    ["vanilla_syrup", 1, "Met vanille; past vooral bij rum en whisky."],
  ],
  honey_syrup: [
    ["sugar_syrup", 1, "Neutraler: je mist de honingtoon."],
    ["agave_nectar", 0.75, "Zoeter en zonder honing, dus iets minder."],
  ],
  agave_nectar: [
    ["sugar_syrup", 1.25, "Minder zoet, dus iets meer. Neutralere smaak."],
    ["honey_syrup", 1, "Met een honingtoon in plaats van agave."],
  ],
  vanilla_syrup: [["sugar_syrup", 1, "Zelfde zoetheid, zonder vanille."]],
  pear_syrup: [["sugar_syrup", 1, "Zelfde zoetheid, zonder de peer."]],
  frozen_strawberries: [["strawberry", 1, "Verse aardbeien: blend met een extra handje ijs, anders wordt hij te dun."]],
  grenadine: [
    ["raspberry_syrup", 1, "Fruitiger en naar framboos, met bijna dezelfde kleur."],
    ["creme_de_cassis", 0.75, "Donkerder en naar zwarte bes, met een beetje alcohol."],
  ],
  raspberry_syrup: [
    ["grenadine", 1, "Minder framboos, meer granaatappel."],
    ["chambord", 1, "Met alcohol en voller van smaak."],
  ],
  orgeat: [["amaretto", 1, "Met alcohol en minder zoet; voeg eventueel wat suikersiroop toe."]],
  falernum: [["orgeat", 0.75, "Amandel in plaats van limoen, gember en kruidnagel. Zoeter, dus iets minder."]],
  elderflower_cordial: [["elderflower_liqueur", 1, "Met alcohol en iets minder zoet."]],
  passion_fruit_puree: [
    ["passion_fruit_juice", 1, "Dunner en minder intens."],
    ["passion_fruit_liqueur", 1, "Zoeter en met alcohol; gebruik iets minder suikersiroop."],
  ],
  passion_fruit_juice: [["passion_fruit_puree", 0.75, "Dikker en intenser, dus iets minder."]],
  mint: [["basil", 1, "Kruidiger en een beetje anijsachtig in plaats van fris."]],
  basil: [["mint", 1, "Frisser en minder kruidig."]],
  heavy_cream: [["milk", 1, "Dunner en minder romig."]],
  milk: [["heavy_cream", 0.75, "Romiger en voller, dus iets minder."]],
  espresso: [["hot_coffee", 1, "Minder sterk en minder schuim."]],

  // Sterke drank
  gin: [
    ["genever", 1, "Mouteriger en voller; past goed in klassiekers."],
    ["vodka", 1, "Neutraler: je mist de jeneverbes en de kruiden."],
  ],
  genever: [["gin", 1, "Lichter en kruidiger, minder mout."]],
  vodka: [
    ["gin", 1, "Krijgt een kruidige jeneverbessmaak."],
    ["white_rum", 1, "Iets zoeter en ronder."],
  ],
  vanilla_vodka: [["vodka", 1, "Zonder vanille: vervang een deel van de suikersiroop door vanillesiroop als je die hebt."]],
  white_rum: [
    ["cachaca", 1, "Grassiger en uitgesprokener."],
    ["dark_rum", 1, "Voller, met karamel; de cocktail wordt donkerder."],
    ["vodka", 1, "Neutraler en minder zoet."],
  ],
  dark_rum: [
    ["spiced_rum", 1, "Met kaneel en vanille, iets zoeter."],
    ["white_rum", 1, "Lichter, minder karamel en hout."],
  ],
  spiced_rum: [["dark_rum", 1, "Zonder kaneel en vanille, wat droger."]],
  coconut_rum: [["white_rum", 1, "Zonder kokos; voeg eventueel een scheutje kokosroom toe."]],
  cachaca: [["white_rum", 1, "Lichter en minder grassig."]],
  tequila_blanco: [["mezcal", 1, "Rokerig: een andere, maar vaak heel lekkere cocktail."]],
  mezcal: [["tequila_blanco", 1, "Zonder rook, frisser en lichter."]],
  bourbon: [
    ["rye", 1, "Kruidiger en droger."],
    ["irish_whiskey", 1, "Zachter en lichter."],
    ["scotch", 1, "Mouteriger en minder zoet."],
  ],
  rye: [
    ["bourbon", 1, "Zoeter en ronder, met meer vanille."],
    ["scotch", 1, "Mouteriger en minder pittig."],
  ],
  scotch: [
    ["irish_whiskey", 1, "Zachter, zonder rooktoon."],
    ["bourbon", 1, "Zoeter, met vanille en karamel."],
  ],
  irish_whiskey: [
    ["scotch", 1, "Mouteriger, soms licht rokerig."],
    ["bourbon", 1, "Zoeter, met vanille."],
  ],
  cognac: [
    ["calvados", 1, "Frisser en naar appel."],
    ["bourbon", 1, "Zoeter, met vanille in plaats van druif."],
  ],
  calvados: [["cognac", 1, "Minder appel, meer druif en hout."]],
  pisco: [
    ["cognac", 1, "Voller en houtiger, minder bloemig."],
    ["grappa", 1, "Steviger en droger."],
  ],

  // Likeuren en versterkte wijnen
  triple_sec: [
    ["grand_marnier", 0.8, "Iets zoeter en ronder, met cognac erin."],
    ["blue_curacao", 1, "Zelfde sinaasappelsmaak, maar je cocktail wordt blauw."],
  ],
  grand_marnier: [["triple_sec", 1, "Lichter en frisser, zonder cognac."]],
  blue_curacao: [["triple_sec", 1, "Zelfde smaak, zonder de blauwe kleur."]],
  sweet_vermouth: [["port", 1, "Zoeter en fruitiger, minder kruidig."]],
  dry_vermouth: [
    ["lillet_blanc", 1, "Zachter en fruitiger."],
    ["sherry", 1, "Droger en nootachtig (gebruik een droge fino)."],
  ],
  lillet_blanc: [["dry_vermouth", 1, "Droger en kruidiger; een paar druppels orange bitters helpen."]],
  sherry: [["dry_vermouth", 1, "Kruidiger, minder nootachtig."]],
  port: [["sweet_vermouth", 1, "Kruidiger en minder zoet."]],
  campari: [["aperol", 1, "Zoeter, lichter en minder bitter."]],
  aperol: [["campari", 0.75, "Bitterder en droger, dus iets minder."]],
  amaro_nonino: [["aperol", 1, "Lichter en fruitiger, minder kruidig."]],
  cynar: [["campari", 1, "Bitterder en roder, zonder de artisjoktoon."]],
  fernet_branca: [["amaro_nonino", 1, "Zachter, minder munt en minder bitter."]],
  green_chartreuse: [["yellow_chartreuse", 1, "Zoeter en zachter, minder kruidig."]],
  yellow_chartreuse: [
    ["benedictine", 1, "Zachter, met honing en kruiden."],
    ["green_chartreuse", 0.75, "Sterker en kruidiger, dus iets minder."],
  ],
  benedictine: [
    ["yellow_chartreuse", 1, "Kruidiger en iets sterker."],
    ["drambuie", 1, "Honing en whisky in plaats van kruiden."],
  ],
  drambuie: [["benedictine", 1, "Kruidiger, minder whisky."]],
  maraschino_liqueur: [["cherry_brandy", 1, "Zoeter en meer naar kers, minder bloemig."]],
  cherry_brandy: [["maraschino_liqueur", 1, "Droger en bloemiger, minder kers."]],
  apricot_brandy: [["peach_schnapps", 1, "Perzik in plaats van abrikoos, lichter."]],
  peach_schnapps: [["apricot_brandy", 1, "Abrikoos in plaats van perzik, voller."]],
  amaretto: [
    ["frangelico", 1, "Hazelnoot in plaats van amandel."],
    ["orgeat", 0.75, "Zonder alcohol en zoeter, dus iets minder."],
  ],
  frangelico: [["amaretto", 1, "Amandel in plaats van hazelnoot."]],
  galliano: [["licor_43", 1, "Vanille en citrus, minder anijs."]],
  licor_43: [["galliano", 1, "Kruidiger, met anijs."]],
  coffee_liqueur: [["espresso", 1, "Minder zoet en zonder alcohol; voeg 10 ml suikersiroop toe."]],
  creme_de_cassis: [
    ["creme_de_mure", 1, "Braam in plaats van zwarte bes."],
    ["chambord", 1, "Framboos, iets zoeter."],
  ],
  creme_de_mure: [
    ["creme_de_cassis", 1, "Zwarte bes in plaats van braam."],
    ["chambord", 1, "Framboos in plaats van braam."],
  ],
  chambord: [
    ["creme_de_cassis", 1, "Zwarte bes in plaats van framboos."],
    ["creme_de_mure", 1, "Braam in plaats van framboos."],
  ],
  elderflower_liqueur: [["elderflower_cordial", 0.75, "Zonder alcohol en zoeter, dus iets minder."]],
  melon_liqueur: [["sour_apple_liqueur", 1, "Appel in plaats van meloen, ook groen."]],
  peychauds: [["angostura", 1, "Kruidiger, minder anijs en minder rood."]],
  angostura: [
    ["orange_bitters", 1, "Frisser, met sinaasappel in plaats van kruiden."],
    ["peychauds", 1, "Lichter, met anijs."],
  ],
  orange_bitters: [["angostura", 1, "Kruidiger, minder sinaasappel."]],

  // Bubbels en mixers
  prosecco: [["cider", 1, "Appel in plaats van druif, maar wel met bubbels."]],
  cider: [["prosecco", 1, "Droger, met druif in plaats van appel."]],
  white_wine: [["rose_wine", 1, "Fruitiger; de kleur wordt roze."]],
  rose_wine: [["white_wine", 1, "Minder fruitig en lichter van kleur."]],
  soda_water: [
    ["tonic", 1, "Bitterder en zoeter."],
    ["lemonade", 1, "Zoeter en naar citroen; gebruik iets minder suikersiroop."],
  ],
  tonic: [
    ["bitter_lemon", 1, "Met citroen en wat zoeter."],
    ["soda_water", 1, "Niet bitter en niet zoet."],
  ],
  bitter_lemon: [["tonic", 1, "Zonder citroen, iets bitterder."]],
  lemonade: [["soda_water", 1, "Niet zoet en zonder citroen; voeg eventueel wat suikersiroop toe."]],
  grapefruit_soda: [["lemonade", 1, "Citroen in plaats van grapefruit."]],
  grapefruit_juice: [["grapefruit_soda", 1, "Zoeter en met bubbels."]],
  ginger_beer: [["ginger_ale", 1, "Minder pittig en wat zoeter."]],
  ginger_ale: [["ginger_beer", 1, "Pittiger en minder zoet."]],
};

// Vervangers voor één ingrediënt, wat je in huis hebt eerst.
export function substitutesFor(id, isOwnedId) {
  const list = SUBSTITUTES[id] || [];
  return list
    .map(([sub, factor, zin], i) => ({ id: sub, factor, zin, owned: isOwnedId(sub), i }))
    .sort((a, b) => (b.owned - a.owned) || (a.i - b.i));
}

// Hoeveelheid van de vervanger, netjes afgerond (ml op 5, rest op hele of halve).
export function substituteAmount(amount, unit, factor) {
  if (typeof amount !== "number") return amount;
  const v = amount * factor;
  if (factor === 1) return amount;
  if (unit === "ml") return Math.max(5, Math.round(v / 5) * 5);
  return Math.max(0.5, Math.round(v * 2) / 2);
}
