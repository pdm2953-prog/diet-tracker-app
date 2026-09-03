import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LoginInput, RegisterInput } from '../auth/authClient';
import type { AuthFormResult } from '../auth/useAuth';
import { Card, PrimaryButton, SecondaryButton } from '../components/ui';
import { styles } from '../styles';

type AuthMode = 'login' | 'register';

type AuthScreenProps = {
  onLogin: (input: LoginInput) => Promise<AuthFormResult>;
  onRegister: (input: RegisterInput) => Promise<AuthFormResult>;
};

export function AuthScreen({ onLogin, onRegister }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setErrorMessage(null);
  };

  const submit = async () => {
    const normalizedEmail = email.trim();
    const normalizedDisplayName = displayName.trim();

    if (
      normalizedEmail.length === 0
      || password.length === 0
      || (mode === 'register' && normalizedDisplayName.length === 0)
    ) {
      setErrorMessage('필수 항목을 모두 입력해 주세요.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = mode === 'login'
        ? await onLogin({ email: normalizedEmail, password })
        : await onRegister({
          displayName: normalizedDisplayName,
          email: normalizedEmail,
          password,
        });

      if (!result.ok) {
        setErrorMessage(result.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.authContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.authHero}>
        <Text style={styles.authEyebrow}>Diet Tracker</Text>
        <Text style={styles.authTitle}>내 식단을 안전하게 이어가세요</Text>
        <Text style={styles.authSubtitle}>
          로그인은 계정 접근만 확인하며, 이 기기에 저장된 기존 식단을 삭제하거나 계정에 연결하지 않습니다.
        </Text>
      </View>

      <Card style={styles.authCard}>
        <View style={styles.authModeRow}>
          <AuthModeButton
            label="로그인"
            onPress={() => changeMode('login')}
            selected={mode === 'login'}
          />
          <AuthModeButton
            label="회원가입"
            onPress={() => changeMode('register')}
            selected={mode === 'register'}
          />
        </View>

        <View style={styles.authForm}>
          {mode === 'register' ? (
            <View style={styles.authField}>
              <Text style={styles.authFieldLabel}>이름</Text>
              <TextInput
                autoCapitalize="words"
                autoComplete="name"
                editable={!isSubmitting}
                maxLength={100}
                onChangeText={setDisplayName}
                placeholder="표시할 이름"
                placeholderTextColor="#8b9585"
                style={styles.authTextInput}
                testID="auth-display-name-input"
                value={displayName}
              />
            </View>
          ) : null}

          <View style={styles.authField}>
            <Text style={styles.authFieldLabel}>이메일</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!isSubmitting}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="name@example.com"
              placeholderTextColor="#8b9585"
              style={styles.authTextInput}
              testID="auth-email-input"
              value={email}
            />
          </View>

          <View style={styles.authField}>
            <Text style={styles.authFieldLabel}>비밀번호</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              autoCorrect={false}
              editable={!isSubmitting}
              maxLength={1024}
              onChangeText={setPassword}
              placeholder="비밀번호"
              placeholderTextColor="#8b9585"
              secureTextEntry
              style={styles.authTextInput}
              testID="auth-password-input"
              value={password}
            />
          </View>

          {errorMessage ? (
            <Text accessibilityRole="alert" style={styles.authErrorText}>
              {errorMessage}
            </Text>
          ) : null}

          <PrimaryButton
            disabled={isSubmitting}
            label={isSubmitting
              ? '처리 중...'
              : mode === 'login' ? '로그인' : '회원가입'}
            onPress={() => void submit()}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

type AuthUnavailableScreenProps = {
  message: string;
  onLogout: () => Promise<void>;
  onRetry: () => Promise<void>;
};

export function AuthUnavailableScreen({
  message,
  onLogout,
  onRetry,
}: AuthUnavailableScreenProps) {
  const [isWorking, setIsWorking] = useState(false);

  const run = async (operation: () => Promise<void>) => {
    setIsWorking(true);
    try {
      await operation();
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <View style={styles.authUnavailableScreen}>
      <Card style={styles.authUnavailableCard}>
        <Text style={styles.authEyebrow}>연결 확인</Text>
        <Text style={styles.authUnavailableTitle}>로그인 상태를 확인할 수 없습니다</Text>
        <Text style={styles.authSubtitle}>{message}</Text>
        <Text style={styles.authUnavailableHelp}>
          저장된 로그인 정보는 유지됩니다. 네트워크나 서버 상태를 확인한 뒤 다시 시도하세요.
        </Text>
        <View style={styles.authUnavailableActions}>
          <PrimaryButton
            disabled={isWorking}
            label={isWorking ? '확인 중...' : '다시 시도'}
            onPress={() => void run(onRetry)}
          />
          <SecondaryButton
            disabled={isWorking}
            label="로그아웃 다시 시도"
            onPress={() => void run(onLogout)}
          />
        </View>
      </Card>
    </View>
  );
}

type AuthModeButtonProps = {
  label: string;
  onPress: () => void;
  selected: boolean;
};

function AuthModeButton({ label, onPress, selected }: AuthModeButtonProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.authModeButton,
        selected ? styles.authModeButtonSelected : null,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <Text style={[
        styles.authModeButtonText,
        selected ? styles.authModeButtonTextSelected : null,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}
