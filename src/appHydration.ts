export type AppHydrationRenderState = 'loading' | 'goal-setup' | 'interactive';
export type AppStartupRenderState =
  | 'auth-loading'
  | 'auth-required'
  | 'auth-unavailable'
  | 'nutrition-loading'
  | 'goal-setup'
  | 'interactive';
export type StartupAuthStatus =
  | 'restoring'
  | 'anonymous'
  | 'unavailable'
  | 'authenticated';

export function getAppStartupRenderState(
  authStatus: StartupAuthStatus,
  storageLoaded: boolean,
  hasCompletedGoalSetup: boolean,
): AppStartupRenderState {
  if (authStatus === 'restoring') {
    return 'auth-loading';
  }

  if (authStatus === 'unavailable') {
    return 'auth-unavailable';
  }

  if (authStatus === 'anonymous') {
    return 'auth-required';
  }

  const hydrationState = getAppHydrationRenderState(
    storageLoaded,
    hasCompletedGoalSetup,
  );

  return hydrationState === 'loading' ? 'nutrition-loading' : hydrationState;
}

export function getAppHydrationRenderState(
  storageLoaded: boolean,
  hasCompletedGoalSetup: boolean,
): AppHydrationRenderState {
  if (!storageLoaded) {
    return 'loading';
  }

  return hasCompletedGoalSetup ? 'interactive' : 'goal-setup';
}

export function shouldRenderInteractiveApp(
  storageLoaded: boolean,
  hasCompletedGoalSetup: boolean,
): boolean {
  return getAppHydrationRenderState(storageLoaded, hasCompletedGoalSetup) === 'interactive';
}

export function shouldPersistAppDataSnapshot(
  storageLoaded: boolean,
  hasCompletedGoalSetup: boolean,
): boolean {
  return storageLoaded && hasCompletedGoalSetup;
}
