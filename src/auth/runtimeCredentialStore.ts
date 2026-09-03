import { Platform } from 'react-native';

import {
  createSecureStoreCredentialStore,
  createWebCookieCredentialStore,
} from './credentialStore';
import type { AuthCredentialStore, SecureStoreAdapter } from './credentialStore';

export type AuthRuntimePlatform = 'native' | 'web';

export const runtimeAuthPlatform: AuthRuntimePlatform = Platform.OS === 'web'
  ? 'web'
  : 'native';

let secureStorePromise: Promise<SecureStoreAdapter> | null = null;

function loadSecureStore(): Promise<SecureStoreAdapter> {
  secureStorePromise ??= import('expo-secure-store');
  return secureStorePromise;
}

const nativeCredentialStore: AuthCredentialStore = {
  async clearToken() {
    return (await createNativeCredentialStore()).clearToken();
  },
  async getToken() {
    return (await createNativeCredentialStore()).getToken();
  },
  async setToken(token) {
    return (await createNativeCredentialStore()).setToken(token);
  },
};

async function createNativeCredentialStore(): Promise<AuthCredentialStore> {
  return createSecureStoreCredentialStore(await loadSecureStore());
}

export const runtimeAuthCredentialStore = runtimeAuthPlatform === 'web'
  ? createWebCookieCredentialStore()
  : nativeCredentialStore;
