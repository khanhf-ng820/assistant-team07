import * as SecureStore from 'expo-secure-store';
import * as storageModule from '../src/auth/storage';
import { createSecureSessionStorage } from '../src/auth/storage';
import type { AuthSession } from '../src/auth/types';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const sampleSession: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1890000000,
  user: { id: 'student-1', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
};

describe('createSecureSessionStorage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('persists, reads, and deletes a valid AuthSession via SecureStore', async () => {
    const storage = createSecureSessionStorage();
    await storage.setSession(sampleSession);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'carenta.auth.session.v1',
      JSON.stringify(sampleSession)
    );

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(sampleSession));
    await expect(storage.getSession()).resolves.toEqual(sampleSession);

    await storage.clearSession();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('carenta.auth.session.v1');
  });

  it('discards corrupt or malformed persisted entries cleanly', async () => {
    const storage = createSecureSessionStorage();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('{broken-json');
    await expect(storage.getSession()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('carenta.auth.session.v1');

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ accessToken: 'missing-user' })
    );
    await expect(storage.getSession()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2);
    expect('createMemorySessionStorage' in storageModule).toBe(false);
  });
});
