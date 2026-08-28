export type AppHydrationRenderState = 'loading' | 'goal-setup' | 'interactive';

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
