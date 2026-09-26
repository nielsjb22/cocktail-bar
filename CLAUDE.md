## Doel: iOS App Store (via Capacitor), later Android
- Stack blijft React + Vite + Capacitor + Supabase. Niet overstappen op Expo/React Native.
- Het iOS-platform bestaat (npx cap add ios) en na elke grote wijziging: npm run build && npx cap sync ios.
- Geen belangrijke data in localStorage; gebruik @capacitor/preferences of Supabase.
- Geen externe afbeeldingen (Unsplash) of CDN-fonts; alles lokaal in de app bundelen.
- Externe links openen via @capacitor/browser.
- Geen server.url naar Netlify in capacitor.config voor productie.
- Geen nieuwe web-push; notificaties later via @capacitor/push-notifications.
- Verplicht voor Apple, meebouwen: account verwijderen in de app, content melden, gebruikers blokkeren, link naar privacybeleid, leeftijdsbevestiging 18+.
- Recepten en cursus moeten zonder account te gebruiken zijn.
- Werk met git: commit na elke afgeronde functie.

## Afbeeldingen – zoekregels
Toegestane bronnen, in deze volgorde:
1. Pexels API (PEXELS_API_KEY in .env)
2. Pixabay API (PIXABAY_API_KEY in .env)
3. Unsplash (Unsplash License)
4. Openverse API (api.openverse.org) – alleen CC0, CC BY, CC BY-SA
5. Wikimedia Commons API – alleen CC0, CC BY, CC BY-SA, public domain
NIET gebruiken: Google Afbeeldingen, Pinterest, Instagram, TheCocktailDB, foto's van drankwinkels (o.a. drankdozijn) of merkwebsites, AI-gegenereerde foto's die echt lijken.

Per cocktail, drie niveaus:
- exact: foto van precies deze cocktail. Zoek op Engelse naam + "cocktail", ook alternatieve namen.
- passend: geen exacte foto? Kies een foto die klopt met het recept: juiste glas (coupe, rocks, highball, martini, tiki enz.), juiste kleur, juiste garnering, wel/geen ijs.
- illustratie: niets passends? Maak een eigen SVG/WebP-illustratie in één vaste app-stijl op basis van glastype + kleur van de drank + garnering. Nooit leeg laten.
Controleer ELKE gekozen foto door hem te openen en te bekijken: klopt glas en kleur, geen tekst/watermerk, geen herkenbare personen, geen prominente merklogo's.

Per drank (voorraad): generieke foto van de drank of fles ZONDER duidelijk leesbaar merketiket, of een illustratie van het flestype in de app-stijl. Geen productfoto's van winkels.

Bij CC BY / CC BY-SA altijd maker + licentie in images.json.

## Afbeeldingen – infrastructuur (voor Claude, niet opnieuw opzetten)
- Catalogus: src/data/images.json, één entry per cocktail/drank-id (`type`, `bestand`, `bronUrl`, `maker`, `licentie`, `niveau`). Bijwerken met `npm run sync:images-catalog` als er nieuwe recepten/ingrediënten bijkomen.
- Bestanden: src/assets/images/cocktails/{id}.webp en src/assets/images/dranken/{id}.webp, max 800px breed, streef < 120 KB (harde grens 200 KB).
- Component: gebruik `<ItemImage id type photoUrl size radius tint filter fallback />` (of de bestaande wrappers `RecipeCircle`/`ItemArt` die er al doorheen lopen) — nooit een los `<img src={recipe.image}>` erbij verzinnen, anders mist die plek de lokale foto-override.
- Zoeken/downloaden: `node scripts/fetch-image.mjs search --source <bron> --query "..."` om te zoeken, dan `node scripts/fetch-image.mjs save --type <cocktail|drank> --id <id> --source <bron> --query "..." --index <n> --niveau <exact|passend|illustratie>` om te downloaden, naar WebP te converteren en images.json bij te werken.
- Controle: `npm run check:images` (exit 0 alleen bij "MISSING: 0").
- Fotoverantwoording (Profiel → Instellingen → Fotoverantwoording) leest images.json automatisch uit — niets handmatig bijhouden.
