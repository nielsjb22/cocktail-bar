// Linkvoorbeeld (Open Graph) voor een gedeeld feestmenu.
//
// WhatsApp/iMessage voeren geen JavaScript uit, dus de meta-tags moeten al in
// de HTML staan die Netlify serveert. Deze edge function draait alleen voor
// links met ?menu= en vult titel, beschrijving en afbeelding in vanuit de
// link zelf (t = feestnaam, d = datum/tijd, menu = cocktail-id's, i = de
// geüploade menukaart-afbeelding). Zonder deze function (bv. bij een
// drag-and-drop-deploy) blijven de vaste tags uit index.html staan.
const TZ = "Europe/Amsterdam";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function describe(params) {
  const parts = [];
  const d = params.get("d") ? new Date(params.get("d")) : null;
  if (d && !isNaN(d)) {
    parts.push(d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).replace(/\./g, ""));
    parts.push(d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }));
  }
  const count = (params.get("menu") || "").split(",").filter(Boolean).length;
  if (count > 0) parts.push(`${count} cocktail${count === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`, "i");
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

export default async (request, context) => {
  const url = new URL(request.url);
  const params = url.searchParams;
  if (!params.get("menu")) return; // gewone pagina: niets aanpassen

  const response = await context.next();
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html = await response.text();

  const title = params.get("t") || "Het menu van vanavond";
  const description = describe(params) || "Het cocktailmenu van vanavond";
  // Alleen een afbeelding uit de eigen Supabase-bucket overnemen.
  const img = params.get("i") || "";
  const image = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/menukaarten\//i.test(img)
    ? img : `${url.origin}/og-menu.png`;

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "property", "og:image", image);
  html = setMeta(html, "property", "og:url", url.href);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  html = setMeta(html, "name", "twitter:image", image);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, headers });
};

export const config = { path: "/" };
