import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Pressable, SafeAreaView, Text, View } from 'react-native';

import { dailyTargets } from './src/nutrition';
import type { DailyNutritionTargets } from './src/nutrition';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TargetScreen } from './src/screens/TargetScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { styles } from './src/styles';

type ScreenKey = 'today' | 'target' | 'settings';

const screenTabs: Array<{ key: ScreenKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'target', label: '목표' },
  { key: 'settings', label: '설정' },
];

const screenPaneStyle: ViewStyle = { flex: 1 };
const hiddenScreenPaneStyle: ViewStyle = { display: 'none' };
const tabButtonFillStyle: ViewStyle = { flex: 1 };

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenKey>('today');
  const [todayTargets, setTodayTargets] = useState<DailyNutritionTargets>(dailyTargets);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.appContent}>
        <View style={[screenPaneStyle, activeScreen !== 'today' ? hiddenScreenPaneStyle : null]}>
          <TodayScreen targets={todayTargets} />
        </View>
        <View style={[screenPaneStyle, activeScreen !== 'target' ? hiddenScreenPaneStyle : null]}>
          <TargetScreen
            currentTargets={todayTargets}
            onTargetsChange={(targets) => setTodayTargets(targets)}
          />
        </View>
        <View style={[screenPaneStyle, activeScreen !== 'settings' ? hiddenScreenPaneStyle : null]}>
          <SettingsScreen />
        </View>
      </View>

      <View style={styles.tabBar}>
        {screenTabs.map((tab) => {
          const selected = activeScreen === tab.key;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={tab.key}
              onPress={() => setActiveScreen(tab.key)}
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
