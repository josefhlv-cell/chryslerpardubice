import type { CapacitorConfig } from '@capacitor/cli';

// Production build: native app loads bundled `dist/` (no remote server.url).
// For live-reload during development set CAP_LIVE_RELOAD=1 before `npx cap sync`.
const useLiveReload = process.env.CAP_LIVE_RELOAD === '1';

const config: CapacitorConfig = {
  appId: 'cz.chryslerpardubice.chdpgarage',
  appName: 'CHDP Garage',
  webDir: 'dist',
  ...(useLiveReload
    ? {
        server: {
          url: 'https://c6d93210-1224-4205-90de-eec3ccc6923f.lovableproject.com?forceHideBadge=true',
          cleartext: true,
        },
      }
    : {}),
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0f0f23',
    preferredContentMode: 'mobile',
    scheme: 'chdp-servis',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: '#0f0f23',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f0f23',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#FFBF00',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0d1117',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
