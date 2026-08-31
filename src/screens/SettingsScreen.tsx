import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GoalHistoryModal } from '../components/GoalHistoryModal';
import { Card, SecondaryButton, SectionHeader } from '../components/ui';
import { createSettingsGoalEntryModel } from '../goalPresentation';
import type { NutritionGoalHistoryEntry } from '../goalHistory';
import type { DailyNutritionTargets } from '../nutrition';
import type { NutritionGoalType } from '../nutritionGoals';
import { styles } from '../styles';

type SettingsScreenProps = {
  goalHistory: readonly NutritionGoalHistoryEntry[];
  nutritionGoalType: NutritionGoalType;
  onOpenGoalSetup: () => void;
  targets: DailyNutritionTargets;
  todayDate: string;
};

export function SettingsScreen({
  goalHistory,
  nutritionGoalType,
  onOpenGoalSetup,
  targets,
  todayDate,
}: SettingsScreenProps) {
  const [isGoalHistoryVisible, setIsGoalHistoryVisible] = useState(false);
  const goalEntry = useMemo(
    () => createSettingsGoalEntryModel(targets, nutritionGoalType),
    [nutritionGoalType, targets],
  );

  return (
    <>
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
          <Pressable
            accessibilityLabel="목표 변경 이력 열기"
            accessibilityRole="button"
            onPress={() => setIsGoalHistoryVisible(true)}
            style={({ pressed }) => [
              styles.settingsGoalHistoryEntry,
              pressed ? styles.settingsGoalEntryPressed : null,
            ]}
            testID="settings-goal-history-entry"
          >
            <View style={styles.settingsGoalHistoryTitleBlock}>
              <Text style={styles.settingsGoalHistoryTitle}>목표 변경 이력</Text>
              <Text style={styles.settingsGoalHistoryDescription}>
                적용 날짜와 당시 영양 목표 확인
              </Text>
            </View>
            <Text style={styles.settingsGoalChevron}>›</Text>
          </Pressable>
        </View>

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
              description="고정 식단은 Today의 각 식사 섹션에서 요일별로 관리하며, 이미 기록된 과거 식단은 유지됩니다."
              label="고정 식단 정책"
              value="기록 보존"
            />
          </View>
        </Card>
      </View>
      </ScrollView>
      <GoalHistoryModal
        goalHistory={goalHistory}
        onClose={() => setIsGoalHistoryVisible(false)}
        todayDate={todayDate}
        visible={isGoalHistoryVisible}
      />
    </>
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
