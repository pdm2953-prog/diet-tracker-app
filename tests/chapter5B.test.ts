import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSettingsGoalEntryModel } from '../src/goalPresentation';
import {
  createNutritionGoalHistoryEntry,
  resolveNutritionGoalForDate,
  upsertNutritionGoalHistoryEntry,
} from '../src/goalHistory';
import type { DailyNutritionTargets } from '../src/nutrition';
import { nutritionGoalLabels } from '../src/nutritionGoals';

declare const process: { cwd(): string };
declare function require(moduleName: 'node:fs'): {
  readFileSync(path: string, encoding: string): string;
};

const { readFileSync } = require('node:fs');
const repoRoot = process.cwd();

const oldTargets: DailyNutritionTargets = {
  caloriesKcal: 2100,
  proteinG: 101,
  carbohydrateG: 251,
  fatG: 61,
};

const todayTargets: DailyNutritionTargets = {
  caloriesKcal: 1700,
  proteinG: 131,
  carbohydrateG: 171,
  fatG: 51,
};

const futureTargets: DailyNutritionTargets = {
  caloriesKcal: 2600,
  proteinG: 150,
  carbohydrateG: 330,
  fatG: 80,
};

function readSource(relativePath: string): string {
  return readFileSync(`${repoRoot}\\${relativePath}`, 'utf8');
}

function extractJsxElement(source: string, elementName: string): string {
  const startIndex = source.indexOf(`<${elementName}`);

  assert.equal(startIndex >= 0, true);

  const endIndex = source.indexOf('/>', startIndex);

  assert.equal(endIndex >= 0, true);

  return source.slice(startIndex, endIndex + 2);
}

test('Chapter 5-B Today receives the selected date target snapshot instead of the current global target', () => {
  const history = [
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', oldTargets),
    createNutritionGoalHistoryEntry('2026-08-19', 'diet', todayTargets),
  ];
  const appSource = readSource('App.tsx');
  const todayScreenSource = extractJsxElement(appSource, 'TodayScreen');

  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-18').targets, oldTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-19').targets, todayTargets);
  assert.equal(/const selectedDateGoal = useMemo\(/.test(appSource), true);
  assert.equal(/targets=\{selectedDateGoal\.targets\}/.test(todayScreenSource), true);
  assert.equal(/targets=\{todayGoal\.targets\}/.test(todayScreenSource), false);
});

test('Chapter 5-B Settings renders the goal resolved for today instead of a future history entry', () => {
  const history = [
    createNutritionGoalHistoryEntry('2026-08-01', 'diet', oldTargets),
    createNutritionGoalHistoryEntry('2026-08-25', 'bulk', futureTargets),
  ];
  const currentGoal = resolveNutritionGoalForDate(history, '2026-08-19');
  const settingsEntry = createSettingsGoalEntryModel(currentGoal.targets, currentGoal.goalType);
  const appSource = readSource('App.tsx');
  const settingsScreenSource = extractJsxElement(appSource, 'SettingsScreen');

  assert.equal(currentGoal.goalType, 'diet');
  assert.deepEqual(currentGoal.targets, oldTargets);
  assert.equal(settingsEntry.currentGoalLabel, nutritionGoalLabels.diet);
  assert.equal(settingsEntry.dailyCalorieGoalLabel, '2,100 kcal');
  assert.equal(/nutritionGoalType=\{todayGoal\.goalType\}/.test(settingsScreenSource), true);
  assert.equal(/targets=\{todayGoal\.targets\}/.test(settingsScreenSource), true);
});

test('Chapter 5-B Target save flow uses local today and same-day replacement semantics', () => {
  const todayDate = '2026-08-19';
  const history = [
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', oldTargets),
    createNutritionGoalHistoryEntry(todayDate, 'diet', todayTargets),
  ];
  const updatedHistory = upsertNutritionGoalHistoryEntry(
    history,
    createNutritionGoalHistoryEntry(todayDate, 'bulk', futureTargets),
  );
  const currentGoal = resolveNutritionGoalForDate(updatedHistory, todayDate);
  const appSource = readSource('App.tsx');
  const goalSetupSource = readSource('src/goalSetup.ts');

  assert.equal(updatedHistory.length, 2);
  assert.deepEqual(updatedHistory.map((entry) => entry.effectiveDate), ['2026-08-01', todayDate]);
  assert.deepEqual(resolveNutritionGoalForDate(updatedHistory, '2026-08-18').targets, oldTargets);
  assert.equal(currentGoal.goalType, 'bulk');
  assert.deepEqual(currentGoal.targets, futureTargets);
  assert.equal(appSource.includes('effectiveDate: getLocalDateString()'), true);
  assert.equal(appSource.includes('saveNutritionGoal({'), true);
  assert.equal(goalSetupSource.includes('upsertNutritionGoalHistoryEntry(goalHistory, entry)'), true);
  assert.equal(/nutritionGoalType: todayGoal\.goalType/.test(appSource), true);
  assert.equal(/todayTargets: todayGoal\.targets/.test(appSource), true);
});
