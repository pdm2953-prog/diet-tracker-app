import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Nutrition } from '../src/models';
import { calculateNutritionForConsumedGrams } from '../src/nutrition';

const baseNutrition: Nutrition = {
  caloriesKcal: 200,
  carbohydrateG: 50,
  proteinG: 10,
  fatG: 4,
  sugarsG: null,
  sodiumMg: 0,
  fiberG: null,
  saturatedFatG: 1,
  transFatG: 0,
  cholesterolMg: null,
};

const emptyNutrition: Nutrition = {
  caloriesKcal: null,
  carbohydrateG: null,
  proteinG: null,
  fatG: null,
  sugarsG: null,
  sodiumMg: null,
  fiberG: null,
  saturatedFatG: null,
  transFatG: null,
  cholesterolMg: null,
};

test('calculateNutritionForConsumedGrams scales nutrition down for 50g of a 100g serving', () => {
  const result = calculateNutritionForConsumedGrams(baseNutrition, 50, 100);

  assert.equal(result.caloriesKcal, 100);
  assert.equal(result.carbohydrateG, 25);
  assert.equal(result.proteinG, 5);
  assert.equal(result.fatG, 2);
});

test('calculateNutritionForConsumedGrams scales nutrition up for 150g of a 100g serving', () => {
  const result = calculateNutritionForConsumedGrams(baseNutrition, 150, 100);

  assert.equal(result.caloriesKcal, 300);
  assert.equal(result.carbohydrateG, 75);
  assert.equal(result.proteinG, 15);
  assert.equal(result.fatG, 6);
});

test('calculateNutritionForConsumedGrams preserves null fields and keeps real zero values', () => {
  const result = calculateNutritionForConsumedGrams(baseNutrition, 50, 100);

  assert.equal(result.sugarsG, null);
  assert.equal(result.fiberG, null);
  assert.equal(result.cholesterolMg, null);
  assert.equal(result.sodiumMg, 0);
  assert.equal(result.transFatG, 0);
});

const invalidNutritionCases: Array<{
  name: string;
  consumedGrams: number;
  servingSize: number;
}> = [
  {
    name: 'consumedGrams is zero',
    consumedGrams: 0,
    servingSize: 100,
  },
  {
    name: 'consumedGrams is negative',
    consumedGrams: -50,
    servingSize: 100,
  },
  {
    name: 'consumedGrams is NaN',
    consumedGrams: Number.NaN,
    servingSize: 100,
  },
  {
    name: 'servingSize is zero',
    consumedGrams: 50,
    servingSize: 0,
  },
  {
    name: 'servingSize is null at runtime',
    consumedGrams: 50,
    servingSize: null as unknown as number,
  },
];

for (const { name, consumedGrams, servingSize } of invalidNutritionCases) {
  test(`calculateNutritionForConsumedGrams returns empty nutrition when ${name}`, () => {
    const result = calculateNutritionForConsumedGrams(
      baseNutrition,
      consumedGrams,
      servingSize,
    );

    assert.deepEqual(result, emptyNutrition);
  });
}