export type ScreenKey = 'today' | 'calendar' | 'target' | 'settings';
export type BottomTabKey = Exclude<ScreenKey, 'target'>;

export type BottomTabDescriptor = {
  icon: string;
  key: BottomTabKey;
  label: string;
};

export const appScreenKeys = [
  'today',
  'calendar',
  'target',
  'settings',
] as const satisfies readonly ScreenKey[];

export const bottomTabs = [
  { icon: '⌂', key: 'today', label: 'Today' },
  { icon: '▦', key: 'calendar', label: 'Calendar' },
  { icon: '⚙', key: 'settings', label: 'Settings' },
] as const satisfies readonly BottomTabDescriptor[];

export function getGoalSetupScreenKey(): ScreenKey {
  return 'target';
}

export function getFixedMealManagementScreenKey(): ScreenKey {
  return 'settings';
}

export function isBottomTabKey(screenKey: ScreenKey): screenKey is BottomTabKey {
  return screenKey !== 'target';
}
