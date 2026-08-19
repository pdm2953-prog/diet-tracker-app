import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { mealLabels } from '../constants';
import {
  formatFixedMealWeekdays,
  normalizeFixedMealWeekdays,
} from '../fixedMealRecurrence';
import type { FixedMealTemplate, FixedMealWeekday, Food, MealType } from '../models';
import { formatNutritionValue } from '../nutrition';
import { styles } from '../styles';
import { formatAmountLabel } from '../utils/format';
import { getFoodDisplayName } from '../utils/foodDisplay';
import { FixedMealWeekdaySelector } from './FixedMealWeekdaySelector';
import { PrimaryButton, SecondaryButton } from './ui';

type FixedMealManagerModalProps = {
  foodsById: Record<string, Food>;
  mealType: MealType | null;
  onAddFixedMeal: (mealType: MealType) => void;
  onClose: () => void;
  onRemoveTemplate: (templateId: string) => void;
  onSetTemplateActive: (templateId: string, isActive: boolean) => void;
  onSetTemplateWeekdays: (templateId: string, weekdays: readonly FixedMealWeekday[]) => void;
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
  templates,
}: FixedMealManagerModalProps) {
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingWeekdays, setEditingWeekdays] = useState<FixedMealWeekday[]>([]);
  const scopedTemplates = useMemo(
    () => templates.filter((template) => template.mealType === mealType),
    [mealType, templates],
  );

  if (mealType === null) {
    return null;
  }

  const mealLabel = mealLabels[mealType];
  const closeTemplateEdit = () => {
    setEditingTemplateId(null);
    setEditingWeekdays([]);
  };
  const closeModal = () => {
    setPendingDeleteTemplateId(null);
    closeTemplateEdit();
    onClose();
  };
  const startTemplateEdit = (template: FixedMealTemplate) => {
    setPendingDeleteTemplateId(null);
    setEditingTemplateId(template.id);
    setEditingWeekdays(normalizeFixedMealWeekdays(template.weekdays));
  };
  const saveTemplateEdit = () => {
    if (editingTemplateId === null || editingWeekdays.length === 0) {
      return;
    }

    onSetTemplateWeekdays(editingTemplateId, editingWeekdays);
    closeTemplateEdit();
  };
  const requestTemplateDelete = (templateId: string) => {
    closeTemplateEdit();
    setPendingDeleteTemplateId(templateId);
  };
  const removeTemplate = (templateId: string) => {
    onRemoveTemplate(templateId);
    setPendingDeleteTemplateId(null);

    if (editingTemplateId === templateId) {
      closeTemplateEdit();
    }
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
              <Text style={styles.fixedMealManagerSubtitle}>등록된 식단과 반복 요일을 확인합니다.</Text>
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
                  editingWeekdays={editingTemplateId === template.id ? editingWeekdays : normalizeFixedMealWeekdays(template.weekdays)}
                  foodsById={foodsById}
                  isEditing={editingTemplateId === template.id}
                  key={template.id}
                  onCancelDelete={() => setPendingDeleteTemplateId(null)}
                  onCancelEdit={closeTemplateEdit}
                  onChangeEditingWeekdays={setEditingWeekdays}
                  onConfirmDelete={removeTemplate}
                  onRequestDelete={requestTemplateDelete}
                  onRequestEdit={startTemplateEdit}
                  onSaveEdit={saveTemplateEdit}
                  onSetActive={onSetTemplateActive}
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
  editingWeekdays: readonly FixedMealWeekday[];
  foodsById: Record<string, Food>;
  isEditing: boolean;
  onCancelDelete: () => void;
  onCancelEdit: () => void;
  onChangeEditingWeekdays: (weekdays: FixedMealWeekday[]) => void;
  onConfirmDelete: (templateId: string) => void;
  onRequestDelete: (templateId: string) => void;
  onRequestEdit: (template: FixedMealTemplate) => void;
  onSaveEdit: () => void;
  onSetActive: (templateId: string, isActive: boolean) => void;
  pendingDelete: boolean;
  template: FixedMealTemplate;
};

function FixedMealScheduleRow({
  editingWeekdays,
  foodsById,
  isEditing,
  onCancelDelete,
  onCancelEdit,
  onChangeEditingWeekdays,
  onConfirmDelete,
  onRequestDelete,
  onRequestEdit,
  onSaveEdit,
  onSetActive,
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
  const recurrenceSummary = formatFixedMealWeekdays(weekdays);

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
          <Text numberOfLines={1} style={styles.fixedMealManagerFoodName}>{title}</Text>
          <Text numberOfLines={1} style={styles.fixedMealManagerFoodMeta}>{itemMeta}</Text>
          <Text numberOfLines={1} style={styles.fixedMealManagerScheduleMeta}>
            {recurrenceSummary} · {template.isActive ? '활성' : '비활성'}
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

      {isEditing ? (
        <View style={styles.fixedMealManagerEditBlock} testID={`fixed-meal-editor-${template.id}`}>
          <FixedMealWeekdaySelector
            onChangeWeekdays={onChangeEditingWeekdays}
            testIDPrefix={template.id}
            title={title}
            weekdays={editingWeekdays}
          />
          <View style={styles.fixedMealManagerEditActions}>
            <SecondaryButton
              accessibilityLabel={`${title} 요일 수정 취소`}
              label="취소"
              onPress={onCancelEdit}
              style={styles.fixedMealManagerEditButton}
            />
            <PrimaryButton
              accessibilityLabel={`${title} 요일 저장`}
              disabled={editingWeekdays.length === 0}
              label="저장"
              onPress={onSaveEdit}
              style={styles.fixedMealManagerEditButton}
            />
          </View>
        </View>
      ) : (
        <View style={styles.fixedMealManagerActionRow}>
          <SecondaryButton
            accessibilityLabel={`${title} 요일 수정`}
            label="수정"
            onPress={() => onRequestEdit(template)}
            style={styles.fixedMealManagerEditButton}
          />
          <SecondaryButton
            accessibilityLabel={`${title} 삭제 확인 열기`}
            label="삭제"
            onPress={() => onRequestDelete(template.id)}
            style={styles.fixedMealManagerDeleteButton}
            textStyle={styles.fixedMealManagerDeleteButtonText}
          />
        </View>
      )}

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
