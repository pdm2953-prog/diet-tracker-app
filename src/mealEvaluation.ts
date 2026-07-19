import type { DailySummary } from './models';
import { nutritionLabels } from './nutrition';
import type { DailyNutritionTargets, PrimaryNutritionField } from './nutrition';

export type MealEvaluationStatus = 'incomplete' | 'low' | 'high' | 'good' | 'excellent';

export type MealEvaluationWarningCode =
  | 'carbohydrateLow'
  | 'carbohydrateHigh'
  | 'fatLow'
  | 'fatHigh';

export type MealEvaluationWarning = {
  code: MealEvaluationWarningCode;
  message: string;
};

export type MealEvaluationResult = {
  status: MealEvaluationStatus;
  score: number;
  messages: string[];
  warnings: MealEvaluationWarning[];
};

export const mealEvaluationStatusLabels: Record<MealEvaluationStatus, string> = {
  incomplete: '평가 전',
  low: '부족',
  high: '초과',
  good: '좋음',
  excellent: '매우 좋음',
};

const mealEvaluationStatusScores: Record<MealEvaluationStatus, number> = {
  incomplete: 0,
  low: 40,
  high: 45,
  good: 80,
  excellent: 100,
};

const coreEvaluationNutritionFields = [
  'caloriesKcal',
  'proteinG',
] as const satisfies readonly PrimaryNutritionField[];

const WARNING_MIN_RATIO = 0.8;
const WARNING_MAX_RATIO = 1.2;

export function evaluateDailyMeal(
  summary: DailySummary,
  targets: DailyNutritionTargets,
): MealEvaluationResult {
  if (summary.checkedCount === 0) {
    return buildEvaluationResult('incomplete', [
      '체크된 음식이 없어 평가가 아직 불완전합니다.',
    ], []);
  }

  const warnings = createMacroWarnings(summary, targets);

  if (hasMissingCoreEvaluationNutrition(summary)) {
    return buildEvaluationResult('incomplete', [
      '핵심 영양정보가 부족해 정확한 평가가 어렵습니다.',
    ], warnings);
  }

  const caloriesKcal = getFiniteNumber(summary.checkedNutritionTotal.caloriesKcal);
  const proteinG = getFiniteNumber(summary.checkedNutritionTotal.proteinG);
  const calorieTarget = getPositiveTarget(targets.caloriesKcal);
  const proteinTarget = getPositiveTarget(targets.proteinG);

  if (
    caloriesKcal === null
    || proteinG === null
    || calorieTarget === null
    || proteinTarget === null
  ) {
    return buildEvaluationResult('incomplete', [
      '평가에 필요한 칼로리 또는 단백질 정보가 부족합니다.',
    ], warnings);
  }

  const calorieRatio = caloriesKcal / calorieTarget;
  const proteinRatio = proteinG / proteinTarget;

  if (calorieRatio >= 0.95 && calorieRatio <= 1.05 && proteinRatio >= 1) {
    return buildEvaluationResult('excellent', [
      '칼로리가 목표의 95~105%이고 단백질이 목표 이상입니다.',
    ], warnings);
  }

  if (calorieRatio >= 0.9 && calorieRatio <= 1.1 && proteinRatio >= 0.9) {
    return buildEvaluationResult('good', [
      '칼로리가 목표의 90~110%이고 단백질이 목표의 90% 이상입니다.',
    ], warnings);
  }

  if (calorieRatio > 1.1) {
    return buildEvaluationResult('high', [
      '칼로리가 목표의 110%를 초과했습니다.',
    ], warnings);
  }

  if (calorieRatio < 0.9 || proteinRatio < 0.9) {
    return buildEvaluationResult('low', [createLowMessage(calorieRatio, proteinRatio)], warnings);
  }

  return buildEvaluationResult('good', [
    '칼로리와 단백질이 목표 범위에 대체로 가깝습니다.',
  ], warnings);
}

function hasMissingCoreEvaluationNutrition(summary: DailySummary): boolean {
  return coreEvaluationNutritionFields.some((field) =>
    summary.missingNutritionFields.includes(field),
  );
}

function buildEvaluationResult(
  status: MealEvaluationStatus,
  messages: string[],
  warnings: MealEvaluationWarning[],
): MealEvaluationResult {
  return {
    status,
    score: mealEvaluationStatusScores[status],
    messages: [...messages, ...warnings.map((warning) => warning.message)],
    warnings,
  };
}

function createLowMessage(calorieRatio: number, proteinRatio: number): string {
  if (calorieRatio < 0.9 && proteinRatio < 0.8) {
    return '칼로리가 목표의 90% 미만이고 단백질이 목표의 80% 미만입니다.';
  }

  if (calorieRatio < 0.9) {
    return '칼로리가 목표의 90% 미만입니다.';
  }

  if (proteinRatio < 0.8) {
    return '단백질이 목표의 80% 미만입니다.';
  }

  return '단백질이 목표 범위보다 부족합니다.';
}

function createMacroWarnings(
  summary: DailySummary,
  targets: DailyNutritionTargets,
): MealEvaluationWarning[] {
  return [
    ...createRangeWarning('carbohydrateG', summary, targets),
    ...createRangeWarning('fatG', summary, targets),
  ];
}

function createRangeWarning(
  field: 'carbohydrateG' | 'fatG',
  summary: DailySummary,
  targets: DailyNutritionTargets,
): MealEvaluationWarning[] {
  const value = getFiniteNumber(summary.checkedNutritionTotal[field]);
  const target = getPositiveTarget(targets[field]);

  if (value === null || target === null) {
    return [];
  }

  const ratio = value / target;

  if (ratio < WARNING_MIN_RATIO) {
    return [{
      code: `${getWarningFieldPrefix(field)}Low`,
      message: `${nutritionLabels[field]}이 목표의 80% 미만입니다.`,
    }];
  }

  if (ratio > WARNING_MAX_RATIO) {
    return [{
      code: `${getWarningFieldPrefix(field)}High`,
      message: `${nutritionLabels[field]}이 목표의 120%를 초과했습니다.`,
    }];
  }

  return [];
}

function getWarningFieldPrefix(field: 'carbohydrateG' | 'fatG'): 'carbohydrate' | 'fat' {
  return field === 'carbohydrateG' ? 'carbohydrate' : 'fat';
}

function getPositiveTarget(value: DailyNutritionTargets[PrimaryNutritionField]): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getFiniteNumber(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
