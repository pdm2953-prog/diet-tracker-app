import { ScrollView, Text, View } from 'react-native';

import { Card, NoticeBox, SecondaryButton } from '../components/ui';
import { styles } from '../styles';

export function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>설정</Text>
        <Text style={styles.dateText}>앱 안내와 데이터 관리 준비 영역</Text>
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
            <Text style={styles.settingsActionTitle}>로컬 데이터 기능 준비 중</Text>
            <Text style={styles.settingsActionText}>
              추후 식단 기록 저장, 백업, 데이터 초기화 기능을 이 영역에 배치할 수 있습니다.
            </Text>
            <SecondaryButton disabled label="준비 중" onPress={() => undefined} />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
