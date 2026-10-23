// Delen buiten de app: een check-in of je bar-jaaroverzicht als staande
// afbeelding (1080 × 1920, formaat voor een Instagram-story of
// WhatsApp-status), met eerst een voorbeeld. Laadt pas als je op Delen tikt.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { ChevronLeft, Share2, X } from "lucide-react";
import { isNative } from "../native";
import {
  BORDER, BOTTLE, BOTTLE_DARK, BRASS, CREAM, HEADER_TEXT, INK, MUTED, PAPER, PAPER_DEEP, SHADOW_CARD,
  Switch, findRecipeFor, formatRating, getBaseSpirit,
  localItemImageUrl, myTasteVector, sans, serif, TASTE_DIMS, TASTE_WORD, useBodyScrollLock,
} from "../ThuisbarApp.jsx";

const W = 1080, H = 1920;
const GOLD = "#E8C98E", LIGHT = "#FBF6EA", SOFT = "#D9D2C2", DARK = "#0E1917";
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

// ---------- Tekenhulpjes ----------
function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('700 120px "Playfair Display"'), document.fonts.load('italic 500 48px "Playfair Display"'),
      document.fonts.load('700 40px "Inter"'), document.fonts.load('400 40px "Inter"'), document.fonts.load('600 40px "Inter"'),
    ]);
  } catch { /* systeemletter als terugval */ }
}
function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/); const lines = []; let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = keep[maxLines - 1].replace(/\s*\S*$/, "") + "…"; return keep; }
  return lines;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}
function stars(ctx, x, y, rating, size = 34) {
  for (let i = 0; i < 5; i++) {
    const cx = x + size + i * size * 2.25, fill = Math.max(0, Math.min(1, rating - i));
    ctx.save(); star(ctx, cx, y, size); ctx.fillStyle = "rgba(232,201,142,0.28)"; ctx.fill();
    if (fill > 0) { ctx.clip(); ctx.fillStyle = GOLD; ctx.fillRect(cx - size, y - size, size * 2 * fill, size * 2); }
    ctx.restore();
  }
}
async function brand(ctx, x, y, color = GOLD) {
  const icon = await loadImage("/apple-touch-icon.png");
  if (icon) { ctx.save(); roundRect(ctx, x, y - 30, 60, 60, 14); ctx.clip(); ctx.drawImage(icon, x, y - 30, 60, 60); ctx.restore(); }
  ctx.fillStyle = color; ctx.font = '700 34px "Inter", sans-serif'; ctx.textBaseline = "middle";
  ctx.fillText("MIJN THUISBAR", x + (icon ? 82 : 0), y + 1);
  ctx.textBaseline = "alphabetic";
}
function spaced(ctx, text, x, y, spacing) {
  // Letterspatiëring voor de kleine kopjes (canvas kent geen letter-spacing overal).
  let cx = x; for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
}
const datumTekst = (iso) => { if (!iso) return ""; const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso); return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`; };

// ---------- Check-in ----------
async function drawCheckin({ entry, recipe, who, metPlek, metNotitie }) {
  await fontsReady();
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);
  let photo = await loadImage(entry.photo);
  if (!photo && recipe) photo = await loadImage(localItemImageUrl("cocktail", recipe.id));
  if (photo) cover(ctx, photo, 0, 0, W, H);
  // Leesbaarheid: donker boven en (vooral) onder.
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(10,20,18,0.55)"); g.addColorStop(0.18, "rgba(10,20,18,0)"); g.addColorStop(0.45, "rgba(10,20,18,0)"); g.addColorStop(1, "rgba(10,20,18,0.95)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Boven: wie
  ctx.fillStyle = "#7A2E2A"; ctx.beginPath(); ctx.arc(116, 140, 50, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = LIGHT; ctx.font = '700 46px "Inter", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((who || "?").trim().charAt(0).toUpperCase(), 116, 142); ctx.textAlign = "left";
  ctx.font = '700 40px "Inter", sans-serif'; ctx.fillText(`${who || "Ik"} checkte in`, 192, 142); ctx.textBaseline = "alphabetic";
  // Onder: van beneden naar boven opbouwen.
  const left = 72, maxW = W - 144;
  let y = H - 110;
  await brand(ctx, left, y);
  y -= 62; ctx.fillStyle = "rgba(232,201,142,0.35)"; ctx.fillRect(left, y, maxW, 2);
  y -= 56;
  if (metNotitie && entry.notes) {
    ctx.font = 'italic 500 46px "Playfair Display", serif'; ctx.fillStyle = "#F0E8D6";
    const lines = wrap(ctx, `"${entry.notes.trim()}"`, maxW, 3);
    for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], left, y); y -= 62; }
    y -= 14;
  }
  const meta = [metPlek ? entry.location : null, datumTekst(entry.date)].filter(Boolean).join(" · ");
  if (meta) { ctx.font = '400 38px "Inter", sans-serif'; ctx.fillStyle = SOFT; ctx.fillText(meta, left, y); y -= 70; }
  if (entry.rating > 0) {
    stars(ctx, left, y - 4, entry.rating);
    ctx.font = '700 44px "Inter", sans-serif'; ctx.fillStyle = GOLD; ctx.fillText(formatRating(entry.rating), left + 5 * 34 * 2.25 + 18, y + 12);
    y -= 84;
  }
  ctx.font = '700 128px "Playfair Display", serif'; ctx.fillStyle = LIGHT;
  const nameLines = wrap(ctx, entry.name, maxW, 2);
  for (let i = nameLines.length - 1; i >= 0; i--) { ctx.fillText(nameLines[i], left, y); y -= 132; }
  ctx.font = '700 32px "Inter", sans-serif'; ctx.fillStyle = GOLD;
  spaced(ctx, "GEDRONKEN", left, y + 8, 4);
  try { return c.toDataURL("image/png"); }
  catch {
    // Foto van een andere bron die niet getekend mag worden: zonder foto opnieuw.
    return entry.photo ? drawCheckin({ entry: { ...entry, photo: null }, recipe, who, metPlek, metNotitie }) : null;
  }
}

// ---------- Recept ----------
// Receptkaart: foto boven, daaronder naam, ingrediënten met hoeveelheden en
// (optioneel) de stappen. Past alles niet, dan stoppen de stappen netjes.
async function drawRecipe({ card, showSteps }) {
  await fontsReady();
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);
  const photoH = showSteps ? 760 : 980;
  const photo = await loadImage(card.photo);
  if (photo) cover(ctx, photo, 0, 0, W, photoH);
  let g = ctx.createLinearGradient(0, 0, 0, photoH);
  g.addColorStop(0, "rgba(14,25,23,0.35)"); g.addColorStop(0.2, "rgba(14,25,23,0)"); g.addColorStop(0.6, "rgba(14,25,23,0.2)"); g.addColorStop(1, DARK);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, photoH);
  const left = 80, maxW = W - 160;
  let y = photoH - 150;
  ctx.fillStyle = GOLD; ctx.font = '700 32px "Inter", sans-serif';
  spaced(ctx, `RECEPT · ${card.servings} ${card.servings === 1 ? "GLAS" : "GLAZEN"}`, left, y, 4);
  ctx.font = '700 120px "Playfair Display", serif'; ctx.fillStyle = LIGHT;
  const nameLines = wrap(ctx, card.name, maxW, 2);
  y += 120; nameLines.forEach((l, i) => ctx.fillText(l, left, y + i * 124)); y += (nameLines.length - 1) * 124;
  if (card.meta) { y += 62; ctx.font = '400 36px "Inter", sans-serif'; ctx.fillStyle = "#B9C3BD"; ctx.fillText(card.meta, left, y); }
  y += 50;
  // Ingrediënten
  const rowH = card.rows.length > 7 ? 66 : 76;
  for (const r of card.rows) {
    y += rowH;
    ctx.font = '400 44px "Inter", sans-serif'; ctx.fillStyle = LIGHT;
    ctx.fillText(wrap(ctx, r.label, maxW - 260, 1)[0], left, y);
    ctx.font = '700 44px "Inter", sans-serif'; ctx.fillStyle = GOLD; ctx.textAlign = "right";
    ctx.fillText(r.amount, left + maxW, y); ctx.textAlign = "left";
    ctx.fillStyle = "rgba(251,246,234,0.12)"; ctx.fillRect(left, y + 24, maxW, 2);
  }
  if (card.swapNote) { y += 64; ctx.font = 'italic 500 34px "Playfair Display", serif'; ctx.fillStyle = SOFT; ctx.fillText(wrap(ctx, card.swapNote, maxW, 1)[0], left, y); }
  // Stappen, zolang ze passen boven de voet.
  const bottom = H - 230;
  if (showSteps && card.steps.length) {
    y += 76; ctx.font = '700 30px "Inter", sans-serif'; ctx.fillStyle = GOLD; spaced(ctx, "BEREIDING", left, y, 4); y += 18;
    ctx.font = '400 38px "Inter", sans-serif';
    for (let i = 0; i < card.steps.length; i++) {
      const lines = wrap(ctx, card.steps[i], maxW - 64, 3);
      if (y + 54 * lines.length > bottom) break;
      y += 54;
      ctx.fillStyle = GOLD; ctx.font = '700 38px "Inter", sans-serif'; ctx.fillText(`${i + 1}.`, left, y);
      ctx.fillStyle = "#E6E0D2"; ctx.font = '400 38px "Inter", sans-serif';
      lines.forEach((l, k) => ctx.fillText(l, left + 64, y + k * 52)); y += (lines.length - 1) * 52 + 10;
    }
  }
  ctx.fillStyle = "rgba(232,201,142,0.35)"; ctx.fillRect(left, H - 200, maxW, 2);
  await brand(ctx, left, H - 120);
  ctx.font = '400 30px "Inter", sans-serif'; ctx.fillStyle = "#9FAAA4"; ctx.textAlign = "right";
  ctx.fillText("Geniet met mate · 18+", left + maxW, H - 118); ctx.textAlign = "left";
  try { return c.toDataURL("image/png"); } catch { return card.photo ? drawRecipe({ card: { ...card, photo: null }, showSteps }) : null; }
}

// ---------- Jaar / maand ----------
export function periodStats({ logboek, recipes, allIngredients, voorraadCount, period, year: forYear = null }) {
  const now = new Date();
  const year = period === "jaar" && forYear ? forYear : now.getFullYear(), month = now.getMonth();
  const inPeriod = (e) => {
    const d = new Date((e.date || "").length <= 10 ? `${e.date}T12:00:00` : e.date);
    return period === "jaar" ? d.getFullYear() === year : d.getFullYear() === year && d.getMonth() === month;
  };
  const entries = logboek.filter(e => e.date && inPeriod(e));
  const before = logboek.filter(e => e.date && !inPeriod(e) && new Date(e.date) < now);
  const key = (e) => findRecipeFor(e, recipes)?.id || e.name.trim().toLowerCase();
  const unique = new Set(entries.map(key));
  const seenBefore = new Set(before.map(key));
  const nieuw = [...unique].filter(k => !seenBefore.has(k)).length;
  // Favoriet: meest gedronken, dan hoogste gemiddelde.
  const groups = new Map();
  entries.forEach(e => { const k = key(e); const g = groups.get(k) || { name: e.name, id: findRecipeFor(e, recipes)?.id, ratings: [] }; g.ratings.push(e.rating || 0); groups.set(k, g); });
  const ranked = [...groups.values()].map(g => ({ ...g, count: g.ratings.length, avg: g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg);
  const fav = ranked[0] || null;
  const top = ranked.slice(1, 3);
  const spiritCounts = new Map();
  entries.forEach(e => { const r = findRecipeFor(e, recipes); const s = r && getBaseSpirit(r, allIngredients); if (s) spiritCounts.set(s, (spiritCounts.get(s) || 0) + 1); });
  const spirit = [...spiritCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const me = myTasteVector(entries, recipes, allIngredients);
  const smaak = me ? [...TASTE_DIMS].sort((a, b) => me.v[b] - me.v[a]).filter(d => me.v[d] >= 1.5).slice(0, 2).map(d => TASTE_WORD[d]) : [];
  const places = new Map();
  entries.forEach(e => { const p = (e.location || "").trim(); if (p && p.toLowerCase() !== "thuis") places.set(p, (places.get(p) || 0) + 1); });
  const plek = [...places].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { period, year, monthName: MAANDEN[month], count: entries.length, unique: unique.size, nieuw, fav, top, spirit, smaak, plek, voorraadCount };
}

async function drawPeriod(st) {
  await fontsReady();
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(W / 2, -200, 50, W / 2, -200, 1500);
  g.addColorStop(0, "#2A4B42"); g.addColorStop(0.7, DARK);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const left = 80, maxW = W - 160;
  ctx.fillStyle = GOLD; ctx.font = '700 34px "Inter", sans-serif';
  spaced(ctx, st.period === "jaar" ? "JOUW JAAR AAN DE BAR" : "JOUW MAAND AAN DE BAR", left, 170, 5);
  ctx.fillStyle = LIGHT; ctx.font = '700 150px "Playfair Display", serif';
  ctx.fillText(st.period === "jaar" ? String(st.year) : st.monthName.charAt(0).toUpperCase() + st.monthName.slice(1), left, 320);
  // 2x2 blokken
  const boxes = [
    [st.count, st.count === 1 ? "check-in" : "check-ins"],
    [st.unique, st.unique === 1 ? "cocktail" : "verschillende cocktails"],
    [st.nieuw, st.nieuw === 1 ? "nieuwe ontdekking" : "nieuwe ontdekkingen"],
    [st.voorraadCount, st.voorraadCount === 1 ? "fles in je bar" : "flessen in je bar"],
  ];
  const bw = (maxW - 30) / 2, bh = 236;
  boxes.forEach(([v, l], i) => {
    const x = left + (i % 2) * (bw + 30), y = 390 + Math.floor(i / 2) * (bh + 30);
    roundRect(ctx, x, y, bw, bh, 36); ctx.fillStyle = "rgba(251,246,234,0.07)"; ctx.fill();
    ctx.strokeStyle = "rgba(232,201,142,0.28)"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = GOLD; ctx.font = '700 112px "Playfair Display", serif'; ctx.fillText(String(v), x + 38, y + 128);
    ctx.fillStyle = "#C7CFC5"; ctx.font = '400 36px "Inter", sans-serif';
    wrap(ctx, l, bw - 76, 2).forEach((line, k) => ctx.fillText(line, x + 38, y + 178 + k * 40));
  });
  let y = 390 + 2 * (bh + 30) + 10;
  if (st.fav) {
    const fh = 210;
    roundRect(ctx, left, y, maxW, fh, 36); ctx.fillStyle = "rgba(251,246,234,0.07)"; ctx.fill(); ctx.strokeStyle = "rgba(232,201,142,0.28)"; ctx.stroke();
    const img = st.fav.id ? await loadImage(localItemImageUrl("cocktail", st.fav.id)) : null;
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(left + 120, y + fh / 2, 82, 0, Math.PI * 2); ctx.clip(); cover(ctx, img, left + 38, y + fh / 2 - 82, 164, 164); ctx.restore(); }
    const tx = left + (img ? 240 : 40);
    ctx.fillStyle = "#C7CFC5"; ctx.font = '700 28px "Inter", sans-serif'; spaced(ctx, "JE FAVORIET", tx, y + 70, 3);
    ctx.fillStyle = LIGHT; ctx.font = '700 62px "Playfair Display", serif'; ctx.fillText(wrap(ctx, st.fav.name, maxW - (tx - left) - 30, 1)[0], tx, y + 140);
    ctx.fillStyle = "#C7CFC5"; ctx.font = '400 32px "Inter", sans-serif';
    ctx.fillText(`${st.fav.count} keer${st.fav.avg > 0 ? `, gemiddeld ${formatRating(Math.round(st.fav.avg * 10) / 10)} sterren` : ""}`, tx, y + 188);
    y += fh + 30;
  }
  // Verder in je top: plek 2 t/m 4, met hoe vaak.
  if (st.top?.length) {
    const rh = 92;
    roundRect(ctx, left, y, maxW, 96 + st.top.length * rh, 36); ctx.fillStyle = "rgba(251,246,234,0.05)"; ctx.fill(); ctx.strokeStyle = "rgba(232,201,142,0.18)"; ctx.stroke();
    ctx.fillStyle = "#C7CFC5"; ctx.font = '700 28px "Inter", sans-serif'; spaced(ctx, st.top[0].count > 1 ? "OOK VAAK GEDRONKEN" : "OOK GEDRONKEN", left + 40, y + 62, 3);
    for (let i = 0; i < st.top.length; i++) {
      const t = st.top[i], ry = y + 80 + i * rh;
      const img = t.id ? await loadImage(localItemImageUrl("cocktail", t.id)) : null;
      if (img) { ctx.save(); ctx.beginPath(); ctx.arc(left + 80, ry + rh / 2, 38, 0, Math.PI * 2); ctx.clip(); cover(ctx, img, left + 42, ry + rh / 2 - 38, 76, 76); ctx.restore(); }
      ctx.fillStyle = LIGHT; ctx.font = '700 46px "Playfair Display", serif';
      ctx.fillText(wrap(ctx, t.name, maxW - 330, 1)[0], left + 140, ry + rh / 2 + 16);
      ctx.fillStyle = GOLD; ctx.font = '700 36px "Inter", sans-serif'; ctx.textAlign = "right";
      ctx.fillText(`${t.count}×`, left + maxW - 40, ry + rh / 2 + 14); ctx.textAlign = "left";
    }
    y += 96 + st.top.length * rh + 56;
  } else y += 40;
  const zinnen = [];
  if (st.smaak.length) zinnen.push(`Je smaak: ${st.smaak.join(" en ")}.`);
  if (st.spirit) zinnen.push(`Je dronk het vaakst iets met ${st.spirit.toLowerCase()}.`);
  if (st.plek) zinnen.push(`Je favoriete plek: ${st.plek}.`);
  // Elke zin op een eigen regel, zodat er nooit een halve zin afgebroken wordt.
  ctx.font = '400 42px "Inter", sans-serif';
  for (const zin of zinnen) {
    const lines = wrap(ctx, zin, maxW, 2);
    if (y + (lines.length - 1) * 56 > H - 240) break;
    ctx.fillStyle = "#E6E0D2"; lines.forEach(line => { ctx.fillText(line, left, y); y += 56; });
    y += 8;
  }
  ctx.fillStyle = "rgba(232,201,142,0.35)"; ctx.fillRect(left, H - 200, maxW, 2);
  await brand(ctx, left, H - 120);
  return c.toDataURL("image/png");
}

async function shareImage(dataUrl, filename, title) {
  const base64 = dataUrl.split(",")[1];
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    try { await Share.share({ title, files: [uri], dialogTitle: title }); } catch (e) { if (!/cancel/i.test(String(e?.message || e))) throw e; }
    return;
  }
  const bin = atob(base64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title }); } catch { /* geannuleerd */ } return; }
  const url = URL.createObjectURL(file); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Schermen ----------
function PreviewFrame({ src }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 14px" }}>
      <div style={{ width: "min(64vw, 300px)", aspectRatio: "9 / 16", borderRadius: 18, overflow: "hidden", background: BOTTLE_DARK, boxShadow: "0 16px 40px -14px rgba(0,0,0,0.5)" }}>
        {src ? <img src={src} alt="Voorbeeld" style={{ width: "100%", height: "100%", display: "block" }} />
          : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#B9C4B9", fontSize: 14 }}>Voorbeeld maken…</div>}
      </div>
    </div>
  );
}
function ShareButton({ busy, onClick }) {
  return (
    <button onClick={onClick} disabled={busy} className="press-scale" style={{
      width: "100%", minHeight: 52, borderRadius: 16, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans,
      fontSize: 15.5, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}><Share2 size={18} /> {busy ? "Even geduld…" : "Delen"}</button>
  );
}

export function ShareCheckinSheet({ entry, recipe, who, onClose, onShareText = null }) {
  useBodyScrollLock();
  const [metPlek, setMetPlek] = useState(!!entry.location);
  const [metNotitie, setMetNotitie] = useState(!!entry.notes);
  const [src, setSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false; setSrc(null);
    drawCheckin({ entry, recipe, who, metPlek, metNotitie }).then(url => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [entry, recipe, who, metPlek, metNotitie]);
  const share = async () => {
    if (!src || busy) return; setBusy(true);
    try { await shareImage(src, `${entry.name.replace(/[^\w-]+/g, "-").toLowerCase()}-check-in.png`, entry.name); } finally { setBusy(false); }
  };
  const row = (label, checked, onChange) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${BORDER}` }}>
      <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, color: INK }}>{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.55)" }} />
      <div className="sheet-slide-in" style={{ position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0", padding: "12px 18px calc(env(safe-area-inset-bottom) + 18px)", maxHeight: "94dvh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ flex: 1, fontFamily: serif, fontSize: 19, fontWeight: 700 }}>Delen als afbeelding</div>
          <button onClick={onClose} aria-label="Sluiten" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={17} /></button>
        </div>
        <PreviewFrame src={src} />
        {(entry.location || entry.notes) && (
          <div style={{ marginBottom: 12 }}>
            {entry.location && row("Plek tonen", metPlek, setMetPlek)}
            {entry.notes && row("Notitie tonen", metNotitie, setMetNotitie)}
          </div>
        )}
        <ShareButton busy={busy || !src} onClick={share} />
        {onShareText && (
          <button onClick={onShareText} style={{ display: "block", width: "100%", marginTop: 8, minHeight: 40, border: "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Of deel als tekst met een link</button>
        )}
      </div>
    </div>
  ), document.body);
}

// Recept delen: als afbeelding (receptkaart) of als link naar een webpagina.
// build({ servings, withSwap }) levert de inhoud (komt uit het receptscherm).
export function ShareRecipeSheet({ build, initialServings = 1, hasSwap = false, swapLabel = "", onShareLink, onCopyText, onClose }) {
  useBodyScrollLock();
  const [mode, setMode] = useState("afbeelding");
  const [servings, setServings] = useState(initialServings);
  const [withSwap, setWithSwap] = useState(hasSwap);
  const [showSteps, setShowSteps] = useState(true);
  const [src, setSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const card = useMemo(() => build({ servings, withSwap }), [build, servings, withSwap]);
  useEffect(() => {
    if (mode !== "afbeelding") return undefined;
    let cancelled = false; setSrc(null);
    drawRecipe({ card, showSteps }).then(url => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [card, showSteps, mode]);
  const flash = (t) => { setStatus(t); setTimeout(() => setStatus(null), 2500); };
  const shareImg = async () => {
    if (!src || busy) return; setBusy(true);
    try { await shareImage(src, `${card.id}-recept.png`, card.name); } finally { setBusy(false); }
  };
  const shareUrl = async () => {
    if (busy) return; setBusy(true);
    try { const r = await onShareLink(card); if (r === "copied") flash("Link gekopieerd"); else if (r === "failed") flash("Delen is niet gelukt"); } finally { setBusy(false); }
  };
  const copy = async () => { const r = await onCopyText(card); flash(r === "copied" ? "Recept gekopieerd" : r === "failed" ? "Kopiëren is niet gelukt" : null); };
  const row = (label, sub, control) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: `1px solid ${BORDER}` }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: INK }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{sub}</span>}
      </span>
      {control}
    </div>
  );
  const stepBtn = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} aria-label={label === "−" ? "Minder glazen" : "Meer glazen"} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${BORDER}`, background: CREAM, color: BOTTLE, fontWeight: 700, fontSize: 17, cursor: "pointer", opacity: disabled ? 0.4 : 1 }}>{label}</button>
  );
  const seg = (id, label) => (
    <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id} style={{
      flex: 1, minHeight: 36, borderRadius: 9, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 13.5, fontWeight: 700,
      background: mode === id ? CREAM : "transparent", color: mode === id ? BOTTLE_DARK : MUTED, boxShadow: mode === id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
    }}>{label}</button>
  );
  return createPortal((
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: sans, color: INK }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,16,10,0.55)" }} />
      <div className="sheet-slide-in" style={{ position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", background: PAPER, borderRadius: "22px 22px 0 0", padding: "12px 18px calc(env(safe-area-inset-bottom) + 18px)", maxHeight: "94dvh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div style={{ flex: 1, fontFamily: serif, fontSize: 19, fontWeight: 700 }}>Recept delen</div>
          <button onClick={onClose} aria-label="Sluiten" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: CREAM, boxShadow: SHADOW_CARD, color: INK, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={17} /></button>
        </div>
        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: PAPER_DEEP, marginBottom: 10 }}>
          {seg("afbeelding", "Afbeelding")}{seg("link", "Link")}
        </div>
        {mode === "afbeelding" ? (
          <>
            <PreviewFrame src={src} />
            {row("Aantal glazen", null, (
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {stepBtn("−", () => setServings(n => Math.max(1, n - 1)), servings <= 1)}
                <strong style={{ minWidth: 18, textAlign: "center" }}>{servings}</strong>
                {stepBtn("+", () => setServings(n => Math.min(24, n + 1)), servings >= 24)}
              </span>
            ))}
            {row("Bereiding tonen", null, <Switch checked={showSteps} onChange={setShowSteps} />)}
          </>
        ) : (
          <div style={{ background: CREAM, borderRadius: 14, padding: 12, marginBottom: 10, display: "flex", gap: 12, alignItems: "center", boxShadow: SHADOW_CARD }}>
            {card.photo && <img src={card.photo} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{card.name}</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>
                {card.link ? "Opent als webpagina, ook zonder de app." : "Eigen recepten kun je niet als link delen. Deel hem als afbeelding of als tekst."}
              </div>
            </div>
          </div>
        )}
        {hasSwap && row("Met mijn vervanger", swapLabel, <Switch checked={withSwap} onChange={setWithSwap} />)}
        <div style={{ marginTop: 10 }}>
          {mode === "afbeelding" ? <ShareButton busy={busy || !src} onClick={shareImg} /> : (
            <button onClick={shareUrl} disabled={busy || !card.link} className="press-scale" style={{
              width: "100%", minHeight: 52, borderRadius: 16, border: "none", background: BOTTLE_DARK, color: HEADER_TEXT, fontFamily: sans,
              fontSize: 15.5, fontWeight: 800, cursor: card.link ? "pointer" : "default", opacity: busy || !card.link ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}><Share2 size={18} /> Link delen</button>
          )}
          <button onClick={copy} style={{ display: "block", width: "100%", marginTop: 6, minHeight: 42, border: "none", background: "none", color: BOTTLE, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {status || "Kopieer als tekst"}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

export function YearReviewScreen({ logboek, recipes, allIngredients, voorraadCount, initialPeriod = "jaar", year = null, onClose }) {
  useBodyScrollLock();
  const [period, setPeriod] = useState(initialPeriod);
  const st = useMemo(() => periodStats({ logboek, recipes, allIngredients, voorraadCount, period, year }), [logboek, recipes, allIngredients, voorraadCount, period, year]);
  const [src, setSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false; setSrc(null);
    if (st.count) drawPeriod(st).then(url => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [st]);
  const share = async () => {
    if (!src || busy) return; setBusy(true);
    try { await shareImage(src, period === "jaar" ? `mijn-bar-${st.year}.png` : `mijn-bar-${st.monthName}.png`, "Mijn Thuisbar"); } finally { setBusy(false); }
  };
  const seg = (id, label) => (
    <button key={id} onClick={() => setPeriod(id)} aria-pressed={period === id} style={{
      flex: 1, minHeight: 38, borderRadius: 11, border: "none", cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 600,
      background: period === id ? CREAM : "transparent", color: period === id ? INK : MUTED, boxShadow: period === id ? SHADOW_CARD : "none",
    }}>{label}</button>
  );
  return createPortal((
    <div className="push-slide-in" style={{ position: "fixed", inset: 0, zIndex: 40, background: PAPER, display: "flex", flexDirection: "column", fontFamily: sans, color: INK }}>
      <div style={{ background: BOTTLE_DARK, borderBottom: `2px solid ${BRASS}`, flexShrink: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 6px) 12px 8px", display: "flex", alignItems: "center", minHeight: 52, boxSizing: "border-box" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 2, minHeight: 44, border: "none", background: "none", color: "#DDB877", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: sans, padding: 0 }}>
            <ChevronLeft size={22} strokeWidth={2.2} /> Terug
          </button>
          <span style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 17, color: "#FBF6EA", marginRight: 70 }}>Jouw bar</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 18px calc(env(safe-area-inset-bottom) + 24px)" }}>
          <div style={{ display: "flex", gap: 4, background: PAPER_DEEP, borderRadius: 14, padding: 4, marginBottom: 10 }}>
            {seg("jaar", `Jaar ${st.year}`)}{seg("maand", `Deze maand`)}
          </div>
          {st.count ? (
            <>
              <PreviewFrame src={src} />
              <ShareButton busy={busy || !src} onClick={share} />
            </>
          ) : (
            <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55, textAlign: "center", padding: "40px 10px" }}>
              {period === "jaar" ? "Nog geen check-ins dit jaar." : `Nog geen check-ins in ${st.monthName}.`} Check een cocktail in, dan verschijnt hier je overzicht.
            </p>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
