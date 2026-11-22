export interface StudentIdentity {
  readonly id: string;
  readonly email: string | null;
  readonly role: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: StudentIdentity;
}

export type AuthStatus = 'restoring' | 'authenticated' | 'signed_out' | 'local_dev';

export interface SessionStorage {
  getSession: () => Promise<AuthSession | null>;
  setSession: (session: AuthSession) => Promise<void>;
  clearSession: () => Promise<void>;
}

export interface AuthGateway {
  signInWithPassword: (email: string, password: string) => Promise<AuthSession>;
  refreshSession: (refreshToken: string) => Promise<AuthSession>;
  signOut: (accessToken: string) => Promise<void>;
}
