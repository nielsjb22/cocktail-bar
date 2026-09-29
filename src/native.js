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
  Keyboard.addListener("keyboardWillShow", () => document.documentElement.classList.add("kb-open")).catch?.(() => {});
  Keyboard.addListener("keyboardWillHide", () => document.documentElement.classList.remove("kb-open")).catch?.(() => {});
}

export function hideNativeSplash() {
  if (!isNative) return;
  CapacitorSplashScreen.hide().catch(() => {});
}
