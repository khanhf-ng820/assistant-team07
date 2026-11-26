import { Platform } from 'react-native';

export const fontFamilies = {
  // On iOS, 'System' uses SF Pro Display / Text natively.
  // On Android/Web, fallback gracefully to Inter / system sans-serif.
  heading: Platform.select({ ios: 'System', default: 'Inter' }),
  body: Platform.select({ ios: 'System', default: 'Inter' }),
};

export const colors = {
  // Canonical Brand & Core Tokens (Figma Design System)
  primary: '#0F766E', // Primary Teal
  primaryDark: '#115E59',
  primaryButton: '#1E655A',
  primaryLight: '#CCFBF1',
  primarySoft: '#E6F4F1',
  primaryTint: '#F0FDFA',
  blue: '#2563EB', // Blue Accent
  accentBlue: '#3B82F6',
  savings: '#F43F5E', // Piggy Coral Accent
  savingsTint: '#FFE4E6', // Coral Light Tint (PR #62)
  emerald: '#10B981', // Success Emerald
  amber: '#F59E0B', // Warning Amber
  warningSoft: '#FEF3C7', // Soft Amber Tint for accessible badge backgrounds
  danger: '#EF4444', // Danger Alert Red

  // Status Tints & Text (PR #72 / Calendar & Ledger)
  successLight: '#ECFDF5',
  successSoft: '#DCFCE7',
  successBorder: '#A7F3D0',
  successText: '#15803D',
  dangerLight: '#FEF2F2',
  dangerSoft: '#FEE2E2',
  dangerText: '#DC2626',

  // Surfaces & Backgrounds
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  surfaceSubtle: '#F1F5F9',

  // Typography & Borders
  text: '#0F172A',
  textSecondary: '#475569',
  muted: '#475569',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderStrong: '#CBD5E1',

  // Interactive & Input Tokens (PR #72)
  pillBg: '#F1F5F9',
  pillActive: '#0F766E',
  keypadBg: '#FFFFFF',
  keypadBorder: '#E2E8F0',

  // Overlays & Shadows
  overlay: 'rgba(15, 23, 42, 0.65)',
  overlayBackdrop: 'rgba(15, 23, 42, 0.45)',
  overlayBackdropDark: 'rgba(15, 23, 42, 0.5)',
  shadow: '#0F172A',

  // Semantic & Backward-Compatibility Aliases
  coral: '#F43F5E', // Alias for savings
  success: '#10B981', // Alias for emerald
  warning: '#F59E0B', // Alias for amber
  error: '#EF4444', // Alias for danger
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
  amountHero: {
    fontSize: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    fontFamily: fontFamilies.heading,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
    fontFamily: fontFamilies.heading,
  },
  amountDisplay: {
    fontSize: 28,
    fontWeight: '700' as const,
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
