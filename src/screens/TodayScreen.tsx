import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FoodPortionModal } from '../components/FoodPortionModal';
import type { FoodPortionModalState } from '../components/FoodPortionModal';
import { FoodSearchPanel } from '../components/FoodSearchPanel';
import { MealSection } from '../components/MealSection';
import { NutritionSummaryPanel } from '../components/NutritionSummaryPanel';
import { GRAM_ADJUST_STEP } from '../constants';
import {
  addFoodToMeals,
  hasValidGramServing,
  normalizeConsumedGrams,
} from '../meals';
import { createMockTodayData } from '../mockTodayData';
import type { Food, Meal, MealType } from '../models';
import {
  buildDailySummary,
  calculateNutritionForConsumedGrams,
} from '../nutrition';
import type { DailyNutritionTargets } from '../nutrition';
import {
  FOOD_SEARCH_RESULT_LIMIT,
  mockFoodSearchProvider,
} from '../services/foodSearch';
import type { FoodSearchResult } from '../services/foodSearch';
import { styles } from '../styles';
import {
  formatAmountLabel,
  formatDateLabel,
  getLocalDateString,
  parseNumberInput,
} from '../utils/format';

let mealFoodIdSequence = 0;

type TodayScreenProps = {
  targets: DailyNutritionTargets;
};

function createMealFoodId(foodId: string): string {
  mealFoodIdSequence += 1;

  return `meal-food-${foodId}-${Date.now()}-${mealFoodIdSequence}`;
}

export function TodayScreen({ targets }: TodayScreenProps) {
  const today = useMemo(() => getLocalDateString(), []);
  const mockData = useMemo(() => createMockTodayData(today), [today]);
  const [foods, setFoods] = useState<Food[]>(() => mockData.foods);
  const [meals, setMeals] = useState<Meal[]>(() => mockData.meals);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeSearchMealType, setActiveSearchMealType] = useState<MealType | null>(null);
  const [portionModal, setPortionModal] = useState<FoodPortionModalState | null>(null);
  const [portionGramsInput, setPortionGramsInput] = useState('');
  const foodsById = useMemo<Record<string, Food>>(
    () =>
      Object.fromEntries(
        foods.map((food) => [food.id, food]),
      ) as Record<string, Food>,
    [foods],
  );
  const dailySummary = useMemo(
    () => buildDailySummary(today, meals),
    [meals, today],
  );

  const toggleMealFood = (mealId: string, mealFoodId: string) => {
    const updatedAt = new Date().toISOString();

    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.map((mealFood) =>
            mealFood.id === mealFoodId
              ? { ...mealFood, checked: !mealFood.checked, updatedAt }
              : mealFood,
          ),
        };
      }),
    );
  };

  const resetFoodSearchState = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setSearchError(null);
  };

  const openFoodSearch = (mealType: MealType) => {
    setActiveSearchMealType(mealType);
    resetFoodSearchState();
  };

  const closeFoodSearch = () => {
    setActiveSearchMealType(null);
    resetFoodSearchState();
  };

  useEffect(() => {
    const query = searchQuery.trim();

    if (activeSearchMealType === null || query.length === 0) {
      setHasSearched(false);
      setIsSearching(false);
      setSearchError(null);
      setSearchResults([]);
      return;
    }

    let isCurrent = true;

    setHasSearched(true);
    setIsSearching(true);
    setSearchError(null);

    mockFoodSearchProvider
      .searchFoods(query, { limit: FOOD_SEARCH_RESULT_LIMIT })
      .then((results) => {
        if (isCurrent) {
          setSearchResults(results);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSearchError('검색 중 오류가 발생했습니다.');
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsSearching(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeSearchMealType, searchQuery]);

  const addFoodToMeal = (
    food: FoodSearchResult,
    mealType: MealType,
    consumedGrams: number,
  ) => {
    const normalizedConsumedGrams = normalizeConsumedGrams(consumedGrams);

    if (!hasValidGramServing(food) || normalizedConsumedGrams <= 0) {
      return;
    }

    const updatedAt = new Date().toISOString();

    setFoods((currentFoods) =>
      currentFoods.some((currentFood) => currentFood.id === food.id)
        ? currentFoods
        : [...currentFoods, food],
    );

    setMeals((currentMeals) =>
      addFoodToMeals(currentMeals, food, mealType, normalizedConsumedGrams, {
        createMealFoodId,
        updatedAt,
      }),
    );
  };

  const closePortionModal = () => {
    setPortionModal(null);
    setPortionGramsInput('');
  };

  const openPortionModal = (food: FoodSearchResult, mealType: MealType) => {
    if (!hasValidGramServing(food)) {
      return;
    }

    setPortionModal({ food, mealType });
    setPortionGramsInput(formatAmountLabel(food.servingSize));
  };

  const confirmPortionModal = () => {
    if (portionModal === null) {
      return;
    }

    const consumedGrams = parseNumberInput(portionGramsInput);

    if (!Number.isFinite(consumedGrams) || consumedGrams <= 0) {
      return;
    }

    addFoodToMeal(portionModal.food, portionModal.mealType, consumedGrams);
    closePortionModal();
  };

  const updateMealFoodConsumedGrams = (
    mealId: string,
    mealFoodId: string,
    deltaGrams: number,
  ) => {
    const updatedAt = new Date().toISOString();

    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.flatMap((mealFood) => {
            if (mealFood.id !== mealFoodId) {
              return [mealFood];
            }

            const nextConsumedGrams = normalizeConsumedGrams(mealFood.consumedGrams) + deltaGrams;

            if (nextConsumedGrams <= 0) {
              return [];
            }

            const food = foodsById[mealFood.foodId];
            const calculatedNutrition = food && hasValidGramServing(food)
              ? calculateNutritionForConsumedGrams(
                  food.nutritionPerServing,
                  nextConsumedGrams,
                  food.servingSize,
                )
              : mealFood.calculatedNutrition;

            return [
              {
                ...mealFood,
                consumedGrams: nextConsumedGrams,
                calculatedNutrition,
                updatedAt,
              },
            ];
          }),
        };
      }),
    );
  };

  const decreaseMealFoodGrams = (mealId: string, mealFoodId: string) => {
    updateMealFoodConsumedGrams(mealId, mealFoodId, -GRAM_ADJUST_STEP);
  };

  const increaseMealFoodGrams = (mealId: string, mealFoodId: string) => {
    updateMealFoodConsumedGrams(mealId, mealFoodId, GRAM_ADJUST_STEP);
  };

  const removeMealFood = (mealId: string, mealFoodId: string) => {
    const updatedAt = new Date().toISOString();

    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.filter((mealFood) => mealFood.id !== mealFoodId),
        };
      }),
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Today</Text>
          <Text style={styles.title}>오늘 식단</Text>
          <Text style={styles.dateText}>{formatDateLabel(today)}</Text>
        </View>

        <NutritionSummaryPanel summary={dailySummary} targets={targets} />

        <View style={styles.mealStack}>
          {meals.map((meal) => (
            <MealSection
              key={meal.id}
              foodsById={foodsById}
              meal={meal}
              onDecreaseGrams={decreaseMealFoodGrams}
              onIncreaseGrams={increaseMealFoodGrams}
              onRemoveFood={removeMealFood}
              onOpenSearch={openFoodSearch}
              onToggle={toggleMealFood}
              searchPanel={
                activeSearchMealType === meal.type ? (
                  <FoodSearchPanel
                    hasSearched={hasSearched}
                    isSearching={isSearching}
                    mealType={meal.type}
                    onClose={closeFoodSearch}
                    onQueryChange={setSearchQuery}
                    onSelectFood={(food) => openPortionModal(food, meal.type)}
                    query={searchQuery}
                    results={searchResults}
                    searchError={searchError}
                  />
                ) : null
              }
              summary={dailySummary.mealSummaries.find(
                (mealSummary) => mealSummary.mealId === meal.id,
              )}
            />
          ))}
        </View>
      </ScrollView>

      <FoodPortionModal
        gramsInput={portionGramsInput}
        onChangeGramsInput={setPortionGramsInput}
        onClose={closePortionModal}
        onConfirm={confirmPortionModal}
        state={portionModal}
      />
    </>
  );
}
