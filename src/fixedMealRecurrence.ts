import type { FixedMealTemplate, FixedMealWeekday } from './models';
import { parseLocalDateString } from './utils/date';

export const fixedMealWeekdays = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const satisfies readonly FixedMealWeekday[];

export const allFixedMealWeekdays = [...fixedMealWeekdays] as FixedMealWeekday[];

export const fixedMealWeekdayLabels: Record<FixedMealWeekday, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

export const fixedMealWeekdayPresets = [
  { key: 'daily', label: '매일', weekdays: allFixedMealWeekdays },
  { key: 'weekday', label: '평일', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { key: 'weekend', label: '주말', weekdays: ['sat', 'sun'] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  weekdays: readonly FixedMealWeekday[];
}>;

const dayIndexToFixedMealWeekday: Record<number, FixedMealWeekday> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

export function normalizeFixedMealWeekdays(value: unknown): FixedMealWeekday[] {
  if (!Array.isArray(value)) {
    return [...allFixedMealWeekdays];
  }

  const selectedWeekdays = fixedMealWeekdays.filter((weekday) =>
    value.includes(weekday),
  );

  return selectedWeekdays.length > 0
    ? selectedWeekdays
    : [...allFixedMealWeekdays];
}

export function getFixedMealWeekdayForDate(date: string): FixedMealWeekday | null {
  const parts = parseLocalDateString(date);

  if (parts === null) {
    return null;
  }

  return dayIndexToFixedMealWeekday[
    new Date(parts.year, parts.month - 1, parts.day).getDay()
  ];
}

export function fixedMealTemplateAppliesOnDate(
  template: FixedMealTemplate,
  date: string,
): boolean {
  if (!template.isActive || template.schedule !== 'daily') {
    return false;
  }

  const weekday = getFixedMealWeekdayForDate(date);

  return weekday !== null
    && normalizeFixedMealWeekdays(template.weekdays).includes(weekday);
}

export function toggleFixedMealWeekdaySelection(
  weekdays: readonly FixedMealWeekday[],
  weekday: FixedMealWeekday,
): FixedMealWeekday[] {
  const normalizedWeekdays = normalizeFixedMealWeekdays(weekdays);

  if (!normalizedWeekdays.includes(weekday)) {
    return normalizeFixedMealWeekdays([...normalizedWeekdays, weekday]);
  }

  if (normalizedWeekdays.length === 1) {
    return normalizedWeekdays;
  }

  return normalizedWeekdays.filter((selectedWeekday) => selectedWeekday !== weekday);
}

export function formatFixedMealWeekdays(
  weekdays: readonly FixedMealWeekday[],
): string {
  const normalizedWeekdays = normalizeFixedMealWeekdays(weekdays);
  const normalizedKey = normalizedWeekdays.join(',');

  for (const preset of fixedMealWeekdayPresets) {
    if (preset.weekdays.join(',') === normalizedKey) {
      return preset.label;
    }
  }

  return normalizedWeekdays
    .map((weekday) => fixedMealWeekdayLabels[weekday])
    .join(' · ');
}
