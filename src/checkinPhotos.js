import { supabase } from "./supabaseClient";

// ---------- Foto's van check-ins ----------
// Scherp genoeg voor een post op volle breedte (een iPhone-scherm is ±1170
// pixels breed): langste zijde 1440 px, JPEG-kwaliteit 0,82. Na inloggen gaat
// de foto naar Supabase Storage (bucket checkin-fotos) en staat in de
// check-in alleen de link; dat houdt de feed snel. Lukt uploaden niet, dan
// bewaren we een kleinere versie in de check-in zelf, zoals voorheen.
async function decodeImage(src) {
  if (typeof createImageBitmap === "function" && src instanceof Blob) {
    try { return await createImageBitmap(src, { imageOrientation: "from-image" }); } catch { /* val terug op <img> */ }
  }
  const url = src instanceof Blob ? URL.createObjectURL(src) : src;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    if (src instanceof Blob) URL.revokeObjectURL(url);
  }
}
function drawScaled(img, width, height) {
  // In stappen van hooguit de helft verkleinen: dat blijft scherp en
  // voorkomt het korrelige resultaat van één grote sprong.
  let source = img, sw = img.width, sh = img.height;
  while (sw / 2 > width) {
    const c = document.createElement("canvas");
    c.width = Math.round(sw / 2); c.height = Math.round(sh / 2);
    const cx = c.getContext("2d");
    cx.imageSmoothingQuality = "high";
    cx.drawImage(source, 0, 0, c.width, c.height);
    source = c; sw = c.width; sh = c.height;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}
export async function imageToJpegDataUrl(src, maxSide, quality) {
  const img = await decodeImage(src);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = drawScaled(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
  img.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
export async function squareJpegDataUrl(file, size, quality) {
  const img = await decodeImage(file);
  const s = Math.min(img.width, img.height);
  const crop = document.createElement("canvas");
  crop.width = s; crop.height = s;
  crop.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, s, s);
  img.close?.();
  return drawScaled(crop, Math.min(size, s), Math.min(size, s)).toDataURL("image/jpeg", quality);
}
const CHECKIN_PHOTO_BUCKET = "checkin-fotos";
export async function uploadCheckinPhoto(userId, photo) {
  if (!photo || typeof photo !== "string" || !photo.startsWith("data:")) return photo || null;
  try {
    const blob = await (await fetch(photo)).blob();
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${userId}/${id}.jpg`;
    const { error } = await supabase.storage.from(CHECKIN_PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (!error) return supabase.storage.from(CHECKIN_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    console.warn("Foto uploaden lukte niet, kleinere versie in de check-in:", error.message);
  } catch (err) {
    console.warn("Foto uploaden lukte niet:", err);
  }
  try { return await imageToJpegDataUrl(photo, 720, 0.74); } catch { return photo; }
}
export function removeCheckinPhoto(userId, photo) {
  const marker = `/${CHECKIN_PHOTO_BUCKET}/`;
  if (!photo || typeof photo !== "string" || !photo.includes(marker)) return;
  const path = decodeURIComponent(photo.split(marker)[1].split("?")[0]);
  if (!path.startsWith(`${userId}/`)) return;
  supabase.storage.from(CHECKIN_PHOTO_BUCKET).remove([path]).catch(() => {});
}

// Alle eigen bestanden (check-in-foto's en menukaart-afbeeldingen) weghalen,
// vlak voor het verwijderen van je account.
export async function removeOwnStorageFiles(userId) {
  for (const bucket of [CHECKIN_PHOTO_BUCKET, "menukaarten"]) {
    try {
      for (let i = 0; i < 20; i++) {
        const { data: files, error } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
        if (error || !files || files.length === 0) break;
        const { error: rmError } = await supabase.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
        if (rmError) break;
      }
    } catch { /* bucket bestaat niet of geen rechten: doorgaan */ }
  }
}
