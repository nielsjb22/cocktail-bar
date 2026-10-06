import { useState, useMemo, useEffect, useRef, useLayoutEffect, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { LocalNotifications } from "@capacitor/local-notifications";
import { AlertTriangle, CalendarDays, Image as ImageIcon, Printer, Martini, Check, Star, Plus, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, X, ShoppingCart, Shuffle, Sparkles, Pencil, BookOpen, ClipboardList, Refrigerator, Scale, PartyPopper, NotebookPen, FlaskConical, GraduationCap, Lock, RotateCcw, Share2, ExternalLink, MoreHorizontal, Heart, RefreshCw, Camera, MapPin, Users, UserPlus, UserCheck, UserX, LogOut, Bell, MessageCircle, Send, Home, User, Settings, Flag, Flame, Globe, Target, Wine, Info, Landmark, Wrench, Snowflake, FlaskRound, Droplets, Citrus, Cherry, Thermometer, Layers, PenTool, ListChecks, HeartHandshake, Award, Leaf, Droplet, CloudFog, GlassWater, Hand, ListOrdered, CupSoda, Zap, Sparkle, Clock, ShieldCheck } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DRANK_SPECS, shopGroupFor } from "./data/drankspecs";
import { supabase } from "./supabaseClient";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { MENU_COLORS, MENU_SERIF, MENU_SANS, menuCocktailInfo, readPartyFromSearch, partySubtitle, buildIcs, partyMenuQuery, partyInfoQuery, menuStrength, renderMenuCanvas, renderMenuOgCanvas, canvasToPdf, formatMenuDate } from "./menuCard";
import { SURVEY_SPIRITS, SURVEY_LIQUEURS, SURVEY_MIXERS, SURVEY_TASTES, SURVEY_STYLES, SURVEY_STRENGTHS, SURVEY_ALLERGIES, CUSTOM_PREFIX, choiceLabel, emptyAnswers, legacyFieldsFromAnswers, ingredientPreferenceCounts, tallyChoices } from "./surveyOptions";
import { isNative as isNativeShell, initNativeShell, hideNativeSplash, hapticFor } from "./native";
import { INGREDIENTS, CATEGORY_ORDER, RECIPES, PRICES_UPDATED, STORIES, FUN_FACTS, STEPS } from "./recipes.js";
import { COURSE_PARTS, COURSE_LESSONS, FINAL_EXAM } from "./course.js";
import feestHeaderImg from "./assets/feest-header.jpg";
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

// Sticky headers: de hele pagina scrollt via het venster (geen aparte
// scroll-container per tab), dus "position: sticky" met een top die de
// veilige zone (notch/statusbalk) respecteert werkt overal hetzelfde. Waar
// twee sticky balken boven elkaar staan (Ontdekken: filter-toggle + zoek-
// of receptbalk) stapelt de tweede op de hoogte van de eerste.
// De drie sticky-lagen stapelen exact op elkaars ECHTE hoogte (44px per
// laag, met expliciete `height` + alignItems:"center" op elke balk i.p.v.
// een hoogte die uit padding+content-grootte moest worden afgeleid) — een
// eerdere mismatch tussen deze constanten en de werkelijk gerenderde
// balkhoogte liet onderliggende, scrollende inhoud even doorschijnen in de
// naad tussen twee sticky balken. Ook meteen compacter dan de vorige 54/108px.
const STICKY_TOP = "env(safe-area-inset-top)";
const STICKY_SUBHEADER_TOP = "calc(env(safe-area-inset-top) + 44px)";
const STICKY_SUB2HEADER_TOP = "calc(env(safe-area-inset-top) + 88px)";

// Titels voor de vaste navigatiebalk van elk push-scherm (SecondaryTabScreen)
// — gecentreerd tussen de terugknop en de rand, zoals een echte iOS-navbar.
// Ook gebruikt om te bepalen welke tabs bij wissel in-vanaf-rechts schuiven
// i.p.v. faden (zie de tab-effect in ThuisbarApp).
const PUSH_SCREEN_TITLES = {
  voorraad: "Voorraad",
  mandje: "Boodschappen",
  schaler: "Batch-calculator",
  balans: "Menu-assistent",
  cursus: "Cursus",
  feest: "Feestplanner",
  eigen: "Nieuw recept",
  vrienden: "Vrienden",
  instellingen: "Instellingen",
  privacybeleid: "Privacybeleid",
  "account-verwijderen": "Account verwijderen",
  fotoverantwoording: "Fotoverantwoording",
};
const PUSH_SCREENS = new Set(Object.keys(PUSH_SCREEN_TITLES));

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
  { id: "schaler", label: "Batch-calculator", icon: Scale },
  { id: "balans", label: "Menu-assistent", icon: Sparkles },
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
  peach_puree: 0.45, passion_fruit_puree: 0.35, passion_fruit_juice: 0.35, lemonade: 0.45, ginger_beer: 0.25, ginger_ale: 0.25,
  grapefruit_soda: 0.35, tonic: 0.15, prosecco: 0.1,
};
const ZUUR_WEIGHTS = {
  lemon_juice: 1, lime_juice: 1, grapefruit_juice: 0.5, cranberry_juice: 0.25, orange_juice: 0.15,
  pineapple_juice: 0.2, olive_brine: 0.3, passion_fruit_puree: 0.3, passion_fruit_juice: 0.3, passion_fruit_liqueur: 0.15,
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
  tequila_blanco: ["tequila"], mezcal: ["mezcal"], vodka: ["wodka"], vanilla_vodka: ["vanillewodka"], pisco: ["pisco"],
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
  passion_fruit_liqueur: ["passievruchtlikeur", "passievrucht-likeur"], port: ["portwijn"], sherry: ["sherry"],
  lillet_blanc: ["lillet"], absinthe: ["absint", "absinthe"],
  angostura: ["angostura"], peychauds: ["peychaud"], orange_bitters: ["orange bitters"],
  tonic: ["tonic"], cola: ["cola"], ginger_beer: ["gemberbier"], ginger_ale: ["ginger ale"],
  grapefruit_soda: ["grapefruitfrisdrank"], soda_water: ["soda"], prosecco: ["prosecco", "champagne"],
  white_wine: ["witte wijn"], red_wine: ["rode wijn"], beer: ["bier"], stout: ["stout"],
  coconut_cream: ["kokosroom", "kokos"], pineapple_juice: ["ananassap", "ananas"],
  cranberry_juice: ["cranberrysap", "cranberry"], orange_juice: ["sinaasappelsap"],
  grapefruit_juice: ["grapefruitsap"], tomato_juice: ["tomatensap"], peach_puree: ["perzikpuree"],
  passion_fruit_puree: ["passievruchtpuree"], passion_fruit_juice: ["passievruchtsap"], espresso: ["espresso"], hot_coffee: ["koffie"],
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
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.backgroundColor = prevHtmlBg;
    };
  }, []);
  return (
    <div className="splash-overlay" onClick={onDone} onAnimationEnd={(e) => { if (e.animationName === "splashFadeOverlay") onDone(); }}>
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
      {/* Tikken slaat de intro nog steeds over, maar zonder "Tik om te
          slaan"-hint (op verzoek): mensen tikken vanzelf door. */}
    </div>
  );
}

// Gedeelde menukaart (de link die gasten krijgen): donker, gecentreerd, zonder
// kaders. Het menu ligt vast; gasten kiezen niets. Feestnaam, host, datum en
// (optioneel) adres staan in de link zelf — zie partyMenuQuery in menuCard.js.
// Alleen ingebouwde recepten kunnen worden gedeeld: eigen recepten van de host
// leven alleen op diens toestel, dus die vallen hier weg.
function GuestMenuView({ recipeIds }) {
  const C = MENU_COLORS;
  useMatchBodyBackground(C.bg);
  const party = useMemo(() => readPartyFromSearch(window.location.search), []);
  const items = useMemo(() => recipeIds
    .map(id => RECIPES.find(r => r.id === id)).filter(Boolean)
    .map(r => menuCocktailInfo(r, INGREDIENTS, getTasteProfile(r, INGREDIENTS))), [recipeIds]);
  const skipped = recipeIds.length - items.length;
  const subtitle = partySubtitle(party);

  const addToCalendar = async () => {
    const ics = buildIcs({
      title: party.title || "Cocktailavond", startsAt: party.startsAt, address: party.address,
      description: items.length ? `Op de kaart: ${items.map(i => i.name).join(", ")}` : "", url: window.location.href,
    });
    const filename = `${(party.title || "feest").replace(/[^\w-]+/g, "-").toLowerCase()}.ics`;
    if (isNativeShell) {
      try {
        const { uri } = await Filesystem.writeFile({ path: filename, data: ics, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: party.title, files: [uri] });
      } catch { /* geannuleerd of niet beschikbaar */ }
      return;
    }
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: MENU_SANS, textAlign: "center" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 48px) 24px calc(env(safe-area-inset-bottom) + 48px)" }}>
        <Martini size={26} color={C.gold} strokeWidth={1.5} style={{ display: "block", margin: "0 auto 18px" }} aria-hidden="true" />
        <h1 style={{ fontFamily: MENU_SERIF, fontWeight: 500, fontSize: 42, lineHeight: 1.12, margin: "0 0 10px", color: C.text, overflowWrap: "anywhere" }}>
          {party.title || "Het menu van vanavond"}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.body, margin: "0 0 6px" }}>{subtitle}</p>
        )}
        {party.address && (
          <p style={{ fontSize: 14, color: C.subtle, margin: "0 0 6px" }}>{party.address}</p>
        )}
        {party.startsAt && (
          <button onClick={addToCalendar} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 44, marginTop: 18,
            padding: "0 22px", borderRadius: 100, border: `1.5px solid ${C.gold}`, background: "transparent",
            color: C.gold, fontFamily: MENU_SANS, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}>
            <CalendarDays size={17} strokeWidth={1.8} aria-hidden="true" /> Zet in agenda
          </button>
        )}

        <div style={{ height: 1, background: C.gold, opacity: 0.45, margin: "34px 0 16px" }} />
        <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.gold, marginBottom: 6 }}>Op de kaart vanavond</div>

        {items.length === 0 && (
          <p style={{ color: C.subtle, fontSize: 15, padding: "28px 0" }}>Dit menu-linkje lijkt niet (meer) geldig.</p>
        )}
        {items.map((it, i) => (
          <div key={it.id} style={{ padding: "26px 0", borderTop: i === 0 ? "none" : `1px solid ${C.divider}` }}>
            <h2 style={{ fontFamily: MENU_SERIF, fontWeight: 500, fontSize: 28, lineHeight: 1.2, color: C.text, margin: "0 0 6px" }}>{it.name}</h2>
            {it.ingredientsLine && (
              <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 15.5, color: C.gold, lineHeight: 1.45, margin: "0 0 12px" }}>{it.ingredientsLine}</div>
            )}
            <p style={{ fontSize: 15.5, lineHeight: 1.55, color: C.body, margin: "0 auto 12px", maxWidth: 400 }}>{it.description}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 13.5, color: C.subtle, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", gap: 4 }} aria-hidden="true">
                {[1, 2, 3].map(n => (
                  <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= it.strength.level ? C.gold : "#2E423C" }} />
                ))}
              </span>
              <span>{it.strength.label}{it.notes.map(n => ` · ${n}`).join("")}</span>
            </div>
          </div>
        ))}
        {skipped > 0 && (
          <p style={{ color: C.subtle, fontSize: 13, margin: "0 0 10px" }}>
            {skipped} eigen creatie{skipped === 1 ? "" : "s"} van de host {skipped === 1 ? "staat" : "staan"} hier niet bij.
          </p>
        )}

        <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 30, marginTop: 4 }}>
          <div style={{ fontSize: 13.5, color: C.subtle }}>Proef je iets lekkers? Check in met</div>
          <a href={APP_STORE_URL || PUBLIC_WEB_URL || "/"} target="_blank" rel="noreferrer" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 12px",
            fontSize: 14.5, fontWeight: 700, color: C.text, textDecoration: "none",
          }}>Mijn Thuisbar</a>
        </div>
      </div>
    </div>
  );
}

// Gastenkant van de smaaktest: geen account nodig. Eén vraag per scherm, in
// dezelfde donkere stijl als de gedeelde menukaart, zonder emoji of
// "persoonlijkheidstype". Eerst de naam, dan zeven korte vragen (elk over te
// slaan). Zoekt de smaaktest op via het niet-raadbare id in de link en schrijft
// één antwoord weg naar party_survey_responses: de nieuwe antwoorden in
// `answers`, plus de oude velden zodat bestaande suggesties blijven werken.
const SURVEY_GLASS_PATHS = {
  rocks: ["M12 14h24l-2.5 26h-19z", "M18 24h10v10H18z"],
  coupe: ["M8 12c0 9 7 14 16 14s16-5 16-14z", "M24 26v14", "M16 40h16"],
  highball: ["M15 6h18l-2 36H17z", "M22 20h.01", "M26 28h.01", "M23 34h.01"],
  martini: ["M7 8h34L24 26z", "M12 13h24", "M24 26v14", "M16 40h16"],
  tiki: ["M16 6h16c0 6-4 8-4 14s5 8 5 14c0 4-4 8-9 8s-9-4-9-8c0-6 5-8 5-14s-4-8-4-14z", "M30 4l6-2"],
  flute: ["M19 4h10l-1 20c0 3-2 5-4 5s-4-2-4-5z", "M24 29v11", "M18 40h12"],
};
function SurveyGlass({ kind, color }) {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(SURVEY_GLASS_PATHS[kind] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

function GuestSurveyView({ surveyId }) {
  const C = MENU_COLORS;
  useMatchBodyBackground(C.bg);
  const party = useMemo(() => readPartyFromSearch(window.location.search), []);
  const [survey, setSurvey] = useState(undefined); // undefined = laden, null = niet gevonden
  const [step, setStep] = useState(0); // 0 = naam, 1..7 = vragen, 8 = bedankt
  const [guestName, setGuestName] = useState("");
  const [answers, setAnswers] = useState(emptyAnswers);
  const [customDrafts, setCustomDrafts] = useState({});
  const [cocktailQuery, setCocktailQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const scrollTop = () => window.scrollTo(0, 0);

  useEffect(() => {
    let cancelled = false;
    supabase.from("party_surveys").select("id, title").eq("id", surveyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setSurvey(data || null); })
      .catch(() => { if (!cancelled) setSurvey(null); });
    return () => { cancelled = true; };
  }, [surveyId]);

  const QUESTIONS = 7;
  const go = (n) => { setStep(n); scrollTop(); };

  // Drie standen per keuze: neutraal → lekker → liever niet → neutraal.
  // Een zelf toegevoegde keuze verdwijnt bij de derde tik.
  const stateOf = (group, key) => answers[group].like.includes(key) ? "like" : answers[group].dislike.includes(key) ? "dislike" : null;
  const cycle = (group, key) => setAnswers(a => {
    const g = a[group];
    const like = g.like.filter(k => k !== key), dislike = g.dislike.filter(k => k !== key);
    if (g.like.includes(key)) dislike.push(key);
    else if (!g.dislike.includes(key)) like.push(key);
    return { ...a, [group]: { like, dislike } };
  });
  const addCustom = (group) => {
    const text = (customDrafts[group] || "").trim().slice(0, 40);
    if (!text) return;
    const key = CUSTOM_PREFIX + text;
    setAnswers(a => a[group].like.includes(key) || a[group].dislike.includes(key) ? a
      : { ...a, [group]: { like: [...a[group].like, key], dislike: a[group].dislike } });
    setCustomDrafts(d => ({ ...d, [group]: "" }));
  };
  const toggleList = (field, key) => setAnswers(a => ({ ...a, [field]: a[field].includes(key) ? a[field].filter(k => k !== key) : [...a[field], key] }));

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const base = { survey_id: surveyId, guest_name: guestName.trim() || null, ...legacyFieldsFromAnswers(answers) };
    let { error: err } = await supabase.from("party_survey_responses").insert({ ...base, answers });
    // Zolang de migratie voor `answers` niet gedraaid is: dan alleen de oude velden.
    if (err && /answers/i.test(err.message || "")) ({ error: err } = await supabase.from("party_survey_responses").insert(base));
    setSubmitting(false);
    if (err) { setError("Versturen is niet gelukt. Probeer het nog eens."); return; }
    go(QUESTIONS + 1);
  };

  const serifH = (size) => ({ fontFamily: MENU_SERIF, fontWeight: 500, fontSize: size, lineHeight: 1.2, color: C.text, margin: 0 });
  const chipStyle = (state) => ({
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 16px", borderRadius: 100,
    fontFamily: MENU_SANS, fontSize: 15, cursor: "pointer",
    ...(state === "like" ? { background: "rgba(198,161,91,0.16)", border: `1px solid ${C.gold}`, color: C.text }
      : state === "dislike" ? { background: "transparent", border: "1px dashed #4A5C56", color: C.subtle }
      : { background: "transparent", border: "1px solid #2E423C", color: C.body }),
  });
  const choiceChip = (group, k, label) => {
    const state = stateOf(group, k);
    return (
      <button key={group + k} type="button" onClick={() => cycle(group, k)} aria-pressed={state === "like"} style={chipStyle(state)}
        aria-label={`${label}${state === "like" ? ", lekker" : state === "dislike" ? ", liever niet" : ""}`}>
        {state === "like" && <Check size={15} color={C.gold} strokeWidth={2.4} />}
        {state === "dislike" && <X size={14} color={C.subtle} strokeWidth={2} />}
        <span style={{ textDecoration: state === "dislike" ? "line-through" : "none" }}>{label}</span>
      </button>
    );
  };
  const choiceGroup = (group, options) => {
    const customs = [...answers[group].like, ...answers[group].dislike].filter(k => k.startsWith(CUSTOM_PREFIX));
    return (
      <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map(o => choiceChip(group, o.key, o.label))}
          {customs.map(k => choiceChip(group, k, k.slice(CUSTOM_PREFIX.length)))}
        </div>
      </>
    );
  };
  const customInput = (group, label) => (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input value={customDrafts[group] || ""} onChange={e => setCustomDrafts(d => ({ ...d, [group]: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(group); } }}
          placeholder="Iets anders? Typ het hier" aria-label={label} maxLength={40} enterKeyHint="done"
          style={{ flex: 1, minWidth: 0, height: 46, boxSizing: "border-box", padding: "0 16px", borderRadius: 100, border: "1px solid #2E423C", background: "#142A24", color: C.text, fontSize: 16, fontFamily: MENU_SANS, outline: "none" }} />
        <button type="button" onClick={() => addCustom(group)} aria-label="Toevoegen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, flexShrink: 0, borderRadius: "50%", border: `1px solid ${C.gold}`, background: "transparent", color: C.gold, cursor: "pointer" }}>
          <Plus size={18} />
        </button>
      </div>
      <p style={{ fontSize: 12.5, color: C.subtle, margin: "8px 0 0" }}>Wat je toevoegt, verschijnt als keuze en staat meteen op lekker.</p>
    </>
  );
  const intro = (title, text) => (
    <>
      <h2 style={{ ...serifH(30), marginBottom: 8 }}>{title}</h2>
      {text && <p style={{ fontSize: 14.5, lineHeight: 1.5, color: C.body, margin: "0 0 22px" }}>{text}</p>}
    </>
  );
  const TAP_HINT = "Tik één keer voor lekker, twee keer voor liever niet.";
  const subLabel = { fontSize: 12, letterSpacing: 1, color: C.subtle, margin: "0 0 10px" };

  const cocktailSuggestions = cocktailQuery.trim().length > 0
    ? RECIPES.filter(r => r.name.toLowerCase().includes(cocktailQuery.trim().toLowerCase()) && !answers.favorites.includes(r.id)).slice(0, 6)
    : [];

  const partyTitle = party.title || survey?.title || "Smaaktest";
  const partyLine = partySubtitle(party);

  // Samenvatting voor het bedankscherm.
  const summaryRows = [
    ["Lekker", ["spirits", "liqueurs", "mixers"].flatMap(g => answers[g].like.map(k => choiceLabel(g, k)))],
    ["Liever niet", ["spirits", "liqueurs", "mixers"].flatMap(g => answers[g].dislike.map(k => choiceLabel(g, k)))],
    ["Smaken", answers.tastes.like.map(k => choiceLabel("tastes", k))],
    ["Soort", answers.styles.map(k => SURVEY_STYLES.find(s => s.key === k)?.label.toLowerCase()).filter(Boolean)],
    ["Sterkte", answers.strength ? [SURVEY_STRENGTHS.find(s => s.key === answers.strength)?.label] : []],
    ["Allergie", answers.allergies.map(k => SURVEY_ALLERGIES.find(s => s.key === k)?.label.toLowerCase())],
    ["Favorieten", answers.favorites.map(id => RECIPES.find(r => r.id === id)?.name).filter(Boolean)],
  ].filter(([, v]) => v.length > 0);

  const primaryBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 54, borderRadius: 100, border: "none", background: C.gold, color: C.bg, fontFamily: MENU_SANS, fontSize: 16, fontWeight: 700, cursor: "pointer" };
  const page = { background: C.bg, minHeight: "100vh", color: C.text, fontFamily: MENU_SANS };
  const column = { maxWidth: 480, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 40px) 24px calc(env(safe-area-inset-bottom) + 28px)", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" };

  if (survey === undefined || survey === null) {
    return (
      <div style={page}><div style={{ ...column, justifyContent: "center", textAlign: "center" }}>
        <p style={{ color: C.subtle, fontSize: 15 }}>{survey === undefined ? "Bezig met laden…" : "Dit linkje lijkt niet (meer) geldig."}</p>
      </div></div>
    );
  }

  // ---------- Stap 0: naam ----------
  if (step === 0) {
    const canStart = guestName.trim().length > 0;
    return (
      <div style={page}><div style={{ ...column, textAlign: "center", paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}>
        <Martini size={26} color={C.gold} strokeWidth={1.5} style={{ display: "block", margin: "0 auto 18px" }} aria-hidden="true" />
        <h1 style={{ ...serifH(40), lineHeight: 1.12, marginBottom: 10, overflowWrap: "anywhere" }}>{partyTitle}</h1>
        {partyLine && <p style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.body, margin: 0 }}>{partyLine}</p>}
        <div style={{ height: 1, background: C.gold, opacity: 0.45, margin: "30px 0 22px" }} />
        <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.gold, marginBottom: 10 }}>Smaaktest</div>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: C.body, margin: "0 0 34px" }}>Een paar korte vragen over wat je graag drinkt. Duurt ongeveer een minuut, en je kunt elke vraag overslaan.</p>
        <label htmlFor="survey-naam" style={{ ...serifH(26), marginBottom: 14 }}>Hoe heet je?</label>
        <input id="survey-naam" value={guestName} onChange={e => setGuestName(e.target.value)} autoComplete="given-name" maxLength={40}
          onKeyDown={e => { if (e.key === "Enter" && canStart) go(1); }} enterKeyHint="next"
          style={{ boxSizing: "border-box", width: "100%", height: 56, borderRadius: 14, border: `1px solid ${canStart ? C.gold : "#2E423C"}`, background: "#142A24", color: C.text, fontSize: 19, textAlign: "center", fontFamily: MENU_SANS, outline: "none" }} />
        <p style={{ fontSize: 13, color: C.subtle, margin: "10px 0 0" }}>Zo weet de host wie wat heeft ingevuld.</p>
        <div style={{ flex: 1, minHeight: 30 }} />
        <button onClick={() => go(1)} disabled={!canStart} style={{ ...primaryBtn, opacity: canStart ? 1 : 0.4, cursor: canStart ? "pointer" : "default" }}>Beginnen</button>
      </div></div>
    );
  }

  // ---------- Bedankt ----------
  if (step > QUESTIONS) {
    return (
      <div style={page}><div style={{ ...column, textAlign: "center", paddingTop: "calc(env(safe-area-inset-top) + 70px)" }}>
        <Martini size={26} color={C.gold} strokeWidth={1.5} style={{ display: "block", margin: "0 auto 18px" }} aria-hidden="true" />
        <h1 style={{ ...serifH(38), lineHeight: 1.15, marginBottom: 10 }}>Bedankt, {guestName.trim()}</h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: C.body, margin: 0 }}>
          Je antwoorden zijn naar de host gestuurd.{party.startsAt ? ` Tot ${formatMenuDate(party.startsAt)}.` : ""}
        </p>
        {summaryRows.length > 0 && (
          <>
            <div style={{ height: 1, background: C.gold, opacity: 0.45, margin: "30px 0 20px" }} />
            <div style={{ fontFamily: MENU_SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 17, color: C.gold, marginBottom: 16 }}>Wat je hebt ingevuld</div>
            <div style={{ textAlign: "left" }}>
              {summaryRows.map(([label, values]) => (
                <div key={label} style={{ display: "flex", gap: 14, padding: "11px 0", borderTop: `1px solid ${C.divider}` }}>
                  <span style={{ width: 96, flexShrink: 0, fontSize: 13.5, color: C.subtle }}>{label}</span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.45, color: C.text }}>{values.join(", ")}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ flex: 1, minHeight: 30 }} />
        <button onClick={() => go(1)} style={{ ...primaryBtn, background: "transparent", border: `1.5px solid ${C.gold}`, color: C.gold, height: 50, fontWeight: 600 }}>Antwoorden aanpassen</button>
      </div></div>
    );
  }

  // ---------- Vragen 1..7 ----------
  const isLast = step === QUESTIONS;
  return (
    <div style={page}><div style={column}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, marginBottom: 22 }}>
        <button onClick={() => go(step - 1)} aria-label="Terug" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -10, background: "none", border: "none", color: C.body, cursor: "pointer" }}>
          <ChevronLeft size={22} strokeWidth={1.8} />
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} aria-hidden="true">
          {Array.from({ length: QUESTIONS }).map((_, i) => (
            <span key={i} style={i + 1 === step ? { width: 18, height: 6, borderRadius: 3, background: C.gold }
              : { width: 6, height: 6, borderRadius: "50%", background: i + 1 < step ? C.gold : "#2E423C", opacity: i + 1 < step ? 0.55 : 1 }} />
          ))}
        </div>
        <span style={{ width: 44, fontSize: 13, color: C.subtle, textAlign: "right" }}>{step}/{QUESTIONS}</span>
      </div>

      {step === 1 && (<>
        {intro("Welke sterke drank vind je lekker?", TAP_HINT)}
        {choiceGroup("spirits", SURVEY_SPIRITS)}
        {customInput("spirits", "Zelf een sterke drank toevoegen")}
      </>)}

      {step === 2 && (<>
        {intro("En likeuren of aperitieven?", TAP_HINT)}
        {choiceGroup("liqueurs", SURVEY_LIQUEURS)}
        {customInput("liqueurs", "Zelf een likeur toevoegen")}
      </>)}

      {step === 3 && (<>
        {intro("Waar drink je het graag mee?", `Frisdranken, sappen en bubbels. ${TAP_HINT}`)}
        <div style={subLabel}>BRUISEND</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
          {SURVEY_MIXERS.filter(m => m.group === "bruisend").map(o => choiceChip("mixers", o.key, o.label))}
        </div>
        <div style={subLabel}>SAP EN OVERIG</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SURVEY_MIXERS.filter(m => m.group === "sap").map(o => choiceChip("mixers", o.key, o.label))}
          {[...answers.mixers.like, ...answers.mixers.dislike].filter(k => k.startsWith(CUSTOM_PREFIX)).map(k => choiceChip("mixers", k, k.slice(1)))}
        </div>
        {customInput("mixers", "Zelf een mixer toevoegen")}
      </>)}

      {step === 4 && (<>
        {intro("Welke smaken spreken je aan?", TAP_HINT)}
        {choiceGroup("tastes", SURVEY_TASTES)}
        {customInput("tastes", "Zelf een smaak toevoegen")}
      </>)}

      {step === 5 && (<>
        {intro("Wat voor drankje past bij jou?", "Kies er zoveel als je wilt.")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {SURVEY_STYLES.map(s => {
            const on = answers.styles.includes(s.key);
            return (
              <button key={s.key} type="button" onClick={() => toggleList("styles", s.key)} aria-pressed={on} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "18px 10px 14px", borderRadius: 16,
                border: `1px solid ${on ? C.gold : "#2E423C"}`, background: on ? "rgba(198,161,91,0.12)" : "transparent",
                color: C.body, fontFamily: MENU_SANS, cursor: "pointer",
              }}>
                <SurveyGlass kind={s.glass} color={on ? C.gold : C.body} />
                <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{s.label}</span>
                <span style={{ fontSize: 12.5 }}>{s.example}</span>
              </button>
            );
          })}
        </div>
      </>)}

      {step === 6 && (<>
        <h2 style={{ ...serifH(30), marginBottom: 18 }}>Hoe sterk mag het zijn?</h2>
        {SURVEY_STRENGTHS.map(s => {
          const on = answers.strength === s.key;
          return (
            <button key={s.key} type="button" onClick={() => setAnswers(a => ({ ...a, strength: on ? null : s.key }))} aria-pressed={on} style={{
              display: "flex", alignItems: "center", gap: 12, minHeight: 54, padding: "0 16px", marginBottom: 8, borderRadius: 14,
              border: `1px solid ${on ? C.gold : "#2E423C"}`, background: on ? "rgba(198,161,91,0.12)" : "transparent",
              color: C.text, fontFamily: MENU_SANS, cursor: "pointer", width: "100%",
            }}>
              <span style={{ display: "inline-flex", gap: 4, width: 34 }} aria-hidden="true">
                {[1, 2, 3].map(n => <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= s.level ? C.gold : "#2E423C" }} />)}
              </span>
              <span style={{ flex: 1, textAlign: "left", fontSize: 16 }}>{s.label}</span>
              <span style={{ fontSize: 13, color: C.subtle }}>{s.hint}</span>
            </button>
          );
        })}
        <h3 style={{ ...serifH(22), margin: "30px 0 6px" }}>Allergieën of liever niet?</h3>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: C.body, margin: "0 0 14px" }}>De host houdt er rekening mee bij het menu.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SURVEY_ALLERGIES.map(o => {
            const on = answers.allergies.includes(o.key);
            return (
              <button key={o.key} type="button" onClick={() => toggleList("allergies", o.key)} aria-pressed={on} style={chipStyle(on ? "like" : null)}>
                {on && <Check size={15} color={C.gold} strokeWidth={2.4} />}{o.label}
              </button>
            );
          })}
        </div>
      </>)}

      {step === 7 && (<>
        {intro("Heb je favoriete cocktails?", "Zoek en tik aan. Hoeft niet.")}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 14px", borderRadius: 14, border: "1px solid #2E423C", background: "#142A24" }}>
            <Search size={18} color={C.subtle} />
            <input value={cocktailQuery} onChange={e => setCocktailQuery(e.target.value)} placeholder="Zoek een cocktail" aria-label="Zoek een cocktail"
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: C.text, fontSize: 16, fontFamily: MENU_SANS, outline: "none" }} />
          </div>
          {cocktailSuggestions.length > 0 && (
            <div style={{ marginTop: 6, borderRadius: 14, border: "1px solid #2E423C", background: "#142A24", overflow: "hidden" }}>
              {cocktailSuggestions.map(r => (
                <button key={r.id} type="button" onClick={() => { setAnswers(a => ({ ...a, favorites: [...a.favorites, r.id] })); setCocktailQuery(""); }} style={{
                  display: "block", width: "100%", minHeight: 44, padding: "10px 14px", textAlign: "left", background: "none", border: "none",
                  borderBottom: `1px solid ${C.divider}`, color: C.text, fontFamily: MENU_SERIF, fontSize: 16, cursor: "pointer",
                }}>{r.name}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 30 }}>
          {answers.favorites.map(id => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 40, padding: "0 4px 0 14px", borderRadius: 100, border: `1px solid ${C.gold}`, background: "rgba(198,161,91,0.16)", fontSize: 15 }}>
              <span style={{ fontFamily: MENU_SERIF, fontWeight: 500 }}>{RECIPES.find(r => r.id === id)?.name}</span>
              <button type="button" aria-label="Verwijderen" onClick={() => setAnswers(a => ({ ...a, favorites: a.favorites.filter(x => x !== id) }))} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, border: "none", background: "transparent", color: C.body, cursor: "pointer" }}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
        <label htmlFor="survey-opmerking" style={{ ...serifH(22), marginBottom: 6 }}>Nog iets wat de host moet weten?</label>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: C.body, margin: "0 0 12px" }}>Bijvoorbeeld dat je zwanger bent, rijdt of iets echt niet lust.</p>
        <textarea id="survey-opmerking" rows={4} maxLength={300} value={answers.note} onChange={e => setAnswers(a => ({ ...a, note: e.target.value }))} style={{
          boxSizing: "border-box", width: "100%", padding: 14, borderRadius: 14, border: "1px solid #2E423C", background: "#142A24",
          color: C.text, fontSize: 16, lineHeight: 1.5, fontFamily: MENU_SANS, resize: "none", outline: "none",
        }} />
        {error && <p style={{ color: "#E8A49C", fontSize: 14, margin: "12px 0 0" }}>{error}</p>}
      </>)}

      <div style={{ flex: 1, minHeight: 28 }} />
      {isLast ? (
        <button onClick={submit} disabled={submitting} style={primaryBtn}>{submitting ? "Bezig…" : "Versturen"}</button>
      ) : (
        <>
          <button onClick={() => go(step + 1)} style={primaryBtn}>Volgende</button>
          <button onClick={() => go(step + 1)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 44, marginTop: 6, background: "none", border: "none", color: C.subtle, fontFamily: MENU_SANS, fontSize: 14.5, cursor: "pointer" }}>Overslaan</button>
        </>
      )}
    </div></div>
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
  courseProgress, setCourseProgress, onGoLogin, shoppingKeys, onRemoveFromShoppingList,
}) {
  const [tab, setTab] = useState("ontdekken");
  // Zelfde gedrag als de ingelogde app: een andere tab openen begint bovenaan.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [tab]);
  const [pendingRecipeId, setPendingRecipeId] = useState(null);

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: sans, color: INK }}>
      <div style={{ background: `radial-gradient(ellipse 900px 300px at 15% -40%, #2A4B42, ${BOTTLE_DARK} 70%)`, borderBottom: `3px solid ${BRASS}`, padding: "calc(env(safe-area-inset-top) + 22px) 20px 20px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", flexShrink: 0 }}>
            <Martini color={BRASS} size={22} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: systemFont, fontSize: 22, fontWeight: 700, color: CREAM, margin: 0 }}>Mijn Thuisbar</h1>
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

      <StatusBarBackdrop showAfter={95} />
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
              shoppingKeys, onRemoveFromShoppingList, favoriteRecipeIds, onToggleFavorite,
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
          <CursusTab progress={courseProgress} setProgress={setCourseProgress} onSound={onSound}
            recipes={recipes} allIngredients={allIngredients} onOpenRecipe={(id) => { setPendingRecipeId(id); setTab("ontdekken"); }} />
        )}
      </div>

      <div className="glass-light bottom-dock" style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10,
        border: "none", borderTop: "1px solid rgba(184,137,58,0.7)", boxShadow: "0 -6px 18px rgba(43,38,32,0.10)",
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

// Deellinks (menu, smaaktest, vrienduitnodiging, wachtwoord-reset) moeten
// naar de openbare webversie wijzen. In de iOS-app is window.location.origin
// "capacitor://localhost" — een link waar een ontvanger niets mee kan. Daar
// gebruiken we dus het adres van de Netlify-webversie (te overschrijven met
// VITE_PUBLIC_WEB_URL in .env); op het web gewoon het eigen adres.
// Let op: die webversie moet de gastweergaven (?menu=, ?smaaktest=) kennen,
// dus na grote wijzigingen ook Netlify bijwerken.
const DEFAULT_PUBLIC_WEB_URL = "https://beautiful-pasca-793e77.netlify.app";
// Nog geen App Store-pagina: de footer van de menukaart linkt dan naar de webversie.
const APP_STORE_URL = "";
const PUBLIC_WEB_URL = (import.meta.env.VITE_PUBLIC_WEB_URL || DEFAULT_PUBLIC_WEB_URL).replace(/\/+$/, "");
function publicAppUrl(query = "") {
  const base = isNativeShell ? PUBLIC_WEB_URL : `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${query ? `/?${query}` : ""}`;
}

// Eén deelfunctie voor de hele app: in de native app het echte iOS-deelmenu
// (@capacitor/share — navigator.share is in WKWebView niet betrouwbaar), op
// het web navigator.share met klembord als terugval.
// Geeft "shared" | "copied" | "cancelled" | "failed" | "no-url" terug.
// Zonder openbaar webadres (VITE_PUBLIC_WEB_URL niet ingesteld) valt hij terug
// op `fallbackText` — bv. het menu als lijstje — zodat delen niet stil mislukt.
// Laatste foutmelding van het native deelmenu, zodat een "mislukt"-melding
// kan laten zien wát er misging (bv. "not implemented" als de Share-plugin
// niet in de iOS-build zit) i.p.v. alleen dat het misging.
let lastShareError = "";
async function shareLink({ title, text, url, fallbackText }) {
  if (!url) return fallbackText ? shareText({ title, text: fallbackText }) : "no-url";
  if (isNativeShell) {
    try { lastShareError = ""; await Share.share({ title, text, url, dialogTitle: title }); return "shared"; }
    catch (e) {
      if (/cancel/i.test(e?.message || "")) return "cancelled";
      lastShareError = e?.message || String(e);
      // Terugval: probeer de Web Share API van de WebView, anders klembord.
      try {
        if (navigator.share) { await navigator.share({ title, text, url }); return "shared"; }
        await navigator.clipboard.writeText(url); return "copied";
      } catch (e2) {
        if (e2?.name === "AbortError") return "cancelled";
        return "failed";
      }
    }
  }
  try {
    if (navigator.share) { await navigator.share({ title, text, url }); return "shared"; }
    await navigator.clipboard.writeText(url); return "copied";
  } catch (e) {
    if (e?.name === "AbortError") return "cancelled";
    try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
  }
}

async function shareText({ title, text }) {
  try {
    if (isNativeShell) { await Share.share({ title, text, dialogTitle: title }); return "shared"; }
    if (navigator.share) { await navigator.share({ title, text }); return "shared"; }
    await navigator.clipboard.writeText(text); return "copied";
  } catch (e) {
    return /cancel|abort/i.test(`${e?.name} ${e?.message}`) ? "cancelled" : "failed";
  }
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
//
// In de native iOS-app werkt Web Push niet (WKWebView heeft geen PushManager
// voor apps) en hoort het ook niet: native meldingen komen later via
// @capacitor/push-notifications (zie CLAUDE.md). Daar geldt dus
// "niet ondersteund" — geen service worker, en de schakelaar in Instellingen
// blijft verborgen zodat er geen knop staat die niets doet.
function usePushNotifications(session) {
  const [supported] = useState(() => !isNativeShell && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
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
            <h1 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: CREAM, margin: "0 0 12px" }}>Helaas</h1>
            <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: 0 }}>Mijn Thuisbar draait om alcoholische dranken en is niet geschikt voor bezoekers onder de 18 jaar.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 24, color: CREAM, margin: "0 0 12px" }}>Even een check</h1>
            <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: "0 0 26px" }}>
              Mijn Thuisbar draait om cocktails en alcoholische dranken. Ben je 18 jaar of ouder?
            </p>
            <button onClick={onConfirm} className="press-scale" style={{
              width: "100%", padding: "14px 18px", borderRadius: 14, border: "none", marginBottom: 10,
              background: BRASS, color: CREAM, fontSize: 15, fontWeight: 700, cursor: "pointer",
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
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: publicAppUrl() || window.location.origin });
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
          <h1 style={{ fontFamily: systemFont, fontSize: 30, fontWeight: 700, color: CREAM, margin: 0 }}>Mijn Thuisbar</h1>
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
            background: BRASS, color: BOTTLE_DARK,
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
          <h1 style={{ fontFamily: systemFont, fontSize: 26, fontWeight: 700, color: CREAM, margin: 0, textAlign: "center" }}>Nieuw wachtwoord</h1>
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
            background: BRASS, color: BOTTLE_DARK,
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

// Zet een veld binnen een pop-up in beeld door alleen de scrollbare inhoud
// van die pop-up te verschuiven (niet de pagina): het veld komt net boven de
// onderrand van wat zichtbaar is, met wat lucht eronder.
function revealInSheet(el) {
  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const boxRect = box.getBoundingClientRect();
  const vv = window.visualViewport;
  const visibleBottom = Math.min(boxRect.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
  const r = el.getBoundingClientRect();
  const margin = 24;
  if (r.bottom > visibleBottom - margin) box.scrollTop += r.bottom - (visibleBottom - margin);
  else if (r.top < boxRect.top + margin) box.scrollTop -= (boxRect.top + margin) - r.top;
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

    // Toetsenbord open → klasse op <html>, zodat de zwevende onderbalk
    // verdwijnt i.p.v. bovenop het toetsenbord (en over zoekresultaten) te
    // gaan liggen. Native via de Keyboard-plugin (zie native.js); op het web
    // benaderd via focus op een tekstveld.
    const setKbOpen = (open) => document.documentElement.classList.toggle("kb-open", open);
    let blurTimer = null;
    let lastFocusAt = 0;

    const onFocusIn = (e) => {
      const el = e.target;
      if (!isTextInput(el)) return;
      lastFocusAt = Date.now();
      clearTimeout(blurTimer);
      if (!isNativeShell) setKbOpen(true);
      // Zoekvelden met een suggestielijst (data-kb-scope) gaan bovenaan in
      // beeld staan, zodat de lijst eronder de ruimte boven het toetsenbord
      // krijgt; gewone velden alleen als ze anders achter het toetsenbord
      // zouden verdwijnen.
      const picker = el.closest("[data-kb-scope]");
      // Velden in een pop-up (check-in-notitie, locatie): alleen de
      // scrollbare inhoud van de pop-up zelf verschuiven, nooit de pagina —
      // scrollIntoView schoof op iOS ook de (vastgezette) pagina mee, wat
      // het veld soms juist áchter het toetsenbord liet belanden. Een paar
      // keer, want het toetsenbord komt in stappen omhoog.
      if ((el.tagName === "TEXTAREA" || el.closest(".sheet-max-92")) && !picker) {
        [80, 350, 700].forEach(t => setTimeout(() => { if (document.activeElement === el) revealInSheet(el); }, t));
        return;
      }
      setTimeout(() => {
        if (document.activeElement !== el) return;
        if (picker) { el.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
        const rect = el.getBoundingClientRect();
        const viewportH = window.visualViewport?.height || window.innerHeight;
        if (rect.bottom > viewportH - 90 || rect.top < 0) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }, 320);
    };
    // Zodra het toetsenbord echt helemaal open is (native event) of de
    // zichtbare hoogte verandert: het actieve veld nog één keer in beeld zetten.
    const onKeyboardShown = () => {
      const el = document.activeElement;
      if (isTextInput(el) && (el.tagName === "TEXTAREA" || el.closest(".sheet-max-92")) && !el.closest("[data-kb-scope]")) revealInSheet(el);
    };
    window.addEventListener("app-keyboard-shown", onKeyboardShown);
    // Web (Safari/PWA): hetzelfde --kb-pad als native, op basis van visualViewport.
    const vv = window.visualViewport;
    const onViewport = () => {
      if (isNativeShell || !vv) return;
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      document.documentElement.style.setProperty("--kb-pad", `${covered > 80 ? Math.round(covered) : 0}px`);
      onKeyboardShown();
    };
    vv?.addEventListener("resize", onViewport);

    const onFocusOut = (e) => {
      if (isNativeShell || !isTextInput(e.target)) return;
      blurTimer = setTimeout(() => { if (!isTextInput(document.activeElement)) setKbOpen(false); }, 120);
    };

    // Tik je (met toetsenbord open) op iets anders dan een tekstveld — een
    // ster, een label, "Meer toevoegen" — dan sluit het toetsenbord, zoals in
    // native iOS-apps. Anders blijft de cursor in het veld staan en duikt het
    // toetsenbord bij elke tik weer op. Tikken in de suggestielijst van het
    // veld zelf (data-kb-scope) laat het toetsenbord open. Capture-fase op
    // 'click': de knop zelf krijgt de tik gewoon nog.
    const onClickCapture = (e) => {
      const active = document.activeElement;
      if (!isTextInput(active)) return;
      // De tik waarmee je het veld net opende telt niet: door de focus kan de
      // layout verschuiven (balk verdwijnt, veld schuift), waardoor de klik
      // van diezelfde tik net naast het veld landt en het meteen weer sloot.
      if (Date.now() - lastFocusAt < 600) return;
      const t = e.target;
      if (isTextInput(t) || t.closest?.("input, textarea, select, label")) return;
      const scope = active.closest?.("[data-kb-scope]");
      if (scope && scope.contains(t)) return;
      active.blur();
    };

    let touchStartY = null;
    const onTouchStart = (e) => { touchStartY = e.touches[0]?.clientY ?? null; };
    const onTouchMove = (e) => {
      const active = document.activeElement;
      if (!isTextInput(active) || touchStartY == null) return;
      if (active === e.target || active.contains?.(e.target)) return;
      // Scrollen dóór de suggestielijst van dit zoekveld mag het toetsenbord
      // niet sluiten — dat liet alles verspringen en je kon niets kiezen.
      const scope = active.closest?.("[data-kb-scope]");
      if (scope && scope.contains(e.target)) return;
      const dy = Math.abs((e.touches[0]?.clientY ?? touchStartY) - touchStartY);
      if (dy > 12) { active.blur(); touchStartY = null; }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener("app-keyboard-shown", onKeyboardShown);
      vv?.removeEventListener("resize", onViewport);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("click", onClickCapture, true);
      clearTimeout(blurTimer);
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
  // Een scherm openen begint altijd bovenaan (net als een native app); alleen
  // "terug" (restore: true — terugknop/terugvegen) zet je weer op de plek
  // waar je was. Nogmaals op de actieve tab tikken scrollt soepel naar boven
  // (Home ververst daarbij ook, Ontdekken sluit een open recept).
  const [ontdekkenTapTick, setOntdekkenTapTick] = useState(0);
  const navigateTo = (nextTab, { restore = false } = {}) => {
    if (nextTab === tab) {
      if (nextTab === "home") setHomeTapTick(t => t + 1);
      else {
        if (nextTab === "ontdekken") setOntdekkenTapTick(t => t + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    scrollPositions.current[tab] = window.scrollY;
    if (!restore) scrollPositions.current[nextTab] = 0;
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
    if (!el) return;
    if (PUSH_SCREENS.has(tab)) {
      // Push-schermen schuiven in vanaf rechts i.p.v. te faden, en de klasse
      // gaat er na afloop weer af — anders blijft transform (zelfs
      // translateX(0) via fill-mode "both") permanent een containing block
      // vormen voor position:fixed-kinderen van dit paneel.
      el.classList.remove("push-slide-in");
      void el.offsetWidth;
      el.classList.add("push-slide-in");
      const timer = setTimeout(() => el.classList.remove("push-slide-in"), 340);
      return () => clearTimeout(timer);
    }
    el.classList.remove("tab-fade");
    void el.offsetWidth;
    el.classList.add("tab-fade");
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
  // In de iOS-app is het native opstartscherm de intro (zie hideNativeSplash);
  // deze geanimeerde React-intro is alleen nog voor de web/PWA-versie.
  const [showSplash, setShowSplash] = useState(!isNativeShell);
  const [voorraadArr, setVoorraad] = useStorage("thuisbar-voorraad", []);
  const [customIngredients, setCustomIngredients] = useStorage("thuisbar-custom-ingredients", []);
  const [customRecipes, setCustomRecipes] = useStorage("thuisbar-custom-recipes", []);
  const [shoppingList, setShoppingList] = useStorage("thuisbar-shopping-list", []);
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
  const parties = useParties(session);
  const upcomingParties = useMemo(
    () => parties.parties.filter(isPartyUpcoming).sort(compareUpcomingParties),
    [parties.parties]
  );
  // Springt na een cross-tab actie (bijv. "gebruik dit menu" vanuit
  // Menu-assistent) direct naar het juiste feest-detailscherm — zelfde patroon
  // als pendingRecipeId hierboven. FeestplannerTab maakt 'm zelf weer leeg.
  const [openPartyId, setOpenPartyId] = useState(null);
  // Voor de "Feestplanner"-snelkoppelingen elders in de app (Maken,
  // receptdetail, Menu-assistent): één cocktail toevoegen mikt altijd op het
  // eerstvolgende feest, of maakt (zonder te vragen) "Mijn feest" aan als er
  // nog helemaal geen feest bestaat — een keuzescherm tussen meerdere
  // feesten voegt hier meer gedoe toe dan het oplost.
  const resolveTargetParty = async ({ guests } = {}) => {
    if (upcomingParties[0]) return upcomingParties[0];
    return parties.createParty({ name: "Mijn feest", guests: guests || 8, drinks_per_guest: 2, cocktail_ids: [], bought_items: [], prep_done: [] });
  };

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
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data }) => { if (!cancelled) setProfile(data || null); });
    return () => { cancelled = true; };
  }, [session]);

  // Cursus uitgespeeld → eenmalig op je profiel zetten, zodat vrienden het
  // diploma ook zien. Faalt stil als de kolommen (migratie) nog ontbreken;
  // je eigen profiel toont het diploma dan toch, op basis van lokale voortgang.
  const courseMastery = useMemo(() => computeCourseMastery(courseProgress), [courseProgress]);
  // Rang + afgeronde delen naar je profiel, zodat vrienden je ring en rang
  // zien. Alleen omhoog: op een nieuw toestel (lege lokale voortgang) blijft
  // je opgeslagen rang staan. Bij een nieuwe rang vanaf Barback komt er een
  // moment in de feed. Zonder de migratie valt het terug op alleen het diploma.
  const localCourseRank = useMemo(() => computeCourseRank(courseProgress), [courseProgress]);
  const courseRank = useMemo(() => mergeCourseRank(localCourseRank, profileCourseRank(profile)), [localCourseRank, profile]);
  useEffect(() => {
    if (!session || !profile) return;
    const diploma = courseMastery && !profile.course_completed_at
      ? { course_completed_at: new Date().toISOString(), course_exam_score: courseMastery.scorePct } : {};
    const rankUpdate = {};
    const storedIndex = COURSE_RANKS.findIndex(r => r.id === profile.course_rank);
    if (localCourseRank.index > storedIndex) rankUpdate.course_rank = localCourseRank.rank.id;
    if (localCourseRank.partsDone > (profile.course_parts_done || 0)) rankUpdate.course_parts_done = localCourseRank.partsDone;
    if (Object.keys(diploma).length === 0 && Object.keys(rankUpdate).length === 0) return;
    const prevIndex = profileCourseRank(profile).index;
    let cancelled = false;
    (async () => {
      let { data, error } = await supabase.from("profiles").update({ ...diploma, ...rankUpdate }).eq("id", session.user.id).select().single();
      if (error && Object.keys(diploma).length > 0) {
        ({ data, error } = await supabase.from("profiles").update(diploma).eq("id", session.user.id).select().single());
      }
      if (cancelled || error || !data) return;
      setProfile(data);
      if (localCourseRank.index > prevIndex && localCourseRank.index >= 1) {
        await supabase.from("course_milestones").insert({ user_id: session.user.id, rank: localCourseRank.rank.id, parts_done: localCourseRank.partsDone });
      }
    })();
    return () => { cancelled = true; };
  }, [session, profile, courseMastery, localCourseRank]);
  const courseDiploma = profile?.course_completed_at
    ? { date: profile.course_completed_at, scorePct: profile.course_exam_score ?? courseMastery?.scorePct }
    : (courseMastery ? { date: null, scorePct: courseMastery.scorePct } : null);

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
      // Vrienden taggen. Bij overnemen: de oorspronkelijke tag wijst nu naar
      // jouw eigen check-in, en jij tagt de ander terug (al "overgenomen",
      // dus zonder melding). De post en het cijfer van de ander blijven gelijk.
      const adopt = entry.adoptTag || null;
      const rows = (entry.tagUserIds || []).filter(id => id !== adopt?.taggerId)
        .map(id => ({ checkin_id: data.id, tagger_id: session.user.id, tagged_user_id: id }));
      if (adopt) {
        rows.push({ checkin_id: data.id, tagger_id: session.user.id, tagged_user_id: adopt.taggerId, adopted_checkin_id: adopt.checkinId });
        await supabase.from("checkin_tags").update({ adopted_checkin_id: data.id }).eq("id", adopt.id);
      }
      if (rows.length > 0) await supabase.from("checkin_tags").insert(rows);
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
  // Een recept geopend vanaf een ander scherm (Home, Feestplanner, Check-in…)
  // opent als eigen, rustig receptscherm met een terugknop naar dát scherm —
  // niet naar de Ontdekken-lijst waar het technisch in leeft.
  const [recipeOrigin, setRecipeOrigin] = useState(null);
  const openRecipeDetail = (id) => {
    setRecipeOrigin(tab === "ontdekken" ? null : tab);
    navigateTo("ontdekken");
    setPendingRecipeId(id);
  };
  const returnFromRecipe = () => {
    const origin = recipeOrigin;
    setRecipeOrigin(null);
    if (origin) navigateTo(origin, { restore: true });
  };
  const recipeBackLabel = recipeOrigin
    ? (PUSH_SCREEN_TITLES[recipeOrigin] || DOCK_LABELS[recipeOrigin] || TAGS.find(t => t.id === recipeOrigin)?.label || "Terug")
    : "Ontdekken";

  // Zelfde idee, maar dan voor inchecken: het formulier leeft als een sheet
  // ín LogboekTab (die portal't naar document.body, dus verschijnt sowieso al
  // boven elke tab), maar moet ook zonder daarheen te navigeren opengaan —
  // vanaf de centrale +-knop, of straks direct vanaf een recept. Een nieuw
  // object (i.p.v. een simpele boolean) zorgt dat twee achtereenvolgende
  // aanvragen voor dezelfde naam allebei echt de sheet heropenen.
  const [checkinRequest, setCheckinRequest] = useState(null);
  const openCheckin = (req = "") => setCheckinRequest(typeof req === "string" ? { ts: Date.now(), name: req } : { ts: Date.now(), ...req });

  // Eén recept toevoegen aan de Feestplanner-keuze, vanuit Maken of een
  // recept-detail — dus niet via de bulk "gebruik dit menu"-actie van
  // de oude Smaakbalans, maar één-voor-één met eigen feedback.
  const addRecipeToFeest = async (id) => {
    const target = await resolveTargetParty();
    const current = target?.cocktail_ids || [];
    if (!target || current.includes(id)) return;
    parties.updateParty(target.id, { cocktail_ids: [...current, id] });
  };
  // Alle cocktails van het eerstvolgende (of nieuw aangemaakte) feest, voor
  // de "in feestplanner"-disabled-state op recept-kaarten elders in de app.
  const feestChosen = upcomingParties[0]?.cocktail_ids || [];

  const voorraad = useMemo(() => new Set(voorraadArr), [voorraadArr]);
  // Flessen met winkelprijzen (wekelijks gecontroleerd). Waar die er zijn,
  // vervangt de prijs van de voordeligste fles de vaste richtprijs, zodat
  // Feestplanner, menu-assistent en boodschappenlijst overal met echte
  // prijzen rekenen.
  const bottleOptions = useFlessen();
  const allIngredients = useMemo(() => [...INGREDIENTS, ...customIngredients].map(i => {
    const best = bottleOptions.get(i.id)?.[0]?.best;
    return best?.prijs != null ? { ...i, bottlePrice: best.prijs, bottleMl: best.inhoud_ml || i.bottleMl, livePrice: best.fresh } : i;
  }), [customIngredients, bottleOptions]);
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
  // Lichte voorkeur in de Menu-assistent: het smaakprofiel uit je check-ins.
  const menuTasteLikes = useMemo(() => {
    const t = checkinInsights?.taste;
    if (!t || !t.some(x => x.pct > 0) || logboek.length < 3) return null;
    return Object.fromEntries(t.map(x => [x.key, x.pct]));
  }, [checkinInsights, logboek.length]);
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
  // Hoe vol een fles is ("vol" | "half" | "bijna" | "op"), per ingrediënt.
  const [voorraadNiveau, setVoorraadNiveau] = useStorage("thuisbar-voorraad-niveau", {});
  const setNiveau = (id, level) => {
    const next = { ...voorraadNiveau };
    if (!level || level === "vol") delete next[id]; else next[id] = level;
    setVoorraadNiveau(next);
  };
  // Snel vullen: een pakket in één keer toevoegen, en weer ongedaan maken.
  const addPack = (ids) => {
    setVoorraad([...voorraadArr, ...ids.filter(id => !voorraadArr.includes(id))]);
    const aantal = { ...voorraadAantal };
    ids.forEach(id => { aantal[id] = 1; });
    setVoorraadAantal(aantal);
  };
  const undoPack = (ids) => setVoorraad(voorraadArr.filter(id => !ids.includes(id)));
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
  // Eigen recept bewaren: nieuwe ingrediënten worden eigen ingrediënten
  // (niet in voorraad), daarna wordt het recept met hun id's opgeslagen.
  const saveCustomRecipe = (newIngredients, build) => {
    const idMap = {};
    const added = newIngredients.map((n, i) => {
      const existing = allIngredients.find(x => x.name.toLowerCase() === n.name.trim().toLowerCase());
      if (existing) { idMap[n.key] = existing.id; return null; }
      const id = `${slugify(n.name)}${i}`;
      idMap[n.key] = id;
      return { id, name: n.name.trim(), cat: n.cat || CUSTOM_CAT };
    }).filter(Boolean);
    if (added.length) setCustomIngredients([...customIngredients, ...added]);
    const recipe = build(idMap);
    setCustomRecipes(customRecipes.some(r => r.id === recipe.id) ? customRecipes.map(r => r.id === recipe.id ? recipe : r) : [...customRecipes, recipe]);
    return recipe;
  };
  const removeCustomIngredient = (id) => {
    setCustomIngredients(customIngredients.filter(i => i.id !== id));
    setVoorraad(voorraadArr.filter(x => x !== id));
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
  // Welke ingrediënten al op de boodschappenlijst staan — zo tonen knoppen
  // elders (Wat kan ik maken) de échte staat, ook na verwijderen in het mandje.
  const shoppingKeys = useMemo(() => new Set(shoppingList.map(i => i.key)), [shoppingList]);
  // "Maak een batch" (recept-pop-up, volledig recept) → Batch-calculator met
  // die cocktail gekozen. Via batchOpener zodat niet elke tussenlaag een
  // extra prop hoeft door te geven; in gastmodus is er geen Bar → geen knop.
  const [batchRequest, setBatchRequest] = useState(null);
  batchOpener.current = session ? (id) => { setBatchRequest({ id, nonce: Date.now() }); navigateTo("schaler"); } : null;
  const clearShoppingList = () => setShoppingList([]);
  const buyShoppingItem = (item) => {
    if (item.id) setVoorraad(voorraadArr.includes(item.id) ? voorraadArr : [...voorraadArr, item.id]);
    removeFromShoppingList(item.key);
  };
  // "Ongedaan maken" na afvinken: terug op de lijst, en uit de voorraad als
  // het daar vóór het afvinken nog niet stond.
  const undoBuyShoppingItem = (item, wasOwned) => {
    if (item.id && !wasOwned) setVoorraad(voorraadArr.filter(id => id !== item.id));
    setShoppingList(shoppingList.some(i => i.key === item.key) ? shoppingList : [...shoppingList, item]);
  };
  // Per drank de gekozen fles uit "Fles kiezen" (id uit de tabel `flessen`).
  const [chosenBottles, setChosenBottles] = useStorage("thuisbar-gekozen-flessen", {});

  // De native splash (launchAutoHide: false) ging voorheen alleen weg via de
  // in-app SplashScreen, en die draait enkel voor ingelogde gebruikers — bij
  // een verse installatie (leeftijdspoort, gastmodus, inlogscherm) bleef het
  // Capacitor-logo dus eeuwig staan. Nu verbergen we 'm zodra er een echt
  // scherm klaarstaat, ongeacht welk.
  const firstScreenReady = ageVerified === false || (ageVerified === true && (guestMenuIds || surveyId || session !== undefined));
  useEffect(() => { if (firstScreenReady) hideNativeSplash(); }, [firstScreenReady]);

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
        shoppingKeys={shoppingKeys} onRemoveFromShoppingList={removeFromShoppingList}
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
      <StatusBarBackdrop showAfter={tab === "home" ? 95 : 0} />
      {/* Signage band: alleen op Home. Andere tabs krijgen een iOS-large-title
          i.p.v. dit groene blok — zie LargeTitleHeader binnen elke tab. */}
      {tab === "home" && (
        <div style={{ background: `radial-gradient(ellipse 900px 300px at 15% -40%, #2A4B42, ${BOTTLE_DARK} 70%)`, borderBottom: `3px solid ${BRASS}`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(184,134,46,${timeWarmth}), transparent 60%)`, pointerEvents: "none" }} />
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 22px) 20px 20px", display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 52, height: 52, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: "rgba(184,134,46,0.08)", flexShrink: 0 }}>
              <Martini color={BRASS} size={26} strokeWidth={1.5} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS, marginBottom: 2 }}>{profile?.name ? `${greeting}, ${profile.name}` : greeting}</div>
              <h1 style={{ fontFamily: systemFont, fontSize: 30, fontWeight: 700, color: CREAM, margin: 0, letterSpacing: 0.2 }}>Mijn Thuisbar</h1>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: tab === "home" ? "28px 20px calc(env(safe-area-inset-bottom) + 150px)" : "calc(env(safe-area-inset-top) + 6px) 20px calc(env(safe-area-inset-bottom) + 150px)" }}>
        <TabPanel id="home" active={tab === "home"} visited={visitedTabs.has("home")} panelRef={panelRefs}>
          <HomeTab session={session} profile={profile} greeting={greeting} featuredRecipe={featuredRecipe}
            favoriteFamily={checkinInsights.favoriteFamilyEntry?.[0] || null}
            logboek={logboek} recipes={allRecipes} allIngredients={allIngredients} active={tab === "home"}
            onOpenRecipe={openRecipeDetail} onOpenCheckin={openCheckin} onSound={chime}
            onReloadLogboek={reloadLogboek} homeTapTick={homeTapTick} courseRank={courseRank} />
        </TabPanel>
        <TabPanel id="ontdekken" active={tab === "ontdekken"} visited={visitedTabs.has("ontdekken")} panelRef={panelRefs}>
          <OntdekkenTab active={tab === "ontdekken"}
            recipeBackLabel={recipeBackLabel} onRecipeBack={recipeOrigin ? returnFromRecipe : null} rootTapTick={ontdekkenTapTick}
            openRecipeId={pendingRecipeId} onOpenRecipeHandled={() => setPendingRecipeId(null)}
            recommended={checkinInsights.recommended} favoriteFamily={checkinInsights.favoriteFamilyEntry?.[0] || null}
            allIngredients={allIngredients} onOpenRecipe={openRecipeDetail} onSound={chime}
            makenProps={{
              recipes: allRecipes, isOwned, ingredientLabel, allIngredients,
              onAddToShoppingList: addToShoppingList, onSound: chime,
              onOpenRecipe: openRecipeDetail, onAddToFeest: addRecipeToFeest, feestChosen,
              shoppingKeys, onRemoveFromShoppingList: removeFromShoppingList,
              favoriteRecipeIds, onToggleFavorite: toggleFavoriteRecipe, onOpenCheckin: openCheckin,
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
          <BarTab onSelect={navigateTo} shoppingCount={shoppingList.length} feestCount={feestChosen.length} active={tab === "bar"}
            voorraadCount={voorraad.size} customRecipesCount={customRecipes.length}
            feestSubtitle={upcomingParties[0] ? `${upcomingParties[0].name} · ${formatPartyWhen(upcomingParties[0]).toLowerCase()}` : "Plan een avond"}
            courseProgress={courseProgress} />
        </TabPanel>
        <TabPanel id="profiel" active={tab === "profiel"} visited={visitedTabs.has("profiel")} panelRef={panelRefs}>
          <LogboekTab recipes={allRecipes} logboek={logboek} onAddEntry={addLogEntry} onRemoveEntry={removeLogEntry} allIngredients={allIngredients} ingredientLabel={ingredientLabel} onSound={chime} isOwned={isOwned} profile={profile} onOpenRecipe={openRecipeDetail} checkinRequest={checkinRequest}
            onUpdateName={updateProfileName} onUpdatePhoto={updateProfilePhoto} courseDiploma={courseDiploma} courseProgress={courseProgress} courseRank={courseRank}
            onGoVrienden={() => navigateTo("vrienden")} onGoInstellingen={() => navigateTo("instellingen")} active={tab === "profiel"} />
        </TabPanel>

        <TabPanel id="voorraad" active={tab === "voorraad"} visited={visitedTabs.has("voorraad")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.voorraad} onBack={() => navigateTo("bar", { restore: true })}>
            <VoorraadTab allIngredients={allIngredients} recipes={allRecipes} isOwned={isOwned} voorraad={voorraad}
              voorraadAantal={voorraadAantal} onAdjustAantal={adjustAantal}
              onToggle={toggleIngredient} onAddCustom={addCustomIngredient} onRemoveCustom={removeCustomIngredient}
              niveaus={voorraadNiveau} onSetNiveau={setNiveau} onAddPack={addPack} onUndoPack={undoPack}
              onAddToShoppingList={addToShoppingList} shoppingKeys={shoppingKeys} onOpenFullRecipe={openRecipeDetail} onSound={chime} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="mandje" active={tab === "mandje"} visited={visitedTabs.has("mandje")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.mandje} onBack={() => navigateTo("bar", { restore: true })}>
            <WinkelmandjeTab shoppingList={shoppingList} recipes={allRecipes} isOwned={isOwned} allIngredients={allIngredients}
              onRemove={removeFromShoppingList} onBuy={buyShoppingItem} onUndoBuy={undoBuyShoppingItem} onClear={clearShoppingList} onAdd={addToShoppingList} onSound={chime}
              bottleOptions={bottleOptions} chosenBottles={chosenBottles} onChooseBottle={(ingredientId, flesId) => setChosenBottles({ ...chosenBottles, [ingredientId]: flesId })} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="schaler" active={tab === "schaler"} visited={visitedTabs.has("schaler")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.schaler} onBack={() => navigateTo("bar", { restore: true })}>
            <BatchCalculatorTab recipes={allRecipes} ingredientLabel={ingredientLabel} allIngredients={allIngredients} isOwned={isOwned}
              voorraadAantal={voorraadAantal} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
              shoppingKeys={shoppingKeys} onAddToShoppingList={addToShoppingList} onSound={chime} request={batchRequest} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="balans" active={tab === "balans"} visited={visitedTabs.has("balans")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.balans} onBack={() => navigateTo("bar", { restore: true })}>
            <MenuAssistentTab recipes={allRecipes} isOwned={isOwned} allIngredients={allIngredients} ingredientLabel={ingredientLabel}
              favoriteRecipeIds={favoriteRecipeIds} recentRecipeIds={recentRecipeIds} tasteLikes={menuTasteLikes} parties={parties.parties}
              onAddToShoppingList={addToShoppingList} onSound={chime}
              onUseInFeestplanner={async (ids, guests) => {
                const target = await resolveTargetParty({ guests });
                if (!target) return;
                parties.updateParty(target.id, { cocktail_ids: ids });
                setOpenPartyId(target.id);
                navigateTo("feest");
              }} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="cursus" active={tab === "cursus"} visited={visitedTabs.has("cursus")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.cursus} onBack={() => navigateTo("bar", { restore: true })}>
            <CursusTab progress={courseProgress} setProgress={setCourseProgress} onSound={chime}
              recipes={allRecipes} allIngredients={allIngredients} onOpenRecipe={openRecipeDetail} onCheckin={openCheckin} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="feest" active={tab === "feest"} visited={visitedTabs.has("feest")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.feest} onBack={() => navigateTo("bar", { restore: true })}>
            <FeestplannerTab session={session} recipes={allRecipes} isOwned={isOwned} ingredientLabel={ingredientLabel} allIngredients={allIngredients}
              onAddToShoppingList={addToShoppingList} voorraadAantal={voorraadAantal} onSound={chime} onOpenRecipe={openRecipeDetail}
              parties={parties.parties} onCreateParty={parties.createParty} onUpdateParty={parties.updateParty} onDeleteParty={parties.deleteParty}
              openPartyId={openPartyId} onOpenPartyHandled={() => setOpenPartyId(null)}
              hostName={profile?.name || ""}
              active={tab === "feest"} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="eigen" active={tab === "eigen"} visited={visitedTabs.has("eigen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.eigen} onBack={() => navigateTo("bar", { restore: true })}>
            <EigenRecepten customRecipes={customRecipes} allIngredients={allIngredients} recipes={allRecipes} isOwned={isOwned}
              recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds} shoppingKeys={shoppingKeys}
              onSaveRecipe={saveCustomRecipe} onRemoveRecipe={(id) => { chime("remove"); setCustomRecipes(customRecipes.filter(r => r.id !== id)); }}
              onAddToShoppingList={addToShoppingList} onOpenRecipe={openRecipeDetail} onSound={chime} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="vrienden" active={tab === "vrienden"} visited={visitedTabs.has("vrienden")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Profiel" title={PUSH_SCREEN_TITLES.vrienden} onBack={() => navigateTo("profiel", { restore: true })}>
            <VriendenTab session={session} profile={profile} recipes={allRecipes} allIngredients={allIngredients} onSound={chime} active={tab === "vrienden"} myLogboek={logboek} onOpenRecipe={openRecipeDetail} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="instellingen" active={tab === "instellingen"} visited={visitedTabs.has("instellingen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Profiel" title={PUSH_SCREEN_TITLES.instellingen} onBack={() => navigateTo("profiel", { restore: true })}>
            <InstellingenTab soundEnabled={soundEnabled} onToggleSound={setSoundEnabled} onSignOut={() => supabase.auth.signOut()} push={push} onNavigate={navigateTo} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="privacybeleid" active={tab === "privacybeleid"} visited={visitedTabs.has("privacybeleid")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES.privacybeleid} onBack={() => navigateTo("instellingen", { restore: true })}>
            <PrivacyPolicyScreen />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="account-verwijderen" active={tab === "account-verwijderen"} visited={visitedTabs.has("account-verwijderen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES["account-verwijderen"]} onBack={() => navigateTo("instellingen", { restore: true })}>
            <AccountDeleteScreen onDelete={deleteAccount} busy={deletingAccount} error={deleteAccountError} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="fotoverantwoording" active={tab === "fotoverantwoording"} visited={visitedTabs.has("fotoverantwoording")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES.fotoverantwoording} onBack={() => navigateTo("instellingen", { restore: true })}>
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
  const H = ({ children }) => <h3 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16, color: BOTTLE, margin: "22px 0 8px" }}>{children}</h3>;
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
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 14.5, color: INK }}>{e.name}</div>
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
function BarTab({ onSelect, shoppingCount, active, voorraadCount, customRecipesCount, feestSubtitle, courseProgress, feestCount = 0 }) {
  // Subtitels tonen echte staat i.p.v. altijd dezelfde statische tekst —
  // net als de rest van de app ("geen verzonnen smaakscheikunde"): een
  // lege voorraad/winkelmandje/eigen-recepten zegt dat het leeg is, en de
  // cursus toont voortgang zodra er voortgang ís, anders de vaste
  // structuur (6 delen komt letterlijk uit COURSE_PARTS).
  const completedLessons = COURSE_LESSONS.filter(l => courseProgress?.[l.id]?.completed).length;
  const courseSubtitle = completedLessons > 0 ? `${completedLessons}/${COURSE_LESSONS.length} lessen` : `${COURSE_PARTS.length} delen`;

  const items = [
    { id: "mandje", label: "Winkelmandje", icon: ShoppingCart, subtitle: shoppingCount > 0 ? `${shoppingCount} item${shoppingCount === 1 ? "" : "s"}` : "Leeg", badge: shoppingCount },
    { id: "feest", label: "Feestplanner", icon: PartyPopper, subtitle: feestSubtitle, badge: feestCount },
    { id: "cursus", label: "Cursus", icon: GraduationCap, subtitle: courseSubtitle },
    { id: "eigen", label: "Eigen recepten", icon: FlaskConical, subtitle: customRecipesCount > 0 ? `${customRecipesCount} eigen recept${customRecipesCount === 1 ? "" : "en"}` : "Maak je eerste" },
    { id: "schaler", label: "Batch-calculator", icon: Scale, subtitle: "Cocktails voor een groep of vooraf in een fles" },
    { id: "balans", label: "Menu-assistent", icon: ListChecks, subtitle: "Stel in 1 minuut een menu in balans samen" },
  ];
  return (
    <div>
      <LargeTitleHeader title="Bar" active={active} />

      <button onClick={() => onSelect("voorraad")} className="press-scale" style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left", boxSizing: "border-box",
        background: BOTTLE_DARK, border: "none", borderRadius: RADIUS + 8, padding: "16px 18px", marginBottom: 14,
        cursor: "pointer", color: CREAM, fontFamily: sans, boxShadow: SHADOW_CARD,
      }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: RADIUS, background: "rgba(245,239,230,0.14)", flexShrink: 0 }}>
          <Refrigerator size={19} strokeWidth={1.8} color={BRASS} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Voorraad</div>
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 1 }}>{voorraadCount > 0 ? `${voorraadCount} in huis` : "Nog leeg · vul in wat je hebt"}</div>
        </span>
        <ChevronRight size={17} color={CREAM} style={{ opacity: 0.7, flexShrink: 0 }} />
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {items.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => onSelect(t.id)} className="press-scale" style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, textAlign: "left", boxSizing: "border-box",
              background: CREAM, border: `1px solid ${BORDER}`, borderRadius: RADIUS + 6, padding: "16px 14px",
              cursor: "pointer", fontFamily: sans, boxShadow: SHADOW_CARD, position: "relative",
            }}>
              <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
                <Icon size={17} strokeWidth={1.8} />
                {/* Klein tellerbolletje (zoals op de onderbalk): aantal items in
                    het winkelmandje / cocktails op het menu van het volgende feest. */}
                {t.badge > 0 && (
                  <span aria-label={`${t.badge}`} style={{
                    position: "absolute", top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, padding: "0 5px", boxSizing: "border-box",
                    background: BRASS, color: CREAM, fontSize: 10.5, fontWeight: 700, fontFamily: sans,
                    display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${CREAM}`,
                  }}>{t.badge > 99 ? "99+" : t.badge}</span>
                )}
              </span>
              <span>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: INK }}>{t.label}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{t.subtitle}</div>
              </span>
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
// Feestplanner Deel B: één rij per feest in Supabase i.p.v. één losse set
// voorkeuren op het apparaat (Deel A). Bij de allereerste keer laden na de
// upgrade, als er nog geen enkel feest bestaat maar er WEL oude lokale
// feestplanner-data staat (gekozen cocktails, afgevinkte inkoop/voorbereiding,
// of een lopende smaaktest), zetten we die eenmalig over naar één feest
// "Mijn feest" — daarna nooit meer, ook niet als dat feest later verwijderd
// wordt (vandaar de aparte "migrated"-vlag i.p.v. simpelweg "parties leeg?").
// Leest de oude Preferences-sleutels rechtstreeks (niet via useStorage) om de
// race met useStorage's asynchrone eerste load te vermijden: dat zou anders
// per ongeluk "geen oude data" kunnen concluderen vóórdat de echte waarde is
// teruggekomen, en dat mag hier niet — "geen dataverlies" is de harde eis.
async function readLegacyFeestData() {
  const [chosenRaw, boughtRaw, prepRaw] = await Promise.all([
    Preferences.get({ key: "thuisbar-feest-chosen" }),
    Preferences.get({ key: "thuisbar-feest-inkoop-checked" }),
    Preferences.get({ key: "thuisbar-feest-voorbereiding-checked" }),
  ]);
  const parse = (raw, fallback) => { try { return raw.value != null ? JSON.parse(raw.value) : fallback; } catch { return fallback; } };
  return {
    cocktailIds: parse(chosenRaw, []),
    boughtItems: parse(boughtRaw, []),
    prepDone: parse(prepRaw, []),
  };
}

// "Aankomend" = een datum in de toekomst OF geen datum, op kalenderdag
// vergeleken (niet op exacte tijd) zodat een feest dat vandaag al bezig is
// niet per ongeluk als "Eerder" telt zodra het geplande tijdstip voorbij is.
function isPartyUpcoming(party) {
  if (!party.starts_at) return true;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  return new Date(party.starts_at) >= startOfToday;
}
// Oplopend op datum, geen-datum-feesten achteraan (net als de referentie:
// "Aankomend" toont eerst wat een concrete datum heeft).
function compareUpcomingParties(a, b) {
  if (!a.starts_at && !b.starts_at) return new Date(a.created_at) - new Date(b.created_at);
  if (!a.starts_at) return 1;
  if (!b.starts_at) return -1;
  return new Date(a.starts_at) - new Date(b.starts_at);
}

// "Over X dagen" / "Vandaag" / "Geen datum" — gedeeld door de feestenlijst
// (kaart-chip) en de Bar-tegel, op kalenderdagen (niet exacte uren) net als
// isPartyUpcoming hierboven.
function formatPartyWhen(party) {
  if (!party.starts_at) return "Geen datum";
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfThat = new Date(party.starts_at); startOfThat.setHours(0, 0, 0, 0);
  const days = Math.round((startOfThat - startOfToday) / 86400000);
  if (days === 0) return "Vandaag";
  if (days > 0) return `Over ${days} dag${days === 1 ? "" : "en"}`;
  return `${Math.abs(days)} dag${Math.abs(days) === 1 ? "" : "en"} geleden`;
}

function useParties(session) {
  const myId = session?.user?.id;
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrated, setMigrated] = useStorage("thuisbar-feest-migrated", false);

  const reload = async () => {
    if (!myId) { setParties([]); setLoading(false); return []; }
    const { data } = await supabase.from("parties").select("*").eq("user_id", myId).order("created_at", { ascending: true });
    setParties(data || []);
    setLoading(false);
    return data || [];
  };

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    (async () => {
      const existing = await reload();
      if (cancelled || migrated || existing.length > 0) return;
      const legacy = await readLegacyFeestData();
      const hasLegacyData = legacy.cocktailIds.length > 0 || legacy.boughtItems.length > 0 || legacy.prepDone.length > 0;
      let tasteSurveyId = null;
      if (hasLegacyData) {
        const { data: survey } = await supabase.from("party_surveys").select("id").eq("host_user_id", myId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        tasteSurveyId = survey?.id || null;
      }
      if (cancelled) return;
      setMigrated(true);
      if (!hasLegacyData) return;
      const { data } = await supabase.from("parties").insert({
        user_id: myId, name: "Mijn feest", guests: 8, drinks_per_guest: 2,
        cocktail_ids: legacy.cocktailIds, bought_items: legacy.boughtItems, prep_done: legacy.prepDone,
        taste_survey_id: tasteSurveyId,
      }).select().single();
      if (!cancelled && data) setParties([data]);
    })();
    return () => { cancelled = true; };
  }, [myId]);

  // Zolang de adres-migratie (20261006120000_party_address.sql) niet gedraaid
  // is, bestaan address/show_address nog niet: dan opnieuw proberen zonder,
  // zodat aanmaken en opslaan van een feest gewoon blijft werken.
  const withoutAddress = ({ address, show_address, ...rest }) => rest;
  const isAddressColumnError = (error) => /address/i.test(error?.message || "");
  const createParty = async (fields) => {
    let { data, error } = await supabase.from("parties").insert({ user_id: myId, ...fields }).select().single();
    if (error && isAddressColumnError(error)) ({ data, error } = await supabase.from("parties").insert({ user_id: myId, ...withoutAddress(fields) }).select().single());
    if (error) return null;
    setParties(prev => [...prev, data]);
    return data;
  };
  const updateParty = async (id, patch) => {
    setParties(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
    let { data, error } = await supabase.from("parties").update(patch).eq("id", id).select().single();
    if (error && isAddressColumnError(error) && Object.keys(withoutAddress(patch)).length > 0) {
      ({ data } = await supabase.from("parties").update(withoutAddress(patch)).eq("id", id).select().single());
      if (data) data = { ...data, address: patch.address, show_address: patch.show_address };
    }
    if (data) setParties(prev => prev.map(p => (p.id === id ? data : p)));
  };
  const deleteParty = async (id) => {
    setParties(prev => prev.filter(p => p.id !== id));
    cancelPartyReminder(id);
    await supabase.from("parties").delete().eq("id", id);
  };

  return { parties, loading, reload, createParty, updateParty, deleteParty };
}

// Lokale meldingen ("2 uur van tevoren") voor een feest — puur op het
// apparaat via @capacitor/local-notifications, geen server/push bij nodig.
// Notification-id's moeten een 32-bits getal zijn, dus hashen we de
// (string) feest-id naar een stabiel getal i.p.v. een losse teller bij te
// houden: hetzelfde feest levert altijd hetzelfde id op, dus een latere
// cancel/reschedule vindt 'm altijd terug zonder aparte boekhouding.
function partyNotificationId(partyId) {
  let hash = 0;
  for (let i = 0; i < partyId.length; i++) {
    hash = (hash * 31 + partyId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
async function cancelPartyReminder(partyId) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: partyNotificationId(partyId) }] });
  } catch { /* geen native platform (web-preview) of al geannuleerd — niet kritiek */ }
}
// Geeft "ok" | "no-date" | "in-past" | "denied" | "failed" terug zodat de UI
// een concrete reden kan tonen i.p.v. de schakelaar stilzwijgend terug te zetten.
async function schedulePartyReminder(party) {
  if (!party.starts_at) return "no-date";
  const at = new Date(new Date(party.starts_at).getTime() - 2 * 60 * 60 * 1000);
  if (at.getTime() <= Date.now()) return "in-past";
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return "denied";
    await LocalNotifications.schedule({
      notifications: [{
        id: partyNotificationId(party.id),
        title: "Mijn Thuisbar",
        body: `Over 2 uur begint ${party.name} – tijd om ijs te halen`,
        schedule: { at },
      }],
    });
    return "ok";
  } catch {
    return "failed";
  }
}

// Je geaccepteerde vrienden (voor taggen bij het inchecken). Pas laden als
// het nodig is (enabled), en daarna bewaren.
function useFriendList(myId, enabled) {
  const [friends, setFriends] = useState(null);
  useEffect(() => {
    if (!enabled || !myId || friends) return;
    let cancelled = false;
    supabase.from("friendships").select("*").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`).eq("status", "accepted")
      .then(async ({ data }) => {
        const ids = [...new Set((data || []).map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id)))];
        if (ids.length === 0) { if (!cancelled) setFriends([]); return; }
        const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
        if (!cancelled) setFriends((profs || []).sort((a, b) => (a.name || "").localeCompare(b.name || "", "nl")));
      });
    return () => { cancelled = true; };
  }, [myId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return friends;
}
// "Lisa", "Lisa en Sem", "Lisa, Sem en Anouk"
function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} en ${names[names.length - 1]}`;
}
// Tags bij een set check-ins: { checkinId: [{ id, name }] }. Namen komen uit
// de profielen die we al kennen; onbekende (vrienden van vrienden) halen we op.
function useCheckinTags(checkinIds, active, knownProfiles, reloadKey) {
  const [tags, setTags] = useState({});
  const key = checkinIds.join(",");
  useEffect(() => {
    if (!active || checkinIds.length === 0) { setTags({}); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("checkin_tags").select("checkin_id, tagged_user_id").in("checkin_id", checkinIds);
      if (cancelled || error || !data) return;
      const names = {};
      Object.values(knownProfiles || {}).forEach(p => { if (p?.id) names[p.id] = p.name; });
      const missing = [...new Set(data.map(t => t.tagged_user_id))].filter(id => !names[id]);
      if (missing.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, name").in("id", missing);
        (profs || []).forEach(p => { names[p.id] = p.name; });
      }
      if (cancelled) return;
      const map = {};
      data.forEach(t => { (map[t.checkin_id] = map[t.checkin_id] || []).push({ id: t.tagged_user_id, name: names[t.tagged_user_id] || "een vriend" }); });
      setTags(map);
    })();
    return () => { cancelled = true; };
  }, [key, active, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return tags;
}
// Openstaande tags voor jou: iemand heeft je getagd en je hebt de check-in
// nog niet overgenomen of weggetikt.
function useTagInbox(myId, active, reloadKey) {
  const [items, setItems] = useState([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || !myId) return;
    let cancelled = false;
    (async () => {
      const { data: tags, error } = await supabase.from("checkin_tags").select("*")
        .eq("tagged_user_id", myId).is("adopted_checkin_id", null).eq("dismissed", false)
        .order("created_at", { ascending: false }).limit(5);
      if (cancelled || error || !tags || tags.length === 0) { if (!cancelled) setItems([]); return; }
      const [{ data: checkins }, { data: profs }] = await Promise.all([
        supabase.from("checkins").select("*").in("id", tags.map(t => t.checkin_id)),
        supabase.from("profiles").select("id, name, avatar_url").in("id", [...new Set(tags.map(t => t.tagger_id))]),
      ]);
      if (cancelled) return;
      const byId = Object.fromEntries((checkins || []).map(c => [c.id, checkinRowToEntry(c)]));
      const profById = Object.fromEntries((profs || []).map(p => [p.id, p]));
      setItems(tags.filter(t => byId[t.checkin_id]).map(t => ({ tag: t, entry: byId[t.checkin_id], tagger: profById[t.tagger_id] || null })));
    })();
    return () => { cancelled = true; };
  }, [myId, active, reloadKey, tick]);
  const dismiss = async (tagId) => {
    setItems(cur => cur.filter(i => i.tag.id !== tagId));
    await supabase.from("checkin_tags").update({ dismissed: true }).eq("id", tagId);
  };
  return { items, dismiss, reload: () => setTick(t => t + 1) };
}

function useFriendsFeed(session, active) {
  const myId = session?.user?.id;
  const [friendProfiles, setFriendProfiles] = useState({});
  const [feed, setFeed] = useState([]);
  const [milestones, setMilestones] = useState([]);
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
        // Cursusmomenten (nieuwe rang, diploma) van jezelf en je vrienden.
        // Faalt stil zolang de migratie er nog niet is.
        supabase.from("course_milestones").select("*").in("user_id", [myId, ...friendIds]).order("created_at", { ascending: false }).limit(20)
          .then(({ data: ms, error }) => {
            if (cancelled) return;
            setMilestones(error ? [] : (ms || []).map(m => ({
              kind: "rank", id: m.id, createdAt: m.created_at, date: (m.created_at || "").slice(0, 10),
              rankId: m.rank, partsDone: m.parts_done, mine: m.user_id === myId, friendId: m.user_id === myId ? null : m.user_id,
            })));
          });
        if (friendIds.length === 0) { setFeed([]); setFriendProfiles({}); return; }
        const { data: profs } = await supabase.from("profiles").select("*").in("id", friendIds);
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

  return { feed, milestones, friendProfiles, reload };
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

function HomeTab({ session, profile, greeting, featuredRecipe, favoriteFamily, logboek, recipes, allIngredients, onOpenRecipe, onOpenCheckin, onSound, onReloadLogboek, homeTapTick, active, courseRank }) {
  const [photoViewer, setPhotoViewer] = useState(null);
  const myId = session?.user?.id;
  const { feed: friendFeed, milestones, friendProfiles, reload: reloadFriendFeed } = useFriendsFeed(session, active);
  const combinedFeed = useMemo(() => {
    const mine = logboek.map(e => ({ ...e, mine: true }));
    const theirs = friendFeed.map(e => ({ ...e, mine: false }));
    return [...mine, ...theirs, ...milestones].sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()).slice(0, 20);
  }, [logboek, friendFeed, milestones]);
  const feedIds = useMemo(() => combinedFeed.filter(e => e.kind !== "rank").map(e => e.id), [combinedFeed]);
  const milestoneIds = useMemo(() => combinedFeed.filter(e => e.kind === "rank").map(e => e.id), [combinedFeed]);
  const [rankCheers, setRankCheers] = useState({});
  const milestoneKey = milestoneIds.join(",");
  useEffect(() => {
    if (!active || !myId || milestoneIds.length === 0) { setRankCheers({}); return; }
    let cancelled = false;
    supabase.from("course_milestone_reactions").select("milestone_id, user_id").in("milestone_id", milestoneIds).then(({ data }) => {
      if (cancelled) return;
      const map = {};
      (data || []).forEach(r => {
        if (!map[r.milestone_id]) map[r.milestone_id] = { count: 0, mine: false };
        map[r.milestone_id].count += 1;
        if (r.user_id === myId) map[r.milestone_id].mine = true;
      });
      setRankCheers(map);
    });
    return () => { cancelled = true; };
  }, [myId, milestoneKey, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRankCheer = async (milestoneId) => {
    if (!myId) return;
    const current = rankCheers[milestoneId] || { count: 0, mine: false };
    onSound(current.mine ? "remove" : "pop");
    setRankCheers(r => ({ ...r, [milestoneId]: { count: current.count + (current.mine ? -1 : 1), mine: !current.mine } }));
    if (current.mine) {
      await supabase.from("course_milestone_reactions").delete().eq("milestone_id", milestoneId).eq("user_id", myId);
    } else {
      await supabase.from("course_milestone_reactions").insert({ milestone_id: milestoneId, user_id: myId });
    }
  };
  const rankOf = (entry) => entry.mine ? courseRank : profileCourseRank(friendProfiles[entry.friendId]);
  const knownProfiles = useMemo(() => ({ ...friendProfiles, ...(profile?.id ? { [profile.id]: profile } : {}) }), [friendProfiles, profile]);
  const checkinTags = useCheckinTags(feedIds, active, knownProfiles, logboek.length);
  const tagInbox = useTagInbox(myId, active, logboek.length);
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
          background: BOTTLE_DARK, boxShadow: SHADOW_HERO, color: CREAM, fontFamily: sans,
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
            <div className="glass-chip" style={{ display: "inline-block", borderRadius: 100, padding: "4px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
              Uitgelicht
            </div>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26 }}>{featuredRecipe.name}</div>
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

      {photoViewer && <CheckinPhotoViewer {...photoViewer} allIngredients={allIngredients} onClose={() => setPhotoViewer(null)} />}
      {tagInbox.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {tagInbox.items.map(({ tag, entry, tagger }) => {
            const taggerName = tagger?.name || "Een vriend";
            return (
              <div key={tag.id} style={{ background: BOTTLE_DARK, color: CREAM, borderRadius: 16, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={taggerName} photo={tagger?.avatar_url} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.35 }}><strong>{taggerName}</strong> heeft je getagd bij <span style={{ fontFamily: serif, fontWeight: 700 }}>{entry.name}</span></div>
                    <div style={{ fontSize: 12, color: "#C9D2CB", marginTop: 2 }}>{entry.location} · {entry.date}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => onOpenCheckin({
                    name: entry.name, location: entry.location, photo: entry.photo,
                    adoptTag: { id: tag.id, checkinId: entry.id, taggerId: tag.tagger_id, taggerName: taggerName.split(" ")[0] },
                  })} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "none", background: BRASS, color: BOTTLE_DARK, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>
                    Ook inchecken
                  </button>
                  <button onClick={() => tagInbox.dismiss(tag.id)} style={{ minHeight: 42, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(251,246,234,0.25)", background: "none", color: CREAM, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: sans }}>
                    Niet nu
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            if (entry.kind === "rank") {
              const who = entry.mine ? (profile?.name || "Jij") : (friendProfiles[entry.friendId]?.name || "Vriend");
              const whoAvatar = entry.mine ? profile?.avatar_url : friendProfiles[entry.friendId]?.avatar_url;
              const rankDef = COURSE_RANKS.find(r => r.id === entry.rankId);
              if (!rankDef) return null;
              const isMaster = entry.rankId === "meester";
              const lastPart = COURSE_PARTS[Math.max(0, Math.min(COURSE_PART_COUNT, entry.partsDone) - 1)];
              const cheer = rankCheers[entry.id] || { count: 0, mine: false };
              return (
                <div key={`r-${entry.id}`} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", boxShadow: SHADOW_CARD }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px 10px" }}>
                    <CourseRing name={who} photo={whoAvatar} size={38} partsDone={isMaster ? COURSE_PART_COUNT : entry.partsDone} master={isMaster} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: INK }}>
                        {entry.mine ? <strong>{who}</strong> : (
                          <button onClick={() => setOpenFriendId(entry.friendId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: INK }}>{who}</button>
                        )}{isMaster ? " heeft het diploma gehaald" : <> is nu <strong>{rankDef.name}</strong></>}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Cursus · {entry.date}</div>
                    </div>
                  </div>
                  <div style={{ margin: "0 14px 12px", padding: 18, borderRadius: 14, background: BOTTLE_DARK, color: CREAM, display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ width: 56, height: 56, borderRadius: "50%", border: `2px solid ${BRASS}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", color: "#DDB877", flexShrink: 0, background: isMaster ? "rgba(184,134,46,0.18)" : "none" }}>
                      {isMaster ? <GraduationCap size={26} strokeWidth={1.7} /> : <Martini size={26} strokeWidth={1.7} />}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#DDB877" }}>{isMaster ? "Diploma" : "Nieuwe rang"}</div>
                      <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, marginTop: 2 }}>{isMaster ? "Meester" : rankDef.name}</div>
                      <div style={{ fontSize: 12.5, color: "#C9D2CB", marginTop: 3 }}>
                        {isMaster ? "Alle 6 delen en de eindtoets gehaald" : `${lastPart ? `${lastPart.title} afgerond · ` : ""}${entry.partsDone} van ${COURSE_PART_COUNT} delen`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 12px" }}>
                    <button onClick={() => toggleRankCheer(entry.id)} className="press-scale" style={{
                      display: "flex", alignItems: "center", gap: 6, border: `1px solid ${cheer.mine ? BRASS : BORDER}`, cursor: "pointer",
                      background: cheer.mine ? "rgba(184,134,46,0.1)" : "none", color: cheer.mine ? BRASS : MUTED,
                      borderRadius: 100, padding: "7px 12px", fontSize: 12, fontWeight: 700,
                    }}>
                      <Wine size={13} /> {cheer.count > 0 ? cheer.count : ""} Proost
                    </button>
                  </div>
                </div>
              );
            }
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
                  <RankAvatar name={who} photo={whoAvatar} size={38} courseRank={rankOf(entry)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {entry.mine ? (
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>{who}</span>
                    ) : (
                      <button onClick={() => setOpenFriendId(entry.friendId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: INK }}>
                        {who}
                      </button>
                    )}
                    {rankOf(entry)?.rank && <span style={{ marginLeft: 6 }}><CourseRankLabel courseRank={rankOf(entry)} /></span>}
                    {checkinTags[entry.id]?.length > 0 && (
                      <div style={{ fontSize: 12.5, color: INK, marginTop: 1 }}>met {joinNames(checkinTags[entry.id].map(t => (t.name || "een vriend").split(" ")[0]))}</div>
                    )}
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 1, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      <MapPin size={11} style={{ flexShrink: 0 }} /> {entry.location} · {entry.date}
                    </div>
                  </div>
                </div>

                <div onClick={photo ? () => setPhotoViewer({ entry, matched, who, whoAvatar }) : undefined}
                  style={{ height: photo ? 190 : 150, position: "relative", margin: "0 0 12px", cursor: photo ? "zoom-in" : undefined }}>
                  {photo ? (
                    <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, background: BOTTLE_DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {matched ? (
                        <GlassArt glass={matched.glass} colors={tint} garnishes={inferGarnishes(matched, allIngredients)} rim={inferRim(matched, allIngredients)} foam={inferFoam(matched, allIngredients)} iceStyle={inferIceStyle(matched)} size={100} />
                      ) : (
                        <Martini size={40} color="rgba(251,246,234,0.85)" strokeWidth={1.3} />
                      )}
                    </div>
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(19,38,34,0) 45%, rgba(15,26,23,0.5) 100%)" }} />
                  <div className="glass-chip-dark" style={{ position: "absolute", left: 12, bottom: 10, display: "flex", alignItems: "center", gap: 4, borderRadius: 100, padding: "4px 9px", color: CREAM, fontSize: 12, fontWeight: 700 }}>
                    <Star size={11} fill={BRASS} color={BRASS} /> {formatRating(entry.rating)}
                  </div>
                </div>

                <div style={{ padding: "0 14px 14px" }}>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, color: INK, marginBottom: 2 }}>{entry.name}</div>
                  {matched && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 9 }}>{matched.family} · {matched.glass}</div>}
                  {entry.notes && <p style={{ margin: "0 0 9px", fontSize: 12.5, color: INK, lineHeight: 1.5 }}>&ldquo;{entry.notes}&rdquo;</p>}
                  {entry.tasteTags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 11 }}>
                      {entry.tasteTags.map(k => CHECKIN_TASTE_META[k] && (
                        <span key={k} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 100, background: PAPER_DEEP, color: INK, border: `1px solid ${BORDER}` }}>
                          {CHECKIN_TASTE_META[k].emoji} {CHECKIN_TASTE_META[k].label}
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
                      <Wine size={13} /> {cheer.count > 0 ? cheer.count : ""} Proost
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
          myLogboek={logboek}
          myProfile={profile}
          onOpenRecipe={onOpenRecipe}
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
        flex: 1, display: "flex", justifyContent: "center",
        background: "none", border: "none", cursor: "pointer", padding: "4px 2px",
        fontFamily: sans, color: active ? BOTTLE : MUTED,
      }}>
        {/* "Glas"-pil achter de actieve tab, iOS-control-center-achtig: geen
            gekleurde rand (dat oogde als een geel randje i.p.v. glas) en een
            fors sterkere blur+saturate dan de dock zelf, zodat 'ie zich er
            echt bovenuit tilt i.p.v. gewoon "iets lichter dezelfde crème
            kleur" te zijn — puur neutrale wit-tinten, de warmte die je nog
            ziet komt vanzelf van wat erdoorheen schijnt (echt glasgedrag),
            niet van een ingebouwde kleur. */}
        <span style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          padding: "6px 14px 7px", borderRadius: 16, transition: "background 0.2s ease, box-shadow 0.2s ease",
          background: active ? "linear-gradient(160deg, rgba(255,255,255,0.65), rgba(255,255,255,0.3))" : "transparent",
          boxShadow: active
            ? "inset 0 1px 1px rgba(255,255,255,0.95), inset 0 -1px 1px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.12)"
            : "none",
          backdropFilter: active ? "blur(22px) saturate(180%)" : "none", WebkitBackdropFilter: active ? "blur(22px) saturate(180%)" : "none",
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
        </span>
      </button>
    );
  };
  return (
    // Zwevende pil i.p.v. een balk die vastzit aan de onderrand: de buitenste
    // laag is onzichtbaar en alleen voor de veilige-marges-padding
    // (pointerEvents:none, zodat de ruimte ernaast/eronder gewoon aantikbaar
    // blijft), de échte balk erbinnen heeft de marge, afronding en schaduw.
    // 6px lucht boven de home-indicator (was 14px): lager en dichter bij
    // iOS' eigen zwevende tabbalk, maar nog steeds buiten de veegzone van
    // het home-streepje.
    <div className="bottom-dock" style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10,
      padding: "0 14px calc(env(safe-area-inset-bottom) + 6px)", pointerEvents: "none",
    }}>
      <div className="glass-light" style={{
        maxWidth: 960 - 28, margin: "0 auto", display: "flex", alignItems: "flex-end", pointerEvents: "auto",
        borderRadius: 28, padding: "9px 6px",
      }}>
        {left.map(renderBtn)}
        {/* +-knop steekt 18px uit (was 26px): valt minder over de inhoud. */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", marginTop: -18 }}>
          <button onClick={onCheckin} aria-label="Inchecken" className="press-scale" style={{
            width: 54, height: 54, borderRadius: "50%", background: BRASS, border: `4px solid ${PAPER}`,
            boxShadow: "0 6px 16px -4px rgba(184,134,46,0.6), 0 0 0 8px rgba(184,134,46,0.14)",
            display: "flex", alignItems: "center", justifyContent: "center", color: CREAM, cursor: "pointer",
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
    <div style={{ fontFamily: systemFont, fontSize: 20, fontWeight: 700, color: INK, marginBottom: 12 }}>
      {children}
    </div>
  );
}

// iOS-achtige "large title": een grote titel die in de normale flow scrollt,
// met een sentinel eronder die via IntersectionObserver bijhoudt wanneer 'ie
// achter de statusbalk verdwijnt — pas dan faalt de compacte titelbalk in.
// Puur CSS "position: sticky" volstaat niet hier (in tegenstelling tot de
// andere sticky balken in deze app): die zou constant zichtbaar zijn i.p.v.
// pas verschijnen zodra de grote titel is weggescrolld.
// Alle sticky balken staan op top: env(safe-area-inset-top), dus in de strook
// daarboven (achter klok/notch) scrolde de inhoud onbedekt door — dat gaf een
// lelijke "tussenruimte" boven elke sticky balk. Deze vaste strook dekt die
// zone af met exact hetzelfde glas als de balken zelf, zodat balk + strook
// één geheel vormen (zoals een echte iOS-navigatiebalk). `showAfter`: pas
// zichtbaar na zoveel px scrollen — voor schermen die bovenaan een donkergroene
// header hebben die zelf al tot achter de statusbalk doorloopt (Home, gast).
function StatusBarBackdrop({ showAfter = 0 }) {
  const [visible, setVisible] = useState(showAfter === 0);
  useEffect(() => {
    if (showAfter === 0) { setVisible(true); return; }
    const onScroll = () => setVisible(window.scrollY > showAfter);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfter]);
  return (
    <div aria-hidden className="glass-light" style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "env(safe-area-inset-top)", zIndex: 25,
      border: "none", boxShadow: "none", background: "rgba(243,236,221,0.92)", pointerEvents: "none",
      opacity: visible ? 1 : 0, transition: "opacity 0.15s ease",
    }} />
  );
}

function LargeTitleHeader({ title, active = true, sticky = true }) {
  const [collapsed, setCollapsed] = useState(false);
  const sentinelRef = useRef(null);
  useEffect(() => {
    // Andere tabs blijven gemount (display:none) om scrollpositie te bewaren
    // — zo'n verborgen element heeft geen afmeting meer, dus de observer zou
    // 'm als "niet zichtbaar" zien en de titel per ongeluk laten inklappen.
    // Alleen observeren terwijl deze tab echt actief is voorkomt dat.
    if (!active || !sticky) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), { rootMargin: "-45px 0px 0px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, sticky]);
  return (
    <>
      {sticky && (
        <div className="glass-light" style={{
          position: "sticky", top: STICKY_TOP, zIndex: 8,
          display: "flex", alignItems: "center", justifyContent: "center", height: 44,
          marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
          border: "none", borderBottom: collapsed ? `1px solid ${BORDER}` : "1px solid transparent", boxShadow: "none", background: "rgba(243,236,221,0.92)",
          opacity: collapsed ? 1 : 0, pointerEvents: collapsed ? "auto" : "none",
          transition: "opacity 0.18s ease, border-color 0.18s ease",
          fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK,
        }}>
          {title}
        </div>
      )}
      <h1 style={{ fontFamily: systemFont, fontWeight: 800, fontSize: 34, color: INK, margin: "6px 0 20px", letterSpacing: -0.4 }}>{title}</h1>
      {sticky && <div ref={sentinelRef} style={{ height: 1, marginTop: -1 }} />}
    </>
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

// Snel vullen: pakketten met een logische basis per stijl. Na toevoegen
// vink je uit wat je niet hebt (met "Ongedaan maken" voor het hele pakket).
const VOORRAAD_PAKKETTEN = [
  { key: "basis", label: "Basisbar", ids: ["gin", "vodka", "white_rum", "bourbon", "triple_sec", "lemon_juice", "lime_juice", "sugar_syrup"] },
  { key: "tiki", label: "Tiki", ids: ["white_rum", "dark_rum", "lime_juice", "pineapple_juice", "orange_juice", "orgeat", "grenadine", "coconut_cream", "angostura"] },
  { key: "italiaans", label: "Italiaans aperitief", ids: ["gin", "campari", "aperol", "sweet_vermouth", "prosecco", "soda_water"] },
  { key: "klassiek", label: "Klassiekers", ids: ["bourbon", "rye", "gin", "cognac", "sweet_vermouth", "dry_vermouth", "angostura", "orange_bitters", "triple_sec", "lemon_juice", "sugar_syrup"] },
];
const FILL_LEVELS = [
  { key: "vol", label: "Vol", fill: 1 },
  { key: "half", label: "Half", fill: 0.5 },
  { key: "bijna", label: "Bijna op", fill: 0.15 },
  { key: "op", label: "Op", fill: 0 },
];
const CHIP_LABELS = { "Likeuren & versterkte wijnen": "Likeuren", "Zuivel & room": "Zuivel", [CUSTOM_CAT]: "Eigen" };

function FillBottleIcon({ fill, color }) {
  const h = 18 * fill;
  return (
    <svg width="16" height="26" viewBox="0 0 16 26" aria-hidden>
      <path d="M6 1h4v4c0 1 4 2 4 6v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V11c0-4 4-5 4-6z" fill="none" stroke={color} strokeWidth="1.6" />
      {fill > 0 && <rect x="3" y={24 - h} width="10" height={h} rx="1" fill={color} opacity="0.85" />}
    </svg>
  );
}

function FlesSheet({ ing, owned, usedIn, makeableWith, level, aantal, onSetLevel, onAdjustAantal, onToggle, onAddToList, onList, onOpenRecipe, allIngredients, isCustom, onRemoveCustom, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [confirmOp, setConfirmOp] = useState(false);
  const [listAdded, setListAdded] = useState(false);
  const low = level === "bijna" || level === "op";
  const catLabel = ing.cat === CUSTOM_CAT ? "Eigen ingrediënt" : ing.cat;
  const setLevel = (key) => { onSetLevel(key); if (key === "op") setConfirmOp(true); };

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in sheet-max-92" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "88vh",
        background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 20px 14px", touchAction: "none" }}>
          <div style={{ width: 60, height: 60, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}><ItemArt ing={ing} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{ing.name}</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{catLabel} · gebruikt in {usedIn} cocktail{usedIn === 1 ? "" : "s"}</div>
          </div>
          <button onClick={close} aria-label="Sluiten" onTouchStart={e => e.stopPropagation()} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px", WebkitOverflowScrolling: "touch" }}>
          {owned ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Hoe vol is de fles?</div>
              <div role="radiogroup" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 14 }}>
                {FILL_LEVELS.map(l => {
                  const on = (level || "vol") === l.key;
                  const color = on ? (l.key === "bijna" || l.key === "op" ? BURGUNDY : BOTTLE) : MUTED;
                  return (
                    <button key={l.key} role="radio" aria-checked={on} onClick={() => setLevel(l.key)} style={{
                      flex: 1, minHeight: 62, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                      border: "none", borderRadius: 11, cursor: "pointer", fontFamily: sans, fontSize: 12.5, fontWeight: 700,
                      background: on ? CREAM : "transparent", color, boxShadow: on ? "0 1px 4px rgba(43,38,32,0.14)" : "none",
                    }}>
                      <FillBottleIcon fill={l.fill} color={color} />{l.label}
                    </button>
                  );
                })}
              </div>

              {low && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, padding: "12px 14px", borderRadius: 14, background: "rgba(122,46,42,0.10)" }}>
                  <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, color: INK }}>
                    <strong style={{ color: BURGUNDY }}>{level === "op" ? "Op." : "Bijna op."}</strong> Zet hem op je boodschappenlijst, dan vergeet je hem niet.
                  </div>
                  {listAdded || onList ? (
                    <span className={listAdded ? "success-pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 4, color: SAGE, fontSize: 13, fontWeight: 700, flexShrink: 0 }}><Check size={14} strokeWidth={3} /> Op lijst</span>
                  ) : (
                    <button onClick={() => { onAddToList(); setListAdded(true); }} style={{ minHeight: 40, padding: "0 16px", borderRadius: 100, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Op lijst</button>
                  )}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, padding: "10px 12px 10px 16px", borderRadius: 14, background: PAPER_DEEP }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Aantal flessen</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>Alleen als je er meer hebt</div>
                </div>
                <button aria-label="Eén fles minder" onClick={() => onAdjustAantal(-1)} disabled={aantal <= 1} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(184,134,46,0.2)", color: INK, fontSize: 20, cursor: aantal <= 1 ? "default" : "pointer", opacity: aantal <= 1 ? 0.45 : 1 }}>−</button>
                <span style={{ minWidth: 26, textAlign: "center", fontSize: 18, fontWeight: 700 }}>{formatDutchNumber(aantal)}</span>
                <button aria-label="Eén fles meer" onClick={() => onAdjustAantal(1)} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(184,134,46,0.2)", color: INK, fontSize: 20, cursor: "pointer" }}>+</button>
              </div>
            </>
          ) : (
            <button onClick={onToggle} className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              <Plus size={17} /> In voorraad zetten
            </button>
          )}

          {makeableWith.length > 0 && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, margin: "20px 0 10px" }}>{owned ? "Hiermee maak je nu" : "Hiermee maak je dan"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {makeableWith.slice(0, 6).map(r => (
                  <button key={r.id} onClick={() => onOpenRecipe(r)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
                    <div style={{ borderRadius: 12, overflow: "hidden", height: 92, display: "flex", alignItems: "center", justifyContent: "center" }}><RecipeCircle recipe={r} allIngredients={allIngredients} size={124} radius={0} /></div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, lineHeight: 1.25 }}>{r.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {(owned || isCustom) && (
          <div style={{ padding: "6px 20px calc(env(safe-area-inset-bottom) + 10px)", borderTop: `1px solid ${BORDER}`, display: "flex", flexDirection: "column" }}>
            {owned && <button onClick={() => { onToggle(); close(); }} style={{ minHeight: 48, background: "none", border: "none", color: BURGUNDY, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Verwijder uit voorraad</button>}
            {isCustom && <button onClick={() => { onRemoveCustom(); close(); }} style={{ minHeight: 44, background: "none", border: "none", color: MUTED, fontFamily: sans, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Eigen ingrediënt helemaal verwijderen</button>}
          </div>
        )}
      </div>

      {confirmOp && (
        <ConfirmDialog title="Fles is op" message={`Wil je ${ing.name} ook uit je voorraad halen?`} cancelLabel="Laat staan" confirmLabel="Uit voorraad"
          onCancel={() => setConfirmOp(false)} onConfirm={() => { setConfirmOp(false); onToggle(); close(); }} />
      )}
    </div>
  ), document.body);
}

function VoorraadTab({ allIngredients, recipes, isOwned, voorraad, voorraadAantal, onAdjustAantal, onToggle, onAddCustom, onRemoveCustom,
  niveaus = {}, onSetNiveau, onAddPack, onUndoPack, onAddToShoppingList, shoppingKeys, onOpenFullRecipe, onSound }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Alles");
  const [openId, setOpenId] = useState(null);
  const [sheetRecipe, setSheetRecipe] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const idOf = (ing) => findIngredientMeta(ing, allIngredients)?.id || ing.id;
  // Per ingrediënt: in welke recepten het (verplicht) voorkomt.
  const usage = useMemo(() => {
    const map = new Map();
    recipes.forEach(r => {
      new Set(r.ingredients.filter(i => !i.optional).map(idOf)).forEach(id => {
        if (!id) return;
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(r);
      });
    });
    return map;
  }, [recipes, allIngredients]);
  const missingByRecipe = useMemo(() => new Map(recipes.map(r => [r.id, r.ingredients.filter(i => !i.optional && !isOwned(i)).map(idOf)])), [recipes, isOwned, allIngredients]);
  const makeableCount = [...missingByRecipe.values()].filter(m => m.length === 0).length;
  // Hoeveel recepten compleet worden als dit ingrediënt erbij komt.
  const gains = useMemo(() => {
    const map = new Map();
    missingByRecipe.forEach(m => { if (m.length === 1) map.set(m[0], (map.get(m[0]) || 0) + 1); });
    return map;
  }, [missingByRecipe]);

  const cats = [...CATEGORY_ORDER, ...(allIngredients.some(i => i.cat === CUSTOM_CAT) ? [CUSTOM_CAT] : [])];
  const q = query.trim().toLowerCase();
  const visible = allIngredients.filter(i => (cat === "Alles" || i.cat === cat) && (!q || i.name.toLowerCase().includes(q)));
  const owned = visible.filter(i => voorraad.has(i.id)).sort((a, b) => (usage.get(b.id)?.length || 0) - (usage.get(a.id)?.length || 0));
  const notOwned = visible.filter(i => !voorraad.has(i.id))
    .sort((a, b) => ((gains.get(b.id) || 0) - (gains.get(a.id) || 0)) || ((usage.get(b.id)?.length || 0) - (usage.get(a.id)?.length || 0)));
  const exactMatch = q && allIngredients.some(i => i.name.toLowerCase() === q);
  const bottleCount = allIngredients.filter(i => voorraad.has(i.id)).length;

  const showToast = (t) => { clearTimeout(toastTimer.current); setToast(t); toastTimer.current = setTimeout(() => setToast(null), 5000); };
  const toggle = (id) => {
    if (!voorraad.has(id)) { onSound("tick"); onSetNiveau(id, null); } else onSound("remove");
    onToggle(id);
  };
  const addPack = (pack) => {
    const added = pack.ids.filter(id => !voorraad.has(id) && allIngredients.some(i => i.id === id));
    if (added.length === 0) { showToast({ text: `${pack.label}: alles stond al in je voorraad` }); return; }
    onSound("chime");
    onAddPack(added);
    showToast({ text: `${pack.label}: ${added.length} toegevoegd`, undo: added });
  };
  const addCustom = () => {
    const name = query.trim();
    if (!name) return;
    onAddCustom(name, cat !== "Alles" ? cat : CUSTOM_CAT);
    onSound("pop");
    setQuery("");
  };

  const openIng = openId ? allIngredients.find(i => i.id === openId) : null;
  const makeableWith = openIng ? (usage.get(openIng.id) || []).filter(r => {
    const m = missingByRecipe.get(r.id) || [];
    return m.length === 0 || (m.length === 1 && m[0] === openIng.id);
  }) : [];

  const renderRow = (ing, i, isIn) => {
    const used = usage.get(ing.id)?.length || 0;
    const gain = gains.get(ing.id) || 0;
    const level = niveaus[ing.id];
    const low = isIn && (level === "bijna" || level === "op");
    return (
      <div key={ing.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 6px 0 12px" }}>
        <button onClick={() => setOpenId(ing.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK, alignSelf: "stretch" }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, overflow: "hidden", flexShrink: 0 }}><ItemArt ing={ing} /></div>
          <div style={{ flex: 1, minWidth: 0, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, alignSelf: "stretch", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ing.name}</div>
            {isIn ? (
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>
                {low && <span style={{ color: BURGUNDY, fontWeight: 600 }}>{level === "op" ? "Op" : "Bijna op"} · </span>}
                {!low && level === "half" && "Half vol · "}
                {(() => { const t = used > 0 ? `gebruikt in ${used} cocktail${used === 1 ? "" : "s"}` : "nog in geen cocktail"; return low || level === "half" ? t : t[0].toUpperCase() + t.slice(1); })()}
              </div>
            ) : gain > 0 ? (
              <span style={{ alignSelf: "flex-start", marginTop: 3, fontSize: 11.5, fontWeight: 700, color: "#8A6420", background: "rgba(184,134,46,0.18)", borderRadius: 100, padding: "2px 8px" }}>+{gain} cocktail{gain === 1 ? "" : "s"}</span>
            ) : (
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>{used > 0 ? `Gebruikt in ${used} cocktail${used === 1 ? "" : "s"}` : "Nog in geen cocktail"}</div>
            )}
          </div>
        </button>
        <button onClick={() => toggle(ing.id)} aria-pressed={isIn} aria-label={isIn ? `${ing.name} uit voorraad halen` : `${ing.name} in voorraad zetten`}
          style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <span className={isIn ? "success-pop" : undefined} style={{ width: 28, height: 28, borderRadius: "50%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", background: isIn ? SAGE : "transparent", border: isIn ? "none" : `1.5px solid ${BORDER}` }}>
            {isIn && <Check size={16} strokeWidth={3} color={CREAM} />}
          </span>
        </button>
      </div>
    );
  };
  const groupHead = (text, right) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 4px 8px" }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: MUTED }}>{text}</span>
      {right}
    </div>
  );
  const listCard = (children) => <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", boxShadow: SHADOW_CARD }}>{children}</div>;

  return (
    <div style={{ fontFamily: sans }}>
      <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.1 }}>Voorraad</h1>
      <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>
        <strong style={{ color: INK }}>{bottleCount} {bottleCount === 1 ? "fles" : "flessen"}</strong> · hiermee maak je <strong style={{ color: INK }}>{makeableCount} cocktail{makeableCount === 1 ? "" : "s"}</strong>
      </div>

      <div data-kb-scope style={{ position: "sticky", top: "calc(env(safe-area-inset-top) + 45px)", zIndex: 8, margin: "12px -20px 0", padding: "8px 20px", background: PAPER }}>
        <form onSubmit={e => { e.preventDefault(); if (q && !exactMatch && visible.length === 0) addCustom(); }} style={{ display: "flex", alignItems: "center", gap: 8, background: PAPER_DEEP, borderRadius: 12, padding: "0 10px 0 12px" }}>
          <Search size={17} color={MUTED} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek of voeg toe…" aria-label="Zoek of voeg toe" enterKeyHint="search" autoCorrect="off"
            style={{ flex: 1, minHeight: 44, border: "none", outline: "none", background: "transparent", fontFamily: sans, fontSize: 16, color: INK }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Wis zoekopdracht" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.08)", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>}
        </form>
      </div>

      <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "6px -20px 0", padding: "4px 20px 6px", WebkitOverflowScrolling: "touch" }}>
        {["Alles", ...cats].map(c => {
          const items = c === "Alles" ? allIngredients : allIngredients.filter(i => i.cat === c);
          const inHuis = items.filter(i => voorraad.has(i.id)).length;
          const on = cat === c;
          return (
            <button key={c} onClick={() => setCat(c)} aria-pressed={on} style={{
              flexShrink: 0, minHeight: 40, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700,
              background: on ? BOTTLE : CREAM, color: on ? "#FBF6EA" : INK, border: `1px solid ${on ? BOTTLE : BORDER}`, whiteSpace: "nowrap",
            }}>
              {CHIP_LABELS[c] || c} <span style={{ fontWeight: 600, opacity: 0.75, fontSize: 12.5 }}>{inHuis}/{items.length}</span>
            </button>
          );
        })}
      </div>

      {q && !exactMatch && (
        <button onClick={addCustom} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, marginTop: 12, padding: "0 14px", borderRadius: 14, border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: BOTTLE, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
          <Plus size={18} /> ‘{query.trim()}’ toevoegen
        </button>
      )}

      {owned.length > 0 && (<>{groupHead(`In huis · ${owned.length}`)}{listCard(owned.map((ing, i) => renderRow(ing, i, true)))}</>)}
      {notOwned.length > 0 && (<>
        {groupHead("Nog niet in huis", <span style={{ fontSize: 12, fontWeight: 700, color: BRASS }}>Meeste nieuwe cocktails ↓</span>)}
        {listCard(notOwned.map((ing, i) => renderRow(ing, i, false)))}
      </>)}
      {visible.length === 0 && !q && <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "30px 0" }}>Nog niets in deze categorie.</p>}

      {!q && (
        <div style={{ marginTop: 22, padding: "16px", borderRadius: 16, background: "#1F3A33", color: "#F3ECDD", boxShadow: SHADOW_CARD }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Snel vullen</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 3, color: "rgba(243,236,221,0.82)" }}>Voeg een pakket toe en vink daarna uit wat je niet hebt.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {VOORRAAD_PAKKETTEN.map(p => (
              <button key={p.key} onClick={() => addPack(p)} style={{ minHeight: 40, padding: "0 14px", borderRadius: 100, border: "none", background: "rgba(243,236,221,0.14)", color: "#F3ECDD", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>+ {p.label}</button>
            ))}
          </div>
        </div>
      )}

      {toast && createPortal((
        <div role="status" className="success-pop" style={{
          position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom) + 92px)", zIndex: 40, maxWidth: 520, margin: "0 auto",
          display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 16px", minHeight: 44, borderRadius: 14, background: "#1F2A26", color: "#F3ECDD",
          boxShadow: "0 10px 26px rgba(0,0,0,0.3)", fontFamily: sans,
        }}>
          <Check size={16} color="#9CC28E" strokeWidth={3} />
          <span style={{ flex: 1, fontSize: 14 }}>{toast.text}</span>
          {toast.undo && <button onClick={() => { onUndoPack(toast.undo); onSound("pop"); setToast(null); }} style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "none", background: "rgba(243,236,221,0.12)", color: "#F1D9A6", fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Ongedaan maken</button>}
        </div>
      ), document.body)}

      {openIng && (
        <FlesSheet ing={openIng} owned={voorraad.has(openIng.id)} usedIn={usage.get(openIng.id)?.length || 0} makeableWith={makeableWith}
          level={niveaus[openIng.id]} aantal={voorraadAantal[openIng.id] ?? 1} allIngredients={allIngredients}
          onSetLevel={(l) => { onSound("tick"); onSetNiveau(openIng.id, l); }} onAdjustAantal={(d) => onAdjustAantal(openIng.id, d)}
          onToggle={() => toggle(openIng.id)} isCustom={openIng.cat === CUSTOM_CAT} onRemoveCustom={() => onRemoveCustom(openIng.id)}
          onList={shoppingKeys?.has(ingredientKey({ id: openIng.id }))}
          onAddToList={() => { onSound("tick"); onAddToShoppingList([{ ref: { id: openIng.id }, recipeNames: [] }]); }}
          onOpenRecipe={(r) => { setOpenId(null); setTimeout(() => setSheetRecipe(r), 200); }}
          onClose={() => setOpenId(null)} />
      )}
      {sheetRecipe && (
        <RecipeSheet recipe={sheetRecipe} missing={sheetRecipe.ingredients.filter(i => !i.optional && !isOwned(i))} ingredientLabel={(ref) => findIngredientMeta(ref, allIngredients)?.name || ref.name || ref.id}
          allIngredients={allIngredients} onAddMissing={(_, entries) => onAddToShoppingList(entries)} shoppingKeys={shoppingKeys} onSound={onSound}
          onOpenFullRecipe={onOpenFullRecipe} onClose={() => setSheetRecipe(null)} />
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

// Het veeggebied moet tot de échte schermrand lopen: alle schermen staan in
// een container met 20px zijpadding, en een duimveeg begint juist in die
// eerste 20px. Zonder deze "bleed" vielen die aanrakingen buiten het element
// met de touch-handlers, en deed terugvegen op een iPhone dus helemaal niets
// (alleen een veeg die toevallig pas na 20px begon werkte).
const EDGE_SWIPE_BLEED = { marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20 };

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
// Laat een scherm dieper in een SecondaryTabScreen (bv. een geopend feest)
// de ene navigatiebalk bovenaan overnemen — label, titel, terugactie en een
// knop rechts — i.p.v. een tweede balk eronder te tekenen.
const NavOverrideContext = createContext(null);

function SecondaryTabScreen({ label: baseLabel, title: baseTitle, onBack: baseOnBack, children }) {
  const [navOverride, setNavOverride] = useState(null);
  const label = navOverride?.label ?? baseLabel;
  const title = navOverride?.title ?? baseTitle;
  const onBack = navOverride?.onBack ?? baseOnBack;
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
            <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 20, color: INK }}>{label}</span>
          </div>
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 52, borderRadius: RADIUS, background: CREAM, border: `1px solid ${BORDER}` }} />
            ))}
          </div>
          <div ref={scrimRef} aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(15,12,9,0.16)", opacity: 1 }} />
        </div>
      )}
      <div ref={contentRef} {...handlers} style={{ ...EDGE_SWIPE_BLEED, touchAction: "pan-y", position: "relative", background: PAPER }}>
        {/* Vaste navigatiebalk: terugknop links (vorige-schermnaam, net als
            echte iOS), gecentreerde titel van dít scherm — sticky zodat hij
            blijft staan terwijl de inhoud eronder scrollt, i.p.v. mee weg te
            scrollen zoals voorheen. marginLeft/Right+paddingLeft/Right span
            de balk edge-to-edge ondanks de 20px zijpadding van de pagina. */}
        <div className="glass-light secondary-navbar" style={{
          position: "sticky", top: STICKY_TOP, zIndex: 20,
          marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
          display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
          minHeight: 44, marginBottom: 16, border: "none", borderBottom: `1px solid ${BORDER}`, boxShadow: "none",
        }}>
          {/* Een tik hier is geen voltooide swipe: commitBack() verwacht de
              peek-preview-laag die alleen tijdens een echte sleep gerenderd
              wordt, dus die reuseden gaf een korte "lege" flits. Een tik
              schakelt daarom rechtstreeks (net zo instant als de dock-tabs).
              stopPropagation op touchstart voorkomt ook dat een tik hier de
              rand-swipe-gestiek zelf arm't — de knop staat namelijk al
              binnen de 90px edge-zone. */}
          <button onClick={onBack} onTouchStart={(e) => e.stopPropagation()} style={{
            justifySelf: "start", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
            cursor: "pointer", padding: "10px 8px 10px 0", margin: 0, color: BRASS, fontFamily: sans, fontSize: 13.5, fontWeight: 700,
          }}>
            <ChevronLeft size={18} strokeWidth={2.4} /> {label}
          </button>
          {title && (
            <div style={{
              justifySelf: "center", fontFamily: systemFont, fontWeight: 600, fontSize: 17, color: INK, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis", maxWidth: "46vw",
            }}>
              {title}
            </div>
          )}
          {navOverride?.right ? <div style={{ justifySelf: "end" }}>{navOverride.right}</div> : <div aria-hidden />}
        </div>
        <NavOverrideContext.Provider value={setNavOverride}>
          {children}
        </NavOverrideContext.Provider>
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
    <div ref={contentRef} {...handlers} style={{ ...EDGE_SWIPE_BLEED, touchAction: "pan-y" }}>
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
// Hoogte van een suggestielijst zodat die precies in de ruimte tussen het
// zoekveld en het toetsenbord past (i.p.v. een vaste 240px die achter het
// toetsenbord of de onderbalk verdween). Rekent opnieuw als het toetsenbord
// verschijnt of de pagina meeschuift.
function useDropdownMaxHeight(wrapRef, open, fallback = 260) {
  const [maxH, setMaxH] = useState(fallback);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const calc = () => {
      const el = wrapRef.current;
      if (!el) return;
      const bottom = el.getBoundingClientRect().top + (el.firstElementChild?.offsetHeight || 40);
      const viewH = vv ? vv.height + vv.offsetTop : window.innerHeight;
      setMaxH(Math.max(150, Math.min(360, Math.floor(viewH - bottom - 14))));
    };
    calc();
    const timers = [150, 400, 700].map(t => setTimeout(calc, t));
    vv?.addEventListener("resize", calc);
    vv?.addEventListener("scroll", calc);
    window.addEventListener("scroll", calc, { passive: true });
    return () => {
      timers.forEach(clearTimeout);
      vv?.removeEventListener("resize", calc);
      vv?.removeEventListener("scroll", calc);
      window.removeEventListener("scroll", calc);
    };
  }, [open, wrapRef]);
  return maxH;
}

function RecipePicker({ recipes, value, onChange, listId, style }) {
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const dropdownMaxH = useDropdownMaxHeight(wrapRef, open, 240);
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

  // Na het kiezen sluit het toetsenbord meteen (anders bleef het over het
  // scherm staan terwijl je al klaar was met zoeken).
  const select = (r) => { onChange(r.id); setDraft(null); setOpen(false); document.activeElement?.blur?.(); };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && filtered.length > 0) { select(filtered[0]); e.target.blur(); }
    if (e.key === "Escape") { setOpen(false); e.target.blur(); }
  };

  return (
    <div ref={wrapRef} data-kb-scope style={{ position: "relative", ...style }}>
      <input
        value={text}
        onChange={e => { setDraft(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Zoek een cocktail…"
        style={{ padding: "0 14px", minHeight: 44, borderRadius: 12, border: `1px solid ${BORDER}`, fontSize: 15, fontFamily: sans, background: CREAM, color: INK, width: "100%", boxSizing: "border-box" }} />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: CREAM,
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, maxHeight: dropdownMaxH, overflowY: "auto", overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch", zIndex: 30, boxShadow: SHADOW_CARD,
        }}>
          {filtered.map(r => (
            <div key={r.id} onMouseDown={e => e.preventDefault()} onClick={() => select(r)} className="list-row-tap"
              style={{ padding: "11px 14px", fontSize: 14.5, fontFamily: sans, color: INK, cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}>
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
function IngredientAutocomplete({ value, onChange, options, style, placeholder = "Ingrediënt", variant }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const dropdownMaxH = useDropdownMaxHeight(wrapRef, open, 200);

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
    <div ref={wrapRef} data-kb-scope style={{ position: "relative", ...style }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder={placeholder} enterKeyHint="search" autoCapitalize="words" autoCorrect="off"
        style={variant === "bare"
          ? { width: "100%", minHeight: 44, border: "none", background: "transparent", outline: "none", fontFamily: sans, fontSize: 15, color: INK, padding: 0, boxSizing: "border-box" }
          : { ...fieldStyle(), padding: "8px 9px", fontSize: 13.5, width: "100%" }} />
      {open && value.trim() && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: CREAM,
          border: `1px solid ${BORDER}`, borderRadius: RADIUS, maxHeight: dropdownMaxH, overflowY: "auto", overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch", zIndex: 30, boxShadow: SHADOW_CARD,
        }}>
          {filtered.map(n => (
            <div key={n} onMouseDown={e => e.preventDefault()} onClick={() => { onChange(n); setOpen(false); document.activeElement?.blur?.(); }} className="list-row-tap"
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
      aspectRatio: "1 / 1", background: tint ? BOTTLE_DARK : undefined,
    }}>
      <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter }} />
    </div>
  );
}

function RecipeCircle({ recipe, allIngredients, size = 50, radius = "50%" }) {
  const tint = recipeTint(recipe, allIngredients);
  const garnishes = inferGarnishes(recipe, allIngredients);
  return (
    <ItemImage id={recipe.id} type="cocktail" photoUrl={recipe.image} size={size} radius={radius} tint={tint} filter={RECIPE_PHOTO_FILTER} fallback={
      <div style={{
        width: size, height: size, borderRadius: radius, overflow: "hidden", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: BOTTLE_DARK,
      }}>
        <GlassArt glass={recipe.glass} colors={tint} garnishes={garnishes} rim={inferRim(recipe, allIngredients)} foam={inferFoam(recipe, allIngredients)} iceStyle={inferIceStyle(recipe)} size={size * 0.62} />
      </div>
    } />
  );
}

// Snelle feiten voor de recept-pop-up (zoals de infobalk in de App Store).
// Alleen wat betrouwbaar af te leiden is; anders valt de kolom weg.
const TECHNIQUE_LABELS = { shaken: "Geschud", stirred: "Geroerd", build: "Gebouwd", blend: "Geblend", swizzle: "Swizzle" };
function recipeQuickFacts(recipe) {
  const facts = [];
  const glass = (recipe.glass || "").split("(")[0].trim();
  if (glass) facts.push({ icon: GlassWater, value: glass, label: "Glas" });
  const tech = inferTechniques(recipe.method).find(t => TECHNIQUE_LABELS[t]);
  if (tech) facts.push({ icon: Hand, value: TECHNIQUE_LABELS[tech], label: "Techniek" });
  facts.push({ icon: ListOrdered, value: String(recipe.ingredients.length), label: "Ingrediënten" });
  const role = getMenuRole(recipe);
  const strength = role === "sterk" ? "Sterk"
    : role === "alcoholvrij" ? "Alcoholvrij"
    : recipe.family === "Highballs" ? "Licht"
    : ["Sours", "Fizz / Flip"].includes(recipe.family) ? "Middel" : null;
  if (strength) facts.push({ icon: Droplet, value: strength, label: "Sterkte" });
  return facts;
}

// Recept-pop-up (o.a. vanuit Wat kan ik maken, Feestplanner-suggesties):
// iOS-achtige opbouw — kop met foto + status, feitenrij, ingrediënten en
// bereiding als nette lijstkaarten, vaste knoppenbalk onderaan.
// Wordt via een portal buiten de app-root gerenderd, dus het lettertype
// staat hier expliciet (anders erft hij de browser-standaard serif).
const batchOpener = { current: null };

function RecipeSheet({ recipe, missing, ingredientLabel, allIngredients, onAddMissing, justAdded, onClose,
  onOpenFullRecipe, onAddToFeest, feestChosen, onSound, favoriteRecipeIds, onToggleFavorite, onOpenCheckin, shoppingKeys }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [justAddedFeest, setJustAddedFeest] = useState(false);
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const inFeest = feestChosen?.includes(recipe.id);
  const isFav = favoriteRecipeIds?.includes(recipe.id);
  const handleAddFeest = () => {
    if (inFeest || justAddedFeest) return;
    onAddToFeest(recipe.id);
    onSound?.("chime");
    setJustAddedFeest(true);
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const missingSet = new Set(missing);
  const facts = recipeQuickFacts(recipe);
  const onList = (ing) => addedKeys.has(ingredientKey(ing)) || !!shoppingKeys?.has(ingredientKey(ing)) || (justAdded && missingSet.has(ing));
  const addOne = (ing) => {
    if (onList(ing)) return;
    onAddMissing(recipe.id, [{ ref: ing, recipeNames: [recipe.name] }]);
    setAddedKeys(prev => new Set(prev).add(ingredientKey(ing)));
  };

  const hairline = `1px solid ${BORDER}`;
  const card = { background: PAPER_DEEP, borderRadius: 14, overflow: "hidden" };
  const smallRound = { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK, flexShrink: 0 };
  const bigRound = (color, active) => ({
    width: 52, height: 52, borderRadius: "50%", flexShrink: 0, border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", background: active ? SAGE : PAPER_DEEP, color: active ? CREAM : color,
  });
  const statusPill = missing.length === 0
    ? { bg: "rgba(92,122,86,0.16)", color: SAGE, text: <><Check size={12} strokeWidth={3} /> Alles in huis</> }
    : { bg: "rgba(122,46,42,0.12)", color: BURGUNDY, text: missing.length === 1 ? `Mist 1 · ${ingredientLabel(missing[0])}` : `Mist ${missing.length}` };

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "88vh",
        background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: sans,
      }}>
        <SheetGrabber {...dragHandlers} />

        {/* Kop: foto, naam, familie · glas, statuslabel; rechtsboven favoriet + sluiten */}
        <div {...dragHandlers} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "6px 20px 16px", flexShrink: 0, touchAction: "none" }}>
          <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: "0 6px 16px rgba(43,38,32,0.18)", flexShrink: 0 }}>
            <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={76} radius={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: INK }}>{recipe.name}</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{[recipe.family, recipe.glass].filter(Boolean).join(" · ")}</div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "4px 10px", borderRadius: 100,
              background: statusPill.bg, color: statusPill.color, fontSize: 12, fontWeight: 700, maxWidth: "100%",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{statusPill.text}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onTouchStart={e => e.stopPropagation()}>
            {onToggleFavorite && (
              <button onClick={() => { onSound?.("pop"); onToggleFavorite(recipe.id); }} className="tap-target-44"
                aria-label={isFav ? "Verwijder uit favorieten" : "Bewaar als favoriet"} aria-pressed={!!isFav} style={{ ...smallRound, color: isFav ? BURGUNDY : INK }}>
                <Heart size={15} fill={isFav ? "currentColor" : "none"} />
              </button>
            )}
            <button onClick={close} aria-label="Sluiten" className="tap-target-44" style={smallRound}><X size={15} /></button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 20px 18px" }}>
          {/* Snelle feiten */}
          <div style={{ display: "flex", borderTop: hairline, borderBottom: hairline, padding: "12px 0", marginBottom: 18 }}>
            {facts.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={f.label} style={{ flex: 1, minWidth: 0, textAlign: "center", borderLeft: i === 0 ? "none" : hairline, padding: "0 4px" }}>
                  <Icon size={17} color={BOTTLE} strokeWidth={1.7} style={{ display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.value}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{f.label}</div>
                </div>
              );
            })}
          </div>

          {/* Ingrediënten */}
          <div style={{ ...card, marginBottom: 14 }}>
            {recipe.ingredients.map((ing, i) => {
              const lacks = missingSet.has(ing);
              const added = lacks && onList(ing);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 14px", minHeight: 50 }}>
                  <span aria-hidden style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: lacks ? "transparent" : SAGE, border: lacks ? `1.5px solid ${BURGUNDY}` : "none",
                  }}>{!lacks && <Check size={13} strokeWidth={3} color={CREAM} />}</span>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, alignSelf: "stretch", borderTop: i === 0 ? "none" : hairline }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: lacks ? BURGUNDY : INK, fontWeight: lacks ? 600 : 400 }}>
                      {ingredientLabel(ing)}{ing.optional ? <span style={{ color: MUTED, fontWeight: 400 }}> (optioneel)</span> : null}
                    </span>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: lacks ? BURGUNDY : INK, whiteSpace: "nowrap" }}>{ing.top ? "top op" : `${formatDutchNumber(ing.amount)} ${unitLabel(ing.unit, ing.amount)}`}</span>
                    {lacks && (
                      <button onClick={() => addOne(ing)} className="tap-target-44" aria-label={added ? `${ingredientLabel(ing)} staat op je boodschappenlijst` : `${ingredientLabel(ing)} op boodschappenlijst`} style={{
                        width: 30, height: 30, borderRadius: "50%", border: "none", flexShrink: 0, cursor: added ? "default" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", background: added ? SAGE : BOTTLE, color: CREAM,
                      }}>{added ? <Check size={15} strokeWidth={3} /> : <Plus size={16} strokeWidth={2.4} />}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bereiding + afwerking */}
          <div style={card}>
            {[
              { icon: CupSoda, color: BOTTLE, title: "Bereiding", text: recipe.method },
              recipe.garnish ? { icon: Citrus, color: BRASS, title: "Afwerking", text: recipe.garnish } : null,
            ].filter(Boolean).map((row, i) => {
              const Icon = row.icon;
              return (
                <div key={row.title} style={{ display: "flex", gap: 12, padding: "0 14px" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 12 }}>
                    <Icon size={15} color={row.color} strokeWidth={1.8} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, padding: "12px 0", borderTop: i === 0 ? "none" : hairline }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: MUTED }}>{row.title}</div>
                    <div style={{ fontSize: 14.5, lineHeight: 1.5, color: INK, marginTop: 3 }}>{row.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {batchOpener.current && (
            <button onClick={() => { const open = batchOpener.current; close(); setTimeout(() => open(recipe.id), 180); }} className="press-scale" style={{
              ...card, display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "0 14px", border: "none",
              cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
            }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Scale size={15} color={BRASS} strokeWidth={1.8} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>Maak een batch</span>
                <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>Voor een groep, in een kan of vooraf in een fles</span>
              </span>
              <ChevronRight size={18} color={MUTED} />
            </button>
          )}
        </div>

        {/* Knoppenbalk */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px calc(env(safe-area-inset-bottom) + 14px)", borderTop: hairline, background: PAPER, flexShrink: 0 }}>
          {onOpenFullRecipe && (
            <button onClick={() => { close(); setTimeout(() => onOpenFullRecipe(recipe.id), 180); }} className="press-scale" style={{
              flex: 1, height: 52, borderRadius: 14, border: "none", cursor: "pointer", background: BOTTLE, color: CREAM,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: sans, fontSize: 15.5, fontWeight: 700,
            }}>
              <BookOpen size={17} /> Volledig recept
            </button>
          )}
          {onAddToFeest && (
            <button onClick={handleAddFeest} className={justAddedFeest ? "success-pop press-scale" : "press-scale"}
              aria-label={inFeest || justAddedFeest ? "Staat in de feestplanner" : "Voeg toe aan feestplanner"} aria-pressed={!!(inFeest || justAddedFeest)}
              style={bigRound(BRASS, inFeest || justAddedFeest)}>
              {inFeest || justAddedFeest ? <Check size={20} strokeWidth={2.6} /> : <PartyPopper size={20} />}
            </button>
          )}
          {onOpenCheckin && (
            <button onClick={() => { close(); setTimeout(() => onOpenCheckin(recipe.name), 180); }} className="press-scale"
              aria-label={`${recipe.name} inchecken`} style={bigRound(SAGE, false)}>
              <Check size={21} strokeWidth={2.6} />
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

function MatchPill({ pct, label }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
      <span className="glass-chip-dark" style={{ borderRadius: 100, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>{pct}%{label ? ` ${label}` : ""}</span>
    </div>
  );
}

function OntdekkenTab({ makenProps, verhaalProps, openRecipeId, onOpenRecipeHandled, recommended, favoriteFamily, allIngredients, onOpenRecipe, onSound, active,
  recipeBackLabel = "Ontdekken", onRecipeBack = null, rootTapTick = 0 }) {
  const [mode, setMode] = useState("alles");
  // Staat er een recept open, dan is dit scherm puur dat recept: geen grote
  // titel, geen Alle/Maken-schakelaar en geen "Aanbevolen voor jou" erboven.
  const [recipeOpen, setRecipeOpen] = useState(false);
  // Een recept van elders (Home, Maken, Check-in) opent altijd in de
  // "Alles"-weergave (daar leeft het receptscherm); kwam je uit "Wat ik kan
  // maken", dan keer je bij terug ook weer daarheen terug.
  const returnModeRef = useRef(null);
  useEffect(() => {
    if (!openRecipeId) return;
    returnModeRef.current = mode === "kan" ? "kan" : null;
    setMode("alles");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecipeId]);
  // "Wat ik kan maken" opent als eigen scherm met terugknop (zoals een recept):
  // bij wisselen van modus weer bovenaan beginnen.
  const openMode = (next) => { setMode(next); window.scrollTo(0, 0); };
  // Nog eens op de actieve Ontdekken-tab tikken = terug naar het overzicht.
  useEffect(() => { if (rootTapTick) setMode("alles"); }, [rootTapTick]);
  // Titel, schakelaar en Aanbevolen horen alleen bij het overzicht, niet bij
  // een geopend recept en niet bij het eigen scherm "Wat ik kan maken".
  const showChrome = !recipeOpen && mode !== "kan";
  const handleRecipeOpenChange = (open) => {
    setRecipeOpen(open);
    if (!open && returnModeRef.current) { setMode(returnModeRef.current); returnModeRef.current = null; }
  };
  // Hoogste match eerst, zodat "meest aanbevolen" ook echt links staat i.p.v.
  // de score-volgorde uit computeCheckinInsights (die weegt ook smaakprofiel
  // mee, waardoor het zichtbare percentage niet altijd aflopend stond).
  const sortedRecommended = recommended ? [...recommended].sort((a, b) => b.matchPct - a.matchPct) : recommended;
  return (
    <div>
      {showChrome && <LargeTitleHeader title="Ontdekken" active={active} sticky={false} />}
      {/* De titel zelf is niet meer sticky (op verzoek) — deze toggle-balk
          blijft wel sticky, maar dan meteen bovenaan (STICKY_TOP i.p.v.
          STICKY_SUBHEADER_TOP) want er zit nu geen sticky titelbalk meer
          boven die anders die ruimte al innam. */}
      {/* .glass-light's eigen tint (rgba(250,246,238,...)) week net genoeg af
          van de paginakleur (PAPER, #F3ECDD) om als een zichtbare andere
          band op te vallen zodra er niets kleurrijks onder scrolt — hier
          overschreven naar PAPER's eigen RGB zodat de balk in rust exact
          samenvalt met de pagina, en alleen tijdens scrollen (over de
          Aanbevolen-kaarten) echt als glas oplicht. */}
      <div className="glass-light" style={{
        display: showChrome ? "flex" : "none",
        position: "sticky", top: STICKY_TOP, zIndex: 7,
        alignItems: "center", gap: 8, height: 44, boxSizing: "border-box", marginBottom: 12, marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
        border: "none", boxShadow: "none", background: "rgba(243,236,221,0.92)",
      }}>
        <button onClick={() => openMode("alles")} style={{
          flex: 1, padding: "8px 12px", borderRadius: RADIUS, border: `1px solid ${mode === "alles" ? BOTTLE : BORDER}`,
          background: mode === "alles" ? BOTTLE : CREAM, color: mode === "alles" ? CREAM : INK,
          fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>Alle recepten</button>
        <button onClick={() => openMode("kan")} style={{
          flex: 1, padding: "8px 12px", borderRadius: RADIUS, border: `1px solid ${mode === "kan" ? BOTTLE : BORDER}`,
          background: mode === "kan" ? BOTTLE : CREAM, color: mode === "kan" ? CREAM : INK,
          fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>Wat ik kan maken</button>
      </div>

      {/* Zelfde aanbevelingslogica als Check-in ("Jouw favoriete stijl"),
          hier vooraan getoond zodat ontdekken ook persoonlijk aanvoelt i.p.v.
          alleen een kale lijst — precies zoals in het UX-voorstel. */}
      {/* Alleen op de "Alle recepten"-overzichtspagina: niet in "Wat ik kan
          maken" (op verzoek, rustiger) en niet boven een geopend recept. */}
      {showChrome && recommended && recommended.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Aanbevolen voor jou</SectionLabel>
          <div style={{ fontSize: 12.5, color: MUTED, margin: "-6px 0 13px" }}>Gebaseerd op je smaakprofiel en je voorraad</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {sortedRecommended.map(({ recipe, matchPct }) => (
              <button key={recipe.id} onClick={() => { onSound?.("pop"); onOpenRecipe?.(recipe.id); }} className="press-scale" style={{ width: 132, flexShrink: 0, textAlign: "center", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, padding: 10, position: "relative", cursor: "pointer", fontFamily: sans }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                  <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={48} />
                </div>
                <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 13, color: INK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{recipe.name}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontWeight: 500 }}>{recipe.family}</div>
                {matchPct > 0 && <MatchPill pct={matchPct} label="match" />}
                {/* 0% match betekent hier geen enkel ingrediënt in huis (niet
                    "geen data") — dan is "0%" een ontmoedigend getal i.p.v.
                    een bruikbaar signaal, dus tonen we de oplossing i.p.v.
                    het cijfer. */}
                {matchPct === 0 && (
                  <div style={{ fontSize: 10, color: BRASS, marginTop: 4, fontWeight: 700 }}>Vul je voorraad in</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: mode === "kan" ? "" : "none" }}>
        <MakenTab {...makenProps} onBack={() => openMode("alles")} />
      </div>
      <div style={{ display: mode === "alles" ? "" : "none" }}>
        <VerhaalTab {...verhaalProps} openRecipeId={openRecipeId} onOpenRecipeHandled={onOpenRecipeHandled}
          backLabel={recipeBackLabel} onBackToOrigin={onRecipeBack} onRecipeOpenChange={handleRecipeOpenChange} rootTapTick={rootTapTick} />
      </div>
    </div>
  );
}

function MakenTab({ recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, onSound, onOpenRecipe, onAddToFeest, feestChosen, onBack, shoppingKeys, onRemoveFromShoppingList, favoriteRecipeIds, onToggleFavorite, onOpenCheckin }) {
  const [view, setView] = useState("ontdekken");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [glassFilter, setGlassFilter] = useState("");
  const [spiritFilter, setSpiritFilter] = useState("");
  const [justAddedId, setJustAddedId] = useState(null);
  const [justAddedFeestId, setJustAddedFeestId] = useState(null);
  const [sheetRecipeId, setSheetRecipeId] = useState(null);
  // Alles wat deze sessie al op de boodschappenlijst is gezet (recepten én
  // koopadviezen): het vinkje blijft dan staan i.p.v. terug te springen.
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [bijnaExpanded, setBijnaExpanded] = useState(false);

  const addMissing = (recipeId, refs) => {
    onAddToShoppingList(refs);
    onSound("tick");
    setJustAddedId(recipeId);
    setAddedIds(prev => new Set(prev).add(recipeId));
  };
  const addFeest = (recipeId) => {
    onAddToFeest(recipeId);
    onSound("chime");
    setJustAddedFeestId(recipeId);
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

  // Koopadvies: welk ontbrekend ingrediënt ontgrendelt de meeste "mist 1"-recepten
  const koopadviesAll = useMemo(() => {
    const unlockMap = new Map();
    recipes.forEach(r => {
      const required = r.ingredients.filter(i => !i.optional);
      const missing = required.filter(i => !isOwned(i));
      if (missing.length === 1) {
        const ing = missing[0];
        const key = ingredientKey(ing);
        if (!unlockMap.has(key)) unlockMap.set(key, { key, ref: ing, label: ingredientLabel(ing), recipeNames: [] });
        unlockMap.get(key).recipeNames.push(r.name);
      }
    });
    return [...unlockMap.values()].filter(v => v.recipeNames.length >= 2).sort((a, b) => b.recipeNames.length - a.recipeNames.length);
  }, [recipes, isOwned, ingredientLabel]);
  const [koopadviesExpanded, setKoopadviesExpanded] = useState(false);
  const koopadvies = koopadviesExpanded ? koopadviesAll : koopadviesAll.slice(0, 3);

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

  // Horizontale rij: een handvol kaarten om door te swipen, de rest via "Alles bekijken".
  const NU_CAP = 12;
  const BIJNA_CAP = 4;
  const bijnaShown = bijnaExpanded ? bijnaAll : bijnaAll.slice(0, BIJNA_CAP);

  const sheetEntry = sheetRecipeId ? scoredById.get(sheetRecipeId) : null;

  const HERO_GREEN = "#1F3D36", HERO_CREAM = "#FBF6EA", HERO_GOLD = "#DDB877";
  const linkBtn = { background: "none", border: "none", padding: "6px 0", cursor: "pointer", color: BRASS, fontFamily: sans, fontSize: 14, fontWeight: 600 };
  // Staat dit ingrediënt al op de boodschappenlijst? Leest de echte lijst
  // (niet alleen wat hier is aangetikt), zodat het vinkje klopt, ook na
  // verwijderen in het winkelmandje. Tikken op een vinkje haalt het eraf.
  const onList = (ref) => shoppingKeys ? shoppingKeys.has(ingredientKey(ref)) : false;
  const toggleOnList = (id, ref, recipeNames) => {
    if (onList(ref)) {
      onRemoveFromShoppingList?.(ingredientKey(ref));
      onSound("remove");
      setAddedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    } else {
      addMissing(id, [{ ref, recipeNames }]);
    }
  };
  const roundBtn = (done) => ({
    width: 40, height: 40, flexShrink: 0, borderRadius: "50%", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${done ? SAGE : BORDER}`, background: done ? SAGE : PAPER, color: done ? CREAM : BOTTLE,
  });
  const openList = () => { setView("alle"); window.scrollTo(0, 0); };
  const backToOverview = () => {
    setView("ontdekken"); setQuery(""); setFamilyFilter(""); setGlassFilter(""); setSpiritFilter(""); setOpenId(null);
    window.scrollTo(0, 0);
  };

  // Eigen scherm met iOS-navigatiebalk (zoals een geopend recept): "‹ Ontdekken"
  // terug naar Ontdekken; in de volledige lijst "‹ Overzicht" terug hierheen.
  return (
    <SecondaryTabScreen
      label={view === "alle" ? "Overzicht" : "Ontdekken"}
      title={view === "alle" ? "Alle recepten" : "Wat kan ik maken"}
      onBack={view === "alle" ? backToOverview : onBack}>

      {view === "ontdekken" && (
        <div style={{
          background: HERO_GREEN, color: HERO_CREAM, borderRadius: 18, padding: "20px 20px 18px", marginBottom: 18,
          boxShadow: SHADOW_HERO, borderBottom: `3px solid ${BRASS}`,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: HERO_GOLD, marginBottom: 12 }}>Jouw bar vandaag</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: serif, fontSize: 46, fontWeight: 700, lineHeight: 1 }}>{makeableAll.length}</div>
              <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 4 }}>nu te maken</div>
            </div>
            <div style={{ width: 1, height: 46, background: "rgba(251,246,234,0.2)" }} />
            <div>
              <div style={{ fontFamily: serif, fontSize: 32, fontWeight: 700, lineHeight: 1, color: HERO_GOLD }}>{bijnaAll.length}</div>
              <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 4 }}>mist 1 ingrediënt</div>
            </div>
          </div>
          <button onClick={verrasMe} disabled={shuffling || makeableAll.length === 0} className="press-scale" style={{
            width: "100%", height: 46, borderRadius: 12, border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
            background: BRASS, color: "#1B1409", fontFamily: sans, fontSize: 15, fontWeight: 700,
            cursor: shuffling || makeableAll.length === 0 ? "default" : "pointer", opacity: makeableAll.length === 0 ? 0.5 : 1,
          }}>
            <Shuffle size={18} className={shuffling ? "spin-icon" : undefined} /> Verras me
          </button>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 22 }}>
        <Search size={15} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={query} onChange={e => { setQuery(e.target.value); if (e.target.value.trim() && view !== "alle") setView("alle"); }} placeholder="Zoek op naam of familie…"
          enterKeyHint="search" autoCapitalize="words"
          style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, boxSizing: "border-box", background: CREAM, fontFamily: sans }} />
      </div>

      {view === "ontdekken" && (
        <div>
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <SectionLabel>Nu te maken</SectionLabel>
              <button onClick={openList} style={linkBtn}>Alles bekijken</button>
            </div>
            {makeableAll.length === 0 ? (
              <div style={{ background: CREAM, border: `1px dashed ${BORDER}`, borderRadius: 14, padding: "16px", fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>
                Nog geen cocktail compleet. Vul je voorraad aan onder <strong style={{ color: INK }}>Bar</strong>, of kijk hieronder wat je bijna kunt maken.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, overflowX: "auto", marginLeft: -20, marginRight: -20, padding: "0 20px 6px", scrollPaddingLeft: 20, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                {makeableAll.slice(0, NU_CAP).map(({ recipe }) => (
                  <button key={recipe.id} onClick={() => setSheetRecipeId(recipe.id)} className="press-scale" style={{
                    width: 140, flexShrink: 0, scrollSnapAlign: "start", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: sans,
                  }}>
                    <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: SHADOW_CARD, marginBottom: 8 }}>
                      <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={140} radius={14} />
                    </div>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15.5, color: INK, lineHeight: 1.25 }}>{recipe.name}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{recipe.family}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {bijnaAll.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <SectionLabel>Nog één fles nodig</SectionLabel>
                {bijnaAll.length > BIJNA_CAP && (
                  <button onClick={() => setBijnaExpanded(v => !v)} style={linkBtn}>{bijnaExpanded ? "Toon minder" : `Alle ${bijnaAll.length}`}</button>
                )}
              </div>
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                {bijnaShown.map(({ recipe, missing }, i) => {
                  const done = onList(missing[0]);
                  return (
                    <div key={recipe.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i === 0 ? "none" : `1px solid ${PAPER_DEEP}` }}>
                      <button onClick={() => setSheetRecipeId(recipe.id)} style={{
                        flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: sans,
                      }}>
                        <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={50} radius={12} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 15.5, fontWeight: 600, color: INK }}>{recipe.name}</div>
                          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Mist: <span style={{ color: BURGUNDY, fontWeight: 600 }}>{ingredientLabel(missing[0])}</span></div>
                        </div>
                      </button>
                      <button aria-label={done ? `${ingredientLabel(missing[0])} van boodschappenlijst halen` : `${ingredientLabel(missing[0])} op boodschappenlijst`} aria-pressed={done} className="tap-target-44"
                        onClick={() => toggleOnList(recipe.id, missing[0], [recipe.name])} style={roundBtn(done)}>
                        {done ? <Check size={17} strokeWidth={3} /> : <Plus size={18} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {koopadviesAll.length > 0 && (
            <div style={{ background: PAPER_DEEP, borderRadius: 16, padding: "16px 16px 8px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Slim inkopen</span>
                {koopadviesAll.length > 3 && (
                  <button onClick={() => setKoopadviesExpanded(v => !v)} style={{ ...linkBtn, fontSize: 13 }}>{koopadviesExpanded ? "Toon minder" : `Alle ${koopadviesAll.length}`}</button>
                )}
              </div>
              {koopadvies.map((item, i) => {
                const done = onList(item.ref);
                return (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Koop {item.label}</div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
                        Dan kun je er {item.recipeNames.length} cocktails bij maken: {item.recipeNames.slice(0, 3).join(", ")}{item.recipeNames.length > 3 ? ", …" : ""}
                      </div>
                    </div>
                    <button aria-label={done ? `${item.label} van boodschappenlijst halen` : `${item.label} op boodschappenlijst`} aria-pressed={done} className="tap-target-44"
                      onClick={() => toggleOnList(`koop:${item.key}`, item.ref, item.recipeNames)}
                      style={{ ...roundBtn(done), background: done ? SAGE : BOTTLE, border: "none", color: "#FBF6EA" }}>
                      {done ? <Check size={17} strokeWidth={3} /> : <ShoppingCart size={17} />}
                    </button>
                  </div>
                );
              })}
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
                            <span style={{ fontWeight: 600 }}>{ing.top ? "top op" : `${formatDutchNumber(ing.amount)} ${unitLabel(ing.unit, ing.amount)}`}</span>
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
          onOpenFullRecipe={onOpenRecipe} onAddToFeest={onAddToFeest} feestChosen={feestChosen}
          favoriteRecipeIds={favoriteRecipeIds} onToggleFavorite={onToggleFavorite} onOpenCheckin={onOpenCheckin} shoppingKeys={shoppingKeys} />
      )}
    </SecondaryTabScreen>
  );
}

// ===== Batch-calculator =====
// Vervangt de Schaler: een cocktail groter maken voor een groep (Glazen), in
// een kan voor vandaag (Kan) of vooraf in een fles (Fles), met praktische
// hoeveelheden, voorraadcheck en batch-tips. Glazen ophogen voor jezelf kan
// al in het recept zelf.
const BATCH_BUBBLES = new Set(["tonic", "cola", "ginger_beer", "ginger_ale", "grapefruit_soda", "soda_water", "prosecco", "lemonade", "beer", "stout"]);
const BATCH_DAIRY = new Set(["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter", "egg_yolk", "advocaat", "coconut_cream"]);
const BATCH_EGG = new Set(["egg_white", "egg_yolk"]);
const BATCH_CITRUS = { lemon_juice: { ml: 35, one: "citroen", many: "citroenen" }, lime_juice: { ml: 25, one: "limoen", many: "limoenen" } };
const BATCH_FRESH = new Set(["lemon_juice", "lime_juice", "orange_juice", "grapefruit_juice", "pineapple_juice", "passion_fruit_puree", "peach_puree", "tomato_juice"]);
const BATCH_QUICK = [2, 4, 6, 8, 12, 20];
const BATCH_KAN = [{ ml: 1000, label: "1 L" }, { ml: 1500, label: "1,5 L" }, { ml: 2000, label: "2 L" }];
const BATCH_FLES = [{ ml: 500, label: "50 cl" }, { ml: 700, label: "70 cl" }, { ml: 1000, label: "1 L" }];

// Kanmaat/Flesmaat in woorden, voor stappen en de deeltekst.
function batchVolumeLabel(ml) {
  return ml >= 1000 ? `${String(ml / 1000).replace(".", ",")} L` : `${ml / 10} cl`;
}
// Hele ml, boven de 100 ml op 5 ml.
function roundBatchMl(ml) {
  return ml >= 100 ? Math.round(ml / 5) * 5 : Math.round(ml);
}
function formatBatchAmount(ml, units) {
  if (units === "cl") return `${formatDutchNumber(ml / 10)} cl`;
  if (units === "oz") return `${formatDutchNumber(ml / 29.57)} oz`;
  return `${roundBatchMl(ml)} ml`;
}

function analyzeBatchRecipe(recipe, allIngredients) {
  const rows = recipe.ingredients.map(ing => ({ ing, meta: findIngredientMeta(ing, allIngredients) }));
  const idOf = (r) => r.meta?.id || r.ing.id;
  const techniques = inferTechniques(recipe.method);
  const hasEgg = rows.some(r => BATCH_EGG.has(idOf(r)) && !r.ing.optional);
  const hasEggOptional = rows.some(r => BATCH_EGG.has(idOf(r)));
  const hasDairy = rows.some(r => BATCH_DAIRY.has(idOf(r)));
  const hasBubbles = rows.some(r => BATCH_BUBBLES.has(idOf(r)));
  const hasFresh = rows.some(r => BATCH_FRESH.has(idOf(r)));
  const hot = recipe.family === "Warme dranken" || rows.some(r => ["hot_water", "hot_coffee", "espresso"].includes(idOf(r)));
  const stirred = (techniques.includes("stirred") || ["Spirit-forward", "Stirred-down"].includes(recipe.family)) && !techniques.includes("shaken");
  const shaken = techniques.includes("shaken");
  // Waarom (niet) in een kan/fles — null = het kan.
  const blockReason = hasEgg || hasDairy
    ? "Deze cocktail kun je beter per glas shaken: ei en room horen niet in een batch."
    : hasBubbles
      ? "Deze cocktail maak je beter per glas: bubbels worden plat in een kan of fles."
      : hot ? "Een warme cocktail maak je beter per glas." : null;
  const kanBlock = blockReason;
  const flesBlock = blockReason || (hasFresh ? "Vers sap blijft maar ± 4 uur goed, dus niet vooraf in een fles. Een kan voor vandaag kan wel." : null);
  return { rows, idOf, techniques, hasEgg, hasEggOptional, hasBubbles, hasFresh, stirred, shaken, kanBlock, flesBlock };
}

function BatchRecipePicker({ recipes, allIngredients, recentRecipeIds, favoriteRecipeIds, currentId, onPick, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const recent = recentRecipeIds.map(id => byId.get(id)).filter(Boolean).slice(0, 6);
  const favs = favoriteRecipeIds.map(id => byId.get(id)).filter(Boolean);
  const q = query.trim().toLowerCase();
  const results = q ? recipes.filter(r => r.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40) : [];
  const pick = (id) => { onPick(id); close(); };
  const row = (r) => (
    <button key={r.id} onClick={() => pick(r.id)} className="press-scale" style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "6px 14px", border: "none",
      background: r.id === currentId ? "rgba(92,122,82,0.14)" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: sans,
    }}>
      <RecipeCircle recipe={r} allIngredients={allIngredients} size={44} radius={10} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: serif, fontSize: 16, fontWeight: 700, color: INK }}>{r.name}</span>
        <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{r.family} · {(r.glass || "").split("(")[0].trim()}</span>
      </span>
      {r.id === currentId && <Check size={17} color={SAGE} strokeWidth={2.6} />}
    </button>
  );
  const section = (title, list) => list.length > 0 && (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, margin: "0 0 6px 4px" }}>{title}</div>
      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>{list.map(row)}</div>
    </div>
  );
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in sheet-max-92" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", height: "88vh",
        background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 20px 10px", touchAction: "none" }}>
          <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700 }}>Kies een cocktail</div>
          <button onClick={close} aria-label="Sluiten" onTouchStart={e => e.stopPropagation()} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "0 20px 10px", position: "relative" }}>
          <Search size={16} color={MUTED} style={{ position: "absolute", left: 34, top: 14 }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek een cocktail" aria-label="Zoek een cocktail"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 44, padding: "0 14px 0 40px", borderRadius: 12, border: `1px solid ${BORDER}`, background: CREAM, color: INK, fontFamily: sans, fontSize: 16 }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px calc(env(safe-area-inset-bottom) + 20px)", WebkitOverflowScrolling: "touch" }}>
          {q ? (
            results.length ? section(`${results.length} resultaten`, results)
              : <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "24px 0" }}>Geen cocktail gevonden voor "{query}".</p>
          ) : (
            <>
              {section("Recent", recent)}
              {section("Favorieten", favs)}
              {recent.length === 0 && favs.length === 0 && section("Alle cocktails", [...recipes].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30))}
            </>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

function BatchCalculatorTab({ recipes, ingredientLabel, allIngredients, isOwned, voorraadAantal = {}, recentRecipeIds = [], favoriteRecipeIds = [],
  shoppingKeys, onAddToShoppingList, onSound, request }) {
  const [recipeId, setRecipeId] = useState(() => request?.id || recentRecipeIds[0] || recipes[0]?.id);
  const [mode, setMode] = useState("glazen");
  const [glasses, setGlasses] = useState(8);
  const [kanMl, setKanMl] = useState(1500);
  const [flesMl, setFlesMl] = useState(700);
  const [units, setUnits] = useState("ml");
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState(false);
  const [shareState, setShareState] = useState(null);

  // "Maak een batch" vanuit een recept: die cocktail meteen gekozen.
  useEffect(() => {
    if (request?.id) { setRecipeId(request.id); setMode("glazen"); window.scrollTo({ top: 0 }); }
  }, [request?.nonce]);
  useEffect(() => { setAdded(false); }, [recipeId, mode, glasses, kanMl, flesMl]);

  const recipe = recipes.find(r => r.id === recipeId) || recipes[0];
  const info = useMemo(() => recipe ? analyzeBatchRecipe(recipe, allIngredients) : null, [recipe, allIngredients]);
  if (!recipe || !info) return <p style={{ color: MUTED }}>Nog geen recepten.</p>;

  const blocked = mode === "kan" ? info.kanBlock : mode === "fles" ? info.flesBlock : null;
  const volume = mode === "kan" ? kanMl : flesMl;
  const technique = info.stirred ? "geroerd" : info.shaken ? "geschud" : info.techniques.includes("build") ? "gebouwd" : null;

  // ---- Hoeveelheden ----
  // Glazen: recept × N. Kan/Fles: zo geschaald dat alles (incl. water bij
  // geroerde cocktails, ± 20% verdunning) precies in de kan/fles past.
  const mlRows = info.rows.filter(r => r.ing.unit === "ml" && !r.ing.optional);
  const baseMl = mlRows.reduce((s, r) => s + r.ing.amount, 0) || 1;
  const dilution = mode !== "glazen" && info.stirred ? 0.2 : 0;
  const scale = mode === "glazen" ? glasses : volume / (baseMl * (1 + dilution));
  const servings = mode === "glazen" ? glasses : Math.max(1, Math.round(volume / (baseMl * (1 + dilution))));
  // Per glas schenk je gewoon één portie van het recept (incl. verdunning).
  const pourMl = mode === "glazen" ? null : roundBatchMl(baseMl * (1 + dilution));

  const lines = info.rows
    .filter(r => mode === "glazen" || (!BATCH_EGG.has(info.idOf(r)) && !r.ing.optional))
    .map(r => {
      const id = info.idOf(r);
      const isEgg = BATCH_EGG.has(id);
      const amount = isEgg ? (mode === "glazen" ? glasses : servings) * r.ing.amount : r.ing.amount * scale;
      const owned = isOwned(r.ing);
      const bottleMl = r.meta?.bottleMl || (r.meta && !r.meta.unitPrice ? 700 : null);
      let status, enough, shortMl = 0, practical = null;
      if (isEgg) {
        status = mode === "glazen" ? "Niet in de batch" : "Niet in de batch";
        enough = owned;
      } else if (!owned) {
        status = "Niet op voorraad"; enough = false;
      } else if (r.ing.unit === "ml" && bottleMl && r.meta?.cat !== "Vers") {
        const count = voorraadAantal[id] ?? 1;
        const have = count * bottleMl;
        const countLabel = `${formatDutchNumber(count)} ${count === 1 ? "fles" : "flessen"}`;
        if (have >= amount) { status = `Je hebt ${countLabel} · genoeg`; enough = true; }
        else { shortMl = amount - have; status = `Je hebt ${countLabel} · ${roundBatchMl(shortMl)} ml tekort`; enough = false; }
      } else {
        status = "Op voorraad"; enough = true;
      }
      if (isEgg) practical = mode === "glazen" ? "per glas" : null;
      else if (BATCH_CITRUS[id] && r.ing.unit === "ml") {
        const c = BATCH_CITRUS[id]; const n = Math.max(1, Math.ceil(amount / c.ml));
        practical = `≈ ${n} ${n === 1 ? c.one : c.many}`;
      } else if (id === "sugar_syrup" || id === "honey_syrup") practical = "of zelf maken";
      else if (r.ing.unit === "ml" && bottleMl && r.meta?.cat !== "Vers") {
        const bottles = amount / bottleMl;
        if (bottles >= 0.4) { const b = Math.max(0.5, Math.round(bottles * 2) / 2); practical = `≈ ${formatDutchNumber(b)} ${b <= 1 ? "fles" : "flessen"}`; }
      }
      let amountLabel;
      if (r.ing.unit === "ml") amountLabel = formatBatchAmount(amount, units);
      else { const n = r.ing.unit === "dash" ? Math.round(amount) : Math.ceil(amount); amountLabel = `${n} ${unitLabel(r.ing.unit, n)}`; }
      return { r, id, label: ingredientLabel(r.ing) + (r.ing.optional ? " (optioneel)" : ""), status, enough, practical, amount, amountLabel, isEgg };
    });
  const waterMl = dilution > 0 ? volume - lines.filter(l => l.r.ing.unit === "ml").reduce((s, l) => s + roundBatchMl(l.amount), 0) : 0;

  const missing = lines.filter(l => !l.enough && !(l.r.ing.optional));
  const allOnList = missing.length > 0 && missing.every(l => shoppingKeys?.has(ingredientKey(l.r.ing)));
  const addMissing = () => {
    onAddToShoppingList(missing.map(l => ({ ref: l.r.ing, recipeNames: [recipe.name] })));
    onSound?.("tick");
    setAdded(true);
  };

  // ---- Tips / stappen ----
  const syrup = lines.find(l => l.id === "sugar_syrup" || l.id === "honey_syrup");
  const tips = [
    info.hasEggOptional && { icon: Droplet, strong: "Eiwit niet in de batch.", text: "Meng de rest vooraf en shake per glas met één eiwit." },
    info.hasFresh && { icon: Citrus, strong: "Vers sap", text: "blijft ± 4 uur goed. Pers het op de dag zelf." },
    syrup && (() => { const half = Math.max(5, Math.round(syrup.amount / 2 / 5) * 5); return syrup.id === "honey_syrup"
      ? { icon: FlaskRound, strong: "Honingsiroop zelf maken:", text: `${half} g honing + ${half} ml warm water, roeren tot het is opgelost.` }
      : { icon: FlaskRound, strong: "Suikersiroop zelf maken:", text: `${half} g suiker + ${half} ml heet water, roeren tot het is opgelost.` }; })(),
    info.hasBubbles && { icon: CupSoda, strong: "Bubbels pas bij het inschenken.", text: "Meng de rest vooraf en vul elk glas pas op het laatst aan." },
  ].filter(Boolean);
  const glass = (recipe.glass || "glas").split("(")[0].trim().toLowerCase();
  const steps = mode === "glazen" ? [] : [
    `Giet alles${waterMl > 0 ? ", inclusief het water," : ""} in ${mode === "fles" ? `een schone fles van ${batchVolumeLabel(volume)}` : `een kan van ${batchVolumeLabel(volume)}`}.`,
    mode === "fles"
      ? "Minimaal 2 uur in de vriezer of koelkast. Goed afgesloten houdbaar tot ± 3 maanden."
      : info.hasFresh ? "Zet de kan minimaal 1 uur in de koelkast en schenk binnen ± 4 uur (vers sap)." : "Zet de kan minimaal 1 uur in de koelkast.",
    info.stirred || !info.shaken
      ? `Schenk ${pourMl} ml per glas over ijs in een ${glass}${recipe.garnish ? ` en werk af: ${recipe.garnish.charAt(0).toLowerCase()}${recipe.garnish.slice(1)}` : "."}`
      : `Schud per glas ${pourMl} ml kort met ijs en zeef in een ${glass}${recipe.garnish ? `. Afwerking: ${recipe.garnish.charAt(0).toLowerCase()}${recipe.garnish.slice(1)}` : "."}`,
  ];

  const share = async () => {
    onSound?.("share");
    const head = mode === "glazen" ? `${recipe.name} voor ${glasses} glazen` : `${recipe.name}, ${mode === "fles" ? "fles" : "kan"} van ${batchVolumeLabel(volume)} (± ${servings} glazen van ${pourMl} ml)`;
    const text = [
      `Batchkaart: ${head}`, "",
      ...lines.map(l => `• ${l.label}: ${l.amountLabel}${l.isEgg ? " (per glas, niet in de batch)" : ""}`),
      waterMl > 0 ? `• Water: ${formatBatchAmount(waterMl, units)} (verdunning, vervangt het roeren)` : null,
      "",
      ...(mode === "glazen" ? tips.map(t => `– ${t.strong} ${t.text}`) : steps.map((s, i) => `${i + 1}. ${s}`)),
      "", "Gemaakt met Mijn Thuisbar",
    ].filter(x => x !== null).join("\n");
    let result;
    try {
      if (isNativeShell) { await Share.share({ title: `Batchkaart ${recipe.name}`, text, dialogTitle: "Deel batchkaart" }); result = "shared"; }
      else if (navigator.share) { await navigator.share({ title: `Batchkaart ${recipe.name}`, text }); result = "shared"; }
      else { await navigator.clipboard.writeText(text); result = "copied"; }
    } catch (e) { result = /cancel|abort/i.test(`${e?.name} ${e?.message}`) ? "cancelled" : "failed"; }
    if (result === "cancelled") return;
    setShareState(result);
    setTimeout(() => setShareState(null), 2500);
  };

  // ---- Weergave ----
  const card = { background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW_CARD };
  const seg = (active) => ({
    flex: 1, minHeight: 40, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: sans, fontSize: 14.5, fontWeight: 700,
    background: active ? CREAM : "transparent", color: active ? INK : MUTED, boxShadow: active ? "0 1px 4px rgba(43,38,32,0.14)" : "none",
  });
  const pill = (active, dark) => ({
    minWidth: 44, minHeight: 44, padding: "0 14px", borderRadius: 100, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700,
    background: active ? (dark ? "#D8B06A" : BOTTLE) : (dark ? "rgba(245,239,230,0.14)" : PAPER_DEEP), color: active ? (dark ? "#1B2A26" : "#FBF6EA") : (dark ? "#F3ECDD" : INK),
  });
  const bigRound = (filled) => ({
    width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer", fontSize: 24, fontWeight: 600, fontFamily: sans,
    display: "flex", alignItems: "center", justifyContent: "center", background: filled ? BOTTLE : "rgba(184,134,46,0.2)", color: filled ? "#FBF6EA" : INK,
  });
  const heading = (text, right) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "22px 0 10px" }}>
      <div style={{ fontFamily: systemFont, fontSize: 20, fontWeight: 700, color: INK }}>{text}</div>
      {right}
    </div>
  );

  return (
    <div style={{ fontFamily: sans }}>
      {/* Gekozen cocktail */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: 10 }}>
        <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={60} radius={12} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{recipe.name}</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{[recipe.family, (recipe.glass || "").split("(")[0].trim(), technique].filter(Boolean).join(" · ")}</div>
        </div>
        <button onClick={() => setPicking(true)} className="press-scale" style={{ minHeight: 44, padding: "0 16px", borderRadius: 100, border: "none", background: PAPER_DEEP, color: INK, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Wijzig</button>
      </div>

      {/* Glazen · Kan · Fles */}
      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 13, margin: "14px 0" }}>
        {[["glazen", "Glazen"], ["kan", "Kan"], ["fles", "Fles"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={seg(mode === k)}>{l}</button>
        ))}
      </div>

      {mode === "glazen" && (
        <div style={{ ...card, padding: "16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
            <button aria-label="Minder glazen" onClick={() => setGlasses(Math.max(1, glasses - 1))} style={bigRound(false)}>−</button>
            <div style={{ textAlign: "center", minWidth: 64 }}>
              <div style={{ fontFamily: serif, fontSize: 44, fontWeight: 700, color: INK, lineHeight: 1 }}>{glasses}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{glasses === 1 ? "glas" : "glazen"}</div>
            </div>
            <button aria-label="Meer glazen" onClick={() => setGlasses(Math.min(200, glasses + 1))} style={bigRound(true)}>+</button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {BATCH_QUICK.map(n => <button key={n} onClick={() => setGlasses(n)} aria-pressed={glasses === n} style={pill(glasses === n)}>{n}</button>)}
          </div>
        </div>
      )}

      {mode !== "glazen" && blocked && (
        <div style={{ ...card, padding: "16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: PAPER_DEEP, color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Info size={17} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, color: INK, lineHeight: 1.5 }}>{blocked}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => setMode("glazen")} style={{ ...pill(true), minHeight: 44 }}>Reken per glas</button>
              {mode === "fles" && !info.kanBlock && <button onClick={() => setMode("kan")} style={pill(false)}>Maak een kan</button>}
            </div>
          </div>
        </div>
      )}

      {mode !== "glazen" && !blocked && (
        <div style={{ borderRadius: 16, padding: "16px 16px", background: "#1F3A33", color: "#F3ECDD", display: "flex", gap: 14, alignItems: "center", boxShadow: SHADOW_CARD }}>
          <svg width="40" height="64" viewBox="0 0 40 64" aria-hidden style={{ flexShrink: 0 }}>
            {mode === "fles" ? (
              <path d="M15 2h10v12c0 3 9 6 9 16v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V30c0-10 9-13 9-16z" fill="none" stroke="#D8B06A" strokeWidth="2.2" strokeLinejoin="round" />
            ) : (
              <path d="M6 8h24l-2 6c4 2 8 6 8 14s-4 10-8 12v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z M30 20c3 1 5 4 5 8s-2 7-5 8" fill="none" stroke="#D8B06A" strokeWidth="2.2" strokeLinejoin="round" />
            )}
            <path d={mode === "fles" ? "M7 36h26v22a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" : "M7 30h21v28a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"} fill="#B8862E" opacity="0.55" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: "#D8B06A" }}>{mode === "fles" ? "Fles vullen" : "Kan vullen"}</div>
            <div style={{ display: "flex", gap: 6, margin: "8px 0", flexWrap: "wrap" }}>
              {(mode === "fles" ? BATCH_FLES : BATCH_KAN).map(o => {
                const active = (mode === "fles" ? flesMl : kanMl) === o.ml;
                return <button key={o.ml} aria-pressed={active} onClick={() => (mode === "fles" ? setFlesMl(o.ml) : setKanMl(o.ml))} style={pill(active, true)}>{o.label}</button>;
              })}
            </div>
            <div style={{ fontSize: 13.5, color: "#F3ECDD" }}>Goed voor <strong>± {servings} glazen</strong> van {pourMl} ml</div>
          </div>
        </div>
      )}

      {!blocked && (
        <>
          {heading(mode === "fles" ? "In de fles" : mode === "kan" ? "In de kan" : "Wat heb je nodig", (
            <div role="radiogroup" aria-label="Eenheid" style={{ display: "flex", gap: 2, padding: 3, background: PAPER_DEEP, borderRadius: 100 }}>
              {["ml", "cl", "oz"].map(u => (
                <button key={u} role="radio" aria-checked={units === u} onClick={() => setUnits(u)} style={{
                  minWidth: 44, minHeight: 36, borderRadius: 100, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 700,
                  background: units === u ? CREAM : "transparent", color: units === u ? INK : MUTED, boxShadow: units === u ? "0 1px 3px rgba(43,38,32,0.14)" : "none",
                }}>{u}</button>
              ))}
            </div>
          ))}
          <div style={{ ...card, overflow: "hidden" }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
                <span aria-label={l.enough ? "Genoeg in huis" : "Niet genoeg in huis"} style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                  background: l.enough ? SAGE : "transparent", border: l.enough ? "none" : `1.5px solid ${BURGUNDY}`,
                }}>{l.enough && <Check size={13} strokeWidth={3} color={CREAM} />}</span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, minHeight: 36 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{l.label}</div>
                    <div style={{ fontSize: 12.5, marginTop: 1, color: l.enough || l.isEgg ? MUTED : BURGUNDY }}>{l.status}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{l.amountLabel}</div>
                    {l.practical && <div style={{ fontSize: 12, color: MUTED, marginTop: 1, whiteSpace: "nowrap" }}>{l.practical}</div>}
                  </div>
                </div>
              </div>
            ))}
            {waterMl > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
                <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: BOTTLE, color: CREAM, display: "flex", alignItems: "center", justifyContent: "center" }}><Droplet size={12} /></span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>Water</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>Verdunning (± 20%), vervangt het roeren</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{formatBatchAmount(waterMl, units)}</div>
                </div>
              </div>
            )}
          </div>

          {missing.length > 0 && (
            added || allOnList ? (
              <div className={added ? "success-pop" : undefined} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 52, color: SAGE, fontSize: 14.5, fontWeight: 700, marginTop: 10 }}>
                <Check size={16} strokeWidth={3} /> Op je boodschappenlijst
              </div>
            ) : (
              <button onClick={addMissing} className="press-scale" style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 10, borderRadius: 14, border: "none",
                background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
              }}>
                <ShoppingCart size={17} /> {missing.length === 1 ? `${missing[0].label.replace(" (optioneel)", "")} op boodschappenlijst` : "Zet ontbrekende op boodschappenlijst"}
              </button>
            )
          )}

          {mode === "glazen" && tips.length > 0 && (
            <>
              {heading("Tips voor deze batch")}
              <div style={{ ...card, padding: "2px 14px" }}>
                {tips.map((t, i) => {
                  const Icon = t.icon;
                  return (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                      <span style={{ width: 30, height: 30, borderRadius: "50%", background: PAPER_DEEP, color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} /></span>
                      <div style={{ fontSize: 14, color: INK, lineHeight: 1.5 }}><strong>{t.strong}</strong> {t.text}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {mode !== "glazen" && (
            <>
              {heading("Zo maak je het")}
              <div style={{ ...card, padding: "2px 14px" }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${BRASS}`, color: BRASS, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" }}>{i + 1}</span>
                    <div style={{ fontSize: 14, color: INK, lineHeight: 1.5 }}>{s}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button onClick={share} className="press-scale" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 18, borderRadius: 14, border: "none",
            background: "rgba(184,134,46,0.18)", color: INK, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}>
            <Share2 size={17} color={BRASS} /> {shareState === "copied" ? "Gekopieerd" : shareState === "shared" ? "Gedeeld" : shareState === "failed" ? "Delen lukte niet" : "Deel batchkaart"}
          </button>
        </>
      )}

      {picking && (
        <BatchRecipePicker recipes={recipes} allIngredients={allIngredients} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
          currentId={recipe.id} onPick={(id) => { setRecipeId(id); onSound?.("pop"); }} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

// Vers fruit i.p.v. een fles sap: hoeveel sap één vrucht ongeveer geeft,
// plus een richtprijs per stuk (supermarkt, indicatief).
const FRESH_FRUIT = {
  lime_juice: { ml: 25, label: "Limoenen", one: "limoen", price: 0.35 },
  lemon_juice: { ml: 35, label: "Citroenen", one: "citroen", price: 0.4 },
};
const MONTHS_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
function formatDateNl(value) {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(value));
  if (!m) return String(value);
  const month = MONTHS_NL[Number(m[2]) - 1];
  return m[3] ? `${Number(m[3])} ${month.slice(0, 3)} ${m[1]}` : `${month} ${m[1]}`;
}
function formatInhoud(ml) {
  if (!ml) return "";
  if (ml >= 1000) return `${String(ml / 1000).replace(".", ",")} L`;
  return `${Math.round(ml / 10 * 10) / 10} cl`.replace(".", ",");
}
// Winkels waar je flessen koopt. Mitra, Dirck III en Drankgigant worden
// wekelijks automatisch gecontroleerd (Edge Function `prijscheck`).
// Drankdozijn en Gall & Gall blokkeren dat; daar zoeken we via Google
// binnen hun site, zodat een link altijd werkt.
const WINKELS = {
  drankgigant: { naam: "Drankgigant", sub: "Webshop", zoek: (q) => `https://www.drankgigant.nl/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  dirckiii: { naam: "Dirck III", sub: "Bezorgen vanaf 6 flessen, of ophalen in de winkel", zoek: (q) => `https://www.dirckiii.nl/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  mitra: { naam: "Mitra", sub: "Webshop of ophalen in de winkel", zoek: (q) => `https://www.mitra.nl/zoeken?q=${encodeURIComponent(q)}` },
  drankdozijn: { naam: "Drankdozijn", sub: "Webshop", zoek: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:drankdozijn.nl ${q}`)}` },
  gall: { naam: "Gall & Gall", sub: "Webshop of ophalen in de winkel", zoek: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:gall.nl ${q}`)}` },
};
const WINKEL_HOSTS = /(^|\.)(drankgigant\.nl|dirckiii\.nl|mitra\.nl|drankdozijn\.nl|gall\.nl|google\.com)$/;
// Alleen links naar deze winkels (of de Google-zoekopdracht) openen.
function isShopUrl(url) {
  try { const u = new URL(url); return u.protocol === "https:" && WINKEL_HOSTS.test(u.hostname); } catch { return false; }
}
function openShopUrl(url) { if (isShopUrl(url)) Browser.open({ url }); }
const NIVEAUS = [["voordelig", "Voordelig"], ["goed", "Goed"], ["klassieker", "Klassieker"]];
// Ouder dan dit en niet meer bijgewerkt: dan tonen we het als richtprijs.
const OFFER_MAX_AGE_DAYS = 45;
function offerIsFresh(o) {
  if (o?.prijs == null || !o.prijs_gecontroleerd_op) return false;
  const age = (Date.now() - new Date(o.prijs_gecontroleerd_op).getTime()) / 86400000;
  return age >= -2 && age <= OFFER_MAX_AGE_DAYS; // -2: kleine klokafwijking op het toestel
}

// Flessen en waar ze te koop zijn (tabellen flessen + fles_aanbiedingen).
// Geladen bij de start: klein, en de prijzen worden overal gebruikt (ook in
// Feestplanner en menu-assistent). Lukt het niet, dan blijven de
// richtprijzen uit recipes.js staan.
function useFlessen() {
  const [data, setData] = useState({ flessen: [], aanbiedingen: [] });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("flessen").select("*").eq("status", "goedgekeurd"),
      supabase.from("fles_aanbiedingen").select("*").eq("actief", true),
    ]).then(([f, a]) => {
      if (cancelled || f.error || a.error) return;
      setData({ flessen: f.data || [], aanbiedingen: a.data || [] });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return useMemo(() => buildBottleOptions(data.flessen, data.aanbiedingen), [data]);
}
// Map ingredient_id → [{ fles, niveau, label, offers (beste eerst), best, from }]
function buildBottleOptions(flessen, aanbiedingen) {
  const byFles = new Map();
  aanbiedingen.forEach(a => { if (!byFles.has(a.fles_id)) byFles.set(a.fles_id, []); byFles.get(a.fles_id).push(a); });
  const map = new Map();
  flessen.forEach(f => {
    const offers = (byFles.get(f.id) || []).map(o => ({
      ...o, prijs: o.prijs != null ? Number(o.prijs) : null, fresh: offerIsFresh(o),
      perLiter: o.prijs != null && o.inhoud_ml ? Number(o.prijs) / (o.inhoud_ml / 1000) : null,
    })).sort((x, y) => (Number(y.op_voorraad && y.fresh) - Number(x.op_voorraad && x.fresh)) || ((x.prijs ?? 1e9) - (y.prijs ?? 1e9)));
    const best = offers.find(o => o.op_voorraad && o.fresh) || offers.find(o => o.prijs != null) || null;
    const entry = { fles: f, niveau: f.niveau, label: (NIVEAUS.find(n => n[0] === f.niveau) || [])[1] || f.niveau, offers, best, from: best?.prijs ?? null };
    if (!map.has(f.ingredient_id)) map.set(f.ingredient_id, []);
    map.get(f.ingredient_id).push(entry);
  });
  map.forEach(list => list.sort((a, b) => NIVEAUS.findIndex(n => n[0] === a.niveau) - NIVEAUS.findIndex(n => n[0] === b.niveau)));
  return map;
}
// Welke fles telt voor een ingrediënt: je eigen keuze, anders de voordeligste.
function chosenOption(options, chosenId) {
  if (!options?.length) return null;
  return options.find(o => o.fles.id === chosenId) || options[0];
}
const NIVEAU_TAG = {
  voordelig: { color: SAGE, bg: "rgba(92,122,82,0.16)" },
  goed: { color: BOTTLE, bg: "rgba(31,61,54,0.10)" },
  klassieker: { color: "#8F6A21", bg: "rgba(184,134,46,0.16)" },
};

function FlesKiezenSheet({ item, meta, options = [], chosenId, recipeNames, onChoose, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [selected, setSelected] = useState(() => chosenOption(options, chosenId)?.fles.id || null);
  const current = options.find(o => o.fles.id === selected) || null;
  const spec = DRANK_SPECS[meta?.id] || null;
  const forText = recipeNames.length ? recipeNames.slice(0, 2).join(" en ") + (recipeNames.length > 2 ? ` en ${recipeNames.length - 2} meer` : "") : null;
  const checkedDates = options.flatMap(o => o.offers.map(x => x.prijs_gecontroleerd_op)).filter(Boolean).sort();
  const lastChecked = checkedDates[checkedDates.length - 1];
  const pick = (id) => { setSelected(id); onChoose(id); };
  const searchName = current?.fles.naam || meta?.name || item.label;
  const richtprijs = meta?.bottlePrice && !options.length ? meta.bottlePrice : null;
  const shopLabel = (key) => WINKELS[key]?.naam || key;

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in sheet-max-92" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "88vh",
        background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 20px 14px", touchAction: "none" }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}><ItemArt ing={meta || { id: item.key, name: item.label, cat: "Sterke drank" }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontSize: 23, fontWeight: 700, lineHeight: 1.15 }}>{item.label}</div>
            {spec && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{spec.omschrijving}</div>}
          </div>
          <button onClick={close} aria-label="Sluiten" onTouchStart={e => e.stopPropagation()} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px", WebkitOverflowScrolling: "touch" }}>
          {richtprijs && (
            <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>Richtprijs</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 800 }}>± {euro(richtprijs)}</span>
                {meta.bottleMl && <span style={{ fontSize: 13, color: MUTED }}>voor {formatInhoud(meta.bottleMl)}</span>}
              </div>
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45, marginTop: 6 }}>Een schatting op basis van eerdere winkelprijzen. Voor deze drank zijn de drie vaste flessen nog niet gekozen; tot die tijd rekent de app met dit bedrag.</div>
            </div>
          )}

          {spec && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "rgba(92,122,82,0.14)", marginBottom: 16 }}>
              <ShieldCheck size={17} color={SAGE} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: INK }}>
                <strong>{options.length ? (forText ? `Alle opties passen bij ${forText}.` : "Alle opties passen bij je recepten.") : "Let op bij het kopen:"}</strong> {spec.eis}
              </div>
            </div>
          )}

          {options.length > 0 ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Kies je fles</div>
              <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {options.map(o => {
                  const on = o.fles.id === selected;
                  const tag = NIVEAU_TAG[o.niveau] || NIVEAU_TAG.goed;
                  const minPrice = o.offers.reduce((m, x) => (x.prijs != null && x.op_voorraad && (m == null || x.prijs < m) ? x.prijs : m), null);
                  return (
                    <div key={o.fles.id} style={{ borderRadius: 16, background: CREAM, overflow: "hidden", border: on ? `1.5px solid ${BOTTLE}` : `1px solid ${BORDER}` }}>
                      <button role="radio" aria-checked={on} onClick={() => pick(o.fles.id)} style={{
                        display: "flex", alignItems: "flex-start", gap: 12, width: "100%", padding: 14, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
                      }}>
                        <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${on ? BOTTLE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box", marginTop: 2 }}>
                          {on && <span style={{ width: 10, height: 10, borderRadius: "50%", background: BOTTLE }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, borderRadius: 100, padding: "2px 8px", color: tag.color, background: tag.bg }}>{o.label}</span>
                          <span style={{ display: "block", fontSize: 16, fontWeight: 700, marginTop: 5 }}>{o.fles.naam}</span>
                          {o.fles.notitie && <span style={{ display: "block", fontSize: 13, color: MUTED, lineHeight: 1.4, marginTop: 2 }}>{o.fles.notitie}</span>}
                        </span>
                        <span style={{ textAlign: "right", flexShrink: 0 }}>
                          {minPrice != null ? (
                            <>
                              <span style={{ display: "block", fontSize: 12, color: MUTED }}>vanaf</span>
                              <span style={{ display: "block", fontSize: 17, fontWeight: 800 }}>{euro(minPrice)}</span>
                            </>
                          ) : <span style={{ display: "block", fontSize: 12.5, color: BURGUNDY, fontWeight: 700 }}>Uitverkocht</span>}
                        </span>
                      </button>
                      {on && (
                        <div className="accordion-reveal" style={{ borderTop: `1px solid ${BORDER}`, padding: "2px 14px 4px" }}>
                          {o.offers.map((x, i) => (
                            <button key={x.id} onClick={() => openShopUrl(x.url)} style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 54, padding: 0, background: "none", border: "none",
                              borderTop: i > 0 ? `1px solid ${PAPER_DEEP}` : "none", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
                            }}>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{shopLabel(x.winkel)}</span>
                                <span style={{ display: "block", fontSize: 12, color: x.op_voorraad ? MUTED : BURGUNDY, marginTop: 1 }}>
                                  {formatInhoud(x.inhoud_ml)} · {x.op_voorraad ? "op voorraad" : "niet op voorraad"}{!x.fresh ? " · richtprijs" : ""}
                                </span>
                              </span>
                              <span style={{ textAlign: "right" }}>
                                <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: x === o.best ? "#4F6B46" : INK }}>{x.prijs != null ? euro(x.prijs) : "–"}</span>
                                {x.perLiter != null && <span style={{ display: "block", fontSize: 11.5, color: MUTED }}>{euro(x.perLiter)} / L</span>}
                              </span>
                              <ExternalLink size={15} color={MUTED} style={{ marginLeft: 6, flexShrink: 0 }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {lastChecked && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: MUTED, marginTop: 14 }}>
                  <Clock size={13} /> Prijzen gecontroleerd op {formatDateNl(lastChecked)} · elke week opnieuw
                </div>
              )}
              <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginTop: 8 }}>
                Ook zoeken bij{" "}
                <button onClick={() => openShopUrl(WINKELS.drankdozijn.zoek(searchName))} style={{ background: "none", border: "none", padding: 0, color: "#8F6A21", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: sans }}>Drankdozijn</button>
                {" of "}
                <button onClick={() => openShopUrl(WINKELS.gall.zoek(searchName))} style={{ background: "none", border: "none", padding: 0, color: "#8F6A21", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: sans }}>Gall &amp; Gall</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Zoek bij</div>
              <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "0 14px" }}>
                {["drankgigant", "dirckiii", "mitra", "drankdozijn", "gall"].map((k, i) => (
                  <button key={k} onClick={() => openShopUrl(WINKELS[k].zoek(searchName))} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 56, padding: 0, background: "none", border: "none",
                    borderTop: i > 0 ? `1px solid ${PAPER_DEEP}` : "none", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
                  }}>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{WINKELS[k].naam}</span>
                      <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{WINKELS[k].sub}</span>
                    </span>
                    <ExternalLink size={15} color={MUTED} />
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.45, marginTop: 10 }}>Opent de zoekresultaten voor "{searchName}" in de webshop.</div>
            </>
          )}
        </div>

        {current?.best && (
          <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom) + 14px)", borderTop: `1px solid ${BORDER}`, background: PAPER }}>
            <button onClick={() => openShopUrl(current.best.url)} className="press-scale" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, borderRadius: 14, border: "none",
              background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer",
            }}>
              Bekijk bij {shopLabel(current.best.winkel)}{current.best.prijs != null ? ` · ${euro(current.best.prijs)}` : ""} <ExternalLink size={16} />
            </button>
            <div style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 8 }}>Opent de productpagina van precies deze fles</div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}

function WinkelmandjeTab({ shoppingList, recipes, allIngredients, onRemove, onBuy, onUndoBuy, onClear, onAdd, onSound, isOwned, bottleOptions = new Map(), chosenBottles = {}, onChooseBottle }) {
  const [customName, setCustomName] = useState("");
  const [bought, setBought] = useState([]); // [{ item, wasOwned }] — alleen deze sessie, doorgestreept
  const [toast, setToast] = useState(null);
  const [sheetKey, setSheetKey] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const toastTimer = useRef(null);
  const ingredientNames = allIngredients.map(i => i.name);
  const metaById = useMemo(() => new Map(allIngredients.map(i => [i.id, i])), [allIngredients]);
  const recipesByName = useMemo(() => new Map(recipes.map(r => [r.name, r])), [recipes]);
  // Weergave van de drankwinkel-flessen: per drank, of gegroepeerd per winkel.
  const [shopView, setShopView] = useState("drank");
  // Welke productpagina's je al hebt geopend via "Bestellen bij …".
  const [openedLinks, setOpenedLinks] = useState(() => new Set());

  // …-menu rechts in de navigatiebalk (Leegmaken).
  const setNavOverride = useContext(NavOverrideContext);
  useEffect(() => {
    if (!setNavOverride) return;
    setNavOverride({
      right: (
        <button onClick={() => setMenuOpen(v => !v)} aria-label="Meer opties" aria-expanded={menuOpen} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", color: BRASS }}>
          <MoreHorizontal size={20} />
        </button>
      ),
    });
  }, [setNavOverride, menuOpen]);
  useEffect(() => () => setNavOverride && setNavOverride(null), [setNavOverride]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (t) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  const addCustom = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const meta = allIngredients.find(i => i.name.toLowerCase() === trimmed.toLowerCase());
    onAdd([{ ref: meta ? { id: meta.id } : { name: trimmed }, recipeNames: [] }]);
    onSound("tick");
    setCustomName("");
  };
  const check = (row) => {
    const wasOwned = row.meta ? isOwned({ id: row.meta.id }) : false;
    onSound("tick");
    onBuy(row.item);
    setBought(prev => [...prev.filter(b => b.item.key !== row.item.key), { item: row.item, wasOwned, row }]);
    showToast({ key: row.item.key, text: row.meta ? `${row.label} staat nu in je voorraad` : `${row.label} afgevinkt` });
  };
  const undo = (key) => {
    const entry = bought.find(b => b.item.key === key);
    if (!entry) return;
    onSound("pop");
    onUndoBuy(entry.item, entry.wasOwned);
    setBought(prev => prev.filter(b => b.item.key !== key));
    setToast(null);
  };

  const describe = (item) => {
    const meta = item.id ? metaById.get(item.id) : allIngredients.find(i => i.name.toLowerCase() === (item.label || "").toLowerCase());
    const names = item.recipes || [];
    const fruit = meta && FRESH_FRUIT[meta.id];
    let label = item.label, price = null, inhoud = "", note = null;
    if (fruit) {
      // Sap uit een fles → verse vruchten: optellen wat de cocktails nodig hebben.
      const ml = names.reduce((s, n) => {
        const ing = recipesByName.get(n)?.ingredients.find(i => (findIngredientMeta(i, allIngredients)?.id || i.id) === meta.id);
        return s + (ing?.unit === "ml" ? ing.amount : 0);
      }, 0);
      const count = Math.max(2, Math.ceil((ml || fruit.ml * 2) / fruit.ml));
      label = `${fruit.label} (±${count})`;
      price = count * fruit.price;
      inhoud = "los";
    } else if (meta?.bottleMl && meta?.bottlePrice) {
      price = meta.bottlePrice; inhoud = formatInhoud(meta.bottleMl);
    } else if (meta?.unitPrice) {
      price = meta.unitPrice; inhoud = "per stuk";
    }
    if (meta?.id === "sugar_syrup") note = "Of zelf maken: suiker + water";
    const group = shopGroupFor(meta);
    const options = meta && group === "drankwinkel" ? bottleOptions.get(meta.id) || [] : [];
    // Gekozen fles (of de voordeligste) met de beste winkelprijs. Zonder
    // vaste fles blijft de richtprijs staan, nooit "onbekend".
    const option = chosenOption(options, chosenBottles[meta?.id]);
    const bottle = option?.best || null;
    let estimated = group === "drankwinkel" && !bottle && price != null;
    if (bottle) {
      price = bottle.prijs; inhoud = formatInhoud(bottle.inhoud_ml);
      note = `${option.fles.naam} · ${WINKELS[bottle.winkel]?.naam || bottle.winkel}`;
      estimated = !bottle.fresh;
    }
    const sub = names.length ? `Voor ${names[0]}${names.length > 1 ? ` · +${names.length - 1} cocktail${names.length > 2 ? "s" : ""}` : ""}` : "Zelf toegevoegd";
    return { item, meta, label, price, inhoud, note, group, options, option, bottle, estimated, sub };
  };

  const rows = shoppingList.map(describe);
  const boughtRows = bought.map(b => ({ ...describe(b.item), done: true }));
  const groups = [
    { key: "drankwinkel", title: "Drankwinkel", icon: Wine },
    { key: "supermarkt", title: "Supermarkt", icon: ShoppingCart },
  ].map(g => {
    const open = rows.filter(r => r.group === g.key);
    const done = boughtRows.filter(r => r.group === g.key);
    return { ...g, open, done, subtotal: open.reduce((s, r) => s + (r.price || 0), 0) };
  });
  const total = groups.reduce((s, g) => s + g.subtotal, 0);
  const allNames = [...new Set(shoppingList.flatMap(i => i.recipes || []))];
  const hasFruit = rows.some(r => r.meta && FRESH_FRUIT[r.meta.id]);
  const usedDates = rows.map(r => r.bottle?.fresh ? String(r.bottle.prijs_gecontroleerd_op).slice(0, 10) : null).filter(Boolean).sort();
  const priceDate = usedDates.length ? formatDateNl(usedDates[0]) : formatDateNl(PRICES_UPDATED);
  const sheetRow = sheetKey ? rows.find(r => r.item.key === sheetKey) : null;

  // Per winkel: wat kost jouw gekozen flessen daar, en is alles er te koop?
  // Alleen voor dranken met vaste flessen (anders valt er niets te vergelijken).
  const shopPlan = useMemo(() => {
    const items = rows.filter(r => r.group === "drankwinkel" && r.option);
    if (items.length === 0) return null;
    const shops = Object.keys(WINKELS).map(key => {
      const lines = items.map(r => {
        const offer = r.option.offers.find(o => o.winkel === key && o.op_voorraad && o.prijs != null) || null;
        return { r, offer };
      });
      const have = lines.filter(l => l.offer);
      return { key, naam: WINKELS[key].naam, sub: WINKELS[key].sub, lines, count: have.length, total: have.reduce((t, l) => t + l.offer.prijs, 0) };
    }).filter(sh => sh.count > 0)
      .sort((a, b) => (b.count - a.count) || (a.total - b.total));
    const complete = shops.filter(sh => sh.count === items.length).sort((a, b) => a.total - b.total);
    const best = complete[0] || null;
    const next = complete[1] || null;
    return { items, shops, best, saving: best && next ? next.total - best.total : 0, nextName: next?.naam || null };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderShopPlan = () => {
    const { shops, best, saving, nextName, items } = shopPlan;
    const openNext = (sh) => {
      const todo = sh.lines.filter(l => l.offer && !openedLinks.has(l.offer.id));
      const target = todo[0] || sh.lines.find(l => l.offer);
      if (!target) return;
      setOpenedLinks(prev => new Set(prev).add(target.offer.id));
      openShopUrl(target.offer.url);
    };
    return (
      <div style={{ marginBottom: 18 }}>
        {best && (
          <div style={{ background: BOTTLE_DARK, color: CREAM, borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#DDB877" }}>Goedkoopst in één keer</div>
            <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, marginTop: 4 }}>Alles bij {best.naam} · {euro(best.total)}</div>
            <div style={{ fontSize: 13, color: "#C9D2CB", marginTop: 4, lineHeight: 1.45 }}>
              {saving > 0.01 ? `Scheelt ${euro(saving)} ten opzichte van ${nextName}. ` : ""}Verzendkosten zie je bij de winkel.
            </div>
          </div>
        )}
        {rows.filter(r => r.group === "drankwinkel" && !r.option).map(r => (
          <button key={r.item.key} onClick={() => setSheetKey(r.item.key)} style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", marginBottom: 10, boxSizing: "border-box",
            background: CREAM, border: `1px dashed ${BORDER}`, borderRadius: 16, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{r.label}</span>
              <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>Nog geen vaste fles · tik om te zoeken in de webshops</span>
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 800 }}>{r.price != null ? `± ${euro(r.price)}` : ""}</span>
            <ChevronRight size={16} color={MUTED} />
          </button>
        ))}
        {shops.map((sh, n) => {
          const isBest = best && sh.key === best.key;
          const opened = sh.lines.filter(l => l.offer && openedLinks.has(l.offer.id)).length;
          const todo = sh.lines.filter(l => l.offer && !openedLinks.has(l.offer.id));
          return (
            <div key={sh.key} style={{ background: CREAM, borderRadius: 16, marginBottom: 10, overflow: "hidden", border: isBest ? `1.5px solid ${BOTTLE}` : `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "14px 14px 2px" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>{sh.naam}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: INK }}>{euro(sh.total)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, padding: "0 14px 6px" }}>
                {sh.count < items.length ? `${sh.count} van ${items.length} flessen · ` : ""}{sh.sub}
              </div>
              <div style={{ padding: "0 14px" }}>
                {sh.lines.map(({ r, offer }) => (
                  <button key={r.item.key} onClick={() => { if (!offer) return; setOpenedLinks(prev => new Set(prev).add(offer.id)); openShopUrl(offer.url); }} disabled={!offer} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: 0, background: "none", border: "none",
                    borderTop: `1px solid ${PAPER_DEEP}`, cursor: offer ? "pointer" : "default", textAlign: "left", fontFamily: sans, color: offer ? INK : MUTED,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.option.fles.naam}</span>
                    {offer ? (
                      <>
                        <span style={{ fontSize: 14, fontWeight: 700, color: offer.prijs <= Math.min(...shops.map(s2 => s2.lines.find(l => l.r === r)?.offer?.prijs ?? 1e9)) ? "#4F6B46" : INK }}>{euro(offer.prijs)}</span>
                        {openedLinks.has(offer.id) ? <Check size={14} color={SAGE} strokeWidth={3} /> : <ExternalLink size={14} color={MUTED} />}
                      </>
                    ) : <span style={{ fontSize: 12.5 }}>niet bij {sh.naam}</span>}
                  </button>
                ))}
              </div>
              {(isBest || n === 0) ? (
                <div style={{ padding: "10px 14px 14px" }}>
                  <button onClick={() => openNext(sh)} className="press-scale" style={{
                    width: "100%", minHeight: 46, borderRadius: 12, border: "none", background: BRASS, color: BOTTLE_DARK,
                    fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer",
                  }}>
                    {opened === 0 ? `Bestellen bij ${sh.naam}` : todo.length ? `Volgende: ${todo[0].r.option.fles.naam} (${opened + 1} van ${sh.count})` : "Alles geopend"}
                  </button>
                  <div style={{ fontSize: 11.5, color: MUTED, textAlign: "center", marginTop: 6 }}>Opent de flessen één voor één in de webshop, zodat je ze in je mandje legt</div>
                </div>
              ) : <div style={{ height: 8 }} />}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRow = (r, i) => {
    const content = (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px 0 12px", background: CREAM }}>
        <button onClick={() => (r.done ? undo(r.item.key) : check(r))} aria-label={r.done ? `${r.label}: afvinken ongedaan maken` : `${r.label} afvinken als gekocht`} aria-pressed={!!r.done}
          style={{ width: 44, height: 44, margin: "0 -6px 0 -8px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", border: r.done ? "none" : `1.5px solid ${BORDER}`, background: r.done ? SAGE : "transparent" }}>
            {r.done && <Check size={14} strokeWidth={3} color={CREAM} />}
          </span>
        </button>
        <div style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0, opacity: r.done ? 0.5 : 1 }}>
          <ItemArt ing={r.meta || { id: r.item.id || r.item.key, name: r.label, cat: "Vers" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, alignSelf: "stretch" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: r.done ? MUTED : INK, textDecoration: r.done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.done ? "Gekocht · in je voorraad" : (r.note || r.sub)}</div>
            {!r.done && r.group === "drankwinkel" && r.meta && (
              <button onClick={() => setSheetKey(r.item.key)} style={{ display: "inline-flex", alignItems: "center", gap: 2, minHeight: 32, padding: 0, marginTop: 1, background: "none", border: "none", cursor: "pointer", color: BOTTLE, fontFamily: sans, fontSize: 12.5, fontWeight: 700 }}>
                {r.options.length ? `Kies fles · ${r.options.length} ${r.options.length === 1 ? "optie" : "opties"}` : "Waar te koop"} <ChevronRight size={14} />
              </button>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, opacity: r.done ? 0.5 : 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: INK }}>{r.price != null ? `${r.estimated ? "± " : ""}${euro(r.price)}` : ""}</div>
            {r.inhoud && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{r.inhoud}</div>}
          </div>
        </div>
      </div>
    );
    if (r.done) return <div key={`done-${r.item.key}`}>{content}</div>;
    return (
      <SwipeToDelete key={r.item.key} onDelete={() => { onSound("remove"); onRemove(r.item.key); }}>{content}</SwipeToDelete>
    );
  };

  return (
    <div style={{ fontFamily: sans, position: "relative" }}>
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
          <div style={{ position: "absolute", top: -12, right: 0, zIndex: 26, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_HERO, minWidth: 190, overflow: "hidden" }}>
            <button onClick={() => { setMenuOpen(false); if (shoppingList.length) setConfirmClear(true); }} disabled={!shoppingList.length} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "0 16px", background: "none", border: "none",
              cursor: shoppingList.length ? "pointer" : "default", color: shoppingList.length ? BURGUNDY : MUTED, fontFamily: sans, fontSize: 15, fontWeight: 600,
            }}>
              <Trash2 size={16} /> Leegmaken
            </button>
          </div>
        </>
      )}

      <h1 style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.15 }}>
        {shoppingList.length === 0 ? "Niets te halen" : `${shoppingList.length} te halen`}
      </h1>
      {allNames.length > 0 && (
        <div style={{ fontSize: 13.5, color: MUTED, marginTop: 4 }}>
          Voor {allNames.length <= 2 ? allNames.join(" en ") : `${allNames.slice(0, 2).join(", ")} en ${allNames.length - 2} meer`}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); addCustom(); }} style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px 0 18px", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "0 6px 0 12px" }}>
        <button type="submit" aria-label="Toevoegen" disabled={!customName.trim()} style={{ width: 32, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: customName.trim() ? BOTTLE : MUTED, cursor: "pointer", padding: 0, flexShrink: 0 }}>
          <Plus size={18} />
        </button>
        <IngredientAutocomplete value={customName} onChange={setCustomName} options={ingredientNames} placeholder="Iets toevoegen, bijv. ijsblokjes" style={{ flex: 1 }} variant="bare" />
      </form>

      {shopPlan && (
        <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 12, marginBottom: 16 }}>
          {[["drank", "Per drank"], ["winkel", "Per winkel"]].map(([id, lbl]) => (
            <button key={id} role="tab" aria-selected={shopView === id} onClick={() => setShopView(id)} style={{
              flex: 1, height: 34, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 600,
              background: shopView === id ? CREAM : "transparent", color: shopView === id ? INK : MUTED,
              boxShadow: shopView === id ? "0 1px 4px rgba(43,38,32,0.14)" : "none",
            }}>{lbl}</button>
          ))}
        </div>
      )}

      {shoppingList.length === 0 && bought.length === 0 && (
        <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "40px 0", lineHeight: 1.6 }}>
          Je boodschappenlijst is leeg.<br />Voeg ontbrekende ingrediënten toe vanuit "Wat kan ik maken", een recept of de Feestplanner.
        </p>
      )}

      {groups.filter(g => g.open.length || g.done.length).map(g => {
        const Icon = g.icon;
        if (g.key === "drankwinkel" && shopView === "winkel" && shopPlan) return <div key={g.key}>{renderShopPlan()}</div>;
        return (
          <div key={g.key} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 8px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: MUTED }}>
                <Icon size={14} /> {g.title}
              </span>
              {g.subtotal > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{euro(g.subtotal)}</span>}
            </div>
            <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", boxShadow: SHADOW_CARD }}>
              {[...g.open, ...g.done].map(renderRow)}
            </div>
            {g.key === "supermarkt" && hasFruit && (
              <p style={{ fontSize: 12.5, color: MUTED, margin: "8px 4px 0", lineHeight: 1.5 }}>Tip: vers geperst sap is voor cocktails veel beter dan uit een fles.</p>
            )}
          </div>
        );
      })}

      {total > 0 && (
        <div style={{ background: "#1F3A33", color: "#F3ECDD", borderRadius: 16, padding: "16px 18px", marginTop: 6, boxShadow: SHADOW_CARD }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Geschat totaal</span>
            <span style={{ fontFamily: serif, fontSize: 28, fontWeight: 700 }}><AnimatedNumber value={total} format={euro} /></span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 6, color: "rgba(243,236,221,0.82)" }}>
            {usedDates.length
              ? `Winkelprijzen van ${formatDateNl(usedDates[0])}${usedDates[usedDates.length - 1] !== usedDates[0] ? ` tot ${formatDateNl(usedDates[usedDates.length - 1])}` : ""}; met ± is een richtprijs. Acties en verzendkosten kunnen het verschil maken.`
              : `Richtprijzen (${priceDate}). Kies bij een drank een fles voor de echte winkelprijs.`}
          </div>
        </div>
      )}
      {(shoppingList.length > 0 || bought.length > 0) && (
        <p style={{ fontSize: 12, color: MUTED, textAlign: "center", margin: "12px 0 0" }}>Afvinken = gekocht · het gaat dan vanzelf naar je voorraad · veeg naar links om te verwijderen</p>
      )}

      {toast && createPortal((
        <div role="status" className="success-pop" style={{
          position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom) + 92px)", zIndex: 40, maxWidth: 520, margin: "0 auto",
          display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 16px", borderRadius: 14, background: "#1F2A26", color: "#F3ECDD",
          boxShadow: "0 10px 26px rgba(0,0,0,0.3)", fontFamily: sans,
        }}>
          <Check size={16} color="#9CC28E" strokeWidth={3} />
          <span style={{ flex: 1, fontSize: 14 }}>{toast.text}</span>
          <button onClick={() => undo(toast.key)} style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "none", background: "rgba(243,236,221,0.12)", color: "#F1D9A6", fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Ongedaan maken</button>
        </div>
      ), document.body)}

      {confirmClear && (
        <ConfirmDialog title="Lijst leegmaken?" message="Alle items verdwijnen van je boodschappenlijst." confirmLabel="Leegmaken"
          onCancel={() => setConfirmClear(false)} onConfirm={() => { setConfirmClear(false); onSound("remove"); onClear(); setBought([]); }} />
      )}

      {sheetRow && (
        <FlesKiezenSheet item={sheetRow.item} meta={sheetRow.meta} options={sheetRow.options} chosenId={chosenBottles[sheetRow.meta?.id]}
          recipeNames={sheetRow.item.recipes || []} onChoose={(id) => onChooseBottle?.(sheetRow.meta.id, id)} onClose={() => setSheetKey(null)} />
      )}
    </div>
  );
}

function VerhaalTab({ recipes, ingredientLabel, allIngredients, isOwned, recentRecipeIds, onViewRecipe, favoriteRecipeIds, onToggleFavorite, onSound,
  openRecipeId, onOpenRecipeHandled, onAddToShoppingList, onAddToFeest, feestChosen, onOpenCheckin,
  backLabel = "Ontdekken", onBackToOrigin = null, onRecipeOpenChange, rootTapTick = 0 }) {
  const [selectedId, setSelectedId] = useState(null);
  // Scrollpositie van de lijst vlak vóór een recept openging, zodat "terug"
  // je weer precies daar neerzet i.p.v. halverwege of bovenaan.
  const listScrollRef = useRef(0);
  const [openTech, setOpenTech] = useState(null);
  const [servings, setServings] = useState(1);
  // Welke recepten deze sessie al naar winkelmandje/feestplanner zijn
  // gestuurd: de bevestiging blijft dan staan i.p.v. na 1,8 s terug te
  // springen naar de knop (wat leek alsof het niet gelukt was).
  const [addedShoppingIds, setAddedShoppingIds] = useState(() => new Set());
  const [addedFeestIds, setAddedFeestIds] = useState(() => new Set());
  // Onthoudt welke recepten deze sessie al eens hun intro-animatie hebben
  // gehad — anders speelt de inschuif-animatie élke keer opnieuw af zodra je
  // hetzelfde recept nogmaals opent (bijv. via Winkelmandje of Feestplanner),
  // terwijl het alleen de allereerste keer een "nieuw scherm"-gevoel moet geven.
  const animatedRecipeIdsRef = useRef(new Set());
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
    if (!selectedId) listScrollRef.current = window.scrollY;
    // Een recept begint altijd bovenaan (net als een nieuw scherm op iOS),
    // niet op de scrollpositie van de lijst waar je op tikte.
    requestAnimationFrame(() => window.scrollTo(0, 0));
    setSelectedId(id);
    setOpenTech(null);
    onViewRecipe(id);
  };
  const verrasMe = () => {
    if (recipes.length === 0) return;
    onSound("shuffle");
    selectRecipe(recipes[Math.floor(Math.random() * recipes.length)].id);
  };

  const goBack = () => {
    const y = listScrollRef.current;
    setSelectedId(null);
    if (onBackToOrigin) {
      // Terug naar het scherm waar je het recept opende (Home, Feestplanner…).
      // Eerst de lijstpositie herstellen: navigateTo onthoudt de huidige
      // scrollY als die van Ontdekken, anders zou dat de receptpositie zijn.
      window.scrollTo(0, y);
      onBackToOrigin();
    } else {
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  };
  useEffect(() => { onRecipeOpenChange?.(!!selectedId); }, [!!selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Op de al actieve Ontdekken-tab tikken = terug naar het overzicht (iOS).
  useEffect(() => { if (rootTapTick) setSelectedId(null); }, [rootTapTick]);

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
    setAddedShoppingIds(prev => new Set(prev).add(recipe.id));
  };
  const addToFeestplanner = () => {
    if (!recipe) return;
    onAddToFeest(recipe.id);
    onSound("chime");
    setAddedFeestIds(prev => new Set(prev).add(recipe.id));
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

  // Raster "Alle recepten": gewoon de volledige lijst, geen filterchips meer
  // (op verzoek weggehaald — vond de gebruiker overbodig naast Aanbevolen/
  // Cocktail van de week/Favorieten/Onlangs bekeken/Verras me hierboven).
  const browseAll = recipe ? [] : recipes;

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
      {/* Geen van beide is nog sticky (op verzoek) — scrollen gewoon mee weg
          met de rest van de inhoud i.p.v. te blijven plakken. */}
      {!recipe ? (
        <div style={{
          padding: "6px 0", marginBottom: 16, marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
        }}>
          <SectionLabel>Kies een cocktail</SectionLabel>
          <div style={{ marginTop: 8 }}>
            <RecipePicker recipes={recipes} value={selectedId} listId="verhaal-recipe" onChange={selectRecipe} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
      ) : null}
      {/* De navigatiebalk van een geopend recept staat nu bínnen het
          veeggebied hieronder (sticky, terug naar het scherm van herkomst);
          de favoriet-knop zit al rechtsboven in de receptfoto. */}

      {!recipe && (
        <div>
          {featured && (() => {
            const photo = localItemImageUrl("cocktail", featured.recipe.id) || featured.recipe.image;
            return (
              <button onClick={() => selectRecipe(featured.recipe.id)} style={{
                width: "100%", textAlign: "left", border: "none", cursor: "pointer", borderRadius: RADIUS + 4,
                padding: "20px 22px", marginBottom: 24, position: "relative", overflow: "hidden", boxSizing: "border-box",
                minHeight: photo ? 220 : undefined, display: "flex", flexDirection: "column", justifyContent: "flex-end",
                background: BOTTLE_DARK, boxShadow: SHADOW_HERO, color: CREAM, fontFamily: sans,
              }}>
                {photo && (
                  <>
                    <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(19,38,34,0.92), rgba(19,38,34,0.3) 55%, rgba(19,38,34,0.1))" }} />
                  </>
                )}
                <div style={{ position: "relative" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 100, padding: "4px 12px", fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
                    {featured.badge}
                  </div>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, marginBottom: 4 }}>{featured.recipe.name}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 10 }}>{featured.recipe.family} · {featured.recipe.glass}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.92, maxWidth: 420 }}>{featured.reason}</div>
                </div>
              </button>
            );
          })()}

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
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 13, color: INK, textAlign: "center" }}>{r.name}</div>
                  </button>
                ))}
              </div>
            </div>
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

          <button onClick={verrasMe} style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: "none", cursor: "pointer",
            borderRadius: 16, padding: "16px 18px", marginBottom: 24, background: BOTTLE_DARK,
            color: CREAM, boxShadow: SHADOW_CARD, fontFamily: sans, boxSizing: "border-box",
          }}>
            <Shuffle size={22} />
            <div><div style={{ fontSize: 14.5, fontWeight: 800 }}>Verras me</div><div style={{ fontSize: 11.5, opacity: 0.82 }}>Ontdek een willekeurige cocktail</div></div>
          </button>

          {/* Volledig raster met foto, geen filterchips meer (op verzoek
              weggehaald als overbodig naast de persoonlijke lijstjes
              hierboven) — gewoon alle recepten, in rijen van 2. */}
          <div>
            <SectionLabel>Alle recepten</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {browseAll.map(r => {
                const photo = localItemImageUrl("cocktail", r.id) || r.image;
                return (
                  <button key={r.id} onClick={() => selectRecipe(r.id)} style={{
                    position: "relative", height: 132, borderRadius: RADIUS + 4, overflow: "hidden", border: "none",
                    cursor: "pointer", padding: 0, boxShadow: SHADOW_CARD, background: BOTTLE_DARK,
                  }}>
                    {photo && <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(19,38,34,0.9), rgba(19,38,34,0.1) 60%)" }} />
                    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "10px 12px", textAlign: "left" }}>
                      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 14, color: CREAM, lineHeight: 1.2 }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: "#D9CBAE", marginTop: 2 }}>{r.family}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {recipe && (
        <EdgeSwipeBackArea key={recipe.id} onBack={goBack}>
          {/* Eigen iOS-navigatiebalk, net als de Bar-schermen: terug naar waar
              je vandaan kwam, met de naam van het recept in het midden. */}
          <div className="glass-light" style={{
            position: "sticky", top: STICKY_TOP, zIndex: 20,
            marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20,
            display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center",
            minHeight: 44, marginBottom: 16, border: "none", borderBottom: `1px solid ${BORDER}`, boxShadow: "none", background: "rgba(243,236,221,0.92)",
          }}>
            <button onClick={goBack} onTouchStart={(e) => e.stopPropagation()} style={{
              justifySelf: "start", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
              cursor: "pointer", padding: "10px 8px 10px 0", margin: 0, color: BRASS, fontFamily: sans, fontSize: 13.5, fontWeight: 700,
            }}>
              <ChevronLeft size={18} strokeWidth={2.4} /> {backLabel}
            </button>
            <div style={{
              justifySelf: "center", fontFamily: systemFont, fontWeight: 600, fontSize: 17, color: INK, whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis", maxWidth: "46vw",
            }}>
              {recipe.name}
            </div>
            <div aria-hidden />
          </div>
          {/* Apart element van EdgeSwipeBackArea's eigen contentRef (die de
              rand-swipe-terug-physics imperatief op translateX zet) zodat de
              mount-animatie hier niet met die transform kan botsen. De klasse
              gaat er zelf na de animatie weer af — deze node bestaat toch
              maar zo lang dit recept open staat (volledige unmount bij
              teruggaan), maar hetzelfde principe als .push-slide-in verderop:
              een blijvende transform:translateX(0) zou een containing block
              vormen voor eventuele position:fixed-kinderen. Speelt bewust
              maar één keer per recept: de tweede/derde keer dat je hetzelfde
              recept opent (bijv. vanuit Winkelmandje of Feestplanner) voelt
              een steeds herhaalde "nieuw scherm"-animatie overbodig aan. */}
          <div ref={el => {
            if (el && !animatedRecipeIdsRef.current.has(recipe.id)) {
              animatedRecipeIdsRef.current.add(recipe.id);
              el.classList.add("push-slide-in");
              setTimeout(() => el.classList.remove("push-slide-in"), 340);
            }
          }}>
          {(() => { const heroPhoto = localItemImageUrl("cocktail", recipe.id) || recipe.image; return (
          <div style={{
            borderRadius: RADIUS + 4, padding: heroPhoto ? "0" : "26px 26px", marginBottom: 24, position: "relative", overflow: "hidden",
            background: heroPhoto ? INK : BOTTLE_DARK, boxShadow: SHADOW_HERO,
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
            <button onClick={() => { onSound("pop"); onToggleFavorite(recipe.id); }} aria-label={favoriteRecipeIds.includes(recipe.id) ? "Verwijder uit favorieten" : "Bewaar als favoriet"}
              className={favoriteRecipeIds.includes(recipe.id) ? "" : "glass-chip"} style={{
              position: "absolute", top: 16, right: 16, zIndex: 2, width: 36, height: 36, borderRadius: "50%", padding: 0,
              border: favoriteRecipeIds.includes(recipe.id) ? "1px solid rgba(255,255,255,0.35)" : undefined,
              background: favoriteRecipeIds.includes(recipe.id) ? BURGUNDY : undefined,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: CREAM,
            }}>
              <Heart size={16} fill={favoriteRecipeIds.includes(recipe.id) ? CREAM : "none"} />
            </button>
            <div style={{ flex: "1 1 260px", position: "relative", zIndex: 1, padding: heroPhoto ? "26px" : 0 }}>
              <div className="hero-text-in" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 8, animationDelay: "0.1s" }}>{roleInfo.label}</div>
              <h2 className="hero-text-in" style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, color: CREAM, margin: "0 0 6px", animationDelay: "0.18s" }}>{recipe.name}</h2>
              <div className="hero-text-in" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 16, animationDelay: "0.26s" }}>{recipe.family} · {recipe.glass}</div>
              <p className="hero-text-in" style={{ fontFamily: systemFont, fontSize: 15.5, color: CREAM, margin: 0, lineHeight: 1.5, animationDelay: "0.36s" }}>"{getSfeerQuote(recipe, role)}"</p>
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
            <p style={{ fontFamily: systemFont, fontSize: 15.5, color: INK, lineHeight: 1.75, margin: 0, maxWidth: 640 }}>{story}</p>
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
                <div style={{ width: 20, textAlign: "center", fontWeight: 700, fontSize: 14.5, fontFamily: systemFont, color: BOTTLE }}>{servings}</div>
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
                  <span style={{ fontWeight: 700, color: BOTTLE, fontFamily: systemFont }}>{ing.top && servings === 1 ? "top op" : `${formatDutchNumber(scaled)} ${unitLabel(ing.unit, scaled)}`}</span>
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
            {(missing.length > 0 || addedShoppingIds.has(recipe.id)) && (
              addedShoppingIds.has(recipe.id) ? (
                <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, padding: "9px 2px" }}>
                  <Check size={14} strokeWidth={3} /> Toegevoegd aan winkelmandje
                </span>
              ) : (
                <button onClick={addMissingToShopping} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 3, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <ShoppingCart size={14} /> {missing.length} ontbrekende toevoegen
                </button>
              )
            )}
            {(addedFeestIds.has(recipe.id) || feestChosen?.includes(recipe.id)) ? (
              <span className={addedFeestIds.has(recipe.id) ? "success-pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 6, color: SAGE, fontSize: 12.5, fontWeight: 700, padding: "9px 2px" }}>
                <Check size={14} strokeWidth={3} /> {addedFeestIds.has(recipe.id) ? "Toegevoegd aan feestplanner" : "In feestplanner"}
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
            {batchOpener.current && (
              <button onClick={() => batchOpener.current(recipe.id)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BRASS}`, color: BRASS,
                borderRadius: 100, padding: "9px 14px", minHeight: 40, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: sans,
              }}>
                <Scale size={14} /> Maak een batch
              </button>
            )}
          </div>

          {/* Alleen "Stap voor stap" (op verzoek): de weergave "Volledig recept"
              herhaalde dezelfde tekst in één blok en voegde niets toe. */}
          <div style={{ fontFamily: systemFont, fontSize: 20, fontWeight: 700, color: INK, marginBottom: 14 }}>Stap voor stap</div>
            <div>
              {steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 14, paddingBottom: i < steps.length - 1 || recipe.garnish ? 20 : 0 }}>
                  <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: PAPER,
                      color: BOTTLE, fontFamily: systemFont, fontWeight: 700, fontSize: 12,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{i + 1}</div>
                    {(i < steps.length - 1 || recipe.garnish) && <div style={{ flex: 1, width: 1, background: BORDER, marginTop: 4 }} />}
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, marginBottom: 3 }}>Stap {i + 1} van {steps.length}</div>
                    <p style={{ fontFamily: systemFont, fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>{highlightIngredientMentions(scaleStepText(step, servings), recipe, allIngredients)}</p>
                  </div>
                </div>
              ))}
              {recipe.garnish && (
                <div style={{ display: "flex", gap: 14 }}>
                  <div style={{ flex: "0 0 auto" }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${BRASS}`, background: BRASS,
                      color: CREAM, fontFamily: systemFont, fontWeight: 700, fontSize: 12,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>✓</div>
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: BRASS, marginBottom: 3 }}>Afwerking</div>
                    <p style={{ fontFamily: systemFont, fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>{highlightIngredientMentions(scaleStepText(recipe.garnish, servings), recipe, allIngredients)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </EdgeSwipeBackArea>
      )}
    </div>
  );
}

function LessonBlock({ block }) {
  if (block.type === "h3") return <h3 style={{ fontFamily: systemFont, fontSize: 16.5, color: BOTTLE, margin: "20px 0 8px" }}>{block.text}</h3>;
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

// Slagen = minstens 80% goed (4 van 5 per les, 24 van 30 bij de eindtoets).
const QUIZ_PASS_RATIO = 0.8;
function shuffledIndexes(n) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

// Eén vraag per scherm: kies, zie meteen of het klopt en waarom, door naar
// de volgende. Aan het eind de score, met opnieuw proberen.
function QuizBlock({ quiz, onFinish }) {
  const [attempt, setAttempt] = useState(0);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  // Antwoordvolgorde per poging opnieuw gehusseld: de plek van het goede
  // antwoord verraadt niets, ook niet bij een tweede poging.
  const orders = useMemo(() => quiz.map(q => shuffledIndexes(q.options.length)), [quiz, attempt]);
  const topRef = useRef(null);

  const score = quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
  const passed = score / quiz.length >= QUIZ_PASS_RATIO;
  const q = quiz[idx];
  const picked = answers[idx];
  const answered = picked !== undefined;
  const isLast = idx === quiz.length - 1;

  const next = () => {
    if (isLast) { setDone(true); onFinish(score); }
    else setIdx(i => i + 1);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const retry = () => { setAnswers({}); setIdx(0); setDone(false); setAttempt(n => n + 1); };

  if (done) {
    return (
      <div ref={topRef} className="success-pop" style={{ marginTop: 8, fontFamily: sans, padding: 18, borderRadius: 16, background: CREAM, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${passed ? SAGE : BURGUNDY}` }}>
        <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: passed ? SAGE : BURGUNDY }}>{score} van {quiz.length} goed</div>
        <p style={{ fontSize: 14, color: INK, margin: "6px 0 14px", lineHeight: 1.5 }}>
          {passed ? "Geslaagd. Deze les telt mee voor je rang." : `Je hebt er ${Math.ceil(quiz.length * QUIZ_PASS_RATIO)} goed nodig. Lees de les nog eens door en probeer het opnieuw.`}
        </p>
        <button onClick={retry} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BORDER}`, color: INK, borderRadius: 100, minHeight: 40, padding: "0 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>
          <RotateCcw size={14} /> Opnieuw
        </button>
      </div>
    );
  }

  return (
    <div ref={topRef} style={{ marginTop: 8, scrollMarginTop: 80, fontFamily: sans }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "#8F6A21" }}>In de praktijk</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>Vraag {idx + 1} van {quiz.length}</span>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {quiz.map((_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < idx || (i === idx && answered) ? BRASS : BORDER }} />)}
      </div>
      <p style={{ fontFamily: serif, fontWeight: 700, fontSize: 20, lineHeight: 1.3, color: INK, margin: "0 0 16px" }}>{q.q}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {orders[idx].map((oi, n) => {
          const isSelected = picked === oi;
          const isCorrect = oi === q.correct;
          const showRight = answered && isCorrect;
          const showWrong = answered && isSelected && !isCorrect;
          return (
            <button key={`${attempt}-${idx}-${oi}`} disabled={answered} onClick={() => setAnswers(prev => ({ ...prev, [idx]: oi }))} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 54, textAlign: "left", padding: "10px 14px", boxSizing: "border-box",
              borderRadius: 14, cursor: answered ? "default" : "pointer", fontSize: 14.5, lineHeight: 1.4, fontFamily: sans, color: INK,
              background: showRight ? "rgba(92,122,82,0.14)" : showWrong ? "rgba(122,46,42,0.08)" : CREAM,
              border: showRight ? `1.5px solid ${SAGE}` : showWrong ? `1.5px solid ${BURGUNDY}` : `1px solid ${BORDER}`,
              opacity: answered && !showRight && !showWrong ? 0.65 : 1,
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12.5, fontWeight: 700, fontFamily: systemFont,
                background: showRight ? SAGE : showWrong ? BURGUNDY : "transparent", color: showRight || showWrong ? CREAM : MUTED,
                border: showRight || showWrong ? "none" : `1.5px solid ${BORDER}`,
              }}>{showRight ? <Check size={14} strokeWidth={3} /> : showWrong ? <X size={14} strokeWidth={3} /> : "ABCD"[n]}</span>
              <span style={{ flex: 1 }}>{q.options[oi]}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="accordion-reveal" style={{ marginTop: 14, padding: "13px 15px", borderRadius: 14, background: CREAM, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${picked === q.correct ? SAGE : BURGUNDY}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: picked === q.correct ? SAGE : BURGUNDY, marginBottom: 3 }}>{picked === q.correct ? "Goed" : "Niet helemaal"}</div>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: INK }}>{q.explain}</p>
        </div>
      )}
      <button onClick={next} disabled={!answered} style={{
        width: "100%", minHeight: 50, marginTop: 16, borderRadius: 14, border: "none", fontFamily: sans, fontSize: 15.5, fontWeight: 700,
        background: answered ? BOTTLE_DARK : BORDER, color: answered ? CREAM : MUTED, cursor: answered ? "pointer" : "default",
      }}>{isLast ? "Bekijk je score" : "Volgende vraag"}</button>
    </div>
  );
}

// Eigen illustratie per les in de app-stijl (goud op donkergroen, zelfde
// beeldtaal als het app-icoon) i.p.v. externe Unsplash-foto's: volledig
// lokaal, werkt offline en geen licentievragen. Eén icoon per lesonderwerp.
const LESSON_ICONS = {
  geschiedenis: Landmark, uitrusting: Wrench, glaswerk: Wine, ijs: Snowflake,
  gedistilleerd: FlaskRound, "likeuren-bitters": Droplets, vers: Citrus, garnering: Cherry,
  basistechnieken: Martini, "verdunning-temperatuur": Thermometer, "sour-formule": Scale, finesse: Layers,
  families: Scale, smaakcombinatie: FlaskRound, ontwerpen: PenTool, menu: ClipboardList,
  "mise-en-place": ListChecks, "batchen-groepen": Users, gastvrijheid: HeartHandshake, signature: Award,
  infusies: Leaf, "fat-washing": Droplet, clarificatie: Sparkles, "carbonatie-rook": CloudFog,
};
const LESSON_ART_BG = `radial-gradient(ellipse 140% 120% at 25% 10%, #2A4B42, ${BOTTLE_DARK} 75%)`;

function LessonArt({ lesson, variant = "thumb" }) {
  const Icon = LESSON_ICONS[lesson.id] || GraduationCap;
  if (variant === "thumb") {
    return (
      <div aria-hidden style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: LESSON_ART_BG, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color="#DDB877" strokeWidth={1.8} />
      </div>
    );
  }
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, background: LESSON_ART_BG, overflow: "hidden" }}>
      {/* Groot, vaag icoon rechts als achtergrondtextuur. */}
      <Icon size={190} color="#B8862E" strokeWidth={1} style={{ position: "absolute", right: -30, top: -18, opacity: 0.13 }} />
      <div style={{ position: "absolute", left: 18, top: 18, width: 64, height: 64, borderRadius: "50%", border: "1.5px solid rgba(184,134,46,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={30} color="#DDB877" strokeWidth={1.7} />
      </div>
    </div>
  );
}

// Les in de praktijkopbouw: waarom, de kern, wat je proeft, zo doe je het,
// een veelgemaakte fout en iets om zelf te maken (met recept en check-in).
const PRACTICE_TONES = { rood: BURGUNDY, bruin: "#8A6A4A", groen: "#4F6B46" };
function PracticeLessonBody({ lesson, recipes, allIngredients, onOpenRecipe, onCheckin }) {
  const label = (text, color = "#8F6A21") => (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color, marginBottom: 8, fontFamily: sans }}>{text}</div>
  );
  const recipe = lesson.tryIt?.recipeId ? (recipes || []).find(r => r.id === lesson.tryIt.recipeId) : null;
  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
        {lessonMinutes(lesson)} min lezen
      </div>
      <h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: INK, margin: "6px 0 20px" }}>{lesson.title}</h2>

      {label("Waarom dit ertoe doet")}
      <p style={{ fontSize: 16, lineHeight: 1.6, color: INK, margin: "0 0 24px" }}>{lesson.intro}</p>

      {label("De kern")}
      {lesson.core.map((t, i) => <p key={i} style={{ fontSize: 15.5, lineHeight: 1.65, color: INK, margin: i === lesson.core.length - 1 ? "0 0 24px" : "0 0 10px" }}>{t}</p>)}

      {lesson.taste && (
        <>
          {label(lesson.taste.title)}
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "0 14px", marginBottom: 24 }}>
            {lesson.taste.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "12px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ flexShrink: 0, width: 78, fontSize: 13.5, fontWeight: 700, color: PRACTICE_TONES[r.tone] || INK }}>{r.label}</span>
                <span style={{ fontSize: 14.5, lineHeight: 1.45, color: INK }}>{r.text}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {label("Zo doe je het")}
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
        {lesson.steps.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: BOTTLE, color: CREAM, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: systemFont }}>{i + 1}</span>
            <span style={{ fontSize: 15, lineHeight: 1.55, paddingTop: 2, color: INK }}>{t}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 16px", borderRadius: 14, background: PAPER_DEEP, marginBottom: 24 }}>
        {label("Veelgemaakte fout", BURGUNDY)}
        <p style={{ fontSize: 14.5, lineHeight: 1.55, margin: 0, color: INK }}>{lesson.mistake}</p>
      </div>

      {lesson.tryIt && (
        <>
          {label("Probeer het zelf")}
          <div style={{ background: BOTTLE_DARK, color: CREAM, borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <p style={{ fontSize: 15, lineHeight: 1.55, margin: recipe ? "0 0 14px" : 0 }}>{lesson.tryIt.text}</p>
            {recipe && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.06)", marginBottom: onCheckin ? 12 : 0 }}>
                <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={44} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 16, fontWeight: 700 }}>{recipe.name}</span>
                {onOpenRecipe && (
                  <button onClick={() => onOpenRecipe(recipe.id)} style={{ minHeight: 44, padding: "0 6px", background: "none", border: "none", color: "#DDB877", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>Recept</button>
                )}
              </div>
            )}
            {recipe && onCheckin && (
              <button onClick={() => onCheckin(recipe.name)} className="press-scale" style={{ width: "100%", minHeight: 48, borderRadius: 12, border: "none", background: BRASS, color: BOTTLE_DARK, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>
                Gemaakt: check in
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LessonView({ lesson, progress, onBack, onComplete, nextLesson, onGoToLesson, onGoToExam, recipes, allIngredients, onOpenRecipe, onCheckin }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  // Binnen Bar → Cursus neemt de les de bovenste navigatiebalk over
  // ("‹ Cursus · Les 3") i.p.v. een tweede terugknop eronder; in gastmodus
  // (geen balk) blijft de losse terugknop staan.
  const setNavOverride = useContext(NavOverrideContext);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!setNavOverride) return;
    setNavOverride({ label: "Cursus", title: `Les ${lesson.number}`, onBack: () => onBackRef.current() });
    return () => setNavOverride(null);
  }, [setNavOverride, lesson.number]);

  return (
    <EdgeSwipeBackArea onBack={onBack}>
      {!setNavOverride && (
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, fontFamily: sans }}>
          <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} /> Terug naar overzicht
        </button>
      )}

      <div style={{ position: "relative", height: 150, borderRadius: RADIUS + 6, overflow: "hidden", marginBottom: 20, boxShadow: SHADOW_HERO, border: `1px solid ${BORDER}`, borderBottom: `3px solid ${BRASS}` }}>
        <LessonArt lesson={lesson} variant="hero" />
        <div style={{ position: "absolute", left: 18, bottom: 14, fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#D9CBAE" }}>
          Les {lesson.number} &middot; {COURSE_PARTS.find(p => p.id === lesson.part)?.title}
        </div>
      </div>
      {lesson.format === "praktijk" ? (
        <PracticeLessonBody lesson={lesson} recipes={recipes} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} onCheckin={onCheckin} />
      ) : (
        <>
          <h2 style={{ fontFamily: systemFont, fontSize: 27, fontWeight: 700, color: INK, margin: "0 0 14px" }}>{lesson.title}</h2>
          <p style={{ fontStyle: "italic", color: MUTED, fontSize: 14, borderLeft: `3px solid ${BRASS}`, paddingLeft: 14, margin: "0 0 22px", lineHeight: 1.55 }}>{lesson.intro}</p>

          {lesson.blocks.map((b, i) => <LessonBlock key={i} block={b} />)}

          <div style={{ marginTop: 24, marginBottom: 24, background: BOTTLE, color: CREAM, borderRadius: RADIUS, padding: "16px 18px", boxShadow: SHADOW_CARD }}>
            <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#D8CFA0", marginBottom: 8 }}>Kernpunten van deze les</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {lesson.takeaways.map((t, i) => <li key={i} style={{ fontSize: 13.5, marginBottom: 5, lineHeight: 1.5 }}>{t}</li>)}
            </ul>
          </div>
        </>
      )}

      {!showQuiz ? (
        <button onClick={() => setShowQuiz(true)} className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 8,
          background: BOTTLE_DARK, color: CREAM, border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: sans,
        }}>
          Naar de vragen <ChevronRight size={17} />
        </button>
      ) : (
        <QuizBlock quiz={lesson.quiz} onFinish={(score) => { onComplete(score, lesson.quiz.length); setQuizDone(score / lesson.quiz.length >= QUIZ_PASS_RATIO); }} />
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
      <h2 style={{ fontFamily: systemFont, fontSize: 27, fontWeight: 700, color: INK, margin: "0 0 14px" }}>Van Basis tot Pro</h2>
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

// Leestijd van een les, op ~200 woorden per minuut.
function lessonMinutes(lesson) {
  const text = [lesson.intro, ...(lesson.blocks || []).map(b => [b.text, b.label, ...(b.rows || []).flat()].filter(Boolean).join(" ")), ...(lesson.takeaways || [])].join(" ");
  return Math.max(2, Math.round(text.split(/\s+/).length / 200));
}

function CursusTab({ progress, setProgress, onSound, recipes, allIngredients, onOpenRecipe, onCheckin }) {
  const [selectedId, setSelectedId] = useState(null);
  const [examOpen, setExamOpen] = useState(false);
  // Een les of toets openen begint bovenaan, niet halverwege de lessenlijst.
  useEffect(() => { window.scrollTo(0, 0); }, [selectedId, examOpen]);
  const [activeBadgeId, setActiveBadgeId] = useState(null);
  const [expandedParts, setExpandedParts] = useState({});
  const lesson = COURSE_LESSONS.find(l => l.id === selectedId) || null;
  const rank = useMemo(() => computeCourseRank(progress), [progress]);
  // Een les openen = gestart (rang Leerling), ook als de toets nog niet af is.
  const openLesson = (id) => {
    if (!progress._gestart) setProgress({ ...progress, _gestart: true });
    setSelectedId(id);
  };
  const totalLessons = COURSE_LESSONS.length;
  const completedCount = COURSE_LESSONS.filter(l => progress[l.id]?.completed).length;
  const allLessonsDone = completedCount === totalLessons;
  const examProgress = progress.eindtoets;
  const courseInsights = useMemo(() => computeCourseInsights(progress), [progress]);
  const unlockedParts = useMemo(() => computeUnlockedParts(progress), [progress]);
  const isLessonOpen = (l) => !!l && (unlockedParts.has(l.part) || !!progress[l.id]?.completed);
  // Moment van uitspelen (alle lessen + eindtoets gehaald): één keer vieren.
  const mastery = computeCourseMastery(progress);
  const prevMasteredRef = useRef(!!mastery);
  const [showDiplomaCelebration, setShowDiplomaCelebration] = useState(false);
  useEffect(() => {
    if (mastery && !prevMasteredRef.current) { setShowDiplomaCelebration(true); setTimeout(() => onSound("levelup"), 300); }
    prevMasteredRef.current = !!mastery;
  }, [!!mastery]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const passedNow = score / total >= QUIZ_PASS_RATIO;
    // Voltooid = ooit geslaagd; een mislukte poging telt niet meer als "af".
    setProgress({ ...progress, [lessonId]: { completed: !!prev?.completed || passedNow, bestScore: Math.max(score, prev?.bestScore ?? 0), total } });
    if (passedNow) onSound("chime");
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 3000);
  };

  // Nieuwe rang (Barback t/m Bartender): één keer vieren. Meester heeft
  // het diploma-moment hieronder.
  const prevRankRef = useRef(rank.index);
  const [rankCelebration, setRankCelebration] = useState(null);
  useEffect(() => {
    if (rank.index > prevRankRef.current && rank.index >= 1 && !rank.master) {
      setRankCelebration(rank.rank);
      setTimeout(() => onSound("levelup"), 300);
    }
    prevRankRef.current = rank.index;
  }, [rank.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const diplomaCelebration = (<>
    {rankCelebration && (
      <ConfirmDialog title={`Je bent nu ${rankCelebration.name}`}
        message={`${rankCelebration.rule}. Je ring op je profiel is voller geworden, en je vrienden zien je nieuwe rang in hun feed.`}
        confirmLabel="Proost" confirmColor={BOTTLE} cancelLabel="Sluiten"
        onCancel={() => setRankCelebration(null)} onConfirm={() => setRankCelebration(null)} />
    )}
    {showDiplomaCelebration && (
    <ConfirmDialog title="Gefeliciteerd, je bent Meester"
      message={`Je hebt alle ${totalLessons} lessen en de eindtoets gehaald. Je ring is nu massief goud, je diploma staat op je profiel en je vrienden zien het in hun feed.`}
      confirmLabel="Proost" confirmColor={BOTTLE} cancelLabel="Sluiten"
      onCancel={() => setShowDiplomaCelebration(false)} onConfirm={() => setShowDiplomaCelebration(false)} />
    )}
  </>);

  if (examOpen) {
    return (<>
      {diplomaCelebration}
      <FinalExamView progress={examProgress} onBack={() => setExamOpen(false)}
        onComplete={(score, total) => complete("eindtoets", score, total)} />
    </>);
  }

  if (lesson) {
    const lessonIndex = COURSE_LESSONS.findIndex(l => l.id === lesson.id);
    // "Volgende les" alleen als die al open is (volgend deel pas na afronden).
    const nextCandidate = COURSE_LESSONS[lessonIndex + 1] || null;
    const nextLesson = isLessonOpen(nextCandidate) ? nextCandidate : null;
    return (
      <LessonView key={lesson.id} lesson={lesson} progress={progress[lesson.id]}
        recipes={recipes} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} onCheckin={onCheckin}
        onBack={() => setSelectedId(null)}
        onComplete={(score, total) => complete(lesson.id, score, total)}
        nextLesson={nextLesson}
        onGoToLesson={(id) => { if (isLessonOpen(COURSE_LESSONS.find(l => l.id === id))) openLesson(id); }}
        onGoToExam={() => { if (!allLessonsDone) return; setSelectedId(null); setExamOpen(true); }} />
    );
  }

  const nextUp = COURSE_LESSONS.find(l => !progress[l.id]?.completed && isLessonOpen(l)) || null;
  const currentPartId = nextUp?.part || null;
  const isPartExpanded = (id) => (expandedParts[id] ?? id === currentPartId);
  const activeBadge = courseInsights.badges.find(b => b.id === activeBadgeId) || null;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 14, borderRadius: RADIUS + 4, padding: 16,
        background: `radial-gradient(ellipse 500px 220px at 15% -20%, #2A4B42, ${BOTTLE_DARK} 75%)`, boxShadow: SHADOW_HERO, color: CREAM,
      }}>
        <CourseRing size={72} partsDone={rank.partsDone} master={rank.master} dark seal={false}>
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#2A4B42", display: "flex", alignItems: "center", justifyContent: "center", color: "#F1D9A6" }}>
            {rank.master ? <GraduationCap size={24} strokeWidth={1.8} /> : <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16 }}>{rank.partsDone}/{COURSE_PART_COUNT}</span>}
          </div>
        </CourseRing>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#DDB877" }}>Jouw rang</div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, marginTop: 2 }}>{rank.rank ? rank.rank.name : "Nog geen rang"}</div>
          <div style={{ fontSize: 12.5, color: "#C9D2CB", marginTop: 3, lineHeight: 1.35 }}>
            {rank.index < 0 ? "Start je eerste les en word Leerling" : courseRankHint(rank)}
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden", marginTop: 9 }}>
            <div style={{ width: `${courseInsights.level.progress * 100}%`, height: "100%", background: BRASS, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ fontSize: 11.5, color: "#C9D2CB", marginTop: 4 }}><AnimatedNumber value={courseInsights.xp} /> XP</div>
        </div>
      </div>

      {nextUp && (
        <button onClick={() => openLesson(nextUp.id)} className="press-scale" style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, padding: 14, marginBottom: 18, boxSizing: "border-box", textAlign: "left",
          background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: SHADOW_CARD, cursor: "pointer", fontFamily: sans, color: INK,
        }}>
          <LessonArt lesson={nextUp} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>
              {completedCount === 0 ? "Eerste les" : "Volgende les"} · {lessonMinutes(nextUp)} min
            </span>
            <span style={{ display: "block", fontFamily: systemFont, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{nextUp.title}</span>
          </span>
          <ChevronRight size={18} color={MUTED} style={{ flexShrink: 0 }} />
        </button>
      )}

      <div style={{ marginBottom: 22 }}>
        <SectionLabel>Badges</SectionLabel>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {courseInsights.badges.map(b => {
            const Icon = b.icon;
            const selected = activeBadgeId === b.id;
            return (
              <button key={b.id} onClick={() => setActiveBadgeId(selected ? null : b.id)} aria-pressed={selected} style={{
                border: "none", background: "none", padding: 0, margin: 0, cursor: "pointer", width: 78, flexShrink: 0,
                color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: sans,
              }}>
                <span style={{
                  width: 48, height: 48, borderRadius: "50%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                  background: b.unlocked ? BOTTLE_DARK : PAPER_DEEP, color: b.unlocked ? "#DDB877" : "#B8A98A",
                  border: b.unlocked ? `${selected ? 2.5 : 1.5}px solid ${BRASS}` : `1.5px ${selected ? "solid" : "dashed"} ${selected ? BRASS : BORDER}`,
                }}><Icon size={20} strokeWidth={1.8} /></span>
                <span style={{ fontSize: 11, textAlign: "center", lineHeight: 1.2, color: b.unlocked ? INK : MUTED, fontWeight: 600 }}>{b.label}</span>
              </button>
            );
          })}
        </div>
        {activeBadge && (
          <div className="accordion-reveal" style={{ marginTop: 10, padding: "11px 13px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{activeBadge.label}{activeBadge.unlocked ? "" : " · nog niet behaald"}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{activeBadge.text}</div>
          </div>
        )}
      </div>

      <SectionLabel>Delen</SectionLabel>
      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", marginBottom: 22 }}>
        {COURSE_PARTS.map((part, partIndex) => {
          const lessons = COURSE_LESSONS.filter(l => l.part === part.id);
          const doneInPart = lessons.filter(l => progress[l.id]?.completed).length;
          const full = doneInPart === lessons.length;
          const partOpen = unlockedParts.has(part.id);
          const prevPart = COURSE_PARTS[partIndex - 1];
          const expanded = isPartExpanded(part.id);
          return (
            <div key={part.id} style={{ borderTop: partIndex > 0 ? `1px solid ${BORDER}` : "none" }}>
              <button onClick={() => setExpandedParts(e => ({ ...e, [part.id]: !expanded }))} aria-expanded={expanded} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "8px 14px", boxSizing: "border-box",
                background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
              }}>
                <span style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: full ? BRASS : PAPER_DEEP, color: full ? CREAM : MUTED, fontSize: 13, fontWeight: 700, fontFamily: systemFont,
                }}>{full ? <Check size={15} strokeWidth={3} /> : !partOpen ? <Lock size={13} strokeWidth={2.4} /> : partIndex + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{part.title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>
                    {!partOpen && prevPart ? `Na ${prevPart.title}` : `${doneInPart} van ${lessons.length} lessen`}
                  </span>
                </span>
                <ChevronDown size={16} color={MUTED} style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }} />
              </button>
              {expanded && (
                <div className="accordion-reveal" style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {lessons.map(l => {
                    const p = progress[l.id];
                    const open = isLessonOpen(l);
                    return (
                      <button key={l.id} onClick={() => open && openLesson(l.id)} disabled={!open} aria-label={open ? undefined : `${l.title} (vergrendeld)`} style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", minHeight: 52, padding: "6px 10px", boxSizing: "border-box",
                        background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 12, cursor: open ? "pointer" : "default", opacity: open ? 1 : 0.6, fontFamily: sans, color: INK,
                      }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          background: p?.completed ? SAGE : "transparent", border: `1.5px solid ${p?.completed ? SAGE : BORDER}`,
                        }}>
                          {p?.completed ? <Check size={13} color={CREAM} strokeWidth={3} /> : !open ? <Lock size={12} color={MUTED} strokeWidth={2.4} /> : <span style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, fontFamily: systemFont }}>{l.number}</span>}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{l.title}</span>
                          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{lessonMinutes(l)} min{p ? ` · beste score ${p.bestScore}/${p.total}` : ""}</span>
                        </span>
                        {open && <ChevronRight size={15} color={MUTED} style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 10, padding: "20px 22px", borderRadius: RADIUS + 2, boxShadow: SHADOW_HERO,
        background: BOTTLE, position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 400px 200px at 100% 0%, rgba(255,255,255,0.14), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>
            {allLessonsDone ? "Alle lessen voltooid" : `${totalLessons - completedCount} les${totalLessons - completedCount === 1 ? "" : "sen"} nog te gaan`}
          </div>
          <h3 style={{ fontFamily: systemFont, fontSize: 21, fontWeight: 700, color: CREAM, margin: "0 0 8px" }}>Eindtoets: Van Basis tot Pro</h3>
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.9)", margin: "0 0 16px", lineHeight: 1.5, maxWidth: 480 }}>
            30 vragen door elkaar over alle zes delen. {examProgress?.completed ? `Beste score: ${examProgress.bestScore}/${examProgress.total}.` : allLessonsDone ? "Haal minstens 80% (24 van de 30) en je krijgt je diploma op je profiel." : "Gaat open zodra je alle zes delen hebt afgerond."}
          </p>
          <button onClick={() => allLessonsDone && setExamOpen(true)} disabled={!allLessonsDone} style={{ opacity: allLessonsDone ? 1 : 0.55, cursor: allLessonsDone ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6, background: CREAM, color: BOTTLE, border: "none", borderRadius: RADIUS, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            {allLessonsDone ? <GraduationCap size={15} /> : <Lock size={14} />} {examProgress?.completed ? "Opnieuw proberen" : "Start de eindtoets"}
          </button>
        </div>
      </div>
      {diplomaCelebration}
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
  // Nieuwe smaaktest: per ingrediënt hoeveel gasten het lekker / liever niet vinden.
  const prefs = ingredientPreferenceCounts(responses);

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
      const missingCount = isOwned ? required.filter(i => !isOwned(i)).length : null;
      const ownedCount = missingCount != null ? required.length - missingCount : null;
      const matchPct = isOwned && required.length > 0 ? Math.round((ownedCount / required.length) * 100) : null;

      const ingIds = r.ingredients.map(i => i.id);
      const likeHits = ingIds.reduce((n, id) => n + (prefs.like[id] || 0), 0);
      const dislikeHits = ingIds.reduce((n, id) => n + (prefs.dislike[id] || 0), 0);
      const prefScore = Math.min(20, (likeHits / responses.length) * 12) - Math.min(35, (dislikeHits / responses.length) * 25);
      const score = Math.round(tasteScore * 0.55 + (matchPct != null ? matchPct * 0.25 : 0) + (spiritMatch ? 15 : 0) + (mentioned ? 20 : 0) + prefScore);
      return { recipe: r, score, matchPct, ownedCount, requiredCount: required.length, mentioned, spiritMatch };
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
  rauw_ei: ["egg_white", "egg_yolk"],
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

// Menu/inkoop-berekening voor één feest — losgetrokken uit het
// detailscherm zodat de feestenlijst 'm ook kan gebruiken voor de
// voortgangsbalk ("14 te kopen" / "Alles in huis") zonder de hele
// inkooplijst-UI te dupliceren.
function computePartyMenu(party, recipes, allIngredients, isOwned, ingredientLabel, voorraadAantal) {
  const chosenRecipes = (party.cocktail_ids || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
  const guests = party.guests || 8;
  const drinksPerGuest = party.drinks_per_guest || 2;
  const totalDrinks = Math.max(1, guests) * Math.max(1, drinksPerGuest);
  const n = chosenRecipes.length || 1;
  const base = Math.floor(totalDrinks / n);
  const remainder = totalDrinks - base * n;
  const perRecipeCounts = chosenRecipes.map((_, i) => base + (i < remainder ? 1 : 0));

  const needsMap = new Map();
  chosenRecipes.forEach((r, i) => {
    const count = perRecipeCounts[i] || 0;
    r.ingredients.forEach(ing => {
      const key = ingredientKey(ing) + "|" + ing.unit;
      if (!needsMap.has(key)) {
        needsMap.set(key, { key, label: ingredientLabel(ing), unit: ing.unit, amount: 0, meta: findIngredientMeta(ing, allIngredients), owned: isOwned(ing), ref: ing, recipeNames: new Set() });
      }
      needsMap.get(key).amount += ing.amount * count;
      needsMap.get(key).recipeNames.add(r.name);
    });
  });
  const needs = [...needsMap.values()].map(v => ({ ...v, recipeNames: [...v.recipeNames] })).sort((a, b) => a.label.localeCompare(b.label));

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

  return { chosenRecipes, perRecipeCounts, totalDrinks, rows, totalCost };
}

// Voorbereidings-checklist voor één feest — zelfde afgeleide gegevens
// (glaswerk, garnering, batchbare cocktails) als voorheen inline in het
// detailscherm, nu ook bruikbaar voor de "x/y voorbereid"-samenvatting op
// de feestenkaart.
function computePartyPrepChecklist(chosenRecipes, perRecipeCounts, allIngredients, totalDrinks) {
  const glasses = new Map();
  const garnish = new Map();
  const batchAhead = [];
  chosenRecipes.forEach((r, i) => {
    const count = perRecipeCounts[i] || 0;
    glasses.set(r.glass, (glasses.get(r.glass) || 0) + count);
    r.ingredients.forEach(ing => {
      const meta = findIngredientMeta(ing, allIngredients);
      if (meta && (meta.cat === "Vers" || meta.cat === "Zuivel & room") && !meta.bottleMl) {
        garnish.set(meta.name, meta.name);
      }
    });
    const techniques = inferTechniques(r.method);
    const role = getMenuRole(r);
    if (role === "sterk" && techniques.length > 0 && techniques.every(t => ["stirred", "build"].includes(t))) {
      batchAhead.push(r.name);
    }
  });
  const kgIjs = Math.round(totalDrinks * 0.15 * 10) / 10;
  const glassList = [...glasses.entries()];
  const garnishList = [...garnish.values()];

  const items = [{ id: "boodschappen", group: "dag", label: "Boodschappen doen" }];
  if (batchAhead.length > 0) items.push({ id: "batchen", group: "dag", label: `Batchen: ${batchAhead.join(", ")}` });
  items.push({ id: "ijs", group: "2uur", label: `IJs halen (± ${kgIjs} kg)` });
  if (glassList.length > 0) items.push({ id: "glazen", group: "2uur", label: `Glazen koelen: ${glassList.map(([g, c]) => `${g} (${c}×)`).join(", ")}` });
  if (garnishList.length > 0) items.push({ id: "garnering", group: "2uur", label: `Garnering klaarzetten: ${garnishList.join(", ")}` });
  items.push({ id: "menu-delen", group: "aankomst", label: "Menu delen met gasten" });
  items.push({ id: "eerste-ronde", group: "aankomst", label: "Eerste ronde klaarzetten" });
  return items;
}

const KORTE_DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
function formatDayShort(date) {
  return `${KORTE_DAGEN[date.getDay()]} ${date.getDate()} ${KORTE_MAANDEN[date.getMonth()]}`;
}
function formatTimeShort(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// Kleine herbruikbare bevestigingsdialoog voor destructieve acties binnen de
// Feestplanner (smaaktest verwijderen, menu vervangen) — één component i.p.v.
// 'm twee keer los uit te schrijven.
// Deelt een gegenereerd bestand (menukaart-afbeelding of -PDF): in de app via
// het iOS-deelmenu (bestand eerst naar de cache), op het web via de Web Share
// API met bestanden, anders als download.
async function shareGeneratedFile({ filename, mime, base64, title }) {
  try {
    if (isNativeShell) {
      const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      await Share.share({ title, files: [uri], dialogTitle: title });
      return "shared";
    }
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], filename, { type: mime });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return "shared"; }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return "downloaded";
  } catch (e) {
    return /cancel|abort/i.test(`${e?.name} ${e?.message}`) ? "cancelled" : "failed";
  }
}
function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Keuze hoe de host het menu deelt: als link, als afbeelding voor een
// status/story, of als printbare A5-PDF.
function MenuShareSheet({ busy, onClose, onLink, onStory, onPdf }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const row = (Icon, title, subtitle, onClick) => (
    <button onClick={onClick} disabled={!!busy} style={{
      display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 60, padding: "10px 4px",
      background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, textAlign: "left", cursor: busy ? "default" : "pointer", fontFamily: sans, color: INK,
      opacity: busy && busy !== title ? 0.45 : 1,
    }}>
      <span style={{ width: 40, height: 40, borderRadius: "50%", background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: BOTTLE }}>
        <Icon size={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{busy === title ? "Bezig…" : title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2 }}>{subtitle}</span>
      </span>
    </button>
  );
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", background: PAPER,
        borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", fontFamily: sans,
        padding: "0 20px calc(env(safe-area-inset-bottom) + 18px)",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ fontSize: 17, fontWeight: 800, color: INK, padding: "2px 4px 8px", touchAction: "none" }}>Menu delen</div>
        {row(Share2, "Link delen", "Gasten openen de menukaart in hun browser.", onLink)}
        {row(ImageIcon, "Als afbeelding", "Staand 1080×1920, voor WhatsApp-status of Instagram-story.", onStory)}
        {row(Printer, "Printversie (A5)", "PDF om te printen en op tafel te zetten.", onPdf)}
      </div>
    </div>
  ), document.body);
}

function ConfirmDialog({ title, message, cancelLabel = "Annuleer", confirmLabel, confirmColor = BURGUNDY, busy, onCancel, onConfirm }) {
  return createPortal(
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(19,20,16,0.45)", padding: 20,
    }} onClick={() => !busy && onCancel()}>
      <div onClick={e => e.stopPropagation()} style={{
        background: CREAM, borderRadius: RADIUS + 4, border: `1px solid ${BORDER}`, boxShadow: SHADOW_HERO,
        padding: 22, maxWidth: 340, width: "100%",
      }}>
        <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK, marginBottom: 8 }}>{title}</div>
        <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: "0 0 20px" }}>{message}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} className="press-scale" style={{
            flex: 1, minHeight: 44, borderRadius: RADIUS, border: `1px solid ${BORDER}`, background: "none",
            color: INK, fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy} className="press-scale" style={{
            flex: 1, minHeight: 44, borderRadius: RADIUS, border: "none", background: confirmColor,
            color: CREAM, fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>
            {busy ? "Bezig…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// iOS-stijl swipe-acties (naar links vegen onthult knoppen) i.p.v. losse
// icoontjes naast de rij — zelfde imperatieve transform-aanpak (via ref,
// geen re-render per pixel) als de rand-swipe-terug-gestiek elders in dit
// bestand.
function SwipeRevealRow({ onWissel, onVerwijder, children }) {
  const actionsWidth = (onWissel ? 76 : 0) + (onVerwijder ? 76 : 0);
  const rowRef = useRef(null);
  const drag = useRef({ tracking: false, startX: 0, baseX: 0, x: 0 });
  const [open, setOpen] = useState(false);

  const setX = (x, animated) => {
    drag.current.x = x;
    if (rowRef.current) {
      rowRef.current.style.transition = animated ? "transform 0.22s cubic-bezier(.32,.72,.35,1)" : "none";
      rowRef.current.style.transform = `translateX(${x}px)`;
    }
  };

  const onTouchStart = (e) => {
    if (actionsWidth === 0) return;
    drag.current.tracking = true;
    drag.current.startX = e.touches[0].clientX;
    drag.current.startY = e.touches[0].clientY;
    drag.current.locked = false;
    drag.current.baseX = open ? -actionsWidth : 0;
  };
  const onTouchMove = (e) => {
    if (!drag.current.tracking) return;
    const dx = e.touches[0].clientX - drag.current.startX;
    const dy = e.touches[0].clientY - (drag.current.startY ?? e.touches[0].clientY);
    // Richting vastleggen: verticaal = gewoon scrollen, horizontaal = vegen
    // (en dan niet ook de terugveeg-gestiek van het scherm eromheen starten).
    if (!drag.current.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag.current.tracking = false; return; }
      drag.current.locked = true;
    }
    e.stopPropagation();
    const next = Math.max(-actionsWidth, Math.min(0, drag.current.baseX + dx));
    setX(next, false);
  };
  const onTouchEnd = () => {
    if (!drag.current.tracking) return;
    drag.current.tracking = false;
    const shouldOpen = drag.current.x < -actionsWidth / 2;
    setOpen(shouldOpen);
    setX(shouldOpen ? -actionsWidth : 0, true);
  };
  const close = () => { setOpen(false); setX(0, true); };

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        {onWissel && (
          <button onClick={() => { close(); onWissel(); }} style={{
            width: 76, minHeight: 44, border: "none", background: BRASS, color: CREAM,
            fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            <RefreshCw size={14} /> Wissel
          </button>
        )}
        {onVerwijder && (
          <button onClick={() => { close(); onVerwijder(); }} style={{
            width: 76, minHeight: 44, border: "none", background: BURGUNDY, color: CREAM,
            fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            <Trash2 size={14} /> Verwijder
          </button>
        )}
      </div>
      <div ref={rowRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{ position: "relative", touchAction: "pan-y" }}>
        {children}
      </div>
    </div>
  );
}

function FeestplannerTab({ session, recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, voorraadAantal, onSound, onOpenRecipe, active,
  parties, onCreateParty, onUpdateParty, onDeleteParty, openPartyId, onOpenPartyHandled, hostName }) {
  const [selectedPartyId, setSelectedPartyId] = useState(null);
  // Een feest openen (of terug naar de lijst) begint bovenaan.
  useEffect(() => { window.scrollTo(0, 0); }, [selectedPartyId]);
  const [showNewPartySheet, setShowNewPartySheet] = useState(false);
  const [creatingParty, setCreatingParty] = useState(false);
  const [confirmDeletePartyId, setConfirmDeletePartyId] = useState(null);

  // Cross-tab "open dit feest direct" (bijv. vanuit Menu-assistent' "gebruik dit
  // menu") — zelfde pendingRecipeId-patroon als de rest van de app.
  useEffect(() => {
    if (openPartyId) { setSelectedPartyId(openPartyId); onOpenPartyHandled(); }
  }, [openPartyId]);

  const upcoming = useMemo(() => parties.filter(isPartyUpcoming).sort(compareUpcomingParties), [parties]);
  const past = useMemo(() => parties.filter(p => !isPartyUpcoming(p)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)), [parties]);
  const selectedParty = selectedPartyId ? parties.find(p => p.id === selectedPartyId) : null;

  const createParty = async (fields) => {
    setCreatingParty(true);
    const party = await onCreateParty({ ...fields, cocktail_ids: [], bought_items: [], prep_done: [] });
    setCreatingParty(false);
    setShowNewPartySheet(false);
    if (party) { onSound("pop"); setSelectedPartyId(party.id); }
  };
  const deleteParty = () => {
    onSound("remove");
    onDeleteParty(confirmDeletePartyId);
    if (confirmDeletePartyId === selectedPartyId) setSelectedPartyId(null);
    setConfirmDeletePartyId(null);
  };

  if (selectedParty) {
    return (
      <>
      <PartyDetailScreen key={selectedParty.id} session={session} party={selectedParty}
        onUpdateParty={patch => onUpdateParty(selectedParty.id, patch)}
        onBack={() => setSelectedPartyId(null)} onDelete={() => setConfirmDeletePartyId(selectedParty.id)}
        recipes={recipes} isOwned={isOwned} ingredientLabel={ingredientLabel} allIngredients={allIngredients}
        onAddToShoppingList={onAddToShoppingList} voorraadAantal={voorraadAantal} onSound={onSound} onOpenRecipe={onOpenRecipe}
        hostName={hostName} active={active} />
      {confirmDeletePartyId && (
        <ConfirmDialog title="Feest verwijderen?" message="Het menu, de inkooplijst en de voorbereiding van dit feest gaan verloren."
          confirmLabel="Verwijder" onCancel={() => setConfirmDeletePartyId(null)} onConfirm={deleteParty} />
      )}
      </>
    );
  }

  return (
    <div>
      <SectionLabel>Aankomend</SectionLabel>
      {upcoming.length === 0 && (
        <div style={{ border: `1px dashed ${BORDER}`, borderRadius: RADIUS, padding: "24px 20px", textAlign: "center", marginBottom: 20 }}>
          <PartyPopper size={22} color={MUTED} style={{ marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>Nog geen feest gepland. Maak er een aan om te beginnen.</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {upcoming.map(party => (
          <SwipeRevealRow key={party.id} onVerwijder={() => setConfirmDeletePartyId(party.id)}>
            <PartyCard party={party} recipes={recipes} allIngredients={allIngredients} isOwned={isOwned}
              ingredientLabel={ingredientLabel} voorraadAantal={voorraadAantal} onOpen={() => setSelectedPartyId(party.id)} />
          </SwipeRevealRow>
        ))}
      </div>

      <button onClick={() => setShowNewPartySheet(true)} className="press-scale" style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 48,
        background: BOTTLE_DARK, color: CREAM, border: "none", borderRadius: RADIUS, fontSize: 14.5, fontWeight: 700,
        cursor: "pointer", boxShadow: SHADOW_CTA, marginBottom: 28,
      }}>
        <Plus size={16} /> Nieuw feest
      </button>

      <SectionLabel>Eerder</SectionLabel>
      {past.length === 0 ? (
        <div style={{ border: `1px dashed ${BORDER}`, borderRadius: RADIUS, padding: "20px", textAlign: "center" }}>
          <p style={{ fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.5 }}>Nog geen eerdere feesten — afgelopen feesten blijven hier bewaard.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {past.map(party => (
            <SwipeRevealRow key={party.id} onVerwijder={() => setConfirmDeletePartyId(party.id)}>
              <PartyCard party={party} recipes={recipes} allIngredients={allIngredients} isOwned={isOwned}
                ingredientLabel={ingredientLabel} voorraadAantal={voorraadAantal} onOpen={() => setSelectedPartyId(party.id)} compact />
            </SwipeRevealRow>
          ))}
        </div>
      )}

      {showNewPartySheet && (
        <PartyFormSheet busy={creatingParty} onClose={() => setShowNewPartySheet(false)} onSubmit={createParty} />
      )}
      {confirmDeletePartyId && (
        <ConfirmDialog title="Feest verwijderen?" message="Het menu, de inkooplijst en de voorbereiding van dit feest gaan verloren."
          confirmLabel="Verwijder" onCancel={() => setConfirmDeletePartyId(null)} onConfirm={deleteParty} />
      )}
    </div>
  );
}

function PartyCard({ party, recipes, allIngredients, isOwned, ingredientLabel, voorraadAantal, onOpen, compact }) {
  const { chosenRecipes, perRecipeCounts, totalDrinks, rows } = useMemo(
    () => computePartyMenu(party, recipes, allIngredients, isOwned, ingredientLabel, voorraadAantal),
    [party, recipes, allIngredients, isOwned, ingredientLabel, voorraadAantal]
  );
  const prepItems = useMemo(
    () => computePartyPrepChecklist(chosenRecipes, perRecipeCounts, allIngredients, totalDrinks),
    [chosenRecipes, perRecipeCounts, allIngredients, totalDrinks]
  );
  const teKopen = rows.filter(r => r.cost > 0).length;
  const prepDone = (party.prep_done || []).filter(id => prepItems.some(i => i.id === id)).length;
  const menuPct = chosenRecipes.length > 0 ? 100 : 0;
  const inkoopPct = rows.length > 0 ? Math.round(((rows.length - teKopen) / rows.length) * 100) : 0;
  const prepPct = prepItems.length > 0 ? Math.round((prepDone / prepItems.length) * 100) : 0;
  const firstRecipe = chosenRecipes[0];
  const photo = firstRecipe ? (localItemImageUrl("cocktail", firstRecipe.id) || firstRecipe.image) : null;
  const whenTimeLine = party.starts_at
    ? `${formatDayShort(new Date(party.starts_at))} · ${formatTimeShort(new Date(party.starts_at))} · ${party.guests} gasten`
    : `${party.guests} gasten`;

  return (
    <button onClick={onOpen} style={{
      display: "block", width: "100%", textAlign: "left", background: CREAM, border: `1px solid ${BORDER}`,
      borderRadius: RADIUS + 4, boxShadow: SHADOW_CARD, cursor: "pointer", padding: 0, overflow: "hidden", fontFamily: sans,
    }}>
      {!compact && (
        <div style={{ position: "relative", height: 130 }}>
          <img src={photo || feestHeaderImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(19,38,34,0.75), rgba(19,38,34,0.05) 60%)" }} />
          <span className="glass-chip-dark" style={{ position: "absolute", top: 10, left: 10, borderRadius: 100, padding: "4px 10px", fontSize: 10.5, fontWeight: 700 }}>{formatPartyWhen(party)}</span>
        </div>
      )}
      <div style={{ padding: compact ? "11px 14px" : "14px 16px" }}>
        {compact && <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.3 }}>{formatPartyWhen(party)}</span>}
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: compact ? 15 : 19, color: INK, marginTop: compact ? 2 : 0 }}>{party.name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{whenTimeLine}</div>
        {!compact && (
          <>
            <div style={{ display: "flex", gap: 3, marginTop: 12, height: 4 }}>
              {[menuPct, inkoopPct, prepPct].map((pct, i) => (
                <div key={i} style={{ flex: 1, borderRadius: 2, background: BORDER, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: BRASS }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: MUTED, gap: 6 }}>
              <span>{chosenRecipes.length > 0 ? "Menu klaar" : "Nog geen menu"}</span>
              <span>{teKopen > 0 ? `${teKopen} te kopen` : "Alles in huis"}</span>
              <span>{prepItems.length > 0 ? `${prepDone}/${prepItems.length} voorbereid` : "Voorbereiding"}</span>
            </div>
          </>
        )}
      </div>
    </button>
  );
}

function PartyFormSheet({ initial, busy, onClose, onSubmit }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [name, setName] = useState(initial?.name || "");
  const [date, setDate] = useState(initial?.starts_at ? initial.starts_at.slice(0, 10) : "");
  const [time, setTime] = useState(initial?.starts_at ? formatTimeShort(new Date(initial.starts_at)) : "20:00");
  const [guests, setGuests] = useState(initial?.guests || 8);
  const [drinksPerGuest, setDrinksPerGuest] = useState(initial?.drinks_per_guest || 2);
  const [address, setAddress] = useState(initial?.address || "");
  const [showAddress, setShowAddress] = useState(!!initial?.show_address);

  const submit = () => {
    if (!name.trim()) return;
    const starts_at = date ? new Date(`${date}T${time || "20:00"}:00`).toISOString() : null;
    onSubmit({ name: name.trim(), starts_at, guests, drinks_per_guest: drinksPerGuest, address: address.trim() || null, show_address: showAddress && !!address.trim() });
  };

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px 14px", minHeight: 44, borderRadius: RADIUS, border: `1px solid ${BORDER}`, background: CREAM, fontSize: 15, fontFamily: sans, color: INK };

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", maxHeight: "85vh",
        background: PAPER, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0, touchAction: "none" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{initial ? "Feest aanpassen" : "Nieuw feest"}</div>
          <button onClick={close} aria-label="Sluiten" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: "18px 20px", overflowY: "auto" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Naam</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="bijv. Najaarsborrel" autoFocus style={{ ...inputStyle, marginBottom: 16 }} />

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Datum (optioneel)</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ width: 110 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Tijd</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!date} style={{ ...inputStyle, background: date ? CREAM : PAPER_DEEP }} />
            </div>
          </div>

          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Adres (optioneel)</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="bijv. Herengracht 12, Amsterdam" autoComplete="street-address" style={inputStyle} />
          <div style={{ marginBottom: 16 }}>
            <MenuToggleRow title="Adres tonen aan gasten" subtitle="Op de gedeelde menukaart en in de agenda-uitnodiging."
              checked={showAddress && !!address.trim()} onChange={v => setShowAddress(v)} />
          </div>

          <div style={{ display: "flex", gap: 24, marginBottom: 22, flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Aantal gasten</label>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <button onClick={() => setGuests(g => Math.max(1, g - 1))} style={{ width: 44, height: 44, borderRadius: RADIUS, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" }}>−</button>
                <div style={{ width: 40, textAlign: "center", fontWeight: 700, fontSize: 17, fontFamily: systemFont, color: BOTTLE }}>{guests}</div>
                <button onClick={() => setGuests(g => Math.min(100, g + 1))} style={{ width: 44, height: 44, borderRadius: RADIUS, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" }}>+</button>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Cocktails per gast</label>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <button onClick={() => setDrinksPerGuest(v => Math.max(1, v - 1))} style={{ width: 44, height: 44, borderRadius: RADIUS, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" }}>−</button>
                <div style={{ width: 40, textAlign: "center", fontWeight: 700, fontSize: 17, fontFamily: systemFont, color: BOTTLE }}>{drinksPerGuest}</div>
                <button onClick={() => setDrinksPerGuest(v => Math.min(10, v + 1))} style={{ width: 44, height: 44, borderRadius: RADIUS, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" }}>+</button>
              </div>
            </div>
          </div>

          <button onClick={submit} disabled={!name.trim() || busy} className="press-scale" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", minHeight: 44,
            background: BOTTLE_DARK, color: CREAM, border: "none", borderRadius: RADIUS, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
          }}>
            {busy ? "Bezig…" : initial ? "Opslaan" : "Feest aanmaken"}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function PartyDetailScreen({ session, party, onUpdateParty, onBack, onDelete, recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, voorraadAantal, onSound, onOpenRecipe, hostName, active }) {
  const [activeTab, setActiveTab] = useState("menu");
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [shareState, setShareState] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [confirmNieuweSuggestie, setConfirmNieuweSuggestie] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(null);
  const [justAddedId, setJustAddedId] = useState(null);
  const [justAddedAll, setJustAddedAll] = useState(false);
  const [showAlInHuis, setShowAlInHuis] = useState(false);
  const [showPriceInfo, setShowPriceInfo] = useState(false);
  const [altOpenKey, setAltOpenKey] = useState(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState(null);

  // Alle feest-eigen state (cocktails, gasten, vinkjes) leeft nu in de
  // `parties`-rij zelf i.p.v. losse component-state/Preferences, zodat 'm
  // met een gewone onUpdateParty-call wordt weggeschreven — chosen/setChosen
  // etc. blijven als lokale namen bestaan zodat de rest van dit scherm
  // ongewijzigd kan blijven t.o.v. Deel A.
  const chosen = party.cocktail_ids || [];
  const setChosen = (next) => onUpdateParty({ cocktail_ids: next });
  const guests = party.guests || 8;
  const setGuests = (n) => onUpdateParty({ guests: n });
  const drinksPerGuest = party.drinks_per_guest || 2;
  const setDrinksPerGuest = (n) => onUpdateParty({ drinks_per_guest: n });
  const checkedBuyItems = party.bought_items || [];
  const toggleBuyChecked = (key) => {
    onSound("tick");
    onUpdateParty({ bought_items: checkedBuyItems.includes(key) ? checkedBuyItems.filter(k => k !== key) : [...checkedBuyItems, key] });
  };
  const checkedPrep = party.prep_done || [];
  const togglePrepChecked = (key) => {
    onSound("tick");
    onUpdateParty({ prep_done: checkedPrep.includes(key) ? checkedPrep.filter(k => k !== key) : [...checkedPrep, key] });
  };

  // Smaaktest voor gasten: nu gekoppeld aan DIT feest (party.taste_survey_id)
  // i.p.v. "de ene lopende test van deze host" — een host kan met Deel B
  // meerdere feesten (en dus meerdere smaaktests) tegelijk hebben.
  const myId = session?.user?.id;
  const [survey, setSurvey] = useState(undefined); // undefined = laden, null = nog geen
  const [rawSurveyResponses, setSurveyResponses] = useState([]);
  // Een gast die "Antwoorden aanpassen" gebruikt, stuurt een nieuwe reactie;
  // per naam telt alleen de nieuwste (de lijst staat al nieuwste-eerst).
  const surveyResponses = useMemo(() => {
    const seen = new Set();
    return rawSurveyResponses.filter(r => {
      const name = (r.guest_name || "").trim().toLowerCase();
      if (!name) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }, [rawSurveyResponses]);
  const [mixersAdded, setMixersAdded] = useState(false);
  const surveyHasAnswers = surveyResponses.some(r => r.answers);
  const surveySpiritTally = useMemo(() => tallyChoices(surveyResponses, "spirits"), [surveyResponses]);
  const surveyLiqueurTally = useMemo(() => tallyChoices(surveyResponses, "liqueurs"), [surveyResponses]);
  const surveyMixerTally = useMemo(() => tallyChoices(surveyResponses, "mixers"), [surveyResponses]);
  const surveyNotes = useMemo(() => surveyResponses.filter(r => r.answers?.note?.trim()).map(r => ({ id: r.id, name: r.guest_name || "Gast", text: r.answers.note.trim() })), [surveyResponses]);
  const addSurveyMixersToList = () => {
    const entries = surveyMixerTally
      .filter(m => m.like > 0 && !m.key.startsWith(CUSTOM_PREFIX))
      .map(m => SURVEY_MIXERS.find(o => o.key === m.key)?.ids[0]).filter(Boolean)
      .map(id => ({ ref: { id }, recipeNames: [] }));
    if (entries.length === 0) return;
    onAddToShoppingList(entries);
    onSound("tick");
    setMixersAdded(true);
    setTimeout(() => setMixersAdded(false), 2000);
  };
  const [surveyShareState, setSurveyShareState] = useState(null);
  const [creatingSurvey, setCreatingSurvey] = useState(false);

  const loadSurvey = async () => {
    if (!party.taste_survey_id) { setSurvey(null); setSurveyResponses([]); return; }
    const { data } = await supabase.from("party_surveys").select("id, title").eq("id", party.taste_survey_id).maybeSingle();
    setSurvey(data || null);
    if (data) {
      const { data: responses } = await supabase.from("party_survey_responses").select("*").eq("survey_id", data.id).order("created_at", { ascending: false });
      setSurveyResponses(responses || []);
    } else {
      setSurveyResponses([]);
    }
  };
  useEffect(() => { loadSurvey(); }, [party.taste_survey_id]);

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

  // Automatisch elke 30s verversen zolang dit scherm open is, i.p.v. een
  // handmatige "Ververs"-knop — stopt zodra je wegnavigeert (active=false).
  useEffect(() => {
    if (!active || !survey?.id) return;
    const interval = setInterval(loadSurvey, 30000);
    return () => clearInterval(interval);
  }, [active, survey?.id]);

  const { indicatorRef: surveyPullRef, refreshing: surveyPullRefreshing, handlers: surveyPullHandlers } = usePullToRefresh(loadSurvey);

  const createSurvey = async () => {
    if (!myId || creatingSurvey) return;
    setCreatingSurvey(true);
    const { data } = await supabase.from("party_surveys").insert({ host_user_id: myId, title: party.name }).select().single();
    setCreatingSurvey(false);
    if (data) { setSurvey(data); setSurveyResponses([]); onSound("pop"); onUpdateParty({ taste_survey_id: data.id }); }
  };

  const [confirmDeleteSurvey, setConfirmDeleteSurvey] = useState(false);
  const [deletingSurvey, setDeletingSurvey] = useState(false);
  const deleteSurvey = async () => {
    if (!survey || deletingSurvey) return;
    setDeletingSurvey(true);
    const { error } = await supabase.from("party_surveys").delete().eq("id", survey.id);
    setDeletingSurvey(false);
    setConfirmDeleteSurvey(false);
    if (!error) { setSurvey(null); setSurveyResponses([]); onSound("remove"); onUpdateParty({ taste_survey_id: null }); }
  };

  const shareSurvey = async () => {
    if (!survey) return;
    onSound("share");
    const result = await shareLink({ title: "Mijn Thuisbar: smaaktest", text: "Vul even je cocktailvoorkeuren in voor het feest!", url: publicAppUrl(`smaaktest=${survey.id}&${partyInfoQuery({ title: party.name, host: (hostName || "").split(" ")[0], startsAt: party.starts_at })}`.replace(/&$/, "")) });
    if (result === "cancelled") return;
    setSurveyShareState(result);
    setTimeout(() => setSurveyShareState(null), result === "failed" ? 8000 : 2500);
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
    const names = ids.map(id => recipes.find(r => r.id === id)?.name).filter(Boolean);
    // Linkvoorbeeld-afbeelding voor WhatsApp: in de app eerst uploaden naar
    // Supabase Storage (bucket "menukaarten"). Lukt dat niet (bucket nog niet
    // aangemaakt, geen netwerk) of duurt het te lang, dan delen we gewoon
    // zonder; het voorbeeld valt dan terug op de standaardafbeelding. Op het
    // web slaan we dit over: daar moet het deelmenu direct na de tik openen.
    let image = "";
    if (isNativeShell && session?.user?.id) {
      try {
        const { party: p, items } = menuCardData();
        const canvas = await renderMenuOgCanvas({ party: p, items });
        const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
        const path = `${session.user.id}/${party.id}.png`;
        const upload = supabase.storage.from("menukaarten").upload(path, blob, { contentType: "image/png", upsert: true });
        const { error } = await Promise.race([upload, new Promise(res => setTimeout(() => res({ error: "timeout" }), 5000))]);
        if (!error) image = `${supabase.storage.from("menukaarten").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      } catch { /* zonder voorbeeldafbeelding verder */ }
    }
    const query = partyMenuQuery({
      ids, title: party.name, host: (hostName || "").split(" ")[0], startsAt: party.starts_at,
      address: party.show_address ? party.address : "", image,
    });
    const result = await shareLink({
      title: party.name || "Mijn Thuisbar: menu", text: "Bekijk het cocktailmenu!", url: publicAppUrl(query),
      fallbackText: `Het cocktailmenu voor vanavond:\n${names.map(n => `• ${n}`).join("\n")}`,
    });
    if (result === "cancelled") return;
    setShareState(result === "no-url" ? "failed" : result);
    setTimeout(() => setShareState(null), result === "shared" || result === "copied" ? 2500 : 8000);
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

  useEffect(() => {
    if (chosen.length === 0) setChosen(pickRandom(3));
  }, []);

  const addSlot = () => {
    const pool = recipes.filter(r => !chosen.includes(r.id));
    const pick = (pool.length > 0 ? pool : recipes)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : recipes.length))];
    if (pick) { onSound("shuffle"); setChosen([...chosen, pick.id]); }
  };
  const removeSlot = (i) => { onSound("remove"); setChosen(chosen.filter((_, idx) => idx !== i)); };

  const { chosenRecipes, perRecipeCounts, totalDrinks, rows, totalCost } = useMemo(
    () => computePartyMenu(party, recipes, allIngredients, isOwned, ingredientLabel, voorraadAantal),
    [party, recipes, allIngredients, isOwned, ingredientLabel, voorraadAantal]
  );

  const toBuy = rows.filter(r => !r.owned && r.cost > 0);
  // "Van duur naar goedkoop" (nieuw in Deel B) — Al in huis blijft alfabetisch.
  const teKopenRows = [...rows.filter(r => r.cost > 0)].sort((a, b) => b.cost - a.cost);
  const alInHuisRows = rows.filter(r => r.cost === 0);
  const stepperBtn = { width: 32, height: 32, borderRadius: 3, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" };
  const stepperValue = { width: 30, textAlign: "center", fontWeight: 700, fontSize: 17, fontFamily: systemFont, color: BOTTLE };

  // Eén recept scoren tegen de groepssmaak (smaaktest) als die er is, anders
  // tegen hoeveel van de verplichte ingrediënten je al in huis hebt — zelfde
  // twee signalen als de suggestiekaarten hierboven, nu herbruikt om "houd de
  // beste N" en een alternatief-zoekopdracht te kunnen scoren.
  const scoreForGroupOrOwn = (recipe) => {
    if (surveyResponses.length > 0) {
      return computeGroupRecommendations(surveyResponses, [recipe], [], isOwned)[0]?.score ?? 0;
    }
    const required = recipe.ingredients.filter(i => !i.optional);
    if (required.length === 0) return 100;
    return Math.round(((required.length - required.filter(i => !isOwned(i)).length) / required.length) * 100);
  };

  const guestTiers = guests <= 6 ? { label: "3", target: 3 } : guests <= 12 ? { label: "4", target: 4 } : { label: "5–6", target: 6 };
  const keepBest = (n) => {
    onSound("tick");
    const scored = chosenRecipes.map(r => ({ id: r.id, score: scoreForGroupOrOwn(r) }));
    scored.sort((a, b) => b.score - a.score);
    setChosen(scored.slice(0, n).map(x => x.id));
  };

  // Flessen boven €40 die maar in 1 gekozen cocktail terugkomen: het risico
  // dat je 'm speciaal voor die ene cocktail moet kopen. Alternatief: een
  // andere cocktail uit dezelfde familie die de fles niet gebruikt, gekozen
  // op dezelfde score als hierboven.
  const expensiveSingleUseRows = teKopenRows.filter(r => (r.meta?.bottlePrice || 0) > 40 && r.recipeNames.length === 1);
  const findAlternative = (row) => {
    const usingRecipe = chosenRecipes.find(r => r.name === row.recipeNames[0]);
    if (!usingRecipe) return null;
    const costlyId = row.ref?.id;
    const candidates = recipes.filter(r => r.id !== usingRecipe.id && r.family === usingRecipe.family && !r.ingredients.some(i => i.id === costlyId));
    if (candidates.length === 0) return null;
    return candidates.map(r => ({ recipe: r, score: scoreForGroupOrOwn(r) })).sort((a, b) => b.score - a.score)[0].recipe;
  };
  const swapForAlternative = (usingRecipeId, altRecipeId) => {
    onSound("shuffle");
    setChosen(chosen.map(id => id === usingRecipeId ? altRecipeId : id));
    setAltOpenKey(null);
  };

  const prepChecklist = useMemo(
    () => computePartyPrepChecklist(chosenRecipes, perRecipeCounts, allIngredients, totalDrinks),
    [chosenRecipes, perRecipeCounts, allIngredients, totalDrinks]
  );
  // Tijdsaanduidingen afgeleid van de feestdatum ("vr 11 okt", "18:00") —
  // zonder datum blijven het gewoon de kale groepslabels.
  const PREP_GROUPS = useMemo(() => {
    const dayBefore = party.starts_at ? new Date(new Date(party.starts_at).getTime() - 86400000) : null;
    const twoHoursBefore = party.starts_at ? new Date(new Date(party.starts_at).getTime() - 2 * 3600000) : null;
    return [
      { key: "dag", label: dayBefore ? `Dag ervoor (${formatDayShort(dayBefore)})` : "Dag ervoor" },
      { key: "2uur", label: twoHoursBefore ? `2 uur ervoor (${formatTimeShort(twoHoursBefore)})` : "2 uur ervoor" },
      { key: "aankomst", label: party.starts_at ? `Bij aankomst (${formatTimeShort(new Date(party.starts_at))})` : "Bij aankomst" },
    ];
  }, [party.starts_at]);

  const toggleReminder = async (next) => {
    setReminderError(null);
    if (!next) {
      cancelPartyReminder(party.id);
      onUpdateParty({ reminder_enabled: false });
      return;
    }
    setReminderBusy(true);
    const result = await schedulePartyReminder(party);
    setReminderBusy(false);
    if (result === "ok") { onUpdateParty({ reminder_enabled: true }); return; }
    setReminderError({
      "no-date": "Stel eerst een datum en tijd in.",
      "in-past": "Dit tijdstip ligt al in het verleden.",
      denied: "Je hebt meldingen geweigerd. Zet ze aan bij de systeeminstellingen.",
      failed: "Aanzetten is niet gelukt. Probeer het nog eens.",
    }[result] || "Aanzetten is niet gelukt.");
  };
  // Bij een latere datumwijziging automatisch herplannen zolang de
  // herinnering aan staat, zodat 'm niet stilzwijgend achterhaald raakt.
  useEffect(() => {
    if (!party.reminder_enabled || !party.starts_at) return;
    schedulePartyReminder(party).then(result => { if (result !== "ok") onUpdateParty({ reminder_enabled: false }); });
  }, [party.starts_at]);

  // Eén navigatiebalk: de bovenste balk (van SecondaryTabScreen) toont hier
  // "‹ Feesten · naam van het feest" met de deelknop, i.p.v. een tweede
  // balk eronder. Terugvegen gaat daardoor ook naar de feestenlijst.
  const setNavOverride = useContext(NavOverrideContext);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const shareRef = useRef(null);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareBusy, setShareBusy] = useState(null);
  shareRef.current = () => setShowShareSheet(true);
  const menuCardData = () => {
    const party_ = { title: party.name, host: (hostName || "").split(" ")[0], startsAt: party.starts_at ? new Date(party.starts_at) : null, address: party.show_address ? party.address : "" };
    const items = chosenRecipes.map(r => menuCocktailInfo(r, allIngredients, getTasteProfile(r, allIngredients)));
    return { party: party_, items };
  };
  const shareMenuFile = async (kind) => {
    const label = kind === "story" ? "Als afbeelding" : "Printversie (A5)";
    setShareBusy(label);
    onSound("share");
    let result;
    try {
      const { party: p, items } = menuCardData();
      const base = (party.name || "menu").replace(/[^\w-]+/g, "-").toLowerCase();
      if (kind === "story") {
        const canvas = await renderMenuCanvas({ width: 1080, height: 1920, party: p, items });
        result = await shareGeneratedFile({ filename: `${base}-menukaart.png`, mime: "image/png", base64: canvas.toDataURL("image/png").split(",")[1], title: party.name });
      } else {
        const canvas = await renderMenuCanvas({ width: 1748, height: 2480, party: p, items }); // A5 op 300 dpi
        result = await shareGeneratedFile({ filename: `${base}-menukaart-a5.pdf`, mime: "application/pdf", base64: bytesToBase64(canvasToPdf(canvas)), title: party.name });
      }
    } catch { result = "failed"; }
    setShareBusy(null);
    if (result === "cancelled") return;
    setShowShareSheet(false);
    setShareState(result === "downloaded" ? "copied" : result);
    setTimeout(() => setShareState(null), result === "failed" ? 8000 : 2500);
  };
  useEffect(() => {
    if (!setNavOverride) return;
    setNavOverride({
      label: "Feesten",
      title: party.name,
      onBack: () => onBackRef.current(),
      right: (
        <button onClick={() => shareRef.current()} onTouchStart={(e) => e.stopPropagation()} title="Deel dit menu" aria-label="Deel dit menu" style={{
          width: 32, height: 32, borderRadius: "50%", border: `1px solid ${SAGE}`, flexShrink: 0,
          background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: SAGE,
        }}>
          <Share2 size={14} />
        </button>
      ),
    });
  }, [setNavOverride, party.name]);
  useEffect(() => () => setNavOverride?.(null), [setNavOverride]);

  return (
    <div {...surveyPullHandlers} style={{ touchAction: "pan-y" }}>
      <div ref={surveyPullRef} aria-hidden style={{
        height: 0, opacity: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 4, color: BRASS,
      }}>
        <span className={`ptr-icon${surveyPullRefreshing ? " spin-icon" : ""}`} style={{ display: "flex", transition: "transform 0.1s linear" }}>
          <Martini size={18} strokeWidth={1.8} />
        </span>
      </div>

      {shareState && (
        <p style={{ fontSize: 11.5, color: SAGE, textAlign: "right", margin: "-8px 0 8px" }}>
          {shareState === "shared" ? "Gedeeld!" : shareState === "copied" ? "Link gekopieerd!" : `Delen mislukt${lastShareError ? ` (${lastShareError})` : ""}`}
        </p>
      )}

      {/* Samenvatting + segmented control: samen sticky zodat beide zichtbaar
          blijven tijdens scrollen, i.p.v. losse stapels met vaste 44px-tiers
          (de samenvatting is zelf al hoger dan 44px). */}
      <div style={{
        position: "sticky", top: STICKY_SUBHEADER_TOP, zIndex: 15, background: PAPER,
        marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20, paddingBottom: 12,
        marginBottom: 20, borderBottom: `1px solid ${BORDER}`,
      }}>
        <button onClick={() => setShowEditSheet(true)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%",
          background: "none", border: "none", padding: "12px 0 10px", cursor: "pointer", textAlign: "left", fontFamily: sans,
        }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
              {party.starts_at ? `${formatDayShort(new Date(party.starts_at))} · ${formatTimeShort(new Date(party.starts_at))}` : "Geen datum"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setGuests(Math.max(1, guests - 1))} style={stepperBtn}>−</button>
              <div style={stepperValue}>{guests}</div>
              <button onClick={() => setGuests(Math.min(100, guests + 1))} style={stepperBtn}>+</button>
              <span style={{ fontSize: 11.5, color: MUTED }}>gasten</span>
            </div>
            {/* Drankjes per persoon stond alleen verstopt in het bewerkscherm
                (tik op de datum); nu direct instelbaar, net als het aantal gasten. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setDrinksPerGuest(Math.max(1, drinksPerGuest - 1))} aria-label="Minder drankjes per persoon" style={stepperBtn}>−</button>
              <div style={stepperValue}>{drinksPerGuest}</div>
              <button onClick={() => setDrinksPerGuest(Math.min(10, drinksPerGuest + 1))} aria-label="Meer drankjes per persoon" style={stepperBtn}>+</button>
              <span style={{ fontSize: 11.5, color: MUTED }}>drankjes p.p.</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 19, color: BOTTLE }}>{totalDrinks}</div>
              <div style={{ fontSize: 9.5, color: MUTED }}>drankjes</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 19, color: BOTTLE }}><AnimatedNumber value={totalCost} format={euro} /></div>
              <div style={{ fontSize: 9.5, color: MUTED }}>inkoop</div>
            </div>
          </div>
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {[["menu", "Menu"], ["inkoop", "Inkoop"], ["voorbereiding", "Voorbereiding"]].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              flex: 1, padding: "8px 6px", borderRadius: RADIUS, border: `1px solid ${activeTab === id ? BOTTLE : BORDER}`,
              background: activeTab === id ? BOTTLE : CREAM, color: activeTab === id ? CREAM : INK,
              fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {showEditSheet && (
        <PartyFormSheet initial={party} onClose={() => setShowEditSheet(false)}
          onSubmit={fields => { onUpdateParty(fields); setShowEditSheet(false); }} />
      )}

      {activeTab === "menu" && (
      <>

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
                <button onClick={shareSurvey} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${SAGE}`, color: SAGE, borderRadius: 3, padding: "6px 12px", minHeight: 44, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <Share2 size={13} /> {surveyShareState === "shared" ? "Gedeeld!" : surveyShareState === "copied" ? "Link gekopieerd!" : surveyShareState === "failed" ? `Delen mislukt${lastShareError ? ` (${lastShareError})` : ""}` : surveyShareState === "no-url" ? "Webadres nog niet ingesteld" : "Deel de link"}
                </button>
                <button onClick={() => setConfirmDeleteSurvey(true)} title="Verwijder smaaktest" className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 3, cursor: "pointer", flexShrink: 0 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {confirmDeleteSurvey && (
              <ConfirmDialog title="Smaaktest verwijderen?" message="De reacties van je gasten gaan verloren."
                confirmLabel="Verwijder" busy={deletingSurvey}
                onCancel={() => setConfirmDeleteSurvey(false)} onConfirm={deleteSurvey} />
            )}
            {survey && (
              <p style={{ fontSize: 11, color: MUTED, margin: "-8px 0 14px" }}>Klaar met dit feest? Verwijder de test en maak een nieuwe aan voor de volgende keer.</p>
            )}

            {surveyResponses.length > 0 && (
              <>
                <div style={{ marginBottom: 16 }}>
                  {SURVEY_TASTE_KEYS.map(key => {
                    const meta = TASTE_META[key];
                    const pct = Math.round((surveyTasteTotals[key] / surveyResponses.length) * 100);
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11.5, color: INK, width: 50, flexShrink: 0 }}>{meta.label}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: BRASS, width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
                      </div>
                    );
                  })}
                  {surveyAvgStrength != null && (() => {
                    const strengthPct = Math.round(((surveyAvgStrength - 1) / 4) * 100);
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11.5, color: INK, width: 50, flexShrink: 0 }}>Sterk</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: BOTTLE, width: `${strengthPct}%` }} />
                        </div>
                        <span style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, width: 30, textAlign: "right", flexShrink: 0 }}>{strengthPct}%</span>
                      </div>
                    );
                  })()}
                  {surveyAlcoholFreeCount > 0 && (
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                      {surveyAlcoholFreeCount} van de {surveyResponses.length} wil liever alcoholvrij.
                    </div>
                  )}
                </div>

                {surveySpiritTally.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Sterke drank</div>
                    {surveySpiritTally.slice(0, 8).map(t => (
                      <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                        <span style={{ fontSize: 12, color: INK, width: 84, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: BORDER, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: BRASS, width: `${Math.round((t.like / surveyResponses.length) * 100)}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: MUTED, width: 92, textAlign: "right", flexShrink: 0 }}>{t.like} lekker{t.dislike ? ` · ${t.dislike} niet` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}

                {surveyLiqueurTally.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Likeuren en aperitieven</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {surveyLiqueurTally.map(t => (
                        <span key={t.key} style={{ display: "inline-flex", alignItems: "center", background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: INK, fontWeight: 600 }}>
                          {t.label}{t.like ? ` ${t.like}` : ""}{t.dislike ? <span style={{ color: BURGUNDY, marginLeft: 4 }}>({t.dislike} niet)</span> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {surveyMixerTally.length > 0 && (
                  <div style={{ background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Mixers die gasten willen</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.45 }}>
                          {surveyMixerTally.filter(t => t.like > 0).map(t => `${t.label.toLowerCase()} (${t.like})`).join(", ") || "nog geen"}
                          {surveyMixerTally.some(t => t.dislike > 0) && <span style={{ color: BURGUNDY }}> · liever niet: {surveyMixerTally.filter(t => t.dislike > 0).map(t => t.label.toLowerCase()).join(", ")}</span>}
                        </div>
                      </div>
                      {surveyMixerTally.some(t => t.like > 0 && !t.key.startsWith(CUSTOM_PREFIX)) && (
                        <button onClick={addSurveyMixersToList} className="press-scale" style={{ flexShrink: 0, minHeight: 44, padding: "0 12px", borderRadius: 10, border: "none", background: BOTTLE_DARK, color: CREAM, fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          {mixersAdded ? "Toegevoegd" : "Op inkooplijst"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {surveyNotes.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 4 }}>Opmerkingen voor jou</div>
                    {surveyNotes.map(n => (
                      <div key={n.id} style={{ padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{n.name}</div>
                        <div style={{ fontSize: 13, color: INK, lineHeight: 1.45, marginTop: 1, whiteSpace: "pre-wrap" }}>{n.text}</div>
                      </div>
                    ))}
                  </div>
                )}

                {SURVEY_TASTE_KEYS.some(k => surveyDislikeTotals[k] > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: BURGUNDY, marginBottom: 8 }}>Waar gasten niet van houden</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {SURVEY_TASTE_KEYS.filter(k => surveyDislikeTotals[k] > 0).map(k => (
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(122,46,42,0.08)", border: `1px solid rgba(122,46,42,0.25)`, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: BURGUNDY, fontWeight: 600 }}>
                          {TASTE_META[k].label} ({surveyDislikeTotals[k]})
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
                          {DIETARY_META[k]?.label || k} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {surveySpiritTotals.length > 0 && !surveyHasAnswers && (
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
                      {surveyRecommended.map(({ recipe, score, ownedCount, requiredCount, mentioned, spiritMatch }) => {
                        const warnings = getSurveyWarnings(recipe, surveyDietaryTotals, surveyDislikeTotals);
                        return (
                        <button key={recipe.id} onClick={() => setSuggestionSheetId(recipe.id)} className="press-scale" style={{ width: 132, flexShrink: 0, textAlign: "center", background: PAPER, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 10, position: "relative", cursor: "pointer", fontFamily: sans }}>
                          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                            <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={44} />
                          </div>
                          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 12.5, color: INK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 }}>{recipe.name}</div>
                          {/* Match-label in de gewone flow i.p.v. absoluut rechtsboven:
                              daar viel het achter de ronde foto en was het onleesbaar. */}
                          <MatchPill pct={score} label="match" />
                          {requiredCount > 0 && (
                            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{ownedCount} van {requiredCount} ingrediënten in huis</div>
                          )}
                          {(mentioned || spiritMatch) && (
                            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 3, marginTop: 5 }}>
                              {mentioned && <span style={{ fontSize: 8.5, color: BRASS, fontWeight: 700, border: `1px solid ${BRASS}`, borderRadius: 100, padding: "1px 5px" }}>genoemd</span>}
                              {spiritMatch && <span style={{ fontSize: 8.5, color: SAGE, fontWeight: 700, border: `1px solid ${SAGE}`, borderRadius: 100, padding: "1px 5px" }}>favoriet</span>}
                            </div>
                          )}
                          {warnings.length > 0 && (
                            <div title={warnings.join(", ")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 5, fontSize: 9.5, color: BURGUNDY, fontWeight: 700 }}>
                              <AlertTriangle size={11} strokeWidth={2} aria-hidden="true" /> {warnings[0]}
                            </div>
                          )}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); onSound("shuffle"); setChosen([...chosen, recipe.id]); }}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 7, minHeight: 44, fontSize: 11, color: CREAM, fontWeight: 700, background: BRASS, border: "none", borderRadius: 3, cursor: "pointer" }}
                          >
                            <Plus size={12} /> toevoegen
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
                            {(r.taste_tags || []).map(k => TASTE_META[k]?.label).filter(Boolean).join(", ") || "geen smaak opgegeven"}
                            {r.strength != null && ` · sterkte ${r.strength}/5`}
                            {r.alcohol_free && " · alcoholvrij"}
                            {r.favorite_spirit && ` · ${FAVORITE_SPIRIT_OPTIONS.find(o => o.key === r.favorite_spirit)?.label || r.favorite_spirit}`}
                            {(r.favorite_cocktail_ids || []).length > 0 && ` · favorieten: ${r.favorite_cocktail_ids.map(id => recipes.find(x => x.id === id)?.name).filter(Boolean).join(", ")}`}
                            {(r.dietary || []).length > 0 && ` · ${r.dietary.map(k => DIETARY_META[k]?.label || k).join(", ")}`}
                          </div>
                          {r.answers && (() => {
                            const groups = ["spirits", "liqueurs", "mixers"];
                            const like = groups.flatMap(g => (r.answers[g]?.like || []).map(k => choiceLabel(g, k)));
                            const dislike = groups.flatMap(g => (r.answers[g]?.dislike || []).map(k => choiceLabel(g, k)));
                            return (
                              <>
                                {like.length > 0 && <div style={{ color: INK, marginTop: 3 }}>Lekker: {like.join(", ")}</div>}
                                {dislike.length > 0 && <div style={{ color: BURGUNDY, marginTop: 2 }}>Liever niet: {dislike.join(", ")}</div>}
                              </>
                            );
                          })()}
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <SectionLabel>Menu ({chosenRecipes.length})</SectionLabel>
            <button onClick={() => { if (chosen.length > 0) setConfirmNieuweSuggestie(true); else setChosen(pickRandom(1)); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BRASS}`, color: BRASS, borderRadius: 3, padding: "6px 12px", minHeight: 44, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <Shuffle size={13} /> Nieuwe suggestie
            </button>
          </div>
          {chosenRecipes.length > 0 && (
            <p style={{ fontSize: 11, color: MUTED, margin: "0 0 8px" }}>Veeg naar links om te wisselen of te verwijderen.</p>
          )}
          {confirmNieuweSuggestie && (
            <ConfirmDialog title="Nieuwe suggesties?" message="Hele menu vervangen door nieuwe suggesties?"
              confirmLabel="Vervang" confirmColor={BRASS}
              onCancel={() => setConfirmNieuweSuggestie(false)}
              onConfirm={() => { setConfirmNieuweSuggestie(false); setChosen(pickRandom(Math.max(1, chosen.length))); }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {chosenRecipes.map((r, i) => {
              const required = r.ingredients.filter(ing => !ing.optional);
              const missing = required.filter(ing => !isOwned(ing));
              const isEditing = editingIndex === i;
              const warnings = surveyResponses.length > 0 ? getSurveyWarnings(r, surveyDietaryTotals, surveyDislikeTotals) : [];
              const row = (
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: `1px solid ${BORDER}`, boxShadow: SHADOW_CARD, padding: "10px 12px" }}>
                  {isEditing ? (
                    <RecipePicker recipes={recipes} value={r.id} listId={`feest-recipe-${i}`}
                      onChange={id => { const next = chosen.slice(); next[i] = id; setChosen(next); setEditingIndex(null); }}
                      style={{ flex: 1, minWidth: 0 }} />
                  ) : (
                    <button onClick={() => setSheetIndex(i)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, minHeight: 44, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0, fontFamily: sans }}>
                      <RecipeCircle recipe={r} allIngredients={allIngredients} size={44} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: missing.length === 0 ? SAGE : MUTED }}>
                            {missing.length === 0 ? "Alles in huis" : `${missing.length} fles${missing.length === 1 ? "" : "sen"} kopen`}
                          </span>
                          <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>· {perRecipeCounts[i]} glazen</span>
                        </div>
                        {warnings.length > 0 && (
                          <div title={warnings.join(", ")} style={{ fontSize: 10.5, color: BURGUNDY, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            <AlertTriangle size={11} strokeWidth={2} style={{ verticalAlign: "-1px" }} aria-hidden="true" /> {warnings.join(" · ")}
                          </div>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              );
              return (
                <SwipeRevealRow key={i} onWissel={() => setEditingIndex(isEditing ? null : i)} onVerwijder={chosen.length > 1 ? () => removeSlot(i) : null}>
                  {row}
                </SwipeRevealRow>
              );
            })}
          </div>

          {chosenRecipes.length > 0 && (
            <button onClick={() => setShowShareSheet(true)} className="press-scale" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 48, marginTop: 12,
              background: BOTTLE_DARK, color: CREAM, border: "none", borderRadius: RADIUS, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              <ImageIcon size={17} /> Deel als afbeelding
            </button>
          )}
          {showShareSheet && (
            <MenuShareSheet busy={shareBusy} onClose={() => setShowShareSheet(false)}
              onLink={() => { setShowShareSheet(false); shareMenu(chosen); }}
              onStory={() => shareMenuFile("story")} onPdf={() => shareMenuFile("pdf")} />
          )}

          {chosenRecipes.length > guestTiers.target && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(184,134,46,0.08)", border: `1px solid ${BRASS}`, borderRadius: RADIUS, padding: "12px 14px", marginTop: 12 }}>
              <Sparkles size={15} color={BRASS} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: INK, margin: "0 0 8px", lineHeight: 1.5 }}>
                  Voor {guests} gasten raden we {guestTiers.label} cocktails aan. Je hebt er {chosenRecipes.length}.
                </p>
                <button onClick={() => keepBest(guestTiers.target)} className="press-scale" style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, background: BRASS, color: CREAM,
                  border: "none", borderRadius: 3, padding: "0 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>
                  Houd de beste {guestTiers.target}
                </button>
              </div>
            </div>
          )}

          <button onClick={addSlot} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", background: "none", border: `1px dashed ${BRASS}`, borderRadius: 14, padding: "13px", minHeight: 44, fontSize: 12.5, fontWeight: 700, color: BRASS, cursor: "pointer", marginTop: 10 }}>
            <Plus size={14} /> Extra cocktail toevoegen
          </button>
      </>
      )}

      {activeTab === "inkoop" && (
      <>
          <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <ShoppingCart size={15} color={BRASS} />
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Inkooplijst</span>
            </div>

            <div style={{ fontSize: 11.5, fontWeight: 700, color: INK, margin: "4px 0 4px" }}>Te kopen ({teKopenRows.length})</div>
            {teKopenRows.length === 0 && (
              <p style={{ fontSize: 12.5, color: SAGE, fontWeight: 600, margin: "0 0 8px" }}>Niets te kopen — alles in huis.</p>
            )}
            {teKopenRows.map((row, i) => {
              const checked = checkedBuyItems.includes(row.key);
              const expensiveFlag = expensiveSingleUseRows.some(r => r.key === row.key);
              return (
                <div key={row.key}>
                  <button onClick={() => toggleBuyChecked(row.key)} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none",
                    padding: "9px 0", minHeight: 44, borderTop: i === 0 ? "none" : `1px dotted ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: sans,
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${checked ? SAGE : BORDER}`,
                      background: checked ? SAGE : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {checked && <Check size={13} color={CREAM} strokeWidth={3} />}
                    </span>
                    <span style={{ flex: 1, fontSize: 13.5, color: checked ? MUTED : INK, textDecoration: checked ? "line-through" : "none" }}>{row.label}</span>
                    <span style={{ fontSize: 13, color: checked ? MUTED : INK, fontWeight: 600, textDecoration: checked ? "line-through" : "none", flexShrink: 0 }}>
                      {row.buyLabel}{row.cost > 0 && !row.buyLabel.includes("€") ? ` · ${euro(row.cost)}` : ""}
                    </span>
                  </button>
                  {expensiveFlag && (() => {
                    const alt = altOpenKey === row.key ? findAlternative(row) : null;
                    const usingRecipe = chosenRecipes.find(r => r.name === row.recipeNames[0]);
                    return (
                      <div style={{ background: "rgba(122,46,42,0.06)", border: `1px solid rgba(122,46,42,0.2)`, borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                        <p style={{ fontSize: 11.5, color: BURGUNDY, margin: "0 0 6px", lineHeight: 1.4 }}>
                          {row.label} ({euro(row.meta.bottlePrice)}) gebruik je maar in 1 cocktail.
                        </p>
                        {altOpenKey === row.key ? (
                          alt ? (
                            <button onClick={() => swapForAlternative(usingRecipe.id, alt.id)} className="press-scale" style={{
                              display: "flex", alignItems: "center", gap: 6, minHeight: 40, background: "none", border: `1px solid ${BRASS}`,
                              color: BRASS, borderRadius: 3, padding: "0 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                            }}>
                              <RefreshCw size={12} /> Wissel naar {alt.name}
                            </button>
                          ) : (
                            <p style={{ fontSize: 11.5, color: MUTED, margin: 0 }}>Geen vergelijkbaar alternatief gevonden.</p>
                          )
                        ) : (
                          <button onClick={() => setAltOpenKey(row.key)} className="press-scale" style={{
                            display: "flex", alignItems: "center", gap: 6, minHeight: 40, background: "none", border: `1px solid ${BURGUNDY}`,
                            color: BURGUNDY, borderRadius: 3, padding: "0 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                          }}>
                            Toon alternatief
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {alInHuisRows.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <button onClick={() => setShowAlInHuis(v => !v)} className="press-scale" style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%", minHeight: 40, background: "none", border: "none",
                  padding: "6px 0", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: MUTED, fontFamily: sans,
                }}>
                  {showAlInHuis ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Al in huis ({alInHuisRows.length})
                </button>
                {showAlInHuis && alInHuisRows.map((row, i) => (
                  <div key={row.key} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: i === 0 ? "none" : `1px dotted ${BORDER}`, fontSize: 13.5 }}>
                    <span style={{ color: INK }}>{row.label}</span>
                    <span style={{ color: SAGE, fontWeight: 600 }}>{row.buyLabel}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0 2px", marginTop: 4, borderTop: `1px solid ${BORDER}`, fontSize: 15 }}>
              <span style={{ fontFamily: systemFont, fontWeight: 700, color: INK }}>Geschatte inkoop</span>
              <span style={{ fontFamily: systemFont, fontWeight: 700, color: BOTTLE }}><AnimatedNumber value={totalCost} format={euro} /></span>
            </div>
            <div style={{ margin: "6px 0 14px" }}>
              <button onClick={() => setShowPriceInfo(v => !v)} className="press-scale" style={{
                display: "flex", alignItems: "center", gap: 5, minHeight: 32, background: "none", border: "none", padding: 0,
                cursor: "pointer", fontSize: 11.5, color: MUTED, fontFamily: sans,
              }}>
                Richtprijzen <Info size={12} />
              </button>
              {showPriceInfo && (
                <p style={{ fontSize: 11.5, color: MUTED, margin: "6px 0 0", lineHeight: 1.5 }}>
                  Prijzen van de voordeligste geschikte fles bij Mitra, Dirck III of Drankgigant (wekelijks gecontroleerd); waar die nog ontbreekt, een richtprijs ({PRICES_UPDATED}). Acties en verzendkosten kunnen het verschil maken. Wat je al in voorraad hebt, telt mee volgens het aantal flessen dat je bij Voorraad instelt. Is dat te weinig voor dit feest, dan berekent de app hoeveel je moet bijkopen.
                </p>
              )}
            </div>
            {toBuy.length > 0 && (
              justAddedAll ? (
                <span className="success-pop" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: SAGE, fontSize: 14, fontWeight: 700, padding: "11px 0" }}>
                  <Check size={15} strokeWidth={3} /> Toegevoegd aan winkelmandje
                </span>
              ) : (
                <button onClick={() => addAllMissing(toBuy.map(row => ({ ref: row.ref, recipeNames: row.recipeNames })))}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", minHeight: 44, background: BOTTLE, color: "#FBF6EA", border: "none", borderRadius: RADIUS, padding: "11px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA }}>
                  <ShoppingCart size={15} /> Zet ontbrekende in winkelmandje
                </button>
              )
            )}
          </div>
      </>
      )}

      {activeTab === "voorbereiding" && (
      <>
          <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <ClipboardList size={15} color={BRASS} />
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: BRASS }}>Voorbereiding</span>
            </div>
            {PREP_GROUPS.map(group => {
              const items = prepChecklist.filter(item => item.group === group.key);
              if (items.length === 0) return null;
              return (
                <div key={group.key} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.3, marginBottom: 4 }}>{group.label}</div>
                  {items.map((item, i) => {
                    const checked = checkedPrep.includes(item.id);
                    return (
                      <button key={item.id} onClick={() => togglePrepChecked(item.id)} style={{
                        display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none",
                        padding: "8px 0", minHeight: 44, borderTop: i === 0 ? "none" : `1px dotted ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: sans,
                      }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${checked ? SAGE : BORDER}`,
                          background: checked ? SAGE : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {checked && <Check size={13} color={CREAM} strokeWidth={3} />}
                        </span>
                        <span style={{ flex: 1, fontSize: 13.5, color: checked ? MUTED : INK, textDecoration: checked ? "line-through" : "none", lineHeight: 1.4 }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Herinnering 2 uur van tevoren</div>
                {!party.starts_at && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>Stel eerst een datum en tijd in.</div>}
                {reminderError && <div style={{ fontSize: 11.5, color: BURGUNDY, marginTop: 2 }}>{reminderError}</div>}
              </div>
              <Switch checked={!!party.reminder_enabled} disabled={!party.starts_at || reminderBusy} onChange={toggleReminder} />
            </div>
          </div>
      </>
      )}

      {/* Altijd zichtbaar (niet alleen via naar-links-vegen in de lijst, wat
          niemand vanzelf ontdekt). */}
      {onDelete && (
        <button onClick={onDelete} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 28,
          padding: "12px", borderRadius: RADIUS, border: `1px solid rgba(122,46,42,0.35)`, background: "none",
          color: BURGUNDY, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>
          <Trash2 size={15} /> Feest verwijderen
        </button>
      )}

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

// ===== Menu-assistent =====
// Een optioneel startpunt (eigen cocktails, thema, smaaktest of verras me),
// daarna zeven vragen die elk over te slaan zijn. Het resultaat zijn drie
// menu's naast elkaar (veilig, balans, verrassend); per cocktail staat
// waarom hij gekozen is, en wisselen gebeurt met een keuze uit alternatieven
// i.p.v. willekeurig. Antwoorden blijven bewaard (useStorage → Preferences).
const MA_DEFAULTS = {
  start: null, theme: null, surveyNote: null,
  count: 4, alcoholvrijCount: 1, guests: 8,
  variety: true, styles: [],
  prefs: { spirits: { like: [], dislike: [] }, tastes: { like: [], dislike: [] }, custom: { like: [], dislike: [] } },
  avoidIds: [],
  strengths: [], surprise: 30,
  effort: "werk", gear: { shaker: true, blender: false, crushed: true, eggs: true }, batch: false, noHomemade: false,
  mustHave: [],
  maxBottles: 2, budget: "", useUp: [], noBuy: [],
};
const MA_NO_LIMIT = 10; // teller op 10 = geen grens aan het aantal flessen
const MA_QUESTION_COUNT = 7;
// Wat telt als "fles" bij bijkopen: sterke drank, likeuren en bitters, plus
// een paar mixers die je los koopt. Sap, frisdrank en citroenen zijn gewone
// boodschappen en tellen niet mee.
const MENU_BOTTLE_CATS = new Set(["Sterke drank", "Likeuren & versterkte wijnen", "Bitters"]);
const MENU_BOTTLE_EXTRA = new Set(["prosecco", "white_wine", "red_wine", "sake", "peach_schnapps", "beer", "stout"]);
// Bekende klassiekers (wat de meeste gasten kennen); de rest telt als
// "minder bekend" voor het schuifje bekend/verrassend.
const MENU_CLASSICS = new Set([
  "whiskey_sour", "daiquiri", "margarita", "pisco_sour", "gimlet", "cosmopolitan", "sidecar", "caipirinha",
  "amaretto_sour", "gin_tonic", "cuba_libre", "moscow_mule", "paloma", "dark_n_stormy", "mojito", "long_island",
  "americano", "sex_on_the_beach", "tequila_sunrise", "bloody_mary", "screwdriver", "pimms_cup", "old_fashioned",
  "negroni", "sazerac", "boulevardier", "mint_julep", "martini", "manhattan", "dirty_martini", "tom_collins",
  "french_75", "espresso_martini", "kir_royale", "bellini", "mimosa", "gin_fizz", "porn_star_martini",
  "aperol_spritz", "pina_colada", "mai_tai", "bramble", "zombie", "white_russian", "black_russian",
  "irish_coffee", "hot_toddy", "mulled_wine", "godfather", "rusty_nail", "brandy_alexander", "grasshopper",
  "virgin_mojito", "virgin_pina_colada", "virgin_mule", "shirley_temple", "hugo", "blue_lagoon", "rob_roy",
]);
const MENU_HOMEMADE_SYRUPS = new Set(["honey_syrup", "honey_ginger_syrup", "raspberry_syrup"]);
const MENU_FRESH_JUICES = new Set(["lemon_juice", "lime_juice", "orange_juice", "grapefruit_juice", "pineapple_juice", "passion_fruit_puree", "peach_puree", "tomato_juice"]);
const MENU_CORNER_TITLES = { fris: "Fris en verfrissend", sterk: "Sterk en aromatisch", avontuurlijk: "Avontuurlijk", comfort: "Zacht en romig", alcoholvrij: "Alcoholvrij" };
const MENU_CORNER_COLORS = { fris: "var(--sage)", sterk: "var(--brass)", avontuurlijk: "var(--burgundy)", comfort: "#8A6A4A", alcoholvrij: "var(--sage)" };
const MA_STRENGTH_KEYS = { 1: "licht", 2: "middel", 3: "sterk" };

const MA_THEMES = [
  { key: "gin", label: "Gin-avond", ids: ["gin", "sloe_gin"] },
  { key: "tiki", label: "Tiki en tropisch", styles: ["tropisch"], families: ["Modern / Tiki"] },
  { key: "zomer", label: "Zomer", styles: ["fris_zuur", "lang_bruisend", "bubbels"] },
  { key: "winter", label: "Winter", styles: ["kort_sterk", "romig"], families: ["Warme dranken", "Zuivel & dessert"] },
  { key: "brunch", label: "Brunch", styles: ["bubbels"], ids: ["prosecco", "orange_juice", "tomato_juice"] },
  { key: "aperitief", label: "Aperitief", ids: ["campari", "aperol", "sweet_vermouth", "dry_vermouth", "lillet_blanc", "prosecco"] },
  { key: "na_eten", label: "Na het eten", styles: ["romig"], ids: ["coffee_liqueur", "espresso", "amaretto", "creme_de_cacao"] },
  { key: "bubbels", label: "Bubbels", styles: ["bubbels"] },
];

// Smaken uit de smaaktest (SURVEY_TASTES) vertaald naar receptkenmerken.
const MA_TASTE_IDS = {
  fruitig: ["orange_juice", "pineapple_juice", "cranberry_juice", "passion_fruit_puree", "passion_fruit_juice", "peach_puree", "raspberry_syrup", "strawberry", "chambord", "creme_de_cassis", "creme_de_mure", "cherry_brandy", "apricot_brandy", "lychee_liqueur", "sour_apple_liqueur", "banana_liqueur", "melon_liqueur", "grenadine"],
  kruidig: ["ginger_root", "honey_ginger_syrup", "allspice_liqueur", "benedictine", "green_chartreuse", "yellow_chartreuse", "cinnamon_stick", "cloves", "drambuie", "galliano"],
  rokerig: ["mezcal", "scotch"],
  pittig: ["chili", "tabasco", "ginger_beer", "ginger_root", "honey_ginger_syrup"],
  bloemig: ["elderflower_cordial", "creme_de_violette", "lillet_blanc", "orange_flower_water"],
  citrus: ["lemon_juice", "lime_juice", "grapefruit_juice", "orange_juice"],
  koffie: ["espresso", "hot_coffee", "coffee_liqueur"],
  chocolade: ["creme_de_cacao"],
  munt: ["mint", "creme_de_menthe"],
  gember: ["ginger_beer", "ginger_ale", "ginger_root", "honey_ginger_syrup", "ginger_wine"],
};
function maTasteMatches(f, key) {
  if (key === "fris_zuur") return f.taste.zuur >= 2;
  if (key === "zoet") return f.taste.zoet >= 3;
  if (key === "bitter") return f.taste.bitter >= 2;
  if (key === "romig") return f.styles.has("romig");
  if (key === "tropisch") return f.styles.has("tropisch");
  const ids = MA_TASTE_IDS[key];
  return !!ids && ids.some(id => f.ids.has(id));
}
// Zelf ingetypt ("~Calvados"): zoek in receptnaam en ingrediëntnamen.
function maCustomMatches(f, key) {
  const q = key.replace(/^~/, "").trim().toLowerCase();
  return q.length >= 2 && f.text.includes(q);
}
const MA_ALLERGY_IDS = {
  noten: ["orgeat", "amaretto", "frangelico", "creme_de_noyaux"],
  lactose: ["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter"],
  rauw_ei: ["egg_white", "egg_yolk"],
  vegan: ["heavy_cream", "whipped_cream", "milk", "irish_cream", "butter", "egg_white", "egg_yolk", "honey_syrup", "honey_ginger_syrup"],
};

function maRecipeStyles(recipe, ids, taste, hasDairy) {
  const s = new Set();
  const fam = recipe.family;
  const has = (...list) => list.some(id => ids.has(id));
  if (has("prosecco")) s.add("bubbels");
  if (fam === "Modern / Tiki" || has("coconut_cream", "passion_fruit_puree", "passion_fruit_juice", "falernum", "banana_liqueur") || (has("pineapple_juice") && has("white_rum", "dark_rum"))) s.add("tropisch");
  if (fam === "Zuivel & dessert" || hasDairy || has("espresso", "coffee_liqueur", "creme_de_cacao", "advocaat")) s.add("romig");
  if (fam === "Highballs" || has("soda_water", "tonic", "ginger_beer", "ginger_ale", "cola", "lemonade", "grapefruit_soda", "beer")) s.add("lang_bruisend");
  if (fam === "Sours" || (taste.zuur >= 2 && !s.has("lang_bruisend"))) s.add("fris_zuur");
  if (fam === "Spirit-forward" || fam === "Stirred-down" || (taste.sterk >= 4 && taste.zuur <= 1)) s.add("kort_sterk");
  if (s.size === 0) s.add(taste.zuur >= 2 ? "fris_zuur" : "kort_sterk");
  return s;
}

function menuRecipeFacts(recipe, allIngredients, isOwned) {
  const required = recipe.ingredients.filter(i => !i.optional);
  const metas = recipe.ingredients.map(ing => ({ ing, meta: findIngredientMeta(ing, allIngredients) }));
  const ids = new Set(metas.map(({ ing, meta }) => meta?.id || ing.id).filter(Boolean));
  const requiredIds = new Set(required.map(ing => findIngredientMeta(ing, allIngredients)?.id || ing.id));
  const missing = required.filter(ing => !isOwned(ing));
  const bottleOf = (ing) => { const m = findIngredientMeta(ing, allIngredients); return m && (MENU_BOTTLE_CATS.has(m.cat) || MENU_BOTTLE_EXTRA.has(m.id)) ? m.id : null; };
  const bottles = [...new Set(required.map(bottleOf).filter(Boolean))];
  const missingBottles = [...new Set(missing.map(bottleOf).filter(Boolean))];
  const techniques = inferTechniques(recipe.method);
  const hasEgg = requiredIds.has("egg_white") || requiredIds.has("egg_yolk");
  const hasDairy = [...ids].some(id => ["heavy_cream", "whipped_cream", "milk", "egg_yolk", "irish_cream", "butter"].includes(id));
  const hasHomemade = [...ids].some(id => MENU_HOMEMADE_SYRUPS.has(id));
  const hasFreshJuice = required.some(ing => MENU_FRESH_JUICES.has(findIngredientMeta(ing, allIngredients)?.id || ing.id));
  const hot = [...ids].some(id => ["hot_water", "hot_coffee", "espresso"].includes(id)) || recipe.family === "Warme dranken";
  // Vooraf te batchen: geen vers sap, ei, room of koffie en niets om te
  // muddelen/laagjes te gieten. Bruis (tonic, soda) mag: dat gaat er bij
  // het serveren pas bij.
  const batchable = !hasFreshJuice && !hasEgg && !hasDairy && !hot && !techniques.some(t => ["muddle", "float_layer", "blend", "dry_shake"].includes(t));
  const taste = getTasteProfile(recipe, allIngredients);
  const level = menuStrength(recipe, ing => findIngredientMeta(ing, allIngredients)).level;
  const styles = maRecipeStyles(recipe, ids, taste, hasDairy);
  const text = [recipe.name, ...metas.map(({ ing, meta }) => meta?.name || ing.name || "")].join(" ").toLowerCase();
  const priceOf = (id) => findIngredientMeta({ id }, allIngredients)?.bottlePrice || 20;
  const missingCost = missingBottles.reduce((s, id) => s + priceOf(id), 0);
  const baseSpirit = metas.find(({ meta }) => meta?.cat === "Sterke drank")?.meta?.id || null;
  return {
    recipe, required, ids, missing, bottles, missingBottles, missingCost, techniques, hasEgg, hasHomemade, batchable,
    taste, level, alcoholFree: level === 0, styles, text, baseSpirit, classic: MENU_CLASSICS.has(recipe.id),
    crushed: /crushed/i.test(recipe.method || ""),
  };
}

function menuCornerOf(recipe, taste) {
  const role = getMenuRole(recipe);
  if (role !== "overig") return role;
  return taste.sterk >= 4 ? "sterk" : "fris";
}

// Plekken op het menu. Met variatie: verdeeld over de smaakhoeken; zonder
// variatie (en met gekozen stijlen): verdeeld over die stijlen.
const MA_CORNER_ORDER = ["fris", "sterk", "avontuurlijk", "fris", "comfort", "sterk", "avontuurlijk", "fris", "sterk", "comfort"];
function maSlots(a) {
  const total = Math.max(1, Math.min(10, a.count));
  const free = Math.min(a.alcoholvrijCount, total);
  const n = total - free;
  const slots = [];
  const byStyle = !a.variety && a.styles.length > 0;
  for (let i = 0; i < n; i++) {
    slots.push(byStyle
      ? { key: `s${i}`, kind: "style", style: a.styles[i % a.styles.length] }
      : { key: `s${i}`, kind: "corner", corner: MA_CORNER_ORDER[i % MA_CORNER_ORDER.length] });
  }
  for (let i = 0; i < free; i++) slots.push({ key: `af${i}`, kind: "alcoholvrij" });
  return slots;
}
function maSlotMatches(f, slot) {
  if (slot.kind === "alcoholvrij") return f.alcoholFree;
  if (f.alcoholFree) return false;
  if (slot.kind === "style") return f.styles.has(slot.style);
  if (slot.kind === "corner") return f.corner === slot.corner;
  return true; // "extra": alles mag
}
function maSlotTitle(slot) {
  if (slot.kind === "alcoholvrij") return "Alcoholvrij";
  if (slot.kind === "style") return SURVEY_STYLES.find(s => s.key === slot.style)?.label || "";
  if (slot.kind === "corner") return MENU_CORNER_TITLES[slot.corner] || "";
  return "Eigen keuze";
}

// Harde filters: dingen die echt niet mogen of niet kunnen.
function maPasses(f, a) {
  const p = a.prefs;
  const spiritIds = (keys) => keys.flatMap(k => SURVEY_SPIRITS.find(o => o.key === k)?.ids || []);
  if (spiritIds(p.spirits.dislike).some(id => f.ids.has(id))) return false;
  if (p.tastes.dislike.some(k => maTasteMatches(f, k))) return false;
  if (p.custom.dislike.some(k => maCustomMatches(f, k))) return false;
  if (a.avoidIds.some(id => f.ids.has(id))) return false;
  if (a.effort === "snel" && (f.required.length > 3 || f.hasEgg || f.hasHomemade || f.techniques.includes("dry_shake") || f.techniques.includes("float_layer"))) return false;
  if (a.effort === "werk" && (f.required.length > 5 || f.techniques.includes("float_layer"))) return false;
  if (!a.gear.shaker && f.techniques.some(t => t === "shaken" || t === "dry_shake")) return false;
  if (!a.gear.blender && f.techniques.includes("blend")) return false;
  if (!a.gear.crushed && f.crushed) return false;
  if (!a.gear.eggs && f.hasEgg) return false;
  if (a.noHomemade && f.hasHomemade) return false;
  if (!f.alcoholFree && a.strengths.length > 0 && !a.strengths.includes(MA_STRENGTH_KEYS[f.level])) return false;
  if (f.missingBottles.some(id => a.noBuy.includes(id))) return false;
  return true;
}

// Score + korte uitleg ("gin-avond · fris en zuur · in huis").
function maScore(f, a, ctx) {
  const reasons = [];
  const add = (w, t) => reasons.push({ w, t });
  let score = 0;
  const p = a.prefs;
  // Voorraad: ontbrekende flessen kosten geld, ontbrekende boodschappen veel minder.
  score -= f.missingBottles.length * (ctx.profile === "veilig" ? 3.4 : 2.2);
  score -= (f.missing.length - f.missingBottles.length) * 0.6;
  if (f.missing.length === 0) { score += 1.5; add(1, "in huis"); }
  else if (f.missingBottles.length > 0) add(1.1, `${f.missingBottles.length} fles${f.missingBottles.length === 1 ? "" : "sen"} kopen`);
  // Voorkeuren.
  const likedSpirit = p.spirits.like.find(k => (SURVEY_SPIRITS.find(o => o.key === k)?.ids || []).some(id => f.ids.has(id)));
  if (likedSpirit) { score += 2.5; add(2.6, SURVEY_SPIRITS.find(o => o.key === likedSpirit).label.toLowerCase()); }
  const likedTastes = p.tastes.like.filter(k => maTasteMatches(f, k));
  if (likedTastes.length) { score += 1.2 * likedTastes.length; add(1.8, SURVEY_TASTES.find(t => t.key === likedTastes[0])?.label.toLowerCase()); }
  const likedCustom = p.custom.like.find(k => maCustomMatches(f, k));
  if (likedCustom) { score += 2.8; add(2.9, likedCustom.replace(/^~/, "").toLowerCase()); }
  // Thema.
  const theme = MA_THEMES.find(t => t.key === a.theme);
  if (theme && ((theme.ids || []).some(id => f.ids.has(id)) || (theme.styles || []).some(s => f.styles.has(s)) || (theme.families || []).includes(f.recipe.family))) {
    score += 3; add(3, theme.label.toLowerCase());
  }
  // Flessen opmaken.
  const usesUp = a.useUp.find(id => f.ids.has(id));
  if (usesUp) { score += 3; add(3.2, `maakt de ${(ctx.nameOf(usesUp) || usesUp).toLowerCase()} op`); }
  // Vooraf te maken.
  if (a.batch) { if (f.batchable) { score += 2.5; add(2.4, "vooraf te maken"); } else score -= 1; }
  // Bekend of verrassend.
  if (ctx.wantUnknown) { if (!f.classic) { score += 2.2; add(1.4, "minder bekend"); } else score -= 0.6; }
  else if (f.classic) { score += 1.6; add(1.2, "klassieker"); }
  if (ctx.profile === "veilig" && f.classic) score += 2;
  if (ctx.profile === "verrassend") { if (!f.classic) score += 2.5; score += (hashString(f.recipe.id + "v") % 100) / 60; }
  // Afwisseling in sterkte en basisdrank.
  if (!f.alcoholFree && a.strengths.length > 1 && !ctx.levels.has(f.level)) score += 0.6;
  score -= f.bottles.filter(b => ctx.menuBottles.has(b)).length * 0.5;
  // Eigen smaak uit je check-ins.
  if (ctx.tasteLikes) {
    const fit = ["zoet", "zuur", "bitter", "sterk"].reduce((s, k) => s + ((ctx.tasteLikes[k] || 0) / 100) * (f.taste[k] / 5), 0);
    score += fit * 0.8;
  }
  // Vaste tie-breaker zodat het menu niet bij elke render verspringt.
  score += (hashString(f.recipe.id) % 100) / 1000;
  const why = reasons.sort((x, y) => y.w - x.w).slice(0, 3).map(r => r.t).filter(Boolean).join(" · ");
  return { score, why };
}

// Stelt één menu samen. `locks` = slotKey → recept-id (vastgezet, gewisseld
// of "moet erop"); de rest wordt per plek met de hoogste score gevuld.
function maBuildMenu({ facts, a, slots, locks, profile, tasteLikes, nameOf, priceOf }) {
  const byId = new Map(facts.map(f => [f.recipe.id, f]));
  const chosen = new Map();
  const used = new Set();
  const menuBottles = new Set();
  const missing = new Set();
  const levels = new Set();
  const take = (slotKey, f, extra) => {
    chosen.set(slotKey, { f, ...extra });
    used.add(f.recipe.id);
    f.bottles.forEach(b => menuBottles.add(b));
    f.missingBottles.forEach(b => missing.add(b));
    levels.add(f.level);
  };
  slots.forEach(slot => {
    const f = locks[slot.key] && byId.get(locks[slot.key]);
    if (f) take(slot.key, f, { locked: true, why: a.mustHave.includes(f.recipe.id) ? "jij koos hem" : "vastgezet" });
  });
  const alcoholic = slots.filter(s => s.kind !== "alcoholvrij").length;
  const wantUnknownTotal = Math.round(alcoholic * (profile === "veilig" ? 0 : profile === "verrassend" ? Math.max(0.6, a.surprise / 100) : a.surprise / 100));
  const budget = parseFloat(String(a.budget).replace(",", ".")) || null;
  const costOf = (set) => [...set].reduce((sum, id) => sum + priceOf(id), 0);
  slots.forEach(slot => {
    if (chosen.has(slot.key)) return;
    const unknownSoFar = [...chosen.values()].filter(c => c.f && !c.f.classic && !c.f.alcoholFree).length;
    const ctx = { profile, wantUnknown: unknownSoFar < wantUnknownTotal, menuBottles, levels, tasteLikes, nameOf };
    const fitsBudget = (f) => {
      const next = new Set([...missing, ...f.missingBottles]);
      if (a.maxBottles < MA_NO_LIMIT && next.size > a.maxBottles) return false;
      if (budget != null && costOf(next) > budget) return false;
      return true;
    };
    const pool = facts.filter(f => !used.has(f.recipe.id) && maPasses(f, a) && fitsBudget(f));
    let candidates = pool.filter(f => maSlotMatches(f, slot));
    // Niets in deze hoek? Dan iets anders dat wel past (zelfde soort: met of zonder alcohol).
    if (candidates.length === 0 && slot.kind !== "alcoholvrij") candidates = pool.filter(f => !f.alcoholFree);
    if (candidates.length === 0) { chosen.set(slot.key, { f: null }); return; }
    const best = candidates.map(f => ({ f, ...maScore(f, a, ctx) })).sort((x, y) => y.score - x.score)[0];
    take(slot.key, best.f, { why: best.why });
  });
  const items = slots.map(slot => ({ slot, ...(chosen.get(slot.key) || { f: null }) }));
  return { items, missingBottles: [...missing], cost: costOf(missing) };
}
// Alternatieven voor één plek (het wisselvenster), met filters.
function maAlternatives({ facts, a, slot, current, usedIds, filters, tasteLikes, nameOf }) {
  const ctx = { profile: "balans", wantUnknown: false, menuBottles: new Set(), levels: new Set(), tasteLikes, nameOf };
  return facts
    .filter(f => !usedIds.has(f.recipe.id) && maPasses(f, a))
    .filter(f => slot.kind === "alcoholvrij" ? f.alcoholFree : !f.alcoholFree)
    .filter(f => !filters.same || maSlotMatches(f, slot))
    .filter(f => !filters.inHouse || f.missing.length === 0)
    .filter(f => !filters.otherBase || !current || f.baseSpirit !== current.baseSpirit)
    .filter(f => !filters.lighter || !current || f.level < current.level)
    .map(f => ({ f, ...maScore(f, a, ctx) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 5);
}

function MenuOptionCard({ selected, onClick, icon, title, subtitle }) {
  return (
    <button onClick={onClick} role="radio" aria-checked={selected} className="press-scale" style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 64, boxSizing: "border-box",
      padding: "12px 14px", marginBottom: 10, textAlign: "left", cursor: "pointer", fontFamily: sans,
      background: CREAM, borderRadius: 14, border: `1.5px solid ${selected ? BOTTLE : BORDER}`,
      boxShadow: selected ? "none" : SHADOW_CARD, transition: "border-color 0.15s ease",
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: selected ? BOTTLE : PAPER_DEEP, color: selected ? "#F1D9A6" : BRASS, fontFamily: serif, fontWeight: 700, fontSize: 16,
      }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: INK }}>{title}</span>
        {subtitle && <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</span>}
      </span>
      <span aria-hidden style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
        border: `2px solid ${selected ? BOTTLE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {selected && <span style={{ width: 10, height: 10, borderRadius: "50%", background: BOTTLE }} />}
      </span>
    </button>
  );
}

function MenuToggleRow({ title, subtitle, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, boxSizing: "border-box", padding: "12px 14px", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, marginTop: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function MenuBalanceInfo() {
  return (
    <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px", margin: "4px 0 16px" }}>
      <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: "0 0 8px" }}>
        Bars bouwen een menu op vier smaakhoeken: <strong>fris &amp; verfrissend</strong>, <strong>sterk &amp; aromatisch</strong>,
        {" "}<strong>avontuurlijk</strong> en <strong>comfort</strong>, met daarnaast een volwaardige <strong>alcoholvrije</strong> optie.
        Zo vindt elke gast iets en voelt het menu niet eenzijdig.
      </p>
      <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.6, margin: 0 }}>
        Vuistregels: reken op 2 drankjes per gast het eerste uur en daarna 1 per uur. Geroerde cocktails zonder vers sap of ei
        kun je vooraf batchen, dan sta je tijdens het feest minder achter de bar.
      </p>
    </div>
  );
}

// Wisselvenster: vijf alternatieven voor één plek (of, bij "Cocktail
// toevoegen", voor een extra plek), met filters en zelf zoeken.
function MaSwapSheet({ title, subtitle, alternatives, filters, setFilters, showFilters, recipes, allIngredients, onPick, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const chip = (key, label) => {
    const on = filters[key];
    return (
      <button key={key} type="button" aria-pressed={on} onClick={() => setFilters(f => ({ ...f, [key]: !f[key] }))} style={{
        minHeight: 36, padding: "0 12px", borderRadius: 100, fontFamily: sans, fontSize: 13, cursor: "pointer",
        background: on ? BOTTLE : CREAM, color: on ? "#FBF6EA" : INK, border: `1px solid ${on ? BOTTLE : BORDER}`,
      }}>{label}</button>
    );
  };
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", maxHeight: "88vh", background: PAPER,
        borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: sans,
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "0 18px 8px", touchAction: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={close} aria-label="Sluiten" onTouchStart={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginTop: -8, marginRight: -10, background: "none", border: "none", color: INK, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px calc(env(safe-area-inset-bottom) + 20px)" }}>
          {showFilters && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "4px 0 12px" }}>
              {chip("same", "Zelfde soort")}{chip("inHouse", "Alles in huis")}{chip("otherBase", "Andere drank")}{chip("lighter", "Lichter")}
            </div>
          )}
          {alternatives.length === 0 ? (
            <p style={{ fontSize: 13.5, color: MUTED, margin: "8px 0 14px" }}>Geen alternatieven met deze filters. Zet een filter uit of zoek zelf.</p>
          ) : (
            <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "0 10px 0 12px", marginBottom: 12 }}>
              {alternatives.map(({ f, why }, i) => (
                <div key={f.recipe.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 68, borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <RecipeCircle recipe={f.recipe} allIngredients={allIngredients} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15.5, color: INK }}>{f.recipe.name}</div>
                    {why && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{why}</div>}
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: f.missingBottles.length ? BURGUNDY : SAGE }}>
                      {f.missingBottles.length ? `+${f.missingBottles.length} fles${f.missingBottles.length === 1 ? "" : "sen"} · ± €${Math.round(f.missingCost)}` : f.missing.length ? "Alleen boodschappen" : "Alles in huis"}
                    </div>
                  </div>
                  <button onClick={() => onPick(f.recipe.id)} style={{ minWidth: 56, minHeight: 40, borderRadius: 10, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Kies</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, margin: "4px 0 6px" }}>Zelf zoeken in alle recepten</div>
          <RecipePicker recipes={recipes} value={null} listId="menu-assistent-zoek" onChange={id => id && onPick(id)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
      </div>
    </div>
  ), document.body);
}

function MenuAssistentTab({ recipes, isOwned, allIngredients, ingredientLabel, favoriteRecipeIds = [], recentRecipeIds = [], tasteLikes, parties = [], onAddToShoppingList, onUseInFeestplanner, onSound }) {
  const [stored, setStored] = useStorage("thuisbar-menu-assistent-v2", MA_DEFAULTS);
  const a = {
    ...MA_DEFAULTS, ...stored,
    prefs: { ...MA_DEFAULTS.prefs, ...(stored?.prefs || {}) },
    gear: { ...MA_DEFAULTS.gear, ...(stored?.gear || {}) },
  };
  const setAnswer = (patch) => setStored({ ...a, ...patch });
  const order = a.start === "eigen" ? [6, 1, 2, 3, 4, 5, 7] : [1, 2, 3, 4, 5, 6, 7];
  const [pos, setPos] = useState(0); // 0 = startpunt, 1..7 = vragen, 8 = resultaat
  const step = pos >= 1 && pos <= MA_QUESTION_COUNT ? order[pos - 1] : null;
  const showResult = pos > MA_QUESTION_COUNT;
  const [tab, setTab] = useState("balans");
  const [locks, setLocks] = useState({});
  const [extras, setExtras] = useState([]);
  const [sheet, setSheet] = useState(null); // slotKey | "__add"
  const [sheetFilters, setSheetFilters] = useState({ same: true, inHouse: false, otherBase: false, lighter: false });
  const [customDraft, setCustomDraft] = useState("");
  const [listAdded, setListAdded] = useState(false);
  const [shareState, setShareState] = useState(null);
  const [surveyBusy, setSurveyBusy] = useState(null);
  const [showAllUseUp, setShowAllUseUp] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const goTo = (next) => { setPos(next); setShowInfo(false); window.scrollTo({ top: 0 }); };

  const setNavOverride = useContext(NavOverrideContext);
  useEffect(() => {
    if (!setNavOverride) return;
    if (showResult) {
      setNavOverride({
        label: "Vragen", title: "Menu-assistent", onBack: () => goTo(MA_QUESTION_COUNT),
        right: (
          <button onClick={() => setShowInfo(v => !v)} aria-label="Hoe werkt een gebalanceerd menu?" style={{ background: "none", border: "none", cursor: "pointer", color: BRASS, display: "flex", alignItems: "center", justifyContent: "flex-end", minWidth: 44, minHeight: 44 }}>
            <Info size={18} />
          </button>
        ),
      });
    } else {
      setNavOverride(null);
    }
  }, [setNavOverride, showResult]);
  useEffect(() => () => setNavOverride && setNavOverride(null), [setNavOverride]);

  const facts = useMemo(() => recipes.map(r => {
    const f = menuRecipeFacts(r, allIngredients, isOwned);
    return { ...f, corner: menuCornerOf(r, f.taste) };
  }), [recipes, allIngredients, isOwned]);
  const factsById = useMemo(() => new Map(facts.map(f => [f.recipe.id, f])), [facts]);
  const nameOf = (id) => (findIngredientMeta({ id }, allIngredients)?.name || id).split(" (")[0].split(" / ")[0];
  const priceOf = (id) => findIngredientMeta({ id }, allIngredients)?.bottlePrice || 20;

  // Plekken + wat er vast op staat (moet erop, vastgezet/gewisseld, toegevoegd).
  const { slots, allLocks } = useMemo(() => {
    const s = maSlots(a);
    const mustLocks = {};
    a.mustHave.forEach(id => {
      const f = factsById.get(id);
      if (!f) return;
      const free = s.filter(x => !mustLocks[x.key]);
      const target = free.find(x => maSlotMatches(f, x)) || free.find(x => (x.kind === "alcoholvrij") === f.alcoholFree);
      if (target) mustLocks[target.key] = id;
      else { const key = `m-${id}`; s.push({ key, kind: "extra" }); mustLocks[key] = id; }
    });
    extras.forEach((id, i) => { const key = `x${i}`; s.push({ key, kind: "extra" }); mustLocks[key] = id; });
    return { slots: s, allLocks: { ...mustLocks, ...locks } };
  }, [stored, factsById, extras, locks]);

  const menus = useMemo(() => {
    if (!showResult) return null;
    const out = {};
    ["veilig", "balans", "verrassend"].forEach(profile => {
      out[profile] = maBuildMenu({ facts, a, slots, locks: allLocks, profile, tasteLikes, nameOf, priceOf });
    });
    return out;
  }, [showResult, facts, stored, slots, allLocks, tasteLikes]);
  const current = menus?.[tab];
  const picked = current ? current.items.filter(m => m.f) : [];

  const missingRows = useMemo(() => {
    const map = new Map();
    picked.forEach(m => m.f.missing.forEach(ing => {
      const key = ingredientKey(ing);
      if (!map.has(key)) map.set(key, { ref: ing, label: ingredientLabel(ing), recipeNames: [] });
      map.get(key).recipeNames.push(m.f.recipe.name);
    }));
    return [...map.values()];
  }, [current]);
  useEffect(() => { setListAdded(false); }, [tab, missingRows.length]);

  // Flessen uit de voorraad (om op te maken) en flessen die vaak ontbreken.
  const ownedBottles = useMemo(() => {
    const used = new Set(facts.flatMap(f => f.bottles));
    return allIngredients.filter(i => (MENU_BOTTLE_CATS.has(i.cat) || MENU_BOTTLE_EXTRA.has(i.id)) && used.has(i.id) && isOwned({ id: i.id }));
  }, [facts, allIngredients, isOwned]);
  const commonMissing = useMemo(() => {
    const count = {};
    facts.forEach(f => f.missingBottles.forEach(id => { count[id] = (count[id] || 0) + 1; }));
    return Object.entries(count).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([id]) => id);
  }, [facts]);
  const surveyParties = parties.filter(p => p.taste_survey_id);

  // Smaaktest als startpunt: de antwoorden van de gasten vullen de vragen alvast in.
  const applySurvey = async (party) => {
    setSurveyBusy(party.id);
    const { data } = await supabase.from("party_survey_responses").select("*").eq("survey_id", party.taste_survey_id).order("created_at", { ascending: false });
    setSurveyBusy(null);
    const seen = new Set();
    const rs = (data || []).filter(r => { const n = (r.guest_name || "").trim().toLowerCase(); if (!n) return true; if (seen.has(n)) return false; seen.add(n); return true; });
    const n = rs.length;
    if (n === 0) { setAnswer({ start: "smaaktest", surveyNote: `${party.name}: nog geen reacties` }); return; }
    const pick = (group) => {
      const t = tallyChoices(rs, group);
      const min = Math.max(1, n / 3);
      return {
        like: t.filter(x => x.like >= min && x.like > x.dislike).map(x => x.key).filter(k => !k.startsWith(CUSTOM_PREFIX)),
        dislike: t.filter(x => x.dislike >= min && x.dislike > x.like).map(x => x.key).filter(k => !k.startsWith(CUSTOM_PREFIX)),
      };
    };
    const styleCount = {}, strengthCount = {};
    rs.forEach(r => {
      (r.answers?.styles || []).forEach(k => { styleCount[k] = (styleCount[k] || 0) + 1; });
      if (r.answers?.strength) strengthCount[r.answers.strength] = (strengthCount[r.answers.strength] || 0) + 1;
    });
    const avoid = new Set();
    rs.forEach(r => (r.answers?.allergies || r.dietary || []).forEach(k => (MA_ALLERGY_IDS[k] || []).forEach(id => avoid.add(id))));
    setAnswer({
      start: "smaaktest",
      surveyNote: `${party.name} · ${n} reactie${n === 1 ? "" : "s"}`,
      guests: party.guests || a.guests,
      prefs: { spirits: pick("spirits"), tastes: pick("tastes"), custom: a.prefs.custom },
      styles: Object.entries(styleCount).filter(([, c]) => c >= n / 3).map(([k]) => k),
      strengths: ["licht", "middel", "sterk"].filter(k => (strengthCount[k] || 0) >= n / 4),
      alcoholvrijCount: strengthCount.alcoholvrij ? Math.max(1, a.alcoholvrijCount) : a.alcoholvrijCount,
      avoidIds: [...avoid],
    });
  };

  const startResult = () => {
    onSound?.("chime");
    setLocks({});
    setTab("balans");
    goTo(MA_QUESTION_COUNT + 1);
  };

  // ---------- Kleine bouwstenen (functies, geen componenten: zo houdt
  // een invoerveld zijn focus tijdens het typen) ----------
  const stepperRow = (title, sub, value, onMinus, onPlus, label, display) => (
    <div key={title} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 72, borderTop: `1px solid ${BORDER}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
      <button aria-label={`Minder ${label}`} onClick={onMinus} style={stepBtn}>−</button>
      <span style={{ minWidth: 40, textAlign: "center", fontSize: display ? 14 : 20, fontWeight: 700, color: BOTTLE }}>{display || value}</span>
      <button aria-label={`Meer ${label}`} onClick={onPlus} style={stepBtn}>+</button>
    </div>
  );
  const prefState = (group, key) => a.prefs[group].like.includes(key) ? "like" : a.prefs[group].dislike.includes(key) ? "dislike" : null;
  const cyclePref = (group, key) => {
    const g = a.prefs[group];
    const like = g.like.filter(k => k !== key), dislike = g.dislike.filter(k => k !== key);
    if (g.like.includes(key)) dislike.push(key); else if (!g.dislike.includes(key)) like.push(key);
    setAnswer({ prefs: { ...a.prefs, [group]: { like, dislike } } });
  };
  const prefChip = (group, key, label) => {
    const st = prefState(group, key);
    return (
      <button key={group + key} type="button" onClick={() => cyclePref(group, key)}
        aria-label={`${label}${st === "like" ? ", wel" : st === "dislike" ? ", liever niet" : ""}`} style={{
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, fontFamily: sans, fontSize: 14.5, cursor: "pointer",
          ...(st === "like" ? { background: BOTTLE, border: `1px solid ${BOTTLE}`, color: "#FBF6EA" }
            : st === "dislike" ? { background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED }
            : { background: CREAM, border: `1px solid ${BORDER}`, color: INK }),
        }}>
        {st === "like" && <Check size={14} color="#F1D9A6" strokeWidth={2.6} />}
        {st === "dislike" && <X size={13} strokeWidth={2.2} />}
        <span style={{ textDecoration: st === "dislike" ? "line-through" : "none" }}>{label}</span>
      </button>
    );
  };
  const toggleChip = (key, label, on, onClick) => (
    <button key={key} type="button" aria-pressed={on} onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, fontFamily: sans, fontSize: 14.5, cursor: "pointer",
      background: on ? BOTTLE : CREAM, color: on ? "#FBF6EA" : INK, border: `1px solid ${on ? BOTTLE : BORDER}`,
    }}>
      {on && <Check size={14} color="#F1D9A6" strokeWidth={2.6} />}{label}
    </button>
  );
  const sectionLabel = (t) => <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: MUTED, margin: "0 0 8px" }}>{t}</div>;
  const segmented = (options, value, onChange, label) => (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", padding: 3, borderRadius: 12, background: PAPER_DEEP }}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} style={{
          flex: 1, minHeight: 42, border: "none", borderRadius: 9, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer",
          background: value === v ? CREAM : "transparent", color: value === v ? INK : MUTED, boxShadow: value === v ? "0 1px 3px rgba(43,38,32,0.15)" : "none",
        }}>{l}</button>
      ))}
    </div>
  );

  // ---------- Resultaat ----------
  if (showResult && current) {
    const budget = parseFloat(String(a.budget).replace(",", ".")) || null;
    const makeable = picked.filter(m => m.f.missing.length === 0).length;
    const batchCount = picked.filter(m => m.f.batchable).length;
    const drinks = Math.round(a.guests * 2.5);
    const usedIds = new Set(picked.map(m => m.f.recipe.id));
    const sheetSlot = sheet === "__add" ? { key: "__add", kind: "extra" } : slots.find(s => s.key === sheet);
    const sheetCurrent = sheet && sheet !== "__add" ? current.items.find(m => m.slot.key === sheet)?.f : null;
    const alternatives = sheetSlot ? maAlternatives({ facts, a, slot: sheetSlot, current: sheetCurrent, usedIds, filters: sheet === "__add" ? { same: false } : sheetFilters, tasteLikes, nameOf }) : [];
    const pickFromSheet = (id) => {
      onSound?.("pop");
      if (sheet === "__add") setExtras(x => [...x, id]);
      else setLocks(l => ({ ...l, [sheet]: id }));
      setSheet(null);
    };
    const toggleLock = (m) => {
      onSound?.("tick");
      const id = m.f.recipe.id;
      if (a.mustHave.includes(id) && allLocks[m.slot.key] === id && !locks[m.slot.key]) { setAnswer({ mustHave: a.mustHave.filter(x => x !== id) }); return; }
      setLocks(l => { const next = { ...l }; if (next[m.slot.key]) delete next[m.slot.key]; else next[m.slot.key] = id; return next; });
    };
    const removeExtra = (slotKey) => {
      const idx = Number(slotKey.slice(1));
      setExtras(x => x.filter((_, i) => i !== idx));
    };
    const shareMenu = async () => {
      const names = picked.map(m => m.f.recipe.name);
      if (names.length === 0) return;
      onSound?.("share");
      const text = `Het cocktailmenu voor vanavond:\n${names.map(n => `• ${n}`).join("\n")}`;
      const url = publicAppUrl(`menu=${picked.map(m => m.f.recipe.id).join(",")}`);
      const result = await shareLink({ title: "Mijn Thuisbar: menu", text: "Bekijk het cocktailmenu voor vanavond!", url, fallbackText: text });
      if (result === "cancelled") return;
      setShareState(result === "no-url" ? "failed" : result);
      setTimeout(() => setShareState(null), 2500);
    };
    const iconBtn = (active) => ({ width: 40, height: 44, border: "none", background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: active ? BRASS : MUTED, padding: 0 });

    return (
      <div style={{ fontFamily: sans }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h1 style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.15 }}>Jouw menu</h1>
          <button onClick={() => goTo(0)} style={{ background: "none", border: "none", color: BRASS, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44, padding: "0 0 0 8px" }}>Opnieuw</button>
        </div>
        {showInfo && <MenuBalanceInfo />}
        <div style={{ marginBottom: 12 }}>
          {segmented([["veilig", "Veilig"], ["balans", "Balans"], ["verrassend", "Verrassend"]], tab, v => { onSound?.("tick"); setTab(v); }, "Kies een menu")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: BOTTLE_DARK, color: "#FBF6EA", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {picked.length} cocktail{picked.length === 1 ? "" : "s"} · {current.missingBottles.length === 0 ? "niets kopen" : `${current.missingBottles.length} fles${current.missingBottles.length === 1 ? "" : "sen"} kopen`}
            </div>
            {current.missingBottles.length > 0 && (
              <div style={{ fontSize: 12.5, color: "#C9D2CB", marginTop: 2 }}>{current.missingBottles.map(id => nameOf(id).toLowerCase()).join(", ")} · ongeveer €{Math.round(current.cost)}</div>
            )}
          </div>
          {budget != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#F1D9A6", border: "1px solid #F1D9A6", borderRadius: 100, padding: "4px 10px", whiteSpace: "nowrap" }}>
              {current.cost <= budget ? "binnen budget" : "boven budget"}
            </span>
          )}
        </div>

        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW_CARD, padding: "0 4px 0 10px" }}>
          {current.items.map((m, i) => {
            const { slot, f, why } = m;
            if (!f) {
              return (
                <div key={slot.key} style={{ padding: "12px 4px", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>{maSlotTitle(slot)}</div>
                  <div style={{ fontSize: 13.5, color: INK, marginTop: 3, lineHeight: 1.45 }}>Niets gevonden dat bij je antwoorden past. Zet een filter ruimer, verhoog het aantal flessen of kies zelf.</div>
                  <button onClick={() => setSheet(slot.key)} style={{ marginTop: 4, background: "none", border: "none", color: BRASS, fontWeight: 700, fontSize: 13.5, cursor: "pointer", padding: 0, minHeight: 44, fontFamily: sans }}>Zelf kiezen</button>
                </div>
              );
            }
            const isLocked = !!allLocks[slot.key];
            const isExtra = slot.kind === "extra" && slot.key.startsWith("x");
            return (
              <div key={slot.key} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 72, padding: "8px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                <RecipeCircle recipe={f.recipe} allIngredients={allIngredients} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: slot.kind === "corner" ? MENU_CORNER_COLORS[slot.corner] : MUTED }}>{maSlotTitle(slot)}</div>
                  <div style={{ fontFamily: serif, fontSize: 16.5, fontWeight: 700, color: INK, lineHeight: 1.2, marginTop: 1 }}>{f.recipe.name}</div>
                  {why && <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>{why}</div>}
                  {f.missing.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: BURGUNDY, marginTop: 1 }}>Mist: {f.missing.map(ing => ingredientLabel(ing)).join(", ")}</div>}
                </div>
                <button onClick={() => { setSheetFilters({ same: true, inHouse: false, otherBase: false, lighter: false }); setSheet(slot.key); }} aria-label={`Wissel ${f.recipe.name}`} style={iconBtn(false)}><Shuffle size={18} /></button>
                {isExtra ? (
                  <button onClick={() => removeExtra(slot.key)} aria-label={`${f.recipe.name} weghalen`} style={iconBtn(false)}><X size={18} /></button>
                ) : (
                  <button onClick={() => toggleLock(m)} aria-label={isLocked ? `Maak ${f.recipe.name} los` : `Zet ${f.recipe.name} vast`} aria-pressed={isLocked} style={iconBtn(isLocked)}>
                    <Lock size={17} strokeWidth={isLocked ? 2.4 : 1.8} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={() => setSheet("__add")} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", minHeight: 46, marginTop: 10, marginBottom: 16,
          border: "1px dashed #B8A98A", borderRadius: 12, background: "transparent", color: BRASS, fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
        }}><Plus size={15} /> Cocktail toevoegen</button>

        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW_CARD, padding: "4px 14px", marginBottom: 16 }}>
          {[
            { icon: <Check size={16} strokeWidth={2.4} />, content: <span><strong>{makeable} van {picked.length}</strong> kun je nu maken</span> },
            missingRows.length > 0 && {
              icon: <ShoppingCart size={16} />, color: BURGUNDY,
              content: <span><span style={{ display: "block" }}>Nog nodig</span><span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{missingRows.map(r => r.label).join(", ")}</span></span>,
              action: listAdded ? (
                <span className="success-pop" style={{ display: "flex", alignItems: "center", gap: 4, color: SAGE, fontSize: 13, fontWeight: 700, minHeight: 36 }}><Check size={14} strokeWidth={3} /> Op lijst</span>
              ) : (
                <button onClick={() => { onAddToShoppingList(missingRows.map(r => ({ ref: r.ref, recipeNames: r.recipeNames }))); onSound?.("tick"); setListAdded(true); }}
                  style={{ background: BOTTLE, color: "#FBF6EA", border: "none", borderRadius: 100, padding: "0 14px", minHeight: 36, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: sans, flexShrink: 0 }}>
                  Op lijst
                </button>
              ),
            },
            { icon: <Clock size={16} />, content: <span><strong>{batchCount} van {picked.length}</strong> kun je vooraf maken</span> },
            { icon: <Users size={16} />, content: <span>Voor {a.guests} {a.guests === 1 ? "gast" : "gasten"}: <strong>± {drinks} drankjes</strong></span> },
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, fontSize: 14, color: INK }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: PAPER_DEEP, color: row.color || SAGE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{row.icon}</span>
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{row.content}</div>
              {row.action}
            </div>
          ))}
        </div>

        <button onClick={() => { onSound?.("chime"); onUseInFeestplanner(picked.map(m => m.f.recipe.id), a.guests); }} disabled={picked.length === 0} className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, borderRadius: 14,
          background: BOTTLE_DARK, color: "#FBF6EA", border: "none", fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA, marginBottom: 10,
        }}>
          <PartyPopper size={17} /> Naar de feestplanner
        </button>
        <button onClick={shareMenu} disabled={picked.length === 0} className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, borderRadius: 14,
          background: "rgba(184,134,46,0.18)", color: INK, border: "none", fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}>
          <Share2 size={17} color={BRASS} /> {shareState === "copied" ? "Gekopieerd" : shareState === "shared" ? "Gedeeld" : shareState === "failed" ? "Delen lukte niet" : "Deel menu"}
        </button>

        {sheet && sheetSlot && (
          <MaSwapSheet
            title={sheet === "__add" ? "Cocktail toevoegen" : `Wissel ${sheetCurrent?.recipe.name || ""}`}
            subtitle={sheet === "__add" ? "Passend bij je antwoorden" : `Plek: ${maSlotTitle(sheetSlot).toLowerCase()}`}
            alternatives={alternatives} filters={sheetFilters} setFilters={setSheetFilters} showFilters={sheet !== "__add"}
            recipes={recipes} allIngredients={allIngredients} onPick={pickFromSheet} onClose={() => setSheet(null)} />
        )}
      </div>
    );
  }

  // ---------- Startpunt en vragen ----------
  const stepBtn = { width: 44, height: 44, borderRadius: 12, border: `1px solid ${BORDER}`, background: PAPER, color: BOTTLE, fontSize: 20, fontWeight: 700, fontFamily: sans, cursor: "pointer" };
  let title = "", sub = "", body = null;

  if (pos === 0) {
    title = "Waar wil je beginnen?";
    sub = "Niet verplicht. Je kunt dit overslaan en meteen de vragen doen.";
    const startOpt = (key, icon, t, s) => (
      <MenuOptionCard key={key} selected={a.start === key} onClick={() => setAnswer({ start: a.start === key ? null : key, ...(key === "verras" && a.start !== key ? { surprise: Math.max(a.surprise, 70), variety: true } : {}) })} icon={icon} title={t} subtitle={s} />
    );
    body = (
      <>
        {startOpt("eigen", <Pencil size={17} />, "Ik heb al cocktails in gedachten", "Kies er een paar, de assistent vult aan")}
        {startOpt("thema", <ListChecks size={17} />, "Bouw rond een thema", "Bijvoorbeeld een gin-avond of een zomerse borrel")}
        {a.start === "thema" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "-2px 0 12px" }}>
            {MA_THEMES.map(t => toggleChip(t.key, t.label, a.theme === t.key, () => setAnswer({ theme: a.theme === t.key ? null : t.key })))}
          </div>
        )}
        {startOpt("smaaktest", <Users size={17} />, "Gebruik de smaaktest", surveyParties.length ? "De antwoorden van je gasten vullen de vragen in" : "Maak eerst een smaaktest aan bij een feest")}
        {a.start === "smaaktest" && surveyParties.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "-2px 0 12px" }}>
            {surveyParties.map(p => toggleChip(p.id, surveyBusy === p.id ? "Bezig…" : p.name, (a.surveyNote || "").startsWith(p.name), () => applySurvey(p)))}
          </div>
        )}
        {a.start === "smaaktest" && a.surveyNote && <p style={{ fontSize: 12.5, color: SAGE, fontWeight: 600, margin: "-4px 0 12px" }}>Ingevuld uit de smaaktest: {a.surveyNote}</p>}
        {startOpt("verras", <Sparkles size={17} />, "Verras me", "Een gevarieerd menu met minder bekende cocktails")}
      </>
    );
  } else if (step === 1) {
    title = "Hoeveel cocktails?";
    sub = "Kies vrij tussen 1 en 10. De alcoholvrije tellen mee.";
    const advice = a.guests <= 6 ? "3 tot 4" : a.guests <= 15 ? "4 tot 6" : "5 tot 7";
    body = (
      <>
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "0 14px", marginTop: -1 }}>
          <div style={{ marginTop: -1 }}>
            {stepperRow("Cocktails", "tussen 1 en 10", a.count, () => setAnswer({ count: Math.max(1, a.count - 1), alcoholvrijCount: Math.min(a.alcoholvrijCount, Math.max(1, a.count - 1)) }), () => setAnswer({ count: Math.min(10, a.count + 1) }), "cocktails")}
            {stepperRow("Waarvan alcoholvrij", "0 tot 3", a.alcoholvrijCount, () => setAnswer({ alcoholvrijCount: Math.max(0, a.alcoholvrijCount - 1) }), () => setAnswer({ alcoholvrijCount: Math.min(3, a.count, a.alcoholvrijCount + 1) }), "alcoholvrij")}
            {stepperRow("Gasten", "voor de hoeveelheden", a.guests, () => setAnswer({ guests: Math.max(1, a.guests - 1) }), () => setAnswer({ guests: Math.min(100, a.guests + 1) }), "gasten")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, padding: "12px 14px", borderRadius: 12, background: PAPER_DEEP, fontSize: 13.5, lineHeight: 1.45, color: INK }}>
          <Info size={17} color={BRASS} style={{ flexShrink: 0 }} />
          <span>Voor {a.guests} {a.guests === 1 ? "gast" : "gasten"} raden we {advice} cocktails aan. Je schenkt er zo'n {Math.round(a.guests * 2.5)}.</span>
        </div>
      </>
    );
  } else if (step === 2) {
    title = "Wat voor menu wordt het?";
    sub = "Variatie verdeelt het menu over fris, sterk, verrassend en zacht. Liever één richting? Zet het uit en kies zelf.";
    body = (
      <>
        <MenuToggleRow title="Zorg voor variatie" subtitle="Van elke soort iets" checked={a.variety} onChange={v => setAnswer({ variety: v })} />
        {!a.variety && (
          <>
            <div style={{ height: 14 }} />
            {sectionLabel("KIES DE STIJLEN")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {SURVEY_STYLES.map(s => {
                const on = a.styles.includes(s.key);
                return (
                  <button key={s.key} type="button" aria-pressed={on} onClick={() => setAnswer({ styles: on ? a.styles.filter(k => k !== s.key) : [...a.styles, s.key] })} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px 12px", borderRadius: 14,
                    background: CREAM, border: `1.5px solid ${on ? BOTTLE : BORDER}`, fontFamily: sans, cursor: "pointer",
                  }}>
                    <SurveyGlass kind={s.glass} color={on ? "#1F3D36" : "#8A8171"} />
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{s.label}</span>
                    <span style={{ fontSize: 12, color: MUTED }}>{s.example.replace(/^zoals een /, "")}</span>
                  </button>
                );
              })}
            </div>
            {a.styles.length === 0 && <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0" }}>Geen stijl gekozen? Dan zorgt de assistent toch voor variatie.</p>}
          </>
        )}
      </>
    );
  } else if (step === 3) {
    title = "Drank en smaken";
    sub = "Tik één keer voor wel, twee keer voor liever niet. Niets aangetikt is ook goed.";
    const addCustom = () => {
      const t = customDraft.trim().slice(0, 40);
      if (!t) return;
      const key = CUSTOM_PREFIX + t;
      if (!a.prefs.custom.like.includes(key) && !a.prefs.custom.dislike.includes(key)) {
        setAnswer({ prefs: { ...a.prefs, custom: { like: [...a.prefs.custom.like, key], dislike: a.prefs.custom.dislike } } });
      }
      setCustomDraft("");
    };
    const customs = [...a.prefs.custom.like, ...a.prefs.custom.dislike];
    body = (
      <>
        {a.surveyNote && a.start === "smaaktest" && <p style={{ fontSize: 12.5, color: SAGE, fontWeight: 600, margin: "-8px 0 12px" }}>Ingevuld uit de smaaktest: {a.surveyNote}</p>}
        {sectionLabel("STERKE DRANK")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
          {SURVEY_SPIRITS.map(o => prefChip("spirits", o.key, o.label))}
        </div>
        {sectionLabel("SMAKEN")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {SURVEY_TASTES.map(o => prefChip("tastes", o.key, o.label))}
          {customs.map(k => prefChip("custom", k, k.slice(CUSTOM_PREFIX.length)))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input value={customDraft} onChange={e => setCustomDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Iets anders? Bijv. Calvados of lychee" aria-label="Zelf een drank of smaak toevoegen" maxLength={40} enterKeyHint="done"
            style={{ flex: 1, minWidth: 0, height: 46, boxSizing: "border-box", padding: "0 16px", borderRadius: 100, border: `1px solid ${BORDER}`, background: CREAM, color: INK, fontSize: 16, fontFamily: sans, outline: "none" }} />
          <button type="button" onClick={addCustom} aria-label="Toevoegen" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, flexShrink: 0, borderRadius: "50%", border: "none", background: BOTTLE, color: "#FBF6EA", cursor: "pointer" }}><Plus size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, margin: "8px 0 0" }}>De assistent zoekt recepten met wat je toevoegt.</p>
        {a.avoidIds.length > 0 && (
          <p style={{ fontSize: 12.5, color: INK, margin: "12px 0 0" }}>
            Vermeden vanwege allergieën: {[...new Set(a.avoidIds.map(id => nameOf(id).toLowerCase()))].join(", ")}.{" "}
            <button onClick={() => setAnswer({ avoidIds: [] })} style={{ background: "none", border: "none", color: BRASS, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: sans, fontSize: 12.5 }}>Wissen</button>
          </p>
        )}
      </>
    );
  } else if (step === 4) {
    title = "Hoe sterk mag het zijn?";
    sub = "Meerdere kiezen mag: dan komt er van elk iets op het menu. Niets gekozen = alles mag.";
    const levels = [["licht", "Licht", "Gin-Tonic", 1], ["middel", "Middel", "Margarita", 2], ["sterk", "Sterk", "Martini", 3]];
    const unknown = Math.round((a.count - a.alcoholvrijCount) * a.surprise / 100);
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 26 }}>
          {levels.map(([k, l, ex, lv]) => {
            const on = a.strengths.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => setAnswer({ strengths: on ? a.strengths.filter(x => x !== k) : [...a.strengths, k] })} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px 12px", borderRadius: 14,
                background: CREAM, border: `1.5px solid ${on ? BOTTLE : BORDER}`, fontFamily: sans, cursor: "pointer", color: INK,
              }}>
                <span style={{ display: "inline-flex", gap: 4 }} aria-hidden="true">{[1, 2, 3].map(n => <span key={n} style={{ width: 7, height: 7, borderRadius: "50%", background: n <= lv ? BRASS : BORDER }} />)}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700 }}>{l}</span>
                <span style={{ fontSize: 11.5, color: MUTED }}>{ex}</span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: INK, marginBottom: 6 }}>Bekend of verrassend?</div>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED, margin: "0 0 12px" }}>Hoeveel van het menu mag onbekend zijn voor je gasten?</p>
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "14px 14px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: INK, marginBottom: 4 }}><span>Alles bekend</span><span>Alles nieuw</span></div>
          <input type="range" min={0} max={100} step={10} value={a.surprise} onChange={e => setAnswer({ surprise: Number(e.target.value) })} aria-label="Hoeveel van het menu mag onbekend zijn"
            style={{ width: "100%", accentColor: "#1F3D36", minHeight: 36 }} />
          <div style={{ fontSize: 13.5, color: INK, marginTop: 2 }}>Ongeveer {unknown} van de {Math.max(0, a.count - a.alcoholvrijCount)} cocktails {unknown === 1 ? "is" : "zijn"} minder bekend.</div>
        </div>
      </>
    );
  } else if (step === 5) {
    title = "Hoeveel werk mag het zijn?";
    sub = "Op een feest sta je liever niet de hele avond te shaken.";
    const gear = [["shaker", "Shaker"], ["blender", "Blender"], ["crushed", "Crushed ijs"], ["eggs", "Eieren voor schuim"]];
    body = (
      <>
        {segmented([["snel", "Snel"], ["werk", "Mag wat werk"], ["bar", "Achter de bar"]], a.effort, v => setAnswer({ effort: v }), "Moeite")}
        <div style={{ fontSize: 19, fontWeight: 700, color: INK, margin: "22px 0 10px" }}>Wat heb je in huis?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
          {gear.map(([k, l]) => toggleChip(k, l, a.gear[k], () => setAnswer({ gear: { ...a.gear, [k]: !a.gear[k] } })))}
        </div>
        <MenuToggleRow title="Vooraf te maken in een kan" subtitle="Cocktails die je van tevoren mengt en koud zet" checked={a.batch} onChange={v => setAnswer({ batch: v })} />
        <MenuToggleRow title="Geen zelfgemaakte siropen" subtitle="Alleen wat je kant-en-klaar kunt kopen" checked={a.noHomemade} onChange={v => setAnswer({ noHomemade: v })} />
      </>
    );
  } else if (step === 6) {
    title = "Moeten er cocktails op?";
    sub = "Zoveel als je wilt, uit alle recepten. De assistent vult de rest aan.";
    const favs = [...new Set([...favoriteRecipeIds, ...recentRecipeIds])].filter(id => !a.mustHave.includes(id)).map(id => recipes.find(r => r.id === id)).filter(Boolean).slice(0, 6);
    body = (
      <>
        <RecipePicker recipes={recipes.filter(r => !a.mustHave.includes(r.id))} value={null} listId="menu-assistent-must"
          onChange={id => id && !a.mustHave.includes(id) && setAnswer({ mustHave: [...a.mustHave, id] })} style={{ width: "100%", boxSizing: "border-box" }} />
        {a.mustHave.length > 0 && (
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "0 4px 0 12px", marginTop: 12 }}>
            {a.mustHave.map((id, i) => {
              const f = factsById.get(id);
              if (!f) return null;
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                  <RecipeCircle recipe={f.recipe} allIngredients={allIngredients} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 16, color: INK }}>{f.recipe.name}</div>
                    <div style={{ fontSize: 12.5, color: f.missingBottles.length ? BURGUNDY : MUTED, marginTop: 1 }}>
                      {f.missingBottles.length ? `${f.missingBottles.length} fles kopen: ${f.missingBottles.map(b => nameOf(b).toLowerCase()).join(", ")}` : f.missing.length ? "Alleen boodschappen" : "Alles in huis"}
                    </div>
                  </div>
                  <button onClick={() => setAnswer({ mustHave: a.mustHave.filter(x => x !== id) })} aria-label={`${f.recipe.name} verwijderen`} style={{ width: 44, height: 44, border: "none", background: "none", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
                </div>
              );
            })}
          </div>
        )}
        {favs.length > 0 && (
          <>
            <div style={{ height: 16 }} />
            {sectionLabel("SNEL TOEVOEGEN UIT JE FAVORIETEN")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {favs.map(r => (
                <button key={r.id} onClick={() => setAnswer({ mustHave: [...a.mustHave, r.id] })} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, background: CREAM, border: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14, color: INK, cursor: "pointer" }}>
                  <Plus size={13} color={BRASS} /> {r.name}
                </button>
              ))}
            </div>
          </>
        )}
      </>
    );
  } else if (step === 7) {
    title = "Wat wil je bijkopen?";
    sub = "Alleen flessen tellen mee. Sap, citroenen en frisdrank zijn gewone boodschappen.";
    const useUpList = showAllUseUp ? ownedBottles : ownedBottles.slice(0, 10);
    body = (
      <>
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "0 14px", marginBottom: 18 }}>
          <div style={{ marginTop: -1 }}>
            {stepperRow("Maximaal flessen", a.maxBottles >= MA_NO_LIMIT ? "geen grens" : "0 = alleen wat je in huis hebt", a.maxBottles,
              () => setAnswer({ maxBottles: Math.max(0, a.maxBottles - 1) }), () => setAnswer({ maxBottles: Math.min(MA_NO_LIMIT, a.maxBottles + 1) }), "flessen",
              a.maxBottles >= MA_NO_LIMIT ? "geen" : null)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 72, borderTop: `1px solid ${BORDER}` }}>
            <label htmlFor="ma-budget" style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 15.5, fontWeight: 700, color: INK }}>Budget (optioneel)</span>
              <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2 }}>voor de flessen samen</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 4, height: 44, padding: "0 12px", borderRadius: 12, border: `1px solid ${BORDER}`, background: PAPER, width: 100, boxSizing: "border-box" }}>
              <span style={{ fontSize: 16, color: MUTED }}>€</span>
              <input id="ma-budget" value={a.budget} onChange={e => setAnswer({ budget: e.target.value.replace(/[^\d,.]/g, "").slice(0, 5) })} inputMode="decimal" placeholder="geen"
                style={{ width: "100%", border: "none", background: "transparent", fontSize: 17, fontWeight: 700, color: BOTTLE, fontFamily: sans, outline: "none" }} />
            </div>
          </div>
        </div>
        {ownedBottles.length > 0 && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: INK, marginBottom: 4 }}>Flessen om op te maken</div>
            <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 10px" }}>Deze krijgen voorrang op het menu.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 6 }}>
              {useUpList.map(i => toggleChip(i.id, i.name.split(" (")[0], a.useUp.includes(i.id), () => setAnswer({ useUp: a.useUp.includes(i.id) ? a.useUp.filter(x => x !== i.id) : [...a.useUp, i.id] })))}
            </div>
            {ownedBottles.length > 10 && (
              <button onClick={() => setShowAllUseUp(v => !v)} style={{ background: "none", border: "none", color: BRASS, fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: 0, minHeight: 40 }}>
                {showAllUseUp ? "Minder tonen" : `Alle ${ownedBottles.length} flessen tonen`}
              </button>
            )}
            <div style={{ height: 12 }} />
          </>
        )}
        {commonMissing.length > 0 && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: INK, marginBottom: 4 }}>Liever niet kopen</div>
            <p style={{ fontSize: 13.5, color: MUTED, margin: "0 0 10px" }}>Flessen die je niet hebt en vaak in recepten zitten.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {commonMissing.map(id => {
                const on = a.noBuy.includes(id);
                return (
                  <button key={id} type="button" aria-pressed={on} onClick={() => setAnswer({ noBuy: on ? a.noBuy.filter(x => x !== id) : [...a.noBuy, id] })} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 14px", borderRadius: 100, fontFamily: sans, fontSize: 14.5, cursor: "pointer",
                    ...(on ? { background: "transparent", border: `1px dashed ${MUTED}`, color: MUTED } : { background: CREAM, border: `1px solid ${BORDER}`, color: INK }),
                  }}>
                    {on && <X size={13} strokeWidth={2.2} />}<span style={{ textDecoration: on ? "line-through" : "none" }}>{nameOf(id)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  const isLast = pos === MA_QUESTION_COUNT;
  return (
    <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", minHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 154px)", marginBottom: -62 }}>
      {pos > 0 && (
        <>
          <div style={{ display: "flex", gap: 5, marginBottom: 14 }} aria-hidden>
            {Array.from({ length: MA_QUESTION_COUNT }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < pos ? BOTTLE : BORDER, transition: "background 0.2s ease" }} />
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>Vraag {pos} van {MA_QUESTION_COUNT}</div>
        </>
      )}
      <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.2 }}>{title}</h1>
      <p style={{ fontSize: 14, color: MUTED, margin: "6px 0 20px", lineHeight: 1.45 }}>{sub}</p>
      <div key={`${pos}-${step}`} className="tab-fade">{body}</div>

      <div className="menu-assist-footer" style={{
        marginTop: "auto", padding: "18px 0 8px", display: "flex", flexDirection: "column", gap: 4,
        position: "sticky", bottom: "calc(env(safe-area-inset-bottom) + 80px)", zIndex: 5,
        background: `linear-gradient(180deg, transparent 0, ${PAPER} 16px)`,
      }}>
        <div style={{ display: "flex", gap: 10 }}>
          {pos > 0 && (
            <button onClick={() => goTo(pos - 1)} className="press-scale" style={{
              flex: "0 0 32%", minHeight: 52, borderRadius: 14, border: "none", background: "rgba(184,134,46,0.22)", color: INK,
              fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>Terug</button>
          )}
          <button onClick={() => (isLast ? startResult() : goTo(pos + 1))} className="press-scale" style={{
            flex: 1, minHeight: 52, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: "#FBF6EA",
            fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
          }}>
            {isLast ? "Stel menu's samen" : "Volgende"}
          </button>
        </div>
        {pos === 0 && (
          <button onClick={() => { setAnswer({ start: null, theme: null }); goTo(1); }} style={{ minHeight: 44, background: "none", border: "none", color: MUTED, fontFamily: sans, fontSize: 14.5, cursor: "pointer" }}>Overslaan, gewoon beginnen</button>
        )}
        {pos > 0 && !isLast && (
          <button onClick={() => goTo(pos + 1)} style={{ minHeight: 44, background: "none", border: "none", color: MUTED, fontFamily: sans, fontSize: 14.5, cursor: "pointer" }}>Overslaan</button>
        )}
      </div>
    </div>
  );
}

// "3.0" voor een heel getal, "3.25"/"3.5"/"3.75" voor een kwart-ster —
// overal waar een beoordeling getoond wordt, i.p.v. het vaste "{rating}.0"
// dat alleen bij hele sterren klopte.
// Beoordelingen en gemiddelden overal hetzelfde: hele getallen zonder
// decimaal ("4"), anders één decimaal met komma ("3,8" — ook 2.25 → "2,3").
function formatRating(value) {
  const v = Number(value) || 0;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1).replace(".", ",");
}
function formatDecimal1(value) {
  return (Number(value) || 0).toFixed(1).replace(".", ",");
}

// Puur de visuele sterrenrij (met eventuele kwart-vulling) + het getal —
// tikken op een ster zet 'm meteen op een heel getal; de fijnafstemming in
// kwarten gebeurt via een los schuifbalkje eronder (zie de check-in-sheet),
// want precies op een kwart ster tikken is op een telefoon niet te doen.
// Eén notitieregel die vanzelf meegroeit met de tekst — geen zichtbare rand
// of resize-greep, past bij het vlakke, kaderloze veldontwerp van de
// check-in-sheet.
function AutoGrowTextField({ value, onChange, placeholder, bare }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
    // Groeit het veld tijdens het typen, dan blijft de onderkant (waar je
    // typt) zichtbaar boven het toetsenbord.
    if (document.activeElement === ref.current) revealInSheet(ref.current);
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={1} style={{
      width: "100%", border: "none", outline: "none", resize: "none", background: bare ? "transparent" : PAPER, borderRadius: 12,
      padding: bare ? "10px 0" : "13px 14px", fontSize: 15, fontFamily: systemFont, color: INK, boxSizing: "border-box",
      lineHeight: 1.4, overflow: "hidden", display: "block", scrollMarginTop: 70, scrollMarginBottom: 24,
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
function RecipeSearchWithPhotos({ recipes, value, onChange, onSelect, allIngredients, recent, onOpenChange }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onOpenChange?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onOpenChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const wrapRef = useRef(null);
  const dropdownMaxH = useDropdownMaxHeight(wrapRef, open, 260);
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

  const pick = (r) => { onSelect(r); setOpen(false); document.activeElement?.blur?.(); };
  const flatFieldStyle = {
    width: "100%", border: "none", outline: "none", background: PAPER, borderRadius: 12,
    padding: "13px 14px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box",
  };

  return (
    <div ref={wrapRef} data-kb-scope style={{ position: "relative" }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Zoek een cocktail…" enterKeyHint="next" autoCapitalize="words" style={flatFieldStyle} />
      {open && filtered.length > 0 && (
        // In de flow i.p.v. absoluut zwevend: in het check-in-venster viel een
        // zwevende lijst onder de Inchecken-knop weg. Nu duwt de lijst de rest
        // omlaag en schuift het zoekveld bovenaan (zie useKeyboardBehavior).
        <div style={{
          position: "relative", marginTop: 6, background: CREAM,
          borderRadius: 14, maxHeight: dropdownMaxH, overflowY: "auto", overscrollBehavior: "contain",
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
// Smaaklabels bij het inchecken ("Wat proefde je?"). De eerste vijf zijn de
// bestaande smaaktags met exact dezelfde betekenis (smaakprofiel,
// aanbevelingen, vriendenfeed tellen alleen die vijf — zie TASTE_META);
// de rest zijn extra beschrijvende labels die gewoon mee worden opgeslagen
// in taste_tags en in de check-in zichtbaar zijn.
const CHECKIN_TASTE_TAGS = [
  { key: "bitter", label: "Bitter", emoji: "🍫" },
  { key: "sterk", label: "Sterk", emoji: "🥃" },
  { key: "zoet", label: "Zoet", emoji: "🍬" },
  { key: "zuur", label: "Zuur", emoji: "🍋" },
  { key: "fruitig", label: "Fruitig", emoji: "🍓" },
  { key: "kruidig", label: "Kruidig", emoji: "🌿" },
  { key: "fris", label: "Fris", emoji: "🧊" },
  { key: "romig", label: "Romig", emoji: "🥛" },
  { key: "licht", label: "Licht", emoji: "🪶" },
  { key: "rokerig", label: "Rokerig", emoji: "🔥" },
];
const CHECKIN_TASTE_META = Object.fromEntries(CHECKIN_TASTE_TAGS.map(t => [t.key, t]));

// Voorzet voor de smaaklabels bij een herkend recept: de familie-heuristiek
// (FAMILY_TASTE, gewicht ≥ 0,6) plus een paar duidelijke ingrediënt-signalen
// — zo krijgt een Negroni (familie "Spirit-forward" = alleen sterk) via
// Campari en zoete vermouth ook Bitter en Kruidig. De gebruiker corrigeert.
const TASTE_INGREDIENT_HINTS = {
  bitter: ["campari", "aperol", "amaro_nonino", "cynar", "fernet_branca"],
  kruidig: ["sweet_vermouth", "yellow_chartreuse", "green_chartreuse", "benedictine", "ginger_beer", "ginger_wine", "ginger_root", "honey_ginger_syrup"],
  rokerig: ["mezcal"],
  romig: ["heavy_cream", "whipped_cream", "coconut_cream", "irish_cream", "milk"],
  fris: ["mint", "cucumber", "soda_water", "tonic", "grapefruit_soda", "prosecco"],
};
function suggestTasteTags(recipe) {
  if (!recipe) return [];
  const tags = new Set();
  Object.entries(FAMILY_TASTE[recipe.family] || {}).forEach(([k, w]) => { if (w >= 0.6) tags.add(k); });
  const ids = new Set(recipe.ingredients.map(i => i.id));
  Object.entries(TASTE_INGREDIENT_HINTS).forEach(([tag, list]) => { if (list.some(id => ids.has(id))) tags.add(tag); });
  if (["Highballs", "Mocktail / alcoholvrij"].includes(recipe.family) && !tags.has("sterk")) tags.add("licht");
  return CHECKIN_TASTE_TAGS.map(t => t.key).filter(k => tags.has(k));
}

const RATING_WORDS = { 1: "Matig", 2: "Oké", 3: "Goed", 4: "Heerlijk", 5: "Top" };

// Grote, gecentreerde sterren voor het inchecken: tik = hele ster, nog eens
// op dezelfde ster tikken = halve ster (4 → 3,5), en weer terug.
function CheckinStars({ value, onChange, onSound }) {
  const size = 44;
  const tap = (n) => {
    const next = value === n ? n - 0.5 : n;
    if (next !== value) onSound?.("tick");
    onChange(next);
  };
  const shown = value > 0 ? Math.min(5, Math.max(1, Math.round(value))) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3, 4, 5].map(n => {
          const filled = Math.min(1, Math.max(0, value - (n - 1)));
          return (
            <button key={n} onClick={() => tap(n)} aria-label={`${n} ${n === 1 ? "ster" : "sterren"}`} className="press-scale" style={{
              position: "relative", width: size, height: size, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer",
            }}>
              <Star size={size} color="#C9BC9C" strokeWidth={1.4} style={{ display: "block" }} />
              {filled > 0 && (
                <div style={{ position: "absolute", inset: 0, width: `${filled * 100}%`, overflow: "hidden" }}>
                  <Star size={size} fill={BRASS} color={BRASS} strokeWidth={1.4} style={{ display: "block" }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10, minHeight: 30 }}>
        {value > 0 ? (
          <>
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, color: INK }}>{String(value).replace(".", ",")}</span>
            <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 15, color: BRASS }}>{RATING_WORDS[shown]}</span>
          </>
        ) : (
          <span style={{ fontFamily: systemFont, fontSize: 15, color: MUTED }}>Hoe was 'ie?</span>
        )}
      </div>
      <div style={{ fontFamily: systemFont, fontSize: 12, color: MUTED, marginTop: 2 }}>Tik op een ster · nog een keer tikken = halve ster</div>
    </div>
  );
}

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
  rauw_ei: { emoji: "", label: "Geen rauw ei" },
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

// `icon` is de centrale emoji->lijn-icoon-mapping voor prestaties (voorlopig
// alleen gebruikt op de eigen Profiel-pagina, zie LogboekTab — FriendProfile-
// Sheet toont vriendjes-prestaties nog met de oude `emoji`, bewust nog niet
// aangepast). `emoji` blijft staan zodat niets anders breekt dat 'm leest.
const ACHIEVEMENT_DEFS = [
  { id: "eerste-slok", emoji: "🍸", icon: Martini, label: "Eerste Slok", text: "Je eerste cocktail ingecheckt." },
  { id: "streak7", emoji: "🔥", icon: Flame, label: "7 Op Rij", text: "7 dagen achter elkaar een cocktail gelogd." },
  { id: "proever", emoji: "🌍", icon: Globe, label: "Proever", text: "10 verschillende cocktails geproefd." },
  { id: "eigen-recept", emoji: "🏠", icon: Home, label: "Eigen Recept", text: "Een zelf toegevoegd recept ingecheckt." },
  { id: "smaakvast", emoji: "🎯", icon: Target, label: "Smaakvast", text: "5 keer dezelfde cocktailfamilie gelogd." },
  { id: "vaste-klant", emoji: "⭐", icon: Star, label: "Vaste Klant", text: "50 check-ins verzameld." },
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
  { id: "fundamenten", icon: Landmark, label: "Fundamenten", text: "Alle lessen van Deel I (Fundamenten) voltooid.", partId: "fundamenten" },
  { id: "ingredienten", icon: Citrus, label: "Ingrediënten", text: "Alle lessen van Deel II (De ingrediënten) voltooid.", partId: "ingredienten" },
  { id: "techniek", icon: GlassWater, label: "Techniek", text: "Alle lessen van Deel III (Techniek) voltooid.", partId: "techniek" },
  { id: "smaak", icon: Scale, label: "Smaak", text: "Alle lessen van Deel IV (Smaak & compositie) voltooid.", partId: "smaak" },
  { id: "vak", icon: Martini, label: "Het vak", text: "Alle lessen van Deel V (Het vak van bartender) voltooid.", partId: "vak" },
  { id: "geavanceerd", icon: FlaskConical, label: "Geavanceerd", text: "Alle lessen van Deel VI (Geavanceerde technieken) voltooid.", partId: "geavanceerd" },
  { id: "halverwege", icon: BookOpen, label: "Halverwege", text: "12 van de 24 lessen voltooid." },
  { id: "eindtoets-gehaald", icon: GraduationCap, label: "Geslaagd", text: "De eindtoets gehaald met minstens 80%." },
  { id: "perfecte-score", icon: Award, label: "Foutloos", text: "De eindtoets zonder fouten afgerond." },
];
// Deel N gaat pas open als alle lessen van de delen ervóór af zijn. Een les
// die je al eerder afrondde blijft altijd te openen (oude voortgang).
function computeUnlockedParts(progress) {
  const unlocked = new Set();
  for (const part of COURSE_PARTS) {
    unlocked.add(part.id);
    const done = COURSE_LESSONS.filter(l => l.part === part.id).every(l => progress[l.id]?.completed);
    if (!done) break;
  }
  return unlocked;
}
// "Uitgespeeld" = alle lessen af én de eindtoets gehaald (≥ 80%).
function computeCourseMastery(progress) {
  const allLessons = COURSE_LESSONS.every(l => progress?.[l.id]?.completed);
  const exam = progress?.eindtoets;
  const passed = !!(exam?.completed && exam.bestScore / exam.total >= QUIZ_PASS_RATIO);
  return allLessons && passed ? { scorePct: Math.round((exam.bestScore / exam.total) * 100) } : null;
}

// Cursusrang: het statussymbool op je profiel, bij vrienden en in de feed.
// Hoe verder je bent, hoe voller de gouden ring om je profielfoto.
const COURSE_RANKS = [
  { id: "leerling", name: "Leerling", rule: "Eerste les gestart" },
  { id: "barback", name: "Barback", rule: "1 deel afgerond" },
  { id: "thuisbartender", name: "Thuisbartender", rule: "3 delen afgerond" },
  { id: "bartender", name: "Bartender", rule: "Alle 6 delen afgerond" },
  { id: "meester", name: "Meester", rule: "Eindtoets gehaald: diploma" },
];
const COURSE_PART_COUNT = COURSE_PARTS.length;
function coursePartsDone(progress) {
  return COURSE_PARTS.filter(part => {
    const lessons = COURSE_LESSONS.filter(l => l.part === part.id);
    return lessons.length > 0 && lessons.every(l => progress?.[l.id]?.completed);
  }).length;
}
function courseRankIndex({ partsDone = 0, started = false, master = false }) {
  if (master) return 4;
  if (partsDone >= COURSE_PART_COUNT) return 3;
  if (partsDone >= 3) return 2;
  if (partsDone >= 1) return 1;
  return started ? 0 : -1;
}
function withRank(index, partsDone, master) {
  return { index, rank: COURSE_RANKS[index] || null, next: COURSE_RANKS[index + 1] || null, partsDone, master };
}
// Eigen rang, uit de lokale voortgang.
function computeCourseRank(progress) {
  const partsDone = coursePartsDone(progress);
  const started = !!progress?._gestart || COURSE_LESSONS.some(l => progress?.[l.id]);
  const master = !!computeCourseMastery(progress);
  return withRank(courseRankIndex({ partsDone, started, master }), partsDone, master);
}
// Rang van iemand anders (of jezelf op een nieuw toestel), uit profiles.
function profileCourseRank(p) {
  if (!p) return withRank(-1, 0, false);
  const master = !!p.course_completed_at;
  const partsDone = master ? COURSE_PART_COUNT : Math.min(COURSE_PART_COUNT, p.course_parts_done || 0);
  const stored = COURSE_RANKS.findIndex(r => r.id === p.course_rank);
  return withRank(Math.max(stored, courseRankIndex({ partsDone, master })), partsDone, master);
}
// Lokaal en opgeslagen samenvoegen: wat het verst is, telt.
function mergeCourseRank(a, b) {
  const best = a.index >= b.index ? a : b;
  return withRank(best.index, Math.max(a.partsDone, b.partsDone), a.master || b.master);
}
function courseRankHint(r) {
  if (r.master) return "Gediplomeerd: alle delen en de eindtoets";
  if (r.index === 3) return "Haal de eindtoets voor Meester";
  const target = r.index < 1 ? 1 : r.index === 1 ? 3 : COURSE_PART_COUNT;
  const left = target - r.partsDone;
  return `Nog ${left} ${left === 1 ? "deel" : "delen"} tot ${COURSE_RANKS[r.index < 1 ? 1 : r.index + 1].name}`;
}

// Profielfoto met de cursusring: zes stukken, één per afgerond deel. Met
// het diploma wordt de ring massief goud, met een zegel rechtsonder.
// size = totale buitenmaat, zodat hij overal 1-op-1 een Avatar vervangt.
function CourseRing({ name, photo, size = 84, partsDone = 0, master = false, dark = false, seal = true, children }) {
  const big = size >= 60;
  const stroke = big ? 4 : 2.2;
  const gap = big ? 7 : 3.5;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const segGap = big ? stroke + 6 : stroke + 3.5;
  const dash = c / 6 - segGap;
  const offColor = dark ? "rgba(255,255,255,0.18)" : BORDER;
  const startDeg = -90 + (segGap / 2 / c) * 360;
  const inner = size - gap * 2;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }} aria-hidden>
        {master ? (
          <>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BRASS} strokeWidth={stroke} />
            {big && <circle cx={size / 2} cy={size / 2} r={r - stroke - 1} fill="none" stroke="#DDB877" strokeWidth={1} />}
          </>
        ) : [0, 1, 2, 3, 4, 5].map(i => {
          const on = i < partsDone;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={on ? BRASS : offColor}
              strokeWidth={on ? stroke : Math.max(1.4, stroke / 2)} strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(${startDeg + i * 60} ${size / 2} ${size / 2})`} />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: gap }}>{children || <Avatar name={name} photo={photo} size={inner} />}</div>
      {master && seal && size >= 44 && (
        <span style={{
          position: "absolute", right: big ? -2 : -3, bottom: big ? 0 : -2, width: big ? 30 : 18, height: big ? 30 : 18, borderRadius: "50%",
          background: BOTTLE_DARK, border: `${big ? 2 : 1.5}px solid ${BRASS}`, boxSizing: "border-box", color: "#DDB877",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><GraduationCap size={big ? 15 : 10} strokeWidth={2} /></span>
      )}
    </div>
  );
}
// Avatar die de ring alleen toont als iemand met de cursus bezig is.
function RankAvatar({ name, photo, size, courseRank }) {
  if (!courseRank || courseRank.index < 0) return <Avatar name={name} photo={photo} size={size} />;
  return <CourseRing name={name} photo={photo} size={size} partsDone={courseRank.partsDone} master={courseRank.master} />;
}
// Rangnaam naast een naam (feed, vriendenlijst) of als chip onder je naam.
function CourseRankLabel({ courseRank, chip = false }) {
  if (!courseRank?.rank) return null;
  if (!chip) {
    return <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8F6A21", whiteSpace: "nowrap" }}>{courseRank.rank.name}</span>;
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 100, whiteSpace: "nowrap",
      background: courseRank.master ? BRASS : BOTTLE_DARK, color: courseRank.master ? BOTTLE_DARK : "#F1D9A6", fontSize: 12, fontWeight: 700,
    }}><GraduationCap size={13} strokeWidth={2} /> {courseRank.rank.name}</span>
  );
}
// De vijf rangen als ladder, met je huidige rang aangestipt.
function CourseRankLadder({ courseRank }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
      {COURSE_RANKS.map((r, i) => {
        const reached = i <= courseRank.index;
        const current = i === courseRank.index;
        const d = current ? 16 : 12;
        return (
          <div key={r.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ height: 16, display: "flex", alignItems: "center" }}>
              <span style={{ width: d, height: d, borderRadius: "50%", boxSizing: "border-box", background: reached ? BRASS : "transparent", border: reached ? "none" : "1.5px solid #B8A98A" }} />
            </span>
            <span lang="nl" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.2, fontWeight: current ? 700 : 500, color: current ? INK : MUTED, hyphens: "manual", overflowWrap: "anywhere" }}>{r.name === "Thuisbartender" ? "Thuis\u00ADbartender" : r.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// Cursuskaart op je eigen profiel: delen, XP, de rangladder en de badges.
function CourseProgressCard({ courseProgress, courseRank, firstName = null }) {
  const ci = courseProgress ? computeCourseInsights(courseProgress) : null;
  const r = courseRank || withRank(-1, 0, false);
  return (
    <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>Cursus</span>
        <span style={{ fontSize: 12.5, color: MUTED }}>{r.partsDone} van {COURSE_PART_COUNT} delen{ci ? ` · ${ci.xp} XP` : ""}</span>
      </div>
      <CourseRankLadder courseRank={r} />
      <div style={{ fontSize: 13, color: INK, marginTop: 14, lineHeight: 1.45 }}>
        {firstName
          ? (r.index < 0 ? `${firstName} is nog niet met de cursus begonnen.` : r.master ? `${firstName} heeft de cursus en de eindtoets gehaald.` : `${firstName} is ${r.rank.name}.`)
          : (r.index < 0 ? "Start de cursus onder Bar en word Leerling." : courseRankHint(r) + ".")}
      </div>
      {ci && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {ci && ci.badges.map(b => {
          const Icon = b.icon;
          return (
            <span key={b.id} title={b.label} aria-label={`${b.label}${b.unlocked ? "" : " (nog niet behaald)"}`} style={{
              width: 36, height: 36, borderRadius: "50%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
              background: b.unlocked ? BOTTLE_DARK : PAPER_DEEP, color: b.unlocked ? "#DDB877" : "#B8A98A",
              border: b.unlocked ? `1.5px solid ${BRASS}` : `1.5px dashed ${BORDER}`,
            }}><Icon size={16} strokeWidth={1.8} /></span>
          );
        })}
      </div>}
    </div>
  );
}

// Beloning voor het uitspelen van de cursus: een diploma op je profiel, dat
// je vrienden ook zien (profiles.course_completed_at). compact = het kleine
// label naast je naam; anders de volledige diploma-kaart.
function CourseDiploma({ date, scorePct, isOwn = true }) {
  const when = date ? new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 16, padding: "16px 18px", marginBottom: 18,
      background: `radial-gradient(ellipse 140% 120% at 20% 0%, #2A4B42, ${BOTTLE_DARK} 75%)`, color: CREAM,
      border: `1.5px solid ${BRASS}`, boxShadow: SHADOW_CARD,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", border: "1.5px solid rgba(221,184,119,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#DDB877" }}><GraduationCap size={24} strokeWidth={1.7} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: "#DDB877" }}>Diploma</div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, lineHeight: 1.2, marginTop: 2 }}>Gediplomeerd thuisbartender</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4, lineHeight: 1.4 }}>
            {isOwn ? "Je hebt" : "Heeft"} de cursus "Van Basis tot Pro" uitgespeeld{scorePct ? ` · eindtoets ${scorePct}%` : ""}{when ? ` · ${when}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function computeCourseInsights(progress) {
  const completedLessons = COURSE_LESSONS.filter(l => progress[l.id]?.completed);
  const examProgress = progress.eindtoets;
  const examPassed = !!(examProgress?.completed && examProgress.bestScore / examProgress.total >= QUIZ_PASS_RATIO);
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
    // Alleen de vijf kernsmaken tellen mee; nieuwe labels (kruidig, fris…)
    // zijn beschrijvend. Heeft een check-in géén kernsmaak (bv. alleen
    // "Kruidig"), dan valt die terug op de familie, net als zonder tags.
    const coreTags = (entry.tasteTags || []).filter(k => k in tasteTotals);
    if (coreTags.length > 0) {
      coreTags.forEach(k => { tasteTotals[k] += 1; });
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
    // Voortgang richting de badge, voor het balkje + "3 van 7 dagen".
    const progress = {
      "eerste-slok": { value: Math.min(1, logboek.length), goal: 1, unit: "check-in" },
      "streak7": { value: Math.min(7, streak), goal: 7, unit: "dagen" },
      "proever": { value: Math.min(10, uniqueCount), goal: 10, unit: "cocktails" },
      "eigen-recept": { value: usedCustomRecipe ? 1 : 0, goal: 1, unit: "eigen recept" },
      "smaakvast": { value: Math.min(5, maxFamilyCount), goal: 5, unit: "keer" },
      "vaste-klant": { value: Math.min(50, logboek.length), goal: 50, unit: "check-ins" },
    }[a.id];
    return { ...a, unlocked, progress };
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
    const coreTags = (entry.tasteTags || []).filter(k => k in weightedTaste);
    const source = coreTags.length > 0
      ? Object.fromEntries(coreTags.map(k => [k, 1]))
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
  const dropdownMaxH = useDropdownMaxHeight(wrapRef, open, 240);
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
    document.activeElement?.blur?.();
  };

  return (
    <div ref={wrapRef} data-kb-scope style={{ position: "relative" }}>
      <Search size={16} color={MUTED} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      <input value={query} onChange={e => handleType(e.target.value)} onFocus={() => (results.length > 0 || loading) && setOpen(true)}
        placeholder={placeholder} enterKeyHint="done" autoCapitalize="words" style={{
          width: "100%", border: "none", outline: "none", background: PAPER, borderRadius: 12,
          padding: "13px 14px 13px 40px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box",
        }} />
      {open && (loading || results.length > 0) && (
        <div style={{
          // In de flow i.p.v. zwevend: in het check-in-venster viel een zwevende
          // lijst achter de Inchecken-knop onderaan.
          position: "relative", marginTop: 6, background: CREAM,
          borderRadius: 14, maxHeight: dropdownMaxH, overflowY: "auto", overscrollBehavior: "contain",
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

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    // Dit is alleen nog een niet-interactieve voorvertoning — pinchen/slepen
    // op deze kleine kaart ving voorheen de scroll-gestiek van de hele pagina
    // af (Leaflet claimt touch-events zodra 'm interactief is). Alle
    // gebruikersinteractie staat daarom uit; tikken opent de schermvullende,
    // wél volledig interactieve kaart hieronder (MapFullscreenSheet).
    mapRef.current = L.map(mapElRef.current, {
      attributionControl: true,
      dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, tap: false, zoomControl: false,
    }).setView([GRONINGEN.lat, GRONINGEN.lon], 12);
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
      <button onClick={() => setExpanded(true)} aria-label="Kaart vergroten" style={{
        display: "block", width: "100%", border: "none", padding: 0, margin: 0, cursor: "pointer", background: "none",
      }}>
        <div ref={mapElRef} className="thuisbar-map" style={{ height: 190, borderRadius: "14px 14px 0 0", touchAction: "pan-y" }} />
      </button>
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
      {expanded && <MapFullscreenSheet locations={locations} coords={coords} onClose={() => setExpanded(false)} />}
    </div>
  );
}

// Losse, wél volledig interactieve Leaflet-instantie voor de schermvullende
// kaart — eigen mount/unmount i.p.v. de niet-interactieve voorvertoning
// hierboven toggelen, want Leaflet's interactiviteit kun je niet na init
// meer aan-/uitzetten zonder de hele kaart opnieuw op te bouwen.
function MapFullscreenSheet({ locations, coords, onClose }) {
  useBodyScrollLock();
  const elRef = useRef(null);
  useEffect(() => {
    if (!elRef.current) return;
    const map = L.map(elRef.current, { attributionControl: true, zoomControl: true }).setView([GRONINGEN.lat, GRONINGEN.lon], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-bijdragers',
    }).addTo(map);
    const pinIcon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));"><svg viewBox="0 0 16 20" width="26" height="32"><path d="M8 0C3.6 0 0 3.6 0 8c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8z" fill="${BRASS}"/><circle cx="8" cy="8" r="3" fill="${BOTTLE_DARK}"/></svg></div>`,
      iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -30],
    });
    const bounds = [];
    locations.forEach(loc => {
      const key = loc.name.trim().toLowerCase();
      const c = loc.lat != null ? { lat: loc.lat, lon: loc.lon } : coords[key];
      if (!c) return;
      L.marker([c.lat, c.lon], { icon: pinIcon }).addTo(map)
        .bindPopup(`<strong>${escapeHtml(loc.name)}</strong><br/>${loc.count} check-in${loc.count === 1 ? "" : "s"}`);
      bounds.push([c.lat, c.lon]);
    });
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 60);
    return () => map.remove();
  }, [locations, coords]);

  return createPortal((
    <div className="tab-fade" style={{ position: "fixed", inset: 0, zIndex: 40, background: PAPER, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(env(safe-area-inset-top) + 14px) 16px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
      }}>
        <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK }}>Jouw cocktailkaart</div>
        <button onClick={onClose} aria-label="Sluiten" className="press-scale" style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%",
          border: `1px solid ${BORDER}`, background: CREAM, color: INK, cursor: "pointer",
        }}>
          <X size={17} />
        </button>
      </div>
      <div ref={elRef} className="thuisbar-map" style={{ flex: 1 }} />
    </div>
  ), document.body);
}

// Favorieten, meest gebruikte drank en check-ins per maand: gedeeld door
// je eigen profiel en dat van een vriend (zelfde afleiding uit het logboek).
function TasteDetails({ insights, logboek, recipes, allIngredients }) {
  const findMatch = (entry) => entry.recipeId ? recipes.find(r => r.id === entry.recipeId) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());
  const favRecipe = insights.favoriteCocktail ? recipes.find(r => r.name.toLowerCase() === insights.favoriteCocktail.name.toLowerCase()) : null;
  const famName = insights.favoriteFamilyEntry?.[0];
  const famRecipe = famName ? (logboek.map(findMatch).filter(r => r && r.family === famName)[0] || recipes.find(r => r.family === famName)) : null;
  const favCards = [
    insights.favoriteCocktail && { label: "Favoriete cocktail", title: insights.favoriteCocktail.name, recipe: favRecipe, serifTitle: true },
    famName && { label: "Favoriete stijl", title: famName, recipe: famRecipe },
  ].filter(Boolean);
  const monthsWithData = insights.months.filter(m => m.count > 0).length;
  const spiritMeta = (label) => allIngredients.find(i => i.name === label && i.cat === "Sterke drank");
  return (
    <>
      {favCards.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Favorieten</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {favCards.map(c => (
              <div key={c.label} style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ height: 96, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {c.recipe && (localItemImageUrl("cocktail", c.recipe.id) || c.recipe.image)
                    ? <img src={localItemImageUrl("cocktail", c.recipe.id) || c.recipe.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
                    : c.recipe ? <RecipeCircle recipe={c.recipe} allIngredients={allIngredients} size={70} radius={12} /> : <Martini size={28} color={BRASS} strokeWidth={1.4} />}
                </div>
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontSize: 12, color: MUTED }}>{c.label}</div>
                  <div style={{ fontFamily: c.serifTitle ? serif : systemFont, fontWeight: 700, fontSize: 16, color: INK, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.spirits.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Meest gebruikte drank</SectionLabel>
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
            {insights.spirits.map((sp, i) => {
              const meta = spiritMeta(sp.label);
              return (
                <div key={sp.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, overflow: "hidden", background: PAPER_DEEP, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {meta ? <ItemImage id={meta.id} type="drank" size={34} radius={9} /> : <Wine size={16} color={MUTED} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                    <span style={{ width: 86, flexShrink: 0, fontSize: 14, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: PAPER_DEEP, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${sp.pct}%`, background: BRASS, borderRadius: 3 }} />
                    </div>
                    <span style={{ width: 38, textAlign: "right", fontSize: 13, fontWeight: 700, color: INK }}>{sp.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {monthsWithData >= 2 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Check-ins per maand</SectionLabel>
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "16px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
              {insights.months.map((m, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 6 }}>
                  <div style={{ width: "100%", maxWidth: 18, borderRadius: 4, background: m.count ? BRASS : PAPER_DEEP, height: `${Math.max(6, (m.count / insights.monthMax) * 100)}%` }} />
                  <span style={{ fontSize: 12, color: MUTED }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Webdiagram van het smaakprofiel (5 assen), in goud op de groene kaart.
const RADAR_AXES = [["fruitig", "Fruitig"], ["zuur", "Zuur"], ["zoet", "Zoet"], ["sterk", "Sterk"], ["bitter", "Bitter"]];
function TasteRadar({ taste, size = 230, compare = null }) {
  const byKey = Object.fromEntries(taste.map(t => [t.key, t.pct / 100]));
  const cmpKey = compare ? Object.fromEntries(compare.map(t => [t.key, t.pct / 100])) : null;
  const cx = size / 2, cy = size / 2 + 4, R = size * 0.33;
  const pt = (i, f) => { const ang = (-90 + i * 72) * Math.PI / 180; return [cx + Math.cos(ang) * R * f, cy + Math.sin(ang) * R * f]; };
  const poly = (f) => RADAR_AXES.map((_, i) => pt(i, f).join(",")).join(" ");
  const values = RADAR_AXES.map(([k], i) => pt(i, Math.max(0.08, byKey[k] || 0)));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: "block", margin: "0 auto" }} role="img" aria-label="Smaakprofiel">
      {[0.34, 0.67, 1].map(f => <polygon key={f} points={poly(f)} fill="none" stroke="rgba(221,184,119,0.28)" strokeWidth={1} />)}
      {RADAR_AXES.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(221,184,119,0.22)" strokeWidth={1} />; })}
      {cmpKey && <polygon points={RADAR_AXES.map(([k], i) => pt(i, Math.max(0.08, cmpKey[k] || 0)).join(",")).join(" ")} fill="none" stroke="#C9D2CB" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />}
      <polygon points={values.map(v => v.join(",")).join(" ")} fill="rgba(221,184,119,0.32)" stroke="#DDB877" strokeWidth={2} strokeLinejoin="round" />
      {values.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.2} fill="#DDB877" />)}
      {RADAR_AXES.map(([, label], i) => {
        const [x, y] = pt(i, 1.24);
        return <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#FBF6EA" fontSize={12} fontWeight={600} fontFamily="Inter, -apple-system, sans-serif">{label}</text>;
      })}
    </svg>
  );
}

// Details van één check-in (tik op een tegel in het fotoraster), met
// verwijderen. Eigen lettertype expliciet: rendert via een portal.
function CheckinDetailSheet({ entry, recipe, allIngredients, ingredientLabel, who, whoAvatar, onClose, onRemove }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const img = entry.photo || (recipe && (localItemImageUrl("cocktail", recipe.id) || recipe.image)) || null;
  const tags = (entry.tasteTags || []).filter(k => CHECKIN_TASTE_META[k]);
  const ingredientsLine = recipe ? recipe.ingredients.map(ing => ingredientLabel(ing)).join(" · ") : null;
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "88vh",
        background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: sans,
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 20px 12px", flexShrink: 0, touchAction: "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, lineHeight: 1.15 }}>{entry.name}</div>
            {recipe && <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>{[recipe.family, recipe.glass].filter(Boolean).join(" · ")}</div>}
          </div>
          <button onClick={close} aria-label="Sluiten" className="tap-target-44" onTouchStart={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", background: PAPER_DEEP, border: "none", cursor: "pointer", color: INK, flexShrink: 0 }}><X size={15} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 20px 20px" }}>
          <div onClick={img ? () => setPhotoOpen(true) : undefined} style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "4 / 3", background: PAPER_DEEP, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: img ? "zoom-in" : undefined }}>
            {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: entry.photo ? "none" : RECIPE_PHOTO_FILTER }} />
              : recipe ? <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={140} radius={16} />
              : <Martini size={40} color={BRASS} strokeWidth={1.3} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const f = Math.min(1, Math.max(0, entry.rating - (n - 1)));
                return (
                  <span key={n} style={{ position: "relative", width: 18, height: 18 }}>
                    <Star size={18} color="#C9BC9C" strokeWidth={1.4} style={{ display: "block" }} />
                    {f > 0 && <span style={{ position: "absolute", inset: 0, width: `${f * 100}%`, overflow: "hidden" }}><Star size={18} fill={BRASS} color={BRASS} strokeWidth={1.4} style={{ display: "block" }} /></span>}
                  </span>
                );
              })}
            </div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{formatRating(entry.rating)}</span>
          </div>
          {tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {tags.map(k => <span key={k} style={{ fontSize: 12.5, fontWeight: 600, color: INK, background: PAPER_DEEP, borderRadius: 100, padding: "5px 11px" }}>{CHECKIN_TASTE_META[k].label}</span>)}
            </div>
          )}
          <div style={{ background: PAPER_DEEP, borderRadius: 14, overflow: "hidden" }}>
            {[
              entry.notes ? { label: "Notitie", text: entry.notes } : null,
              { label: "Wanneer en waar", text: `${formatCheckinDate(entry.date)}${entry.location ? ` · ${entry.location}` : ""}` },
              ingredientsLine ? { label: "Ingrediënten", text: ingredientsLine } : null,
            ].filter(Boolean).map((row, i) => (
              <div key={row.label} style={{ margin: "0 14px", padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{row.label}</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 2, whiteSpace: "pre-wrap" }}>{row.text}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setConfirmDelete(true)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 18, height: 48, borderRadius: 14,
            border: "none", background: PAPER_DEEP, color: BURGUNDY, fontFamily: sans, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}><Trash2 size={16} /> Check-in verwijderen</button>
        </div>
      </div>
      {photoOpen && <CheckinPhotoViewer entry={entry} matched={recipe} who={who} whoAvatar={whoAvatar} allIngredients={allIngredients} onClose={() => setPhotoOpen(false)} />}
      {confirmDelete && (
        <ConfirmDialog title="Check-in verwijderen?" message={`${entry.name} verdwijnt uit je logboek.`} confirmLabel="Verwijder"
          onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); onRemove(entry.id); close(); }} />
      )}
    </div>
  ), document.body);
}

function LogboekTab({ recipes, logboek, onAddEntry, onRemoveEntry, allIngredients, ingredientLabel, onSound, isOwned, profile, onOpenRecipe, checkinRequest, onUpdateName, onUpdatePhoto, onGoVrienden, onGoInstellingen, active , courseDiploma, courseProgress, courseRank}) {
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
  // Smaaklabels ("Wat proefde je?") i.p.v. de drie schuifjes: meerdere aan
  // tegelijk. Bij een herkend recept vullen we een voorzet in
  // (suggestTasteTags), de gebruiker corrigeert alleen. Wat hier aan staat
  // gaat letterlijk als taste_tags de database in.
  const [tasteTags, setTasteTags] = useState([]);
  useEffect(() => { setTasteTags(suggestTasteTags(matchedRecipe)); }, [matchedRecipe?.id]);
  const toggleTasteTag = (key) => {
    onSound("tick");
    setTasteTags(prev => prev.includes(key) ? prev.filter(k => k !== key) : CHECKIN_TASTE_TAGS.map(t => t.key).filter(k => k === key || prev.includes(k)));
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
    let name = nameInput.trim();
    if (!name || rating === 0) return;
    // Vangnet: half getypte naam ("Sex On") die bij precies één recept past
    // → dat recept gebruiken, i.p.v. een losse, afgekapte naam op te slaan.
    let recipeForEntry = matchedRecipe;
    if (!recipeForEntry) {
      const q = name.toLowerCase();
      const starts = recipes.filter(r => r.name.toLowerCase().startsWith(q));
      if (starts.length === 1) { recipeForEntry = starts[0]; name = starts[0].name; }
    }
    const checkinNumber = logboek.length + 1;
    onAddEntry({
      recipeId: recipeForEntry ? recipeForEntry.id : null,
      name, rating, notes: notes.trim(), photo, location: location.trim() || "Thuis",
      locationLat: locationCoords?.lat ?? null, locationLon: locationCoords?.lon ?? null,
      tasteTags: tasteTags,
      tagUserIds: taggedIds, adoptTag,
    });
    onSound("chime");
    setStampNumber(checkinNumber);
    setTimeout(() => {
      setStampNumber(null);
      closeCheckinSheet();
      setNameInput(""); setNotes(""); setRating(0); setPhoto(null); setLocation("Thuis"); setLocationCoords(null);
      setTasteTags([]); setMoreOpen(false);
      setTaggedIds([]); setTagQuery(""); setAdoptTag(null);
    }, 1050);
  };
  const removeEntry = (id) => { onSound("remove"); onRemoveEntry(id); };
  const cardRefs = useRef({});
  const scrollToEntry = (id) => cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  const [showCheckinSheet, setShowCheckinSheet] = useState(false);
  const [cocktailSearchOpen, setCocktailSearchOpen] = useState(false);
  const { panelRef: checkinPanelRef, closing: checkinClosing, close: closeCheckinSheet, dragHandlers: checkinDragHandlers } = useSheetDismiss(() => {
    setShowCheckinSheet(false);
    // Overnemen afgebroken: de volgende check-in begint weer blanco.
    if (adoptTag) { setAdoptTag(null); setNameInput(""); setPhoto(null); setLocation("Thuis"); }
  });
  // Extern verzoek om in te checken (centrale +-knop, of straks direct vanaf
  // een recept) — de sheet zelf blijft hier leven (portal't toch al naar
  // document.body, dus verschijnt sowieso boven elke tab).
  // Vrienden taggen ("Met wie drink je?") en een tag overnemen.
  const [taggedIds, setTaggedIds] = useState([]);
  const [tagQuery, setTagQuery] = useState("");
  const [adoptTag, setAdoptTag] = useState(null);
  const tagFriends = useFriendList(profile?.id, showCheckinSheet);
  useEffect(() => {
    if (!checkinRequest) return;
    if (checkinRequest.name) setNameInput(checkinRequest.name);
    if (checkinRequest.adoptTag) {
      setAdoptTag(checkinRequest.adoptTag);
      if (checkinRequest.location) setLocation(checkinRequest.location);
      if (checkinRequest.photo) setPhoto(checkinRequest.photo);
    }
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
  // Profiel in drie tabbladen (Check-ins · Smaak · Prestaties); bewust niet
  // onthouden over sessies heen — altijd beginnen bij Check-ins.
  const [profileTab, setProfileTab] = useState("checkins");
  const [openEntryId, setOpenEntryId] = useState(null);
  const openEntry = logboek.find(e => e.id === openEntryId) || null;
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonthCount = logboek.filter(e => (e.date || "").slice(0, 7) === monthKey).length;

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
      {/* Kop: titel met Vrienden/Instellingen rechts op dezelfde regel */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0 16px" }}>
        <h1 style={{ fontFamily: systemFont, fontWeight: 800, fontSize: 34, color: INK, margin: 0, letterSpacing: -0.4 }}>Profiel</h1>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ onClick: onGoVrienden, label: "Vrienden", Icon: Users }, { onClick: onGoInstellingen, label: "Instellingen", Icon: Settings }].map(({ onClick, label, Icon }) => (
            <button key={label} onClick={onClick} className="press-scale" aria-label={label} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: BOTTLE, cursor: "pointer" }}>
              <Icon size={18} strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </div>

      {/* Identiteit: foto met XP-ring, naam (tik = wijzigen), niveau */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoFile} style={{ display: "none" }} />
        <button onClick={() => photoInputRef.current?.click()} disabled={profilePhotoBusy} className="press-scale" aria-label="Profielfoto wijzigen" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
          <CourseRing name={profile?.name || "Jij"} photo={profile?.avatar_url} size={84} partsDone={courseRank?.partsDone || 0} master={!!courseRank?.master} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          {editingName ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input value={draftName} onChange={e => setDraftName(e.target.value)} autoFocus
                autoCapitalize="words" enterKeyHint="done"
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                style={{ ...fieldStyle(), flex: 1, minWidth: 0, padding: "7px 10px", fontSize: 16 }} />
              <button onClick={saveName} className="press-scale" style={{ background: BOTTLE, color: CREAM, border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>Opslaan</button>
            </div>
          ) : (
            <button onClick={startEditName} aria-label="Naam wijzigen" style={{ display: "block", maxWidth: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.name || "Jouw naam"}</div>
            </button>
          )}
          {courseRank?.rank && <div style={{ margin: "5px 0 3px" }}><CourseRankLabel courseRank={courseRank} chip /></div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: BRASS, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Niveau {insights.level.level} · {insights.level.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 12, color: MUTED }}>{insights.level.to ? `${insights.level.to - insights.level.xp} XP tot niveau ${insights.level.level + 1}` : "Hoogste niveau bereikt"}</span>
          </div>
        </div>
      </div>

      {/* Kerncijfers */}
      <div style={{ display: "flex", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "12px 0", marginBottom: 16 }}>
        {[
          { value: <AnimatedNumber value={stats.total} />, label: "check-ins" },
          { value: <AnimatedNumber value={stats.uniques} />, label: "uniek" },
          { value: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{stats.total > 0 ? formatDecimal1(stats.avg) : "–"}<Star size={13} fill={BRASS} color={BRASS} /></span>, label: "gemiddeld" },
        ].map((c, i) => (
          <div key={c.label} style={{ flex: 1, textAlign: "center", borderLeft: i === 0 ? "none" : `1px solid ${BORDER}` }}>
            <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 20, color: INK }}>{c.value}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabbladen */}
      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 12, marginBottom: 18 }}>
        {[["checkins", "Check-ins"], ["smaak", "Smaak"], ["prestaties", "Prestaties"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={profileTab === id} onClick={() => setProfileTab(id)} style={{
            flex: 1, height: 34, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 600,
            background: profileTab === id ? CREAM : "transparent", color: profileTab === id ? INK : MUTED,
            boxShadow: profileTab === id ? "0 1px 4px rgba(43,38,32,0.14)" : "none",
          }}>{label}</button>
        ))}
      </div>

      {/* ---------- Tab: Check-ins ---------- */}
      {profileTab === "checkins" && (
        logboek.length === 0 ? (
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "26px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK, marginBottom: 4 }}>Nog geen check-ins</div>
            <p style={{ margin: 0, fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>Tik op de + onderin om je eerste cocktail in te checken.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 14, color: INK }}><strong>{thisMonthCount}</strong> deze maand</span>
              {insights.streak >= 2 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#8F6A21", background: "rgba(184,134,46,0.14)", borderRadius: 100, padding: "4px 10px" }}>
                  <Flame size={13} /> {insights.streak} dagen op rij
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginLeft: -20, marginRight: -20 }}>
              {logboek.map(entry => {
                const matched = findMatch(entry);
                const own = entry.photo;
                const recipeImg = matched && (localItemImageUrl("cocktail", matched.id) || matched.image);
                return (
                  <button key={entry.id} onClick={() => setOpenEntryId(entry.id)} aria-label={`${entry.name}, ${formatRating(entry.rating)} sterren`} style={{
                    position: "relative", aspectRatio: "1", overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: PAPER_DEEP,
                  }}>
                    {own || recipeImg ? (
                      <img src={own || recipeImg} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: own ? "none" : RECIPE_PHOTO_FILTER }} />
                    ) : matched ? (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <RecipeCircle recipe={matched} allIngredients={allIngredients} size={96} radius={12} />
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, boxSizing: "border-box" }}>
                        <Martini size={28} color={BRASS} strokeWidth={1.4} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: INK, textAlign: "center", lineHeight: 1.2 }}>{entry.name}</span>
                      </div>
                    )}
                    <div className="glass-chip-dark" style={{ position: "absolute", left: 6, bottom: 6, display: "flex", alignItems: "center", gap: 3, borderRadius: 100, padding: "2px 7px" }}>
                      <span style={{ fontSize: 12, color: CREAM, fontWeight: 700 }}>{formatRating(entry.rating)}</span>
                      <Star size={10} fill="#D8AE5E" color="#D8AE5E" />
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )
      )}

      {/* ---------- Tab: Smaak ---------- */}
      {profileTab === "smaak" && (() => {
        const titleCase = (t) => t ? t.charAt(0) + t.slice(1).toLowerCase() : "";
        const persona = insights.personality;
        const personaTitle = persona ? titleCase(persona.title) : "Jouw smaak";
        const canShare = isNativeShell || (typeof navigator !== "undefined" && !!navigator.share);
        const shareTaste = async () => {
          const text = `Mijn smaakprofiel in Mijn Thuisbar: ${personaTitle}. ${persona?.text || ""}`.trim();
          try {
            if (isNativeShell) await Share.share({ title: "Mijn smaakprofiel", text, dialogTitle: "Deel je smaakprofiel" });
            else await navigator.share({ title: "Mijn smaakprofiel", text });
          } catch { /* geannuleerd */ }
        };
        const needed = Math.max(0, 3 - logboek.length);
        return (
          <>
            <div style={{ position: "relative", background: BOTTLE_DARK, color: "#FBF6EA", borderRadius: 18, padding: "18px 18px 16px", boxShadow: SHADOW_HERO, borderBottom: `3px solid ${BRASS}`, marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#DDB877" }}>Jouw smaakprofiel</span>
                {canShare && persona && (
                  <button onClick={shareTaste} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", borderRadius: 100, border: "1px solid rgba(251,246,234,0.3)", background: "rgba(251,246,234,0.08)", color: "#FBF6EA", fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    <Share2 size={13} /> Deel
                  </button>
                )}
              </div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 26, lineHeight: 1.15 }}>{personaTitle}</div>
              {persona && <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "rgba(251,246,234,0.85)" }}>{persona.text}</p>}
              {needed > 0 || !insights.hasTaste ? (
                <div style={{ marginTop: 14, padding: "14px 12px", borderRadius: 12, background: "rgba(251,246,234,0.08)", fontSize: 14, textAlign: "center", color: "#FBF6EA" }}>
                  {needed > 0 ? `Nog ${needed} check-in${needed === 1 ? "" : "s"} en we kennen je smaak` : "Check wat vaker in, dan leren we je smaak kennen"}
                </div>
              ) : (
                <div style={{ marginTop: 6 }}><TasteRadar taste={insights.taste} /></div>
              )}
            </div>

            <TasteDetails insights={insights} logboek={logboek} recipes={recipes} allIngredients={allIngredients} />
          </>
        );
      })()}

      {/* ---------- Tab: Prestaties ---------- */}
      {profileTab === "prestaties" && (() => {
        const achieved = insights.achievements.filter(a => a.unlocked).length;
        const activeAch = insights.achievements.find(a => a.id === activeAchievementId) || null;
        const mapLocations = insights.locations.filter(l => l.name.trim().toLowerCase() !== "thuis");
        return (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <SectionLabel>Badges</SectionLabel>
              <span style={{ fontSize: 13, color: MUTED }}>{achieved} van {insights.achievements.length} behaald</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: activeAch ? 10 : 22 }}>
              {insights.achievements.map(a => {
                const AchIcon = a.icon;
                const pr = a.progress || { value: 0, goal: 1, unit: "" };
                const selected = activeAchievementId === a.id;
                return (
                  <button key={a.id} onClick={() => setActiveAchievementId(selected ? null : a.id)} aria-pressed={selected} style={{
                    background: CREAM, border: `1px solid ${selected ? BRASS : BORDER}`, borderRadius: 16, padding: "14px 8px 12px", cursor: "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 7, fontFamily: sans, minWidth: 0,
                  }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: a.unlocked ? BOTTLE_DARK : PAPER_DEEP, border: a.unlocked ? `2px solid ${BRASS}` : "none",
                    }}>
                      <AchIcon size={21} strokeWidth={1.8} color={a.unlocked ? "#DDB877" : MUTED} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: INK, textAlign: "center", lineHeight: 1.2 }}>{a.label}</span>
                    {a.unlocked ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: SAGE }}>Behaald</span>
                    ) : (
                      <>
                        <div style={{ width: "80%", height: 4, borderRadius: 2, background: PAPER_DEEP, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(pr.value / pr.goal) * 100}%`, background: BRASS }} />
                        </div>
                        <span style={{ fontSize: 12, color: MUTED, textAlign: "center" }}>{pr.value} van {pr.goal}{pr.unit ? ` ${pr.unit}` : ""}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            {activeAch && (
              <div className="accordion-reveal" style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "12px 14px", marginBottom: 22 }}>
                {(() => { const I = activeAch.icon; return <I size={20} strokeWidth={1.8} color={activeAch.unlocked ? BRASS : MUTED} />; })()}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{activeAch.label}{activeAch.unlocked ? "" : " · nog niet behaald"}</div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 1 }}>{activeAch.text}</div>
                </div>
              </div>
            )}

            {courseDiploma && <CourseDiploma date={courseDiploma.date} scorePct={courseDiploma.scorePct} />}
            <CourseProgressCard courseProgress={courseProgress} courseRank={courseRank} />

            {insights.locations.length >= 2 && mapLocations.length > 0 ? (
              <div style={{ marginBottom: 12 }}>
                <SectionLabel>Jouw cocktailkaart</SectionLabel>
                <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                  <CocktailMap locations={mapLocations} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px", marginBottom: 12 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MapPin size={19} color={BOTTLE} strokeWidth={1.8} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Jouw cocktailkaart</div>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1, lineHeight: 1.4 }}>Check in op een tweede plek en je kaart verschijnt hier.</div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {showCheckinSheet && createPortal((
        <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: "var(--kb-pad, 0px)", transition: "padding-bottom 0.25s ease" }}>
          <div className="sheet-backdrop-in" onClick={closeCheckinSheet} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: checkinClosing ? 0 : 1, transition: "opacity 0.22s ease" }} />
          <div ref={checkinPanelRef} className="sheet-slide-in sheet-max-92" style={{
            position: "relative", maxWidth: 960, width: "100%", margin: "0 auto",
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
              {/* Tijdens het zoeken naar een cocktail klapt de grote foto in, zodat
                  zoekveld + resultaten de ruimte boven het toetsenbord krijgen. */}
              <button onClick={() => fileInputRef.current?.click()} disabled={photoBusy} style={{
                display: cocktailSearchOpen ? "none" : "block",
                position: "relative", margin: "18px 20px 0", width: "calc(100% - 40px)",
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
                <RecipeSearchWithPhotos recipes={recipes} value={nameInput} onChange={setNameInput} onOpenChange={setCocktailSearchOpen}
                  onSelect={(r) => setNameInput(r.name)} allIngredients={allIngredients} recent={recentCocktails} />

                <CheckinStars value={rating} onChange={setRating} onSound={onSound} />

                {adoptTag ? (
                  <div style={{ padding: "12px 14px", borderRadius: 14, background: PAPER_DEEP, fontSize: 13.5, lineHeight: 1.45, color: INK, fontFamily: systemFont }}>
                    Je checkt in met <strong>{adoptTag.taggerName || "je vriend"}</strong>. Je cijfer en notitie zijn alleen van jou; aan de check-in van {adoptTag.taggerName || "je vriend"} verandert niets.
                  </div>
                ) : tagFriends && tagFriends.length > 0 && (() => {
                  const q = tagQuery.trim().toLowerCase();
                  const shown = q ? tagFriends.filter(f => (f.name || "").toLowerCase().includes(q)) : tagFriends;
                  const toggle = (id) => { onSound("pop"); setTaggedIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); };
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16, color: INK }}>Met wie drink je?</span>
                        <span style={{ fontFamily: systemFont, fontSize: 12, color: MUTED }}>{taggedIds.length > 0 ? `${taggedIds.length} getagd` : "Optioneel"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, overflowX: "auto", margin: "-5px -20px 0", padding: "6px 20px 6px" }}>
                        {shown.map(f => {
                          const on = taggedIds.includes(f.id);
                          return (
                            <button key={f.id} onClick={() => toggle(f.id)} aria-pressed={on} style={{
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 60, flexShrink: 0,
                              background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: systemFont,
                            }}>
                              <span style={{ position: "relative", width: 52, height: 52, borderRadius: "50%", boxShadow: on ? `0 0 0 2.5px ${PAPER}, 0 0 0 4.5px ${BRASS}` : "none" }}>
                                <Avatar name={f.name} photo={f.avatar_url} size={52} />
                                {on && (
                                  <span style={{ position: "absolute", right: -3, bottom: -3, width: 20, height: 20, borderRadius: "50%", background: BRASS, border: `2px solid ${PAPER}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Check size={11} strokeWidth={3.5} color={BOTTLE_DARK} />
                                  </span>
                                )}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: on ? 700 : 500, color: on ? INK : MUTED, maxWidth: 60, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(f.name || "Vriend").split(" ")[0]}</span>
                            </button>
                          );
                        })}
                        {shown.length === 0 && <span style={{ fontSize: 13, color: MUTED, padding: "16px 0" }}>Geen vriend gevonden</span>}
                      </div>
                      {tagFriends.length > 6 && (
                        <input value={tagQuery} onChange={e => setTagQuery(e.target.value)} placeholder="Zoek een vriend" enterKeyHint="search"
                          style={{ ...fieldStyle(), width: "100%", boxSizing: "border-box", marginTop: 10, fontSize: 16 }} />
                      )}
                      {taggedIds.length > 0 && (
                        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8, lineHeight: 1.45, fontFamily: systemFont }}>
                          {joinNames(tagFriends.filter(f => taggedIds.includes(f.id)).map(f => (f.name || "Vriend").split(" ")[0]))} {taggedIds.length === 1 ? "ziet" : "zien"} dit en {taggedIds.length === 1 ? "kan" : "kunnen"} de check-in overnemen met een eigen cijfer.
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16, color: INK }}>Wat proefde je?</span>
                    <span style={{ fontFamily: systemFont, fontSize: 12, color: MUTED }}>Kies er zoveel je wilt</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {CHECKIN_TASTE_TAGS.map(({ key, label }) => {
                      const on = tasteTags.includes(key);
                      return (
                        <button key={key} onClick={() => toggleTasteTag(key)} aria-pressed={on} className="press-scale" style={{
                          height: 40, padding: "0 16px", borderRadius: 100, boxSizing: "border-box",
                          display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                          border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : PAPER, color: on ? CREAM : INK,
                          fontFamily: systemFont, fontSize: 14, fontWeight: 600,
                        }}>
                          {on && <Check size={14} strokeWidth={3} color="#DDB877" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <AutoGrowTextField value={notes} onChange={setNotes} placeholder="Voeg een notitie toe…" />

                <div>
                  <button onClick={(e) => {
                    const btn = e.currentTarget;
                    setMoreOpen(v => { if (!v) setTimeout(() => btn.scrollIntoView({ block: "start", behavior: "smooth" }), 60); return !v; });
                  }} style={{ display: "flex", alignItems: "center", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: systemFont, fontSize: 15.5, fontWeight: 600, color: INK }}>
                    <span style={{ flex: 1, textAlign: "left" }}>Meer toevoegen</span>
                    {moreOpen ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                  </button>

                  {moreOpen && (
                    <div className="accordion-reveal" style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 20 }}>
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

            <div className="checkin-footer" style={{ padding: "14px 20px calc(env(safe-area-inset-bottom) + 14px)", background: PAPER_DEEP, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
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

      {openEntry && (
        <CheckinDetailSheet entry={openEntry} recipe={findMatch(openEntry)} allIngredients={allIngredients} ingredientLabel={ingredientLabel}
          who={profile?.name || "Jij"} whoAvatar={profile?.avatar_url}
          onClose={() => setOpenEntryId(null)} onRemove={removeEntry} />
      )}
    </div>
  );
}

// Schermvullende weergave van een check-infoto, à la Untappd: wie/waar
// bovenaan, de héle foto in het midden (niets afgeknipt) en het drankje
// onderaan. Opent vanuit feed, logboek, profielraster en de "Laatste
// check-in"-kaart; zonder eigen foto toont hij de receptfoto.
// Vaste donkere kleuren (geen thema-variabelen): dit is altijd een donker scherm.
const VIEWER_TEXT = "#FBF6EA";
const VIEWER_MUTED = "rgba(251,246,234,0.65)";
function CheckinPhotoViewer({ entry, matched, who, whoAvatar, allIngredients, onClose }) {
  useBodyScrollLock();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Swipe omhoog of omlaag om te sluiten, zoals in de Foto's-app: de foto
  // volgt je vinger, de achtergrond en balken vervagen mee, en ver genoeg
  // (of snel genoeg) geveegd schuift hij het scherm uit. Direct via refs i.p.v.
  // state, zodat het slepen niet bij elke pixel de hele weergave hertekent.
  const rootRef = useRef(null);
  const photoRef = useRef(null);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const applyDrag = (dy, ms = 0) => {
    const fade = Math.max(0, 1 - Math.abs(dy) / 350);
    const t = ms ? `${ms}ms ease` : "none";
    if (photoRef.current) {
      photoRef.current.style.transition = ms ? `transform ${t}` : "none";
      photoRef.current.style.transform = `translateY(${dy}px) scale(${1 - Math.min(Math.abs(dy) / 2500, 0.08)})`;
    }
    if (rootRef.current) {
      rootRef.current.style.transition = ms ? `background-color ${t}` : "none";
      rootRef.current.style.backgroundColor = `rgba(0,0,0,${fade})`;
      rootRef.current.querySelectorAll("[data-viewer-bar]").forEach(el => {
        el.style.transition = ms ? `opacity ${t}` : "none";
        el.style.opacity = String(fade);
      });
    }
  };
  const onPointerDown = (e) => {
    if (e.target.closest("button")) return;
    drag.current = { y: e.clientY, t: Date.now(), dy: 0, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    d.dy = e.clientY - d.y;
    if (!d.moved && Math.abs(d.dy) > 8) {
      d.moved = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.moved) applyDrag(d.dy);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 50);
    const velocity = d.dy / Math.max(1, Date.now() - d.t);
    if (Math.abs(d.dy) > 110 || Math.abs(velocity) > 0.6) {
      applyDrag(Math.sign(d.dy || 1) * window.innerHeight, 220);
      setTimeout(onClose, 200);
    } else {
      applyDrag(0, 200);
    }
  };

  const src = entry.photo || (matched && (localItemImageUrl("cocktail", matched.id) || matched.image)) || null;
  const subtitle = matched ? [matched.family, matched.glass].filter(Boolean).join(" · ") : null;
  const bar = { background: "#1B2421", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 };

  // Portal naar body: anders valt de overlay binnen de stacking context van
  // de tab en schuift de onderbalk er alsnog overheen.
  return createPortal((
    <div ref={rootRef} className="sheet-backdrop-in" role="dialog" aria-modal="true" aria-label={entry.name}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", flexDirection: "column", fontFamily: systemFont, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
      <div data-viewer-bar style={{ ...bar, padding: "calc(env(safe-area-inset-top) + 12px) 14px 12px 16px" }}>
        <Avatar name={who} photo={whoAvatar} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: VIEWER_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{who}</div>
          <div style={{ fontSize: 13, color: VIEWER_MUTED, marginTop: 2, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
            <MapPin size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{[entry.location, entry.date].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Sluiten" style={{ background: "none", border: "none", padding: 8, cursor: "pointer", color: VIEWER_TEXT, display: "flex" }}>
          <X size={26} />
        </button>
      </div>

      <div ref={photoRef} onClick={() => { if (!justDragged.current) onClose(); }} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src ? (
          <img src={src} alt={entry.name} draggable={false} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", pointerEvents: "none" }} />
        ) : (
          <Martini size={56} color={VIEWER_MUTED} strokeWidth={1.2} />
        )}
      </div>

      <div data-viewer-bar style={{ ...bar, padding: "14px 18px calc(env(safe-area-inset-bottom) + 16px)" }}>
        {matched ? <RecipeCircle recipe={matched} allIngredients={allIngredients} size={52} /> : (
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(251,246,234,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Martini size={22} color={VIEWER_TEXT} strokeWidth={1.4} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 19, color: VIEWER_TEXT, lineHeight: 1.2 }}>{entry.name}</div>
          {subtitle && <div style={{ fontSize: 13, color: VIEWER_MUTED, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, background: "rgba(251,246,234,0.1)", borderRadius: 100, padding: "6px 11px" }}>
          <Star size={13} fill="#D8AE5E" color="#D8AE5E" />
          <span style={{ fontWeight: 700, fontSize: 14, color: VIEWER_TEXT }}>{formatRating(entry.rating)}</span>
        </div>
      </div>
    </div>
  ), document.body);
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
      fontFamily: systemFont, fontWeight: 700, fontSize: size * 0.42,
    }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

// Wat jij en een vriend delen: samen gedronken (via tags), allebei geproefd
// (zelfde cocktail los ingecheckt) en iets wat de vriend lekker vindt en jij
// nog niet hebt gehad. Alles uit bestaande check-ins en tags afgeleid.
function computeTogether({ myLog, herLog, pairTags, myId, recipes }) {
  const findMatch = (e) => e.recipeId ? recipes.find(r => r.id === e.recipeId) : recipes.find(r => r.name.toLowerCase() === e.name.toLowerCase());
  const myById = Object.fromEntries(myLog.map(e => [String(e.id), e]));
  const herById = Object.fromEntries(herLog.map(e => [String(e.id), e]));
  const seen = new Set();
  const events = [];
  pairTags.forEach(t => {
    const iTagged = t.tagger_id === myId;
    const mine = iTagged ? myById[String(t.checkin_id)] : (t.adopted_checkin_id != null ? myById[String(t.adopted_checkin_id)] : null);
    const hers = iTagged ? (t.adopted_checkin_id != null ? herById[String(t.adopted_checkin_id)] : null) : herById[String(t.checkin_id)];
    const ids = [mine?.id, hers?.id].filter(x => x != null).map(String);
    if (ids.length === 0 || ids.some(id => seen.has(id))) return;
    ids.forEach(id => seen.add(id));
    const base = mine || hers;
    events.push({ key: ids.join("-"), name: base.name, recipe: findMatch(base), location: base.location, createdAt: base.createdAt || base.date, date: base.date, me: mine?.rating ?? null, her: hers?.rating ?? null, herEntryId: hers?.id ?? null, myEntryId: mine?.id ?? null });
  });
  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const keyOf = (e) => e.recipeId ? `id:${e.recipeId}` : `name:${e.name.trim().toLowerCase()}`;
  const avgBy = (log) => {
    const m = {};
    log.forEach(e => { const k = keyOf(e); (m[k] = m[k] || { name: e.name, sum: 0, n: 0 }); m[k].sum += e.rating; m[k].n += 1; });
    return m;
  };
  const mineAvg = avgBy(myLog), herAvg = avgBy(herLog);
  const roundHalf = (x) => Math.round(x * 2) / 2;
  let both = Object.keys(mineAvg).filter(k => herAvg[k]).map(k => ({
    key: k, name: mineAvg[k].name, me: roundHalf(mineAvg[k].sum / mineAvg[k].n), her: roundHalf(herAvg[k].sum / herAvg[k].n), n: mineAvg[k].n + herAvg[k].n,
  })).sort((a, b) => b.n - a.n).slice(0, 4);
  const maxDiff = Math.max(0, ...both.map(b => Math.abs(b.me - b.her)));
  both = both.map(b => {
    const d = Math.abs(b.me - b.her);
    const note = d === 0 ? "Jullie zijn het eens" : (d === maxDiff && d >= 1 ? "Hier verschillen jullie het meest" : d === 0.5 ? "Scheelt een halve ster" : `Scheelt ${formatRating(d)} ster${d === 1 ? "" : "ren"}`);
    return { ...b, note };
  });

  const triedKeys = new Set(myLog.map(keyOf));
  const tryOne = herLog
    .filter(e => e.rating >= 4 && !triedKeys.has(keyOf(e)) && findMatch(e))
    .sort((a, b) => b.rating - a.rating || new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))[0] || null;

  const firstDate = events.length ? events[events.length - 1].createdAt : null;
  return { events, both, tryOne: tryOne ? { entry: tryOne, recipe: findMatch(tryOne) } : null, firstDate };
}

// Profiel van een vriend: zelfde opbouw als je eigen profiel (ring, rang,
// kerncijfers, Check-ins · Smaak · Prestaties), schermvullend, plus "Samen".
// Melden en blokkeren zitten achter de ··· rechtsboven.
function FriendProfileSheet({ friendId, friendProfile, recipes, allIngredients, onClose, session, onBlocked, myLogboek = [], onOpenRecipe, myProfile = null }) {
  const [logboek, setLogboek] = useState(null);
  const [pairTags, setPairTags] = useState([]);
  const myId = session?.user?.id;
  const [tab, setTab] = useState("checkins");
  const [view, setView] = useState("profiel");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reported, setReported] = useState(false);
  const [photoViewer, setPhotoViewer] = useState(null);
  const [activeAchievementId, setActiveAchievementId] = useState(null);
  const scrollRef = useRef(null);

  const blockUser = async () => {
    if (!myId || blocking) return;
    setBlocking(true);
    await supabase.from("blocked_users").insert({ blocker_id: myId, blocked_id: friendId });
    await supabase.from("friendships").delete().or(`and(requester_id.eq.${myId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${myId})`);
    setBlocking(false);
    onBlocked?.();
  };
  const reportUser = async () => {
    setMenuOpen(false);
    if (!myId || reported) return;
    const { error } = await supabase.from("content_reports").insert({ reporter_id: myId, target_type: "user", target_id: friendId });
    if (!error) setReported(true);
  };

  useEffect(() => {
    let cancelled = false;
    supabase.from("checkins").select("*").eq("user_id", friendId).order("created_at", { ascending: false })
      .then(({ data }) => { if (!cancelled) setLogboek((data || []).map(checkinRowToEntry)); });
    if (myId) {
      supabase.from("checkin_tags").select("*")
        .or(`and(tagger_id.eq.${myId},tagged_user_id.eq.${friendId}),and(tagger_id.eq.${friendId},tagged_user_id.eq.${myId})`)
        .then(({ data, error }) => { if (!cancelled && !error) setPairTags(data || []); });
    }
    return () => { cancelled = true; };
  }, [friendId, myId]);

  useBodyScrollLock();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [view]);

  const stats = useMemo(() => (logboek ? computeCheckinStats(logboek) : null), [logboek]);
  const insights = useMemo(
    () => (logboek && stats) ? computeCheckinInsights(logboek, recipes, allIngredients, () => false, stats.uniques) : null,
    [logboek, stats, recipes, allIngredients]
  );
  const myInsights = useMemo(() => {
    if (!myLogboek.length) return null;
    const st = computeCheckinStats(myLogboek);
    return computeCheckinInsights(myLogboek, recipes, allIngredients, () => false, st.uniques);
  }, [myLogboek, recipes, allIngredients]);
  const together = useMemo(
    () => logboek ? computeTogether({ myLog: myLogboek, herLog: logboek, pairTags, myId, recipes }) : null,
    [logboek, myLogboek, pairTags, myId, recipes]
  );
  const name = friendProfile?.name || "Vriend";
  const firstName = name.split(" ")[0];
  const friendRank = profileCourseRank(friendProfile);
  const findMatch = (e) => e.recipeId ? recipes.find(r => r.id === e.recipeId) : recipes.find(r => r.name.toLowerCase() === e.name.toLowerCase());
  const withMeIds = useMemo(() => new Set((together?.events || []).map(ev => ev.herEntryId).filter(x => x != null).map(String)), [together]);
  const monthName = (iso) => iso ? new Date(iso).toLocaleDateString("nl-NL", { month: "long" }) : "";
  const shortDate = (d) => {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("nl-NL", { day: "numeric", month: "short", ...(dt.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  };

  const label = (text) => <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED, margin: "0 0 8px" }}>{text}</div>;
  const pairAvatars = (size, ring) => (
    <span style={{ position: "relative", display: "block", width: size * 1.55, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", left: 0, top: 0, display: "block", width: size, height: size, borderRadius: "50%" }}><Avatar name={myProfile?.name || "Jij"} photo={myProfile?.avatar_url} size={size} /></span>
      <span style={{ position: "absolute", left: size * 0.55, top: 0, display: "block", width: size, height: size, borderRadius: "50%", boxShadow: `0 0 0 ${size > 40 ? 3 : 2}px ${ring}` }}><Avatar name={name} photo={friendProfile?.avatar_url} size={size} /></span>
    </span>
  );

  const header = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, marginBottom: 8, position: "relative" }}>
      <button onClick={view === "samen" ? () => setView("profiel") : onClose} style={{ display: "flex", alignItems: "center", gap: 2, minHeight: 44, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 16, fontWeight: 600, color: "#8F6A21" }}>
        <ChevronLeft size={22} /> {view === "samen" ? firstName : "Terug"}
      </button>
      {view === "profiel" && (
        <button onClick={() => setMenuOpen(o => !o)} aria-label="Meer" aria-expanded={menuOpen} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: PAPER_DEEP, color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <MoreHorizontal size={18} />
        </button>
      )}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
          <div className="accordion-reveal" style={{ position: "absolute", right: 0, top: 46, zIndex: 2, minWidth: 210, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: "0 10px 30px rgba(43,38,32,0.18)", overflow: "hidden" }}>
            <button onClick={reportUser} disabled={reported} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "0 16px", background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, cursor: reported ? "default" : "pointer", fontFamily: sans, fontSize: 15, color: INK, textAlign: "left" }}>
              {reported ? <Check size={16} color={SAGE} /> : <Flag size={16} />} {reported ? "Gemeld" : `Meld ${firstName}`}
            </button>
            <button onClick={() => { setMenuOpen(false); setConfirmBlock(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "0 16px", background: "none", border: "none", cursor: "pointer", fontFamily: sans, fontSize: 15, color: BURGUNDY, textAlign: "left" }}>
              <UserX size={16} /> Blokkeer {firstName}
            </button>
          </div>
        </>
      )}
    </div>
  );

  const samenView = together && (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        {pairAvatars(56, PAPER)}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, margin: 0, color: INK }}>Jij en {firstName}</h1>
          <div style={{ fontSize: 13.5, color: MUTED, marginTop: 2 }}>
            {together.events.length > 0 ? `${together.events.length} keer samen gedronken · sinds ${monthName(together.firstDate)}` : "Nog niet samen ingecheckt"}
          </div>
        </div>
      </div>

      {label("Samen gedronken")}
      {together.events.length > 0 ? (
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "0 14px", marginBottom: 22 }}>
          {together.events.slice(0, 12).map((ev, i) => (
            <div key={ev.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
              {ev.recipe ? <RecipeCircle recipe={ev.recipe} allIngredients={allIngredients} size={44} radius={10} /> : <span style={{ width: 44, height: 44, borderRadius: 10, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Martini size={18} color={MUTED} /></span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: serif, fontSize: 15.5, fontWeight: 700, color: INK }}>{ev.name}</span>
                <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{ev.location} · {shortDate(ev.date)}</span>
              </span>
              <span style={{ textAlign: "right", fontSize: 12.5, lineHeight: 1.45, flexShrink: 0, color: INK }}>
                <span style={{ display: "block" }}>Jij <strong>{ev.me != null ? formatRating(ev.me) : "–"}</strong></span>
                <span style={{ display: "block", color: "#8F6A21" }}>{firstName} <strong>{ev.her != null ? formatRating(ev.her) : "–"}</strong></span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: "0 0 22px" }}>Tag {firstName} bij je volgende check-in onder "Met wie drink je?", dan verschijnt hij hier.</p>
      )}

      {together.both.length > 0 && (
        <>
          {label("Allebei geproefd")}
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 14, marginBottom: 22 }}>
            {together.both.map(b => (
              <div key={b.key} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: INK }}>{b.name}</span>
                  <span style={{ color: MUTED, fontSize: 12.5, textAlign: "right" }}>{b.note}</span>
                </div>
                <div style={{ position: "relative", height: 6, borderRadius: 3, background: PAPER_DEEP, margin: "0 7px" }}>
                  {[[b.me, BOTTLE], [b.her, BRASS]].map(([v, c], i) => (
                    <span key={i} style={{ position: "absolute", top: "50%", left: `${((v - 1) / 4) * 100}%`, width: 14, height: 14, borderRadius: "50%", border: `2px solid ${CREAM}`, boxSizing: "border-box", transform: "translate(-50%, -50%)", background: c }} />
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: MUTED }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: BOTTLE }} />Jij</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: BRASS }} />{firstName}</span>
            </div>
          </div>
        </>
      )}

      {together.tryOne && (
        <>
          {label(`Probeer wat ${firstName} lekker vindt`)}
          <div style={{ background: BOTTLE_DARK, color: CREAM, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <RecipeCircle recipe={together.tryOne.recipe} allIngredients={allIngredients} size={56} radius={12} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: serif, fontSize: 17, fontWeight: 700 }}>{together.tryOne.recipe.name}</span>
              <span style={{ display: "block", fontSize: 12.5, color: "#C9D2CB", marginTop: 2 }}>{firstName} gaf een {formatRating(together.tryOne.entry.rating)} · jij hebt hem nog niet gehad</span>
            </span>
            {onOpenRecipe && (
              <button onClick={() => { onClose(); onOpenRecipe(together.tryOne.recipe.id); }} style={{ minHeight: 44, background: "none", border: "none", color: "#DDB877", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>Recept</button>
            )}
          </div>
        </>
      )}
    </>
  );

  const showSamenStrip = together && (together.events.length > 0 || together.both.length > 0 || together.tryOne);
  const lastEvent = together?.events[0];

  const profielView = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <CourseRing name={name} photo={friendProfile?.avatar_url} size={84} partsDone={friendRank.partsDone} master={friendRank.master} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {friendRank.rank && <div style={{ margin: "5px 0 3px" }}><CourseRankLabel courseRank={friendRank} chip /></div>}
          {insights && <div style={{ fontSize: 14, fontWeight: 600, color: BRASS, marginTop: 2 }}>Niveau {insights.level.level} · {insights.level.title}</div>}
        </div>
      </div>

      {stats && (
        <div style={{ display: "flex", background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "12px 0", marginBottom: 12 }}>
          {[
            { value: stats.total, label: "check-ins" },
            { value: stats.uniques, label: "uniek" },
            { value: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{stats.total > 0 ? formatDecimal1(stats.avg) : "–"}<Star size={13} fill={BRASS} color={BRASS} /></span>, label: "gemiddeld" },
          ].map((c, i) => (
            <div key={c.label} style={{ flex: 1, textAlign: "center", borderLeft: i === 0 ? "none" : `1px solid ${BORDER}` }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 20, color: INK }}>{c.value}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {showSamenStrip && (
        <button onClick={() => setView("samen")} className="press-scale" style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 16,
          background: BOTTLE_DARK, color: CREAM, border: "none", cursor: "pointer", textAlign: "left", fontFamily: sans, marginBottom: 18,
        }}>
          {pairAvatars(34, BOTTLE_DARK)}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>
              {together.events.length > 0 ? `${together.events.length} keer samen gedronken` : together.both.length > 0 ? `${together.both.length} cocktail${together.both.length === 1 ? "" : "s"} allebei geproefd` : "Jij en " + firstName}
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: "#C9D2CB", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {lastEvent ? `Laatst: ${lastEvent.name} · ${shortDate(lastEvent.date)}` : `Bekijk wat jullie delen`}
            </span>
          </span>
          <ChevronRight size={16} color="#DDB877" />
        </button>
      )}

      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 12, marginBottom: 16 }}>
        {[["checkins", "Check-ins"], ["smaak", "Smaak"], ["prestaties", "Prestaties"]].map(([id, lbl]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{
            flex: 1, height: 34, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 600,
            background: tab === id ? CREAM : "transparent", color: tab === id ? INK : MUTED,
            boxShadow: tab === id ? "0 1px 4px rgba(43,38,32,0.14)" : "none",
          }}>{lbl}</button>
        ))}
      </div>

      {!logboek ? (
        <p style={{ color: MUTED, fontSize: 13.5, textAlign: "center", padding: "40px 0" }}>Bezig met laden…</p>
      ) : tab === "checkins" ? (
        logboek.length === 0 ? (
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "26px 20px", textAlign: "center", fontSize: 14, color: MUTED }}>{firstName} heeft nog niets ingecheckt.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginLeft: -20, marginRight: -20 }}>
            {logboek.map(entry => {
              const matched = findMatch(entry);
              const recipeImg = matched && (localItemImageUrl("cocktail", matched.id) || matched.image);
              const src = entry.photo || recipeImg;
              return (
                <button key={entry.id} onClick={() => setPhotoViewer({ entry, matched })} aria-label={`${entry.name}, ${formatRating(entry.rating)} sterren`} style={{
                  position: "relative", aspectRatio: "1", overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: PAPER_DEEP,
                }}>
                  {src ? (
                    <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: entry.photo ? "none" : RECIPE_PHOTO_FILTER }} />
                  ) : matched ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <RecipeCircle recipe={matched} allIngredients={allIngredients} size={96} radius={12} />
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, boxSizing: "border-box" }}>
                      <Martini size={28} color={BRASS} strokeWidth={1.4} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: INK, textAlign: "center", lineHeight: 1.2 }}>{entry.name}</span>
                    </div>
                  )}
                  <div className="glass-chip-dark" style={{ position: "absolute", left: 6, bottom: 6, display: "flex", alignItems: "center", gap: 3, borderRadius: 100, padding: "2px 7px" }}>
                    <span style={{ fontSize: 12, color: CREAM, fontWeight: 700 }}>{formatRating(entry.rating)}</span>
                    <Star size={10} fill="#D8AE5E" color="#D8AE5E" />
                  </div>
                  {withMeIds.has(String(entry.id)) && (
                    <span title="Samen met jou" style={{ position: "absolute", right: 6, top: 6, borderRadius: "50%", boxShadow: `0 0 0 1.5px ${CREAM}` }}>
                      <Avatar name={myProfile?.name || "Jij"} photo={myProfile?.avatar_url} size={22} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )
      ) : tab === "smaak" ? (
        <>
          <div style={{ background: BOTTLE_DARK, color: CREAM, borderRadius: 18, padding: "18px 18px 14px", boxShadow: SHADOW_HERO, borderBottom: `3px solid ${BRASS}`, marginBottom: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#DDB877", marginBottom: 6 }}>Smaakprofiel van {firstName}</div>
            {insights?.personality && (
              <>
                <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 25, lineHeight: 1.15 }}>{insights.personality.title.charAt(0) + insights.personality.title.slice(1).toLowerCase()}</div>
              </>
            )}
            {insights?.hasTaste && logboek.length >= 3 ? (
              <>
                <div style={{ marginTop: 6 }}><TasteRadar taste={insights.taste} compare={myInsights?.hasTaste ? myInsights.taste : null} /></div>
                {myInsights?.hasTaste && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, color: "#C9D2CB" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, background: "#DDB877", borderRadius: 2 }} />{firstName}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, borderTop: "2px dashed #C9D2CB" }} />Jij</span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginTop: 12, padding: "14px 12px", borderRadius: 12, background: "rgba(251,246,234,0.08)", fontSize: 14, textAlign: "center" }}>
                {firstName} heeft nog te weinig ingecheckt voor een smaakprofiel
              </div>
            )}
          </div>
          {insights && <TasteDetails insights={insights} logboek={logboek} recipes={recipes} allIngredients={allIngredients} />}
        </>
      ) : (
        <>
          {friendProfile?.course_completed_at && (
            <CourseDiploma date={friendProfile.course_completed_at} scorePct={friendProfile.course_exam_score} isOwn={false} />
          )}
          <CourseProgressCard courseRank={friendRank} firstName={firstName} />
          {insights && (() => {
            const achieved = insights.achievements.filter(a => a.unlocked).length;
            const active = insights.achievements.find(a => a.id === activeAchievementId) || null;
            return (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 10 }}>
                  <SectionLabel>Badges</SectionLabel>
                  <span style={{ fontSize: 13, color: MUTED }}>{achieved} van {insights.achievements.length} behaald</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 10 }}>
                  {insights.achievements.map(a => {
                    const AchIcon = a.icon;
                    const selected = activeAchievementId === a.id;
                    return (
                      <button key={a.id} onClick={() => setActiveAchievementId(selected ? null : a.id)} aria-pressed={selected} style={{
                        background: CREAM, border: `1px solid ${selected ? BRASS : BORDER}`, borderRadius: 16, padding: "14px 8px 12px", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 7, fontFamily: sans, minWidth: 0,
                      }}>
                        <div style={{ width: 50, height: 50, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: a.unlocked ? BOTTLE_DARK : PAPER_DEEP, border: a.unlocked ? `2px solid ${BRASS}` : "none" }}>
                          <AchIcon size={21} strokeWidth={1.8} color={a.unlocked ? "#DDB877" : MUTED} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: INK, textAlign: "center", lineHeight: 1.2 }}>{a.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: a.unlocked ? SAGE : MUTED }}>{a.unlocked ? "Behaald" : "Nog niet"}</span>
                      </button>
                    );
                  })}
                </div>
                {active && (
                  <div className="accordion-reveal" style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "12px 14px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{active.label}</div>
                    <div style={{ fontSize: 13, color: MUTED, marginTop: 1 }}>{active.text}</div>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}
    </>
  );

  return createPortal((
    <div ref={scrollRef} className="push-slide-in" style={{
      position: "fixed", inset: 0, zIndex: 30, background: PAPER, overflowY: "auto", overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch", fontFamily: sans, color: INK,
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 8px) 20px calc(env(safe-area-inset-bottom) + 36px)", overflowX: "hidden" }}>
        <EdgeSwipeBackArea onBack={view === "samen" ? () => setView("profiel") : onClose}>
          {header}
          {view === "samen" ? samenView : profielView}
        </EdgeSwipeBackArea>
      </div>
      {photoViewer && <CheckinPhotoViewer entry={photoViewer.entry} matched={photoViewer.matched} who={name} whoAvatar={friendProfile?.avatar_url} allIngredients={allIngredients} onClose={() => setPhotoViewer(null)} />}
      {confirmBlock && (
        <ConfirmDialog title={`${firstName} blokkeren?`}
          message={`Jullie zijn dan geen vrienden meer en ${firstName} kan je niet meer vinden of je check-ins zien.`}
          confirmLabel={blocking ? "Bezig…" : "Blokkeer"} busy={blocking}
          onCancel={() => setConfirmBlock(false)} onConfirm={blockUser} />
      )}
    </div>
  ), document.body);
}

// Vrienden + feed: vrienden zoeken/beheren draait op de `friendships`-tabel
// (twee kanten: requester/addressee, status pending/accepted), de feed leest
// gewoon uit dezelfde `checkins`-tabel als je eigen logboek — RLS zorgt dat je
// alléén rijen van geaccepteerde vrienden binnenkrijgt, niet van iedereen.
function VriendenTab({ session, profile, recipes, allIngredients, onSound, active, myLogboek = [], onOpenRecipe }) {
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
    const result = await shareLink({ title: "Mijn Thuisbar", text: "Voeg me toe als vriend in Mijn Thuisbar, dan zien we elkaars check-ins!", url: publicAppUrl(`invite=${myId}`) });
    if (result === "cancelled") return;
    setShareState(result === "no-url" ? "failed" : result);
    setTimeout(() => setShareState(null), 2500);
  };

  const loadFriendships = async () => {
    const { data } = await supabase.from("friendships").select("*").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
    const rows = data || [];
    setFriendships(rows);
    const otherIds = [...new Set(rows.map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id)))];
    if (otherIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", otherIds);
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
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: INK }}>{profilesById[otherId]?.name || "…"} <CourseRankLabel courseRank={profileCourseRank(profilesById[otherId])} /></span>
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
          myLogboek={myLogboek}
          myProfile={profile}
          onOpenRecipe={onOpenRecipe}
          onBlocked={() => { setOpenFriendId(null); loadFriendships(); }}
          onClose={() => setOpenFriendId(null)}
        />
      )}
    </div>
  );
}

// ===== Eigen recepten: nieuw recept =====
// Ingrediënten, stijl en glas worden gekozen uit wat de app kent (i.p.v.
// vrij getypt), zodat een eigen recept altijd meetelt bij "Wat kan ik
// maken", de voorraad en de boodschappenlijst.
const EIGEN_FAMILIES = [
  { value: "Sours", label: "Sours" }, { value: "Highballs", label: "Highballs" },
  { value: "Stirred-down", label: "Stirred-down" }, { value: "Spirit-forward", label: "Spirit-forward" },
  { value: "Fizz / Flip", label: "Fizz / Flip" }, { value: "Modern / Tiki", label: "Tiki" },
  { value: "Moderne klassiekers", label: "Moderne klassiekers" }, { value: "Zuivel & dessert", label: "Dessert" },
  { value: "Warme dranken", label: "Warm" }, { value: "Mocktail / alcoholvrij", label: "Alcoholvrij" },
];
const EIGEN_GLASSES = ["Coupe", "Rocks", "Highball", "Champagneflute", "Wijnglas", "Hurricane", "Koperen beker", "Glazen mok", "Julep beker"];
const EIGEN_GLASS_LABELS = { Champagneflute: "Flute", Wijnglas: "Wijn", "Koperen beker": "Koper", "Glazen mok": "Mok", "Julep beker": "Julep" };
const EIGEN_TECHNIQUES = [
  { key: "geschud", label: "Geschud", steps: (g) => ["Doe alles met ijs in de shaker.", "Shake stevig, ± 12 seconden.", `Zeef in een ${g}.`] },
  { key: "geroerd", label: "Geroerd", steps: (g) => ["Doe alles met ijs in een mengglas.", "Roer rustig 20 tot 30 seconden, tot het goed koud is.", `Zeef in een ${g}.`] },
  { key: "gebouwd", label: "Gebouwd", steps: () => ["Vul het glas met ijs.", "Schenk de ingrediënten in volgorde in het glas.", "Roer kort door."] },
  { key: "geblend", label: "Geblend", steps: (g) => ["Doe alles met een schep crushed ijs in de blender.", "Blend ± 20 seconden tot het glad is.", `Schenk in een ${g}.`] },
];
const EIGEN_GARNISHES = ["Limoenschijfje", "Citroenzeste", "Sinaasappelzeste", "Cocktailkers", "Takje munt", "Olijf"];
const EIGEN_UNITS = [{ key: "ml", label: "ml" }, { key: "dash", label: "dash" }, { key: "stuk", label: "stuk" }, { key: "top", label: "top op" }];
const EIGEN_NEW_CATS = [
  { cat: "Sterke drank", label: "Sterke drank" }, { cat: "Likeuren & versterkte wijnen", label: "Likeur" }, { cat: "Mixers", label: "Mixer" },
  { cat: "Vers", label: "Siroop / vers" }, { cat: "Bitters", label: "Bitters" }, { cat: "Zuivel & room", label: "Zuivel" },
];
const TOP_OP_ML = 60; // "top op": voor berekeningen ± 60 ml

// Hoe het glas in de laatste stap heet ("Zeef in een gekoelde coupe.").
const EIGEN_GLASS_PHRASES = {
  Coupe: "gekoelde coupe", Rocks: "rocksglas met ijs", Highball: "highballglas met ijs", Champagneflute: "gekoelde flute",
  Wijnglas: "wijnglas met ijs", Hurricane: "hurricaneglas met crushed ijs", "Koperen beker": "koperen beker met ijs",
  "Glazen mok": "glazen mok", "Julep beker": "julepbeker met crushed ijs",
};
function glassWord(glass) { return EIGEN_GLASS_PHRASES[glass] || "gekoeld glas"; }
function techniqueFromMethod(method) {
  const t = inferTechniques(method);
  if (t.includes("blend")) return "geblend";
  if (t.includes("stirred") && !t.includes("shaken")) return "geroerd";
  if (t.includes("build") && !t.includes("shaken")) return "gebouwd";
  return "geschud";
}

function IngredientPickerSheet({ allIngredients, isOwned, onPick, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null); // { id } | { newName }
  const [newCat, setNewCat] = useState(null);
  const [amount, setAmount] = useState({ amount: 15, unit: "ml" });
  const [custom, setCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const q = query.trim().toLowerCase();
  const results = q ? allIngredients.filter(i => i.name.toLowerCase().includes(q)).slice(0, 12) : [];
  const exact = q && allIngredients.some(i => i.name.toLowerCase() === q);
  const quick = [
    { amount: 10, unit: "ml", label: "10 ml" }, { amount: 15, unit: "ml", label: "15 ml" }, { amount: 22.5, unit: "ml", label: "22,5 ml" },
    { amount: 30, unit: "ml", label: "30 ml" }, { amount: 45, unit: "ml", label: "45 ml" }, { amount: 1, unit: "dash", label: "dash" }, { amount: TOP_OP_ML, unit: "top", label: "top op" },
  ];
  const ready = chosen && (chosen.id || (chosen.newName && newCat)) && (!custom || parseFloat(customAmount.replace(",", ".")) > 0);
  const submit = () => {
    if (!ready) return;
    const amt = custom ? { amount: parseFloat(customAmount.replace(",", ".")), unit: "ml" } : amount;
    onPick({ ...(chosen.id ? { id: chosen.id } : { newName: chosen.newName, newCat }), ...amt });
    close();
  };
  const chip = (on) => ({ minHeight: 40, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 600, border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : CREAM, color: on ? "#FBF6EA" : INK });
  const head = (t) => <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: MUTED, margin: "16px 0 8px" }}>{t}</div>;

  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in sheet-max-92" style={{ position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", height: "88vh", background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 20px 10px", touchAction: "none" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Ingrediënt kiezen</div>
          <button onClick={close} onTouchStart={e => e.stopPropagation()} style={{ minHeight: 44, background: "none", border: "none", color: BRASS, fontFamily: sans, fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "0 0 0 10px" }}>Annuleer</button>
        </div>
        <div data-kb-scope style={{ padding: "0 20px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: PAPER_DEEP, borderRadius: 12, padding: "0 12px" }}>
            <Search size={16} color={MUTED} />
            <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setChosen(null); }} placeholder="Zoek een ingrediënt" aria-label="Zoek een ingrediënt" autoCorrect="off"
              style={{ flex: 1, minHeight: 44, border: "none", outline: "none", background: "transparent", fontFamily: sans, fontSize: 16, color: INK }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px", WebkitOverflowScrolling: "touch" }}>
          {results.length > 0 && (<>
            {head("Uit de app")}
            <div role="radiogroup" style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
              {results.map((ing, i) => {
                const on = chosen?.id === ing.id;
                return (
                  <button key={ing.id} role="radio" aria-checked={on} onClick={() => setChosen({ id: ing.id })} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 56, padding: "6px 14px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, background: on ? "rgba(92,122,82,0.14)" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}><ItemArt ing={ing} /></div>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 600 }}>{ing.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{ing.cat === CUSTOM_CAT ? "Eigen ingrediënt" : ing.cat} · {isOwned({ id: ing.id }) ? "in huis" : "niet in huis"}</span>
                    </span>
                    {on && <Check size={17} color={SAGE} strokeWidth={2.6} />}
                  </button>
                );
              })}
            </div>
          </>)}
          {q && !exact && (<>
            {head("Niet gevonden?")}
            <div style={{ background: CREAM, border: `1.5px solid ${chosen?.newName ? BRASS : BORDER}`, borderRadius: 14, padding: "4px 14px 14px" }}>
              <button onClick={() => setChosen({ newName: query.trim() })} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, color: INK, textAlign: "left" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: BRASS, color: "#FBF6EA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Plus size={15} /></span>
                <span style={{ fontSize: 14.5 }}>Nieuw ingrediënt: <strong>{query.trim()}</strong></span>
              </button>
              {chosen?.newName && (<>
                <div style={{ fontSize: 12.5, color: MUTED, margin: "2px 0 8px" }}>In welke categorie hoort het?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {EIGEN_NEW_CATS.map(c => <button key={c.cat} onClick={() => setNewCat(c.cat)} aria-pressed={newCat === c.cat} style={chip(newCat === c.cat)}>{newCat === c.cat ? "✓ " : ""}{c.label}</button>)}
                </div>
              </>)}
            </div>
          </>)}
          {head("Hoeveelheid")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {quick.map(o => {
              const on = !custom && amount.amount === o.amount && amount.unit === o.unit;
              return <button key={o.label} onClick={() => { setCustom(false); setAmount({ amount: o.amount, unit: o.unit }); }} aria-pressed={on} style={chip(on)}>{o.label}</button>;
            })}
            <button onClick={() => setCustom(true)} aria-pressed={custom} style={{ ...chip(custom), color: custom ? "#FBF6EA" : BRASS }}>Anders…</button>
          </div>
          {custom && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              <input value={customAmount} onChange={e => setCustomAmount(e.target.value)} inputMode="decimal" placeholder="Bijv. 20" aria-label="Hoeveelheid in ml"
                style={{ width: 110, minHeight: 44, borderRadius: 12, border: `1px solid ${BORDER}`, background: CREAM, padding: "0 12px", fontFamily: sans, fontSize: 16, color: INK }} />
              <span style={{ fontSize: 14, color: MUTED }}>ml</span>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom) + 14px)", borderTop: `1px solid ${BORDER}` }}>
          <button onClick={submit} disabled={!ready} className="press-scale" style={{ width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: ready ? BOTTLE_DARK : BORDER, color: ready ? "#FBF6EA" : MUTED, fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: ready ? "pointer" : "default" }}>Voeg toe aan recept</button>
        </div>
      </div>
    </div>
  ), document.body);
}

// Eén ingrediëntregel: veeg naar links = verwijderen, lang indrukken = verslepen.
function EigenIngredientRow({ row, index, count, meta, owned, onChange, onRemove, onMove, dragState, setDragState }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = null, startY = 0, active = false, rowH = 56;
    const start = (e) => {
      if (e.target.closest("input,select,button")) return;
      startY = e.touches[0].clientY; rowH = el.offsetHeight || 56;
      timer = setTimeout(() => { active = true; hapticFor("tick"); setDragState({ index, dy: 0 }); }, 450);
    };
    const move = (e) => {
      const dy = e.touches[0].clientY - startY;
      if (!active) { if (Math.abs(dy) > 8) clearTimeout(timer); return; }
      e.preventDefault(); e.stopPropagation();
      setDragState({ index, dy });
    };
    const end = (e) => {
      clearTimeout(timer);
      if (!active) return;
      active = false;
      e.stopPropagation();
      const dy = (e.changedTouches?.[0]?.clientY ?? startY) - startY;
      const to = Math.max(0, Math.min(count - 1, index + Math.round(dy / rowH)));
      setDragState(null);
      if (to !== index) onMove(index, to);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => { clearTimeout(timer); el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); el.removeEventListener("touchcancel", end); };
  }, [index, count]);
  const dragging = dragState?.index === index;
  const name = meta?.name || row.newName || row.name || "?";
  const isNew = !!row.newName;
  const amountText = row.unit === "top" ? "" : (row.amount === "" || row.amount == null ? "" : String(row.amount).replace(".", ","));
  const content = (
    <div ref={ref} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: CREAM,
      transform: dragging ? `translateY(${dragState.dy}px) scale(1.02)` : "none", boxShadow: dragging ? "0 8px 20px rgba(43,38,32,0.2)" : "none",
      position: "relative", zIndex: dragging ? 2 : 0, transition: dragging ? "none" : "transform 0.15s ease",
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}>
        {meta ? <ItemArt ing={meta} /> : <div style={{ width: "100%", height: "100%", background: "rgba(184,134,46,0.18)", color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{name[0]?.toUpperCase()}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 1 }}>
          {isNew ? <span style={{ color: "#8A6420", fontWeight: 600 }}>Nieuw ingrediënt · {EIGEN_NEW_CATS.find(c => c.cat === row.newCat)?.label || row.newCat}</span>
            : owned ? <span style={{ color: SAGE, fontWeight: 600 }}>✓ in huis</span> : <span style={{ color: MUTED }}>niet in huis</span>}
          <button onClick={() => onChange({ optional: !row.optional })} aria-pressed={!!row.optional} style={{ minHeight: 26, padding: "0 8px", borderRadius: 100, border: `1px solid ${row.optional ? BRASS : BORDER}`, background: row.optional ? "rgba(184,134,46,0.16)" : "transparent", color: row.optional ? "#8A6420" : MUTED, fontFamily: sans, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>optioneel</button>
        </div>
      </div>
      {row.unit !== "top" && (
        <input value={amountText} onChange={e => onChange({ amount: e.target.value.replace(",", ".") })} inputMode="decimal" aria-label={`Hoeveelheid ${name}`}
          style={{ width: 52, minHeight: 40, borderRadius: 10, border: "none", background: PAPER_DEEP, textAlign: "center", fontFamily: sans, fontSize: 16, fontWeight: 700, color: INK, padding: 0 }} />
      )}
      <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 2, minHeight: 40, padding: "0 10px", borderRadius: 10, background: PAPER_DEEP, fontSize: 13, color: MUTED, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
        {EIGEN_UNITS.find(u => u.key === row.unit)?.label || row.unit} <ChevronDown size={13} />
        <select value={row.unit} aria-label={`Eenheid ${name}`} onChange={e => onChange({ unit: e.target.value, ...(e.target.value === "top" ? { amount: TOP_OP_ML } : {}) })} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", fontSize: 16 }}>
          {EIGEN_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
        </select>
      </label>
    </div>
  );
  return <SwipeToDelete onDelete={onRemove}>{content}</SwipeToDelete>;
}

function EigenRecepten({ customRecipes, allIngredients, recipes, isOwned, recentRecipeIds = [], favoriteRecipeIds = [], onSaveRecipe, onRemoveRecipe, onAddToShoppingList, shoppingKeys, onOpenRecipe, onSound }) {
  const blank = { name: "", family: "", glass: "", rows: [], technique: "geschud", steps: null, garnishes: [], photo: null, editingId: null };
  const [form, setForm] = useState(blank);
  const [picker, setPicker] = useState(false);
  const [fromExisting, setFromExisting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [customGarnish, setCustomGarnish] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const metaOf = (row) => row.id ? allIngredients.find(i => i.id === row.id) : row.name ? allIngredients.find(i => i.name.toLowerCase() === row.name.toLowerCase()) : null;
  const tech = EIGEN_TECHNIQUES.find(t => t.key === form.technique) || EIGEN_TECHNIQUES[0];
  const steps = form.steps ?? tech.steps(glassWord(form.glass));
  const canSave = form.name.trim().length > 0 && form.rows.length >= 2;

  const buildRecipe = (idMap = {}) => {
    const ingredients = form.rows.map(r => {
      const amount = r.unit === "top" ? TOP_OP_ML : (parseFloat(r.amount) || 0);
      const unit = r.unit === "top" ? "ml" : r.unit;
      const base = r.newName ? (idMap[r.key] ? { id: idMap[r.key] } : { name: r.newName }) : r.id ? { id: r.id } : { name: r.name };
      return { ...base, amount, unit, ...(r.unit === "top" ? { top: true } : {}), ...(r.optional ? { optional: true } : {}) };
    });
    const cleanSteps = steps.map(s => s.trim()).filter(Boolean);
    return {
      id: form.editingId || "custom_" + Date.now().toString(36),
      name: form.name.trim() || "Naamloos recept", family: form.family || "Eigen recept", glass: form.glass || "Naar keuze",
      ingredients, steps: cleanSteps, method: cleanSteps.join(" ") || "—", garnish: form.garnishes.join(", "),
      ...(form.photo ? { image: form.photo } : {}),
    };
  };

  // Navigatiebalk: titel + "Bewaar" rechts.
  const setNavOverride = useContext(NavOverrideContext);
  const saveRef = useRef(null);
  useEffect(() => {
    if (!setNavOverride) return;
    setNavOverride({
      title: form.editingId ? "Recept bewerken" : "Nieuw recept",
      right: <button onClick={() => saveRef.current?.()} disabled={!canSave} style={{ minHeight: 44, background: "none", border: "none", padding: "0 0 0 10px", fontFamily: sans, fontSize: 15.5, fontWeight: 800, color: canSave ? BOTTLE : MUTED, opacity: canSave ? 1 : 0.55, cursor: canSave ? "pointer" : "default" }}>Bewaar</button>,
    });
  }, [setNavOverride, canSave, form.editingId]);
  useEffect(() => () => setNavOverride && setNavOverride(null), [setNavOverride]);

  const save = () => {
    if (!canSave) return;
    const newOnes = form.rows.filter(r => r.newName).map(r => ({ key: r.key, name: r.newName, cat: r.newCat }));
    const recipe = onSaveRecipe(newOnes, (idMap) => buildRecipe(idMap));
    onSound("chime");
    setSaved(recipe);
  };
  saveRef.current = save;

  const startFrom = (id) => {
    const r = recipes.find(x => x.id === id);
    if (!r) return;
    const glass = EIGEN_GLASSES.find(g => normalizeGlass(g) === normalizeGlass(r.glass)) || "";
    setForm({
      ...blank, name: `Mijn ${r.name}`, family: EIGEN_FAMILIES.some(f => f.value === r.family) ? r.family : "", glass,
      rows: r.ingredients.map((ing, i) => ({ key: `r${Date.now()}${i}`, id: findIngredientMeta(ing, allIngredients)?.id || ing.id, name: ing.name, amount: ing.top ? TOP_OP_ML : ing.amount, unit: ing.top ? "top" : ing.unit, optional: !!ing.optional })),
      technique: techniqueFromMethod(r.method), steps: r.steps || splitMethodIntoSteps(r.method),
      garnishes: r.garnish ? [r.garnish.replace(/\.$/, "")] : [],
    });
    window.scrollTo({ top: 0 });
  };
  const editExisting = (r) => { startFrom(r.id); setForm(f => ({ ...f, name: r.name, editingId: r.id, photo: r.image || null })); };

  const addRow = (pick) => set({ rows: [...form.rows, { key: `r${Date.now()}`, ...pick, optional: false }] });
  const updateRow = (i, patch) => set({ rows: form.rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
  const moveRow = (from, to) => { const rows = form.rows.slice(); const [x] = rows.splice(from, 1); rows.splice(to, 0, x); set({ rows }); };
  const setStep = (i, text) => set({ steps: steps.map((s, j) => j === i ? text : s) });

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const size = 480, s = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        canvas.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        set({ photo: canvas.toDataURL("image/jpeg", 0.62) });
        setPhotoBusy(false);
      };
      img.onerror = () => setPhotoBusy(false);
      img.src = ev.target.result;
    };
    reader.onerror = () => setPhotoBusy(false);
    reader.readAsDataURL(file);
  };

  const draft = buildRecipe();
  const label = (t, extra) => <div style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "22px 0 10px" }}>{t}{extra && <span style={{ fontWeight: 500, color: MUTED }}> {extra}</span>}</div>;
  const chip = (on) => ({ minHeight: 40, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 600, border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : CREAM, color: on ? "#FBF6EA" : INK });
  const ingLabel = (ref) => findIngredientMeta(ref, allIngredients)?.name || ref.name || ref.id;
  const savedMissing = saved ? saved.ingredients.filter(i => !i.optional && !isOwned(i)) : [];

  return (
    <div style={{ fontFamily: sans }}>
      <button onClick={() => setFromExisting(true)} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 60, padding: "8px 14px", borderRadius: 14, border: `1px solid ${BORDER}`, background: CREAM, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK, boxShadow: SHADOW_CARD }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: PAPER_DEEP, color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Layers size={17} /></span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>Begin vanaf een bestaand recept</span>
          <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>Bijv. de Gimlet overnemen en aanpassen</span>
        </span>
        <ChevronRight size={18} color={MUTED} />
      </button>

      {/* Foto + naam */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 18 }}>
        <button onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Foto maken of kiezen" style={{ position: "relative", width: 92, height: 92, borderRadius: 18, border: "none", padding: 0, overflow: "visible", cursor: "pointer", flexShrink: 0, background: "none" }}>
          <div style={{ width: 92, height: 92, borderRadius: 18, overflow: "hidden" }}>
            {form.photo ? <img src={form.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <RecipeCircle recipe={{ ...draft, image: undefined, id: "__concept__" }} allIngredients={allIngredients} size={92} radius={18} />}
          </div>
          <span style={{ position: "absolute", right: -6, bottom: -6, width: 32, height: 32, borderRadius: "50%", background: BOTTLE_DARK, border: `3px solid ${PAPER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Camera size={14} color="#FBF6EA" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 2 }}>Naam</span>
          <input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Bijv. Rozemarijn Gimlet" autoCapitalize="words" enterKeyHint="done"
            style={{ width: "100%", boxSizing: "border-box", minHeight: 48, border: "none", borderBottom: `2px solid ${BOTTLE}`, background: "transparent", outline: "none", fontFamily: serif, fontSize: 24, fontWeight: 700, color: INK, padding: "4px 0" }} />
        </label>
      </div>

      {label("Stijl")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {EIGEN_FAMILIES.map(f => <button key={f.value} onClick={() => set({ family: form.family === f.value ? "" : f.value })} aria-pressed={form.family === f.value} style={chip(form.family === f.value)}>{f.label}</button>)}
      </div>

      {label("Glas")}
      <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "0 -20px", padding: "0 20px 4px" }}>
        {EIGEN_GLASSES.map(g => {
          const on = form.glass === g;
          return (
            <button key={g} onClick={() => set({ glass: on ? "" : g })} aria-pressed={on} style={{ flexShrink: 0, width: 66, height: 72, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 14, cursor: "pointer", fontFamily: sans, fontSize: 12, fontWeight: 600, background: CREAM, color: on ? INK : MUTED, border: `1.5px solid ${on ? BOTTLE : BORDER}` }}>
              <div style={{ height: 36, display: "flex", alignItems: "flex-end" }}><GlassArt glass={g} mono size={22} /></div>
              {EIGEN_GLASS_LABELS[g] || g}
            </button>
          );
        })}
      </div>

      {label("Ingrediënten")}
      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", boxShadow: SHADOW_CARD }}>
        {form.rows.map((row, i) => {
          const meta = row.newName ? null : metaOf(row);
          return (
            <div key={row.key || i} style={{ borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
              <EigenIngredientRow row={row} index={i} count={form.rows.length} meta={meta} owned={meta ? isOwned({ id: meta.id }) : false}
                onChange={(p) => updateRow(i, p)} onRemove={() => { onSound("remove"); set({ rows: form.rows.filter((_, j) => j !== i) }); }}
                onMove={moveRow} dragState={dragState} setDragState={setDragState} />
            </div>
          );
        })}
        <button onClick={() => setPicker(true)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 52, padding: "0 14px", border: "none", borderTop: form.rows.length ? `1px solid ${BORDER}` : "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={18} /> Ingrediënt toevoegen
        </button>
      </div>
      {form.rows.length > 0 && <p style={{ fontSize: 12, color: MUTED, margin: "8px 4px 0" }}>Veeg naar links om te verwijderen · houd vast om te verslepen</p>}

      {label("Techniek")}
      <div role="radiogroup" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 13 }}>
        {EIGEN_TECHNIQUES.map(t => {
          const on = form.technique === t.key;
          return <button key={t.key} role="radio" aria-checked={on} onClick={() => set({ technique: t.key, steps: null })} style={{ flex: 1, minHeight: 40, border: "none", borderRadius: 10, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700, background: on ? CREAM : "transparent", color: on ? INK : MUTED, boxShadow: on ? "0 1px 4px rgba(43,38,32,0.14)" : "none" }}>{t.label}</button>;
        })}
      </div>
      <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, marginTop: 10, padding: "4px 14px" }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
            <span style={{ width: 24, height: 24, marginTop: 8, borderRadius: "50%", border: `1.5px solid ${BRASS}`, color: BRASS, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" }}>{i + 1}</span>
            <div style={{ flex: 1 }}><AutoGrowTextField bare value={s} onChange={(v) => setStep(i, v)} placeholder="Beschrijf deze stap" /></div>
            <button onClick={() => set({ steps: steps.filter((_, j) => j !== i) })} aria-label={`Stap ${i + 1} verwijderen`} style={{ width: 36, height: 40, background: "none", border: "none", color: MUTED, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
          </div>
        ))}
        <button onClick={() => set({ steps: [...steps, ""] })} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 44, background: "none", border: "none", padding: 0, color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}><Plus size={16} /> Stap toevoegen</button>
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: "8px 4px 0" }}>Voorgesteld op basis van de techniek · tik op een stap om aan te passen</p>

      {label("Afwerking", "(optioneel)")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[...new Set([...EIGEN_GARNISHES, ...form.garnishes])].map(g => {
          const on = form.garnishes.includes(g);
          return <button key={g} onClick={() => set({ garnishes: on ? form.garnishes.filter(x => x !== g) : [...form.garnishes, g] })} aria-pressed={on} style={chip(on)}>{on ? "✓ " : ""}{g}</button>;
        })}
        {customGarnish === null ? (
          <button onClick={() => setCustomGarnish("")} style={{ ...chip(false), color: BRASS }}>+ Zelf typen</button>
        ) : (
          <form onSubmit={e => { e.preventDefault(); const v = customGarnish.trim(); if (v) set({ garnishes: [...form.garnishes, v] }); setCustomGarnish(null); }} style={{ display: "flex", gap: 6 }}>
            <input autoFocus value={customGarnish} onChange={e => setCustomGarnish(e.target.value)} placeholder="Bijv. takje rozemarijn" enterKeyHint="done"
              style={{ minHeight: 40, borderRadius: 100, border: `1px solid ${BORDER}`, background: CREAM, padding: "0 14px", fontFamily: sans, fontSize: 16, color: INK, width: 200 }} />
            <button type="submit" style={{ ...chip(true), minWidth: 44 }}>OK</button>
          </form>
        )}
      </div>

      <button onClick={() => setPreview(draft)} disabled={form.rows.length === 0} className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 52, marginTop: 26, borderRadius: 14, border: "none", background: "rgba(184,134,46,0.18)", color: INK, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: form.rows.length ? "pointer" : "default", opacity: form.rows.length ? 1 : 0.5 }}>
        <BookOpen size={17} color={BRASS} /> Voorbeeld bekijken
      </button>
      {!canSave && <p style={{ fontSize: 12.5, color: MUTED, textAlign: "center", margin: "10px 0 0" }}>Geef je recept een naam en minstens 2 ingrediënten om te bewaren.</p>}

      {customRecipes.length > 0 && (<>
        {label(`Jouw eigen recepten (${customRecipes.length})`)}
        <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
          {customRecipes.map((r, i) => (
            <SwipeToDelete key={r.id} onDelete={() => onRemoveRecipe(r.id)}>
              <button onClick={() => editExisting(r)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 58, padding: "6px 14px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${BORDER}`, background: CREAM, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
                <RecipeCircle recipe={r} allIngredients={allIngredients} size={40} radius={10} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: serif, fontSize: 16, fontWeight: 700 }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED }}>{r.family} · {r.glass}</span>
                </span>
                <Pencil size={15} color={MUTED} />
              </button>
            </SwipeToDelete>
          ))}
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: "8px 4px 0" }}>Tik om te bewerken · veeg naar links om te verwijderen</p>
      </>)}

      {picker && <IngredientPickerSheet allIngredients={allIngredients} isOwned={isOwned} onPick={addRow} onClose={() => setPicker(false)} />}
      {fromExisting && (
        <BatchRecipePicker recipes={recipes} allIngredients={allIngredients} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
          currentId={null} onPick={(id) => { startFrom(id); onSound("pop"); }} onClose={() => setFromExisting(false)} />
      )}
      {preview && (
        <RecipeSheet recipe={preview} missing={preview.ingredients.filter(i => !i.optional && !isOwned(i))} ingredientLabel={ingLabel} allIngredients={allIngredients}
          onAddMissing={() => {}} onSound={onSound} onClose={() => setPreview(null)} />
      )}
      {saved && (
        <EigenSavedSheet recipe={saved} missing={savedMissing} ingLabel={ingLabel} allIngredients={allIngredients} shoppingKeys={shoppingKeys}
          onAddToList={() => onAddToShoppingList(savedMissing.map(ref => ({ ref, recipeNames: [saved.name] })))}
          onView={() => { const id = saved.id; setSaved(null); setForm(blank); setTimeout(() => onOpenRecipe(id), 200); }}
          onAnother={() => { setSaved(null); setForm(blank); window.scrollTo({ top: 0 }); }}
          onClose={() => { setSaved(null); setForm(blank); }} />
      )}
    </div>
  );
}

function EigenSavedSheet({ recipe, missing, ingLabel, allIngredients, shoppingKeys, onAddToList, onView, onAnother, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [added, setAdded] = useState(false);
  const onList = added || (missing.length > 0 && missing.every(m => shoppingKeys?.has(ingredientKey(m))));
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{ position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", padding: "0 20px calc(env(safe-area-inset-bottom) + 16px)" }}>
        <SheetGrabber {...dragHandlers} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 10 }}>
          <div className="success-pop" style={{ position: "relative" }}>
            <div style={{ width: 96, height: 96, borderRadius: 20, overflow: "hidden", boxShadow: SHADOW_CARD }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} size={96} radius={20} /></div>
            <span style={{ position: "absolute", right: -8, bottom: -8, width: 32, height: 32, borderRadius: "50%", background: SAGE, border: `3px solid ${PAPER}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={16} strokeWidth={3} color="#FBF6EA" /></span>
          </div>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, marginTop: 16 }}>{recipe.name}</div>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>Opgeslagen · staat nu tussen je recepten</div>
        </div>
        {missing.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, padding: "12px 14px", borderRadius: 14, background: "rgba(122,46,42,0.10)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: BURGUNDY }}>Mist nog: {missing.map(ingLabel).join(", ")}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Zelf maken of op je lijst zetten</div>
            </div>
            {onList ? <span className={added ? "success-pop" : undefined} style={{ display: "flex", alignItems: "center", gap: 4, color: SAGE, fontSize: 13, fontWeight: 700, flexShrink: 0 }}><Check size={14} strokeWidth={3} /> Op lijst</span>
              : <button onClick={() => { onAddToList(); setAdded(true); }} style={{ minHeight: 40, padding: "0 16px", borderRadius: 100, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Op lijst</button>}
          </div>
        )}
        <button onClick={onView} className="press-scale" style={{ width: "100%", minHeight: 52, marginTop: 22, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: "#FBF6EA", fontFamily: sans, fontSize: 15.5, fontWeight: 700, cursor: "pointer" }}>Bekijk recept</button>
        <button onClick={onAnother} className="press-scale" style={{ width: "100%", minHeight: 52, marginTop: 10, borderRadius: 14, border: "none", background: "rgba(184,134,46,0.18)", color: INK, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Nog een recept toevoegen</button>
      </div>
    </div>
  ), document.body);
}
