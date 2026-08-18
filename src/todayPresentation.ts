import type { DailySummary, MealSummary, NutritionField } from './models';
import {
  nutritionLabels,
  nutritionUnits,
} from './nutrition';
import type { DailyNutritionTargets, PrimaryNutritionField } from './nutrition';
import { isPrimaryNutritionField } from './utils/nutritionUi';

export const summaryMacroFields = [
  'proteinG',
  'carbohydrateG',
  'fatG',
] as const satisfies readonly PrimaryNutritionField[];

export type CalorieHeroModel = {
  consumedLabel: string;
  contextLabel: string;
  progressLabel: string;
  progressRatio: number;
  progressWidth: `${number}%`;
  remainingLabel: string;
  targetLabel: string;
};

export type MacroMetricModel = {
  field: PrimaryNutritionField;
  isMissing: boolean;
  label: string;
  progressRatio: number;
  progressWidth: `${number}%`;
  valueLabel: string;
};

export type MealSectionModel = {
  calorieLabel: string;
  completionLabel: string;
  hasMissingNutrition: boolean;
};

export function createCalorieHeroModel(
  summary: DailySummary,
  targets: DailyNutritionTargets,
): CalorieHeroModel {
  const consumedCalories = summary.checkedNutritionTotal.caloriesKcal;
  const calorieTarget = targets.caloriesKcal;
  const progressRatio = getProgressRatio(consumedCalories, calorieTarget);
  const remainingCalories = getRemainingNutritionValue(consumedCalories, calorieTarget);
  const consumedLabel = formatCompactNutritionNumber('caloriesKcal', consumedCalories);
  const targetLabel = formatCompactNutritionNumber('caloriesKcal', calorieTarget);

  return {
    consumedLabel,
    contextLabel: `${consumedLabel} 먹음 · 목표 ${targetLabel}`,
    progressLabel: getProgressPercentLabel(consumedCalories, calorieTarget),
    progressRatio,
    progressWidth: toProgressWidth(progressRatio),
    remainingLabel: formatCompactNutritionNumber('caloriesKcal', remainingCalories),
    targetLabel,
  };
}

export function createMacroMetricModels(
  summary: DailySummary,
  targets: DailyNutritionTargets,
): MacroMetricModel[] {
  return summaryMacroFields.map((field) => {
    const value = summary.checkedNutritionTotal[field];
    const target = targets[field];
    const progressRatio = getProgressRatio(value, target);

    return {
      field,
      isMissing: summary.missingNutritionFields.includes(field),
      label: nutritionLabels[field],
      progressRatio,
      progressWidth: toProgressWidth(progressRatio),
      valueLabel: `${formatCompactNutritionNumber(field, value)} / ${formatCompactNutritionNumber(field, target)}${nutritionUnits[field]}`,
    };
  });
}

export function createMealSectionModel(
  mealFoodCount: number,
  summary: MealSummary | null | undefined,
): MealSectionModel {
  const checkedCount = summary?.checkedCount ?? 0;
  const totalCount = summary?.totalCount ?? mealFoodCount;
  const calories = summary?.checkedNutritionTotal.caloriesKcal ?? null;

  return {
    calorieLabel: formatCompactNutritionWithUnit('caloriesKcal', calories),
    completionLabel: `${checkedCount} / ${totalCount} 완료`,
    hasMissingNutrition: summary?.missingNutritionFields.some((field) =>
      isPrimaryNutritionField(field),
    ) ?? false,
  };
}

export function getMissingPrimaryNutritionLabel(
  missingFields: NutritionField[],
): string | null {
  const missingFieldNames = missingFields
    .filter(isPrimaryNutritionField)
    .map((field) => nutritionLabels[field]);

  return missingFieldNames.length > 0
    ? `${missingFieldNames.join(', ')} 값이 없는 음식은 합산에서 제외`
    : null;
}

export function getProgressRatio(
  value: number | null,
  target: number | null,
): number {
  if (value === null || target === null || !Number.isFinite(target) || target <= 0) {
    return 0;
  }

  return Math.min(value / target, 1);
}

export function getProgressPercentLabel(
  value: number | null,
  target: number | null,
): string {
  if (value === null || target === null || !Number.isFinite(target) || target <= 0) {
    return '0%';
  }

  return `${Math.round((value / target) * 100)}%`;
}

export function getRemainingNutritionValue(
  value: number | null,
  target: number | null,
): number | null {
  if (value === null || target === null || !Number.isFinite(target)) {
    return null;
  }

  return Math.max(target - value, 0);
}

export function formatCompactNutritionWithUnit(
  field: PrimaryNutritionField,
  value: number | null,
): string {
  const numberLabel = formatCompactNutritionNumber(field, value);

  return numberLabel === '정보 없음'
    ? numberLabel
    : `${numberLabel} ${nutritionUnits[field]}`;
}

export function formatCompactNutritionNumber(
  field: PrimaryNutritionField,
  value: number | null,
): string {
  if (value === null) {
    return '정보 없음';
  }

  if (field === 'caloriesKcal') {
    return Math.round(value).toLocaleString('ko-KR');
  }

  const roundedValue = Math.round(value * 10) / 10;

  return Number.isInteger(roundedValue)
    ? String(roundedValue)
    : roundedValue.toFixed(1);
}

function toProgressWidth(progressRatio: number): `${number}%` {
  return `${Math.round(progressRatio * 100)}%` as `${number}%`;
}
