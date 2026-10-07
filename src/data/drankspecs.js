// Specificatie per drank uit de "Drankwinkel"-groep van de boodschappenlijst:
// wat voor fles het MOET zijn om in onze recepten te kloppen. Dit is de
// maatstaf waarmee flessen in de Supabase-tabel `producten` worden
// goedgekeurd (en wat het scherm "Fles kiezen" als uitleg toont). Hier
// staan bewust géén productlinks of prijzen: die komen alleen uit
// goedgekeurde rijen in `producten`, nooit uit een gok.
//
// omschrijving = korte regel onder de naam; eis = waar een fles aan moet
// voldoen (en wat níet goed is).
export const DRANK_SPECS = {
  // Sterke drank
  bourbon: { omschrijving: "Amerikaanse whiskey van minstens 51% maïs", eis: "Straight bourbon uit de VS, 40–50%. Geen 'American whiskey' of Tennessee whiskey met een andere naam, geen gearomatiseerde (honing, kers) varianten." },
  rye: { omschrijving: "Amerikaanse whiskey van minstens 51% rogge", eis: "Echte rye whiskey (label 'Rye Whiskey', min. 51% rogge). Geen Canadese blend die 'rye' heet maar weinig rogge bevat, geen bourbon." },
  scotch: { omschrijving: "Blended Scotch whisky", eis: "Blended Scotch whisky uit Schotland, niet rokerig-Islay als hoofdsmaak. Geen single malt nodig; geen whisky-likeur." },
  irish_whiskey: { omschrijving: "Ierse whiskey", eis: "Irish whiskey (blend is prima). Geen Irish cream of gearomatiseerde varianten." },
  white_rum: { omschrijving: "Lichte, ongerijpte of licht gefilterde rum", eis: "Witte/lichte rum, 37,5–40%. Geen spiced rum, geen kokosrum (zoals Malibu), geen overproof." },
  dark_rum: { omschrijving: "Donkere, gerijpte rum", eis: "Donkere of gerijpte rum, 40%. Geen spiced rum en geen rum-likeur." },
  cachaca: { omschrijving: "Braziliaanse suikerrietbrandewijn", eis: "Cachaça uit Brazilië (prata/witte is standaard voor Caipirinha). Geen rum." },
  gin: { omschrijving: "London Dry gin", eis: "London Dry gin met jeneverbes voorop, 37,5–47%. Geen gearomatiseerde/roze gin, geen sloe gin, geen jenever." },
  tequila_blanco: { omschrijving: "100% agave tequila, blanco", eis: "Tequila blanco (plata/silver) van 100% blauwe agave — staat zo op het etiket. Geen 'mixto' zonder 100% agave, geen gold/reposado." },
  mezcal: { omschrijving: "Mezcal uit Mexico", eis: "Mezcal (joven/espadín). Geen tequila, geen mezcal-likeur." },
  vanilla_vodka: { omschrijving: "Wodka met vanillesmaak", eis: "Wodka op smaak gebracht met vanille (vanillewodka). Geen gewone wodka en geen vanillelikeur." },
  vodka: { omschrijving: "Neutrale wodka", eis: "Pure wodka zonder smaak, 37,5–40%. Geen gearomatiseerde varianten (citroen, vanille enz.)." },
  pisco: { omschrijving: "Peruaanse of Chileense druivenbrandewijn", eis: "Pisco (Peruaans 'quebranta' of acholado is klassiek voor Pisco Sour). Geen grappa." },
  cognac: { omschrijving: "Cognac of Franse brandy", eis: "Cognac VS/VSOP (of vergelijkbare Franse druivenbrandy). Geen brandy-likeur, geen vruchtenbrandewijn." },
  calvados: { omschrijving: "Appelbrandewijn uit Normandië", eis: "Calvados (AOC). Geen appellikeur of 'apple brandy'-likeur." },
  genever: { omschrijving: "Nederlandse jenever", eis: "Jonge of oude graanjenever. Geen gin, geen vruchtenjenever/bessenjenever." },
  grappa: { omschrijving: "Italiaanse druivenbrandewijn", eis: "Grappa (bianca). Geen grappa-likeur." },

  // Likeuren & versterkte wijnen
  triple_sec: { omschrijving: "Heldere sinaasappellikeur", eis: "Triple sec of Cointreau (heldere sinaasappellikeur, ± 30–40%). Geen Grand Marnier (cognacbasis) en geen blue curaçao." },
  grand_marnier: { omschrijving: "Sinaasappellikeur op cognacbasis", eis: "Alleen Grand Marnier Cordon Rouge. Geen andere Grand Marnier-varianten en geen goedkope triple sec." },
  sweet_vermouth: { omschrijving: "Rode zoete vermout", eis: "Rode (rosso) zoete vermout, bv. Italiaanse stijl. Geen droge/witte vermout, geen bianco." },
  dry_vermouth: { omschrijving: "Droge witte vermout", eis: "Droge (extra) dry vermout. Geen bianco (die is zoet) en geen rode vermout." },
  campari: { omschrijving: "Italiaanse bitter", eis: "Campari Bitter. Geen Campari-soda in blik, geen andere bitter onder de naam Campari." },
  aperol: { omschrijving: "Italiaanse aperitief-bitter", eis: "Aperol. Geen kant-en-klare Aperol Spritz." },
  amaro_nonino: { omschrijving: "Italiaanse amaro op grappabasis", eis: "Amaro Nonino Quintessentia. Geen andere amaro." },
  cynar: { omschrijving: "Italiaanse artisjok-amaro", eis: "Cynar (de gewone, 16,5%)." },
  suze: { omschrijving: "Franse gentiaanbitter", eis: "Suze of een andere gentiaanlikeur (zoals Salers of Avèze). Geen Campari of Aperol: die zijn rood en zoeter." },
  fernet_branca: { omschrijving: "Bittere Italiaanse kruidenlikeur", eis: "Fernet-Branca (niet Branca Menta)." },
  yellow_chartreuse: { omschrijving: "Franse kruidenlikeur, geel", eis: "Chartreuse Jaune (geel). Geen groene." },
  green_chartreuse: { omschrijving: "Franse kruidenlikeur, groen", eis: "Chartreuse Verte (groen). Geen gele." },
  maraschino_liqueur: { omschrijving: "Heldere kersenlikeur", eis: "Maraschino-likeur (helder, bv. Luxardo). Geen cherry brandy (die is rood en zoet)." },
  coffee_liqueur: { omschrijving: "Koffielikeur", eis: "Koffielikeur (bv. Kahlúa-stijl). Geen koffie-crème of room-likeur." },
  creme_de_mure: { omschrijving: "Braambessenlikeur", eis: "Crème de mûre. Geen cassis." },
  creme_de_cassis: { omschrijving: "Zwarte-bessenlikeur", eis: "Crème de cassis. Geen bessenjenever, geen mûre." },
  creme_de_cacao: { omschrijving: "Cacaolikeur, wit", eis: "Crème de cacao blanc (wit/helder). De bruine smaakt hetzelfde maar kleurt de cocktail." },
  creme_de_menthe: { omschrijving: "Pepermuntlikeur", eis: "Crème de menthe (groen voor Grasshopper, wit voor Stinger)." },
  creme_de_violette: { omschrijving: "Viooltjeslikeur", eis: "Crème de violette (likeur). Geen siroop." },
  chambord: { omschrijving: "Frambozenlikeur", eis: "Chambord of een vergelijkbare crème de framboise. Geen siroop." },
  amaretto: { omschrijving: "Amandellikeur", eis: "Amaretto. Geen amandelsiroop (orgeat)." },
  frangelico: { omschrijving: "Hazelnootlikeur", eis: "Frangelico of vergelijkbare hazelnootlikeur." },
  galliano: { omschrijving: "Italiaanse vanille-anijslikeur", eis: "Galliano L'Autentico (geel). Geen Galliano Ristretto." },
  sour_apple_liqueur: { omschrijving: "Zure appellikeur", eis: "Sour apple-likeur (groen). Geen calvados." },
  lychee_liqueur: { omschrijving: "Lycheelikeur", eis: "Lycheelikeur. Geen siroop." },
  blue_curacao: { omschrijving: "Blauwe sinaasappellikeur", eis: "Blue curaçao (likeur, niet de alcoholvrije siroop)." },
  sloe_gin: { omschrijving: "Sleedoornbessenlikeur op gin", eis: "Sloe gin. Geen gewone gin, geen bessenjenever." },
  pimms: { omschrijving: "Engelse gin-aperitief", eis: "Pimm's No. 1 Cup. Geen kant-en-klare blikjes." },
  advocaat: { omschrijving: "Eierlikeur", eis: "Advocaat (eierlikeur)." },
  ginger_wine: { omschrijving: "Gemberwijn", eis: "Ginger wine. Geen gemberlikeur of gemberbier." },
  drambuie: { omschrijving: "Whiskylikeur met honing", eis: "Drambuie." },
  apricot_brandy: { omschrijving: "Abrikozenlikeur", eis: "Apricot brandy (abrikozenlikeur)." },
  cherry_brandy: { omschrijving: "Kersenlikeur", eis: "Cherry brandy (rode kersenlikeur). Geen maraschino, geen kirsch." },
  benedictine: { omschrijving: "Franse kruidenlikeur", eis: "Bénédictine D.O.M. Geen B&B (dat is al gemengd met cognac)." },
  falernum: { omschrijving: "Caribische kruidenlikeur", eis: "Velvet falernum (likeur, met alcohol). Geen falernum-siroop." },
  allspice_liqueur: { omschrijving: "Pimentlikeur", eis: "Allspice dram / pimento dram." },
  passion_fruit_liqueur: { omschrijving: "Passievruchtlikeur", eis: "Passievruchtlikeur (bv. Passoã-stijl). Geen siroop." },
  port: { omschrijving: "Rode port (ruby)", eis: "Ruby port. Geen witte port of tawny." },
  sherry: { omschrijving: "Droge sherry", eis: "Fino of amontillado (droog). Geen cream sherry." },
  lillet_blanc: { omschrijving: "Frans aperitief op wijnbasis", eis: "Lillet Blanc. Geen Lillet Rosé of Rouge." },
  absinthe: { omschrijving: "Anijsdistillaat", eis: "Absint. Geen pastis of anijslikeur." },
  irish_cream: { omschrijving: "Ierse roomlikeur", eis: "Irish cream (bv. Baileys Original). Geen gearomatiseerde varianten." },
  creme_de_noyaux: { omschrijving: "Roze amandellikeur", eis: "Crème de noyaux (roze). Geen amaretto." },
  banana_liqueur: { omschrijving: "Bananenlikeur", eis: "Crème de banane / bananenlikeur." },
  melon_liqueur: { omschrijving: "Meloenlikeur", eis: "Groene meloenlikeur (bv. Midori)." },
  peach_schnapps: { omschrijving: "Perziklikeur", eis: "Peach schnapps / perziklikeur. Geen perzikpuree of -siroop." },

  // Bitters
  angostura: { omschrijving: "Aromatische bitters", eis: "Angostura Aromatic Bitters. Geen Angostura Orange of Amaro di Angostura." },
  peychauds: { omschrijving: "Anijsachtige bitters uit New Orleans", eis: "Peychaud's Aromatic Cocktail Bitters." },
  orange_bitters: { omschrijving: "Sinaasappelbitters", eis: "Orange bitters (dash-flesje). Geen sinaasappellikeur." },

  // Wijn e.d. uit de drankwinkel
  prosecco: { omschrijving: "Droge mousserende wijn", eis: "Prosecco brut of extra dry, of champagne/cava brut. Geen zoete (dolce) mousserende wijn." },
  white_wine: { omschrijving: "Droge witte wijn", eis: "Droge witte wijn." },
  red_wine: { omschrijving: "Rode wijn", eis: "Droge, fruitige rode wijn." },
  sake: { omschrijving: "Japanse rijstwijn", eis: "Sake (junmai is prima)." },
};

// Welke boodschappen je in de drankwinkel haalt (met link naar Drankdozijn)
// en welke in de supermarkt (géén Drankdozijn-link).
const DRANKWINKEL_CATS = new Set(["Sterke drank", "Likeuren & versterkte wijnen", "Bitters"]);
const DRANKWINKEL_EXTRA = new Set(["prosecco", "white_wine", "red_wine", "sake", "peach_schnapps"]);
export function shopGroupFor(meta) {
  if (!meta) return "supermarkt";
  if (DRANKWINKEL_CATS.has(meta.cat) || DRANKWINKEL_EXTRA.has(meta.id)) return "drankwinkel";
  return "supermarkt";
}
