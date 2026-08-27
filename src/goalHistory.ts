import { dailyTargets } from './nutrition';
import type { DailyNutritionTargets } from './nutrition';
import type { NutritionGoalType } from './nutritionGoals';
import { compareLocalDateStrings } from './utils/date';

export type NutritionGoalHistoryEntry = {
  effectiveDate: string;
  goalType: NutritionGoalType;
  targets: DailyNutritionTargets;
};

export const GOAL_HISTORY_BASELINE_DATE = '1900-01-01';

export function createNutritionGoalHistoryEntry(
  effectiveDate: string,
  goalType: NutritionGoalType,
  targets: DailyNutritionTargets,
): NutritionGoalHistoryEntry {
  return {
    effectiveDate,
    goalType,
    targets: cloneDailyNutritionTargets(targets),
  };
}

export function createBaselineNutritionGoalHistory(
  targets: DailyNutritionTargets,
  goalType: NutritionGoalType,
): NutritionGoalHistoryEntry[] {
  return [
    createNutritionGoalHistoryEntry(GOAL_HISTORY_BASELINE_DATE, goalType, targets),
  ];
}

export function normalizeNutritionGoalHistory(
  goalHistory: readonly NutritionGoalHistoryEntry[],
): NutritionGoalHistoryEntry[] {
  const entriesByDate = new Map<string, NutritionGoalHistoryEntry>();

  for (const entry of goalHistory) {
    entriesByDate.set(
      entry.effectiveDate,
      createNutritionGoalHistoryEntry(entry.effectiveDate, entry.goalType, entry.targets),
    );
  }

  const normalizedEntries = [...entriesByDate.values()].sort((firstEntry, secondEntry) =>
    compareLocalDateStrings(firstEntry.effectiveDate, secondEntry.effectiveDate),
  );

  return normalizedEntries.length > 0
    ? normalizedEntries
    : createBaselineNutritionGoalHistory(dailyTargets, 'maintain');
}

export function upsertNutritionGoalHistoryEntry(
  goalHistory: readonly NutritionGoalHistoryEntry[],
  entry: NutritionGoalHistoryEntry,
): NutritionGoalHistoryEntry[] {
  return normalizeNutritionGoalHistory([...goalHistory, entry]);
}

export function resolveNutritionGoalForDate(
  goalHistory: readonly NutritionGoalHistoryEntry[],
  date: string,
): NutritionGoalHistoryEntry {
  const normalizedGoalHistory = normalizeNutritionGoalHistory(goalHistory);
  let resolvedEntry = normalizedGoalHistory[0];

  for (const entry of normalizedGoalHistory) {
    if (compareLocalDateStrings(entry.effectiveDate, date) > 0) {
      break;
    }

    resolvedEntry = entry;
  }

  return createNutritionGoalHistoryEntry(
    resolvedEntry.effectiveDate,
    resolvedEntry.goalType,
    resolvedEntry.targets,
  );
}

function cloneDailyNutritionTargets(targets: DailyNutritionTargets): DailyNutritionTargets {
  return {
    caloriesKcal: targets.caloriesKcal,
    proteinG: targets.proteinG,
    carbohydrateG: targets.carbohydrateG,
    fatG: targets.fatG,
  };
}
