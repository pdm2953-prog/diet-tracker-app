import type { MealType } from './models';

export const mealLabels: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export const GRAM_ADJUST_STEP = 10;
