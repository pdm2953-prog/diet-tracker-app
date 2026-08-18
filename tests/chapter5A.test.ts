import assert from 'node:assert/strict';
import { test } from 'node:test';

declare const process: { cwd(): string };
declare function require(moduleName: 'node:fs'): {
  readFileSync(path: string, encoding: string): string;
};

const { readFileSync } = require('node:fs');
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(`${repoRoot}\\${relativePath}`, 'utf8');
}

test('Chapter 5-A Today opens scoped fixed meal manager modal instead of Settings navigation', () => {
  const todaySource = readSource('src/screens/TodayScreen.tsx');
  const appSource = readSource('App.tsx');

  assert.equal(/<FixedMealManagerModal/.test(todaySource), true);
  assert.equal(/onOpenFixedMealManagement=\{openFixedMealManagement\}/.test(todaySource), true);
  assert.equal(/setFixedMealManagerMealType\(mealType\)/.test(todaySource), true);
  assert.equal(/getFixedMealManagementScreenKey/.test(todaySource), false);
  assert.equal(/getFixedMealManagementScreenKey/.test(appSource), false);
});

test('Chapter 5-A fixed meal add flow reuses existing food search and portion modal', () => {
  const todaySource = readSource('src/screens/TodayScreen.tsx');

  assert.equal(/FoodSearchPanel/.test(todaySource), true);
  assert.equal(/FoodPortionModal/.test(todaySource), true);
  assert.equal(/openFixedMealSearch/.test(todaySource), true);
  assert.equal(/onCreateFixedMealTemplateFromFood/.test(todaySource), true);
  assert.equal(/고정 식단 저장/.test(todaySource), true);
});

test('Chapter 5-A manager modal exposes weekday presets, weekday chips, active toggle, add, and delete', () => {
  const modalSource = readSource('src/components/FixedMealManagerModal.tsx');

  assert.equal(/fixedMealWeekdayPresets/.test(modalSource), true);
  assert.equal(/fixedMealWeekdays\.map/.test(modalSource), true);
  assert.equal(/onSetTemplateActive/.test(modalSource), true);
  assert.equal(/onSetTemplateWeekdays/.test(modalSource), true);
  assert.equal(/onToggleTemplateWeekday/.test(modalSource), true);
  assert.equal(/onRemoveTemplate/.test(modalSource), true);
  assert.equal(/fixed-meal-add-\$\{mealType\}/.test(modalSource), true);
});

test('Chapter 5-A Settings no longer renders the fixed meal management home', () => {
  const settingsSource = readSource('src/screens/SettingsScreen.tsx');

  assert.equal(/fixedMealTemplates/.test(settingsSource), false);
  assert.equal(/FixedMealSlotGroup/.test(settingsSource), false);
  assert.equal(/FixedMealTemplateRow/.test(settingsSource), false);
  assert.equal(/fixedMealManagementLabel/.test(settingsSource), false);
  assert.equal(/settings-goal-entry/.test(settingsSource), true);
  assert.equal(/목표 재설정/.test(settingsSource), true);
});


