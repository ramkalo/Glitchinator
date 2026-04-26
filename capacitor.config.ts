import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bxtrxt.app',
  appName: 'BXTRXT',

  // Vite's build output — where Capacitor copies the web app from
  webDir: 'dist',

  server: {
    // Use HTTPS scheme on Android (required for Camera, Storage etc.)
    androidScheme: 'https',
  },

  plugins: {
    // SplashScreen: hide immediately since the canvas is our "splash"
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
