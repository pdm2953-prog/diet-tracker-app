import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adaptBackendFoodSearchItem,
  parseBackendFoodSearchResponse,
} from '../src/services/backendFoodAdapter';
import { createAbortError } from '../src/services/abortError';
import { searchBackendFoods } from '../src/services/backendFoodSearch';
import {
  createBackendServiceConfig,
  DEFAULT_BACKEND_URL,
} from '../src/services/backendConfig';
import type { BackendServiceConfig } from '../src/services/backendConfig';
import {
  defaultFoodSearchProvider,
  FOOD_SEARCH_CONNECTION_ERROR_MESSAGE,
} from '../src/services/foodSearch';
import type { FoodSearchQueryMetadata } from '../src/models';
import type {
  FoodSearchProvider,
  FoodSearchResult,
} from '../src/services/foodSearch';
import type {
  FoodSearchRequestCallbacks,
  FoodSearchRequestScheduler,
} from '../src/services/foodSearchRequest';
import {
  createFoodSearchRequestGate,
  FOOD_SEARCH_DEBOUNCE_MS,
  runFoodSearchRequest,
  scheduleFoodSearchRequest,
} from '../src/services/foodSearchRequest';

declare const process: {
  env: Record<string, string | undefined>;
};

const backendConfig: BackendServiceConfig = {
  baseUrl: 'http://localhost:8000',
  baseUrlSource: 'manual',
  foodSearchProvider: 'backend',
  foodSearchProviderSource: 'manual',
  timeoutMs: 5000,
};

const backendFoodDto = {
  id: 'mock-chicken-breast',
  name: '닭가슴살',
  brandName: null,
  sourceFoodName: '닭가슴살',
  servingSize: 100,
  servingUnit: 'g',
  nutritionPerServing: {
    caloriesKcal: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
  },
};

test('createBackendServiceConfig defaults to the local backend provider', () => {
  const config = createBackendServiceConfig({});

  assert.equal(config.baseUrl, DEFAULT_BACKEND_URL);
  assert.equal(config.baseUrlSource, 'default');
  assert.equal(config.foodSearchProvider, 'backend');
  assert.equal(config.foodSearchProviderSource, 'default');
});

test('createBackendServiceConfig reads backend URL and explicit provider from Expo public env', () => {
  const config = createBackendServiceConfig({
    EXPO_PUBLIC_BACKEND_URL: ' http://backend.example.test:9000/ ',
    EXPO_PUBLIC_FOOD_SEARCH_PROVIDER: 'backend-with-mock-fallback',
  });

  assert.equal(config.baseUrl, 'http://backend.example.test:9000');
  assert.equal(config.baseUrlSource, 'env');
  assert.equal(config.foodSearchProvider, 'backend-with-mock-fallback');
  assert.equal(config.foodSearchProviderSource, 'env');
});

test('adaptBackendFoodSearchItem maps backend DTO to Food and preserves zero values', () => {
  const food = adaptBackendFoodSearchItem(backendFoodDto, {
    updatedAt: '2026-07-30T00:00:00.000Z',
  });

  assert.equal(food.id, 'mock-chicken-breast');
  assert.equal(food.source, 'backend-food-search');
  assert.equal(food.sourceFoodId, 'mock-chicken-breast');
  assert.equal(food.sourceFoodName, '닭가슴살');
  assert.equal(food.brandName, null);
  assert.equal(food.category, null);
  assert.equal(food.nutritionPerServing.carbohydrateG, 0);
  assert.equal(food.nutritionPerServing.sugarsG, null);
});

test('adaptBackendFoodSearchItem safely maps optional FatSecret metadata', () => {
  const food = adaptBackendFoodSearchItem({
    ...backendFoodDto,
    dataSource: 'fatsecret',
    id: 'fatsecret-123-456',
    sourceFoodId: '123',
    sourceFoodName: 'Chicken Breast',
    sourceServingId: '456',
    servingDescription: '100 g',
    sourceRegion: 'KR',
  }, {
    updatedAt: '2026-07-30T00:00:00.000Z',
  });

  assert.equal(food.id, 'fatsecret-123-456');
  assert.equal(food.sourceFoodId, '123');
  assert.equal(food.sourceFoodName, 'Chicken Breast');
  assert.equal(food.dataSource, 'fatsecret');
  assert.equal(food.sourceServingId, '456');
  assert.equal(food.servingDescription, '100 g');
  assert.equal(food.sourceRegion, 'KR');
  assert.equal(food.nutritionPerServing.carbohydrateG, 0);
});

test('searchBackendFoods calls foods search API with q and adapts one backend item', async () => {
  let requestedUrl: string | null = null;
  let requestedMethod: string | undefined;
  const backendResponse = {
    items: [backendFoodDto],
    page: 1,
    pageSize: 20,
    hasMore: false,
    query: {
      original: '닭가슴살',
      resolved: 'chicken breast',
      wasTranslated: true,
      translator: 'korean_food_alias',
      status: 'translated',
    },
  };

  const result = await searchBackendFoods('닭가슴살', {
    config: backendConfig,
    fetch: async (input, init) => {
      requestedUrl = String(input);
      requestedMethod = init?.method;

      return new Response(JSON.stringify(backendResponse), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    },
    updatedAt: '2026-07-30T00:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(requestedMethod, 'GET');
  assert.equal(requestedUrl !== null, true);

  if (requestedUrl !== null) {
    const url = new URL(requestedUrl);

    assert.equal(url.origin, 'http://localhost:8000');
    assert.equal(url.pathname, '/api/v1/foods/search');
    assert.equal(url.searchParams.get('q'), '닭가슴살');
  }

  if (result.ok) {
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.name, '닭가슴살');
    assert.equal(result.items[0]?.brandName, null);
    assert.equal(result.items[0]?.nutritionPerServing.carbohydrateG, 0);
    assert.equal(result.query?.original, '닭가슴살');
    assert.equal(result.query?.resolved, 'chicken breast');
    assert.equal(result.query?.wasTranslated, true);
    assert.equal(result.query?.translator, 'korean_food_alias');
  }
});

test('defaultFoodSearchProvider uses backend by default instead of matching frontend mock', async () => {
  const previousBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  const previousFoodSearchProvider = process.env.EXPO_PUBLIC_FOOD_SEARCH_PROVIDER;
  const previousFetch = globalThis.fetch;
  let requestedUrl: string | null = null;

  process.env.EXPO_PUBLIC_BACKEND_URL = 'http://backend.example.test';
  delete process.env.EXPO_PUBLIC_FOOD_SEARCH_PROVIDER;
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);

    return new Response(JSON.stringify({
      items: [],
      page: 1,
      pageSize: 20,
      hasMore: false,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const results = await defaultFoodSearchProvider.searchFoods('닭가슴살', { limit: 20 });

    assert.deepEqual(results, []);
    assert.equal(requestedUrl !== null, true);

    if (requestedUrl !== null) {
      const url = new URL(requestedUrl);

      assert.equal(url.origin, 'http://backend.example.test');
      assert.equal(url.pathname, '/api/v1/foods/search');
      assert.equal(url.searchParams.get('q'), '닭가슴살');
    }
  } finally {
    restoreEnvValue('EXPO_PUBLIC_BACKEND_URL', previousBackendUrl);
    restoreEnvValue('EXPO_PUBLIC_FOOD_SEARCH_PROVIDER', previousFoodSearchProvider);
    globalThis.fetch = previousFetch;
  }
});

test('searchBackendFoods returns an empty success result for empty backend matches', async () => {
  const backendResponse = {
    items: [],
    page: 1,
    pageSize: 20,
    hasMore: false,
  };
  const result = await searchBackendFoods('없는음식', {
    config: backendConfig,
    fetch: async () => new Response(JSON.stringify(backendResponse), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 0);

  if (result.ok) {
    assert.equal(result.hasMore, false);
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 20);
  }
});

test('searchBackendFoods returns a safe error result for API errors', async () => {
  const result = await searchBackendFoods('닭가슴살', {
    config: backendConfig,
    fetch: async () => new Response('server error', { status: 500 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.items.length, 0);

  if (!result.ok) {
    assert.equal(result.errorCode, 'http-error');
    assert.equal(result.status, 500);
  }
});

test('runFoodSearchRequest maps backend failures to panel error state', async () => {
  const provider: FoodSearchProvider = {
    async searchFoods() {
      throw new Error('network down');
    },
  };
  const gate = createFoodSearchRequestGate();
  let isSearching = false;
  let searchError: string | null = null;
  let searchResults: FoodSearchResult[] = [makeFoodSearchResult('stale-food', '이전 결과')];

  const result = await runFoodSearchRequest({
    callbacks: {
      onStart: () => {
        isSearching = true;
        searchError = null;
      },
      onSuccess: (results) => {
        searchResults = results;
      },
      onError: (message) => {
        searchError = message;
        searchResults = [];
      },
      onFinish: () => {
        isSearching = false;
      },
    },
    gate,
    provider,
    query: '닭가슴살',
  });

  assert.equal(result.applied, true);
  assert.equal(result.status, 'error');
  assert.equal(searchError, FOOD_SEARCH_CONNECTION_ERROR_MESSAGE);
  assert.deepEqual(searchResults, []);
  assert.equal(isSearching, false);
});

test('runFoodSearchRequest applies one successful backend result and query metadata to panel state', async () => {
  const queryMetadata = {
    original: '닭가슴살',
    resolved: 'chicken breast',
    wasTranslated: true,
    translator: 'korean_food_alias',
    status: 'translated' as const,
  };
  const provider: FoodSearchProvider = {
    async searchFoods() {
      return [makeFoodSearchResult('mock-chicken-breast', '닭가슴살')];
    },
    async searchFoodsWithMetadata() {
      return {
        results: [makeFoodSearchResult('mock-chicken-breast', 'Chicken Breast')],
        query: queryMetadata,
      };
    },
  };
  const gate = createFoodSearchRequestGate();
  let searchError: string | null = 'previous error';
  let searchResults: FoodSearchResult[] = [];
  const appliedState: { queryMetadata: FoodSearchQueryMetadata | null } = {
    queryMetadata: null,
  };

  const result = await runFoodSearchRequest({
    callbacks: {
      onStart: () => {
        searchError = null;
        searchResults = [];
        appliedState.queryMetadata = null;
      },
      onSuccess: (results, metadata) => {
        searchResults = results;
        appliedState.queryMetadata = metadata ?? null;
      },
      onError: (message) => {
        searchError = message;
        searchResults = [];
        appliedState.queryMetadata = null;
      },
      onFinish: () => {},
    },
    gate,
    provider,
    query: '닭가슴살',
  });

  assert.equal(result.applied, true);
  assert.equal(result.status, 'success');
  assert.equal(searchError, null);
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0]?.name, 'Chicken Breast');
  assert.equal(searchResults[0]?.nutritionPerServing.carbohydrateG, 0);
  assert.equal(appliedState.queryMetadata?.resolved, 'chicken breast');

  if (result.status === 'success') {
    assert.equal(result.query?.original, '닭가슴살');
  }
});

test('runFoodSearchRequest prevents older search results from overwriting latest results', async () => {
  const gate = createFoodSearchRequestGate();
  const oldSearch = createDeferred<FoodSearchResult[]>();
  const latestSearch = createDeferred<FoodSearchResult[]>();
  const provider: FoodSearchProvider = {
    searchFoods(query) {
      return query === '이전검색'
        ? oldSearch.promise
        : latestSearch.promise;
    },
  };
  const appliedResultNames: string[] = [];
  let finishCount = 0;
  const callbacks = {
    onStart: () => {},
    onSuccess: (results: FoodSearchResult[]) => {
      appliedResultNames.push(results[0]?.name ?? 'empty');
    },
    onError: () => {},
    onFinish: () => {
      finishCount += 1;
    },
  };

  const oldRequest = runFoodSearchRequest({
    callbacks,
    gate,
    provider,
    query: '이전검색',
  });
  const latestRequest = runFoodSearchRequest({
    callbacks,
    gate,
    provider,
    query: '최신검색',
  });

  latestSearch.resolve([makeFoodSearchResult('latest-food', '최신 결과')]);
  const latestResult = await latestRequest;
  oldSearch.resolve([makeFoodSearchResult('old-food', '이전 결과')]);
  const oldResult = await oldRequest;

  assert.equal(latestResult.applied, true);
  assert.equal(oldResult.applied, false);
  assert.deepEqual(appliedResultNames, ['최신 결과']);
  assert.equal(finishCount, 1);
});

test('searchBackendFoods reports external abort separately from network errors', async () => {
  const abortController = new AbortController();
  let requestSignal: AbortSignal | null = null;
  const resultPromise = searchBackendFoods('닭가슴살', {
    config: backendConfig,
    fetch: async (_input, init) => {
      requestSignal = init?.signal ?? null;

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(createAbortError('aborted'));
        }, { once: true });
      });
    },
    signal: abortController.signal,
  });

  await flushPromises();
  abortController.abort();

  const result = await resultPromise;

  assert.equal(readAbortSignalState(requestSignal), true);
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.errorCode, 'aborted');
  }
});

test('runFoodSearchRequest suppresses abort errors from UI error state', async () => {
  const provider: FoodSearchProvider = {
    async searchFoods() {
      throw createAbortError('aborted');
    },
  };
  const gate = createFoodSearchRequestGate();
  let errorMessage: string | null = null;
  let finishCount = 0;

  const result = await runFoodSearchRequest({
    callbacks: createNoopFoodSearchCallbacks({
      onError: (message) => {
        errorMessage = message;
      },
      onFinish: () => {
        finishCount += 1;
      },
    }),
    gate,
    provider,
    query: '닭가슴살',
  });

  assert.equal(result.applied, false);
  assert.equal(result.status, 'aborted');
  assert.equal(errorMessage, null);
  assert.equal(finishCount, 1);
});

test('scheduleFoodSearchRequest waits for debounce before calling the provider', async () => {
  const manualScheduler = createManualFoodSearchScheduler();
  const gate = createFoodSearchRequestGate();
  const calls: string[] = [];
  const provider: FoodSearchProvider = {
    async searchFoods(query) {
      calls.push(query);
      return [];
    },
  };
  const cancel = scheduleFoodSearchRequest({
    callbacks: createNoopFoodSearchCallbacks(),
    gate,
    provider,
    query: '닭가슴살',
    scheduler: manualScheduler.scheduler,
  });

  assert.equal(manualScheduler.pendingDelayMs(), FOOD_SEARCH_DEBOUNCE_MS);
  assert.deepEqual(calls, []);

  manualScheduler.runNext();
  await flushPromises();

  assert.deepEqual(calls, ['닭가슴살']);
  cancel();
});

test('scheduleFoodSearchRequest cancels previous timers so only the latest query runs', async () => {
  const manualScheduler = createManualFoodSearchScheduler();
  const gate = createFoodSearchRequestGate();
  const calls: string[] = [];
  const provider: FoodSearchProvider = {
    async searchFoods(query) {
      calls.push(query);
      return [];
    },
  };

  const cancelFirst = scheduleFoodSearchRequest({
    callbacks: createNoopFoodSearchCallbacks(),
    gate,
    provider,
    query: '닭가',
    scheduler: manualScheduler.scheduler,
  });

  cancelFirst();
  assert.equal(manualScheduler.pendingCount(), 0);

  scheduleFoodSearchRequest({
    callbacks: createNoopFoodSearchCallbacks(),
    gate,
    provider,
    query: '닭가슴살',
    scheduler: manualScheduler.scheduler,
  });

  manualScheduler.runNext();
  await flushPromises();

  assert.deepEqual(calls, ['닭가슴살']);
});

test('scheduleFoodSearchRequest aborts in-flight search without surfacing UI error', async () => {
  const manualScheduler = createManualFoodSearchScheduler();
  const gate = createFoodSearchRequestGate();
  const errorMessages: string[] = [];
  let requestSignal: AbortSignal | undefined;
  const provider: FoodSearchProvider = {
    searchFoods(_query, options) {
      requestSignal = options?.signal;

      return new Promise<FoodSearchResult[]>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(createAbortError('aborted'));
        }, { once: true });
      });
    },
  };
  const cancel = scheduleFoodSearchRequest({
    callbacks: createNoopFoodSearchCallbacks({
      onError: (message) => {
        errorMessages.push(message);
      },
    }),
    gate,
    provider,
    query: '닭가슴살',
    scheduler: manualScheduler.scheduler,
  });

  manualScheduler.runNext();

  assert.equal(readAbortSignalState(requestSignal), false);

  cancel();
  await flushPromises();

  assert.equal(readAbortSignalState(requestSignal), true);
  assert.deepEqual(errorMessages, []);
});

test('parseBackendFoodSearchResponse parses optional query metadata', () => {
  const parsedResponse = parseBackendFoodSearchResponse({
    items: [],
    page: 1,
    pageSize: 10,
    hasMore: false,
    query: {
      original: '닭가슴살',
      resolved: 'chicken breast',
      wasTranslated: true,
      translator: 'korean_food_alias',
      status: 'translated',
    },
  });

  assert.equal(parsedResponse?.query?.original, '닭가슴살');
  assert.equal(parsedResponse?.query?.resolved, 'chicken breast');
  assert.equal(parsedResponse?.query?.wasTranslated, true);
});

test('parseBackendFoodSearchResponse rejects invalid response shapes', () => {
  const parsedResponse = parseBackendFoodSearchResponse({
    items: [
      {
        ...backendFoodDto,
        nutritionPerServing: {
          ...backendFoodDto.nutritionPerServing,
          carbsG: undefined,
        },
      },
    ],
    page: 1,
    pageSize: 20,
    hasMore: false,
  });

  assert.equal(parsedResponse, null);
});

function makeFoodSearchResult(id: string, name: string): FoodSearchResult {
  return adaptBackendFoodSearchItem({
    ...backendFoodDto,
    id,
    name,
  }, {
    updatedAt: '2026-07-30T00:00:00.000Z',
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolveDeferred: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });

  return {
    promise,
    resolve: resolveDeferred,
  };
}

function createNoopFoodSearchCallbacks(
  overrides: Partial<FoodSearchRequestCallbacks> = {},
): FoodSearchRequestCallbacks {
  return {
    onError: () => {},
    onFinish: () => {},
    onStart: () => {},
    onSuccess: () => {},
    ...overrides,
  };
}

function createManualFoodSearchScheduler(): {
  pendingCount: () => number;
  pendingDelayMs: () => number | null;
  runNext: () => void;
  scheduler: FoodSearchRequestScheduler;
} {
  type ManualTimer = {
    callback: () => void;
    delayMs: number;
    id: number;
  };
  const timers: ManualTimer[] = [];
  let nextTimerId = 0;

  return {
    pendingCount: () => timers.length,
    pendingDelayMs: () => timers[0]?.delayMs ?? null,
    runNext: () => {
      const timer = timers.shift();

      if (timer !== undefined) {
        timer.callback();
      }
    },
    scheduler: {
      clearTimeout: (timerId) => {
        const index = timers.findIndex((timer) => timer.id === Number(timerId));

        if (index !== -1) {
          timers.splice(index, 1);
        }
      },
      setTimeout: (callback, delayMs) => {
        nextTimerId += 1;
        timers.push({ callback, delayMs, id: nextTimerId });

        return nextTimerId as ReturnType<typeof setTimeout>;
      },
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function readAbortSignalState(signal: AbortSignal | null | undefined): boolean | undefined {
  return signal?.aborted;
}

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
