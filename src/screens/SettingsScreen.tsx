import { ScrollView, Text, View } from 'react-native';

import { Card, NoticeBox, SecondaryButton } from '../components/ui';
import { mealLabels } from '../constants';
import type { FixedMealTemplate, Food } from '../models';
import { styles } from '../styles';
import { formatAmountLabel } from '../utils/format';

type SettingsScreenProps = {
  fixedMealTemplates: FixedMealTemplate[];
  foods: Food[];
  onRemoveFixedMealTemplate: (templateId: string) => void;
  onToggleFixedMealTemplate: (templateId: string) => void;
};

export function SettingsScreen({
  fixedMealTemplates,
  foods,
  onRemoveFixedMealTemplate,
  onToggleFixedMealTemplate,
}: SettingsScreenProps) {
  const foodsById = Object.fromEntries(foods.map((food) => [food.id, food])) as Record<string, Food>;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>설정</Text>
        <Text style={styles.dateText}>앱 안내와 데이터 관리</Text>
      </View>

      <View style={styles.settingsStack}>
        <Card>
          <Text style={styles.sectionTitle}>앱 안내</Text>
          <Text style={styles.disclaimer}>
            날짜별로 식단을 나누고, 체크한 음식만 하루 섭취량과 식단 평가에 반영합니다.
          </Text>
          <NoticeBox
            message="검색 결과에서 음식 추가 후 섭취 g수를 입력하면 해당 g수 기준 영양성분이 계산됩니다."
            title="식단 기록"
          />
        </Card>

        <Card>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.sectionTitle}>고정 식단</Text>
              <Text style={styles.sectionSubtitle}>Today에서 일반 음식을 고정으로 등록하면 매일 예정 식단에 표시됩니다.</Text>
            </View>
          </View>
          {fixedMealTemplates.length > 0 ? (
            <View style={styles.fixedMealTemplateList}>
              {fixedMealTemplates.map((template) => (
                <View key={template.id} style={styles.fixedMealTemplateRow}>
                  <View style={styles.fixedMealTemplateTitleRow}>
                    <View style={styles.fixedMealTemplateTitleBlock}>
                      <Text style={styles.fixedMealTemplateTitle}>{template.name}</Text>
                      <Text style={styles.fixedMealTemplateMeta}>
                        {mealLabels[template.mealType]} · daily · {template.isActive ? '활성' : '비활성'}
                      </Text>
                    </View>
                    <Text style={styles.fixedMealTemplateBadge}>
                      {template.isActive ? '활성' : '비활성'}
                    </Text>
                  </View>
                  <View style={styles.fixedMealTemplateItems}>
                    {template.items.map((item) => {
                      const food = foodsById[item.foodId] ?? item.foodSnapshot;

                      return (
                        <Text key={item.id} style={styles.fixedMealTemplateItemText}>
                          {food.name} {formatAmountLabel(item.consumedGrams)}g
                        </Text>
                      );
                    })}
                  </View>
                  <View style={styles.fixedMealTemplateActions}>
                    <SecondaryButton
                      label={template.isActive ? '비활성' : '활성'}
                      onPress={() => onToggleFixedMealTemplate(template.id)}
                      style={styles.fixedMealTemplateActionButton}
                    />
                    <SecondaryButton
                      label="삭제"
                      onPress={() => onRemoveFixedMealTemplate(template.id)}
                      style={[styles.fixedMealTemplateActionButton, styles.fixedMealTemplateDeleteButton]}
                      textStyle={styles.fixedMealTemplateDeleteButtonText}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <NoticeBox
              message="Today 식단에서 직접 추가한 음식의 고정 버튼을 누르면 daily 고정 식단이 만들어집니다."
              title="등록된 고정 식단 없음"
            />
          )}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>참고용 계산 안내</Text>
          <Text style={styles.disclaimer}>
            영양정보는 참고용입니다. 섭취량 계산은 입력값과 데이터 출처에 따라 달라질 수 있습니다.
          </Text>
          <NoticeBox
            message="목표 추천은 인바디 수치 또는 일반 계산식을 바탕으로 한 참고값이며 의료 진단이 아닙니다."
            title="목표 계산"
            variant="warning"
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>데이터 관리</Text>
          <Text style={styles.sectionSubtitle}>로컬 저장과 데이터 초기화 기능을 위한 준비 영역</Text>
          <View style={styles.settingsActionSlot}>
            <Text style={styles.settingsActionTitle}>버전 로컬 저장 사용 중</Text>
            <Text style={styles.settingsActionText}>
              식단 기록, 고정 식단, 날짜별 고정 제외 기록, 목표값을 같은 저장 구조에 보관합니다.
            </Text>
            <SecondaryButton disabled label="초기화 준비 중" onPress={() => undefined} />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
