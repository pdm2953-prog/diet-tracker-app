import type { Food, FoodSearchQueryMetadata } from '../models';
import { mockFoodSearchFoods } from '../mockFoodSearchData';
import type { BackendServiceConfig } from './backendConfig';
import { createBackendServiceConfig } from './backendConfig';
import {
  createBackendFoodSearchProvider,
  DEFAULT_BACKEND_FOOD_SEARCH_PAGE_SIZE,
} from './backendFoodSearch';
import { isAbortError } from './abortError';

export const FOOD_SEARCH_RESULT_LIMIT = DEFAULT_BACKEND_FOOD_SEARCH_PAGE_SIZE;

export function getDefaultFoodSearchResultLimit(): number {
  return FOOD_SEARCH_RESULT_LIMIT;
}

export const MIN_FOOD_SEARCH_QUERY_LENGTH = 2;
export const FOOD_SEARCH_CONNECTION_ERROR_MESSAGE = '검색 서버에 연결할 수 없습니다';

export type FoodSearchOptions = {
  limit?: number;
  signal?: AbortSignal;
};

export type FoodSearchResult = Food;

export type FoodSearchProviderResponse = {
  results: FoodSearchResult[];
  query?: FoodSearchQueryMetadata;
};

export type FoodSearchProvider = {
  searchFoods: (
    query: string,
    options?: FoodSearchOptions,
  ) => Promise<FoodSearchResult[]>;
  searchFoodsWithMetadata?: (
    query: string,
    options?: FoodSearchOptions,
  ) => Promise<FoodSearchProviderResponse>;
};

export function isValidFoodSearchQuery(query: string): boolean {
  return query.trim().length >= MIN_FOOD_SEARCH_QUERY_LENGTH;
}

export async function searchFoodProviderWithMetadata(
  provider: FoodSearchProvider,
  query: string,
  options?: FoodSearchOptions,
): Promise<FoodSearchProviderResponse> {
  if (provider.searchFoodsWithMetadata !== undefined) {
    return provider.searchFoodsWithMetadata(query, options);
  }

  return {
    results: await provider.searchFoods(query, options),
  };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function buildFoodSearchText(food: Food): string {
  return [
    food.displayName,
    food.name,
    food.brandName,
    food.category,
    food.sourceFoodId,
    food.sourceFoodName,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

export const mockFoodSearchProvider: FoodSearchProvider = {
  async searchFoods(query, options) {
    const normalizedQuery = normalizeSearchText(query);

    if (normalizedQuery.length === 0) {
      return [];
    }

    const matchingFoods = mockFoodSearchFoods.filter((food) =>
      buildFoodSearchText(food).includes(normalizedQuery),
    );

    if (typeof options?.limit === 'number') {
      return matchingFoods.slice(0, options.limit);
    }

    return matchingFoods;
  },
};

export function createDefaultFoodSearchProvider(
  config: BackendServiceConfig = createBackendServiceConfig(),
): FoodSearchProvider {
  async function searchFoodsWithMetadata(
    query: string,
    options?: FoodSearchOptions,
  ): Promise<FoodSearchProviderResponse> {
    if (config.foodSearchProvider === 'mock') {
      return {
        results: await mockFoodSearchProvider.searchFoods(query, options),
      };
    }

    try {
      return await searchFoodProviderWithMetadata(
        createBackendFoodSearchProvider(config),
        query,
        options,
      );
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (config.foodSearchProvider === 'backend-with-mock-fallback') {
        return {
          results: await mockFoodSearchProvider.searchFoods(query, options),
        };
      }

      throw error;
    }
  }

  return {
    async searchFoods(query, options) {
      return (await searchFoodsWithMetadata(query, options)).results;
    },
    searchFoodsWithMetadata,
  };
}

export const defaultFoodSearchProvider: FoodSearchProvider = {
  async searchFoods(query, options) {
    return (await createDefaultFoodSearchProvider().searchFoodsWithMetadata?.(query, options))?.results ?? [];
  },
  async searchFoodsWithMetadata(query, options) {
    return createDefaultFoodSearchProvider().searchFoodsWithMetadata?.(query, options)
      ?? { results: [] };
  },
};
