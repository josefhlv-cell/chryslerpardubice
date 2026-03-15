import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.c6d932101224420590deeec3ccc6923f',
  appName: 'Chrysler&Dodge Pardubice',
  webDir: 'dist',
  server: {
    url: 'https://c6d93210-1224-4205-90de-eec3ccc6923f.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0f0f23',
    preferredContentMode: 'mobile',
    scheme: 'chdp-servis',
  },
  android: {
    backgroundColor: '#0f0f23',
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0f0f23',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e',
    },
  },
};

export default config;
