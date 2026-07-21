import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';

const REFRESH_SESSION_KEY = 'messenger-refresh-session';

export type StoredMessengerRefreshSession = {
  refreshToken: string;
  deviceId: string;
};

let storageReady: Promise<void> | null = null;

function readySecureStorage() {
  storageReady ??= (async () => {
    await SecureStorage.setKeyPrefix('movevai-retail_');
    // Session ต้องผูกกับเครื่อง ไม่ย้ายตาม backup/iCloud ไปยังเครื่องใหม่
    await SecureStorage.setSynchronize(false);
    await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  })();
  return storageReady;
}

export async function storeMessengerRefreshSession(value: StoredMessengerRefreshSession) {
  await readySecureStorage();
  await SecureStorage.set(REFRESH_SESSION_KEY, value);
}

export async function loadMessengerRefreshSession(): Promise<StoredMessengerRefreshSession | null> {
  await readySecureStorage();
  const value = await SecureStorage.get(REFRESH_SESSION_KEY);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const refreshToken = (value as Record<string, unknown>).refreshToken;
  const deviceId = (value as Record<string, unknown>).deviceId;
  return typeof refreshToken === 'string' && typeof deviceId === 'string'
    ? { refreshToken, deviceId }
    : null;
}

export async function removeMessengerRefreshSession() {
  await readySecureStorage();
  await SecureStorage.remove(REFRESH_SESSION_KEY);
}
