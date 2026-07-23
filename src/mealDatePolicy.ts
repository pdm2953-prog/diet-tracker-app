import { isFutureLocalDate } from './utils/date';

export type MealDateEvaluationMode = 'evaluate' | 'scheduled';

export function getMealDateEvaluationMode(
  date: string,
  todayDate: string,
): MealDateEvaluationMode {
  return isFutureLocalDate(date, todayDate) ? 'scheduled' : 'evaluate';
}

export function shouldEvaluateMealDate(
  date: string,
  todayDate: string,
): boolean {
  return getMealDateEvaluationMode(date, todayDate) === 'evaluate';
}
