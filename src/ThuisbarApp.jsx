import { lazy, Suspense, useState, useMemo, useEffect, useRef, useLayoutEffect, createContext, useContext, useId, Fragment } from "react";
import { createPortal } from "react-dom";
import { Preferences } from "@capacitor/preferences";
import { subscribe, noteLocalChange, startSync, stopSync } from "./cloudState.js";
import { Browser } from "@capacitor/browser";
import { Share } from "@capacitor/share";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { AlertTriangle, Martini, Check, Star, Plus, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, X, ShoppingCart, Shuffle, Sparkles, Pencil, BookOpen, ClipboardList, Refrigerator, Scale, PartyPopper, NotebookPen, FlaskConical, GraduationCap, Lock, RotateCcw, Share2, ExternalLink, MoreHorizontal, Heart, Camera, MapPin, Users, UserPlus, UserCheck, UserX, LogOut, Bell, MessageCircle, Send, Home, User, Settings, Flag, Flame, Globe, Target, Wine, Info, Landmark, Citrus, ListChecks, Award, Droplet, GlassWater, Hand, ListOrdered, CupSoda, Clock, ShieldCheck, Play, Copy, LayoutGrid, Rows2 } from "lucide-react";
import { buildIngredientIndex, searchIngredients, unusedHint, normalizeTerm } from "./ingredientSearch";
import { PRIVACY_BIJGEWERKT, PRIVACY_INTRO, PRIVACY_SECTIES, privacyContactTekst } from "./privacyPolicy";
import { VOORWAARDEN_VERSIE, VOORWAARDEN_BIJGEWERKT, VOORWAARDEN_INTRO, VOORWAARDEN_SECTIES, voorwaardenContactTekst } from "./termsOfUse";
import { exportMyData } from "./dataExport.js";
import { DRANK_SPECS, shopGroupFor } from "./data/drankspecs";
import { INGREDIENT_INFO } from "./data/ingredientInfo";
import { supabase } from "./supabaseClient";
import { isNative as isNativeShell, initNativeShell, hideNativeSplash, hapticFor, setStatusBarOnDark, setKeepAwake } from "./native";
import { fetchLearnedBrands, recordBrandLink, useSearchMiss, fetchRecommendations } from "./learning.js";
import { AI_CONSENT_KEY } from "./ai.js";
import { imageToJpegDataUrl, squareJpegDataUrl, uploadCheckinPhoto, removeCheckinPhoto, removeOwnStorageFiles } from "./checkinPhotos.js";
import { INGREDIENTS, CATEGORY_ORDER, RECIPES, PRICES_UPDATED, FUN_FACTS, canonicalRecipeId, recipeIdAliases } from "./recipes.js";

// Verhalen en bereidingsstappen (ruim 250 KB) laden kort na het opstarten op
// de achtergrond, niet tijdens: zie loadRecipeTexts en useRecipeTexts.
const NO_RECIPE_TEXTS = { STORIES: {}, STEPS: {}, loaded: false };
let recipeTexts = null;
let recipeTextsPromise = null;
export function loadRecipeTexts() {
  if (!recipeTextsPromise) recipeTextsPromise = import("./recipeTexts.js").then(m => (recipeTexts = { STORIES: m.STORIES, STEPS: m.STEPS, loaded: true }));
  return recipeTextsPromise;
}
export function useRecipeTexts() {
  const [texts, setTexts] = useState(recipeTexts || NO_RECIPE_TEXTS);
  useEffect(() => {
    if (texts.loaded) return;
    let cancelled = false;
    loadRecipeTexts().then(t => { if (!cancelled) setTexts(t); });
    return () => { cancelled = true; };
  }, [texts.loaded]);
  return texts;
}
import { COURSE_PARTS, COURSE_LESSONS } from "./course.js";
import imageCatalog from "./data/images.json";
import { brandMarkMarkup, BRAND_MARK_VIEWBOX } from "./brandMark.js";

// Zware, zelden gebruikte schermen laden pas als je ze opent (sneller opstarten).
function lazyScreen(load, name) {
  const Lazy = lazy(() => load().then(m => ({ default: m[name] })));
  function LazyScreen(props) { return <Suspense fallback={null}><Lazy {...props} /></Suspense>; }
  LazyScreen.displayName = name;
  return LazyScreen;
}
const FeestplannerTab = lazyScreen(() => import("./features/Feestplanner.jsx"), "FeestplannerTab");
const MenuAssistentTab = lazyScreen(() => import("./features/MenuAssistent.jsx"), "MenuAssistentTab");
const BatchCalculatorTab = lazyScreen(() => import("./features/BatchCalculator.jsx"), "BatchCalculatorTab");
const GuestSurveyView = lazyScreen(() => import("./features/GuestViews.jsx"), "GuestSurveyView");
const GuestMenuView = lazyScreen(() => import("./features/GuestViews.jsx"), "GuestMenuView");
const CursusTab = lazyScreen(() => import("./features/Cursus.jsx"), "CursusTab");
const BartenderScreen = lazyScreen(() => import("./features/Bartender.jsx"), "BartenderScreen");
const BottleScanSheet = lazyScreen(() => import("./features/BottleScan.jsx"), "BottleScanSheet");
const InsightsAdminScreen = lazyScreen(() => import("./features/Beheer.jsx"), "InsightsAdminScreen");
const ReportsAdminScreen = lazyScreen(() => import("./features/Beheer.jsx"), "ReportsAdminScreen");
const CocktailMap = lazyScreen(() => import("./features/Kaart.jsx"), "CocktailMap");
const LicensesScreen = lazyScreen(() => import("./features/Licenties.jsx"), "LicensesScreen");
const EigenRecepten = lazyScreen(() => import("./features/EigenRecepten.jsx"), "EigenRecepten");


// Centrale foto-catalogus (zie CLAUDE.md "## Afbeeldingen"): één entry per
// cocktail/drank-id met welk lokaal bestand erbij hoort (nog leeg tot de
// zoekfase een foto vindt en in src/assets/images/{cocktails,dranken}/
// zet). import.meta.glob bouwt build-time een {pad: url}-kaart van alles
// wat daar al staat, zodat een nieuw bestand automatisch overal verschijnt
// zodra het bijstaat in images.json — zonder verdere code-wijziging.
const COCKTAIL_IMAGE_FILES = import.meta.glob("./assets/images/cocktails/*.webp", { eager: true, import: "default" });
const DRANK_IMAGE_FILES = import.meta.glob("./assets/images/dranken/*.webp", { eager: true, import: "default" });
const IMAGE_CATALOG_BY_KEY = new Map(imageCatalog.map((e) => [`${e.type}:${e.id}`, e]));
export function localItemImageUrl(type, id) {
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
export const INK = "var(--ink)";
export const PAPER = "var(--paper)";
export const PAPER_DEEP = "var(--paper-deep)";
export const BOTTLE = "var(--bottle)";
export const BOTTLE_DARK = "var(--bottle-dark)";
export const BRASS = "var(--brass)";
export const BRASS_TEXT = "var(--brass-text)";
export const SAGE_TEXT = "var(--sage-text)";
export const BURGUNDY = "var(--burgundy)";
export const SAGE = "var(--sage)";
export const MUTED = "var(--muted)";
export const BORDER = "var(--border)";
export const CREAM = "var(--cream)";
// Tekst die altijd licht moet zijn: op foto's en op de donkergroene vlakken.
// (CREAM zelf wordt in de donkere modus een donkere kaartkleur.)
export const ON_DARK_TEXT = "#FBF6EA";
export const CUSTOM_CAT = "Eigen ingrediënten";

export const serif = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const sans = "'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif";
// Puur systeemfont (geen Inter), gereserveerd voor de check-in-sheet: die
// moet aanvoelen als een natieve iOS-flow, niet als de rest van de app.
export const systemFont = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif";

// Zachte, warm-getinte schaduwen, gereserveerd voor uitgelichte panelen en
// primaire knoppen. Herhalende ledger-rijen blijven bewust plat (zie de
// design tokens hierboven): schaduw = "dit is een uitgelicht moment".
export const SHADOW_CARD = "var(--shadow-card)";
export const SHADOW_HERO = "var(--shadow-hero)";
export const SHADOW_CTA = "var(--shadow-cta)";
export const RADIUS = 8;


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
  voorwaarden: "Gebruiksvoorwaarden",
  licenties: "Licenties",
  "account-verwijderen": "Account verwijderen",
  fotoverantwoording: "Fotoverantwoording",
  "meldingen-beheren": "Meldingen",
  "inzichten-beheren": "Wat de app leert",
};
const PUSH_SCREENS = new Set(Object.keys(PUSH_SCREEN_TITLES));

// @capacitor/preferences i.p.v. rechtstreeks localStorage: op web valt het
// plugin zelf terug op localStorage (dus geen gedragsverandering in de
// browser), maar op iOS gebruikt het de native UserDefaults — die overleeft
// het opschonen dat iOS soms met WebView-opslag doet, wat gewoon
// localStorage niet gegarandeerd doet. Laden is nu async: value start op
// fallback en wordt bijgewerkt zodra Preferences.get() terug is (meestal
// binnen een paar ms), i.p.v. synchroon bij de eerste render.
export function useStorage(key, fallback) {
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
  // Bijgewerkt vanuit je account (cloudState.js).
  useEffect(() => subscribe(key, setValue), [key]);

  const persist = (next) => {
    setValue(next);
    Preferences.set({ key, value: JSON.stringify(next) }).catch(e => console.error("Opslaan mislukt:", e));
    noteLocalChange(key, next);
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
export function unitLabel(unit, amount) {
  if (unit === "ml") return "ml";
  if (unit === "dash") return amount === 1 ? "dash" : "dashes";
  if (unit === "stuk") return amount === 1 ? "stuk" : "stuks";
  return unit || "";
}
export function formatDutchNumber(n) {
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

export function hashString(s) {
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
  { ids: ["limoncello"], colors: ["#E2C93A", "#F4E9A0"] },
  { ids: ["rose_wine"], colors: ["#C8706E", "#F2CFC8"] },
  { ids: ["hot_chocolate"], colors: ["#4A2E1E", "#8A5A3A"] },
  { ids: ["creme_de_menthe", "green_chartreuse", "midori", "melon_liqueur", "pisang_ambon"], colors: ["#3D5C3A", "#8FAE55"] },
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
  limoncello: 0.8, elderflower_liqueur: 0.7, licor_43: 0.8, spiced_rum: 0.1, coconut_rum: 0.5, bitter_lemon: 0.4,
  energy_drink: 0.5, pisang_ambon: 0.7, white_port: 0.3, cider: 0.2, apple_juice: 0.35, ice_tea: 0.35, hot_chocolate: 0.4,
};
const ZUUR_WEIGHTS = {
  lemon_juice: 1, lime_juice: 1, grapefruit_juice: 0.5, cranberry_juice: 0.25, orange_juice: 0.15,
  pineapple_juice: 0.2, olive_brine: 0.3, passion_fruit_puree: 0.3, passion_fruit_juice: 0.3, passion_fruit_liqueur: 0.15,
  grapefruit_soda: 0.2, tomato_juice: 0.2, limoncello: 0.1, bitter_lemon: 0.15, apple_juice: 0.1, cider: 0.1,
};
const BITTER_WEIGHTS = {
  campari: 1, aperol: 0.65, amaro_nonino: 0.7, cynar: 0.8, fernet_branca: 1, yellow_chartreuse: 0.4,
  green_chartreuse: 0.5, coffee_liqueur: 0.25, espresso: 0.6, hot_coffee: 0.5, stout: 0.35, tonic: 0.15,
  dry_vermouth: 0.2, sweet_vermouth: 0.1, grapefruit_juice: 0.15, bitter_lemon: 0.2, black_tea: 0.3,
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
export function getTasteProfile(recipe, allIngredients) {
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
// ---------- Smaakmatch (idee 5) ----------
// Je smaakprofiel uit de cocktails die je hoog gaf (4 of meer), en welke
// recepten die je nog niet probeerde daar het dichtst bij liggen.
const tasteCache = new WeakMap();
export function cachedTaste(recipe, allIngredients) {
  let byIng = tasteCache.get(allIngredients);
  if (!byIng) { byIng = new Map(); tasteCache.set(allIngredients, byIng); }
  if (!byIng.has(recipe.id)) byIng.set(recipe.id, getTasteProfile(recipe, allIngredients));
  return byIng.get(recipe.id);
}
export const TASTE_DIMS = ["zoet", "zuur", "bitter", "sterk"];
export const TASTE_WORD = { zoet: "zoet", zuur: "fris-zuur", bitter: "bitter", sterk: "stevig" };
export function findRecipeFor(entry, recipes) {
  return entry.recipeId ? recipes.find(r => r.id === canonicalRecipeId(entry.recipeId)) : recipes.find(r => r.name.toLowerCase() === (entry.name || "").trim().toLowerCase());
}
export function myTasteVector(logboek, recipes, allIngredients) {
  const sum = { zoet: 0, zuur: 0, bitter: 0, sterk: 0 }; let w = 0;
  const families = new Map();
  for (const e of logboek) {
    if (!(e.rating >= 4)) continue;
    const r = findRecipeFor(e, recipes);
    if (!r) continue;
    const t = cachedTaste(r, allIngredients);
    const weight = e.rating - 3;
    TASTE_DIMS.forEach(d => { sum[d] += t[d] * weight; });
    w += weight;
    families.set(r.family, (families.get(r.family) || 0) + weight);
  }
  if (w === 0) return null;
  const v = Object.fromEntries(TASTE_DIMS.map(d => [d, sum[d] / w]));
  return { v, families, liked: w };
}
function tasteMatches(logboek, recipes, allIngredients, limit = 6) {
  const me = myTasteVector(logboek, recipes, allIngredients);
  if (!me || logboek.filter(e => e.rating >= 4).length < 3) return [];
  const tried = new Set(logboek.map(e => findRecipeFor(e, recipes)?.id).filter(Boolean));
  const topDims = [...TASTE_DIMS].sort((a, b) => me.v[b] - me.v[a]).filter(d => me.v[d] >= 1.5).slice(0, 2);
  const reason = topDims.length ? `Past bij je smaak: ${topDims.map(d => TASTE_WORD[d]).join(" en ")}` : "Past bij wat je lekker vindt";
  const famMax = Math.max(1, ...me.families.values());
  return recipes
    .filter(r => !tried.has(r.id) && !r.id.startsWith("custom_"))
    .map(r => {
      const t = cachedTaste(r, allIngredients);
      const dist = Math.sqrt(TASTE_DIMS.reduce((acc, d) => acc + (t[d] - me.v[d]) ** 2, 0));
      const famBonus = (me.families.get(r.family) || 0) / famMax;
      return { recipe: r, score: -dist + famBonus * 0.8, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getFunFact(recipe) {
  return FUN_FACTS[recipe.id] || null;
}

// Splitst de doorlopende `method`-tekst in losse stappen (op zinsgrens) zodat
// elk recept (ingebouwd of zelfgemaakt) automatisch een stap-voor-stap
// weergave krijgt, zonder dat elk recept apart een stappenlijst nodig heeft.
export function splitMethodIntoSteps(method) {
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
  limoncello: ["limoncello"], elderflower_liqueur: ["vlierbloesemlikeur"], licor_43: ["licor 43"],
  spiced_rum: ["spiced rum", "rum"], coconut_rum: ["kokosrum"], bitter_lemon: ["bitter lemon"], energy_drink: ["energiedrank"],
  pisang_ambon: ["pisang ambon"], white_port: ["witte port"], rose_wine: ["rosé"], cider: ["cider"],
  apple_juice: ["appelsap"], ice_tea: ["ijsthee"], black_tea: ["thee"], hot_chocolate: ["chocolademelk"],
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

export function getMenuRole(recipe) {
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

export function inferTechniques(method) {
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


export function euro(amount) {
  return "€" + amount.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ingredientKey(ref) {
  return ref.id || (ref.name || "").toLowerCase();
}

export function findIngredientMeta(ref, allIngredients) {
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
export function normalizeGlass(glass) {
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

export function GlassArt({ glass, colors, garnishes, garnish, mono, size = 116, plinth, dropIn, ambient, rim, foam, iceStyle }) {
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
export function TechniqueAnimation({ technique }) {
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

// Het logo (martiniglas in een gouden ring) — dezelfde bron als het
// iOS-opstartscherm (src/brandMark.js). animated: de kom loopt vol en
// daarna verschijnt de olijf (zie .brand-liquid / .brand-spark).
export function BrandMark({ width = 96, animated = false }) {
  const idPrefix = "bm" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const markup = useMemo(() => brandMarkMarkup({ idPrefix, animated }), [idPrefix, animated]);
  const [, , vw, vh] = BRAND_MARK_VIEWBOX.split(" ").map(Number);
  return (
    <svg viewBox={BRAND_MARK_VIEWBOX} width={width} height={Math.round(width * vh / vw)} role="img" aria-label="Mijn Thuisbar"
      style={{ display: "block", overflow: "visible" }} dangerouslySetInnerHTML={{ __html: markup }} />
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
          <BrandMark width={132} animated />
        </div>
        <h1 className="splash-title">Mijn Thuisbar</h1>
        <div className="splash-sub">Welkom in de wereld van de cocktail</div>
      </div>
      {/* Tikken slaat de intro nog steeds over, maar zonder "Tik om te
          slaan"-hint (op verzoek): mensen tikken vanzelf door. */}
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
export function SurveyGlass({ kind, color }) {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(SURVEY_GLASS_PATHS[kind] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
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

export const PUBLIC_WEB_URL = (import.meta.env.VITE_PUBLIC_WEB_URL || DEFAULT_PUBLIC_WEB_URL).replace(/\/+$/, "");
export function publicAppUrl(query = "") {
  const base = isNativeShell ? PUBLIC_WEB_URL : `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${query ? `/?${query}` : ""}`;
}


export async function shareLink({ title, text, url, fallbackText }) {
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

// Native pushmeldingen (iPhone, via Apple). De server kant staat in
// supabase/functions/push: database-triggers sturen daar elke tag, proost,
// reactie, rang en vriendschapsverzoek heen. Hier: toestemming vragen, het
// apparaat-token opslaan, voorkeuren per soort melding, en bij tikken op een
// melding naar de juiste plek in de app gaan.
// Android volgt later (heeft Firebase nodig), dus voorlopig alleen iOS.
const PUSH_VOORKEUREN_STANDAARD = { tags: true, reacties: true, vriendschap: true, rangen: true, checkins: false };
const PUSH_SOORTEN = [
  { key: "tags", label: "Getagd worden", sub: "Als een vriend je tagt bij een check-in" },
  { key: "reacties", label: "Proost en reacties", sub: "Op je check-ins en je cursusrang" },
  { key: "vriendschap", label: "Vriendschapsverzoeken", sub: "Nieuwe verzoeken en geaccepteerde verzoeken" },
  { key: "rangen", label: "Rangen van vrienden", sub: "Als een vriend een nieuwe cursusrang haalt" },
  { key: "checkins", label: "Check-ins van vrienden", sub: "Bij elke cocktail die een vriend incheckt" },
];
function useNativePush(session, onOpen) {
  const supported = isNativeShell && Capacitor.getPlatform() === "ios";
  // "prompt" = nog nooit gevraagd, "granted" = aan, "denied" = uitgezet in iOS.
  const [permission, setPermission] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [prefs, setPrefs] = useState(PUSH_VOORKEUREN_STANDAARD);
  const tokenRef = useRef(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const userId = session?.user?.id || null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Luisteraars één keer neerzetten.
  useEffect(() => {
    if (!supported) return;
    const handles = [];
    const add = (event, fn) => PushNotifications.addListener(event, fn).then(h => handles.push(h)).catch(() => {});
    add("registration", ({ value }) => {
      tokenRef.current = value;
      if (!userIdRef.current) return;
      supabase.rpc("registreer_push_token", { p_token: value, p_platform: "ios" }).then(({ error: e }) => {
        if (e) setError("Meldingen konden niet worden ingesteld: " + e.message);
      });
    });
    add("registrationError", (e) => setError("Apple gaf geen toestemming voor meldingen: " + (e?.error || "onbekende fout")));
    add("pushNotificationActionPerformed", ({ notification }) => {
      onOpenRef.current?.(notification?.data?.doel || "feed");
    });
    return () => { handles.forEach(h => h.remove()); };
  }, [supported]);

  // Bij inloggen: toestemming bekijken, en als die er al is het token
  // vernieuwen (Apple kan het token wijzigen). Voorkeuren ophalen.
  useEffect(() => {
    if (!supported || !userId) return;
    let cancelled = false;
    PushNotifications.checkPermissions().then(({ receive }) => {
      if (cancelled) return;
      setPermission(receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt");
      if (receive === "granted") PushNotifications.register().catch(() => {});
    }).catch(() => {});
    supabase.from("push_voorkeuren").select("*").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!cancelled && data) setPrefs({ ...PUSH_VOORKEUREN_STANDAARD, ...Object.fromEntries(Object.keys(PUSH_VOORKEUREN_STANDAARD).map(k => [k, data[k]])) });
    });
    return () => { cancelled = true; };
  }, [supported, userId]);

  const enable = async () => {
    if (!supported || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const { receive } = await PushNotifications.requestPermissions();
      if (receive !== "granted") {
        setPermission("denied");
        return;
      }
      setPermission("granted");
      await PushNotifications.register();
    } catch (e) {
      setError(e?.message || "Aanzetten van meldingen is niet gelukt.");
    } finally {
      setBusy(false);
    }
  };

  const setPref = async (key, value) => {
    if (!userId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { error: e } = await supabase.from("push_voorkeuren").upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
    if (e) { setPrefs(prefs); setError("Opslaan is niet gelukt: " + e.message); }
  };

  // Bij uitloggen: dit toestel niet meer aan dit account koppelen.
  const forget = async () => {
    if (!supported || !tokenRef.current) return;
    await supabase.from("push_tokens").delete().eq("token", tokenRef.current).then(() => {}, () => {});
  };

  return { supported, permission, busy, error, prefs, enable, setPref, forget };
}

function checkinRowToEntry(row) {
  return {
    id: row.id, date: (row.created_at || "").slice(0, 10), createdAt: row.created_at || null, recipeId: canonicalRecipeId(row.recipe_id), name: row.name,
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
export function useMatchBodyBackground(color) {
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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <BrandMark width={84} />
        </div>
        {declined ? (
          <>
            <h1 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: ON_DARK_TEXT, margin: "0 0 12px" }}>Helaas</h1>
            <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: 0 }}>Mijn Thuisbar draait om alcoholische dranken en is niet geschikt voor bezoekers onder de 18 jaar.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 24, color: ON_DARK_TEXT, margin: "0 0 12px" }}>Even een check</h1>
            <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: "0 0 26px" }}>
              Mijn Thuisbar draait om cocktails en alcoholische dranken. Ben je 18 jaar of ouder?
            </p>
            <button onClick={onConfirm} className="press-scale" style={{
              width: "100%", padding: "14px 18px", borderRadius: 14, border: "none", marginBottom: 10,
              background: HEADER_TEXT, color: "#132622", fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              Ja, ik ben 18 jaar of ouder
            </button>
            <button onClick={() => setDeclined(true)} style={{
              width: "100%", padding: "12px 18px", borderRadius: 14, border: "1px solid rgba(251,246,234,0.25)",
              background: "none", color: "#C7CFC5", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            }}>
              Nee, ik ben jonger dan 18
            </button>
            <p style={{ color: "#C7CFC5", fontSize: 12.5, textAlign: "center", margin: "18px 0 0", opacity: 0.8 }}>Geniet met mate.</p>
          </>
        )}
      </div>
    </div>
  );
}

// Kleine, rustige regel onder recepten: hoort bij een app over alcohol.
function MatigheidRegel({ style }) {
  return <p style={{ fontSize: 12, color: MUTED, textAlign: "center", margin: "6px 0 0", ...style }}>Geniet met mate. Alleen voor 18+.</p>;
}

// Login/registratie: dezelfde donkere "signage"-look als de masthead elders
// in de app, zodat dit niet als een los, generiek inlogscherm aanvoelt maar
// als het voorportaal van dezelfde Bar Register-huisstijl.
// Onzichtbare strook langs de linkerrand van het inlogscherm: vegen = terug.
function AuthSwipeBack({ onBack }) {
  const start = useRef(null);
  return (
    <div aria-hidden onTouchStart={(e) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }}
      onTouchEnd={(e) => {
        const s0 = start.current; start.current = null;
        if (!s0) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s0.x, dy = Math.abs(t.clientY - s0.y);
        if (dx > 70 && dy < 60) { hapticFor("tick"); onBack(); }
      }}
      style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 28, zIndex: 1 }} />
  );
}

function AuthScreen({ initialMode = "login", onCancel }) {
  useMatchBodyBackground(BOTTLE_DARK);
  const [mode, setMode] = useState(initialMode === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Akkoord met voorwaarden + privacybeleid (verplicht bij een nieuw account),
  // en welke van de twee teksten open staat om te lezen.
  const [agreed, setAgreed] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        const trimmedName = name.trim();
        if (!trimmedName) { setError("Vul je naam in."); setBusy(false); return; }
        if (!agreed) { setError("Ga akkoord met de gebruiksvoorwaarden en het privacybeleid om een account te maken."); setBusy(false); return; }
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { name: trimmedName, voorwaarden_versie: VOORWAARDEN_VERSIE, voorwaarden_akkoord_op: new Date().toISOString() } },
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
    <div style={{ minHeight: "100%", background: `radial-gradient(ellipse 900px 500px at 50% -10%, #2A4B42, ${BOTTLE_DARK} 70%)`, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px", boxSizing: "border-box", fontFamily: sans }}>
      {/* Gast die toch nog even verder wil kijken: terug naar de app (knop
          of vanaf de linkerrand vegen). */}
      {onCancel && <AuthSwipeBack onBack={onCancel} />}
      {onCancel && (
        <button onClick={onCancel} style={{
          position: "fixed", top: "calc(env(safe-area-inset-top) + 6px)", left: 8, zIndex: 2, display: "flex", alignItems: "center", gap: 1,
          minHeight: 44, padding: "0 10px 0 4px", background: "none", border: "none", cursor: "pointer", color: HEADER_ACCENT, fontFamily: sans, fontSize: 15.5, fontWeight: 600,
        }}><ChevronLeft size={22} strokeWidth={2.2} /> Terug</button>
      )}
      <div style={{ maxWidth: 380, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <BrandMark width={92} />
          </div>
          <h1 style={{ fontFamily: systemFont, fontSize: 30, fontWeight: 700, color: ON_DARK_TEXT, margin: 0 }}>Mijn Thuisbar</h1>
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
                style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)", color: "#2B2620" }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" autoComplete="email" required
              inputMode="email" autoCapitalize="none" autoCorrect="off" enterKeyHint={mode === "forgot" ? "send" : "next"}
              style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)", color: "#2B2620" }} />
          </div>
          {mode !== "forgot" && (
            <div>
              <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>Wachtwoord</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minstens 6 tekens" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6}
                enterKeyHint="done"
                style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)", color: "#2B2620" }} />
            </div>
          )}

          {mode === "login" && (
            <button type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }} style={{
              alignSelf: "flex-end", background: "none", border: "none", cursor: "pointer", color: "#D9CBAE", fontSize: 12.5, padding: 0, textDecoration: "underline",
            }}>
              Wachtwoord vergeten?
            </button>
          )}

          {mode === "signup" && (
            <TermsCheckbox checked={agreed} onChange={setAgreed} onOpen={setLegalOpen} />
          )}

          {error && <p style={{ color: "#E8A0A0", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{error}</p>}
          {notice && <p style={{ color: "#B9D9A0", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{notice}</p>}

          <button type="submit" disabled={busy} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px",
            borderRadius: RADIUS, border: "none", cursor: busy ? "default" : "pointer",
            background: HEADER_TEXT, color: "#132622",
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
      {legalOpen && <LegalSheet which={legalOpen} onClose={() => setLegalOpen(null)} />}
    </div>
  );
}

// Vinkje "Ik ga akkoord met…", met de twee teksten als tikbare links.
function TermsCheckbox({ checked, onChange, onOpen, light = false }) {
  const textColor = light ? INK : "#D9CBAE";
  const linkStyle = { background: "none", border: "none", padding: 0, cursor: "pointer", color: light ? BOTTLE : HEADER_TEXT, textDecoration: "underline", fontSize: "inherit", fontFamily: "inherit", fontWeight: 600 };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.5, color: textColor }}>
      <button type="button" role="checkbox" aria-checked={checked} aria-label="Akkoord met de gebruiksvoorwaarden en het privacybeleid" onClick={() => onChange(!checked)} style={{
        flexShrink: 0, width: 24, height: 24, marginTop: 1, borderRadius: 7, cursor: "pointer", padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1.5px solid ${checked ? HEADER_TEXT : (light ? BORDER : "rgba(217,203,174,0.6)")}`,
        background: checked ? (light ? BOTTLE : HEADER_TEXT) : "transparent",
      }}>
        {checked && <Check size={15} strokeWidth={3} color={light ? CREAM : "#132622"} />}
      </button>
      <span>
        Ik ben 18 jaar of ouder en ga akkoord met de{" "}
        <button type="button" onClick={() => onOpen("voorwaarden")} style={linkStyle}>gebruiksvoorwaarden</button>
        {" "}en het{" "}
        <button type="button" onClick={() => onOpen("privacy")} style={linkStyle}>privacybeleid</button>.
      </span>
    </div>
  );
}

// Volledig scherm met de voorwaarden of het privacybeleid, om te lezen
// vóór je akkoord gaat (bij registreren en op het akkoordscherm).
function LegalSheet({ which, onClose }) {
  const terms = which === "voorwaarden";
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={terms ? "Gebruiksvoorwaarden" : "Privacybeleid"} style={{
      position: "fixed", inset: 0, zIndex: 1000, background: PAPER, display: "flex", flexDirection: "column", fontFamily: sans,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "calc(env(safe-area-inset-top) + 8px) 12px 8px", borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
        <div style={{ flex: 1, fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK, paddingLeft: 6 }}>{terms ? "Gebruiksvoorwaarden" : "Privacybeleid"}</div>
        <button onClick={onClose} aria-label="Sluiten" style={{ minWidth: 44, minHeight: 44, background: "none", border: "none", cursor: "pointer", color: INK, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={22} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "18px 20px calc(env(safe-area-inset-bottom) + 28px)" }}>
        {terms ? <TermsScreen /> : <PrivacyPolicyScreen />}
      </div>
    </div>,
    document.body,
  );
}

// Bestaande accounts (en accounts van vóór een nieuwe versie van de
// voorwaarden) gaan hier één keer akkoord. Uitloggen kan ook; verwijderen
// van het account kan altijd via Instellingen nadat je akkoord bent gegaan,
// of door te mailen.
function TermsGateScreen({ onAccept, onSignOut, busy = false, error = "" }) {
  useMatchBodyBackground(BOTTLE_DARK);
  const [agreed, setAgreed] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null);
  return (
    <div style={{ minHeight: "100%", background: `radial-gradient(ellipse 900px 500px at 50% -10%, #2A4B42, ${BOTTLE_DARK} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", boxSizing: "border-box", fontFamily: sans }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <BrandMark width={72} />
        </div>
        <h1 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 24, color: ON_DARK_TEXT, margin: "0 0 12px", textAlign: "center" }}>Even je akkoord</h1>
        <p style={{ color: "#C7CFC5", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px", textAlign: "center" }}>
          Mijn Thuisbar heeft gebruiksvoorwaarden en een bijgewerkt privacybeleid. Lees ze even door en ga akkoord om verder te gaan.
        </p>
        <div style={{ background: "rgba(251,247,236,0.06)", border: "1px solid rgba(184,134,46,0.25)", borderRadius: RADIUS + 4, padding: 18 }}>
          <TermsCheckbox checked={agreed} onChange={setAgreed} onOpen={setLegalOpen} />
          {error && <p style={{ color: "#E8A0A0", fontSize: 12.5, margin: "12px 0 0", lineHeight: 1.5 }}>{error}</p>}
          <button onClick={onAccept} disabled={!agreed || busy} className="press-scale" style={{
            width: "100%", padding: "13px", marginTop: 16, borderRadius: RADIUS, border: "none",
            background: HEADER_TEXT, color: "#132622", fontFamily: sans, fontSize: 14.5, fontWeight: 800,
            cursor: !agreed || busy ? "default" : "pointer", opacity: !agreed || busy ? 0.55 : 1,
          }}>{busy ? "Bezig…" : "Akkoord en verder"}</button>
        </div>
        <button onClick={onSignOut} style={{
          display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer",
          color: "#D9CBAE", fontSize: 13, marginTop: 18, fontFamily: sans,
        }}>Uitloggen</button>
      </div>
      {legalOpen && <LegalSheet which={legalOpen} onClose={() => setLegalOpen(null)} />}
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
          <h1 style={{ fontFamily: systemFont, fontSize: 26, fontWeight: 700, color: ON_DARK_TEXT, margin: 0, textAlign: "center" }}>Nieuw wachtwoord</h1>
        </div>
        <form onSubmit={submit} style={{ background: "rgba(251,247,236,0.06)", border: "1px solid rgba(184,134,46,0.25)", borderRadius: RADIUS + 4, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#B9C4B9", display: "block", marginBottom: 5 }}>Nieuw wachtwoord</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minstens 6 tekens" autoComplete="new-password" required minLength={6}
              enterKeyHint="done"
              style={{ ...fieldStyle(), background: "rgba(251,247,236,0.92)", color: "#2B2620" }} />
          </div>
          {error && <p style={{ color: "#E8A0A0", fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{error}</p>}
          <button type="submit" disabled={busy} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "13px",
            borderRadius: RADIUS, border: "none", cursor: busy ? "default" : "pointer",
            background: HEADER_TEXT, color: "#132622",
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

// Onderrand van wat er boven het toetsenbord zichtbaar is. In de app krimpt
// de WebView niet (toetsenbord-resize "none"), dus daar telt --kb-pad; op
// het web de visualViewport.
function visibleViewportBottom() {
  if (isNativeShell) {
    const kbPad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-pad")) || 0;
    return window.innerHeight - kbPad;
  }
  const vv = window.visualViewport;
  return vv ? vv.offsetTop + vv.height : window.innerHeight;
}

// Zet een veld binnen een pop-up in beeld door alleen de scrollbare inhoud
// van die pop-up te verschuiven (niet de pagina): het veld komt net boven de
// onderrand van wat zichtbaar is, met wat lucht eronder.
function revealInSheet(el, alignTop = false) {
  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const boxRect = box.getBoundingClientRect();
  const visibleBottom = Math.min(boxRect.bottom, visibleViewportBottom());
  const r = el.getBoundingClientRect();
  const margin = 24;
  // Zoekveld met suggestielijst: bovenin de pop-up, dan heeft de lijst
  // eronder de ruimte boven het toetsenbord.
  if (alignTop) { const d = r.top - (boxRect.top + 12); if (Math.abs(d) > 4) box.scrollTop += d; return; }
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
      // Toetsenbord stond al open (van veld naar veld tikken): dan komt er
      // geen nieuw "toetsenbord open"-signaal, dus zelf even in beeld zetten.
      const kbWasOpen = document.documentElement.classList.contains("kb-open");
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
      // Eén keer verschuiven, als het toetsenbord er staat: in de app via
      // het app-keyboard-shown-event, op het web via de (uitgestelde)
      // viewport-resize hieronder. Meerdere keren (zoals eerst) liet het
      // veld zichtbaar op en neer springen. Ook zoekvelden in een pop-up
      // (cocktail, locatie) gaan via revealInSheet en nooit via
      // scrollIntoView, dat in Safari ook de pagina erachter verschoof.
      if (el.tagName === "TEXTAREA" || el.closest(".sheet-max-92")) {
        if (kbWasOpen) setTimeout(() => { if (document.activeElement === el) onKeyboardShown(); }, 60);
        return;
      }
      setTimeout(() => {
        if (document.activeElement !== el) return;
        if (picker) { el.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
        const rect = el.getBoundingClientRect();
        // In de app krimpt de WebView niet (resize "none"): de zichtbare
        // hoogte is het scherm min het toetsenbord (--kb-pad). scroll-margin-
        // bottom (index.css) laat "nearest" boven het toetsenbord uitkomen.
        if (isNativeShell) {
          const kbPad = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-pad")) || 0;
          if (rect.bottom > window.innerHeight - kbPad - 24 || rect.top < 0) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          return;
        }
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
      if (!isTextInput(el) || !(el.tagName === "TEXTAREA" || el.closest(".sheet-max-92"))) return;
      // Cocktailzoeker bij inchecken staat al bovenaan (de foto klapt in).
      const picker = el.closest("[data-kb-scope]");
      revealInSheet(el, !!picker);
    };
    window.addEventListener("app-keyboard-shown", onKeyboardShown);
    // Web (Safari/PWA): hetzelfde --kb-pad als native, op basis van visualViewport.
    const vv = window.visualViewport;
    // Safari meldt de toetsenbordhoogte in veel kleine stapjes; hooguit één
    // keer per frame bijwerken, en zonder animatie (zie .kb-pad-web), anders
    // hobbelt het venster achter het toetsenbord aan.
    let vvRaf = 0, vvSettle = null;
    const onViewport = () => {
      if (isNativeShell || !vv) return;
      if (!vvRaf) vvRaf = requestAnimationFrame(() => {
        vvRaf = 0;
        const covered = window.innerHeight - vv.height - vv.offsetTop;
        document.documentElement.style.setProperty("--kb-pad", `${covered > 80 ? Math.round(covered) : 0}px`);
      });
      // Pas als het toetsenbord stilstaat het veld in beeld zetten.
      clearTimeout(vvSettle);
      vvSettle = setTimeout(onKeyboardShown, 160);
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
      cancelAnimationFrame(vvRaf);
      clearTimeout(vvSettle);
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
  // Verhalen en stappen op de achtergrond laden zodra de app staat.
  useEffect(() => { const t = setTimeout(() => { loadRecipeTexts(); }, 1200); return () => clearTimeout(t); }, []);
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
    // Gast: wat echt een account nodig heeft, opent de zachte drempel.
    if (session === null && GUEST_LOCKED_TABS[nextTab]) { requireAccount(GUEST_LOCKED_TABS[nextTab]); return; }
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
  // Samengevoegde dubbele recepten: oude id's in favorieten omzetten.
  useEffect(() => {
    if (!Array.isArray(favoriteRecipeIds) || !favoriteRecipeIds.some(id => canonicalRecipeId(id) !== id)) return;
    setFavoriteRecipeIds([...new Set(favoriteRecipeIds.map(canonicalRecipeId))]);
  }, [favoriteRecipeIds]);
  const [soundEnabled, setSoundEnabled] = useStorage("thuisbar-geluid", true);

  // session: undefined = nog aan het checken, null = uitgelogd, object = ingelogd.
  // Check-ins staan niet meer lokaal maar in Supabase, want die moeten nu ook
  // door vrienden gelezen kunnen worden (de feed) — dat kan localStorage niet.
  const [session, setSession] = useState(undefined);
  const friendRequestCount = useFriendRequestCount(session?.user?.id, tab);
  // Gast-modus (Recepten/Cursus zonder account) valt terug op AuthScreen
  // zodra een gast zelf op "Inloggen" tikt; na een geslaagde login weer
  // resetten zodat een latere uitlog-actie opnieuw in gast-modus opent.
  // false, of "login"/"signup": welk formulier AuthScreen opent.
  const [wantsLogin, setWantsLogin] = useState(false);
  useEffect(() => { if (session) setWantsLogin(false); }, [session]);
  const isGuest = session === null;
  // Zachte drempel: tik je als gast op iets dat echt een account nodig heeft
  // (vrienden, feestplanner, je profiel delen), dan schuift er een kort
  // venster omhoog met wat je ermee krijgt — geen slotje of harde muur.
  const [accountPrompt, setAccountPrompt] = useState(null);
  const requireAccount = (reason = "algemeen") => { hapticFor("tick"); setAccountPrompt(reason); };
  // AI-bartender en flessen scannen: alleen met account en na eenmalige
  // toestemming (Apple-eis: melden dat gegevens naar een AI-dienst gaan).
  const [aiConsent, setAiConsent] = useStorage(AI_CONSENT_KEY, null);
  const [aiPending, setAiPending] = useState(null);
  const withAi = (fn) => {
    if (isGuest) { requireAccount("bartender"); return; }
    if (aiConsent === "ja") fn(); else setAiPending(() => fn);
  };
  const [bartenderOpen, setBartenderOpen] = useState(false);
  const [bartenderChat, setBartenderChat] = useState([]);
  // null = nog niet gevraagd of de bartender naar je voorraad mag kijken.
  const [bartenderStock, setBartenderStock] = useStorage("thuisbar-bartender-voorraad", null);
  useEffect(() => { if (!session) { setBartenderChat([]); setBartenderOpen(false); } }, [session]);
  const openBartender = () => withAi(() => setBartenderOpen(true));
  const [profile, setProfile] = useState(null);
  const [serverLogboek, setLogboekState] = useState([]);
  // Gasten checken lokaal in (op dit toestel); bij het aanmaken van een
  // account of inloggen gaan ze mee naar Supabase (zie hieronder).
  const [guestCheckins, setGuestCheckinsStored] = useStorage("thuisbar-gast-checkins", []);
  const guestCheckinsRef = useRef(guestCheckins);
  guestCheckinsRef.current = guestCheckins;
  const updateGuestCheckins = (fn) => { const next = fn(guestCheckinsRef.current); guestCheckinsRef.current = next; setGuestCheckinsStored(next); };
  const logboek = session ? serverLogboek : guestCheckins;
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const push = usePushNotifications(session);
  const nativePush = useNativePush(session, (doel) => {
    // Naar de feed (ververst meteen, zodat de tag of reactie er staat) of
    // naar Vrienden voor een vriendschapsverzoek.
    if (doel === "vrienden") navigateTo("vrienden");
    else if (doel === "meldingen-beheren") navigateTo("meldingen-beheren");
    else if (tab === "home") navigateTo("home");
    else { navigateTo("home"); setHomeTapTick(t => t + 1); }
  });
  // Voorraad, favorieten, cursus enz. samen met je account bijhouden.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    startSync(uid);
    const onVisible = () => { if (document.visibilityState === "visible") startSync(uid); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session?.user?.id]);
  const signOut = async () => {
    stopSync();
    await nativePush.forget();
    await supabase.auth.signOut();
  };
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
      // Uitgelogd: de app helemaal opnieuw laden, zodat er niets van het
      // vorige account in het geheugen blijft (feed, vrienden, meldingen).
      if (event === "SIGNED_OUT") { window.location.reload(); return; }
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

  // Gebruiksvoorwaarden: welke versie dit account accepteerde. Staat op het
  // profiel; zonder de migratie (kolom ontbreekt) valt het terug op deze
  // telefoon. Wie net een account maakte, ging al akkoord bij registreren
  // (user_metadata) en ziet het akkoordscherm dus niet.
  const [termsLocal, setTermsLocal] = useStorage("thuisbar-voorwaarden-akkoord", null);
  const [termsBusy, setTermsBusy] = useState(false);
  const [termsError, setTermsError] = useState("");
  const termsAccepted = !profile ? true
    : ("voorwaarden_versie" in profile ? profile.voorwaarden_versie : termsLocal) === VOORWAARDEN_VERSIE;
  const termsFromSignup = session?.user?.user_metadata?.voorwaarden_versie === VOORWAARDEN_VERSIE;
  const acceptTerms = async (when = new Date().toISOString()) => {
    setTermsBusy(true); setTermsError("");
    setTermsLocal(VOORWAARDEN_VERSIE);
    const update = { voorwaarden_versie: VOORWAARDEN_VERSIE, voorwaarden_akkoord_op: when };
    const { error } = await supabase.from("profiles").update(update).eq("id", session.user.id);
    if (!error) setProfile(p => (p ? { ...p, ...update } : p));
    else if ("voorwaarden_versie" in (profile || {})) setTermsError("Opslaan lukte niet. Controleer je internetverbinding en probeer het opnieuw.");
    setTermsBusy(false);
  };
  useEffect(() => {
    if (session && profile && !termsAccepted && termsFromSignup && !termsBusy) acceptTerms(session.user.user_metadata.voorwaarden_akkoord_op || undefined);
  }, [session, profile, termsAccepted, termsFromSignup]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Wie al een rang had voordat feedmomenten bestonden (of op een ander
  // toestel), krijgt eenmalig een moment voor de huidige rang, zodat die
  // ook in je eigen feed en die van je vrienden staat.
  const backfillCheckedRef = useRef(false);
  useEffect(() => {
    if (!session || !profile || backfillCheckedRef.current) return;
    const current = profileCourseRank(profile);
    if (current.index < 1) return;
    backfillCheckedRef.current = true;
    supabase.from("course_milestones").select("id").eq("user_id", session.user.id).limit(1).then(({ data, error }) => {
      if (error || (data && data.length > 0)) return;
      // .then() is nodig: een Supabase-query wordt pas uitgevoerd als je erop wacht.
      supabase.from("course_milestones").insert({ user_id: session.user.id, rank: current.rank.id, parts_done: current.partsDone }).then(() => {});
    });
  }, [session, profile]);
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
  // Check-ins die je als gast deed, gaan na het inloggen of aanmaken van een
  // account mee naar je account (met hun oorspronkelijke datum). Pas als het
  // opslaan gelukt is, verdwijnen ze van het toestel.
  const migratingRef = useRef(false);
  useEffect(() => {
    if (!session || guestCheckins.length === 0 || migratingRef.current) return;
    migratingRef.current = true;
    const rows = guestCheckins.map(e => ({
      user_id: session.user.id, recipe_id: e.recipeId || null, name: e.name, rating: e.rating, notes: e.notes, photo: e.photo,
      location: e.location, location_lat: e.locationLat, location_lon: e.locationLon, taste_tags: e.tasteTags, created_at: e.createdAt,
    }));
    (async () => {
      for (const r of rows) r.photo = await uploadCheckinPhoto(session.user.id, r.photo);
      let { error } = await supabase.from("checkins").insert(rows);
      if (error) ({ error } = await supabase.from("checkins").insert(rows.map(({ created_at, ...r }) => r))); // eslint-disable-line no-unused-vars
      if (!error) { updateGuestCheckins(() => []); reloadLogboek(); }
      else console.error("Gast-check-ins overzetten mislukt:", error);
      migratingRef.current = false;
    })();
  }, [session, guestCheckins]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLogEntry = async (entry) => {
    if (session === undefined) return;
    if (!session) {
      const now = new Date().toISOString();
      // Op het toestel iets kleiner bewaren; na het aanmaken van een account
      // gaat hij mee naar de opslag.
      let localPhoto = entry.photo || null;
      if (localPhoto?.startsWith("data:")) { try { localPhoto = await imageToJpegDataUrl(localPhoto, 1080, 0.8); } catch { /* origineel houden */ } }
      const local = {
        id: `local-${Date.now()}`, date: now.slice(0, 10), createdAt: now, recipeId: entry.recipeId, name: entry.name,
        rating: entry.rating, notes: entry.notes || "", photo: localPhoto, location: entry.location || "Thuis",
        locationLat: entry.locationLat ?? null, locationLon: entry.locationLon ?? null, tasteTags: entry.tasteTags || [],
      };
      updateGuestCheckins(cur => [local, ...cur]);
      return local.id;
    }
    const photoUrl = await uploadCheckinPhoto(session.user.id, entry.photo);
    const { data } = await supabase.from("checkins").insert({
      user_id: session.user.id, recipe_id: entry.recipeId, name: entry.name, rating: entry.rating,
      notes: entry.notes, photo: photoUrl, location: entry.location,
      location_lat: entry.locationLat, location_lon: entry.locationLon, taste_tags: entry.tasteTags,
      ...(entry.createdAt ? { created_at: entry.createdAt } : {}),
    }).select().single();
    if (data) {
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
      // Pas nu in het logboek zetten: dat laat o.a. de tagmeldingen op Home
      // herladen, en dan moet een overgenomen tag al als overgenomen staan.
      setLogboekState(cur => [checkinRowToEntry(data), ...cur]);
      return data.id;
    }
    return null;
  };
  // Check-in bewerken: meteen in de lijst aanpassen, dan opslaan. Lukt het
  // opslaan niet (bijv. ontbrekende update-policy), dan terug naar wat er
  // in de database staat.
  const updateLogEntry = async (id, entry) => {
    if (!session) { updateGuestCheckins(cur => cur.map(e => e.id === id ? { ...e, ...entry } : e)); return; }
    const oldPhoto = logboek.find(e => e.id === id)?.photo;
    setLogboekState(cur => cur.map(e => e.id === id ? { ...e, ...entry } : e));
    const photoUrl = await uploadCheckinPhoto(session.user.id, entry.photo);
    const patch = {
      recipe_id: entry.recipeId, name: entry.name, rating: entry.rating, notes: entry.notes, photo: photoUrl,
      location: entry.location, location_lat: entry.locationLat, location_lon: entry.locationLon, taste_tags: entry.tasteTags,
    };
    const { data, error } = await supabase.from("checkins").update(patch).eq("id", id).eq("user_id", session.user.id).select().single();
    if (error || !data) {
      console.error("Check-in bijwerken mislukt:", error);
      window.alert("Opslaan van de wijziging lukte niet. Probeer het later nog eens.");
      reloadLogboek();
      return;
    }
    setLogboekState(cur => cur.map(e => e.id === id ? checkinRowToEntry(data) : e));
    if (oldPhoto && oldPhoto !== data.photo) removeCheckinPhoto(session.user.id, oldPhoto);
  };
  const removeLogEntry = async (id) => {
    if (!session) { updateGuestCheckins(cur => cur.filter(e => e.id !== id)); return; }
    const oldPhoto = logboek.find(e => e.id === id)?.photo;
    setLogboekState(cur => cur.filter(e => e.id !== id));
    const { error } = await supabase.from("checkins").delete().eq("id", id);
    if (!error) removeCheckinPhoto(session.user.id, oldPhoto);
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
    // Eerst je eigen bestanden in de opslag weghalen: Supabase weigert een
    // account te verwijderen dat nog bestanden bezit.
    await removeOwnStorageFiles(session.user.id);
    // Via de database (functie verwijder_mijn_account); bestaat die nog niet,
    // dan via de Edge Function zoals voorheen.
    let { error } = await supabase.rpc("verwijder_mijn_account");
    if (error && /verwijder_mijn_account|PGRST202|does not exist|schema cache/i.test(`${error.code} ${error.message}`)) {
      ({ error } = await supabase.functions.invoke("delete-account", {}));
    }
    setDeletingAccount(false);
    if (error) {
      let detail = "";
      try { detail = error.context?.json ? (await error.context.json())?.error || "" : error.message || ""; } catch { detail = error.message || ""; }
      console.error("Account verwijderen mislukt:", error, detail);
      setDeleteAccountError(`Verwijderen is niet gelukt. Probeer het nog eens.${detail ? ` (${detail})` : ""}`);
      return;
    }
    await nativePush.forget();
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
  // Recept geopend vanuit de bartender: terug = terug naar het gesprek.
  const [bartenderReturnTab, setBartenderReturnTab] = useState("home");
  const openRecipeFromBartender = (id) => {
    setBartenderReturnTab(tab === "ontdekken" ? "home" : tab);
    setBartenderOpen(false);
    setRecipeOrigin("bartender");
    navigateTo("ontdekken");
    setPendingRecipeId(id);
  };
  const returnFromRecipe = () => {
    const origin = recipeOrigin;
    setRecipeOrigin(null);
    if (origin === "bartender") { navigateTo(bartenderReturnTab, { restore: true }); setBartenderOpen(true); return; }
    if (origin) navigateTo(origin, { restore: true });
  };
  const recipeBackLabel = recipeOrigin === "bartender" ? "Bartender" : recipeOrigin
    ? (PUSH_SCREEN_TITLES[recipeOrigin] || DOCK_LABELS[recipeOrigin] || TAGS.find(t => t.id === recipeOrigin)?.label || "Terug")
    : "Ontdekken";

  // Zelfde idee, maar dan voor inchecken: het formulier leeft als een sheet
  // ín LogboekTab (die portal't naar document.body, dus verschijnt sowieso al
  // boven elke tab), maar moet ook zonder daarheen te navigeren opengaan —
  // vanaf de centrale +-knop, of straks direct vanaf een recept. Een nieuw
  // object (i.p.v. een simpele boolean) zorgt dat twee achtereenvolgende
  // aanvragen voor dezelfde naam allebei echt de sheet heropenen.
  const [checkinRequest, setCheckinRequest] = useState(null);
  // Net ingecheckt: naar de feed, de nieuwe post licht bovenaan even op.
  const [feedHighlight, setFeedHighlight] = useState(null);
  const handleCheckedIn = (saved) => {
    navigateTo("home");
    window.scrollTo(0, 0);
    Promise.resolve(saved).then((id) => {
      if (!id) return;
      setFeedHighlight(id);
      setTimeout(() => setFeedHighlight(cur => (cur === id ? null : cur)), 3200);
    }).catch(() => {});
  };
  const openCheckin = (req = "") => setCheckinRequest(typeof req === "string" ? { ts: Date.now(), name: req } : { ts: Date.now(), ...req });

  // Eén recept toevoegen aan de Feestplanner-keuze, vanuit Maken of een
  // recept-detail — dus niet via de bulk "gebruik dit menu"-actie van
  // de oude Smaakbalans, maar één-voor-één met eigen feedback.
  const addRecipeToFeest = async (id) => {
    if (!session) { requireAccount("feest"); return; }
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
  const [flessenTick, setFlessenTick] = useState(0);
  const bottleOptions = useFlessen(flessenTick);
  useEffect(() => { if (tab === "mandje") setFlessenTick(t => t + 1); }, [tab]);
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
  useEffect(() => { setStatusBarOnDark(true); }, [tab]);
  // Menu-assistent gekoppeld aan een feest (vanaf de feestpagina geopend);
  // null = los gebruikt via Bar. Antwoorden per feest apart bewaard.
  const [maPartyId, setMaPartyId] = useState(null);
  const [maFeesten, setMaFeesten] = useStorage("thuisbar-menu-assistent-feesten", {});
  const maParty = maPartyId ? parties.parties.find(p => p.id === maPartyId) || null : null;
  const openMenuAssistentForParty = (partyId) => { setMaPartyId(partyId); navigateTo("balans"); };
  const backToMaParty = () => { const id = maPartyId; setMaPartyId(null); setOpenPartyId(id); navigateTo("feest", { restore: true }); };
  // Voorraad → "Wat ik kan maken" (in Ontdekken), met de terugknop naar Voorraad.
  const [kanOpenTick, setKanOpenTick] = useState(0);
  const [kanFromVoorraad, setKanFromVoorraad] = useState(false);
  const openMakenFromVoorraad = () => { setKanFromVoorraad(true); setKanOpenTick(t => t + 1); navigateTo("ontdekken"); };
  const [notifTick, setNotifTick] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  useEffect(() => { if (tab === "home") setNotifTick(t => t + 1); }, [tab, homeTapTick]);
  const notifications = useNotifications(session, logboek, notifTick);

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
  // Flessen scannen: toevoegen of bijwerken, met aantal en hoe vol.
  const addScanned = (list) => {
    setVoorraad([...voorraadArr, ...list.map(x => x.id).filter(id => !voorraadArr.includes(id))]);
    const aantal = { ...voorraadAantal };
    const niveau = { ...voorraadNiveau };
    list.forEach(({ id, aantal: n, niveau: lv }) => {
      aantal[id] = n || 1;
      if (!lv || lv === "vol") delete niveau[id]; else niveau[id] = lv;
    });
    setVoorraadAantal(aantal);
    setVoorraadNiveau(niveau);
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
  batchOpener.current = (id) => { setBatchRequest({ id, nonce: Date.now() }); navigateTo("schaler"); };
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
  if (session && !termsAccepted && !termsFromSignup) return <TermsGateScreen onAccept={() => acceptTerms()} onSignOut={signOut} busy={termsBusy} error={termsError} />;
  // Zonder account krijg je dezelfde app (Apple 5.1.1: geen inlogmuur voor
  // wat geen account nodig heeft). Pas als een gast zelf kiest voor
  // inloggen of een account maken, tonen we AuthScreen — met een weg terug.
  if (session === null && wantsLogin) return <AuthScreen initialMode={wantsLogin} onCancel={() => setWantsLogin(false)} />;

  return (
    <div style={{ background: PAPER, minHeight: "100%", fontFamily: sans, color: INK }}>
      {!isOnline && <OfflineBanner />}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      {tab !== "home" && <StatusBarBackdrop showAfter={0} dark />}
      {showNotifications && (
        <NotificationsScreen notifications={notifications} recipes={allRecipes} allIngredients={allIngredients}
          onClose={() => setShowNotifications(false)}
          onOpenFriends={() => { setShowNotifications(false); navigateTo("vrienden"); }} />
      )}
      {/* Home: smalle donkergroene kop die bovenaan blijft staan, met de
          naam van de app en een knop om in te checken. Andere tabs krijgen
          dezelfde groene kop (LargeTitleHeader / HeaderNavBar). */}
      {tab === "home" && (
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: BOTTLE_DARK, color: "#FBF6EA" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 6px) 14px 8px 20px", display: "flex", alignItems: "center", gap: 10, boxSizing: "border-box" }}>
            <h1 style={{ flex: 1, margin: 0, fontFamily: serif, fontSize: 24, fontWeight: 700, letterSpacing: 0.2, color: "#FBF6EA" }}>Mijn Thuisbar</h1>
            {isGuest ? (
              <button onClick={() => setWantsLogin("login")} className="press-scale" style={{
                flexShrink: 0, background: HEADER_TEXT, color: "#132622", border: "none", borderRadius: 100,
                padding: "8px 14px", fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              }}>Inloggen</button>
            ) : (
            <button onClick={() => setShowNotifications(true)} aria-label={notifications.unread > 0 ? `Meldingen, ${notifications.unread} nieuw` : "Meldingen"} className="press-scale" style={{
              position: "relative", width: 44, height: 44, border: "none", background: "none", color: "#DDB877",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}>
              <Bell size={23} strokeWidth={1.9} />
              {notifications.unread > 0 && (
                <span style={{ position: "absolute", top: 6, right: 4, minWidth: 18, height: 18, padding: "0 5px", boxSizing: "border-box", borderRadius: 9, background: "#D9573F", border: "2px solid #132622", color: "#fff", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {notifications.unread > 9 ? "9+" : notifications.unread}
                </span>
              )}
            </button>
            )}
            <button onClick={() => openCheckin()} aria-label="Inchecken" className="press-scale" style={{
              width: 38, height: 38, borderRadius: "50%", border: "none", background: "#B8862E", color: "#132622",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}>
              <Plus size={20} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px calc(env(safe-area-inset-bottom) + 150px)" }}>
        <TabPanel id="home" active={tab === "home"} visited={visitedTabs.has("home")} panelRef={panelRefs}>
          <HomeTab onOpenBartender={openBartender} session={session} profile={profile} greeting={greeting} featuredRecipe={featuredRecipe}
            favoriteFamily={checkinInsights.favoriteFamilyEntry?.[0] || null}
            logboek={logboek} recipes={allRecipes} allIngredients={allIngredients} active={tab === "home"}
            onOpenRecipe={openRecipeDetail} onOpenCheckin={openCheckin} onSound={chime}
            onReloadLogboek={reloadLogboek} homeTapTick={homeTapTick} courseRank={courseRank} nativePush={nativePush} highlightId={feedHighlight}
            guest={isGuest} onRequireAccount={requireAccount} onOpenOwnProfile={() => navigateTo("profiel")} />
        </TabPanel>
        <TabPanel id="ontdekken" active={tab === "ontdekken"} visited={visitedTabs.has("ontdekken")} panelRef={panelRefs}>
          <OntdekkenTab active={tab === "ontdekken"}
            recipeBackLabel={recipeBackLabel} onRecipeBack={recipeOrigin ? returnFromRecipe : null} rootTapTick={ontdekkenTapTick}
            openKanTick={kanOpenTick}
            kanBack={kanFromVoorraad ? { label: "Voorraad", onBack: () => { setKanFromVoorraad(false); navigateTo("voorraad", { restore: true }); } } : null}
            onKanClosed={() => setKanFromVoorraad(false)}
            openRecipeId={pendingRecipeId} onOpenRecipeHandled={() => setPendingRecipeId(null)}
            recommended={checkinInsights.recommended} favoriteFamily={checkinInsights.favoriteFamilyEntry?.[0] || null}
            allIngredients={allIngredients} onOpenRecipe={openRecipeDetail} onSound={chime}
            makenProps={{
              recipes: allRecipes, isOwned, ingredientLabel, allIngredients,
              onAddToShoppingList: addToShoppingList, onSound: chime,
              onOpenRecipe: openRecipeDetail, onAddToFeest: addRecipeToFeest, feestChosen,
              shoppingKeys, onRemoveFromShoppingList: removeFromShoppingList,
              favoriteRecipeIds, onToggleFavorite: toggleFavoriteRecipe, onOpenCheckin: openCheckin,
              onOpenVoorraad: () => { setKanFromVoorraad(false); navigateTo("voorraad"); },
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
          <BarTab onSelect={(id) => { if (id === "bartender") { openBartender(); return; } if (id === "balans") setMaPartyId(null); navigateTo(id); }} shoppingCount={shoppingList.length} feestCount={feestChosen.length} active={tab === "bar"}
            voorraadCount={voorraad.size} customRecipesCount={customRecipes.length}
            feestSubtitle={isGuest ? "Met een gratis account" : upcomingParties[0] ? `${upcomingParties[0].name} · ${formatPartyWhen(upcomingParties[0]).toLowerCase()}` : "Plan een avond"}
            courseProgress={courseProgress} />
        </TabPanel>
        <TabPanel id="profiel" active={tab === "profiel"} visited={visitedTabs.has("profiel")} panelRef={panelRefs}>
          <LogboekTab recipes={allRecipes} logboek={logboek} onAddEntry={addLogEntry} onUpdateEntry={updateLogEntry} onRemoveEntry={removeLogEntry} allIngredients={allIngredients} ingredientLabel={ingredientLabel} onSound={chime} isOwned={isOwned} profile={profile} onOpenRecipe={openRecipeDetail} checkinRequest={checkinRequest} onCheckinRequestHandled={() => setCheckinRequest(null)} onCheckedIn={handleCheckedIn}
            guest={isGuest} onRequireAccount={requireAccount}
            onUpdateName={updateProfileName} onUpdatePhoto={updateProfilePhoto} courseDiploma={courseDiploma} courseProgress={courseProgress} courseRank={courseRank}
            onGoVrienden={() => navigateTo("vrienden")} onGoInstellingen={() => navigateTo("instellingen")} active={tab === "profiel"}
            friendRequestCount={friendRequestCount} />
        </TabPanel>

        <TabPanel id="voorraad" active={tab === "voorraad"} visited={visitedTabs.has("voorraad")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Bar" title={PUSH_SCREEN_TITLES.voorraad} onBack={() => navigateTo("bar", { restore: true })}>
            <VoorraadTab allIngredients={allIngredients} recipes={allRecipes} isOwned={isOwned} voorraad={voorraad}
              voorraadAantal={voorraadAantal} onAdjustAantal={adjustAantal}
              onToggle={toggleIngredient} onAddCustom={addCustomIngredient} onRemoveCustom={removeCustomIngredient}
              niveaus={voorraadNiveau} onSetNiveau={setNiveau} onAddPack={addPack} onUndoPack={undoPack} onOpenMaken={openMakenFromVoorraad}
              onAddToShoppingList={addToShoppingList} shoppingKeys={shoppingKeys} onOpenFullRecipe={openRecipeDetail} onSound={chime}
              onRequestAi={withAi} onAddScanned={addScanned} />
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
          <SecondaryTabScreen label={maParty ? "Feest" : "Bar"} title={PUSH_SCREEN_TITLES.balans} onBack={maParty ? backToMaParty : () => navigateTo("bar", { restore: true })}>
            <MenuAssistentTab key={maParty ? maParty.id : "los"} recipes={allRecipes} isOwned={isOwned} allIngredients={allIngredients} ingredientLabel={ingredientLabel}
              favoriteRecipeIds={favoriteRecipeIds} recentRecipeIds={recentRecipeIds} tasteLikes={menuTasteLikes} parties={parties.parties}
              onAddToShoppingList={addToShoppingList} onSound={chime}
              linkedParty={maParty} partyAnswers={maParty ? maFeesten[maParty.id] || null : null}
              onPartyAnswers={(next) => maParty && setMaFeesten({ ...maFeesten, [maParty.id]: next })}
              onApplyToParty={(ids, surveyCount) => {
                parties.updateParty(maParty.id, { cocktail_ids: ids });
                setMaFeesten({ ...maFeesten, [maParty.id]: { ...(maFeesten[maParty.id] || {}), appliedSurveyCount: surveyCount } });
                backToMaParty();
              }}
              onUnlink={() => setMaPartyId(null)}
              onUseInFeestplanner={async (ids, guests, partyId) => {
                if (!session) { requireAccount("feest"); return; }
                const target = (partyId && parties.parties.find(p => p.id === partyId)) || await resolveTargetParty({ guests });
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
              hostName={profile?.name || ""} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
              onOpenMenuAssistent={openMenuAssistentForParty} maAnswersByParty={maFeesten}
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
            <VriendenTab session={session} profile={profile} recipes={allRecipes} allIngredients={allIngredients} onSound={chime} active={tab === "vrienden"} myLogboek={logboek} onOpenRecipe={openRecipeDetail} onOpenCheckin={openCheckin} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="instellingen" active={tab === "instellingen"} visited={visitedTabs.has("instellingen")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Profiel" title={PUSH_SCREEN_TITLES.instellingen} onBack={() => navigateTo("profiel", { restore: true })}>
            <InstellingenTab aiConsent={aiConsent} onSetAiConsent={setAiConsent} soundEnabled={soundEnabled} onToggleSound={setSoundEnabled} onSignOut={signOut} push={push} nativePush={nativePush} onNavigate={navigateTo}
              guest={isGuest} onLogin={() => setWantsLogin("login")} onSignup={() => setWantsLogin("signup")}
              onExportData={() => exportMyData(session?.user?.id || null)} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="privacybeleid" active={tab === "privacybeleid"} visited={visitedTabs.has("privacybeleid")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES.privacybeleid} onBack={() => navigateTo("instellingen", { restore: true })}>
            <PrivacyPolicyScreen />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="voorwaarden" active={tab === "voorwaarden"} visited={visitedTabs.has("voorwaarden")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES.voorwaarden} onBack={() => navigateTo("instellingen", { restore: true })}>
            <TermsScreen />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="licenties" active={tab === "licenties"} visited={visitedTabs.has("licenties")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES.licenties} onBack={() => navigateTo("instellingen", { restore: true })}>
            <LicensesScreen active={tab === "licenties"} />
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
        <TabPanel id="inzichten-beheren" active={tab === "inzichten-beheren"} visited={visitedTabs.has("inzichten-beheren")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES["inzichten-beheren"]} onBack={() => navigateTo("instellingen", { restore: true })}>
            <InsightsAdminScreen active={tab === "inzichten-beheren"} recipes={allRecipes} onOpenRecipe={openRecipeDetail} />
          </SecondaryTabScreen>
        </TabPanel>
        <TabPanel id="meldingen-beheren" active={tab === "meldingen-beheren"} visited={visitedTabs.has("meldingen-beheren")} panelRef={panelRefs}>
          <SecondaryTabScreen label="Instellingen" title={PUSH_SCREEN_TITLES["meldingen-beheren"]} onBack={() => navigateTo("instellingen", { restore: true })}>
            <ReportsAdminScreen active={tab === "meldingen-beheren"} />
          </SecondaryTabScreen>
        </TabPanel>
      </div>

      <BottomDock tab={tab} setTab={navigateTo} shoppingCount={shoppingList.length} onCheckin={() => openCheckin()} />
      {bartenderOpen && (
        <BartenderScreen chat={bartenderChat} setChat={setBartenderChat} onClose={() => setBartenderOpen(false)}
          recipes={allRecipes} allIngredients={allIngredients} isOwned={isOwned} voorraad={voorraad} logboek={logboek}
          useStock={bartenderStock} setUseStock={setBartenderStock}
          onOpenRecipe={openRecipeFromBartender} onAddToShoppingList={addToShoppingList} onSound={chime} />
      )}
      {aiPending && (
        <AiConsentSheet onClose={() => setAiPending(null)}
          onAccept={() => { const fn = aiPending; setAiConsent("ja"); setAiPending(null); fn(); }} />
      )}
      {accountPrompt && (
        <AccountPromptSheet reason={accountPrompt} checkinCount={guestCheckins.length} onClose={() => setAccountPrompt(null)}
          onSignup={() => { setAccountPrompt(null); setWantsLogin("signup"); }}
          onLogin={() => { setAccountPrompt(null); setWantsLogin("login"); }} />
      )}
    </div>
  );
}

// Schermen die als gast de zachte drempel openen i.p.v. te navigeren
// (waarde = welke uitleg het venster toont).
const GUEST_LOCKED_TABS = { vrienden: "vrienden", feest: "feest", "account-verwijderen": "algemeen" };
const ACCOUNT_PROMPT_COPY = {
  algemeen: { title: "Maak een gratis account", text: "Alles wat je nu doet blijft gewoon werken. Met een account komt er dit bij:" },
  vrienden: { title: "Drink samen met vrienden", text: "Volg wat je vrienden inchecken, proost op hun cocktails en check samen in." },
  feest: { title: "Plan je feest", text: "Nodig gasten uit met een link, laat ze de smaaktest doen en stel samen het menu en de boodschappen samen." },
  profiel: { title: "Je eigen profiel", text: "Met een account krijg je een naam en foto die je vrienden zien, en staan je check-ins veilig bewaard." },
  bartender: { title: "De bartender", text: "De AI-bartender en het scannen van flessen werken met een gratis account. Recepten, je voorraad en de cursus blijven ook zonder account gewoon werken." },
  bewaren: { title: "Bewaar je check-ins", text: "Je check-ins staan nu alleen op deze telefoon. Met een account staan ze veilig bewaard en kun je ze delen." },
};
const ACCOUNT_BENEFITS = [
  { icon: Users, title: "Vrienden en feed", sub: "Zie wat je vrienden drinken en check samen in" },
  { icon: ShieldCheck, title: "Check-ins veilig bewaard", sub: "Ook op een nieuwe telefoon; wat je al deed gaat mee" },
  { icon: PartyPopper, title: "Feesten plannen", sub: "Gasten uitnodigen, smaaktest en menu delen" },
];
function AccountPromptSheet({ reason, checkinCount = 0, onClose, onSignup, onLogin }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const copy = ACCOUNT_PROMPT_COPY[reason] || ACCOUNT_PROMPT_COPY.algemeen;
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0",
        boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", padding: "0 22px calc(env(safe-area-inset-bottom) + 18px)",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", touchAction: "none", paddingTop: 4 }}>
          <BrandMark width={64} />
          <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 12 }}>{copy.title}</div>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, color: MUTED, lineHeight: 1.5, maxWidth: 380 }}>{copy.text}</p>
        </div>
        <div style={{ background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD, margin: "18px 0 0", padding: "4px 14px" }}>
          {ACCOUNT_BENEFITS.map(({ icon: Icon, title, sub }, i) => (
            <div key={title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(31,61,54,0.08)", color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={17} /></span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{title}</span>
                <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{sub}</span>
              </span>
            </div>
          ))}
        </div>
        {checkinCount > 0 && (
          <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center", marginTop: 10 }}>
            Je {checkinCount === 1 ? "check-in gaat" : `${checkinCount} check-ins gaan`} automatisch mee naar je account.
          </div>
        )}
        <button onClick={onSignup} className="press-scale" style={{
          width: "100%", minHeight: 50, marginTop: 16, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT,
          fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}>Gratis account maken</button>
        <button onClick={onLogin} className="press-scale" style={{
          width: "100%", minHeight: 48, marginTop: 8, borderRadius: 14, border: `1.5px solid ${BOTTLE}`, background: "none", color: BOTTLE,
          fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}>Ik heb al een account</button>
        <button onClick={close} style={{
          width: "100%", minHeight: 44, marginTop: 4, border: "none", background: "none", color: MUTED,
          fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
        }}>Later</button>
      </div>
    </div>
  ), document.body);
}

export function Switch({ checked, onChange, disabled }) {
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
function InstellingenTab({ aiConsent = null, onSetAiConsent, soundEnabled, onToggleSound, onSignOut, push, nativePush, onNavigate, guest = false, onLogin, onSignup, onExportData }) {
  if (guest) { push = { supported: false }; nativePush = null; }
  // "Download mijn gegevens": status van de export (idle | busy | done | error).
  const [exportState, setExportState] = useState("idle");
  const runExport = async () => {
    if (!onExportData || exportState === "busy") return;
    setExportState("busy");
    try { await onExportData(); setExportState("done"); }
    catch (e) { console.error("Export mislukt:", e); setExportState("error"); }
  };
  // Alleen beheerders (tabel app_beheerders) zien "Gemelde check-ins".
  const [isBeheerder, setIsBeheerder] = useState(false);
  useEffect(() => {
    if (guest) return;
    let cancelled = false;
    supabase.rpc("ben_ik_beheerder").then(({ data }) => { if (!cancelled) setIsBeheerder(data === true); });
    return () => { cancelled = true; };
  }, [guest]);
  return (
    <div>
      {guest && (
        <div style={{ background: CREAM, boxShadow: SHADOW_CARD, borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>Je gebruikt de app zonder account</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginTop: 3 }}>Je voorraad, check-ins en cursus staan op deze telefoon. Met een account komen vrienden, de feed en de feestplanner erbij.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={onSignup} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Account maken</button>
            <button onClick={onLogin} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: `1.5px solid ${BOTTLE}`, background: "none", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Inloggen</button>
          </div>
        </div>
      )}
      <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}>
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
        {!guest && onSetAiConsent && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: `1px solid ${BORDER}` }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
              <MessageCircle size={16} strokeWidth={1.8} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: INK }}>Bartender en flessen scannen</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>Je vraag, foto, voorraad en smaak gaan naar Claude (Anthropic). Niet je naam of e-mail.</div>
            </div>
            <Switch checked={aiConsent === "ja"} onChange={(v) => onSetAiConsent(v ? "ja" : "nee")} />
          </div>
        )}
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
        {nativePush?.supported && (
          <div style={{ padding: "14px 16px", borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
                <Bell size={16} strokeWidth={1.8} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, color: INK }}>Meldingen</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>
                  {nativePush.permission === "granted" ? "Staan aan. Kies hieronder welke je wilt krijgen."
                    : nativePush.permission === "denied" ? "Staan uit in je iPhone. Zet ze aan via Instellingen > Meldingen > Mijn Thuisbar."
                    : "Hoor het als een vriend je tagt, proost of reageert."}
                </div>
              </div>
              {nativePush.permission !== "granted" && nativePush.permission !== "denied" && (
                <button onClick={nativePush.enable} disabled={nativePush.busy} style={{ minHeight: 34, padding: "0 14px", borderRadius: 100, border: "none", background: BOTTLE, color: CREAM, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: sans, flexShrink: 0 }}>
                  Aanzetten
                </button>
              )}
            </div>
            {nativePush.permission === "granted" && (
              <div style={{ marginTop: 10, marginLeft: 46 }}>
                {PUSH_SOORTEN.map(({ key, label, sub }, i) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: INK }}>{label}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{sub}</div>
                    </div>
                    <Switch checked={!!nativePush.prefs[key]} onChange={(v) => nativePush.setPref(key, v)} />
                  </div>
                ))}
              </div>
            )}
            {nativePush.error && (
              <div style={{ marginTop: 10, fontSize: 12, color: BURGUNDY, background: "rgba(122,46,42,0.08)", border: "1px solid rgba(122,46,42,0.25)", borderRadius: 10, padding: "8px 11px", lineHeight: 1.4 }}>
                {nativePush.error}
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
        <button onClick={() => onNavigate("voorwaarden")} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
          borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
            <ClipboardList size={16} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>Gebruiksvoorwaarden</span>
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
        <button onClick={() => onNavigate("licenties")} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
          background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
          borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
        }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
            <Info size={16} strokeWidth={1.8} />
          </span>
          <span style={{ flex: 1, fontWeight: 600 }}>Licenties</span>
          <ChevronRight size={16} color={MUTED} />
        </button>
        {isBeheerder && (
          <button onClick={() => onNavigate("meldingen-beheren")} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
            borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
          }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BURGUNDY, flexShrink: 0 }}>
              <Flag size={16} strokeWidth={1.8} />
            </span>
            <span style={{ flex: 1, fontWeight: 600 }}>Gemelde check-ins</span>
            <ChevronRight size={16} color={MUTED} />
          </button>
        )}
        {isBeheerder && (
          <button onClick={() => onNavigate("inzichten-beheren")} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            background: "none", border: "none", cursor: "pointer", padding: "14px 16px",
            borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
          }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
              <Sparkles size={16} strokeWidth={1.8} />
            </span>
            <span style={{ flex: 1, fontWeight: 600 }}>Wat de app leert</span>
            <ChevronRight size={16} color={MUTED} />
          </button>
        )}
        {onExportData && (
          <button onClick={runExport} disabled={exportState === "busy"} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            background: "none", border: "none", cursor: exportState === "busy" ? "default" : "pointer", padding: "14px 16px",
            borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 14.5, color: INK,
          }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
              <Share2 size={16} strokeWidth={1.8} />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontWeight: 600 }}>Download mijn gegevens</span>
              <span style={{ display: "block", fontSize: 12, color: exportState === "error" ? BURGUNDY : MUTED, marginTop: 1 }}>
                {exportState === "busy" ? "Bezig met verzamelen…"
                  : exportState === "done" ? "Klaar. Bewaar of deel het bestand."
                  : exportState === "error" ? "Dat lukte niet. Probeer het opnieuw of mail ons."
                  : guest ? "Alles wat op deze telefoon staat, in één bestand" : "Je account, voorraad, check-ins en meer, in één bestand"}
              </span>
            </span>
          </button>
        )}
        {!guest && <>
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
        </>}
      </div>
    </div>
  );
}

// Kan geen internetverbinding of extern beleid nodig hebben: platte tekst,
// altijd beschikbaar, ook offline — precies wat Apple-review verwacht als
// ze "Privacybeleid" aantikken.
function LegalText({ bijgewerkt, intro, secties, contact, color = INK, accent = BOTTLE, muted = MUTED }) {
  const P = ({ children }) => <p style={{ fontSize: 13.5, color, lineHeight: 1.65, margin: "0 0 16px" }}>{children}</p>;
  const H = ({ children }) => <h3 style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16, color: accent, margin: "22px 0 8px" }}>{children}</h3>;
  return (
    <div style={{ fontFamily: sans }}>
      <p style={{ fontSize: 12, color: muted, marginBottom: 20 }}>Laatst bijgewerkt: {bijgewerkt}</p>
      <P>{intro}</P>
      {secties.map(sec => (
        <div key={sec.kop}>
          <H>{sec.kop}</H>
          {sec.tekst && <P>{sec.tekst}</P>}
          {sec.punten?.length > 0 && (
            <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
              {sec.punten.map(p => <li key={p} style={{ fontSize: 13.5, color, lineHeight: 1.6, marginBottom: 6 }}>{p}</li>)}
            </ul>
          )}
          {sec.naTekst && <P>{sec.naTekst}</P>}
        </div>
      ))}
      <H>Contact</H>
      <P>{contact}</P>
    </div>
  );
}

function PrivacyPolicyScreen() {
  return <LegalText bijgewerkt={PRIVACY_BIJGEWERKT} intro={PRIVACY_INTRO} secties={PRIVACY_SECTIES} contact={privacyContactTekst()} />;
}

function TermsScreen() {
  return <LegalText bijgewerkt={VOORWAARDEN_BIJGEWERKT} intro={VOORWAARDEN_INTRO} secties={VOORWAARDEN_SECTIES} contact={voorwaardenContactTekst()} />;
}


function PhotoCreditsScreen() {
  const nameFor = (type, id) => {
    if (type === "cocktail") return RECIPES.find((r) => r.id === canonicalRecipeId(id))?.name || id;
    return INGREDIENTS.find((i) => i.id === id)?.name || id;
  };
  const credited = imageCatalog
    .filter((e) => e.bestand && e.niveau !== "illustratie" && (e.maker || e.licentie))
    .map((e) => ({ ...e, name: nameFor(e.type, e.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>
        Foto's van cocktails en dranken in deze app komen van fotografen die hun werk vrij beschikbaar stellen. Hieronder de bron en licentie per foto.
      </p>
      {credited.length === 0 ? (
        <p style={{ fontSize: 13.5, color: MUTED, textAlign: "center", padding: "30px 0" }}>Nog geen foto's met externe bronvermelding.</p>
      ) : (
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}>
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
    { id: "bartender", label: "Bartender", icon: MessageCircle, subtitle: "Vraag wat je nu kunt maken" },
    { id: "mandje", label: "Winkelmandje", icon: ShoppingCart, subtitle: shoppingCount > 0 ? `${shoppingCount} item${shoppingCount === 1 ? "" : "s"}` : "Leeg", badge: shoppingCount },
    { id: "feest", label: "Feestplanner", icon: PartyPopper, subtitle: feestSubtitle, badge: feestCount },
    { id: "cursus", label: "Cursus", icon: GraduationCap, subtitle: courseSubtitle },
    { id: "eigen", label: "Eigen recepten", icon: FlaskConical, subtitle: customRecipesCount > 0 ? `${customRecipesCount} eigen recept${customRecipesCount === 1 ? "" : "en"}` : "Maak je eerste" },
    { id: "schaler", label: "Batch-calculator", icon: Scale, subtitle: "Cocktails voor een groep of vooraf in een fles" },
    { id: "balans", label: "Menu-assistent", icon: ListChecks, subtitle: "Stel in 1 minuut een menu in balans samen" },
  ];
  return (
    <div>
      <LargeTitleHeader title="Bar" />

      <button onClick={() => onSelect("voorraad")} className="press-scale" style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left", boxSizing: "border-box",
        background: BOTTLE_DARK, border: "none", borderRadius: RADIUS + 8, padding: "16px 18px", marginBottom: 14,
        cursor: "pointer", color: HEADER_TEXT, fontFamily: sans, boxShadow: SHADOW_CARD,
      }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: RADIUS, background: "rgba(245,239,230,0.14)", flexShrink: 0 }}>
          <Refrigerator size={19} strokeWidth={1.8} color={BRASS} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>Voorraad</div>
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 1 }}>{voorraadCount > 0 ? `${voorraadCount} in huis` : "Nog leeg · vul in wat je hebt"}</div>
        </span>
        <ChevronRight size={17} color={HEADER_TEXT} style={{ opacity: 0.7, flexShrink: 0 }} />
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {items.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => onSelect(t.id)} className="press-scale" style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, textAlign: "left", boxSizing: "border-box",
              background: CREAM, border: "none", borderRadius: 16, padding: "16px 14px",
              cursor: "pointer", fontFamily: sans, boxShadow: SHADOW_CARD, position: "relative",
            }}>
              <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: RADIUS, background: PAPER_DEEP, color: BOTTLE, flexShrink: 0 }}>
                <Icon size={17} strokeWidth={1.8} />
                {/* Klein tellerbolletje (zoals op de onderbalk): aantal items in
                    het winkelmandje / cocktails op het menu van het volgende feest. */}
                {t.badge > 0 && (
                  <span aria-label={`${t.badge}`} style={{
                    position: "absolute", top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9, padding: "0 5px", boxSizing: "border-box",
                    background: BOTTLE, color: CREAM, fontSize: 10.5, fontWeight: 700, fontFamily: sans,
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
export function isPartyUpcoming(party) {
  if (!party.starts_at) return true;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  return new Date(party.starts_at) >= startOfToday;
}
// Oplopend op datum, geen-datum-feesten achteraan (net als de referentie:
// "Aankomend" toont eerst wat een concrete datum heeft).
export function compareUpcomingParties(a, b) {
  if (!a.starts_at && !b.starts_at) return new Date(a.created_at) - new Date(b.created_at);
  if (!a.starts_at) return 1;
  if (!b.starts_at) return -1;
  return new Date(a.starts_at) - new Date(b.starts_at);
}

// "Over X dagen" / "Vandaag" / "Geen datum" — gedeeld door de feestenlijst
// (kaart-chip) en de Bar-tegel, op kalenderdagen (niet exacte uren) net als
// isPartyUpcoming hierboven.
export function formatPartyWhen(party) {
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
export function partyNotificationId(partyId) {
  let hash = 0;
  for (let i = 0; i < partyId.length; i++) {
    hash = (hash * 31 + partyId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
export async function cancelPartyReminder(partyId) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: partyNotificationId(partyId) }] });
  } catch { /* geen native platform (web-preview) of al geannuleerd — niet kritiek */ }
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
      const { data, error } = await supabase.from("checkin_tags").select("id, checkin_id, tagger_id, tagged_user_id, adopted_checkin_id").in("checkin_id", checkinIds);
      if (cancelled || error || !data) return;
      const names = {}, photos = {};
      Object.values(knownProfiles || {}).forEach(p => { if (p?.id) { names[p.id] = p.name; photos[p.id] = p.avatar_url || null; } });
      const missing = [...new Set(data.map(t => t.tagged_user_id))].filter(id => !names[id]);
      if (missing.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, name, avatar_url").in("id", missing);
        (profs || []).forEach(p => { names[p.id] = p.name; photos[p.id] = p.avatar_url || null; });
      }
      if (cancelled) return;
      const map = {};
      data.forEach(t => { (map[t.checkin_id] = map[t.checkin_id] || []).push({
        id: t.tagged_user_id, name: names[t.tagged_user_id] || "een vriend", photo: photos[t.tagged_user_id] || null,
        tagId: t.id, taggerId: t.tagger_id, adoptedCheckinId: t.adopted_checkin_id ?? null,
      }); });
      setTags(map);
    })();
    return () => { cancelled = true; };
  }, [key, active, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return tags;
}
// Verzoek om een check-in waarin je getagd bent over te nemen: zelfde
// cocktail, plek, tijd en (desgewenst) foto; je eigen cijfer kies je zelf.
function adoptCheckinRequest(entry, tag, taggerName) {
  const first = (taggerName || "je vriend").split(" ")[0];
  return {
    name: entry.name, location: entry.location, photo: entry.photo || null,
    locationLat: entry.locationLat ?? null, locationLon: entry.locationLon ?? null,
    adoptTag: {
      id: tag.id, checkinId: entry.id, taggerId: tag.tagger_id, taggerName: first,
      taggerRating: entry.rating || 0, taggerPhoto: entry.photo || null, createdAt: entry.createdAt || null,
    },
  };
}

// "Vandaag 21:14", "Gisteren 22:05" of "3 okt 21:14".
function adoptWhenLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const time = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Vandaag ${time}`;
  if (same(d, y)) return `Gisteren ${time}`;
  return `${d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} ${time}`;
}

// Blok op een post waarin jij getagd bent: "Jij was erbij · Overnemen", of
// na het overnemen "Overgenomen · jij gaf 4,0 · Bekijk". Alleen jij ziet het.
function TagAdoptStrip({ adopted, myRating, onAdopt, onView, dark = false, style }) {
  if (adopted) {
    return (
      <button onClick={onView || undefined} disabled={!onView} className={onView ? "press-scale" : undefined} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 14,
        border: "none", background: dark ? "rgba(251,246,234,0.08)" : "rgba(31,61,54,0.08)", cursor: onView ? "pointer" : "default",
        fontFamily: sans, textAlign: "left", ...style,
      }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: dark ? "#DDB877" : BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Check size={15} strokeWidth={2.8} color={dark ? "#132622" : "#FBF6EA"} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: dark ? ON_DARK_TEXT : BOTTLE }}>
          Overgenomen{myRating ? ` · jij gaf ${formatRating(myRating)}` : ""}
        </span>
        {onView && <span style={{ display: "inline-flex", alignItems: "center", gap: 1, fontSize: 13, fontWeight: 700, color: dark ? "#DDB877" : BOTTLE }}>Bekijk<ChevronRight size={15} /></span>}
      </button>
    );
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 12px", borderRadius: 14,
      background: dark ? "rgba(221,184,119,0.12)" : "rgba(184,134,46,0.12)", boxShadow: `inset 0 0 0 1px ${dark ? "rgba(221,184,119,0.35)" : "rgba(184,134,46,0.35)"}`, ...style,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: dark ? ON_DARK_TEXT : INK }}>Jij was erbij</span>
        <span style={{ display: "block", fontSize: 12.5, color: dark ? "#C9D2CB" : MUTED, marginTop: 1 }}>Zet deze cocktail ook in jouw logboek</span>
      </span>
      <button onClick={onAdopt} className="press-scale" style={{
        minHeight: 40, padding: "0 14px", borderRadius: 100, border: "none", cursor: "pointer", flexShrink: 0,
        background: dark ? "#DDB877" : BOTTLE_DARK, color: dark ? "#132622" : HEADER_TEXT,
        display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 13.5, fontWeight: 800,
      }}>
        <Copy size={14} strokeWidth={2.2} /> Overnemen
      </button>
    </div>
  );
}

// ---------- Vrienden bij een recept ----------
// Check-ins van vrienden (en jezelf) bij één recept: cijfer, beschrijving en
// de post zelf. Per recept even onthouden, zodat heen en weer gaan direct is.
const friendRecipeCache = new Map();
function useFriendRecipeCheckins(recipe) {
  const key = recipe ? `${recipe.id}|${recipe.name}` : "";
  const [data, setData] = useState(() => friendRecipeCache.get(key) || null);
  useEffect(() => {
    if (!recipe) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const myId = sess?.session?.user?.id;
        if (!myId) { if (!cancelled) setData(null); return; }
        const [{ data: fr }, { data: blocks }] = await Promise.all([
          supabase.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`),
          supabase.from("blocked_users").select("blocked_id").eq("blocker_id", myId),
        ]);
        const blocked = new Set((blocks || []).map(b => b.blocked_id));
        const friendIds = [...new Set((fr || []).map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id)))].filter(id => id && !blocked.has(id));
        const ids = [myId, ...friendIds];
        const nameEsc = recipe.name.replace(/[,()"]/g, " ");
        const { data: rows } = await supabase.from("checkins").select("*").in("user_id", ids)
          .or(`recipe_id.in.(${recipeIdAliases(recipe.id).join(",")}),name.ilike.${nameEsc}`).order("created_at", { ascending: false }).limit(60);
        const friendRows = (rows || []).filter(r => r.user_id !== myId);
        const userIds = [...new Set(friendRows.map(r => r.user_id))];
        const { data: profs } = userIds.length ? await supabase.from("profiles").select("id, name, avatar_url").in("id", userIds) : { data: [] };
        const profById = Object.fromEntries((profs || []).map(p => [p.id, p]));
        // Per vriend alleen de laatste check-in van dit recept.
        const seen = new Set();
        const friends = [];
        friendRows.forEach(r => {
          if (seen.has(r.user_id)) return;
          seen.add(r.user_id);
          friends.push({ entry: checkinRowToEntry(r), userId: r.user_id, name: profById[r.user_id]?.name || "Vriend", avatar: profById[r.user_id]?.avatar_url || null });
        });
        const mineRow = (rows || []).find(r => r.user_id === myId) || null;
        const rated = friends.filter(f => f.entry.rating > 0);
        const avg = rated.length ? rated.reduce((a, f) => a + f.entry.rating, 0) / rated.length : 0;
        const result = { friends, count: friends.length, checkins: friendRows.length, avg, mine: mineRow ? checkinRowToEntry(mineRow) : null };
        friendRecipeCache.set(key, result);
        if (!cancelled) setData(result);
      } catch { /* geen internet: dan tonen we gewoon niets */ }
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}
function formatAvg(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }
function firstNameOf(n) { return (n || "Vriend").split(" ")[0]; }

// Regel bovenaan een recept: "Sem, Lisa en 2 anderen dronken deze · 4,3".
// compact = in het korte receptvenster.
function FriendsRecipeRow({ recipe, allIngredients, onOpenRecipe, onMake, compact = false, style }) {
  const data = useFriendRecipeCheckins(recipe);
  const [open, setOpen] = useState(false);
  if (!data || data.count === 0) return null;
  const names = data.friends.map(f => firstNameOf(f.name));
  const who = data.count <= 2 ? joinNames(names) : `${names.slice(0, 2).join(", ")}`;
  const rest = data.count > 2 ? ` en ${data.count - 2} ${data.count - 2 === 1 ? "ander" : "anderen"}` : "";
  const best = [...data.friends].sort((a, b) => b.entry.rating - a.entry.rating)[0];
  const avatars = (size, ring) => (
    <span style={{ display: "flex", flexShrink: 0 }}>
      {data.friends.slice(0, 3).map((f, i) => (
        <span key={f.userId} style={{ marginLeft: i ? -Math.round(size * 0.3) : 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${ring}`, display: "flex" }}>
          <Avatar name={f.name} photo={f.avatar} size={size} />
        </span>
      ))}
    </span>
  );
  return (
    <div style={style}>
      {compact ? (
        <button onClick={() => setOpen(true)} className="press-scale" style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 14,
          border: "none", background: "rgba(31,61,54,0.07)", cursor: "pointer", fontFamily: sans, color: INK, textAlign: "left",
        }}>
          {avatars(24, PAPER)}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
            <strong>{data.count} {data.count === 1 ? "vriend" : "vrienden"}</strong>{data.avg > 0 ? <> · gemiddeld <strong>{formatAvg(data.avg)}</strong> ★</> : null}
          </span>
          <ChevronRight size={16} color={BOTTLE} />
        </button>
      ) : (
        <>
          <button onClick={() => setOpen(true)} className="press-scale" style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 16,
            border: "none", background: CREAM, boxShadow: SHADOW_CARD, cursor: "pointer", fontFamily: sans, color: INK, textAlign: "left",
          }}>
            {avatars(30, CREAM)}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, lineHeight: 1.35 }}><strong>{who}</strong>{rest} {data.count === 1 ? "dronk" : "dronken"} deze</span>
              {data.avg > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 13, color: MUTED }}>
                  <RatingStars value={data.avg} size={11} /><strong style={{ color: INK }}>{formatAvg(data.avg)}</strong> {data.count === 1 ? "" : "gemiddeld"}
                </span>
              )}
            </span>
            <ChevronRight size={17} color={MUTED} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 2px 0", fontSize: 13, color: MUTED }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: BRASS, flexShrink: 0 }} />
            {data.mine
              ? <span>Jij gaf <strong style={{ color: INK }}>{formatRating(data.mine.rating)}</strong></span>
              : best?.entry.rating > 0 ? <span>Nog niet geproefd · <strong style={{ color: INK }}>{firstNameOf(best.name)} gaf een {formatRating(best.entry.rating)}</strong></span> : <span>Nog niet geproefd</span>}
          </div>
        </>
      )}
      {open && <FriendsRecipeSheet recipe={recipe} data={data} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} onMake={onMake} onClose={() => setOpen(false)} />}
    </div>
  );
}

// Venster: cijfer en post per vriend, met jouw eigen cijfer ernaast.
function FriendsRecipeSheet({ recipe, data, allIngredients, onClose, onMake }) {
  const [viewer, setViewer] = useState(null);
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 200); };
  const matched = recipe;
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div onClick={close} className="sheet-backdrop-in" style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.45)", opacity: closing ? 0 : 1, transition: "opacity 0.2s" }} />
      <div className="sheet-slide-in" style={{
        position: "relative", maxHeight: "82vh", display: "flex", flexDirection: "column", background: PAPER, borderRadius: "22px 22px 0 0",
        transform: closing ? "translateY(100%)" : "none", transition: "transform 0.2s ease-in",
      }}>
        <div style={{ padding: "8px 16px 0", flexShrink: 0 }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: BORDER, margin: "0 auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontFamily: serif, fontSize: 22, fontWeight: 700 }}>Vrienden over deze cocktail</div>
            <button onClick={close} aria-label="Sluiten" style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: CREAM, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={16} /></button>
          </div>
          <div style={{ display: "flex", gap: 10, margin: "12px 0 14px" }}>
            <div style={{ flex: 1, padding: 12, borderRadius: 14, background: BOTTLE_DARK, color: HEADER_TEXT }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: "#DDB877" }}>VRIENDEN</div>
              <span style={{ fontFamily: serif, fontSize: 28, fontWeight: 700 }}>{data.avg > 0 ? formatAvg(data.avg) : "–"}</span>
              <span style={{ fontSize: 12.5, color: "#C9D2CB" }}> · {data.checkins} check-in{data.checkins === 1 ? "" : "s"}</span>
            </div>
            <button onClick={data.mine ? () => setViewer({ entry: data.mine, who: "Jij", avatar: null }) : onMake ? () => { close(); setTimeout(onMake, 220); } : undefined}
              style={{ flex: 1, padding: 12, borderRadius: 14, background: CREAM, border: "none", boxShadow: `inset 0 0 0 1px ${BORDER}`, textAlign: "left", cursor: "pointer", fontFamily: sans, color: INK }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: "var(--brass-text)" }}>JIJ</div>
              {data.mine ? (
                <><span style={{ fontFamily: serif, fontSize: 28, fontWeight: 700 }}>{formatRating(data.mine.rating)}</span><span style={{ fontSize: 12.5, color: MUTED }}> · bekijk</span></>
              ) : (
                <><div style={{ fontFamily: serif, fontSize: 21, fontWeight: 700, color: MUTED }}>Nog niet</div>{onMake && <div style={{ fontSize: 12.5, fontWeight: 700, color: BOTTLE, marginTop: 2 }}>Maak 'm →</div>}</>
              )}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 16px calc(env(safe-area-inset-bottom) + 18px)" }}>
          <div style={{ background: CREAM, borderRadius: 18, boxShadow: SHADOW_CARD, overflow: "hidden" }}>
            {data.friends.map((f, i) => (
              <button key={f.userId} onClick={() => setViewer({ entry: f.entry, who: f.name, avatar: f.avatar })} className="list-row-tap" style={{
                display: "flex", gap: 12, width: "100%", padding: "14px 16px", border: "none", borderTop: i ? `1px solid ${BORDER}` : "none",
                background: "none", cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
              }}>
                <Avatar name={f.name} photo={f.avatar} size={40} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <strong style={{ fontSize: 15 }}>{firstNameOf(f.name)}</strong>
                    <span style={{ fontSize: 12.5, color: MUTED }}>{feedRelTime(f.entry)}</span>
                  </span>
                  <span style={{ display: "block", fontSize: 14, color: f.entry.notes ? INK : MUTED, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.entry.notes || "Geen beschrijving"}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginTop: 5, fontSize: 12.5, fontWeight: 700, color: BOTTLE }}>Bekijk post <ChevronRight size={13} /></span>
                </span>
                <span style={{ textAlign: "right", flexShrink: 0 }}>
                  <span style={{ display: "block", fontFamily: serif, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{formatAvg(f.entry.rating)}</span>
                  <span style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}><RatingStars value={f.entry.rating} size={10} /></span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {viewer && <CheckinPhotoViewer entry={viewer.entry} matched={matched} who={viewer.who} whoAvatar={viewer.avatar} allIngredients={allIngredients} onClose={() => setViewer(null)} />}
    </div>
  ), document.body);
}

// Aantal openstaande vriendschapsverzoeken aan jou (rood bolletje bij het
// vriendenicoon op je profiel). Opnieuw tellen bij wisselen van tab en als
// de app weer op de voorgrond komt.
function useFriendRequestCount(myId, tab) {
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setTick(t => t + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useEffect(() => {
    if (!myId) { setCount(0); return; }
    let cancelled = false;
    supabase.from("friendships").select("id", { count: "exact", head: true })
      .eq("addressee_id", myId).eq("status", "pending")
      .then(({ count: n, error }) => { if (!cancelled && !error) setCount(n || 0); });
    return () => { cancelled = true; };
  }, [myId, tab, tick]);
  return count;
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
function featuredReason(recipe, favoriteFamily, STORIES = {}) {
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
export function usePullToRefresh(onRefresh) {
  const [refreshing, setRefreshing] = useState(false);
  const indicatorRef = useRef(null);
  const drag = useRef({ tracking: false, startY: 0, delta: 0, raf: 0 });
  const MAX_PULL = 74;
  const THRESHOLD = 60;

  const paint = (px, spinning) => {
    if (!indicatorRef.current) return;
    indicatorRef.current.style.height = `${px}px`;
    // De strook zelf blijft vol zichtbaar (op Home is hij groen, dan schemert
    // er nooit beige door); alleen het glaasje fadet in.
    indicatorRef.current.style.opacity = px > 0 ? 1 : 0;
    const icon = indicatorRef.current.querySelector(".ptr-icon");
    if (icon) {
      icon.style.opacity = px > 4 ? Math.min(1, px / 40) : 0;
      icon.style.transform = spinning ? "" : `rotate(${Math.min(220, (px / MAX_PULL) * 220)}deg)`;
    }
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

// ---------- Meldingen in de app (belletje in de groene kop) ----------
// Verzamelt wat er voor jou gebeurd is: proost en reacties op je check-ins
// en je cursusrang, tags, vriendschapsverzoeken en nieuwe rangen van
// vrienden. Werkt zonder pushmeldingen; wat je al gezien hebt onthouden we
// per toestel (Preferences) als lijstje sleutels.
const NOTIF_SEEN_KEY = "thuisbar-meldingen-gezien";
function useNotifications(session, logboek, refreshKey) {
  const myId = session?.user?.id || null;
  const [items, setItems] = useState([]);
  const [seen, setSeen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Preferences.get({ key: NOTIF_SEEN_KEY }).then(({ value }) => {
      try { setSeen(value ? new Set(JSON.parse(value)) : "first"); } catch { setSeen("first"); }
    }).catch(() => setSeen("first"));
  }, []);
  const myCheckinIds = useMemo(() => logboek.slice(0, 60).map(e => e.id), [logboek]);
  const checkinKey = myCheckinIds.join(",");
  useEffect(() => {
    if (!myId) { setItems([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out = [];
      const safe = async (q) => { try { const { data, error } = await q; return error ? [] : (data || []); } catch { return []; } };
      const byId = Object.fromEntries(logboek.map(e => [e.id, e]));
      const [reactions, comments, tags, requests, friendships, myMilestones, blocks] = await Promise.all([
        myCheckinIds.length ? safe(supabase.from("checkin_reactions").select("*").in("checkin_id", myCheckinIds).neq("user_id", myId).limit(100)) : [],
        myCheckinIds.length ? safe(supabase.from("checkin_comments").select("*").in("checkin_id", myCheckinIds).neq("user_id", myId).order("created_at", { ascending: false }).limit(60)) : [],
        safe(supabase.from("checkin_tags").select("*").eq("tagged_user_id", myId).order("created_at", { ascending: false }).limit(30)),
        safe(supabase.from("friendships").select("*").eq("addressee_id", myId).eq("status", "pending")),
        safe(supabase.from("friendships").select("requester_id, addressee_id").eq("status", "accepted").or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)),
        safe(supabase.from("course_milestones").select("*").eq("user_id", myId)),
        safe(supabase.from("blocked_users").select("blocked_id").eq("blocker_id", myId)),
      ]);
      const blocked = new Set(blocks.map(b => b.blocked_id));
      const friendIds = friendships.map(f => f.requester_id === myId ? f.addressee_id : f.requester_id);
      const msIds = myMilestones.map(m => m.id);
      const [friendRanks, msReactions, msComments, taggedCheckins] = await Promise.all([
        friendIds.length ? safe(supabase.from("course_milestones").select("*").in("user_id", friendIds).order("created_at", { ascending: false }).limit(20)) : [],
        msIds.length ? safe(supabase.from("course_milestone_reactions").select("*").in("milestone_id", msIds).neq("user_id", myId)) : [],
        msIds.length ? safe(supabase.from("course_milestone_comments").select("*").in("milestone_id", msIds).neq("user_id", myId)) : [],
        tags.length ? safe(supabase.from("checkins").select("id, name, recipe_id").in("id", tags.map(t => t.checkin_id))) : [],
      ]);
      const msById = Object.fromEntries(myMilestones.map(m => [m.id, m]));
      const tagCk = Object.fromEntries(taggedCheckins.map(c => [c.id, c]));
      const rankName = (id) => COURSE_RANKS.find(r => r.id === id)?.name || id;
      reactions.forEach(r => byId[r.checkin_id] && out.push({ key: `r:${r.checkin_id}:${r.user_id}`, kind: "proost", actor: r.user_id, at: r.created_at || byId[r.checkin_id].createdAt, drink: byId[r.checkin_id].name, recipeId: byId[r.checkin_id].recipeId }));
      comments.forEach(c => byId[c.checkin_id] && out.push({ key: `c:${c.id}`, kind: "reactie", actor: c.user_id, at: c.created_at, drink: byId[c.checkin_id].name, recipeId: byId[c.checkin_id].recipeId, text: c.text }));
      tags.forEach(t => out.push({ key: `t:${t.id}`, kind: "tag", actor: t.tagger_id, at: t.created_at, drink: tagCk[t.checkin_id]?.name || "een cocktail", recipeId: canonicalRecipeId(tagCk[t.checkin_id]?.recipe_id) }));
      requests.forEach(f => out.push({ key: `f:${f.id}`, kind: "verzoek", actor: f.requester_id, at: f.created_at }));
      friendRanks.forEach(m => out.push({ key: `m:${m.id}`, kind: "rang", actor: m.user_id, at: m.created_at, rank: m.rank, rankLabel: rankName(m.rank) }));
      msReactions.forEach(r => msById[r.milestone_id] && out.push({ key: `mr:${r.milestone_id}:${r.user_id}`, kind: "proost-rang", actor: r.user_id, at: r.created_at, rankLabel: rankName(msById[r.milestone_id].rank) }));
      msComments.forEach(c => msById[c.milestone_id] && out.push({ key: `mc:${c.id}`, kind: "reactie-rang", actor: c.user_id, at: c.created_at, rankLabel: rankName(msById[c.milestone_id].rank), text: c.text }));
      const visible = out.filter(n => n.actor && !blocked.has(n.actor));
      const actorIds = [...new Set(visible.map(n => n.actor))];
      const profs = actorIds.length ? await safe(supabase.from("profiles").select("id, name, avatar_url").in("id", actorIds)) : [];
      const pById = Object.fromEntries(profs.map(p => [p.id, p]));
      visible.forEach(n => { n.name = pById[n.actor]?.name || "Een vriend"; n.photo = pById[n.actor]?.avatar_url || null; });
      visible.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      if (!cancelled) { setItems(visible.slice(0, 80)); setLoading(false); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [myId, checkinKey, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eerste keer op dit toestel: alles wat er al was telt als gezien.
  useEffect(() => {
    if (seen === "first" && loaded) {
      const all = items.map(n => n.key);
      setSeen(new Set(all));
      Preferences.set({ key: NOTIF_SEEN_KEY, value: JSON.stringify(all) }).catch(() => {});
    }
  }, [seen, items, loaded]);
  const seenSet = seen instanceof Set ? seen : new Set();
  const unread = seen instanceof Set ? items.filter(n => !seenSet.has(n.key)).length : 0;
  const markAllSeen = () => {
    const all = [...new Set([...items.map(n => n.key), ...seenSet])].slice(-400);
    setSeen(new Set(all));
    Preferences.set({ key: NOTIF_SEEN_KEY, value: JSON.stringify(all) }).catch(() => {});
  };
  return { items, unread, isNew: (n) => seen instanceof Set && !seenSet.has(n.key), markAllSeen, loading };
}

function notificationText(n) {
  const name = <strong>{(n.name || "Een vriend").split(" ")[0]}</strong>;
  const drink = <strong>{n.drink}</strong>;
  const quote = n.text ? <>: &ldquo;{n.text.length > 80 ? `${n.text.slice(0, 79)}…` : n.text}&rdquo;</> : null;
  switch (n.kind) {
    case "proost": return <>{name} proost op je {drink}</>;
    case "reactie": return <>{name} reageerde op je {drink}{quote}</>;
    case "tag": return <>{name} heeft je getagd bij een {drink}</>;
    case "verzoek": return <>{name} wil vrienden met je worden</>;
    case "rang": return n.rank === "meester" ? <>{name} heeft de cursus afgerond en is nu <strong style={masterTextStyle}>Meester</strong></> : <>{name} is nu <strong>{n.rankLabel}</strong> in de cursus</>;
    case "proost-rang": return <>{name} proost op je nieuwe rang <strong>{n.rankLabel}</strong></>;
    case "reactie-rang": return <>{name} reageerde op je rang {n.rankLabel}{quote}</>;
    default: return null;
  }
}

function NotificationsScreen({ notifications, recipes, allIngredients, onClose, onOpenFriends }) {
  useBodyScrollLock();
  const [snapshot] = useState(() => new Set(notifications.items.filter(notifications.isNew).map(n => n.key)));
  useEffect(() => { notifications.markAllSeen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = notifications.items.filter(n => snapshot.has(n.key));
  const older = notifications.items.filter(n => !snapshot.has(n.key));
  const row = (n, isNew) => {
    const recipe = n.recipeId ? recipes.find(r => r.id === canonicalRecipeId(n.recipeId)) : null;
    const onTap = n.kind === "verzoek" ? onOpenFriends : onClose;
    return (
      <button key={n.key} onClick={onTap} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 20px", border: "none", textAlign: "left", cursor: "pointer",
        background: isNew ? "rgba(31,61,54,0.07)" : "none", fontFamily: sans, color: INK,
      }}>
        <Avatar name={n.name} photo={n.photo} size={42} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.4 }}>
          {notificationText(n)}
          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{n.at ? feedRelTime({ createdAt: n.at }) : ""}</span>
        </span>
        {recipe && <span style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} size={44} radius={8} /></span>}
        {isNew && <span aria-label="Nieuw" style={{ width: 8, height: 8, borderRadius: "50%", background: BOTTLE, flexShrink: 0 }} />}
      </button>
    );
  };
  const label = (t) => <div style={{ padding: "18px 20px 8px", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{t}</div>;
  return createPortal((
    <div className="push-slide-in" style={{ position: "fixed", inset: 0, zIndex: 30, background: PAPER, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", fontFamily: sans, color: INK }}>
      <div style={{ position: "sticky", top: 0, zIndex: 2, background: BOTTLE_DARK, borderBottom: `2px solid ${BRASS}` }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 6px) 12px 8px", display: "flex", alignItems: "center", boxSizing: "border-box", minHeight: 52 }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 2, width: 90, minHeight: 44, border: "none", background: "none", color: "#DDB877", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: sans, padding: 0 }}>
            <ChevronLeft size={22} strokeWidth={2.2} /> Home
          </button>
          <span style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 17, color: "#FBF6EA" }}>Meldingen</span>
          <span style={{ width: 90 }} />
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: "calc(env(safe-area-inset-bottom) + 36px)" }}>
        <EdgeSwipeBackArea onBack={onClose}>
          {notifications.items.length === 0 ? (
            <div style={{ padding: "48px 32px", textAlign: "center", color: MUTED, fontSize: 14, lineHeight: 1.5 }}>
              <Bell size={28} color={MUTED} style={{ marginBottom: 10 }} />
              <div>{notifications.loading ? "Meldingen laden…" : "Nog geen meldingen. Als een vriend proost, reageert of je tagt, zie je dat hier."}</div>
            </div>
          ) : (
            <>
              {fresh.length > 0 && <>{label("Nieuw")}{fresh.map(n => row(n, true))}</>}
              {older.length > 0 && <>{label(fresh.length > 0 ? "Eerder" : "Meldingen")}{older.map(n => row(n, false))}</>}
            </>
          )}
        </EdgeSwipeBackArea>
      </div>
    </div>
  ), document.body);
}

// Feed: tijd zoals een app hem toont ("12 min", "3 u", "gisteren 21:10").
const FEED_WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const FEED_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function feedDate(entry) {
  const d = new Date(entry.createdAt || entry.date);
  return isNaN(d.getTime()) ? null : d;
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function feedRelTime(entry) {
  const d = feedDate(entry);
  if (!d) return entry.date || "";
  const hasTime = !!entry.createdAt;
  const now = new Date();
  const mins = Math.round((now - d) / 60000);
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (hasTime && mins >= 0 && mins < 60) return mins <= 1 ? "zojuist" : `${mins} min`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) return hasTime ? `${Math.round(mins / 60)} u` : "vandaag";
  if (days === 1) return hasTime ? `gisteren ${hhmm}` : "gisteren";
  if (days < 7) return hasTime ? `${FEED_WEEKDAYS[d.getDay()]} ${hhmm}` : FEED_WEEKDAYS[d.getDay()];
  return `${d.getDate()} ${FEED_MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}
function feedDayLabel(entry) {
  const d = feedDate(entry);
  if (!d) return "Eerder";
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return "Vandaag";
  if (days === 1) return "Gisteren";
  if (days < 7) return "Deze week";
  return "Eerder";
}

// Vijf kleine sterren met halve ster (4,5 = vier en een half).
function RatingStars({ value, size = 11 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span style={{ display: "inline-flex", gap: 1 }} aria-hidden>
      {[0, 1, 2, 3, 4].map(i => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
            <Star size={size} color={BRASS} strokeWidth={1.8} style={{ position: "absolute", left: 0, top: 0, display: "block" }} />
            {fill > 0 && (
              <span style={{ position: "absolute", left: 0, top: 0, height: size, width: `${fill * 100}%`, overflow: "hidden" }}>
                <Star size={size} color={BRASS} fill={BRASS} strokeWidth={1.8} style={{ display: "block" }} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Cijfer zoals op een menukaart: groot in de sierletter, "/ 5" en sterren.
function FeedScore({ value }) {
  return (
    <span style={{ textAlign: "right", flexShrink: 0 }} aria-label={`${formatRating(value)} van 5`}>
      <span style={{ fontFamily: serif, fontSize: 32, fontWeight: 700, lineHeight: 1, color: INK }}>{(Math.round((Number(value) || 0) * 10) / 10).toFixed(1).replace(".", ",")}</span>
      <span style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}> / 5</span>
      <span style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}><RatingStars value={value} size={11} /></span>
    </span>
  );
}

const NO_IDS = [];
// Home voor gasten: in plaats van de feed van vrienden een kaart die laat
// zien wat inchecken is, en — zodra er check-ins zijn — dat die nu alleen op
// deze telefoon staan. Vanaf drie check-ins wat nadrukkelijker.
function GuestFeedCard({ count, onCheckin, onRequireAccount }) {
  if (count === 0) return (
    <div style={{ background: CREAM, borderRadius: 18, boxShadow: SHADOW_CARD, padding: 18, margin: "18px 0 6px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: BRASS_TEXT }}>Jouw feed</div>
      <div style={{ fontFamily: serif, fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 4 }}>Check je eerste cocktail in</div>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: MUTED, lineHeight: 1.5 }}>Geef een cijfer, schrijf wat je proefde en verzamel stempels. Kan meteen, zonder account.</p>
      <button onClick={onCheckin} className="press-scale" style={{ width: "100%", minHeight: 46, marginTop: 14, borderRadius: 12, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={17} strokeWidth={2.6} /> Inchecken
      </button>
      <button onClick={() => onRequireAccount?.("vrienden")} style={{ width: "100%", minHeight: 40, marginTop: 6, border: "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
        Met vrienden? Maak een gratis account
      </button>
    </div>
  );
  const strong = count >= 3;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: strong ? BOTTLE_DARK : CREAM, color: strong ? HEADER_TEXT : INK, borderRadius: 16, boxShadow: SHADOW_CARD, padding: "13px 14px", margin: "18px 0 4px" }}>
      <ShieldCheck size={22} color={strong ? "#DDB877" : BOTTLE} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{strong ? `Bewaar je ${count} check-ins` : "Je check-ins staan alleen op deze telefoon"}</div>
        <div style={{ fontSize: 12.5, color: strong ? "#C9D2CB" : MUTED, marginTop: 2, lineHeight: 1.4 }}>Met een gratis account staan ze veilig en kun je ze met vrienden delen.</div>
      </div>
      <button onClick={() => onRequireAccount?.("bewaren")} className="press-scale" style={{ flexShrink: 0, minHeight: 36, padding: "0 13px", borderRadius: 100, border: "none", background: strong ? "#DDB877" : BOTTLE, color: strong ? "#132622" : CREAM, fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Bewaren</button>
    </div>
  );
}

// "Voor jou": eerst wat gelijkgestemde gebruikers hoog gaven (idee 1), dan
// wat bij je eigen smaak past (idee 5), en voor nieuwe gebruikers wat nu
// populair is. Alleen recepten die je nog niet hebt ingecheckt.
function useForYou(session, logboek, recipes, allIngredients, active) {
  const [server, setServer] = useState({ similar: [], popular: [] });
  const uid = session?.user?.id;
  const checkinCount = logboek.length;
  useEffect(() => {
    if (!uid || !active) return;
    let cancelled = false;
    fetchRecommendations().then(res => { if (!cancelled) setServer(res); });
    return () => { cancelled = true; };
  }, [uid, active, checkinCount]);
  return useMemo(() => {
    const tried = new Set(logboek.map(e => findRecipeFor(e, recipes)?.id).filter(Boolean));
    const byId = new Map(recipes.map(r => [r.id, r]));
    const out = [];
    const seen = new Set();
    const add = (recipe, reason, kind) => {
      if (!recipe || seen.has(recipe.id) || tried.has(recipe.id)) return;
      seen.add(recipe.id); out.push({ recipe, reason, kind });
    };
    for (const s of server.similar) {
      const because = byId.get(canonicalRecipeId(s.omdat));
      add(byId.get(canonicalRecipeId(s.recipe_id)), because ? `Wie de ${because.name} lekker vond, vond deze ook top` : "Gelijkgestemden vonden deze top", "samen");
    }
    for (const m of tasteMatches(logboek, recipes, allIngredients, 6)) add(m.recipe, m.reason, "smaak");
    for (const p of server.popular) add(byId.get(canonicalRecipeId(p.recipe_id)), `Populair: ${p.mensen} mensen checkten hem in`, "populair");
    return out.slice(0, 8);
  }, [server, logboek, recipes, allIngredients]);
}


function AiConsentSheet({ onAccept, onClose }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const row = (ok, text) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.4 }}>
      {ok ? <Check size={17} strokeWidth={2.6} color={SAGE} style={{ flexShrink: 0, marginTop: 1 }} /> : <X size={17} strokeWidth={2.6} color={BURGUNDY} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{text}</span>
    </div>
  );
  const kop = (text, color) => <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color }}>{text}</div>;
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0",
        boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", padding: "0 22px calc(env(safe-area-inset-bottom) + 18px)", maxHeight: "92dvh", overflowY: "auto",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ touchAction: "none", paddingTop: 6 }}>
          <span style={{ width: 52, height: 52, borderRadius: "50%", background: BOTTLE_DARK, color: BRASS, display: "flex", alignItems: "center", justifyContent: "center" }}><Martini size={24} strokeWidth={1.8} /></span>
          <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 14, color: BOTTLE }}>Even vooraf over de bartender</div>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, color: MUTED, lineHeight: 1.5 }}>De bartender en het scannen van flessen werken met Claude, een AI-dienst van Anthropic. Daarvoor sturen we een paar dingen mee.</p>
        </div>
        <div style={{ background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD, margin: "16px 0 0", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
          {kop("Wel mee", SAGE)}
          {row(true, "Je vraag en de foto die je scant")}
          {row(true, "Je smaak: welke cocktails je hoog of laag beoordeelde")}
          {row(true, "Welke flessen je hebt, als je dat kiest")}
          <div style={{ height: 1, background: BORDER, margin: "3px 0" }} />
          {kop("Niet mee", BURGUNDY)}
          {row(false, "Je naam, e-mail of vrienden")}
          {row(false, "Notities, plekken en foto's van je check-ins")}
          {row(false, "Vragen en scanfoto's worden niet bewaard")}
        </div>
        <button onClick={() => Browser.open({ url: `${PUBLIC_WEB_URL}/privacy` })} style={{ marginTop: 12, minHeight: 40, padding: 0, border: "none", background: "none", color: BRASS_TEXT, fontFamily: sans, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Lees het privacybeleid
        </button>
        <button onClick={onAccept} className="press-scale" style={{
          width: "100%", minHeight: 50, marginTop: 8, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT,
          fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}>Akkoord</button>
        <button onClick={close} style={{ width: "100%", minHeight: 44, marginTop: 4, border: "none", background: "none", color: MUTED, fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>Niet nu</button>
        <div style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 2 }}>Je kunt dit later uitzetten in Profiel → Instellingen.</div>
      </div>
    </div>
  ), document.body);
}


function ForYouStrip({ items, allIngredients, onOpenRecipe }) {
  return (
    <div style={{ margin: "16px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: BOTTLE }}>Voor jou</span>
        <span style={{ fontSize: 11.5, color: MUTED }}>wordt slimmer met elke check-in</span>
      </div>
      <div className="no-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -20px", padding: "2px 20px 8px", WebkitOverflowScrolling: "touch" }}>
        {items.map(({ recipe, reason }) => (
          <button key={recipe.id} onClick={() => onOpenRecipe(recipe.id)} className="press-scale" style={{
            flex: "0 0 auto", width: 150, display: "flex", flexDirection: "column", textAlign: "left", padding: 0, border: "none", borderRadius: 16, overflow: "hidden",
            background: CREAM, boxShadow: "0 1px 2px rgba(43,38,32,0.06), 0 6px 16px -8px rgba(43,38,32,0.18)", cursor: "pointer", fontFamily: sans, color: INK,
          }}>
            <span style={{ display: "block", width: 150, height: 112, overflow: "hidden" }}>
              <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={150} radius={0} />
            </span>
            <span style={{ display: "block", padding: "8px 10px 10px" }}>
              <span style={{ display: "block", fontFamily: serif, fontSize: 15.5, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{recipe.name}</span>
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 11.5, color: MUTED, lineHeight: 1.3, marginTop: 3 }}>{reason}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HomeTab({ onOpenBartender, session, profile, greeting, featuredRecipe, favoriteFamily, logboek, recipes, allIngredients, onOpenRecipe, onOpenCheckin, onSound, onReloadLogboek, homeTapTick, active, courseRank, nativePush, highlightId, guest = false, onRequireAccount, onOpenOwnProfile }) {
  const recipeTextsHome = useRecipeTexts();
  const [pushPromptHidden, setPushPromptHidden] = useStorage("thuisbar-push-prompt-weg", false);
  const [photoViewer, setPhotoViewer] = useState(null);
  const myId = session?.user?.id;
  const forYou = useForYou(session, logboek, recipes, allIngredients, active);
  const { feed: friendFeed, milestones, friendProfiles, reload: reloadFriendFeed } = useFriendsFeed(session, active);
  const combinedFeed = useMemo(() => {
    const mine = logboek.map(e => ({ ...e, mine: true }));
    const theirs = friendFeed.map(e => ({ ...e, mine: false }));
    return [...mine, ...theirs, ...milestones].sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()).slice(0, 20);
  }, [logboek, friendFeed, milestones]);
  // Vriendenrij bovenaan: wie vandaag incheckte eerst (met gouden ring).
  const friendRow = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const today = new Set(friendFeed.filter(e => { const d = feedDate(e); return d && d >= todayStart; }).map(e => e.friendId));
    return Object.entries(friendProfiles || {}).map(([id, p]) => {
      const name = p?.name || "Vriend";
      return { id, name, first: name.split(" ")[0], photo: p?.avatar_url, today: today.has(id) };
    }).sort((a, b) => (b.today - a.today) || a.name.localeCompare(b.name));
  }, [friendFeed, friendProfiles]);
  const [menuFor, setMenuFor] = useState(null);
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
    supabase.from("course_milestone_comments").select("milestone_id").in("milestone_id", milestoneIds).then(({ data, error }) => {
      if (cancelled || error) return;
      const counts = {};
      (data || []).forEach(c => { counts[c.milestone_id] = (counts[c.milestone_id] || 0) + 1; });
      setRankCommentCounts(counts);
    });
    return () => { cancelled = true; };
  }, [myId, milestoneKey, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rankComments, setRankComments] = useState({});
  const [rankCommentCounts, setRankCommentCounts] = useState({});
  const [openRankComments, setOpenRankComments] = useState(null);
  const toggleRankComments = async (milestoneId) => {
    if (openRankComments === milestoneId) { setOpenRankComments(null); return; }
    setOpenRankComments(milestoneId);
    setOpenComments(null);
    setCommentDraft("");
    if (!rankComments[milestoneId]) {
      const { data } = await supabase.from("course_milestone_comments").select("*").eq("milestone_id", milestoneId).order("created_at", { ascending: true });
      setRankComments(c => ({ ...c, [milestoneId]: data || [] }));
    }
  };
  const postRankComment = async (milestoneId) => {
    const text = commentDraft.trim();
    if (!text || postingComment || !myId) return;
    setPostingComment(true);
    const { data, error } = await supabase.from("course_milestone_comments").insert({ milestone_id: milestoneId, user_id: myId, text }).select().single();
    setPostingComment(false);
    if (error) return;
    onSound("pop");
    setRankComments(c => ({ ...c, [milestoneId]: [...(c[milestoneId] || []), data] }));
    setRankCommentCounts(c => ({ ...c, [milestoneId]: (c[milestoneId] || 0) + 1 }));
    setCommentDraft("");
  };
  const deleteRankComment = async (milestoneId, commentId) => {
    setRankComments(c => ({ ...c, [milestoneId]: (c[milestoneId] || []).filter(x => x.id !== commentId) }));
    setRankCommentCounts(c => ({ ...c, [milestoneId]: Math.max(0, (c[milestoneId] || 1) - 1) }));
    await supabase.from("course_milestone_comments").delete().eq("id", commentId).eq("user_id", myId);
  };
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
  const checkinTags = useCheckinTags(guest ? NO_IDS : feedIds, active, knownProfiles, logboek.length);
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
  const findMatch = (entry) => entry.recipeId ? recipes.find(r => r.id === canonicalRecipeId(entry.recipeId)) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());

  const commenterName = (uid) => (uid === myId ? (profile?.name || "Jij") : (friendProfiles[uid]?.name || "Vriend"));
  const commenterPhoto = (uid) => (uid === myId ? profile?.avatar_url : friendProfiles[uid]?.avatar_url);
  const commenterIsMaster = (uid) => (uid === myId ? !!courseRank?.master : profileCourseRank(friendProfiles[uid]).master);

  const toggleComments = async (checkinId) => {
    if (openComments === checkinId) { setOpenComments(null); return; }
    setOpenComments(checkinId);
    setOpenRankComments(null);
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

  // Eén feed-item: rangmoment (compacte regel) of check-in (post C:
  // proefnotitie met cijfer zoals op een menukaart).
  const renderFeedItem = (entry) => {
    if (entry.kind === "rank") {
      const who = entry.mine ? (profile?.name || "Jij") : (friendProfiles[entry.friendId]?.name || "Vriend");
      const rankDef = COURSE_RANKS.find(r => r.id === entry.rankId);
      if (!rankDef) return null;
      const isMaster = entry.rankId === "meester";
      const cheer = rankCheers[entry.id] || { count: 0, mine: false };
      const first = who.split(" ")[0];
      return (
        <div style={{ marginBottom: 14, borderRadius: 16, background: CREAM, overflow: "hidden", position: "relative", boxShadow: isMaster ? "0 0 0 1px rgba(184,134,46,0.55)" : "0 1px 2px rgba(43,38,32,0.06)" }}>
          {isMaster && <div aria-hidden style={{ height: 3, background: MASTER_GOLD }} />}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 12px 12px 14px" }}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: isMaster ? MASTER_GOLD : BOTTLE_DARK, color: isMaster ? "#132622" : "#DDB877", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <GraduationCap size={19} strokeWidth={1.9} />
            </span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.35, color: INK }}>
              {entry.mine ? <strong>{first}</strong> : (
                <button onClick={() => setOpenFriendId(entry.friendId)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 14, color: INK, fontFamily: sans }}>{first}</button>
              )}{isMaster ? <> heeft het diploma: <strong style={masterTextStyle}>Meester</strong></> : <> is nu <strong>{rankDef.name}</strong> in de cursus</>}
              <div style={{ fontSize: 12, color: MUTED }}>{feedRelTime(entry)}</div>
            </div>
            <button onClick={() => toggleRankComments(entry.id)} aria-label="Reageren" className="press-scale" style={{
              display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", cursor: "pointer", color: openRankComments === entry.id ? BOTTLE : MUTED,
              fontSize: 12.5, fontWeight: 700, padding: "6px 4px", fontFamily: sans,
            }}>
              <MessageCircle size={17} />{rankCommentCounts[entry.id] > 0 ? rankCommentCounts[entry.id] : ""}
            </button>
            <button onClick={() => toggleRankCheer(entry.id)} className="press-scale" style={{
              display: "flex", alignItems: "center", gap: 5, border: "none", cursor: "pointer", borderRadius: 100, padding: "7px 12px",
              background: cheer.mine ? "rgba(184,134,46,0.18)" : BOTTLE_DARK, color: cheer.mine ? "var(--brass-text)" : "#FBF6EA",
              fontSize: 12.5, fontWeight: 700, fontFamily: sans, flexShrink: 0,
            }}>
              <Wine size={14} />{cheer.count > 0 ? ` ${cheer.count}` : ""} Proost
            </button>
          </div>
          <div style={{ padding: "0 14px" }}>
                  {openRankComments === entry.id && (
                    <div style={{ borderTop: `1px dashed ${BORDER}`, margin: "0 14px 12px", paddingTop: 10 }}>
                      {(rankComments[entry.id] || []).map(c => (
                        <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                          <Avatar name={commenterName(c.user_id)} photo={commenterPhoto(c.user_id)} size={24} />
                          <div style={{ flex: 1, minWidth: 0, background: PAPER_DEEP, borderRadius: 12, padding: "6px 10px" }}>
                            <span style={{ fontWeight: 700, fontSize: 12, ...(commenterIsMaster(c.user_id) ? masterTextStyle : {}) }}>{commenterName(c.user_id)}</span>{commenterIsMaster(c.user_id) && <span style={{ display: "inline-flex", verticalAlign: "-2px", marginLeft: 3 }}><MasterSeal size={12} border={1} /></span>}{" "}
                            <span style={{ fontSize: 12.5, color: INK }}>{c.text}</span>
                          </div>
                          {c.user_id === myId && (
                            <button onClick={() => deleteRankComment(entry.id, c.id)} aria-label="Reactie verwijderen" style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, flexShrink: 0 }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      {(rankComments[entry.id] || []).length === 0 && (
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{entry.mine ? "Nog geen reacties." : `Nog geen reacties. Feliciteer ${who.split(" ")[0]}!`}</div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input value={commentDraft} onChange={e => setCommentDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") postRankComment(entry.id); }}
                          placeholder="Schrijf een reactie…" maxLength={500}
                          style={{ flex: 1, border: `1px solid ${BORDER}`, borderRadius: 100, padding: "8px 14px", fontSize: 16, fontFamily: sans, background: PAPER, color: INK }} />
                        <button onClick={() => postRankComment(entry.id)} disabled={!commentDraft.trim() || postingComment} aria-label="Versturen" style={{
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
    }
    const matched = findMatch(entry);
    const tint = matched ? recipeTint(matched, allIngredients) : [PAPER_DEEP, BORDER];
    const who = entry.mine ? (profile?.name || "Jij") : (friendProfiles[entry.friendId]?.name || "Vriend");
    const whoAvatar = entry.mine ? profile?.avatar_url : friendProfiles[entry.friendId]?.avatar_url;
    // Naam/foto van de schrijver: jijzelf → je profiel, een vriend → diens profiel.
    const openAuthor = () => (entry.mine ? onOpenOwnProfile?.() : setOpenFriendId(entry.friendId));
    const photo = entry.photo || (matched && (localItemImageUrl("cocktail", matched.id) || matched.image)) || null;
    const cheer = reactions[entry.id] || { count: 0, mine: false };
    const master = rankOf(entry)?.master;
    const withNames = checkinTags[entry.id]?.length > 0 ? `met ${joinNames(checkinTags[entry.id].map(t => t.id === myId ? "jou" : (t.name || "een vriend").split(" ")[0]))} · ` : "";
    // Jij bent getagd in deze post van een vriend: overnemen, of al overgenomen.
    const myTag = !entry.mine && !guest && myId ? (checkinTags[entry.id] || []).find(t => t.id === myId && t.tagId) : null;
    const myAdopted = myTag?.adoptedCheckinId != null ? logboek.find(e => String(e.id) === String(myTag.adoptedCheckinId)) || null : null;
    const adopt = myTag ? {
      adopted: myTag.adoptedCheckinId != null,
      myRating: myAdopted?.rating || null,
      onAdopt: () => onOpenCheckin(adoptCheckinRequest(entry, { id: myTag.tagId, tagger_id: myTag.taggerId }, who)),
      onView: myAdopted ? () => setPhotoViewer({ entry: myAdopted, matched: findMatch(myAdopted), who: profile?.name || "Jij", whoAvatar: profile?.avatar_url }) : null,
    } : null;
    const nComments = commentCounts[entry.id] || 0;
    return (
      <div style={{ marginBottom: 16, borderRadius: 20, background: CREAM, padding: master ? "15px 12px 12px" : 12, boxShadow: master ? "0 0 0 1px rgba(184,134,46,0.55), 0 8px 22px -12px rgba(43,38,32,0.3)" : "0 1px 2px rgba(43,38,32,0.08), 0 8px 22px -12px rgba(43,38,32,0.3)", position: "relative", overflow: "hidden" }}>
        {master && <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: MASTER_GOLD }} />}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 2px 10px" }}>
          {/* Samen gedronken: de getagde vriend(en) schuiven als kleine
              avatar half over die van de schrijver heen. */}
          <span style={{ position: "relative", flexShrink: 0, marginRight: (checkinTags[entry.id]?.length || 0) > 0 ? 8 : 0 }}>
            <button onClick={openAuthor} aria-label={`Profiel van ${who}`} style={{ display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%" }}>
              <RankAvatar name={who} photo={whoAvatar} size={36} courseRank={rankOf(entry)} />
            </button>
            {(checkinTags[entry.id] || []).slice(0, 2).map((t, i) => (
              <span key={t.id} style={{ position: "absolute", right: -10 - i * 12, bottom: -4, borderRadius: "50%", boxShadow: `0 0 0 2px ${CREAM}`, display: "flex" }}>
                <Avatar name={t.name} photo={t.photo} size={20} />
              </span>
            ))}
          </span>
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25, marginLeft: Math.max(0, ((checkinTags[entry.id]?.length || 0) - 1)) * 12 }}>
            <div style={{ fontSize: 14, color: INK, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <button onClick={openAuthor} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 14, color: INK, fontFamily: sans }}>
                <span style={master ? masterTextStyle : undefined}>{who}</span>
              </button>
              {rankOf(entry)?.rank && <CourseRankLabel courseRank={rankOf(entry)} />}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{withNames}{entry.location} · {feedRelTime(entry)}</div>
          </div>
          {!entry.mine && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setMenuFor(menuFor === entry.id ? null : entry.id)} aria-label="Meer" style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MoreHorizontal size={20} />
              </button>
              {menuFor === entry.id && (
                <>
                {/* Tik ergens anders op het scherm = menu dicht. */}
                <div onClick={() => setMenuFor(null)} onTouchStart={() => setMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
                <div style={{ position: "absolute", right: 0, top: 36, zIndex: 5, background: CREAM, borderRadius: 12, boxShadow: "0 8px 24px rgba(43,38,32,0.22)", border: `1px solid ${BORDER}`, overflow: "hidden", minWidth: 190 }}>
                  <button onClick={() => { setMenuFor(null); setOpenFriendId(entry.friendId); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: INK, fontFamily: sans, textAlign: "left" }}>
                    <User size={15} /> Profiel bekijken
                  </button>
                  <button onClick={() => { setMenuFor(null); reportCheckin(entry.id); }} disabled={reportedIds.has(entry.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 14px", border: "none", borderTop: `1px solid ${BORDER}`, background: "none", cursor: reportedIds.has(entry.id) ? "default" : "pointer", fontSize: 14, color: reportedIds.has(entry.id) ? SAGE : BURGUNDY, fontFamily: sans, textAlign: "left" }}>
                    {reportedIds.has(entry.id) ? <><Check size={15} /> Gemeld</> : <><Flag size={15} /> Meld deze check-in</>}
                  </button>
                </div>
                </>
              )}
            </div>
          )}
        </div>

        <div onClick={photo ? () => setPhotoViewer({ entry, matched, who, whoAvatar, onOpenProfile: openAuthor, adopt }) : undefined}
          style={{ position: "relative", width: "100%", aspectRatio: "8 / 7", borderRadius: 14, overflow: "hidden", cursor: photo ? "zoom-in" : undefined, background: BOTTLE_DARK }}>
          {photo ? (
            <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {matched ? (
                <GlassArt glass={matched.glass} colors={tint} garnishes={inferGarnishes(matched, allIngredients)} rim={inferRim(matched, allIngredients)} foam={inferFoam(matched, allIngredients)} iceStyle={inferIceStyle(matched)} size={120} />
              ) : (
                <Martini size={44} color="rgba(251,246,234,0.85)" strokeWidth={1.3} />
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 4px 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Naam van de cocktail: tik = naar het recept. */}
            {matched ? (
              <button onClick={() => onOpenRecipe(matched.id)} style={{ display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: INK }}>
                <span style={{ display: "inline", fontFamily: serif, fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>{entry.name}</span>
                <ChevronRight size={18} color={MUTED} style={{ verticalAlign: "-2px", marginLeft: 2 }} />
              </button>
            ) : (
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, lineHeight: 1.1, color: INK }}>{entry.name}</div>
            )}
            {matched && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{matched.family} · {matched.glass}</div>}
          </div>
          <FeedScore value={entry.rating} />
        </div>
        {entry.notes && (
          <p style={{ margin: "10px 4px 0", paddingTop: 11, borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 15, lineHeight: 1.5, color: INK, whiteSpace: "pre-wrap" }}>{entry.notes}</p>
        )}
        {entry.tasteTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 4px 0" }}>
            {entry.tasteTags.map(k => CHECKIN_TASTE_META[k] && (
              <span key={k} style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 100, background: "rgba(31,61,54,0.08)", color: BOTTLE }}>
                {CHECKIN_TASTE_META[k].label}
              </span>
            ))}
          </div>
        )}
        {adopt && <TagAdoptStrip {...adopt} style={{ margin: "12px 0 0" }} />}
        {guest ? (
          <button onClick={() => onRequireAccount?.("bewaren")} style={{ display: "flex", alignItems: "center", gap: 7, width: "calc(100% - 8px)", margin: "12px 4px 2px", padding: "10px 0 2px", border: "none", borderTop: `1px solid ${BORDER}`, background: "none", cursor: "pointer", fontFamily: sans, fontSize: 12.5, color: MUTED, textAlign: "left" }}>
            <Lock size={13} style={{ flexShrink: 0 }} /> Alleen op deze telefoon · <span style={{ color: BOTTLE, fontWeight: 700 }}>Bewaar en deel met een account</span>
          </button>
        ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 18, margin: "12px 4px 2px", paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => toggleCheer(entry.id)} className="press-scale" style={{
            display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", padding: "4px 0", cursor: "pointer",
            color: cheer.mine ? "var(--brass-text)" : INK, fontSize: 13.5, fontWeight: 700, fontFamily: sans,
          }}>
            <Wine size={19} color={cheer.mine ? BRASS : INK} fill={cheer.mine ? "rgba(184,134,46,0.25)" : "none"} /> Proost{cheer.count > 0 ? ` · ${cheer.count}` : ""}
          </button>
          <button onClick={() => toggleComments(entry.id)} className="press-scale" style={{
            display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", padding: "4px 0", cursor: "pointer",
            color: openComments === entry.id ? BOTTLE : INK, fontSize: 13.5, fontWeight: 700, fontFamily: sans,
          }}>
            <MessageCircle size={18} /> {nComments > 0 ? `${nComments} ${nComments === 1 ? "reactie" : "reacties"}` : "Reageren"}
          </button>
        </div>
        )}
        <div style={{ padding: "0 4px" }}>
                  {openComments === entry.id && (
                    <div style={{ borderTop: `1px dashed ${BORDER}`, marginTop: 10, paddingTop: 10 }}>
                      {(commentsByCheckin[entry.id] || []).map(c => (
                        <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                          <Avatar name={commenterName(c.user_id)} photo={commenterPhoto(c.user_id)} size={24} />
                          <div style={{ flex: 1, minWidth: 0, background: PAPER_DEEP, borderRadius: 12, padding: "6px 10px" }}>
                            <span style={{ fontWeight: 700, fontSize: 12, ...(commenterIsMaster(c.user_id) ? masterTextStyle : {}) }}>{commenterName(c.user_id)}</span>{commenterIsMaster(c.user_id) && <span style={{ display: "inline-flex", verticalAlign: "-2px", marginLeft: 3 }}><MasterSeal size={12} border={1} /></span>}{" "}
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
  };

  return (
    <div {...pullHandlers} style={{ touchAction: "pan-y" }}>
      {/* Verversen: een groene strook die naadloos tussen de kop en de
          vriendenrij openschuift, met een gouden glaasje dat meedraait. */}
      <div ref={indicatorRef} aria-hidden style={{
        height: 0, opacity: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 -20px", background: BOTTLE_DARK, color: "#DDB877",
      }}>
        <span className={`ptr-icon${refreshing ? " spin-icon" : ""}`} style={{ display: "flex", transition: "transform 0.1s linear, opacity 0.1s linear" }}>
          <Martini size={20} strokeWidth={1.8} />
        </span>
      </div>
      {/* Vriendenrij op het groen van de kop: wie vandaag incheckte heeft
          een gouden ring; "Jij" met plusje om zelf in te checken. */}
      <div style={{ margin: "0 -20px", background: BOTTLE_DARK, borderBottom: `2px solid ${BRASS}` }}>
        <div className="no-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "4px 16px 14px", WebkitOverflowScrolling: "touch" }}>
          <button onClick={() => onOpenCheckin()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 62, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans }}>
            <span style={{ position: "relative" }}>
              <span style={{ display: "block", borderRadius: "50%", boxShadow: `0 0 0 2px ${BOTTLE_DARK}, 0 0 0 4px rgba(251,246,234,0.18)` }}><Avatar name={profile?.name || "Jij"} photo={profile?.avatar_url} size={56} /></span>
              <span style={{ position: "absolute", right: -3, bottom: -3, width: 22, height: 22, borderRadius: "50%", background: "#B8862E", border: `2px solid ${BOTTLE_DARK}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#132622" }}><Plus size={12} strokeWidth={3.2} /></span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#FBF6EA" }}>Jij</span>
          </button>
          {friendRow.map(f => (
            <button key={f.id} onClick={() => setOpenFriendId(f.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 62, flexShrink: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans }}>
              <span style={{ display: "block", borderRadius: "50%", boxShadow: `0 0 0 2px ${BOTTLE_DARK}, 0 0 0 ${f.today ? 5 : 4}px ${f.today ? "#C8963A" : "rgba(251,246,234,0.18)"}` }}><Avatar name={f.name} photo={f.photo} size={56} /></span>
              <span style={{ fontSize: 12, fontWeight: f.today ? 700 : 500, color: f.today ? "#FBF6EA" : "#A9B8B0", maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.first}</span>
            </button>
          ))}
          {friendRow.length === 0 && (guest ? (
            <button onClick={() => onRequireAccount?.("vrienden")} style={{ alignSelf: "center", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: "0 0 0 4px", cursor: "pointer", textAlign: "left", fontFamily: sans }}>
              <span style={{ width: 56, height: 56, borderRadius: "50%", border: "1.5px dashed rgba(251,246,234,0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#DDB877", flexShrink: 0, marginTop: -18 }}><UserPlus size={20} /></span>
              <span style={{ fontSize: 12.5, color: "#C9D2CB", lineHeight: 1.4 }}>Met een gratis account zie je hier wat je vrienden drinken. <span style={{ color: "#DDB877", fontWeight: 700 }}>Account maken</span></span>
            </button>
          ) : (
            <div style={{ alignSelf: "center", fontSize: 12.5, color: "#A9B8B0", lineHeight: 1.4, paddingLeft: 4 }}>Voeg vrienden toe via Profiel; hier zie je wie er vandaag iets drinkt.</div>
          ))}
        </div>
      </div>

      {forYou.length >= 2 ? (
        <ForYouStrip items={forYou} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} />
      ) : featuredRecipe && (
        <button onClick={() => onOpenRecipe(featuredRecipe.id)} className="press-scale" style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", margin: "14px 0 0", padding: 10,
          borderRadius: 16, border: "none", background: CREAM, boxShadow: "0 1px 2px rgba(43,38,32,0.06), 0 6px 16px -8px rgba(43,38,32,0.18)",
          cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
        }}>
          <span style={{ width: 52, height: 52, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
            <RecipeCircle recipe={featuredRecipe} allIngredients={allIngredients} size={52} radius={12} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: BOTTLE }}>Voor jou vandaag</span>
            <span style={{ display: "block", fontFamily: serif, fontSize: 17, fontWeight: 700, marginTop: 1 }}>{featuredRecipe.name}</span>
            <span style={{ display: "block", fontSize: 12.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{featuredReason(featuredRecipe, favoriteFamily, recipeTextsHome.STORIES)}</span>
          </span>
          <ChevronRight size={18} color={MUTED} style={{ flexShrink: 0 }} />
        </button>
      )}

      {onOpenBartender && (
        <button onClick={onOpenBartender} className="press-scale" style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", margin: "12px 0 0", padding: "12px 14px",
          borderRadius: 16, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, cursor: "pointer", textAlign: "left", fontFamily: sans,
        }}>
          <span style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(245,239,230,0.12)", color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MessageCircle size={19} strokeWidth={1.8} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>Vraag de bartender</span>
            <span style={{ display: "block", fontSize: 12.5, color: "#C9D2CB", marginTop: 1 }}>Wat kan ik maken met wat ik in huis heb?</span>
          </span>
          <ChevronRight size={18} color={HEADER_TEXT} style={{ opacity: 0.7, flexShrink: 0 }} />
        </button>
      )}

      {photoViewer && <CheckinPhotoViewer {...photoViewer} allIngredients={allIngredients} onClose={() => setPhotoViewer(null)} onOpenRecipe={onOpenRecipe} />}
      {tagInbox.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {tagInbox.items.map(({ tag, entry, tagger }) => {
            const taggerName = tagger?.name || "Een vriend";
            return (
              <div key={tag.id} style={{ background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 16, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={taggerName} photo={tagger?.avatar_url} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, lineHeight: 1.35 }}><strong>{taggerName}</strong> heeft je getagd bij <span style={{ fontFamily: serif, fontWeight: 700 }}>{entry.name}</span></div>
                    <div style={{ fontSize: 12, color: "#C9D2CB", marginTop: 2 }}>{entry.location} · {entry.date}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => onOpenCheckin(adoptCheckinRequest(entry, tag, taggerName))} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "none", background: HEADER_TEXT, color: "#132622", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>
                    Overnemen
                  </button>
                  <button onClick={() => tagInbox.dismiss(tag.id)} style={{ minHeight: 42, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(251,246,234,0.25)", background: "none", color: ON_DARK_TEXT, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: sans }}>
                    Niet nu
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {guest && <GuestFeedCard count={logboek.length} onCheckin={() => onOpenCheckin()} onRequireAccount={onRequireAccount} />}

      {!guest && nativePush?.supported && nativePush.permission === "prompt" && !pushPromptHidden && (
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: 14, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(184,134,46,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bell size={17} color={BRASS} strokeWidth={2} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>Meldingen aanzetten?</div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.45, marginTop: 2 }}>Dan hoor je het als een vriend je tagt, op je check-in proost of reageert. Per soort aan of uit te zetten in Instellingen.</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={nativePush.enable} disabled={nativePush.busy} className="press-scale" style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: sans }}>
              Aanzetten
            </button>
            <button onClick={() => setPushPromptHidden(true)} style={{ minHeight: 42, padding: "0 16px", borderRadius: 12, border: `1px solid ${BORDER}`, background: "none", color: INK, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: sans }}>
              Niet nu
            </button>
          </div>
        </div>
      )}

      {combinedFeed.length === 0 ? (guest ? null :
        <div style={{ padding: "14px 16px", background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS }}>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            Nog geen activiteit — check zelf iets in, of voeg vrienden toe via Profiel om te zien wat zij drinken.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {combinedFeed.map((entry, idx) => {
            const dayLabel = feedDayLabel(entry);
            const showDay = idx === 0 || feedDayLabel(combinedFeed[idx - 1]) !== dayLabel;
            const dayHeader = showDay ? (
              <div key={`d-${dayLabel}-${idx}`} style={{ padding: idx === 0 ? "18px 4px 10px" : "8px 4px 10px", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{dayLabel}</div>
            ) : null;
            const item = renderFeedItem(entry);
            const isNew = highlightId && entry.kind !== "rank" && entry.mine && entry.id === highlightId;
            return item ? <div key={`w-${entry.kind || "c"}-${entry.id}`} className={isNew ? "feed-new" : undefined}>{dayHeader}{item}</div> : null;
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
          onOpenCheckin={onOpenCheckin}
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
        <span className={active ? "dock-active" : undefined} style={{
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
                background: BOTTLE, color: CREAM, fontSize: 9.5, fontWeight: 700,
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
            width: 54, height: 54, borderRadius: "50%", background: BOTTLE_DARK, border: `3px solid ${BRASS}`,
            boxShadow: "0 6px 16px -4px rgba(19,38,34,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#FBF6EA", cursor: "pointer",
          }}>
            <Plus size={24} strokeWidth={2.4} />
          </button>
        </div>
        {right.map(renderBtn)}
      </div>
    </div>
  );
}

// Huisstijl: sectiekopjes klein, in hoofdletters en gedempt, zodat de
// kaarten eronder het werk doen en niet de koppen.
export function SectionLabel({ children }) {
  return (
    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, margin: "4px 4px 10px" }}>
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
function StatusBarBackdrop({ showAfter = 0, dark = false }) {
  const [visible, setVisible] = useState(showAfter === 0);
  useEffect(() => {
    if (showAfter === 0) { setVisible(true); return; }
    const onScroll = () => setVisible(window.scrollY > showAfter);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfter]);
  return (
    <div aria-hidden className={dark ? undefined : "glass-light"} style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "env(safe-area-inset-top)", zIndex: 25,
      border: "none", boxShadow: "none", background: dark ? BOTTLE_DARK : "rgba(243,236,221,0.92)", pointerEvents: "none",
      opacity: visible ? 1 : 0, transition: "opacity 0.15s ease",
    }} />
  );
}

// Huisstijl: elk scherm heeft bovenaan dezelfde donkergroene kop met een
// messinglijn eronder (zoals Home). Hoofdschermen krijgen een serif-titel
// links, subschermen een terugknop + gecentreerde titel (HeaderNavBar).
// De kop is sticky en loopt zelf door tot achter de statusbalk.
export const HEADER_TEXT = "#FBF6EA";
export const HEADER_ACCENT = "#DDB877";
export const HEADER_MUTED = "#A9B8B0";
const HEADER_BAR_STYLE = {
  position: "sticky", top: 0, zIndex: 20, background: BOTTLE_DARK, color: HEADER_TEXT,
  marginLeft: -20, marginRight: -20, paddingTop: "env(safe-area-inset-top)",
};
function HeaderIconButton({ onClick, label, children }) {
  return (
    <button onClick={onClick} aria-label={label} className="press-scale" style={{
      width: 44, height: 44, border: "none", background: "none", color: HEADER_ACCENT, padding: 0,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
    }}>{children}</button>
  );
}
// Groen vlak direct onder de kop (zoekveld, profielgegevens): scrolt mee,
// de messinglijn verhuist dan naar de onderkant van dit vlak.
function HeaderBand({ children, style }) {
  return (
    <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, margin: "0 -20px 16px", padding: "2px 20px 16px", borderBottom: `2px solid ${BRASS}`, ...style }}>
      {children}
    </div>
  );
}
function LargeTitleHeader({ title, right = null, band = false }) {
  return (
    <div style={{ ...HEADER_BAR_STYLE, marginBottom: band ? 0 : 16, borderBottom: band ? "none" : `2px solid ${BRASS}` }}>
      <div style={{ height: 52, display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 20px" }}>
        <h1 style={{ flex: 1, margin: 0, fontFamily: serif, fontSize: 24, fontWeight: 700, letterSpacing: 0.2, color: HEADER_TEXT }}>{title}</h1>
        {right}
      </div>
    </div>
  );
}
// Kop voor subschermen: "‹ Vorige" links in goud, titel in het midden.
// Precies 44px hoog (STICKY_SUBHEADER_TOP rekent daarmee).
function HeaderNavBar({ backLabel, onBack, title, right = null, style }) {
  return (
    <div className="header-navbar" style={{ ...HEADER_BAR_STYLE, marginBottom: 16, borderBottom: `2px solid ${BRASS}`, ...style }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, padding: "0 16px 0 12px" }}>
        {/* Een tik is geen voltooide swipe; stopPropagation voorkomt dat de
            tik de rand-swipe-gestiek arm't (de knop staat in de edge-zone). */}
        <button onClick={onBack} onTouchStart={(e) => e.stopPropagation()} style={{
          display: "flex", alignItems: "center", gap: 1, background: "none", border: "none",
          cursor: "pointer", padding: "10px 6px 10px 0", margin: 0, color: HEADER_ACCENT, fontFamily: sans, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          <ChevronLeft size={22} strokeWidth={2.2} style={{ flexShrink: 0 }} />
          {/* Lange namen worden "Terug", zoals iOS doet als de ruimte op is. */}
          <span>{title && backLabel.length > 9 ? "Terug" : backLabel}</span>
        </button>
        {/* Titel echt in het midden van het scherm, los van de breedte van
            het terug-label. */}
        {title && (
          <div style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100% - 240px)", pointerEvents: "none",
            fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: HEADER_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{title}</div>
        )}
        {right && <div style={{ color: HEADER_ACCENT }}>{right}</div>}
      </div>
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

export function ItemArt({ ing }) {
  const localSrc = localItemImageUrl("drank", ing.id);
  if (localSrc) {
    return <img className="item-art" src={localSrc} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />;
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
export const FILL_LEVELS = [
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

// Tekst met een vetgedrukt begin ("<b>Na openen in de koelkast.</b> ...")
// zonder dangerouslySetInnerHTML.
function BoldLead({ text }) {
  const m = /^<b>(.*?)<\/b>\s*(.*)$/s.exec(text || "");
  if (!m) return text;
  return <><strong>{m[1]}</strong> {m[2]}</>;
}

// Uitleg bovenaan het flesscherm: één zin, smaaklabels, alleen waar nodig
// een tip, en de rest achter "Meer over …" (zie src/data/ingredientInfo.js).
const INFO_MERKNAMEN = new Set(["suze", "campari", "aperol", "amaro_nonino", "cynar", "fernet_branca", "yellow_chartreuse", "green_chartreuse",
  "chambord", "frangelico", "galliano", "pimms", "drambuie", "benedictine", "grand_marnier", "lillet_blanc", "angostura", "peychauds",
  "tabasco", "worcestershire", "irish_whiskey", "scotch"]);
function IngredientInfoBlock({ ing }) {
  const info = INGREDIENT_INFO[ing.id];
  const kopen = DRANK_SPECS[ing.id]?.eis;
  const [open, setOpen] = useState(false);
  if (!info) return null;
  const meer = [
    info.bewaren && ["Bewaren", info.bewaren],
    info.vervangen && ["Geen in huis?", info.vervangen],
    kopen && ["Waar let je op bij kopen", kopen],
  ].filter(Boolean);
  const baseName = ing.name.replace(/\s*\(.*\)\s*$/, "");
  const shortName = INFO_MERKNAMEN.has(ing.id) ? baseName : baseName.charAt(0).toLowerCase() + baseName.slice(1);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 14.5, lineHeight: 1.5, color: INK, marginBottom: 10 }}>{info.zin}</div>
      {info.smaak?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {info.smaak.map(t => (
            <span key={t} style={{ padding: "4px 10px", borderRadius: 100, background: PAPER_DEEP, fontSize: 12.5, fontWeight: 600, color: INK }}>{t}</span>
          ))}
        </div>
      )}
      {info.tip && (
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: "rgba(92,122,82,0.14)", marginBottom: 14, fontSize: 13.5, lineHeight: 1.5, color: INK }}>
          <Info size={17} color={SAGE} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><BoldLead text={info.tip} /></span>
        </div>
      )}
      {meer.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, marginBottom: 18 }}>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{
            display: "flex", alignItems: "center", width: "100%", minHeight: 48, padding: 0, background: "none", border: "none",
            cursor: "pointer", fontFamily: sans, color: INK, textAlign: "left",
          }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>Meer over {shortName}</span>
            {open ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
          </button>
          {open && meer.map(([k, v]) => (
            <div key={k} style={{ paddingBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: MUTED, textTransform: "uppercase", marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: INK }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
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
        display: "flex", flexDirection: "column", overflow: "hidden", touchAction: "pan-y", overscrollBehavior: "contain",
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

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", touchAction: "pan-y", overscrollBehavior: "contain", padding: "0 20px 16px", WebkitOverflowScrolling: "touch" }}>
          <IngredientInfoBlock ing={ing} />
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

// Onbekend merk: eerst de soort, dan de precieze drank. Zo telt ook een
// fles die we nog niet kennen mee bij de juiste recepten.
const MERK_SOORTEN = [
  { label: "Rum", ids: ["white_rum", "dark_rum", "spiced_rum", "coconut_rum", "cachaca"] },
  { label: "Wodka", ids: ["vodka", "vanilla_vodka"] },
  { label: "Gin", ids: ["gin", "sloe_gin", "genever"] },
  { label: "Whisky", ids: ["bourbon", "rye", "scotch", "irish_whiskey"] },
  { label: "Tequila", ids: ["tequila_blanco", "mezcal"] },
  { label: "Brandy", ids: ["cognac", "calvados", "pisco", "grappa"] },
  { label: "Likeur", cat: "Likeuren & versterkte wijnen" },
  { label: "Frisdrank", ids: ["tonic", "cola", "lemonade", "bitter_lemon", "ginger_beer", "ginger_ale", "soda_water", "grapefruit_soda", "energy_drink", "ice_tea"] },
  { label: "Sap", ids: ["orange_juice", "pineapple_juice", "cranberry_juice", "grapefruit_juice", "lemon_juice", "lime_juice", "tomato_juice", "passion_fruit_juice", "apple_juice"] },
  { label: "Siroop", ids: ["sugar_syrup", "grenadine", "orgeat", "honey_syrup", "raspberry_syrup", "elderflower_cordial", "vanilla_syrup", "agave_nectar"] },
  { label: "Wijn & bier", ids: ["prosecco", "white_wine", "red_wine", "rose_wine", "beer", "stout", "cider", "sake"] },
];

function VoorraadTab({ allIngredients, recipes, isOwned, voorraad, voorraadAantal, onAdjustAantal, onToggle, onAddCustom, onRemoveCustom,
  niveaus = {}, onSetNiveau, onAddPack, onUndoPack, onAddToShoppingList, shoppingKeys, onOpenFullRecipe, onSound, onOpenMaken = null, onRequestAi = null, onAddScanned = null }) {
  const [query, setQuery] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const searchInputRef = useRef(null);
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
  // Slim zoeken: merk, Engelse naam, spreektaal en tikfouten; plus merken
  // die je zelf aan een drank hebt gekoppeld.
  const [eigenMerken, setEigenMerken] = useStorage("thuisbar-eigen-merken", []);
  // Merken die meerdere gebruikers zelf aan dezelfde drank koppelden (idee 2).
  const [sharedMerken, setSharedMerken] = useState([]);
  useEffect(() => { fetchLearnedBrands().then(setSharedMerken); }, []);
  const searchIndex = useMemo(() => {
    const own = new Set(eigenMerken.map(m => normalizeTerm(m.term)));
    return buildIngredientIndex(allIngredients, [...eigenMerken, ...sharedMerken.filter(m => !own.has(normalizeTerm(m.term)))]);
  }, [allIngredients, eigenMerken, sharedMerken]);
  const matches = useMemo(() => (q ? searchIngredients(query, searchIndex).filter(m => cat === "Alles" || m.ing.cat === cat) : []), [q, query, searchIndex, cat]);
  const matchById = useMemo(() => new Map(matches.map(m => [m.ing.id, m])), [matches]);
  const visible = q ? matches.map(m => m.ing) : allIngredients.filter(i => cat === "Alles" || i.cat === cat);
  const byUse = (a, b) => (usage.get(b.id)?.length || 0) - (usage.get(a.id)?.length || 0);
  const owned = visible.filter(i => voorraad.has(i.id)).sort(q ? () => 0 : byUse);
  const notOwned = visible.filter(i => !voorraad.has(i.id))
    .sort(q ? () => 0 : (a, b) => ((gains.get(b.id) || 0) - (gains.get(a.id) || 0)) || byUse(a, b));
  const exactMatch = q && allIngredients.some(i => normalizeTerm(i.name) === normalizeTerm(query));
  const didYouMean = matches[0]?.fuzzy ? (matches[0].via || matches[0].matchedName) : null;
  const unused = q && matches.length === 0 ? unusedHint(query) : null;
  const recipeHit = q && matches.length === 0 && q.length >= 3 ? recipes.find(r => normalizeTerm(r.name) === normalizeTerm(query)) || null : null;
  const [merkSoort, setMerkSoort] = useState(null);
  const [merkKeuze, setMerkKeuze] = useState(null);
  useEffect(() => { setMerkSoort(null); setMerkKeuze(null); }, [q]);
  const bottleCount = allIngredients.filter(i => voorraad.has(i.id)).length;

  const showToast = (t) => { clearTimeout(toastTimer.current); setToast(t); toastTimer.current = setTimeout(() => setToast(null), 5000); };
  // Melding na toevoegen: wat levert deze fles op?
  const addedToast = (id, viaName) => {
    const ing = allIngredients.find(i => i.id === id);
    const newOnes = (usage.get(id) || []).filter(r => { const m = missingByRecipe.get(r.id) || []; return m.length === 1 && m[0] === id; });
    const head = viaName && normalizeTerm(viaName) !== normalizeTerm(ing?.name) ? `${viaName} → ${ing?.name}` : ing?.name;
    showToast({
      text: `${head} toegevoegd`,
      title: newOnes.length > 0 ? `Je kunt nu ${newOnes.length} extra cocktail${newOnes.length === 1 ? "" : "s"} maken` : null,
      names: newOnes.slice(0, 2).map(r => r.name), more: Math.max(0, newOnes.length - 2),
      undo: [id],
    });
  };
  const toggle = (id, viaName = null) => {
    if (!voorraad.has(id)) { onSound("tick"); onSetNiveau(id, null); addedToast(id, viaName); } else onSound("remove");
    onToggle(id);
  };
  const addAsKnown = (id) => {
    const term = query.trim();
    if (term && !eigenMerken.some(m => normalizeTerm(m.term) === normalizeTerm(term))) setEigenMerken([...eigenMerken, { term, id }]);
    if (term) recordBrandLink(term, id);
    if (!voorraad.has(id)) toggle(id, term); else addedToast(id, term);
    setQuery("");
  };
  const addPack = (pack) => {
    const added = pack.ids.filter(id => !voorraad.has(id) && allIngredients.some(i => i.id === id));
    if (added.length === 0) { showToast({ text: `${pack.label}: alles stond al in je voorraad` }); return; }
    onSound("chime");
    onAddPack(added);
    showToast({ text: `${pack.label}: ${added.length} toegevoegd`, undo: added });
  };
  // Flessen scannen (idee 7): wat je aanvinkt komt in je voorraad, en een
  // gelezen merk wordt gekoppeld zoals bij zelf zoeken (ook voor idee 2).
  const addScanned = (found) => {
    setScanOpen(false);
    const added = found.map(f => f.id).filter(id => !voorraad.has(id));
    const merken = found.filter(f => f.merk && normalizeTerm(f.merk) && normalizeTerm(f.merk) !== normalizeTerm(allIngredients.find(i => i.id === f.id)?.name || ""));
    const nieuw = merken.filter(f => !eigenMerken.some(m => normalizeTerm(m.term) === normalizeTerm(f.merk))).map(f => ({ term: f.merk, id: f.id }));
    if (nieuw.length) setEigenMerken([...eigenMerken, ...nieuw]);
    merken.forEach(f => recordBrandLink(f.merk, f.id));
    const bijgewerkt = found.length - added.length;
    if (onAddScanned) onAddScanned(found); else if (added.length) onAddPack(added);
    if (found.length === 0) return;
    onSound("chime");
    const delen = [added.length && `${added.length} ${added.length === 1 ? "fles" : "flessen"} toegevoegd`, bijgewerkt && `${bijgewerkt} bijgewerkt`].filter(Boolean);
    showToast({ text: delen.join(", "), undo: added.length ? added : undefined });
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
    const hit = q ? matchById.get(ing.id) : null;
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
            {hit?.via && (
              <span style={{ alignSelf: "flex-start", maxWidth: "100%", marginTop: 3, fontSize: 11.5, fontWeight: 700, color: hit.near ? MUTED : BRASS_TEXT, background: hit.near ? PAPER_DEEP : "rgba(184,134,46,0.14)", borderRadius: 100, padding: "2px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}>
                {hit.near ? `Lijkt op: ${hit.via}` : hit.learned ? `Jouw ${hit.via}` : `o.a. ${hit.via}`}
              </span>
            )}
            {hit?.near && hit.note && <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.35, whiteSpace: "normal" }}>{hit.note}</div>}
            {isIn ? (
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>
                {low && <span style={{ color: BURGUNDY, fontWeight: 600 }}>{level === "op" ? "Op" : "Bijna op"} · </span>}
                {!low && level === "half" && "Half vol · "}
                {(() => { const t = used > 0 ? `gebruikt in ${used} cocktail${used === 1 ? "" : "s"}` : "nog in geen cocktail"; return low || level === "half" ? t : t[0].toUpperCase() + t.slice(1); })()}
              </div>
            ) : gain > 0 ? (
              <span style={{ alignSelf: "flex-start", marginTop: 3, fontSize: 11.5, fontWeight: 700, color: BRASS_TEXT, background: "rgba(184,134,46,0.18)", borderRadius: 100, padding: "2px 8px" }}>+{gain} cocktail{gain === 1 ? "" : "s"}</span>
            ) : (
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 1 }}>{used > 0 ? `Gebruikt in ${used} cocktail${used === 1 ? "" : "s"}` : "Nog in geen cocktail"}</div>
            )}
          </div>
        </button>
        <button onClick={() => toggle(ing.id, hit?.via || null)} aria-pressed={isIn} aria-label={isIn ? `${ing.name} uit voorraad halen` : `${ing.name} in voorraad zetten`}
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
  const listCard = (children) => <div style={{ background: CREAM, border: "none", borderRadius: 16, overflow: "hidden", boxShadow: SHADOW_CARD }}>{children}</div>;

  return (
    <div style={{ fontFamily: sans }}>
      <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.1 }}>Voorraad</h1>
      <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>
        <strong style={{ color: INK }}>{bottleCount} {bottleCount === 1 ? "fles" : "flessen"}</strong> · hiermee maak je{" "}
        {onOpenMaken ? (
          <button onClick={onOpenMaken} style={{ display: "inline-flex", alignItems: "center", gap: 1, background: "none", border: "none", padding: "6px 0", margin: "-6px 0", cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700, color: BOTTLE }}>
            {makeableCount} cocktail{makeableCount === 1 ? "" : "s"} <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        ) : <strong style={{ color: INK }}>{makeableCount} cocktail{makeableCount === 1 ? "" : "s"}</strong>}
      </div>

      <div data-kb-scope style={{ position: "sticky", top: "calc(env(safe-area-inset-top) + 45px)", zIndex: 8, margin: "12px -20px 0", padding: "8px 20px", background: PAPER }}>
        <form className="search-pill" onSubmit={e => { e.preventDefault(); if (q && !exactMatch && visible.length === 0) addCustom(); }} style={{ display: "flex", alignItems: "center", gap: 8, background: PAPER_DEEP, borderRadius: 12, padding: "0 10px 0 12px" }}>
          <Search size={17} color={MUTED} />
          <input ref={searchInputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek of voeg toe…" aria-label="Zoek of voeg toe" enterKeyHint="search" autoCorrect="off"
            style={{ flex: 1, minHeight: 44, border: "none", outline: "none", background: "transparent", fontFamily: sans, fontSize: 16, color: INK }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Wis zoekopdracht" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.08)", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>}
          {!query && onRequestAi && (
            <button type="button" onClick={() => onRequestAi(() => setScanOpen(true))} aria-label="Flessen scannen met een foto" style={{ width: 40, height: 40, margin: "0 -4px 0 0", borderRadius: 10, border: "none", background: "none", color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <Camera size={19} strokeWidth={1.9} />
            </button>
          )}
        </form>
        {scanOpen && (
          <BottleScanSheet allIngredients={allIngredients} voorraad={voorraad} onAdd={addScanned} onClose={() => setScanOpen(false)}
            onSearchManual={() => { setScanOpen(false); setTimeout(() => searchInputRef.current?.focus(), 350); }} />
        )}
      </div>

      <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "6px -20px 0", padding: "4px 20px 6px", WebkitOverflowScrolling: "touch" }}>
        {["Alles", ...cats].map(c => {
          const items = c === "Alles" ? allIngredients : allIngredients.filter(i => i.cat === c);
          const inHuis = items.filter(i => voorraad.has(i.id)).length;
          const on = cat === c;
          return (
            <button key={c} onClick={() => setCat(c)} aria-pressed={on} style={{
              flexShrink: 0, minHeight: 40, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700,
              background: on ? BOTTLE : PAPER_DEEP, color: on ? "#FBF6EA" : INK, border: `1px solid ${on ? BOTTLE : PAPER_DEEP}`, whiteSpace: "nowrap",
            }}>
              {CHIP_LABELS[c] || c} <span style={{ fontWeight: 600, opacity: 0.75, fontSize: 12.5 }}>{inHuis}/{items.length}</span>
            </button>
          );
        })}
      </div>

      {didYouMean && (
        <div style={{ margin: "12px 4px 0", fontSize: 14, color: MUTED }}>
          Bedoel je <button onClick={() => setQuery(didYouMean)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700, color: BOTTLE, textDecoration: "underline" }}>{didYouMean}</button>?
        </div>
      )}
      {q && matches.length === 0 && (recipeHit || unused) && (
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 14, background: PAPER_DEEP, fontSize: 14, lineHeight: 1.45, color: INK }}>
          {recipeHit ? (
            <>
              <strong>{recipeHit.name}</strong> is een cocktail.{" "}
              <button onClick={() => setSheetRecipe(recipeHit)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700, color: BOTTLE, textDecoration: "underline" }}>Bekijk wat je ervoor nodig hebt</button>
            </>
          ) : unused.note}
        </div>
      )}
      {q && matches.length === 0 && !recipeHit && !unused && q.length >= 3 && (() => {
        const soort = MERK_SOORTEN.find(t => t.label === merkSoort);
        const keuzes = soort ? (soort.ids ? soort.ids.map(id => allIngredients.find(i => i.id === id)).filter(Boolean) : allIngredients.filter(i => i.cat === soort.cat)) : [];
        const gekozen = merkKeuze ? allIngredients.find(i => i.id === merkKeuze) : null;
        const chip = (on, label, onClick, small) => (
          <button key={label} onClick={onClick} aria-pressed={on} style={{
            minHeight: small ? 36 : 40, padding: small ? "0 12px" : "0 15px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: small ? 13.5 : 14, fontWeight: 700,
            border: on ? "none" : `1px solid ${BORDER}`, background: on ? (small ? BRASS : BOTTLE) : (small ? CREAM : PAPER_DEEP), color: on ? "#FBF6EA" : INK,
          }}>{label}</button>
        );
        return (
          <div style={{ marginTop: 12, padding: 16, borderRadius: 16, background: CREAM, boxShadow: SHADOW_CARD }}>
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: INK }}>‘{query.trim()}’ kennen we nog niet</div>
            <div style={{ fontSize: 14, color: MUTED, marginTop: 4, lineHeight: 1.45 }}>Wat voor drank is het? Dan telt hij mee bij de juiste recepten.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {MERK_SOORTEN.map(t => chip(merkSoort === t.label, t.label, () => { onSound("tick"); setMerkSoort(merkSoort === t.label ? null : t.label); setMerkKeuze(null); }))}
            </div>
            {soort && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED, margin: "14px 0 8px" }}>Welke {soort.label.toLowerCase()}?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 210, overflowY: "auto" }}>
                  {keuzes.map(i => chip(merkKeuze === i.id, i.name.replace(/\s*\(.*\)\s*$/, ""), () => { onSound("tick"); setMerkKeuze(i.id); }, true))}
                </div>
              </>
            )}
            {gekozen && (
              <button onClick={() => addAsKnown(gekozen.id)} className="press-scale" style={{ width: "100%", minHeight: 48, marginTop: 14, borderRadius: 14, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                Toevoegen als {gekozen.name}
              </button>
            )}
            {gekozen && <div style={{ fontSize: 12.5, color: MUTED, textAlign: "center", marginTop: 8 }}>De app onthoudt dat ‘{query.trim()}’ bij {gekozen.name.toLowerCase()} hoort.</div>}
          </div>
        );
      })()}
      {q && !exactMatch && matches.length === 0 && (
        <button onClick={addCustom} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, marginTop: 12, padding: "0 14px", borderRadius: 14, border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: BOTTLE, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
          <Plus size={18} /> {matches.length > 0 ? `Toch ‘${query.trim()}’ als eigen fles toevoegen` : `‘${query.trim()}’ als eigen fles toevoegen`}
        </button>
      )}

      {owned.length > 0 && (<>{groupHead(`In huis · ${owned.length}`)}{listCard(owned.map((ing, i) => renderRow(ing, i, true)))}</>)}
      {notOwned.length > 0 && (<>
        {groupHead("Nog niet in huis", <span style={{ fontSize: 12, fontWeight: 700, color: BRASS_TEXT }}>Meeste nieuwe cocktails ↓</span>)}
        {listCard(notOwned.map((ing, i) => renderRow(ing, i, false)))}
      </>)}
      {visible.length === 0 && !q && <p style={{ color: MUTED, fontSize: 14, textAlign: "center", padding: "30px 0" }}>Nog niets in deze categorie.</p>}
      {q && !exactMatch && matches.length > 0 && (
        <button onClick={addCustom} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, marginTop: 16, padding: "0 14px", borderRadius: 14, border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: BOTTLE, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
          <Plus size={18} /> {matches.length > 0 ? `Toch ‘${query.trim()}’ als eigen fles toevoegen` : `‘${query.trim()}’ als eigen fles toevoegen`}
        </button>
      )}

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
          <Check size={16} color="#9CC28E" strokeWidth={3} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
            <span style={{ display: "block" }}>{toast.text}</span>
            {toast.title && <span style={{ display: "block", fontFamily: serif, fontSize: 16.5, fontWeight: 700, marginTop: 2 }}>{toast.title}</span>}
            {toast.names?.length > 0 && onOpenMaken && (
              <button onClick={() => { setToast(null); onOpenMaken(); }} style={{ background: "none", border: "none", padding: "4px 0 0", cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 700, color: "#F1D9A6", textAlign: "left" }}>
                Bekijk: {toast.names.join(", ")}{toast.more ? ` +${toast.more}` : ""} ›
              </button>
            )}
          </span>
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
export function useBodyScrollLock() {
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

// Zelfde vergrendeling als component, voor vellen die inline (niet als eigen
// component) worden getoond, zoals het check-in-venster.
function BodyScrollLock() {
  useBodyScrollLock();
  return null;
}

// Bottom sheets native laten aanvoelen: met je vinger omlaag vegen om te
// sluiten (de sheet volgt de vinger 1:1, veert terug als je niet ver genoeg
// komt), en elke manier van sluiten — vegen, tikken op de achtergrond, het
// kruisje — krijgt dezelfde vloeiende omlaag-animatie in plaats van abrupt
// te verdwijnen. Dat "meebewegen met je vinger en loslaten" is precies wat
// een sheet als een systeem-sheet laat voelen i.p.v. een webpagina-modal.
// Sleep-handlers gaan alleen op de handgreep + header, nooit op de
// scrollbare inhoud, zodat normaal scrollen door de lijst niet kapotgaat.
export function useSheetDismiss(onClose) {
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
export function SheetGrabber(dragHandlers) {
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
// Veeggebied van een subpagina loopt tot de onderkant van het scherm, ook
// als de pagina kort is. De ruimte die de pagina onderaan vrijhoudt voor de
// onderbalk (150px, zie de paginacontainer in ThuisbarApp) valt daarbinnen:
// als padding erin en als negatieve marge eruit, zodat een korte pagina
// niet ineens gaat scrollen.
const SWIPE_FILL = {
  minHeight: "100vh",
  paddingBottom: "calc(env(safe-area-inset-bottom) + 150px)",
  marginBottom: "calc(-1 * (env(safe-area-inset-bottom) + 150px))",
  boxSizing: "border-box",
};
// Binnen een subpagina (bijv. een les in de Cursus): ruwweg schermhoog min
// de kop, zonder extra scrollruimte te maken.
const SWIPE_MIN_HEIGHT = "calc(100vh - env(safe-area-inset-bottom) - 210px)";

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
    // Aanrakingen in een venster of schermvullende laag (portal) komen in
    // React ook hier langs; die horen niet bij deze pagina — anders ging
    // bijv. vegen in de bereidingsmodus terug naar het recept eronder.
    if (contentRef.current && !contentRef.current.contains(e.target)) { drag.current.tracking = false; return; }
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
export const NavOverrideContext = createContext(null);

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
          <div style={{ background: BOTTLE_DARK, borderBottom: `2px solid ${BRASS}`, padding: "env(safe-area-inset-top) 20px 0", marginBottom: 16 }}>
            <div style={{ height: 52, display: "flex", alignItems: "center", fontFamily: serif, fontWeight: 700, fontSize: 24, color: HEADER_TEXT }}>{label}</div>
          </div>
          <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 52, borderRadius: 16, background: CREAM, border: "none", boxShadow: SHADOW_CARD }} />
            ))}
          </div>
          <div ref={scrimRef} aria-hidden style={{ position: "absolute", inset: 0, background: "rgba(15,12,9,0.16)", opacity: 1 }} />
        </div>
      )}
      {/* minHeight: ook bij een korte pagina loopt het veeggebied tot de
          onderkant van het scherm, zodat terugvegen overal langs de rand werkt. */}
      <div ref={contentRef} {...handlers} style={{ ...EDGE_SWIPE_BLEED, ...SWIPE_FILL, touchAction: "pan-y", position: "relative", background: PAPER }}>
        {/* Vaste navigatiebalk: terugknop links (vorige-schermnaam, net als
            echte iOS), gecentreerde titel van dít scherm — sticky zodat hij
            blijft staan terwijl de inhoud eronder scrollt, i.p.v. mee weg te
            scrollen zoals voorheen. marginLeft/Right+paddingLeft/Right span
            de balk edge-to-edge ondanks de 20px zijpadding van de pagina. */}
        {/* Vaste navigatiebalk (huisstijl): terugknop links, titel in het
            midden, sticky zodat hij blijft staan terwijl de inhoud scrolt. */}
        <HeaderNavBar backLabel={label} onBack={onBack} title={title} right={navOverride?.right} />
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
export function EdgeSwipeBackArea({ onBack, children, bleed = true, style }) {
  const { contentRef, handlers } = useEdgeSwipeBack(onBack);
  return (
    <div ref={contentRef} {...handlers} style={{ ...(bleed ? { ...EDGE_SWIPE_BLEED, minHeight: SWIPE_MIN_HEIGHT } : null), touchAction: "pan-y", ...style }}>
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
export function SwipeToDelete({ onDelete, borderRadius = 0, children }) {
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
export function AnimatedNumber({ value, format }) {
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

// Heb je dit ingrediënt in huis? Groen vinkje of een rood leeg rondje, zodat
// je in één oogopslag ziet wat er ontbreekt.
function OwnedMark({ owned, optional, size = 20 }) {
  if (owned) return (
    <span aria-label="In huis" style={{ width: size, height: size, borderRadius: "50%", background: SAGE, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Check size={Math.round(size * 0.6)} strokeWidth={3.2} color={CREAM} />
    </span>
  );
  return (
    <span aria-label={optional ? "Optioneel, niet in huis" : "Ontbreekt"} style={{ width: size, height: size, borderRadius: "50%", boxSizing: "border-box", border: `2px ${optional ? "dashed" : "solid"} ${optional ? BORDER : BURGUNDY}`, flexShrink: 0, display: "inline-block" }} />
  );
}
// Samenvatting boven de ingrediëntenlijst: alles in huis, of precies wat je mist.
function MissingSummary({ missing, ingredientLabel }) {
  if (missing.length === 0) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 14, background: "rgba(92,122,82,0.14)", marginBottom: 10 }}>
      <OwnedMark owned size={22} />
      <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>Je hebt alles in huis</span>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 14, background: "rgba(122,46,42,0.10)", marginBottom: 10 }}>
      <AlertTriangle size={19} color={BURGUNDY} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 14, lineHeight: 1.45, color: INK }}>
        <strong style={{ color: BURGUNDY }}>Je mist {missing.length === 1 ? "1 ingrediënt" : `${missing.length} ingrediënten`}:</strong>{" "}
        {joinNames(missing.map(m => ingredientLabel(m)))}
      </span>
    </div>
  );
}

function StatusTag({ missingCount }) {
  const cfg = missingCount === 0
    ? { color: SAGE, label: "Maakbaar" }
    : missingCount === 1
      ? { color: BRASS_TEXT, label: "Bijna, mist 1" }
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
      const viewH = visibleViewportBottom();
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

export function RecipePicker({ recipes, value, onChange, listId, style }) {
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const dropdownMaxH = useDropdownMaxHeight(wrapRef, open, 240);
  const sorted = useMemo(() => [...recipes].sort((a, b) => a.name.localeCompare(b.name)), [recipes]);
  const current = recipes.find(r => r.id === canonicalRecipeId(value));
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
  // Eigen tekeningen (niveau "illustratie") krijgen geen foto-filter.
  if (IMAGE_CATALOG_BY_KEY.get(`${type}:${id}`)?.niveau === "illustratie") filter = undefined;
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

export function RecipeCircle({ recipe, allIngredients, size = 50, radius = "50%" }) {
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

export function RecipeSheet({ recipe, missing, ingredientLabel, allIngredients, onAddMissing, justAdded, onClose,
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

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 20px 18px" }}>
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

          <FriendsRecipeRow compact recipe={recipe} allIngredients={allIngredients} style={{ marginBottom: 14 }} />

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
          <MatigheidRegel />
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

export function MatchPill({ pct, label }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
      <span className="glass-chip-dark" style={{ borderRadius: 100, padding: "2px 8px", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>{pct}%{label ? ` ${label}` : ""}</span>
    </div>
  );
}

function OntdekkenTab({ makenProps, verhaalProps, openRecipeId, onOpenRecipeHandled, recommended, favoriteFamily, allIngredients, onOpenRecipe, onSound, active,
  recipeBackLabel = "Ontdekken", onRecipeBack = null, rootTapTick = 0, headerRight = null, intro = null,
  openKanTick = 0, kanBack = null, onKanClosed }) {
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
  // Van buitenaf (Voorraad) direct "Wat ik kan maken" openen.
  useEffect(() => { if (openKanTick) openMode("kan"); }, [openKanTick]);
  // Verlaat je "Wat ik kan maken", dan vervalt de terugweg naar Voorraad.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === "kan" && mode !== "kan" && kanBack) onKanClosed?.();
    prevModeRef.current = mode;
  }, [mode]);
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
      {showChrome && <LargeTitleHeader title="Ontdekken" band right={headerRight} />}
      {/* Schakelaar in het groene vlak onder de kop: alle recepten of alleen
          wat je nu kunt maken. */}
      {showChrome && (
        <HeaderBand style={{ paddingTop: 4 }}>
          <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(251,246,234,0.1)" }}>
            {[["alles", "Alle recepten"], ["kan", "Wat ik kan maken"]].map(([id, lab]) => (
              <button key={id} role="tab" aria-selected={mode === id} onClick={() => openMode(id)} style={{
                flex: 1, height: 36, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 700,
                background: mode === id ? HEADER_TEXT : "transparent", color: mode === id ? "#132622" : HEADER_MUTED,
              }}>{lab}</button>
            ))}
          </div>
        </HeaderBand>
      )}
      {showChrome && intro}

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
              <button key={recipe.id} onClick={() => { onSound?.("pop"); onOpenRecipe?.(recipe.id); }} className="press-scale" style={{ width: 132, flexShrink: 0, textAlign: "center", background: CREAM, border: "none", borderRadius: 14, boxShadow: SHADOW_CARD, padding: 10, position: "relative", cursor: "pointer", fontFamily: sans }}>
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
                  <div style={{ fontSize: 10, color: BRASS_TEXT, marginTop: 4, fontWeight: 700 }}>Vul je voorraad in</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: mode === "kan" ? "" : "none" }}>
        <MakenTab {...makenProps} backLabel={kanBack?.label || "Ontdekken"}
          onBack={kanBack ? () => { setMode("alles"); kanBack.onBack(); } : () => openMode("alles")} />
      </div>
      <div style={{ display: mode === "alles" ? "" : "none" }}>
        <VerhaalTab {...verhaalProps} openRecipeId={openRecipeId} onOpenRecipeHandled={onOpenRecipeHandled}
          backLabel={recipeBackLabel} onBackToOrigin={onRecipeBack} onRecipeOpenChange={handleRecipeOpenChange} rootTapTick={rootTapTick} />
      </div>
    </div>
  );
}

// Filters voor "Alle recepten" in één venster: kies wat je wilt en zie
// meteen hoeveel recepten er overblijven.
function RecipeFilterSheet({ value, families, glasses, spirits, focus, countFor, onApply, onClose, onSound }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [v, setV] = useState(value);
  const sectionRefs = useRef({});
  useEffect(() => {
    const el = sectionRefs.current[focus];
    if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key, item) => { onSound?.("tick"); setV(cur => ({ ...cur, [key]: cur[key].includes(item) ? cur[key].filter(x => x !== item) : [...cur[key], item] })); };
  const opt = (label, on, onClick) => (
    <button key={label} onClick={onClick} aria-pressed={on} className="press-scale" style={{
      height: 38, padding: "0 14px", borderRadius: 100, cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 700,
      border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : CREAM, color: on ? CREAM : INK,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>{on && <Check size={13} strokeWidth={3} color="#DDB877" />}{label}</button>
  );
  const head = (t, key) => <div ref={el => { if (key) sectionRefs.current[key] = el; }} style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, margin: "18px 0 10px", scrollMarginTop: 10 }}>{t}</div>;
  const n = countFor(v);
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in sheet-max-92" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0",
        boxShadow: "0 -12px 30px rgba(43,38,32,0.25)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <SheetGrabber {...dragHandlers} />
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", padding: "0 20px 6px", touchAction: "none" }}>
          <span style={{ flex: 1, fontFamily: serif, fontSize: 23, fontWeight: 700 }}>Filters</span>
          <button onClick={() => setV({ status: "alle", family: [], glass: [], spirit: [] })} style={{ background: "none", border: "none", padding: "8px 0 8px 10px", cursor: "pointer", color: BOTTLE, fontFamily: sans, fontSize: 14.5, fontWeight: 700 }}>Wis alles</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 20px 8px" }}>
          {head("Kan ik maken", "status")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[["alle", "Alles"], ["maken", "Kun je maken"], ["bijna", "Mist er 1"]].map(([k, l]) => opt(l, v.status === k, () => { onSound?.("tick"); setV(cur => ({ ...cur, status: k })); }))}
          </div>
          {head("Familie", "familie")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{families.map(f => opt(f, v.family.includes(f), () => toggle("family", f)))}</div>
          {head("Glas", "glas")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{glasses.map(g => opt(g, v.glass.includes(g), () => toggle("glass", g)))}</div>
          {head("Sterke drank", "drank")}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{spirits.map(sp => opt(sp, v.spirit.includes(sp), () => toggle("spirit", sp)))}</div>
        </div>
        <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom) + 14px)", borderTop: `1px solid ${BORDER}`, background: PAPER }}>
          <button onClick={() => { onApply(v); close(); }} disabled={n === 0} className="press-scale" style={{
            width: "100%", height: 50, borderRadius: 14, border: "none", background: n === 0 ? BORDER : BOTTLE_DARK, color: n === 0 ? MUTED : HEADER_TEXT,
            fontFamily: sans, fontSize: 16, fontWeight: 700, cursor: n === 0 ? "default" : "pointer",
          }}>{n === 0 ? "Geen recepten met deze filters" : `Toon ${n} ${n === 1 ? "recept" : "recepten"}`}</button>
        </div>
      </div>
    </div>
  ), document.body);
}

function MakenTab({ backLabel = "Ontdekken", onOpenVoorraad = null, recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, onSound, onOpenRecipe, onAddToFeest, feestChosen, onBack, shoppingKeys, onRemoveFromShoppingList, favoriteRecipeIds, onToggleFavorite, onOpenCheckin }) {
  const [view, setView] = useState("ontdekken");
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  // Filters van "Alle recepten": meerdere keuzes per soort (lege lijst = alles).
  const [familyFilter, setFamilyFilter] = useState([]);
  const [glassFilter, setGlassFilter] = useState([]);
  const [spiritFilter, setSpiritFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState("alle"); // alle | maken | bijna
  const [filterSheet, setFilterSheet] = useState(false);
  const [restShown, setRestShown] = useState(40);
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

  const matchesFilters = (r, f) => {
    const q = query.trim().toLowerCase();
    if (q && !r.name.toLowerCase().includes(q) && !(r.family || "").toLowerCase().includes(q)
      && !r.ingredients.some(i => ingredientLabel(i).toLowerCase().includes(q))) return false;
    if (f.family.length && !f.family.includes(r.family)) return false;
    if (f.glass.length && !f.glass.includes(r.glass)) return false;
    if (f.spirit.length && !f.spirit.includes(getBaseSpirit(r, allIngredients))) return false;
    return true;
  };
  const filtered = recipes.filter(r => matchesFilters(r, { family: familyFilter, glass: glassFilter, spirit: spiritFilter }));
  // Zoekt iemand naar iets wat niet bestaat, dan komt dat (anoniem) op de
  // lijst "Ontbrekende recepten" voor de beheerder (idee 3).
  const nameHits = query.trim() ? recipes.filter(r => r.name.toLowerCase().includes(query.trim().toLowerCase())).length : -1;
  useSearchMiss(query, nameHits);
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

  const selectStyle = { padding: "8px 10px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: sans, background: CREAM, color: INK };

  // Horizontale rij: een handvol kaarten om door te swipen, de rest via "Alles bekijken".
  const NU_CAP = 12;
  const BIJNA_CAP = 4;
  const bijnaShown = bijnaExpanded ? bijnaAll : bijnaAll.slice(0, BIJNA_CAP);

  const sheetEntry = sheetRecipeId ? scoredById.get(sheetRecipeId) : null;

  const HERO_GREEN = "#1F3D36", HERO_CREAM = "#FBF6EA", HERO_GOLD = "#DDB877";
  const linkBtn = { background: "none", border: "none", padding: "6px 0", cursor: "pointer", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 600 };
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
    setView("ontdekken"); setQuery(""); setFamilyFilter([]); setGlassFilter([]); setSpiritFilter([]); setStatusFilter("alle"); setRestShown(40); setOpenId(null);
    window.scrollTo(0, 0);
  };

  // Eigen scherm met iOS-navigatiebalk (zoals een geopend recept): "‹ Ontdekken"
  // terug naar Ontdekken; in de volledige lijst "‹ Overzicht" terug hierheen.
  return (
    <SecondaryTabScreen
      label={view === "alle" ? "Overzicht" : backLabel}
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
            background: HEADER_TEXT, color: "#132622", fontFamily: sans, fontSize: 15, fontWeight: 700,
            cursor: shuffling || makeableAll.length === 0 ? "default" : "pointer", opacity: makeableAll.length === 0 ? 0.5 : 1,
          }}>
            <Shuffle size={18} className={shuffling ? "spin-icon" : undefined} /> Verras me
          </button>
          {onOpenVoorraad && (
            <button onClick={onOpenVoorraad} className="press-scale" style={{
              width: "100%", height: 44, marginTop: 8, borderRadius: 12, border: "1px solid rgba(251,246,234,0.3)", background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: HEADER_TEXT, fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer",
            }}>
              <Refrigerator size={17} /> Voorraad bijwerken
            </button>
          )}
        </div>
      )}

      {view === "ontdekken" && (
      <div style={{ position: "relative", marginBottom: 22 }}>
        <Search size={15} color={MUTED} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={query} onChange={e => { setQuery(e.target.value); if (e.target.value.trim() && view !== "alle") setView("alle"); }} placeholder="Zoek op naam of familie…"
          enterKeyHint="search" autoCapitalize="words"
          style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, boxSizing: "border-box", background: CREAM, fontFamily: sans, color: INK }} />
      </div>
      )}

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
              <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, overflow: "hidden" }}>
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
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED }}>Slim inkopen</span>
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

      {view === "alle" && (() => {
        // Gegroepeerd: wat je nu kunt maken, wat er nog 1 mist, de rest.
        const groups = [
          { key: "maken", title: "Kun je nu maken", items: scored.filter(x => x.missing.length === 0) },
          { key: "bijna", title: "Mist 1 ingrediënt", items: scored.filter(x => x.missing.length === 1) },
          { key: "rest", title: "Overige recepten", items: scored.filter(x => x.missing.length > 1) },
        ].filter(g => g.items.length > 0 && (statusFilter === "alle" || g.key === statusFilter));
        const chip = (label, active, onClick, drop = true) => (
          <button onClick={onClick} className="press-scale" style={{
            display: "inline-flex", alignItems: "center", gap: 4, height: 34, padding: "0 12px", borderRadius: 100, flexShrink: 0, cursor: "pointer",
            fontFamily: sans, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
            background: active ? HERO_GOLD : "rgba(251,246,234,0.12)", color: active ? "#132622" : HEADER_TEXT,
            border: `1px solid ${active ? HERO_GOLD : "rgba(251,246,234,0.22)"}`,
          }}>{label}{drop && <ChevronDown size={14} strokeWidth={2.4} />}</button>
        );
        const sel = (list, word) => list.length === 0 ? word : list.length === 1 ? list[0] : `${word} · ${list.length}`;
        const statusRow = ({ recipe, missing }, i, arr, group) => {
          const done = missing.length === 1 && onList(missing[0]);
          return (
            <div key={recipe.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
              <button onClick={() => onOpenRecipe(recipe.id)} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK }}>
                <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={54} radius={14} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: serif, fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{recipe.name}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, margin: "2px 0 5px" }}>{[recipe.family, recipe.glass].filter(Boolean).join(" · ")}</span>
                  {missing.length === 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 100, background: "rgba(79,107,70,0.14)", color: "#4F6B46", fontSize: 12, fontWeight: 700 }}><Check size={12} strokeWidth={3} /> Kun je maken</span>
                  ) : (
                    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 100, background: "rgba(122,46,42,0.10)", color: BURGUNDY, fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
                      Mist: {missing.length <= 2 ? joinNames(missing.map(m => ingredientLabel(m))) : `${ingredientLabel(missing[0])} en ${missing.length - 1} meer`}
                    </span>
                  )}
                </span>
              </button>
              {group === "bijna" ? (
                <button onClick={() => toggleOnList(recipe.id, missing[0], [recipe.name])} aria-pressed={done} className="press-scale" style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 10px", borderRadius: 100, cursor: "pointer",
                  border: `1px solid ${done ? SAGE : BOTTLE}`, background: done ? SAGE : "none", color: done ? CREAM : BOTTLE, fontFamily: sans, fontSize: 12.5, fontWeight: 700,
                }}>{done ? <><Check size={13} strokeWidth={3} /> In mandje</> : <><Plus size={13} strokeWidth={2.6} /> Mandje</>}</button>
              ) : <ChevronRight size={17} color={MUTED} style={{ flexShrink: 0 }} />}
            </div>
          );
        };
        return (
        <div>
          <HeaderBand style={{ marginTop: -18, paddingTop: 4, paddingBottom: 14 }}>
            <div style={{ position: "relative" }}>
              <Search size={17} color={MUTED} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={query} onChange={e => { setQuery(e.target.value); setRestShown(40); }} placeholder="Zoek op naam, ingrediënt of familie"
                enterKeyHint="search" autoCapitalize="words" autoCorrect="off"
                style={{ width: "100%", height: 44, padding: "0 36px 0 38px", borderRadius: 12, border: "none", outline: "none", fontSize: 16, boxSizing: "border-box", background: CREAM, color: INK, fontFamily: sans }} />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Wis zoekterm" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, border: "none", background: "none", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={16} /></button>
              )}
            </div>
            <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", margin: "12px -20px 0", padding: "0 20px", WebkitOverflowScrolling: "touch" }}>
              {chip(statusFilter === "bijna" ? "Mist er 1" : "Kan ik maken", statusFilter !== "alle", () => { onSound("tick"); setStatusFilter(statusFilter === "alle" ? "maken" : "alle"); }, false)}
              {chip(sel(familyFilter, "Familie"), familyFilter.length > 0, () => setFilterSheet("familie"))}
              {chip(sel(glassFilter, "Glas"), glassFilter.length > 0, () => setFilterSheet("glas"))}
              {chip(sel(spiritFilter, "Sterke drank"), spiritFilter.length > 0, () => setFilterSheet("drank"))}
            </div>
          </HeaderBand>

          {groups.length === 0 && (
            <div style={{ textAlign: "center", padding: "30px 10px" }}>
              <p style={{ color: MUTED, fontSize: 14, margin: "0 0 10px" }}>Niets gevonden. Probeer andere filters.</p>
              <button onClick={() => { setQuery(""); setFamilyFilter([]); setGlassFilter([]); setSpiritFilter([]); setStatusFilter("alle"); }} style={linkBtn}>Wis alle filters</button>
            </div>
          )}
          {groups.map(g => {
            const items = g.key === "rest" ? g.items.slice(0, restShown) : g.items;
            return (
              <div key={g.key} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 4px 10px" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>{g.title}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{g.items.length}</span>
                </div>
                <div style={{ background: CREAM, borderRadius: 18, boxShadow: SHADOW_CARD, overflow: "hidden" }}>
                  {items.map((x, i, arr) => statusRow(x, i, arr, g.key))}
                </div>
                {g.key === "rest" && g.items.length > restShown && (
                  <button onClick={() => setRestShown(n => n + 60)} style={{ ...linkBtn, display: "block", width: "100%", textAlign: "center", padding: "12px 0" }}>
                    Toon meer ({g.items.length - restShown})
                  </button>
                )}
              </div>
            );
          })}

          {filterSheet && (
            <RecipeFilterSheet focus={filterSheet} onClose={() => setFilterSheet(false)} onSound={onSound}
              families={families} glasses={glasses} spirits={spirits}
              value={{ status: statusFilter, family: familyFilter, glass: glassFilter, spirit: spiritFilter }}
              countFor={(v) => recipes.filter(r => matchesFilters(r, v)).filter(r => {
                if (v.status === "alle") return true;
                const m = (scoredById.get(r.id)?.missing.length) ?? 99;
                return v.status === "maken" ? m === 0 : m === 1;
              }).length}
              onApply={(v) => { setStatusFilter(v.status); setFamilyFilter(v.family); setGlassFilter(v.glass); setSpiritFilter(v.spirit); setRestShown(40); window.scrollTo(0, 0); }} />
          )}
        </div>
        );
      })()}

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


export function BatchRecipePicker({ recipes, allIngredients, recentRecipeIds, favoriteRecipeIds, currentId, onPick, onClose }) {
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
      <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, overflow: "hidden" }}>{list.map(row)}</div>
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
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 20px calc(env(safe-area-inset-bottom) + 20px)", WebkitOverflowScrolling: "touch" }}>
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
// Drankdozijn en Gall & Gall blokkeren dat. Drankdozijn zoeken we via
// Google binnen hun site; Gall & Gall (winkels door heel Nederland, dus
// vaak het makkelijkst om even langs te gaan) via hun eigen zoekpagina,
// zonder prijs in de app: die zie je in hun webshop of in de winkel.
const WINKELS = {
  drankgigant: { naam: "Drankgigant", sub: "Webshop", zoek: (q) => `https://www.drankgigant.nl/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  dirckiii: { naam: "Dirck III", sub: "Bezorgen vanaf 6 flessen, of ophalen in de winkel", zoek: (q) => `https://www.dirckiii.nl/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  mitra: { naam: "Mitra", sub: "Webshop of ophalen in de winkel", zoek: (q) => `https://www.mitra.nl/zoeken?q=${encodeURIComponent(q)}` },
  drankdozijn: { naam: "Drankdozijn", sub: "Webshop", zoek: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:drankdozijn.nl ${q}`)}` },
  gall: { naam: "Gall & Gall", sub: "Prijs bekijken in de webshop of winkel", zoek: (q) => `https://www.gall.nl/zoeken/?q=${encodeURIComponent(q)}` },
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
function useFlessen(refreshKey) {
  const [data, setData] = useState({ flessen: [], aanbiedingen: [] });
  // Opnieuw ophalen als refreshKey verandert (bv. bij het openen van de
  // boodschappenlijst), zodat nieuwe flessen/prijzen meteen zichtbaar zijn.
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
  }, [refreshKey]);
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
  klassieker: { color: BRASS_TEXT, bg: "rgba(184,134,46,0.16)" },
};

// Gall & Gall bovenaan bij een fles: geen prijs (die halen we niet op), wel
// direct naar hun zoekpagina — handig als je liever even langs de winkel
// om de hoek gaat.
function GallRow({ name }) {
  return (
    <button onClick={() => openShopUrl(WINKELS.gall.zoek(name))} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 54, padding: 0, background: "none", border: "none",
      cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 600 }}>
          Gall &amp; Gall
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: SAGE, background: "rgba(92,122,82,0.16)", borderRadius: 100, padding: "1px 7px" }}>Winkel in de buurt</span>
        </span>
        <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{WINKELS.gall.sub}</span>
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: BOTTLE }}>Bekijk</span>
      <ExternalLink size={15} color={MUTED} style={{ marginLeft: 6, flexShrink: 0 }} />
    </button>
  );
}

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

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 20px 16px", WebkitOverflowScrolling: "touch" }}>
          {richtprijs && (
            <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: 16, marginBottom: 14 }}>
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
                          {!o.offers.some(x => x.winkel === "gall") && <GallRow name={o.fles.naam} />}
                          {o.offers.map((x, i) => (
                            <button key={x.id} onClick={() => openShopUrl(x.url)} style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 54, padding: 0, background: "none", border: "none",
                              borderTop: `1px solid ${PAPER_DEEP}`, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
                            }}>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{shopLabel(x.winkel)}</span>
                                <span style={{ display: "block", fontSize: 12, color: x.op_voorraad ? MUTED : BURGUNDY, marginTop: 1 }}>
                                  {x.prijs == null
                                    ? "Prijs volgt deze week"
                                    : <>{[formatInhoud(x.inhoud_ml), x.op_voorraad ? "op voorraad" : "niet op voorraad"].filter(Boolean).join(" · ")}{!x.fresh ? " · richtprijs" : ""}</>}
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
                <button onClick={() => openShopUrl(WINKELS.drankdozijn.zoek(searchName))} style={{ background: "none", border: "none", padding: 0, color: BRASS_TEXT, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: sans }}>Drankdozijn</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Zoek bij</div>
              <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "0 14px" }}>
                {["gall", "drankgigant", "dirckiii", "mitra", "drankdozijn"].map((k, i) => (
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
        <button onClick={() => setMenuOpen(v => !v)} aria-label="Meer opties" aria-expanded={menuOpen} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", color: HEADER_ACCENT }}>
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
          <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 16, padding: 16, marginBottom: 14 }}>
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
                    width: "100%", minHeight: 46, borderRadius: 12, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT,
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
        {/* Gall & Gall: geen prijzen in de app, wel elke fles met één tik
            opzoeken — voor wie liever langs de winkel gaat. */}
        {(() => {
          const gallKey = (r) => `gall-${r.item.key}`;
          const todo = items.filter(r => !openedLinks.has(gallKey(r)));
          const open = (r) => { setOpenedLinks(prev => new Set(prev).add(gallKey(r))); openShopUrl(WINKELS.gall.zoek(r.option.fles.naam)); };
          return (
            <div style={{ background: CREAM, borderRadius: 16, marginBottom: 10, overflow: "hidden", border: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 14px 2px" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>Gall &amp; Gall</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, color: SAGE, background: "rgba(92,122,82,0.16)", borderRadius: 100, padding: "2px 8px" }}>Winkel in de buurt</span>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, padding: "0 14px 6px", lineHeight: 1.45 }}>Prijs bekijken in de webshop of winkel · niet meegerekend in de vergelijking</div>
              <div style={{ padding: "0 14px" }}>
                {items.map(r => (
                  <button key={r.item.key} onClick={() => open(r)} style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: 0, background: "none", border: "none",
                    borderTop: `1px solid ${PAPER_DEEP}`, cursor: "pointer", textAlign: "left", fontFamily: sans, color: INK,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.option.fles.naam}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: BOTTLE }}>Bekijk</span>
                    {openedLinks.has(gallKey(r)) ? <Check size={14} color={SAGE} strokeWidth={3} /> : <ExternalLink size={14} color={MUTED} />}
                  </button>
                ))}
              </div>
              <div style={{ padding: "10px 14px 14px" }}>
                <button onClick={() => open(todo[0] || items[0])} className="press-scale" style={{
                  width: "100%", minHeight: 46, borderRadius: 12, border: `1.5px solid ${BOTTLE}`, background: "none", color: BOTTLE,
                  fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer",
                }}>
                  {todo.length === items.length ? "Opzoeken bij Gall & Gall" : todo.length ? `Volgende: ${todo[0].option.fles.naam}` : "Alles bekeken"}
                </button>
              </div>
            </div>
          );
        })()}
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
            <div style={{ background: CREAM, border: "none", borderRadius: 16, overflow: "hidden", boxShadow: SHADOW_CARD }}>
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

// ---------- Bereidingsmodus ----------
// Schermvullend stap voor stap maken: klaarzetten (aantal glazen, wat je
// nodig hebt), afmeten met vinkjes, de stappen uit de bereidingstekst (met
// een timer bij shaken/roeren), afwerken en Proost. Donkergroen, grote tekst
// en grote knoppen voor natte handen; het scherm gaat intussen niet op slot.
const BEREID_BG = "#132622";
const BEREID_MUTED = "#A9B8B0";
const BEREID_GOLD = "#DDB877";
// Shaketijd per cocktail, voor de beste textuur en verdunning:
// gewone sour 12 s, room/zuivel 15 s, espresso 18 s (schuimlaag), eiwit
// eerst 15 s dry shake zonder ijs, over crushed ijs een korte whip shake,
// en de Ramos Gin Fizz extra lang.
const DAIRY_IDS = new Set(["heavy_cream", "milk", "coconut_cream", "irish_cream", "whipped_cream"]);
function shakeProfile(recipe) {
  const ids = new Set((recipe.ingredients || []).map(i => i.id));
  const m = (recipe.method || "").toLowerCase();
  const dryInMethod = /dry shake|zonder ijs (shaken|om het eiwit)/.test(m);
  const hasWhite = ids.has("egg_white") || ids.has("aquafaba");
  if (recipe.id === "ramos_gin_fizz" || /minstens een minuut/.test(m)) {
    return { dry: 30, wet: 60, why: "Extra lang: zo krijgt de fizz zijn dikke schuimkraag." };
  }
  if (dryInMethod || (hasWhite && !ids.has("egg_yolk"))) {
    return dryInMethod
      ? { dry: 15, wet: 12, why: "Met ijs nog eens hard shaken: nu wordt hij koud en goed verdund." }
      : { dry: null, wet: 15, why: "Extra lang voor een mooie schuimlaag." };
  }
  if (ids.has("egg_yolk") || ids.has("egg_nog") || /heel ei|hele ei/.test(m)) {
    return { dry: null, wet: 15, why: "Ei mengt pas goed na een lange, harde shake." };
  }
  if (ids.has("espresso") || /espresso/.test(m)) {
    return { dry: null, wet: 18, why: "Extra hard en lang voor de romige schuimlaag." };
  }
  if ([...ids].some(id => DAIRY_IDS.has(id))) {
    return { dry: null, wet: 15, why: "Iets langer voor een romige structuur." };
  }
  // Geshaket mét crushed ijs en ongezeefd ingeschonken: korte whip shake.
  // (Shaken met gewoon ijs en zeven óver crushed ijs blijft een normale shake.)
  if (/shake[^.]*met crushed|ongezeefd|whip shake/.test(m)) {
    return { dry: null, wet: 5, why: "Kort (whip shake): het crushed ijs gaat mee het glas in en verdunt verder." };
  }
  return { dry: null, wet: 12, why: "Hard shaken tot de shaker ijskoud aanvoelt." };
}
function stirSeconds(text) {
  const l = text.toLowerCase();
  if (/roer kort/.test(l)) return { sec: 10, why: "Kort roeren, alleen om te mengen." };
  if (/in het glas|in een rocks|over (een groot )?ijsblok/.test(l)) return { sec: 20, why: "Roeren in het glas: tot het koud is, zonder te veel te verdunnen." };
  return { sec: 30, why: "Rustig roeren tot het ijskoud is, zonder luchtbellen." };
}
function bereidTimerFor(text, recipe) {
  const l = text.toLowerCase();
  if (/shake|schud/.test(l)) { const p = shakeProfile(recipe || {}); return { sec: p.wet, why: p.why, kind: "shake" }; }
  if (/\broer/.test(l) && !/\bbouw/.test(l)) { const st = stirSeconds(text); return { ...st, kind: "roer" }; }
  return null;
}
function formatTimerClock(sec) {
  const v = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}
function buildBereidSteps(recipe) {
  const t = inferTechniques(recipe.method);
  const vessel = t.includes("shaken") ? "de shaker" : t.includes("stirred") ? "het mengglas" : t.includes("blend") ? "de blender" : "het glas";
  const steps = [{ kind: "klaar" }, { kind: "afmeten", vessel }];
  // "Shake … en dubbel zeven in een coupe" wordt twee stappen, zodat de
  // timer bij het shaken/roeren hoort en het afschenken een eigen stap is.
  const parts = [];
  splitMethodIntoSteps(recipe.method).forEach(text => {
    const m = text.match(/^(.*?\b(?:shake|roer)\b.*?)\s+en\s+((?:dubbel\s+)?(?:zeef|zeven|giet|schenk)\b.*)$/i);
    if (m) { parts.push(m[1].replace(/[,\s]+$/, "") + "."); parts.push(m[2].charAt(0).toUpperCase() + m[2].slice(1)); }
    else parts.push(text);
  });
  const profile = shakeProfile(recipe);
  let dryDone = false;
  parts.forEach(text => {
    const tm = bereidTimerFor(text, recipe);
    // Eiwit: eerst een eigen stap "Dry shake" zonder ijs, dan met ijs.
    // De losse "shake dan met ijs"-zin zit al in de stap hierboven.
    if (tm?.kind === "shake" && dryDone) return;
    if (tm?.kind === "shake" && profile.dry && !dryDone) {
      dryDone = true;
      steps.push({ kind: "tekst", label: "Dry shake", timer: profile.dry,
        text: "Shake eerst zonder ijs, met de deksel stevig dicht.", why: "Zonder ijs klopt het eiwit op tot een stevig schuim." });
      steps.push({ kind: "tekst", label: "Shaken", timer: profile.wet,
        text: "Vul de shaker met ijs en shake nog eens stevig.", why: tm.why });
      return;
    }
    const pour = !tm && /^(dubbel\s+)?(zeef|zeven|giet|schenk)/i.test(text);
    steps.push({ kind: "tekst", text, timer: tm?.sec || null, why: tm?.why || null,
      label: tm?.kind === "shake" ? (tm.sec <= 5 ? "Whip shake" : "Shaken") : tm ? "Roeren" : pour ? "Afschenken" : "Bereiden" });
  });
  if (recipe.garnish && !/^geen garnering/i.test(recipe.garnish.trim())) steps.push({ kind: "tekst", label: "Afwerken", text: recipe.garnish });
  steps.push({ kind: "proost" });
  return steps;
}
function bereidTools(recipe, servings) {
  const m = (recipe.method || "").toLowerCase();
  const t = inferTechniques(recipe.method);
  const out = [];
  if (t.includes("shaken")) out.push("Shaker");
  if (t.includes("stirred")) out.push("Mengglas en barlepel");
  if (t.includes("blend")) out.push("Blender");
  if (t.includes("muddle") || /muddel|kneus|stamp/.test(m)) out.push("Stamper");
  out.push("Jigger of maatbeker");
  if (/zeef|zeven/.test(m)) out.push(/dubbel/.test(m) ? "Zeef en fijne zeef" : "Zeef");
  if (/ijs/.test(m)) out.push(/crushed/.test(m) ? "Crushed ijs" : "Ijs");
  const glass = (recipe.glass || "glas").split("(")[0].trim().toLowerCase();
  out.push(`${servings} × ${glass}${/gekoeld/.test(m) ? ", koel ze alvast in de vriezer" : ""}`);
  return out;
}
function BereidModus({ recipe, ingredientLabel, allIngredients, initialServings = 1, onClose, onCheckin, onSound }) {
  useBodyScrollLock();
  const steps = useMemo(() => buildBereidSteps(recipe), [recipe]);
  const [idx, setIdx] = useState(0);
  const [servings, setServings] = useState(Math.max(1, initialServings));
  const [checked, setChecked] = useState(() => new Set());
  const [left, setLeft] = useState(null);
  const [running, setRunning] = useState(false);
  const endRef = useRef(0);
  const startedAt = useRef(Date.now());
  const step = steps[idx];
  const bodyRef = useRef(null);

  useEffect(() => { setKeepAwake(true); return () => { setKeepAwake(false); }; }, []);
  // Nieuwe stap: timer klaarzetten (nog niet lopend) en bovenaan beginnen.
  useEffect(() => {
    setRunning(false);
    setLeft(step.timer || null);
    bodyRef.current?.scrollTo?.(0, 0);
  }, [idx]);
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const rest = Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) { setRunning(false); hapticFor("timer"); onSound?.("chime"); }
    }, 200);
    return () => clearInterval(iv);
  }, [running]);
  const startTimer = () => { endRef.current = Date.now() + (left > 0 ? left : step.timer) * 1000; if (!(left > 0)) setLeft(step.timer); setRunning(true); onSound?.("tick"); };
  const resetTimer = () => { setRunning(false); setLeft(step.timer); };

  const toggle = (key) => { onSound?.("tick"); setChecked(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };
  const go = (d) => { onSound?.("pop"); setIdx(i => Math.min(steps.length - 1, Math.max(0, i + d))); };
  const amountOf = (ing) => {
    const a = scaleAmount(ing.amount, ing.unit, servings);
    return `${formatDutchNumber(a)} ${unitLabel(ing.unit, a)}`;
  };
  const total = steps.length - 1; // Proost telt niet als stap
  const isLast = idx === steps.length - 2;

  const checkCircle = (on, size = 28) => (
    <span style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      ...(on ? { background: BRASS } : { boxShadow: "inset 0 0 0 2px rgba(251,246,234,0.3)" }),
    }}>{on && <Check size={size * 0.55} color={BEREID_BG} strokeWidth={3} />}</span>
  );
  const sectionLabel = (t) => <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: BEREID_MUTED, margin: "18px 0 0" }}>{t}</div>;
  const kicker = (t) => <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: BEREID_GOLD, marginBottom: 10 }}>{t}</div>;
  const bigText = (t, size = 32) => <div style={{ fontFamily: serif, fontSize: size, fontWeight: 700, lineHeight: 1.2, color: HEADER_TEXT }}>{t}</div>;
  const listRow = (key, label, amount, last) => {
    const on = checked.has(key);
    return (
      <button key={key} onClick={() => toggle(key)} style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "11px 0", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: sans,
        borderBottom: last ? "none" : "1px solid rgba(251,246,234,0.1)",
      }}>
        {checkCircle(on)}
        <span style={{ flex: 1, fontSize: 16.5, color: HEADER_TEXT, opacity: on ? 0.55 : 1, textDecoration: on ? "line-through" : "none" }}>{label}</span>
        {amount && <span style={{ fontSize: 16, fontWeight: 700, color: BEREID_GOLD, flexShrink: 0 }}>{amount}</span>}
      </button>
    );
  };

  let body = null;
  if (step.kind === "klaar") {
    const tools = bereidTools(recipe, servings);
    body = (
      <>
        {kicker("Klaarzetten")}
        {bigText("Zet alles klaar", 34)}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, padding: "10px 12px 10px 16px", borderRadius: 14, background: "rgba(251,246,234,0.07)" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: HEADER_TEXT }}>Aantal glazen</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {[[-1, "−", "Minder glazen"], [1, "+", "Meer glazen"]].map(([d, sym, lab], i) => (
              <Fragment key={d}>
                {i === 1 && <span style={{ fontSize: 20, fontWeight: 800, color: HEADER_TEXT, minWidth: 18, textAlign: "center" }}>{servings}</span>}
                <button onClick={() => { onSound?.("tick"); setServings(v => Math.min(12, Math.max(1, v + d))); }} aria-label={lab} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(251,246,234,0.12)", color: HEADER_TEXT, fontSize: 20, cursor: "pointer" }}>{sym}</button>
              </Fragment>
            ))}
          </span>
        </div>
        {sectionLabel("Ingrediënten")}
        {recipe.ingredients.map((ing, i) => listRow(`k-${i}`, `${ingredientLabel(ing)}${ing.optional ? " (optioneel)" : ""}`, amountOf(ing), i === recipe.ingredients.length - 1))}
        {sectionLabel("Gereedschap")}
        {tools.map((t, i) => listRow(`t-${i}`, t, null, i === tools.length - 1))}
      </>
    );
  } else if (step.kind === "afmeten") {
    body = (
      <>
        {kicker("Afmeten")}
        {bigText(`Meet af in ${step.vessel}`, 34)}
        <div style={{ fontSize: 16, lineHeight: 1.5, color: BEREID_MUTED, marginTop: 10 }}>Tik aan wat erin zit, dan raak je de tel niet kwijt.</div>
        <div style={{ marginTop: 22 }}>
          {recipe.ingredients.map((ing, i) => {
            const on = checked.has(`p-${i}`);
            return (
              <button key={i} onClick={() => toggle(`p-${i}`)} style={{
                display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px", marginBottom: 10, borderRadius: 16, border: "none", cursor: "pointer", textAlign: "left", fontFamily: sans,
                background: on ? "rgba(184,134,46,0.16)" : "rgba(251,246,234,0.07)",
              }}>
                <span style={{ fontFamily: serif, fontSize: 26, fontWeight: 700, color: BEREID_GOLD, minWidth: 96 }}>{amountOf(ing)}</span>
                <span style={{ flex: 1, fontSize: 18, fontWeight: 600, color: HEADER_TEXT }}>{ingredientLabel(ing)}</span>
                {checkCircle(on, 30)}
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (step.kind === "tekst") {
    const R = 104, C = 2 * Math.PI * R;
    const frac = step.timer ? (left ?? step.timer) / step.timer : 0;
    body = (
      <>
        {kicker(step.label)}
        {bigText(scaleStepText(step.text, servings), step.text.length > 90 ? 26 : 30)}
        {step.timer && (
          <>
            <svg width="250" height="250" viewBox="0 0 250 250" style={{ display: "block", margin: "26px auto 0" }} aria-label={`Nog ${left} seconden`}>
              <circle cx="125" cy="125" r={R} fill="none" stroke="rgba(251,246,234,0.12)" strokeWidth="12" />
              <circle cx="125" cy="125" r={R} fill="none" stroke={BRASS} strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 125 125)" style={{ transition: "stroke-dasharray 0.2s linear" }} />
              <text x="125" y="130" textAnchor="middle" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" fontSize="64" fill={HEADER_TEXT}>{formatTimerClock(left ?? step.timer)}</text>
              <text x="125" y="164" textAnchor="middle" fontFamily={sans} fontWeight="600" fontSize="14" fill={BEREID_MUTED}>{left === 0 ? "klaar" : `van ${step.timer} seconden`}</text>
            </svg>
            {step.why && <p style={{ textAlign: "center", fontFamily: sans, fontSize: 14.5, lineHeight: 1.45, color: BEREID_MUTED, margin: "10px auto 0", maxWidth: 300 }}>{step.why}</p>}
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16 }}>
              <button onClick={running ? () => setRunning(false) : startTimer} style={{ display: "flex", alignItems: "center", gap: 8, height: 48, padding: "0 22px", borderRadius: 100, border: "none", background: running ? "rgba(251,246,234,0.1)" : HEADER_TEXT, color: running ? HEADER_TEXT : BEREID_BG, fontFamily: sans, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                {running ? "Pauze" : left > 0 && left < step.timer ? "Verder" : "Start timer"}
              </button>
              <button onClick={resetTimer} style={{ display: "flex", alignItems: "center", gap: 8, height: 48, padding: "0 20px", borderRadius: 100, border: "none", background: "rgba(251,246,234,0.1)", color: HEADER_TEXT, fontFamily: sans, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                <RotateCcw size={16} /> Opnieuw
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  const mins = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
  // Vegen tussen de stappen: naar rechts = vorige stap (bij de eerste stap:
  // stoppen), naar links = volgende stap — net als door foto's bladeren.
  const swipeStart = useRef(null);
  const stepSwipe = {
    onTouchStart: (e) => { swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e) => {
      const s0 = swipeStart.current; swipeStart.current = null;
      if (!s0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x, dy = t.clientY - s0.y;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      if (dx > 0) { if (idx > 0) go(-1); else onClose(); }
      else { if (isLast) onSound?.("clink"); go(1); }
    },
  };
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: BEREID_BG, color: HEADER_TEXT, fontFamily: sans, display: "flex", flexDirection: "column" }}>
      {step.kind !== "proost" && (
        <div style={{ padding: "calc(env(safe-area-inset-top) + 6px) 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onClose} aria-label="Stoppen" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(251,246,234,0.1)", color: HEADER_TEXT, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={19} /></button>
            <span style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{recipe.name}</span>
            <span style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 700, color: BEREID_MUTED }}>{idx + 1}/{total}</span>
          </div>
          <div style={{ display: "flex", gap: 5, padding: "14px 4px 0" }} aria-hidden>
            {Array.from({ length: total }, (_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= idx ? BRASS : "rgba(251,246,234,0.16)" }} />)}
          </div>
        </div>
      )}

      {step.kind === "proost" ? (
        <>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "calc(env(safe-area-inset-top) + 60px) 22px 0", textAlign: "center" }}>
            <div style={{ width: 180, height: 180, margin: "0 auto", borderRadius: "50%", boxShadow: `0 0 0 4px ${BEREID_BG}, 0 0 0 6px ${BRASS}`, overflow: "hidden" }}>
              <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={180} />
            </div>
            <div style={{ fontFamily: serif, fontSize: 40, fontWeight: 700, marginTop: 28 }}>Proost!</div>
            <div style={{ fontSize: 16, color: BEREID_MUTED, marginTop: 8, lineHeight: 1.5 }}>
              {servings === 1 ? `${recipe.name} is klaar` : `${servings} glazen ${recipe.name} zijn klaar`}, in {mins} minu{mins === 1 ? "ut" : "ten"}.
            </div>
          </div>
          <div style={{ padding: "14px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", flexDirection: "column", gap: 10 }}>
            {onCheckin && (
              <button onClick={() => { onClose(); onCheckin(recipe.name); }} className="press-scale" style={{ height: 56, borderRadius: 16, border: "none", background: HEADER_TEXT, color: BEREID_BG, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: sans, fontWeight: 800, fontSize: 16.5, cursor: "pointer" }}>
                <Plus size={18} strokeWidth={2.6} /> Inchecken
              </button>
            )}
            <button onClick={() => { setChecked(new Set()); startedAt.current = Date.now(); setIdx(1); }} className="press-scale" style={{ height: 52, borderRadius: 16, border: "none", boxShadow: "inset 0 0 0 1.5px rgba(251,246,234,0.28)", background: "transparent", color: HEADER_TEXT, fontFamily: sans, fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>Nog een ronde</button>
            <button onClick={onClose} style={{ height: 44, border: "none", background: "none", color: BEREID_MUTED, fontFamily: sans, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Terug naar het recept</button>
          </div>
        </>
      ) : (
        <>
          <div ref={bodyRef} key={idx} className="tab-fade" {...stepSwipe} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", padding: "26px 22px 16px", touchAction: "pan-y" }}>
            {body}
          </div>
          <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", gap: 10 }}>
            {idx > 0 && (
              <button onClick={() => go(-1)} className="press-scale" style={{ flex: "0 0 34%", height: 56, borderRadius: 16, border: "none", boxShadow: "inset 0 0 0 1.5px rgba(251,246,234,0.28)", background: "transparent", color: HEADER_TEXT, fontFamily: sans, fontWeight: 700, fontSize: 16, cursor: "pointer" }}>Vorige</button>
            )}
            <button onClick={() => { if (isLast) onSound?.("clink"); go(1); }} className="press-scale" style={{ flex: 1, height: 56, borderRadius: 16, border: "none", background: HEADER_TEXT, color: BEREID_BG, fontFamily: sans, fontWeight: 800, fontSize: 16.5, cursor: "pointer" }}>
              {idx === 0 ? "Begin" : isLast ? "Klaar" : "Volgende"}
            </button>
          </div>
        </>
      )}
    </div>
  ), document.body);
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
  const [bereidOpen, setBereidOpen] = useState(false);
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
  const recipe = recipes.find(r => r.id === canonicalRecipeId(selectedId)) || null;
  const missing = recipe ? recipe.ingredients.filter(ing => !ing.optional).filter(ing => !isOwned(ing)) : [];
  const role = recipe ? getMenuRole(recipe) : null;
  const roleInfo = role ? MENU_ROLES[role] : null;
  const techniques = recipe ? inferTechniques(recipe.method) : [];
  const garnishes = recipe ? inferGarnishes(recipe, allIngredients) : null;
  const { STORIES, STEPS, loaded: textsLoaded } = useRecipeTexts();
  const steps = recipe ? (STEPS[recipe.id] || splitMethodIntoSteps(recipe.method)) : [];
  const story = recipe
    ? (STORIES[recipe.id] || (!textsLoaded ? "" : `Nog geen verhaal bekend over deze cocktail: een ${(recipe.family || "eigen creatie").toLowerCase()} op basis van ${recipe.ingredients[0] ? ingredientLabel(recipe.ingredients[0]) : "jouw eigen ingrediënten"}. Schrijf zelf de anekdote erbij als je 'm serveert!`))
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
                background: BOTTLE_DARK, boxShadow: SHADOW_HERO, color: HEADER_TEXT, fontFamily: sans,
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
                    background: CREAM, border: "none", borderRadius: 14, boxShadow: SHADOW_CARD,
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
            color: HEADER_TEXT, boxShadow: SHADOW_CARD, fontFamily: sans, boxSizing: "border-box",
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
                      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 14, color: ON_DARK_TEXT, lineHeight: 1.2 }}>{r.name}</div>
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
          <HeaderNavBar backLabel={backLabel} onBack={goBack} title={recipe.name} />
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
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: ON_DARK_TEXT,
            }}>
              <Heart size={16} fill={favoriteRecipeIds.includes(recipe.id) ? ON_DARK_TEXT : "none"} />
            </button>
            <div style={{ flex: "1 1 260px", position: "relative", zIndex: 1, padding: heroPhoto ? "26px" : 0 }}>
              <div className="hero-text-in" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.75)", marginBottom: 8, animationDelay: "0.1s" }}>{roleInfo.label}</div>
              <h2 className="hero-text-in" style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, color: ON_DARK_TEXT, margin: "0 0 6px", animationDelay: "0.18s" }}>{recipe.name}</h2>
              <div className="hero-text-in" style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 16, animationDelay: "0.26s" }}>{recipe.family} · {recipe.glass}</div>
              <p className="hero-text-in" style={{ fontFamily: systemFont, fontSize: 15.5, color: ON_DARK_TEXT, margin: 0, lineHeight: 1.5, animationDelay: "0.36s" }}>"{getSfeerQuote(recipe, role)}"</p>
            </div>
            {!heroPhoto && (
              <div className="glass-bounce-in" style={{ position: "relative", zIndex: 1, margin: "0 auto" }}>
                <GlassArt glass={recipe.glass} colors={getLiquidColor(recipe, allIngredients)} garnishes={garnishes} rim={inferRim(recipe, allIngredients)} foam={inferFoam(recipe, allIngredients)} iceStyle={inferIceStyle(recipe)} plinth dropIn ambient size={168} />
              </div>
            )}
          </div>
          ); })()}

          <FriendsRecipeRow recipe={recipe} allIngredients={allIngredients}
            onMake={() => { onSound("pop"); setBereidOpen(true); }} style={{ margin: "-8px 0 24px" }} />

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
                <button onClick={() => setServings(s => Math.max(1, s - 1))} style={{ width: 26, height: 26, borderRadius: 10, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>−</button>
                <div style={{ width: 20, textAlign: "center", fontWeight: 700, fontSize: 14.5, fontFamily: systemFont, color: BOTTLE }}>{servings}</div>
                <button onClick={() => setServings(s => Math.min(24, s + 1))} style={{ width: 26, height: 26, borderRadius: 10, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>+</button>
              </div>
            </div>
          </div>
          <MissingSummary missing={missing} ingredientLabel={ingredientLabel} />
          <ul style={{ margin: "0 0 14px", paddingLeft: 0, listStyle: "none", fontSize: 15.5 }}>
            {recipe.ingredients.map((ing, i) => {
              const scaled = scaleAmount(ing.amount, ing.unit, servings);
              const owned = isOwned(ing);
              return (
                <li key={i} className="ingredient-reveal" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < recipe.ingredients.length - 1 ? `1px dotted ${BORDER}` : "none", animationDelay: `${0.44 + Math.min(i, 8) * 0.05}s` }}>
                  <OwnedMark owned={owned} optional={ing.optional} />
                  <span style={{ flex: 1, minWidth: 0, color: owned || ing.optional ? INK : BURGUNDY, fontWeight: owned || ing.optional ? 400 : 600 }}>
                    {ingredientLabel(ing)}{ing.optional ? " (optioneel)" : ""}
                    {!owned && !ing.optional && <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: BURGUNDY, marginTop: 1 }}>Ontbreekt</span>}
                  </span>
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
                border: "none", borderRadius: 100, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
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
                <button onClick={addMissingToShopping} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 100, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
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
                border: `1px solid ${feestChosen?.includes(recipe.id) ? BORDER : BOTTLE}`,
                color: feestChosen?.includes(recipe.id) ? MUTED : BOTTLE, borderRadius: 100, padding: "9px 13px", fontSize: 12.5, fontWeight: 700,
                cursor: feestChosen?.includes(recipe.id) ? "default" : "pointer",
              }}>
                <PartyPopper size={14} /> {feestChosen?.includes(recipe.id) ? "Al in feestplanner" : "Voeg toe aan feestplanner"}
              </button>
            )}
            {batchOpener.current && (
              <button onClick={() => batchOpener.current(recipe.id)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE,
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
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED, marginBottom: 3 }}>Afwerking</div>
                    <p style={{ fontFamily: systemFont, fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>{highlightIngredientMentions(scaleStepText(recipe.garnish, servings), recipe, allIngredients)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <MatigheidRegel style={{ marginTop: 22 }} />
          {/* Bereidingsmodus: vaste knop onderaan het recept. */}
          <div style={{ position: "sticky", bottom: "calc(env(safe-area-inset-bottom) + 96px)", zIndex: 6, marginTop: 24, pointerEvents: "none" }}>
            <button onClick={() => { onSound("pop"); setBereidOpen(true); }} className="press-scale" style={{
              pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", height: 56, borderRadius: 16, border: "none",
              background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 16.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px -8px rgba(19,38,34,0.6)",
            }}>
              <Play size={17} fill="currentColor" /> Ik ga maken
            </button>
          </div>
          {bereidOpen && (
            <BereidModus recipe={recipe} ingredientLabel={ingredientLabel} allIngredients={allIngredients} initialServings={servings}
              onClose={() => setBereidOpen(false)} onCheckin={onOpenCheckin} onSound={onSound} />
          )}
        </EdgeSwipeBackArea>
      )}
    </div>
  );
}


// Slagen = minstens 80% goed (4 van 5 per les, 24 van 30 bij de eindtoets).
export const QUIZ_PASS_RATIO = 0.8;


export function ConfirmDialog({ title, message, cancelLabel = "Annuleer", confirmLabel, confirmColor = BURGUNDY, busy, onCancel, onConfirm }) {
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
            color: INK, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: systemFont,
          }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={busy} className="press-scale" style={{
            flex: 1, minHeight: 44, borderRadius: RADIUS, border: "none", background: confirmColor,
            color: CREAM, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: systemFont,
          }}>
            {busy ? "Bezig…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


 


export function MenuToggleRow({ title, subtitle, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 64, boxSizing: "border-box", padding: "12px 14px", background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 14, marginTop: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}


// "3.0" voor een heel getal, "3.25"/"3.5"/"3.75" voor een kwart-ster —
// overal waar een beoordeling getoond wordt, i.p.v. het vaste "{rating}.0"
// dat alleen bij hele sterren klopte.
// Beoordelingen en gemiddelden overal hetzelfde: hele getallen zonder
// decimaal ("4"), anders één decimaal met komma ("3,8" — ook 2.25 → "2,3").
export function formatRating(value) {
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
export function AutoGrowTextField({ value, onChange, placeholder, bare, onFocus, onBlur, minRows = 1 }) {
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
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} placeholder={placeholder} rows={minRows} style={{
      width: "100%", border: "none", outline: "none", resize: "none", background: bare ? "transparent" : PAPER, borderRadius: 12,
      padding: bare ? "10px 0" : "13px 14px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box",
      lineHeight: 1.4, overflow: "hidden", display: "block", scrollMarginTop: 70, scrollMarginBottom: 24,
    }} />
  );
}

function fieldStyle() {
  return { width: "100%", padding: "9px 10px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, boxSizing: "border-box", background: CREAM, fontFamily: sans, color: INK };
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

export const KORTE_MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function formatCheckinDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${KORTE_MAANDEN[m - 1]} ${y}`;
}

// Cocktailfamilie → smaakdimensie: een bewust eenvoudige, transparante
// toewijzing op basis van het bestaande `family`-veld (geen smaakscheikunde),
// zodat het smaakprofiel altijd op echte check-in-data is gebaseerd i.p.v.
// verzonnen cijfers.
export const FAMILY_TASTE = {
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
export const TASTE_META = {
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
            <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 15, color: BRASS_TEXT }}>{RATING_WORDS[shown]}</span>
          </>
        ) : (
          <span style={{ fontFamily: systemFont, fontSize: 15, color: MUTED }}>Hoe was 'ie?</span>
        )}
      </div>
      <div style={{ fontFamily: systemFont, fontSize: 12, color: MUTED, marginTop: 2 }}>Tik op een ster · nog een keer tikken = halve ster</div>
    </div>
  );
}

// Cijfer bij het inchecken: vegen over de sterren (of tikken) in halve
// stappen, met een tikje (haptiek) bij elke halve ster, zoals Untappd. Elke
// ster is een even brede cel zonder tussenruimte, zodat de vingerpositie
// precies op een halve of hele ster valt. touch-action pan-y: verticaal
// scrollen blijft gewoon werken, horizontaal vegen is voor de sterren.
function SwipeStars({ value, onChange, onSound }) {
  const rowRef = useRef(null);
  const lastRef = useRef(value);
  lastRef.current = value;
  const dragRef = useRef(false);
  const cell = 52, star = 42;
  const valueAt = (clientX) => {
    const r = rowRef.current.getBoundingClientRect();
    const f = (clientX - r.left) / r.width;
    return Math.min(5, Math.max(0.5, Math.ceil(f * 10) / 2));
  };
  const set = (v) => {
    if (v === lastRef.current) return;
    lastRef.current = v;
    onSound?.("tick");
    onChange(v);
  };
  const shown = value > 0 ? Math.min(5, Math.max(1, Math.round(value))) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minHeight: 50 }}>
        {value > 0 ? (
          <>
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, lineHeight: 1.1, color: INK }}>{value.toFixed(1).replace(".", ",")}</span>
            <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: BRASS_TEXT }}>{RATING_WORDS[shown]}</span>
          </>
        ) : (
          <span style={{ fontFamily: systemFont, fontSize: 16, color: MUTED, alignSelf: "center" }}>Hoe was 'ie?</span>
        )}
      </div>
      <div ref={rowRef} role="slider" aria-label="Cijfer" aria-valuemin={0} aria-valuemax={5} aria-valuenow={value} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(Math.min(5, (value || 0) + 0.5)); }
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(Math.max(0.5, (value || 1) - 0.5)); }
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => { dragRef.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); set(valueAt(e.clientX)); }}
        onPointerMove={(e) => { if (dragRef.current) set(valueAt(e.clientX)); }}
        onPointerUp={() => { dragRef.current = false; }}
        onPointerCancel={() => { dragRef.current = false; }}
        style={{ display: "flex", touchAction: "pan-y", cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", outline: "none", marginTop: 4 }}>
        {[1, 2, 3, 4, 5].map(n => {
          const filled = Math.min(1, Math.max(0, value - (n - 1)));
          return (
            <div key={n} style={{ width: cell, height: cell, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ position: "relative", width: star, height: star }}>
                <Star size={star} color="#C9BC9C" strokeWidth={1.4} style={{ display: "block" }} />
                {filled > 0 && (
                  <div style={{ position: "absolute", inset: 0, width: `${filled * 100}%`, overflow: "hidden" }}>
                    <Star size={star} fill={BRASS} color={BRASS} strokeWidth={1.4} style={{ display: "block" }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: systemFont, fontSize: 12, color: MUTED, marginTop: 4 }}>Veeg of tik · halve sterren kan ook</div>
    </div>
  );
}

// Schermvullende kop van de incheckflow: groen, links Annuleer/Terug,
// titel in het midden, rechts de actie (Plaats, Klaar, Gereed).
function CheckinTopBar({ leftLabel, leftBack, onLeft, title, rightLabel, rightDisabled, onRight, children }) {
  return (
    <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, paddingTop: "env(safe-area-inset-top)", flexShrink: 0, borderBottom: children ? "none" : `2px solid ${BRASS}` }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", height: 50, padding: "0 12px" }}>
        <button onClick={onLeft} className="tap-target-44" style={{
          display: "flex", alignItems: "center", gap: 1, background: "none", border: "none", cursor: "pointer",
          padding: "10px 4px", color: HEADER_ACCENT, fontFamily: systemFont, fontSize: 16, fontWeight: 600, whiteSpace: "nowrap",
        }}>
          {leftBack && <ChevronLeft size={22} strokeWidth={2.2} style={{ flexShrink: 0 }} />}
          {leftLabel}
        </button>
        <div style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)", maxWidth: "calc(100% - 200px)", pointerEvents: "none",
          fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: HEADER_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{title}</div>
        {rightLabel ? (
          <button onClick={onRight} disabled={rightDisabled} className="press-scale" style={{
            minWidth: 70, height: 34, padding: "0 16px", borderRadius: 100, border: "none",
            background: rightDisabled ? "rgba(251,246,234,0.14)" : "#DDB877", color: rightDisabled ? "rgba(251,246,234,0.45)" : "#132622",
            fontFamily: systemFont, fontSize: 15, fontWeight: 700, cursor: rightDisabled ? "default" : "pointer", transition: "background 0.15s ease, color 0.15s ease",
          }}>{rightLabel}</button>
        ) : <span style={{ width: 70 }} />}
      </div>
      {children}
    </div>
  );
}

// Stap 1: cocktail kiezen. Het zoekveld staat bovenaan het scherm (in de
// groene kop), de resultaten eronder — er hoeft niets te verschuiven als het
// toetsenbord opkomt. Geen exacte match? Dan kun je toch inchecken onder de
// naam die je typte.
function CheckinSearchStep({ recipes, allIngredients, recent, initialQuery, onPick, onCancel, cancelLabel, cancelBack }) {
  const [query, setQuery] = useState(initialQuery || "");
  const inputRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(t);
  }, []);
  const sorted = useMemo(() => [...recipes].sort((a, b) => a.name.localeCompare(b.name)), [recipes]);
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const starts = [], contains = [];
    for (const r of sorted) {
      const n = r.name.toLowerCase();
      if (n.startsWith(q)) starts.push(r);
      else if (n.includes(q)) contains.push(r);
    }
    return [...starts, ...contains].slice(0, 50);
  }, [sorted, q]);
  const exact = q && sorted.some(r => r.name.toLowerCase() === q);
  useSearchMiss(query, q ? results.length : -1);
  const pick = (name) => { inputRef.current?.blur(); onPick(name); };
  const row = (r) => (
    <button key={r.id} onClick={() => pick(r.name)} className="list-row-tap" style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 16px", background: "none", border: "none",
      borderBottom: `1px solid ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: systemFont,
    }}>
      <RecipeCircle recipe={r} allIngredients={allIngredients} size={42} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
        {r.family && <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{r.family}</span>}
      </span>
    </button>
  );
  // Geen exacte match: toch inchecken onder de getypte naam. Zonder
  // resultaten bovenaan, anders onder de lijst.
  const customRow = !exact && (
              <button onClick={() => pick(query.trim())} className="list-row-tap" style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 16px", background: "none", border: "none",
                borderBottom: `1px solid ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: systemFont,
              }}>
                <span style={{ width: 42, height: 42, borderRadius: "50%", background: PAPER_DEEP, border: `1.5px dashed ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Plus size={18} color={BOTTLE} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Inchecken als '{query.trim()}'</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>Staat er niet tussen? Gebruik deze naam</span>
                </span>
              </button>
  );
  const sectionLabel = (text) => (
    <div style={{ padding: "16px 16px 6px", fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED, fontFamily: systemFont }}>{text}</div>
  );
  return (
    <>
      <CheckinTopBar leftLabel={cancelLabel} leftBack={cancelBack} onLeft={onCancel} title="Kies je cocktail">
        <div style={{ padding: "4px 16px 14px", borderBottom: `2px solid ${BRASS}` }}>
          <div style={{ position: "relative" }}>
            <Search size={17} color={MUTED} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek een cocktail"
              enterKeyHint="search" autoCapitalize="words" autoCorrect="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (results[0] && results[0].name.toLowerCase() === q) pick(results[0].name); else e.currentTarget.blur(); } }}
              style={{
                width: "100%", border: "none", outline: "none", background: CREAM, borderRadius: 12,
                padding: "12px 38px 12px 38px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box",
              }} />
            {query && (
              <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Wis zoekterm" style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 30, height: 30, borderRadius: "50%",
                border: "none", background: "none", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}><X size={16} /></button>
            )}
          </div>
        </div>
      </CheckinTopBar>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {q ? (
          <>
            {results.length === 0 && customRow}
            {results.map(row)}
            {results.length > 0 && customRow}
            {results.length === 0 && (
              <div style={{ padding: "18px 16px", fontSize: 14, color: MUTED, fontFamily: systemFont }}>Geen recept gevonden met '{query.trim()}'.</div>
            )}
          </>
        ) : (
          <>
            {recent.length > 0 && <>{sectionLabel("Laatst gemaakt")}{recent.map(row)}</>}
            {sectionLabel("Alle cocktails")}
            {sorted.slice(0, 60).map(row)}
            <div style={{ padding: "14px 16px 24px", fontSize: 13, color: MUTED, fontFamily: systemFont, textAlign: "center" }}>Typ om alle {sorted.length} recepten te doorzoeken</div>
          </>
        )}
      </div>
    </>
  );
}

// Stap "Met wie": vrienden taggen op een eigen scherm (ruimte genoeg, geen
// horizontale rij onder het toetsenbord).
function CheckinFriendsStep({ friends, taggedIds, onToggle, onDone }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = friends || [];
  const shown = q ? list.filter(f => (f.name || "").toLowerCase().includes(q)) : list;
  return (
    <>
      <CheckinTopBar leftLabel="Terug" leftBack onLeft={onDone} title="Met wie?" rightLabel="Klaar" onRight={onDone}>
        {list.length > 6 && (
          <div style={{ padding: "4px 16px 14px", borderBottom: `2px solid ${BRASS}` }}>
            <div style={{ position: "relative" }}>
              <Search size={17} color={MUTED} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Zoek een vriend" enterKeyHint="search" autoCorrect="off"
                style={{ width: "100%", border: "none", outline: "none", background: CREAM, borderRadius: 12, padding: "12px 14px 12px 38px", fontSize: 16, fontFamily: systemFont, color: INK, boxSizing: "border-box" }} />
            </div>
          </div>
        )}
      </CheckinTopBar>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {friends === null && <div style={{ padding: 18, fontSize: 14, color: MUTED, fontFamily: systemFont }}>Vrienden laden…</div>}
        {friends && friends.length === 0 && <div style={{ padding: 18, fontSize: 14, color: MUTED, fontFamily: systemFont, lineHeight: 1.5 }}>Je hebt nog geen vrienden in de app. Voeg ze toe via Profiel → Vrienden.</div>}
        {shown.map(f => {
          const on = taggedIds.includes(f.id);
          return (
            <button key={f.id} onClick={() => onToggle(f.id)} aria-pressed={on} className="list-row-tap" style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 16px", background: "none", border: "none",
              borderBottom: `1px solid ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: systemFont,
            }}>
              <Avatar name={f.name} photo={f.avatar_url} size={44} />
              <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: INK, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name || "Vriend"}</span>
              <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? BOTTLE : "none", border: on ? "none" : `1.5px solid ${BORDER}` }}>
                {on && <Check size={15} strokeWidth={3} color="#DDB877" />}
              </span>
            </button>
          );
        })}
        {q && shown.length === 0 && <div style={{ padding: 18, fontSize: 14, color: MUTED, fontFamily: systemFont }}>Geen vriend gevonden</div>}
        {list.length > 0 && (
          <div style={{ padding: "14px 16px 24px", fontSize: 12.5, color: MUTED, lineHeight: 1.5, fontFamily: systemFont }}>
            Wie je tagt ziet je check-in en kan 'm overnemen met een eigen cijfer.
          </div>
        )}
      </div>
    </>
  );
}

// Stap "Locatie": snelle keuzes en zoeken naar een plek, met de resultaten
// gewoon in het scherm (geen zwevende lijst).
function CheckinLocationStep({ location, onChange, onDone }) {
  return (
    <>
      <CheckinTopBar leftLabel="Terug" leftBack onLeft={onDone} title="Locatie" rightLabel="Klaar" onRight={onDone} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "18px 16px 24px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {["Thuis", "Bar", "Bij vrienden"].map(label => {
            const active = location === label;
            return (
              <button key={label} onClick={() => { onChange(label, null); onDone(); }} className="press-scale" style={{
                height: 40, padding: "0 16px", borderRadius: 100, border: `1px solid ${active ? BOTTLE : BORDER}`,
                background: active ? BOTTLE : CREAM, color: active ? CREAM : INK,
                fontFamily: systemFont, fontSize: 14.5, fontWeight: 600, cursor: "pointer",
              }}>{label}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 8, fontFamily: systemFont }}>Of zoek een plek</div>
        <PlaceAutocomplete value={["Thuis", "Bar", "Bij vrienden"].includes(location) ? "" : location}
          onChange={(text, place) => { onChange(text, place); if (place) onDone(); }} placeholder="Bar, adres of stad…" inline />
      </div>
    </>
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

// "Uitgespeeld" = alle lessen af én de eindtoets gehaald (≥ 80%).
export function computeCourseMastery(progress) {
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
export const COURSE_PART_COUNT = COURSE_PARTS.length;
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
export function computeCourseRank(progress) {
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
export function courseRankHint(r) {
  if (r.master) return "Gediplomeerd: alle delen en de eindtoets";
  if (r.index === 3) return "Haal de eindtoets voor Meester";
  const target = r.index < 1 ? 1 : r.index === 1 ? 3 : COURSE_PART_COUNT;
  const left = target - r.partsDone;
  return `Nog ${left} ${left === 1 ? "deel" : "delen"} tot ${COURSE_RANKS[r.index < 1 ? 1 : r.index + 1].name}`;
}

// Meestergoud: alleen voor wie de eindtoets heeft gehaald. Een metaalachtig
// verloop (geborsteld goud) i.p.v. het vlakke BRASS van de rest van de app.
const MASTER_GOLD = "linear-gradient(135deg, #7A5414 0%, #C8963A 26%, #F3DC9B 50%, #C8963A 74%, #8A6118 100%)";
const MASTER_GOLD_STOPS = [["0%", "#7A5414"], ["26%", "#C8963A"], ["50%", "#F3DC9B"], ["74%", "#C8963A"], ["100%", "#8A6118"]];
// Lichtere variant voor op donkergroen (anders valt het donkere begin weg).
const MASTER_GOLD_LIGHT = "linear-gradient(135deg, #C8963A 0%, #F6E3A8 45%, #E2B85E 70%, #F3DC9B 100%)";
const masterTextStyleLight = { background: MASTER_GOLD_LIGHT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" };
const masterTextStyle = { background: MASTER_GOLD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" };
function MasterSeal({ size = 18, border = 1.5 }) {
  return (
    <span aria-label="Meester" style={{
      width: size, height: size, borderRadius: "50%", background: MASTER_GOLD, border: `${border}px solid ${BOTTLE_DARK}`, boxSizing: "border-box",
      display: "inline-flex", alignItems: "center", justifyContent: "center", color: BOTTLE_DARK, flexShrink: 0,
    }}><GraduationCap size={Math.round(size * 0.55)} strokeWidth={2.2} /></span>
  );
}

// "Meester nr. 12": het hoeveelste diploma ooit in de app, op volgorde van
// course_completed_at. Faalt stil (dan tonen we geen nummer).
function useMasterNumber(completedAt) {
  const [n, setN] = useState(null);
  useEffect(() => {
    if (!completedAt) { setN(null); return; }
    let cancelled = false;
    supabase.from("profiles").select("id", { count: "exact", head: true })
      .not("course_completed_at", "is", null).lte("course_completed_at", completedAt)
      .then(({ count, error }) => { if (!cancelled && !error && count) setN(count); });
    return () => { cancelled = true; };
  }, [completedAt]);
  return n;
}
// Donkere "ledenkaart" achter de profielkop van een Meester.
const MASTER_HEADER_STYLE = {
  position: "relative", overflow: "hidden", borderRadius: 22, padding: "20px 16px 14px", marginBottom: 18,
  background: `radial-gradient(ellipse 120% 90% at 15% 0%, #2A4B42, ${BOTTLE_DARK} 72%)`,
  border: "1px solid rgba(221,184,119,0.45)", boxShadow: "0 10px 28px -12px rgba(19,38,34,0.55)",
};
function MasterHeaderTitle({ number }) {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: MASTER_GOLD }} />
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 12, ...masterTextStyleLight }}>
        Meester{number ? ` · nr. ${number}` : ""}
      </div>
    </>
  );
}

// Profielfoto met de cursusring: zes stukken, één per afgerond deel. Met
// het diploma wordt de ring massief goud, met een zegel rechtsonder.
// size = totale buitenmaat, zodat hij overal 1-op-1 een Avatar vervangt.
export function CourseRing({ name, photo, size = 84, partsDone = 0, master = false, dark = false, seal = true, children }) {
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
  const gid = useId().replace(/:/g, "");
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden>
        {master ? (
          <>
            <defs>
              <linearGradient id={`mg${gid}`} x1="0" y1="0" x2="1" y2="1">
                {MASTER_GOLD_STOPS.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
              </linearGradient>
            </defs>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#mg${gid})`} strokeWidth={big ? stroke + 1.5 : stroke + 0.8} />
            {big && <circle cx={size / 2} cy={size / 2} r={r - stroke - 1.5} fill="none" stroke={`url(#mg${gid})`} strokeWidth={1} opacity={0.8} />}
            {/* Meester: een heel zachte glans in bijna dezelfde goudtint die
                langzaam rond de ring trekt — valt nauwelijks op, net een extra.
                Alleen bij de grote ring (profiel), niet in de feed. */}
            {big && (
              <g className="master-shine" style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E9C77E" strokeWidth={stroke + 2} strokeLinecap="round"
                  strokeDasharray={`${c * 0.18} ${c}`} opacity={0.22} style={{ filter: "blur(2px)" }} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EED6A0" strokeWidth={stroke + 0.5} strokeLinecap="round"
                  strokeDasharray={`${c * 0.07} ${c}`} transform={`rotate(${0.055 * 360} ${size / 2} ${size / 2})`} opacity={0.35} />
              </g>
            )}
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
        <span style={{ position: "absolute", right: big ? -2 : -3, bottom: big ? 0 : -2, display: "flex" }}>
          <MasterSeal size={big ? 30 : 18} border={big ? 2 : 1.5} />
        </span>
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
function CourseRankLabel({ courseRank, chip = false, onDark = false }) {
  if (!courseRank?.rank) return null;
  if (!chip) {
    if (courseRank.master) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", verticalAlign: "middle" }}>
          <MasterSeal size={14} border={1} />
          <span style={{ fontSize: 11.5, fontWeight: 800, ...masterTextStyle }}>Meester</span>
        </span>
      );
    }
    return <span style={{ fontSize: 11.5, fontWeight: 700, color: BRASS_TEXT, whiteSpace: "nowrap" }}>{courseRank.rank.name}</span>;
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 100, whiteSpace: "nowrap",
      background: courseRank.master ? MASTER_GOLD : onDark ? "rgba(221,184,119,0.16)" : BOTTLE_DARK, color: courseRank.master ? BOTTLE_DARK : onDark ? "#DDB877" : "#F1D9A6", fontSize: 12, fontWeight: 800,
      boxShadow: courseRank.master ? "0 2px 8px rgba(138,97,24,0.35)" : "none",
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
    <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: 16, marginBottom: 12 }}>
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
  const number = useMasterNumber(date || null);
  const when = date ? new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 16, padding: "16px 18px", marginBottom: 18,
      background: `radial-gradient(ellipse 140% 120% at 20% 0%, #2A4B42, ${BOTTLE_DARK} 75%)`, color: HEADER_TEXT,
      border: `1.5px solid ${BRASS}`, boxShadow: SHADOW_CARD,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
        <div style={{ width: 52, height: 52, borderRadius: "50%", background: MASTER_GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: BOTTLE_DARK, boxShadow: "0 3px 10px rgba(0,0,0,0.25)" }}><GraduationCap size={24} strokeWidth={1.9} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase", ...masterTextStyleLight }}>Diploma{number ? ` · Meester nr. ${number}` : ""}</div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, lineHeight: 1.2, marginTop: 2 }}>Gediplomeerd thuisbartender</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4, lineHeight: 1.4 }}>
            {isOwn ? "Je hebt" : "Heeft"} de cursus "Van Basis tot Pro" uitgespeeld{scorePct ? ` · eindtoets ${scorePct}%` : ""}{when ? ` · ${when}` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

export function computeCourseInsights(progress) {
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
    recipe: e.recipeId ? recipes.find(r => r.id === canonicalRecipeId(e.recipeId)) : recipes.find(r => r.name.toLowerCase() === e.name.trim().toLowerCase()),
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


export const GRONINGEN_VIEWBOX = "6.35,53.32,6.80,53.10";


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

function PlaceAutocomplete({ value, onChange, placeholder, inline }) {
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
          ...(inline ? { background: CREAM } : null),
        }} />
      {(open || inline) && (loading || results.length > 0) && (
        <div style={inline ? {
          // Eigen scherm (incheckflow): de lijst hoort gewoon bij de pagina.
          marginTop: 8, background: CREAM, borderRadius: 14, overflow: "hidden",
        } : {
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


// Favorieten, meest gebruikte drank en check-ins per maand: gedeeld door
// je eigen profiel en dat van een vriend (zelfde afleiding uit het logboek).
function TasteDetails({ insights, logboek, recipes, allIngredients, onOpenRecipe = null }) {
  const findMatch = (entry) => entry.recipeId ? recipes.find(r => r.id === canonicalRecipeId(entry.recipeId)) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());
  const favRecipe = insights.favoriteCocktail ? recipes.find(r => r.name.toLowerCase() === insights.favoriteCocktail.name.toLowerCase()) : null;
  const famName = insights.favoriteFamilyEntry?.[0];
  const famRecipe = famName ? (logboek.map(findMatch).filter(r => r && r.family === famName)[0] || recipes.find(r => r.family === famName)) : null;
  const favCards = [
    insights.favoriteCocktail && { label: "Favoriete cocktail", title: insights.favoriteCocktail.name, recipe: favRecipe, serifTitle: true, link: true },
    famName && { label: "Favoriete stijl", title: famName, recipe: famRecipe },
  ].filter(Boolean);
  const monthsWithData = insights.months.filter(m => m.count > 0).length;
  const spiritMeta = (label) => allIngredients.find(i => i.name === label && i.cat === "Sterke drank");
  const matches = useMemo(() => tasteMatches(logboek, recipes, allIngredients, 3), [logboek, recipes, allIngredients]);
  return (
    <>
      {matches.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Past bij je smaak</SectionLabel>
          <div style={{ fontSize: 13, color: MUTED, margin: "-2px 0 10px" }}>{matches[0].reason}. Deze heb je nog niet geprobeerd:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {matches.map(({ recipe }) => (
              <button key={recipe.id} onClick={onOpenRecipe ? () => onOpenRecipe(recipe.id) : undefined} className="press-scale" style={{ padding: 0, border: "none", borderRadius: 14, overflow: "hidden", background: CREAM, boxShadow: SHADOW_CARD, cursor: onOpenRecipe ? "pointer" : "default", textAlign: "left", fontFamily: sans }}>
                <span style={{ display: "block", aspectRatio: "1", overflow: "hidden" }}><RecipeCircle recipe={recipe} allIngredients={allIngredients} size={120} radius={0} /></span>
                <span style={{ display: "block", padding: "7px 8px 9px", fontFamily: serif, fontWeight: 700, fontSize: 13.5, color: INK, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{recipe.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {favCards.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Favorieten</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {favCards.map(c => {
              // Favoriete cocktail: tik = naar het recept.
              const open = c.link && c.recipe && onOpenRecipe ? () => onOpenRecipe(c.recipe.id) : null;
              return (
              <div key={c.label} onClick={open || undefined} role={open ? "button" : undefined} className={open ? "press-scale" : undefined}
                style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden", cursor: open ? "pointer" : undefined }}>
                <div style={{ height: 96, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {c.recipe && (localItemImageUrl("cocktail", c.recipe.id) || c.recipe.image)
                    ? <img src={localItemImageUrl("cocktail", c.recipe.id) || c.recipe.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: RECIPE_PHOTO_FILTER }} />
                    : c.recipe ? <RecipeCircle recipe={c.recipe} allIngredients={allIngredients} size={70} radius={12} /> : <Martini size={28} color={BRASS} strokeWidth={1.4} />}
                </div>
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontSize: 12, color: MUTED }}>{c.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 2 }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: c.serifTitle ? serif : systemFont, fontWeight: 700, fontSize: 16, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
                    {open && <ChevronRight size={15} color={MUTED} style={{ flexShrink: 0 }} />}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {insights.spirits.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Meest gebruikte drank</SectionLabel>
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}>
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
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "16px 16px 12px" }}>
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
// Eén check-in bekijken (vanuit je profiel): dezelfde kaart als een post in
// de feed, met daaronder het recept en de knoppen Bewerken en Delen.
// Verwijderen staat bewust niet groot in beeld, maar onder ••• rechtsboven.
function CheckinDetailSheet({ entry, recipe, allIngredients, ingredientLabel, who, whoAvatar, onClose, onRemove, onEdit = null, onOpenRecipe = null, courseRank = null }) {
  useBodyScrollLock();
  const { panelRef, closing, close, dragHandlers } = useSheetDismiss(onClose);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const img = entry.photo || (recipe && (localItemImageUrl("cocktail", recipe.id) || recipe.image)) || null;
  const tags = (entry.tasteTags || []).filter(k => CHECKIN_TASTE_META[k]);
  const ingredientsLine = recipe ? recipe.ingredients.filter(i => !i.optional).map(ing => ingredientLabel(ing)).join(" · ") : null;
  const tint = recipe ? recipeTint(recipe, allIngredients) : null;
  const whenWhere = [entry.location, formatCheckinDate(entry.date)].filter(Boolean).join(" · ");
  const share = async () => {
    const text = `Ik heb een ${entry.name} geproefd: ${formatRating(entry.rating)} van de 5.${entry.notes ? ` "${entry.notes}"` : ""}`;
    const res = await shareLink({ title: entry.name, text, url: publicAppUrl(), fallbackText: text });
    if (res === "copied") { setShareNote("Link gekopieerd"); setTimeout(() => setShareNote(""), 2000); }
  };
  const btn = { flex: 1, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer" };
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div className="sheet-backdrop-in" onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.5)", opacity: closing ? 0 : 1, transition: "opacity 0.22s ease" }} />
      <div ref={panelRef} className="sheet-slide-in" style={{
        position: "relative", maxWidth: 960, width: "100%", margin: "0 auto", maxHeight: "92vh",
        background: PAPER, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 30px rgba(43,38,32,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: sans,
      }}>
        <SheetGrabber {...dragHandlers} />
        {/* Wie, waar en wanneer — zoals de kop van een post. */}
        <div {...dragHandlers} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px", flexShrink: 0, touchAction: "none" }}>
          <RankAvatar name={who} photo={whoAvatar} size={38} courseRank={courseRank} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{who}</div>
            <div style={{ fontSize: 12.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{whenWhere}</div>
          </div>
          <div style={{ position: "relative" }} onTouchStart={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(v => !v)} aria-label="Meer" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <MoreHorizontal size={19} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
                <div style={{ position: "absolute", right: 0, top: 44, zIndex: 5, background: CREAM, borderRadius: 12, boxShadow: "0 8px 24px rgba(43,38,32,0.22)", border: `1px solid ${BORDER}`, overflow: "hidden", minWidth: 210 }}>
                  <button onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "13px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14.5, color: BURGUNDY, fontFamily: sans, textAlign: "left" }}>
                    <Trash2 size={15} /> Check-in verwijderen
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={close} aria-label="Sluiten" onTouchStart={e => e.stopPropagation()} style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><X size={17} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: "0 16px calc(env(safe-area-inset-bottom) + 18px)" }}>
          {/* De post zelf */}
          <div style={{ borderRadius: 20, background: CREAM, padding: 12, boxShadow: "0 1px 2px rgba(43,38,32,0.08), 0 8px 22px -12px rgba(43,38,32,0.3)" }}>
            <div onClick={img ? () => setPhotoOpen(true) : undefined} style={{ position: "relative", width: "100%", aspectRatio: "8 / 7", borderRadius: 14, overflow: "hidden", cursor: img ? "zoom-in" : undefined, background: BOTTLE_DARK }}>
              {img ? (
                <img src={img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: entry.photo ? "none" : RECIPE_PHOTO_FILTER }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {recipe ? <GlassArt glass={recipe.glass} colors={tint} garnishes={inferGarnishes(recipe, allIngredients)} rim={inferRim(recipe, allIngredients)} foam={inferFoam(recipe, allIngredients)} iceStyle={inferIceStyle(recipe)} size={120} />
                    : <Martini size={44} color="rgba(251,246,234,0.85)" strokeWidth={1.3} />}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 4px 0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, lineHeight: 1.1, color: INK }}>{entry.name}</div>
                {recipe && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{[recipe.family, recipe.glass].filter(Boolean).join(" · ")}</div>}
              </div>
              <FeedScore value={entry.rating} />
            </div>
            {entry.notes && (
              <p style={{ margin: "10px 4px 0", paddingTop: 11, borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 15, lineHeight: 1.5, color: INK, whiteSpace: "pre-wrap" }}>{entry.notes}</p>
            )}
            {tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 4px 2px" }}>
                {tags.map(k => <span key={k} style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 100, background: "rgba(31,61,54,0.08)", color: BOTTLE }}>{CHECKIN_TASTE_META[k].label}</span>)}
              </div>
            )}
          </div>

          {/* Naar het recept */}
          {recipe && (
            <button onClick={onOpenRecipe ? () => { close(); onOpenRecipe(recipe.id); } : undefined} disabled={!onOpenRecipe} className="press-scale" style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 12, padding: "12px 14px", borderRadius: 18, border: "none",
              background: CREAM, boxShadow: SHADOW_CARD, cursor: onOpenRecipe ? "pointer" : "default", textAlign: "left", fontFamily: sans, color: INK,
            }}>
              <RecipeCircle recipe={recipe} allIngredients={allIngredients} size={46} radius={12} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>Bekijk het recept</span>
                {ingredientsLine && <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{ingredientsLine}</span>}
              </span>
              <ChevronRight size={17} color={MUTED} style={{ flexShrink: 0 }} />
            </button>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {onEdit && (
              <button onClick={() => { onClose(); onEdit(entry); }} className="press-scale" style={{ ...btn, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT }}>
                <Pencil size={16} /> Bewerken
              </button>
            )}
            <button onClick={share} className="press-scale" style={{ ...btn, border: `1.5px solid ${BOTTLE}`, background: "none", color: BOTTLE }}>
              <Share2 size={16} /> {shareNote || "Delen"}
            </button>
          </div>
        </div>
      </div>
      {photoOpen && <CheckinPhotoViewer entry={entry} matched={recipe} who={who} whoAvatar={whoAvatar} allIngredients={allIngredients} onClose={() => setPhotoOpen(false)}
        onOpenRecipe={onOpenRecipe ? (id) => { onClose(); onOpenRecipe(id); } : null} />}
      {confirmDelete && (
        <ConfirmDialog title="Check-in verwijderen?" message={`${entry.name} verdwijnt uit je logboek.`} confirmLabel="Verwijder"
          onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); onRemove(entry.id); close(); }} />
      )}
    </div>
  ), document.body);
}

function LogboekTab({ recipes, logboek, onAddEntry, onUpdateEntry, onRemoveEntry, allIngredients, ingredientLabel, onSound, isOwned, profile, onOpenRecipe, checkinRequest, onCheckinRequestHandled, onCheckedIn, onUpdateName, onUpdatePhoto, onGoVrienden, onGoInstellingen, active , courseDiploma, courseProgress, courseRank, guest = false, onRequireAccount, friendRequestCount = 0}) {
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
  const handleProfilePhotoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProfilePhotoBusy(true);
    try { onUpdatePhoto(await squareJpegDataUrl(file, 480, 0.82)); }
    catch (err) { console.warn("Profielfoto laden mislukt:", err); }
    setProfilePhotoBusy(false);
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
  // Bewerken van een bestaande check-in: hetzelfde formulier, ingevuld.
  const [editingEntryId, setEditingEntryId] = useState(null);
  const editingRef = useRef(null);
  editingRef.current = editingEntryId;
  useEffect(() => { if (editingRef.current) return; setTasteTags(suggestTasteTags(matchedRecipe)); }, [matchedRecipe?.id]);
  const toggleTasteTag = (key) => {
    onSound("tick");
    setTasteTags(prev => prev.includes(key) ? prev.filter(k => k !== key) : CHECKIN_TASTE_TAGS.map(t => t.key).filter(k => k === key || prev.includes(k)));
  };
  const recentCocktails = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const entry of logboek) {
      const r = entry.recipeId ? recipes.find(x => x.id === canonicalRecipeId(entry.recipeId)) : recipes.find(x => x.name.toLowerCase() === entry.name.toLowerCase());
      if (r && !seen.has(r.id)) { seen.add(r.id); list.push(r); }
      if (list.length >= 8) break;
    }
    return list;
  }, [logboek, recipes]);

  // Op de iPhone via de camera-plugin: een nieuwe foto komt dan ook in je
  // eigen fotobibliotheek (zoals bij Untappd). Kies je een bestaande foto,
  // dan staat die er al. In de browser gewoon het bestandsvenster.
  const pickCheckinPhoto = async () => {
    if (photoBusy) return;
    if (!Capacitor.isNativePlatform()) { fileInputRef.current?.click(); return; }
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const shot = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, saveToGallery: true,
        quality: 92, width: 2048, correctOrientation: true,
        promptLabelHeader: "Foto", promptLabelPhoto: "Kies uit je foto's", promptLabelPicture: "Maak een foto", promptLabelCancel: "Annuleren",
      });
      if (!shot?.dataUrl) return;
      setPhotoBusy(true);
      setPhoto(await imageToJpegDataUrl(shot.dataUrl, 1440, 0.82));
    } catch (err) {
      // Annuleren geeft ook een fout; alleen echte fouten loggen.
      if (!/cancel/i.test(String(err?.message || err))) console.warn("Foto kiezen mislukt:", err);
    }
    setPhotoBusy(false);
  };
  const handlePhotoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try { setPhoto(await imageToJpegDataUrl(file, 1440, 0.82)); }
    catch (err) { console.warn("Foto laden mislukt:", err); }
    setPhotoBusy(false);
  };

  // Eigen foto heeft voorrang; anders alvast de foto van het gekozen recept
  // laten zien, zodat het beeldvlak nooit leeg oogt zodra er een cocktail is
  // gekozen — tikken vervangt 'm altijd door een eigen foto.
  const heroPhotoSrc = photo || (matchedRecipe ? (localItemImageUrl("cocktail", matchedRecipe.id) || matchedRecipe.image) : null);

  const resetCheckinForm = () => {
    setNameInput(""); setNotes(""); setRating(0); setPhoto(null); setLocation("Thuis"); setLocationCoords(null);
    setTasteTags([]); setMoreOpen(false);
    setTaggedIds([]); setTagQuery(""); setAdoptTag(null);
  };
  const startEditEntry = (entry) => {
    setEditingEntryId(entry.id);
    setNameInput(entry.name || ""); setRating(entry.rating || 0); setNotes(entry.notes || "");
    setPhoto(entry.photo || null); setLocation(entry.location || "Thuis");
    setLocationCoords(entry.locationLat != null && entry.locationLon != null ? { lat: entry.locationLat, lon: entry.locationLon } : null);
    setTasteTags(entry.tasteTags || []);
    setMoreOpen(!!entry.location && entry.location !== "Thuis");
    setTaggedIds([]); setAdoptTag(null);
    editOrigRef.current = JSON.stringify([entry.name || "", entry.rating || 0, entry.notes || "", entry.photo || null, entry.location || "Thuis", entry.tasteTags || []]);
    setCiStep("form");
    setShowCheckinSheet(true);
  };
  // opts.rating: "Direct opslaan" bij overnemen gebruikt het cijfer van de ander.
  const addEntry = (opts) => {
    const score = typeof opts?.rating === "number" && opts.rating > 0 ? opts.rating : rating;
    let name = nameInput.trim();
    if (!name || score === 0) return;
    // Vangnet: half getypte naam ("Sex On") die bij precies één recept past
    // → dat recept gebruiken, i.p.v. een losse, afgekapte naam op te slaan.
    let recipeForEntry = matchedRecipe;
    if (!recipeForEntry) {
      const q = name.toLowerCase();
      const starts = recipes.filter(r => r.name.toLowerCase().startsWith(q));
      if (starts.length === 1) { recipeForEntry = starts[0]; name = starts[0].name; }
    }
    if (editingEntryId) {
      onUpdateEntry(editingEntryId, {
        recipeId: recipeForEntry ? recipeForEntry.id : null,
        name, rating: score, notes: notes.trim(), photo, location: location.trim() || "Thuis",
        locationLat: locationCoords?.lat ?? null, locationLon: locationCoords?.lon ?? null,
        tasteTags: tasteTags,
      });
      onSound("tick");
      closeCheckinSheet();
      return;
    }
    document.activeElement?.blur?.();
    const checkinNumber = logboek.length + 1;
    const saved = Promise.resolve(onAddEntry({
      recipeId: recipeForEntry ? recipeForEntry.id : null,
      name, rating: score, notes: notes.trim(), photo, location: location.trim() || "Thuis",
      locationLat: locationCoords?.lat ?? null, locationLon: locationCoords?.lon ?? null,
      tasteTags: tasteTags,
      tagUserIds: taggedIds, adoptTag,
      // Overnemen: zelfde moment als de check-in van je vriend.
      createdAt: adoptTag?.createdAt || null,
    }));
    onSound("chime");
    setStampNumber(checkinNumber);
    // Na de stempel: naar de feed, waar de nieuwe post bovenaan oplicht.
    setTimeout(() => {
      setStampNumber(null);
      finishCheckin();
      onCheckedIn?.(saved);
    }, 1050);
  };
  const removeEntry = (id) => { onSound("remove"); onRemoveEntry(id); };
  const cardRefs = useRef({});
  const scrollToEntry = (id) => cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  const [showCheckinSheet, setShowCheckinSheet] = useState(false);
  // Incheckflow (schermvullend, à la Untappd): eerst de cocktail zoeken,
  // dan het formulier; "Met wie" en "Locatie" zijn eigen schermen. Zo staat
  // elk tekstveld bovenaan en hoeft er niets te schuiven als het toetsenbord
  // opkomt.
  const [ciStep, setCiStep] = useState("form");
  const [ciClosing, setCiClosing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);
  const editOrigRef = useRef(null);
  // Afgerond of afgebroken: de volgende check-in begint weer blanco.
  const finishCheckin = () => {
    setShowCheckinSheet(false); setCiClosing(false); setConfirmDiscard(false); setNotesFocused(false);
    setEditingEntryId(null); editOrigRef.current = null; resetCheckinForm();
  };
  const closeCheckinSheet = () => {
    document.activeElement?.blur?.();
    setConfirmDiscard(false);
    setCiClosing(true);
    setTimeout(finishCheckin, 220);
  };
  // Extern verzoek om in te checken (centrale +-knop, of straks direct vanaf
  // een recept) — de sheet zelf blijft hier leven (portal't toch al naar
  // document.body, dus verschijnt sowieso boven elke tab).
  // Vrienden taggen ("Met wie drink je?") en een tag overnemen.
  const [taggedIds, setTaggedIds] = useState([]);
  const [tagQuery, setTagQuery] = useState("");
  const [adoptTag, setAdoptTag] = useState(null);
  const tagFriends = useFriendList(profile?.id, showCheckinSheet);
  // Annuleer met iets ingevuld → eerst vragen of het weg mag.
  const ciDirty = editingEntryId
    ? editOrigRef.current !== JSON.stringify([nameInput, rating, notes, photo, location, tasteTags])
    : (rating > 0 || notes.trim().length > 0 || (!!photo && !adoptTag) || taggedIds.length > 0);
  const requestCancel = () => { if (ciDirty) { document.activeElement?.blur?.(); setConfirmDiscard(true); } else closeCheckinSheet(); };
  useEffect(() => {
    if (!checkinRequest) return;
    setCiClosing(false);
    setCiStep(checkinRequest.name || checkinRequest.adoptTag ? "form" : "search");
    if (checkinRequest.name) setNameInput(checkinRequest.name);
    if (checkinRequest.adoptTag) {
      setAdoptTag(checkinRequest.adoptTag);
      if (checkinRequest.location) setLocation(checkinRequest.location);
      if (checkinRequest.locationLat != null && checkinRequest.locationLon != null) setLocationCoords({ lat: checkinRequest.locationLat, lon: checkinRequest.locationLon });
      if (checkinRequest.photo) setPhoto(checkinRequest.photo);
    }
    setShowCheckinSheet(true);
    // Afgehandeld: anders opent het venster opnieuw zodra dit scherm
    // opnieuw wordt opgebouwd (bijv. na terugkomen van het inlogscherm).
    onCheckinRequestHandled?.();
  }, [checkinRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => computeCheckinStats(logboek), [logboek]);

  // Alles hieronder is een "profiel"-laag bovenop het logboek: geen nieuwe
  // opslag, puur afgeleid uit bestaande check-ins/recepten/ingrediënten, zodat
  // niets verzonnen is. Smaakprofiel en prestaties zijn bewust simpele,
  // navolgbare heuristieken (familie-indeling, tellingen), geen smaakanalyse.
  const insights = useMemo(
    () => computeCheckinInsights(logboek, recipes, allIngredients, isOwned, stats.uniques),
    [logboek, recipes, allIngredients, isOwned, stats.uniques]
  );

  const findMatch = (entry) => entry.recipeId ? recipes.find(r => r.id === canonicalRecipeId(entry.recipeId)) : recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());
  // Profiel in drie tabbladen (Check-ins · Smaak · Prestaties); bewust niet
  // onthouden over sessies heen — altijd beginnen bij Check-ins.
  const [profileTab, setProfileTab] = useState("checkins");
  const isMaster = !!courseRank?.master;
  const masterNumber = useMasterNumber(isMaster ? (profile?.course_completed_at || null) : null);
  const [openEntryId, setOpenEntryId] = useState(null);
  // Check-ins als Overzicht (raster) of Doorscrollen (posts onder elkaar);
  // de laatste keuze blijft bewaard. Tik op een foto in het raster = naar
  // die post in de doorscrolweergave.
  const [ciView, setCiView] = useStorage("thuisbar-profiel-weergave", "overzicht");
  const [scrollToPost, setScrollToPost] = useState(null);
  useEffect(() => {
    if (!scrollToPost || ciView !== "doorscrollen") return;
    const t = setTimeout(() => {
      document.getElementById(`ci-post-${scrollToPost}`)?.scrollIntoView({ block: "start", behavior: "auto" });
      setScrollToPost(null);
    }, 40);
    return () => clearTimeout(t);
  }, [scrollToPost, ciView]);
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
      {/* Kop (huisstijl): groene balk met Vrienden/Instellingen rechts.
          Je gegevens staan eronder op de lichte achtergrond (een groen vlak
          eronder was te zwaar); alleen een Meester houdt de donkere kaart. */}
      <LargeTitleHeader title="Profiel" right={<>
        <HeaderIconButton onClick={onGoVrienden} label={friendRequestCount > 0 ? `Vrienden, ${friendRequestCount} ${friendRequestCount === 1 ? "nieuw verzoek" : "nieuwe verzoeken"}` : "Vrienden"}>
          <span style={{ position: "relative", display: "flex" }}>
            <Users size={22} strokeWidth={1.8} />
            {friendRequestCount > 0 && (
              <span style={{
                position: "absolute", top: -6, right: -9, minWidth: 18, height: 18, padding: "0 5px", boxSizing: "border-box",
                borderRadius: 9, background: "#D93A30", color: "#FFFFFF", fontSize: 11, fontWeight: 800, fontFamily: sans,
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px var(--bottle-dark)",
              }}>{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>
            )}
          </span>
        </HeaderIconButton>
        <HeaderIconButton onClick={onGoInstellingen} label="Instellingen"><Settings size={22} strokeWidth={1.8} /></HeaderIconButton>
      </>} />
      {/* Identiteit: foto met XP-ring, naam (tik = wijzigen), niveau.
          Voor een Meester in een donkere ledenkaart met Meestergoud. */}
      <div style={isMaster ? MASTER_HEADER_STYLE : undefined}>
      {isMaster && <MasterHeaderTitle number={masterNumber} />}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <input ref={photoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoFile} style={{ display: "none" }} />
        <button onClick={() => (guest ? onRequireAccount?.("profiel") : photoInputRef.current?.click())} disabled={profilePhotoBusy} className="press-scale" aria-label={guest ? "Profiel maken" : "Profielfoto wijzigen"} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
          <CourseRing name={profile?.name || (guest ? "Gast" : "Jij")} photo={profile?.avatar_url} size={84} partsDone={courseRank?.partsDone || 0} master={!!courseRank?.master} dark={isMaster} />
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
            <button onClick={guest ? () => onRequireAccount?.("profiel") : startEditName} aria-label={guest ? "Profiel maken" : "Naam wijzigen"} style={{ display: "block", maxWidth: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: isMaster ? HEADER_TEXT : INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.name || (guest ? "Gast" : "Jouw naam")}</div>
            </button>
          )}
          {courseRank?.rank && <div style={{ margin: "5px 0 3px" }}><CourseRankLabel courseRank={courseRank} chip onDark={isMaster} /></div>}
          <div style={{ fontSize: 14, fontWeight: 600, color: isMaster ? HEADER_ACCENT : BRASS_TEXT, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Niveau {insights.level.level} · {insights.level.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
            <span style={{ fontSize: 12, color: isMaster ? HEADER_MUTED : MUTED }}>{insights.level.to ? `${insights.level.to - insights.level.xp} XP tot niveau ${insights.level.level + 1}` : "Hoogste niveau bereikt"}</span>
          </div>
        </div>
      </div>

      {/* Kerncijfers */}
      <div style={isMaster
        ? { display: "flex", padding: "12px 0 0", borderTop: "1px solid rgba(221,184,119,0.25)" }
        : { display: "flex", padding: "12px 0", marginBottom: 16, background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD }}>
        {[
          { value: <AnimatedNumber value={stats.total} />, label: "check-ins" },
          { value: <AnimatedNumber value={stats.uniques} />, label: "uniek" },
          { value: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{stats.total > 0 ? formatDecimal1(stats.avg) : "–"}<Star size={13} fill="#C8963A" color="#C8963A" /></span>, label: "gemiddeld" },
        ].map((c) => (
          <div key={c.label} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 20, color: isMaster ? HEADER_TEXT : INK }}>{c.value}</div>
            <div style={{ fontSize: 12, color: isMaster ? HEADER_MUTED : MUTED, marginTop: 1 }}>{c.label}</div>
          </div>
        ))}
      </div>
      </div>

      {/* Gast: één nette kaart om een account te maken; de rest van het
          profiel (check-ins, smaak, prestaties) werkt gewoon lokaal. */}
      {guest && (
        <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 18, padding: 16, marginBottom: 18 }}>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>Maak een gratis account</div>
          <div style={{ fontSize: 13.5, color: "#C9D2CB", lineHeight: 1.5, marginTop: 4 }}>Vrienden en feed, je check-ins veilig bewaard en feesten plannen. Wat je nu al deed gaat mee.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => onRequireAccount?.("algemeen")} className="press-scale" style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "none", background: "#DDB877", color: "#132622", fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Account maken</button>
          </div>
        </div>
      )}

      {/* Tabbladen: één rij, zoals Instagram. Foto's en Posts zijn allebei je
          check-ins (raster of onder elkaar); de keuze wordt onthouden. */}
      {(() => {
        const activeTab = profileTab === "checkins" ? (ciView === "doorscrollen" ? "posts" : "fotos") : profileTab;
        const pick = (id) => {
          if (id === activeTab) return;
          onSound("tick");
          if (id === "fotos" || id === "posts") { setProfileTab("checkins"); setCiView(id === "posts" ? "doorscrollen" : "overzicht"); }
          else setProfileTab(id);
        };
        return (
          <div role="tablist" style={{ display: "flex", borderBottom: "1px solid rgba(43,38,32,0.14)", marginBottom: 14 }}>
            {[["fotos", "Foto's", LayoutGrid], ["posts", "Posts", Rows2], ["smaak", "Smaak", Heart], ["prestaties", "Prestaties", Award]].map(([id, label, Icon]) => {
              const on = activeTab === id;
              return (
                <button key={id} role="tab" aria-selected={on} onClick={() => pick(id)} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0 8px", marginBottom: -1,
                  background: "none", border: "none", borderBottom: `2.5px solid ${on ? BRASS : "transparent"}`, cursor: "pointer",
                  fontFamily: sans, fontSize: 12.5, fontWeight: on ? 800 : 700, color: on ? INK : MUTED,
                }}>
                  <Icon size={19} strokeWidth={on ? 2.2 : 1.9} />
                  {label}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* ---------- Tab: Check-ins ---------- */}
      {profileTab === "checkins" && (
        logboek.length === 0 ? (
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "26px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 17, color: INK, marginBottom: 4 }}>Nog geen check-ins</div>
            <p style={{ margin: 0, fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>Tik op de + onderin om je eerste cocktail in te checken.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 14, color: INK }}><strong>{thisMonthCount}</strong> deze maand</span>
              {insights.streak >= 2 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: BRASS_TEXT, background: "rgba(184,134,46,0.14)", borderRadius: 100, padding: "4px 10px" }}>
                  <Flame size={13} /> {insights.streak} dagen op rij
                </span>
              )}
            </div>
            {ciView === "doorscrollen" ? (
              <div>
                {logboek.map(entry => {
                  const matched = findMatch(entry);
                  const photo = entry.photo || (matched && (localItemImageUrl("cocktail", matched.id) || matched.image)) || null;
                  return (
                    <div key={entry.id} id={`ci-post-${entry.id}`} style={{ scrollMarginTop: "calc(env(safe-area-inset-top) + 64px)", marginBottom: 14, borderRadius: 20, background: CREAM, padding: 12, boxShadow: SHADOW_CARD }}>
                      <button onClick={() => setOpenEntryId(entry.id)} aria-label={`${entry.name} openen`} style={{ display: "block", width: "100%", padding: 0, border: "none", background: BOTTLE_DARK, borderRadius: 14, overflow: "hidden", aspectRatio: "8 / 7", cursor: "pointer", position: "relative" }}>
                        {photo ? (
                          <img src={photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: entry.photo ? "none" : RECIPE_PHOTO_FILTER }} />
                        ) : matched ? (
                          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><RecipeCircle recipe={matched} allIngredients={allIngredients} size={120} /></span>
                        ) : (
                          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Martini size={44} color="rgba(251,246,234,0.85)" strokeWidth={1.3} /></span>
                        )}
                      </button>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 4px 0" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {matched && onOpenRecipe ? (
                            <button onClick={() => onOpenRecipe(matched.id)} style={{ display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: INK }}>
                              <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.1 }}>{entry.name}</span>
                              <ChevronRight size={17} color={MUTED} style={{ verticalAlign: "-2px", marginLeft: 2 }} />
                            </button>
                          ) : (
                            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.1, color: INK }}>{entry.name}</div>
                          )}
                          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{[entry.location, feedRelTime(entry)].filter(Boolean).join(" · ")}</div>
                        </div>
                        <FeedScore value={entry.rating} />
                      </div>
                      {entry.notes && (
                        <p style={{ margin: "10px 4px 0", paddingTop: 11, borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 15, lineHeight: 1.5, color: INK, whiteSpace: "pre-wrap" }}>{entry.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {logboek.map(entry => {
                const matched = findMatch(entry);
                const own = entry.photo;
                const recipeImg = matched && (localItemImageUrl("cocktail", matched.id) || matched.image);
                return (
                  <button key={entry.id} onClick={() => { onSound("tick"); setScrollToPost(entry.id); setCiView("doorscrollen"); }} aria-label={`${entry.name}, ${formatRating(entry.rating)} sterren`} style={{
                    position: "relative", aspectRatio: "1", overflow: "hidden", border: "none", borderRadius: 10, padding: 0, cursor: "pointer", background: PAPER_DEEP,
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
                      <span style={{ fontSize: 12, color: ON_DARK_TEXT, fontWeight: 700 }}>{formatRating(entry.rating)}</span>
                      <Star size={10} fill="#D8AE5E" color="#D8AE5E" />
                    </div>
                  </button>
                );
              })}
            </div>
            )}
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

            <TasteDetails insights={insights} logboek={logboek} recipes={recipes} allIngredients={allIngredients} onOpenRecipe={onOpenRecipe} />
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
              <div className="accordion-reveal" style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "12px 14px", marginBottom: 22 }}>
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
                <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}>
                  <CocktailMap locations={mapLocations} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "14px", marginBottom: 12 }}>
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
        <div className={`kb-lift ${ciClosing ? "ci-screen-out" : "ci-screen-in"}`} role="dialog" aria-modal="true" aria-label="Check-in" style={{
          position: "fixed", inset: 0, zIndex: 40, background: PAPER, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <BodyScrollLock />
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoFile} style={{ display: "none" }} />
          {/* Vanaf de linkerrand terugvegen: een substap terug naar het
              formulier, het formulier zelf = Annuleer (met de vraag of het
              weg mag als er iets is ingevuld). */}
          <EdgeSwipeBackArea key={ciStep} bleed={false} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: PAPER }}
            onBack={() => {
              if (ciStep === "friends" || ciStep === "location") { document.activeElement?.blur?.(); setCiStep("form"); }
              else if (ciStep === "search" && nameInput.trim()) setCiStep("form");
              else requestCancel();
            }}>
          <div className="ci-step-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {ciStep === "search" ? (
              <CheckinSearchStep recipes={recipes} allIngredients={allIngredients} recent={recentCocktails}
                initialQuery={matchedRecipe ? "" : nameInput}
                cancelLabel={nameInput.trim() ? "Terug" : "Annuleer"} cancelBack={!!nameInput.trim()}
                onCancel={() => { if (nameInput.trim()) setCiStep("form"); else requestCancel(); }}
                onPick={(name) => { setNameInput(name); setCiStep("form"); }} />
            ) : ciStep === "friends" ? (
              <CheckinFriendsStep friends={tagFriends} taggedIds={taggedIds}
                onToggle={(id) => { onSound("pop"); setTaggedIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]); }}
                onDone={() => { document.activeElement?.blur?.(); setCiStep("form"); }} />
            ) : ciStep === "location" ? (
              <CheckinLocationStep location={location} onChange={handleLocationChange}
                onDone={() => { document.activeElement?.blur?.(); setCiStep("form"); }} />
            ) : (() => {
              const canSubmit = nameInput.trim().length > 0 && rating > 0;
              const tagged = (tagFriends || []).filter(f => taggedIds.includes(f.id));
              const cardStyle = { background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD };
              const optionRow = (Icon, label, value, onClick, last) => (
                <button onClick={onClick} className="list-row-tap" style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 54, padding: "8px 14px", background: "none", border: "none",
                  borderBottom: last ? "none" : `1px solid ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: systemFont,
                }}>
                  <Icon size={19} color={BOTTLE} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 15.5, fontWeight: 600, color: INK }}>{label}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>{value}</span>
                  <ChevronRight size={18} color={MUTED} style={{ flexShrink: 0 }} />
                </button>
              );
              return (
                <>
                  {/* Rechtsboven: Plaats (pas actief met cocktail + cijfer). Typ je
                      in de notitie, dan staat daar Gereed om het toetsenbord te
                      sluiten. */}
                  <CheckinTopBar leftLabel="Annuleer" onLeft={requestCancel} title={editingEntryId ? "Check-in bewerken" : adoptTag ? "Overnemen" : "Check-in"}
                    rightLabel={notesFocused ? "Gereed" : editingEntryId ? "Opslaan" : "Plaats"}
                    rightDisabled={notesFocused ? false : !canSubmit}
                    onRight={notesFocused ? () => document.activeElement?.blur?.() : addEntry} />
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
                    <div style={{ padding: "16px 16px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto" }}>
                      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                        {matchedRecipe ? (
                          <RecipeCircle recipe={matchedRecipe} allIngredients={allIngredients} size={52} />
                        ) : (
                          <span style={{ width: 52, height: 52, borderRadius: "50%", background: BOTTLE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Martini size={22} color="#DDB877" strokeWidth={1.6} />
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 19, color: INK, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameInput.trim() || "Kies je cocktail"}</div>
                          <div style={{ fontFamily: systemFont, fontSize: 13, color: MUTED, marginTop: 2 }}>{matchedRecipe ? matchedRecipe.family : nameInput.trim() ? "Eigen cocktail" : "Nog niets gekozen"}</div>
                        </div>
                        {!adoptTag && (
                          <button onClick={() => setCiStep("search")} style={{ background: "none", border: "none", padding: "8px 2px 8px 8px", cursor: "pointer", fontFamily: systemFont, fontSize: 15, fontWeight: 600, color: BOTTLE }}>Wijzig</button>
                        )}
                      </div>

                      {adoptTag && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: "rgba(184,134,46,0.14)", boxShadow: "inset 0 0 0 1px rgba(184,134,46,0.35)", fontSize: 13.5, lineHeight: 1.4, color: INK, fontFamily: systemFont }}>
                          <Copy size={16} color={BRASS} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                          <span>Overgenomen van <strong>{adoptTag.taggerName || "je vriend"}</strong> · plek, tijd en gezelschap staan al goed. Je cijfer en notitie zijn alleen van jou.</span>
                        </div>
                      )}

                      <div style={{ ...cardStyle, padding: "14px 8px 14px" }}>
                        <SwipeStars value={rating} onChange={setRating} onSound={onSound} />
                        {adoptTag?.taggerRating > 0 && (
                          <div style={{ textAlign: "center", fontFamily: systemFont, fontSize: 13, color: MUTED, marginTop: 6 }}>
                            Jouw eigen cijfer ({adoptTag.taggerName || "je vriend"} gaf {formatRating(adoptTag.taggerRating)})
                          </div>
                        )}
                      </div>

                      <div style={{ ...cardStyle, padding: "4px 14px 14px" }}>
                        <AutoGrowTextField bare minRows={2} value={notes} onChange={setNotes} placeholder="Wat vond je ervan?"
                          onFocus={() => setNotesFocused(true)}
                          // Pas ná de tik wisselen: anders werd een tik op "Gereed"
                          // halverwege een tik op "Plaats".
                          onBlur={() => setTimeout(() => setNotesFocused(false), 60)} />
                        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                          {photo ? (
                            <div style={{ position: "relative", width: 74, height: 74, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
                              <img src={photo} alt="Je foto" onClick={() => pickCheckinPhoto()} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "pointer" }} />
                              {adoptTag && photo === adoptTag.taggerPhoto && (
                                <span style={{ position: "absolute", left: 4, bottom: 4, padding: "2px 6px", borderRadius: 6, background: "rgba(19,38,34,0.8)", color: "#FBF6EA", fontSize: 10, fontWeight: 700, fontFamily: systemFont, pointerEvents: "none" }}>{adoptTag.taggerName}</span>
                              )}
                              <button onClick={() => setPhoto(null)} aria-label="Foto verwijderen" style={{
                                position: "absolute", right: 4, top: 4, width: 24, height: 24, borderRadius: "50%", border: "none",
                                background: "rgba(20,16,10,0.6)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
                              }}><X size={13} color="#FBF6EA" /></button>
                            </div>
                          ) : (
                            <button onClick={() => pickCheckinPhoto()} disabled={photoBusy} className="press-scale" style={{
                              width: 74, height: 74, borderRadius: 12, border: `1.5px dashed ${BORDER}`, background: PAPER,
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                              cursor: "pointer", color: MUTED, fontFamily: systemFont, fontSize: 12, fontWeight: 600, flexShrink: 0,
                            }}>
                              <Camera size={20} color={BOTTLE} />
                              {photoBusy ? "Bezig…" : "Foto"}
                            </button>
                          )}
                          {adoptTag && photo && photo === adoptTag.taggerPhoto && (
                            <button onClick={() => pickCheckinPhoto()} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: systemFont, fontSize: 13, lineHeight: 1.4, color: MUTED, alignSelf: "center" }}>
                              Foto van {adoptTag.taggerName} gebruiken,<br /><strong style={{ color: BOTTLE }}>of maak een eigen foto</strong>
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ padding: "4px 2px 0" }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                          <span style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 16, color: INK }}>Wat proefde je?</span>
                          <span style={{ fontFamily: systemFont, fontSize: 12, color: MUTED }}>Kies er zoveel je wilt</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {CHECKIN_TASTE_TAGS.map(({ key, label }) => {
                            const on = tasteTags.includes(key);
                            return (
                              <button key={key} onClick={() => toggleTasteTag(key)} aria-pressed={on} className="press-scale" style={{
                                height: 38, padding: "0 15px", borderRadius: 100, boxSizing: "border-box",
                                display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                                border: `1px solid ${on ? BOTTLE : BORDER}`, background: on ? BOTTLE : CREAM, color: on ? CREAM : INK,
                                fontFamily: systemFont, fontSize: 14, fontWeight: 600,
                              }}>
                                {on && <Check size={14} strokeWidth={3} color="#DDB877" />}
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ ...cardStyle, overflow: "hidden" }}>
                        {!editingEntryId && !adoptTag && !guest && optionRow(Users, "Met wie",
                          tagged.length > 0 ? (
                            <span style={{ display: "flex", alignItems: "center" }}>
                              {tagged.slice(0, 3).map((f, i) => (
                                <span key={f.id} style={{ marginLeft: i ? -8 : 0, borderRadius: "50%", boxShadow: `0 0 0 2px ${CREAM}`, display: "flex" }}>
                                  <Avatar name={f.name} photo={f.avatar_url} size={28} />
                                </span>
                              ))}
                              {tagged.length > 3 && <span style={{ marginLeft: 6, fontSize: 13, color: MUTED, fontFamily: systemFont }}>+{tagged.length - 3}</span>}
                            </span>
                          ) : <span style={{ fontSize: 14.5, color: MUTED, fontFamily: systemFont }}>Niemand</span>,
                          () => setCiStep("friends"), false)}
                        {adoptTag && (
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 54, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, fontFamily: systemFont }}>
                            <Users size={19} color={BOTTLE} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 15.5, fontWeight: 600, color: INK }}>Met wie</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 14.5, color: MUTED }}>{adoptTag.taggerName || "je vriend"}</span>
                          </div>
                        )}
                        {adoptTag?.createdAt && (
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 54, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, fontFamily: systemFont }}>
                            <Clock size={19} color={BOTTLE} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 15.5, fontWeight: 600, color: INK }}>Wanneer</span>
                            <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 14.5, color: MUTED }}>{adoptWhenLabel(adoptTag.createdAt)}</span>
                          </div>
                        )}
                        {optionRow(MapPin, "Locatie",
                          <span style={{ fontSize: 14.5, color: MUTED, fontFamily: systemFont, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{location.trim() || "Thuis"}</span>,
                          () => setCiStep("location"), true)}
                      </div>
                      {adoptTag && adoptTag.taggerRating > 0 && rating === 0 && (
                        <button onClick={() => addEntry({ rating: adoptTag.taggerRating })} disabled={!nameInput.trim()} style={{
                          background: "none", border: "none", padding: "6px 0", cursor: "pointer", fontFamily: systemFont,
                          fontSize: 14.5, fontWeight: 700, color: BOTTLE, textAlign: "center",
                        }}>
                          Direct opslaan met hetzelfde cijfer ({formatRating(adoptTag.taggerRating)})
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          </EdgeSwipeBackArea>

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
          {confirmDiscard && (
            <ConfirmDialog title={editingEntryId ? "Wijzigingen weggooien?" : "Check-in weggooien?"}
              message={editingEntryId ? "Je aanpassingen worden niet bewaard." : "Wat je hebt ingevuld wordt niet bewaard."}
              cancelLabel="Verder gaan" confirmLabel="Weggooien"
              onCancel={() => setConfirmDiscard(false)} onConfirm={closeCheckinSheet} />
          )}
        </div>
      ), document.body)}

      {openEntry && (
        <CheckinDetailSheet entry={openEntry} recipe={findMatch(openEntry)} allIngredients={allIngredients} ingredientLabel={ingredientLabel}
          who={profile?.name || "Jij"} whoAvatar={profile?.avatar_url}
          onClose={() => setOpenEntryId(null)} onRemove={removeEntry} onEdit={startEditEntry}
          onOpenRecipe={onOpenRecipe} courseRank={courseRank} />
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
function CheckinPhotoViewer({ entry, matched, who, whoAvatar, allIngredients, onClose, onOpenRecipe = null, onOpenProfile = null, adopt = null }) {
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
  // Inzoomen zoals in de Foto's-app: knijpen met twee vingers, dubbeltikken
  // om in of uit te zoomen, en met één vinger verschuiven zolang je bent
  // ingezoomd. Ingezoomd sluit vegen of tikken het scherm niet.
  const imgRef = useRef(null);
  const zoom = useRef({ s: 1, x: 0, y: 0, pinch: null, pan: null, lastTap: 0 });
  const paintZoom = (animated) => {
    const z = zoom.current, el = imgRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 0.22s ease" : "none";
    el.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  };
  const clampPan = () => {
    const z = zoom.current, el = imgRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const maxX = Math.max(0, (w * z.s - w) / 2), maxY = Math.max(0, (h * z.s - h) / 2);
    z.x = Math.min(maxX, Math.max(-maxX, z.x));
    z.y = Math.min(maxY, Math.max(-maxY, z.y));
  };
  const zoomTo = (target, cx, cy) => {
    const z = zoom.current, el = imgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Punt onder de vinger blijft op zijn plek staan.
    const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    const k = target / z.s;
    z.x += ox * (1 - k); z.y += oy * (1 - k); z.s = target;
    if (z.s <= 1.01) { z.s = 1; z.x = 0; z.y = 0; }
    clampPan(); paintZoom(true);
  };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onZoomTouchStart = (e) => {
    const z = zoom.current;
    if (e.touches.length === 2) {
      // Tweede vinger erbij: een eventuele veeg-om-te-sluiten afbreken.
      if (drag.current?.moved) applyDrag(0, 150);
      drag.current = null;
      const r = imgRef.current?.getBoundingClientRect();
      z.pinch = { d: dist(e.touches), s: z.s, x: z.x, y: z.y,
        cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - (r ? r.left + r.width / 2 : 0),
        cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - (r ? r.top + r.height / 2 : 0) };
      z.pan = null;
    } else if (e.touches.length === 1 && z.s > 1) {
      z.pan = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, x: z.x, y: z.y };
    }
  };
  const onZoomTouchMove = (e) => {
    const z = zoom.current;
    if (z.pinch && e.touches.length === 2) {
      const p = z.pinch;
      const next = Math.min(5, Math.max(0.8, p.s * dist(e.touches) / p.d));
      const k = next / p.s;
      // Het punt tussen de vingers blijft onder de vingers staan.
      z.s = next; z.x = p.x + p.cx * (1 - k); z.y = p.y + p.cy * (1 - k);
      paintZoom(false);
    } else if (z.pan && e.touches.length === 1) {
      z.x = z.pan.x + (e.touches[0].clientX - z.pan.x0);
      z.y = z.pan.y + (e.touches[0].clientY - z.pan.y0);
      clampPan(); paintZoom(false);
    }
  };
  const onZoomTouchEnd = (e) => {
    const z = zoom.current;
    if (z.pinch && e.touches.length < 2) {
      z.pinch = null;
      if (z.s < 1.05) { z.s = 1; z.x = 0; z.y = 0; }
      clampPan(); paintZoom(true);
      justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 300);
      return;
    }
    if (z.pan) {
      const moved = e.changedTouches[0] && Math.hypot(e.changedTouches[0].clientX - z.pan.x0, e.changedTouches[0].clientY - z.pan.y0) > 6;
      z.pan = null;
      if (moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 300); return; }
    }
    // Dubbeltik: in- of uitzoomen.
    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = Date.now(), t = e.changedTouches[0];
      if (now - z.lastTap < 300) {
        z.lastTap = 0;
        justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 350);
        z.touchZoomAt = now;
        zoomTo(z.s > 1 ? 1 : 2.5, t.clientX, t.clientY);
      } else z.lastTap = now;
    }
  };

  const onPointerDown = (e) => {
    if (e.target.closest("button")) return;
    // Ingezoomd of met twee vingers bezig: niet vegen om te sluiten.
    if (zoom.current.s > 1 || zoom.current.pinch) return;
    drag.current = { y: e.clientY, t: Date.now(), dy: 0, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (zoom.current.s > 1 || zoom.current.pinch) { drag.current = null; return; }
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
        {/* Wie: tik = naar het profiel. */}
        <button onClick={onOpenProfile ? () => { onClose(); onOpenProfile(); } : undefined} disabled={!onOpenProfile} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: onOpenProfile ? "pointer" : "default", textAlign: "left", fontFamily: systemFont }}>
        <Avatar name={who} photo={whoAvatar} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: VIEWER_TEXT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{who}</div>
          <div style={{ fontSize: 13, color: VIEWER_MUTED, marginTop: 2, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
            <MapPin size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{[entry.location, entry.date].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        </button>
        <button onClick={onClose} aria-label="Sluiten" style={{ background: "none", border: "none", padding: 8, cursor: "pointer", color: VIEWER_TEXT, display: "flex" }}>
          <X size={26} />
        </button>
      </div>

      <div ref={photoRef}
        onTouchStart={onZoomTouchStart} onTouchMove={onZoomTouchMove} onTouchEnd={onZoomTouchEnd} onTouchCancel={onZoomTouchEnd}
        onDoubleClick={(e) => { if (Date.now() - (zoom.current.touchZoomAt || 0) < 600) return; justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 350); zoomTo(zoom.current.s > 1 ? 1 : 2.5, e.clientX, e.clientY); }}
        onClick={() => {
          // Enkele tik sluit (na een korte wachttijd, zodat een dubbeltik
          // eerst kan inzoomen); ingezoomd sluit een tik niet.
          if (justDragged.current || zoom.current.s > 1) return;
          setTimeout(() => { if (!justDragged.current && zoom.current.s <= 1) onClose(); }, 280);
        }}
        style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {src ? (
          <img ref={imgRef} src={src} alt={entry.name} draggable={false} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", pointerEvents: "none", transformOrigin: "center center", willChange: "transform" }} />
        ) : (
          <Martini size={56} color={VIEWER_MUTED} strokeWidth={1.2} />
        )}
      </div>

      {adopt && (
        <div data-viewer-bar style={{ ...bar, padding: "12px 14px 0" }}>
          <TagAdoptStrip dark adopted={adopt.adopted} myRating={adopt.myRating}
            onAdopt={() => { onClose(); adopt.onAdopt(); }}
            onView={adopt.onView ? () => { onClose(); setTimeout(adopt.onView, 60); } : null}
            style={{ flex: 1 }} />
        </div>
      )}
      {/* Cocktail: tik = naar het recept. */}
      <button data-viewer-bar onClick={matched && onOpenRecipe ? () => { onClose(); onOpenRecipe(matched.id); } : undefined} disabled={!(matched && onOpenRecipe)}
        style={{ ...bar, width: "100%", border: "none", textAlign: "left", cursor: matched && onOpenRecipe ? "pointer" : "default", fontFamily: systemFont, padding: "14px 18px calc(env(safe-area-inset-bottom) + 16px)" }}>
        {matched ? <RecipeCircle recipe={matched} allIngredients={allIngredients} size={52} /> : (
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(251,246,234,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Martini size={22} color={VIEWER_TEXT} strokeWidth={1.4} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 19, color: VIEWER_TEXT, lineHeight: 1.2 }}>{entry.name}</div>
          {subtitle && <div style={{ fontSize: 13, color: VIEWER_MUTED, marginTop: 3 }}>{subtitle}{matched && onOpenRecipe ? " · Bekijk recept" : ""}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, background: "rgba(251,246,234,0.1)", borderRadius: 100, padding: "6px 11px" }}>
          <Star size={13} fill="#D8AE5E" color="#D8AE5E" />
          <span style={{ fontWeight: 700, fontSize: 14, color: VIEWER_TEXT }}>{formatRating(entry.rating)}</span>
        </div>
        {matched && onOpenRecipe && <ChevronRight size={20} color={VIEWER_MUTED} style={{ flexShrink: 0 }} />}
      </button>
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
  const findMatch = (e) => e.recipeId ? recipes.find(r => r.id === canonicalRecipeId(e.recipeId)) : recipes.find(r => r.name.toLowerCase() === e.name.toLowerCase());
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
function FriendProfileSheet({ friendId, friendProfile, recipes, allIngredients, onClose, session, onBlocked, myLogboek = [], onOpenRecipe, myProfile = null, onOpenCheckin = null }) {
  const [logboek, setLogboek] = useState(null);
  const [pairTags, setPairTags] = useState([]);
  const myId = session?.user?.id;
  const [tab, setTab] = useState("fotos");
  // Zelfde opzet als je eigen profiel: Foto's (raster) en Posts (onder
  // elkaar). Tik je op een foto, dan spring je naar die post.
  const [scrollToPost, setScrollToPost] = useState(null);
  useEffect(() => {
    if (!scrollToPost || tab !== "posts") return;
    const t = setTimeout(() => {
      document.getElementById(`fr-post-${scrollToPost}`)?.scrollIntoView({ block: "start", behavior: "auto" });
      setScrollToPost(null);
    }, 30);
    return () => clearTimeout(t);
  }, [scrollToPost, tab]);
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
  const friendMasterNumber = useMasterNumber(friendRank.master ? friendProfile?.course_completed_at : null);
  const findMatch = (e) => e.recipeId ? recipes.find(r => r.id === canonicalRecipeId(e.recipeId)) : recipes.find(r => r.name.toLowerCase() === e.name.toLowerCase());
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
    <HeaderNavBar backLabel={view === "samen" ? firstName : "Terug"} onBack={view === "samen" ? () => setView("profiel") : onClose}
      title={view === "samen" ? "Samen" : firstName}
      style={{ marginBottom: 10 }}
      right={view === "profiel" && (
        <div style={{ position: "relative" }}>
          <HeaderIconButton onClick={() => setMenuOpen(o => !o)} label="Meer"><MoreHorizontal size={22} /></HeaderIconButton>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
              <div className="accordion-reveal" style={{ position: "absolute", right: 0, top: 46, zIndex: 2, color: INK, minWidth: 210, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 14, boxShadow: "0 10px 30px rgba(43,38,32,0.18)", overflow: "hidden" }}>
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
      )} />
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
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "0 14px", marginBottom: 22 }}>
          {together.events.slice(0, 12).map((ev, i) => (
            <div key={ev.key} onClick={ev.recipe && onOpenRecipe ? () => { onClose(); onOpenRecipe(ev.recipe.id); } : undefined} role={ev.recipe && onOpenRecipe ? "button" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none", cursor: ev.recipe && onOpenRecipe ? "pointer" : undefined }}>
              {ev.recipe ? <RecipeCircle recipe={ev.recipe} allIngredients={allIngredients} size={44} radius={10} /> : <span style={{ width: 44, height: 44, borderRadius: 10, background: PAPER_DEEP, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Martini size={18} color={MUTED} /></span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: serif, fontSize: 15.5, fontWeight: 700, color: INK }}>{ev.name}</span>
                <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{ev.location} · {shortDate(ev.date)}</span>
              </span>
              <span style={{ textAlign: "right", fontSize: 12.5, lineHeight: 1.45, flexShrink: 0, color: INK }}>
                <span style={{ display: "block" }}>Jij <strong>{ev.me != null ? formatRating(ev.me) : "–"}</strong></span>
                <span style={{ display: "block", color: BRASS_TEXT }}>{firstName} <strong>{ev.her != null ? formatRating(ev.her) : "–"}</strong></span>
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
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: 14, marginBottom: 22 }}>
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
          <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
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

  const fm = friendRank.master;
  const profielView = (
    <>
      <div style={{ height: 6 }} />
      <div style={fm ? MASTER_HEADER_STYLE : undefined}>
      {fm && <MasterHeaderTitle number={friendMasterNumber} />}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <CourseRing name={name} photo={friendProfile?.avatar_url} size={84} partsDone={friendRank.partsDone} master={friendRank.master} dark={fm} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 22, color: fm ? HEADER_TEXT : INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          {friendRank.rank && <div style={{ margin: "5px 0 3px" }}><CourseRankLabel courseRank={friendRank} chip onDark={fm} /></div>}
          {insights && <div style={{ fontSize: 14, fontWeight: 600, color: fm ? HEADER_ACCENT : BRASS_TEXT, marginTop: 2 }}>Niveau {insights.level.level} · {insights.level.title}</div>}
        </div>
      </div>

      {stats && (
        <div style={fm
          ? { display: "flex", padding: "12px 0 0", borderTop: "1px solid rgba(221,184,119,0.25)" }
          : { display: "flex", padding: "12px 0", marginBottom: 16, background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD }}>
          {[
            { value: stats.total, label: "check-ins" },
            { value: stats.uniques, label: "uniek" },
            { value: <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{stats.total > 0 ? formatDecimal1(stats.avg) : "–"}<Star size={13} fill="#C8963A" color="#C8963A" /></span>, label: "gemiddeld" },
          ].map((c) => (
            <div key={c.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: systemFont, fontWeight: 700, fontSize: 20, color: fm ? HEADER_TEXT : INK }}>{c.value}</div>
              <div style={{ fontSize: 12, color: fm ? HEADER_MUTED : MUTED, marginTop: 1 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}
      </div>

      {showSamenStrip && (
        <button onClick={() => setView("samen")} className="press-scale" style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", boxSizing: "border-box", borderRadius: 16,
          background: BOTTLE_DARK, color: HEADER_TEXT, border: "none", cursor: "pointer", textAlign: "left", fontFamily: sans, marginBottom: 18,
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

      <div role="tablist" style={{ display: "flex", borderBottom: "1px solid rgba(43,38,32,0.14)", marginBottom: 14 }}>
        {[["fotos", "Foto's", LayoutGrid], ["posts", "Posts", Rows2], ["smaak", "Smaak", Heart], ["prestaties", "Prestaties", Award]].map(([id, lbl, Icon]) => {
          const on = tab === id;
          return (
            <button key={id} role="tab" aria-selected={on} onClick={() => setTab(id)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0 8px", marginBottom: -1,
              background: "none", border: "none", borderBottom: `2.5px solid ${on ? BRASS : "transparent"}`, cursor: "pointer",
              fontFamily: sans, fontSize: 12.5, fontWeight: on ? 800 : 700, color: on ? INK : MUTED,
            }}>
              <Icon size={19} strokeWidth={on ? 2.2 : 1.9} />
              {lbl}
            </button>
          );
        })}
      </div>

      {!logboek ? (
        <p style={{ color: MUTED, fontSize: 13.5, textAlign: "center", padding: "40px 0" }}>Bezig met laden…</p>
      ) : tab === "posts" && logboek.length > 0 ? (
        <div>
          {logboek.map(entry => {
            const matched = findMatch(entry);
            const photo = entry.photo || (matched && (localItemImageUrl("cocktail", matched.id) || matched.image)) || null;
            return (
              <div key={entry.id} id={`fr-post-${entry.id}`} style={{ scrollMarginTop: 12, marginBottom: 14, borderRadius: 20, background: CREAM, padding: 12, boxShadow: SHADOW_CARD }}>
                <button onClick={() => setPhotoViewer({ entry, matched })} aria-label={`${entry.name} openen`} style={{ display: "block", width: "100%", padding: 0, border: "none", background: BOTTLE_DARK, borderRadius: 14, overflow: "hidden", aspectRatio: "8 / 7", cursor: "pointer", position: "relative" }}>
                  {photo ? (
                    <img src={photo} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: entry.photo ? "none" : RECIPE_PHOTO_FILTER }} />
                  ) : matched ? (
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><RecipeCircle recipe={matched} allIngredients={allIngredients} size={120} /></span>
                  ) : (
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Martini size={44} color="rgba(251,246,234,0.85)" strokeWidth={1.3} /></span>
                  )}
                  {withMeIds.has(String(entry.id)) && (
                    <span title="Samen met jou" style={{ position: "absolute", right: 10, top: 10, borderRadius: "50%", boxShadow: `0 0 0 2px ${CREAM}` }}>
                      <Avatar name={myProfile?.name || "Jij"} photo={myProfile?.avatar_url} size={26} />
                    </span>
                  )}
                </button>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 4px 0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {matched && onOpenRecipe ? (
                      <button onClick={() => { onClose(); onOpenRecipe(matched.id); }} style={{ display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: INK }}>
                        <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.1 }}>{entry.name}</span>
                        <ChevronRight size={17} color={MUTED} style={{ verticalAlign: "-2px", marginLeft: 2 }} />
                      </button>
                    ) : (
                      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, lineHeight: 1.1, color: INK }}>{entry.name}</div>
                    )}
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>{[entry.location, feedRelTime(entry)].filter(Boolean).join(" · ")}</div>
                  </div>
                  <FeedScore value={entry.rating} />
                </div>
                {entry.notes && (
                  <p style={{ margin: "10px 4px 0", paddingTop: 11, borderTop: `1px solid ${BORDER}`, fontFamily: sans, fontSize: 15, lineHeight: 1.5, color: INK, whiteSpace: "pre-wrap" }}>{entry.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (tab === "fotos" || tab === "posts") ? (
        logboek.length === 0 ? (
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "26px 20px", textAlign: "center", fontSize: 14, color: MUTED }}>{firstName} heeft nog niets ingecheckt.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {logboek.map(entry => {
              const matched = findMatch(entry);
              const recipeImg = matched && (localItemImageUrl("cocktail", matched.id) || matched.image);
              const src = entry.photo || recipeImg;
              return (
                <button key={entry.id} onClick={() => { setScrollToPost(entry.id); setTab("posts"); }} aria-label={`${entry.name}, ${formatRating(entry.rating)} sterren`} style={{
                  position: "relative", aspectRatio: "1", overflow: "hidden", border: "none", borderRadius: 10, padding: 0, cursor: "pointer", background: PAPER_DEEP,
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
                    <span style={{ fontSize: 12, color: ON_DARK_TEXT, fontWeight: 700 }}>{formatRating(entry.rating)}</span>
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
          <div style={{ background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 18, padding: "18px 18px 14px", boxShadow: SHADOW_HERO, borderBottom: `3px solid ${BRASS}`, marginBottom: 22 }}>
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
          {insights && <TasteDetails insights={insights} logboek={logboek} recipes={recipes} allIngredients={allIngredients}
            onOpenRecipe={onOpenRecipe ? (id) => { onClose(); onOpenRecipe(id); } : null} />}
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
                  <div className="accordion-reveal" style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, padding: "12px 14px" }}>
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
    <div className="push-slide-in" style={{
      position: "fixed", inset: 0, zIndex: 30, background: PAPER, display: "flex", flexDirection: "column", fontFamily: sans, color: INK,
    }}>
      {/* De kop staat vast bovenaan; alleen de inhoud eronder scrolt (en
          veert bij naar beneden trekken), zodat de kop nooit meebeweegt. */}
      <EdgeSwipeBackArea bleed={false} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        onBack={view === "samen" ? () => setView("profiel") : onClose}>
        <div style={{ padding: "0 20px", flexShrink: 0, position: "relative", zIndex: 2 }}>{header}</div>
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px calc(env(safe-area-inset-bottom) + 36px)", overflowX: "hidden" }}>
            {view === "samen" ? samenView : profielView}
          </div>
        </div>
      </EdgeSwipeBackArea>
      {photoViewer && (() => {
        // Getagd in deze check-in van je vriend: overnemen kan ook hier.
        const t = myId ? pairTags.find(x => x.tagger_id === friendId && x.tagged_user_id === myId && String(x.checkin_id) === String(photoViewer.entry.id)) : null;
        const mine = t?.adopted_checkin_id != null ? myLogboek.find(e => String(e.id) === String(t.adopted_checkin_id)) : null;
        const adopt = t && onOpenCheckin ? {
          adopted: t.adopted_checkin_id != null, myRating: mine?.rating || null,
          onAdopt: () => { onClose(); onOpenCheckin(adoptCheckinRequest(photoViewer.entry, t, name)); },
          onView: null,
        } : null;
        return <CheckinPhotoViewer entry={photoViewer.entry} matched={photoViewer.matched} who={name} whoAvatar={friendProfile?.avatar_url} allIngredients={allIngredients} onClose={() => setPhotoViewer(null)}
          onOpenRecipe={onOpenRecipe ? (id) => { onClose(); onOpenRecipe(id); } : null} adopt={adopt} />;
      })()}
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
function VriendenTab({ session, profile, recipes, allIngredients, onSound, active, myLogboek = [], onOpenRecipe, onOpenCheckin = null }) {
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
  const loadBlocked = async () => {
    const { data } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", myId);
    setBlockedIds(new Set((data || []).map(b => b.blocked_id)));
  };
  useEffect(() => {
    if (!active || !myId) return;
    loadBlocked();
  }, [myId, active]);
  // Naar beneden trekken = verzoeken, vrienden en een lopende zoekopdracht verversen.
  const refreshAll = async () => {
    await Promise.all([loadFriendships(), loadBlocked()]);
    if (query.trim().length >= 2) await doSearch(query);
  };
  const { indicatorRef: friendsPullRef, refreshing: friendsRefreshing, handlers: friendsPullHandlers } = usePullToRefresh(() => refreshAll());

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
    <div {...friendsPullHandlers} style={{ touchAction: "pan-y" }}>
      <div ref={friendsPullRef} aria-hidden style={{
        height: 0, opacity: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 4, color: BOTTLE,
      }}>
        <span className={`ptr-icon${friendsRefreshing ? " spin-icon" : ""}`} style={{ display: "flex", transition: "transform 0.1s linear" }}>
          <Martini size={18} strokeWidth={1.8} />
        </span>
      </div>
      {incoming.length > 0 && (
        <>
          <SectionLabel>Vriendschapsverzoeken</SectionLabel>
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden", marginBottom: 26 }}>
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
        borderRadius: RADIUS, border: `1px dashed ${BOTTLE}`, background: "none", color: BOTTLE,
        fontFamily: sans, fontSize: 13.5, fontWeight: 700, cursor: "pointer", marginBottom: 10,
      }}>
        <Share2 size={15} />
        {shareState === "shared" ? "Verstuurd!" : shareState === "copied" ? "Link gekopieerd!" : shareState === "failed" ? "Kopiëren mislukt" : "Deel uitnodigingslink"}
      </button>
      <div style={{ marginBottom: 10 }}>
        <input value={query} onChange={e => doSearch(e.target.value)} placeholder="Zoek op naam…" enterKeyHint="search" autoCapitalize="words" style={fieldStyle()} />
      </div>
      {searchResults.length > 0 && (
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden", marginBottom: 26 }}>
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
          <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden", marginBottom: 26 }}>
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
        <div style={{ background: CREAM, border: "none", boxShadow: SHADOW_CARD, borderRadius: 16, overflow: "hidden" }}>
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
          onOpenCheckin={onOpenCheckin}
          onBlocked={() => { setOpenFriendId(null); loadFriendships(); }}
          onClose={() => setOpenFriendId(null)}
        />
      )}
    </div>
  );
}


 


