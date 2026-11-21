// Expo inlines EXPO_PUBLIC_* values at bundle time. Never place server secrets here.
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || undefined;
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || undefined;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;
export const isSupabaseAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);
