import type { Food } from '../models';
import { mockFoodSearchFoods } from '../mockFoodSearchData';
import type { BackendServiceConfig } from './backendConfig';
import { createBackendServiceConfig } from './backendConfig';
import { createBackendFoodSearchProvider } from './backendFoodSearch';
import { isAbortError } from './abortError';

export const FOOD_SEARCH_RESULT_LIMIT = 20;
export const MIN_FOOD_SEARCH_QUERY_LENGTH = 2;
export const FOOD_SEARCH_CONNECTION_ERROR_MESSAGE = '검색 서버에 연결할 수 없습니다';

export type FoodSearchOptions = {
  limit?: number;
  signal?: AbortSignal;
};

export type FoodSearchResult = Food;

export type FoodSearchProvider = {
  searchFoods: (
    query: string,
    options?: FoodSearchOptions,
  ) => Promise<FoodSearchResult[]>;
};

export function isValidFoodSearchQuery(query: string): boolean {
  return query.trim().length >= MIN_FOOD_SEARCH_QUERY_LENGTH;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function buildFoodSearchText(food: Food): string {
  return [
    food.name,
    food.brandName,
    food.category,
    food.sourceFoodId,
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
  return {
    async searchFoods(query, options) {
      if (config.foodSearchProvider === 'mock') {
        return mockFoodSearchProvider.searchFoods(query, options);
      }

      try {
        return await createBackendFoodSearchProvider(config).searchFoods(query, options);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        if (config.foodSearchProvider === 'backend-with-mock-fallback') {
          return mockFoodSearchProvider.searchFoods(query, options);
        }

        throw error;
      }
    },
  };
}

export const defaultFoodSearchProvider: FoodSearchProvider = {
  async searchFoods(query, options) {
    return createDefaultFoodSearchProvider().searchFoods(query, options);
  },
};
