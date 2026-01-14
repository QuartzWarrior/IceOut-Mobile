import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iceout.app',
  appName: 'IceOut',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'https://iceout.org',
      'https://*.tile.openstreetmap.org'
    ]
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;
