import { ScrollView, Text, View } from 'react-native';

import { styles } from '../styles';

export function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>설정</Text>
      </View>

      <View style={styles.summaryPanel}>
        <Text style={styles.sectionTitle}>영양정보 안내</Text>
        <Text style={styles.disclaimer}>
          영양정보는 참고용입니다. 섭취량 계산은 입력값과 데이터 출처에 따라 달라질 수 있습니다.
        </Text>
      </View>
    </ScrollView>
  );
}
