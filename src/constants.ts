import type { MealType } from './models';

export const colors = {
  background: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f0f2f5',
  surfaceMuted: '#f7f8fa',
  border: '#e7eaf0',
  borderStrong: '#d1d5db',
  divider: '#eef0f3',
  text: '#111827',
  textMuted: '#6b7280',
  textSoft: '#9ca3af',
  primary: '#2563eb',
  primaryPressed: '#1d4ed8',
  primarySoft: '#dbeafe',
  secondary: '#334155',
  secondarySoft: '#eef2f7',
  success: '#16a34a',
  successSoft: '#eaf7ef',
  successBorder: '#bbf7d0',
  warning: '#9a6a15',
  warningBorder: '#f2d08a',
  warningSoft: '#fff7ed',
  danger: '#b42318',
  dangerBorder: '#fecdca',
  dangerSoft: '#fff1f0',
  scheduled: '#475569',
  scheduledSoft: '#f1f5f9',
  scheduledBorder: '#cbd5e1',
  info: '#2563eb',
  infoSoft: '#eff6ff',
  overlay: 'rgba(17, 24, 39, 0.36)',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radius = {
  small: 6,
  medium: 10,
  large: 16,
  pill: 999,
};

export const typography = {
  size: {
    xs: 11,
    sm: 12,
    md: 13,
    base: 15,
    lg: 16,
    xl: 20,
    xxl: 26,
    display: 30,
  },
  lineHeight: {
    xs: 15,
    sm: 17,
    md: 19,
    base: 21,
    lg: 23,
    xl: 27,
    xxl: 34,
    display: 38,
  },
};

export const fontSize = typography.size;

export const shadow = {
  hero: {
    shadowColor: '#111827',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  modal: {
    shadowColor: '#111827',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 4,
  },
};

export const mealLabels: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

export const GRAM_ADJUST_STEP = 10;
