import type { Food } from '../models';

export function formatAmountLabel(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

export function hasValidServingSize(
  food: Food,
): food is Food & { servingSize: number; servingUnit: string } {
  return food.servingSize !== null
    && Number.isFinite(food.servingSize)
    && food.servingSize > 0
    && food.servingUnit !== null;
}

export function formatServingText(food: Food): string {
  if (!hasValidServingSize(food)) {
    return '제공량 정보 없음';
  }

  return `${formatAmountLabel(food.servingSize)} ${food.servingUnit}`;
}

export function parseNumberInput(input: string): number {
  const normalizedInput = input.trim().replace(',', '.');

  if (normalizedInput.length === 0) {
    return Number.NaN;
  }

  return Number(normalizedInput);
}

export function parseOptionalNumberInput(input: string): number | null {
  const normalizedInput = input.trim().replace(',', '.');

  if (normalizedInput.length === 0) {
    return null;
  }

  return Number(normalizedInput);
}

export function formatKcalValue(value: number): string {
  return `${Math.round(value)} kcal`;
}

export function formatGramValue(value: number): string {
  return `${value.toFixed(1)} g`;
}

export function formatBmiValue(value: number): string {
  return value.toFixed(1);
}

export function formatDateToLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getLocalDateString(): string {
  return formatDateToLocalDateString(new Date());
}

export function shiftLocalDateString(date: string, dayDelta: number): string {
  const [year, month, day] = date.split('-').map(Number);

  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
  ) {
    return getLocalDateString();
  }

  return formatDateToLocalDateString(new Date(year, month - 1, day + dayDelta));
}

export function formatDateLabel(date: string): string {
  const [year, month, day] = date.split('-');

  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
