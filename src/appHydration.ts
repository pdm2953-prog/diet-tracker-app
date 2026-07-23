export type AppHydrationRenderState = 'loading' | 'interactive';

export function getAppHydrationRenderState(
  storageLoaded: boolean,
): AppHydrationRenderState {
  return storageLoaded ? 'interactive' : 'loading';
}

export function shouldRenderInteractiveApp(storageLoaded: boolean): boolean {
  return getAppHydrationRenderState(storageLoaded) === 'interactive';
}

export function shouldPersistAppDataSnapshot(storageLoaded: boolean): boolean {
  return storageLoaded;
}
