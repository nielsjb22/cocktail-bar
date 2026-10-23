// Vult een losse webpagina (/privacy, /voorwaarden) met secties uit
// privacyPolicy.js of termsOfUse.js: kop, tekst, optioneel punten en naTekst.
const el = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; };

export function renderLegalPage({ bijgewerkt, intro, secties, contact }) {
  document.getElementById("datum").textContent = `Laatst bijgewerkt: ${bijgewerkt}`;
  const inhoud = document.getElementById("inhoud");
  inhoud.append(el("p", intro));
  for (const sec of secties) {
    inhoud.append(el("h2", sec.kop));
    if (sec.tekst) inhoud.append(el("p", sec.tekst));
    if (sec.punten?.length) {
      const ul = document.createElement("ul");
      for (const p of sec.punten) ul.append(el("li", p));
      inhoud.append(ul);
    }
    if (sec.naTekst) inhoud.append(el("p", sec.naTekst));
  }
  inhoud.append(el("h2", "Contact"), el("p", contact));
}
