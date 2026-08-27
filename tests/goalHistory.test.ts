import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GOAL_HISTORY_BASELINE_DATE,
  createBaselineNutritionGoalHistory,
  createNutritionGoalHistoryEntry,
  normalizeNutritionGoalHistory,
  resolveNutritionGoalForDate,
  upsertNutritionGoalHistoryEntry,
} from '../src/goalHistory';
import type { DailyNutritionTargets } from '../src/nutrition';

const baselineTargets: DailyNutritionTargets = {
  caloriesKcal: 2000,
  proteinG: 100,
  carbohydrateG: 250,
  fatG: 60,
};

const dietTargets: DailyNutritionTargets = {
  caloriesKcal: 1600,
  proteinG: 120,
  carbohydrateG: 150,
  fatG: 45,
};

const bulkTargets: DailyNutritionTargets = {
  caloriesKcal: 2600,
  proteinG: 130,
  carbohydrateG: 330,
  fatG: 75,
};

const replacementTargets: DailyNutritionTargets = {
  caloriesKcal: 1800,
  proteinG: 125,
  carbohydrateG: 170,
  fatG: 50,
};

test('createBaselineNutritionGoalHistory creates a non-retroactive baseline snapshot', () => {
  const history = createBaselineNutritionGoalHistory(baselineTargets, 'maintain');

  assert.deepEqual(history, [{
    effectiveDate: GOAL_HISTORY_BASELINE_DATE,
    goalType: 'maintain',
    targets: baselineTargets,
  }]);
  assert.equal(Object.is(history[0].targets, baselineTargets), false);
});

test('normalizeNutritionGoalHistory sorts entries and keeps the last duplicate effective date', () => {
  const normalizedHistory = normalizeNutritionGoalHistory([
    createNutritionGoalHistoryEntry('2026-08-19', 'diet', dietTargets),
    createNutritionGoalHistoryEntry('2026-09-01', 'bulk', bulkTargets),
    createNutritionGoalHistoryEntry('2026-08-19', 'maintain', replacementTargets),
    createNutritionGoalHistoryEntry(GOAL_HISTORY_BASELINE_DATE, 'maintain', baselineTargets),
  ]);

  assert.deepEqual(normalizedHistory.map((entry) => entry.effectiveDate), [
    GOAL_HISTORY_BASELINE_DATE,
    '2026-08-19',
    '2026-09-01',
  ]);
  assert.equal(normalizedHistory[1].goalType, 'maintain');
  assert.deepEqual(normalizedHistory[1].targets, replacementTargets);
});

test('resolveNutritionGoalForDate uses the latest entry whose effective date is not after the target date', () => {
  const history = [
    createNutritionGoalHistoryEntry('2026-08-19', 'diet', dietTargets),
    createNutritionGoalHistoryEntry(GOAL_HISTORY_BASELINE_DATE, 'maintain', baselineTargets),
    createNutritionGoalHistoryEntry('2026-09-01', 'bulk', bulkTargets),
  ];

  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-18').targets, baselineTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-19').targets, dietTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-09-10').targets, bulkTargets);
});

test('resolveNutritionGoalForDate keeps future entries inactive until their effective date', () => {
  const history = [
    createNutritionGoalHistoryEntry('2026-08-01', 'diet', dietTargets),
    createNutritionGoalHistoryEntry('2026-08-25', 'bulk', bulkTargets),
  ];

  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-19').targets, dietTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-24').targets, dietTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-25').targets, bulkTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-26').targets, bulkTargets);
});

test('resolveNutritionGoalForDate returns the selected date macro snapshot for Today navigation', () => {
  const oldTargets: DailyNutritionTargets = {
    caloriesKcal: 2100,
    proteinG: 101,
    carbohydrateG: 251,
    fatG: 61,
  };
  const newTargets: DailyNutritionTargets = {
    caloriesKcal: 1700,
    proteinG: 131,
    carbohydrateG: 171,
    fatG: 51,
  };
  const history = [
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', oldTargets),
    createNutritionGoalHistoryEntry('2026-08-19', 'diet', newTargets),
  ];

  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-18').targets, oldTargets);
  assert.deepEqual(resolveNutritionGoalForDate(history, '2026-08-19').targets, newTargets);
});

test('upsertNutritionGoalHistoryEntry replaces the same effective date without changing older snapshots', () => {
  const history = [
    createNutritionGoalHistoryEntry(GOAL_HISTORY_BASELINE_DATE, 'maintain', baselineTargets),
    createNutritionGoalHistoryEntry('2026-08-19', 'diet', dietTargets),
  ];
  const updatedHistory = upsertNutritionGoalHistoryEntry(
    history,
    createNutritionGoalHistoryEntry('2026-08-19', 'bulk', bulkTargets),
  );

  assert.equal(updatedHistory.length, 2);
  assert.deepEqual(updatedHistory.map((entry) => entry.effectiveDate), [
    GOAL_HISTORY_BASELINE_DATE,
    '2026-08-19',
  ]);
  assert.deepEqual(resolveNutritionGoalForDate(updatedHistory, '2026-08-18').targets, baselineTargets);
  assert.equal(resolveNutritionGoalForDate(updatedHistory, '2026-08-19').goalType, 'bulk');
  assert.deepEqual(resolveNutritionGoalForDate(updatedHistory, '2026-08-19').targets, bulkTargets);
});
