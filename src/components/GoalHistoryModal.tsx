import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { createGoalHistoryListModel } from '../goalPresentation';
import type { NutritionGoalHistoryEntry } from '../goalHistory';
import { styles } from '../styles';
import { EmptyState, StatusBadge } from './ui';

type GoalHistoryModalProps = {
  goalHistory: readonly NutritionGoalHistoryEntry[];
  onClose: () => void;
  todayDate: string;
  visible: boolean;
};

export function GoalHistoryModal({
  goalHistory,
  onClose,
  todayDate,
  visible,
}: GoalHistoryModalProps) {
  const historyModel = useMemo(
    () => createGoalHistoryListModel(goalHistory, todayDate),
    [goalHistory, todayDate],
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible
    >
      <View style={styles.modalOverlay} testID="goal-history-modal">
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={styles.modalScrim}
        />
        <View
          accessibilityLabel="목표 변경 이력 대화상자"
          accessibilityViewIsModal
          aria-modal={true}
          importantForAccessibility="yes"
          role="dialog"
          style={styles.goalHistorySheet}
        >
          <View style={styles.goalHistoryHeader}>
            <View style={styles.goalHistoryTitleBlock}>
              <Text style={styles.goalHistoryTitle}>목표 변경 이력</Text>
              <Text style={styles.goalHistorySubtitle}>
                적용 시작일과 당시 저장된 영양 목표입니다.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="목표 변경 이력 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.goalHistoryCloseButton,
                pressed ? styles.settingsGoalEntryPressed : null,
              ]}
            >
              <Text style={styles.goalHistoryCloseText}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.goalHistoryBody}
            showsVerticalScrollIndicator={false}
          >
            {historyModel.items.length > 0 ? (
              historyModel.items.map((item) => (
                <View
                  key={item.effectiveDate}
                  style={[
                    styles.goalHistoryItem,
                    item.isCurrent ? styles.goalHistoryItemCurrent : null,
                  ]}
                  testID={`goal-history-item-${item.effectiveDate}`}
                >
                  <View style={styles.goalHistoryItemHeader}>
                    <View style={styles.goalHistoryItemTitleBlock}>
                      <Text style={styles.goalHistoryDate}>{item.dateLabel}</Text>
                      <Text style={styles.goalHistoryGoalType}>{item.goalTypeLabel}</Text>
                    </View>
                    {item.isCurrent ? (
                      <StatusBadge icon="•" label="현재 적용 중" tone="info" />
                    ) : null}
                  </View>

                  <View style={styles.goalHistoryNutritionGrid}>
                    {item.nutritionMetrics.map((metric) => (
                      <View key={metric.field} style={styles.goalHistoryNutritionMetric}>
                        <Text style={styles.goalHistoryNutritionLabel}>{metric.label}</Text>
                        <Text style={styles.goalHistoryNutritionValue}>{metric.valueLabel}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <EmptyState
                icon="—"
                message="새 목표를 저장하면 적용 날짜와 영양 목표가 여기에 표시됩니다."
                title="아직 기록된 목표 변경이 없습니다."
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
