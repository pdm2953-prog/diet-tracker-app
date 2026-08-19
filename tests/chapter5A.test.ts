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

test('Chapter 5-A fixed meal add flow uses search, portion, schedule setup, then saves', () => {
  const todaySource = readSource('src/screens/TodayScreen.tsx');
  const appSource = readSource('App.tsx');

  assert.equal(/FoodSearchPanel/.test(todaySource), true);
  assert.equal(/FoodPortionModal/.test(todaySource), true);
  assert.equal(/FixedMealScheduleSetupModal/.test(todaySource), true);
  assert.equal(/openFixedMealSearch/.test(todaySource), true);
  assert.equal(/setFixedMealScheduleSetup\(\{/.test(todaySource), true);
  assert.equal(/const confirmFixedMealScheduleSetup/.test(todaySource), true);
  assert.equal(/onCreateFixedMealTemplateFromFood\(mealType, food, consumedGrams, weekdays\)/.test(todaySource), true);
  assert.equal(/onCreateFixedMealTemplateFromFood\(mealType, portionModal\.food, consumedGrams\)/.test(todaySource), false);
  assert.equal(/createPromotedFixedMealTemplateIds\([\s\S]*mealType,[\s\S]*mealFood,[\s\S]*weekdays/.test(appSource), true);
});

test('Chapter 5-A add schedule cancel returns to manager without saving a partial template', () => {
  const todaySource = readSource('src/screens/TodayScreen.tsx');
  const cancelStart = todaySource.indexOf('const cancelFixedMealScheduleSetup');
  const changeStart = todaySource.indexOf('const changeFixedMealScheduleWeekdays');
  const cancelSource = todaySource.slice(cancelStart, changeStart);

  assert.equal(cancelStart !== -1, true);
  assert.equal(changeStart !== -1, true);
  assert.equal(/setFixedMealScheduleSetup\(null\)/.test(cancelSource), true);
  assert.equal(/setFixedMealManagerMealType\(mealType\)/.test(cancelSource), true);
  assert.equal(/onCreateFixedMealTemplateFromFood/.test(cancelSource), false);
});

test('Chapter 5-A manager default row is compact and opens weekday editor only for the edited item', () => {
  const modalSource = readSource('src/components/FixedMealManagerModal.tsx');

  assert.equal(/formatFixedMealWeekdays/.test(modalSource), true);
  assert.equal(/fixedMealManagerActionRow/.test(modalSource), true);
  assert.equal(/label="수정"/.test(modalSource), true);
  assert.equal(/label="삭제"/.test(modalSource), true);
  assert.equal(/\{isEditing \? \(/.test(modalSource), true);
  assert.equal(/fixed-meal-editor-\$\{template\.id\}/.test(modalSource), true);
  assert.equal(/editingTemplateId === template\.id/.test(modalSource), true);
  assert.equal(modalSource.indexOf('<FixedMealWeekdaySelector') > modalSource.indexOf('{isEditing ?'), true);
});

test('Chapter 5-A manager edit save updates weekdays on the same template and cancel keeps the original state', () => {
  const modalSource = readSource('src/components/FixedMealManagerModal.tsx');
  const saveStart = modalSource.indexOf('const saveTemplateEdit');
  const requestDeleteStart = modalSource.indexOf('const requestTemplateDelete');
  const saveSource = modalSource.slice(saveStart, requestDeleteStart);
  const cancelStart = modalSource.indexOf('const closeTemplateEdit');
  const closeModalStart = modalSource.indexOf('const closeModal');
  const cancelSource = modalSource.slice(cancelStart, closeModalStart);

  assert.equal(saveStart !== -1, true);
  assert.equal(requestDeleteStart !== -1, true);
  assert.equal(/onSetTemplateWeekdays\(editingTemplateId, editingWeekdays\)/.test(saveSource), true);
  assert.equal(/setEditingTemplateId\(null\)/.test(cancelSource), true);
  assert.equal(/setEditingWeekdays\(\[\]\)/.test(cancelSource), true);
  assert.equal(/onSetTemplateWeekdays/.test(cancelSource), false);
});

test('Chapter 5-A weekday selector keeps minimum one day validation in add and edit flows', () => {
  const selectorSource = readSource('src/components/FixedMealWeekdaySelector.tsx');
  const scheduleSource = readSource('src/components/FixedMealScheduleSetupModal.tsx');

  assert.equal(/fixedMealWeekdayPresets\.map/.test(selectorSource), true);
  assert.equal(/fixedMealWeekdays\.map/.test(selectorSource), true);
  assert.equal(/selected && normalizedWeekdays\.length === 1/.test(selectorSource), true);
  assert.equal(/disabled=\{disabled\}/.test(selectorSource), true);
  assert.equal(/disabled=\{state\.weekdays\.length === 0\}/.test(scheduleSource), true);
});

test('Chapter 5-A active toggle and delete confirmation remain available from compact manager rows', () => {
  const modalSource = readSource('src/components/FixedMealManagerModal.tsx');

  assert.equal(/onSetTemplateActive/.test(modalSource), true);
  assert.equal(/onRemoveTemplate/.test(modalSource), true);
  assert.equal(/pendingDeleteTemplateId/.test(modalSource), true);
  assert.equal(/삭제 확인/.test(modalSource), true);
  assert.equal(/fixed-meal-active-\$\{template\.id\}/.test(modalSource), true);
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
