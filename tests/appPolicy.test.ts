import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getAppHydrationRenderState,
  shouldPersistAppDataSnapshot,
  shouldRenderInteractiveApp,
} from '../src/appHydration';
import { getCalendarDayStatusBadgeTone } from '../src/calendar';
import {
  getMealDateEvaluationMode,
  shouldEvaluateMealDate,
} from '../src/mealDatePolicy';

test('future selected dates use scheduled mode instead of meal evaluation', () => {
  assert.equal(getMealDateEvaluationMode('2026-07-24', '2026-07-23'), 'scheduled');
  assert.equal(shouldEvaluateMealDate('2026-07-24', '2026-07-23'), false);
});

test('today and past selected dates keep the existing evaluation mode', () => {
  assert.equal(getMealDateEvaluationMode('2026-07-23', '2026-07-23'), 'evaluate');
  assert.equal(getMealDateEvaluationMode('2026-07-22', '2026-07-23'), 'evaluate');
  assert.equal(shouldEvaluateMealDate('2026-07-23', '2026-07-23'), true);
  assert.equal(shouldEvaluateMealDate('2026-07-22', '2026-07-23'), true);
});

test('hydration hides the interactive app until storage restore completes', () => {
  assert.equal(getAppHydrationRenderState(false), 'loading');
  assert.equal(shouldRenderInteractiveApp(false), false);
  assert.equal(shouldPersistAppDataSnapshot(false), false);

  assert.equal(getAppHydrationRenderState(true), 'interactive');
  assert.equal(shouldRenderInteractiveApp(true), true);
  assert.equal(shouldPersistAppDataSnapshot(true), true);
});

test('scheduled summary badges use a dedicated non-danger tone', () => {
  assert.equal(getCalendarDayStatusBadgeTone('scheduled'), 'scheduled');
  assert.equal(getCalendarDayStatusBadgeTone('scheduled') === 'danger', false);
});