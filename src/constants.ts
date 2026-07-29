import type { MealType } from './models';

export const colors = {
  background: '#f7f8f2',
  surface: '#ffffff',
  surfaceAlt: '#eef3ea',
  surfaceMuted: '#fafbf7',
  border: '#dfe7d9',
  borderStrong: '#c5d1bd',
  divider: '#e8eee3',
  text: '#172116',
  textMuted: '#65705f',
  textSoft: '#8b9585',
  primary: '#1f5c49',
  primaryPressed: '#164636',
  primarySoft: '#e6f2ec',
  secondary: '#235a68',
  secondarySoft: '#e7f1f3',
  success: '#2f7a3d',
  successSoft: '#e8f4e8',
  successBorder: '#b9d9bd',
  warning: '#8a5a08',
  warningBorder: '#e6c46b',
  warningSoft: '#fff8e8',
  danger: '#9a321d',
  dangerBorder: '#efc2b6',
  dangerSoft: '#fff1ed',
  scheduled: '#2d6471',
  scheduledSoft: '#e6f1f3',
  scheduledBorder: '#bad3d8',
  info: '#18485a',
  infoSoft: '#e9f3f7',
  overlay: 'rgba(23, 33, 22, 0.36)',
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
    shadowColor: '#1b2819',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  modal: {
    shadowColor: '#1b2819',
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
