import type { Food } from '../models';

export type BackendFoodNutritionPerServingDto = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type BackendFoodSearchItemDto = {
  id: string;
  name: string;
  brandName: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  nutritionPerServing: BackendFoodNutritionPerServingDto;
};

export type BackendFoodSearchResponseDto = {
  items: BackendFoodSearchItemDto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type AdaptBackendFoodOptions = {
  updatedAt?: string;
};

export function parseBackendFoodSearchResponse(
  value: unknown,
): BackendFoodSearchResponseDto | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  if (
    !isPositiveInteger(value.page)
    || !isPositiveInteger(value.pageSize)
    || typeof value.hasMore !== 'boolean'
  ) {
    return null;
  }

  const items = value.items.map(parseBackendFoodSearchItem);

  if (items.some((item) => item === null)) {
    return null;
  }

  return {
    items: items as BackendFoodSearchItemDto[],
    page: value.page,
    pageSize: value.pageSize,
    hasMore: value.hasMore,
  };
}

export function adaptBackendFoodSearchResponse(
  dto: BackendFoodSearchResponseDto,
  options: AdaptBackendFoodOptions = {},
): {
  items: Food[];
  page: number;
  pageSize: number;
  hasMore: boolean;
} {
  return {
    items: dto.items.map((item) => adaptBackendFoodSearchItem(item, options)),
    page: dto.page,
    pageSize: dto.pageSize,
    hasMore: dto.hasMore,
  };
}

export function adaptBackendFoodSearchItem(
  dto: BackendFoodSearchItemDto,
  options: AdaptBackendFoodOptions = {},
): Food {
  return {
    id: dto.id,
    source: 'backend-food-search',
    sourceFoodId: dto.id,
    name: dto.name,
    brandName: dto.brandName,
    category: null,
    servingSize: dto.servingSize,
    servingUnit: dto.servingUnit,
    nutritionPerServing: {
      caloriesKcal: dto.nutritionPerServing.caloriesKcal,
      carbohydrateG: dto.nutritionPerServing.carbsG,
      proteinG: dto.nutritionPerServing.proteinG,
      fatG: dto.nutritionPerServing.fatG,
      sugarsG: null,
      sodiumMg: null,
      fiberG: null,
      saturatedFatG: null,
      transFatG: null,
      cholesterolMg: null,
    },
    updatedAt: options.updatedAt ?? new Date().toISOString(),
  };
}

function parseBackendFoodSearchItem(value: unknown): BackendFoodSearchItemDto | null {
  if (!isRecord(value) || !isRecord(value.nutritionPerServing)) {
    return null;
  }

  const servingSize = parseNullableNonNegativeNumber(value.servingSize);
  const nutritionPerServing = parseBackendFoodNutrition(value.nutritionPerServing);

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.name)
    || !isNullableString(value.brandName)
    || servingSize === undefined
    || !isNullableString(value.servingUnit)
    || nutritionPerServing === null
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    brandName: value.brandName,
    servingSize,
    servingUnit: value.servingUnit,
    nutritionPerServing,
  };
}

function parseBackendFoodNutrition(
  value: Record<string, unknown>,
): BackendFoodNutritionPerServingDto | null {
  const caloriesKcal = parseNullableNonNegativeNumber(value.caloriesKcal);
  const proteinG = parseNullableNonNegativeNumber(value.proteinG);
  const carbsG = parseNullableNonNegativeNumber(value.carbsG);
  const fatG = parseNullableNonNegativeNumber(value.fatG);

  if (
    caloriesKcal === undefined
    || proteinG === undefined
    || carbsG === undefined
    || fatG === undefined
  ) {
    return null;
  }

  return {
    caloriesKcal,
    proteinG,
    carbsG,
    fatG,
  };
}

function parseNullableNonNegativeNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
