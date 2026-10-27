import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { currentPath, goBack } from './router';
import { store } from './store';

/** Platform integration: Android back button, status bar, splash, offline cache. */
export async function setupPlatform() {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#090c0b' });
    } catch {
      /* status bar plugin unavailable */
    }
    // The app is used in portrait; only the training table switches to landscape.
    await ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => undefined);
    await SplashScreen.hide().catch(() => undefined);

    await CapApp.addListener('backButton', () => {
      const path = currentPath();
      // Close an open bottom sheet first.
      const backdrop = document.querySelector<HTMLElement>('.sheet-backdrop');
      if (backdrop) {
        backdrop.click();
        return;
      }
      if (path === '/' || path === '') {
        void store.flush().then(() => CapApp.exitApp());
      } else {
        goBack('/');
      }
    });

    // Make sure pending writes reach the disk when the app goes to background.
    await CapApp.addListener('pause', () => void store.flush());
    store.setStoragePersisted(true); // SharedPreferences are never evicted by the system
    return;
  }

  // Ask the browser not to evict the local data under storage pressure.
  try {
    const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.());
    store.setStoragePersisted(Boolean(persisted));
  } catch {
    store.setStoragePersisted(false);
  }

  // Web: offline cache through a service worker (production builds only).
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
  window.addEventListener('pagehide', () => void store.flush());
}

/** Training table: landscape and full screen on Android, as in a real poker client. */
export function enterTableMode() {
  if (!Capacitor.isNativePlatform()) return;
  void ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined);
  void StatusBar.hide().catch(() => undefined);
}

export function leaveTableMode() {
  if (!Capacitor.isNativePlatform()) return;
  void ScreenOrientation.lock({ orientation: 'portrait' }).catch(() => undefined);
  void StatusBar.show().catch(() => undefined);
}
