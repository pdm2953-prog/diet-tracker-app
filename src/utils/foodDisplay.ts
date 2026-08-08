import type { Food } from '../models';

type FoodDisplayFields = Pick<Food, 'displayName' | 'name' | 'sourceFoodName'>;

export function getFoodDisplayName(food: FoodDisplayFields): string {
  const displayName = food.displayName?.trim();

  return displayName !== undefined && displayName.length > 0
    ? displayName
    : food.name;
}

export function getDevelopmentSourceFoodName(
  food: FoodDisplayFields,
): string | null {
  const sourceFoodName = food.sourceFoodName?.trim();

  if (!isDevelopmentMode() || sourceFoodName === undefined || sourceFoodName.length === 0) {
    return null;
  }

  return sourceFoodName === getFoodDisplayName(food)
    ? null
    : sourceFoodName;
}

export function isDevelopmentMode(): boolean {
  const globalValue = globalThis as typeof globalThis & { __DEV__?: boolean };

  return globalValue.__DEV__ === true;
}
