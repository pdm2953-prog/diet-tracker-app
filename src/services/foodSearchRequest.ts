import {
  FOOD_SEARCH_CONNECTION_ERROR_MESSAGE,
} from './foodSearch';
import type {
  FoodSearchOptions,
  FoodSearchProvider,
  FoodSearchResult,
} from './foodSearch';
import { isAbortError } from './abortError';

export const FOOD_SEARCH_DEBOUNCE_MS = 350;

export type FoodSearchRequestGate = {
  begin: () => number;
  cancel: () => void;
  isLatest: (requestId: number) => boolean;
};

export type FoodSearchRequestCallbacks = {
  onStart: () => void;
  onSuccess: (results: FoodSearchResult[]) => void;
  onError: (message: string) => void;
  onFinish: () => void;
};

export type FoodSearchRequestResult =
  | {
      applied: boolean;
      status: 'success';
      results: FoodSearchResult[];
    }
  | {
      applied: boolean;
      status: 'error';
      errorMessage: string;
    }
  | {
      applied: false;
      status: 'aborted';
    };

export type FoodSearchRequestScheduler = {
  clearTimeout: (timerId: ReturnType<typeof setTimeout>) => void;
  setTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
};

export function createFoodSearchRequestGate(): FoodSearchRequestGate {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;

      return latestRequestId;
    },
    cancel() {
      latestRequestId += 1;
    },
    isLatest(requestId) {
      return requestId === latestRequestId;
    },
  };
}

export async function runFoodSearchRequest(params: {
  callbacks: FoodSearchRequestCallbacks;
  gate: FoodSearchRequestGate;
  options?: FoodSearchOptions;
  provider: FoodSearchProvider;
  query: string;
}): Promise<FoodSearchRequestResult> {
  const requestId = params.gate.begin();

  params.callbacks.onStart();

  try {
    const results = await params.provider.searchFoods(params.query, params.options);

    if (!params.gate.isLatest(requestId)) {
      return {
        applied: false,
        status: 'success',
        results,
      };
    }

    params.callbacks.onSuccess(results);

    return {
      applied: true,
      status: 'success',
      results,
    };
  } catch (error) {
    if (isAbortError(error) || params.options?.signal?.aborted) {
      return {
        applied: false,
        status: 'aborted',
      };
    }

    if (!params.gate.isLatest(requestId)) {
      return {
        applied: false,
        status: 'error',
        errorMessage: FOOD_SEARCH_CONNECTION_ERROR_MESSAGE,
      };
    }

    params.callbacks.onError(FOOD_SEARCH_CONNECTION_ERROR_MESSAGE);

    return {
      applied: true,
      status: 'error',
      errorMessage: FOOD_SEARCH_CONNECTION_ERROR_MESSAGE,
    };
  } finally {
    if (params.gate.isLatest(requestId)) {
      params.callbacks.onFinish();
    }
  }
}

export function scheduleFoodSearchRequest(params: {
  callbacks: FoodSearchRequestCallbacks;
  delayMs?: number;
  gate: FoodSearchRequestGate;
  options?: FoodSearchOptions;
  provider: FoodSearchProvider;
  query: string;
  scheduler?: FoodSearchRequestScheduler;
}): () => void {
  const scheduler = params.scheduler ?? defaultFoodSearchRequestScheduler;
  const abortController = typeof AbortController === 'function'
    ? new AbortController()
    : null;
  const timerId = scheduler.setTimeout(() => {
    void runFoodSearchRequest({
      callbacks: params.callbacks,
      gate: params.gate,
      options: {
        ...params.options,
        signal: abortController?.signal ?? params.options?.signal,
      },
      provider: params.provider,
      query: params.query,
    });
  }, params.delayMs ?? FOOD_SEARCH_DEBOUNCE_MS);
  let isCanceled = false;

  return () => {
    if (isCanceled) {
      return;
    }

    isCanceled = true;
    scheduler.clearTimeout(timerId);
    params.gate.cancel();
    abortController?.abort();
  };
}

const defaultFoodSearchRequestScheduler: FoodSearchRequestScheduler = {
  clearTimeout: (timerId) => {
    clearTimeout(timerId);
  },
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};