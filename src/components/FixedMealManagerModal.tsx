import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { mealLabels } from '../constants';
import {
  fixedMealWeekdayLabels,
  fixedMealWeekdayPresets,
  fixedMealWeekdays,
  formatFixedMealWeekdays,
  normalizeFixedMealWeekdays,
} from '../fixedMealRecurrence';
import type { FixedMealTemplate, FixedMealWeekday, Food, MealType } from '../models';
import { formatNutritionValue } from '../nutrition';
import { styles } from '../styles';
import { formatAmountLabel } from '../utils/format';
import { getFoodDisplayName } from '../utils/foodDisplay';
import { PrimaryButton, SecondaryButton } from './ui';

type FixedMealManagerModalProps = {
  foodsById: Record<string, Food>;
  mealType: MealType | null;
  onAddFixedMeal: (mealType: MealType) => void;
  onClose: () => void;
  onRemoveTemplate: (templateId: string) => void;
  onSetTemplateActive: (templateId: string, isActive: boolean) => void;
  onSetTemplateWeekdays: (templateId: string, weekdays: readonly FixedMealWeekday[]) => void;
  onToggleTemplateWeekday: (templateId: string, weekday: FixedMealWeekday) => void;
  templates: FixedMealTemplate[];
};

export function FixedMealManagerModal({
  foodsById,
  mealType,
  onAddFixedMeal,
  onClose,
  onRemoveTemplate,
  onSetTemplateActive,
  onSetTemplateWeekdays,
  onToggleTemplateWeekday,
  templates,
}: FixedMealManagerModalProps) {
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState<string | null>(null);
  const scopedTemplates = useMemo(
    () => templates.filter((template) => template.mealType === mealType),
    [mealType, templates],
  );

  if (mealType === null) {
    return null;
  }

  const mealLabel = mealLabels[mealType];
  const closeModal = () => {
    setPendingDeleteTemplateId(null);
    onClose();
  };
  const removeTemplate = (templateId: string) => {
    onRemoveTemplate(templateId);
    setPendingDeleteTemplateId(null);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={closeModal}
      transparent
      visible
    >
      <View style={styles.modalOverlay} testID="fixed-meal-manager-modal">
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={closeModal}
          style={styles.modalScrim}
        />
        <View
          accessibilityLabel={`${mealLabel} 고정 식단 관리 대화상자`}
          accessibilityViewIsModal
          aria-modal={true}
          importantForAccessibility="yes"
          role="dialog"
          style={styles.fixedMealManagerSheet}
        >
          <View style={styles.fixedMealManagerHeader}>
            <View style={styles.fixedMealManagerTitleBlock}>
              <Text style={styles.fixedMealManagerTitle}>{mealLabel} 고정 식단</Text>
              <Text style={styles.fixedMealManagerSubtitle}>요일별로 자동 추가됩니다.</Text>
            </View>
            <Pressable
              accessibilityLabel={`${mealLabel} 고정 식단 닫기`}
              accessibilityRole="button"
              onPress={closeModal}
              style={({ pressed }) => [
                styles.fixedMealManagerCloseButton,
                pressed ? styles.addFoodCompactButtonPressed : null,
              ]}
            >
              <Text style={styles.fixedMealManagerCloseText}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.fixedMealManagerBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {scopedTemplates.length > 0 ? (
              scopedTemplates.map((template) => (
                <FixedMealScheduleRow
                  foodsById={foodsById}
                  key={template.id}
                  onCancelDelete={() => setPendingDeleteTemplateId(null)}
                  onConfirmDelete={removeTemplate}
                  onRequestDelete={setPendingDeleteTemplateId}
                  onSetActive={onSetTemplateActive}
                  onSetWeekdays={onSetTemplateWeekdays}
                  onToggleWeekday={onToggleTemplateWeekday}
                  pendingDelete={pendingDeleteTemplateId === template.id}
                  template={template}
                />
              ))
            ) : (
              <View style={styles.fixedMealManagerEmptyState}>
                <Text style={styles.fixedMealManagerEmptyTitle}>아직 등록된 고정 식단이 없어요.</Text>
                <Text style={styles.fixedMealManagerEmptyText}>
                  요일을 선택해 자동으로 추가할 수 있어요.
                </Text>
              </View>
            )}

            <Pressable
              accessibilityLabel={`${mealLabel} 고정 식단 추가`}
              accessibilityRole="button"
              onPress={() => onAddFixedMeal(mealType)}
              style={({ pressed }) => [
                styles.fixedMealManagerAddButton,
                pressed ? styles.addFoodCompactButtonPressed : null,
              ]}
              testID={`fixed-meal-add-${mealType}`}
            >
              <Text style={styles.fixedMealManagerAddIcon}>+</Text>
              <Text style={styles.fixedMealManagerAddText}>고정 식단 추가</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type FixedMealScheduleRowProps = {
  foodsById: Record<string, Food>;
  onCancelDelete: () => void;
  onConfirmDelete: (templateId: string) => void;
  onRequestDelete: (templateId: string) => void;
  onSetActive: (templateId: string, isActive: boolean) => void;
  onSetWeekdays: (templateId: string, weekdays: readonly FixedMealWeekday[]) => void;
  onToggleWeekday: (templateId: string, weekday: FixedMealWeekday) => void;
  pendingDelete: boolean;
  template: FixedMealTemplate;
};

function FixedMealScheduleRow({
  foodsById,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  onSetActive,
  onSetWeekdays,
  onToggleWeekday,
  pendingDelete,
  template,
}: FixedMealScheduleRowProps) {
  const weekdays = normalizeFixedMealWeekdays(template.weekdays);
  const primaryItem = template.items[0];
  const primaryFood = primaryItem === undefined
    ? null
    : foodsById[primaryItem.foodId] ?? primaryItem.foodSnapshot;
  const title = primaryFood === null ? template.name : getFoodDisplayName(primaryFood);
  const itemMeta = primaryItem === undefined
    ? `${template.items.length}개 음식`
    : `${formatAmountLabel(primaryItem.consumedGrams)}g · ${formatNutritionValue('caloriesKcal', primaryItem.calculatedNutrition.caloriesKcal)}`;

  return (
    <View
      style={[
        styles.fixedMealManagerScheduleRow,
        !template.isActive ? styles.fixedMealManagerScheduleRowInactive : null,
      ]}
      testID={`fixed-meal-template-${template.id}`}
    >
      <View style={styles.fixedMealManagerScheduleHeader}>
        <View style={styles.fixedMealManagerScheduleTitleBlock}>
          <Text style={styles.fixedMealManagerFoodName}>{title}</Text>
          <Text style={styles.fixedMealManagerFoodMeta}>{itemMeta}</Text>
          <Text style={styles.fixedMealManagerScheduleMeta}>
            {formatFixedMealWeekdays(weekdays)} · {template.isActive ? '활성' : '비활성'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`${title} ${template.isActive ? '비활성화' : '활성화'}`}
          accessibilityRole="switch"
          accessibilityState={{ checked: template.isActive }}
          onPress={() => onSetActive(template.id, !template.isActive)}
          style={({ pressed }) => [
            styles.fixedMealManagerActiveSwitch,
            template.isActive ? styles.fixedMealManagerActiveSwitchOn : null,
            pressed ? styles.addFoodCompactButtonPressed : null,
          ]}
          testID={`fixed-meal-active-${template.id}`}
        >
          <Text
            style={[
              styles.fixedMealManagerActiveSwitchText,
              template.isActive ? styles.fixedMealManagerActiveSwitchTextOn : null,
            ]}
          >
            {template.isActive ? '활성' : '끔'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.fixedMealPresetRow}>
        {fixedMealWeekdayPresets.map((preset) => (
          <Pressable
            accessibilityLabel={`${title} ${preset.label} 반복 설정`}
            accessibilityRole="button"
            key={preset.key}
            onPress={() => onSetWeekdays(template.id, preset.weekdays)}
            style={({ pressed }) => [
              styles.fixedMealPresetButton,
              isSameWeekdaySelection(weekdays, preset.weekdays) ? styles.fixedMealPresetButtonSelected : null,
              pressed ? styles.addFoodCompactButtonPressed : null,
            ]}
            testID={`fixed-meal-preset-${template.id}-${preset.key}`}
          >
            <Text
              style={[
                styles.fixedMealPresetButtonText,
                isSameWeekdaySelection(weekdays, preset.weekdays) ? styles.fixedMealPresetButtonTextSelected : null,
              ]}
            >
              {preset.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.fixedMealWeekdayRow}>
        {fixedMealWeekdays.map((weekday) => {
          const selected = weekdays.includes(weekday);
          const disabled = selected && weekdays.length === 1;

          return (
            <Pressable
              accessibilityLabel={`${title} ${fixedMealWeekdayLabels[weekday]}요일 반복 ${selected ? '선택됨' : '미선택'}`}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={weekday}
              onPress={() => onToggleWeekday(template.id, weekday)}
              style={({ pressed }) => [
                styles.fixedMealWeekdayChip,
                selected ? styles.fixedMealWeekdayChipSelected : null,
                disabled ? styles.fixedMealWeekdayChipDisabled : null,
                pressed && !disabled ? styles.addFoodCompactButtonPressed : null,
              ]}
              testID={`fixed-meal-weekday-${template.id}-${weekday}`}
            >
              <Text
                style={[
                  styles.fixedMealWeekdayChipText,
                  selected ? styles.fixedMealWeekdayChipTextSelected : null,
                ]}
              >
                {fixedMealWeekdayLabels[weekday]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.fixedMealManagerDeleteRow}>
        <SecondaryButton
          accessibilityLabel={`${title} 삭제 확인 열기`}
          label="삭제"
          onPress={() => onRequestDelete(template.id)}
          style={styles.fixedMealManagerDeleteButton}
          textStyle={styles.fixedMealManagerDeleteButtonText}
        />
      </View>

      {pendingDelete ? (
        <View style={styles.fixedMealManagerConfirmBox}>
          <Text style={styles.fixedMealManagerConfirmText}>
            삭제하면 앞으로 예정 식단에 나타나지 않습니다. 이미 기록된 식사 기록은 유지됩니다.
          </Text>
          <View style={styles.fixedMealManagerConfirmActions}>
            <SecondaryButton
              accessibilityLabel={`${title} 삭제 취소`}
              label="취소"
              onPress={onCancelDelete}
              style={styles.fixedMealManagerConfirmButton}
            />
            <PrimaryButton
              accessibilityLabel={`${title} 삭제 확인`}
              label="삭제 확인"
              onPress={() => onConfirmDelete(template.id)}
              style={[styles.fixedMealManagerConfirmButton, styles.fixedMealManagerConfirmDeleteButton]}
              textStyle={styles.fixedMealManagerConfirmDeleteButtonText}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function isSameWeekdaySelection(
  firstWeekdays: readonly FixedMealWeekday[],
  secondWeekdays: readonly FixedMealWeekday[],
): boolean {
  const firstNormalized = normalizeFixedMealWeekdays(firstWeekdays);
  const secondNormalized = normalizeFixedMealWeekdays(secondWeekdays);

  return firstNormalized.length === secondNormalized.length
    && firstNormalized.every((weekday, index) => weekday === secondNormalized[index]);
}
