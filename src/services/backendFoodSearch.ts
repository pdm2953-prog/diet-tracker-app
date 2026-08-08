import type { Food, FoodSearchQueryMetadata } from '../models';
import {
  adaptBackendFoodSearchResponse,
  parseBackendFoodSearchResponse,
} from './backendFoodAdapter';
import type { BackendServiceConfig } from './backendConfig';
import { createBackendServiceConfig } from './backendConfig';
import { createAbortError, isAbortError } from './abortError';
import type { FoodSearchOptions, FoodSearchProvider, FoodSearchProviderResponse } from './foodSearch';

export const DEFAULT_BACKEND_FOOD_SEARCH_PAGE_SIZE = 20;

export type BackendFoodSearchErrorCode =
  | 'http-error'
  | 'invalid-response'
  | 'network-error'
  | 'not-configured'
  | 'aborted'
  | 'timeout';

export type BackendFoodSearchSuccess = {
  ok: true;
  items: Food[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  query?: FoodSearchQueryMetadata;
};

export type BackendFoodSearchFailure = {
  ok: false;
  items: [];
  errorCode: BackendFoodSearchErrorCode;
  errorMessage: string;
  status?: number;
};

export type BackendFoodSearchClientResult =
  | BackendFoodSearchSuccess
  | BackendFoodSearchFailure;

export type SearchBackendFoodsOptions = {
  config?: BackendServiceConfig;
  fetch?: typeof fetch;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  updatedAt?: string;
};

export async function searchBackendFoods(
  query: string,
  options: SearchBackendFoodsOptions = {},
): Promise<BackendFoodSearchClientResult> {
  const config = options.config ?? createBackendServiceConfig();
  const baseUrl = config.baseUrl;
  const fetcher = options.fetch ?? globalThis.fetch;

  if (baseUrl === null) {
    return createFailure(
      'not-configured',
      '백엔드 URL이 설정되지 않았습니다.',
    );
  }

  if (typeof fetcher !== 'function') {
    return createFailure(
      'network-error',
      '현재 실행 환경에서 네트워크 요청을 사용할 수 없습니다.',
    );
  }

  const requestUrl = buildFoodSearchUrl(baseUrl, {
    page: options.page ?? 1,
    pageSize: options.pageSize ?? DEFAULT_BACKEND_FOOD_SEARCH_PAGE_SIZE,
    query,
  });
  const externalSignal = options.signal;

  if (externalSignal?.aborted) {
    return createFailure(
      'aborted',
      '음식 검색 요청이 취소되었습니다.',
    );
  }

  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  const abortController = typeof AbortController === 'function'
    ? new AbortController()
    : null;
  let abortReason: 'external' | 'timeout' | null = null;
  const abortRequest = (reason: 'external' | 'timeout') => {
    abortReason = reason;
    abortController?.abort();
  };
  const timeoutId = abortController === null
    ? null
    : setTimeout(() => abortRequest('timeout'), timeoutMs);
  const externalAbortListener = abortController === null || externalSignal === undefined
    ? null
    : () => abortRequest('external');

  if (externalAbortListener !== null) {
    externalSignal?.addEventListener('abort', externalAbortListener, { once: true });
  }

  try {
    const response = await fetcher(requestUrl, {
      headers: {
        Accept: 'application/json',
      },
      method: 'GET',
      signal: abortController?.signal ?? externalSignal,
    });

    if (!response.ok) {
      return createFailure(
        'http-error',
        '음식 검색 API가 오류를 반환했습니다.',
        response.status,
      );
    }

    const parsedResponse = parseBackendFoodSearchResponse(await response.json());

    if (parsedResponse === null) {
      return createFailure(
        'invalid-response',
        '음식 검색 API 응답 형식이 올바르지 않습니다.',
      );
    }

    return {
      ok: true,
      ...adaptBackendFoodSearchResponse(parsedResponse, {
        updatedAt: options.updatedAt,
      }),
    };
  } catch (error) {
    if (isAbortError(error) && (abortReason === 'external' || externalSignal?.aborted)) {
      return createFailure(
        'aborted',
        '음식 검색 요청이 취소되었습니다.',
      );
    }

    return createFailure(
      isAbortError(error) ? 'timeout' : 'network-error',
      isAbortError(error)
        ? '음식 검색 요청 시간이 초과되었습니다.'
        : '음식 검색 API에 연결할 수 없습니다.',
    );
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    if (externalAbortListener !== null) {
      externalSignal?.removeEventListener('abort', externalAbortListener);
    }
  }
}

export function createBackendFoodSearchProvider(
  config: BackendServiceConfig = createBackendServiceConfig(),
): FoodSearchProvider {
  const searchFoodsWithMetadata = async (
    query: string,
    options?: FoodSearchOptions,
  ): Promise<FoodSearchProviderResponse> => {
    const result = await searchBackendFoods(query, {
      config,
      pageSize: options?.limit,
      signal: options?.signal,
    });

    if (!result.ok) {
      if (result.errorCode === 'aborted') {
        throw createAbortError(result.errorMessage);
      }

      throw new Error(result.errorMessage);
    }

    return {
      results: result.items,
      ...(result.query !== undefined ? { query: result.query } : {}),
    };
  };

  return {
    async searchFoods(query: string, options?: FoodSearchOptions): Promise<Food[]> {
      return (await searchFoodsWithMetadata(query, options)).results;
    },
    searchFoodsWithMetadata,
  };
}

function buildFoodSearchUrl(
  baseUrl: string,
  params: {
    page: number;
    pageSize: number;
    query: string;
  },
): string {
  const url = new URL('/api/v1/foods/search', baseUrl + '/');
  url.searchParams.set('q', params.query);
  url.searchParams.set('page', String(params.page));
  url.searchParams.set('pageSize', String(params.pageSize));

  return url.toString();
}

function createFailure(
  errorCode: BackendFoodSearchErrorCode,
  errorMessage: string,
  status?: number,
): BackendFoodSearchFailure {
  return {
    ok: false,
    items: [],
    errorCode,
    errorMessage,
    status,
  };
}
