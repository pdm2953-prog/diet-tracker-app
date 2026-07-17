import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Meal, Nutrition } from '../src/models';
import type { DailyNutritionTargets } from '../src/nutrition';
import { buildDailySummary, calculateNutritionForConsumedGrams } from '../src/nutrition';
import {
  activityFactors,
  applyNutritionGoalRecommendationTargets,
  calculateBmi,
  calculateMifflinBmr,
  calculateNutritionGoalRecommendation,
  classifyBmi,
} from '../src/nutritionGoals';
import type { NutritionGoalRecommendation } from '../src/nutritionGoals';

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

function assertAlmostEqual(actual: number, expected: number, delta = 0.000001) {
  assert.equal(
    Math.abs(actual - expected) <= delta,
    true,
    `expected ${actual} to be within ${delta} of ${expected}`,
  );
}

const baseGoalInput = {
  ageYears: 30,
  sex: 'male' as const,
  heightCm: 175,
  weightKg: 70,
  goal: 'maintain' as const,
  activityLevel: 'light' as const,
  hasInBodyReport: false,
};

test('calculateMifflinBmr uses Mifflin-St Jeor formula for standard mode', () => {
  const expectedBmr = 10 * 70 + 6.25 * 175 - 5 * 30 + 5;
  const result = calculateNutritionGoalRecommendation(baseGoalInput);

  assert.equal(calculateMifflinBmr('male', 70, 175, 30), expectedBmr);
  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.mode, 'standard');
    assertAlmostEqual(result.mifflinBmrKcal, expectedBmr);
    assertAlmostEqual(result.selectedBmrKcal, expectedBmr);
  }
});

test('calculateNutritionGoalRecommendation prefers valid InBody BMR within 15 percent', () => {
  const result = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    hasInBodyReport: true,
    inBody: {
      measuredAt: '2026-07-16',
      bmrKcal: 1700,
      skeletalMuscleMassKg: 31,
      bodyFatMassKg: 14,
      bodyFatPercentage: 20,
      visceralFatLevel: 5,
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.mode, 'inbody');
    assert.equal(result.inBodyBmrKcal, 1700);
    assert.equal(result.selectedBmrKcal, 1700);
    assert.equal(result.warnings.some((warning) => warning.code === 'bmrMismatch'), false);
  }
});

test('calculateNutritionGoalRecommendation averages BMR values and warns when InBody differs by more than 15 percent', () => {
  const result = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    hasInBodyReport: true,
    inBody: {
      measuredAt: '2026-07-16',
      bmrKcal: 2200,
      skeletalMuscleMassKg: 31,
      bodyFatMassKg: 14,
      bodyFatPercentage: 20,
      visceralFatLevel: 5,
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const expectedMifflinBmr = calculateMifflinBmr('male', 70, 175, 30);
    assertAlmostEqual(result.selectedBmrKcal, (expectedMifflinBmr + 2200) / 2);
    assert.equal(result.warnings.some((warning) => warning.code === 'bmrMismatch'), true);
  }
});

test('calculateNutritionGoalRecommendation falls back to Mifflin BMR when InBody BMR is invalid', () => {
  const result = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    hasInBodyReport: true,
    inBody: {
      measuredAt: '2026-07-16',
      bmrKcal: 0,
      skeletalMuscleMassKg: 31,
      bodyFatMassKg: 14,
      bodyFatPercentage: 20,
      visceralFatLevel: 5,
    },
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    const expectedMifflinBmr = calculateMifflinBmr('male', 70, 175, 30);
    assert.equal(result.inBodyBmrKcal, null);
    assertAlmostEqual(result.selectedBmrKcal, expectedMifflinBmr);
  }
});

test('calculateNutritionGoalRecommendation calculates TDEE for every activity factor', () => {
  for (const activityLevel of Object.keys(activityFactors) as Array<keyof typeof activityFactors>) {
    const result = calculateNutritionGoalRecommendation({
      ...baseGoalInput,
      activityLevel,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assertAlmostEqual(result.tdeeKcal, result.selectedBmrKcal * activityFactors[activityLevel]);
    }
  }
});

test('calculateNutritionGoalRecommendation applies diet, maintain, and bulk calorie targets', () => {
  const expectedFactors = {
    diet: 0.85,
    maintain: 1,
    bulk: 1.1,
  } as const;

  for (const goal of Object.keys(expectedFactors) as Array<keyof typeof expectedFactors>) {
    const result = calculateNutritionGoalRecommendation({
      ...baseGoalInput,
      goal,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      assertAlmostEqual(result.targets.caloriesKcal, result.tdeeKcal * expectedFactors[goal]);
    }
  }
});

test('calculateNutritionGoalRecommendation calculates protein, fat, and carbohydrate targets', () => {
  const result = calculateNutritionGoalRecommendation(baseGoalInput);

  assert.equal(result.ok, true);

  if (result.ok) {
    const expectedProteinG = 70 * 1.4;
    const expectedFatG = result.targets.caloriesKcal * 0.25 / 9;
    const expectedCarbohydrateG = (
      result.targets.caloriesKcal - expectedProteinG * 4 - expectedFatG * 9
    ) / 4;

    assertAlmostEqual(result.targets.proteinG, expectedProteinG);
    assertAlmostEqual(result.targets.fatG, expectedFatG);
    assertAlmostEqual(result.targets.carbohydrateG, expectedCarbohydrateG);
  }
});

test('calculateBmi and classifyBmi calculate BMI categories', () => {
  assertAlmostEqual(calculateBmi(70, 175), 70 / (1.75 ** 2));
  assert.equal(classifyBmi(18.4), 'underweight');
  assert.equal(classifyBmi(18.5), 'normal');
  assert.equal(classifyBmi(24.9), 'normal');
  assert.equal(classifyBmi(25), 'overweight');
  assert.equal(classifyBmi(29.9), 'overweight');
  assert.equal(classifyBmi(30), 'obese');
});

test('calculateNutritionGoalRecommendation guards invalid age, height, and weight', () => {
  const result = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    ageYears: 0,
    heightCm: -1,
    weightKg: Number.NaN,
  });

  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.deepEqual(
      result.errors.map((error) => error.code),
      ['invalidAge', 'invalidHeight', 'invalidWeight'],
    );
  }
});

test('calculateNutritionGoalRecommendation warns when underweight user selects diet', () => {
  const result = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    heightCm: 180,
    weightKg: 50,
    goal: 'diet',
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.bmiCategory, 'underweight');
    assert.equal(result.warnings.some((warning) => warning.code === 'underweightDiet'), true);
  }
});

test('calculateNutritionGoalRecommendation warns when obese user selects bulk', () => {
  const result = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    heightCm: 170,
    weightKg: 100,
    goal: 'bulk',
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.bmiCategory, 'obese');
    assert.equal(result.warnings.some((warning) => warning.code === 'obeseBulk'), true);
  }
});

test('calculateNutritionGoalRecommendation warns for body fat percentage and goal mismatches', () => {
  const lowBodyFatDiet = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    goal: 'diet',
    hasInBodyReport: true,
    inBody: {
      measuredAt: '2026-07-16',
      bmrKcal: 1700,
      skeletalMuscleMassKg: 31,
      bodyFatMassKg: 6,
      bodyFatPercentage: 9,
      visceralFatLevel: 3,
    },
  });
  const highBodyFatBulk = calculateNutritionGoalRecommendation({
    ...baseGoalInput,
    goal: 'bulk',
    hasInBodyReport: true,
    inBody: {
      measuredAt: '2026-07-16',
      bmrKcal: 1700,
      skeletalMuscleMassKg: 31,
      bodyFatMassKg: 25,
      bodyFatPercentage: 30,
      visceralFatLevel: 9,
    },
  });

  assert.equal(lowBodyFatDiet.ok, true);
  assert.equal(highBodyFatBulk.ok, true);

  if (lowBodyFatDiet.ok && highBodyFatBulk.ok) {
    assert.equal(
      lowBodyFatDiet.warnings.some((warning) => warning.code === 'lowBodyFatDiet'),
      true,
    );
    assert.equal(
      highBodyFatBulk.warnings.some((warning) => warning.code === 'highBodyFatBulk'),
      true,
    );
  }
});

test('calculated targets are compatible with Today target structure', () => {
  const result = calculateNutritionGoalRecommendation(baseGoalInput);

  assert.equal(result.ok, true);

  if (result.ok) {
    const targets: DailyNutritionTargets = result.targets;

    assert.deepEqual(
      Object.keys(targets).sort(),
      ['caloriesKcal', 'carbohydrateG', 'fatG', 'proteinG'].sort(),
    );
    assert.equal(Object.values(targets).every((value) => typeof value === 'number'), true);
  }
});

test('applyNutritionGoalRecommendationTargets maps recommendation targets to Today daily target fields', () => {
  const currentTargets: DailyNutritionTargets = {
    caloriesKcal: 2000,
    proteinG: 70,
    carbohydrateG: 300,
    fatG: 55,
  };
  const targetCaloriesKcal = 2345;
  const proteinG = 132;
  const carbsG = 281.5;
  const fatG = 65.1;
  const recommendation: NutritionGoalRecommendation = {
    ok: true,
    mode: 'inbody',
    selectedBmrKcal: 1600,
    mifflinBmrKcal: 1550,
    inBodyBmrKcal: 1600,
    tdeeKcal: 2400,
    bmi: 22.9,
    bmiCategory: 'normal',
    targets: {
      caloriesKcal: targetCaloriesKcal,
      proteinG,
      carbohydrateG: carbsG,
      fatG,
    },
    warnings: [],
  };

  const result = applyNutritionGoalRecommendationTargets(currentTargets, recommendation);

  assert.deepEqual(result, {
    caloriesKcal: targetCaloriesKcal,
    proteinG,
    carbohydrateG: carbsG,
    fatG,
  });
  assert.equal(Object.is(result, currentTargets), false);
});

test('applyNutritionGoalRecommendationTargets preserves current targets for invalid recommendations', () => {
  const currentTargets: DailyNutritionTargets = {
    caloriesKcal: 2000,
    proteinG: 70,
    carbohydrateG: 300,
    fatG: 55,
  };
  const recommendation: NutritionGoalRecommendation = {
    ok: false,
    errors: [{ code: 'invalidWeight', message: '체중은 0보다 큰 kg 숫자로 입력해주세요.' }],
    warnings: [],
  };

  const result = applyNutritionGoalRecommendationTargets(currentTargets, recommendation);

  assert.equal(result, currentTargets);
});

test('applied Today targets stay independent from consumedGrams checked and delete summaries', () => {
  const date = '2026-07-17';
  const currentTargets: DailyNutritionTargets = {
    caloriesKcal: 2000,
    proteinG: 70,
    carbohydrateG: 300,
    fatG: 55,
  };
  const expectedTargets: DailyNutritionTargets = {
    caloriesKcal: 2400,
    proteinG: 126,
    carbohydrateG: 292.5,
    fatG: 66.7,
  };
  const recommendation: NutritionGoalRecommendation = {
    ok: true,
    mode: 'standard',
    selectedBmrKcal: 1650,
    mifflinBmrKcal: 1650,
    inBodyBmrKcal: null,
    tdeeKcal: 2400,
    bmi: 22.9,
    bmiCategory: 'normal',
    targets: expectedTargets,
    warnings: [],
  };
  const firstMealNutrition = calculateNutritionForConsumedGrams(baseNutrition, 50, 100);
  const secondMealNutrition = calculateNutritionForConsumedGrams(baseNutrition, 150, 100);
  const meals: Meal[] = [
    {
      id: 'meal-breakfast',
      date,
      type: 'breakfast',
      foods: [
        {
          id: 'meal-food-first',
          foodId: 'food-first',
          mealId: 'meal-breakfast',
          consumedGrams: 50,
          checked: true,
          calculatedNutrition: firstMealNutrition,
          createdAt: date,
          updatedAt: date,
        },
        {
          id: 'meal-food-second',
          foodId: 'food-second',
          mealId: 'meal-breakfast',
          consumedGrams: 150,
          checked: false,
          calculatedNutrition: secondMealNutrition,
          createdAt: date,
          updatedAt: date,
        },
      ],
      createdAt: date,
      updatedAt: date,
    },
  ];

  const summaryBeforeTargetApply = buildDailySummary(date, meals);
  const appliedTargets = applyNutritionGoalRecommendationTargets(currentTargets, recommendation);
  const summaryAfterTargetApply = buildDailySummary(date, meals);

  assert.deepEqual(appliedTargets, expectedTargets);
  assert.deepEqual(summaryAfterTargetApply, summaryBeforeTargetApply);
  assert.equal(summaryAfterTargetApply.checkedNutritionTotal.caloriesKcal, 100);
  assert.equal(summaryAfterTargetApply.checkedNutritionTotal.proteinG, 5);

  const checkedMeals: Meal[] = meals.map((meal) => ({
    ...meal,
    foods: meal.foods.map((mealFood) => ({ ...mealFood, checked: true })),
  }));
  const checkedSummary = buildDailySummary(date, checkedMeals);

  assert.equal(checkedSummary.checkedNutritionTotal.caloriesKcal, 400);
  assert.equal(checkedSummary.checkedNutritionTotal.proteinG, 20);
  assert.deepEqual(appliedTargets, expectedTargets);

  const deletedMeals: Meal[] = checkedMeals.map((meal) => ({
    ...meal,
    foods: meal.foods.filter((mealFood) => mealFood.id !== 'meal-food-first'),
  }));
  const deletedSummary = buildDailySummary(date, deletedMeals);

  assert.equal(deletedSummary.checkedNutritionTotal.caloriesKcal, 300);
  assert.equal(deletedSummary.checkedNutritionTotal.proteinG, 15);
  assert.deepEqual(appliedTargets, expectedTargets);
});