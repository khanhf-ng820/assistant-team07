import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'CARENTA',
  slug: 'carenta-placeholder',
  version: '0.1.0',
  scheme: 'carenta-placeholder',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android'],
  icon: './assets/icon.png',
  plugins: ['expo-router'],
};

export default config;
