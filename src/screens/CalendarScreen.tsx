import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  buildCalendarDayDetails,
  buildCalendarStatusByDate,
  calendarDayStatusLabels,
  calendarDayStatusShortLabels,
  countGroupedMealFoods,
  getCalendarDayStatusBadgeTone,
  getCalendarDayStatusMessage,
} from '../calendar';
import type { CalendarDayDetails, CalendarDayStatus, MealFoodsByType } from '../calendar';
import {
  AppCard,
  IconButton,
  MacroProgressRow,
  PrimaryButton,
  StatusBadge,
} from '../components/ui';
import type { StatusBadgeTone } from '../components/ui';
import { mealLabels } from '../constants';
import { mealTypes } from '../meals';
import type {
  FixedMealTemplate,
  Food,
  HiddenFixedMealSourceKeysByDate,
  MealFood,
  MealsByDate,
} from '../models';
import {
  formatNutritionValue,
  nutritionLabels,
  primaryNutritionFields,
} from '../nutrition';
import type { DailyNutritionTargets, PrimaryNutritionField } from '../nutrition';
import { styles } from '../styles';
import {
  buildCalendarMonthGrid,
  getCalendarMonthFromDate,
  getLocalDateString,
  resolveSelectedCalendarDate,
  shiftCalendarMonth,
} from '../utils/date';
import { formatAmountLabel, formatDateLabel } from '../utils/format';

const weekDayLabels = ['일', '월', '화', '수', '목', '금', '토'];

type CalendarScreenProps = {
  fixedMealTemplates: FixedMealTemplate[];
  foods: Food[];
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate;
  mealsByDate: MealsByDate;
  onOpenToday: () => void;
  onSelectedDateChange: (date: string) => void;
  selectedDate: string;
  targets: DailyNutritionTargets;
};

export function CalendarScreen({
  fixedMealTemplates,
  foods,
  hiddenFixedMealSourceKeys,
  mealsByDate,
  onOpenToday,
  onSelectedDateChange,
  selectedDate,
  targets,
}: CalendarScreenProps) {
  const todayDate = getLocalDateString();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCalendarMonthFromDate(todayDate),
  );
  const monthCells = useMemo(
    () => buildCalendarMonthGrid(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  );
  const calendarStatusByDate = useMemo(
    () => buildCalendarStatusByDate(
      monthCells.map((cell) => cell.date),
      {
        fixedMealTemplates,
        hiddenFixedMealSourceKeys,
        mealsByDate,
        targets,
        todayDate,
      },
    ),
    [fixedMealTemplates, hiddenFixedMealSourceKeys, mealsByDate, monthCells, targets, todayDate],
  );
  const selectedDayDetails = useMemo(
    () => buildCalendarDayDetails({
      date: selectedDate,
      fixedMealTemplates,
      hiddenFixedMealSourceKeys,
      mealsByDate,
      targets,
      todayDate,
    }),
    [fixedMealTemplates, hiddenFixedMealSourceKeys, mealsByDate, selectedDate, targets, todayDate],
  );
  const foodsById = useMemo<Record<string, Food>>(
    () => Object.fromEntries(foods.map((food) => [food.id, food])) as Record<string, Food>,
    [foods],
  );

  const selectDate = (date: string) => {
    onSelectedDateChange(resolveSelectedCalendarDate(date, selectedDate));
  };

  const moveMonth = (monthDelta: number) => {
    setVisibleMonth((currentMonth) => shiftCalendarMonth(currentMonth, monthDelta));
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Calendar</Text>
        <Text style={styles.title}>식단 일정</Text>
        <Text style={styles.dateText}>월간 달력에서 날짜별 식단 상태를 확인합니다.</Text>
      </View>

      <AppCard style={styles.calendarCard}>
        <View style={styles.calendarMonthHeader}>
          <IconButton
            accessibilityLabel="이전 달"
            icon="‹"
            onPress={() => moveMonth(-1)}
            style={styles.calendarNavButton}
            textStyle={styles.calendarNavButtonText}
          />
          <View style={styles.calendarMonthTitleBlock}>
            <Text style={styles.calendarMonthTitle}>
              {visibleMonth.year}년 {visibleMonth.month}월
            </Text>
            <Text style={styles.calendarMonthSubtitle}>날짜별 평가와 예정 식단</Text>
          </View>
          <IconButton
            accessibilityLabel="다음 달"
            icon="›"
            onPress={() => moveMonth(1)}
            style={styles.calendarNavButton}
            textStyle={styles.calendarNavButtonText}
          />
        </View>

        <View style={styles.calendarWeekHeader}>
          {weekDayLabels.map((label) => (
            <View key={label} style={styles.calendarWeekdayCell}>
              <Text style={styles.calendarWeekdayText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {monthCells.map((cell) => {
            const status = calendarStatusByDate[cell.date] ?? 'noRecord';
            const selected = cell.date === selectedDate;
            const today = cell.date === todayDate;

            return (
              <Pressable
                accessibilityLabel={`${formatDateLabel(cell.date)} ${calendarDayStatusLabels[status]}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={`${cell.date}-${cell.weekIndex}-${cell.weekdayIndex}`}
                onPress={() => selectDate(cell.date)}
                style={({ pressed }) => [
                  styles.calendarDayCell,
                  !cell.isCurrentMonth ? styles.calendarDayCellOutside : null,
                  today ? styles.calendarDayCellToday : null,
                  selected ? styles.calendarDayCellSelected : null,
                  pressed ? styles.calendarDayCellPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.calendarDayNumber,
                    !cell.isCurrentMonth ? styles.calendarDayNumberMuted : null,
                    selected ? styles.calendarDayNumberSelected : null,
                  ]}
                >
                  {cell.day}
                </Text>
                <View style={styles.calendarStatusRow}>
                  <View
                    style={[
                      styles.calendarStatusDot,
                      getCalendarStatusDotStyle(status),
                      selected ? styles.calendarStatusDotSelected : null,
                    ]}
                  />
                  <Text
                    style={[
                      styles.calendarStatusText,
                      selected ? styles.calendarStatusTextSelected : null,
                    ]}
                  >
                    {calendarDayStatusShortLabels[status]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </AppCard>

      <SelectedDateSummaryCard
        details={selectedDayDetails}
        foodsById={foodsById}
        onOpenToday={onOpenToday}
        targets={targets}
      />
    </ScrollView>
  );
}

type SelectedDateSummaryCardProps = {
  details: CalendarDayDetails;
  foodsById: Record<string, Food>;
  onOpenToday: () => void;
  targets: DailyNutritionTargets;
};

function SelectedDateSummaryCard({
  details,
  foodsById,
  onOpenToday,
  targets,
}: SelectedDateSummaryCardProps) {
  const fixedMealFoodCount = countGroupedMealFoods(details.fixedMealFoodsByType);
  const directMealFoodCount = countGroupedMealFoods(details.directMealFoodsByType);
  const calories = details.summary.checkedNutritionTotal.caloriesKcal;
  const protein = details.summary.checkedNutritionTotal.proteinG;

  return (
    <AppCard style={styles.calendarSummaryCard}>
      <View style={styles.summaryHeader}>
        <View style={styles.calendarSummaryTitleBlock}>
          <Text style={styles.sectionTitle}>{formatDateLabel(details.date)}</Text>
          <Text style={styles.sectionSubtitle}>{getCalendarDayStatusMessage(details)}</Text>
        </View>
        <StatusBadge
          label={calendarDayStatusLabels[details.status]}
          tone={getEvaluationStatusBadgeTone(details.status)}
        />
      </View>

      <View style={styles.calendarSummaryTopGrid}>
        <View style={styles.calendarSummaryMetric}>
          <Text style={styles.calendarSummaryMetricLabel}>칼로리</Text>
          <Text style={styles.calendarSummaryMetricValue}>
            {formatNutritionValue('caloriesKcal', calories)}
          </Text>
          <Text style={styles.calendarSummaryMetricMeta}>
            목표 {formatNutritionValue('caloriesKcal', targets.caloriesKcal)}
          </Text>
        </View>
        <View style={styles.calendarSummaryMetric}>
          <Text style={styles.calendarSummaryMetricLabel}>단백질</Text>
          <Text style={styles.calendarSummaryMetricValue}>
            {formatNutritionValue('proteinG', protein)}
          </Text>
          <Text style={styles.calendarSummaryMetricMeta}>
            목표 {formatNutritionValue('proteinG', targets.proteinG)}
          </Text>
        </View>
      </View>

      <View style={styles.calendarCountRow}>
        <Text style={styles.calendarCountPill}>
          체크 {details.summary.checkedCount}/{details.summary.totalCount}개
        </Text>
        <Text style={styles.calendarCountPill}>고정 {fixedMealFoodCount}개</Text>
        <Text style={styles.calendarCountPill}>직접 추가 {directMealFoodCount}개</Text>
      </View>

      <View style={styles.calendarNutrientStack}>
        {primaryNutritionFields.map((field) => (
          <CalendarNutritionRow
            field={field}
            key={field}
            target={targets[field]}
            value={details.summary.checkedNutritionTotal[field]}
          />
        ))}
      </View>

      <View style={styles.calendarMealLists}>
        <MealFoodSummaryList
          emptyText="선택 날짜에 예정된 고정 식단이 없습니다."
          fixed
          foodsById={foodsById}
          mealFoodsByType={details.fixedMealFoodsByType}
          title="고정 식단"
        />
        <MealFoodSummaryList
          emptyText="사용자가 직접 추가한 식단이 없습니다."
          foodsById={foodsById}
          mealFoodsByType={details.directMealFoodsByType}
          title="직접 추가 식단"
        />
      </View>

      <PrimaryButton
        accessibilityLabel={`${formatDateLabel(details.date)} 식단 보기`}
        label="이 날짜 식단 보기"
        onPress={onOpenToday}
        style={styles.calendarSummaryAction}
      />
    </AppCard>
  );
}

type CalendarNutritionRowProps = {
  field: PrimaryNutritionField;
  target: number;
  value: number | null;
};

function CalendarNutritionRow({ field, target, value }: CalendarNutritionRowProps) {
  const progress = value === null || target <= 0 ? 0 : Math.min(value / target, 1);
  const percentLabel = value === null || target <= 0
    ? '0%'
    : `${Math.round((value / target) * 100)}%`;

  return (
    <MacroProgressRow
      label={nutritionLabels[field]}
      meta={`목표 대비 ${percentLabel}`}
      progress={progress}
      tone={getMacroTone(field)}
      value={`${formatNutritionValue(field, value)} / ${formatNutritionValue(field, target)}`}
    />
  );
}

type MealFoodSummaryListProps = {
  emptyText: string;
  fixed?: boolean;
  foodsById: Record<string, Food>;
  mealFoodsByType: MealFoodsByType;
  title: string;
};

function MealFoodSummaryList({
  emptyText,
  fixed = false,
  foodsById,
  mealFoodsByType,
  title,
}: MealFoodSummaryListProps) {
  const hasFoods = mealTypes.some((mealType) => mealFoodsByType[mealType].length > 0);

  return (
    <View style={styles.calendarMealListSection}>
      <Text style={styles.calendarMealListTitle}>{title}</Text>
      {hasFoods ? (
        mealTypes.map((mealType) => {
          const mealFoods = mealFoodsByType[mealType];

          if (mealFoods.length === 0) {
            return null;
          }

          return (
            <View key={`${title}-${mealType}`} style={styles.calendarMealGroup}>
              <Text style={styles.calendarMealGroupTitle}>{mealLabels[mealType]}</Text>
              {mealFoods.map((mealFood) => (
                <MealFoodSummaryRow
                  fixed={fixed}
                  food={foodsById[mealFood.foodId]}
                  key={mealFood.id}
                  mealFood={mealFood}
                />
              ))}
            </View>
          );
        })
      ) : (
        <Text style={styles.calendarEmptyText}>{emptyText}</Text>
      )}
    </View>
  );
}

type MealFoodSummaryRowProps = {
  fixed: boolean;
  food: Food | undefined;
  mealFood: MealFood;
};

function MealFoodSummaryRow({ fixed, food, mealFood }: MealFoodSummaryRowProps) {
  return (
    <View style={styles.calendarFoodSummaryRow}>
      <View style={styles.calendarFoodTitleBlock}>
        <View style={styles.calendarFoodNameRow}>
          <Text style={styles.calendarFoodName}>{food?.name ?? '알 수 없는 음식'}</Text>
          {fixed ? <Text style={styles.fixedMealBadge}>고정 식단</Text> : null}
        </View>
        <Text style={styles.calendarFoodMeta}>
          {formatAmountLabel(mealFood.consumedGrams)}g · {mealFood.checked ? '체크됨' : '예정'}
        </Text>
      </View>
      <Text style={styles.calendarFoodKcalText}>
        {formatNutritionValue('caloriesKcal', mealFood.calculatedNutrition.caloriesKcal)}
      </Text>
    </View>
  );
}

function getCalendarStatusDotStyle(status: CalendarDayStatus) {
  if (status === 'excellent' || status === 'good') {
    return styles.calendarStatusDotGood;
  }

  if (status === 'low' || status === 'high') {
    return styles.calendarStatusDotWarning;
  }

  if (status === 'incomplete') {
    return styles.calendarStatusDotIncomplete;
  }

  if (status === 'scheduled') {
    return styles.calendarStatusDotScheduled;
  }

  return styles.calendarStatusDotEmpty;
}

function getEvaluationStatusBadgeTone(status: CalendarDayStatus): StatusBadgeTone {
  const tone = getCalendarDayStatusBadgeTone(status);

  if (tone === 'positive') {
    return 'success';
  }

  if (tone === 'warning') {
    return 'warning';
  }

  if (tone === 'scheduled') {
    return 'scheduled';
  }

  if (tone === 'empty') {
    return 'neutral';
  }

  return 'danger';
}

function getMacroTone(
  field: PrimaryNutritionField,
): 'calories' | 'carbohydrate' | 'fat' | 'protein' {
  if (field === 'caloriesKcal') {
    return 'calories';
  }

  if (field === 'carbohydrateG') {
    return 'carbohydrate';
  }

  if (field === 'fatG') {
    return 'fat';
  }

  return 'protein';
}
