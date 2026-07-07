import { Food } from '../models';
import { mockFoodSearchFoods } from '../mockFoodSearchData';

export const FOOD_SEARCH_RESULT_LIMIT = 20;

export type FoodSearchOptions = {
  limit?: number;
};

export type FoodSearchResult = Food;

export type FoodSearchProvider = {
  searchFoods: (
    query: string,
    options?: FoodSearchOptions,
  ) => Promise<FoodSearchResult[]>;
};

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
