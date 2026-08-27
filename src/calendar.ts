import type {
  DailySummary,
  FixedMealTemplate,
  HiddenFixedMealSourceKeysByDate,
  Meal,
  MealFood,
  MealsByDate,
  MealType,
} from './models';
import type { DailyNutritionTargets } from './nutrition';
import { buildDailySummary } from './nutrition';
import { resolveNutritionGoalForDate } from './goalHistory';
import type { NutritionGoalHistoryEntry } from './goalHistory';
import { evaluateDailyMeal } from './mealEvaluation';
import type { MealEvaluationResult } from './mealEvaluation';
import { getMealsForDate } from './meals';
import {
  applyFixedMealTemplatesToMeals,
  getHiddenFixedMealSourceKeysForDate,
  isFixedMealFood,
} from './fixedMeals';
import { shouldEvaluateMealDate } from './mealDatePolicy';

export type CalendarDayStatus =
  | 'scheduled'
  | 'noRecord'
  | 'incomplete'
  | 'excellent'
  | 'good'
  | 'low'
  | 'high';

export type MealFoodsByType = Record<MealType, MealFood[]>;

export type CalendarDayDetails = {
  date: string;
  directMealFoodsByType: MealFoodsByType;
  evaluation: MealEvaluationResult | null;
  fixedMealFoodsByType: MealFoodsByType;
  meals: Meal[];
  status: CalendarDayStatus;
  summary: DailySummary;
  targets: DailyNutritionTargets;
};

export type BuildCalendarDayDetailsOptions = {
  date: string;
  fixedMealTemplates: FixedMealTemplate[];
  goalHistory: NutritionGoalHistoryEntry[];
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate;
  mealsByDate: MealsByDate;
  todayDate: string;
};

export const calendarDayStatusLabels: Record<CalendarDayStatus, string> = {
  scheduled: '예정',
  noRecord: '기록 없음',
  incomplete: '평가 전',
  excellent: '매우 좋음',
  good: '좋음',
  low: '부족',
  high: '초과',
};

export const calendarDayStatusShortLabels: Record<CalendarDayStatus, string> = {
  scheduled: '예정',
  noRecord: '없음',
  incomplete: '평가전',
  excellent: '최고',
  good: '좋음',
  low: '부족',
  high: '초과',
};

export const calendarDayStatusMessages: Record<CalendarDayStatus, string> = {
  scheduled: '고정 식단 또는 예정된 식단이 있어 아직 섭취 평가는 하지 않습니다.',
  noRecord: '식단 기록이 없습니다.',
  incomplete: '음식은 있지만 체크된 음식 또는 핵심 영양정보가 부족합니다.',
  excellent: '목표에 매우 가깝게 섭취했습니다.',
  good: '목표 범위에 대체로 맞습니다.',
  low: '목표 대비 섭취량이 부족합니다.',
  high: '목표 대비 섭취량이 높습니다.',
};

export type CalendarDayStatusBadgeTone =
  | 'danger'
  | 'empty'
  | 'positive'
  | 'scheduled'
  | 'warning';

export function getCalendarDayStatusBadgeTone(
  status: CalendarDayStatus,
): CalendarDayStatusBadgeTone {
  if (status === 'excellent' || status === 'good') {
    return 'positive';
  }

  if (status === 'low' || status === 'high') {
    return 'warning';
  }

  if (status === 'scheduled') {
    return 'scheduled';
  }

  if (status === 'noRecord') {
    return 'empty';
  }

  return 'danger';
}

export function buildCalendarDayDetails({
  date,
  fixedMealTemplates,
  goalHistory,
  hiddenFixedMealSourceKeys,
  mealsByDate,
  todayDate,
}: BuildCalendarDayDetailsOptions): CalendarDayDetails {
  const timestamp = `${date}T00:00:00.000`;
  const targets = resolveNutritionGoalForDate(goalHistory, date).targets;
  const meals = applyFixedMealTemplatesToMeals({
    date,
    fixedMealTemplates,
    hiddenSourceKeys: getHiddenFixedMealSourceKeysForDate(
      hiddenFixedMealSourceKeys,
      date,
    ),
    meals: getMealsForDate(mealsByDate, date),
    timestamp,
  });
  const summary = buildDailySummary(date, meals);
  const fixedMealFoodsByType = groupMealFoodsByType(meals, isFixedMealFood);
  const directMealFoodsByType = groupMealFoodsByType(
    meals,
    (mealFood) => !isFixedMealFood(mealFood),
  );
  const allFixedMealFoodCount = countGroupedMealFoods(fixedMealFoodsByType);
  const allDirectMealFoodCount = countGroupedMealFoods(directMealFoodsByType);
  const shouldEvaluate = shouldEvaluateMealDate(date, todayDate);
  const hasAnyFoods = summary.totalCount > 0;

  if (!shouldEvaluate) {
    return {
      date,
      directMealFoodsByType,
      evaluation: null,
      fixedMealFoodsByType,
      meals,
      status: hasAnyFoods ? 'scheduled' : 'noRecord',
      summary,
      targets,
    };
  }

  if (!hasAnyFoods) {
    return {
      date,
      directMealFoodsByType,
      evaluation: null,
      fixedMealFoodsByType,
      meals,
      status: 'noRecord',
      summary,
      targets,
    };
  }

  if (
    allFixedMealFoodCount > 0
    && allDirectMealFoodCount === 0
    && summary.checkedCount === 0
  ) {
    return {
      date,
      directMealFoodsByType,
      evaluation: null,
      fixedMealFoodsByType,
      meals,
      status: 'scheduled',
      summary,
      targets,
    };
  }

  const evaluation = evaluateDailyMeal(summary, targets);

  return {
    date,
    directMealFoodsByType,
    evaluation,
    fixedMealFoodsByType,
    meals,
    status: evaluation.status,
    summary,
    targets,
  };
}

export function buildCalendarStatusByDate(
  dates: string[],
  options: Omit<BuildCalendarDayDetailsOptions, 'date'>,
): Record<string, CalendarDayStatus> {
  return Object.fromEntries(
    dates.map((date) => [
      date,
      buildCalendarDayDetails({ ...options, date }).status,
    ]),
  );
}

export function getCalendarDayStatusMessage(
  details: CalendarDayDetails,
): string {
  return details.evaluation?.messages[0] ?? calendarDayStatusMessages[details.status];
}

export function countGroupedMealFoods(mealFoodsByType: MealFoodsByType): number {
  return Object.values(mealFoodsByType).reduce(
    (totalCount, mealFoods) => totalCount + mealFoods.length,
    0,
  );
}

function groupMealFoodsByType(
  meals: Meal[],
  includeMealFood: (mealFood: MealFood) => boolean,
): MealFoodsByType {
  return {
    breakfast: meals.find((meal) => meal.type === 'breakfast')?.foods.filter(includeMealFood) ?? [],
    lunch: meals.find((meal) => meal.type === 'lunch')?.foods.filter(includeMealFood) ?? [],
    dinner: meals.find((meal) => meal.type === 'dinner')?.foods.filter(includeMealFood) ?? [],
  };
}
