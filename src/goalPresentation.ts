import type { DailyNutritionTargets } from './nutrition';
import { formatCompactNutritionWithUnit } from './todayPresentation';
import {
  nutritionGoalLabels,
} from './nutritionGoals';
import type { NutritionGoalType } from './nutritionGoals';

export const DEFAULT_NUTRITION_GOAL_TYPE: NutritionGoalType = 'maintain';

export type SettingsGoalEntryModel = {
  currentGoalLabel: string;
  dailyCalorieGoalLabel: string;
  resetLabel: string;
  title: string;
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

export function isNutritionGoalType(value: unknown): value is NutritionGoalType {
  return value === 'diet' || value === 'maintain' || value === 'bulk';
}
