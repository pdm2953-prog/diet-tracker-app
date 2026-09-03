export const AUTH_SESSION_TOKEN_KEY = 'diet-tracker-app:auth-session-token';

export type AuthCredentialStore = {
  clearToken: () => Promise<void>;
  getToken: () => Promise<string | null>;
  setToken: (token: string) => Promise<void>;
};

export type SecureStoreAdapter = {
  deleteItemAsync: (key: string) => Promise<void>;
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};

export function createSecureStoreCredentialStore(
  secureStore: SecureStoreAdapter,
): AuthCredentialStore {
  return {
    clearToken: () => secureStore.deleteItemAsync(AUTH_SESSION_TOKEN_KEY),
    getToken: () => secureStore.getItemAsync(AUTH_SESSION_TOKEN_KEY),
    setToken: (token) => secureStore.setItemAsync(AUTH_SESSION_TOKEN_KEY, token),
  };
}

export function createWebCookieCredentialStore(): AuthCredentialStore {
  return {
    async clearToken() {
      // The browser owns the HttpOnly cookie. JavaScript has no credential to clear.
    },
    async getToken() {
      return null;
    },
    async setToken() {
      throw new Error('Web authentication credentials must remain in an HttpOnly cookie.');
    },
  };
}
