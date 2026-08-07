import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mathan.erp',
  appName: 'Mathan ERP',
  webDir: '../frontend/dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
  android: {
    backgroundColor: '#f6f5ef',
    webContentsDebuggingEnabled: true,
  },
};

export default config;
