import {
  createNutritionGoalHistoryEntry,
  upsertNutritionGoalHistoryEntry,
} from './goalHistory';
import type { NutritionGoalHistoryEntry } from './goalHistory';
import type { DailyNutritionTargets } from './nutrition';
import type { NutritionGoalType } from './nutritionGoals';

export type NutritionGoalSaveState = {
  goalHistory: NutritionGoalHistoryEntry[];
  hasCompletedGoalSetup: boolean;
};

type SaveNutritionGoalOptions = NutritionGoalSaveState & {
  effectiveDate: string;
  goalType: NutritionGoalType;
  targets: DailyNutritionTargets;
};

export function saveNutritionGoal({
  effectiveDate,
  goalHistory,
  goalType,
  hasCompletedGoalSetup,
  targets,
}: SaveNutritionGoalOptions): NutritionGoalSaveState {
  const entry = createNutritionGoalHistoryEntry(effectiveDate, goalType, targets);

  return {
    goalHistory: hasCompletedGoalSetup
      ? upsertNutritionGoalHistoryEntry(goalHistory, entry)
      : [entry],
    hasCompletedGoalSetup: true,
  };
}
