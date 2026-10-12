// Losse webpagina /privacy (voor App Store Connect en de webversie); zelfde
// tekst als het scherm in de app, uit privacyPolicy.js.
import { PRIVACY_BIJGEWERKT, PRIVACY_INTRO, PRIVACY_SECTIES, privacyContactTekst } from "./privacyPolicy";

const el = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; };

document.getElementById("datum").textContent = `Laatst bijgewerkt: ${PRIVACY_BIJGEWERKT}`;
const inhoud = document.getElementById("inhoud");
inhoud.append(el("p", PRIVACY_INTRO));
for (const sec of PRIVACY_SECTIES) inhoud.append(el("h2", sec.kop), el("p", sec.tekst));
inhoud.append(el("h2", "Contact"), el("p", privacyContactTekst()));
