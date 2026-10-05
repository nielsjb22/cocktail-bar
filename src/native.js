import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen as CapacitorSplashScreen } from "@capacitor/splash-screen";

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
};

export function hapticFor(soundName) {
  if (!isNative) return;
  HAPTIC_MAP[soundName]?.().catch(() => {});
}

function syncStatusBarWithTheme() {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = (dark) => StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {});
  apply(mq.matches);
  mq.addEventListener("change", (e) => apply(e.matches));
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
  Keyboard.addListener("keyboardWillShow", (info) => {
    kbHeight = info?.keyboardHeight || 0;
    root.classList.add("kb-open");
    updatePad();
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
