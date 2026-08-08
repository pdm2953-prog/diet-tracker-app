import type { FoodDataSource, KnownFoodDataSource } from '../models';

const knownDataSourceLabels = new Map<KnownFoodDataSource, string>([
  ['fatsecret', '외부 영양 데이터'],
  ['mock', '개발 데이터'],
]);

export function parseOptionalFoodDataSource(
  value: unknown,
): FoodDataSource | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0
    ? normalizedValue
    : undefined;
}

export function formatFoodDataSourceLabel(
  dataSource: FoodDataSource | undefined,
): string | null {
  const normalizedDataSource = parseOptionalFoodDataSource(dataSource);

  if (normalizedDataSource === undefined) {
    return null;
  }

  return knownDataSourceLabels.get(normalizedDataSource as KnownFoodDataSource)
    ?? '데이터 출처';
}