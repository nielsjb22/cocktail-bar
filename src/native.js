import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen as CapacitorSplashScreen } from "@capacitor/splash-screen";
import { KeepAwake } from "@capacitor-community/keep-awake";

export const isNative = Capacitor.isNativePlatform();

// Vertaalt de bestaande geluidsnamen (zie playSound in ThuisbarApp.jsx) naar
// bijpassende Taptic Engine-feedback, zodat elke chime()-aanroep er ook één
// oplevert zonder dat elke aanroepplek zelf iets hoeft te weten van haptics.
const HAPTIC_MAP = {
  tick: () => Haptics.impact({ style: ImpactStyle.Light }),
  pop: () => Haptics.impact({ style: ImpactStyle.Light }),
  shuffle: () => Haptics.impact({ style: ImpactStyle.Light }),
  pour: () => Haptics.impact({ style: ImpactStyle.Light }),
  remove: () => Haptics.impact({ style: ImpactStyle.Medium }),
  share: () => Haptics.impact({ style: ImpactStyle.Medium }),
  clink: () => Haptics.impact({ style: ImpactStyle.Medium }),
  chime: () => Haptics.notification({ type: NotificationType.Success }),
  levelup: () => Haptics.notification({ type: NotificationType.Success }),
  unlock: () => Haptics.notification({ type: NotificationType.Success }),
  timer: () => Haptics.notification({ type: NotificationType.Warning }),
};

export function hapticFor(soundName) {
  if (!isNative) return;
  HAPTIC_MAP[soundName]?.().catch(() => {});
}

let statusBarOnDark = false;
let applyThemeStatusBar = () => {};
function syncStatusBarWithTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  // Elk scherm heeft een donkergroene kop (ook in de lichte modus), dus de
  // statusbalk heeft altijd lichte tekst nodig (Style.Dark = lichte tekst).
  const apply = () => StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  applyThemeStatusBar = () => apply(mq.matches);
  apply(mq.matches);
  mq.addEventListener("change", (e) => { if (!statusBarOnDark) apply(e.matches); });
}

// Home heeft een donkergroene kop: dan lichte statusbalk-tekst (Style.Dark =
// lichte tekst voor een donkere achtergrond); elders weer volgens het thema.
export function setStatusBarOnDark(on) {
  if (!isNative || statusBarOnDark === on) return;
  statusBarOnDark = on;
  if (on) StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  else applyThemeStatusBar();
}

export function initNativeShell() {
  if (!isNative) return;
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  syncStatusBarWithTheme();
  // Toetsenbord: de WebView blijft altijd even groot (resize "none", ook in
  // capacitor.config.json). Bij "native" maakte iOS de WebView pas ná de
  // toetsenbordanimatie kleiner (+0,2 s) — het toetsenbord schoof eerst over
  // de velden heen (vaag erdoorheen te zien) en daarna sprong alles omhoog.
  // Nu zetten we bij het begin van de animatie meteen --kb-pad op de hoogte
  // van het toetsenbord; pop-ups en schermen schuiven met een CSS-overgang
  // in hetzelfde tempo mee omhoog (zie html.native-shell in index.css).
  Keyboard.setResizeMode({ mode: "none" }).catch(() => {});
  const root = document.documentElement;
  root.classList.add("native-shell");
  const setPad = (px) => root.style.setProperty("--kb-pad", `${Math.max(0, Math.round(px))}px`);
  setPad(0);
  // Klasse op <html> zolang het toetsenbord open is: de zwevende onderbalk
  // verdwijnt dan (zie .kb-open in index.css).
  Keyboard.addListener("keyboardWillShow", (info) => {
    setPad(info?.keyboardHeight || 0);
    root.classList.add("kb-open");
  }).catch?.(() => {});
  Keyboard.addListener("keyboardDidShow", (info) => {
    if (info?.keyboardHeight) setPad(info.keyboardHeight);
    window.dispatchEvent(new Event("app-keyboard-shown"));
  }).catch?.(() => {});
  Keyboard.addListener("keyboardWillHide", () => {
    root.classList.remove("kb-open");
    setPad(0);
  }).catch?.(() => {});
}

// Het iOS-opstartscherm (LaunchScreen.storyboard: logo + "Mijn Thuisbar" +
// introtekst) ís de intro van de app — er komt geen tweede intro in React
// achteraan. Het blijft staan (launchAutoHide: false) tot het eerste echte
// scherm klaar is, maar minstens SPLASH_MIN_MS zodat de tekst leesbaar is.
const SPLASH_MIN_MS = 1800;
const SPLASH_MAX_MS = 6000;
const launchedAt = Date.now();
let splashHidden = false;

export function hideNativeSplash() {
  if (!isNative || splashHidden) return;
  splashHidden = true;
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - launchedAt));
  setTimeout(() => {
    CapacitorSplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {});
  }, wait);
}

// Vangnet: blijft de app ergens hangen (bv. geen netwerk bij het ophalen van
// de sessie), dan mag het opstartscherm er niet eeuwig voor blijven staan.
if (isNative) setTimeout(hideNativeSplash, SPLASH_MAX_MS);

// Scherm wakker houden (bereidingsmodus): in de app via de KeepAwake-plugin,
// op het web via de Screen Wake Lock API waar de browser die heeft.
let webWakeLock = null;
export async function setKeepAwake(on) {
  try {
    if (isNative) { await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()); return; }
    if (on && navigator.wakeLock) webWakeLock = await navigator.wakeLock.request("screen");
    else if (!on && webWakeLock) { await webWakeLock.release(); webWakeLock = null; }
  } catch { /* niet ondersteund: dan gaat het scherm gewoon op slot */ }
}
