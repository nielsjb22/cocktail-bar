# Mijn Thuisbar

Een cocktail-app voor je eigen thuisbar: houd bij welke drank en ingrediënten je in huis hebt, ontdek cocktails die je daarmee kan maken, check ze in met foto en beoordeling, en plan een feestje inclusief menu, inkooplijst en voorbereiding.

Gebouwd met React + Vite, [Capacitor](https://capacitorjs.com/) (voor de iOS-app) en [Supabase](https://supabase.com/) (login, check-ins, vrienden, feesten).

## Starten

```bash
npm install
npm run dev
```

De app draait dan op `http://localhost:5173`.

### Omgevingsvariabelen

Maak een `.env` bestand aan (zie `.env.example` als die er is, anders zelf aanmaken) met:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...
```

Deze horen bij je eigen Supabase-project en worden nooit gecommit.

## Overige scripts

- `npm run build` — productie-build
- `npm run netlify:zip` — productie-build ingepakt als `thuisbar-netlify.zip`, klaar om naar Netlify te slepen
- `npm run preview` — bekijk de productie-build lokaal
- `npm run ios:sync` — build + synchroniseer met het iOS-project (`ios/`)
- `npm run ios:open` — open het iOS-project in Xcode
- `npm run check:images` — controleer of elke cocktail/drank een lokale foto heeft
