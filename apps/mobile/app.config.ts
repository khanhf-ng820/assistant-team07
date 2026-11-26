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
    [
      'expo-camera',
      {
        cameraPermission: 'CARENTA cần quyền truy cập camera để chụp ảnh hóa đơn.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'CARENTA cần quyền truy cập thư viện ảnh để chọn ảnh hóa đơn.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'CARENTA cần quyền truy cập micro để ghi âm khoản chi tiêu.',
      },
    ],
  ],
};

export default config;
