// Uitbreiding van de receptenlijst (oktober 2026), in porties. Wordt in
// recipes.js achter de bestaande lijsten geplakt; bestaande id's veranderen
// nooit, zodat check-ins, favorieten en voorraad van gebruikers blijven
// kloppen. Feiten in de verhalen zijn nagelopen (o.a. Wikipedia, Difford's
// Guide, VinePair, Falstaff); waar de herkomst onzeker is, staat dat erbij.

// ---------- Nieuwe ingrediënten ----------
export const EXTRA_INGREDIENTS = [
  { id: "limoncello", name: "Limoncello", cat: "Likeuren & versterkte wijnen", bottleMl: 700, bottlePrice: 12 },
  { id: "elderflower_liqueur", name: "Vlierbloesemlikeur (St-Germain)", cat: "Likeuren & versterkte wijnen", bottleMl: 700, bottlePrice: 30 },
  { id: "licor_43", name: "Licor 43", cat: "Likeuren & versterkte wijnen", bottleMl: 700, bottlePrice: 17 },
  { id: "spiced_rum", name: "Spiced rum", cat: "Sterke drank", bottleMl: 700, bottlePrice: 18 },
  { id: "coconut_rum", name: "Kokosrum (Malibu)", cat: "Likeuren & versterkte wijnen", bottleMl: 700, bottlePrice: 14 },
  { id: "bitter_lemon", name: "Bitter lemon", cat: "Mixers", bottleMl: 1000, bottlePrice: 1.7 },
  { id: "energy_drink", name: "Energiedrank (Red Bull)", cat: "Mixers", bottleMl: 250, bottlePrice: 1.5 },
];

// ---------- Recepten ----------
export const EXTRA_RECIPES = [
  // Portie 1: wat de nieuwe flessen openen
  { id: "limoncello_spritz", name: "Limoncello Spritz", family: "Modern / Tiki", glass: "Wijnglas", ingredients: [{ id: "limoncello", amount: 60, unit: "ml" }, { id: "prosecco", amount: 90, unit: "ml" }, { id: "soda_water", amount: 30, unit: "ml" }, { id: "mint", amount: 3, unit: "stuk", optional: true }], garnish: "Een schijfje citroen en een takje munt.", method: "Bouw over ijs: eerst de limoncello, dan de prosecco, en top rustig met soda." },
  { id: "limoncello_collins", name: "Limoncello Collins", family: "Highballs", glass: "Highball", ingredients: [{ id: "gin", amount: 30, unit: "ml" }, { id: "limoncello", amount: 30, unit: "ml" }, { id: "lemon_juice", amount: 15, unit: "ml" }, { id: "soda_water", amount: 90, unit: "ml" }], garnish: "Een schijfje citroen.", method: "Shake gin, limoncello en citroensap kort met ijs, zeef over vers ijs en top met soda." },
  { id: "hugo", name: "Hugo", family: "Modern / Tiki", glass: "Wijnglas", ingredients: [{ id: "elderflower_cordial", amount: 20, unit: "ml" }, { id: "prosecco", amount: 120, unit: "ml" }, { id: "soda_water", amount: 30, unit: "ml" }, { id: "lime_juice", amount: 10, unit: "ml" }, { id: "mint", amount: 6, unit: "stuk" }], garnish: "Een takje munt en een partje limoen.", method: "Kneus de munt licht met de vlierbloesemsiroop en het limoensap in het glas, vul met ijs, schenk de prosecco erbij en top met soda. Roer één keer voorzichtig." },
  { id: "st_germain_spritz", name: "St-Germain Spritz", family: "Modern / Tiki", glass: "Wijnglas", ingredients: [{ id: "elderflower_liqueur", amount: 40, unit: "ml" }, { id: "prosecco", amount: 60, unit: "ml" }, { id: "soda_water", amount: 60, unit: "ml" }], garnish: "Een reepje citroenschil.", method: "Bouw over ijs: eerst de vlierbloesemlikeur, dan de prosecco en tot slot de soda. Roer één keer." },
  { id: "elderflower_collins", name: "Elderflower Collins", family: "Highballs", glass: "Highball", ingredients: [{ id: "gin", amount: 45, unit: "ml" }, { id: "elderflower_liqueur", amount: 20, unit: "ml" }, { id: "lemon_juice", amount: 20, unit: "ml" }, { id: "sugar_syrup", amount: 5, unit: "ml" }, { id: "soda_water", amount: 90, unit: "ml" }], garnish: "Een schijfje citroen.", method: "Shake gin, vlierbloesemlikeur, citroensap en suikersiroop kort met ijs, zeef over vers ijs en top met soda." },
  { id: "carajillo", name: "Carajillo", family: "Moderne klassiekers", glass: "Rocks", ingredients: [{ id: "licor_43", amount: 45, unit: "ml" }, { id: "espresso", amount: 45, unit: "ml" }], garnish: "Een paar koffiebonen of een reepje sinaasappelschil.", method: "Shake de Licor 43 en de vers gezette espresso stevig met ijs tot er een schuimlaagje ontstaat, en zeef over vers ijs." },
  { id: "vodka_red_bull", name: "Vodka Red Bull", family: "Highballs", glass: "Highball", ingredients: [{ id: "vodka", amount: 40, unit: "ml" }, { id: "energy_drink", amount: 150, unit: "ml" }], garnish: "Een schijfje limoen, als je wilt.", method: "Vul een highball met ijs, schenk de wodka erin en top met goed gekoelde energiedrank. Roer één keer." },
  { id: "malibu_pineapple", name: "Malibu Pineapple", family: "Highballs", glass: "Highball", ingredients: [{ id: "coconut_rum", amount: 50, unit: "ml" }, { id: "pineapple_juice", amount: 120, unit: "ml" }], garnish: "Een partje ananas.", method: "Bouw over ijs en roer kort." },
  { id: "malibu_sunset", name: "Malibu Sunset", family: "Highballs", glass: "Highball", ingredients: [{ id: "coconut_rum", amount: 50, unit: "ml" }, { id: "orange_juice", amount: 100, unit: "ml" }, { id: "grenadine", amount: 10, unit: "ml" }], garnish: "Een schijfje sinaasappel en een cocktailkers.", method: "Bouw de kokosrum en het sinaasappelsap over ijs en roer. Giet de grenadine er langzaam in zodat hij naar de bodem zakt." },
  { id: "bahama_mama", name: "Bahama Mama", family: "Modern / Tiki", glass: "Hurricane", ingredients: [{ id: "dark_rum", amount: 30, unit: "ml" }, { id: "coconut_rum", amount: 30, unit: "ml" }, { id: "orange_juice", amount: 60, unit: "ml" }, { id: "pineapple_juice", amount: 60, unit: "ml" }, { id: "lime_juice", amount: 10, unit: "ml" }, { id: "grenadine", amount: 10, unit: "ml" }], garnish: "Een partje ananas en een cocktailkers.", method: "Shake alles stevig met ijs en giet over vers ijs in een groot glas." },
  { id: "spiced_rum_cola", name: "Spiced Rum Cola", family: "Highballs", glass: "Highball", ingredients: [{ id: "spiced_rum", amount: 50, unit: "ml" }, { id: "cola", amount: 150, unit: "ml" }], garnish: "Een partje limoen, uitgeknepen boven het glas.", method: "Bouw over ijs en roer kort." },
  { id: "spiced_mule", name: "Spiced Mule", family: "Highballs", glass: "Koperen beker", ingredients: [{ id: "spiced_rum", amount: 50, unit: "ml" }, { id: "lime_juice", amount: 15, unit: "ml" }, { id: "ginger_beer", amount: 120, unit: "ml" }], garnish: "Een partje limoen en een takje munt.", method: "Bouw over ijs: rum en limoensap eerst, dan het gemberbier. Roer kort." },
  { id: "gin_bitter_lemon", name: "Gin & Bitter Lemon", family: "Highballs", glass: "Highball", ingredients: [{ id: "gin", amount: 50, unit: "ml" }, { id: "bitter_lemon", amount: 150, unit: "ml" }], garnish: "Een schijfje citroen.", method: "Bouw over veel ijs en roer kort." },
  { id: "vodka_bitter_lemon", name: "Vodka Bitter Lemon", family: "Highballs", glass: "Highball", ingredients: [{ id: "vodka", amount: 50, unit: "ml" }, { id: "bitter_lemon", amount: 150, unit: "ml" }], garnish: "Een schijfje citroen.", method: "Bouw over veel ijs en roer kort." },
];


export const EXTRA_FUN_FACTS = {
  hugo: "De bedenker wilde hem bijna 'Otto' noemen.",
  st_germain_spritz: "Barmannen noemen St-Germain ook wel 'bartender's ketchup': het past bij bijna alles.",
  carajillo: "Licor 43 heet zo omdat er 43 ingrediënten in zitten; slechts een paar zijn bekend, zoals vanille en citrus.",
  vodka_red_bull: "Red Bull is gebaseerd op het Thaise Krating Daeng: 'daeng' betekent rood en een 'krating' is een gaur, een groot wild rund.",
  gin_bitter_lemon: "Het bittertje in bitter lemon komt van kinine, hetzelfde als in tonic.",
  limoncello_spritz: "Voor goede limoncello gebruikt men alleen de schil van de citroen, niet het sap.",
};


