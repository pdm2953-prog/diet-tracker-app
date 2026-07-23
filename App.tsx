import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

import {
  applyFixedMealTemplatesToMeals,
  createPromotedFixedMealTemplateIds,
  getFixedMealTemplateFoodSnapshots,
  getHiddenFixedMealSourceKeysForDate,
  promoteMealFoodInMeals,
  promoteMealFoodToFixedMeal,
  hideFixedMealSourceKeyForDate,
} from './src/fixedMeals';
import { shouldPersistAppDataSnapshot, shouldRenderInteractiveApp } from './src/appHydration';
import { getMealsForDate } from './src/meals';
import { createMockTodayData } from './src/mockTodayData';
import type {
  FixedMealTemplate,
  Food,
  HiddenFixedMealSourceKeysByDate,
  Meal,
  MealFood,
  MealsByDate,
  MealType,
} from './src/models';
import type { DailyNutritionTargets } from './src/nutrition';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TargetScreen } from './src/screens/TargetScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import {
  createDefaultAppDataSnapshot,
  loadAppDataSnapshot,
  saveAppDataSnapshot,
} from './src/storage';
import { styles } from './src/styles';
import { getLocalDateString } from './src/utils/format';


type ScreenKey = 'today' | 'calendar' | 'target' | 'settings';

type InitialAppState = {
  fixedMealTemplates: FixedMealTemplate[];
  foods: Food[];
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate;
  mealsByDate: MealsByDate;
  selectedDate: string;
  todayTargets: DailyNutritionTargets;
};

const screenTabs: Array<{ key: ScreenKey; label: string }> = [
  { key: 'today', label: '오늘' },
  { key: 'calendar', label: '식단 일정' },
  { key: 'target', label: '목표' },
  { key: 'settings', label: '설정' },
];

const screenPaneStyle: ViewStyle = { flex: 1 };
const hiddenScreenPaneStyle: ViewStyle = { display: 'none' };
const tabButtonFillStyle: ViewStyle = { flex: 1 };

function createInitialAppState(): InitialAppState {
  const selectedDate = getLocalDateString();
  const mockData = createMockTodayData(selectedDate);
  const fallbackData = createDefaultAppDataSnapshot(mockData.foods, {
    [selectedDate]: mockData.meals,
  });
  return {
    selectedDate,
    fixedMealTemplates: fallbackData.fixedMealTemplates,
    foods: fallbackData.foods,
    hiddenFixedMealSourceKeys: fallbackData.hiddenFixedMealSourceKeys,
    mealsByDate: fallbackData.mealsByDate,
    todayTargets: fallbackData.todayTargets,
  };
}

function mergeFoodsById(foods: Food[], fixedMealTemplates: FixedMealTemplate[]): Food[] {
  const foodsById = new Map<string, Food>();

  for (const food of foods) {
    foodsById.set(food.id, food);
  }

  for (const food of getFixedMealTemplateFoodSnapshots(fixedMealTemplates)) {
    if (!foodsById.has(food.id)) {
      foodsById.set(food.id, food);
    }
  }

  return [...foodsById.values()];
}

export default function App() {
  const [initialAppState] = useState(createInitialAppState);
  const [activeTab, setActiveTab] = useState<ScreenKey>('today');
  const [selectedDate, setSelectedDate] = useState(initialAppState.selectedDate);
  const [foods, setFoods] = useState<Food[]>(initialAppState.foods);
  const [mealsByDate, setMealsByDate] = useState<MealsByDate>(initialAppState.mealsByDate);
  const [fixedMealTemplates, setFixedMealTemplates] = useState<FixedMealTemplate[]>(
    initialAppState.fixedMealTemplates,
  );
  const [hiddenFixedMealSourceKeys, setHiddenFixedMealSourceKeys] =
    useState<HiddenFixedMealSourceKeysByDate>(initialAppState.hiddenFixedMealSourceKeys);
  const [todayTargets, setTodayTargets] = useState<DailyNutritionTargets>(
    initialAppState.todayTargets,
  );
  const [storageLoaded, setStorageLoaded] = useState(false);
  const visibleFoods = useMemo(
    () => mergeFoodsById(foods, fixedMealTemplates),
    [fixedMealTemplates, foods],
  );
  const selectedMeals = useMemo(
    () => buildVisibleMealsForDate(selectedDate, mealsByDate),
    [fixedMealTemplates, hiddenFixedMealSourceKeys, mealsByDate, selectedDate],
  );

  function buildVisibleMealsForDate(
    date: string,
    currentMealsByDate: MealsByDate,
  ): Meal[] {
    return applyFixedMealTemplatesToMeals({
      date,
      fixedMealTemplates,
      hiddenSourceKeys: getHiddenFixedMealSourceKeysForDate(
        hiddenFixedMealSourceKeys,
        date,
      ),
      meals: getMealsForDate(currentMealsByDate, date),
      timestamp: `${date}T00:00:00.000`,
    });
  }

  useEffect(() => {
    let isMounted = true;
    const fallbackData = {
      fixedMealTemplates: initialAppState.fixedMealTemplates,
      foods: initialAppState.foods,
      hiddenFixedMealSourceKeys: initialAppState.hiddenFixedMealSourceKeys,
      mealsByDate: initialAppState.mealsByDate,
      todayTargets: initialAppState.todayTargets,
    };

    loadAppDataSnapshot(fallbackData).then((restoredData) => {
      if (!isMounted) {
        return;
      }

      setFixedMealTemplates(restoredData.fixedMealTemplates);
      setFoods(restoredData.foods);
      setHiddenFixedMealSourceKeys(restoredData.hiddenFixedMealSourceKeys);
      setMealsByDate(restoredData.mealsByDate);
      setTodayTargets(restoredData.todayTargets);
      setStorageLoaded(true);
    });

    return () => {
      isMounted = false;
    };
  }, [initialAppState]);

  useEffect(() => {
    if (!shouldPersistAppDataSnapshot(storageLoaded)) {
      return;
    }

    void saveAppDataSnapshot({
      fixedMealTemplates,
      foods,
      hiddenFixedMealSourceKeys,
      mealsByDate,
      todayTargets,
    });
  }, [fixedMealTemplates, foods, hiddenFixedMealSourceKeys, mealsByDate, storageLoaded, todayTargets]);

  const updateSelectedDateMeals = (
    updatedAt: string,
    updateMeals: (currentMeals: Meal[]) => Meal[],
  ) => {
    setMealsByDate((currentMealsByDate) => ({
      ...currentMealsByDate,
      [selectedDate]: updateMeals(buildVisibleMealsForDate(selectedDate, currentMealsByDate)),
    }));
  };

  const createFixedMealTemplate = (
    mealType: MealType,
    mealFood: MealFood,
    food: Food,
  ) => {
    const timestamp = new Date().toISOString();
    const { templateId, templateItemId } = createPromotedFixedMealTemplateIds(
      mealType,
      mealFood,
    );
    const promotion = promoteMealFoodToFixedMeal({
      fixedMealTemplates,
      food,
      mealFood,
      mealType,
      templateId,
      templateItemId,
      timestamp,
    });
    const sourceFields = promotion.sourceFields;

    if (sourceFields === null) {
      return;
    }

    setFixedMealTemplates((currentTemplates) =>
      promoteMealFoodToFixedMeal({
        fixedMealTemplates: currentTemplates,
        food,
        mealFood,
        mealType,
        templateId,
        templateItemId,
        timestamp,
      }).fixedMealTemplates,
    );

    setMealsByDate((currentMealsByDate) => ({
      ...currentMealsByDate,
      [selectedDate]: promoteMealFoodInMeals({
        mealFoodId: mealFood.id,
        meals: buildVisibleMealsForDate(selectedDate, currentMealsByDate),
        sourceFields,
        timestamp,
      }),
    }));
  };

  const toggleFixedMealTemplate = (templateId: string) => {
    const updatedAt = new Date().toISOString();

    setFixedMealTemplates((currentTemplates) =>
      currentTemplates.map((template) =>
        template.id === templateId
          ? { ...template, isActive: !template.isActive, updatedAt }
          : template,
      ),
    );
  };

  const removeFixedMealTemplate = (templateId: string) => {
    setFixedMealTemplates((currentTemplates) =>
      currentTemplates.filter((template) => template.id !== templateId),
    );
  };

  const hideFixedMealForDate = (date: string, sourceKey: string) => {
    setHiddenFixedMealSourceKeys((currentSourceKeys) =>
      hideFixedMealSourceKeyForDate(currentSourceKeys, date, sourceKey),
    );
  };

  if (!shouldRenderInteractiveApp(storageLoaded)) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingTitle}>식단 데이터를 불러오는 중</Text>
          <Text style={styles.loadingText}>저장된 식단과 목표를 확인하고 있습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.appContent}>
        <View style={[screenPaneStyle, activeTab !== 'today' ? hiddenScreenPaneStyle : null]}>
          <TodayScreen
            foods={visibleFoods}
            onCreateFixedMealTemplate={createFixedMealTemplate}
            onFoodsChange={setFoods}
            onHideFixedMealSourceKey={hideFixedMealForDate}
            onSelectedDateChange={setSelectedDate}
            onUpdateSelectedDateMeals={updateSelectedDateMeals}
            selectedDate={selectedDate}
            selectedMeals={selectedMeals}
            targets={todayTargets}
          />
        </View>
        <View style={[screenPaneStyle, activeTab !== 'calendar' ? hiddenScreenPaneStyle : null]}>
          <CalendarScreen
            fixedMealTemplates={fixedMealTemplates}
            foods={visibleFoods}
            hiddenFixedMealSourceKeys={hiddenFixedMealSourceKeys}
            mealsByDate={mealsByDate}
            onOpenToday={() => setActiveTab('today')}
            onSelectedDateChange={setSelectedDate}
            selectedDate={selectedDate}
            targets={todayTargets}
          />
        </View>
        <View style={[screenPaneStyle, activeTab !== 'target' ? hiddenScreenPaneStyle : null]}>
          <TargetScreen
            currentTargets={todayTargets}
            onTargetsChange={(targets) => setTodayTargets(targets)}
          />
        </View>
        <View style={[screenPaneStyle, activeTab !== 'settings' ? hiddenScreenPaneStyle : null]}>
          <SettingsScreen
            fixedMealTemplates={fixedMealTemplates}
            foods={visibleFoods}
            onRemoveFixedMealTemplate={removeFixedMealTemplate}
            onToggleFixedMealTemplate={toggleFixedMealTemplate}
          />
        </View>
      </View>

      <View style={styles.tabBar}>
        {screenTabs.map((tab) => {
          const selected = activeTab === tab.key;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={({ pressed }) => [
                styles.tabButton,
                tabButtonFillStyle,
                selected ? styles.tabButtonActive : null,
                pressed ? styles.tabButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  selected ? styles.tabButtonTextActive : null,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
