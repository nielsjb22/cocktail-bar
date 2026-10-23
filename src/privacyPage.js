// Losse webpagina /privacy (voor App Store Connect en de webversie); zelfde
// tekst als het scherm in de app, uit privacyPolicy.js.
import { PRIVACY_BIJGEWERKT, PRIVACY_INTRO, PRIVACY_SECTIES, privacyContactTekst } from "./privacyPolicy";
import { renderLegalPage } from "./legalPage";

renderLegalPage({ bijgewerkt: PRIVACY_BIJGEWERKT, intro: PRIVACY_INTRO, secties: PRIVACY_SECTIES, contact: privacyContactTekst() });
