import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createGoalHistoryListModel,
} from '../src/goalPresentation';
import {
  GOAL_HISTORY_BASELINE_DATE,
  createNutritionGoalHistoryEntry,
} from '../src/goalHistory';
import type { DailyNutritionTargets } from '../src/nutrition';

declare const process: { cwd(): string };
declare function require(moduleName: 'node:fs'): {
  readFileSync(path: string, encoding: string): string;
};

const { readFileSync } = require('node:fs');
const repoRoot = process.cwd();

const baselineTargets: DailyNutritionTargets = {
  caloriesKcal: 2000,
  proteinG: 70,
  carbohydrateG: 300,
  fatG: 55,
};

const historicalTargets: DailyNutritionTargets = {
  caloriesKcal: 2100,
  proteinG: 101,
  carbohydrateG: 251,
  fatG: 61,
};

const currentTargets: DailyNutritionTargets = {
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

test('Chapter 5-D history is newest-first and marks only the latest entry effective today', () => {
  const model = createGoalHistoryListModel([
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', historicalTargets),
    createNutritionGoalHistoryEntry('2026-08-20', 'diet', currentTargets),
    createNutritionGoalHistoryEntry('2026-09-05', 'bulk', futureTargets),
  ], '2026-08-28');

  assert.deepEqual(model.items.map((item) => item.effectiveDate), [
    '2026-09-05',
    '2026-08-20',
    '2026-08-01',
  ]);
  assert.deepEqual(model.items.map((item) => item.isCurrent), [false, true, false]);
});

test('Chapter 5-D future-only history never receives the current badge', () => {
  const model = createGoalHistoryListModel([
    createNutritionGoalHistoryEntry('2026-09-10', 'bulk', futureTargets),
    createNutritionGoalHistoryEntry('2026-09-01', 'diet', currentTargets),
  ], '2026-08-28');

  assert.deepEqual(model.items.map((item) => item.effectiveDate), [
    '2026-09-10',
    '2026-09-01',
  ]);
  assert.equal(model.items.some((item) => item.isCurrent), false);
});

test('Chapter 5-D legacy baseline is hidden while a single real entry remains natural', () => {
  const model = createGoalHistoryListModel([
    createNutritionGoalHistoryEntry(GOAL_HISTORY_BASELINE_DATE, 'maintain', baselineTargets),
    createNutritionGoalHistoryEntry('2026-08-28', 'diet', currentTargets),
  ], '2026-08-28');

  assert.equal(model.items.length, 1);
  assert.equal(model.items[0]?.effectiveDate, '2026-08-28');
  assert.equal(model.items[0]?.isCurrent, true);
  assert.equal(
    createGoalHistoryListModel([
      createNutritionGoalHistoryEntry(
        GOAL_HISTORY_BASELINE_DATE,
        'maintain',
        baselineTargets,
      ),
    ], '2026-08-28').items.length,
    0,
  );
});

test('Chapter 5-D empty and malformed histories produce a safe empty model', () => {
  const malformedHistory = [
    null,
    { effectiveDate: 'not-a-date', goalType: 'diet', targets: currentTargets },
    { effectiveDate: '2026-08-28', goalType: 'view', targets: currentTargets },
    {
      effectiveDate: '2026-08-28',
      goalType: 'diet',
      targets: { ...currentTargets, caloriesKcal: Number.NaN },
    },
    {
      effectiveDate: '2026-08-28',
      goalType: 'diet',
      targets: { ...currentTargets, proteinG: -1 },
    },
  ];

  assert.deepEqual(createGoalHistoryListModel([], '2026-08-28'), { items: [] });
  assert.deepEqual(createGoalHistoryListModel(undefined, '2026-08-28'), { items: [] });
  assert.deepEqual(createGoalHistoryListModel(malformedHistory, '2026-08-28'), { items: [] });
  assert.equal(
    createGoalHistoryListModel([
      ...malformedHistory,
      createNutritionGoalHistoryEntry('2026-08-20', 'diet', currentTargets),
    ], '2026-08-28').items.length,
    1,
  );
  assert.equal(
    createGoalHistoryListModel([
      createNutritionGoalHistoryEntry('2026-08-28', 'diet', currentTargets),
    ], 'invalid-today').items[0]?.isCurrent,
    false,
  );
});

test('Chapter 5-D historical rows preserve their own stored nutrition snapshot', () => {
  const model = createGoalHistoryListModel([
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', historicalTargets),
    createNutritionGoalHistoryEntry('2026-08-28', 'diet', currentTargets),
  ], '2026-08-28');
  const historicalItem = model.items.find((item) => item.effectiveDate === '2026-08-01');

  assert.equal(historicalItem?.goalTypeLabel, '건강유지');
  assert.deepEqual(
    historicalItem?.nutritionMetrics.map((metric) => [metric.field, metric.valueLabel]),
    [
      ['caloriesKcal', '2,100 kcal'],
      ['proteinG', '101 g'],
      ['carbohydrateG', '251 g'],
      ['fatG', '61 g'],
    ],
  );
});

test('Chapter 5-D Settings keeps reset navigation and opens history as a separate modal entry', () => {
  const settingsSource = readSource('src/screens/SettingsScreen.tsx');
  const appSource = readSource('App.tsx');
  const navigationSource = readSource('src/navigation.ts');
  const resetEntryStart = settingsSource.indexOf('accessibilityLabel="목표 및 영양 목표 재설정"');
  const resetEntryEnd = settingsSource.indexOf('</Pressable>', resetEntryStart);
  const historyEntryStart = settingsSource.indexOf('testID="settings-goal-history-entry"');

  assert.equal(resetEntryStart >= 0, true);
  assert.equal(resetEntryEnd > resetEntryStart, true);
  assert.equal(settingsSource.slice(resetEntryStart, resetEntryEnd).includes('onPress={onOpenGoalSetup}'), true);
  assert.equal(historyEntryStart > resetEntryEnd, true);
  assert.equal(settingsSource.includes('<GoalHistoryModal'), true);
  assert.equal(appSource.includes('goalHistory={goalHistory}'), true);
  assert.equal(appSource.includes('todayDate={todayDate}'), true);
  assert.equal(appSource.includes('onOpenGoalSetup={() => setActiveTab(getGoalSetupScreenKey())}'), true);
  assert.equal(navigationSource.includes('goalHistory'), false);
});
