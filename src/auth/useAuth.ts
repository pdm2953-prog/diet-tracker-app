import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createAuthClient } from './authClient';
import type {
  AuthClient,
  AuthClientResult,
  AuthUser,
  LoginInput,
  RegisterInput,
} from './authClient';
import {
  runtimeAuthCredentialStore,
  runtimeAuthPlatform,
} from './runtimeCredentialStore';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'anonymous' }
  | { message: string; status: 'unavailable' }
  | { expiresAt: string; status: 'authenticated'; user: AuthUser };

export type AuthFormResult =
  | { ok: true }
  | { message: string; ok: false };

export type UseAuthResult = {
  login: (input: LoginInput) => Promise<AuthFormResult>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<AuthFormResult>;
  retryRestore: () => Promise<void>;
  state: AuthState;
};

export function useAuth(): UseAuthResult {
  const client = useMemo<AuthClient>(() => createAuthClient({
    credentialStore: runtimeAuthCredentialStore,
    platform: runtimeAuthPlatform,
  }), []);
  const [state, setState] = useState<AuthState>({ status: 'restoring' });
  const operationId = useRef(0);
  const operationQueue = useRef<Promise<void>>(Promise.resolve());
  const submissionInFlight = useRef(false);

  const enqueueOperation = useCallback(<T,>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    const result = operationQueue.current.then(operation, operation);
    operationQueue.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, []);

  const applyResult = useCallback((result: AuthClientResult): AuthFormResult => {
    if (result.kind === 'authenticated') {
      setState({
        expiresAt: result.session.expiresAt,
        status: 'authenticated',
        user: result.session.user,
      });
      return { ok: true };
    }

    if (result.kind === 'unavailable') {
      setState({ message: result.message, status: 'unavailable' });
      return { message: result.message, ok: false };
    }

    if (result.kind === 'anonymous') {
      setState({ status: 'anonymous' });
      return {
        message: result.message ?? '로그인이 필요합니다.',
        ok: false,
      };
    }

    return { message: result.message, ok: false };
  }, []);

  const retryRestore = useCallback(async () => {
    const currentOperationId = ++operationId.current;
    setState({ status: 'restoring' });
    const result = await enqueueOperation(() => client.restoreSession());

    if (currentOperationId === operationId.current) {
      applyResult(result);
    }
  }, [applyResult, client, enqueueOperation]);

  useEffect(() => {
    void retryRestore();

    return () => {
      operationId.current += 1;
    };
  }, [retryRestore]);

  const submit = useCallback(async (
    operation: () => Promise<AuthClientResult>,
  ): Promise<AuthFormResult> => {
    if (submissionInFlight.current) {
      return { message: '인증 요청을 처리하고 있습니다.', ok: false };
    }

    submissionInFlight.current = true;
    const currentOperationId = ++operationId.current;

    try {
      const result = await enqueueOperation(operation);

      return currentOperationId === operationId.current
        ? applyResult(result)
        : { message: '새 인증 요청이 시작되었습니다.', ok: false };
    } finally {
      submissionInFlight.current = false;
    }
  }, [applyResult, enqueueOperation]);

  const login = useCallback((input: LoginInput) => (
    submit(() => client.login(input))
  ), [client, submit]);

  const register = useCallback((input: RegisterInput) => (
    submit(() => client.register(input))
  ), [client, submit]);

  const logout = useCallback(async () => {
    const currentOperationId = ++operationId.current;

    try {
      const result = await enqueueOperation(() => client.logout());

      if (currentOperationId === operationId.current) {
        applyResult(result);
      }
    } catch {
      if (currentOperationId === operationId.current) {
        setState({
          message: '로그아웃 상태를 확인할 수 없습니다. 다시 시도해 주세요.',
          status: 'unavailable',
        });
      }
    }
  }, [applyResult, client, enqueueOperation]);

  return { login, logout, register, retryRestore, state };
}
