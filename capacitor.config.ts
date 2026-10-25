import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.rangelab.app',
  appName: 'Expresso Ranges',
  webDir: 'dist',
  backgroundColor: '#090c0b',
  android: {
    backgroundColor: '#090c0b',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#090c0b',
      showSpinner: false,
    },
  },
};

export default config;
