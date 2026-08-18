import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  Card,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from '../components/ui';
import { fixedMealManagementLabel, mealLabels } from '../constants';
import { mealTypes } from '../meals';
import type { FixedMealTemplate, Food, MealType } from '../models';
import type { DailyNutritionTargets } from '../nutrition';
import { formatNutritionValue } from '../nutrition';
import { createSettingsGoalEntryModel } from '../goalPresentation';
import type { NutritionGoalType } from '../nutritionGoals';
import { styles } from '../styles';
import { formatAmountLabel } from '../utils/format';
import { getFoodDisplayName } from '../utils/foodDisplay';

type SettingsScreenProps = {
  fixedMealTemplates: FixedMealTemplate[];
  foods: Food[];
  nutritionGoalType: NutritionGoalType;
  onOpenGoalSetup: () => void;
  onRemoveFixedMealTemplate: (templateId: string) => void;
  onToggleFixedMealTemplate: (templateId: string) => void;
  targets: DailyNutritionTargets;
};

export function SettingsScreen({
  fixedMealTemplates,
  foods,
  nutritionGoalType,
  onOpenGoalSetup,
  onRemoveFixedMealTemplate,
  onToggleFixedMealTemplate,
  targets,
}: SettingsScreenProps) {
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState<string | null>(null);
  const foodsById = useMemo(
    () => Object.fromEntries(foods.map((food) => [food.id, food])) as Record<string, Food>,
    [foods],
  );
  const templatesByMealType = useMemo(
    () => groupFixedMealTemplatesByMealType(fixedMealTemplates),
    [fixedMealTemplates],
  );
  const goalEntry = useMemo(
    () => createSettingsGoalEntryModel(targets, nutritionGoalType),
    [nutritionGoalType, targets],
  );

  const confirmRemoveFixedMealTemplate = (templateId: string) => {
    onRemoveFixedMealTemplate(templateId);
    setPendingDeleteTemplateId(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>설정</Text>
        <Text style={styles.dateText}>앱 안내와 데이터 관리</Text>
      </View>

      <View style={styles.settingsStack}>
        <View style={styles.settingsGoalSection}>
          <Text style={styles.settingsGoalSectionTitle}>{goalEntry.title}</Text>
          <Pressable
            accessibilityLabel="목표 및 영양 목표 재설정"
            accessibilityRole="button"
            onPress={onOpenGoalSetup}
            style={({ pressed }) => [
              styles.settingsGoalEntry,
              pressed ? styles.settingsGoalEntryPressed : null,
            ]}
            testID="settings-goal-entry"
          >
            <View style={styles.settingsGoalRow}>
              <Text style={styles.settingsGoalLabel}>현재 목표</Text>
              <Text style={styles.settingsGoalValue}>{goalEntry.currentGoalLabel}</Text>
            </View>
            <View style={styles.settingsGoalDivider} />
            <View style={styles.settingsGoalRow}>
              <Text style={styles.settingsGoalLabel}>하루 목표</Text>
              <Text style={styles.settingsGoalValue}>{goalEntry.dailyCalorieGoalLabel}</Text>
            </View>
            <View style={styles.settingsGoalDivider} />
            <View style={styles.settingsGoalRow}>
              <Text style={styles.settingsGoalActionText}>{goalEntry.resetLabel}</Text>
              <Text style={styles.settingsGoalChevron}>›</Text>
            </View>
          </Pressable>
        </View>

        <Card style={styles.settingsSectionCard}>
          <SectionHeader
            action={<StatusBadge label={`${fixedMealTemplates.length}개 등록`} tone="scheduled" />}
            subtitle="Today에서 고정으로 등록한 음식은 매일 예정 식단에 표시됩니다."
            title={fixedMealManagementLabel}
          />

          {fixedMealTemplates.length > 0 ? (
            <View style={styles.fixedMealTemplateList}>
              {mealTypes.map((mealType) => (
                <FixedMealSlotGroup
                  foodsById={foodsById}
                  key={mealType}
                  mealType={mealType}
                  onCancelDelete={() => setPendingDeleteTemplateId(null)}
                  onConfirmDelete={confirmRemoveFixedMealTemplate}
                  onRequestDelete={setPendingDeleteTemplateId}
                  onToggleFixedMealTemplate={onToggleFixedMealTemplate}
                  pendingDeleteTemplateId={pendingDeleteTemplateId}
                  templates={templatesByMealType[mealType]}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="-"
              message="Today 식단에서 직접 추가한 음식의 고정 버튼을 누르면 daily 고정 식단이 만들어집니다."
              title="등록된 고정 식단 없음"
            />
          )}
        </Card>

        <Card style={styles.settingsSectionCard}>
          <SectionHeader
            subtitle="식단 기록, 목표값, 고정 식단 템플릿은 로컬 저장 구조에 보관됩니다."
            title="저장 데이터 관리"
          />
          <View style={styles.settingsList}>
            <SettingsInfoRow
              description="앱을 다시 열어도 식단 기록, 고정 식단, 날짜별 고정 제외 기록, 목표값을 복원합니다."
              label="로컬 저장"
              value="사용 중"
            />
          </View>
          <View style={styles.settingsActionSlot}>
            <Text style={styles.settingsActionTitle}>데이터 초기화</Text>
            <Text style={styles.settingsActionText}>
              전체 초기화 기능은 아직 연결되어 있지 않습니다. 연결 시 확인 절차와 danger 스타일을 적용합니다.
            </Text>
            <SecondaryButton disabled label="초기화 준비 중" onPress={() => undefined} />
          </View>
        </Card>

        <Card style={styles.settingsSectionCard}>
          <SectionHeader
            subtitle="목표 추천과 식단 평가가 어떤 값을 보는지 정리합니다."
            title="계산 기준 안내"
          />
          <View style={styles.settingsList}>
            <SettingsInfoRow
              description="일반 모드는 Mifflin-St Jeor BMR과 활동량 계수로 TDEE를 계산합니다."
              label="목표 추천"
              value="BMR / TDEE"
            />
            <SettingsInfoRow
              description="인바디 BMR이 유효하면 공식 BMR과 비교해 추천 계산에 반영합니다."
              label="인바디 기준"
              value="선택 반영"
            />
            <SettingsInfoRow
              description="체크한 음식만 하루 섭취량과 날짜별 평가 점수에 반영합니다."
              label="식단 평가"
              value="체크 기준"
            />
          </View>
        </Card>

        <Card style={styles.settingsSectionCard}>
          <SectionHeader
            subtitle="개인 식단 기록을 위한 로컬 우선 MVP입니다."
            title="앱 정보"
          />
          <View style={styles.settingsList}>
            <SettingsInfoRow
              description="음식 검색 결과의 영양정보는 데이터 출처에 따라 누락되거나 달라질 수 있습니다."
              label="영양정보"
              value="참고용"
            />
            <SettingsInfoRow
              description="이미 기록된 과거 식단은 고정 식단 템플릿을 수정하거나 삭제해도 그대로 유지됩니다."
              label="고정 식단 정책"
              value="기록 보존"
            />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

type SettingsInfoRowProps = {
  description: string;
  label: string;
  value: string;
};

function SettingsInfoRow({ description, label, value }: SettingsInfoRowProps) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowTitleBlock}>
        <Text style={styles.settingsRowTitle}>{label}</Text>
        <Text style={styles.settingsRowDescription}>{description}</Text>
      </View>
      <Text style={styles.settingsRowValue}>{value}</Text>
    </View>
  );
}

type FixedMealSlotGroupProps = {
  foodsById: Record<string, Food>;
  mealType: MealType;
  onCancelDelete: () => void;
  onConfirmDelete: (templateId: string) => void;
  onRequestDelete: (templateId: string) => void;
  onToggleFixedMealTemplate: (templateId: string) => void;
  pendingDeleteTemplateId: string | null;
  templates: FixedMealTemplate[];
};

function FixedMealSlotGroup({
  foodsById,
  mealType,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  onToggleFixedMealTemplate,
  pendingDeleteTemplateId,
  templates,
}: FixedMealSlotGroupProps) {
  return (
    <View style={styles.fixedMealSlotGroup}>
      <View style={styles.fixedMealSlotHeader}>
        <Text style={styles.fixedMealSlotTitle}>{mealLabels[mealType]}</Text>
        <Text style={styles.fixedMealSlotCount}>{templates.length}개</Text>
      </View>

      {templates.length > 0 ? (
        templates.map((template) => (
          <FixedMealTemplateRow
            foodsById={foodsById}
            key={template.id}
            onCancelDelete={onCancelDelete}
            onConfirmDelete={onConfirmDelete}
            onRequestDelete={onRequestDelete}
            onToggleFixedMealTemplate={onToggleFixedMealTemplate}
            pendingDelete={pendingDeleteTemplateId === template.id}
            template={template}
          />
        ))
      ) : (
        <Text style={styles.settingsMutedText}>{mealLabels[mealType]}에 등록된 고정 식단이 없습니다.</Text>
      )}
    </View>
  );
}

type FixedMealTemplateRowProps = {
  foodsById: Record<string, Food>;
  onCancelDelete: () => void;
  onConfirmDelete: (templateId: string) => void;
  onRequestDelete: (templateId: string) => void;
  onToggleFixedMealTemplate: (templateId: string) => void;
  pendingDelete: boolean;
  template: FixedMealTemplate;
};

function FixedMealTemplateRow({
  foodsById,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
  onToggleFixedMealTemplate,
  pendingDelete,
  template,
}: FixedMealTemplateRowProps) {
  return (
    <View style={[styles.fixedMealTemplateRow, !template.isActive ? styles.fixedMealTemplateRowInactive : null]}>
      <View style={styles.fixedMealTemplateTitleRow}>
        <View style={styles.fixedMealTemplateTitleBlock}>
          <Text style={styles.fixedMealTemplateTitle}>{template.name}</Text>
          <Text style={styles.fixedMealTemplateMeta}>
            반복 daily · {template.items.length}개 음식 · {template.isActive ? '활성 상태' : '비활성 상태'}
          </Text>
        </View>
        <StatusBadge
          label={template.isActive ? '활성' : '비활성'}
          tone={template.isActive ? 'success' : 'neutral'}
        />
      </View>

      <View style={styles.fixedMealTemplateFoodList}>
        {template.items.map((item) => {
          const food = foodsById[item.foodId] ?? item.foodSnapshot;

          return (
            <View key={item.id} style={styles.fixedMealTemplateFoodRow}>
              <Text style={styles.fixedMealTemplateFoodName}>{getFoodDisplayName(food)}</Text>
              <Text style={styles.fixedMealTemplateFoodMeta}>
                {formatAmountLabel(item.consumedGrams)}g · {formatNutritionValue('caloriesKcal', item.calculatedNutrition.caloriesKcal)}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.fixedMealTemplateActions}>
        <SecondaryButton
          accessibilityLabel={`${template.name} ${template.isActive ? '비활성화' : '활성화'}`}
          label={template.isActive ? '비활성화' : '활성화'}
          onPress={() => onToggleFixedMealTemplate(template.id)}
          style={styles.fixedMealTemplateActionButton}
        />
        <SecondaryButton
          accessibilityLabel={`${template.name} 삭제 확인 열기`}
          label="삭제"
          onPress={() => onRequestDelete(template.id)}
          style={[styles.fixedMealTemplateActionButton, styles.fixedMealTemplateDeleteButton]}
          textStyle={styles.fixedMealTemplateDeleteButtonText}
        />
      </View>

      {pendingDelete ? (
        <View style={styles.fixedMealTemplateConfirmBox}>
          <Text style={styles.fixedMealTemplateConfirmText}>
            이 고정 식단을 삭제하면 앞으로 예정 식단에 나타나지 않습니다. 이미 기록된 과거 식단은 변경되지 않습니다.
          </Text>
          <View style={styles.fixedMealTemplateConfirmActions}>
            <SecondaryButton
              accessibilityLabel={`${template.name} 삭제 취소`}
              label="취소"
              onPress={onCancelDelete}
              style={styles.fixedMealTemplateActionButton}
            />
            <PrimaryButton
              accessibilityLabel={`${template.name} 삭제 확인`}
              label="삭제 확인"
              onPress={() => onConfirmDelete(template.id)}
              style={[styles.fixedMealTemplateActionButton, styles.fixedMealTemplateConfirmDeleteButton]}
              textStyle={styles.fixedMealTemplateConfirmDeleteButtonText}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function groupFixedMealTemplatesByMealType(
  templates: FixedMealTemplate[],
): Record<MealType, FixedMealTemplate[]> {
  return {
    breakfast: templates.filter((template) => template.mealType === 'breakfast'),
    lunch: templates.filter((template) => template.mealType === 'lunch'),
    dinner: templates.filter((template) => template.mealType === 'dinner'),
  };
}
