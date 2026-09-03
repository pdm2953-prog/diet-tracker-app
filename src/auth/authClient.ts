import type { BackendServiceConfig } from '../services/backendConfig';
import { createBackendServiceConfig } from '../services/backendConfig';
import type { AuthCredentialStore } from './credentialStore';
import type { AuthRuntimePlatform } from './runtimeCredentialStore';

const AUTH_API_PATH = '/api/v1/auth';
const CSRF_HEADER = 'X-CSRF-Protection';
const CSRF_VALUE = '1';
const TRANSPORT_HEADER = 'X-Auth-Transport';

export type AuthUser = {
  accountStatus: 'active' | 'disabled';
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
  updatedAt: string;
};

export type AuthenticatedSession = {
  expiresAt: string;
  transport: 'bearer' | 'cookie';
  user: AuthUser;
};

export type AuthClientResult =
  | { kind: 'authenticated'; session: AuthenticatedSession }
  | { kind: 'anonymous'; message?: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'unavailable'; message: string };

export type AuthLogoutResult = Extract<
  AuthClientResult,
  { kind: 'anonymous' | 'unavailable' }
>;

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  displayName: string;
};

export type AuthClient = {
  login: (input: LoginInput) => Promise<AuthClientResult>;
  logout: () => Promise<AuthLogoutResult>;
  register: (input: RegisterInput) => Promise<AuthClientResult>;
  restoreSession: () => Promise<AuthClientResult>;
};

export type CreateAuthClientOptions = {
  config?: BackendServiceConfig;
  credentialStore: AuthCredentialStore;
  fetch?: typeof fetch;
  platform: AuthRuntimePlatform;
};

type RequestResult =
  | { kind: 'response'; response: Response }
  | { kind: 'unavailable' };

export function createAuthClient(options: CreateAuthClientOptions): AuthClient {
  const config = options.config ?? createBackendServiceConfig();
  const fetcher = options.fetch ?? globalThis.fetch;
  const { credentialStore, platform } = options;

  async function restoreSession(): Promise<AuthClientResult> {
    const credential = await readNativeCredential();

    if (credential.kind === 'unavailable') {
      return credential;
    }

    if (platform === 'native' && credential.token === null) {
      return { kind: 'anonymous' };
    }

    const request = await requestAuth('/session', {
      headers: createSessionHeaders(credential.token),
      method: 'GET',
    });

    if (request.kind === 'unavailable') {
      return unavailableResult();
    }

    return resolveSessionResponse(request.response);
  }

  async function login(input: LoginInput): Promise<AuthClientResult> {
    return issueSession('/login', {
      email: input.email,
      password: input.password,
    });
  }

  async function register(input: RegisterInput): Promise<AuthClientResult> {
    return issueSession('/register', {
      displayName: input.displayName,
      email: input.email,
      password: input.password,
    });
  }

  async function issueSession(
    path: '/login' | '/register',
    body: LoginInput | RegisterInput,
  ): Promise<AuthClientResult> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (platform === 'native') {
      headers[TRANSPORT_HEADER] = 'bearer';
    } else {
      headers[CSRF_HEADER] = CSRF_VALUE;
    }

    const request = await requestAuth(path, {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    });

    if (request.kind === 'unavailable') {
      return unavailableResult();
    }

    const { response } = request;

    if (response.status === 401) {
      return clearCredentialForUnauthorized(
        '이메일 또는 비밀번호를 확인해 주세요.',
      );
    }

    if (response.status >= 500) {
      return unavailableResult();
    }

    if (!response.ok) {
      return {
        kind: 'rejected',
        message: await readErrorMessage(
          response,
          path === '/register'
            ? '회원가입을 완료할 수 없습니다. 입력값을 확인해 주세요.'
            : '로그인 요청을 완료할 수 없습니다.',
        ),
      };
    }

    const payload = await readJson(response);
    const parsedSession = parseIssuedSession(payload, platform);

    if (parsedSession === null) {
      return unavailableResult('인증 서버 응답을 확인할 수 없습니다.');
    }

    if (platform === 'native') {
      const sessionToken = parsedSession.sessionToken;

      if (sessionToken === undefined) {
        return unavailableResult('인증 서버 응답을 확인할 수 없습니다.');
      }

      try {
        await credentialStore.setToken(sessionToken);
      } catch {
        await tryRevokeBearer(sessionToken);
        try {
          await credentialStore.clearToken();
        } catch {
          // The session remains unavailable. A later restore or logout can
          // retry cleanup if SecureStore is temporarily inaccessible.
        }
        return unavailableResult('기기 보안 저장소를 사용할 수 없습니다.');
      }
    }

    return {
      kind: 'authenticated',
      session: parsedSession.session,
    };
  }

  async function logout(): Promise<AuthLogoutResult> {
    let token: string | null = null;

    if (platform === 'native') {
      try {
        token = await credentialStore.getToken();
      } catch {
        token = null;
      }
    }

    const request = await requestAuth('/session', {
      headers: createLogoutHeaders(token),
      method: 'DELETE',
    });

    if (platform === 'native') {
      try {
        await credentialStore.clearToken();
      } catch {
        return unavailableResult(
          '기기 보안 저장소에서 로그인 정보를 삭제할 수 없습니다. 다시 시도해 주세요.',
        );
      }

      return { kind: 'anonymous' };
    }

    if (request.kind === 'unavailable' || request.response.status >= 500) {
      return unavailableResult(
        '로그아웃을 완료할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.',
      );
    }

    return request.response.status === 204
      ? { kind: 'anonymous' }
      : unavailableResult('로그아웃 응답을 확인할 수 없습니다. 다시 시도해 주세요.');
  }

  async function resolveSessionResponse(response: Response): Promise<AuthClientResult> {
    if (response.status === 401) {
      return clearCredentialForUnauthorized();
    }

    if (response.status >= 500) {
      return unavailableResult();
    }

    if (!response.ok) {
      return unavailableResult('세션을 확인할 수 없습니다.');
    }

    const session = parseCurrentSession(await readJson(response), platform);

    return session === null
      ? unavailableResult('인증 서버 응답을 확인할 수 없습니다.')
      : { kind: 'authenticated', session };
  }

  async function clearCredentialForUnauthorized(message?: string): Promise<AuthClientResult> {
    try {
      await credentialStore.clearToken();
    } catch {
      return unavailableResult('만료된 로그인 정보를 정리할 수 없습니다.');
    }

    return {
      kind: 'anonymous',
      ...(message === undefined ? {} : { message }),
    };
  }

  async function readNativeCredential(): Promise<
    { kind: 'available'; token: string | null }
    | { kind: 'unavailable'; message: string }
  > {
    if (platform === 'web') {
      return { kind: 'available', token: null };
    }

    try {
      return {
        kind: 'available',
        token: await credentialStore.getToken(),
      };
    } catch {
      return unavailableResult('기기 보안 저장소를 사용할 수 없습니다.');
    }
  }

  async function tryRevokeBearer(token: string): Promise<void> {
    try {
      await requestAuth('/session', {
        headers: createLogoutHeaders(token),
        method: 'DELETE',
      });
    } catch {
      // Revocation is best effort when secure persistence itself failed.
    }
  }

  async function requestAuth(
    path: '/login' | '/register' | '/session',
    init: RequestInit,
  ): Promise<RequestResult> {
    if (config.baseUrl === null || typeof fetcher !== 'function') {
      return { kind: 'unavailable' };
    }

    const abortController = typeof AbortController === 'function'
      ? new AbortController()
      : null;
    const timeoutId = abortController === null
      ? null
      : setTimeout(() => abortController.abort(), config.timeoutMs);

    try {
      const response = await fetcher(
        new URL(`${AUTH_API_PATH}${path}`, `${config.baseUrl}/`).toString(),
        {
          ...init,
          ...(platform === 'web' ? { credentials: 'include' as const } : {}),
          signal: abortController?.signal,
        },
      );
      return { kind: 'response', response };
    } catch {
      return { kind: 'unavailable' };
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  function createSessionHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (platform === 'native' && token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  function createLogoutHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (platform === 'native') {
      if (token !== null) {
        headers.Authorization = `Bearer ${token}`;
      }
    } else {
      headers[CSRF_HEADER] = CSRF_VALUE;
    }

    return headers;
  }

  return { login, logout, register, restoreSession };
}

function parseIssuedSession(
  value: unknown,
  platform: AuthRuntimePlatform,
): { session: AuthenticatedSession; sessionToken?: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const expectedTransport = platform === 'web' ? 'cookie' : 'bearer';
  const session = parseSession(value, expectedTransport);

  if (session === null) {
    return null;
  }

  if (platform === 'web') {
    if (value.credential !== undefined) {
      return null;
    }

    return { session };
  }

  if (
    !isRecord(value.credential)
    || value.credential.scheme !== 'Bearer'
    || !isNonEmptyString(value.credential.sessionToken)
  ) {
    return null;
  }

  return {
    session,
    sessionToken: value.credential.sessionToken,
  };
}

function parseCurrentSession(
  value: unknown,
  platform: AuthRuntimePlatform,
): AuthenticatedSession | null {
  return isRecord(value)
    ? parseSession(value, platform === 'web' ? 'cookie' : 'bearer')
    : null;
}

function parseSession(
  value: Record<string, unknown>,
  expectedTransport: 'bearer' | 'cookie',
): AuthenticatedSession | null {
  const user = parseUser(value.user);
  const session = value.session;

  if (
    value.transport !== expectedTransport
    || user === null
    || !isRecord(session)
    || !isNonEmptyString(session.expiresAt)
  ) {
    return null;
  }

  return {
    expiresAt: session.expiresAt,
    transport: expectedTransport,
    user,
  };
}

function parseUser(value: unknown): AuthUser | null {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.email)
    || !isNonEmptyString(value.displayName)
    || (value.accountStatus !== 'active' && value.accountStatus !== 'disabled')
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)
  ) {
    return null;
  }

  return {
    accountStatus: value.accountStatus,
    createdAt: value.createdAt,
    displayName: value.displayName,
    email: value.email,
    id: value.id,
    updatedAt: value.updatedAt,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const value = await readJson(response);

  if (
    isRecord(value)
    && isRecord(value.detail)
    && isNonEmptyString(value.detail.message)
  ) {
    return value.detail.message;
  }

  return fallback;
}

function unavailableResult(
  message = '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
): { kind: 'unavailable'; message: string } {
  return { kind: 'unavailable', message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
