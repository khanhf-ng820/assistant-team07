import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'CARENTA',
  slug: 'carenta-placeholder',
  version: '0.1.0',
  scheme: 'carenta-placeholder',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android', 'ios'],
  icon: './assets/icon.png',
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-camera', {
      cameraPermission: 'CARENTA cần dùng camera để chụp hóa đơn.',
      recordAudioAndroid: false,
      barcodeScannerEnabled: false,
    }],
    ['expo-image-picker', {
      photosPermission: 'CARENTA cần chọn ảnh hóa đơn hoặc ảnh chuyển khoản bạn cho phép.',
      microphonePermission: false,
    }],
  ],
};

export default config;
