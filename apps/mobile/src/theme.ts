import { Platform } from 'react-native';

export const fontFamilies = {
  heading: Platform.select({ ios: 'SF Pro Display', default: 'Inter' }),
  body: Platform.select({ ios: 'SF Pro Display', default: 'Inter' }),
};

export const colors = {
  // Brand & Core
  primary: '#0F766E', // Primary Teal
  primaryDark: '#115E59',
  primaryLight: '#CCFBF1',
  blue: '#2563EB', // Blue Accent
  savings: '#F43F5E', // Piggy Coral Accent
  coral: '#F43F5E',
  emerald: '#10B981', // Success Emerald
  success: '#10B981',
  amber: '#F59E0B', // Warning Amber
  warning: '#F59E0B',
  danger: '#EF4444', // Danger Alert Red
  error: '#EF4444',

  // Surfaces & Backgrounds
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceAlt: '#F1F5F9',

  // Typography & Borders
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#475569',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  // Overlays
  overlay: 'rgba(15, 23, 42, 0.65)',
  overlayLight: 'rgba(255, 255, 255, 0.85)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 6,
  },
  floating: {
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
};

export const typography = {
  heroAmount: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
    fontFamily: fontFamilies.heading,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
    fontFamily: fontFamilies.heading,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 26,
    fontFamily: fontFamilies.heading,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
    fontFamily: fontFamilies.heading,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 22,
    fontFamily: fontFamilies.body,
  },
  bodyBold: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 22,
    fontFamily: fontFamilies.body,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 18,
    fontFamily: fontFamilies.body,
  },
  captionBold: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 18,
    fontFamily: fontFamilies.body,
  },
};

// Backward-compatibility alias
export const type = typography;

export const theme = {
  colors,
  spacing,
  radius,
  shadows,
  typography,
  type,
  fontFamilies,
};

export default theme;
