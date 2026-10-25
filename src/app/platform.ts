import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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
    return;
  }

  // Web: offline cache through a service worker (production builds only).
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
  window.addEventListener('pagehide', () => void store.flush());
}
