// Expo inlines this public value. Never place credentials in EXPO_PUBLIC_*.
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || undefined;
