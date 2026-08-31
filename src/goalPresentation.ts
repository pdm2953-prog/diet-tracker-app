import type { DailyNutritionTargets } from './nutrition';
import { nutritionLabels } from './nutrition';
import {
  GOAL_HISTORY_BASELINE_DATE,
  createNutritionGoalHistoryEntry,
  normalizeNutritionGoalHistory,
} from './goalHistory';
import type { NutritionGoalHistoryEntry } from './goalHistory';
import { formatCompactNutritionWithUnit } from './todayPresentation';
import {
  nutritionGoalLabels,
} from './nutritionGoals';
import type { NutritionGoalType } from './nutritionGoals';
import { compareLocalDateStrings, isValidLocalDateString } from './utils/date';
import { formatDateLabel } from './utils/format';

export const DEFAULT_NUTRITION_GOAL_TYPE: NutritionGoalType = 'maintain';

export type SettingsGoalEntryModel = {
  currentGoalLabel: string;
  dailyCalorieGoalLabel: string;
  resetLabel: string;
  title: string;
};

const goalHistoryNutritionFields = [
  'caloriesKcal',
  'proteinG',
  'carbohydrateG',
  'fatG',
] as const;

export type GoalHistoryNutritionMetricModel = {
  field: typeof goalHistoryNutritionFields[number];
  label: string;
  valueLabel: string;
};

export type GoalHistoryItemModel = {
  dateLabel: string;
  effectiveDate: string;
  goalTypeLabel: string;
  isCurrent: boolean;
  nutritionMetrics: GoalHistoryNutritionMetricModel[];
};

export type GoalHistoryListModel = {
  items: GoalHistoryItemModel[];
};

export function createSettingsGoalEntryModel(
  targets: DailyNutritionTargets,
  goalType: NutritionGoalType,
): SettingsGoalEntryModel {
  return {
    currentGoalLabel: nutritionGoalLabels[goalType],
    dailyCalorieGoalLabel: formatCompactNutritionWithUnit('caloriesKcal', targets.caloriesKcal),
    resetLabel: '목표 재설정',
    title: '목표 및 영양',
  };
}

export function createGoalHistoryListModel(
  goalHistory: unknown,
  todayDate: string,
): GoalHistoryListModel {
  if (!Array.isArray(goalHistory)) {
    return { items: [] };
  }

  const validEntries = goalHistory.flatMap((value) => {
    const entry = parseGoalHistoryEntry(value);

    return entry === null ? [] : [entry];
  });

  if (validEntries.length === 0) {
    return { items: [] };
  }

  const visibleEntries = normalizeNutritionGoalHistory(validEntries).filter(
    (entry) => entry.effectiveDate !== GOAL_HISTORY_BASELINE_DATE,
  );
  const hasValidTodayDate = isValidLocalDateString(todayDate);
  let currentEffectiveDate: string | null = null;

  if (hasValidTodayDate) {
    for (const entry of visibleEntries) {
      if (compareLocalDateStrings(entry.effectiveDate, todayDate) > 0) {
        break;
      }

      currentEffectiveDate = entry.effectiveDate;
    }
  }

  return {
    items: [...visibleEntries].reverse().map((entry) => ({
      dateLabel: formatDateLabel(entry.effectiveDate),
      effectiveDate: entry.effectiveDate,
      goalTypeLabel: nutritionGoalLabels[entry.goalType],
      isCurrent: entry.effectiveDate === currentEffectiveDate,
      nutritionMetrics: goalHistoryNutritionFields.map((field) => ({
        field,
        label: nutritionLabels[field],
        valueLabel: formatCompactNutritionWithUnit(field, entry.targets[field]),
      })),
    })),
  };
}

export function isNutritionGoalType(value: unknown): value is NutritionGoalType {
  return value === 'diet' || value === 'maintain' || value === 'bulk';
}

function parseGoalHistoryEntry(value: unknown): NutritionGoalHistoryEntry | null {
  if (!isRecord(value) || !isRecord(value.targets)) {
    return null;
  }

  const { effectiveDate, goalType, targets } = value;

  if (
    typeof effectiveDate !== 'string'
    || !isValidLocalDateString(effectiveDate)
    || !isNutritionGoalType(goalType)
    || !isValidNutritionTarget(targets.caloriesKcal)
    || !isValidNutritionTarget(targets.proteinG)
    || !isValidNutritionTarget(targets.carbohydrateG)
    || !isValidNutritionTarget(targets.fatG)
  ) {
    return null;
  }

  return createNutritionGoalHistoryEntry(effectiveDate, goalType, {
    caloriesKcal: targets.caloriesKcal,
    proteinG: targets.proteinG,
    carbohydrateG: targets.carbohydrateG,
    fatG: targets.fatG,
  });
}

function isValidNutritionTarget(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
