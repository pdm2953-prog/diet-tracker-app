export const DEFAULT_BACKEND_TIMEOUT_MS = 5000;
export const DEFAULT_BACKEND_URL = 'http://localhost:8000';
export const DEFAULT_FOOD_SEARCH_PROVIDER: FoodSearchProviderMode = 'backend';

export type FoodSearchProviderMode = 'mock' | 'backend' | 'backend-with-mock-fallback';
export type BackendUrlSource = 'default' | 'env' | 'manual';
export type FoodSearchProviderSource = 'default' | 'env' | 'manual';

export type BackendServiceConfig = {
  baseUrl: string | null;
  baseUrlSource: BackendUrlSource;
  foodSearchProvider: FoodSearchProviderMode;
  foodSearchProviderSource: FoodSearchProviderSource;
  timeoutMs: number;
};

type ExpoPublicEnvironment = {
  EXPO_PUBLIC_BACKEND_URL?: string;
  EXPO_PUBLIC_BACKEND_TIMEOUT_MS?: string;
  EXPO_PUBLIC_FOOD_SEARCH_PROVIDER?: string;
};

declare const process:
  | {
      env?: ExpoPublicEnvironment;
    }
  | undefined;

export function createBackendServiceConfig(
  env: ExpoPublicEnvironment = readExpoPublicEnvironment(),
): BackendServiceConfig {
  const backendUrl = resolveBackendUrl(env.EXPO_PUBLIC_BACKEND_URL);
  const foodSearchProvider = resolveFoodSearchProviderMode(
    env.EXPO_PUBLIC_FOOD_SEARCH_PROVIDER,
  );

  return {
    baseUrl: backendUrl.baseUrl,
    baseUrlSource: backendUrl.source,
    foodSearchProvider: foodSearchProvider.mode,
    foodSearchProviderSource: foodSearchProvider.source,
    timeoutMs: parsePositiveInteger(
      env.EXPO_PUBLIC_BACKEND_TIMEOUT_MS,
      DEFAULT_BACKEND_TIMEOUT_MS,
    ),
  };
}

function readExpoPublicEnvironment(): ExpoPublicEnvironment {
  if (typeof process === 'undefined' || process.env === undefined) {
    return {};
  }

  return process.env;
}

function resolveBackendUrl(value: string | undefined): {
  baseUrl: string;
  source: BackendUrlSource;
} {
  const normalizedEnvUrl = normalizeBaseUrl(value);

  if (normalizedEnvUrl !== null) {
    return {
      baseUrl: normalizedEnvUrl,
      source: 'env',
    };
  }

  return {
    baseUrl: DEFAULT_BACKEND_URL,
    source: 'default',
  };
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  if (trimmedValue === undefined || trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue.replace(/\/+$/, '');
}

function resolveFoodSearchProviderMode(
  value: string | undefined,
): {
  mode: FoodSearchProviderMode;
  source: FoodSearchProviderSource;
} {
  if (
    value === 'backend'
    || value === 'backend-with-mock-fallback'
    || value === 'mock'
  ) {
    return {
      mode: value,
      source: 'env',
    };
  }

  return {
    mode: DEFAULT_FOOD_SEARCH_PROVIDER,
    source: 'default',
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}
