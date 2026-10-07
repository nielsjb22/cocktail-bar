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
  const apply = (dark) => StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {});
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
  Keyboard.setResizeMode({ mode: "native" }).catch(() => {});
  // Klasse op <html> zolang het toetsenbord open is: de zwevende onderbalk
  // verdwijnt dan (zie .kb-open in index.css) i.p.v. mee omhoog te schuiven
  // en over zoekresultaten te vallen.
  //
  // --kb-pad: hoeveel ruimte het toetsenbord inneemt die de WebView NIET zelf
  // al kleiner is geworden. Normaal krimpt de WebView ("native" resize) en is
  // dit 0; gebeurt dat niet of te laat, dan tilt deze waarde pop-ups (zoals
  // de check-in) alsnog boven het toetsenbord uit — anders lag bijv. het
  // notitieveld áchter het toetsenbord en zag je je tekst er vaag doorheen.
  const root = document.documentElement;
  let baseHeight = window.innerHeight;
  let kbHeight = 0;
  const updatePad = () => {
    if (!root.classList.contains("kb-open")) { root.style.setProperty("--kb-pad", "0px"); return; }
    const shrunk = baseHeight - window.innerHeight;
    root.style.setProperty("--kb-pad", `${shrunk > 60 ? 0 : Math.round(kbHeight)}px`);
  };
  window.addEventListener("resize", () => {
    if (!root.classList.contains("kb-open")) baseHeight = window.innerHeight;
    updatePad();
  });
  // Bij het begin van de animatie alleen de klasse zetten, nog géén
  // --kb-pad: iOS maakt de WebView zelf kleiner ("native" resize). Eerst
  // optillen en daarna terugzetten liet pop-ups als de check-in even te ver
  // omhoog schieten (tot achter de statusbalk). Pas als het toetsenbord er
  // staat (didShow) vullen we aan, en alleen als de WebView niet kromp.
  Keyboard.addListener("keyboardWillShow", (info) => {
    kbHeight = info?.keyboardHeight || 0;
    root.classList.add("kb-open");
  }).catch?.(() => {});
  Keyboard.addListener("keyboardDidShow", (info) => {
    kbHeight = info?.keyboardHeight || kbHeight;
    updatePad();
    window.dispatchEvent(new Event("app-keyboard-shown"));
  }).catch?.(() => {});
  Keyboard.addListener("keyboardWillHide", () => {
    root.classList.remove("kb-open");
    kbHeight = 0;
    updatePad();
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
