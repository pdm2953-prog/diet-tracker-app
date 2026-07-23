import type { MealType } from './models';

export const colors = {
  background: '#f6f8f4',
  surface: '#ffffff',
  surfaceAlt: '#f0f5ee',
  surfaceMuted: '#f8faf6',
  border: '#dde7d8',
  borderStrong: '#c7d5c0',
  text: '#172016',
  textMuted: '#657160',
  textSoft: '#879183',
  primary: '#23624f',
  primaryPressed: '#1b4f40',
  primarySoft: '#e6f3ed',
  secondary: '#245f73',
  secondarySoft: '#e7f2f6',
  success: '#2f7d32',
  successSoft: '#e8f4e5',
  warning: '#9a5b00',
  warningBorder: '#efc05c',
  warningSoft: '#fff8e6',
  danger: '#9a2e00',
  dangerBorder: '#f2c2b4',
  dangerSoft: '#fff2ed',
  info: '#18485a',
  infoSoft: '#e9f3f7',
  overlay: 'rgba(23, 32, 22, 0.36)',
};

export const spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  card: 8,
  pill: 999,
};

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 15,
  lg: 16,
  xl: 20,
  xxl: 26,
  display: 30,
};

export const mealLabels: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export const GRAM_ADJUST_STEP = 10;
