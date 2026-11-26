// Expo inlines EXPO_PUBLIC_* values at bundle time. Never place server secrets here.

export interface RawMobileEnv {
  readonly apiBaseUrl?: string;
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
}

export type ResolvedAuthMode =
  | { readonly kind: 'local_dev' }
  | { readonly kind: 'misconfigured'; readonly error: string }
  | { readonly kind: 'supabase'; readonly supabaseUrl: string; readonly supabaseAnonKey: string };

export interface ResolvedMobileConfig {
  readonly apiBaseUrl?: string;
  readonly isApiConfigured: boolean;
  readonly authMode: ResolvedAuthMode;
}

export const SUPABASE_PARTIAL_CONFIG_ERROR =
  'Cấu hình Supabase chưa đầy đủ: cần cả EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_ANON_KEY.';

export function readExpoEnv(): RawMobileEnv {
  return {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function normalizeUrl(raw?: string): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}

function normalizeSecret(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export function resolveMobileConfig(raw: RawMobileEnv = readExpoEnv()): ResolvedMobileConfig {
  const apiBaseUrl = normalizeUrl(raw.apiBaseUrl);
  const supabaseUrl = normalizeUrl(raw.supabaseUrl);
  const supabaseAnonKey = normalizeSecret(raw.supabaseAnonKey);

  let authMode: ResolvedAuthMode;
  if (supabaseUrl && supabaseAnonKey) {
    authMode = { kind: 'supabase', supabaseUrl, supabaseAnonKey };
  } else if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
    authMode = { kind: 'misconfigured', error: SUPABASE_PARTIAL_CONFIG_ERROR };
  } else {
    authMode = { kind: 'local_dev' };
  }

  return {
    apiBaseUrl,
    isApiConfigured: Boolean(apiBaseUrl),
    authMode,
  };
}
