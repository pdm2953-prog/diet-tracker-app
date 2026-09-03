import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getAppHydrationRenderState,
  getAppStartupRenderState,
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
  assert.equal(getAppHydrationRenderState(false, false), 'loading');
  assert.equal(getAppHydrationRenderState(false, true), 'loading');
  assert.equal(shouldRenderInteractiveApp(false, false), false);
  assert.equal(shouldPersistAppDataSnapshot(false, false), false);
});

test('hydrated first-run users stay in goal setup without persisting fallback data', () => {
  assert.equal(getAppHydrationRenderState(true, false), 'goal-setup');
  assert.equal(shouldRenderInteractiveApp(true, false), false);
  assert.equal(shouldPersistAppDataSnapshot(true, false), false);
});

test('hydrated users enter the interactive app only after goal setup completion', () => {
  assert.equal(getAppHydrationRenderState(true, true), 'interactive');
  assert.equal(shouldRenderInteractiveApp(true, true), true);
  assert.equal(shouldPersistAppDataSnapshot(true, true), true);
});

test('auth gate precedes nutrition hydration and first-run goal setup', () => {
  assert.equal(getAppStartupRenderState('restoring', false, false), 'auth-loading');
  assert.equal(getAppStartupRenderState('unavailable', true, true), 'auth-unavailable');
  assert.equal(getAppStartupRenderState('anonymous', true, false), 'auth-required');
  assert.equal(getAppStartupRenderState('authenticated', false, false), 'nutrition-loading');
  assert.equal(getAppStartupRenderState('authenticated', true, false), 'goal-setup');
  assert.equal(getAppStartupRenderState('authenticated', true, true), 'interactive');
});

test('scheduled summary badges use a dedicated non-danger tone', () => {
  assert.equal(getCalendarDayStatusBadgeTone('scheduled'), 'scheduled');
  assert.equal(getCalendarDayStatusBadgeTone('scheduled') === 'danger', false);
});
