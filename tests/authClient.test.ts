import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createAuthClient,
} from '../src/auth/authClient';
import type { AuthCredentialStore } from '../src/auth/credentialStore';
import {
  AUTH_SESSION_TOKEN_KEY,
  createSecureStoreCredentialStore,
  createWebCookieCredentialStore,
} from '../src/auth/credentialStore';
import type { BackendServiceConfig } from '../src/services/backendConfig';

const config: BackendServiceConfig = {
  baseUrl: 'http://backend.example.test:8000',
  baseUrlSource: 'manual',
  foodSearchProvider: 'backend',
  foodSearchProviderSource: 'manual',
  timeoutMs: 5000,
};

const userDto = {
  accountStatus: 'active',
  createdAt: '2026-09-01T00:00:00Z',
  displayName: '테스트 사용자',
  email: 'person@example.com',
  id: 'a39cb927-04ee-49bb-b65c-349e5926a0a8',
  updatedAt: '2026-09-01T00:00:00Z',
};

const sessionDto = { expiresAt: '2026-12-01T00:00:00Z' };

function response(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function createMemoryCredentialStore(initialToken: string | null = null): {
  clearCalls: () => number;
  currentToken: () => string | null;
  setCalls: () => number;
  store: AuthCredentialStore;
} {
  let token = initialToken;
  let clearCallCount = 0;
  let setCallCount = 0;

  return {
    clearCalls: () => clearCallCount,
    currentToken: () => token,
    setCalls: () => setCallCount,
    store: {
      async clearToken() {
        clearCallCount += 1;
        token = null;
      },
      async getToken() {
        return token;
      },
      async setToken(nextToken) {
        setCallCount += 1;
        token = nextToken;
      },
    },
  };
}

test('native registration requests bearer transport and persists only the returned token', async () => {
  const credential = createMemoryCredentialStore();
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return response({
        credential: { scheme: 'Bearer', sessionToken: 'native-raw-token' },
        session: sessionDto,
        transport: 'bearer',
        user: userDto,
      }, 201);
    }) as typeof fetch,
    platform: 'native',
  });

  const result = await client.register({
    displayName: '테스트 사용자',
    email: 'person@example.com',
    password: 'form-local-password',
  });
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestUrl, 'http://backend.example.test:8000/api/v1/auth/register');
  assert.equal(requestInit?.method, 'POST');
  assert.equal(requestInit?.credentials, undefined);
  assert.equal(headers.get('X-Auth-Transport'), 'bearer');
  assert.equal(headers.get('Authorization'), null);
  assert.equal(credential.currentToken(), 'native-raw-token');
  assert.equal(credential.setCalls(), 1);
  assert.equal(result.kind, 'authenticated');
  assert.equal(JSON.stringify(result).includes('native-raw-token'), false);
  assert.equal(JSON.stringify(result).includes('form-local-password'), false);
});

test('native issuance stays unavailable and revokes best effort when SecureStore set fails', async () => {
  const requests: RequestInit[] = [];
  let clearCallCount = 0;
  const client = createAuthClient({
    config,
    credentialStore: {
      async clearToken() { clearCallCount += 1; },
      async getToken() { return null; },
      async setToken() { throw new Error('SecureStore unavailable'); },
    },
    fetch: (async (_input, init) => {
      requests.push(init ?? {});
      return requests.length === 1
        ? response({
          credential: { scheme: 'Bearer', sessionToken: 'unpersisted-token' },
          session: sessionDto,
          transport: 'bearer',
          user: userDto,
        })
        : response(null, 204);
    }) as typeof fetch,
    platform: 'native',
  });

  const result = await client.login({
    email: 'person@example.com',
    password: 'form-local-password',
  });

  assert.equal(result.kind, 'unavailable');
  assert.equal(requests.length, 2);
  assert.equal(clearCallCount, 1);
  assert.equal(new Headers(requests[1].headers).get('Authorization'), 'Bearer unpersisted-token');
  assert.equal(JSON.stringify(result).includes('unpersisted-token'), false);
  assert.equal(JSON.stringify(result).includes('form-local-password'), false);
});

test('web login uses cookie credentials and CSRF without JavaScript token persistence', async () => {
  const credential = createMemoryCredentialStore();
  let requestInit: RequestInit | undefined;
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async (_input, init) => {
      requestInit = init;
      return response({
        session: sessionDto,
        transport: 'cookie',
        user: userDto,
      });
    }) as typeof fetch,
    platform: 'web',
  });

  const result = await client.login({
    email: 'person@example.com',
    password: 'web-form-password',
  });
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestInit?.credentials, 'include');
  assert.equal(headers.get('X-CSRF-Protection'), '1');
  assert.equal(headers.get('X-Auth-Transport'), null);
  assert.equal(headers.get('Authorization'), null);
  assert.equal(credential.setCalls(), 0);
  assert.equal(credential.currentToken(), null);
  assert.equal(result.kind, 'authenticated');
  assert.equal(JSON.stringify(result).includes('web-form-password'), false);
});

test('web cookie credential adapter never persists a raw token', async () => {
  const credentialStore = createWebCookieCredentialStore();

  assert.equal(await credentialStore.getToken(), null);

  let rejected = false;
  try {
    await credentialStore.setToken('must-not-persist');
  } catch {
    rejected = true;
  }

  assert.equal(rejected, true);
  assert.equal(await credentialStore.getToken(), null);
});

test('native session restore sends SecureStore bearer and clears it on 401', async () => {
  const credential = createMemoryCredentialStore('stored-session-token');
  let requestInit: RequestInit | undefined;
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async (_input, init) => {
      requestInit = init;
      return response({
        detail: { code: 'unauthenticated', message: 'Authentication is required.' },
      }, 401);
    }) as typeof fetch,
    platform: 'native',
  });

  const result = await client.restoreSession();
  const headers = new Headers(requestInit?.headers);

  assert.equal(headers.get('Authorization'), 'Bearer stored-session-token');
  assert.equal(result.kind, 'anonymous');
  assert.equal(credential.currentToken(), null);
  assert.equal(credential.clearCalls(), 1);
});

test('native restore stays unavailable when SecureStore get fails without making a request', async () => {
  let requestCount = 0;
  const client = createAuthClient({
    config,
    credentialStore: {
      async clearToken() {},
      async getToken() { throw new Error('SecureStore unavailable'); },
      async setToken() {},
    },
    fetch: (async () => {
      requestCount += 1;
      return response(null, 204);
    }) as typeof fetch,
    platform: 'native',
  });

  const result = await client.restoreSession();

  assert.equal(result.kind, 'unavailable');
  assert.equal(requestCount, 0);
});

test('native restore does not claim anonymous when 401 credential deletion fails', async () => {
  const client = createAuthClient({
    config,
    credentialStore: {
      async clearToken() { throw new Error('SecureStore unavailable'); },
      async getToken() { return 'stored-session-token'; },
      async setToken() {},
    },
    fetch: (async () => response({
      detail: { code: 'unauthenticated', message: 'Authentication is required.' },
    }, 401)) as typeof fetch,
    platform: 'native',
  });

  const result = await client.restoreSession();

  assert.equal(result.kind, 'unavailable');
});

test('network and 5xx restore failures retain native credentials as unavailable', async () => {
  for (const fetcher of [
    (async () => { throw new Error('offline'); }) as typeof fetch,
    (async () => response({ detail: { code: 'internal_error' } }, 503)) as typeof fetch,
  ]) {
    const credential = createMemoryCredentialStore('recoverable-token');
    const client = createAuthClient({
      config,
      credentialStore: credential.store,
      fetch: fetcher,
      platform: 'native',
    });

    const result = await client.restoreSession();

    assert.equal(result.kind, 'unavailable');
    assert.equal(credential.currentToken(), 'recoverable-token');
    assert.equal(credential.clearCalls(), 0);
  }
});

test('native restore timeout retains its credential as unavailable', async () => {
  const credential = createMemoryCredentialStore('recoverable-token');
  const client = createAuthClient({
    config: { ...config, timeoutMs: 1 },
    credentialStore: credential.store,
    fetch: (async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) as typeof fetch,
    platform: 'native',
  });

  const result = await client.restoreSession();

  assert.equal(result.kind, 'unavailable');
  assert.equal(credential.currentToken(), 'recoverable-token');
  assert.equal(credential.clearCalls(), 0);
});

test('native login clears an existing credential on 401', async () => {
  const credential = createMemoryCredentialStore('stale-session-token');
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async () => response({
      detail: { code: 'invalid_credentials', message: 'Email or password is invalid.' },
    }, 401)) as typeof fetch,
    platform: 'native',
  });

  const result = await client.login({
    email: 'person@example.com',
    password: 'incorrect-password',
  });

  assert.equal(result.kind, 'anonymous');
  assert.equal(credential.currentToken(), null);
  assert.equal(credential.clearCalls(), 1);
});

test('network and 5xx login failures retain native credentials as unavailable', async () => {
  for (const fetcher of [
    (async () => { throw new Error('offline'); }) as typeof fetch,
    (async () => response({ detail: { code: 'internal_error' } }, 503)) as typeof fetch,
  ]) {
    const credential = createMemoryCredentialStore('recoverable-token');
    const client = createAuthClient({
      config,
      credentialStore: credential.store,
      fetch: fetcher,
      platform: 'native',
    });

    const result = await client.login({
      email: 'person@example.com',
      password: 'form-local-password',
    });

    assert.equal(result.kind, 'unavailable');
    assert.equal(credential.currentToken(), 'recoverable-token');
    assert.equal(credential.clearCalls(), 0);
  }
});

test('native restore without a credential becomes anonymous without a request', async () => {
  const credential = createMemoryCredentialStore();
  let requestCount = 0;
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async () => {
      requestCount += 1;
      return response(null, 204);
    }) as typeof fetch,
    platform: 'native',
  });

  const result = await client.restoreSession();

  assert.equal(result.kind, 'anonymous');
  assert.equal(requestCount, 0);
});

test('logout attempts server revocation and clears the native credential after failure', async () => {
  const credential = createMemoryCredentialStore('logout-token');
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      throw new Error('offline during logout');
    }) as typeof fetch,
    platform: 'native',
  });

  const result = await client.logout();
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestUrl, 'http://backend.example.test:8000/api/v1/auth/session');
  assert.equal(requestInit?.method, 'DELETE');
  assert.equal(headers.get('Authorization'), 'Bearer logout-token');
  assert.equal(credential.currentToken(), null);
  assert.equal(credential.clearCalls(), 1);
  assert.equal(result.kind, 'anonymous');
});

test('native logout stays unavailable when SecureStore deletion fails', async () => {
  const client = createAuthClient({
    config,
    credentialStore: {
      async clearToken() { throw new Error('SecureStore unavailable'); },
      async getToken() { return 'logout-token'; },
      async setToken() {},
    },
    fetch: (async () => response(null, 204)) as typeof fetch,
    platform: 'native',
  });

  const result = await client.logout();

  assert.equal(result.kind, 'unavailable');
});

test('web logout sends cookie CSRF transport and does not create a token store', async () => {
  const credential = createMemoryCredentialStore();
  let requestInit: RequestInit | undefined;
  const client = createAuthClient({
    config,
    credentialStore: credential.store,
    fetch: (async (_input, init) => {
      requestInit = init;
      return response(null, 204);
    }) as typeof fetch,
    platform: 'web',
  });

  const result = await client.logout();
  const headers = new Headers(requestInit?.headers);

  assert.equal(requestInit?.method, 'DELETE');
  assert.equal(requestInit?.credentials, 'include');
  assert.equal(headers.get('X-CSRF-Protection'), '1');
  assert.equal(headers.get('Authorization'), null);
  assert.equal(credential.setCalls(), 0);
  assert.equal(result.kind, 'anonymous');
});

test('web logout stays unavailable on network, 5xx, and non-204 responses', async () => {
  for (const fetcher of [
    (async () => { throw new Error('offline'); }) as typeof fetch,
    (async () => response({ detail: { code: 'internal_error' } }, 503)) as typeof fetch,
    (async () => response({}, 200)) as typeof fetch,
  ]) {
    const credential = createMemoryCredentialStore('browser-owned-cookie-marker');
    const client = createAuthClient({
      config,
      credentialStore: credential.store,
      fetch: fetcher,
      platform: 'web',
    });

    const result = await client.logout();

    assert.equal(result.kind, 'unavailable');
    assert.equal(credential.currentToken(), 'browser-owned-cookie-marker');
    assert.equal(credential.clearCalls(), 0);
  }
});

test('web restore relies on backend invalid-cookie deletion and becomes anonymous on 401', async () => {
  const credentialStore = createWebCookieCredentialStore();
  let requestInit: RequestInit | undefined;
  const client = createAuthClient({
    config,
    credentialStore,
    fetch: (async (_input, init) => {
      requestInit = init;
      return response({
        detail: { code: 'unauthenticated', message: 'Authentication is required.' },
      }, 401);
    }) as typeof fetch,
    platform: 'web',
  });

  const result = await client.restoreSession();

  assert.equal(requestInit?.credentials, 'include');
  assert.equal(result.kind, 'anonymous');
  assert.equal(await credentialStore.getToken(), null);
});

test('SecureStore credential adapter uses a dedicated key for get, set, and clear', async () => {
  const operations: string[] = [];
  const values = new Map<string, string>();
  const store = createSecureStoreCredentialStore({
    async deleteItemAsync(key) {
      operations.push(`delete:${key}`);
      values.delete(key);
    },
    async getItemAsync(key) {
      operations.push(`get:${key}`);
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      operations.push(`set:${key}`);
      values.set(key, value);
    },
  });

  await store.setToken('secure-token');
  assert.equal(await store.getToken(), 'secure-token');
  await store.clearToken();
  assert.equal(await store.getToken(), null);
  assert.deepEqual(operations, [
    `set:${AUTH_SESSION_TOKEN_KEY}`,
    `get:${AUTH_SESSION_TOKEN_KEY}`,
    `delete:${AUTH_SESSION_TOKEN_KEY}`,
    `get:${AUTH_SESSION_TOKEN_KEY}`,
  ]);
});
