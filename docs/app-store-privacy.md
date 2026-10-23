# App Store Connect: privacy en juridische links

Moet overeenkomen met `ios/App/App/PrivacyInfo.xcprivacy` en met het
privacybeleid (`src/privacyPolicy.js`). Pas alle drie aan als de app
andere gegevens gaat verzamelen.

## Links (App Store Connect → App-informatie)

- Privacybeleid-URL: `https://<jouw-netlify-domein>/privacy/`
- Gebruiksvoorwaarden (EULA): kies "Aangepaste licentieovereenkomst" en plak
  de tekst van `https://<jouw-netlify-domein>/voorwaarden/`, of laat de
  standaard-EULA van Apple staan en zet de link naar /voorwaarden/ in de
  app-beschrijving. De app vraagt zelf al om akkoord bij het registreren.

## App-privacy (App Store Connect → App-privacy)

Vraag "Verzamelt u of uw externe partners gegevens van deze app?": **Ja**.

Voor elk type hieronder:
- Gebruik: **App-functionaliteit** (niets anders aanvinken)
- Gekoppeld aan de identiteit van de gebruiker: **Ja**
- Gebruikt voor tracking: **Nee**

| Categorie (App Store Connect) | Type | Waarom |
|---|---|---|
| Contactgegevens | Naam | accountnaam, zichtbaar voor vrienden |
| Contactgegevens | E-mailadres | inloggen |
| Gebruikerscontent | Foto's of video's | check-in- en profielfoto's, flessen scannen (gaat naar Anthropic) |
| Gebruikerscontent | Overige gebruikerscontent | check-ins, beoordelingen, notities, reacties, eigen recepten, vragen aan de bartender |
| Locatie | Precieze locatie | de plek die je bij een check-in kiest wordt met coördinaten opgeslagen |
| Locatie | Globale locatie | plaatsnaam bij een check-in |
| ID's | Gebruikers-ID | account-ID |
| Zoekgeschiedenis | Zoekgeschiedenis | zoekopdrachten zonder resultaat (om ontbrekende recepten te vinden) |
| Gebruiksgegevens | Productinteractie | aantal AI-vragen per dag (daglimiet), merkkoppelingen |

**Niet** aanvinken: gezondheid, financiële gegevens, contacten, browsegeschiedenis,
diagnostiek, gevoelige gegevens, aankopen, advertentiegegevens, apparaat-ID.

Tracking (App Tracking Transparency): **nee**, de app volgt niemand over apps of
websites heen en bevat geen advertentie- of analyse-SDK.

## Leeftijdsclassificatie

- Alcohol, tabak of drugs (gebruik of verwijzingen): **Vaak/intens** → 18+
- Door gebruikers gegenereerde content: **ja** (met melden, blokkeren en
  moderatie binnen 24 uur)
- Berichten/chat tussen gebruikers: reacties op check-ins → **ja**

## Notities voor de reviewer (App Review-informatie)

Geef een demo-account (e-mail + wachtwoord) met al een vriend en een paar
check-ins, en zet in de notities:

- Leeftijdscheck bij de eerste start; gebruiksvoorwaarden en privacybeleid
  worden geaccepteerd bij het maken van een account.
- Melden en blokkeren: ··· rechtsboven bij een check-in of profiel. Meldingen
  komen bij de beheerder binnen en worden binnen 24 uur bekeken.
- Account verwijderen en gegevens downloaden: Profiel → Instellingen.
- De bartender (AI, Anthropic) werkt pas na expliciete toestemming en is uit
  te zetten in Instellingen.
