import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'CARENTA',
  slug: 'carenta-placeholder',
  version: '0.1.0',
  scheme: 'carenta',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android', 'ios'],
  icon: './assets/icon.png',
  android: { package: 'com.carenta.app' },
  plugins: ['expo-router', './plugins/withCaptureShortcuts'],
};

export default config;
