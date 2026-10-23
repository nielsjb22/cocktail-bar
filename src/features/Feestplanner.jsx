// Losgeladen onderdeel van de app (React.lazy): laadt pas als je dit scherm opent.
// Code komt uit ThuisbarApp.jsx; gedeelde onderdelen worden daaruit geïmporteerd.
import { useState, useEffect, useMemo, useContext, useRef } from "react";
import { PartyPopper, Plus, Share2, Martini, Pencil, Shuffle, AlertTriangle, Sparkles, ChevronRight, Users, Trash2, ChevronUp, ChevronDown, ShoppingCart, Check, RefreshCw, Info, ClipboardList, X, Image as ImageIcon, Printer } from "lucide-react";
import { tallyChoices, CUSTOM_PREFIX, SURVEY_MIXERS, choiceLabel, ingredientPreferenceCounts } from "../surveyOptions";
import { supabase } from "../supabaseClient";
import { partyInfoQuery, renderMenuOgCanvas, partyMenuQuery, menuCocktailInfo, renderMenuCanvas, canvasToPdf } from "../menuCard";
import { canonicalRecipeId, PRICES_UPDATED } from "../recipes.js";
import { isNative as isNativeShell } from "../native";
import feestHeaderImg from "../assets/feest-header.jpg";
import { createPortal } from "react-dom";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { AnimatedNumber, BORDER, BOTTLE, BOTTLE_DARK, BRASS, BRASS_TEXT, BURGUNDY, BatchRecipePicker, CREAM, ConfirmDialog, FAMILY_TASTE, HEADER_ACCENT, HEADER_MUTED, HEADER_TEXT, INK, KORTE_MAANDEN, MUTED, MatchPill, MenuToggleRow, NavOverrideContext, PAPER, PAPER_DEEP, RADIUS, RecipeCircle, RecipeSheet, SAGE, SHADOW_CARD, SHADOW_CTA, SectionLabel, SheetGrabber, Switch, TASTE_META, cancelPartyReminder, compareUpcomingParties, euro, findIngredientMeta, formatPartyWhen, getMenuRole, getTasteProfile, inferTechniques, ingredientKey, isPartyUpcoming, localItemImageUrl, partyNotificationId, publicAppUrl, sans, serif, shareLink, systemFont, useBodyScrollLock, usePullToRefresh, useSheetDismiss } from "../ThuisbarApp.jsx";

// Sticky headers: de hele pagina scrollt via het venster, dus
// "position: sticky" werkt overal hetzelfde. De groene kop van een
// subscherm (HeaderNavBar) is 44px + 2px messinglijn hoog; een tweede
// sticky balk eronder staat precies op die hoogte.
const STICKY_SUBHEADER_TOP = "calc(env(safe-area-inset-top) + 46px)";

function formatAantal(n) {
  const rounded = Math.round(n * 2) / 2;
  return rounded % 1 === 0 ? String(rounded) : String(rounded).replace(".", ",");
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
  const chosenRecipes = (party.cocktail_ids || []).map(id => recipes.find(r => r.id === canonicalRecipeId(id))).filter(Boolean);
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
            width: 76, minHeight: 44, border: "none", background: BOTTLE, color: CREAM,
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
  parties, onCreateParty, onUpdateParty, onDeleteParty, openPartyId, onOpenPartyHandled, hostName, recentRecipeIds, favoriteRecipeIds, onOpenMenuAssistent, maAnswersByParty = {} }) {
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
        hostName={hostName} active={active} recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
        onOpenMenuAssistent={onOpenMenuAssistent ? () => onOpenMenuAssistent(selectedParty.id) : null} maAnswers={maAnswersByParty[selectedParty.id] || null} />
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
        background: BOTTLE_DARK, color: HEADER_TEXT, border: "none", borderRadius: RADIUS, fontSize: 14.5, fontWeight: 700,
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
      display: "block", width: "100%", textAlign: "left", background: CREAM, border: "none",
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

function PartyFormSheet({ initial, busy, onClose, onSubmit, onDelete = null }) {
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
    <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
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
        <div style={{ padding: "18px 20px", overflowY: "auto", overflowX: "hidden" }}>
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
            background: BOTTLE_DARK, color: HEADER_TEXT, border: "none", borderRadius: RADIUS, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: SHADOW_CTA,
          }}>
            {busy ? "Bezig…" : initial ? "Opslaan" : "Feest aanmaken"}
          </button>
          {onDelete && (
            <button onClick={onDelete} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", minHeight: 44, marginTop: 10,
              background: "none", border: "none", color: BURGUNDY, fontFamily: sans, fontSize: 14.5, fontWeight: 700, cursor: "pointer",
            }}>
              <Trash2 size={15} /> Feest verwijderen
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

function PartyDetailScreen({ session, party, onUpdateParty, onBack, onDelete, recipes, isOwned, ingredientLabel, allIngredients, onAddToShoppingList, voorraadAantal, onSound, onOpenRecipe, hostName, active, recentRecipeIds = [], favoriteRecipeIds = [], onOpenMenuAssistent = null, maAnswers = null }) {
  const [activeTab, setActiveTab] = useState("menu");
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [shareState, setShareState] = useState(null);
  const [pickerFor, setPickerFor] = useState(null); // null | index | "new"
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
  const [surveyError, setSurveyError] = useState(null);
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
    setSurveyError(null);
    const { data, error } = await supabase.from("party_surveys").insert({ host_user_id: myId, title: party.name }).select().single();
    setCreatingSurvey(false);
    if (data) { setSurvey(data); setSurveyResponses([]); onSound("pop"); onUpdateParty({ taste_survey_id: data.id }); return; }
    // Voorheen gebeurde er dan stil niets; nu zie je wat er mis is.
    console.warn("Smaaktest maken mislukt:", error);
    setSurveyError(navigator.onLine === false ? "Geen internet. Probeer het opnieuw als je weer verbinding hebt." : "De smaaktest kon niet worden aangemaakt. Probeer het later nog eens.");
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
    return ids.map(id => recipes.find(r => r.id === canonicalRecipeId(id))?.name).filter(Boolean);
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
  const suggestionSheetRecipe = suggestionSheetId ? recipes.find(r => r.id === canonicalRecipeId(suggestionSheetId)) : null;
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
    const names = ids.map(id => recipes.find(r => r.id === canonicalRecipeId(id))?.name).filter(Boolean);
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

  // Een leeg menu mag (geen verplichte cocktail meer); toevoegen of wisselen
  // gaat via een kiesscherm i.p.v. een los zoekveld in de veegrij — dat werd
  // daar afgesneden en botste met het vegen.
  const pickRecipe = (id) => {
    if (pickerFor === "new") {
      if (!chosen.includes(id)) { onSound("pop"); setChosen([...chosen, id]); }
    } else if (pickerFor != null) {
      const next = chosen.slice(); next[pickerFor] = id; setChosen(next);
    }
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
  const stepperBtn = { width: 32, height: 32, borderRadius: 10, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer" };
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
        marginBottom: 4, color: BOTTLE,
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

      {/* Feestkaart als kop: hoe lang nog, naam, datum en gasten, en drie
          voortgangsbalkjes (menu, inkoop, voorbereiding). Het potlood opent
          "Feest aanpassen" (ook gasten, drankjes p.p. en verwijderen).
          Alleen de schakelaar eronder blijft vast staan tijdens scrollen. */}
      {(() => {
        const toBuyKeys = teKopenRows.map(r => r.key);
        const bought = toBuyKeys.filter(k => checkedBuyItems.includes(k)).length;
        const prepDone = prepChecklist.filter(i => checkedPrep.includes(i.id)).length;
        const bars = [
          ["Menu", chosenRecipes.length > 0 ? `${chosenRecipes.length}` : "leeg", chosenRecipes.length > 0 ? 100 : 0],
          ["Inkoop", toBuyKeys.length ? `${bought}/${toBuyKeys.length}` : "in huis", toBuyKeys.length ? Math.round((bought / toBuyKeys.length) * 100) : (chosenRecipes.length ? 100 : 0)],
          ["Voorbereid", prepChecklist.length ? `${prepDone}/${prepChecklist.length}` : "–", prepChecklist.length ? Math.round((prepDone / prepChecklist.length) * 100) : 0],
        ];
        return (
          <div style={{ position: "relative", background: BOTTLE_DARK, color: HEADER_TEXT, borderRadius: 20, padding: "18px 18px 16px", borderBottom: `3px solid ${BRASS}`, marginBottom: 14, boxShadow: SHADOW_CARD }}>
            <button onClick={() => setShowEditSheet(true)} aria-label="Feest aanpassen" className="press-scale" style={{
              position: "absolute", right: 14, top: 14, width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(251,246,234,0.12)",
              color: HEADER_ACCENT, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
              <Pencil size={16} />
            </button>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: HEADER_ACCENT, paddingRight: 48 }}>{formatPartyWhen(party)}</div>
            <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginTop: 4, paddingRight: 48 }}>{party.name || "Mijn feest"}</div>
            <div style={{ fontSize: 14, color: HEADER_TEXT, marginTop: 6, fontWeight: 600 }}>
              {party.starts_at ? `${formatDayShort(new Date(party.starts_at))} · ${formatTimeShort(new Date(party.starts_at))} · ` : ""}{guests} {guests === 1 ? "gast" : "gasten"}
            </div>
            <div style={{ fontSize: 13, color: HEADER_MUTED, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {totalDrinks} drankjes · ± <AnimatedNumber value={totalCost} format={euro} /> inkoop{party.address ? ` · ${party.address}` : ""}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              {bars.map(([label, value, pct]) => (
                <div key={label} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(251,246,234,0.16)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: BRASS, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: HEADER_MUTED, marginTop: 6, whiteSpace: "nowrap" }}>{label} <strong style={{ color: HEADER_TEXT }}>{value}</strong></div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <div style={{
        position: "sticky", top: STICKY_SUBHEADER_TOP, zIndex: 15, background: PAPER,
        marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20, paddingBottom: 12,
        marginBottom: 18,
      }}>
        <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: PAPER_DEEP, borderRadius: 12 }}>
          {[["menu", "Menu"], ["inkoop", "Inkoop"], ["voorbereiding", "Voorbereiding"]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)} style={{
              flex: 1, height: 34, padding: "0 6px", borderRadius: 9, border: "none",
              background: activeTab === id ? BOTTLE : "transparent", color: activeTab === id ? CREAM : MUTED,
              fontFamily: sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {showEditSheet && (
        <PartyFormSheet initial={party} onClose={() => setShowEditSheet(false)}
          onSubmit={fields => { onUpdateParty(fields); setShowEditSheet(false); }}
          onDelete={onDelete ? () => { setShowEditSheet(false); onDelete(); } : null} />
      )}

      {activeTab === "menu" && (
      <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <SectionLabel>Menu ({chosenRecipes.length})</SectionLabel>
            <button onClick={() => { if (chosen.length > 0) setConfirmNieuweSuggestie(true); else { onSound("shuffle"); setChosen(pickRandom(3)); } }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 100, padding: "6px 12px", minHeight: 44, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
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
              onConfirm={() => { setConfirmNieuweSuggestie(false); setChosen(pickRandom(chosen.length)); }} />
          )}
          {chosenRecipes.length === 0 && (
            <div style={{ background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD, padding: "20px 18px", textAlign: "center", fontSize: 13.5, color: MUTED, lineHeight: 1.5 }}>
              Nog geen cocktails op het menu. Kies er zelf een of tik op Nieuwe suggestie.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {chosenRecipes.map((r, i) => {
              const required = r.ingredients.filter(ing => !ing.optional);
              const missing = required.filter(ing => !isOwned(ing));
              const warnings = surveyResponses.length > 0 ? getSurveyWarnings(r, surveyDietaryTotals, surveyDislikeTotals) : [];
              const row = (
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: CREAM, border: "none", boxShadow: SHADOW_CARD, padding: "10px 12px" }}>
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
                </div>
              );
              return (
                <SwipeRevealRow key={i} onWissel={() => setPickerFor(i)} onVerwijder={() => removeSlot(i)}>
                  {row}
                </SwipeRevealRow>
              );
            })}
          </div>

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
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 40, background: BOTTLE_DARK, color: HEADER_TEXT,
                  border: "none", borderRadius: 100, padding: "0 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                }}>
                  Houd de beste {guestTiers.target}
                </button>
              </div>
            </div>
          )}

          <button onClick={() => setPickerFor("new")} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", background: "none", border: `1px dashed ${BOTTLE}`, borderRadius: 14, padding: "13px", minHeight: 44, fontSize: 12.5, fontWeight: 700, color: BOTTLE, cursor: "pointer", marginTop: 10 }}>
            <Plus size={14} /> {chosenRecipes.length === 0 ? "Cocktail kiezen" : "Cocktail toevoegen"}
          </button>
          {pickerFor != null && (
            <BatchRecipePicker recipes={recipes} allIngredients={allIngredients}
              recentRecipeIds={recentRecipeIds} favoriteRecipeIds={favoriteRecipeIds}
              currentId={pickerFor === "new" ? null : chosen[pickerFor]}
              onPick={pickRecipe} onClose={() => setPickerFor(null)} />
          )}
          {/* Hulp bij je menu: smaaktest en Menu-assistent samen in één
              kaart onder het menu. De smaaktest klapt open bij Bekijk. */}
          {(() => {
            const n = surveyResponses.length;
            const applied = maAnswers?.appliedSurveyCount;
            const fresh = applied != null && n > applied ? n - applied : 0;
            const row = ({ icon, title, sub, subColor, action, onClick, first, open }) => (
              <button onClick={onClick} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", background: "none", border: "none",
                borderTop: first ? "none" : `1px solid ${BORDER}`, textAlign: "left", cursor: "pointer", fontFamily: sans,
              }}>
                <span style={{ width: 36, height: 36, borderRadius: 11, background: PAPER_DEEP, color: BOTTLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, color: INK }}>{title}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: subColor || MUTED, marginTop: 1, lineHeight: 1.35 }}>{sub}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 1, fontSize: 13, fontWeight: 700, color: BOTTLE, flexShrink: 0 }}>
                  {action}<ChevronRight size={15} strokeWidth={2.4} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }} />
                </span>
              </button>
            );
            return (
              <div style={{ marginTop: 26 }}>
                <SectionLabel>Hulp bij je menu</SectionLabel>
                <div style={{ background: CREAM, borderRadius: 16, boxShadow: SHADOW_CARD, overflow: "hidden" }}>
                  {row({
                    first: true, icon: <Users size={17} />, title: "Smaaktest",
                    sub: survey === undefined ? "Laden…" : survey === null ? "Vraag je gasten vooraf naar hun smaak" : n > 0 ? `${n} reactie${n === 1 ? "" : "s"} binnen` : "Nog geen reacties, deel de link",
                    action: showSurvey ? "Verberg" : survey === null ? "Maak" : "Bekijk", open: showSurvey,
                    onClick: () => { onSound("tick"); setShowSurvey(v => !v); },
                  })}
                  {onOpenMenuAssistent && row({
                    icon: <Sparkles size={17} />, title: "Menu-assistent",
                    sub: fresh > 0 ? `${fresh} nieuwe reactie${fresh === 1 ? "" : "s"} sinds je menu` : n > 0 ? "Stel samen op basis van de smaaktest" : "Een gebalanceerd menu in een paar vragen",
                    subColor: fresh > 0 ? BRASS_TEXT : null, action: fresh > 0 ? "Opnieuw" : "Start",
                    onClick: () => { onSound("pop"); onOpenMenuAssistent(); },
                  })}
                </div>
              </div>
            );
          })()}
      {showSurvey && (
      <div className="accordion-reveal" style={{ background: CREAM, border: "none", borderRadius: 16, boxShadow: SHADOW_CARD, padding: 16, marginTop: 10 }}>
        {survey === undefined ? null : survey === null ? (
          <>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
              Stuur een linkje rond zodat gasten hun smaak kunnen doorgeven — daaruit rollen menu-suggesties voor de hele groep.
            </p>
            <button onClick={createSurvey} disabled={creatingSurvey} className="press-scale" style={{
              display: "flex", alignItems: "center", gap: 7, border: `1px dashed ${BOTTLE}`, background: "none", color: BOTTLE,
              borderRadius: RADIUS, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: sans,
            }}>
              <Share2 size={14} /> {creatingSurvey ? "Bezig…" : "Smaaktest aanmaken"}
            </button>
            {surveyError && <p role="alert" style={{ color: BURGUNDY, fontSize: 13, lineHeight: 1.45, margin: "10px 0 0" }}>{surveyError}</p>}
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: MUTED }}>
                <span title="Live: nieuwe reacties verschijnen automatisch" style={{ width: 6, height: 6, borderRadius: "50%", background: SAGE, flexShrink: 0 }} />
                {surveyResponses.length === 0 ? "Nog geen reacties" : `${surveyResponses.length} reactie${surveyResponses.length === 1 ? "" : "s"} binnen`}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={shareSurvey} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${SAGE}`, color: SAGE, borderRadius: 100, padding: "6px 12px", minHeight: 44, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <Share2 size={13} /> {surveyShareState === "shared" ? "Gedeeld!" : surveyShareState === "copied" ? "Link gekopieerd!" : surveyShareState === "failed" ? `Delen mislukt${lastShareError ? ` (${lastShareError})` : ""}` : surveyShareState === "no-url" ? "Webadres nog niet ingesteld" : "Deel de link"}
                </button>
                <button onClick={() => setConfirmDeleteSurvey(true)} title="Verwijder smaaktest" className="press-scale" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, background: "none", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 100, cursor: "pointer", flexShrink: 0 }}>
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
                        <span key={t.key} style={{ display: "inline-flex", alignItems: "center", background: PAPER_DEEP, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: INK, fontWeight: 600 }}>
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
                        <button onClick={addSurveyMixersToList} className="press-scale" style={{ flexShrink: 0, minHeight: 44, padding: "0 12px", borderRadius: 10, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
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
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: PAPER_DEEP, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: INK, fontWeight: 600 }}>
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
                        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: PAPER_DEEP, borderRadius: 100, padding: "4px 10px", fontSize: 11.5, color: INK, fontWeight: 600 }}>
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
                      <button onClick={autoComposeMenu} className="press-scale" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${BOTTLE}`, color: BOTTLE, borderRadius: 100, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
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
                              {mentioned && <span style={{ fontSize: 8.5, color: BRASS_TEXT, fontWeight: 700, border: `1px solid ${BRASS}`, borderRadius: 100, padding: "1px 5px" }}>genoemd</span>}
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
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 7, minHeight: 44, fontSize: 11, color: HEADER_TEXT, fontWeight: 700, background: BOTTLE_DARK, border: "none", borderRadius: 10, cursor: "pointer" }}
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
      )}

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

      </>
      )}

      {activeTab === "inkoop" && (
      <>
          <div style={{ background: PAPER_DEEP, border: `1px solid ${BORDER}`, borderRadius: RADIUS, boxShadow: SHADOW_CARD, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <ShoppingCart size={15} color={BRASS} />
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED }}>Inkooplijst</span>
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
                              display: "flex", alignItems: "center", gap: 6, minHeight: 40, background: "none", border: `1px solid ${BOTTLE}`,
                              color: BOTTLE, borderRadius: 100, padding: "0 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                            }}>
                              <RefreshCw size={12} /> Wissel naar {alt.name}
                            </button>
                          ) : (
                            <p style={{ fontSize: 11.5, color: MUTED, margin: 0 }}>Geen vergelijkbaar alternatief gevonden.</p>
                          )
                        ) : (
                          <button onClick={() => setAltOpenKey(row.key)} className="press-scale" style={{
                            display: "flex", alignItems: "center", gap: 6, minHeight: 40, background: "none", border: `1px solid ${BURGUNDY}`,
                            color: BURGUNDY, borderRadius: 100, padding: "0 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
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
              <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED }}>Voorbereiding</span>
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

export { FeestplannerTab };
