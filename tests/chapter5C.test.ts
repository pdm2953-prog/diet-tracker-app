import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAppHydrationRenderState } from '../src/appHydration';
import {
  GOAL_HISTORY_BASELINE_DATE,
  createNutritionGoalHistoryEntry,
  resolveNutritionGoalForDate,
} from '../src/goalHistory';
import { saveNutritionGoal } from '../src/goalSetup';
import type { DailyNutritionTargets } from '../src/nutrition';

declare const process: { cwd(): string };
declare function require(moduleName: 'node:fs'): {
  readFileSync(path: string, encoding: string): string;
};

const { readFileSync } = require('node:fs');
const repoRoot = process.cwd();

const baselineTargets: DailyNutritionTargets = {
  caloriesKcal: 2000,
  proteinG: 100,
  carbohydrateG: 250,
  fatG: 60,
};

const firstRunTargets: DailyNutritionTargets = {
  caloriesKcal: 1700,
  proteinG: 130,
  carbohydrateG: 170,
  fatG: 50,
};

const resetTargets: DailyNutritionTargets = {
  caloriesKcal: 2300,
  proteinG: 145,
  carbohydrateG: 285,
  fatG: 65,
};

test('Chapter 5-C first save replaces the seeded baseline with one local-today snapshot', () => {
  const savedState = saveNutritionGoal({
    effectiveDate: '2026-08-28',
    goalHistory: [
      createNutritionGoalHistoryEntry(
        GOAL_HISTORY_BASELINE_DATE,
        'maintain',
        baselineTargets,
      ),
    ],
    goalType: 'diet',
    hasCompletedGoalSetup: false,
    targets: firstRunTargets,
  });

  assert.equal(savedState.hasCompletedGoalSetup, true);
  assert.deepEqual(savedState.goalHistory, [
    createNutritionGoalHistoryEntry('2026-08-28', 'diet', firstRunTargets),
  ]);
  assert.equal(
    savedState.goalHistory.some((entry) => entry.effectiveDate === GOAL_HISTORY_BASELINE_DATE),
    false,
  );
  assert.deepEqual(
    resolveNutritionGoalForDate(savedState.goalHistory, '2026-08-28'),
    createNutritionGoalHistoryEntry('2026-08-28', 'diet', firstRunTargets),
  );
});

test('Chapter 5-C Settings reset keeps completion and same-day upsert history semantics', () => {
  const savedState = saveNutritionGoal({
    effectiveDate: '2026-08-28',
    goalHistory: [
      createNutritionGoalHistoryEntry('2026-08-01', 'maintain', baselineTargets),
      createNutritionGoalHistoryEntry('2026-08-28', 'diet', firstRunTargets),
    ],
    goalType: 'bulk',
    hasCompletedGoalSetup: true,
    targets: resetTargets,
  });

  assert.equal(savedState.hasCompletedGoalSetup, true);
  assert.deepEqual(savedState.goalHistory, [
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', baselineTargets),
    createNutritionGoalHistoryEntry('2026-08-28', 'bulk', resetTargets),
  ]);
});

test('Chapter 5-C completed state remains interactive after reload policy evaluation', () => {
  assert.equal(getAppHydrationRenderState(true, true), 'interactive');
  assert.equal(getAppHydrationRenderState(true, false), 'goal-setup');
});

test('Chapter 5-C setup-only branch does not render main panes or bottom tabs', () => {
  const appSource = readFileSync(`${repoRoot}\\App.tsx`, 'utf8').replace(/\r\n/g, '\n');
  const setupBranchStart = appSource.indexOf("if (appRenderState === 'goal-setup')");
  const setupBranchEnd = appSource.indexOf('\n  }\n\n  return (', setupBranchStart);

  assert.equal(setupBranchStart >= 0, true);
  assert.equal(setupBranchEnd > setupBranchStart, true);

  const setupBranch = appSource.slice(setupBranchStart, setupBranchEnd);

  assert.equal(setupBranch.includes('<TargetScreen'), true);
  assert.equal(setupBranch.includes('<TodayScreen'), false);
  assert.equal(setupBranch.includes('<CalendarScreen'), false);
  assert.equal(setupBranch.includes('<SettingsScreen'), false);
  assert.equal(setupBranch.includes('bottomTabs.map'), false);
});
