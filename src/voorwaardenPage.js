// Losse webpagina /voorwaarden; zelfde tekst als het scherm in de app, uit termsOfUse.js.
import { VOORWAARDEN_BIJGEWERKT, VOORWAARDEN_INTRO, VOORWAARDEN_SECTIES, voorwaardenContactTekst } from "./termsOfUse";
import { renderLegalPage } from "./legalPage";

renderLegalPage({ bijgewerkt: VOORWAARDEN_BIJGEWERKT, intro: VOORWAARDEN_INTRO, secties: VOORWAARDEN_SECTIES, contact: voorwaardenContactTekst() });
