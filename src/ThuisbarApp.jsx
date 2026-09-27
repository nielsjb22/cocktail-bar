import { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { Martini, Check, Star, Plus, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, X, Lightbulb, ShoppingCart, Shuffle, Sparkles, Pencil, BookOpen, ClipboardList, Snowflake, Refrigerator, Scale, PartyPopper, NotebookPen, FlaskConical, GraduationCap, Lock, RotateCcw, Share2, ExternalLink, MoreHorizontal, Heart, RefreshCw, Camera, MapPin, Users, UserPlus, UserCheck, UserX, LogOut, Bell, MessageCircle, Send, Home, User, Settings, Flag } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabaseClient";
import { isNative as isNativeShell, initNativeShell, hideNativeSplash, hapticFor } from "./native";
import { INGREDIENTS, CATEGORY_ORDER, RECIPES, PRICES_UPDATED, STORIES, FUN_FACTS, STEPS, SHOP_LINKS } from "./recipes.js";
import { COURSE_PARTS, COURSE_LESSONS, FINAL_EXAM } from "./course.js";
import voorraadHeaderImg from "./assets/voorraad-header.jpg";
import makenHeaderImg from "./assets/maken-header.jpg";
import feestHeaderImg from "./assets/feest-header.jpg";
import catSterkeDrankImg from "./assets/categories/sterke-drank.jpeg";
import catLikeurenImg from "./assets/categories/likeuren.jpeg";
import catBittersImg from "./assets/categories/bitters.jpeg";
import catMixersImg from "./assets/categories/mixers.jpeg";
import catZuivelRoomImg from "./assets/categories/zuivel-room.jpeg";
import catVersImg from "./assets/categories/vers.jpeg";
import spiritGinImg from "./assets/spirits/gin.jpeg";
import spiritWodkaImg from "./assets/spirits/wodka.jpeg";
import spiritWitteRumImg from "./assets/spirits/witte-rum.jpeg";
import spiritCognacBrandyImg from "./assets/spirits/cognac-brandy.jpeg";
import spiritRyeWhiskyImg from "./assets/spirits/rye-whisky.jpeg";
import spiritBourbonImg from "./assets/spirits/bourbon.jpeg";
import imageCatalog from "./data/images.json";

// Centrale foto-catalogus (zie CLAUDE.md "## Afbeeldingen"): één entry per
// cocktail/drank-id met welk lokaal bestand erbij hoort (nog leeg tot de
// zoekfase een foto vindt en in src/assets/images/{cocktails,dranken}/
// zet). import.meta.glob bouwt build-time een {pad: url}-kaart van alles
// wat daar al staat, zodat een nieuw bestand automatisch overal verschijnt
// zodra het bijstaat in images.json — zonder verdere code-wijziging.
const COCKTAIL_IMAGE_FILES = import.meta.glob("./assets/images/cocktails/*.webp", { eager: true, import: "default" });
const DRANK_IMAGE_FILES = import.meta.glob("./assets/images/dranken/*.webp", { eager: true, import: "default" });
const IMAGE_CATALOG_BY_KEY = new Map(imageCatalog.map((e) => [`${e.type}:${e.id}`, e]));
function localItemImageUrl(type, id) {
  const entry = IMAGE_CATALOG_BY_KEY.get(`${type}:${id}`);
  if (!entry || !entry.bestand) return null;
  const files = type === "cocktail" ? COCKTAIL_IMAGE_FILES : DRANK_IMAGE_FILES;
  const folder = type === "cocktail" ? "cocktails" : "dranken";
  return files[`./assets/images/${folder}/${entry.bestand}`] || null;
}

/*
  DESIGN TOKENS: "Bar Register" concept
  Grounded in the subject: a home bar / spirits cabinet, styled like a
  vintage bar ledger or bottle-label book rather than a generic SaaS panel.

  Color:
    --ink        #2B2620  body text, warm charcoal (not pure black)
    --paper      #F3ECDD  aged paper background
    --paper-deep #EAE0C9  recessed panel (forms, input trays)
    --bottle     #1F3D36  primary: deep bottle glass green
    --bottle-dk  #14282320 header band
    --brass      #B8862E  accent: brass fittings / foil label
    --burgundy   #7A2E2A  "missing" status: old wax-seal red
    --sage       #5C7A52  "makeable" status: muted herbal green
    --muted      #8A8171  secondary text, warm grey-brown
    --border     #DED2B8  hairline rule, warm rather than cool grey

  Type: Georgia (serif) for names/headings, set boldly, like foil-stamped
  bottle text. System sans for controls and body. Small tracked capitals
  reserved only for category/status tags (label-appropriate, not eyebrows).

  Layout: signage band header, underline tabs (not pill buttons), ledger-row
  lists with hairline dividers instead of boxed cards for repeating items.
*/

// Elke kleur wijst naar een CSS custom property (zie :root in index.css) i.p.v.
// rechtstreeks een hex-waarde, zodat het hele register (duizenden losse
// style={{color: INK}}-achtige plekken) automatisch meedoet met een donkere
// systeeminstelling zonder dat er ergens anders iets hoeft te veranderen —
// alleen de waarden achter deze namen wisselen, via @media
// (prefers-color-scheme: dark) in index.css. Nergens in dit bestand mogen
// deze constanten met extra tekens aan elkaar geplakt worden (zoals een hex-
// alpha-suffix, bijv. `${BOTTLE}66`) — dat werkt niet meer op een
// var(--naam)-waarde; gebruik dan een losse letterlijke hex-kleur.
const INK = "var(--ink)";
const PAPER = "var(--paper)";
const PAPER_DEEP = "var(--paper-deep)";
const BOTTLE = "var(--bottle)";
const BOTTLE_DARK = "var(--bottle-dark)";
const BRASS = "var(--brass)";
const BURGUNDY = "var(--burgundy)";
const SAGE = "var(--sage)";
const MUTED = "var(--muted)";
const BORDER = "var(--border)";
const CREAM = "var(--cream)";
const CUSTOM_CAT = "Eigen ingrediënten";

const serif = "'Playfair Display', Georgia, 'Times New Roman', serif";
const sans = "'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif";
// Puur systeemfont (geen Inter), gereserveerd voor de check-in-sheet: die
// moet aanvoelen als een natieve iOS-flow, niet als de rest van de app.
const systemFont = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";

// Zachte, warm-getinte schaduwen, gereserveerd voor uitgelichte panelen en
// primaire knoppen. Herhalende ledger-rijen blijven bewust plat (zie de
// design tokens hierboven): schaduw = "dit is een uitgelicht moment".
const SHADOW_CARD = "var(--shadow-card)";
const SHADOW_HERO = "var(--shadow-hero)";
const SHADOW_CTA = "var(--shadow-cta)";
const RADIUS = 8;

// @capacitor/preferences i.p.v. rechtstreeks localStorage: op web valt het
// plugin zelf terug op localStorage (dus geen gedragsverandering in de
// browser), maar op iOS gebruikt het de native UserDefaults — die overleeft
// het opschonen dat iOS soms met WebView-opslag doet, wat gewoon
// localStorage niet gegarandeerd doet. Laden is nu async: value start op
// fallback en wordt bijgewerkt zodra Preferences.get() terug is (meestal
// binnen een paar ms), i.p.v. synchroon bij de eerste render.
function useStorage(key, fallback) {
  const [value, setValue] = useState(fallback);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Preferences.get({ key }).then(({ value: raw }) => {
      if (cancelled) return;
      loadedRef.current = true;
      if (raw != null) {
        try { setValue(JSON.parse(raw)); } catch { /* ongeldige oude waarde, fallback houden */ }
      }
    });
    return () => { cancelled = true; };
  }, [key]);

  const persist = (next) => {
    setValue(next);
    Preferences.set({ key, value: JSON.stringify(next) }).catch(e => console.error("Opslaan mislukt:", e));
  };
  return [value, persist];
}

// Kleine, zelf-gesynthetiseerde geluidjes (geen audiobestanden nodig) voor
// een paar betekenisvolle momenten — bewust maar een handjevol, niet bij elke
// tik, om het niet druk te maken. Faalt geluidloos als de browser geen
// AudioContext toestaat (bijv. voor de eerste gebruikersinteractie).
let sharedAudioCtx = null;
function getAudioCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume();
  return sharedAudioCtx;
}
function playTone(ctx, freq, startOffset, duration, type, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
function playSweep(ctx, freqFrom, freqTo, startOffset, duration, type, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const t0 = ctx.currentTime + startOffset;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
function playSound(name) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (name === "tick") {
      playTone(ctx, 920, 0, 0.06, "sine", 0.1);
    } else if (name === "clink") {
      playTone(ctx, 1760, 0, 0.16, "triangle", 0.09);
      playTone(ctx, 2350, 0.04, 0.2, "triangle", 0.07);
    } else if (name === "chime") {
      playTone(ctx, 660, 0, 0.14, "sine", 0.1);
      playTone(ctx, 880, 0.1, 0.18, "sine", 0.1);
      playTone(ctx, 1320, 0.2, 0.28, "sine", 0.09);
    } else if (name === "shuffle") {
      playTone(ctx, 240, 0, 0.045, "square", 0.05);
      playTone(ctx, 340, 0.035, 0.045, "square", 0.05);
      playTone(ctx, 270, 0.07, 0.05, "square", 0.045);
    } else if (name === "pop") {
      playTone(ctx, 500, 0, 0.05, "sine", 0.09);
      playTone(ctx, 790, 0.045, 0.09, "sine", 0.08);
    } else if (name === "remove") {
      playTone(ctx, 480, 0, 0.07, "sine", 0.07);
      playTone(ctx, 310, 0.05, 0.1, "sine", 0.06);
    } else if (name === "pour") {
      playSweep(ctx, 900, 200, 0, 0.32, "sine", 0.055);
      playSweep(ctx, 1400, 500, 0.06, 0.22, "triangle", 0.03);
    } else if (name === "share") {
      playSweep(ctx, 500, 1500, 0, 0.16, "sine", 0.08);
      playTone(ctx, 1900, 0.15, 0.14, "sine", 0.06);
    } else if (name === "levelup") {
      playTone(ctx, 523, 0, 0.16, "triangle", 0.08);
      playTone(ctx, 659, 0.12, 0.16, "triangle", 0.08);
      playTone(ctx, 784, 0.24, 0.18, "triangle", 0.09);
      playTone(ctx, 1047, 0.38, 0.32, "triangle", 0.1);
    } else if (name === "unlock") {
      playTone(ctx, 1046, 0, 0.1, "sine", 0.07);
      playTone(ctx, 1568, 0.09, 0.14, "sine", 0.08);
      playTone(ctx, 2093, 0.2, 0.22, "sine", 0.07);
    }
  } catch (e) {
    // geluid is decoratief, nooit de app blokkeren als het misgaat
  }
}

function slugify(s) {
  return "custom_" + s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "") + "_" + Date.now().toString(36);
}
function scaleAmount(amount, unit, servings) {
  const scaled = amount * servings;
  if (unit === "ml") return Math.round(scaled * 10) / 10;
  if (unit === "dash") return Math.round(scaled);
  if (unit === "stuk") return Math.ceil(scaled);
  return scaled;
}
function unitLabel(unit, amount) {
  if (unit === "ml") return "ml";
  if (unit === "dash") return amount === 1 ? "dash" : "dashes";
  if (unit === "stuk") return amount === 1 ? "stuk" : "stuks";
  return unit || "";
}
function formatDutchNumber(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}
function scaleStepText(text, servings) {
  if (servings === 1) return text;
  return text.replace(/\b(één|een|\d+(?:,\d+)?)\s+(ml|dashes|dash|stuks|stuk)\b/gi, (match, qtyStr, unit) => {
    const qty = /^(een|één)$/i.test(qtyStr) ? 1 : parseFloat(qtyStr.replace(",", "."));
    const canonicalUnit = unit.toLowerCase().startsWith("dash") ? "dash" : unit.toLowerCase().startsWith("stuk") ? "stuk" : "ml";
    const scaled = scaleAmount(qty, canonicalUnit, servings);
    return `${formatDutchNumber(scaled)} ${unitLabel(canonicalUnit, scaled)}`;
  });
}

const TAGS = [
  { id: "voorraad", label: "Voorraad", icon: Refrigerator },
  { id: "maken", label: "Wat kan ik maken", icon: Martini },
  { id: "mandje", label: "Winkelmandje", icon: ShoppingCart },
  { id: "schaler", label: "Schaler", icon: Scale },
  { id: "balans", label: "Smaakbalans", icon: Sparkles },
  { id: "verhaal", label: "Recept", icon: BookOpen },
  { id: "cursus", label: "Cursus", icon: GraduationCap },
  { id: "feest", label: "Feestplanner", icon: PartyPopper },
  { id: "logboek", label: "Check-in", icon: NotebookPen },
  { id: "eigen", label: "Eigen recepten", icon: FlaskConical },
  { id: "vrienden", label: "Vrienden", icon: Users },
];

// UX-herindeling (v2): de onderbalk draait niet langer om voorraadbeheer,
// maar om ontdekken/inchecken/delen — zie het UX-voorstel. Home, Ontdekken
// en Profiel zijn nieuw; Bar bundelt de thuisbar-gereedschappen die eerder
// los achter "Meer" stonden. Inchecken is met opzet geen eigen tab-id maar
// een verhoogde knop in BottomDock, net als bij Instagram/Strava.
const PRIMARY_TAB_IDS = ["home", "ontdekken", "bar", "profiel"];
// Korte versies van de tab-labels, alleen voor de smalle onderbalk-knopjes.
const DOCK_LABELS = { home: "Home", ontdekken: "Ontdekken", bar: "Bar", profiel: "Profiel" };
// De 4 knoppen om de verhoogde inchecken-knop heen (2 links, 2 rechts).
const TAGS_DOCK = [
  { id: "home", label: "Home", icon: Home },
  { id: "ontdekken", label: "Ontdekken", icon: Search },
  { id: "bar", label: "Bar", icon: Martini },
  { id: "profiel", label: "Profiel", icon: User },
];

// Menu-rollen o.b.v. de "smaakmatrix" die bartending-menuguides gebruiken
// (Light & Refreshing / Adventurous / Strong & Aromatic / Comforting, plus
// een verplichte alcoholvrije optie); zie HANDOFF.md voor de bronnen. Elke rol krijgt ook
// een sfeer-omschrijving en kleurverloop, hergebruikt in de Verhaal-tab als "gevoel" van de
// cocktail; geen foto's (die kan de app niet genereren), wel een consistente, doordachte sfeer.
const MENU_ROLES = {
  sterk: { label: "Sterk & aromatisch", families: ["Spirit-forward", "Stirred-down"],
    why: "Een stevige, drank-forward cocktail geeft je menu een volwassen anker. Bonus: stirred drankjes zonder vers sap of ei zijn het makkelijkst om vooraf te batchen.",
    sfeerVariants: [
      "Rokerig en volwassen, het gevoel van een leren clubfauteuil en een goed gesprek.",
      "Donker en gestroomlijnd, als het laatste licht in een bar die net iets te laat sluit.",
      "Zwaar en zelfverzekerd: een drank die niet haast, en dat ook niet hoeft.",
      "Kruidig en bedachtzaam, het soort glas dat je langzaam leegdrinkt, niet snel.",
      "Warm hout en een vleugje rook, alsof de avond zelf ouder en wijzer wordt.",
      "Stil en indrukwekkend: een cocktail die het gesprek even laat vallen.",
      "Vol en aards, de smaak van een kamer met te veel boeken en te weinig licht.",
      "Direct en zonder omwegen: sterk in de goede zin van het woord.",
      "Amber en traag, een drank die tijd vraagt en tijd geeft.",
      "Stevig als een handdruk: geen verrassingen, wel karakter.",
    ],
    gradient: ["#1F3D36", "#8A6A2F"] },
  fris: { label: "Fris & verfrissend", families: ["Highballs", "Sours", "Fizz / Flip"],
    why: "Een lichtere, verfrissende optie houdt het tempo behapbaar, belangrijk zodra gasten meerdere drankjes per avond drinken.",
    sfeerVariants: [
      "Helder en opwekkend, het gevoel van de eerste hap zomer, buiten op het terras.",
      "Licht en sprankelend, als ijsklontjes die net beginnen te tikken tegen het glas.",
      "Fris als een open raam op een warme dag: precies genoeg om je hoofd leeg te maken.",
      "Zurig en levendig, een drank die je wakker schudt zonder te overvallen.",
      "Groen en fruitig: het soort glas dat om een tweede rondje vraagt.",
      "Kraakhelder en licht getint, de smaak van net-geknipt gras na de regen.",
      "Speels en verkoelend: perfect voor een gesprek dat nog moet beginnen.",
      "Bubbelend en luchtig, als een lach die je niet had zien aankomen.",
      "Citrusfris en direct: geen poespas, gewoon een goede eerste indruk.",
      "Verfrissend als duiken in koud water: kort, fel, en daarna helemaal wakker.",
    ],
    gradient: ["#5C7A52", "#D8CFA0"] },
  avontuurlijk: { label: "Avontuurlijk", families: ["Modern / Tiki", "Moderne klassiekers"],
    why: "Een verrassende of uitbundige cocktail geeft gespreksstof en voorkomt dat het menu 'veilig' aanvoelt.",
    sfeerVariants: [
      "Uitbundig en verrassend, het gevoel van een warme avond ergens ver van huis.",
      "Kleurrijk en gedurfd: een drank die net zo goed een verhaal is als een glas.",
      "Onvoorspelbaar en geurig, als een markt in een stad die je nog niet kent.",
      "Speels en net iets te veel: precies de reden waarom je 'm besteld hebt.",
      "Exotisch en zelfverzekerd, een korte vakantie die in één slok past.",
      "Verrassend gelaagd: elke slok anders dan de vorige.",
      "Gedurfd en gulzig, geen cocktail voor wie op safe wil spelen.",
      "Tropisch en vol leven, als muziek die net iets te hard staat, op de goede manier.",
      "Nieuwsgierig makend: een drank die om een vraag vraagt vóór de eerste slok.",
      "Vrijmoedig en fris-gek, de vakantiefoto onder de cocktails.",
    ],
    gradient: ["#7A2E2A", "#B8862E"] },
  comfort: { label: "Comfort", families: ["Zuivel & dessert", "Warme dranken"],
    why: "Een romige of warme optie voegt comfort toe: fijn voor gasten die niet van scherpe of bittere smaken houden.",
    sfeerVariants: [
      "Zacht en troostend, het gevoel van een deken en een goed dessert.",
      "Romig en warm, als thuiskomen op een koude avond.",
      "Zoet en geruststellend: een cocktail die niets van je vraagt.",
      "Volle, ronde smaken: het toetje dat je toch nog bestelt.",
      "Behaaglijk en zwaar op de tong, precies wat een lange dag verdient.",
      "Warm en zoetig, als een kop chocolademelk voor volwassenen.",
      "Zacht als een oude trui: geen scherpe randjes, alleen troost.",
      "Weelderig en kalmerend, een cocktail om diep in weg te zakken.",
      "Rijk en geruststellend: de laatste ronde van de avond.",
      "Zoet, romig en zonder haast, precies zoals een goed dessert hoort te zijn.",
    ],
    gradient: ["#6B4A2E", "#D8CFA0"] },
  alcoholvrij: { label: "Alcoholvrij", families: ["Mocktail / alcoholvrij"],
    why: "Een volwaardige alcoholvrije optie hoort standaard op elk menu, zodat niet-drinkende gasten niet vergeten worden.",
    sfeerVariants: [
      "Licht en fris zonder in te leveren op smaak: voor iedereen aan tafel.",
      "Helder en smaakvol, bewijs dat 'zonder' niet hetzelfde is als 'minder'.",
      "Fruitig en volwaardig, net zo doordacht als elk ander glas op tafel.",
      "Licht bruisend en zorgeloos: een drank zonder addertjes onder het gras.",
      "Fris en genereus: de opmaat naar de rest van de avond, voor iedereen.",
      "Kleurrijk en uitnodigend, niemand mist hier iets aan tafel.",
      "Zacht-zoet en verfrissend, een glas dat evenveel aandacht kreeg als de rest.",
      "Sprankelend zonder scherpte, precies goed voor een lange, warme avond.",
    ],
    gradient: ["#5C7A52", "#F3ECDD"] },
  overig: { label: "Overig", families: [],
    why: "Valt buiten de vier standaardhoeken: geen probleem als uitzondering, maar telt niet mee in de balans hierboven.",
    sfeerVariants: [
      "Een cocktail die zijn eigen pad volgt.",
      "Buiten de gebaande paden, en dat is precies het punt.",
      "Niet in een hokje te plaatsen, en daarom juist interessant.",
      "Een drank met een eigen kop en een eigen richting.",
    ],
    gradient: ["#8A8171", "#DED2B8"] },
};
const MENU_ROLE_KEYS = Object.keys(MENU_ROLES).filter(k => k !== "overig");

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function getSfeerQuote(recipe, roleKey) {
  const variants = MENU_ROLES[roleKey]?.sfeerVariants || [];
  if (variants.length === 0) return "";
  return variants[hashString(recipe.id) % variants.length];
}

// Leidt een realistische drankkleur af uit de daadwerkelijke ingrediënten, in plaats
// van de generieke smaakhoek-kleur; zo oogt de illustratie als "deze specifieke
// cocktail" in plaats van "een willekeurige cocktail uit deze categorie". De volgorde
// is een prioriteitenlijst: het eerst matchende, meest beeldbepalende ingrediënt wint.
const LIQUID_COLOR_RULES = [
  { ids: ["heavy_cream", "whipped_cream", "coconut_cream", "milk", "irish_cream", "creme_de_cacao"], colors: ["#C9AD7A", "#F3ECDD"] },
  { ids: ["coffee_liqueur", "espresso", "hot_coffee"], colors: ["#3B2A1E", "#7A5230"] },
  { ids: ["blue_curacao"], colors: ["#1B4F72", "#6FB1D6"] },
  { ids: ["creme_de_menthe", "green_chartreuse", "midori", "melon_liqueur"], colors: ["#3D5C3A", "#8FAE55"] },
  { ids: ["tomato_juice"], colors: ["#6E2620", "#B5433A"] },
  { ids: ["grenadine", "cranberry_juice", "campari", "creme_de_cassis", "raspberry_syrup", "creme_de_mure", "sloe_gin", "chambord"], colors: ["#7A2E2A", "#D9707A"] },
  { ids: ["orange_juice", "aperol", "peach_puree", "peach_schnapps", "apricot_brandy"], colors: ["#B8622E", "#F0A85A"] },
  { ids: ["prosecco", "white_wine", "elderflower_cordial"], colors: ["#D8C27A", "#F3ECDD"] },
  { ids: ["dark_rum", "bourbon", "rye", "scotch", "cognac", "irish_whiskey", "amaro_nonino", "fernet_branca", "cynar", "red_wine", "port"], colors: ["#5C3A1E", "#B8862E"] },
];
function getLiquidColor(recipe, allIngredients) {
  const ids = new Set(recipe.ingredients.map(ing => findIngredientMeta(ing, allIngredients)?.id).filter(Boolean));
  for (const rule of LIQUID_COLOR_RULES) {
    if (rule.ids.some(id => ids.has(id))) return rule.colors;
  }
  return ["#D8CFA0", "#F3ECDD"];
}

// Smaakprofiel: geen aparte database met scores per recept, maar afgeleid uit de
// echte ingrediënten en hoeveelheden. Punten per ingrediënt (per ml, of per dash
// voor bitters) tellen op tot een score, die daarna in een 0-5 balkje valt.
const ZOET_WEIGHTS = {
  sugar_syrup: 1, honey_syrup: 1, honey_ginger_syrup: 1, raspberry_syrup: 1, grenadine: 1, orgeat: 1,
  agave_nectar: 1, elderflower_cordial: 0.9, brown_sugar: 0.9, triple_sec: 0.6, grand_marnier: 0.5,
  sweet_vermouth: 0.35, maraschino_liqueur: 0.8, coffee_liqueur: 0.5, creme_de_mure: 0.7, creme_de_cassis: 0.7,
  creme_de_cacao: 0.7, creme_de_menthe: 0.6, creme_de_violette: 0.6, chambord: 0.7, amaretto: 0.7,
  frangelico: 0.6, galliano: 0.5, sour_apple_liqueur: 0.7, lychee_liqueur: 0.7, blue_curacao: 0.6,
  sloe_gin: 0.4, pimms: 0.3, advocaat: 0.8, ginger_wine: 0.35, drambuie: 0.45, apricot_brandy: 0.5,
  cherry_brandy: 0.5, benedictine: 0.45, falernum: 0.7, allspice_liqueur: 0.45, passion_fruit_liqueur: 0.6,
  port: 0.35, irish_cream: 0.6, creme_de_noyaux: 0.7, banana_liqueur: 0.7, melon_liqueur: 0.7, cola: 0.5,
  coconut_cream: 0.8, pineapple_juice: 0.4, cranberry_juice: 0.25, orange_juice: 0.25, grapefruit_juice: 0.15,
  peach_puree: 0.45, passion_fruit_puree: 0.35, lemonade: 0.45, ginger_beer: 0.25, ginger_ale: 0.25,
  grapefruit_soda: 0.35, tonic: 0.15, prosecco: 0.1,
};
const ZUUR_WEIGHTS = {
  lemon_juice: 1, lime_juice: 1, grapefruit_juice: 0.5, cranberry_juice: 0.25, orange_juice: 0.15,
  pineapple_juice: 0.2, olive_brine: 0.3, passion_fruit_puree: 0.3, passion_fruit_liqueur: 0.15,
  grapefruit_soda: 0.2, tomato_juice: 0.2,
};
const BITTER_WEIGHTS = {
  campari: 1, aperol: 0.65, amaro_nonino: 0.7, cynar: 0.8, fernet_branca: 1, yellow_chartreuse: 0.4,
  green_chartreuse: 0.5, coffee_liqueur: 0.25, espresso: 0.6, hot_coffee: 0.5, stout: 0.35, tonic: 0.15,
  dry_vermouth: 0.2, sweet_vermouth: 0.1, grapefruit_juice: 0.15,
  angostura: 6, peychauds: 6, orange_bitters: 5,
};
function toBucket(points) {
  if (points <= 0) return 0;
  if (points < 5) return 1;
  if (points < 15) return 2;
  if (points < 25) return 3;
  if (points < 35) return 4;
  return 5;
}
function getTasteProfile(recipe, allIngredients) {
  let zoetPts = 0, zuurPts = 0, bitterPts = 0, spiritMl = 0, totalMl = 0;
  recipe.ingredients.forEach(ing => {
    const meta = findIngredientMeta(ing, allIngredients);
    const id = meta?.id || ing.id;
    const amount = ing.amount || 0;
    if (ing.unit === "ml") {
      totalMl += amount;
      if (meta?.cat === "Sterke drank") spiritMl += amount;
      else if (meta?.cat === "Likeuren & versterkte wijnen") spiritMl += amount * (id === "absinthe" ? 0.9 : 0.35);
    }
    zoetPts += amount * (ZOET_WEIGHTS[id] || 0);
    zuurPts += amount * (ZUUR_WEIGHTS[id] || 0);
    bitterPts += amount * (BITTER_WEIGHTS[id] || 0);
  });
  const strength = totalMl > 0 ? spiritMl / totalMl : 0;
  const sterk = strength <= 0 ? 0 : strength < 0.15 ? 1 : strength < 0.3 ? 2 : strength < 0.45 ? 3 : strength < 0.6 ? 4 : 5;
  return { zoet: toBucket(zoetPts), zuur: toBucket(zuurPts), bitter: toBucket(bitterPts), sterk };
}
function getFunFact(recipe) {
  return FUN_FACTS[recipe.id] || null;
}

// Splitst de doorlopende `method`-tekst in losse stappen (op zinsgrens) zodat
// elk recept (ingebouwd of zelfgemaakt) automatisch een stap-voor-stap
// weergave krijgt, zonder dat elk recept apart een stappenlijst nodig heeft.
function splitMethodIntoSteps(method) {
  if (!method) return [];
  const sentences = method.match(/[^.!?]+[.!?]+(\s+|$)/g);
  const steps = sentences ? sentences.map(s => s.trim()) : [method.trim()];
  return steps.filter(Boolean);
}

// Aliassen per ingrediënt-id: het woord (of de woorden) waarmee dat ingrediënt
// typisch in de Nederlandse bereidingstekst wordt genoemd. Nodig omdat de tekst
// zelf vaak "de rum" of "de suiker" zegt in plaats van de volledige productnaam.
const INGREDIENT_KEYWORDS = {
  bourbon: ["bourbon"], rye: ["rye"], scotch: ["scotch"], irish_whiskey: ["irish whiskey", "whiskey"],
  white_rum: ["rum"], dark_rum: ["rum"], cachaca: ["cachaça", "cachaca"], gin: ["gin"],
  tequila_blanco: ["tequila"], mezcal: ["mezcal"], vodka: ["wodka"], pisco: ["pisco"],
  cognac: ["cognac", "brandy"], calvados: ["calvados"],
  triple_sec: ["triple sec"], grand_marnier: ["grand marnier"], sweet_vermouth: ["zoete vermout", "vermout"],
  dry_vermouth: ["droge vermout", "vermout"], campari: ["campari"], aperol: ["aperol"],
  amaro_nonino: ["amaro nonino", "amaro"], cynar: ["cynar"], fernet_branca: ["fernet"],
  yellow_chartreuse: ["gele chartreuse", "chartreuse"], green_chartreuse: ["groene chartreuse", "chartreuse"],
  maraschino_liqueur: ["maraschino"], coffee_liqueur: ["koffielikeur"], creme_de_mure: ["braambessenlikeur"],
  creme_de_cassis: ["cassis"], creme_de_cacao: ["cacao"], creme_de_menthe: ["menthe"],
  creme_de_violette: ["violette"], chambord: ["chambord"], amaretto: ["amaretto"], frangelico: ["frangelico"],
  galliano: ["galliano"], sour_apple_liqueur: ["appellikeur"], lychee_liqueur: ["lychee"],
  blue_curacao: ["curaçao", "curacao"], sloe_gin: ["sloe gin"], pimms: ["pimm's", "pimms"],
  advocaat: ["advocaat"], ginger_wine: ["gemberwijn"], drambuie: ["drambuie"],
  apricot_brandy: ["abrikozenlikeur", "apricot brandy"], cherry_brandy: ["kersenlikeur", "cherry brandy"],
  benedictine: ["bénédictine", "benedictine"], falernum: ["falernum"], allspice_liqueur: ["allspice", "piment-likeur"],
  passion_fruit_liqueur: ["passievrucht-likeur"], port: ["portwijn"], sherry: ["sherry"],
  lillet_blanc: ["lillet"], absinthe: ["absint", "absinthe"],
  angostura: ["angostura"], peychauds: ["peychaud"], orange_bitters: ["orange bitters"],
  tonic: ["tonic"], cola: ["cola"], ginger_beer: ["gemberbier"], ginger_ale: ["ginger ale"],
  grapefruit_soda: ["grapefruitfrisdrank"], soda_water: ["soda"], prosecco: ["prosecco", "champagne"],
  white_wine: ["witte wijn"], red_wine: ["rode wijn"], beer: ["bier"], stout: ["stout"],
  coconut_cream: ["kokosroom", "kokos"], pineapple_juice: ["ananassap", "ananas"],
  cranberry_juice: ["cranberrysap", "cranberry"], orange_juice: ["sinaasappelsap"],
  grapefruit_juice: ["grapefruitsap"], tomato_juice: ["tomatensap"], peach_puree: ["perzikpuree"],
  passion_fruit_puree: ["passievruchtpuree"], espresso: ["espresso"], hot_coffee: ["koffie"],
  hot_water: ["heet water"], peach_schnapps: ["perzikschnapps"],
  heavy_cream: ["slagroom"], whipped_cream: ["slagroom"], egg_yolk: ["eidooier", "dooier"],
  lemon_juice: ["citroensap", "citroen"], lime_juice: ["limoensap", "limoen"],
  sugar_syrup: ["suikersiroop", "suiker"], honey_syrup: ["honingsiroop", "honing"],
  honey_ginger_syrup: ["honing-gembersiroop", "gembersiroop"], raspberry_syrup: ["frambozensiroop"],
  grenadine: ["grenadine"], orgeat: ["orgeat", "amandelsiroop"], agave_nectar: ["agavesiroop", "agave"],
  elderflower_cordial: ["vlierbloesemsiroop", "vlierbloesem"], brown_sugar: ["bruine suiker"],
  mint: ["munt"], basil: ["basilicum"], egg_white: ["eiwit"], cherry: ["cocktailkers", "kers"],
  cloves: ["kruidnagel"], olive_brine: ["olijfpekel", "pekel"], orange_flower_water: ["oranjebloesemwater"],
  worcestershire: ["worcestershiresaus", "worcestershire"], tabasco: ["tabasco"],
  chili: ["chilipeper"], ginger_root: ["gember"], strawberry: ["aardbei"], cucumber: ["komkommer"],
  cinnamon_stick: ["kaneelstokje", "kaneel"], butter: ["boter"],
  irish_cream: ["baileys"], creme_de_noyaux: ["noyaux"], banana_liqueur: ["bananenlikeur"],
  melon_liqueur: ["midori", "meloenlikeur"], lemonade: ["limonade"], milk: ["melk"],
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bouwt, per recept, een regex van alle woorden waarmee de eigen ingrediënten
// in de tekst genoemd kunnen worden, en knipt een stap-zin daarop in stukjes
// zodat de ingrediënt-vermeldingen als brass "pilletje" gerenderd kunnen worden.
function highlightIngredientMentions(text, recipe, allIngredients) {
  const seen = new Map(); // keyword -> ingredient ref (id/name + amount)
  recipe.ingredients.forEach(ing => {
    const meta = findIngredientMeta(ing, allIngredients);
    const keywords = (meta && INGREDIENT_KEYWORDS[meta.id]) || [];
    keywords.forEach(kw => { if (!seen.has(kw)) seen.set(kw, ing); });
  });
  const keywords = [...seen.keys()].sort((a, b) => b.length - a.length);
  if (keywords.length === 0) return [text];
  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    const isMatch = keywords.some(kw => kw.toLowerCase() === part.toLowerCase());
    if (!isMatch) return part;
    return <span key={i} style={{ background: "rgba(184,134,46,0.16)", border: "1px solid rgba(184,134,46,0.3)", borderRadius: 100, padding: "1px 8px", fontWeight: 600 }}>{part}</span>;
  });
}

function getMenuRole(recipe) {
  for (const key of MENU_ROLE_KEYS) {
    if (MENU_ROLES[key].families.includes(recipe.family)) return key;
  }
  return "overig";
}

// Technieken worden automatisch afgeleid uit de Nederlandse bereidingstekst, zo hoeft er geen
// aparte techniek-tag per recept onderhouden te worden, en werkt het ook voor eigen recepten.
const TECHNIQUE_GUIDE = {
  dry_shake: { label: "Dry shake", tip: "Schud eerst zonder ijs om eiwit of room goed te emulgeren, minstens 15-20 sec, pas daarna met ijs verder schudden." },
  shaken: { label: "Shaken", tip: "Kort en hard schudden (10-15 sec), niet lang en zacht: je wilt ijssplinters en verdunning, geen slush." },
  stirred: { label: "Stirren", tip: "Roer rustig tegen de wand van het glas, 20-30 sec: je wilt koelen en verdunnen, geen lucht erin kloppen." },
  double_strain: { label: "Dubbel zeven", tip: "Naast de julep/hawthorne-zeef ook door een fijne theezeef gieten voor een glasheldere cocktail zonder ijssplinters of vruchtvlees." },
  muddle: { label: "Muddelen", tip: "Bij munt: klap het blaadje tussen je handen i.p.v. fijn te pletten, dat geeft aroma zonder bittere smaak." },
  build: { label: "Bouwen", tip: "Voeg de ingrediënten in volgorde toe direct in het glas over ijs, en roer pas aan het eind kort." },
  swizzle: { label: "Swizzelen", tip: "Rol een swizzle stick tussen je handen in crushed ijs tot het glas beslaat, geen lepel, dat werkt niet zo goed." },
  float_layer: { label: "Drijflaag", tip: "Giet voorzichtig over de bolle kant van een lepel zodat de laag op de andere blijft drijven (dichtheidsverschil)." },
  blend: { label: "Blenden", tip: "Gebruik crushed of fijngemalen ijs, niet grote blokken, anders wordt het mengsel wateriger dan de bedoeling is." },
};
// Gin varieert meer tussen merken dan de meeste sterkedranken (het botanicals-mengsel
// bepaalt de hele smaak), maar dat doet er alleen echt toe bij een handvol klassiekers.
const GIN_STYLE_TIPS = {
  martini: "Een klassieke London Dry (Beefeater, Tanqueray, Gordon's) geeft de scherpe, jeneverbes-voorop smaak waar deze cocktail ooit voor is bedacht. Een bloemige 'New Western' gin (zoals Hendrick's) is lekker, maar maakt er een andere cocktail van dan de klassieke Martini.",
  martinez: "Deze cocktail is bedacht vóórdat droge London Dry gin de standaard werd: een Old Tom gin (net iets zoeter) past hier historisch beter bij dan een moderne, droge gin.",
  gin_tonic: "Hier mag je juist op smaak kiezen: een London Dry blijft de veilige, jeneverbes-voorop klassieker, maar een bloemige of citrus-gin komt met de juiste garnering (bijv. komkommer of rood fruit) extra tot zijn recht.",
};

// Kalender voor "Cocktail van de dag": een paar vaste dagen in het jaar met
// een recept dat er inhoudelijk bij past, en de reden waarom (niet zomaar
// een willekeurige keuze). MM-DD i.p.v. een Date, zodat het jaartal er niet
// toe doet. Beweeglijke feestdagen (Pasen, Moederdag) staan er bewust niet
// bij: die vragen een echte datumberekening, dit is de eenvoudige eerste versie.
const OCCASIONS = {
  "01-01": { label: "Nieuwjaarsdag", emoji: "🥂", recipeId: "bloody_mary", reason: "De klassieke \"hair of the dog\" na een lange jaarwisseling: tomaat, zout en specerijen." },
  "02-14": { label: "Valentijnsdag", emoji: "🌹", recipeId: "valentine_martini", reason: "Roze, romantisch, en met precies de juiste naam voor vandaag." },
  "04-27": { label: "Koningsdag", emoji: "🧡", recipeId: "screwdriver", reason: "Wodka en sinaasappelsap: toevallig (of niet) exact Oranje van kleur." },
  "10-31": { label: "Halloween", emoji: "🎃", recipeId: "black_manhattan", reason: "Donker, sterk en met een naam die bij een spannende avond past." },
  "12-24": { label: "Kerstavond", emoji: "🎄", recipeId: "egg_nog", reason: "Romig, kruidig en al eeuwenlang hét kerstdrankje." },
  "12-25": { label: "Eerste kerstdag", emoji: "🎄", recipeId: "egg_nog", reason: "Romig, kruidig en al eeuwenlang hét kerstdrankje." },
  "12-31": { label: "Oudjaarsavond", emoji: "🎆", recipeId: "champagne_cocktail", reason: "Bubbels met een suikerklontje en bitters: klein gebaar, groot moment om middernacht." },
};
function getTodayOccasion() {
  const d = new Date();
  const key = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return OCCASIONS[key] || null;
}
// Stabiel per kalenderweek (i.p.v. willekeurig bij elke page-load), zodat
// "deze week" ook echt een week lang hetzelfde recept betekent.
function getIsoWeekSeed() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return d.getFullYear() * 100 + week;
}

// Seizoensthema's voor "Cocktail van de week": per maand een stijl die er
// inhoudelijk bij hoort (weer, seizoen, sfeer), zodat de reden niet meer om
// je voorraad draait maar om waaróm juist deze maand om dit soort cocktail
// vraagt. Voorraad blijft alleen nog een praktisch naschrift, geen hoofdreden.
const MONTH_THEMES = [
  { label: "Nieuw jaar, frisse start", families: ["Mocktail / alcoholvrij"],
    reason: (name) => `Januari is bij uitstek de maand van een frisse, alcoholvrije start — ${name} laat zien dat "zonder" net zo verwennend kan zijn.` },
  { label: "Warm door de winter", families: ["Warme dranken", "Zuivel & dessert"],
    reason: (name) => `Kort, grauw en guur: februari vraagt om iets warms en romigs om binnen bij weg te kruipen, zoals ${name}.` },
  { label: "Eerste lentekriebels", families: ["Fizz / Flip", "Sours"],
    reason: (name) => `De eerste lentedagen vragen om iets fris en licht bruisends — precies wat ${name} deze maand te bieden heeft.` },
  { label: "Bloemige lente", families: ["Sours", "Fizz / Flip"],
    reason: (name) => `Met de eerste zonnestralen van april is het moment voor een bloemige, frisse cocktail zoals ${name}.` },
  { label: "Terrasseizoen", families: ["Highballs", "Fizz / Flip"],
    reason: (name) => `Het terrasseizoen begint: mei is gemaakt voor een lange, verfrissende highball als ${name}.` },
  { label: "Zomer in zicht", families: ["Modern / Tiki", "Highballs"],
    reason: (name) => `Met de langste dagen van het jaar in zicht mag het net iets uitbundiger — tijd voor ${name}.` },
  { label: "Hoogzomer", families: ["Modern / Tiki"],
    reason: (name) => `Hoogzomer vraagt om iets fruitigs en tropisch: ${name}, het liefst met een parasolletje erbij.` },
  { label: "Vakantiesfeer", families: ["Modern / Tiki", "Highballs"],
    reason: (name) => `Vakantiemaand bij uitstek: augustus is voor cocktails die naar een verre kust smaken, zoals ${name}.` },
  { label: "Nazomer", families: ["Sours", "Highballs"],
    reason: (name) => `De nazomer houdt nog even vol — ${name} is voor wie de zomer nog niet wil loslaten.` },
  { label: "Herfstkruiden", families: ["Spirit-forward", "Stirred-down"],
    reason: (name) => `De bladeren vallen en de avonden worden korter: oktober vraagt om iets stevigers en kruidigers, zoals ${name}.` },
  { label: "Vroeg donker", families: ["Warme dranken", "Stirred-down"],
    reason: (name) => `Vroeg donker en guur weer: november is voor cocktails die je van binnenuit opwarmen, zoals ${name}.` },
  { label: "Feestmaand", families: ["Spirit-forward", "Zuivel & dessert"],
    reason: (name) => `De feestmaand bij uitstek vraagt om iets rijks en decadents: ${name}.` },
];

// Tijdstip-gevoelige begroeting + een warmere gloed in de header naarmate
// het later op de avond wordt — klein detail, maar het scheelt of de app
// om 9 uur 's ochtends of 11 uur 's avonds hetzelfde aanvoelt.
function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Nog laat op vanavond?";
  if (h < 12) return "Goedemorgen";
  if (h < 18) return "Goedemiddag";
  return "Goedenavond";
}
function getTimeWarmth() {
  const h = new Date().getHours();
  if (h >= 18 || h < 5) return 0.16;
  if (h >= 12) return 0.09;
  return 0.05;
}

function inferTechniques(method) {
  const m = (method || "").toLowerCase();
  const found = [];
  if (m.includes("dry shake")) found.push("dry_shake");
  if (m.includes("shake") || m.includes("schud")) found.push("shaken");
  if (m.includes("roer") && !m.includes("bouw")) found.push("stirred");
  if (m.includes("bouw")) found.push("build");
  if (m.includes("muddle") || m.includes("pletten") || m.includes("klap")) found.push("muddle");
  if (m.includes("dubbel zeven")) found.push("double_strain");
  if (m.includes("swizzel")) found.push("swizzle");
  if (m.includes("drijflaag") || m.includes("laagsgewijs") || m.includes("layer")) found.push("float_layer");
  if (m.includes("blend")) found.push("blend");
  return [...new Set(found)];
}

function formatAantal(n) {
  const rounded = Math.round(n * 2) / 2;
  return rounded % 1 === 0 ? String(rounded) : String(rounded).replace(".", ",");
}

function euro(amount) {
  return "€" + amount.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ingredientKey(ref) {
  return ref.id || (ref.name || "").toLowerCase();
}

function findIngredientMeta(ref, allIngredients) {
  if (ref.id) return allIngredients.find(i => i.id === ref.id) || null;
  return allIngredients.find(i => i.name.toLowerCase() === (ref.name || "").toLowerCase()) || null;
}

function getBaseSpirit(recipe, allIngredients) {
  for (const ing of recipe.ingredients) {
    const meta = findIngredientMeta(ing, allIngredients);
    if (meta && meta.cat === "Sterke drank") return meta.name;
  }
  return null;
}

// ── Glasillustraties ─────────────────────────────────────────────────────
// Geen foto's of AI-plaatjes beschikbaar in deze omgeving; in plaats daarvan
// een kleine set met de hand getekende glas-silhouetten (SVG-lijnwerk, in de
// stijl van een gegraveerde bar-menukaart) die per cocktail worden gevuld met
// de sfeerkleur van de smaakhoek en een garnering die is afgeleid uit de
// echte ingrediënten. Geen twee cocktails zien er identiek uit, maar niets
// is fictief: glasvorm komt uit recipe.glass, garnering uit recipe.ingredients.
function normalizeGlass(glass) {
  const g = (glass || "").toLowerCase();
  if (g.startsWith("coupe")) return "coupe";
  if (g.startsWith("highball")) return "highball";
  if (g.startsWith("rocks")) return "rocks";
  if (g.startsWith("hurricane")) return "hurricane";
  if (g.startsWith("champagneflute")) return "flute";
  if (g.startsWith("koperen beker")) return "mule_mug";
  if (g.startsWith("wijnglas")) return "wine";
  if (g.startsWith("glazen mok")) return "mug";
  if (g.startsWith("julep")) return "julep";
  return "coupe";
}

// Meerdere garneringen tegelijk i.p.v. "eerste match wint", zodat een Mojito
// er anders uitziet dan een Daiquiri ook al delen ze een ingrediënt: elk
// signaal komt nog steeds uit de échte `recipe.ingredients`/`family`, alleen
// wordt het niet meer afgekapt bij de eerste treffer. Max 2, voor leesbaarheid.
function inferGarnishes(recipe, allIngredients) {
  const ids = new Set(recipe.ingredients.map(ing => findIngredientMeta(ing, allIngredients)?.id).filter(Boolean));
  const found = [];
  if (normalizeGlass(recipe.glass) === "julep") found.push("mint");
  if (ids.has("mint") && !found.includes("mint")) found.push("mint");
  if (ids.has("cherry")) found.push("cherry");
  if (ids.has("olive_brine")) found.push("olive");
  if (ids.has("pineapple_juice") || ids.has("coconut_cream")) found.push("pineapple");
  if (ids.has("lime_juice")) found.push("lime");
  if (ids.has("lemon_juice")) found.push("lemon");
  if (ids.has("orange_juice") || ids.has("grapefruit_juice")) found.push("orange");
  if (found.length === 0 && (ids.has("espresso") || ids.has("hot_coffee") || ids.has("coffee_liqueur"))) found.push("coffee_beans");
  if (found.length === 0 && (recipe.family === "Zuivel & dessert" || recipe.family === "Warme dranken")) found.push("dust");
  if (found.length === 0) found.push("twist");
  return found.slice(0, 2);
}

// Zoutrand herkend aan de klassieke tequila+limoen+triple sec-combinatie (of
// gewoon een naam die "margarita" bevat, voor varianten daarop); suikerrand
// alleen voor de Sidecar-traditie. Bewust smal gehouden i.p.v. elk zuur
// drankje van een rand te voorzien.
function inferRim(recipe, allIngredients) {
  // Het echte `glass`-veld schrijft de rand er bij een aantal recepten al
  // letterlijk bij (bijv. "Rocks (zoutrand)") — dat is een betrouwbaardere
  // bron dan raden uit ingrediënten, dus die heeft voorrang.
  const glass = (recipe.glass || "").toLowerCase();
  if (glass.includes("zoutrand")) return "salt";
  if (glass.includes("suikerrand")) return "sugar";
  const name = recipe.name.toLowerCase();
  const ids = new Set(recipe.ingredients.map(ing => findIngredientMeta(ing, allIngredients)?.id).filter(Boolean));
  if (name.includes("margarita") || (ids.has("tequila_blanco") && ids.has("lime_juice") && ids.has("triple_sec"))) return "salt";
  if (name.includes("sidecar")) return "sugar";
  return null;
}

// Romige schuimkap (eiwit/room) of een lichtere koffie-crema-laag — beide
// zijn een tweede band bovenop de vloeistof, alleen andere kleur/dekking.
function inferFoam(recipe, allIngredients) {
  const ids = new Set(recipe.ingredients.map(ing => findIngredientMeta(ing, allIngredients)?.id).filter(Boolean));
  if (ids.has("egg_white") || ids.has("egg_yolk") || ids.has("heavy_cream") || ids.has("whipped_cream")) return "cream";
  if (ids.has("espresso") || ids.has("hot_coffee") || ids.has("coffee_liqueur")) return "crema";
  return null;
}

// Grof ijsblok voor spirit-forward glazen, fijngestampt voor highball/tiki-
// achtige drankjes, geen ijs voor alles dat "up" wordt geserveerd (coupe,
// flute, wijnglas) — afgeleid van het bestaande glas + familie-veld.
function inferIceStyle(recipe) {
  const type = normalizeGlass(recipe.glass);
  if (type === "rocks" || type === "mule_mug" || type === "mug") return "cubes";
  if (type === "highball" || type === "hurricane") return "crushed";
  return "none";
}

const GARNISH_COLORS = { cherry: "#A6342E", olive: "#6B7A4A", mint: "#5C7A52", pineapple: "#D9A63E", lime: "#8FAE55", lemon: "#E8C34A", orange: "#D98A3D", twist: "#D98A3D", dust: "#6B4A2E", coffee_beans: "#3A2418" };

// Eén garnering tekenen op een gegeven ankerpunt (rcx/rcy zijn al het
// glas-afhankelijke rand-middelpunt) — losgetrokken van GlassArt zodat we
// 'm twee keer kunnen aanroepen (twee garneringen) zonder alles te dupliceren.
function GarnishShape({ type, rcx, rcy, color }) {
  if (type === "cherry") return (
    <g>
      <path d={`M${rcx + 14},${rcy - 10} Q${rcx + 10},${rcy - 22} ${rcx + 6},${rcy - 27}`} fill="none" stroke="#7A2E2A" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={rcx + 15} cy={rcy - 8} r="4.5" fill={color} />
      <circle cx={rcx + 13.3} cy={rcy - 9.6} r="1.1" fill="rgba(255,255,255,0.55)" />
    </g>
  );
  if (type === "olive") return (
    <g>
      <line x1={rcx - 2} y1={rcy - 2} x2={rcx + 16} y2={rcy - 24} stroke="#B8862E" strokeWidth={1.4} strokeLinecap="round" />
      <ellipse cx={rcx + 7} cy={rcy - 11} rx="5" ry="3.3" fill={color} transform={`rotate(-55 ${rcx + 7} ${rcy - 11})`} />
      <ellipse cx={rcx + 14} cy={rcy - 20} rx="5" ry="3.3" fill={color} transform={`rotate(-55 ${rcx + 14} ${rcy - 20})`} />
      <circle cx={rcx + 13.4} cy={rcy - 20.6} r="1" fill="#D9C088" />
      <circle cx={rcx + 6.4} cy={rcy - 11.6} r="1.4" fill="rgba(255,255,255,0.4)" />
    </g>
  );
  if (type === "mint") return (
    <g fill={color}>
      <path d={`M${rcx - 6},${rcy - 4} Q${rcx - 20},${rcy - 14} ${rcx - 16},${rcy - 30} Q${rcx - 6},${rcy - 20} ${rcx - 6},${rcy - 4}`} />
      <path d={`M${rcx - 2},${rcy - 6} Q${rcx - 8},${rcy - 22} ${rcx + 2},${rcy - 34} Q${rcx + 8},${rcy - 18} ${rcx - 2},${rcy - 6}`} />
      <path d={`M${rcx + 4},${rcy - 4} Q${rcx + 14},${rcy - 16} ${rcx + 10},${rcy - 28} Q${rcx + 2},${rcy - 16} ${rcx + 4},${rcy - 4}`} />
      <g stroke="rgba(43,38,32,0.28)" strokeWidth={0.6} strokeLinecap="round">
        <path d={`M${rcx - 6},${rcy - 5} Q${rcx - 14},${rcy - 16} ${rcx - 12},${rcy - 26}`} fill="none" />
        <path d={`M${rcx - 2},${rcy - 7} Q${rcx - 3},${rcy - 20} ${rcx},${rcy - 31}`} fill="none" />
        <path d={`M${rcx + 4},${rcy - 5} Q${rcx + 10},${rcy - 15} ${rcx + 8},${rcy - 24}`} fill="none" />
      </g>
    </g>
  );
  if (type === "pineapple") return (
    <g>
      <path d={`M${rcx + 6},${rcy - 2} L${rcx + 20},${rcy - 8} L${rcx + 15},${rcy - 26} Z`} fill={color} />
      <line x1={rcx + 9} y1={rcy - 5} x2={rcx + 16} y2={rcy - 20} stroke="#8A6A2F" strokeWidth={1} strokeLinecap="round" />
      <line x1={rcx + 12} y1={rcy - 4} x2={rcx + 17} y2={rcy - 15} stroke="#8A6A2F" strokeWidth={1} strokeLinecap="round" />
      <line x1={rcx + 7.5} y1={rcy - 8} x2={rcx + 18} y2={rcy - 11} stroke="#8A6A2F" strokeWidth={0.7} opacity={0.7} />
      <path d={`M${rcx + 15},${rcy - 26} L${rcx + 11},${rcy - 34} L${rcx + 17},${rcy - 33} Z`} fill="#5C7A52" />
      <path d={`M${rcx + 15},${rcy - 26} L${rcx + 14},${rcy - 32}`} stroke="#3F5C42" strokeWidth={0.6} />
    </g>
  );
  if (type === "lime" || type === "lemon") return (
    <g>
      <circle cx={rcx + 16} cy={rcy - 3} r="9" fill={color} stroke="#FBF6EA" strokeWidth={1} />
      <circle cx={rcx + 16} cy={rcy - 3} r="5.5" fill="none" stroke="#FBF6EA" strokeWidth={0.9} opacity={0.8} />
      {[0, 60, 120].map(a => (
        <line key={a} x1={rcx + 16} y1={rcy - 3} x2={rcx + 16 + 5.5 * Math.cos((a * Math.PI) / 180)} y2={rcy - 3 + 5.5 * Math.sin((a * Math.PI) / 180)} stroke="#FBF6EA" strokeWidth={0.8} opacity={0.8} />
      ))}
      <circle cx={rcx + 13.4} cy={rcy - 5.8} r="1.6" fill="rgba(255,255,255,0.5)" />
    </g>
  );
  if (type === "orange" || type === "twist") return (
    <g>
      <path d={`M${rcx + 8},${rcy - 26} Q${rcx + 22},${rcy - 24} ${rcx + 18},${rcy - 12} Q${rcx + 14},${rcy - 4} ${rcx + 20},${rcy + 2}`}
        fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <path d={`M${rcx + 9},${rcy - 25} Q${rcx + 20},${rcy - 23} ${rcx + 17},${rcy - 13}`}
        fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
  if (type === "dust") return (
    <g fill={color} opacity={0.75}>
      {[[-10, -2], [-3, -8], [5, -3], [12, -7], [-14, -9], [9, -12]].map(([dx, dy], i) => (
        <circle key={i} cx={rcx + dx} cy={rcy + dy} r={1.3} />
      ))}
    </g>
  );
  if (type === "coffee_beans") return (
    <g fill={color} stroke="#FBF6EA" strokeWidth={0.5}>
      <ellipse cx={rcx + 10} cy={rcy - 8} rx="3.5" ry="2.2" transform={`rotate(20 ${rcx + 10} ${rcy - 8})`} />
      <ellipse cx={rcx + 17} cy={rcy - 5} rx="3.5" ry="2.2" transform={`rotate(-15 ${rcx + 17} ${rcy - 5})`} />
      <ellipse cx={rcx + 13} cy={rcy - 1} rx="3.5" ry="2.2" transform={`rotate(35 ${rcx + 13} ${rcy - 1})`} />
      <path d={`M${rcx + 8.5},${rcy - 8} Q${rcx + 10},${rcy - 8} ${rcx + 11.5},${rcy - 8}`} stroke="#FBF6EA" strokeWidth={0.5} transform={`rotate(20 ${rcx + 10} ${rcy - 8})`} />
      <path d={`M${rcx + 15.5},${rcy - 5} Q${rcx + 17},${rcy - 5} ${rcx + 18.5},${rcy - 5}`} stroke="#FBF6EA" strokeWidth={0.5} transform={`rotate(-15 ${rcx + 17} ${rcy - 5})`} />
    </g>
  );
  return null;
}

const GLASS_SHAPES = {
  rocks: { rim: [50, 88, 26, 6], body: "M25,88 L21.5,136 Q50,142.5 78.5,136 L75,88 Z", liquid: "M28,101 Q50,107 72,101 L75,88 L25,88 Z", liquidTopY: 101, foot: null, handle: null },
  highball: { rim: [50, 45, 20, 5], body: "M32,45 L28,138 Q50,143.5 72,138 L68,45 Z", liquid: "M34,60 Q50,65 66,60 L68,45 L32,45 Z", liquidTopY: 60, foot: null, handle: null },
  coupe: { rim: [50, 58, 30, 7], body: "M20,58 Q50,100 80,58 Z M50,95 L50,126", foot: [50, 129, 15, 3.5], liquid: "M25,63 Q50,92 75,63 Q50,69 25,63 Z", liquidTopY: 63, handle: null, bowlOnly: true },
  flute: { rim: [50, 38, 12, 3.5], body: "M38,38 L46,96 Q50,99 54,96 L62,38 Z M50,96 L50,127", foot: [50, 130, 13.5, 3.5], liquid: "M40,46 Q50,52 60,46 L54,93 Q50,96 46,93 Z", liquidTopY: 46, handle: null },
  hurricane: { rim: [50, 30, 24, 6], body: "M28,30 C21,52 33,60 29,80 C24,102 26,120 28,134 Q50,140.5 72,134 C74,120 76,102 71,80 C67,60 79,52 72,30 Z", liquid: "M31,44 Q50,50 69,44 C67,58 76,63 71,82 C75,102 73,118 71,131 Q50,137 29,131 C27,118 25,102 29,82 C24,63 33,58 31,44 Z", liquidTopY: 44, foot: null, handle: null },
  mule_mug: { rim: [46, 55, 20, 5], body: "M28,55 L26.5,130 Q46,135.5 65.5,130 L64,55 Z", liquid: "M30,68 Q46,73 62,68 L64,55 L28,55 Z", liquidTopY: 68, foot: null, handle: "M64,68 Q87,74 85,95 Q83,113 63,117" },
  wine: { rim: [50, 55, 18, 5], body: "M32,55 Q21,80 34,101 Q42,110 50,111 Q58,110 66,101 Q79,80 68,55 Z M50,111 L50,130", foot: [50, 133, 15, 3.5], liquid: "M28,77 Q28,92 40,104 Q45,108 50,108.5 Q55,108 60,104 Q72,92 72,77 Q61,84 50,84.5 Q39,84 28,77 Z", liquidTopY: 77, handle: null, bowlOnly: true },
  mug: { rim: [46, 45, 18, 4.5], body: "M30,45 L28,130 Q46,135.5 64,130 L62,45 Z", liquid: "M31.5,58 Q46,63 60.5,58 L62,45 L30,45 Z", liquidTopY: 58, foot: null, handle: "M62,60 Q85,66 83,90 Q81,111 62,113" },
  julep: { rim: [50, 70, 22, 5.5], body: "M30,70 L27,135 Q50,141 73,135 L70,70 Z", liquid: "M32.5,82 Q50,87 67.5,82 L70,70 L30,70 Z", liquidTopY: 82, foot: null, handle: null },
};

function GlassArt({ glass, colors, garnishes, garnish, mono, size = 116, plinth, dropIn, ambient, rim, foam, iceStyle }) {
  const type = normalizeGlass(glass);
  const shape = GLASS_SHAPES[type];
  const [rcx, rcy, rrx, rry] = shape.rim;
  const outline = mono ? BOTTLE : "rgba(255,255,255,0.92)";
  const outlineSoft = mono ? "rgba(31,61,54,0.35)" : "rgba(255,255,255,0.5)";
  // `garnish` (enkelvoud) blijft ondersteund voor eventuele oude aanroepen.
  const garnishList = garnishes || (garnish ? [garnish] : []);
  const gid = `liq-${type}-${garnishList.join("_")}-${rim || "n"}-${foam || "n"}-${mono ? "m" : "c"}`;
  const grad = colors || ["#8A8171", "#DED2B8"];
  const ice = iceStyle ?? ((type === "rocks" || type === "highball" || type === "hurricane" || type === "mule_mug" || type === "mug") ? "cubes" : "none");
  const garnishAnchors = [{ dx: 0, dy: 0 }, { dx: -28, dy: 10 }];

  return (
    <svg viewBox="0 0 100 150" width={size} height={size * 1.5} style={{ overflow: "visible", flexShrink: 0 }}>
      {!mono && (
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={grad[0]} />
            <stop offset="65%" stopColor={grad[0]} />
            <stop offset="100%" stopColor={grad[1]} />
          </linearGradient>
          <radialGradient id={`${gid}-plinth`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.28)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
      )}

      {plinth && !mono && <ellipse cx="50" cy="143" rx="34" ry="7" fill={`url(#${gid}-plinth)`} />}

      {!mono && shape.liquid && (
        ambient ? (
          <g className="glass-shimmer">
            <path className="glass-liquid-fill" d={shape.liquid} fill={`url(#${gid})`} opacity={0.88} />
          </g>
        ) : (
          <path className="glass-liquid-fill" d={shape.liquid} fill={`url(#${gid})`} opacity={0.88} />
        )
      )}
      {dropIn && !mono && shape.liquid && (
        <circle className="glass-drop-fall" cx={rcx} cy={shape.liquidTopY - 26} r="3.2" fill={grad[1]} />
      )}

      {!mono && shape.liquid && !foam && (
        <ellipse cx={rcx} cy={shape.liquidTopY + 1.5} rx={rrx * 0.72} ry={rry * 0.3} fill="rgba(255,255,255,0.22)" />
      )}

      {shape.handle && <path d={shape.handle} fill="none" stroke={outline} strokeWidth={2.5} strokeLinecap="round" />}
      <path d={shape.body} fill={mono ? "none" : "rgba(0,0,0,0.06)"} stroke={outline} strokeWidth={2.3} strokeLinejoin="round" strokeLinecap="round" />

      {!mono && foam && shape.liquid && (
        <ellipse cx={rcx} cy={shape.liquidTopY + 4} rx={rrx * 0.9} ry={rry * 0.75}
          fill={foam === "cream" ? "rgba(250,245,230,0.92)" : "rgba(214,181,122,0.85)"} />
      )}

      <ellipse cx={rcx} cy={rcy} rx={rrx} ry={rry} fill="none" stroke={outline} strokeWidth={2.3} />
      {shape.foot && <ellipse cx={shape.foot[0]} cy={shape.foot[1]} rx={shape.foot[2]} ry={shape.foot[3]} fill="none" stroke={outline} strokeWidth={2.3} />}

      {!mono && rim && (
        <g fill={rim === "salt" ? "#FBF6EA" : "#F0D9A0"} stroke="rgba(43,38,32,0.18)" strokeWidth={0.4}>
          {Array.from({ length: 22 }).map((_, i) => {
            const a = (i / 22) * Math.PI * 2;
            const jitter = (i % 3) * 0.6;
            return <circle key={i} cx={rcx + Math.cos(a) * (rrx + 2.5 + jitter)} cy={rcy + Math.sin(a) * (rry * 0.95 + 1.5 + jitter)} r={rim === "salt" ? 1.5 : 1.9} />;
          })}
        </g>
      )}

      {/* glans-highlight: twee lichtstrepen, zoals een gefotografeerd glas
          er twee reflecties op heeft i.p.v. één mechanisch lijntje */}
      <path d={`M${rcx - rrx * 0.55},${rcy + rry + 6} Q${rcx - rrx * 0.9},${(rcy + shape.liquidTopY) / 2 + 20} ${rcx - rrx * 0.6},${shape.liquidTopY + 34}`}
        fill="none" stroke={outlineSoft} strokeWidth={1.5} strokeLinecap="round" />
      {!mono && (
        <path d={`M${rcx + rrx * 0.62},${rcy + rry * 0.4} Q${rcx + rrx * 0.85},${(rcy + shape.liquidTopY) / 2 + 10} ${rcx + rrx * 0.68},${shape.liquidTopY + 20}`}
          fill="none" stroke={outlineSoft} strokeWidth={0.9} strokeLinecap="round" opacity={0.6} />
      )}

      {!mono && (
        <g>
          {ice === "cubes" && (
            <>
              <rect x={rcx - 13} y={shape.liquidTopY - 4} width="10" height="10" rx="1.5" fill="rgba(255,255,255,0.75)" stroke="rgba(255,255,255,0.9)" strokeWidth={0.5} transform={`rotate(-12 ${rcx - 8} ${shape.liquidTopY})`} />
              <line x1={rcx - 11.5} y1={shape.liquidTopY - 2} x2={rcx - 4.5} y2={shape.liquidTopY + 4} stroke="rgba(255,255,255,0.95)" strokeWidth={0.6} transform={`rotate(-12 ${rcx - 8} ${shape.liquidTopY})`} />
              <rect x={rcx + 3} y={shape.liquidTopY - 8} width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.85)" strokeWidth={0.5} transform={`rotate(8 ${rcx + 8} ${shape.liquidTopY - 4})`} />
              <line x1={rcx + 4.5} y1={shape.liquidTopY - 6} x2={rcx + 10.5} y2={shape.liquidTopY - 1} stroke="rgba(255,255,255,0.9)" strokeWidth={0.5} transform={`rotate(8 ${rcx + 8} ${shape.liquidTopY - 4})`} />
            </>
          )}
          {ice === "crushed" && (
            <g fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.85)" strokeWidth={0.5}>
              {[[-14, -2], [-6, -9], [3, -3], [11, -8], [-2, 4], [8, 2]].map(([dx, dy], i) => (
                <rect key={i} x={rcx + dx - 3} y={shape.liquidTopY + dy - 3} width={6} height={6} rx={1.2} transform={`rotate(${(i * 37) % 60 - 20} ${rcx + dx} ${shape.liquidTopY + dy})`} />
              ))}
            </g>
          )}
          {type === "julep" && (
            <>
              <circle cx={rcx - 10} cy={rcy - 6} r="4" fill="rgba(255,255,255,0.7)" />
              <circle cx={rcx + 2} cy={rcy - 10} r="5" fill="rgba(255,255,255,0.6)" />
              <circle cx={rcx + 11} cy={rcy - 4} r="4" fill="rgba(255,255,255,0.55)" />
            </>
          )}
          {type === "flute" && (
            <>
              <circle cx={rcx - 4} cy={shape.liquidTopY + 30} r="1.4" fill="rgba(255,255,255,0.7)" />
              <circle cx={rcx + 3} cy={shape.liquidTopY + 18} r="1" fill="rgba(255,255,255,0.6)" />
              <circle cx={rcx - 2} cy={shape.liquidTopY + 8} r="1.2" fill="rgba(255,255,255,0.65)" />
            </>
          )}

          {garnishList.map((g, i) => (
            <g key={g + i} transform={`translate(${garnishAnchors[i].dx},${garnishAnchors[i].dy})`}>
              <GarnishShape type={g} rcx={rcx} rcy={rcy} color={GARNISH_COLORS[g] || BRASS} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

// Kleine, oneindig lopende SVG/CSS-animatie die laat zien hoe een techniek
// beweegt. Alleen voor technieken waar een beweging ook echt iets uitlegt
// (shaken/stirred/muddle) — voor de rest volstaat de tip-tekst.
const TECHNIQUE_ANIMATIONS = new Set(["shaken", "stirred", "muddle"]);
function TechniqueAnimation({ technique }) {
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  if (!TECHNIQUE_ANIMATIONS.has(technique)) return null;

  return (
    <div style={{
      borderRadius: RADIUS + 4, marginBottom: 14, height: 190,
      background: `radial-gradient(ellipse 420px 260px at 50% 15%, #2A4B42, ${BOTTLE_DARK} 75%)`,
      boxShadow: "0 8px 24px -8px rgba(19,38,34,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    }}>
      {technique === "shaken" && (
        <svg viewBox="0 0 190 220" fill="none" style={{ width: 150, height: 174, overflow: "visible" }}>
          <ellipse cx="95" cy="205" rx="34" ry="6" fill="rgba(0,0,0,0.28)" />
          <g className={reduceMotion ? undefined : "anim-shake"}>
            <path d="M65 45 L125 45 L112 150 Q112 158 104 158 L86 158 Q78 158 78 150 Z" fill="rgba(184,134,46,0.35)" stroke={CREAM} strokeWidth="2.2" />
            <path d="M65 45 L125 45" stroke={CREAM} strokeWidth="2.2" />
            <path d="M70 62 L120 62" stroke={CREAM} strokeWidth="1.4" opacity="0.7" />
            <rect x="83" y="80" width="10" height="10" rx="1.5" fill="rgba(255,255,255,0.75)" stroke={CREAM} strokeWidth="0.8" transform="rotate(-10 88 85)" />
            <rect x="98" y="95" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.6)" stroke={CREAM} strokeWidth="0.8" transform="rotate(14 102 99)" />
            <rect x="84" y="112" width="9" height="9" rx="1.5" fill="rgba(255,255,255,0.6)" stroke={CREAM} strokeWidth="0.8" transform="rotate(6 88 116)" />
          </g>
        </svg>
      )}
      {technique === "stirred" && (
        <svg viewBox="0 0 190 220" fill="none" style={{ width: 150, height: 174, overflow: "visible" }}>
          <defs>
            <clipPath id="stirGlassClip">
              <path d="M60 57 L130 57 L119 184 Q119 190 112 190 L78 190 Q71 190 71 184 Z" />
            </clipPath>
          </defs>
          <ellipse cx="95" cy="205" rx="34" ry="6" fill="rgba(0,0,0,0.28)" />
          <path d="M63 100 L127 100 L120 185 Q120 192 112 192 L78 192 Q70 192 70 185 Z" fill="rgba(184,134,46,0.30)" />
          <path d="M58 55 L132 55 L120 185 Q120 192 112 192 L78 192 Q70 192 70 185 Z" fill="none" stroke={CREAM} strokeWidth="2.2" />
          <rect x="60" y="150" width="13" height="13" rx="2" fill="rgba(255,255,255,0.6)" stroke={CREAM} strokeWidth="1" transform="rotate(-8 66 156)" />
          {/* lepel: steel + kop als één stijf geheel, pivot vastgezet met SVG's
              eigen animateTransform i.p.v. CSS transform-origin — die is op
              SVG-elementen niet betrouwbaar zonder transform-box en liet de
              lepel eerder buiten het glas zwaaien. */}
          <g clipPath="url(#stirGlassClip)">
            <path d="M100 60 L95 145" stroke={CREAM} strokeWidth="2.4" strokeLinecap="round" />
            <rect x="88" y="140" width="13" height="10" rx="3" fill={BRASS} stroke={CREAM} strokeWidth="1" />
            {!reduceMotion && (
              <animateTransform attributeName="transform" type="rotate"
                values="-22 100 60; 22 100 60; -22 100 60"
                keyTimes="0; 0.5; 1"
                keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" calcMode="spline"
                dur="1s" repeatCount="indefinite" />
            )}
          </g>
          <g>
            <path d="M104 24 Q120 14 134 26 Q140 36 132 46 Q122 54 108 50 Q96 44 98 34 Q99 27 104 24 Z" fill={PAPER_DEEP} stroke={CREAM} strokeWidth="2" />
            <path d="M104 30 Q112 26 120 31" stroke={CREAM} strokeWidth="1.1" fill="none" opacity="0.8" />
            <path d="M102 38 Q112 34 122 39" stroke={CREAM} strokeWidth="1.1" fill="none" opacity="0.8" />
          </g>
        </svg>
      )}
      {technique === "muddle" && (
        <svg viewBox="0 0 190 220" fill="none" style={{ width: 150, height: 174, overflow: "visible" }}>
          <ellipse cx="95" cy="205" rx="34" ry="6" fill="rgba(0,0,0,0.28)" />
          <path d="M62 120 L128 120 L118 188 Q118 195 110 195 L80 195 Q72 195 72 188 Z" fill="none" stroke={CREAM} strokeWidth="2.2" />
          <g className={reduceMotion ? undefined : "anim-mint"}>
            <path d="M85 190 Q80 178 90 172 Q94 182 85 190 Z" fill="#3F6B52" stroke={CREAM} strokeWidth="0.8" />
            <path d="M100 190 Q108 180 100 170 Q92 180 100 190 Z" fill="#4B7B5E" stroke={CREAM} strokeWidth="0.8" />
            <path d="M93 192 Q95 182 105 180 Q103 190 93 192 Z" fill="#3F6B52" stroke={CREAM} strokeWidth="0.8" />
          </g>
          <g className={reduceMotion ? undefined : "anim-muddle"}>
            <line x1="95" y1="35" x2="95" y2="160" stroke={CREAM} strokeWidth="3.2" strokeLinecap="round" />
            <ellipse cx="95" cy="163" rx="11" ry="7" fill="rgba(184,134,46,0.5)" stroke={CREAM} strokeWidth="1.6" />
          </g>
        </svg>
      )}
    </div>
  );
}

function SplashScreen({ onDone }) {
  // Op sommige iOS-toestellen (met name als PWA vanaf het beginscherm) reikt een
  // `position: fixed`-overlay niet helemaal tot de onderrand bij de home-indicator,
  // waardoor de paginakleur eronder er als streepje doorheen piept. In plaats van
  // te vertrouwen op de overlay zelf, zetten we de achtergrond van de pagina erachter
  // ook gewoon donkergroen zolang de intro loopt, dan is een eventueel gaatje onzichtbaar.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.overflow = "hidden";
    document.body.style.backgroundColor = "#0E1917";
    document.documentElement.style.backgroundColor = "#0E1917";
    hideNativeSplash();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, []);
  return (
    <div className="splash-overlay" onAnimationEnd={(e) => { if (e.animationName === "splashFadeOverlay") onDone(); }}>
      <div className="splash-inner">
        <div className="splash-ring">
          <svg viewBox="0 0 100 100" width="48" height="48">
            <defs>
              <clipPath id="splashBowlClip">
                <path d="M22 22 L50 50 L78 22 Z" />
              </clipPath>
            </defs>
            <g stroke="#DDB877" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M22 22 L50 50 L78 22" />
              <line x1="50" y1="50" x2="50" y2="80" />
              <line x1="35" y1="80" x2="65" y2="80" />
            </g>
            <rect className="splash-liquid" x="18" y="14" width="64" height="36" fill="#B8862E" clipPath="url(#splashBowlClip)" />
            <circle className="splash-drop" cx="50" cy="4" r="3" fill="#DDB877" />
          </svg>
        </div>
        <h1 className="splash-title">Mijn Thuisbar</h1>
        <div className="splash-sub">Welkom in de wereld van de cocktail</div>
      </div>
    </div>
  );
}

// Alleen ingebouwde recepten kunnen worden gedeeld: een gedeelde link heeft geen
// toegang tot de custom recepten die in de localStorage van de gastheer staan
// (die leven alleen op dat ene apparaat), dus we vallen terug op de statische lijst.
function GuestMenuView({ recipeIds }) {
  const menuRecipes = recipeIds.map(id => RECIPES.find(r => r.id === id)).filter(Boolean);
  const skipped = recipeIds.length - menuRecipes.length;

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: sans, color: INK }}>
      <div style={{ background: `radial-gradient(ellipse 900px 300px at 15% -40%, #2A4B42, ${BOTTLE_DARK} 70%)`, borderBottom: `3px solid ${BRASS}`, padding: "calc(env(safe-area-inset-top) + 26px) 20px 24px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", flexShrink: 0 }}>
            <Martini color={BRASS} size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h1 style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: 0 }}>Het menu van vanavond</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#B9C4B9" }}>Gedeeld vanuit Mijn Thuisbar</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "26px 20px calc(env(safe-area-inset-bottom) + 50px)" }}>
        {menuRecipes.length === 0 && (
          <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "40px 0" }}>Dit menu-linkje lijkt niet (meer) geldig.</p>
        )}
        {menuRecipes.map((r, idx) => {
          const role = getMenuRole(r);
          const roleInfo = MENU_ROLES[role];
          const garnishes = inferGarnishes(r, INGREDIENTS);
          const funFact = getFunFact(r);
          const profile = getTasteProfile(r, INGREDIENTS);
          return (
            <div key={r.id} style={{
              borderRadius: RADIUS + 4, padding: "20px 22px", marginBottom: 16, position: "relative",
              background: PAPER_DEEP, border: `1px solid ${BORDER}`, boxShadow: SHADOW_CARD,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                <div style={{ flex: "0 0 auto" }}>
                  <ItemImage id={r.id} type="cocktail" photoUrl={r.image} size={72} radius={14} filter={RECIPE_PHOTO_FILTER} fallback={
                    <GlassArt glass={r.glass} colors={getLiquidColor(r, INGREDIENTS)} garnishes={garnishes} rim={inferRim(r, INGREDIENTS)} foam={inferFoam(r, INGREDIENTS)} iceStyle={inferIceStyle(r)} plinth size={72} />
                  } />
                </div>
                <div style={{ minWidth: 0, paddingTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 12, color: BRASS }}>No. {String(idx + 1).padStart(2, "0")}</span>
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: roleInfo.gradient[0] }} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: MUTED }}>{roleInfo.label}</span>
                  </div>
                  <h2 style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, fontStyle: "italic", color: INK, margin: "0 0 3px" }}>{r.name}</h2>
                  <div style={{ fontSize: 12.5, color: MUTED }}>{r.family} · {r.glass}</div>
                </div>
              </div>

              <p style={{ fontFamily: serif, fontStyle: "italic", fontSize: 14, color: INK, margin: "0 0 10px", lineHeight: 1.5, opacity: 0.85 }}>"{getSfeerQuote(r, role)}"</p>

              {funFact && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 3 }}>Wist je dat</div>
                  <p style={{ fontFamily: serif, fontSize: 13, color: INK, margin: 0, lineHeight: 1.55, opacity: 0.9 }}>{funFact}</p>
                </div>
              )}

              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 9, marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                  {r.ingredients.map((ing, i) => {
                    const meta = INGREDIENTS.find(x => x.id === ing.id);
                    return <span key={i}>{meta?.name || ing.name || ing.id}{i < r.ingredients.length - 1 ? " · " : ""}</span>;
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 8 }}>Smaakprofiel</div>
                {[["Zoet", profile.zoet], ["Zuur", profile.zuur], ["Bitter", profile.bitter], ["Sterk", profile.sterk]].map(([label, score]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED, width: 44, flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                      <div style={{ width: `${score * 20}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${BRASS}, #D8AF5C)` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {skipped > 0 && (
          <p style={{ color: MUTED, fontSize: 12.5, textAlign: "center", marginTop: 10 }}>
            {skipped} eigen creatie{skipped === 1 ? "" : "s"} van de gastheer {skipped === 1 ? "kon" : "konden"} hier niet getoond worden.
          </p>
        )}
      </div>
    </div>
  );
}

// Gastenkant van de smaaktest: geen account nodig (zelfde opzet als
// GuestMenuView hierboven), zoekt de smaaktest op via het niet-raadbare id
// in de link en schrijft één antwoord weg naar party_survey_responses.
function GuestSurveyView({ surveyId }) {
  const [survey, setSurvey] = useState(undefined); // undefined = laden, null = niet gevonden
  const [step, setStep] = useState(0); // 0..3, per vraag-groep
  const [tags, setTags] = useState([]);
  const [dislikeTags, setDislikeTags] = useState([]);
  const [strength, setStrength] = useState(3);
  const [alcoholFree, setAlcoholFree] = useState(false);
  const [favoriteSpirit, setFavoriteSpirit] = useState(null);
  const [favoriteCocktailIds, setFavoriteCocktailIds] = useState([]);
  const [cocktailQuery, setCocktailQuery] = useState("");
  const [dietary, setDietary] = useState([]);
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  // Social proof: hoeveel gasten al vóór jou hebben ingevuld — puur om het
  // invullen aantrekkelijker te maken, telt verder nergens in mee.
  const [existingCount, setExistingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase.from("party_surveys").select("id, title").eq("id", surveyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setSurvey(data || null); })
      .catch(() => { if (!cancelled) setSurvey(null); });
    supabase.from("party_survey_responses").select("id", { count: "exact", head: true }).eq("survey_id", surveyId)
      .then(({ count }) => { if (!cancelled && count != null) setExistingCount(count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [surveyId]);

  const cocktailSuggestions = cocktailQuery.trim().length > 0
    ? RECIPES.filter(r => r.name.toLowerCase().includes(cocktailQuery.trim().toLowerCase()) && !favoriteCocktailIds.includes(r.id)).slice(0, 6)
    : [];
  const addFavoriteCocktail = (id) => { setFavoriteCocktailIds(ids => [...ids, id]); setCocktailQuery(""); };
  const removeFavoriteCocktail = (id) => setFavoriteCocktailIds(ids => ids.filter(x => x !== id));

  const toggle = (setter) => (key) => setter(t => t.includes(key) ? t.filter(k => k !== key) : [...t, key]);
  const toggleTag = toggle(setTags);
  const toggleDislike = toggle(setDislikeTags);
  const toggleDietary = toggle(setDietary);

  const STEPS = 4;
  const goNext = () => setStep(s => Math.min(STEPS - 1, s + 1));
  const goBack = () => setStep(s => Math.max(0, s - 1));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("party_survey_responses").insert({
      survey_id: surveyId,
      guest_name: guestName.trim() || null,
      taste_tags: tags,
      dislike_tags: dislikeTags,
      strength,
      alcohol_free: alcoholFree,
      favorite_spirit: favoriteSpirit,
      favorite_cocktail_ids: favoriteCocktailIds,
      dietary,
    });
    setSubmitting(false);
    if (err) { setError("Versturen is niet gelukt. Probeer het nog eens."); return; }
    setSubmitted(true);
  };

  // Klein bedankje-op-maat: dezelfde persoonlijkheidstypering die ingelogde
  // gebruikers over hun eigen check-ins krijgen, hier voor de gast zelf op
  // basis van hun eigen keuzes — puur leuk, telt niet mee in de resultaten.
  const myPersonalityKey = tags[0] || (strength >= 4 ? "sterk" : null);
  const myPersonality = myPersonalityKey ? PERSONALITY[myPersonalityKey] : null;

  const progressDots = (
    <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
      {Array.from({ length: STEPS }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? BRASS : BORDER }} />
      ))}
    </div>
  );

  const NavButtons = ({ onSubmitStep }) => (
    <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
      {step > 0 && (
        <button onClick={goBack} style={{
          padding: "13px 18px", borderRadius: 14, border: `1px solid ${BORDER}`, background: "none",
          color: INK, fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>
          Terug
        </button>
      )}
      <button onClick={onSubmitStep} disabled={submitting} className="press-scale" style={{
        flex: 1, padding: "13px 18px", borderRadius: 14, border: "none",
        background: `linear-gradient(135deg, ${BOTTLE}, ${BOTTLE_DARK})`,
        color: CREAM, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
      }}>
        {step < STEPS - 1 ? "Volgende" : submitting ? "Bezig…" : "Versturen"}
      </button>
    </div>
  );

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: sans, color: INK }}>
      <div style={{ background: `radial-gradient(ellipse 900px 300px at 15% -40%, #2A4B42, ${BOTTLE_DARK} 70%)`, borderBottom: `3px solid ${BRASS}`, padding: "calc(env(safe-area-inset-top) + 26px) 20px 24px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", flexShrink: 0 }}>
            <Martini color={BRASS} size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: 0 }}>Smaaktest</h1>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#B9C4B9" }}>{survey?.title ? `Voor ${survey.title}` : "Gedeeld vanuit Mijn Thuisbar"}</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "26px 20px calc(env(safe-area-inset-bottom) + 50px)" }}>
        {survey === undefined ? (
          <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "40px 0" }}>Bezig met laden…</p>
        ) : survey === null ? (
          <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "40px 0" }}>Dit linkje lijkt niet (meer) geldig.</p>
        ) : submitted ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🥂</div>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Bedankt!</div>
            <p style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.5, marginBottom: myPersonality ? 22 : 0 }}>Je voorkeuren zijn doorgegeven. De gastheer stelt hiermee het menu samen.</p>
            {myPersonality && (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 18, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                  <span style={{ fontSize: 22 }}>{myPersonality.emoji}</span>
                  <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: "#8F6A21" }}>{myPersonality.title}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "#5C5548", fontStyle: "italic", lineHeight: 1.5 }}>Jouw type voor vanavond, gebaseerd op wat je net invulde.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {progressDots}

            {step === 0 && (
              <>
                <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, margin: "0 0 20px" }}>
                  Kost je hooguit een minuutje. De gastheer gebruikt dit om een cocktailmenu samen te stellen dat bij de groep past.
                  {existingCount > 0 && ` ${existingCount} ${existingCount === 1 ? "gast vulde" : "gasten vulden"} 'm al in.`}
                </p>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>Waar houd je van?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
                  {SURVEY_TASTE_KEYS.map(key => {
                    const meta = TASTE_META[key];
                    const active = tags.includes(key);
                    return (
                      <button key={key} onClick={() => toggleTag(key)} className="press-scale" style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "9px 15px", borderRadius: 100,
                        border: active ? `1.5px solid ${BRASS}` : `1.5px solid ${BORDER}`,
                        background: active ? `linear-gradient(135deg, ${BRASS}, #8F6A21)` : CREAM,
                        color: active ? CREAM : INK, fontSize: 13.5, fontFamily: sans, fontWeight: 600, cursor: "pointer",
                      }}>
                        {meta.emoji} {meta.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>Hoe sterk mag het zijn?</div>
                <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "16px 18px" }}>
                  <input type="range" min="1" max="5" value={strength} onChange={e => setStrength(Number(e.target.value))}
                    style={{ width: "100%", accentColor: BRASS }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTED, marginTop: 4 }}>
                    <span>Licht</span><span>Sterk</span>
                  </div>
                </div>
                <NavButtons onSubmitStep={goNext} />
              </>
            )}

            {step === 1 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>Waar houd je liever niet van?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
                  {SURVEY_TASTE_KEYS.map(key => {
                    const meta = TASTE_META[key];
                    const active = dislikeTags.includes(key);
                    return (
                      <button key={key} onClick={() => toggleDislike(key)} className="press-scale" style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "9px 15px", borderRadius: 100,
                        border: active ? `1.5px solid ${BURGUNDY}` : `1.5px solid ${BORDER}`,
                        background: active ? BURGUNDY : CREAM,
                        color: active ? CREAM : INK, fontSize: 13.5, fontFamily: sans, fontWeight: 600, cursor: "pointer",
                      }}>
                        {meta.emoji} {meta.label}
                      </button>
                    );
                  })}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "14px 16px", cursor: "pointer" }}>
                  <Switch checked={alcoholFree} onChange={setAlcoholFree} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Ik drink liever alcoholvrij</span>
                </label>
                <NavButtons onSubmitStep={goNext} />
              </>
            )}

            {step === 2 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>Favoriete drank?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
                  {FAVORITE_SPIRIT_OPTIONS.map(opt => {
                    const active = favoriteSpirit === opt.key;
                    return (
                      <button key={opt.key} onClick={() => setFavoriteSpirit(active ? null : opt.key)} className="press-scale" style={{
                        padding: "9px 15px", borderRadius: 100,
                        border: active ? `1.5px solid ${BRASS}` : `1.5px solid ${BORDER}`,
                        background: active ? `linear-gradient(135deg, ${BRASS}, #8F6A21)` : CREAM,
                        color: active ? CREAM : INK, fontSize: 13.5, fontFamily: sans, fontWeight: 600, cursor: "pointer",
                      }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>Cocktails die je lekker vindt?</div>
                {favoriteCocktailIds.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {favoriteCocktailIds.map(id => {
                      const r = RECIPES.find(x => x.id === id);
                      if (!r) return null;
                      return (
                        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `linear-gradient(135deg, ${BRASS}, #8F6A21)`, color: CREAM, borderRadius: 100, padding: "6px 8px 6px 13px", fontSize: 12.5, fontWeight: 600 }}>
                          {r.name}
                          <button onClick={() => removeFavoriteCocktail(id)} aria-label="Verwijderen" style={{ background: "rgba(255,255,255,0.25)", border: "none", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: CREAM, padding: 0 }}>
                            <X size={10} strokeWidth={3} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div style={{ position: "relative" }}>
                  <input value={cocktailQuery} onChange={e => setCocktailQuery(e.target.value)} placeholder="Typ om te zoeken, tik meerdere aan" style={fieldStyle()} />
                  {cocktailSuggestions.length > 0 && (
                    <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: SHADOW_CARD, zIndex: 5, overflow: "hidden" }}>
                      {cocktailSuggestions.map(r => (
                        <button key={r.id} onClick={() => addFavoriteCocktail(r.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", borderTop: `1px solid ${BORDER}`, fontSize: 13.5, color: INK, cursor: "pointer", fontFamily: sans }}>
                          {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <NavButtons onSubmitStep={goNext} />
              </>
            )}

            {step === 3 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>Dieetwensen of allergieën?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
                  {Object.keys(DIETARY_META).map(key => {
                    const meta = DIETARY_META[key];
                    const active = dietary.includes(key);
                    return (
                      <button key={key} onClick={() => toggleDietary(key)} className="press-scale" style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "9px 15px", borderRadius: 100,
                        border: active ? `1.5px solid ${BRASS}` : `1.5px solid ${BORDER}`,
                        background: active ? `linear-gradient(135deg, ${BRASS}, #8F6A21)` : CREAM,
                        color: active ? CREAM : INK, fontSize: 13.5, fontFamily: sans, fontWeight: 600, cursor: "pointer",
                      }}>
                        {meta.emoji} {meta.label}
                      </button>
                    );
                  })}
                </div>
                <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}>Je naam (optioneel)</label>
                <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Zodat de gastheer weet wie er reageerde" autoCapitalize="words" style={fieldStyle()} />
                {error && <p style={{ color: BURGUNDY, fontSize: 13, marginTop: 14, marginBottom: 0 }}>{error}</p>}
                <NavButtons onSubmitStep={submit} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Recepten en Cursus moeten zonder account te gebruiken zijn (Apple-eis) —
// dit is de losse gast-variant van de app, alleen actief zolang session
// null is. Draait op precies dezelfde recepten/voorraad/cursus-state en
// -functies als de ingelogde app (die leven al hoger in ThuisbarApp, ook
// zonder sessie), dus een gast kan gewoon zijn voorraad gebruiken en de
// cursus doorlopen — alleen check-ins/vrienden/profiel vereisen inloggen.
function GuestBrowseShell({
  recipes, allIngredients, isOwned, ingredientLabel, onSound,
  onAddToShoppingList, onAddToFeest, feestChosen,
  recentRecipeIds, onViewRecipe, favoriteRecipeIds, onToggleFavorite,
  courseProgress, setCourseProgress, onGoLogin,
}) {
  const [tab, setTab] = useState("ontdekken");
  const [pendingRecipeId, setPendingRecipeId] = useState(null);

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: sans, color: INK }}>
      <div style={{ background: `radial-gradient(ellipse 900px 300px at 15% -40%, #2A4B42, ${BOTTLE_DARK} 70%)`, borderBottom: `3px solid ${BRASS}`, padding: "calc(env(safe-area-inset-top) + 22px) 20px 20px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", flexShrink: 0 }}>
            <Martini color={BRASS} size={22} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: 0 }}>Mijn Thuisbar</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#B9C4B9" }}>Bekijken kan zonder account</p>
          </div>
          <button onClick={onGoLogin} className="press-scale" style={{
            flexShrink: 0, background: BRASS, color: CREAM, border: "none", borderRadius: 100,
            padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            Inloggen
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px calc(env(safe-area-inset-bottom) + 92px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(184,134,46,0.1)", border: `1px solid rgba(184,134,46,0.3)`, borderRadius: RADIUS, padding: "11px 14px", marginBottom: 20 }}>
          <Lock size={15} color={BRASS} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: INK, lineHeight: 1.4 }}>Inchecken, vrienden en je profiel vereisen een (gratis) account.</span>
        </div>

        {tab === "ontdekken" ? (
          <OntdekkenTab
            openRecipeId={pendingRecipeId} onOpenRecipeHandled={() => setPendingRecipeId(null)}
            recommended={[]} favoriteFamily={null}
            allIngredients={allIngredients} onOpenRecipe={setPendingRecipeId} onSound={onSound}
            makenProps={{
              recipes, isOwned, ingredientLabel, allIngredients,
              onAddToShoppingList, onSound, onOpenRecipe: setPendingRecipeId, onAddToFeest, feestChosen,
            }}
            verhaalProps={{
              recipes, ingredientLabel, allIngredients, isOwned,
              recentRecipeIds, onViewRecipe, onSound,
              favoriteRecipeIds, onToggleFavorite,
              onAddToShoppingList, onAddToFeest, feestChosen,
              onOpenCheckin: onGoLogin,
            }}
          />
        ) : (
          <CursusTab progress={courseProgress} setProgress={setCourseProgress} onSound={onSound} />
        )}
      </div>

      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10,
        background: "var(--dock-bg)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        borderTop: `1px solid rgba(184,134,46,0.3)`, boxShadow: "0 -6px 18px rgba(43,38,32,0.10)",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", padding: "9px 6px calc(env(safe-area-inset-bottom) + 9px)" }}>
          {[{ id: "ontdekken", label: "Ontdekken", icon: Search }, { id: "cursus", label: "Cursus", icon: GraduationCap }].map(t => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                background: "none", border: "none", cursor: "pointer", padding: "4px 2px",
                fontFamily: sans, color: isActive ? BOTTLE : MUTED,
              }}>
                <Icon size={21} strokeWidth={isActive ? 2.1 : 1.7} />
                <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Web Push werkt op iPhone alleen als PWA vanaf het beginscherm (iOS 16.4+),
// niet in een gewoon Safari-tabblad — de aanmeld-permissie zelf werkt overal
// hetzelfde, maar zonder "Toevoegen aan beginscherm" komt er nooit een melding door.
function usePushNotifications(session) {
  const [supported] = useState(() => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  // Voorheen slikte enable() elke fout stil in (permissie geweigerd, een
  // mislukte push_subscriptions-insert, een ongeldige VAPID-key) en zette
  // dan gewoon de knop weer uit — je zag nooit WAAROM het niet lukte. Nu
  // onthouden we de reden, zodat "het werkt niet" ook echt te debuggen is.
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supported || !session) { setEnabled(false); return; }
    navigator.serviceWorker.register("/sw.js")
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setEnabled(!!sub))
      .catch(() => setEnabled(false));
  }, [supported, session]);

  const enable = async () => {
    if (!supported || !session) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Je hebt meldingen geweigerd. Zet ze aan bij de site-instellingen van je browser en probeer opnieuw.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      // Dit schreef voorheen weg zonder de { error } uit het resultaat te
      // checken — als de tabel/RLS het insert weigerde, ging de knop tóch
      // op "aan" terwijl er nooit een inschrijving werd opgeslagen, dus de
      // server had niemand om een melding naar te sturen.
      const { error: dbError } = await supabase.from("push_subscriptions").upsert({
        user_id: session.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      }, { onConflict: "endpoint" });
      if (dbError) {
        setError("Inschrijven is mislukt: " + dbError.message);
        await sub.unsubscribe().catch(() => {});
        setEnabled(false);
        return;
      }
      setEnabled(true);
    } catch (e) {
      setError(e?.message || "Aanzetten van meldingen is onverwacht mislukt.");
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setEnabled(false);
      setBusy(false);
    }
  };

  return { supported, enabled, busy, error, enable, disable };
}

function checkinRowToEntry(row) {
  return {
    id: row.id, date: (row.created_at || "").slice(0, 10), createdAt: row.created_at || null, recipeId: row.recipe_id, name: row.name,
    // PostgREST geeft numeric-kolommen als string terug (i.p.v. number), dus
    // expliciet parsen — anders breekt elke rekensom/vergelijking verderop.
    rating: Number(row.rating), notes: row.notes || "", photo: row.photo || null, location: row.location || "Thuis",
    locationLat: row.location_lat, locationLon: row.location_lon, tasteTags: row.taste_tags || [],
  };
}

// Zelfde fix als bij SplashScreen: op sommige iOS-toestellen reikt een
// volledig-scherm view niet helemaal tot de onderrand bij de home-indicator,
// waardoor de werkelijke paginakleur (altijd beige) er als streepje
// doorheen piept — vooral zichtbaar op een donker scherm als inloggen. Door
// html/body zelf tijdelijk dezelfde kleur te geven is zo'n gaatje onzichtbaar.
function useMatchBodyBackground(color) {
  useEffect(() => {
    const prevBodyBg = document.body.style.backgroundColor;
    const prevHtmlBg = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
    return () => {
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, [color]);
}

// Verplichte leeftijdspoort vóór alle andere content — de app gaat over
// alcohol, dus dit moet vóór zowel inloggen als de gast-links (menu/
// smaaktest) staan. "Nee" blokkeert de app volledig, zonder omweg.
function AgeGateScreen({ onConfirm }) {
  const [declined, setDeclined] = useState(false);
  useMatchBodyBackground(BOTTLE_DARK);
  return (
    <div style={{ minHeight: "100%", background: `radial-gradient(ellipse 900px 500px at 50% -10%, #2A4B42, ${BOTTLE_DARK} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.1)", marginBottom: 20 }}>
          <Martini color={BRASS} size={26} strokeWidth={1.5} />
        </div>
        {declined ? (
          <>
            <h1 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 22, color: CREAM, margin: "0 0 12px" }}>Helaas</h1>
            <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: 0 }}>Mijn Thuisbar draait om alcoholische dranken en is niet geschikt voor bezoekers onder de 18 jaar.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 24, color: CREAM, margin: "0 0 12px" }}>Even een check</h1>
            <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: "0 0 26px" }}>
              Mijn Thuisbar draait om cocktails en alcoholische dranken. Ben je 18 jaar of ouder?
            </p>
            <button onClick={onConfirm} className="press-scale" style={{
              width: "100%", padding: "14px 18px", borderRadius: 14, border: "none", marginBottom: 10,
              background: `linear-gradient(135deg, ${BRASS}, #8F6A21)`, color: CREAM, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              Ja, ik ben 18 jaar of ouder
            </button>
            <button onClick={() => setDeclined(true)} style={{
              width: "100%", padding: "12px 18px", borderRadius: 14, border: "1px solid rgba(251,246,234,0.25)",
              background: "none", color: "#C7CFC5", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}>
              Nee, ik ben jonger dan 18
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Login/registratie: dezelfde donkere "signage"-look als de masthead elders
// in de app, zodat dit niet als een los, generiek inlogscherm aanvoelt maar
// als het voorportaal van dezelfde Bar Register-huisstijl.
function AuthScreen() {
  useMatchBodyBackground(BOTTLE_DARK);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        const trimmedName = name.trim();
        if (!trimmedName) { setError("Vul je naam in."); setBusy(false); return; }
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { name: trimmedName } },
        });
        if (err) throw err;
        if (!data.session) setNotice("Bijna klaar! Check je e-mail om je account te bevestigen, en log daarna in.");
      } else if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (err) throw err;
        setNotice("Check je e-mail voor een link om een nieuw wachtwoord in te stellen.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err.message === "Invalid login credentials" ? "E-mail of wachtwoord klopt niet." : (err.message || "Er ging iets mis, probeer het opnieuw."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100%", background: `radial-gradient(ellipse 900px 500px at 50% -10%, #2A4B42, ${BOTTLE_DARK} 70%)`, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", marginBottom: 14 }}>
            <Martini color={BRASS} size={28} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: 0 }}>Mijn Thuisbar</h1>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#B9C4B9", letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 500 }}>
            {mode === "login" ? "Log in bij je register" : mode === "signup" ? "Maak je eigen register aan" : "Wachtwoord opnieuw instellen"}
          </p>
        </div>

        <form onSubmit={submit} style={{ background: "rgba(251,247,236,0.06)", border: "1px solid rgba(184,134,46,0.25)", borderRadius: RADIUS + 4, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <div>
              <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>Naam</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Hoe je vrienden je kennen" autoComplete="name"
                autoCapitalize="words" enterKeyHint="next"
                style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)" }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" autoComplete="email" required
              inputMode="email" autoCapitalize="none" autoCorrect="off" enterKeyHint={mode === "forgot" ? "send" : "next"}
              style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)" }} />
          </div>
          {mode !== "forgot" && (
            <div>
              <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>Wachtwoord</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minstens 6 tekens" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6}
                enterKeyHint="done"
                style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)" }} />
            </div>
          )}

          {mode === "login" && (
            <button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }} style={{
              alignSelf: "flex-end", background: "none", border: "none", cursor: "pointer", color: "#D9CBAE", fontSize: 12.5, padding: 0, textDecoration: "underline",
            }}>
              Wachtwoord vergeten?
            </button>
          )}

          {error && <p style={{ color: "#E8A0A0", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{error}</p>}
          {notice && <p style={{ color: "#B9D9A0", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{notice}</p>}

          <button type="submit" disabled={busy} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px",
            borderRadius: RADIUS, border: "none", cursor: busy ? "default" : "pointer",
            background: `linear-gradient(135deg, ${BRASS}, #D8AF5C)`, color: BOTTLE_DARK,
            fontFamily: sans, fontSize: 14.5, fontWeight: 800, marginTop: 4, opacity: busy ? 0.7 : 1,
          }}>
            {busy ? "Bezig…" : mode === "login" ? "Inloggen" : mode === "signup" ? "Account aanmaken" : "Stuur resetlink"}
          </button>
        </form>

        {mode === "forgot" ? (
          <button onClick={() => { setMode("login"); setError(""); setNotice(""); }} style={{
            display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer",
            color: "#D9CBAE", fontSize: 13, marginTop: 18, fontFamily: sans,
          }}>
            Terug naar inloggen
          </button>
        ) : (
          <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setNotice(""); }} style={{
            display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer",
            color: "#D9CBAE", fontSize: 13, marginTop: 18, fontFamily: sans,
          }}>
            {mode === "login" ? "Nog geen account? Registreer je" : "Al een account? Log in"}
          </button>
        )}
      </div>
    </div>
  );
}

// Landt hier zodra iemand op de resetlink uit hun e-mail klikt: Supabase
// herkent de speciale recovery-URL zelf en levert een tijdelijke sessie +
// een PASSWORD_RECOVERY event, wij hoeven alleen het nieuwe-wachtwoord-
// formulier te tonen zolang die vlag aanstaat.
function PasswordRecoveryScreen({ onDone }) {
  useMatchBodyBackground(BOTTLE_DARK);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      onDone();
    } catch (err) {
      setError(err.message || "Er ging iets mis, probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100%", background: `radial-gradient(ellipse 900px 500px at 50% -10%, #2A4B42, ${BOTTLE_DARK} 70%)`, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", marginBottom: 14 }}>
            <Lock color={BRASS} size={26} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: 0, textAlign: "center" }}>Nieuw wachtwoord</h1>
        </div>
        <form onSubmit={submit} style={{ background: "rgba(251,247,236,0.06)", border: "1px solid rgba(184,134,46,0.25)", borderRadius: RADIUS + 4, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>Nieuw wachtwoord</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minstens 6 tekens" autoComplete="new-password" required minLength={6}
              enterKeyHint="done"
              style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)" }} />
          </div>
          {error && <p style={{ color: "#E8A0A0", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{error}</p>}
          <button type="submit" disabled={busy} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px",
            borderRadius: RADIUS, border: "none", cursor: busy ? "default" : "pointer",
            background: `linear-gradient(135deg, ${BRASS}, #D8AF5C)`, color: BOTTLE_DARK,
            fontFamily: sans, fontSize: 14.5, fontWeight: 800, marginTop: 4, opacity: busy ? 0.7 : 1,
          }}>
            {busy ? "Bezig…" : "Wachtwoord opslaan"}
          </button>
        </form>
      </div>
    </div>
  );
}

// De app leunt overal op Supabase (inloggen, check-ins, vrienden) zonder
// enige foutmelding als de verbinding wegvalt — dan gebeurt er gewoon
// niets, wat verwarrender is dan een duidelijke "geen internet"-banner.
// navigator.onLine mist soms een captive portal zonder echte internettoegang,
// maar vangt het meest voorkomende geval (vliegtuigmodus, geen bereik) prima.
function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

// Native toetsenbordgedrag voor alle tekstvelden in de app, op één plek:
// (1) een veld dat straks door het toetsenbord bedekt zou worden scrollt
// zichzelf in beeld, net als UIKit automatisch doet voor de actieve
// responder; (2) écht wegslepen buiten het actieve veld (niet de kleinste
// jitter) sluit het toetsenbord interactief, zoals "swipe to dismiss" in
// native lijsten/formulieren.
function useKeyboardBehavior() {
  useEffect(() => {
    const isTextInput = (el) => !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
      && !["checkbox", "radio", "range", "button", "submit", "file"].includes(el.type);

    const onFocusIn = (e) => {
      const el = e.target;
      if (!isTextInput(el)) return;
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const viewportH = window.visualViewport?.height || window.innerHeight;
        if (rect.bottom > viewportH - 90 || rect.top < 0) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }, 300);
    };

    let touchStartY = null;
    const onTouchStart = (e) => { touchStartY = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e) => {
      const active = document.activeElement;
      if (!isTextInput(active) || touchStartY == null) return;
      if (active === e.target || active.contains?.(e.target)) return;
      const dy = Math.abs((e.touches[0]?.clientY ?? touchStartY) - touchStartY);
      if (dy > 12) { active.blur(); touchStartY = null; }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, []);
}

function OfflineBanner() {
  return (
    <div style={{
      background: BURGUNDY, color: "#FBF6EA", textAlign: "center",
      fontFamily: sans, fontSize: 12.5, fontWeight: 700,
      padding: "calc(env(safe-area-inset-top) + 8px) 16px 8px",
    }}>
      Geen internetverbinding — wijzigingen worden niet opgeslagen totdat je weer online bent.
    </div>
  );
}

export default function ThuisbarApp() {
  useEffect(() => { initNativeShell(); }, []);
  // Body/html blijven donkergroen (zie index.css) tot React daadwerkelijk
  // gemount is — pas dan, hier, zetten we 'm naar de "rustende" beige
  // achtergrond. Dat voorkomt de wit/beige flits die ontstond toen dat via
  // een CSS-default gebeurde (dat stijlblad laadt allang vóór het veel
  // grotere React-bundeltje klaar is met mounten).
  useEffect(() => {
    document.body.style.backgroundColor = "var(--paper)";
    document.documentElement.style.backgroundColor = "var(--paper)";
  }, []);
  useKeyboardBehavior();
  const isOnline = useOnlineStatus();
  // Leeftijdsbevestiging (18+): verplicht voor Apple-review bij een app die
  // over alcohol gaat. Staat vóór alle andere routes (ook de gast-links),
  // want die tonen ook alcohol-gerelateerde inhoud. Eenmalig opgeslagen in
  // Preferences, dus daarna nooit meer gevraagd op dit toestel.
  const [ageVerified, setAgeVerified] = useState(undefined);
  useEffect(() => {
    Preferences.get({ key: "thuisbar-age-verified" }).then(({ value }) => setAgeVerified(value === "true"));
  }, []);
  const confirmAge = () => {
    setAgeVerified(true);
    Preferences.set({ key: "thuisbar-age-verified", value: "true" });
  };
  const [surveyId] = useState(() => new URLSearchParams(window.location.search).get("smaaktest"));
  const [guestMenuIds] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("menu");
    return q ? q.split(",").filter(Boolean) : null;
  });
  const [tab, setTab] = useState("home");
  // Alle tabs blijven straks gemount (zie de render onderin) i.p.v. bij elke
  // wissel gesloopt en opnieuw opgebouwd te worden — anders verlies je bij
  // elke tabwissel je scrollpositie, zoekterm en open filters, wat een app
  // nooit native laat aanvoelen. navigateTo() onthoudt daarbij zelf ook de
  // scrollpositie per tab, en herstelt 'm bij terugkomst.
  const scrollPositions = useRef({});
  // Tikken op Home terwijl je er al staat deed voorheen niets (navigateTo
  // stopte meteen bij "nextTab === tab") — nu, net als bij Instagram/X,
  // springt dat naar boven én ververst het de tijdlijn (via homeTapTick,
  // die HomeTab hieronder oppikt).
  const [homeTapTick, setHomeTapTick] = useState(0);
  const navigateTo = (nextTab) => {
    if (nextTab === tab) {
      if (nextTab === "home") setHomeTapTick(t => t + 1);
      return;
    }
    scrollPositions.current[tab] = window.scrollY;
    setTab(nextTab);
  };
  useLayoutEffect(() => {
    // Alleen scrollen als het écht moet: een scrollTo-aanroep die niets
    // verandert (bv. je was al bovenaan) kan op iOS alsnog de adresbalk
    // laten in-/uitklappen, waardoor de vaste onderbalk even "springt" —
    // puur door de aanroep zelf, niet door de nieuwe positie.
    const target = scrollPositions.current[tab] || 0;
    if (window.scrollY !== target) window.scrollTo(0, target);
  }, [tab]);
  // Alle 11 panelen blijven in de DOM (zie TabPanel) i.p.v. bij wissel
  // vervangen te worden, dus de .tab-fade-intro moet nu handmatig herstart
  // worden op precies het paneel dat zonet actief werd — class eraf, een
  // reflow forceren, class er weer op, is de bekende manier om een
  // CSS-animatie te laten herspelen zonder het element zelf te slopen.
  const panelRefs = useRef({});
  useEffect(() => {
    const el = panelRefs.current[tab];
    if (el) {
      el.classList.remove("tab-fade");
      void el.offsetWidth;
      el.classList.add("tab-fade");
    }
  }, [tab]);
  // Pas een tab écht opbouwen zodra 'm voor het eerst bezocht wordt, en dan
  // nooit meer afbreken — zo blijft het opstartscherm licht (niet alle elf
  // tabs meteen aan het werk) én onthoudt elke tab zijn eigen staat zodra je
  // 'm één keer hebt geopend.
  // "logboek" staat er hier al bij (niet pas na een eerste bezoek) omdat het
  // check-in-formulier daar in leeft als een portal-sheet die overal
  // bovenop moet kunnen verschijnen — vanaf de centrale inchecken-knop of
  // een recept — ook als je dat scherm zelf nog nooit hebt geopend.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(["home", "profiel"]));
  useEffect(() => {
    if (!visitedTabs.has(tab)) setVisitedTabs(prev => new Set(prev).add(tab));
  }, [tab]);
  const [showSplash, setShowSplash] = useState(true);
  const [voorraadArr, setVoorraad] = useStorage("thuisbar-voorraad", []);
  const [customIngredients, setCustomIngredients] = useStorage("thuisbar-custom-ingredients", []);
  const [customRecipes, setCustomRecipes] = useStorage("thuisbar-custom-recipes", []);
  const [shoppingList, setShoppingList] = useStorage("thuisbar-shopping-list", []);
  const [feestChosen, setFeestChosen] = useStorage("thuisbar-feest-chosen", []);
  const [smaakMenu, setSmaakMenu] = useStorage("thuisbar-smaakbalans-menu", []);
  const [voorraadAantal, setVoorraadAantal] = useStorage("thuisbar-voorraad-aantal", {});
  const [courseProgress, setCourseProgress] = useStorage("thuisbar-cursus-voortgang", {});
  const [recentRecipeIds, setRecentRecipeIds] = useStorage("thuisbar-recent-recepten", []);
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useStorage("thuisbar-favoriete-recepten", []);
  const [soundEnabled, setSoundEnabled] = useStorage("thuisbar-geluid", true);

  // session: undefined = nog aan het checken, null = uitgelogd, object = ingelogd.
  // Check-ins staan niet meer lokaal maar in Supabase, want die moeten nu ook
  // door vrienden gelezen kunnen worden (de feed) — dat kan localStorage niet.
  const [session, setSession] = useState(undefined);
  // Gast-modus (Recepten/Cursus zonder account) valt terug op AuthScreen
  // zodra een gast zelf op "Inloggen" tikt; na een geslaagde login weer
  // resetten zodat een latere uitlog-actie opnieuw in gast-modus opent.
  const [wantsLogin, setWantsLogin] = useState(false);
  useEffect(() => { if (session) setWantsLogin(false); }, [session]);
  const [profile, setProfile] = useState(null);
  const [logboek, setLogboekState] = useState([]);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const push = usePushNotifications(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    let cancelled = false;
    supabase.from("profiles").select("id, name, avatar_url").eq("id", session.user.id).single()
      .then(({ data }) => { if (!cancelled) setProfile(data || null); });
    return () => { cancelled = true; };
  }, [session]);

  const reloadLogboek = async () => {
    if (!session) return;
    const { data } = await supabase.from("checkins").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
    if (data) setLogboekState(data.map(checkinRowToEntry));
  };
  useEffect(() => {
    if (!session) { setLogboekState([]); return; }
    let cancelled = false;
    supabase.from("checkins").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (!cancelled && data) setLogboekState(data.map(checkinRowToEntry)); });
    return () => { cancelled = true; };
  }, [session]);

  const addLogEntry = async (entry) => {
    if (!session) return;
    const { data } = await supabase.from("checkins").insert({
      user_id: session.user.id, recipe_id: entry.recipeId, name: entry.name, rating: entry.rating,
      notes: entry.notes, photo: entry.photo, location: entry.location,
      location_lat: entry.locationLat, location_lon: entry.locationLon, taste_tags: entry.tasteTags,
    }).select().single();
    if (data) {
      setLogboekState(cur => [checkinRowToEntry(data), ...cur]);
      supabase.functions.invoke("notify-friends", { body: { userId: session.user.id, cocktailName: entry.name } }).catch(() => {});
    }
  };
  const removeLogEntry = async (id) => {
    setLogboekState(cur => cur.filter(e => e.id !== id));
    await supabase.from("checkins").delete().eq("id", id);
  };
  const updateProfileName = async (name) => {
    if (!session) return;
    const { data } = await supabase.from("profiles").update({ name }).eq("id", session.user.id).select().single();
    if (data) setProfile(data);
  };
  const updateProfilePhoto = async (avatarUrl) => {
    if (!session) return;
    const { data } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", session.user.id).select().single();
    if (data) setProfile(data);
  };

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(null);
  const deleteAccount = async () => {
    if (!session || deletingAccount) return;
    setDeletingAccount(true);
    setDeleteAccountError(null);
    const { error } = await supabase.functions.invoke("delete-account", {});
    setDeletingAccount(false);
    if (error) { setDeleteAccountError("Verwijderen is niet gelukt. Probeer het nog eens."); return; }
    await supabase.auth.signOut();
  };

  // Uitnodigingslink (?invite=<userId>): stuurt automatisch een vriendschapsverzoek
  // naar de deler zodra je ingelogd bent, en stuurt je daarna naar de Vrienden-tab
  // om het resultaat te zien — geen aparte "weet je het zeker"-stap nodig, want het
  // openen van een privé-gedeelde link is zelf al de bewuste actie.
  useEffect(() => {
    if (!session) return;
    const inviteId = new URLSearchParams(window.location.search).get("invite");
    if (!inviteId || inviteId === session.user.id) return;
    (async () => {
      const { data: existing } = await supabase.from("friendships").select("id")
        .or(`and(requester_id.eq.${session.user.id},addressee_id.eq.${inviteId}),and(requester_id.eq.${inviteId},addressee_id.eq.${session.user.id})`)
        .maybeSingle();
      if (!existing) {
        await supabase.from("friendships").insert({ requester_id: session.user.id, addressee_id: inviteId, status: "pending" });
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.toString());
      navigateTo("vrienden");
    })();
  }, [session]);

  const addRecentRecipe = (id) => setRecentRecipeIds([id, ...recentRecipeIds.filter(x => x !== id)].slice(0, 8));
  const toggleFavoriteRecipe = (id) => setFavoriteRecipeIds(
    favoriteRecipeIds.includes(id) ? favoriteRecipeIds.filter(x => x !== id) : [id, ...favoriteRecipeIds]
  );
  const chime = (name) => { if (soundEnabled) playSound(name); hapticFor(name); };

  // Eén plek vandaan naar een recept-detail springen — vanuit Maken, Check-in
  // ("aanbevolen") of straks nog meer plekken — i.p.v. dat elke tab zijn eigen
  // manier verzint om "ga naar dit recept" te doen. pendingRecipeId wordt
  // meteen weer leeggemaakt door VerhaalTab zodra 'm verwerkt is, zodat
  // hetzelfde recept ook een tweede keer achter elkaar geopend kan worden.
  const [pendingRecipeId, setPendingRecipeId] = useState(null);
  const openRecipeDetail = (id) => { navigateTo("ontdekken"); setPendingRecipeId(id); };

  // Zelfde idee, maar dan voor inchecken: het formulier leeft als een sheet
  // ín LogboekTab (die portal't naar document.body, dus verschijnt sowieso al
  // boven elke tab), maar moet ook zonder daarheen te navigeren opengaan —
  // vanaf de centrale +-knop, of straks direct vanaf een recept. Een nieuw
  // object (i.p.v. een simpele boolean) zorgt dat twee achtereenvolgende
  // aanvragen voor dezelfde naam allebei echt de sheet heropenen.
  const [checkinRequest, setCheckinRequest] = useState(null);
  const openCheckin = (name = "") => setCheckinRequest({ ts: Date.now(), name });

  // Eén recept toevoegen aan de Feestplanner-keuze, vanuit Maken of een
  // recept-detail — dus niet via de bulk "gebruik dit menu"-actie van
  // Smaakbalans, maar één-voor-één met eigen feedback.
  const addRecipeToFeest = (id) => {
    if (!feestChosen.includes(id)) setFeestChosen([...feestChosen, id]);
  };

  const voorraad = useMemo(() => new Set(voorraadArr), [voorraadArr]);
  const allIngredients = useMemo(() => [...INGREDIENTS, ...customIngredients], [customIngredients]);
  const allRecipes = useMemo(() => [...RECIPES, ...customRecipes], [customRecipes]);
  // Eerste, eenvoudige opzet voor Home's uitgelichte cocktail — een stabiele
  // dagelijkse keuze i.p.v. de uitgebreide seizoens-/voorraadlogica die
  // VerhaalTab al intern heeft (die blijft daar; hier bewust simpel voor nu).
  const featuredRecipe = useMemo(() => allRecipes.length ? allRecipes[new Date().getDate() % allRecipes.length] : null, [allRecipes]);
  // Zelfde berekening als Check-in gebruikt voor "Jouw smaak" enz. — hier
  // opnieuw gebruikt voor Ontdekken's "Aanbevolen voor jou", zodat die rij op
  // dezelfde, al bestaande logica leunt (favoriete stijl + wat je nu kan
  // maken) i.p.v. een losse, verzonnen aanbeveling.
  const checkinStats = useMemo(() => computeCheckinStats(logboek), [logboek]);
  const checkinInsights = useMemo(
    () => computeCheckinInsights(logboek, allRecipes, allIngredients, isOwned, checkinStats.uniques),
    [logboek, allRecipes, allIngredients, isOwned, checkinStats.uniques]
  );
  const greeting = useMemo(() => getGreeting(), []);
  const timeWarmth = useMemo(() => getTimeWarmth(), []);

  const ownedNames = useMemo(() => {
    const byId = new Map(allIngredients.map(i => [i.id, i]));
    return new Set([...voorraad].map(id => (byId.get(id)?.name || "").toLowerCase()).filter(Boolean));
  }, [voorraad, allIngredients]);

  function isOwned(ref) {
    if (ref.id) return voorraad.has(ref.id);
    return ownedNames.has((ref.name || "").toLowerCase());
  }
  function ingredientLabel(ref) {
    if (ref.id) { const f = allIngredients.find(i => i.id === ref.id); return f ? f.name : ref.id; }
    return ref.name || "?";
  }
  const toggleIngredient = (id) => {
    const wasOwned = voorraad.has(id);
    setVoorraad(wasOwned ? voorraadArr.filter(x => x !== id) : [...voorraadArr, id]);
    if (!wasOwned) setVoorraadAantal({ ...voorraadAantal, [id]: 1 });
  };
  const adjustAantal = (id, delta) => {
    const next = Math.max(0, (voorraadAantal[id] ?? 1) + delta);
    setVoorraadAantal({ ...voorraadAantal, [id]: Math.round(next * 2) / 2 });
  };
  const addCustomIngredient = (name, cat) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = slugify(trimmed);
    setCustomIngredients([...customIngredients, { id, name: trimmed, cat: cat || CUSTOM_CAT }]);
    setVoorraad([...voorraadArr, id]);
    setVoorraadAantal({ ...voorraadAantal, [id]: 1 });
  };
  const removeCustomIngredient = (id) => {
    setCustomIngredients(customIngredients.filter(i => i.id !== id));
    setVoorraad(voorraadArr.filter(x => x !== id));
  };
  const renameCustomIngredient = (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCustomIngredients(customIngredients.map(i => i.id === id ? { ...i, name: trimmed } : i));
  };

  // entries: [{ ref, recipeNames }]; recipeNames = voor welke cocktail(s) dit werd toegevoegd
  const addToShoppingList = (entries) => {
    const map = new Map(shoppingList.map(i => [i.key, i]));
    for (const { ref, recipeNames } of entries) {
      const key = ingredientKey(ref);
      const names = recipeNames || [];
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, recipes: [...new Set([...(existing.recipes || []), ...names])] });
      } else {
        map.set(key, { key, label: ingredientLabel(ref), id: ref.id || (findIngredientMeta(ref, allIngredients)?.id ?? null), recipes: [...new Set(names)] });
      }
    }
    setShoppingList([...map.values()]);
  };
  const removeFromShoppingList = (key) => setShoppingList(shoppingList.filter(i => i.key !== key));
  const clearShoppingList = () => setShoppingList([]);
  const buyShoppingItem = (item) => {
    if (item.id) setVoorraad(voorraadArr.includes(item.id) ? voorraadArr : [...voorraadArr, item.id]);
    removeFromShoppingList(item.key);
  };

  if (ageVerified === undefined) return <div style={{ minHeight: "100%", background: BOTTLE_DARK }} />;
  if (!ageVerified) return <AgeGateScreen onConfirm={confirmAge} />;
  if (guestMenuIds) return <GuestMenuView recipeIds={guestMenuIds} />;
  if (surveyId) return <GuestSurveyView surveyId={surveyId} />;
  if (session === undefined) return <div style={{ minHeight: "100%", background: `radial-gradient(ellipse 900px 500px at 50% -10%, #2A4B42, ${BOTTLE_DARK} 70%)` }} />;
  if (passwordRecovery) return <PasswordRecoveryScreen onDone={() => setPasswordRecovery(false)} />;
  // Recepten en Cursus moeten zonder account bruikbaar zijn (Apple-eis) —
  // pas als een gast zelf op "Inloggen" tikt (of iets aanraakt dat echt een
  // account vereist, zoals inchecken) tonen we alsnog AuthScreen.
  if (session === null && !wantsLogin) {
    return (
      <GuestBrowseShell
        recipes={allRecipes} allIngredients={allIngredients} isOwned={isOwned} ingredientLabel={ingredientLabel} onSound={chime}
        onAddToShoppingList={addToShoppingList} onAddToFeest={addRecipeToFeest} feestChosen={feestChosen}
        recentRecipeIds={recentRecipeIds} onViewRecipe={addRecentRecipe} favoriteRecipeIds={favoriteRecipeIds} onToggleFavorite={toggleFavoriteRecipe}
        courseProgress={courseProgress} setCourseProgress={setCourseProgress}
        onGoLogin={() => setWantsLogin(true)}
      />
    );
  }
  if (session === null) return <AuthScreen />;

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: sans, color: INK }}>
      {!isOnline && <OfflineBanner />}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      {/* signage band */}
      <div style={{ background: `radial-gradient(ellipse 900px 300px at 15% -40%, #2A4B42, ${BOTTLE_DARK} 70%)`, borderBottom: `3px solid ${BRASS}`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(184,134,46,${timeWarmth}), transparent 60%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 22px) 20px 20px", display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", flexShrink: 0 }}>
            <Martini color={BRASS} size={26} strokeWidth={1.5} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS, marginBottom: 2 }}>{profile?.name ? `${greeting}, ${profile.name}` : greeting}</div>
            <h1 style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: 0, letterSpacing: 0.2 }}>Mijn Thuisbar</h1>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px calc(env(safe-area-inset-bottom) + 92px)" }}>
        <TabPanel id="home" active={tab === "home"} visited={visitedTabs.has("home")} panelRef={panelRefs}>
          <HomeTab session={session} profile={profile} greeting={greeting} featuredRecipe={featuredRecipe}
            favoriteFamily={checkinInsights.favoriteFamilyEntry?.[0] || null}
            logboek={logboek} recipes={allRecipes} allIngredients={allIngredients} active={tab === "home"}
            onOpenRecipe={openRecipeDetail} onOpenCheckin={openCheckin} onSound={chime}
            onReloadLogboek={reloadLogboek} homeTapTick={homeTapTick}
            onGoOntdekken={() => navigateTo("ontdekken")} onGoBar={() => navigateTo("bar")} />
        </TabPanel>
        <TabPanel id="ontdekken" active={tab === "ontdekken"} visited={visitedTabs.has("ontdekken")} panelRef={panelRefs}>
          <OntdekkenTab
            openRecipeId={pendingRecipeId} onOpenRecipeHandled={() => setPendingRecipeId(null)}
            recommended={checkinInsights.recommended} favoriteFamily={checkinInsights.favoriteFamilyEntry?.[0] || null}
            allIngredients={allIngredients} onOpenRecipe={openRecipeDetail} onSound={chime}
            makenProps={{
              recipes: allRecipes, isOwned, ingredientLabel, allIngredients,
              onAddToShoppingList: addToShoppingList, onSound: chime,
              onOpenRecipe: openRecipeDetail, onAddToFeest: addRecipeToFeest, feestChosen,
            }}
            verhaalProps={{
              recipes: allRecipes, ingredientLabel, allIngredients, isOwned,
              recentRecipeIds, onViewRecipe: addRecentRecipe, onSound: chime,
              favoriteRecipeIds, onToggleFavorite: toggleFavoriteRecipe,
              onAddToShoppingList: addToShoppingList, onAddToFeest: addRecipeToFeest, feestChosen,
              onOpenCheckin: openCheckin,
            }}
          />
        </TabPanel>
        <TabPanel id="bar" active={tab === "bar"} visited={visitedTabs.has("bar")} panelRef={panelRefs}>
          <BarTab onSelect={navigateTo} shoppingCount={shoppingList.length} />
        </TabPanel>
        <TabPanel id="profiel" active={tab === "profiel"} visited={visitedTabs.has("profiel")} panelRef={panelRefs}>
          <LogboekTab recipes={allRecipes} logboek={logboek} onAddEntry={addLogEntry} onRemoveEntry={removeLogEntry} allIngredients={allIngredients} ingredientLabel={ingredientLabel} onSound={chime} isOwned={isOwned} profile={profile} onOpenRecipe={openRecipeDetail} checkinRequest={checkinRequest}
            onUpdateName={updateProfileName} onUpdatePhoto={updateProfilePhoto}
            onGoVrienden={() => navigateTo("vrienden")} onGoInstellingen={() => navigateTo("instellingen")} />
        </TabPanel>

        <TabPanel id="voorraad" active={tab === "voorraad"} visited={visitedTabs.has("voorraad")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <VoorraadTab allIngredients={allIngredients} customIngredients={customIngredients} voorraad={voorraad}
              voorraadAantal={voorraadAantal} onAdjustAantal={adjustAantal}
              onToggle={toggleIngredient} onAddCustom={addCustomIngredient} onRemoveCustom={removeCustomIngredient}
              onRenameCustom={renameCustomIngredient} onSound={chime} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="mandje" active={tab === "mandje"} visited={visitedTabs.has("mandje")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <WinkelmandjeTab shoppingList={shoppingList} recipes={allRecipes} isOwned={isOwned} allIngredients={allIngredients}
              onRemove={removeFromShoppingList} onBuy={buyShoppingItem} onClear={clearShoppingList} onAdd={addToShoppingList} onSound={chime} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="schaler" active={tab === "schaler"} visited={visitedTabs.has("schaler")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <SchalerTab recipes={allRecipes} ingredientLabel={ingredientLabel} allIngredients={allIngredients} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="balans" active={tab === "balans"} visited={visitedTabs.has("balans")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <SmaakbalansTab recipes={allRecipes} isOwned={isOwned} allIngredients={allIngredients}
              menu={smaakMenu} setMenu={setSmaakMenu} onSound={chime}
              onUseInFeestplanner={(ids) => { setFeestChosen(ids); navigateTo("feest"); }} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="cursus" active={tab === "cursus"} visited={visitedTabs.has("cursus")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <CursusTab progress={courseProgress} setProgress={setCourseProgress} onSound={chime} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="feest" active={tab === "feest"} visited={visitedTabs.has("feest")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <FeestplannerTab session={session} recipes={allRecipes} isOwned={isOwned} ingredientLabel={ingredientLabel} allIngredients={allIngredients}
              onAddToShoppingList={addToShoppingList} chosen={feestChosen} setChosen={setFeestChosen} voorraadAantal={voorraadAantal} onSound={chime} onOpenRecipe={openRecipeDetail} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="eigen" active={tab === "eigen"} visited={visitedTabs.has("eigen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" onBack={() => navigateTo("bar")}>
            <EigenRecepten customRecipes={customRecipes} setCustomRecipes={setCustomRecipes} allIngredients={allIngredients} onSound={chime} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="vrienden" active={tab === "vrienden"} visited={visitedTabs.has("vrienden")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Profiel" onBack={() => navigateTo("profiel")}>
            <VriendenTab session={session} profile={profile} recipes={allRecipes} allIngredients={allIngredients} onSound={chime} active={tab === "vrienden"} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="instellingen" active={tab === "instellingen"} visited={visitedTabs.has("instellingen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Profiel" onBack={() => navigateTo("profiel")}>
            <InstellingenTab soundEnabled={soundEnabled} onToggleSound={setSoundEnabled} onSignOut={() => supabase.auth.signOut()} push={push} onNavigate={navigateTo} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="privacybeleid" active={tab === "privacybeleid"} visited={visitedTabs.has("privacybeleid")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" onBack={() => navigateTo("instellingen")}>
            <PrivacyPolicyScreen />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="account-verwijderen" active={tab === "account-verwijderen"} visited={visitedTabs.has("account-verwijderen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" onBack={() => navigateTo("instellingen")}>
            <AccountDeleteScreen onDelete={deleteAccount} busy={deletingAccount} error={deleteAccountError} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="fotoverantwoording" active={tab === "fotoverantwoording"} visited={visitedTabs.has("fotoverantwoording")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" onBack={() => navigateTo("instellingen")}>
            <PhotoCreditsScreen />
          </SecondaryTabScreen>
        </TabPanel>
      </div>

      <BottomDock tab={tab} setTab={navigateTo} shoppingCount={shoppingList.length} onCheckin={() => openCheckin()} />
    </div>
  );
}

function Switch({ checked, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!checked)} disabled={disabled} role="switch" aria-checked={checked} style={{
      width: 42, height: 24, borderRadius: 12, border: "none", padding: 2, cursor: disabled ? "default" : "pointer", flexShrink: 0,
      background: checked ? BOTTLE : BORDER, display: "flex", justifyContent: checked ? "flex-end" : "flex-start",
      transition: "background 0.2s ease", opacity: disabled ? 0.6 : 1,
    }}>
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: CREAM, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", display: "block", transition: "transform 0.2s ease" }} />
    </button>
  );
}

// UX-herindeling (v2): Profiel IS nu het check-ins/inzichten-scherm zelf
// (zoals Untappd) i.p.v. een lijstje dat er naar doorverwijst — de kaart en
// instellingen hieronder wonen nu in LogboekTab resp. InstellingenTab.
function InstellingenTab({ soundEnabled, onToggleSound, onSignOut, push, onNavigate }) {
  return (
    <div>
      <SectionLabel>Instellingen</SectionLabel>
      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
            <Sparkles size={16} strokeWidth={1.8} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14.5, color: INK }}>Geluidseffecten</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>Zachte klikjes, een "proost" bij check-ins en fanfares bij prestaties</div>
          </div>
          <Switch checked={soundEnabled} onChange={onToggleSound} />
        </div>
        {push.supported && (
          <div style={{ padding: "14px 16px", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
                <Bell size={16} strokeWidth={1.8} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: INK }}>Pushmeldingen</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>Melding als een vriend inchecked — werkt pas na "Toevoegen aan beginscherm"</div>
              </div>
              <Switch checked={push.enabled} onChange={(v) => (v ? push.enable() : push.disable())} disabled={push.busy} />
            </div>
            {push.error && (
              <div style={{ marginTop: 10, fontSize: 12, color: BURGUNDY, background: "rgba(122,46,42,0.08)", border: "1px solid rgba(122,46,42,0.25)", borderRadius: 10, padding: "8px 11px", lineHeight: 1.4 }}>
                {push.error}
              </div>
            )}
          </div>
        )}
        <button onClick={() => onNavigate("privacybeleid")} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
          borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
            <BookOpen size={16} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>Privacybeleid</span>
          <ChevronRight size={16} color={MUTED} />
        </button>
        <button onClick={() => onNavigate("fotoverantwoording")} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
          borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
            <Camera size={16} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>Fotoverantwoording</span>
          <ChevronRight size={16} color={MUTED} />
        </button>
        <button onClick={onSignOut} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
          borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: BURGUNDY,
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BURGUNDY, flexShrink: 0 }}>
            <LogOut size={16} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>Uitloggen</span>
        </button>
        <button onClick={() => onNavigate("account-verwijderen")} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
          borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: BURGUNDY,
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BURGUNDY, flexShrink: 0 }}>
            <Trash2 size={16} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>Account verwijderen</span>
        </button>
      </div>
    </div>
  );
}

// Kan geen internetverbinding of extern beleid nodig hebben: platte tekst,
// altijd beschikbaar, ook offline — precies wat Apple-review verwacht als
// ze "Privacybeleid" aantikken.
function PrivacyPolicyScreen() {
  const P = ({ children }) => <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.65, margin: "0 0 16px" }}>{children}</p>;
  const H = ({ children }) => <h3 style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 16, color: BOTTLE, margin: "22px 0 8px" }}>{children}</h3>;
  return (
    <div>
      <SectionLabel>Privacybeleid</SectionLabel>
      <p style={{ fontSize: 12, color: MUTED, marginBottom: 20 }}>Laatst bijgewerkt: {new Date().toISOString().slice(0, 10)}</p>
      <P>Mijn Thuisbar is een persoonlijke app voor het bijhouden van je thuisbar, cocktailrecepten en check-ins met vrienden. Dit beleid legt uit welke gegevens de app verzamelt en waarvoor.</P>
      <H>Welke gegevens</H>
      <P>E-mailadres en naam (voor je account), een optionele profielfoto, je voorraad en eigen recepten, je check-ins (cocktailnaam, foto, locatie, beoordeling, notities), en — als je die functie gebruikt — vriendschappen, reacties en proosts op check-ins van jou en anderen. Bij een gedeelde smaaktest voor een feest worden ook de antwoorden van je gasten (smaakvoorkeuren, optioneel hun naam) opgeslagen.</P>
      <H>Waarvoor</H>
      <P>Uitsluitend om de app te laten werken: je eigen gegevens tonen, je voortgang bewaren, en — als je vrienden hebt toegevoegd — hun check-ins met je delen en andersom. Niets wordt gebruikt voor advertenties of doorverkocht aan derden.</P>
      <H>Waar</H>
      <P>Je gegevens staan opgeslagen bij Supabase (databasehosting in de EU). Sommige instellingen (zoals je voorraad) staan lokaal op je toestel.</P>
      <H>Delen met derden</H>
      <P>Alleen wat nodig is om de app te laten draaien (databasehosting, en — als je pushmeldingen aanzet — de meldingendienst van je besturingssysteem). Nooit voor marketingdoeleinden.</P>
      <H>Jouw rechten</H>
      <P>Je kan je gegevens op elk moment verwijderen via Instellingen → Account verwijderen. Dat verwijdert je profiel, check-ins, vriendschappen en meldingen-inschrijvingen definitief.</P>
      <H>Contact</H>
      <P>Vragen over dit beleid? Neem contact op via de contactgegevens in de App Store-vermelding van Mijn Thuisbar.</P>
    </div>
  );
}

// Toont automatisch alle bron/maker/licentie-gegevens uit images.json — geen
// handmatig bij te werken lijst, dus loopt vanzelf mee zodra fetch-image.mjs
// nieuwe foto's toevoegt. Alleen entries met een echt bestand én attributie
// worden getoond (illustraties/eigen werk hebben geen externe bron nodig).
function PhotoCreditsScreen() {
  const nameFor = (type, id) => {
    if (type === "cocktail") return RECIPES.find((r) => r.id === id)?.name || id;
    return INGREDIENTS.find((i) => i.id === id)?.name || id;
  };
  const credited = imageCatalog
    .filter((e) => e.bestand && (e.maker || e.licentie))
    .map((e) => ({ ...e, name: nameFor(e.type, e.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <SectionLabel>Fotoverantwoording</SectionLabel>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>
        Foto's van cocktails en dranken in deze app komen van fotografen die hun werk vrij beschikbaar stellen. Hieronder de bron en licentie per foto.
      </p>
      {credited.length === 0 ? (
        <p style={{ fontSize: 13.5, color: MUTED, textAlign: "center", padding: "30px 0" }}>Nog geen foto's met externe bronvermelding.</p>
      ) : (
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden" }}>
          {credited.map((e, i) => (
            <div key={`${e.type}:${e.id}`} style={{ padding: "12px 16px", borderBottom: i < credited.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 14.5, color: INK }}>{e.name}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                {e.maker && <>Foto: {e.maker} · </>}{e.licentie}
              </div>
              {e.bronUrl && <div style={{ fontSize: 11, color: MUTED, marginTop: 2, wordBreak: "break-all" }}>{e.bronUrl}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Verwijderen is onomkeerbaar, dus een expliciete typ-ter-bevestiging i.p.v.
// alleen een "weet je het zeker?"-knopje — voorkomt een per ongeluk-tik op
// een verder vrij kale instellingenpagina.
function AccountDeleteScreen({ onDelete, busy, error }) {
  const [confirmText, setConfirmText] = useState("");
  const canDelete = confirmText.trim().toUpperCase() === "VERWIJDEREN";
  return (
    <div>
      <SectionLabel>Account verwijderen</SectionLabel>
      <div style={{ background: "rgba(122,46,42,0.08)", border: `1px solid rgba(122,46,42,0.3)`, borderRadius: RADIUS, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          Dit verwijdert je account en alle bijbehorende gegevens (profiel, check-ins, vriendschappen, meldingen-inschrijvingen) <b>definitief</b>. Dit kan niet ongedaan gemaakt worden.
        </p>
      </div>
      <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}>Typ VERWIJDEREN om te bevestigen</label>
      <input value={confirmText} onChange={e => setConfirmText(e.target.value)} style={{ ...fieldStyle(), marginBottom: 16 }} placeholder="VERWIJDEREN" />
      {error && <p style={{ color: BURGUNDY, fontSize: 13, marginBottom: 14 }}>{error}</p>}
      <button onClick={onDelete} disabled={!canDelete || busy} className="press-scale" style={{
        width: "100%", padding: "14px 18px", borderRadius: 14, border: "none",
        background: canDelete ? BURGUNDY : BORDER, color: CREAM, fontSize: 15, fontWeight: 700,
        cursor: canDelete ? "pointer" : "default",
      }}>
        {busy ? "Bezig met verwijderen…" : "Account definitief verwijderen"}
      </button>
    </div>
  );
}

// UX-herindeling (v2): bundelt de thuisbar-gereedschappen (voorheen los
// achter "Meer") in hun eigen tab, gescheiden van de sociale/ontdek-laag —
// zodat die laatste niet verdrinkt tussen bijvoorbeeld de Cursus en de
// Feestplanner. Zelfde lijst-stijl als Profiel, alleen andere items.
function BarTab({ onSelect, shoppingCount }) {
  const items = [
    { id: "voorraad", label: "Voorraad", icon: Refrigerator },
    { id: "mandje", label: "Winkelmandje", icon: ShoppingCart },
    { id: "schaler", label: "Schaler", icon: Scale },
    { id: "balans", label: "Smaakbalans", icon: Sparkles },
    { id: "cursus", label: "Cursus", icon: GraduationCap },
    { id: "feest", label: "Feestplanner", icon: PartyPopper },
    { id: "eigen", label: "Eigen recepten", icon: FlaskConical },
  ];
  return (
    <div>
      <SectionLabel>Bar</SectionLabel>
      <p style={{ color: MUTED, fontSize: 14, marginBottom: 20, maxWidth: 560, lineHeight: 1.5 }}>
        Jouw gereedschap voor thuis: voorraad, boodschappen, schalen, leren en plannen.
      </p>
      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden" }}>
        {items.map((t, i) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => onSelect(t.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
              background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
              borderBottom: i < items.length - 1 ? `1px solid ${BORDER}` : "none",
              fontFamily: sans, fontSize: 14.5, color: INK,
            }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{t.label}</span>
              {t.id === "mandje" && shoppingCount > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 20, borderRadius: 10, background: BRASS, color: CREAM, fontSize: 11, fontWeight: 700, padding: "0 5px" }}>
                  {shoppingCount}
                </span>
              )}
              <ChevronRight size={16} color={MUTED} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// UX-herindeling (v2): eerste opzet van Home. Toont nu een uitgelichte
// cocktail en een directe ingang naar inchecken; de gecombineerde
// eigen+vrienden-activiteitenfeed (het "sociale hart" uit het UX-voorstel)
// is bewust nog niet hier ingebouwd — dat vraagt om gedeelde datalogica met
// Vrienden/Check-in die in een volgende stap netjes moet worden opgezet,
// niet blind samengeraapt in deze eerste doorvoering.
// Zelfde vrienden-ophaal-patroon als VriendenTab (friendships → friendIds →
// checkins + reacties), hier als eigen, zelfstandige hook zodat Home zijn
// eigen tijdlijn kan opbouwen zonder VriendenTab's interne state aan te
// raken — geen risico op regressie daar, wel dezelfde, al bewezen data-laag.
function useFriendsFeed(session, active) {
  const myId = session?.user?.id;
  const [friendProfiles, setFriendProfiles] = useState({});
  const [feed, setFeed] = useState([]);
  // Bumpt de effect-dependency zodat reload() dezelfde fetch opnieuw
  // triggert zonder active zelf aan/uit te hoeven zetten — nodig voor
  // "verversen terwijl je al op Home staat" (active wisselt dan niet vanzelf).
  const [reloadTick, setReloadTick] = useState(0);
  const reload = () => setReloadTick(t => t + 1);

  useEffect(() => {
    if (!active || !myId) return;
    let cancelled = false;
    supabase.from("friendships").select("*").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`).eq("status", "accepted")
      .then(async ({ data }) => {
        if (cancelled) return;
        const rows = data || [];
        const friendIds = [...new Set(rows.map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id)))];
        if (friendIds.length === 0) { setFeed([]); setFriendProfiles({}); return; }
        const { data: profs } = await supabase.from("profiles").select("id, name, avatar_url").in("id", friendIds);
        if (cancelled) return;
        const map = {};
        (profs || []).forEach(p => { map[p.id] = p; });
        setFriendProfiles(map);
        const { data: checkins } = await supabase.from("checkins").select("*").in("user_id", friendIds).order("created_at", { ascending: false }).limit(30);
        if (cancelled || !checkins) return;
        setFeed(checkins.map(row => ({ ...checkinRowToEntry(row), friendId: row.user_id })));
      });
    return () => { cancelled = true; };
  }, [myId, active, reloadTick]);

  return { feed, friendProfiles, reload };
}

// Zelfde reacties/reacties-tellers als VriendenTab (checkin_reactions /
// checkin_comments), maar hier voor de GECOMBINEERDE tijdlijn (jouw
// check-ins + die van vrienden) i.p.v. alleen vriendencheck-ins — een
// vriend kan tenslotte ook jóuw check-in proosten. Zelfstandige hook, geen
// gedeelde state met VriendenTab, om regressie daar te vermijden.
function useFeedReactions(session, ids, active) {
  const myId = session?.user?.id;
  const [reactions, setReactions] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!active || !myId || ids.length === 0) { setReactions({}); setCommentCounts({}); return; }
    let cancelled = false;
    supabase.from("checkin_reactions").select("checkin_id, user_id").in("checkin_id", ids).then(({ data }) => {
      if (cancelled) return;
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.checkin_id]) map[r.checkin_id] = { count: 0, mine: false };
        map[r.checkin_id].count += 1;
        if (r.user_id === myId) map[r.checkin_id].mine = true;
      });
      setReactions(map);
    });
    supabase.from("checkin_comments").select("checkin_id").in("checkin_id", ids).then(({ data }) => {
      if (cancelled) return;
      const counts = {};
      (data || []).forEach(c => { counts[c.checkin_id] = (counts[c.checkin_id] || 0) + 1; });
      setCommentCounts(counts);
    });
    return () => { cancelled = true; };
  }, [myId, idsKey, active]);

  return { reactions, setReactions, commentCounts, setCommentCounts };
}

// Eén onderbouwde reden i.p.v. willekeurig "Uitgelicht": eerst een echte
// smaakmatch uit je eigen check-ins, anders een concreet weetje over déze
// cocktail (FUN_FACTS, anders de openingszin van STORIES — samen dekken
// die alle 321 recepten). Altijd afgeleid van bestaande, specifieke data
// over de cocktail zelf, nooit een generieke vulzin over de dag van de week.
function featuredReason(recipe, favoriteFamily) {
  if (favoriteFamily && recipe.family === favoriteFamily) {
    return `Past bij jouw smaak: ${recipe.family} is de stijl die je het vaakst hoog beoordeelt.`;
  }
  if (FUN_FACTS[recipe.id]) return FUN_FACTS[recipe.id];
  const story = STORIES[recipe.id];
  if (story) return story.split(/(?<=[.!?])\s+/)[0];
  return `Een klassieker uit de ${recipe.family.toLowerCase()}-familie, geserveerd in een ${recipe.glass.toLowerCase()}.`;
}

// Trek-naar-verversen, alleen actief helemaal bovenaan de pagina (anders
// zou een gewone scroll-omhoog per ongeluk verversen triggeren). Zelfde
// deadzone/RAF-opzet als de andere sleepgestiek-hooks hierboven, imperatief
// op de DOM geschilderd i.p.v. via React state, voor 60fps tijdens het slepen.
function usePullToRefresh(onRefresh) {
  const [refreshing, setRefreshing] = useState(false);
  const indicatorRef = useRef(null);
  const drag = useRef({ tracking: false, startY: 0, delta: 0, raf: 0 });
  const MAX_PULL = 74;
  const THRESHOLD = 60;

  const paint = (px, spinning) => {
    if (!indicatorRef.current) return;
    indicatorRef.current.style.height = `${px}px`;
    indicatorRef.current.style.opacity = px > 4 ? Math.min(1, px / 40) : 0;
    const icon = indicatorRef.current.querySelector(".ptr-icon");
    if (icon) icon.style.transform = spinning ? "" : `rotate(${Math.min(220, (px / MAX_PULL) * 220)}deg)`;
  };

  const onTouchStart = (e) => {
    if (refreshing || window.scrollY > 0) { drag.current.tracking = false; return; }
    drag.current.tracking = true;
    drag.current.startY = e.touches[0].clientY;
    drag.current.delta = 0;
  };
  const onTouchMove = (e) => {
    if (!drag.current.tracking) return;
    if (window.scrollY > 0) { drag.current.tracking = false; paint(0); return; }
    const raw = e.touches[0].clientY - drag.current.startY;
    if (raw < 8) { paint(0); return; }
    drag.current.delta = Math.min(MAX_PULL, (raw - 8) * 0.55);
    if (drag.current.raf) return;
    drag.current.raf = requestAnimationFrame(() => { drag.current.raf = 0; paint(drag.current.delta, false); });
  };
  const onTouchEnd = async () => {
    if (!drag.current.tracking) return;
    drag.current.tracking = false;
    if (drag.current.delta >= THRESHOLD) {
      setRefreshing(true);
      paint(46, true);
      await onRefresh();
      setRefreshing(false);
    }
    paint(0, false);
  };

  return { indicatorRef, refreshing, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

function HomeTab({ session, profile, greeting, featuredRecipe, favoriteFamily, logboek, recipes, allIngredients, onOpenRecipe, onOpenCheckin, onSound, onReloadLogboek, homeTapTick, onGoOntdekken, onGoBar, active }) {
  const myId = session?.user?.id;
  const { feed: friendFeed, friendProfiles, reload: reloadFriendFeed } = useFriendsFeed(session, active);
  const combinedFeed = useMemo(() => {
    const mine = logboek.map(e => ({ ...e, mine: true }));
    const theirs = friendFeed.map(e => ({ ...e, mine: false }));
    return [...mine, ...theirs].sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()).slice(0, 20);
  }, [logboek, friendFeed]);
  const feedIds = useMemo(() => combinedFeed.map(e => e.id), [combinedFeed]);
  const handleRefresh = async () => {
    onSound("pop");
    await Promise.all([onReloadLogboek(), Promise.resolve(reloadFriendFeed())]);
  };
  const { indicatorRef, refreshing, handlers: pullHandlers } = usePullToRefresh(handleRefresh);
  useEffect(() => {
    if (homeTapTick === 0) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    handleRefresh();
  }, [homeTapTick]);
  const { reactions, setReactions, commentCounts, setCommentCounts } = useFeedReactions(session, feedIds, active);
  const [commentsByCheckin, setCommentsByCheckin] = useState({});
  const [openComments, setOpenComments] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [openFriendId, setOpenFriendId] = useState(null);
  const [reportedIds, setReportedIds] = useState(() => new Set());
  const reportCheckin = async (checkinId) => {
    if (!myId || reportedIds.has(checkinId)) return;
    setReportedIds(s => new Set(s).add(checkinId));
    onSound("pop");
    await supabase.from("content_reports").insert({ reporter_id: myId, target_type: "checkin", target_id: checkinId });
  };
  const findMatch = (entry) => entry.recipeId ? recipes.find(r => r.id === entry.recipeId) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());

  const commenterName = (uid) => (uid === myId ? (profile?.name || "Jij") : (friendProfiles[uid]?.name || "Vriend"));
  const commenterPhoto = (uid) => (uid === myId ? profile?.avatar_url : friendProfiles[uid]?.avatar_url);

  const toggleComments = async (checkinId) => {
    if (openComments === checkinId) { setOpenComments(null); return; }
    setOpenComments(checkinId);
    setCommentDraft("");
    if (!commentsByCheckin[checkinId]) {
      const { data } = await supabase.from("checkin_comments").select("*").eq("checkin_id", checkinId).order("created_at", { ascending: true });
      setCommentsByCheckin(c => ({ ...c, [checkinId]: data || [] }));
    }
  };
  const postComment = async (checkinId) => {
    const text = commentDraft.trim();
    if (!text || postingComment || !myId) return;
    setPostingComment(true);
    const { data, error } = await supabase.from("checkin_comments").insert({ checkin_id: checkinId, user_id: myId, text }).select().single();
    setPostingComment(false);
    if (error) return;
    onSound("pop");
    setCommentsByCheckin(c => ({ ...c, [checkinId]: [...(c[checkinId] || []), data] }));
    setCommentCounts(c => ({ ...c, [checkinId]: (c[checkinId] || 0) + 1 }));
    setCommentDraft("");
  };
  const deleteComment = async (checkinId, commentId) => {
    setCommentsByCheckin(c => ({ ...c, [checkinId]: (c[checkinId] || []).filter(x => x.id !== commentId) }));
    setCommentCounts(c => ({ ...c, [checkinId]: Math.max(0, (c[checkinId] || 1) - 1) }));
    await supabase.from("checkin_comments").delete().eq("id", commentId).eq("user_id", myId);
  };
  const toggleCheer = async (checkinId) => {
    if (!myId) return;
    const current = reactions[checkinId] || { count: 0, mine: false };
    onSound(current.mine ? "remove" : "pop");
    setReactions(r => ({ ...r, [checkinId]: { count: current.count + (current.mine ? -1 : 1), mine: !current.mine } }));
    if (current.mine) {
      await supabase.from("checkin_reactions").delete().eq("checkin_id", checkinId).eq("user_id", myId);
    } else {
      await supabase.from("checkin_reactions").insert({ checkin_id: checkinId, user_id: myId });
    }
  };

  return (
    <div {...pullHandlers} style={{ touchAction: "pan-y" }}>
      <div ref={indicatorRef} aria-hidden style={{
        height: 0, opacity: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 4, color: BRASS,
      }}>
        <span className={`ptr-icon${refreshing ? " spin-icon" : ""}`} style={{ display: "flex", transition: "transform 0.1s linear" }}>
          <Martini size={18} strokeWidth={1.8} />
        </span>
      </div>
      <SectionLabel>Vandaag</SectionLabel>
      {featuredRecipe && (
        <div style={{
          borderRadius: RADIUS + 4, marginBottom: 16, position: "relative", overflow: "hidden", boxSizing: "border-box",
          background: `linear-gradient(135deg, #2C5148, ${BOTTLE_DARK})`, boxShadow: SHADOW_HERO, color: CREAM, fontFamily: sans,
        }}>
          {localItemImageUrl("cocktail", featuredRecipe.id) || featuredRecipe.image ? (
            <>
              <img src={localItemImageUrl("cocktail", featuredRecipe.id) || featuredRecipe.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(19,38,34,0.35) 0%, rgba(15,26,23,0.88) 100%)" }} />
            </>
          ) : null}
          <button onClick={() => onOpenRecipe(featuredRecipe.id)} style={{
            position: "relative",
            width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "none", color: "inherit",
            padding: "20px 22px 14px", boxSizing: "border-box", fontFamily: "inherit",
          }}>
            <div style={{ display: "inline-block", background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 100, padding: "4px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Uitgelicht
            </div>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 26 }}>{featuredRecipe.name}</div>
            <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4 }}>{featuredRecipe.family} · {featuredRecipe.glass}</div>
          </button>
          <div style={{ position: "relative", margin: "2px 22px 20px", borderLeft: `2px solid ${BRASS}`, paddingLeft: 12, fontSize: 12.5, lineHeight: 1.5, opacity: 0.92 }}>
            {featuredReason(featuredRecipe, favoriteFamily)}
          </div>
        </div>
      )}

      <button onClick={() => onOpenCheckin()} className="press-scale" style={{
        display: "flex", alignItems: "center", gap: 11, width: "100%", boxSizing: "border-box", padding: "13px 16px",
        borderRadius: 100, background: CREAM, border: `1.5px solid ${BORDER}`, boxShadow: "0 3px 10px -4px rgba(43,38,32,0.12)",
        cursor: "pointer", marginBottom: 24, fontFamily: sans,
      }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(184,134,46,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Plus size={15} color={BRASS} strokeWidth={2.4} />
        </span>
        <span style={{ textAlign: "left" }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: INK }}>Wat drink je nu?</span>
          <span style={{ display: "block", fontSize: 12, color: MUTED }}>Check meteen in</span>
        </span>
      </button>

      <SectionLabel>Kortweg</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <button onClick={onGoOntdekken} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: "16px 14px", textAlign: "left", cursor: "pointer", fontFamily: sans }}>
          <Search size={18} color={BOTTLE} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>Ontdekken</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>Blader of zoek een cocktail</div>
        </button>
        <button onClick={onGoBar} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: "16px 14px", textAlign: "left", cursor: "pointer", fontFamily: sans }}>
          <Martini size={18} color={BOTTLE} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>Bar</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>Voorraad, schaler en meer</div>
        </button>
      </div>

      <SectionLabel>Activiteit</SectionLabel>
      {combinedFeed.length === 0 ? (
        <div style={{ padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS }}>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            Nog geen activiteit — check zelf iets in, of voeg vrienden toe via Profiel om te zien wat zij drinken.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {combinedFeed.map(entry => {
            const matched = findMatch(entry);
            const tint = matched ? recipeTint(matched, allIngredients) : [PAPER_DEEP, BORDER];
            const who = entry.mine ? (profile?.name || "Jij") : (friendProfiles[entry.friendId]?.name || "Vriend");
            const whoAvatar = entry.mine ? profile?.avatar_url : friendProfiles[entry.friendId]?.avatar_url;
            const photo = entry.photo || (matched && (localItemImageUrl("cocktail", matched.id) || matched.image)) || null;
            const key = `${entry.mine ? "m" : "f"}-${entry.id}`;
            const cheer = reactions[entry.id] || { count: 0, mine: false };
            return (
              <div key={key} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", boxShadow: SHADOW_CARD }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px 10px" }}>
                  <Avatar name={who} photo={whoAvatar} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {entry.mine ? (
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>{who}</span>
                    ) : (
                      <button onClick={() => setOpenFriendId(entry.friendId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: INK }}>
                        {who}
                      </button>
                    )}
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 1, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <MapPin size={11} style={{ flexShrink: 0 }} /> {entry.location} · {entry.date}
                    </div>
                  </div>
                </div>

                <div style={{ height: photo ? 190 : 150, position: "relative", margin: "0 0 12px" }}>
                  {photo ? (
                    <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(150deg, ${tint[1]}, ${tint[0]})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {matched ? (
                        <GlassArt glass={matched.glass} colors={tint} garnishes={inferGarnishes(matched, allIngredients)} rim={inferRim(matched, allIngredients)} foam={inferFoam(matched, allIngredients)} iceStyle={inferIceStyle(matched)} size={100} />
                      ) : (
                        <Martini size={40} color="rgba(251,246,234,0.85)" strokeWidth={1.3} />
                      )}
                    </div>
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(19,38,34,0) 45%, rgba(15,26,23,0.5) 100%)" }} />
                  <div style={{ position: "absolute", left: 12, bottom: 10, display: "flex", alignItems: "center", gap: 4, background: "rgba(15,26,23,0.55)", backdropFilter: "blur(6px)", borderRadius: 100, padding: "4px 9px", color: CREAM, fontSize: 12, fontWeight: 700 }}>
                    <Star size={11} fill={BRASS} color={BRASS} /> {formatRating(entry.rating)}
                  </div>
                </div>

                <div style={{ padding: "0 14px 14px" }}>
                  <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 17, color: INK, marginBottom: 2 }}>{entry.name}</div>
                  {matched && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 9 }}>{matched.family} · {matched.glass}</div>}
                  {entry.notes && <p style={{ margin: "0 0 9px", fontSize: 12.5, color: INK, lineHeight: 1.5 }}>&ldquo;{entry.notes}&rdquo;</p>}
                  {entry.tasteTags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 11 }}>
                      {entry.tasteTags.map(k => TASTE_META[k] && (
                        <span key={k} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 100, background: PAPER_DEEP, color: INK, border: `1px solid ${BORDER}` }}>
                          {TASTE_META[k].emoji} {TASTE_META[k].label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
                    <button onClick={() => toggleCheer(entry.id)} className="press-scale" style={{
                      display: "flex", alignItems: "center", gap: 6, border: `1px solid ${cheer.mine ? BRASS : BORDER}`, cursor: "pointer",
                      background: cheer.mine ? "rgba(184,134,46,0.1)" : "none", color: cheer.mine ? BRASS : MUTED,
                      borderRadius: 100, padding: "7px 12px", fontSize: 12, fontWeight: 700,
                    }}>
                      🥂 {cheer.count > 0 ? cheer.count : ""} Proost
                    </button>
                    <button onClick={() => toggleComments(entry.id)} className="press-scale" style={{
                      display: "flex", alignItems: "center", gap: 6, border: `1px solid ${openComments === entry.id ? BOTTLE : BORDER}`, cursor: "pointer",
                      background: openComments === entry.id ? BOTTLE : "none", color: openComments === entry.id ? CREAM : MUTED,
                      borderRadius: 100, padding: "7px 12px", fontSize: 12, fontWeight: 700,
                    }}>
                      <MessageCircle size={13} /> {commentCounts[entry.id] > 0 ? commentCounts[entry.id] : ""} Reageren
                    </button>
                    {!entry.mine && (
                      <button onClick={() => reportCheckin(entry.id)} disabled={reportedIds.has(entry.id)} title="Meld deze check-in" className="press-scale" style={{
                        marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                        border: "none", cursor: reportedIds.has(entry.id) ? "default" : "pointer", background: "none",
                        color: reportedIds.has(entry.id) ? SAGE : MUTED, flexShrink: 0,
                      }}>
                        {reportedIds.has(entry.id) ? <Check size={14} /> : <Flag size={14} />}
                      </button>
                    )}
                  </div>

                  {openComments === entry.id && (
                    <div style={{ borderTop: `1px dashed ${BORDER}`, marginTop: 10, paddingTop: 10 }}>
                      {(commentsByCheckin[entry.id] || []).map(c => (
                        <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                          <Avatar name={commenterName(c.user_id)} photo={commenterPhoto(c.user_id)} size={24} />
                          <div style={{ flex: 1, minWidth: 0, background: PAPER_DEEP, borderRadius: 12, padding: "6px 10px" }}>
                            <span style={{ fontWeight: 700, fontSize: 12 }}>{commenterName(c.user_id)}</span>{" "}
                            <span style={{ fontSize: 12.5, color: INK }}>{c.text}</span>
                          </div>
                          {c.user_id === myId && (
                            <button onClick={() => deleteComment(entry.id, c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, flexShrink: 0 }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      {(commentsByCheckin[entry.id] || []).length === 0 && (
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Nog geen reacties. Wees de eerste!</div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={commentDraft}
                          onChange={e => setCommentDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") postComment(entry.id); }}
                          placeholder="Schrijf een reactie…"
                          style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "8px 14px", fontSize: 12.5, fontFamily: sans, background: PAPER, color: INK }}
                        />
                        <button onClick={() => postComment(entry.id)} disabled={!commentDraft.trim() || postingComment} style={{
                          border: "none", cursor: commentDraft.trim() ? "pointer" : "default", background: commentDraft.trim() ? BOTTLE : BORDER,
                          color: CREAM, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <Send size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openFriendId && (
        <FriendProfileSheet
          friendId={openFriendId}
          friendProfile={friendProfiles[openFriendId]}
          recipes={recipes}
          allIngredients={allIngredients}
          session={session}
          onBlocked={() => setOpenFriendId(null)}
          onClose={() => setOpenFriendId(null)}
        />
      )}
    </div>
  );
}

// Houdt elke tab permanent gemount (alleen display:none als 'ie niet actief
// is) i.p.v. 'm bij elke wissel weg te gooien — dat is wat scrollpositie,
// zoekterm en open filters per tab laat behouden, precies zoals een echte
// iOS-tabbalk dat doet.
function TabPanel({ id, active, visited, panelRef, children }) {
  return (
    <div ref={el => { panelRef.current[id] = el; }} data-tabpanel={id} style={{ display: active ? "" : "none" }}>
      {visited ? children : null}
    </div>
  );
}

// De onderbalk toont nu 2 tabs, dan de verhoogde inchecken-knop in het
// midden, dan nog 2 tabs — hetzelfde patroon als Instagram's camera of
// Strava's opname-knop: de kernactie van de app krijgt een eigen, herkenbare
// plek i.p.v. "zomaar een vijfde tabblad" tussen de rest.
function BottomDock({ tab, setTab, shoppingCount, onCheckin }) {
  const left = TAGS_DOCK.slice(0, 2);
  const right = TAGS_DOCK.slice(2);
  const renderBtn = (t) => {
    const active = tab === t.id;
    const Icon = t.icon;
    const badge = t.id === "bar" && shoppingCount > 0 ? shoppingCount : null;
    return (
      <button key={t.id} onClick={() => setTab(t.id)} style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        background: "none", border: "none", cursor: "pointer", padding: "4px 2px",
        fontFamily: sans, color: active ? BOTTLE : MUTED,
      }}>
        <span style={{ position: "relative", display: "flex" }}>
          <Icon size={21} strokeWidth={active ? 2.1 : 1.7} />
          {badge && (
            <span style={{
              position: "absolute", top: -5, right: -8, minWidth: 15, height: 15, borderRadius: 8,
              background: BRASS, color: CREAM, fontSize: 9.5, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
            }}>{badge}</span>
          )}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{DOCK_LABELS[t.id] || t.label}</span>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: BRASS, opacity: active ? 1 : 0, marginTop: -2 }} />
      </button>
    );
  };
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10,
      background: "var(--dock-bg)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      borderTop: `1px solid rgba(184,134,46,0.3)`,
      boxShadow: "0 -6px 18px rgba(43,38,32,0.10)",
      transform: "translateZ(0)",
    }}>
      <div style={{
        maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "flex-end",
        padding: "9px 6px calc(env(safe-area-inset-bottom) + 9px)",
      }}>
        {left.map(renderBtn)}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", marginTop: -26 }}>
          <button onClick={onCheckin} aria-label="Inchecken" className="press-scale" style={{
            width: 54, height: 54, borderRadius: "50%", background: BRASS, border: `4px solid ${PAPER}`,
            boxShadow: "0 6px 16px -4px rgba(184,134,46,0.6)", display: "flex", alignItems: "center",
            justifyContent: "center", color: CREAM, cursor: "pointer",
          }}>
            <Plus size={24} strokeWidth={2.4} />
          </button>
        </div>
        {right.map(renderBtn)}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: BRASS, marginBottom: 10 }}>
      {children}
    </div>
  );
}

// Zes categorieën, zes kleine "etiketten" — getint met kleuren die al in het
// register bestaan (brass, bottle, burgundy, sage) in plaats van een nieuw
// willekeurig regenboogpalet, zodat de kaarten bij de rest van de app horen.
const CATEGORY_ART = {
  "Sterke drank": { from: "#E6C689", to: "#8F6A21", shape: "bottle" },
  "Likeuren & versterkte wijnen": { from: "#3F6E63", to: "#132622", shape: "bottle" },
  "Bitters": { from: "#B2645F", to: "#5C211E", shape: "dasher" },
  "Mixers": { from: "#D9D2C0", to: "#A79C87", shape: "glass" },
  "Zuivel & room": { from: "#FBF6EA", to: "#DCCFA8", shape: "jug" },
  "Vers": { from: "#9DBB87", to: "#3F5A34", shape: "citrus" },
};

// Sfeerfoto's voor de voorraad-categorieën. Elke foto krijgt dezelfde
// sepia/contrast-behandeling als receptfoto's plus een category-getinte
// multiply-wash (in de kleuren van CATEGORY_ART), zodat zes losse
// stockfoto's toch als één samenhangende set ogen in plaats van een
// willekeurige verzameling plaatjes.
const CATEGORY_PHOTOS = {
  "Sterke drank": catSterkeDrankImg,
  "Likeuren & versterkte wijnen": catLikeurenImg,
  "Bitters": catBittersImg,
  "Mixers": catMixersImg,
  "Zuivel & room": catZuivelRoomImg,
  "Vers": catVersImg,
};

function CategoryArt({ cat }) {
  const art = CATEGORY_ART[cat] || CATEGORY_ART["Vers"];
  const photo = CATEGORY_PHOTOS[cat];
  const gid = "cg_" + cat.replace(/[^a-z0-9]+/gi, "_");
  if (photo) {
    return (
      <>
        <img src={photo} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(150deg, ${art.from}5c, ${art.to}85 75%)`, mixBlendMode: "multiply" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(15,12,9,0.42) 0%, rgba(15,12,9,0) 48%)" }} />
      </>
    );
  }
  return (
    <svg viewBox="0 0 160 96" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={art.from} />
          <stop offset="1" stopColor={art.to} />
        </linearGradient>
      </defs>
      <rect width="160" height="96" fill={`url(#${gid})`} />
      {art.shape === "bottle" && (
        <g opacity="0.92">
          <rect x="72" y="14" width="12" height="12" rx="2" fill="rgba(0,0,0,0.3)" />
          <path d="M70 26h20c7 4 10 10 10 18v30a5 5 0 0 1-5 5H65a5 5 0 0 1-5-5V44c0-8 3-14 10-18z" fill="rgba(43,38,32,0.28)" />
          <rect x="60" y="58" width="30" height="16" rx="2.5" fill="rgba(251,247,236,0.85)" />
          <rect x="66" y="30" width="4" height="34" rx="2" fill="#fff" opacity="0.22" transform="rotate(-6 68 47)" />
        </g>
      )}
      {art.shape === "dasher" && (
        <g opacity="0.92">
          <rect x="76" y="18" width="8" height="10" rx="2" fill="rgba(0,0,0,0.35)" />
          <path d="M74 28h12c4 8 5 14 5 20v22a4 4 0 0 1-4 4H73a4 4 0 0 1-4-4V48c0-6 1-12 5-20z" fill="rgba(43,38,32,0.32)" />
          <rect x="66" y="56" width="28" height="14" rx="2.5" fill="rgba(251,247,236,0.85)" />
        </g>
      )}
      {art.shape === "glass" && (
        <g opacity="0.92">
          <path d="M64 30h32l-4 40a4 4 0 0 1-4 4H72a4 4 0 0 1-4-4z" fill="rgba(43,38,32,0.22)" />
          <circle cx="76" cy="42" r="2.6" fill="rgba(255,255,255,0.7)" />
          <circle cx="84" cy="52" r="2" fill="rgba(255,255,255,0.6)" />
          <circle cx="78" cy="60" r="1.6" fill="rgba(255,255,255,0.6)" />
          <rect x="66" y="26" width="28" height="5" rx="2.5" fill="rgba(255,255,255,0.55)" />
        </g>
      )}
      {art.shape === "jug" && (
        <g opacity="0.92">
          <path d="M62 34h24a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H62a6 6 0 0 1-6-6V40a6 6 0 0 1 6-6z" fill="rgba(43,38,32,0.16)" />
          <path d="M92 40h6c3 0 5 2 5 5v6c0 3-2 5-5 5h-6" fill="none" stroke="rgba(43,38,32,0.16)" strokeWidth="4" />
        </g>
      )}
      {art.shape === "citrus" && (
        <g opacity="0.94">
          <circle cx="70" cy="50" r="18" fill="rgba(43,38,32,0.18)" />
          <circle cx="70" cy="50" r="18" fill="none" stroke="rgba(251,247,236,0.7)" strokeWidth="3" />
          <path d="M70 36v28M60 40l20 20M60 60l20-20" stroke="rgba(251,247,236,0.55)" strokeWidth="1.4" />
          <path d="M96 34c6 2 9 8 8 16-6-1-11-6-8-16z" fill="rgba(43,38,32,0.24)" />
        </g>
      )}
    </svg>
  );
}

// Sfeerfoto's per basisdrank voor de "Op basisdrank"-rondjes (Maken-tab):
// elke drank krijgt zijn eigen foto in plaats van steeds dezelfde
// Sterke-drank-plankfoto, met dezelfde behandeling als CategoryArt zodat
// het visueel bij elkaar blijft horen.
const SPIRIT_PHOTOS = {
  "Gin": spiritGinImg,
  "Wodka": spiritWodkaImg,
  "Witte rum": spiritWitteRumImg,
  "Cognac / brandy": spiritCognacBrandyImg,
  "Rye whisky": spiritRyeWhiskyImg,
  "Bourbon": spiritBourbonImg,
};

function SpiritArt({ label }) {
  const art = CATEGORY_ART["Sterke drank"];
  const photo = SPIRIT_PHOTOS[label] || CATEGORY_PHOTOS["Sterke drank"];
  return (
    <>
      <img src={photo} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(150deg, ${art.from}5c, ${art.to}85 75%)`, mixBlendMode: "multiply" }} />
    </>
  );
}

// Elke fles een eigen "productfoto" zou 140+ losse illustraties vergen; in
// plaats daarvan krijgt elk ingrediënt een silhouet passend bij zijn soort
// (fles, wijnfles, bitters-dasher, siroopflesje, kan, citrus, kruid, glas),
// getint met de kleur van zijn categorie — zodat de popup toch als een
// "plank vol etiketten" oogt in plaats van 44x dezelfde fles.
function shapeForIngredient(ing) {
  const n = ing.name.toLowerCase();
  if (ing.cat === "Bitters") return "dasher";
  if (ing.cat === "Zuivel & room") return "jug";
  if (ing.cat === "Vers") {
    if (/munt|basilicum|kruidnagel|gember|chili|komkommer|kaneel|aardbei|boter|marmelade/.test(n)) return "herb";
    if (/citroen|limoen|sinaasappel|grapefruit|kers|olijf/.test(n)) return "citrus";
    return "syrup";
  }
  if (ing.cat === "Mixers") {
    if (/wijn|bier|stout|sake|prosecco|champagne/.test(n)) return "wine";
    return "glass";
  }
  if (ing.cat === "Likeuren & versterkte wijnen") {
    if (/vermout|sherry|port|lillet/.test(n)) return "wine";
    return "bottle";
  }
  return "bottle";
}

function ItemArt({ ing }) {
  const localSrc = localItemImageUrl("drank", ing.id);
  if (localSrc) {
    return <img src={localSrc} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />;
  }
  const art = CATEGORY_ART[ing.cat] || CATEGORY_ART["Vers"];
  const shape = shapeForIngredient(ing);
  const gid = "ig_" + ing.id.replace(/[^a-z0-9]+/gi, "_");
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={art.from} />
          <stop offset="1" stopColor={art.to} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${gid})`} />
      {shape === "bottle" && (
        <g opacity="0.92">
          <rect x="28" y="10" width="8" height="7" rx="1.5" fill="rgba(0,0,0,0.32)" />
          <path d="M27 17h10c4 3 6 6 6 11v18a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V28c0-5 2-8 6-11z" fill="rgba(43,38,32,0.28)" />
          <rect x="22" y="34" width="20" height="9" rx="1.5" fill="rgba(251,247,236,0.85)" />
        </g>
      )}
      {shape === "wine" && (
        <g opacity="0.92">
          <rect x="29" y="8" width="6" height="9" rx="1.5" fill="rgba(0,0,0,0.32)" />
          <path d="M25 17h14c2 5 3 8 3 12 0 6-4 8-10 8s-10-2-10-8c0-4 1-7 3-12z" fill="rgba(43,38,32,0.26)" />
          <rect x="22" y="38" width="20" height="8" rx="1.5" fill="rgba(251,247,236,0.85)" />
        </g>
      )}
      {shape === "dasher" && (
        <g opacity="0.92">
          <rect x="29" y="10" width="6" height="7" rx="1.5" fill="rgba(0,0,0,0.35)" />
          <path d="M28 17h8c2 5 3 9 3 13v12a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 25 42V30c0-4 1-8 3-13z" fill="rgba(43,38,32,0.32)" />
          <rect x="24" y="35" width="16" height="7" rx="1.5" fill="rgba(251,247,236,0.85)" />
        </g>
      )}
      {shape === "syrup" && (
        <g opacity="0.92">
          <rect x="27" y="12" width="10" height="6" rx="2" fill="rgba(0,0,0,0.3)" />
          <path d="M25 18h14a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3z" fill="rgba(43,38,32,0.24)" />
          <rect x="23" y="30" width="18" height="8" rx="1.5" fill="rgba(251,247,236,0.85)" />
        </g>
      )}
      {shape === "jug" && (
        <g opacity="0.92">
          <path d="M22 20h16a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4z" fill="rgba(43,38,32,0.16)" />
          <path d="M42 24h4c2 0 3 1 3 3v4c0 2-1 3-3 3h-4" fill="none" stroke="rgba(43,38,32,0.16)" strokeWidth="2.6" />
        </g>
      )}
      {shape === "citrus" && (
        <g opacity="0.94">
          <circle cx="32" cy="32" r="12" fill="rgba(43,38,32,0.18)" />
          <circle cx="32" cy="32" r="12" fill="none" stroke="rgba(251,247,236,0.7)" strokeWidth="2" />
          <path d="M32 22v20M24 26l16 12M24 38l16-12" stroke="rgba(251,247,236,0.5)" strokeWidth="1" />
        </g>
      )}
      {shape === "herb" && (
        <g opacity="0.94">
          <path d="M32 44V22" stroke="rgba(43,38,32,0.32)" strokeWidth="2" strokeLinecap="round" />
          <path d="M32 24c6-4 10-2 12 2-6 3-10 1-12-2z" fill="rgba(43,38,32,0.26)" />
          <path d="M32 30c-6-4-10-2-12 2 6 3 10 1 12-2z" fill="rgba(43,38,32,0.26)" />
          <path d="M32 36c6-3 9-1 10 3-5 2-9 0-10-3z" fill="rgba(43,38,32,0.22)" />
        </g>
      )}
      {shape === "glass" && (
        <g opacity="0.92">
          <path d="M24 18h16l-2 22a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 24 40z" fill="rgba(43,38,32,0.2)" />
          <circle cx="30" cy="26" r="1.4" fill="rgba(255,255,255,0.7)" />
          <circle cx="35" cy="32" r="1.1" fill="rgba(255,255,255,0.6)" />
        </g>
      )}
    </svg>
  );
}

function VoorraadTab({ allIngredients, customIngredients, voorraad, voorraadAantal, onAdjustAantal, onToggle, onAddCustom, onRemoveCustom, onRenameCustom, onSound }) {
  const [drafts, setDrafts] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [quickSearch, setQuickSearch] = useState("");
  const [justChecked, setJustChecked] = useState(null);
  const [justPoppedId, setJustPoppedId] = useState(null);
  const [openCategory, setOpenCategory] = useState(null);

  const toggleWithPop = (id) => {
    if (!voorraad.has(id)) {
      onSound("tick");
      setJustPoppedId(id);
      setTimeout(() => setJustPoppedId(cur => (cur === id ? null : cur)), 350);
    }
    onToggle(id);
  };

  const setDraft = (cat, val) => setDrafts({ ...drafts, [cat]: val });
  const submit = (cat) => {
    const val = (drafts[cat] || "").trim();
    if (!val) return;
    onAddCustom(val, cat);
    onSound("pop");
    setDraft(cat, "");
  };

  const startEdit = (ing) => { setEditingId(ing.id); setEditDraft(ing.name); };
  const saveEdit = () => {
    onRenameCustom(editingId, editDraft);
    setEditingId(null);
  };

  const handleQuickSearch = (val) => {
    setQuickSearch(val);
    const match = allIngredients.find(i => i.name.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      if (!voorraad.has(match.id)) toggleWithPop(match.id);
      setQuickSearch("");
      setJustChecked(match.name);
      setTimeout(() => setJustChecked(id => (id === match.name ? null : id)), 2000);
    }
  };

  return (
    <div>
      <div style={{
        position: "relative", height: 176, borderRadius: RADIUS + 6, overflow: "hidden", marginBottom: 22,
        boxShadow: SHADOW_HERO, border: `1px solid ${BORDER}`, borderBottom: `3px solid ${BRASS}`,
      }}>
        <img src={voorraadHeaderImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, rgba(19,38,34,0.88), rgba(19,38,34,0.2) 55%, rgba(19,38,34,0.4))` }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "16px 20px" }}>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 26, color: CREAM }}>Voorraad</div>
          <div style={{ fontSize: 12, color: "#D9CBAE", letterSpacing: 0.4, marginTop: 3 }}>Jouw bar, in kaart gebracht</div>
        </div>
      </div>

      <div style={{ marginBottom: 26, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
        <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS, marginBottom: 8 }}>Snel aanvinken</div>
        <IngredientAutocomplete value={quickSearch} onChange={handleQuickSearch} options={allIngredients.map(i => i.name)}
          placeholder="Typ een ingrediënt, bijv. Pisco…" style={{ maxWidth: 360 }} />
        {justChecked && (
          <p className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, margin: "8px 0 0" }}>
            <Check size={14} strokeWidth={3} /> {justChecked} aangevinkt in voorraad
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 14, marginBottom: 8 }}>
        {CATEGORY_ORDER.map(cat => {
          const items = allIngredients.filter(i => i.cat === cat);
          const ownedCount = items.filter(i => voorraad.has(i.id)).length;
          return (
            <button key={cat} onClick={() => setOpenCategory(cat)} style={{
              display: "flex", flexDirection: "column", textAlign: "left", cursor: "pointer",
              background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14,
              boxShadow: SHADOW_CARD, overflow: "hidden", padding: 0, fontFamily: sans,
            }}>
              <div style={{ position: "relative", aspectRatio: "16 / 9" }}>
                <CategoryArt cat={cat} />
                <span style={{
                  position: "absolute", top: 8, right: 8, minWidth: 26, height: 22, padding: "0 7px",
                  borderRadius: 11, background: BRASS, color: CREAM, fontSize: 11.5, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{ownedCount}/{items.length}</span>
              </div>
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{cat}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>tik om te bekijken</div>
              </div>
            </button>
          );
        })}
      </div>

      {openCategory && (
        <CategorySheet
          cat={openCategory}
          items={allIngredients.filter(i => i.cat === openCategory)}
          voorraad={voorraad} voorraadAantal={voorraadAantal}
          onAdjustAantal={onAdjustAantal} onToggleWithPop={toggleWithPop} justPoppedId={justPoppedId}
          editingId={editingId} editDraft={editDraft} setEditDraft={setEditDraft}
          onStartEdit={startEdit} onSaveEdit={saveEdit} onCancelEdit={() => setEditingId(null)}
          onRemoveCustom={onRemoveCustom}
          draft={drafts[openCategory] || ""} onDraftChange={val => setDraft(openCategory, val)}
          onSubmitDraft={() => submit(openCategory)}
          onClose={() => setOpenCategory(null)}
        />
      )}
    </div>
  );
}

// Scroll-lock voor bottom sheets. Simpelweg `overflow: hidden` op body/html
// zetten is op iOS Safari niet waterdicht: een touch-gebaar dat over de
// backdrop begint, laat de achtergrond soms toch een stukje meebewegen, en
// zodra de sheet weer dichtgaat blijft de pagina dan in een kapotte
// tussentoestand hangen (vastzittend scrollen, een onderbalk die "zweeft" in
// plaats van vastzit). Body tijdelijk `position: fixed` maken met de huidige
// scrollpositie als negatieve top-offset is de bekende, wél betrouwbare manier
// om dat op iOS helemaal dicht te zetten; scrollpositie wordt bij het sluiten
// weer exact hersteld.
function useBodyScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

// Bottom sheets native laten aanvoelen: met je vinger omlaag vegen om te
// sluiten (de sheet volgt de vinger 1:1, veert terug als je niet ver genoeg
// komt), en elke manier van sluiten — vegen, tikken op de achtergrond, het
// kruisje — krijgt dezelfde vloeiende omlaag-animatie in plaats van abrupt
// te verdwijnen. Dat "meebewegen met je vinger en loslaten" is precies wat
// een sheet als een systeem-sheet laat voelen i.p.v. een webpagina-modal.
// Sleep-handlers gaan alleen op de handgreep + header, nooit op de
// scrollbare inhoud, zodat normaal scrollen door de lijst niet kapotgaat.
function useSheetDismiss(onClose) {
  const panelRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef({ startY: 0, startT: 0, dragging: false, delta: 0, raf: 0 });

  // will-change vast zetten zodra de sheet er is, zodat de browser 'm meteen
  // op zijn eigen compositor-laag zet — anders kan het OS die laag pas
  // aanmaken ná de eerste transform-mutatie, wat als een korte hapering
  // voelt bij de allereerste beweging van een sleep.
  useEffect(() => {
    if (panelRef.current) panelRef.current.style.willChange = "transform";
  }, []);

  const close = () => {
    if (closing) return;
    setClosing(true);
    if (panelRef.current) {
      panelRef.current.style.animation = "none";
      panelRef.current.style.transition = "transform 0.22s cubic-bezier(.32,.72,.35,1)";
      panelRef.current.style.transform = "translateY(100%)";
    }
    // closing moet weer terug naar false zodra de sheet echt weg is — anders
    // blijft close() (en de sleep-gestiek, die ook op closing checkt) voor
    // altijd geblokkeerd zodra deze sheet-eigenaar blijft gemount (zoals het
    // incheckformulier, dat nu permanent leeft voor de globale +-knop) en
    // je 'm een tweede keer opent: dan "hangt" de sheet gewoon, want elke
    // close-poging stopt meteen bij de closing-guard hierboven.
    setTimeout(() => { onClose(); setClosing(false); }, 220);
  };

  const onTouchStart = (e) => {
    if (closing) return;
    drag.current.startY = e.touches[0].clientY;
    drag.current.startT = Date.now();
    drag.current.dragging = true;
    drag.current.delta = 0;
    if (panelRef.current) {
      // De intro-animatie (sheetSlideUp) wint anders van onze eigen
      // transform-mutaties zolang hij nog loopt (CSS-animaties overschrijven
      // inline styles voor de duur van de animatie) — snel tikken-en-meteen-
      // vegen voelde daardoor met horten en stoten. Hem hier hard afkappen
      // geeft de sleepgestiek meteen volledige controle.
      panelRef.current.style.animation = "none";
      panelRef.current.style.transition = "none";
    }
  };
  const onTouchMove = (e) => {
    if (!drag.current.dragging) return;
    const delta = Math.max(0, e.touches[0].clientY - drag.current.startY);
    drag.current.delta = delta;
    // Kleine deadzone: zonder deze wiebelde de hele sheet al mee bij de
    // onvermijdelijke paar pixels beweging van een gewone tik (bv. op het
    // kruisje), wat aanvoelde als een trage/haperende knop i.p.v. een
    // directe tap. Pas vanaf een echte sleep van >6px volgen we de vinger.
    if (delta < 6) return;
    if (drag.current.raf) return;
    drag.current.raf = requestAnimationFrame(() => {
      drag.current.raf = 0;
      if (panelRef.current) panelRef.current.style.transform = `translateY(${drag.current.delta}px)`;
    });
  };
  const onTouchEnd = () => {
    if (!drag.current.dragging) return;
    drag.current.dragging = false;
    if (drag.current.raf) { cancelAnimationFrame(drag.current.raf); drag.current.raf = 0; }
    if (panelRef.current) panelRef.current.style.transition = "transform 0.22s cubic-bezier(.32,.72,.35,1)";
    // Ook een korte, snelle veeg omlaag sluit de sheet — net als native iOS,
    // dat niet alleen op afstand maar ook op vegsnelheid reageert (px/ms).
    const elapsed = Math.max(1, Date.now() - drag.current.startT);
    const velocity = drag.current.delta / elapsed;
    if (drag.current.delta > 110 || (drag.current.delta > 40 && velocity > 0.5)) {
      close();
    } else if (panelRef.current) {
      panelRef.current.style.transform = "translateY(0px)";
    }
  };

  return { panelRef, closing, close, dragHandlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

// Handgreepje bovenaan elke sheet: het vertrouwde iOS-affordance-streepje
// dat laat zien dat je omlaag kan vegen om te sluiten.
function SheetGrabber(dragHandlers) {
  return (
    <div {...dragHandlers} style={{ display: "flex", justifyContent: "center", padding: "9px 0 3px", flexShrink: 0, touchAction: "none" }}>
      <div style={{ width: 36, height: 4.5, borderRadius: 3, background: BORDER }} />
    </div>
  );
}

// Rand-swipe-terug voor de tabs "achter Meer": alleen actief als de vinger
// begint binnen de linkerrand (net als iOS' eigen interactive-pop-gesture —
// die reageert ook alleen op de rand, niet ergens midden op het scherm, zodat
// normale interacties met de inhoud nooit per ongeluk als "terug" gelezen
// worden). touchAction: pan-y laat verticaal scrollen gewoon door de browser
// afhandelen; alleen de horizontale sleep pakken we zelf op. Op een echt
// toestel gemeten (via het tijdelijke diagnosepaneel): zelfs 56px werd nog
// regelmatig gemist — iOS lijkt de eerste touch-samples vlak bij de fysieke
// rand zelf even vast te houden vóór JS ze ziet. 90px is fors ruimer, met
// opzet: gemiste swipes voelen erger dan een iets grotere randzone.
const EDGE_ZONE = 90;

// In een gewone Safari-tab (niet "toegevoegd aan beginscherm") heeft iOS zélf
// ook een rand-swipe-terug-gebaar, dat exact dezelfde linkerrand claimt als
// dit gebaar — de twee vochten dan letterlijk om dezelfde vingerbeweging,
// wat een half uitgevoerde/vastzittende schuifanimatie gaf (de pagina bleef
// dan met een stuk lege ruimte links staan). Als standalone PWA (via "zet op
// beginscherm") of als native Capacitor-app bestaat die systeem-gestiek niet
// — daar is dit dus veilig. In een gewone tab laten we alleen de sleepgestiek
// weg; de terugknop blijft overal gewoon werken.
function isStandalonePWA() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
}

// Debug-writes gebeuren los van dispatchEvent: het paneel ververst zichzelf
// toch al 2-3x per seconde via een interval, dus een event per aanraakframe
// (tot 60x/sec, elk met een React-rerender van het paneel) is pure overhead
// precies tijdens de gestiek die soepel moet aanvoelen — dat woog niet op
// tegen het diagnosenut.
function setSwipeDebug(patch) {
  window.__edgeSwipeDebug = { ...window.__edgeSwipeDebug, ...patch };
}

function useEdgeSwipeBack(onBack) {
  const contentRef = useRef(null);
  const peekRef = useRef(null);
  const scrimRef = useRef(null);
  const [showPeek, setShowPeek] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startX: 0, startT: 0, armed: false, dragging: false, tracking: false, delta: 0, raf: 0, width: 1, minX: 0 });
  const gestureEnabled = useMemo(() => isStandalonePWA() || isNativeShell, []);

  useEffect(() => {
    setSwipeDebug({ enabled: gestureEnabled, standalone: isStandalonePWA(), native: isNativeShell });
  }, [gestureEnabled]);

  // Zet transform/opacity van de content én de "Meer"-preview rechtstreeks op
  // de DOM-node (geen React state per frame) — dat is wat 60x/sec bijwerken
  // tijdens een sleep daadwerkelijk vloeiend maakt. React state (showPeek,
  // dragging) wisselt hooguit een paar keer per gestiek, nooit per frame.
  const paint = (px, animated) => {
    if (contentRef.current) {
      contentRef.current.style.transition = animated ? "transform 0.22s cubic-bezier(.32,.72,.35,1)" : "none";
      contentRef.current.style.transform = `translateX(${px}px)`;
    }
    const p = Math.min(1, px / drag.current.width);
    if (peekRef.current) {
      peekRef.current.style.transition = animated ? "transform 0.22s cubic-bezier(.32,.72,.35,1), opacity 0.22s ease" : "none";
      peekRef.current.style.transform = `translateX(${(p - 1) * 24}%)`;
      peekRef.current.style.opacity = Math.min(1, p * 1.6);
    }
    if (scrimRef.current) scrimRef.current.style.opacity = 1 - p;
  };

  const commitBack = () => {
    hapticFor("tick");
    setDragging(false);
    if (contentRef.current) {
      contentRef.current.style.transition = "transform 0.24s cubic-bezier(.32,.72,.35,1)";
      contentRef.current.style.transform = "translateX(100%)";
    }
    if (peekRef.current) {
      peekRef.current.style.transition = "transform 0.24s cubic-bezier(.32,.72,.35,1), opacity 0.2s ease";
      peekRef.current.style.transform = "translateX(0%)";
      peekRef.current.style.opacity = 1;
    }
    if (scrimRef.current) scrimRef.current.style.opacity = 0;
    setTimeout(() => {
      onBack();
      // Dit scherm blijft na het wisselen gewoon gemount (alleen display:none),
      // dus zonder deze reset bleef de "Meer"-preview en de weggeschoven
      // transform hangen van de vorige keer — en zag je 'm de vólgende keer
      // dat je hier weer kwam (swipe óf gewoon tikken) meteen weer terug,
      // half overlappend met de echte inhoud.
      setShowPeek(false);
      if (contentRef.current) {
        contentRef.current.style.transition = "none";
        contentRef.current.style.transform = "translateX(0px)";
      }
    }, 200);
  };

  // iOS lijkt de allereerste paar millimeter van een echte duimveeg vanaf de
  // rand soms zelf in te houden (systeem-gestiek-arbitrage) — JS ziet dan pas
  // een bruikbaar touch-event nadat de vinger al iets voorbij EDGE_ZONE is.
  // Daarom niet uitsluitend op de touchstart-positie beslissen: meteen armen
  // als die al binnen de rand valt (het normale, snelste pad), mét een
  // fallback die de eerste touchmove nog meeneemt als touchstart zelf al
  // (net) te ver leek te beginnen.
  const arm = (fromX) => {
    drag.current.armed = true;
    drag.current.dragging = true;
    drag.current.startX = fromX;
    drag.current.startT = Date.now();
    drag.current.delta = 0;
    setShowPeek(true);
    setDragging(true);
    paint(0, false);
    setSwipeDebug({ lastEvent: "armed", armed: true });
  };

  const onTouchStart = (e) => {
    const x = e.touches[0].clientX;
    setSwipeDebug({ lastEvent: "touchstart", lastX: x, gateBlocked: !gestureEnabled, armed: false, delta: 0 });
    if (!gestureEnabled) return;
    drag.current.tracking = true;
    drag.current.armed = false;
    drag.current.dragging = false;
    drag.current.minX = x;
    drag.current.width = contentRef.current?.offsetWidth || window.innerWidth;
    if (x <= EDGE_ZONE) arm(x);
  };
  const onTouchMove = (e) => {
    if (!gestureEnabled || !drag.current.tracking) return;
    const x = e.touches[0].clientX;
    if (!drag.current.armed) {
      drag.current.minX = Math.min(drag.current.minX, x);
      if (drag.current.minX > EDGE_ZONE || x <= drag.current.minX) return;
      // Eenmaal geclaimd: niet laten doorbubbelen naar een eromheen liggende
      // edge-swipe-gestiek (bv. een lesdetail ín de Cursus-tab, die zelf weer
      // in SecondaryTabScreen zit) — anders arm(en) beide tegelijk en spring
      // je in één keer helemaal terug naar Meer i.p.v. één stap terug.
      e.stopPropagation();
      arm(drag.current.minX);
    }
    const delta = Math.max(0, x - drag.current.startX);
    drag.current.delta = delta;
    if (drag.current.raf) return;
    drag.current.raf = requestAnimationFrame(() => {
      drag.current.raf = 0;
      paint(drag.current.delta, false);
    });
  };
  const onTouchEnd = () => {
    drag.current.tracking = false;
    setSwipeDebug({ lastEvent: "touchend", finalDelta: drag.current.delta });
    if (!drag.current.armed || !drag.current.dragging) return;
    drag.current.dragging = false;
    if (drag.current.raf) { cancelAnimationFrame(drag.current.raf); drag.current.raf = 0; }
    // Een korte, snelle veeg telt ook als "terug", net als op iOS — niet
    // alleen de afstand telt mee, ook hoe snel de vinger bewoog (px/ms).
    const elapsed = Math.max(1, Date.now() - drag.current.startT);
    const velocity = drag.current.delta / elapsed;
    const passed = drag.current.delta > Math.min(120, drag.current.width * 0.28) || (drag.current.delta > 40 && velocity > 0.5);
    setSwipeDebug({ lastEvent: "touchend-processed", passed, velocity: Math.round(velocity * 100) / 100 });
    if (passed) {
      commitBack();
    } else {
      setDragging(false);
      paint(0, true);
      setTimeout(() => setShowPeek(false), 220);
    }
  };

  return { contentRef, peekRef, scrimRef, showPeek, dragging, commitBack, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}

// Wrapper om elke tab "achter Meer": geeft 'm een terugknop (net als een
// iOS-navigatiebalk) plus de rand-swipe-gestiek hierboven. Tijdens het
// slepen schuift een preview van het Meer-scherm (icoon, titel, een paar
// rij-silhouetten — geen echte tweede instantie van MeerTab, puur decoratief)
// vanaf links mee naar binnen, net als de "vorige scherm wordt zichtbaar"-
// parallax van een echte iOS-navigatiestack, i.p.v. een vlak gedimd vlak.
function SecondaryTabScreen({ label, onBack, children }) {
  const { contentRef, peekRef, scrimRef, showPeek, commitBack, handlers } = useEdgeSwipeBack(onBack);
  return (
    <div style={{ position: "relative" }}>
      {showPeek && (
        <div ref={peekRef} aria-hidden style={{
          position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden",
          background: PAPER, transform: "translateX(-24%)", opacity: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(env(safe-area-inset-top) + 22px) 20px 14px" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", background: "rgba(184,134,46,0.14)", flexShrink: 0 }}>
              <MoreHorizontal size={18} color={BRASS} strokeWidth={2} />
            </span>
            <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 20, color: INK }}>{label}</span>
          </div>
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 52, borderRadius: RADIUS, background: CREAM, border: `1px solid ${BORDER}` }} />
            ))}
          </div>
          <div ref={scrimRef} aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(15,12,9,0.16)", opacity: 1 }} />
        </div>
      )}
      <div ref={contentRef} {...handlers} style={{ touchAction: "pan-y", position: "relative", background: PAPER }}>
        {/* Een tik hier is geen voltooide swipe: commitBack() verwacht de
            peek-preview-laag die alleen tijdens een echte sleep gerenderd
            wordt, dus die reuseden gaf een korte "lege" flits. Een tik
            schakelt daarom rechtstreeks (net zo instant als de dock-tabs).
            stopPropagation op touchstart voorkomt ook dat een tik hier de
            rand-swipe-gestiek zelf arm't — de knop staat namelijk al
            binnen de 90px edge-zone. */}
        <button onClick={onBack} onTouchStart={(e) => e.stopPropagation()} style={{
          display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
          padding: "0 0 16px", margin: 0, color: BRASS, fontFamily: sans, fontSize: 13.5, fontWeight: 700,
        }}>
          <ChevronLeft size={18} strokeWidth={2.4} /> {label}
        </button>
        {children}
      </div>
    </div>
  );
}

// Zelfde rand-swipe-terug-gestiek als hierboven, maar zonder eigen terugknop
// of preview-laag — voor interne detailschermen die al hun eigen terugknop
// tekenen (een open recept in Recept, een les in Cursus) en alleen de
// vingerbeweging erbij nodig hebben.
function EdgeSwipeBackArea({ onBack, children }) {
  const { contentRef, handlers } = useEdgeSwipeBack(onBack);
  return (
    <div ref={contentRef} {...handlers} style={{ touchAction: "pan-y" }}>
      {children}
    </div>
  );
}

// Native iOS-lijst-gestiek: naar links vegen onthult een rode verwijderknop
// áchter de rij (die je dan apart tikt om te bevestigen — geen instant-
// verwijderen op een verre veeg, dat is met een destructieve actie te
// riskant). Een tik ergens anders op de rij terwijl de knop getoond wordt
// sluit 'm weer, net als in Mail/Herinneringen. De bestaande knop-met-
// prullenbak blijft daarnaast gewoon werken; dit is een extra manier, geen
// vervanging.
function SwipeToDelete({ onDelete, borderRadius = 0, children }) {
  const rowRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  const ACTION_WIDTH = 78;
  const drag = useRef({ startX: 0, startTranslate: 0, dragging: false, armed: false, current: 0, raf: 0 });

  const setX = (x) => { if (rowRef.current) rowRef.current.style.transform = `translateX(${x}px)`; };

  const close = () => {
    setRevealed(false);
    if (rowRef.current) { rowRef.current.style.transition = "transform 0.2s ease"; setX(0); }
  };

  const onTouchStart = (e) => {
    drag.current.startX = e.touches[0].clientX;
    drag.current.startY = e.touches[0].clientY;
    drag.current.startTranslate = revealed ? -ACTION_WIDTH : 0;
    drag.current.dragging = true;
    drag.current.armed = false;
    if (rowRef.current) rowRef.current.style.transition = "none";
  };
  const onTouchMove = (e) => {
    if (!drag.current.dragging) return;
    const dx = e.touches[0].clientX - drag.current.startX;
    const dy = e.touches[0].clientY - drag.current.startY;
    if (!drag.current.armed) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // Alleen als de beweging duidelijker horizontaal dan verticaal is
      // "claimen" we het gebaar — anders blijft gewoon verticaal scrollen werken.
      drag.current.armed = Math.abs(dx) > Math.abs(dy);
      if (!drag.current.armed) { drag.current.dragging = false; return; }
      // Eenmaal geclaimd: niet laten doorbubbelen naar de rand-swipe-terug-
      // gestiek van de tab eromheen (die anders bij een kaart die toevallig
      // dicht bij de linkerrand begint, tegelijk zou meesleen).
      e.stopPropagation();
    }
    let next = drag.current.startTranslate + dx;
    next = Math.min(0, Math.max(-ACTION_WIDTH * 1.15, next));
    drag.current.current = next;
    if (drag.current.raf) return;
    drag.current.raf = requestAnimationFrame(() => { drag.current.raf = 0; setX(drag.current.current); });
  };
  const onTouchEnd = () => {
    if (!drag.current.dragging || !drag.current.armed) { drag.current.dragging = false; return; }
    drag.current.dragging = false;
    if (drag.current.raf) { cancelAnimationFrame(drag.current.raf); drag.current.raf = 0; }
    if (rowRef.current) rowRef.current.style.transition = "transform 0.2s ease";
    if (drag.current.current < -ACTION_WIDTH * 0.5) {
      setRevealed(true);
      setX(-ACTION_WIDTH);
    } else {
      close();
    }
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => { close(); onDelete(); }} aria-label="Verwijderen" style={{
          width: ACTION_WIDTH, border: "none", background: BURGUNDY, color: "#FBF6EA",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer",
        }}>
          <Trash2 size={17} />
          <span style={{ fontSize: 10.5, fontWeight: 700 }}>Verwijder</span>
        </button>
      </div>
      <div ref={rowRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{ position: "relative", touchAction: "pan-y" }}>
        {children}
        {revealed && (
          <div onClick={close} style={{ position: "absolute", inset: 0, zIndex: 1 }} />
        )}
      </div>
    </div>
  );
}

function CategorySheet({ cat, items, voorraad, voorraadAantal, onAdjustAantal, onToggleWithPop, justPoppedId,
  editingId, editDraft, setEditDraft, onStartEdit, onSaveEdit, onCancelEdit, onRemoveCustom,
  draft, onDraftChange, onSubmitDraft, onClose }) {

  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ownedCount = items.filter(i => voorraad.has(i.id)).length;

  // In een portal naar document.body gerenderd: anders valt deze sheet binnen
  // de stacking context van de geanimeerde tab-inhoud (.tab-fade) en duikt
  // de onderbalk er, ondanks een lagere z-index, gewoon overheen.
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close}
        style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "85vh",
        background: PAPER, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, touchAction: "none" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{cat}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{ownedCount} van {items.length} in huis</div>
          </div>
          <button onClick={close} aria-label="Sluiten" className="tap-target-44" style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
            borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK,
          }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "18px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 12 }}>
            {items.map(ing => {
              const owned = voorraad.has(ing.id);
              const isCustom = ing.id.startsWith("custom_");
              const aantal = voorraadAantal[ing.id] ?? 1;
              const isEditing = editingId === ing.id;

              return (
                <div key={ing.id} style={{
                  position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
                  background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 8px 10px",
                }}>
                  {!isEditing && (
                    <button onClick={() => onToggleWithPop(ing.id)} aria-label={owned ? "Verwijder uit voorraad" : "Voeg toe aan voorraad"}
                      className={justPoppedId === ing.id ? "ring-pop" : undefined}
                      style={{
                        position: "absolute", top: 7, right: 7, width: 20, height: 20, borderRadius: "50%",
                        border: `1.5px solid ${owned ? BOTTLE : BORDER}`, background: owned ? BOTTLE : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
                      }}>
                      {owned && <Check key={justPoppedId === ing.id ? "popping" : "static"} className={justPoppedId === ing.id ? "check-pop" : undefined} size={12} strokeWidth={3} color={CREAM} />}
                    </button>
                  )}

                  <button onClick={() => !isEditing && onToggleWithPop(ing.id)} style={{
                    width: 52, height: 52, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
                    marginBottom: 8, overflow: "hidden", opacity: owned ? 1 : 0.85,
                  }}>
                    <ItemArt ing={ing} />
                  </button>

                  {isEditing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input value={editDraft} onChange={e => setEditDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
                        autoFocus autoCapitalize="words" enterKeyHint="done"
                        style={{ border: `1px solid ${BRASS}`, borderRadius: 3, background: CREAM, fontSize: 12, fontFamily: sans, color: INK, width: 74, padding: "2px 4px", outline: "none" }} />
                      <button onClick={onSaveEdit} style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: SAGE, padding: 0 }}><Check size={13} strokeWidth={3} /></button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: INK, textAlign: "center", lineHeight: 1.25 }}>{ing.name}</div>
                  )}

                  {owned && !isEditing && (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "2px 6px", borderRadius: 3, background: PAPER_DEEP }}>
                      <span onClick={() => onAdjustAantal(ing.id, -0.5)} className="press-scale" style={{ display: "flex", padding: "0 2px", fontWeight: 700, lineHeight: 1, cursor: "pointer", color: INK }}>−</span>
                      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 14, textAlign: "center", color: INK }}>{formatAantal(aantal)}</span>
                      <span onClick={() => onAdjustAantal(ing.id, 0.5)} className="press-scale" style={{ display: "flex", padding: "0 2px", fontWeight: 700, lineHeight: 1, cursor: "pointer", color: INK }}>+</span>
                    </div>
                  )}

                  {isCustom && !isEditing && (
                    <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                      <span onClick={() => onStartEdit(ing)} style={{ display: "flex", cursor: "pointer", opacity: 0.65 }}><Pencil size={11} color={MUTED} /></span>
                      <span onClick={() => { onSound("remove"); onRemoveCustom(ing.id); }} style={{ display: "flex", cursor: "pointer", opacity: 0.65 }}><X size={12} color={MUTED} /></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={draft} onChange={e => onDraftChange(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") onSubmitDraft(); }}
              placeholder={`Voeg toe aan ${cat.toLowerCase()}…`}
              autoCapitalize="sentences" enterKeyHint="done"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 3, border: `1px dashed ${MUTED}`, fontSize: 13, boxSizing: "border-box", background: "transparent", fontFamily: sans, color: INK }} />
            <button onClick={onSubmitDraft} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${BRASS}`, color: BRASS, borderRadius: 3, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              <Plus size={13} /> Toevoegen
            </button>
          </div>
          <button onClick={close} style={{
            width: "100%", padding: "13px", borderRadius: RADIUS, border: "none", cursor: "pointer",
            background: BOTTLE, color: CREAM, fontFamily: sans, fontSize: 15, fontWeight: 700, boxShadow: SHADOW_CTA,
          }}>Gereed</button>
        </div>
      </div>
    </div>
  ), document.body);
}

// Laat een getal "oplopen" naar zijn nieuwe waarde (ease-out, ~500ms) i.p.v.
// er in één keer naartoe te springen, voor het winkelmandje-totaal en de
// cursus-voortgang. Reine CSS kan geen getallen animeren, dus dit is de ene
// plek in de app met een kleine requestAnimationFrame-lus i.p.v. een CSS-klasse.
function AnimatedNumber({ value, format }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const reduceMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    if (reduceMotion) { setDisplay(to); fromRef.current = to; return; }
    let raf; let start = null;
    const duration = 500;
    const step = (ts) => {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduceMotion]);

  return format ? format(display) : Math.round(display);
}

function StatusTag({ missingCount }) {
  const cfg = missingCount === 0
    ? { color: SAGE, label: "Maakbaar" }
    : missingCount === 1
      ? { color: BRASS, label: "Bijna, mist 1" }
      : { color: BURGUNDY, label: `Mist ${missingCount}` };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: cfg.color, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}

// Eigen dropdown i.p.v. <input list>/<datalist>: iOS Safari toont de native
// datalist-suggesties namelijk helemaal niet (bekende platformbeperking), dus
// zonder dit kon je op iPhone wel typen maar nooit een keuzelijst zien.
function RecipePicker({ recipes, value, onChange, listId, style }) {
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const sorted = useMemo(() => [...recipes].sort((a, b) => a.name.localeCompare(b.name)), [recipes]);
  const current = recipes.find(r => r.id === value);
  const text = draft !== null ? draft : (current?.name || "");

  const filtered = useMemo(() => {
    const q = (draft || "").trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(r => r.name.toLowerCase().includes(q));
  }, [sorted, draft]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => { document.removeEventListener("mousedown", onOutside); document.removeEventListener("touchstart", onOutside); };
  }, [open]);

  const select = (r) => { onChange(r.id); setDraft(null); setOpen(false); };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && filtered.length > 0) { select(filtered[0]); e.target.blur(); }
    if (e.key === "Escape") { setOpen(false); e.target.blur(); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <input
        value={text}
        onChange={e => { setDraft(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Zoek een cocktail…"
        style={{ padding: "7px 9px", borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: serif, background: CREAM, color: INK, width: "100%", boxSizing: "border-box" }} />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: CREAM,
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, maxHeight: 240, overflowY: "auto",
          WebkitOverflowScrolling: "touch", zIndex: 30, boxShadow: SHADOW_CARD,
        }}>
          {filtered.map(r => (
            <div key={r.id} onMouseDown={e => e.preventDefault()} onClick={() => select(r)} className="list-row-tap"
              style={{ padding: "9px 11px", fontSize: 14, fontFamily: serif, color: INK, cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}>
              {r.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Zelfde reden als RecipePicker hierboven: vrij-tekst suggesties i.p.v. <datalist>
// zodat de lijst ook op iPhone/iOS Safari echt zichtbaar is.
function IngredientAutocomplete({ value, onChange, options, style, placeholder = "Ingrediënt" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const list = q ? options.filter(n => n.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => { document.removeEventListener("mousedown", onOutside); document.removeEventListener("touchstart", onOutside); };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder={placeholder} enterKeyHint="search" autoCapitalize="words" autoCorrect="off"
        style={{ ...fieldStyle(), padding: "8px 9px", fontSize: 13.5, width: "100%" }} />
      {open && value.trim() && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: CREAM,
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, maxHeight: 200, overflowY: "auto",
          WebkitOverflowScrolling: "touch", zIndex: 30, boxShadow: SHADOW_CARD,
        }}>
          {filtered.map(n => (
            <div key={n} onMouseDown={e => e.preventDefault()} onClick={() => { onChange(n); setOpen(false); }} className="list-row-tap"
              style={{ padding: "8px 10px", fontSize: 13.5, fontFamily: sans, color: INK, cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}>
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function recipeTint(recipe, allIngredients) {
  return getLiquidColor(recipe, allIngredients);
}

// Zelfde warme kleurgradatie op elke receptfoto, ongeacht bron — zodat de
// verzameling als één geheel oogt in plaats van los verzamelde stockfoto's.
const RECIPE_PHOTO_FILTER = "sepia(0.16) saturate(1.12) brightness(1.01) contrast(1.04)";

// Rond glasicoontje op een gekleurde cirkel — dezelfde "kaart met badge"-taal
// als de flesjes in Voorraad, maar dan met de échte drankkleur van dit recept
// (getLiquidColor bestaat al, gebruikt door de hero in de Recept-tab).
// Als het recept een echte foto heeft, tonen we die (bijgesneden, gefilterd
// voor visuele eenheid) in plaats van de illustratie.
// Eén herbruikbaar beeld-component voor elke cocktail/drank in de app (zie
// CLAUDE.md "## Afbeeldingen"): toont de lokaal gebundelde foto uit
// images.json zodra die er is, anders de meegegeven illustratie-terugval
// (nooit leeg). `photoUrl` is een tussenstap-terugval voor recepten die al
// een (externe) foto-URL in recipes.js hadden vóórdat de lokale
// foto-catalogus gevuld is — verdwijnt vanzelf zodra images.json een lokaal
// bestand voor dat id heeft.
function ItemImage({ id, type, photoUrl, size = 50, radius = "50%", tint, filter, fallback }) {
  const src = localItemImageUrl(type, id) || photoUrl || null;
  if (!src) return fallback;
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0,
      aspectRatio: "1 / 1", background: tint ? `linear-gradient(150deg, ${tint[1]}, ${tint[0]})` : undefined,
    }}>
      <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter }} />
    </div>
  );
}

function RecipeCircle({ recipe, allIngredients, size = 50 }) {
  const tint = recipeTint(recipe, allIngredients);
  const garnishes = inferGarnishes(recipe, allIngredients);
  return (
    <ItemImage id={recipe.id} type="cocktail" photoUrl={recipe.image} size={size} tint={tint} filter={RECIPE_PHOTO_FILTER} fallback={
      <div style={{
        width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(150deg, ${tint[1]}, ${tint[0]})`,
      }}>
        <GlassArt glass={recipe.glass} colors={tint} garnishes={garnishes} rim={inferRim(recipe, allIngredients)} foam={inferFoam(recipe, allIngredients)} iceStyle={inferIceStyle(recipe)} size={size * 0.62} />
      </div>
    } />
  );
}

function RecipeSheet({ recipe, missing, ingredientLabel, allIngredients, onAddMissing, justAdded, onClose,
  onOpenFullRecipe, onAddToFeest, feestChosen, onSound }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [justAddedFeest, setJustAddedFeest] = useState(false);
  const inFeest = feestChosen?.includes(recipe.id);
  const handleAddFeest = () => {
    if (inFeest) return;
    onAddToFeest(recipe.id);
    onSound?.("chime");
    setJustAddedFeest(true);
    setTimeout(() => setJustAddedFeest(false), 1800);
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // In een portal naar document.body gerenderd: anders valt deze sheet binnen
  // de stacking context van de geanimeerde tab-inhoud (.tab-fade) en duikt
  // de onderbalk er, ondanks een lagere z-index, gewoon overheen.
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "85vh",
        background: PAPER, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, touchAction: "none" }}>
          <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 18, color: INK }}>{recipe.name}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{recipe.family} · {recipe.glass}</div>
          </div>
          <button onClick={close} aria-label="Sluiten" className="tap-target-44" style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
            borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK, flexShrink: 0,
          }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "16px 20px" }}>
          <ul style={{ margin: "0 0 12px", paddingLeft: 0, listStyle: "none", fontSize: 14.5 }}>
            {recipe.ingredients.map((ing, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: isOwnedRef(ing, missing) ? INK : BURGUNDY, fontWeight: isOwnedRef(ing, missing) ? 400 : 600, borderTop: i === 0 ? "none" : `1px dotted ${BORDER}` }}>
                <span>{ingredientLabel(ing)}{ing.optional ? " (optioneel)" : ""}</span>
                <span style={{ fontWeight: 700 }}>{ing.amount} {unitLabel(ing.unit, ing.amount)}</span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 8px", lineHeight: 1.5 }}>{recipe.method}</p>
          {recipe.garnish && (
            <p style={{ fontSize: 13, color: BRASS, margin: 0, lineHeight: 1.5 }}><strong>Afwerking:</strong> {recipe.garnish}</p>
          )}
        </div>

        <div style={{ padding: "12px 20px 16px", borderTop: `1px solid ${BORDER}`, flexShrink: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          {(onOpenFullRecipe || onAddToFeest) && (
            <div style={{ display: "flex", gap: 8 }}>
              {onOpenFullRecipe && (
                <button onClick={() => { close(); setTimeout(() => onOpenFullRecipe(recipe.id), 180); }} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none",
                  border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 3, padding: "9px 10px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>
                  <BookOpen size={14} /> Volledig recept
                </button>
              )}
              {onAddToFeest && (
                justAddedFeest ? (
                  <span className="success-pop" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700 }}>
                    <Check size={14} strokeWidth={3} /> Toegevoegd
                  </span>
                ) : (
                  <button onClick={handleAddFeest} disabled={inFeest} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none",
                    border: `1px solid ${inFeest ? BORDER : BRASS}`, color: inFeest ? MUTED : BRASS, borderRadius: 3,
                    padding: "9px 10px", fontSize: 12.5, fontWeight: 700, cursor: inFeest ? "default" : "pointer",
                  }}>
                    <PartyPopper size={14} /> {inFeest ? "In feestplanner" : "Feestplanner"}
                  </button>
                )
              )}
            </div>
          )}
          {missing.length === 0 ? (
            <p style={{ textAlign: "center", fontSize: 13, color: SAGE, fontWeight: 700, margin: 0 }}>Je hebt alles in huis — cheers!</p>
          ) : justAdded ? (
            <span className="success-pop" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: SAGE, fontSize: 13, fontWeight: 700, padding: "7px 0" }}>
              <Check size={14} strokeWidth={3} /> Toegevoegd: bekijk het Winkelmandje-tabblad
            </span>
          ) : (
            <button onClick={() => onAddMissing(recipe.id, missing.map(m => ({ ref: m, recipeNames: [recipe.name] })))} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px",
              borderRadius: RADIUS, border: "none", cursor: "pointer", background: BOTTLE, color: CREAM,
              fontFamily: sans, fontSize: 14, fontWeight: 700, boxShadow: SHADOW_CTA,
            }}>
              <ShoppingCart size={15} /> Voeg {missing.length} ontbrekende toe aan winkelmandje
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
function isOwnedRef(ing, missing) {
  return !missing.includes(ing);
}

function BrowseSheet({ label, entries, allIngredients, onSelect, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // In een portal naar document.body gerenderd: anders valt deze sheet binnen
  // de stacking context van de geanimeerde tab-inhoud (.tab-fade) en duikt
  // de onderbalk er, ondanks een lagere z-index, gewoon overheen.
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "85vh",
        background: PAPER, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, touchAction: "none" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{label}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{entries.length} recepten</div>
          </div>
          <button onClick={close} aria-label="Sluiten" className="tap-target-44" style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
            borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK,
          }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "6px 20px" }}>
          {entries.map(({ recipe, missing }, i) => (
            <button key={recipe.id} onClick={() => onSelect(recipe.id)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none",
              cursor: "pointer", padding: "12px 0", textAlign: "left", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
            }}>
              <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: INK }}>{recipe.name}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{recipe.family} · {recipe.glass}</div>
              </div>
              <StatusTag missingCount={missing.length} />
            </button>
          ))}
        </div>
      </div>
    </div>
  ), document.body);
}

// UX-herindeling (v2): Maken en Recept waren twee losse tabs die feitelijk
// naar dezelfde cocktail-database keken (beide eindigden in hetzelfde
// detailscherm). Ontdekken voegt ze samen tot één herkenbaar geheel met een
// filter, i.p.v. de gebruiker te laten raden welke van de twee de "juiste"
// ingang is. Geen van beide tabs is intern aangepast — dit is puur een
// dunne wrapper die ze toont/verbergt, om het risico op regressies klein te
// houden terwijl de navigatiestructuur wél klopt met het voorstel.
function OntdekkenTab({ makenProps, verhaalProps, openRecipeId, onOpenRecipeHandled, recommended, favoriteFamily, allIngredients, onOpenRecipe, onSound }) {
  const [mode, setMode] = useState("alles");
  // Een aanbevolen cocktail van elders in de app (Home, Check-in) moet altijd
  // in de "Alles"-weergave (Recept) opengaan, ongeacht welke modus actief was.
  useEffect(() => { if (openRecipeId) setMode("alles"); }, [openRecipeId]);
  return (
    <div>
      <SectionLabel>Ontdekken</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setMode("alles")} style={{
          flex: 1, padding: "10px 12px", borderRadius: RADIUS, border: `1px solid ${mode === "alles" ? BOTTLE : BORDER}`,
          background: mode === "alles" ? BOTTLE : CREAM, color: mode === "alles" ? CREAM : INK,
          fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>Alle recepten</button>
        <button onClick={() => setMode("kan")} style={{
          flex: 1, padding: "10px 12px", borderRadius: RADIUS, border: `1px solid ${mode === "kan" ? BOTTLE : BORDER}`,
          background: mode === "kan" ? BOTTLE : CREAM, color: mode === "kan" ? CREAM : INK,
          fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>Wat ik kan maken</button>
      </div>

      {/* Zelfde aanbevelingslogica als Check-in ("Jouw favoriete stijl"),
          hier vooraan getoond zodat ontdekken ook persoonlijk aanvoelt i.p.v.
          alleen een kale lijst — precies zoals in het UX-voorstel. */}
      {recommended && recommended.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>✨ Aanbevolen voor jou</SectionLabel>
          <div style={{ fontSize: 12.5, color: MUTED, margin: "-6px 0 13px" }}>Gebaseerd op je smaakprofiel en je voorraad</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {recommended.map(({ recipe, matchPct }) => (
              <button key={recipe.id} onClick={() => { onSound?.("pop"); onOpenRecipe?.(recipe.id); }} className="press-scale" style={{ width: 132, flexShrink: 0, textAlign: "center", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: 10, position: "relative", cursor: "pointer", fontFamily: sans }}>
                <div style={{ position: "absolute", top: 8, right: 8, background: BOTTLE_DARK, border: `1px solid rgba(245,239,230,0.25)`, borderRadius: 100, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: BRASS }}>{matchPct}%</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                  <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={48} />
                </div>
                <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: INK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{recipe.name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontWeight: 500 }}>{recipe.family}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: mode === "kan" ? "" : "none" }}>
        <MakenTab {...makenProps} />
      </div>
      <div style={{ display: mode === "alles" ? "" : "none" }}>
        <VerhaalTab {...verhaalProps} openRecipeId={openRecipeId} onOpenRecipeHandled={onOpenRecipeHandled} />
      </div>
    </div>
  );
}

function MakenTab({ recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, onSound, onOpenRecipe, onAddToFeest, feestChosen }) {
  const [view, setView] = useState("ontdekken");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [glassFilter, setGlassFilter] = useState("");
  const [spiritFilter, setSpiritFilter] = useState("");
  const [justAddedId, setJustAddedId] = useState(null);
  const [justAddedFeestId, setJustAddedFeestId] = useState(null);
  const [sheetRecipeId, setSheetRecipeId] = useState(null);
  const [browseGroup, setBrowseGroup] = useState(null);
  const [uitgelichtExpanded, setUitgelichtExpanded] = useState(false);
  const [bijnaExpanded, setBijnaExpanded] = useState(false);

  const addMissing = (recipeId, refs) => {
    onAddToShoppingList(refs);
    onSound("tick");
    setJustAddedId(recipeId);
    setTimeout(() => setJustAddedId(id => (id === recipeId ? null : id)), 1800);
  };
  const addFeest = (recipeId) => {
    onAddToFeest(recipeId);
    onSound("chime");
    setJustAddedFeestId(recipeId);
    setTimeout(() => setJustAddedFeestId(id => (id === recipeId ? null : id)), 1800);
  };

  const families = useMemo(() => [...new Set(recipes.map(r => r.family).filter(Boolean))].sort(), [recipes]);
  const glasses = useMemo(() => [...new Set(recipes.map(r => r.glass).filter(Boolean))].sort(), [recipes]);
  const spirits = useMemo(() => [...new Set(recipes.map(r => getBaseSpirit(r, allIngredients)).filter(Boolean))].sort(), [recipes, allIngredients]);

  const filtered = recipes.filter(r => {
    if (query.trim() && !r.name.toLowerCase().includes(query.toLowerCase()) && !(r.family || "").toLowerCase().includes(query.toLowerCase())) return false;
    if (familyFilter && r.family !== familyFilter) return false;
    if (glassFilter && r.glass !== glassFilter) return false;
    if (spiritFilter && getBaseSpirit(r, allIngredients) !== spiritFilter) return false;
    return true;
  });
  const scored = filtered.map(r => {
    const required = r.ingredients.filter(i => !i.optional);
    const missing = required.filter(i => !isOwned(i));
    return { recipe: r, missing };
  }).sort((a, b) => a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name));

  // Ontdekken kijkt naar ALLE recepten (los van de filters hierboven, die
  // horen bij "Alle recepten") — eigen berekening, één keer per voorraadwijziging.
  const allScored = useMemo(() => recipes.map(r => {
    const required = r.ingredients.filter(i => !i.optional);
    const missing = required.filter(i => !isOwned(i));
    return { recipe: r, missing };
  }), [recipes, isOwned]);
  const scoredById = useMemo(() => new Map(allScored.map(s => [s.recipe.id, s])), [allScored]);

  const makeableAll = useMemo(() => allScored.filter(s => s.missing.length === 0), [allScored]);
  const bijnaAll = useMemo(() => allScored.filter(s => s.missing.length === 1), [allScored]);

  const bySpirit = useMemo(() => {
    const map = new Map();
    allScored.forEach(entry => {
      const s = getBaseSpirit(entry.recipe, allIngredients);
      if (!s) return;
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(entry);
    });
    return [...map.entries()].map(([label, entries]) => ({ label, entries })).sort((a, b) => b.entries.length - a.entries.length).slice(0, 6);
  }, [allScored, allIngredients]);

  const byFamily = useMemo(() => {
    const map = new Map();
    allScored.forEach(entry => {
      if (!entry.recipe.family) return;
      if (!map.has(entry.recipe.family)) map.set(entry.recipe.family, []);
      map.get(entry.recipe.family).push(entry);
    });
    return [...map.entries()].map(([label, entries]) => ({ label, entries })).sort((a, b) => b.entries.length - a.entries.length).slice(0, 6);
  }, [allScored]);

  // Koopadvies: welk ontbrekend ingrediënt ontgrendelt de meeste "mist 1"-recepten
  const koopadviesAll = useMemo(() => {
    const unlockMap = new Map();
    recipes.forEach(r => {
      const required = r.ingredients.filter(i => !i.optional);
      const missing = required.filter(i => !isOwned(i));
      if (missing.length === 1) {
        const ing = missing[0];
        const key = ingredientKey(ing);
        if (!unlockMap.has(key)) unlockMap.set(key, { key, label: ingredientLabel(ing), recipeNames: [] });
        unlockMap.get(key).recipeNames.push(r.name);
      }
    });
    return [...unlockMap.values()].filter(v => v.recipeNames.length >= 2).sort((a, b) => b.recipeNames.length - a.recipeNames.length);
  }, [recipes, isOwned, ingredientLabel]);
  const [koopadviesExpanded, setKoopadviesExpanded] = useState(false);
  const koopadvies = koopadviesExpanded ? koopadviesAll : koopadviesAll.slice(0, 4);

  const [shuffling, setShuffling] = useState(false);
  const verrasMe = () => {
    if (makeableAll.length === 0) return;
    const pick = makeableAll[Math.floor(Math.random() * makeableAll.length)];
    setShuffling(true);
    onSound("shuffle");
    setTimeout(() => {
      setSheetRecipeId(pick.recipe.id);
      setShuffling(false);
    }, 420);
  };

  const selectStyle = { padding: "8px 10px", borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: sans, background: CREAM, color: INK };

  const UITGELICHT_CAP = 6;
  const BIJNA_CAP = 4;
  const uitgelichtShown = uitgelichtExpanded ? makeableAll : makeableAll.slice(0, UITGELICHT_CAP);
  const bijnaShown = bijnaExpanded ? bijnaAll : bijnaAll.slice(0, BIJNA_CAP);

  const sheetEntry = sheetRecipeId ? scoredById.get(sheetRecipeId) : null;

  return (
    <div>
      <div style={{
        position: "relative", height: 176, borderRadius: RADIUS + 6, overflow: "hidden", marginBottom: 22,
        boxShadow: SHADOW_HERO, border: `1px solid ${BORDER}`, borderBottom: `3px solid ${BRASS}`,
      }}>
        <img src={makenHeaderImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, rgba(19,38,34,0.88), rgba(19,38,34,0.2) 55%, rgba(19,38,34,0.4))` }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "16px 20px" }}>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 26, color: CREAM }}>Wat kan ik maken</div>
          <div style={{ fontSize: 12, color: "#D9CBAE", letterSpacing: 0.4, marginTop: 3 }}>Van je voorraad naar je glas</div>
        </div>
      </div>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={query} onChange={e => { setQuery(e.target.value); if (e.target.value.trim() && view !== "alle") setView("alle"); }} placeholder="Zoek op naam of familie…"
          enterKeyHint="search" autoCapitalize="words"
          style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 14, boxSizing: "border-box", background: CREAM, fontFamily: sans }} />
      </div>

      <div style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS + 3, marginBottom: 22 }}>
        {[["ontdekken", "Ontdekken"], ["alle", "Alle recepten"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: RADIUS, border: "none", cursor: "pointer",
            background: view === id ? CREAM : "none", color: view === id ? BOTTLE : MUTED,
            fontFamily: sans, fontSize: 13, fontWeight: 700, boxShadow: view === id ? SHADOW_CARD : "none",
          }}>{label}</button>
        ))}
      </div>

      {view === "ontdekken" && (
        <div>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <SectionLabel>Uitgelicht</SectionLabel>
              <span style={{ fontSize: 12, color: MUTED }}>{makeableAll.length} kun je nu maken</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 12 }}>
              <button onClick={verrasMe} disabled={shuffling} style={{
                gridColumn: "span 2", display: "flex", alignItems: "center", gap: 12, minHeight: 74, padding: "14px 16px",
                borderRadius: 14, border: "none", cursor: shuffling ? "default" : "pointer", textAlign: "left",
                background: `linear-gradient(150deg, #2C5148, ${BOTTLE_DARK})`, color: CREAM, boxShadow: SHADOW_CARD,
              }}>
                <Shuffle size={22} className={shuffling ? "spin-icon" : undefined} />
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 800 }}>Verras me</div>
                  <div style={{ fontSize: 11.5, opacity: 0.82, marginTop: 1 }}>Kies willekeurig uit wat je kan maken</div>
                </div>
              </button>

              {uitgelichtShown.map(({ recipe }) => (
                <button key={recipe.id} onClick={() => setSheetRecipeId(recipe.id)} style={{
                  background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD,
                  padding: "12px 10px 10px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", cursor: "pointer",
                }}>
                  <span style={{
                    position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: SAGE,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}><Check size={11} strokeWidth={3} color={CREAM} /></span>
                  <div style={{ marginBottom: 8 }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} /></div>
                  <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13.5, color: INK, textAlign: "center", lineHeight: 1.25 }}>{recipe.name}</div>
                  <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{recipe.family}</div>
                </button>
              ))}
            </div>
            {makeableAll.length > UITGELICHT_CAP && (
              <button onClick={() => setUitgelichtExpanded(v => !v)} style={{
                width: "100%", marginTop: 10, padding: "9px", borderRadius: RADIUS, border: `1px dashed ${BRASS}`,
                background: "none", color: BRASS, fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}>{uitgelichtExpanded ? "Toon minder" : `Toon ${makeableAll.length - UITGELICHT_CAP} meer`}</button>
            )}
          </div>

          {bijnaAll.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <SectionLabel>Bijna compleet</SectionLabel>
                <span style={{ fontSize: 12, color: MUTED }}>mist 1 ingrediënt</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 12 }}>
                {bijnaShown.map(({ recipe, missing }) => (
                  <button key={recipe.id} onClick={() => setSheetRecipeId(recipe.id)} style={{
                    background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD,
                    padding: "12px 10px 10px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", cursor: "pointer",
                  }}>
                    <span style={{
                      position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: "50%", background: BRASS,
                      color: CREAM, fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>1</span>
                    <div style={{ marginBottom: 8 }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} /></div>
                    <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13.5, color: INK, textAlign: "center", lineHeight: 1.25 }}>{recipe.name}</div>
                    <div style={{ fontSize: 10.5, color: BURGUNDY, marginTop: 2, fontWeight: 600 }}>mist: {ingredientLabel(missing[0])}</div>
                  </button>
                ))}
              </div>
              {bijnaAll.length > BIJNA_CAP && (
                <button onClick={() => setBijnaExpanded(v => !v)} style={{
                  width: "100%", marginTop: 10, padding: "9px", borderRadius: RADIUS, border: `1px dashed ${BRASS}`,
                  background: "none", color: BRASS, fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>{bijnaExpanded ? "Toon minder" : `Toon ${bijnaAll.length - BIJNA_CAP} meer`}</button>
              )}
            </div>
          )}

          {bySpirit.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectionLabel>Op basisdrank</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
                {bySpirit.map(({ label, entries }) => (
                  <button key={label} onClick={() => setBrowseGroup({ label, entries })} style={{
                    background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD,
                    padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer",
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", position: "relative" }}><SpiritArt label={label} /></div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: INK, textAlign: "center" }}>{label}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{entries.length} recepten</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {byFamily.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <SectionLabel>Op stijl</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10 }}>
                {byFamily.map(({ label, entries }) => (
                  <button key={label} onClick={() => setBrowseGroup({ label, entries })} style={{
                    background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD,
                    padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer",
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <GlassArt glass={entries[0].recipe.glass} mono size={22} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: INK, textAlign: "center" }}>{label}</div>
                    <div style={{ fontSize: 10, color: MUTED }}>{entries.length} recepten</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {koopadviesAll.length > 0 && (
            <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16, marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <Lightbulb size={15} color={BRASS} />
                <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Koopadvies</span>
              </div>
              <div key={koopadviesExpanded ? "expanded" : "collapsed"} className="accordion-reveal">
                {koopadvies.map(item => (
                  <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: `1px dotted ${BORDER}` }}>
                    <div style={{ fontSize: 13.5, color: INK }}>
                      Koop <strong>{item.label}</strong> en ontgrendel <strong>{item.recipeNames.length} cocktails</strong>
                      <span style={{ color: MUTED }}>
                        : {koopadviesExpanded ? item.recipeNames.join(", ") : item.recipeNames.slice(0, 3).join(", ")}
                        {!koopadviesExpanded && item.recipeNames.length > 3 ? ", …" : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {koopadviesAll.length > 4 && (
                <button onClick={() => setKoopadviesExpanded(v => !v)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%",
                  background: "none", border: "none", borderTop: `1px dotted ${BORDER}`, color: BRASS,
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "9px 0 0", marginTop: 3,
                }}>
                  {koopadviesExpanded
                    ? <>Toon minder <ChevronUp size={13} /></>
                    : <>Bekijk alle {koopadviesAll.length} koopadviezen <ChevronDown size={13} /></>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {view === "alle" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22, alignItems: "center" }}>
            <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} style={selectStyle}>
              <option value="">Alle families</option>
              {families.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={glassFilter} onChange={e => setGlassFilter(e.target.value)} style={selectStyle}>
              <option value="">Alle glazen</option>
              {glasses.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={spiritFilter} onChange={e => setSpiritFilter(e.target.value)} style={selectStyle}>
              <option value="">Alle sterke dranken</option>
              {spirits.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {scored.length === 0 && <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "30px 0" }}>Niets gevonden. Probeer andere filters.</p>}

          <div>
            {scored.map(({ recipe, missing }, idx) => {
              const isOpen = openId === recipe.id;
              return (
                <div key={recipe.id} style={{ borderTop: idx === 0 ? `1px solid ${BORDER}` : "none", borderBottom: `1px solid ${BORDER}` }}>
                  <button onClick={() => setOpenId(isOpen ? null : recipe.id)} style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "none", border: "none", cursor: "pointer", padding: "14px 2px", textAlign: "left"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <GlassArt glass={recipe.glass} mono size={26} />
                      <div>
                        <div style={{ fontFamily: serif, fontWeight: 700, color: INK, fontSize: 16.5 }}>{recipe.name}</div>
                        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>{recipe.family} · {recipe.glass}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <StatusTag missingCount={missing.length} />
                      {isOpen ? <ChevronUp size={17} color={MUTED} /> : <ChevronDown size={17} color={MUTED} />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="accordion-reveal" style={{ padding: "2px 2px 20px" }}>
                      <ul style={{ margin: "0 0 10px", paddingLeft: 0, listStyle: "none", fontSize: 14 }}>
                        {recipe.ingredients.map((ing, i) => (
                          <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: isOwned(ing) ? INK : BURGUNDY, borderBottom: i < recipe.ingredients.length - 1 ? `1px dotted ${BORDER}` : "none" }}>
                            <span>{ingredientLabel(ing)}{ing.optional ? " (optioneel)" : ""}</span>
                            <span style={{ fontWeight: 600 }}>{ing.amount} {unitLabel(ing.unit, ing.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 8px", lineHeight: 1.5 }}>{recipe.method}</p>
                      {recipe.garnish && (
                        <p style={{ fontSize: 13, color: BRASS, margin: "0 0 12px", lineHeight: 1.5 }}><strong>Afwerking:</strong> {recipe.garnish}</p>
                      )}
                      {missing.length > 0 && (
                        justAddedId === recipe.id ? (
                          <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, padding: "7px 0" }}>
                            <Check size={14} strokeWidth={3} /> Toegevoegd: bekijk het Winkelmandje-tabblad
                          </span>
                        ) : (
                          <button onClick={() => addMissing(recipe.id, missing.map(m => ({ ref: m, recipeNames: [recipe.name] })))}
                            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 3, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                            <ShoppingCart size={13} /> Voeg ontbrekende toe aan winkelmandje
                          </button>
                        )
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <button onClick={() => onOpenRecipe(recipe.id)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BORDER}`, color: INK, borderRadius: 3, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          <BookOpen size={13} /> Volledig recept
                        </button>
                        {justAddedFeestId === recipe.id ? (
                          <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, padding: "7px 0" }}>
                            <Check size={13} strokeWidth={3} /> Toegevoegd aan feestplanner
                          </span>
                        ) : (
                          <button onClick={() => addFeest(recipe.id)} disabled={feestChosen?.includes(recipe.id)} style={{
                            display: "flex", alignItems: "center", gap: 6, background: "none",
                            border: `1px solid ${feestChosen?.includes(recipe.id) ? BORDER : BRASS}`,
                            color: feestChosen?.includes(recipe.id) ? MUTED : BRASS, borderRadius: 3, padding: "7px 12px", fontSize: 12.5, fontWeight: 700,
                            cursor: feestChosen?.includes(recipe.id) ? "default" : "pointer",
                          }}>
                            <PartyPopper size={13} /> {feestChosen?.includes(recipe.id) ? "In feestplanner" : "Feestplanner"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sheetEntry && (
        <RecipeSheet recipe={sheetEntry.recipe} missing={sheetEntry.missing} ingredientLabel={ingredientLabel}
          allIngredients={allIngredients} onAddMissing={addMissing} justAdded={justAddedId === sheetEntry.recipe.id}
          onClose={() => setSheetRecipeId(null)} onSound={onSound}
          onOpenFullRecipe={onOpenRecipe} onAddToFeest={onAddToFeest} feestChosen={feestChosen} />
      )}
      {browseGroup && (
        <BrowseSheet label={browseGroup.label} entries={browseGroup.entries} allIngredients={allIngredients}
          onSelect={(id) => { setBrowseGroup(null); setSheetRecipeId(id); }} onClose={() => setBrowseGroup(null)} />
      )}
    </div>
  );
}

function SchalerTab({ recipes, ingredientLabel, allIngredients }) {
  const [recipeId, setRecipeId] = useState(recipes[0]?.id);
  const [servings, setServings] = useState(1);
  const recipe = recipes.find(r => r.id === recipeId) || recipes[0];
  if (!recipe) return <p style={{ color: MUTED }}>Nog geen recepten.</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 240px" }}>
          <SectionLabel>Recept</SectionLabel>
          <RecipePicker recipes={recipes} value={recipe.id} listId="schaler-recipe" onChange={setRecipeId} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
        <div>
          <SectionLabel>Aantal glazen</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setServings(Math.max(1, servings - 1))} style={{ width: 32, height: 32, borderRadius: 3, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" }}>−</button>
            <div style={{ width: 30, textAlign: "center", fontWeight: 700, fontSize: 17, fontFamily: serif, color: BOTTLE }}>{servings}</div>
            <button onClick={() => setServings(Math.min(24, servings + 1))} style={{ width: 32, height: 32, borderRadius: 3, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" }}>+</button>
          </div>
        </div>
      </div>

      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS + 4, boxShadow: SHADOW_CARD, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={48} />
          <div>
            <h3 style={{ margin: 0, fontFamily: serif, fontStyle: "italic", color: INK, fontSize: 21, fontWeight: 700 }}>{recipe.name}</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: MUTED, letterSpacing: 0.3 }}>{recipe.family} · {recipe.glass}</p>
          </div>
        </div>
        {recipe.ingredients.map((ing, idx) => {
          const scaled = scaleAmount(ing.amount, ing.unit, servings);
          return (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: idx === 0 ? "none" : `1px dotted ${BORDER}`, fontSize: 15 }}>
              <span style={{ color: INK }}>{ingredientLabel(ing)}{ing.optional ? " (optioneel)" : ""}</span>
              <span style={{ fontWeight: 700, color: BOTTLE, fontFamily: serif }}>{scaled} {unitLabel(ing.unit, scaled)}</span>
            </div>
          );
        })}
        <p style={{ fontSize: 13.5, color: MUTED, marginTop: 16, lineHeight: 1.5 }}>{recipe.method}</p>
        {recipe.garnish && (
          <p style={{ fontSize: 13, color: BRASS, margin: "6px 0 0", lineHeight: 1.5 }}><strong>Afwerking:</strong> {recipe.garnish}</p>
        )}
      </div>
    </div>
  );
}

function WinkelmandjeTab({ shoppingList, recipes, isOwned, allIngredients, onRemove, onBuy, onClear, onAdd, onSound }) {
  const [customName, setCustomName] = useState("");
  const [justAddedCustom, setJustAddedCustom] = useState(false);
  const ingredientNames = allIngredients.map(i => i.name);

  const addCustom = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    onAdd([{ ref: { name: trimmed }, recipeNames: [] }]);
    onSound("tick");
    setCustomName("");
    setJustAddedCustom(true);
    setTimeout(() => setJustAddedCustom(false), 1800);
  };

  const addForm = (
    <div style={{ marginBottom: 22 }}>
      <form onSubmit={e => { e.preventDefault(); addCustom(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <IngredientAutocomplete value={customName} onChange={setCustomName} options={ingredientNames}
          placeholder="Zelf iets toevoegen, bijv. limoensap" style={{ flex: "1 1 220px" }} />
        <button type="submit" disabled={!customName.trim()} style={{
          display: "flex", alignItems: "center", gap: 6, background: customName.trim() ? BOTTLE : BORDER,
          color: customName.trim() ? CREAM : MUTED, border: "none", borderRadius: RADIUS, padding: "8px 14px",
          fontSize: 13, fontWeight: 700, cursor: customName.trim() ? "pointer" : "default", flexShrink: 0,
        }}>
          <Plus size={14} /> Toevoegen
        </button>
      </form>
      {justAddedCustom && (
        <p className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, margin: "8px 0 0" }}>
          <Check size={14} strokeWidth={3} /> Toegevoegd aan winkelmandje
        </p>
      )}
    </div>
  );

  if (shoppingList.length === 0) {
    return (
      <div>
        {addForm}
        <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "50px 0", lineHeight: 1.6 }}>
          Je winkelmandje is leeg.<br />Voeg ontbrekende ingrediënten toe vanuit "Wat kan ik maken", de Feestplanner, of hierboven zelf.
        </p>
      </div>
    );
  }

  let totalCost = 0;
  const priced = shoppingList.map(item => {
    const meta = item.id ? allIngredients.find(i => i.id === item.id) : null;
    let priceLabel = null, cost = 0;
    if (meta?.bottleMl && meta?.bottlePrice) { cost = meta.bottlePrice; priceLabel = `${euro(cost)} · fles (${meta.bottleMl} ml)`; }
    else if (meta?.unitPrice) { cost = meta.unitPrice; priceLabel = `${euro(cost)} · per stuk`; }
    if (cost) totalCost += cost;
    return { ...item, priceLabel };
  });

  return (
    <div>
      {addForm}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <SectionLabel>{shoppingList.length} item{shoppingList.length === 1 ? "" : "s"} op je lijst</SectionLabel>
        <button onClick={() => { onSound("remove"); onClear(); }} style={{ background: "none", border: "none", color: MUTED, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
          Leegmaken
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {priced.map((item, idx) => {
        const alsoUnlocks = recipes.filter(r => {
          const required = r.ingredients.filter(i => !i.optional);
          const missing = required.filter(i => !isOwned(i));
          return missing.length === 1 && ingredientKey(missing[0]) === item.key;
        }).map(r => r.name).filter(name => !(item.recipes || []).includes(name));
        const meta = item.id ? allIngredients.find(i => i.id === item.id) : allIngredients.find(i => i.name.toLowerCase() === item.label.toLowerCase());
        const artRef = { id: item.id || item.key, name: item.label, cat: meta?.cat || "Vers" };

        return (
          <SwipeToDelete key={item.key} borderRadius={14} onDelete={() => { onSound("remove"); onRemove(item.key); }}>
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0, marginTop: 2 }}><ItemArt ing={artRef} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {item.id && SHOP_LINKS[item.id] ? (
                  <button onClick={() => Browser.open({ url: SHOP_LINKS[item.id] })} title="Bekijk op drankdozijn.nl, goedkoopste eerst"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: serif, fontWeight: 700, color: BOTTLE, fontSize: 16, textDecoration: "none", borderBottom: `1px dotted ${BOTTLE}` }}>
                    {item.label} <ExternalLink size={13} style={{ flexShrink: 0 }} />
                  </button>
                ) : (
                  <div style={{ fontFamily: serif, fontWeight: 700, color: INK, fontSize: 16 }}>{item.label}</div>
                )}
                {item.priceLabel && <div style={{ fontSize: 12.5, color: BOTTLE, fontWeight: 600, marginTop: 3 }}>{item.priceLabel}</div>}
                {item.recipes && item.recipes.length > 0 && (
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>Toegevoegd voor: {item.recipes.join(", ")}</div>
                )}
                {alsoUnlocks.length > 0 && (
                  <div style={{ fontSize: 12.5, color: BRASS, marginTop: 2 }}>Ontgrendelt ook: {alsoUnlocks.slice(0, 4).join(", ")}{alsoUnlocks.length > 4 ? ", …" : ""}</div>
                )}
              </div>
              <button onClick={() => { onSound("remove"); onRemove(item.key); }} title="Verwijder" className="tap-target-44" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}>
                <X size={16} color={MUTED} />
              </button>
            </div>
            {item.id && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={() => { onSound("tick"); onBuy(item); }} title="Zet in voorraad" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${SAGE}`, color: SAGE, borderRadius: 3, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <Check size={13} strokeWidth={3} /> In voorraad
                </button>
              </div>
            )}
          </div>
          </SwipeToDelete>
        );
      })}
      </div>
      {totalCost > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 2px 4px", fontSize: 16 }}>
          <span style={{ fontFamily: serif, fontWeight: 700, color: INK }}>Geschatte totaal</span>
          <span style={{ fontFamily: serif, fontWeight: 700, color: BOTTLE }}><AnimatedNumber value={totalCost} format={euro} /></span>
        </div>
      )}
      <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 0", lineHeight: 1.5 }}>
        Richtprijzen o.b.v. drankdozijn.nl ({PRICES_UPDATED}), per fles of stuk, geen live koppeling.
      </p>
    </div>
  );
}

function VerhaalTab({ recipes, ingredientLabel, allIngredients, isOwned, recentRecipeIds, onViewRecipe, favoriteRecipeIds, onToggleFavorite, onSound,
  openRecipeId, onOpenRecipeHandled, onAddToShoppingList, onAddToFeest, feestChosen, onOpenCheckin }) {
  const [selectedId, setSelectedId] = useState(null);
  const [openTech, setOpenTech] = useState(null);
  const [recipeView, setRecipeView] = useState("steps");
  const [servings, setServings] = useState(1);
  const [justAddedShopping, setJustAddedShopping] = useState(false);
  const [justAddedFeest, setJustAddedFeest] = useState(false);
  const recipe = recipes.find(r => r.id === selectedId) || null;
  const missing = recipe ? recipe.ingredients.filter(ing => !ing.optional).filter(ing => !isOwned(ing)) : [];
  const role = recipe ? getMenuRole(recipe) : null;
  const roleInfo = role ? MENU_ROLES[role] : null;
  const techniques = recipe ? inferTechniques(recipe.method) : [];
  const garnishes = recipe ? inferGarnishes(recipe, allIngredients) : null;
  const steps = recipe ? (STEPS[recipe.id] || splitMethodIntoSteps(recipe.method)) : [];
  const story = recipe
    ? (STORIES[recipe.id] || `Nog geen verhaal bekend over deze cocktail: een ${(recipe.family || "eigen creatie").toLowerCase()} op basis van ${recipe.ingredients[0] ? ingredientLabel(recipe.ingredients[0]) : "jouw eigen ingrediënten"}. Schrijf zelf de anekdote erbij als je 'm serveert!`)
    : null;
  const canBatchAhead = recipe && role === "sterk" && techniques.length > 0 && techniques.every(t => ["stirred", "build"].includes(t));

  const selectRecipe = (id) => {
    setSelectedId(id);
    setOpenTech(null);
    setRecipeView("steps");
    onViewRecipe(id);
  };
  const verrasMe = () => {
    if (recipes.length === 0) return;
    onSound("shuffle");
    selectRecipe(recipes[Math.floor(Math.random() * recipes.length)].id);
  };

  // Van buitenaf (Maken, Check-in "aanbevolen") direct naar dit recept
  // gestuurd worden: openRecipeId komt binnen, we selecteren 'm en melden
  // meteen terug dat 'ie verwerkt is (anders blijft dezelfde waarde staan en
  // vuurt een tweede klik op hetzelfde recept niet opnieuw).
  useEffect(() => {
    if (openRecipeId) {
      selectRecipe(openRecipeId);
      onOpenRecipeHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecipeId]);

  const addMissingToShopping = () => {
    if (!recipe || missing.length === 0) return;
    onAddToShoppingList(missing.map(m => ({ ref: m, recipeNames: [recipe.name] })));
    onSound("tick");
    setJustAddedShopping(true);
    setTimeout(() => setJustAddedShopping(false), 1800);
  };
  const addToFeestplanner = () => {
    if (!recipe) return;
    onAddToFeest(recipe.id);
    onSound("chime");
    setJustAddedFeest(true);
    setTimeout(() => setJustAddedFeest(false), 1800);
  };

  // Ontdekken: alleen relevant zolang er nog niets gekozen is, dus geen reden
  // om dit bij elke toets-aanslag in de zoekbalk opnieuw te berekenen.
  const allScored = useMemo(() => {
    if (recipe) return [];
    return recipes.map(r => {
      const required = r.ingredients.filter(i => !i.optional);
      return { recipe: r, missing: required.filter(i => !isOwned(i)) };
    });
  }, [recipes, isOwned, recipe]);
  const scoredById = useMemo(() => new Map(allScored.map(s => [s.recipe.id, s])), [allScored]);

  // "Van de dag" wint als vandaag in de kalender staat; anders "van de week".
  // De hoofdreden komt nu uit het seizoensthema van de huidige maand (waarom
  // hoort DEZE stijl cocktail in DEZE week thuis), voorraad is alleen nog een
  // praktisch naschrift in plaats van de hele reden.
  const occasion = useMemo(() => (recipe ? null : getTodayOccasion()), [recipe]);
  const weeklyPick = useMemo(() => {
    if (recipe || allScored.length === 0) return null;
    const theme = MONTH_THEMES[new Date().getMonth()];
    const inTheme = allScored.filter(s => theme.families.includes(s.recipe.family));
    const themePool = inTheme.length > 0 ? inTheme : allScored;
    const bijna = themePool.filter(s => s.missing.length <= 1);
    const pool = bijna.length > 0 ? bijna : themePool;
    const pick = pool[getIsoWeekSeed() % pool.length];
    let reason = theme.reason(pick.recipe.name);
    if (pick.missing.length === 1) reason += ` Je mist er trouwens nog maar één ding voor: ${ingredientLabel(pick.missing[0])}.`;
    else if (pick.missing.length === 0) reason += ` Je hebt gelukkig alles al in huis.`;
    return { recipe: pick.recipe, reason };
  }, [allScored, recipe, ingredientLabel]);
  const featured = useMemo(() => {
    if (occasion) {
      const r = recipes.find(x => x.id === occasion.recipeId);
      if (r) return { recipe: r, badge: `${occasion.emoji} ${occasion.label}`, reason: occasion.reason };
    }
    return weeklyPick ? { recipe: weeklyPick.recipe, badge: "Cocktail van de week", reason: weeklyPick.reason } : null;
  }, [occasion, weeklyPick, recipes]);

  return (
    <div>
      <SectionLabel>Kies een cocktail</SectionLabel>
      <div style={{ marginBottom: 24 }}>
        <RecipePicker recipes={recipes} value={selectedId} listId="verhaal-recipe" onChange={selectRecipe} style={{ width: "100%", boxSizing: "border-box" }} />
      </div>

      {!recipe && (
        <div>
          {featured && (
            <button onClick={() => selectRecipe(featured.recipe.id)} style={{
              width: "100%", textAlign: "left", border: "none", cursor: "pointer", borderRadius: RADIUS + 4,
              padding: "20px 22px", marginBottom: 24, position: "relative", overflow: "hidden", boxSizing: "border-box",
              background: `linear-gradient(135deg, ${MENU_ROLES[getMenuRole(featured.recipe)].gradient[0]}, ${MENU_ROLES[getMenuRole(featured.recipe)].gradient[1]})`,
              boxShadow: SHADOW_HERO, color: CREAM, fontFamily: sans,
            }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 100, padding: "4px 12px", fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
                {featured.badge}
              </div>
              <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>{featured.recipe.name}</div>
              <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 10 }}>{featured.recipe.family} · {featured.recipe.glass}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.92, maxWidth: 420 }}>{featured.reason}</div>
            </button>
          )}

          {recentRecipeIds.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectionLabel>Onlangs bekeken</SectionLabel>
              <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
                {recentRecipeIds.map(id => scoredById.get(id)).filter(Boolean).map(({ recipe: r }) => (
                  <button key={r.id} onClick={() => selectRecipe(r.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, width: 62, background: "none", border: "none", cursor: "pointer", fontFamily: sans }}>
                    <RecipeCircle recipe={r} allIngredients={allIngredients} size={54} />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: INK, textAlign: "center", lineHeight: 1.25 }}>{r.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {favoriteRecipeIds.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <SectionLabel>Favorieten</SectionLabel>
                <span style={{ fontSize: 12, color: MUTED }}>{favoriteRecipeIds.length} bewaard</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 12 }}>
                {favoriteRecipeIds.map(id => scoredById.get(id)).filter(Boolean).map(({ recipe: r }) => (
                  <button key={r.id} onClick={() => selectRecipe(r.id)} style={{
                    background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD,
                    padding: "12px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", fontFamily: sans,
                  }}>
                    <div style={{ marginBottom: 8 }}><RecipeCircle recipe={r} allIngredients={allIngredients} /></div>
                    <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: INK, textAlign: "center" }}>{r.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={verrasMe} style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: "none", cursor: "pointer",
            borderRadius: 16, padding: "16px 18px", marginBottom: 24, background: `linear-gradient(150deg, #2C5148, ${BOTTLE_DARK})`,
            color: CREAM, boxShadow: SHADOW_CARD, fontFamily: sans, boxSizing: "border-box",
          }}>
            <Shuffle size={22} />
            <div><div style={{ fontSize: 14.5, fontWeight: 800 }}>Verras me</div><div style={{ fontSize: 11.5, opacity: 0.82 }}>Ontdek een willekeurige cocktail</div></div>
          </button>
        </div>
      )}

      {recipe && (
        <EdgeSwipeBackArea key={recipe.id} onBack={() => setSelectedId(null)}>
          <button onClick={() => setSelectedId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 16, fontFamily: sans }}>
            <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Terug naar ontdekken
          </button>

          {(() => { const heroPhoto = localItemImageUrl("cocktail", recipe.id) || recipe.image; return (
          <div style={{
            borderRadius: RADIUS + 4, padding: heroPhoto ? "0" : "26px 26px", marginBottom: 24, position: "relative", overflow: "hidden",
            background: heroPhoto ? INK : `linear-gradient(135deg, ${roleInfo.gradient[0]}, ${roleInfo.gradient[1]})`, boxShadow: SHADOW_HERO,
            minHeight: heroPhoto ? 240 : undefined,
            display: "flex", alignItems: heroPhoto ? "flex-end" : "center", gap: 20, flexWrap: "wrap"
          }}>
            {heroPhoto ? (
              <>
                <img src={heroPhoto} alt="" style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
                  filter: RECIPE_PHOTO_FILTER,
                }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,16,12,0.05) 0%, rgba(20,16,12,0.15) 40%, rgba(20,16,12,0.82) 100%)" }} />
              </>
            ) : (
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 500px 260px at 100% 0%, rgba(255,255,255,0.14), transparent 60%)", pointerEvents: "none" }} />
            )}
            <button onClick={() => { onSound("pop"); onToggleFavorite(recipe.id); }} aria-label={favoriteRecipeIds.includes(recipe.id) ? "Verwijder uit favorieten" : "Bewaar als favoriet"} style={{
              position: "absolute", top: 16, right: 16, zIndex: 2, width: 36, height: 36, borderRadius: "50%", padding: 0,
              border: "1px solid rgba(255,255,255,0.35)", background: favoriteRecipeIds.includes(recipe.id) ? BURGUNDY : "rgba(255,255,255,0.16)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: CREAM,
            }}>
              <Heart size={16} fill={favoriteRecipeIds.includes(recipe.id) ? CREAM : "none"} />
            </button>
            <div style={{ flex: "1 1 260px", position: "relative", zIndex: 1, padding: heroPhoto ? "26px" : 0 }}>
              <div className="hero-text-in" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 8, animationDelay: "0.1s" }}>{roleInfo.label}</div>
              <h2 className="hero-text-in" style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: "0 0 6px", animationDelay: "0.18s" }}>{recipe.name}</h2>
              <div className="hero-text-in" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 16, animationDelay: "0.26s" }}>{recipe.family} · {recipe.glass}</div>
              <p className="hero-text-in" style={{ fontFamily: serif, fontStyle: "italic", fontSize: 15.5, color: CREAM, margin: 0, lineHeight: 1.5, animationDelay: "0.36s" }}>"{getSfeerQuote(recipe, role)}"</p>
            </div>
            {!heroPhoto && (
              <div className="glass-bounce-in" style={{ position: "relative", zIndex: 1, margin: "0 auto" }}>
                <GlassArt glass={recipe.glass} colors={getLiquidColor(recipe, allIngredients)} garnishes={garnishes} rim={inferRim(recipe, allIngredients)} foam={inferFoam(recipe, allIngredients)} iceStyle={inferIceStyle(recipe)} plinth dropIn ambient size={168} />
              </div>
            )}
          </div>
          ); })()}

          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Het verhaal</SectionLabel>
            <p style={{ fontFamily: serif, fontSize: 15.5, color: INK, lineHeight: 1.75, margin: 0, maxWidth: 640 }}>{story}</p>
          </div>

          {techniques.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <SectionLabel>Techniek</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {techniques.map(t => (
                  <button key={t} onClick={() => setOpenTech(openTech === t ? null : t)}
                    style={{ background: openTech === t ? BOTTLE : "none", color: openTech === t ? CREAM : BOTTLE, border: `1px solid ${BOTTLE}`, borderRadius: RADIUS, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    {TECHNIQUE_GUIDE[t].label}
                  </button>
                ))}
              </div>
              {openTech && techniques.includes(openTech) && (
                <div key={openTech} className="accordion-reveal" style={{ maxWidth: 400 }}>
                  <TechniqueAnimation technique={openTech} />
                  <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, margin: 0 }}>{TECHNIQUE_GUIDE[openTech].tip}</p>
                </div>
              )}
            </div>
          )}

          {canBatchAhead && (
            <div style={{ marginBottom: 22, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
              <p style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.5 }}>
                <strong>Batch-tip:</strong> geen vers sap, ei of zuivel, en gestirred of gebouwd: je kunt 'm vooraf mixen (zonder ijs) en gekoeld bewaren tot het feest.
              </p>
            </div>
          )}

          {GIN_STYLE_TIPS[recipe.id] && (
            <div style={{ marginBottom: 22, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${BRASS}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
              <p style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.5 }}>
                <strong>Welke gin?</strong> {GIN_STYLE_TIPS[recipe.id]}
              </p>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
            <SectionLabel>Ingrediënten &amp; bereiding</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: MUTED }}>Aantal glazen</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setServings(s => Math.max(1, s - 1))} style={{ width: 26, height: 26, borderRadius: 3, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>−</button>
                <div style={{ width: 20, textAlign: "center", fontWeight: 700, fontSize: 14.5, fontFamily: serif, color: BOTTLE }}>{servings}</div>
                <button onClick={() => setServings(s => Math.min(24, s + 1))} style={{ width: 26, height: 26, borderRadius: 3, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>+</button>
              </div>
            </div>
          </div>
          <ul style={{ margin: "0 0 14px", paddingLeft: 0, listStyle: "none", fontSize: 15.5 }}>
            {recipe.ingredients.map((ing, i) => {
              const scaled = scaleAmount(ing.amount, ing.unit, servings);
              return (
                <li key={i} className="ingredient-reveal" style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < recipe.ingredients.length - 1 ? `1px dotted ${BORDER}` : "none", animationDelay: `${0.44 + Math.min(i, 8) * 0.05}s` }}>
                  <span>{ingredientLabel(ing)}{ing.optional ? " (optioneel)" : ""}</span>
                  <span style={{ fontWeight: 700, color: BOTTLE, fontFamily: serif }}>{scaled} {unitLabel(ing.unit, scaled)}</span>
                </li>
              );
            })}
          </ul>
          {servings > 1 && (
            <p style={{ fontSize: 12, color: MUTED, margin: "-8px 0 14px", lineHeight: 1.5 }}>
              Hoeveelheden zijn geschaald voor {servings} glazen, ook in de bereiding hieronder.
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {onOpenCheckin && (
              <button onClick={() => { onSound("pop"); onOpenCheckin(recipe.name); }} style={{
                display: "flex", alignItems: "center", gap: 6, background: BOTTLE, color: CREAM,
                border: "none", borderRadius: 3, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              }}>
                <Plus size={14} /> Inchecken
              </button>
            )}
            {missing.length > 0 && (
              justAddedShopping ? (
                <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, padding: "9px 2px" }}>
                  <Check size={14} strokeWidth={3} /> Toegevoegd aan winkelmandje
                </span>
              ) : (
                <button onClick={addMissingToShopping} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 3, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <ShoppingCart size={14} /> {missing.length} ontbrekende toevoegen
                </button>
              )
            )}
            {justAddedFeest ? (
              <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, padding: "9px 2px" }}>
                <Check size={14} strokeWidth={3} /> Toegevoegd aan feestplanner
              </span>
            ) : (
              <button onClick={addToFeestplanner} disabled={feestChosen?.includes(recipe.id)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "none",
                border: `1px solid ${feestChosen?.includes(recipe.id) ? BORDER : BRASS}`,
                color: feestChosen?.includes(recipe.id) ? MUTED : BRASS, borderRadius: 3, padding: "9px 13px", fontSize: 12.5, fontWeight: 700,
                cursor: feestChosen?.includes(recipe.id) ? "default" : "pointer",
              }}>
                <PartyPopper size={14} /> {feestChosen?.includes(recipe.id) ? "Al in feestplanner" : "Voeg toe aan feestplanner"}
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS + 3, marginBottom: 16 }}>
            {[["steps", "Stap voor stap"], ["full", "Volledig recept"]].map(([key, label]) => (
              <button key={key} onClick={() => setRecipeView(key)}
                style={{
                  flex: 1, border: "none", borderRadius: RADIUS, padding: "9px 10px", fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                  background: recipeView === key ? CREAM : "none", color: recipeView === key ? BOTTLE : MUTED,
                  boxShadow: recipeView === key ? SHADOW_CARD : "none",
                }}>
                {label}
              </button>
            ))}
          </div>

          {recipeView === "steps" ? (
            <div>
              {steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < steps.length - 1 || recipe.garnish ? 20 : 0 }}>
                  <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: PAPER,
                      color: BOTTLE, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 12,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{i + 1}</div>
                    {(i < steps.length - 1 || recipe.garnish) && <div style={{ flex: 1, width: 1, background: BORDER, marginTop: 4 }} />}
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, marginBottom: 3 }}>Stap {i + 1} van {steps.length}</div>
                    <p style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>{highlightIngredientMentions(scaleStepText(step, servings), recipe, allIngredients)}</p>
                  </div>
                </div>
              ))}
              {recipe.garnish && (
                <div style={{ display: "flex", gap: 14 }}>
                  <div style={{ flex: "0 0 auto" }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: BRASS,
                      color: CREAM, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 12,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>✓</div>
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: BRASS, marginBottom: 3 }}>Afwerking</div>
                    <p style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>{highlightIngredientMentions(scaleStepText(recipe.garnish, servings), recipe, allIngredients)}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 15, color: INK, lineHeight: 1.7, margin: 0 }}>{scaleStepText(recipe.method, servings)}</p>
              {recipe.garnish && (
                <p style={{ fontSize: 14, color: BRASS, lineHeight: 1.6, margin: "10px 0 0" }}><strong>Afwerking:</strong> {scaleStepText(recipe.garnish, servings)}</p>
              )}
            </div>
          )}
        </EdgeSwipeBackArea>
      )}
    </div>
  );
}

function LessonBlock({ block }) {
  if (block.type === "h3") return <h3 style={{ fontFamily: serif, fontSize: 16.5, color: BOTTLE, margin: "20px 0 8px" }}>{block.text}</h3>;
  if (block.type === "p") return <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.7, margin: "0 0 12px" }}>{block.text}</p>;
  if (block.type === "table") {
    return (
      <div style={{ overflowX: "auto", margin: "12px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{block.headers.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "6px 8px", fontFamily: sans, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: BRASS, borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: "6px 8px", borderBottom: `1px solid ${BORDER}`, color: INK }}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.type === "box") {
    const colors = { tip: SAGE, warning: BURGUNDY, history: BRASS }[block.kind] || BRASS;
    return (
      <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${colors}`, borderRadius: RADIUS, padding: "12px 15px", margin: "14px 0" }}>
        <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: colors, marginBottom: 5 }}>{block.label}</div>
        <p style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.55 }}>{block.text}</p>
      </div>
    );
  }
  if (block.type === "technique-demo") {
    return <div style={{ margin: "6px 0 16px", maxWidth: 340 }}><TechniqueAnimation technique={block.technique} /></div>;
  }
  return null;
}

function QuizBlock({ quiz, onFinish }) {
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);

  const score = quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
  const allAnswered = quiz.every((_, i) => answers[i] !== undefined);
  const passed = score / quiz.length >= 0.7;

  const check = () => { setChecked(true); onFinish(score); };
  const retry = () => { setAnswers({}); setChecked(false); };

  return (
    <div style={{ marginTop: 8 }}>
      {quiz.map((q, i) => (
        <div key={i} style={{ marginBottom: 22 }}>
          <p style={{ fontWeight: 700, fontFamily: serif, fontSize: 15, color: INK, margin: "0 0 10px" }}>{i + 1}. {q.q}</p>
          {q.options.map((opt, oi) => {
            const isSelected = answers[i] === oi;
            const isCorrect = oi === q.correct;
            let border = BORDER, bg = "transparent";
            if (checked) {
              if (isCorrect) { border = SAGE; bg = "rgba(92,122,82,0.14)"; }
              else if (isSelected) { border = BURGUNDY; bg = "rgba(122,46,42,0.08)"; }
            } else if (isSelected) { border = BRASS; bg = "rgba(184,134,46,0.08)"; }
            return (
              <button key={oi} disabled={checked} onClick={() => setAnswers(prev => ({ ...prev, [i]: oi }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 13px", marginBottom: 7,
                  borderRadius: RADIUS, border: `1.5px solid ${border}`, background: bg, cursor: checked ? "default" : "pointer",
                  fontSize: 13.5, fontFamily: sans, color: INK, boxSizing: "border-box",
                }}>
                {checked && isCorrect && <Check size={14} color={SAGE} strokeWidth={3} />}
                {checked && isSelected && !isCorrect && <X size={14} color={BURGUNDY} strokeWidth={3} />}
                {opt}
              </button>
            );
          })}
          {checked && <p className="accordion-reveal" style={{ fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>{q.explain}</p>}
        </div>
      ))}

      {!checked ? (
        <button onClick={check} disabled={!allAnswered}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: allAnswered ? BOTTLE : BORDER, color: allAnswered ? CREAM : MUTED,
            border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700,
            cursor: allAnswered ? "pointer" : "default", boxShadow: allAnswered ? SHADOW_CTA : "none",
          }}>
          <Check size={15} /> Controleer antwoorden
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div className={passed ? "success-pop" : undefined} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: RADIUS,
            background: passed ? "rgba(92,122,82,0.14)" : "rgba(122,46,42,0.08)", border: `1px solid ${passed ? SAGE : BURGUNDY}`,
          }}>
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: passed ? SAGE : BURGUNDY }}>{score}/{quiz.length}</span>
            <span style={{ fontSize: 12.5, color: INK }}>{passed ? "Geslaagd, mooi gedaan!" : "Nog niet geslaagd, probeer het nog eens."}</span>
          </div>
          <button onClick={retry} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${MUTED}`, color: MUTED, borderRadius: RADIUS, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            <RotateCcw size={13} /> Opnieuw proberen
          </button>
        </div>
      )}
    </div>
  );
}

function LessonView({ lesson, progress, onBack, onComplete, nextLesson, onGoToLesson, onGoToExam }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  return (
    <EdgeSwipeBackArea onBack={onBack}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, fontFamily: sans }}>
        <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Terug naar overzicht
      </button>

      {lesson.image && (
        <div style={{ position: "relative", height: 168, borderRadius: RADIUS + 6, overflow: "hidden", marginBottom: 20, boxShadow: SHADOW_HERO, border: `1px solid ${BORDER}`, borderBottom: `3px solid ${BRASS}` }}>
          <img src={lesson.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, rgba(19,38,34,0.75), rgba(19,38,34,0.05) 60%)` }} />
          <div style={{ position: "absolute", left: 16, bottom: 12, fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#D9CBAE" }}>
            Les {lesson.number} &middot; {COURSE_PARTS.find(p => p.id === lesson.part)?.title}
          </div>
        </div>
      )}
      {!lesson.image && (
        <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: BRASS, marginBottom: 6 }}>
          Les {lesson.number} &middot; {COURSE_PARTS.find(p => p.id === lesson.part)?.title}
        </div>
      )}
      <h2 style={{ fontFamily: serif, fontSize: 27, fontWeight: 700, fontStyle: "italic", color: INK, margin: "0 0 14px" }}>{lesson.title}</h2>
      <p style={{ fontStyle: "italic", color: MUTED, fontSize: 14, borderLeft: `3px solid ${BRASS}`, paddingLeft: 14, margin: "0 0 22px", lineHeight: 1.55 }}>{lesson.intro}</p>

      {lesson.blocks.map((b, i) => <LessonBlock key={i} block={b} />)}

      <div style={{ marginTop: 24, marginBottom: 24, background: BOTTLE, color: CREAM, borderRadius: RADIUS, padding: "16px 18px", boxShadow: SHADOW_CARD }}>
        <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#D8CFA0", marginBottom: 8 }}>Kernpunten van deze les</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {lesson.takeaways.map((t, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 5, lineHeight: 1.5 }}>{t}</li>)}
        </ul>
      </div>

      <SectionLabel>Toets &middot; {lesson.quiz.length} vragen</SectionLabel>
      {!showQuiz ? (
        <button onClick={() => setShowQuiz(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
          <GraduationCap size={16} /> Start de toets
        </button>
      ) : (
        <QuizBlock quiz={lesson.quiz} onFinish={(score) => { onComplete(score, lesson.quiz.length); setQuizDone(true); }} />
      )}

      {quizDone && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
          {nextLesson ? (
            <button onClick={() => onGoToLesson(nextLesson.id)} style={{ display: "flex", alignItems: "center", gap: 8, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
              Volgende les &middot; {nextLesson.title} <ChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
            </button>
          ) : (
            <button onClick={onGoToExam} style={{ display: "flex", alignItems: "center", gap: 8, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "12px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
              <GraduationCap size={16} /> Laatste les gehad &middot; naar de eindtoets
            </button>
          )}
        </div>
      )}
    </EdgeSwipeBackArea>
  );
}

function FinalExamView({ progress, onBack, onComplete }) {
  const [started, setStarted] = useState(false);

  return (
    <EdgeSwipeBackArea onBack={onBack}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, fontFamily: sans }}>
        <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Terug naar overzicht
      </button>

      <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: BRASS, marginBottom: 6 }}>Eindtoets</div>
      <h2 style={{ fontFamily: serif, fontSize: 27, fontWeight: 700, fontStyle: "italic", color: INK, margin: "0 0 14px" }}>Van Basis tot Pro</h2>
      <p style={{ fontStyle: "italic", color: MUTED, fontSize: 14, borderLeft: `3px solid ${BRASS}`, paddingLeft: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
        30 vragen, verspreid over alle zes delen: geschiedenis tot en met geavanceerde technieken. Dit is dezelfde stof als de lessen, maar door elkaar en net iets anders gevraagd, om te checken of de kennis ook echt beklijft.
      </p>

      {progress?.completed && !started && (
        <div style={{ marginBottom: 20, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
          <p style={{ fontSize: 13.5, color: INK, margin: 0 }}>
            Je beste score tot nu toe: <strong>{progress.bestScore}/{progress.total}</strong>.
          </p>
        </div>
      )}

      {!started ? (
        <button onClick={() => setStarted(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
          <GraduationCap size={16} /> {progress?.completed ? "Nog een keer proberen" : "Start de eindtoets"}
        </button>
      ) : (
        <QuizBlock quiz={FINAL_EXAM} onFinish={(score) => onComplete(score, FINAL_EXAM.length)} />
      )}
    </EdgeSwipeBackArea>
  );
}

function CursusTab({ progress, setProgress, onSound }) {
  const [selectedId, setSelectedId] = useState(null);
  const [examOpen, setExamOpen] = useState(false);
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const lesson = COURSE_LESSONS.find(l => l.id === selectedId) || null;
  const totalLessons = COURSE_LESSONS.length;
  const completedCount = COURSE_LESSONS.filter(l => progress[l.id]?.completed).length;
  const allLessonsDone = completedCount === totalLessons;
  const examProgress = progress.eindtoets;
  const courseInsights = useMemo(() => computeCourseInsights(progress), [progress]);

  // Zelfde fanfare-op-echte-mijlpaal-truc als bij Check-in: alleen geluid als
  // het niveau of een badge daadwerkelijk verandert door het net afronden van
  // een les/toets, niet bij elke render.
  const prevCourseLevelRef = useRef(null);
  const prevCourseBadgesRef = useRef(null);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    const unlockedIds = new Set(courseInsights.badges.filter(b => b.unlocked).map(b => b.id));
    if (prevCourseLevelRef.current !== null && justCompleted) {
      if (courseInsights.level.level > prevCourseLevelRef.current) {
        setTimeout(() => onSound("levelup"), 400);
      } else {
        const newlyUnlocked = [...unlockedIds].some(id => !prevCourseBadgesRef.current.has(id));
        if (newlyUnlocked) setTimeout(() => onSound("unlock"), 400);
      }
    }
    prevCourseLevelRef.current = courseInsights.level.level;
    prevCourseBadgesRef.current = unlockedIds;
  }, [courseInsights.level.level, courseInsights.badges, justCompleted]);

  const complete = (lessonId, score, total) => {
    const prev = progress[lessonId];
    setProgress({ ...progress, [lessonId]: { completed: true, bestScore: Math.max(score, prev?.bestScore ?? 0), total } });
    if (score / total >= 0.7) onSound("chime");
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 3000);
  };

  if (examOpen) {
    return (
      <FinalExamView progress={examProgress} onBack={() => setExamOpen(false)}
        onComplete={(score, total) => complete("eindtoets", score, total)} />
    );
  }

  if (lesson) {
    const lessonIndex = COURSE_LESSONS.findIndex(l => l.id === lesson.id);
    const nextLesson = COURSE_LESSONS[lessonIndex + 1] || null;
    return (
      <LessonView key={lesson.id} lesson={lesson} progress={progress[lesson.id]}
        onBack={() => setSelectedId(null)}
        onComplete={(score, total) => complete(lesson.id, score, total)}
        nextLesson={nextLesson}
        onGoToLesson={setSelectedId}
        onGoToExam={() => { setSelectedId(null); setExamOpen(true); }} />
    );
  }

  return (
    <div>
      <p style={{ color: MUTED, fontSize: 14, marginBottom: 20, maxWidth: 600, lineHeight: 1.55 }}>
        Van basis tot pro in vierentwintig lessen: geschiedenis, ingrediënten, techniek, smaak, het vak van bartender en geavanceerde technieken.
        Elke les sluit af met een korte toets om te checken of de kennis blijft hangen.
      </p>

      <div style={{
        marginBottom: 20, borderRadius: RADIUS + 4, padding: "18px 20px", position: "relative", overflow: "hidden",
        background: `radial-gradient(ellipse 500px 220px at 15% -20%, #2A4B42, ${BOTTLE_DARK} 75%)`, boxShadow: SHADOW_HERO,
      }}>
        <div style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS, marginBottom: 4 }}>
          Niveau {courseInsights.level.level}
        </div>
        <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 22, color: CREAM, marginBottom: 10 }}>
          {courseInsights.level.title}
        </div>
        <div style={{ height: 8, background: "rgba(255,255,255,0.18)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${courseInsights.level.progress * 100}%`, height: "100%", background: `linear-gradient(90deg, ${BRASS}, #D8AF5C)`, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ fontSize: 11, color: "#B9C4B9", marginTop: 6 }}>
          {courseInsights.level.to ? `${courseInsights.xp} / ${courseInsights.level.to} XP` : `${courseInsights.xp} XP · hoogste niveau bereikt`}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Badges</SectionLabel>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {courseInsights.badges.map(b => (
            <button key={b.id} onClick={() => setActiveBadgeId(b.id)} style={{
              border: "none", background: "none", padding: 0, margin: 0, cursor: "pointer", width: 68, flexShrink: 0,
              color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <div style={{
                position: "relative", width: 52, height: 52, borderRadius: "50%",
                background: b.unlocked ? `linear-gradient(150deg, #2C5148, ${BOTTLE_DARK})` : PAPER_DEEP,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: b.unlocked ? SHADOW_CARD : "none",
                border: b.unlocked ? `2px solid ${BRASS}` : `1.5px dashed ${BORDER}`,
              }}>
                <span style={{ fontSize: 20, opacity: b.unlocked ? 1 : 0.4, filter: b.unlocked ? "none" : "grayscale(1)" }}>{b.emoji}</span>
                {!b.unlocked && (
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 17, height: 17, borderRadius: "50%", background: CREAM, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Lock size={8} color={MUTED} strokeWidth={2.6} />
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9.5, textAlign: "center", lineHeight: 1.2, color: b.unlocked ? "#5C5548" : "#ABA18F", fontWeight: 600 }}>{b.label}</span>
            </button>
          ))}
        </div>
        {(() => {
          const activeBadge = courseInsights.badges.find(b => b.id === activeBadgeId) || courseInsights.badges.find(b => b.unlocked) || courseInsights.badges[0];
          return (
            <div style={{ marginTop: 12, padding: "11px 13px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>{activeBadge.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{activeBadge.label}{!activeBadge.unlocked && " (nog niet ontgrendeld)"}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{activeBadge.text}</div>
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ marginBottom: 24, padding: "16px 18px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Jouw voortgang</span>
          <span style={{ fontSize: 13, color: INK, fontWeight: 700, fontFamily: serif }}><AnimatedNumber value={completedCount} /> / {totalLessons} lessen</span>
        </div>
        <div style={{ height: 8, background: BORDER, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${(completedCount / totalLessons) * 100}%`, height: "100%", background: BOTTLE, transition: "width 0.3s ease" }} />
        </div>
      </div>

      {COURSE_PARTS.map(part => {
        const lessons = COURSE_LESSONS.filter(l => l.part === part.id);
        return (
          <div key={part.id} style={{ marginBottom: 26 }}>
            <SectionLabel>{part.subtitle} &middot; {part.title}</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lessons.map(l => {
              const p = progress[l.id];
              return (
                <button key={l.id} onClick={() => setSelectedId(l.id)} style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
                  background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, cursor: "pointer", padding: "12px 14px", boxSizing: "border-box",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    {l.image && <img src={l.image} alt="" loading="lazy" style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      background: p?.completed ? SAGE : "transparent", border: `1.5px solid ${p?.completed ? SAGE : BORDER}`,
                    }}>
                      {p?.completed ? <Check size={14} color="#FBF6EA" strokeWidth={3} /> : <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, fontFamily: serif }}>{l.number}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: serif, fontWeight: 700, color: INK, fontSize: 15.5 }}>{l.title}</div>
                      {p && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>Beste score: {p.bestScore}/{p.total}</div>}
                    </div>
                  </div>
                  <ChevronDown size={16} color={MUTED} style={{ transform: "rotate(-90deg)", flexShrink: 0 }} />
                </button>
              );
            })}
            </div>
          </div>
        );
      })}

      <div style={{
        marginTop: 10, padding: "20px 22px", borderRadius: RADIUS + 2, boxShadow: SHADOW_HERO,
        background: `linear-gradient(135deg, ${BOTTLE}, #8A6A2F)`, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 400px 200px at 100% 0%, rgba(255,255,255,0.14), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>
            {allLessonsDone ? "Alle lessen voltooid" : `${totalLessons - completedCount} les${totalLessons - completedCount === 1 ? "" : "sen"} nog te gaan`}
          </div>
          <h3 style={{ fontFamily: serif, fontSize: 21, fontWeight: 700, fontStyle: "italic", color: CREAM, margin: "0 0 8px" }}>Eindtoets: Van Basis tot Pro</h3>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.9)", margin: "0 0 16px", lineHeight: 1.5, maxWidth: 480 }}>
            30 vragen door elkaar over alle zes delen. {examProgress?.completed ? `Beste score: ${examProgress.bestScore}/${examProgress.total}.` : "Mag altijd, ook als je nog niet alle lessen hebt afgerond."}
          </p>
          <button onClick={() => setExamOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: CREAM, color: BOTTLE, border: "none", borderRadius: RADIUS, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            <GraduationCap size={15} /> {examProgress?.completed ? "Opnieuw proberen" : "Start de eindtoets"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Zelfde cosinegelijkenis-score als de persoonlijke "Aanbevolen voor jou"
// (computeCheckinInsights), hier losgetrokken zodat 'm ook op een
// opgetelde-groepsvoorkeur (smaaktest-antwoorden) kan draaien i.p.v. op
// gewogen check-in-geschiedenis van één persoon.
// Dieper dan een enkele smaakvector: weegt ook wat de groep NIET lust (straft
// dat af), welke basisdrank het vaakst favoriet is (bonus als een recept die
// drank bevat), welke cocktails gasten letterlijk noemden (die verdienen
// sowieso een plek), en — als isOwned wordt meegegeven — hoeveel van de
// verplichte ingrediënten je al in huis hebt. Alles blijft optelbaar uit
// dezelfde ruwe antwoorden, geen verzonnen aannames.
function computeGroupRecommendations(responses, recipes, excludeIds, isOwned) {
  if (responses.length === 0) return [];

  const vec = { fruitig: 0, zoet: 0, zuur: 0, sterk: 0, bitter: 0 };
  responses.forEach(r => (r.taste_tags || []).forEach(k => { if (k in vec) vec[k] += 1; }));
  const strengthValues = responses.map(r => r.strength).filter(s => s != null);
  if (strengthValues.length > 0) {
    const avgStrength = strengthValues.reduce((a, b) => a + b, 0) / strengthValues.length;
    vec.sterk = ((avgStrength - 1) / 4) * responses.length;
  }
  const mag = Math.sqrt(Object.values(vec).reduce((s, v) => s + v * v, 0));
  if (mag === 0) return [];

  const dislikeVec = { fruitig: 0, zoet: 0, zuur: 0, sterk: 0, bitter: 0 };
  responses.forEach(r => (r.dislike_tags || []).forEach(k => { if (k in dislikeVec) dislikeVec[k] += 1; }));

  const spiritCounts = {};
  responses.forEach(r => { if (r.favorite_spirit) spiritCounts[r.favorite_spirit] = (spiritCounts[r.favorite_spirit] || 0) + 1; });
  const topSpiritKey = Object.entries(spiritCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topSpiritIds = new Set(FAVORITE_SPIRIT_OPTIONS.find(o => o.key === topSpiritKey)?.ids || []);

  const mentionedIds = new Set(responses.flatMap(r => r.favorite_cocktail_ids || []));
  const excluded = new Set(excludeIds || []);

  return recipes
    .filter(r => !excluded.has(r.id))
    .map(r => {
      const rVec = FAMILY_TASTE[r.family] || {};
      const rMag = Math.sqrt(Object.values(rVec).reduce((s, v) => s + v * v, 0));
      let dot = 0, dislikeDot = 0;
      Object.entries(rVec).forEach(([k, w]) => { dot += w * (vec[k] || 0); dislikeDot += w * (dislikeVec[k] || 0); });
      let tasteScore = rMag > 0 ? (dot / (rMag * mag)) * 100 : 0;
      const dislikePenalty = rMag > 0 ? (dislikeDot / rMag) * (100 / responses.length) : 0;
      tasteScore = Math.max(0, tasteScore - dislikePenalty);

      const spiritMatch = topSpiritIds.size > 0 && r.ingredients.some(i => topSpiritIds.has(i.id));
      const mentioned = mentionedIds.has(r.id);
      const required = r.ingredients.filter(i => !i.optional);
      const matchPct = isOwned && required.length > 0 ? Math.round(((required.length - required.filter(i => !isOwned(i)).length) / required.length) * 100) : null;

      const score = Math.round(tasteScore * 0.55 + (matchPct != null ? matchPct * 0.25 : 0) + (spiritMatch ? 15 : 0) + (mentioned ? 20 : 0));
      return { recipe: r, score, matchPct, mentioned, spiritMatch };
    })
    .filter(x => x.score > 0 || x.mentioned)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// Ingrediënten die typisch niet passen bij een dieetwens — geen sluitende
// allergieclaim (daarvoor ontbreekt de data), alleen een zachte waarschuwing
// zodat de host het zelf kan nalopen voor het serveren. Gluten laten we
// bewust weg: gedistilleerde dranken bevatten na distillatie geen gluten
// meer, dus daar geeft deze ingrediëntenlijst geen zinnig signaal voor.
const DIET_CONFLICT_INGREDIENTS = {
  noten: ["orgeat", "amaretto", "frangelico", "creme_de_noyaux"],
  lactose: ["heavy_cream", "whipped_cream", "milk", "irish_cream"],
  vegan: ["heavy_cream", "whipped_cream", "milk", "irish_cream", "egg_white", "egg_yolk", "honey_syrup", "honey_ginger_syrup"],
};
function getSurveyWarnings(recipe, surveyDietaryTotals, surveyDislikeTotals) {
  const ids = new Set(recipe.ingredients.map(i => i.id));
  const warnings = [];
  Object.entries(DIET_CONFLICT_INGREDIENTS).forEach(([key, conflictIds]) => {
    const count = surveyDietaryTotals?.[key] || 0;
    if (count > 0 && conflictIds.some(id => ids.has(id))) {
      warnings.push(`${count}x ${DIETARY_META[key]?.label || key}`);
    }
  });
  const rVec = FAMILY_TASTE[recipe.family] || {};
  const [dominantKey, dominantWeight] = Object.entries(rVec).sort((a, b) => b[1] - a[1])[0] || [];
  if (dominantKey && dominantWeight >= 0.6 && (surveyDislikeTotals?.[dominantKey] || 0) > 0) {
    warnings.push(`${surveyDislikeTotals[dominantKey]}x houdt niet van ${(TASTE_META[dominantKey]?.label || dominantKey).toLowerCase()}`);
  }
  return warnings;
}

function FeestplannerTab({ session, recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, chosen, setChosen, voorraadAantal, onSound, onOpenRecipe }) {
  const [shareState, setShareState] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(null);
  const [justAddedId, setJustAddedId] = useState(null);
  const [justAddedAll, setJustAddedAll] = useState(false);

  // Smaaktest voor gasten: de host maakt (hoogstens) één actieve test aan,
  // gasten vullen 'm zonder account in via een gedeelde link (GuestSurveyView
  // hierboven), en de reacties worden hier opgeteld tot menu-suggesties —
  // zelfde cosinegelijkenis-score als bij "Aanbevolen voor jou", nu gevoed
  // door de groep i.p.v. door één persoon.
  const myId = session?.user?.id;
  const [survey, setSurvey] = useState(undefined); // undefined = laden, null = nog geen
  const [surveyResponses, setSurveyResponses] = useState([]);
  const [surveyShareState, setSurveyShareState] = useState(null);
  const [creatingSurvey, setCreatingSurvey] = useState(false);

  const loadSurvey = async () => {
    if (!myId) return;
    const { data } = await supabase.from("party_surveys").select("id, title").eq("host_user_id", myId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setSurvey(data || null);
    if (data) {
      const { data: responses } = await supabase.from("party_survey_responses").select("*").eq("survey_id", data.id).order("created_at", { ascending: false });
      setSurveyResponses(responses || []);
    } else {
      setSurveyResponses([]);
    }
  };
  useEffect(() => { loadSurvey(); }, [myId]);

  // Live updates: i.p.v. steeds handmatig op "Ververs" te moeten drukken,
  // druppelen nieuwe reacties er via Supabase Realtime meteen bij binnen
  // terwijl de host het scherm open heeft staan.
  useEffect(() => {
    if (!survey?.id) return;
    const channel = supabase.channel(`survey-responses-${survey.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_survey_responses", filter: `survey_id=eq.${survey.id}` }, (payload) => {
        setSurveyResponses(prev => prev.some(r => r.id === payload.new.id) ? prev : [payload.new, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [survey?.id]);

  const createSurvey = async () => {
    if (!myId || creatingSurvey) return;
    setCreatingSurvey(true);
    const { data } = await supabase.from("party_surveys").insert({ host_user_id: myId, title: "mijn feest" }).select().single();
    setCreatingSurvey(false);
    if (data) { setSurvey(data); setSurveyResponses([]); onSound("pop"); }
  };

  const [confirmDeleteSurvey, setConfirmDeleteSurvey] = useState(false);
  const [deletingSurvey, setDeletingSurvey] = useState(false);
  const deleteSurvey = async () => {
    if (!survey || deletingSurvey) return;
    setDeletingSurvey(true);
    const { error } = await supabase.from("party_surveys").delete().eq("id", survey.id);
    setDeletingSurvey(false);
    setConfirmDeleteSurvey(false);
    if (!error) { setSurvey(null); setSurveyResponses([]); onSound("remove"); }
  };

  const shareSurvey = async () => {
    if (!survey) return;
    onSound("share");
    const url = `${window.location.origin}${window.location.pathname}?smaaktest=${survey.id}`;
    const text = "Vul even je cocktailvoorkeuren in voor het feest!";
    try {
      if (navigator.share) { await navigator.share({ title: "Mijn Thuisbar: smaaktest", text, url }); setSurveyShareState("shared"); }
      else { await navigator.clipboard.writeText(url); setSurveyShareState("copied"); }
    } catch (e) {
      if (e.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); setSurveyShareState("copied"); } catch { setSurveyShareState("failed"); }
      }
    }
    setTimeout(() => setSurveyShareState(null), 2500);
  };

  const [suggestionSheetId, setSuggestionSheetId] = useState(null);
  const [showGuestList, setShowGuestList] = useState(false);

  const surveyTasteTotals = useMemo(() => {
    const totals = { fruitig: 0, zoet: 0, zuur: 0, bitter: 0 };
    surveyResponses.forEach(r => (r.taste_tags || []).forEach(k => { if (k in totals) totals[k] += 1; }));
    return totals;
  }, [surveyResponses]);
  const surveyDislikeTotals = useMemo(() => {
    const totals = { fruitig: 0, zoet: 0, zuur: 0, bitter: 0 };
    surveyResponses.forEach(r => (r.dislike_tags || []).forEach(k => { if (k in totals) totals[k] += 1; }));
    return totals;
  }, [surveyResponses]);
  const surveyAlcoholFreeCount = useMemo(() => surveyResponses.filter(r => r.alcohol_free).length, [surveyResponses]);
  const surveyAvgStrength = useMemo(() => {
    const vals = surveyResponses.map(r => r.strength).filter(s => s != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [surveyResponses]);
  const surveyDietaryTotals = useMemo(() => {
    const totals = {};
    surveyResponses.forEach(r => (r.dietary || []).forEach(k => { totals[k] = (totals[k] || 0) + 1; }));
    return totals;
  }, [surveyResponses]);
  const surveySpiritTotals = useMemo(() => {
    const totals = {};
    surveyResponses.forEach(r => { if (r.favorite_spirit) totals[r.favorite_spirit] = (totals[r.favorite_spirit] || 0) + 1; });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [surveyResponses]);
  const surveyMentionedCocktails = useMemo(() => {
    const ids = [...new Set(surveyResponses.flatMap(r => r.favorite_cocktail_ids || []))];
    return ids.map(id => recipes.find(r => r.id === id)?.name).filter(Boolean);
  }, [surveyResponses, recipes]);
  const surveyGroupPersonalityKey = useMemo(() => {
    const entries = Object.entries(surveyTasteTotals).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 && entries[0][1] > 0 ? entries[0][0] : null;
  }, [surveyTasteTotals]);
  const surveyRecommended = useMemo(
    () => computeGroupRecommendations(surveyResponses, recipes, chosen, isOwned),
    [surveyResponses, recipes, chosen, isOwned]
  );
  // Los van de suggestiekaarten (die het huidige menu uitsluiten): dit is de
  // volledige ranglijst, gebruikt door "Stel automatisch samen" om in één
  // keer een heel menu vanaf nul op te bouwen.
  const surveyRecommendedForCompose = useMemo(
    () => computeGroupRecommendations(surveyResponses, recipes, [], isOwned),
    [surveyResponses, recipes, isOwned]
  );
  const autoComposeMenu = () => {
    const top = surveyRecommendedForCompose.slice(0, 6).map(x => x.recipe.id);
    if (top.length === 0) return;
    onSound("shuffle");
    setChosen(top);
  };
  const suggestionSheetRecipe = suggestionSheetId ? recipes.find(r => r.id === suggestionSheetId) : null;
  const addMissing = (recipeId, refs) => {
    onAddToShoppingList(refs);
    onSound("tick");
    setJustAddedId(recipeId);
    setTimeout(() => setJustAddedId(id => (id === recipeId ? null : id)), 1800);
  };
  const addAllMissing = (refs) => {
    onAddToShoppingList(refs);
    onSound("tick");
    setJustAddedAll(true);
    setTimeout(() => setJustAddedAll(false), 1800);
  };

  const shareMenu = async (ids) => {
    onSound("share");
    const url = `${window.location.origin}${window.location.pathname}?menu=${ids.join(",")}`;
    const text = "Bekijk het cocktailmenu voor vanavond!";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mijn Thuisbar: menu", text, url });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); setShareState("copied"); } catch { setShareState("failed"); }
      }
    }
    setTimeout(() => setShareState(null), 2500);
  };

  const maakbaar = useMemo(() => recipes.filter(r => r.ingredients.filter(i => !i.optional).every(i => isOwned(i))), [recipes, isOwned]);

  const pickRandom = (count) => {
    const pool = [...(maakbaar.length > 0 ? maakbaar : recipes)];
    const picked = [];
    while (pool.length > 0 && picked.length < count) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0].id);
    }
    return picked;
  };

  const [guests, setGuests] = useState(8);
  const [drinksPerGuest, setDrinksPerGuest] = useState(2);

  useEffect(() => {
    if (chosen.length === 0) setChosen(pickRandom(3));
  }, []);

  const addSlot = () => {
    const pool = recipes.filter(r => !chosen.includes(r.id));
    const pick = (pool.length > 0 ? pool : recipes)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : recipes.length))];
    if (pick) { onSound("shuffle"); setChosen([...chosen, pick.id]); }
  };
  const removeSlot = (i) => { onSound("remove"); setChosen(chosen.filter((_, idx) => idx !== i)); };

  const chosenRecipes = chosen.map(id => recipes.find(r => r.id === id)).filter(Boolean);
  const totalDrinks = Math.max(1, guests) * Math.max(1, drinksPerGuest);
  const n = chosenRecipes.length || 1;
  const base = Math.floor(totalDrinks / n);
  const remainder = totalDrinks - base * n;
  const perRecipeCounts = chosenRecipes.map((_, i) => base + (i < remainder ? 1 : 0));

  const needs = useMemo(() => {
    const map = new Map();
    chosenRecipes.forEach((r, i) => {
      const count = perRecipeCounts[i] || 0;
      r.ingredients.forEach(ing => {
        const key = ingredientKey(ing) + "|" + ing.unit;
        if (!map.has(key)) {
          map.set(key, { key, label: ingredientLabel(ing), unit: ing.unit, amount: 0, meta: findIngredientMeta(ing, allIngredients), owned: isOwned(ing), ref: ing, recipeNames: new Set() });
        }
        map.get(key).amount += ing.amount * count;
        map.get(key).recipeNames.add(r.name);
      });
    });
    return [...map.values()].map(v => ({ ...v, recipeNames: [...v.recipeNames] })).sort((a, b) => a.label.localeCompare(b.label));
  }, [chosenRecipes, perRecipeCounts, allIngredients, isOwned, ingredientLabel]);

  let totalCost = 0;
  const rows = needs.map(item => {
    const { meta, unit, amount, owned, ref } = item;
    if (owned) {
      const aantalId = ref.id || meta?.id;
      const aantal = (aantalId && voorraadAantal[aantalId]) ?? 1;
      if (meta && meta.bottleMl && meta.bottlePrice && unit !== "dash") {
        const availableMl = aantal * meta.bottleMl;
        if (amount <= availableMl) {
          return { ...item, buyLabel: aantal === 1 ? "al in voorraad" : `al in voorraad (${formatAantal(aantal)} flessen)`, cost: 0 };
        }
        const shortfall = amount - availableMl;
        const bottles = Math.ceil(shortfall / meta.bottleMl);
        const cost = bottles * meta.bottlePrice;
        totalCost += cost;
        return { ...item, buyLabel: `${formatAantal(aantal)} fles${aantal === 1 ? "" : "sen"} in voorraad · ${bottles} bijkopen · ${euro(cost)}`, cost };
      }
      return { ...item, buyLabel: aantal === 1 ? "al in voorraad" : `al in voorraad (${formatAantal(aantal)} flessen)`, cost: 0 };
    }
    if (meta && meta.bottleMl && meta.bottlePrice) {
      if (unit === "dash") {
        totalCost += meta.bottlePrice;
        return { ...item, buyLabel: `1 fles (${meta.bottleMl} ml)`, cost: meta.bottlePrice };
      }
      const bottles = Math.ceil(amount / meta.bottleMl);
      const cost = bottles * meta.bottlePrice;
      totalCost += cost;
      return { ...item, buyLabel: `${bottles} fles${bottles === 1 ? "" : "sen"} (${meta.bottleMl} ml)`, cost };
    }
    if (meta && meta.unitPrice) {
      const stuks = Math.ceil(amount);
      const cost = stuks * meta.unitPrice;
      totalCost += cost;
      return { ...item, buyLabel: `${stuks} stuks`, cost };
    }
    return { ...item, buyLabel: "naar smaak", cost: 0 };
  });

  const toBuy = rows.filter(r => !r.owned && r.cost > 0);
  const stepperBtn = { width: 32, height: 32, borderRadius: 3, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" };
  const stepperValue = { width: 30, textAlign: "center", fontWeight: 700, fontSize: 17, fontFamily: serif, color: BOTTLE };

  // Voorbereiding: glaswerk, garnering en welke cocktails vooraf te batchen zijn
  const prep = useMemo(() => {
    const glasses = new Map();
    const garnish = new Map();
    const batchAhead = [];
    chosenRecipes.forEach((r, i) => {
      const count = perRecipeCounts[i] || 0;
      glasses.set(r.glass, (glasses.get(r.glass) || 0) + count);
      r.ingredients.forEach(ing => {
        const meta = findIngredientMeta(ing, allIngredients);
        if (meta && (meta.cat === "Vers" || meta.cat === "Zuivel & room") && !meta.bottleMl) {
          garnish.set(meta.name, garnish.get(meta.name) || meta.name);
        }
      });
      const techniques = inferTechniques(r.method);
      const role = getMenuRole(r);
      if (role === "sterk" && techniques.length > 0 && techniques.every(t => ["stirred", "build"].includes(t))) {
        batchAhead.push(r.name);
      }
    });
    const kgIjs = Math.round(totalDrinks * 0.15 * 10) / 10;
    return { glasses: [...glasses.entries()], garnish: [...garnish.values()], batchAhead, kgIjs };
  }, [chosenRecipes, perRecipeCounts, allIngredients, totalDrinks]);

  return (
    <div>
      <div style={{
        position: "relative", height: 176, borderRadius: RADIUS + 6, overflow: "hidden", marginBottom: 22,
        boxShadow: SHADOW_HERO, border: `1px solid ${BORDER}`, borderBottom: `3px solid ${BRASS}`,
      }}>
        <img src={feestHeaderImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, rgba(19,38,34,0.88), rgba(19,38,34,0.2) 55%, rgba(19,38,34,0.4))` }} />
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "16px 20px" }}>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 26, color: CREAM }}>Feestplanner</div>
          <div style={{ fontSize: 12, color: "#D9CBAE", letterSpacing: 0.4, marginTop: 3 }}>Alles klaar voor als de gasten arriveren</div>
        </div>
      </div>

      <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Aantal gasten</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <button onClick={() => setGuests(Math.max(1, guests - 1))} style={stepperBtn}>−</button>
              <div style={stepperValue}>{guests}</div>
              <button onClick={() => setGuests(Math.min(100, guests + 1))} style={stepperBtn}>+</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Cocktails per gast</div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <button onClick={() => setDrinksPerGuest(Math.max(1, drinksPerGuest - 1))} style={stepperBtn}>−</button>
              <div style={stepperValue}>{drinksPerGuest}</div>
              <button onClick={() => setDrinksPerGuest(Math.min(10, drinksPerGuest + 1))} style={stepperBtn}>+</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: `1px dashed ${BORDER}` }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 21, color: BOTTLE }}>{totalDrinks}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>drankjes totaal</div>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 21, color: BOTTLE }}><AnimatedNumber value={totalCost} format={euro} /></div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>geschatte inkoop</div>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 21, color: BOTTLE }}>{chosenRecipes.length}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>cocktails</div>
          </div>
        </div>
      </div>

      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16, marginBottom: 24 }}>
        <SectionLabel>Smaaktest voor je gasten</SectionLabel>
        {survey === undefined ? null : survey === null ? (
          <>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
              Stuur een linkje rond zodat gasten hun smaak kunnen doorgeven — daaruit rollen menu-suggesties voor de hele groep.
            </p>
            <button onClick={createSurvey} disabled={creatingSurvey} className="press-scale" style={{
              display: "flex", alignItems: "center", gap: 7, border: `1px dashed ${BRASS}`, background: "none", color: BRASS,
              borderRadius: RADIUS, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: sans,
            }}>
              <Share2 size={14} /> {creatingSurvey ? "Bezig…" : "Smaaktest aanmaken"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: MUTED }}>
                <span title="Live: nieuwe reacties verschijnen automatisch" style={{ width: 6, height: 6, borderRadius: "50%", background: SAGE, flexShrink: 0 }} />
                {surveyResponses.length === 0 ? "Nog geen reacties" : `${surveyResponses.length} reactie${surveyResponses.length === 1 ? "" : "s"} binnen`}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={loadSurvey} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 3, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  <RefreshCw size={12} /> Ververs
                </button>
                <button onClick={shareSurvey} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${SAGE}`, color: SAGE, borderRadius: 3, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <Share2 size={13} /> {surveyShareState === "shared" ? "Gedeeld!" : surveyShareState === "copied" ? "Link gekopieerd!" : surveyShareState === "failed" ? "Delen mislukt" : "Deel de link"}
                </button>
                {!confirmDeleteSurvey ? (
                  <button onClick={() => setConfirmDeleteSurvey(true)} title="Verwijder smaaktest" className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 3, cursor: "pointer", flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, whiteSpace: "nowrap" }}>
                    <span style={{ color: MUTED }}>Verwijderen?</span>
                    <button onClick={deleteSurvey} disabled={deletingSurvey} style={{ background: "none", border: "none", color: BURGUNDY, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 11.5 }}>{deletingSurvey ? "…" : "Ja"}</button>
                    <button onClick={() => setConfirmDeleteSurvey(false)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: 0, fontSize: 11.5 }}>Nee</button>
                  </span>
                )}
              </div>
            </div>
            {survey && (
              <p style={{ fontSize: 11, color: MUTED, margin: "-8px 0 14px" }}>Klaar met dit feest? Verwijder de test en maak een nieuwe aan voor de volgende keer.</p>
            )}

            {surveyResponses.length > 0 && (
              <>
                {surveyGroupPersonalityKey && GROUP_PERSONALITY[surveyGroupPersonalityKey] && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: PAPER, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "12px 14px", marginBottom: 16 }}>
                    <span style={{ fontSize: 26, flexShrink: 0 }}>{GROUP_PERSONALITY[surveyGroupPersonalityKey].emoji}</span>
                    <div>
                      <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 14.5, color: INK }}>{GROUP_PERSONALITY[surveyGroupPersonalityKey].title}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{GROUP_PERSONALITY[surveyGroupPersonalityKey].text}</div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  {SURVEY_TASTE_KEYS.map(key => {
                    const meta = TASTE_META[key];
                    const pct = Math.round((surveyTasteTotals[key] / surveyResponses.length) * 100);
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>{meta.emoji}</span>
                        <span style={{ fontSize: 11.5, color: INK, width: 50, flexShrink: 0 }}>{meta.label}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: BRASS, width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
                      </div>
                    );
                  })}
                  {surveyAvgStrength != null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0 }}>🥃</span>
                      <span style={{ fontSize: 11.5, color: INK, width: 50, flexShrink: 0 }}>Sterk</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: BOTTLE, width: `${Math.round(((surveyAvgStrength - 1) / 4) * 100)}%` }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{surveyAvgStrength.toFixed(1)}</span>
                    </div>
                  )}
                  {surveyAlcoholFreeCount > 0 && (
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                      {surveyAlcoholFreeCount} van de {surveyResponses.length} wil liever alcoholvrij.
                    </div>
                  )}
                </div>

                {SURVEY_TASTE_KEYS.some(k => surveyDislikeTotals[k] > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: BURGUNDY, marginBottom: 8 }}>Waar gasten niet van houden</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {SURVEY_TASTE_KEYS.filter(k => surveyDislikeTotals[k] > 0).map(k => (
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(122,46,42,0.08)", border: `1px solid rgba(122,46,42,0.25)`, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: BURGUNDY, fontWeight: 600 }}>
                          {TASTE_META[k].emoji} {TASTE_META[k].label} ({surveyDislikeTotals[k]})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(surveyDietaryTotals).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Diëten & allergieën</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(surveyDietaryTotals).map(([k, count]) => (
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: INK, fontWeight: 600 }}>
                          {DIETARY_META[k]?.emoji || "•"} {DIETARY_META[k]?.label || k} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {surveySpiritTotals.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Favoriete sterkedrank</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {surveySpiritTotals.map(([k, count]) => (
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: INK, fontWeight: 600 }}>
                          {FAVORITE_SPIRIT_OPTIONS.find(o => o.key === k)?.label || k} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {surveyMentionedCocktails.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Genoemde favoriete cocktails</div>
                    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{surveyMentionedCocktails.join(" · ")}</div>
                  </div>
                )}

                {surveyRecommended.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 3 }}>Suggesties voor het menu</div>
                      <button onClick={autoComposeMenu} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${BRASS}`, color: BRASS, borderRadius: 3, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                        <Sparkles size={12} /> Stel automatisch samen
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>Tik op een kaart voor het recept, of gebruik + om 'm direct toe te voegen.</div>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                      {surveyRecommended.map(({ recipe, score, matchPct, mentioned, spiritMatch }) => {
                        const warnings = getSurveyWarnings(recipe, surveyDietaryTotals, surveyDislikeTotals);
                        return (
                        <button key={recipe.id} onClick={() => setSuggestionSheetId(recipe.id)} className="press-scale" style={{ width: 132, flexShrink: 0, textAlign: "center", background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 10, position: "relative", cursor: "pointer", fontFamily: sans }}>
                          <div style={{ position: "absolute", top: 8, right: 8, background: BOTTLE_DARK, border: `1px solid rgba(245,239,230,0.25)`, borderRadius: 100, padding: "3px 7px", fontSize: 10.5, fontWeight: 700, color: BRASS }}>{score}%</div>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                            <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={44} />
                          </div>
                          <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 12.5, color: INK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{recipe.name}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3, marginTop: 5, minHeight: 15 }}>
                            {mentioned && <span style={{ fontSize: 8.5, color: BRASS, fontWeight: 700, border: `1px solid ${BRASS}`, borderRadius: 100, padding: "1px 5px" }}>genoemd</span>}
                            {spiritMatch && <span style={{ fontSize: 8.5, color: SAGE, fontWeight: 700, border: `1px solid ${SAGE}`, borderRadius: 100, padding: "1px 5px" }}>favoriet</span>}
                            {matchPct != null && <span style={{ fontSize: 8.5, color: MUTED, fontWeight: 700, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "1px 5px" }}>{matchPct}% in huis</span>}
                          </div>
                          {warnings.length > 0 && (
                            <div title={warnings.join(", ")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 5, fontSize: 9.5, color: BURGUNDY, fontWeight: 700 }}>
                              ⚠️ {warnings[0]}
                            </div>
                          )}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); onSound("shuffle"); setChosen([...chosen, recipe.id]); }}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 7, fontSize: 10.5, color: BRASS, fontWeight: 700, border: `1px dashed ${BRASS}`, borderRadius: 3, padding: "5px 0", cursor: "pointer" }}
                          >
                            <Plus size={11} /> toevoegen
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <button onClick={() => setShowGuestList(v => !v)} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: sans }}>
                    <Users size={13} /> Antwoorden per gast {showGuestList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {showGuestList && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {surveyResponses.map(r => (
                        <div key={r.id} style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, color: INK, lineHeight: 1.5 }}>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>{r.guest_name || "Naamloze gast"}</div>
                          <div style={{ color: MUTED }}>
                            {(r.taste_tags || []).map(k => TASTE_META[k]?.emoji).filter(Boolean).join(" ") || "geen smaak opgegeven"}
                            {r.strength != null && ` · sterkte ${r.strength}/5`}
                            {r.alcohol_free && " · alcoholvrij"}
                            {r.favorite_spirit && ` · ${FAVORITE_SPIRIT_OPTIONS.find(o => o.key === r.favorite_spirit)?.label || r.favorite_spirit}`}
                            {(r.favorite_cocktail_ids || []).length > 0 && ` · favorieten: ${r.favorite_cocktail_ids.map(id => recipes.find(x => x.id === id)?.name).filter(Boolean).join(", ")}`}
                            {(r.dietary || []).length > 0 && ` · ${r.dietary.map(k => DIETARY_META[k]?.label || k).join(", ")}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {suggestionSheetRecipe && (() => {
        const required = suggestionSheetRecipe.ingredients.filter(ing => !ing.optional);
        const missing = required.filter(ing => !isOwned(ing));
        return (
          <RecipeSheet recipe={suggestionSheetRecipe} missing={missing} ingredientLabel={ingredientLabel} allIngredients={allIngredients}
            onAddMissing={addMissing} justAdded={justAddedId === suggestionSheetRecipe.id} onClose={() => setSuggestionSheetId(null)}
            onOpenFullRecipe={onOpenRecipe} onAddToFeest={(id) => { onSound("shuffle"); setChosen([...chosen, id]); }}
            feestChosen={chosen} onSound={onSound} />
        );
      })()}

      <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <SectionLabel>Gekozen cocktails ({chosenRecipes.length})</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => shareMenu(chosen)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${SAGE}`, color: SAGE, borderRadius: 3, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <Share2 size={13} /> {shareState === "shared" ? "Gedeeld!" : shareState === "copied" ? "Link gekopieerd!" : shareState === "failed" ? "Delen mislukt" : "Deel dit menu"}
              </button>
              <button onClick={() => setChosen(pickRandom(Math.max(1, chosen.length)))}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BRASS}`, color: BRASS, borderRadius: 3, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <Shuffle size={13} /> Nieuwe suggestie
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {chosenRecipes.map((r, i) => {
              const required = r.ingredients.filter(ing => !ing.optional);
              const missing = required.filter(ing => !isOwned(ing));
              const isEditing = editingIndex === i;
              const warnings = surveyResponses.length > 0 ? getSurveyWarnings(r, surveyDietaryTotals, surveyDislikeTotals) : [];
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: "10px 12px" }}>
                  {isEditing ? (
                    <RecipePicker recipes={recipes} value={r.id} listId={`feest-recipe-${i}`}
                      onChange={id => { const next = chosen.slice(); next[i] = id; setChosen(next); setEditingIndex(null); }}
                      style={{ flex: 1, minWidth: 0 }} />
                  ) : (
                    <button onClick={() => setSheetIndex(i)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0, fontFamily: sans }}>
                      <RecipeCircle recipe={r} allIngredients={allIngredients} size={44} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <StatusTag missingCount={missing.length} />
                          <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>· {perRecipeCounts[i]} glazen</span>
                        </div>
                        {warnings.length > 0 && (
                          <div title={warnings.join(", ")} style={{ fontSize: 10.5, color: BURGUNDY, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            ⚠️ {warnings.join(" · ")}
                          </div>
                        )}
                      </div>
                    </button>
                  )}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setEditingIndex(isEditing ? null : i)} title="Wissel cocktail" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: PAPER_DEEP, color: isEditing ? BOTTLE : MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <RefreshCw size={14} />
                    </button>
                    {chosen.length > 1 && (
                      <button onClick={() => removeSlot(i)} title="Verwijder cocktail" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: PAPER_DEEP, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={addSlot} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", background: "none", border: `1px dashed ${BRASS}`, borderRadius: 14, padding: "13px", fontSize: 12.5, fontWeight: 700, color: BRASS, cursor: "pointer", marginTop: 10 }}>
            <Plus size={14} /> Extra cocktail toevoegen
          </button>

          <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16, marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <ShoppingCart size={15} color={BRASS} />
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Inkooplijst</span>
            </div>
            {rows.map((row, i) => (
              <div key={row.key} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: i === 0 ? "none" : `1px dotted ${BORDER}`, fontSize: 13.5 }}>
                <span style={{ color: INK }}>{row.label}</span>
                <span style={{ color: row.cost > 0 ? MUTED : SAGE, fontWeight: 600 }}>
                  {row.buyLabel}{row.cost > 0 && !row.buyLabel.includes("€") ? ` · ${euro(row.cost)}` : ""}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 2px", marginTop: 4, borderTop: `1px solid ${BORDER}`, fontSize: 15 }}>
              <span style={{ fontFamily: serif, fontWeight: 700, color: INK }}>Geschatte inkoop</span>
              <span style={{ fontFamily: serif, fontWeight: 700, color: BOTTLE }}><AnimatedNumber value={totalCost} format={euro} /></span>
            </div>
            <p style={{ fontSize: 11.5, color: MUTED, margin: "6px 0 14px", lineHeight: 1.5 }}>
              Richtprijzen o.b.v. drankdozijn.nl ({PRICES_UPDATED}), geen live koppeling, zie dit als indicatie, niet als actuele winkelprijs. Wat je al in voorraad hebt, telt mee volgens het aantal flessen dat je bij Voorraad instelt. Is dat te weinig voor dit feest, dan berekent de app hoeveel je moet bijkopen.
            </p>
            {toBuy.length > 0 && (
              justAddedAll ? (
                <span className="success-pop" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: SAGE, fontSize: 14, fontWeight: 700, padding: "11px 0" }}>
                  <Check size={15} strokeWidth={3} /> Toegevoegd aan winkelmandje
                </span>
              ) : (
                <button onClick={() => addAllMissing(toBuy.map(row => ({ ref: row.ref, recipeNames: row.recipeNames })))}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", background: BOTTLE, color: "#FBF6EA", border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
                  <ShoppingCart size={15} /> Zet ontbrekende in winkelmandje
                </button>
              )
            )}
          </div>

          <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16, marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <ClipboardList size={15} color={BRASS} />
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Voorbereiding</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
              <Snowflake size={15} color={MUTED} style={{ marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 13.5, color: INK, margin: 0, lineHeight: 1.5 }}>
                Reken op ongeveer <strong>{prep.kgIjs} kg ijs</strong> voor {totalDrinks} drankjes (vuistregel: ~150 g per drankje).
              </p>
            </div>
            {prep.glasses.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: 13.5, color: INK, margin: "0 0 4px", lineHeight: 1.5 }}><strong>Glazen koelen:</strong></p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: INK, lineHeight: 1.6 }}>
                  {prep.glasses.map(([glass, count]) => <li key={glass}>{glass}: {count}×</li>)}
                </ul>
              </div>
            )}
            {prep.garnish.length > 0 && (
              <p style={{ fontSize: 13.5, color: INK, margin: "0 0 10px", lineHeight: 1.5 }}>
                <strong>Vooraf snijden/klaarzetten:</strong> {prep.garnish.join(", ")}.
              </p>
            )}
            {prep.batchAhead.length > 0 && (
              <p style={{ fontSize: 13.5, color: INK, margin: 0, lineHeight: 1.5 }}>
                <strong>Kun je vooraf batchen</strong> (zonder ijs, gekoeld bewaren tot het feest): {prep.batchAhead.join(", ")}.
              </p>
            )}
          </div>
      </>

      {sheetIndex !== null && chosenRecipes[sheetIndex] && (() => {
        const r = chosenRecipes[sheetIndex];
        const required = r.ingredients.filter(ing => !ing.optional);
        const missing = required.filter(ing => !isOwned(ing));
        return (
          <RecipeSheet recipe={r} missing={missing} ingredientLabel={ingredientLabel} allIngredients={allIngredients}
            onAddMissing={addMissing} justAdded={justAddedId === r.id} onClose={() => setSheetIndex(null)} />
        );
      })()}
    </div>
  );
}

function SmaakbalansTab({ recipes, isOwned, allIngredients, menu, setMenu, onUseInFeestplanner, onSound }) {
  const [pickerValues, setPickerValues] = useState({});
  const [expandedWhy, setExpandedWhy] = useState(null);

  const addFromRole = (roleKey) => {
    const id = pickerValues[roleKey];
    if (!id || menu.includes(id)) return;
    onSound("pop");
    setMenu([...menu, id]);
    setPickerValues({ ...pickerValues, [roleKey]: null });
  };
  const removeFromMenu = (id) => { onSound("remove"); setMenu(menu.filter(x => x !== id)); };

  const recipesByRole = useMemo(() => {
    const map = {};
    MENU_ROLE_KEYS.forEach(k => { map[k] = []; });
    recipes.forEach(r => {
      const role = getMenuRole(r);
      if (map[role]) map[role].push(r);
    });
    return map;
  }, [recipes]);

  const menuRecipes = menu.map(id => recipes.find(r => r.id === id)).filter(Boolean);

  const roleCounts = useMemo(() => {
    const counts = {};
    MENU_ROLE_KEYS.forEach(k => { counts[k] = 0; });
    menuRecipes.forEach(r => {
      const role = getMenuRole(r);
      if (role !== "overig") counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }, [menuRecipes]);
  const maxCount = Math.max(1, ...Object.values(roleCounts));

  const sharedIngredients = useMemo(() => {
    const count = new Map();
    menuRecipes.forEach(r => {
      const seen = new Set();
      r.ingredients.forEach(ing => {
        const key = ingredientKey(ing);
        if (seen.has(key)) return;
        seen.add(key);
        const label = findIngredientMeta(ing, allIngredients)?.name || ing.name || ing.id;
        const entry = count.get(key) || { label, n: 0 };
        entry.n += 1;
        count.set(key, entry);
      });
    });
    return [...count.values()].filter(e => e.n >= 2).sort((a, b) => b.n - a.n);
  }, [menuRecipes, allIngredients]);

  const tasteAvg = useMemo(() => {
    if (menuRecipes.length === 0) return null;
    const sums = { zoet: 0, zuur: 0, bitter: 0, sterk: 0 };
    menuRecipes.forEach(r => {
      const p = getTasteProfile(r, allIngredients);
      sums.zoet += p.zoet; sums.zuur += p.zuur; sums.bitter += p.bitter; sums.sterk += p.sterk;
    });
    const n = menuRecipes.length;
    return { zoet: sums.zoet / n, zuur: sums.zuur / n, bitter: sums.bitter / n, sterk: sums.sterk / n };
  }, [menuRecipes, allIngredients]);

  const weakestAxis = useMemo(() => {
    if (!tasteAvg || menuRecipes.length < 2) return null;
    const [key, value] = Object.entries(tasteAvg).sort((a, b) => a[1] - b[1])[0];
    return value < 1.5 ? key : null;
  }, [tasteAvg, menuRecipes.length]);

  const suggestions = useMemo(() => {
    if (!weakestAxis) return [];
    return recipes
      .filter(r => !menu.includes(r.id))
      .map(r => {
        const score = getTasteProfile(r, allIngredients)[weakestAxis];
        const missingCount = r.ingredients.filter(ing => !ing.optional).filter(ing => !isOwned(ing)).length;
        return { r, score, missingCount };
      })
      .filter(x => x.score >= 3)
      .sort((a, b) => (a.missingCount - b.missingCount) || (b.score - a.score))
      .slice(0, 2);
  }, [weakestAxis, recipes, menu, allIngredients, isOwned]);

  const addToMenu = (id) => { if (!menu.includes(id)) { onSound("pop"); setMenu([...menu, id]); } };

  return (
    <div>
      <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 18, marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <Sparkles size={15} color={BRASS} />
          <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Hoe bartending-menu's in elkaar zitten</span>
        </div>
        <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: "0 0 10px" }}>
          Menuguides voor bars werken met een "smaakmatrix" van vier hoeken: <strong>fris &amp; verfrissend</strong>,
          <strong> avontuurlijk</strong>, <strong>sterk &amp; aromatisch</strong> en <strong>comfort</strong>, met daarnaast altijd
          een volwaardige <strong>alcoholvrije</strong> optie. Elke hoek moet ongeveer even zwaar wegen, anders voelt het menu
          eenzijdig aan. Voor een bar is 10-12 opties gangbaar; voor een housefeestje is 3-6 cocktails ruim genoeg.
        </p>
        <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          Praktische vuistregels die er direct bij horen: reken op 2 drankjes per gast het eerste uur en daarna 1 per uur;
          een fles van 70cl levert ongeveer 16 drankjes van 45 ml op; en gestirde cocktails zonder vers sap of ei
          (Sterk &amp; aromatisch) zijn het makkelijkst om vooraf te batchen, wat jou als gastheer tijd bespaart tijdens het feest.
          Bouw hieronder je eigen menu: de balk per smaakhoek laat live zien of je iets mist.
        </p>
      </div>

      <div style={{ marginBottom: 26 }}>
        <SectionLabel>Voeg toe per smaakhoek</SectionLabel>
        <p style={{ fontSize: 12.5, color: MUTED, margin: "0 0 14px", lineHeight: 1.5 }}>
          Kies hieronder per hoek een cocktail, zo weet je meteen onder welke categorie 'm valt, in plaats van dat pas achteraf te zien.
        </p>
        {MENU_ROLE_KEYS.map(key => {
          const role = MENU_ROLES[key];
          const roleRecipes = recipesByRole[key];
          const value = pickerValues[key] || null;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: BRASS, letterSpacing: 0.4, minWidth: 150 }}>{role.label}</span>
              <RecipePicker recipes={roleRecipes} value={value} listId={`balans-add-${key}`}
                onChange={id => setPickerValues({ ...pickerValues, [key]: id })} style={{ flex: "1 1 180px" }} />
              <button onClick={() => addFromRole(key)} disabled={!value}
                style={{ display: "flex", alignItems: "center", gap: 5, background: value ? BOTTLE : BORDER, color: value ? "#FBF6EA" : MUTED, border: "none", borderRadius: 3, padding: "8px 13px", fontSize: 13, fontWeight: 700, cursor: value ? "pointer" : "default" }}>
                <Plus size={13} /> Toevoegen
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Balans van je menu</SectionLabel>
        {MENU_ROLE_KEYS.map(key => {
          const role = MENU_ROLES[key];
          const count = roleCounts[key] || 0;
          return (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: INK, fontWeight: 600 }}>{role.label}</span>
                <span style={{ color: count === 0 ? BURGUNDY : MUTED, fontWeight: 600 }}>{count}</span>
              </div>
              <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(count / maxCount) * 100}%`, height: "100%", background: count === 0 ? BURGUNDY : BOTTLE }} />
              </div>
              {count === 0 && menuRecipes.length > 0 && (
                <p style={{ fontSize: 12, color: MUTED, margin: "5px 0 0", lineHeight: 1.5 }}>Nog niets hier: {role.why}</p>
              )}
            </div>
          );
        })}
      </div>

      {weakestAxis && suggestions.length > 0 && (
        <div style={{ marginBottom: 22, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: BRASS, marginBottom: 6 }}>Slimme aanvulling</div>
          <p style={{ fontSize: 13, color: INK, margin: "0 0 10px", lineHeight: 1.5 }}>
            Je menu scoort laag op <strong>{{ zoet: "zoet", zuur: "zuur", bitter: "bitter", sterk: "sterk" }[weakestAxis]}</strong>. Dit zijn recepten die dat aanvullen, met voorrang voor wat je al in huis hebt:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map(({ r, missingCount }) => (
              <button key={r.id} onClick={() => addToMenu(r.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: RADIUS, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Plus size={13} /> {r.name}
                <StatusTag missingCount={missingCount} />
              </button>
            ))}
          </div>
        </div>
      )}

      <SectionLabel>Jouw menu ({menuRecipes.length})</SectionLabel>
      {menuRecipes.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 14, padding: "10px 0 20px" }}>Nog leeg. Zoek hierboven een cocktail op en voeg 'm toe.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {menuRecipes.map(r => {
            const role = getMenuRole(r);
            const roleInfo = MENU_ROLES[role];
            const missingCount = r.ingredients.filter(ing => !ing.optional).filter(ing => !isOwned(ing)).length;
            const isExpanded = expandedWhy === r.id;
            return (
              <div key={r.id} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <RecipeCircle recipe={r} allIngredients={allIngredients} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, color: INK, fontSize: 15.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>{r.family} · {r.glass}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setExpandedWhy(isExpanded ? null : r.id)}
                      style={{ background: "none", border: `1px solid ${BRASS}`, color: BRASS, borderRadius: 3, padding: "4px 9px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>
                      {roleInfo.label}
                    </button>
                    <StatusTag missingCount={missingCount} />
                    <button onClick={() => removeFromMenu(r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}>
                      <X size={15} color={MUTED} />
                    </button>
                  </div>
                </div>
                {isExpanded && <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0", lineHeight: 1.5 }}>{roleInfo.why}</p>}
              </div>
            );
          })}
        </div>
      )}

      {sharedIngredients.length > 0 && (
        <div style={{ marginTop: 22, padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: BOTTLE, marginBottom: 6 }}>Efficiënt inkopen</div>
          <p style={{ fontSize: 13, color: INK, margin: 0, lineHeight: 1.5 }}>
            Deze ingrediënten komen in meerdere gekozen cocktails voor, dus je koopt ze toch maar één keer:{" "}
            {sharedIngredients.map(e => `${e.label} (${e.n}×)`).join(", ")}.
          </p>
        </div>
      )}

      {menuRecipes.length > 0 && (
        <button onClick={() => { onSound("chime"); onUseInFeestplanner(menuRecipes.map(r => r.id)); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: BOTTLE, color: "#FBF6EA", border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA, marginTop: 24 }}>
          <Sparkles size={15} /> Gebruik dit menu in de Feestplanner
        </button>
      )}
    </div>
  );
}

// "3.0" voor een heel getal, "3.25"/"3.5"/"3.75" voor een kwart-ster —
// overal waar een beoordeling getoond wordt, i.p.v. het vaste "{rating}.0"
// dat alleen bij hele sterren klopte.
function formatRating(value) {
  if (Number.isInteger(value)) return `${value}.0`;
  return value.toFixed(2).replace(/0$/, "");
}

// Puur de visuele sterrenrij (met eventuele kwart-vulling) + het getal —
// tikken op een ster zet 'm meteen op een heel getal; de fijnafstemming in
// kwarten gebeurt via een los schuifbalkje eronder (zie de check-in-sheet),
// want precies op een kwart ster tikken is op een telefoon niet te doen.
function StarPicker({ value, onChange, size = 19, onSound }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3, 4].map(i => {
          const filled = Math.min(1, Math.max(0, value - i));
          return (
            <button key={i} onClick={() => { const v = i + 1; if (onSound && v !== value) onSound("tick"); onChange(v); }}
              className="press-scale" style={{ position: "relative", width: size, height: size, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              <Star size={size} color="#C9BC9C" strokeWidth={1.5} style={{ display: "block" }} />
              {filled > 0 && (
                <div style={{ position: "absolute", inset: 0, width: `${filled * 100}%`, overflow: "hidden" }}>
                  <Star size={size} fill={BRASS} color={BRASS} strokeWidth={1.5} style={{ display: "block" }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {value > 0 && <span style={{ fontFamily: systemFont, fontWeight: 600, fontSize: 15, color: INK }}>{formatRating(value)}</span>}
    </div>
  );
}

// Eén notitieregel die vanzelf meegroeit met de tekst — geen zichtbare rand
// of resize-greep, past bij het vlakke, kaderloze veldontwerp van de
// check-in-sheet.
function AutoGrowTextField({ value, onChange, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={1} style={{
      width: "100%", border: "none", outline: "none", resize: "none", background: PAPER, borderRadius: 12,
      padding: "13px 14px", fontSize: 15, fontFamily: systemFont, color: INK, boxSizing: "border-box",
      lineHeight: 1.4, overflow: "hidden", display: "block",
    }} />
  );
}

function fieldStyle() {
  return { width: "100%", padding: "9px 10px", borderRadius: 3, border: `1px solid ${BORDER}`, fontSize: 14, boxSizing: "border-box", background: CREAM, fontFamily: sans };
}

// Zelfde reden als IngredientAutocomplete: vrij kunnen typen én uit het
// register kunnen kiezen, met een lijst die ook op iPhone/iOS Safari werkt.
// Deze variant toont een fotominiatuur per resultaat en, zolang er nog
// niets getypt is, een rij "Laatst gemaakt" — puur zodat je bij een
// check-in zo min mogelijk hoeft te typen voor een cocktail die je al
// eerder maakte.
function RecipeSearchWithPhotos({ recipes, value, onChange, onSelect, allIngredients, recent }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const sorted = useMemo(() => [...recipes].sort((a, b) => a.name.localeCompare(b.name)), [recipes]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? sorted.filter(r => r.name.toLowerCase().includes(q)) : sorted;
    return list.slice(0, 30);
  }, [sorted, value]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => { document.removeEventListener("mousedown", onOutside); document.removeEventListener("touchstart", onOutside); };
  }, [open]);

  const pick = (r) => { onSelect(r); setOpen(false); };
  const flatFieldStyle = {
    width: "100%", border: "none", outline: "none", background: PAPER, borderRadius: 12,
    padding: "13px 14px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Zoek een cocktail…" enterKeyHint="next" autoCapitalize="words" style={flatFieldStyle} />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: CREAM,
          borderRadius: 14, maxHeight: 260, overflowY: "auto",
          WebkitOverflowScrolling: "touch", zIndex: 30, boxShadow: SHADOW_CARD,
        }}>
          {filtered.map(r => (
            <button key={r.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(r)} className="list-row-tap"
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 12px", background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: systemFont }}>
              <RecipeCircle recipe={r} allIngredients={allIngredients} size={36} />
              <span style={{ fontSize: 15, color: INK }}>{r.name}</span>
            </button>
          ))}
        </div>
      )}
      {!open && !value.trim() && recent.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 9, fontFamily: systemFont }}>Laatst gemaakt</div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 2 }}>
            {recent.map(r => (
              <button key={r.id} onClick={() => pick(r)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 62, flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <RecipeCircle recipe={r} allIngredients={allIngredients} size={54} />
                <span style={{
                  fontSize: 11, color: INK, textAlign: "center", lineHeight: 1.25, fontFamily: systemFont,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const KORTE_MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function formatCheckinDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${KORTE_MAANDEN[m - 1]} ${y}`;
}

// Cocktailfamilie → smaakdimensie: een bewust eenvoudige, transparante
// toewijzing op basis van het bestaande `family`-veld (geen smaakscheikunde),
// zodat het smaakprofiel altijd op echte check-in-data is gebaseerd i.p.v.
// verzonnen cijfers.
const FAMILY_TASTE = {
  "Sours": { zuur: 1, fruitig: 1 },
  "Highballs": { fruitig: 1 },
  "Stirred-down": { sterk: 1, bitter: 0.6 },
  "Spirit-forward": { sterk: 1 },
  "Fizz / Flip": { zoet: 1, fruitig: 0.5 },
  "Modern / Tiki": { fruitig: 1, zoet: 0.6 },
  "Zuivel & dessert": { zoet: 1 },
  "Moderne klassiekers": { sterk: 0.7 },
  "Mocktail / alcoholvrij": { fruitig: 0.8 },
  "Warme dranken": { zoet: 0.7 },
};
const TASTE_META = {
  fruitig: { emoji: "🍓", label: "Fruitig" },
  zoet: { emoji: "🍬", label: "Zoet" },
  zuur: { emoji: "🍋", label: "Zuur" },
  sterk: { emoji: "🥃", label: "Sterk" },
  bitter: { emoji: "🍫", label: "Bitter" },
};
const PERSONALITY = {
  fruitig: { emoji: "🍓", title: "DE FRUITIGE ONTDEKKER", text: "Je check-ins laten zien dat je houdt van fruitige, verfrissende cocktails." },
  zoet: { emoji: "🍬", title: "DE ZOETEKAUW", text: "Je check-ins laten zien dat je een zwak hebt voor romige, zoete cocktails." },
  zuur: { emoji: "🍋", title: "DE FRISSE ZUURPRUIM", text: "Je check-ins laten zien dat je houdt van scherpe, fris-zure cocktails." },
  sterk: { emoji: "🥃", title: "DE PURIST", text: "Je check-ins laten zien dat je houdt van sterke, spirit-forward cocktails." },
  bitter: { emoji: "🍂", title: "DE BITTERE VIRTUOOS", text: "Je check-ins laten zien dat je van een stevige, bittere toets houdt." },
};

// Groepsversie van PERSONALITY, voor de smaaktest-resultaten bij de host —
// zelfde vier smaakhoeken (sterk zit niet in de like/dislike-tags van de
// smaaktest, dat is daar een apart schuifje), maar dan "deze groep" i.p.v.
// "jij" gefraseerd.
const GROUP_PERSONALITY = {
  fruitig: { emoji: "🍓", title: "Fruitige ontdekkers", text: "Deze groep houdt vooral van fruitige, verfrissende cocktails." },
  zoet: { emoji: "🍬", title: "Zoetekauwen", text: "Deze groep heeft een zwak voor romige, zoete cocktails." },
  zuur: { emoji: "🍋", title: "Frisse zuurpruimen", text: "Deze groep houdt van scherpe, fris-zure cocktails." },
  bitter: { emoji: "🍂", title: "Bittere virtuozen", text: "Deze groep houdt van een stevige, bittere toets." },
};

// Smaaktest: "sterk" krijgt hier een eigen schuifje (1-5) i.p.v. een los
// aan/uit-tagje — geeft meer nuance dan alleen "houdt van sterk: ja/nee".
const SURVEY_TASTE_KEYS = ["fruitig", "zoet", "zuur", "bitter"];

const DIETARY_META = {
  noten: { emoji: "🥜", label: "Notenallergie" },
  lactose: { emoji: "🥛", label: "Lactose-intolerant" },
  vegan: { emoji: "🌱", label: "Veganistisch" },
  glutenvrij: { emoji: "🌾", label: "Glutenvrij" },
};

// Gastvriendelijke, korte lijst i.p.v. de volledige, lange sterkedrank-lijst
// uit de voorraad — elke optie wijst naar de onderliggende ingrediënt-id's
// zodat de aanbevelingsscore 'm later kan terugvinden in echte recepten.
const FAVORITE_SPIRIT_OPTIONS = [
  { key: "gin", label: "Gin", ids: ["gin"] },
  { key: "rum", label: "Rum", ids: ["white_rum", "dark_rum", "cachaca"] },
  { key: "whiskey", label: "Whiskey", ids: ["bourbon", "rye", "scotch", "irish_whiskey"] },
  { key: "wodka", label: "Wodka", ids: ["vodka"] },
  { key: "tequila", label: "Tequila / Mezcal", ids: ["tequila_blanco", "mezcal"] },
  { key: "cognac", label: "Cognac / Brandy", ids: ["cognac", "calvados"] },
];

const LEVEL_TITLES = [
  "Nieuwsgierige Beginner", "Bar Verkenner", "Smaaktester", "Cocktail Liefhebber",
  "Cocktail Kenner", "Fijnproever", "Huisbarman", "Cocktailkenner Pro",
  "Meestermixer", "Bar Virtuoos", "Legende van de Bar",
];
const LEVEL_THRESHOLDS = [0, 40, 100, 180, 280, 400, 550, 750, 1000, 1300, 1700];
function computeLevel(xp) {
  let idx = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) { if (xp >= LEVEL_THRESHOLDS[i]) idx = i; else break; }
  const from = LEVEL_THRESHOLDS[idx];
  const to = LEVEL_THRESHOLDS[idx + 1] ?? null;
  return { level: idx + 1, title: LEVEL_TITLES[idx], xp, from, to, progress: to ? Math.min(1, (xp - from) / (to - from)) : 1 };
}

const ACHIEVEMENT_DEFS = [
  { id: "eerste-slok", emoji: "🍸", label: "Eerste Slok", text: "Je eerste cocktail ingecheckt." },
  { id: "streak7", emoji: "🔥", label: "7 Op Rij", text: "7 dagen achter elkaar een cocktail gelogd." },
  { id: "proever", emoji: "🌍", label: "Proever", text: "10 verschillende cocktails geproefd." },
  { id: "eigen-recept", emoji: "🏠", label: "Eigen Recept", text: "Een zelf toegevoegd recept ingecheckt." },
  { id: "smaakvast", emoji: "🎯", label: "Smaakvast", text: "5 keer dezelfde cocktailfamilie gelogd." },
  { id: "vaste-klant", emoji: "⭐", label: "Vaste Klant", text: "50 check-ins verzameld." },
];

// Eigen niveau-lijn voor de Cursus, los van het Check-in-niveau: XP komt puur
// uit voltooide lessen + de eindtoets, dus "level up" in de cursus zegt iets
// over hoever je in de stof zit, niet over hoeveel je hebt ingecheckt.
const COURSE_LEVEL_TITLES = [
  "Cursist", "Leergierige Leerling", "Bar-student", "Gevorderde Mixoloog",
  "Bijna-Bartender", "Cocktail Meester", "Gediplomeerd Bartender",
];
const COURSE_LEVEL_THRESHOLDS = [0, 120, 240, 400, 560, 720, 870];
function computeCourseLevel(xp) {
  let idx = 0;
  for (let i = 0; i < COURSE_LEVEL_THRESHOLDS.length; i++) { if (xp >= COURSE_LEVEL_THRESHOLDS[i]) idx = i; else break; }
  const from = COURSE_LEVEL_THRESHOLDS[idx];
  const to = COURSE_LEVEL_THRESHOLDS[idx + 1] ?? null;
  return { level: idx + 1, title: COURSE_LEVEL_TITLES[idx], xp, from, to, progress: to ? Math.min(1, (xp - from) / (to - from)) : 1 };
}

// Eén badge per cursusdeel (voltooi alle lessen van dat deel) plus een paar
// mijlpalen — allemaal afgeleid uit `progress` (per les + eindtoets), niets
// apart bijgehouden.
const COURSE_BADGE_DEFS = [
  { id: "fundamenten", emoji: "🏛️", label: "Fundamenten Meester", text: "Alle lessen van Deel I (Fundamenten) voltooid.", partId: "fundamenten" },
  { id: "ingredienten", emoji: "🍋", label: "Ingrediënten Kenner", text: "Alle lessen van Deel II (De ingrediënten) voltooid.", partId: "ingredienten" },
  { id: "techniek", emoji: "🥃", label: "Techniek Vakman", text: "Alle lessen van Deel III (Techniek) voltooid.", partId: "techniek" },
  { id: "smaak", emoji: "🎨", label: "Smaakarchitect", text: "Alle lessen van Deel IV (Smaak & compositie) voltooid.", partId: "smaak" },
  { id: "vak", emoji: "🍸", label: "Bartender Pro", text: "Alle lessen van Deel V (Het vak van bartender) voltooid.", partId: "vak" },
  { id: "geavanceerd", emoji: "🔬", label: "Meester-mixoloog", text: "Alle lessen van Deel VI (Geavanceerde technieken) voltooid.", partId: "geavanceerd" },
  { id: "halverwege", emoji: "📖", label: "Halverwege", text: "12 van de 24 lessen voltooid." },
  { id: "eindtoets-gehaald", emoji: "🎓", label: "Geslaagd", text: "De eindtoets gehaald met minstens 70%." },
  { id: "perfecte-score", emoji: "💯", label: "Perfecte Score", text: "De eindtoets met een perfecte score afgerond." },
];
function computeCourseInsights(progress) {
  const completedLessons = COURSE_LESSONS.filter(l => progress[l.id]?.completed);
  const examProgress = progress.eindtoets;
  const examPassed = !!(examProgress?.completed && examProgress.bestScore / examProgress.total >= 0.7);
  const examPerfect = !!(examProgress?.completed && examProgress.bestScore === examProgress.total);
  const xp = completedLessons.length * 30 + (examPassed ? 150 : 0);
  const level = computeCourseLevel(xp);

  const badges = COURSE_BADGE_DEFS.map(b => {
    let unlocked = false;
    if (b.partId) {
      const partLessons = COURSE_LESSONS.filter(l => l.part === b.partId);
      unlocked = partLessons.length > 0 && partLessons.every(l => progress[l.id]?.completed);
    } else if (b.id === "halverwege") {
      unlocked = completedLessons.length >= 12;
    } else if (b.id === "eindtoets-gehaald") {
      unlocked = examPassed;
    } else if (b.id === "perfecte-score") {
      unlocked = examPerfect;
    }
    return { ...b, unlocked };
  });

  return { xp, level, badges, completedCount: completedLessons.length, examPassed };
}
// Langste reeks opeenvolgende dagen met minstens één check-in.
function longestStreak(dates) {
  const days = [...new Set(dates)].sort();
  if (days.length === 0) return 0;
  let longest = 1, current = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i]) - new Date(days[i - 1])) / 86400000);
    if (diff === 1) { current += 1; longest = Math.max(longest, current); }
    else if (diff > 1) { current = 1; }
  }
  return longest;
}

// Losgetrokken van LogboekTab zodat we exact dezelfde profiel-berekening ook
// read-only kunnen tonen voor een vriend (FriendProfileSheet) — geen eigen
// logica, puur dezelfde afleiding uit een willekeurige logboek-array.
function computeCheckinStats(logboek) {
  const total = logboek.length;
  const uniques = new Set(logboek.map(e => e.recipeId ? `id:${e.recipeId}` : `name:${e.name.trim().toLowerCase()}`)).size;
  const avg = total > 0 ? logboek.reduce((s, e) => s + e.rating, 0) / total : 0;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  // Kwart-sterren (bijv. 3.25) vallen in de dichtstbijzijnde hele-ster-emmer
  // van dit verdelingsoverzicht — anders vallen ze buiten alle vijf balken.
  logboek.forEach(e => { const bucket = Math.max(1, Math.min(5, Math.round(e.rating))); counts[bucket] = (counts[bucket] || 0) + 1; });
  const max = Math.max(1, ...Object.values(counts));
  const firstDate = total > 0 ? logboek.reduce((min, e) => e.date < min ? e.date : min, logboek[0].date) : null;
  const photos = logboek.filter(e => e.photo);
  return { total, uniques, avg, counts, max, firstDate, photos };
}

function computeCheckinInsights(logboek, recipes, allIngredients, isOwned, uniqueCount) {
  const matched = logboek.map(e => ({
    entry: e,
    recipe: e.recipeId ? recipes.find(r => r.id === e.recipeId) : recipes.find(r => r.name.toLowerCase() === e.name.trim().toLowerCase()),
  }));
  const withRecipe = matched.filter(x => x.recipe);

  const xp = logboek.length * 15 + uniqueCount * 10;
  const level = computeLevel(xp);

  const tasteTotals = { fruitig: 0, zoet: 0, zuur: 0, sterk: 0, bitter: 0 };
  matched.forEach(({ entry, recipe }) => {
    if (entry.tasteTags && entry.tasteTags.length > 0) {
      entry.tasteTags.forEach(k => { if (k in tasteTotals) tasteTotals[k] += 1; });
    } else if (recipe) {
      const weights = FAMILY_TASTE[recipe.family];
      if (weights) Object.entries(weights).forEach(([k, w]) => { tasteTotals[k] += w; });
    }
  });
  const tasteMax = Math.max(1, ...Object.values(tasteTotals));
  const taste = Object.keys(TASTE_META)
    .map(key => ({ key, ...TASTE_META[key], pct: Math.round((tasteTotals[key] / tasteMax) * 100) }))
    .sort((a, b) => b.pct - a.pct);
  const hasTaste = Object.values(tasteTotals).some(v => v > 0);
  const personality = hasTaste ? PERSONALITY[taste[0].key] : null;

  const streak = longestStreak(logboek.map(e => e.date));
  const usedCustomRecipe = withRecipe.some(({ recipe }) => recipe.id.startsWith("custom_"));
  const familyCounts = new Map();
  withRecipe.forEach(({ recipe }) => familyCounts.set(recipe.family, (familyCounts.get(recipe.family) || 0) + 1));
  const maxFamilyCount = Math.max(0, ...familyCounts.values());
  const achievements = ACHIEVEMENT_DEFS.map(a => {
    const unlocked = {
      "eerste-slok": logboek.length >= 1,
      "streak7": streak >= 7,
      "proever": uniqueCount >= 10,
      "eigen-recept": usedCustomRecipe,
      "smaakvast": maxFamilyCount >= 5,
      "vaste-klant": logboek.length >= 50,
    }[a.id];
    return { ...a, unlocked };
  });

  const spiritCounts = new Map();
  withRecipe.forEach(({ recipe }) => {
    const spirit = getBaseSpirit(recipe, allIngredients);
    if (spirit) spiritCounts.set(spirit, (spiritCounts.get(spirit) || 0) + 1);
  });
  const spiritsSorted = [...spiritCounts.entries()].sort((a, b) => b[1] - a[1]);
  const spiritTotal = spiritsSorted.reduce((s, [, c]) => s + c, 0);
  const topSpirits = spiritsSorted.slice(0, 4);
  const otherSpiritCount = spiritsSorted.slice(4).reduce((s, [, c]) => s + c, 0);
  const spirits = spiritTotal > 0 ? [
    ...topSpirits.map(([name, count]) => ({ label: name, pct: Math.round((count / spiritTotal) * 100) })),
    ...(otherSpiritCount > 0 ? [{ label: "Overig", pct: Math.round((otherSpiritCount / spiritTotal) * 100) }] : []),
  ] : [];

  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ label: KORTE_MAANDEN[d.getMonth()], count: logboek.filter(e => e.date.slice(0, 7) === key).length });
  }
  const monthMax = Math.max(1, ...months.map(m => m.count));

  const nameGroups = new Map();
  logboek.forEach(e => {
    const key = e.name.trim().toLowerCase();
    if (!nameGroups.has(key)) nameGroups.set(key, { name: e.name, ratings: [], isCustom: false });
    const g = nameGroups.get(key);
    g.ratings.push(e.rating);
    if (e.recipeId && e.recipeId.startsWith("custom_")) g.isCustom = true;
  });
  const groupsArr = [...nameGroups.values()].map(g => ({ ...g, avg: g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length, count: g.ratings.length }));
  const favoriteCocktail = groupsArr.length ? [...groupsArr].sort((a, b) => b.avg - a.avg || b.count - a.count)[0] : null;
  const favoriteHomemadeArr = groupsArr.filter(g => g.isCustom);
  const favoriteHomemade = favoriteHomemadeArr.length ? [...favoriteHomemadeArr].sort((a, b) => b.avg - a.avg || b.count - a.count)[0] : null;
  const favoriteFamilyEntry = [...familyCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const favoriteSpiritEntry = spiritsSorted[0] || null;

  // Aanbevolen voor jou (v2): i.p.v. simpelweg "meest gelogde familie, klaar"
  // nu een score per recept uit twee onafhankelijke signalen:
  //  - smaakmatch: cosinegelijkenis tussen een smaakprofiel-vector (per
  //    check-in gewogen naar wáardering én recentheid — een cocktail die je
  //    vorige week een 5 gaf telt zwaarder mee dan een 2-uit-6-maanden-
  //    geleden) en het smaakprofiel van het kandidaat-recept, over ALLE
  //    families heen i.p.v. gefilterd op precies 1 "winnende" familie.
  //  - voorraadmatch: ongewijzigd, hoeveel verplichte ingrediënten heb je al.
  // Losse berekening t.o.v. het algemene smaakprofiel hierboven (tasteTotals/
  // taste), zodat de bestaande smaakprofiel-weergave elders (LogboekTab,
  // FriendProfileSheet) exact hetzelfde blijft — puur voor deze aanbevelingen
  // een apart, fijner gewogen vector.
  const weightedTaste = { fruitig: 0, zoet: 0, zuur: 0, sterk: 0, bitter: 0 };
  const nowMs = Date.now();
  matched.forEach(({ entry, recipe }) => {
    const daysAgo = entry.date ? Math.max(0, (nowMs - new Date(entry.date).getTime()) / 86400000) : 0;
    const recencyWeight = Math.pow(0.5, daysAgo / 90); // halveert ongeveer elke 90 dagen
    const ratingWeight = Math.max(0.2, entry.rating / 5);
    const weight = recencyWeight * ratingWeight;
    const source = (entry.tasteTags && entry.tasteTags.length > 0)
      ? Object.fromEntries(entry.tasteTags.map(k => [k, 1]))
      : (recipe ? (FAMILY_TASTE[recipe.family] || {}) : {});
    Object.entries(source).forEach(([k, w]) => { if (k in weightedTaste) weightedTaste[k] += w * weight; });
  });
  const tasteVecMag = Math.sqrt(Object.values(weightedTaste).reduce((s, v) => s + v * v, 0));

  const loggedIds = new Set(withRecipe.map(({ recipe }) => recipe.id));
  let recommended = [];
  if (tasteVecMag > 0) {
    recommended = recipes
      .filter(r => !loggedIds.has(r.id))
      .map(r => {
        const rVec = FAMILY_TASTE[r.family] || {};
        const rMag = Math.sqrt(Object.values(rVec).reduce((s, v) => s + v * v, 0));
        let dot = 0;
        Object.entries(rVec).forEach(([k, w]) => { dot += w * (weightedTaste[k] || 0); });
        const tasteScore = rMag > 0 ? Math.round((dot / (rMag * tasteVecMag)) * 100) : 0;
        const required = r.ingredients.filter(i => !i.optional);
        const missing = required.filter(i => !isOwned(i));
        const matchPct = required.length ? Math.round(((required.length - missing.length) / required.length) * 100) : 100;
        const score = Math.round(tasteScore * 0.6 + matchPct * 0.4);
        return { recipe: r, matchPct, tasteScore, score };
      })
      // Op tasteScore filteren i.p.v. op de gecombineerde score: anders kan
      // een recept zonder énige smaakovereenkomst tóch bovenaan komen puur
      // omdat je de ingrediënten al in huis hebt — dat is dan geen
      // "smaakmatch" meer, alleen nog voorraad-toeval.
      .filter(x => x.tasteScore > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  } else if (favoriteFamilyEntry) {
    // Randgeval: wel check-ins, maar geen enkel bruikbaar smaaksignaal (geen
    // tags, geen herkend recept) — dan terugvallen op de oude, eenvoudigere
    // "meest gelogde familie"-regel i.p.v. niets aanbevelen.
    recommended = recipes
      .filter(r => r.family === favoriteFamilyEntry[0] && !loggedIds.has(r.id))
      .map(r => {
        const required = r.ingredients.filter(i => !i.optional);
        const missing = required.filter(i => !isOwned(i));
        const matchPct = required.length ? Math.round(((required.length - missing.length) / required.length) * 100) : 100;
        return { recipe: r, matchPct };
      })
      .sort((a, b) => b.matchPct - a.matchPct)
      .slice(0, 3);
  }

  const locationCounts = new Map();
  logboek.forEach(e => {
    const loc = (e.location || "").trim();
    if (!loc) return;
    if (!locationCounts.has(loc)) locationCounts.set(loc, { count: 0, lat: null, lon: null });
    const agg = locationCounts.get(loc);
    agg.count += 1;
    if (agg.lat == null && e.locationLat != null && e.locationLon != null) { agg.lat = e.locationLat; agg.lon = e.locationLon; }
  });
  const locations = [...locationCounts.entries()].sort((a, b) => b[1].count - a[1].count).map(([name, v]) => ({ name, count: v.count, lat: v.lat, lon: v.lon }));

  return {
    xp, level, taste, hasTaste, personality, achievements, streak,
    customUsedCount: withRecipe.filter(({ recipe }) => recipe.id.startsWith("custom_")).length,
    spirits, months, monthMax, locations,
    favoriteCocktail, favoriteHomemade, favoriteFamilyEntry, favoriteSpiritEntry,
    recommended, recentTop: matched.slice(0, 5),
  };
}

// Vrij ingetypte locatienamen ("Cocktailbar Groningen") hebben geen
// coördinaten — die zoeken we één keer op via Nominatim (OpenStreetMap) en
// bewaren we daarna in localStorage, zodat we niet bij elke render (of voor
// dezelfde plek twee keer) opnieuw het netwerk op hoeven.
const GEOCODE_CACHE_KEY = "thuisbar-geocode-cache";
function readGeocodeCache() {
  try { return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}"); } catch { return {}; }
}
function writeGeocodeCache(cache) {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch { /* niet kritiek */ }
}
// Groningen als "thuisbasis" van de kaart: default middelpunt én een zachte
// voorkeur (geen harde begrenzing) bij het zoeken, zodat een kale bar-naam
// als "De Kroeg" eerder de Groningse tent oplevert dan een gelijknamige
// ergens anders — een stad erbij typen ("Bar X, Barcelona") werkt gewoon.
const GRONINGEN = { lat: 53.2194, lon: 6.5665 };
const GRONINGEN_VIEWBOX = "6.35,53.32,6.80,53.10";

async function geocodeLocation(name) {
  const key = name.trim().toLowerCase();
  const cache = readGeocodeCache();
  if (key in cache) return cache[key];
  try {
    const params = new URLSearchParams({ format: "jsonv2", limit: "1", viewbox: GRONINGEN_VIEWBOX, bounded: "0", q: name });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const data = await res.json();
    const result = data && data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    cache[key] = result;
    writeGeocodeCache(cache);
    return result;
  } catch (e) {
    return null; // netwerkfout: niet cachen, gewoon nog eens proberen bij de volgende keer openen
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

// Live plek-zoeker (Nominatim) voor het locatieveld bij het inchecken — net
// als bij Maps typ je een naam en kies je uit echte, bestaande plekken i.p.v.
// alleen eerder ingetypte tekst. Coördinaten komen meteen mee met de keuze,
// dus die hoeven achteraf niet meer apart opgezocht te worden voor de kaart.
async function searchPlaces(query) {
  if (query.trim().length < 3) return [];
  try {
    const params = new URLSearchParams({ format: "jsonv2", limit: "6", viewbox: GRONINGEN_VIEWBOX, bounded: "0", addressdetails: "1", q: query });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const data = await res.json();
    return (data || []).map(d => {
      const parts = (d.display_name || "").split(",").map(p => p.trim());
      const place = d.address?.city || d.address?.town || d.address?.village || d.address?.municipality || "";
      return {
        label: place && !parts[0].includes(place) ? `${parts[0]}, ${place}` : parts[0],
        secondary: parts.slice(1, 3).join(", "),
        lat: parseFloat(d.lat), lon: parseFloat(d.lon),
      };
    });
  } catch (e) {
    return [];
  }
}

function PlaceAutocomplete({ value, onChange, placeholder }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => { document.removeEventListener("mousedown", onOutside); document.removeEventListener("touchstart", onOutside); };
  }, [open]);

  const handleType = (text) => {
    setQuery(text);
    onChange(text, null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setResults([]); setLoading(false); return; }
    const myId = ++requestIdRef.current;
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const places = await searchPlaces(text);
      if (myId !== requestIdRef.current) return; // gebruiker typte al verder, dit antwoord is verouderd
      setLoading(false);
      setResults(places);
      setOpen(true);
    }, 450);
  };

  const pick = (place) => {
    setQuery(place.label);
    onChange(place.label, place);
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <Search size={16} color={MUTED} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input value={query} onChange={e => handleType(e.target.value)} onFocus={() => (results.length > 0 || loading) && setOpen(true)}
        placeholder={placeholder} enterKeyHint="done" autoCapitalize="words" style={{
          width: "100%", border: "none", outline: "none", background: PAPER, borderRadius: 12,
          padding: "13px 14px 13px 40px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box",
        }} />
      {open && (loading || results.length > 0) && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: CREAM,
          borderRadius: 14, maxHeight: 240, overflowY: "auto",
          WebkitOverflowScrolling: "touch", zIndex: 30, boxShadow: SHADOW_CARD,
        }}>
          {loading && <div style={{ padding: "10px 12px", fontSize: 13.5, color: MUTED, fontFamily: systemFont }}>Plekken zoeken…</div>}
          {!loading && results.map((r, i) => (
            <div key={i} onMouseDown={e => e.preventDefault()} onClick={() => pick(r)} className="list-row-tap"
              style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 14.5, fontFamily: systemFont, fontWeight: 600, color: INK }}>{r.label}</div>
              {r.secondary && <div style={{ fontSize: 12, color: MUTED, marginTop: 1, fontFamily: systemFont }}>{r.secondary}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Echte, interactieve kaart (Leaflet + OpenStreetMap-tegels) i.p.v. een
// gestileerd plaatje — "Thuis" wordt overgeslagen (geen adres om op te
// zoeken), de rest krijgt een echte pin zodra de coördinaten binnen zijn.
function CocktailMap({ locations }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const [coords, setCoords] = useState({});

  // Alleen nog opzoeken wat geen coördinaten al meekreeg vanuit de plek-
  // kiezer bij het inchecken (die levert lat/lon meteen mee, net als Maps).
  const geocodable = useMemo(() => locations.filter(l => l.name.trim().toLowerCase() !== "thuis" && l.lat == null), [locations]);
  const namesKey = geocodable.map(l => l.name.trim().toLowerCase()).join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const loc of geocodable) {
        const key = loc.name.trim().toLowerCase();
        if (coords[key] !== undefined) continue;
        const result = await geocodeLocation(loc.name);
        if (cancelled) return;
        setCoords(prev => (prev[key] !== undefined ? prev : { ...prev, [key]: result }));
        await new Promise(r => setTimeout(r, 350));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    mapRef.current = L.map(mapElRef.current, { attributionControl: true }).setView([GRONINGEN.lat, GRONINGEN.lon], 12);
    // CARTO's gratis raster-tegels blijken inmiddels achter een verplichte
    // API-sleutel te zitten (watermark "API KEY REQUIRED" eroverheen, ook op
    // Voyager) en Esri's gratis alternatieven zijn óf te grijs/kaal (Light
    // Gray Canvas) óf te druk/topografisch (Street Map) om nog op Apple/
    // Google Maps te lijken. OpenStreetMap's standaardtegels hebben zelf al
    // het juiste kleurenregister (blauw water, groene parken, crème wegen)
    // en zijn nog gewoon gratis zonder sleutel — vrijwel geen filter overheen
    // nodig, in tegenstelling tot eerst, wat precies het "vage" gevoel gaf.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-bijdragers',
    }).addTo(mapRef.current);
    // De omliggende kaart (prestaties, statistieken) laadt boven dit kaartje
    // en kan de layout nog laten schuiven ná deze eerste render, waardoor
    // Leaflet met een verouderde breedte rekent en grijze vlakken toont.
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(mapElRef.current);
    setTimeout(() => mapRef.current?.invalidateSize(), 250);
    return () => { ro.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();
    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));"><svg viewBox="0 0 16 20" width="26" height="32"><path d="M8 0C3.6 0 0 3.6 0 8c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8z" fill="${BRASS}"/><circle cx="8" cy="8" r="3" fill="${BOTTLE_DARK}"/></svg></div>`,
      iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -30],
    });
    locations.forEach(loc => {
      const key = loc.name.trim().toLowerCase();
      const c = loc.lat != null ? { lat: loc.lat, lon: loc.lon } : coords[key];
      if (!c) return;
      const marker = L.marker([c.lat, c.lon], { icon: pinIcon }).addTo(mapRef.current)
        .bindPopup(`<strong>${escapeHtml(loc.name)}</strong><br/>${loc.count} check-in${loc.count === 1 ? "" : "s"}`);
      markersRef.current.set(key, marker);
    });
  }, [locations, coords]);

  const flyToLocation = (name) => {
    const marker = markersRef.current.get(name.trim().toLowerCase());
    if (!marker || !mapRef.current) return;
    mapRef.current.flyTo(marker.getLatLng(), 14, { duration: 0.8 });
    marker.openPopup();
  };

  const pending = geocodable.some(l => coords[l.name.trim().toLowerCase()] === undefined);

  return (
    <div>
      <div ref={mapElRef} className="thuisbar-map" style={{ height: 190, borderRadius: "14px 14px 0 0" }} />
      {pending && <div style={{ fontSize: 10.5, color: MUTED, padding: "6px 15px 0" }}>Locaties opzoeken op de kaart…</div>}
      <div style={{ padding: "13px 15px" }}>
        {locations.map(loc => {
          const hasPin = loc.lat != null || !!coords[loc.name.trim().toLowerCase()];
          return (
            <button key={loc.name} onClick={() => flyToLocation(loc.name)} disabled={!hasPin} style={{
              display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
              padding: "6px 0", borderTop: "none", borderLeft: "none", borderRight: "none",
              borderBottom: `1px dotted ${BORDER}`, background: "none", font: "inherit",
              cursor: hasPin ? "pointer" : "default", textAlign: "left",
            }}>
              <span style={{ fontSize: 12, color: hasPin ? BOTTLE : "#5C5548", fontWeight: hasPin ? 700 : 400, textDecoration: hasPin ? "underline" : "none", textDecorationColor: BORDER, textUnderlineOffset: 3 }}>{loc.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>{loc.count}</span>
            </button>
          );
        })}
        <div style={{ marginTop: 11, fontSize: 11, color: MUTED }}>{locations.length} {locations.length === 1 ? "locatie" : "locaties"} bijgehouden</div>
      </div>
    </div>
  );
}

function LogboekTab({ recipes, logboek, onAddEntry, onRemoveEntry, allIngredients, ingredientLabel, onSound, isOwned, profile, onOpenRecipe, checkinRequest, onUpdateName, onUpdatePhoto, onGoVrienden, onGoInstellingen }) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(profile?.name || "");
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const startEditName = () => { setDraftName(profile?.name || ""); setEditingName(true); };
  const saveName = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== profile?.name) onUpdateName(trimmed);
    setEditingName(false);
  };
  const handleProfilePhotoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProfilePhotoBusy(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 240;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        onUpdatePhoto(canvas.toDataURL("image/jpeg", 0.75));
        setProfilePhotoBusy(false);
      };
      img.onerror = () => setProfilePhotoBusy(false);
      img.src = ev.target.result;
    };
    reader.onerror = () => setProfilePhotoBusy(false);
    reader.readAsDataURL(file);
  };
  const [nameInput, setNameInput] = useState("");
  const [activeAchievementId, setActiveAchievementId] = useState(null);
  const matchedRecipe = useMemo(() => recipes.find(r => r.name.toLowerCase() === nameInput.trim().toLowerCase()), [recipes, nameInput]);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("Thuis");
  const [locationCoords, setLocationCoords] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [stampNumber, setStampNumber] = useState(null);
  const fileInputRef = useRef(null);
  const handleLocationChange = (text, place) => { setLocation(text); setLocationCoords(place ? { lat: place.lat, lon: place.lon } : null); };
  // Drie sliders (Zoet/Zuur, Licht/Sterk, Bitter/Fruitig) i.p.v. losse
  // smaak-chips — 50 is het neutrale midden. De derde slider dekt de twee
  // tags (bitter, fruitig) die anders bij de sliders-omslag zouden
  // wegvallen, zodat het bestaande smaakprofiel (elders in de app) nog
  // steeds op alle vijf smaken kan blijven bouwen. Bij het herkennen van een
  // recept stellen we een voorzet voor uit de bestaande familie-heuristiek,
  // maar de gebruiker kan 'm vóór het inchecken nog verschuiven.
  const [tasteBalance, setTasteBalance] = useState(50);
  const [strengthBalance, setStrengthBalance] = useState(50);
  const [fruitBalance, setFruitBalance] = useState(50);
  useEffect(() => {
    if (!matchedRecipe) return;
    const fam = FAMILY_TASTE[matchedRecipe.family] || {};
    if (fam.zuur) setTasteBalance(20);
    else if (fam.zoet) setTasteBalance(80);
    else setTasteBalance(50);
    setStrengthBalance(fam.sterk ? 75 : 40);
    if (fam.bitter) setFruitBalance(20);
    else if (fam.fruitig) setFruitBalance(80);
    else setFruitBalance(50);
  }, [matchedRecipe?.id]);
  const derivedTasteTags = () => {
    const tags = [];
    if (tasteBalance <= 35) tags.push("zuur");
    else if (tasteBalance >= 65) tags.push("zoet");
    if (strengthBalance >= 65) tags.push("sterk");
    if (fruitBalance <= 35) tags.push("bitter");
    else if (fruitBalance >= 65) tags.push("fruitig");
    return tags;
  };
  const recentCocktails = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const entry of logboek) {
      const r = entry.recipeId ? recipes.find(x => x.id === entry.recipeId) : recipes.find(x => x.name.toLowerCase() === entry.name.toLowerCase());
      if (r && !seen.has(r.id)) { seen.add(r.id); list.push(r); }
      if (list.length >= 8) break;
    }
    return list;
  }, [logboek, recipes]);

  const handlePhotoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 480;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL("image/jpeg", 0.62));
        setPhotoBusy(false);
      };
      img.onerror = () => setPhotoBusy(false);
      img.src = ev.target.result;
    };
    reader.onerror = () => setPhotoBusy(false);
    reader.readAsDataURL(file);
  };
  // Eigen foto heeft voorrang; anders alvast de foto van het gekozen recept
  // laten zien, zodat het beeldvlak nooit leeg oogt zodra er een cocktail is
  // gekozen — tikken vervangt 'm altijd door een eigen foto.
  const heroPhotoSrc = photo || (matchedRecipe ? (localItemImageUrl("cocktail", matchedRecipe.id) || matchedRecipe.image) : null);

  const addEntry = () => {
    const name = nameInput.trim();
    if (!name || rating === 0) return;
    const checkinNumber = logboek.length + 1;
    onAddEntry({
      recipeId: matchedRecipe ? matchedRecipe.id : null,
      name, rating, notes: notes.trim(), photo, location: location.trim() || "Thuis",
      locationLat: locationCoords?.lat ?? null, locationLon: locationCoords?.lon ?? null,
      tasteTags: derivedTasteTags(),
    });
    onSound("chime");
    setStampNumber(checkinNumber);
    setTimeout(() => {
      setStampNumber(null);
      closeCheckinSheet();
      setNameInput(""); setNotes(""); setRating(0); setPhoto(null); setLocation("Thuis"); setLocationCoords(null);
      setTasteBalance(50); setStrengthBalance(50); setFruitBalance(50); setMoreOpen(false);
    }, 1050);
  };
  const removeEntry = (id) => { onSound("remove"); onRemoveEntry(id); };
  const cardRefs = useRef({});
  const scrollToEntry = (id) => cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  const [showCheckinSheet, setShowCheckinSheet] = useState(false);
  const { panelRef: checkinPanelRef, closing: checkinClosing, close: closeCheckinSheet, dragHandlers: checkinDragHandlers } = useSheetDismiss(() => setShowCheckinSheet(false));
  // Extern verzoek om in te checken (centrale +-knop, of straks direct vanaf
  // een recept) — de sheet zelf blijft hier leven (portal't toch al naar
  // document.body, dus verschijnt sowieso boven elke tab).
  useEffect(() => {
    if (!checkinRequest) return;
    if (checkinRequest.name) setNameInput(checkinRequest.name);
    setShowCheckinSheet(true);
  }, [checkinRequest]);

  const stats = useMemo(() => computeCheckinStats(logboek), [logboek]);

  // Alles hieronder is een "profiel"-laag bovenop het logboek: geen nieuwe
  // opslag, puur afgeleid uit bestaande check-ins/recepten/ingrediënten, zodat
  // niets verzonnen is. Smaakprofiel en prestaties zijn bewust simpele,
  // navolgbare heuristieken (familie-indeling, tellingen), geen smaakanalyse.
  const insights = useMemo(
    () => computeCheckinInsights(logboek, recipes, allIngredients, isOwned, stats.uniques),
    [logboek, recipes, allIngredients, isOwned, stats.uniques]
  );

  const findMatch = (entry) => entry.recipeId ? recipes.find(r => r.id === entry.recipeId) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());
  const heroEntry = logboek[0] || null;
  const heroMatched = heroEntry ? findMatch(heroEntry) : null;
  const heroTint = heroMatched ? recipeTint(heroMatched, allIngredients) : [PAPER_DEEP, BORDER];
  const heroImage = heroEntry ? (heroEntry.photo || (heroMatched && (localItemImageUrl("cocktail", heroMatched.id) || heroMatched.image)) || null) : null;
  const recentGrid = useMemo(() => logboek.slice(0, 6).map(entry => ({ entry, matched: findMatch(entry) })), [logboek, recipes]);
  const topTasteKeys = useMemo(() => new Set([...insights.taste].sort((a, b) => b.pct - a.pct).slice(0, 2).map(t => t.key)), [insights.taste]);

  // Speelt een fanfare af zodra een check-in een level-up of nieuwe prestatie
  // ontgrendelt — alleen tijdens het "Proost"-venster na een echte check-in,
  // zodat het verwijderen van een oude entry niet per ongeluk ook feest viert.
  const prevLevelRef = useRef(null);
  const prevUnlockedRef = useRef(null);
  useEffect(() => {
    const unlockedIds = new Set(insights.achievements.filter(a => a.unlocked).map(a => a.id));
    if (prevLevelRef.current !== null && stampNumber != null) {
      if (insights.level.level > prevLevelRef.current) {
        setTimeout(() => onSound("levelup"), 500);
      } else {
        const newlyUnlocked = [...unlockedIds].some(id => !prevUnlockedRef.current.has(id));
        if (newlyUnlocked) setTimeout(() => onSound("unlock"), 500);
      }
    }
    prevLevelRef.current = insights.level.level;
    prevUnlockedRef.current = unlockedIds;
  }, [insights.level.level, insights.achievements, stampNumber]);

  return (
    <div>
      {/* Topbalk: vrienden linksboven, instellingen rechtsboven — net als bij Untappd altijd binnen handbereik vanaf Profiel. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={onGoVrienden} className="press-scale tap-target-44" aria-label="Vrienden" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: "50%", border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, cursor: "pointer" }}>
          <Users size={17} strokeWidth={1.8} />
        </button>
        <button onClick={onGoInstellingen} className="press-scale tap-target-44" aria-label="Instellingen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: "50%", border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, cursor: "pointer" }}>
          <Settings size={17} strokeWidth={1.8} />
        </button>
      </div>

      {/* Compacte profielstrip: identiteit + kerncijfers in één oogopslag, geen boxed dashboard-paneel meer. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoFile} style={{ display: "none" }} />
        <button onClick={() => photoInputRef.current?.click()} disabled={profilePhotoBusy} className="press-scale" style={{ position: "relative", border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0, borderRadius: "50%" }}>
          <Avatar name={profile?.name || "Jij"} photo={profile?.avatar_url} size={46} />
          <span style={{ position: "absolute", bottom: -2, right: -2, display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: BOTTLE, border: `1.5px solid ${CREAM}`, color: CREAM }}>
            <Camera size={10} strokeWidth={2} />
          </span>
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          {editingName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input value={draftName} onChange={e => setDraftName(e.target.value)} autoFocus
                autoCapitalize="words" enterKeyHint="done"
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                style={{ ...fieldStyle(), flex: 1, padding: "7px 10px", fontSize: 14.5 }} />
              <button onClick={saveName} className="press-scale" style={{ background: BOTTLE, color: CREAM, border: "none", borderRadius: RADIUS, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                Opslaan
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 17, color: INK }}>{profile?.name || "Jouw logboek"}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: "#8F6A21", background: "rgba(184,134,46,0.14)", border: "1px solid rgba(184,134,46,0.35)", borderRadius: 100, padding: "2.5px 7px", flexShrink: 0 }}>NIV. {insights.level.level}</span>
              <button onClick={startEditName} className="press-scale tap-target-44" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", border: `1px solid ${BORDER}`, background: "none", color: MUTED, cursor: "pointer", flexShrink: 0 }}>
                <Pencil size={11} />
              </button>
            </div>
          )}
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{insights.level.title}</div>
        </div>
      </div>

      {stats.total > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", padding: "0 2px", marginBottom: 14 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 21, color: BOTTLE }}><AnimatedNumber value={stats.total} /></div>
              <div style={{ fontSize: 11, color: "#5C5548", marginTop: 2 }}>check-ins</div>
            </div>
            <div style={{ width: 1, height: 28, background: BORDER }} />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 21, color: BOTTLE }}><AnimatedNumber value={stats.uniques} /></div>
              <div style={{ fontSize: 11, color: "#5C5548", marginTop: 2 }}>unieke cocktails</div>
            </div>
            <div style={{ width: 1, height: 28, background: BORDER }} />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                <Star size={12} fill={BRASS} color={BRASS} />
                <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 21, color: BOTTLE }}>{stats.avg.toFixed(1)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#5C5548", marginTop: 2 }}>gem. beoordeling</div>
            </div>
          </div>

          <div style={{ marginBottom: 26 }}>
            <div style={{ height: 3, borderRadius: 2, background: BORDER, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${insights.level.progress * 100}%`, background: `linear-gradient(90deg, ${BRASS}, #8F6A21)`, borderRadius: 2, transition: "width 1s cubic-bezier(.22,.9,.3,1)" }} />
            </div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 5, textAlign: "right" }}>{insights.level.to ? `${insights.level.xp} / ${insights.level.to} XP tot niveau ${insights.level.level + 1}` : `${insights.level.xp} XP · max niveau`}</div>
          </div>
        </>
      )}

      {/* Fotografische hero: laatste check-in als groot, karaktervol moment i.p.v. een kleine cirkel. */}
      {heroEntry ? (
        <div className="card-press" style={{ position: "relative", borderRadius: 20, overflow: "hidden", height: 360, marginBottom: 20, boxShadow: SHADOW_HERO, cursor: "pointer" }} onClick={() => scrollToEntry(heroEntry.id)}>
          {heroImage ? (
            <img src={heroImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(150deg, ${heroTint[1]}, ${heroTint[0]})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {heroMatched && <GlassArt glass={heroMatched.glass} colors={heroTint} garnishes={inferGarnishes(heroMatched, allIngredients)} rim={inferRim(heroMatched, allIngredients)} foam={inferFoam(heroMatched, allIngredients)} iceStyle={inferIceStyle(heroMatched)} size={150} />}
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(19,38,34,0.05) 0%, rgba(19,38,34,0.18) 45%, rgba(15,26,23,0.94) 100%)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "20px 20px 22px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#D8AE5E", marginBottom: 7 }}>Laatste check-in</div>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 28, color: CREAM, lineHeight: 1.1, marginBottom: 9 }}>{heroEntry.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 2 }}>
                {[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} fill={n <= heroEntry.rating ? "#D8AE5E" : "none"} color={n <= heroEntry.rating ? "#D8AE5E" : "rgba(251,246,234,0.4)"} />)}
              </div>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(251,246,234,0.5)" }} />
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(251,246,234,0.82)", fontWeight: 500 }}>
                <MapPin size={10} color="rgba(251,246,234,0.82)" /> {heroEntry.location}
              </span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(251,246,234,0.5)" }} />
              <span style={{ fontSize: 12, color: "rgba(251,246,234,0.82)", fontWeight: 500 }}>{heroEntry.date}</span>
            </div>
            {heroEntry.notes && <p style={{ margin: "10px 0 0", fontFamily: serif, fontStyle: "italic", fontSize: 13.5, color: "rgba(251,246,234,0.88)", lineHeight: 1.5, maxWidth: 300 }}>&ldquo;{heroEntry.notes}&rdquo;</p>}
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 20, border: `1px dashed ${BORDER}`, padding: "30px 20px", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 17, color: INK, marginBottom: 4 }}>Nog geen check-ins</div>
          <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Log je eerste cocktail hieronder — dit wordt jouw eigen barlogboek.</p>
        </div>
      )}

      {/* Snel inchecken: opent het formulier als popup i.p.v. ernaartoe te scrollen. */}
      <button onClick={() => { onSound("pop"); setShowCheckinSheet(true); }} className="press-scale" style={{
        display: "flex", alignItems: "center", gap: 11, width: "100%", boxSizing: "border-box", padding: "13px 16px",
        borderRadius: 100, background: CREAM, border: `1.5px solid ${BORDER}`, boxShadow: "0 3px 10px -4px rgba(43,38,32,0.12)",
        cursor: "pointer", marginBottom: 30,
      }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(184,134,46,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Plus size={13} color={BRASS} strokeWidth={2.4} />
        </span>
        <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 14.5, color: MUTED, flex: 1, textAlign: "left" }}>Cocktail inchecken</span>
        <ChevronRight size={14} color="#ABA18F" />
      </button>

      {insights.hasTaste && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Jouw smaak</SectionLabel>
          {insights.personality && (
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 19, color: INK, lineHeight: 1.3, marginBottom: 8 }}>{insights.personality.emoji} {insights.personality.title}</div>
          )}
          {insights.personality && <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#5C5548", lineHeight: 1.55 }}>{insights.personality.text}</p>}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18, height: 52, padding: "0 2px" }}>
            {insights.taste.map(t => (
              <div key={t.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 7, height: Math.max(6, (t.pct / 100) * 46), borderRadius: "4px 4px 1px 1px",
                  background: topTasteKeys.has(t.key) ? `linear-gradient(180deg, #D8AE5E, ${BRASS})` : BORDER,
                }} />
                <span style={{ fontSize: 11, fontWeight: topTasteKeys.has(t.key) ? 700 : 500, color: topTasteKeys.has(t.key) ? INK : MUTED }}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentGrid.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <SectionLabel>Recente check-ins</SectionLabel>
            <span style={{ fontSize: 11.5, color: MUTED }}>{stats.total} check-ins</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
            {recentGrid.map(({ entry, matched }, i) => {
              const img = entry.photo || (matched && (localItemImageUrl("cocktail", matched.id) || matched.image)) || null;
              const tint = matched ? recipeTint(matched, allIngredients) : [PAPER_DEEP, BORDER];
              const corner = i === 0 ? "10px 0 0 0" : i === 2 ? "0 10px 0 0" : i === recentGrid.length - 3 ? "0 0 0 10px" : i === recentGrid.length - 1 ? "0 0 10px 0" : "0";
              return (
                <button key={entry.id} onClick={() => scrollToEntry(entry.id)} style={{
                  position: "relative", aspectRatio: "1", overflow: "hidden", border: "none", padding: 0, cursor: "pointer", borderRadius: corner,
                  background: img ? "none" : `linear-gradient(150deg, ${tint[1]}, ${tint[0]})`,
                }}>
                  {img ? (
                    <img src={img} alt={entry.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER, display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Martini size={26} color="rgba(251,246,234,0.85)" strokeWidth={1.3} />
                    </div>
                  )}
                  <div style={{ position: "absolute", left: 6, bottom: 6, display: "flex", alignItems: "center", gap: 3, background: "rgba(19,38,34,0.55)", borderRadius: 100, padding: "2px 7px" }}>
                    <Star size={9} fill="#D8AE5E" color="#D8AE5E" />
                    <span style={{ fontSize: 10, color: CREAM, fontWeight: 600 }}>{formatRating(entry.rating)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(() => {
        const activeAch = insights.achievements.find(a => a.id === activeAchievementId) || insights.achievements.find(a => a.unlocked) || insights.achievements[0];
        return (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Prestaties</SectionLabel>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
              {insights.achievements.map(a => (
                <button key={a.id} onClick={() => setActiveAchievementId(a.id)} style={{
                  border: "none", background: "none", padding: 0, margin: 0, cursor: "pointer", width: 72, flexShrink: 0,
                  color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                }}>
                  <div style={{
                    position: "relative", width: 58, height: 58, borderRadius: "50%",
                    background: a.unlocked ? `linear-gradient(150deg, #2C5148, ${BOTTLE_DARK})` : PAPER_DEEP,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: a.unlocked ? SHADOW_CARD : "none",
                    border: a.unlocked ? `2px solid ${BRASS}` : `1.5px dashed ${BORDER}`,
                  }}>
                    <span style={{ fontSize: 23, opacity: a.unlocked ? 1 : 0.4, filter: a.unlocked ? "none" : "grayscale(1)" }}>{a.emoji}</span>
                    {!a.unlocked && (
                      <div style={{ position: "absolute", bottom: -2, right: -2, width: 19, height: 19, borderRadius: "50%", background: CREAM, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Lock size={9} color={MUTED} strokeWidth={2.6} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11.5, textAlign: "center", lineHeight: 1.25, color: a.unlocked ? "#4A4438" : "#7D7461", fontWeight: 600 }}>{a.label}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: "11px 13px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 17 }}>{activeAch.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{activeAch.label}{!activeAch.unlocked && " (nog niet ontgrendeld)"}</div>
                <div style={{ fontSize: 12, color: "#5C5548", marginTop: 1 }}>{activeAch.text}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {insights.locations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Jouw cocktailkaart</SectionLabel>
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", boxShadow: SHADOW_CARD }}>
            <CocktailMap locations={insights.locations} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Statistieken</SectionLabel>
        <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px 6px" }}>
            {[
              { value: stats.total, label: "Cocktails geproefd" },
              { value: stats.uniques, label: "Unieke cocktails" },
              { value: stats.avg.toFixed(1), label: "Gem. beoordeling" },
              { value: insights.customUsedCount, label: "Eigen recepten" },
              { value: insights.streak, label: "Langste streak (dagen)" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 20, color: BOTTLE }}>{s.value}</div>
                <div style={{ fontSize: 11.5, color: "#5C5548", marginTop: 3, lineHeight: 1.3, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ margin: "18px 0 4px", paddingTop: 16, borderTop: `1px dashed ${BORDER}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, color: "#4A4438", marginBottom: 12 }}>Check-ins per maand</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
              {insights.months.map((m, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 7 }}>
                  <div style={{ width: "100%", maxWidth: 15, borderRadius: "3px 3px 1px 1px", background: `linear-gradient(180deg, ${BRASS}, #8F6A21)`, height: `${Math.max(4, (m.count / insights.monthMax) * 100)}%`, opacity: i === insights.months.length - 1 ? 1 : 0.75, transition: "height 1s cubic-bezier(.22,.9,.3,1)" }} />
                  <span style={{ fontSize: 11, color: "#5C5548", fontWeight: 600 }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {insights.spirits.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px dashed ${BORDER}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.3, color: "#4A4438", marginBottom: 12 }}>Meest gebruikte drank</div>
              {insights.spirits.map((sp, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, color: INK, width: 90, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>{sp.label}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: BORDER, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 4, background: BRASS, width: `${sp.pct}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: "#5C5548", fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{sp.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(insights.favoriteCocktail || insights.favoriteFamilyEntry) && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Jouw favorieten</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 11 }}>
            {insights.favoriteCocktail && (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderLeft: `3px solid #7A2E2A`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: "#5C5548", fontWeight: 700 }}><span style={{ fontSize: 14 }}>❤️</span> Favoriete cocktail</div>
                <div style={{ marginTop: 4, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: INK, lineHeight: 1.3 }}>{insights.favoriteCocktail.name}</div>
              </div>
            )}
            {insights.favoriteHomemade && (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${SAGE}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: "#5C5548", fontWeight: 700 }}><span style={{ fontSize: 14 }}>🏠</span> Favoriet eigen recept</div>
                <div style={{ marginTop: 4, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: INK, lineHeight: 1.3 }}>{insights.favoriteHomemade.name}</div>
              </div>
            )}
            {insights.favoriteFamilyEntry && (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${BRASS}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: "#5C5548", fontWeight: 700 }}><span style={{ fontSize: 14 }}>🍸</span> Favoriete stijl</div>
                <div style={{ marginTop: 4, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: INK, lineHeight: 1.3 }}>{insights.favoriteFamilyEntry[0]}</div>
              </div>
            )}
            {insights.favoriteSpiritEntry && (
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${MUTED}`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: "#5C5548", fontWeight: 700 }}><span style={{ fontSize: 14 }}>🥃</span> Favoriete drank</div>
                <div style={{ marginTop: 4, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: INK, lineHeight: 1.3 }}>{insights.favoriteSpiritEntry[0]}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {insights.recommended.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel>✨ Aanbevolen voor jou</SectionLabel>
          <div style={{ fontSize: 12.5, color: "#5C5548", margin: "-6px 0 13px" }}>Gebaseerd op je smaakprofiel en je voorraad</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {insights.recommended.map(({ recipe, matchPct }) => (
              <button key={recipe.id} onClick={() => { onSound("pop"); onOpenRecipe(recipe.id); }} className="press-scale" style={{ width: 132, flexShrink: 0, textAlign: "center", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: 10, position: "relative", cursor: "pointer", fontFamily: sans }}>
                <div style={{ position: "absolute", top: 8, right: 8, background: BOTTLE_DARK, border: `1px solid rgba(245,239,230,0.25)`, borderRadius: 100, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: BRASS }}>{matchPct}%</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                  <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={48} />
                </div>
                <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: INK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{recipe.name}</div>
                <div style={{ fontSize: 11, color: "#5C5548", marginTop: 4, fontWeight: 500 }}>{recipe.family}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCheckinSheet && createPortal((
        <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div className="sheet-backdrop-in" onClick={closeCheckinSheet} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: checkinClosing ? 0 : 1, transition: "opacity 0.22s ease" }} />
          <div ref={checkinPanelRef} className="sheet-slide-in" style={{
            position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "92vh",
            background: PAPER_DEEP, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header: alleen titel + sluitknop, geen verloop en geen icoon-cirkel */}
            <div {...checkinDragHandlers} style={{ padding: "9px 16px 12px", background: PAPER_DEEP, borderBottom: `1px solid ${BORDER}`, touchAction: "none", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <div style={{ width: 36, height: 4.5, borderRadius: 3, background: BORDER }} />
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ flex: 1, fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK }}>Check-in</div>
                <button onClick={closeCheckinSheet} onTouchStart={(e) => e.stopPropagation()} aria-label="Sluiten" className="tap-target-44" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
                  borderRadius: "50%", background: PAPER, border: "none", cursor: "pointer", color: INK, flexShrink: 0,
                }}><X size={16} /></button>
              </div>
            </div>

            <div style={{ background: PAPER_DEEP, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", flex: 1, minHeight: 0 }}>
              {/* Beeldvlak 4:3: eigen foto, anders de foto van het gekozen recept, anders een rustige placeholder. Tikken opent de camera/foto-kiezer. */}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoFile} style={{ display: "none" }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy} style={{
                position: "relative", display: "block", margin: "18px 20px 0", width: "calc(100% - 40px)",
                aspectRatio: "4 / 3", border: "none", borderRadius: 20, padding: 0,
                cursor: photoBusy ? "default" : "pointer", overflow: "hidden",
                background: heroPhotoSrc ? "none" : `radial-gradient(ellipse 420px 260px at 50% 20%, #2A4B42, ${BOTTLE_DARK} 75%)`,
              }}>
                {heroPhotoSrc ? (
                  <img src={heroPhotoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(251,246,234,0.55)" }}>
                    <Martini size={30} strokeWidth={1.3} />
                    <span style={{ fontFamily: systemFont, fontSize: 14, color: "rgba(251,246,234,0.85)" }}>{photoBusy ? "Bezig…" : "Kies je cocktail"}</span>
                  </div>
                )}
                <div style={{ position: "absolute", right: 12, bottom: 12, width: 34, height: 34, borderRadius: "50%", background: heroPhotoSrc ? "rgba(20,16,10,0.55)" : "rgba(251,246,234,0.14)", border: heroPhotoSrc ? "none" : "1px solid rgba(251,246,234,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Camera size={15} color="#FBF6EA" />
                </div>
                {photo && (
                  <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setPhoto(null); }} aria-label="Eigen foto verwijderen" style={{ position: "absolute", left: 12, top: 12, width: 28, height: 28, borderRadius: "50%", background: "rgba(20,16,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={13} color="#FBF6EA" />
                  </div>
                )}
              </button>

              <div style={{ padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
                <RecipeSearchWithPhotos recipes={recipes} value={nameInput} onChange={setNameInput}
                  onSelect={(r) => setNameInput(r.name)} allIngredients={allIngredients} recent={recentCocktails} />

                <div>
                  <StarPicker value={rating} onChange={setRating} size={32} onSound={onSound} />
                  <input type="range" min="0" max="5" step="0.25" value={rating}
                    onChange={e => { const v = Number(e.target.value); if (v !== rating) onSound("tick"); setRating(v); }}
                    style={{ width: "100%", accentColor: BRASS, marginTop: 12 }} />
                </div>

                <AutoGrowTextField value={notes} onChange={setNotes} placeholder="Voeg een notitie toe…" />

                <div>
                  <button onClick={() => setMoreOpen(v => !v)} style={{ display: "flex", alignItems: "center", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: systemFont, fontSize: 15.5, fontWeight: 600, color: INK }}>
                    <span style={{ flex: 1, textAlign: "left" }}>Meer toevoegen</span>
                    {moreOpen ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                  </button>

                  {moreOpen && (
                    <div className="accordion-reveal" style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 20 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED, marginBottom: 9, fontFamily: systemFont }}>
                          <span>Zuur</span><span>Zoet</span>
                        </div>
                        <input type="range" min="0" max="100" value={tasteBalance} onChange={e => setTasteBalance(Number(e.target.value))} style={{ width: "100%", accentColor: BRASS }} />
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED, marginBottom: 9, fontFamily: systemFont }}>
                          <span>Licht</span><span>Sterk</span>
                        </div>
                        <input type="range" min="0" max="100" value={strengthBalance} onChange={e => setStrengthBalance(Number(e.target.value))} style={{ width: "100%", accentColor: BRASS }} />
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED, marginBottom: 9, fontFamily: systemFont }}>
                          <span>Bitter</span><span>Fruitig</span>
                        </div>
                        <input type="range" min="0" max="100" value={fruitBalance} onChange={e => setFruitBalance(Number(e.target.value))} style={{ width: "100%", accentColor: BRASS }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: MUTED, marginBottom: 9, fontFamily: systemFont }}>Locatie</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                          {["Thuis", "Bar", "Bij vrienden"].map(label => {
                            const active = location === label;
                            return (
                              <button key={label} onClick={() => handleLocationChange(label, null)} style={{
                                padding: "8px 14px", borderRadius: 100, border: "none",
                                background: active ? BOTTLE : PAPER, color: active ? CREAM : INK,
                                fontFamily: systemFont, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                              }}>{label}</button>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 7, fontFamily: systemFont }}>Of zoek een eigen locatie</div>
                        <PlaceAutocomplete value={location} onChange={handleLocationChange} placeholder="Bar, adres of stad…" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 20px calc(env(safe-area-inset-bottom) + 14px)", background: PAPER_DEEP, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
              {(() => {
                const canSubmit = nameInput.trim().length > 0 && rating > 0;
                return (
                  <button onClick={addEntry} disabled={!canSubmit} style={{
                    width: "100%", background: canSubmit ? BOTTLE : BORDER, color: canSubmit ? "#FBF6EA" : "#9C927A",
                    border: "none", borderRadius: 14, padding: "15px 18px", fontSize: 16, fontWeight: 700,
                    fontFamily: systemFont, cursor: canSubmit ? "pointer" : "default",
                  }}>
                    Inchecken
                  </button>
                );
              })()}
            </div>

            {stampNumber != null && (
              <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,16,10,0.4)" }}>
                <div className="stamp-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: CREAM, border: `3px solid ${BOTTLE}`, borderRadius: 20, padding: "26px 34px", boxShadow: "0 10px 34px rgba(20,16,10,0.4)" }}>
                  <div style={{ width: 50, height: 50, borderRadius: "50%", background: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={26} color="#FBF6EA" strokeWidth={3} />
                  </div>
                  <div style={{ fontFamily: systemFont, fontWeight: 800, fontSize: 16, color: BOTTLE, textAlign: "center", lineHeight: 1.35 }}>
                    Cocktail #{stampNumber}<br />geproefd
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ), document.body)}

      {logboek.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "20px 0" }}>Nog geen check-ins.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {logboek.map(entry => {
            const matched = entry.recipeId ? recipes.find(r => r.id === entry.recipeId) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());
            const tint = matched ? recipeTint(matched, allIngredients) : null;
            const circle = matched ? <RecipeCircle recipe={matched} allIngredients={allIngredients} size={54} /> : (
              <div style={{ width: 54, height: 54, borderRadius: "50%", background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <NotebookPen size={21} color={MUTED} />
              </div>
            );
            let ingredientsLine = null;
            if (matched) {
              const names = matched.ingredients.map(ing => ingredientLabel(ing));
              ingredientsLine = names.length > 5 ? `${names.slice(0, 5).join(" · ")} + ${names.length - 5} meer` : names.join(" · ");
            }
            const ratingBadge = (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "5px 10px" }}>
                <Star size={12} fill={BRASS} color={BRASS} />
                <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 13, color: BOTTLE }}>{formatRating(entry.rating)}</span>
              </div>
            );
            return (
              <div key={entry.id} ref={el => cardRefs.current[entry.id] = el} style={{ position: "relative", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 18, boxShadow: SHADOW_CARD, scrollMarginTop: 20 }}>
                {tint && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, borderRadius: "18px 0 0 18px", background: `linear-gradient(180deg, ${tint[1]}, ${tint[0]})` }} />}
                {entry.photo && (
                  <div style={{ position: "relative", width: "100%", height: 172 }}>
                    <img src={entry.photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "18px 18px 0 0" }} />
                    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 4, background: "rgba(20,16,10,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", borderRadius: 100, padding: "5px 11px", border: "1px solid rgba(255,255,255,0.25)" }}>
                      <Star size={12} fill={BRASS} color={BRASS} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: CREAM }}>{formatRating(entry.rating)}</span>
                    </div>
                    <div style={{ position: "absolute", left: 18, bottom: -22, width: 64, height: 64, borderRadius: "50%", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(20,16,10,0.35)" }}>
                      {circle}
                    </div>
                  </div>
                )}
                <div style={{ padding: "16px 18px 16px", paddingLeft: tint ? 22 : 18, paddingTop: entry.photo ? 32 : 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ display: "flex", gap: 14, minWidth: 0, alignItems: "center" }}>
                      {!entry.photo && (
                        <div style={{ position: "relative", width: 54, height: 54, flexShrink: 0 }}>
                          {tint && <div style={{ position: "absolute", inset: -7, borderRadius: "50%", background: `radial-gradient(circle, ${tint[0]}66, transparent 72%)`, zIndex: 0 }} />}
                          <div style={{ position: "relative", zIndex: 1 }}>{circle}</div>
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, color: INK, fontSize: 17.5 }}>{entry.name}</div>
                        {matched && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{matched.family} · {matched.glass}</div>}
                      </div>
                    </div>
                    {!entry.photo && ratingBadge}
                  </div>

                  {entry.tasteTags && entry.tasteTags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
                      {entry.tasteTags.filter(k => TASTE_META[k]).map(k => (
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: "#8F6A21", background: "rgba(184,134,46,0.12)", border: "1px solid rgba(184,134,46,0.3)", borderRadius: 100, padding: "3px 9px" }}>
                          {TASTE_META[k].emoji} {TASTE_META[k].label}
                        </span>
                      ))}
                    </div>
                  )}

                  {ingredientsLine && (
                    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, margin: "12px 0 0", paddingTop: 10, borderTop: `1px dotted ${BORDER}` }}>
                      {ingredientsLine}
                    </div>
                  )}

                  {entry.notes && (
                    <p style={{ fontFamily: serif, fontStyle: "italic", fontSize: 13.5, color: INK, margin: "10px 0 0", paddingLeft: 10, borderLeft: `2px solid ${BRASS}`, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      “{entry.notes}”
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${BORDER}` }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#5C5548", fontWeight: 500 }}>
                      {entry.location && <MapPin size={11} color="#5C5548" />}
                      {entry.date}{entry.location ? ` · ${entry.location}` : ""}
                    </span>
                    <button onClick={() => removeEntry(entry.id)} className="press-scale" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: "50%" }}><Trash2 size={14} color={MUTED} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AVATAR_COLORS = [BOTTLE, BRASS, BURGUNDY, SAGE, "#6B4A2E"];
function Avatar({ name, photo, size = 38 }) {
  if (photo) {
    return <img src={photo} alt="" loading="lazy" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />;
  }
  const color = AVATAR_COLORS[hashString(name || "?") % AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, background: color, color: CREAM,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: serif, fontWeight: 700, fontStyle: "italic", fontSize: size * 0.42,
    }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

// Read-only variant van het eigen Check-in-profiel, voor een vriend: zelfde
// computeCheckinStats/computeCheckinInsights als LogboekTab, maar dan gevoed
// met de check-ins van de vriend (die RLS je al toont zodra jullie
// geaccepteerde vrienden zijn) i.p.v. je eigen logboek. Geen "aanbevolen voor
// jou" of kaart-sectie — die zijn aan JOUW voorraad/locaties gekoppeld en dus
// niet zinvol in andermans profiel.
function FriendProfileSheet({ friendId, friendProfile, recipes, allIngredients, onClose, session, onBlocked }) {
  const [logboek, setLogboek] = useState(null);
  const myId = session?.user?.id;
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const blockUser = async () => {
    if (!myId || blocking) return;
    setBlocking(true);
    await supabase.from("blocked_users").insert({ blocker_id: myId, blocked_id: friendId });
    await supabase.from("friendships").delete().or(`and(requester_id.eq.${myId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${myId})`);
    setBlocking(false);
    onBlocked?.();
  };

  useEffect(() => {
    let cancelled = false;
    supabase.from("checkins").select("*").eq("user_id", friendId).order("created_at", { ascending: false })
      .then(({ data }) => { if (!cancelled) setLogboek((data || []).map(checkinRowToEntry)); });
    return () => { cancelled = true; };
  }, [friendId]);

  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = useMemo(() => (logboek ? computeCheckinStats(logboek) : null), [logboek]);
  const insights = useMemo(
    () => (logboek && stats) ? computeCheckinInsights(logboek, recipes, allIngredients, () => false, stats.uniques) : null,
    [logboek, stats, recipes, allIngredients]
  );
  const name = friendProfile?.name || "Vriend";

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "88vh",
        background: PAPER, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, touchAction: "none" }}>
          <Avatar name={name} photo={friendProfile?.avatar_url} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 19, color: INK }}>{name}</div>
            {insights && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{insights.level.title} · niveau {insights.level.level}</div>}
          </div>
          <button onClick={close} aria-label="Sluiten" className="tap-target-44" style={{
            display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
            borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK, flexShrink: 0,
          }}><X size={16} /></button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "8px 20px 0", flexShrink: 0 }}>
          {!confirmBlock ? (
            <button onClick={() => setConfirmBlock(true)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
              <UserX size={12} /> Blokkeer gebruiker
            </button>
          ) : (
            <>
              <span style={{ fontSize: 12, color: MUTED }}>Weet je het zeker?</span>
              <button onClick={blockUser} disabled={blocking} style={{ background: "none", border: "none", color: BURGUNDY, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>
                {blocking ? "Bezig…" : "Ja, blokkeer"}
              </button>
              <button onClick={() => setConfirmBlock(false)} style={{ background: "none", border: "none", color: MUTED, fontSize: 12, cursor: "pointer", padding: 0 }}>Annuleer</button>
            </>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "18px 20px" }}>
          {!logboek ? (
            <p style={{ color: MUTED, fontSize: 13.5, textAlign: "center", padding: "40px 0" }}>Bezig met laden…</p>
          ) : logboek.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13.5, textAlign: "center", padding: "40px 0" }}>{name} heeft nog niets ingecheckt.</p>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <SectionLabel>Statistieken</SectionLabel>
                <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "14px 6px" }}>
                    {[
                      { value: stats.total, label: "Cocktails geproefd" },
                      { value: stats.uniques, label: "Unieke cocktails" },
                      { value: stats.avg.toFixed(1), label: "Gem. beoordeling" },
                      { value: insights.customUsedCount, label: "Eigen recepten" },
                      { value: insights.streak, label: "Langste streak (dagen)" },
                    ].map((s, i) => (
                      <div key={i} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 18, color: BOTTLE }}>{s.value}</div>
                        <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2, lineHeight: 1.25 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {insights.hasTaste && (
                <div style={{ marginBottom: 24 }}>
                  <SectionLabel>Smaakprofiel</SectionLabel>
                  <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
                    {insights.taste.map(t => (
                      <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
                        <span style={{ fontSize: 15, width: 18, textAlign: "center", flexShrink: 0 }}>{t.emoji}</span>
                        <span style={{ fontSize: 12, color: INK, width: 50, flexShrink: 0 }}>{t.label}</span>
                        <div style={{ flex: 1, height: 7, borderRadius: 4, background: BORDER, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 4, background: BRASS, width: `${t.pct}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: MUTED, fontWeight: 700, width: 32, textAlign: "right", flexShrink: 0 }}>{t.pct}%</span>
                      </div>
                    ))}
                    {insights.personality && (
                      <div style={{ marginTop: 6, padding: 14, borderRadius: 10, background: "linear-gradient(135deg, rgba(184,134,46,0.16), rgba(184,134,46,0.03))", border: "1px solid rgba(184,134,46,0.25)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ fontSize: 22 }}>{insights.personality.emoji}</span>
                          <span style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: "#8F6A21" }}>{insights.personality.title}</span>
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#5C5548", fontStyle: "italic", lineHeight: 1.5 }}>"{insights.personality.text}"</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 24 }}>
                <SectionLabel>Prestaties</SectionLabel>
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
                  {insights.achievements.map(a => (
                    <div key={a.id} title={a.text} style={{ width: 72, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                      <div style={{
                        position: "relative", width: 58, height: 58, borderRadius: "50%",
                        background: a.unlocked ? `linear-gradient(150deg, #2C5148, ${BOTTLE_DARK})` : PAPER_DEEP,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: a.unlocked ? SHADOW_CARD : "none",
                        border: a.unlocked ? `2px solid ${BRASS}` : `1.5px dashed ${BORDER}`,
                      }}>
                        <span style={{ fontSize: 23, opacity: a.unlocked ? 1 : 0.4, filter: a.unlocked ? "none" : "grayscale(1)" }}>{a.emoji}</span>
                        {!a.unlocked && (
                          <div style={{ position: "absolute", bottom: -2, right: -2, width: 19, height: 19, borderRadius: "50%", background: CREAM, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Lock size={9} color={MUTED} strokeWidth={2.6} />
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 10, textAlign: "center", lineHeight: 1.25, color: a.unlocked ? "#5C5548" : "#ABA18F", fontWeight: 600 }}>{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {(insights.favoriteCocktail || insights.favoriteFamilyEntry || insights.favoriteSpiritEntry) && (
                <div style={{ marginBottom: 24 }}>
                  <SectionLabel>Favorieten</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 11 }}>
                    {insights.favoriteCocktail && (
                      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: -18, right: -18, width: 62, height: 62, borderRadius: "50%", background: "rgba(122,46,42,0.14)" }} />
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, position: "relative" }}>❤️</div>
                        <div style={{ marginTop: 9, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED, position: "relative" }}>Favoriete cocktail</div>
                        <div style={{ marginTop: 2, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13.5, color: INK, position: "relative", lineHeight: 1.25 }}>{insights.favoriteCocktail.name}</div>
                      </div>
                    )}
                    {insights.favoriteFamilyEntry && (
                      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: -18, right: -18, width: 62, height: 62, borderRadius: "50%", background: "rgba(184,134,46,0.16)" }} />
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, position: "relative" }}>🍸</div>
                        <div style={{ marginTop: 9, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED, position: "relative" }}>Favoriete stijl</div>
                        <div style={{ marginTop: 2, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13.5, color: INK, position: "relative", lineHeight: 1.25 }}>{insights.favoriteFamilyEntry[0]}</div>
                      </div>
                    )}
                    {insights.favoriteSpiritEntry && (
                      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: -18, right: -18, width: 62, height: 62, borderRadius: "50%", background: "rgba(138,129,113,0.16)" }} />
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, position: "relative" }}>🥃</div>
                        <div style={{ marginTop: 9, fontSize: 9.5, letterSpacing: 0.4, textTransform: "uppercase", color: MUTED, position: "relative" }}>Favoriete drank</div>
                        <div style={{ marginTop: 2, fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 13.5, color: INK, position: "relative", lineHeight: 1.25 }}>{insights.favoriteSpiritEntry[0]}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <SectionLabel>Recente check-ins</SectionLabel>
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden" }}>
                {logboek.slice(0, 8).map((e, i) => {
                  const matched = e.recipeId ? recipes.find(r => r.id === e.recipeId) : recipes.find(r => r.name.toLowerCase() === e.name.toLowerCase());
                  return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < Math.min(8, logboek.length) - 1 ? `1px solid ${BORDER}` : "none" }}>
                    {matched ? <RecipeCircle recipe={matched} allIngredients={allIngredients} size={36} /> : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <NotebookPen size={15} color={MUTED} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 14, color: INK }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{e.date} · {e.location}</div>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: 3, color: BRASS, fontWeight: 700, fontSize: 12, flexShrink: 0 }}><Star size={11} fill={BRASS} /> {formatRating(e.rating)}</span>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

// Vrienden + feed: vrienden zoeken/beheren draait op de `friendships`-tabel
// (twee kanten: requester/addressee, status pending/accepted), de feed leest
// gewoon uit dezelfde `checkins`-tabel als je eigen logboek — RLS zorgt dat je
// alléén rijen van geaccepteerde vrienden binnenkrijgt, niet van iedereen.
function VriendenTab({ session, profile, recipes, allIngredients, onSound, active }) {
  const myId = session.user.id;
  const [friendships, setFriendships] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [shareState, setShareState] = useState(null);
  const [openFriendId, setOpenFriendId] = useState(null);

  const shareInvite = async () => {
    const url = `${window.location.origin}${window.location.pathname}?invite=${myId}`;
    const text = "Voeg me toe als vriend in Mijn Thuisbar, dan zien we elkaars check-ins!";
    try {
      if (navigator.share) { await navigator.share({ title: "Mijn Thuisbar", text, url }); setShareState("shared"); }
      else { await navigator.clipboard.writeText(url); setShareState("copied"); }
    } catch (e) {
      if (e.name !== "AbortError") {
        try { await navigator.clipboard.writeText(url); setShareState("copied"); } catch { setShareState("failed"); }
      }
    }
    setTimeout(() => setShareState(null), 2500);
  };

  const loadFriendships = async () => {
    const { data } = await supabase.from("friendships").select("*").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
    const rows = data || [];
    setFriendships(rows);
    const otherIds = [...new Set(rows.map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id)))];
    if (otherIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, name, avatar_url").in("id", otherIds);
      const map = {};
      (profs || []).forEach(p => { map[p.id] = p; });
      setProfilesById(map);
    } else {
      setProfilesById({});
    }
  };

  useEffect(() => { if (active) loadFriendships(); }, [myId, active]);

  const [blockedIds, setBlockedIds] = useState(() => new Set());
  useEffect(() => {
    if (!active || !myId) return;
    supabase.from("blocked_users").select("blocked_id").eq("blocker_id", myId)
      .then(({ data }) => setBlockedIds(new Set((data || []).map(b => b.blocked_id))));
  }, [myId, active]);

  const accepted = friendships.filter(f => f.status === "accepted");
  const incoming = friendships.filter(f => f.status === "pending" && f.addressee_id === myId);
  const outgoing = friendships.filter(f => f.status === "pending" && f.requester_id === myId);

  const knownIds = useMemo(() => new Set(friendships.map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id))), [friendships]);

  const doSearch = async (val) => {
    setQuery(val);
    const q = val.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from("profiles").select("id, name, avatar_url").ilike("name", `%${q}%`).neq("id", myId).limit(10);
    setSearching(false);
    setSearchResults((data || []).filter(p => !knownIds.has(p.id) && !blockedIds.has(p.id)));
  };

  const sendRequest = async (targetId) => {
    setBusyId(targetId);
    const { error } = await supabase.from("friendships").insert({ requester_id: myId, addressee_id: targetId, status: "pending" });
    setBusyId(null);
    if (!error) {
      onSound("pop");
      setSearchResults(r => r.filter(p => p.id !== targetId));
      loadFriendships();
    }
  };
  const acceptRequest = async (friendshipId) => {
    setBusyId(friendshipId);
    await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
    setBusyId(null);
    onSound("unlock");
    loadFriendships();
  };
  const removeFriendship = async (friendshipId) => {
    setBusyId(friendshipId);
    await supabase.from("friendships").delete().eq("id", friendshipId);
    setBusyId(null);
    onSound("remove");
    loadFriendships();
  };

  const rowStyle = { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" };

  return (
    <div>
      {incoming.length > 0 && (
        <>
          <SectionLabel>Vriendschapsverzoeken</SectionLabel>
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden", marginBottom: 26 }}>
            {incoming.map((f, i) => (
              <div key={f.id} style={{ ...rowStyle, borderBottom: i < incoming.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <Avatar name={profilesById[f.requester_id]?.name} photo={profilesById[f.requester_id]?.avatar_url} size={32} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: INK }}>{profilesById[f.requester_id]?.name || "…"}</span>
                <button onClick={() => acceptRequest(f.id)} disabled={busyId === f.id} className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", border: "none", background: SAGE, color: CREAM, cursor: "pointer" }}>
                  <UserCheck size={15} />
                </button>
                <button onClick={() => removeFriendship(f.id)} disabled={busyId === f.id} className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", border: `1px solid ${BORDER}`, background: "none", color: MUTED, cursor: "pointer" }}>
                  <UserX size={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Vrienden toevoegen</SectionLabel>
      <button onClick={shareInvite} className="press-scale" style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "12px",
        borderRadius: RADIUS, border: `1px dashed ${BRASS}`, background: "none", color: BRASS,
        fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", marginBottom: 10,
      }}>
        <Share2 size={15} />
        {shareState === "shared" ? "Verstuurd!" : shareState === "copied" ? "Link gekopieerd!" : shareState === "failed" ? "Kopiëren mislukt" : "Deel uitnodigingslink"}
      </button>
      <div style={{ marginBottom: 10 }}>
        <input value={query} onChange={e => doSearch(e.target.value)} placeholder="Zoek op naam…" enterKeyHint="search" autoCapitalize="words" style={fieldStyle()} />
      </div>
      {searchResults.length > 0 && (
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden", marginBottom: 26 }}>
          {searchResults.map((p, i) => (
            <div key={p.id} style={{ ...rowStyle, borderBottom: i < searchResults.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <Avatar name={p.name} photo={p.avatar_url} size={32} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: INK }}>{p.name}</span>
              <button onClick={() => sendRequest(p.id)} disabled={busyId === p.id} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: BOTTLE, color: CREAM, borderRadius: 100, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <UserPlus size={13} /> Toevoegen
              </button>
            </div>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && !searching && searchResults.length === 0 && (
        <p style={{ color: MUTED, fontSize: 13, margin: "0 0 26px" }}>Niemand gevonden met die naam.</p>
      )}

      {outgoing.length > 0 && (
        <>
          <SectionLabel>Verzonden verzoeken</SectionLabel>
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden", marginBottom: 26 }}>
            {outgoing.map((f, i) => (
              <div key={f.id} style={{ ...rowStyle, borderBottom: i < outgoing.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <Avatar name={profilesById[f.addressee_id]?.name} photo={profilesById[f.addressee_id]?.avatar_url} size={32} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: INK }}>{profilesById[f.addressee_id]?.name || "…"}</span>
                <span style={{ fontSize: 12, color: MUTED, marginRight: 4 }}>in afwachting</span>
                <button onClick={() => removeFriendship(f.id)} disabled={busyId === f.id} className="press-scale tap-target-44" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", border: `1px solid ${BORDER}`, background: "none", color: MUTED, cursor: "pointer" }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>{accepted.length > 0 ? `Jouw vrienden (${accepted.length})` : "Jouw vrienden"}</SectionLabel>
      {accepted.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 13.5, margin: 0 }}>Nog geen vrienden toegevoegd.</p>
      ) : (
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden" }}>
          {accepted.map((f, i) => {
            const otherId = f.requester_id === myId ? f.addressee_id : f.requester_id;
            return (
              <SwipeToDelete key={f.id} onDelete={() => removeFriendship(f.id)}>
              <div style={{ ...rowStyle, background: CREAM, borderBottom: i < accepted.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <button onClick={() => setOpenFriendId(otherId)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                  <Avatar name={profilesById[otherId]?.name} photo={profilesById[otherId]?.avatar_url} size={32} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: INK }}>{profilesById[otherId]?.name || "…"}</span>
                </button>
                <button onClick={() => removeFriendship(f.id)} disabled={busyId === f.id} className="press-scale tap-target-44" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}>
                  <Trash2 size={15} color={MUTED} />
                </button>
              </div>
              </SwipeToDelete>
            );
          })}
        </div>
      )}
      {openFriendId && (
        <FriendProfileSheet
          friendId={openFriendId}
          friendProfile={profilesById[openFriendId]}
          recipes={recipes}
          allIngredients={allIngredients}
          session={session}
          onBlocked={() => { setOpenFriendId(null); loadFriendships(); }}
          onClose={() => setOpenFriendId(null)}
        />
      )}
    </div>
  );
}

function EigenRecepten({ customRecipes, setCustomRecipes, allIngredients, onSound }) {
  const emptyRow = () => ({ name: "", amount: "", unit: "ml", optional: false });
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [glass, setGlass] = useState("");
  const [method, setMethod] = useState("");
  const [garnish, setGarnish] = useState("");
  const [rows, setRows] = useState([emptyRow(), emptyRow()]);

  const updateRow = (idx, field, val) => { const next = rows.slice(); next[idx] = { ...next[idx], [field]: val }; setRows(next); };
  const addRow = () => setRows([...rows, emptyRow()]);
  const removeRow = (idx) => setRows(rows.filter((_, i) => i !== idx));

  const resetForm = () => {
    setEditingId(null);
    setName(""); setFamily(""); setGlass(""); setMethod(""); setGarnish(""); setRows([emptyRow(), emptyRow()]);
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setName(r.name); setFamily(r.family); setGlass(r.glass); setMethod(r.method === "—" ? "" : r.method); setGarnish(r.garnish || "");
    setRows(r.ingredients.map(ing => ({ name: ing.name, amount: String(ing.amount), unit: ing.unit, optional: !!ing.optional })));
  };

  const save = () => {
    if (!name.trim()) return;
    const ingredients = rows.filter(r => r.name.trim() && r.amount !== "").map(r => ({ name: r.name.trim(), amount: parseFloat(r.amount) || 0, unit: r.unit, optional: r.optional }));
    if (ingredients.length === 0) return;
    if (editingId) {
      setCustomRecipes(customRecipes.map(r => r.id === editingId
        ? { ...r, name: name.trim(), family: family.trim() || "Eigen recept", glass: glass.trim() || "Naar keuze", ingredients, method: method.trim() || "—", garnish: garnish.trim() }
        : r));
    } else {
      setCustomRecipes([...customRecipes, { id: "custom_" + Date.now().toString(36), name: name.trim(), family: family.trim() || "Eigen recept", glass: glass.trim() || "Naar keuze", ingredients, method: method.trim() || "—", garnish: garnish.trim() }]);
    }
    onSound("chime");
    resetForm();
  };
  const removeRecipe = (id) => { onSound("remove"); setCustomRecipes(customRecipes.filter(r => r.id !== id)); if (editingId === id) resetForm(); };
  const ingredientNames = allIngredients.map(i => i.name);

  return (
    <div>
      <div style={{ background: PAPER_DEEP, border: `1px solid ${editingId ? BRASS : BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 18, marginBottom: 28 }}>
        <SectionLabel>{editingId ? "Recept bewerken" : "Nieuw recept toevoegen"}</SectionLabel>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          {editingId ? "Pas de velden aan en sla op: het recept behoudt dezelfde plek in je lijst." : "Mist er een drank? Voeg 'm toe, hij telt meteen mee bij \"Wat kan ik maken\" en de schaler."}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 5 }}>Naam</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Bijv. Amaretto Sour" autoCapitalize="words" enterKeyHint="next" style={fieldStyle()} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 5 }}>Familie</label>
            <input value={family} onChange={e => setFamily(e.target.value)} placeholder="Bijv. Sours" autoCapitalize="words" enterKeyHint="next" style={fieldStyle()} />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 5 }}>Glas</label>
            <input value={glass} onChange={e => setGlass(e.target.value)} placeholder="Bijv. Rocks" autoCapitalize="words" enterKeyHint="next" style={fieldStyle()} />
          </div>
        </div>

        <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}>Ingrediënten</label>
        {rows.map((row, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
            <IngredientAutocomplete value={row.name} onChange={v => updateRow(idx, "name", v)} options={ingredientNames} style={{ flex: "2 1 160px" }} />
            <input type="number" value={row.amount} onChange={e => updateRow(idx, "amount", e.target.value)} placeholder="Hoeveelheid"
              style={{ ...fieldStyle(), flex: "1 1 90px", padding: "8px 9px", fontSize: 13.5 }} />
            <select value={row.unit} onChange={e => updateRow(idx, "unit", e.target.value)} style={{ ...fieldStyle(), flex: "1 1 80px", padding: "8px 9px", fontSize: 13.5 }}>
              <option value="ml">ml</option><option value="dash">dash</option><option value="stuk">stuk</option>
            </select>
            <button onClick={() => removeRow(idx)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={16} color={MUTED} /></button>
          </div>
        ))}
        <button onClick={addRow} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px dashed ${MUTED}`, borderRadius: 3, padding: "6px 12px", fontSize: 13, color: MUTED, cursor: "pointer", marginBottom: 16 }}>
          <Plus size={14} /> Extra ingrediënt
        </button>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 5 }}>Bereidingswijze</label>
          <textarea value={method} onChange={e => setMethod(e.target.value)} rows={2} placeholder="Bijv. Shake met ijs, zeven in gekoeld glas." style={{ ...fieldStyle(), resize: "vertical" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 5 }}>Afwerking / garnering (optioneel)</label>
          <input value={garnish} onChange={e => setGarnish(e.target.value)} placeholder="Bijv. Schijfje limoen en een cocktailkers." autoCapitalize="sentences" enterKeyHint="done" style={fieldStyle()} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} style={{ display: "flex", alignItems: "center", gap: 6, background: BOTTLE, color: "#FBF6EA", border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
            {editingId ? <Check size={16} /> : <Plus size={16} />} {editingId ? "Wijzigingen opslaan" : "Recept opslaan"}
          </button>
          {editingId && (
            <button onClick={resetForm} style={{ background: "none", border: `1px solid ${MUTED}`, color: MUTED, borderRadius: 3, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Annuleren
            </button>
          )}
        </div>
      </div>

      {customRecipes.length > 0 && (
        <div>
          <SectionLabel>Jouw eigen recepten</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {customRecipes.map(r => (
            <div key={r.id} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                <RecipeCircle recipe={r} allIngredients={allIngredients} size={44} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, color: INK, fontSize: 15.5 }}>{r.name}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, margin: "2px 0 8px" }}>{r.family} · {r.glass}</div>
                  <ul style={{ margin: "0 0 8px", paddingLeft: 0, listStyle: "none", fontSize: 13.5 }}>
                    {r.ingredients.map((ing, i) => <li key={i} style={{ padding: "2px 0" }}>{ing.amount} {unitLabel(ing.unit, ing.amount)} {ing.name}</li>)}
                  </ul>
                  <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{r.method}</p>
                  {r.garnish && <p style={{ fontSize: 12.5, color: BRASS, margin: "4px 0 0" }}><strong>Afwerking:</strong> {r.garnish}</p>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => startEdit(r)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={15} color={MUTED} /></button>
                <button onClick={() => removeRecipe(r.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={15} color={MUTED} /></button>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
