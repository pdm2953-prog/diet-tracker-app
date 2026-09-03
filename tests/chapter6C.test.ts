import assert from 'node:assert/strict';
import { test } from 'node:test';

declare const process: { cwd(): string };
declare function require(moduleName: 'node:fs'): {
  readFileSync(path: string, encoding: string): string;
};

const { readFileSync } = require('node:fs');
const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(`${repoRoot}\\${relativePath}`, 'utf8').replace(/\r\n/g, '\n');
}

test('Chapter 6-C keeps native credentials in SecureStore and web credentials in cookies', () => {
  const credentialSource = readSource('src\\auth\\credentialStore.ts');
  const runtimeSource = readSource('src\\auth\\runtimeCredentialStore.ts');
  const clientSource = readSource('src\\auth\\authClient.ts');
  const authSources = credentialSource + runtimeSource + clientSource;

  assert.equal(runtimeSource.includes("import('expo-secure-store')"), true);
  assert.equal(authSources.includes('AsyncStorage'), false);
  assert.equal(authSources.includes('localStorage'), false);
  assert.equal(clientSource.includes("credentials: 'include'"), true);
  assert.equal(clientSource.includes("headers[TRANSPORT_HEADER] = 'bearer'"), true);
  assert.equal(clientSource.includes('headers.Authorization = `Bearer ${token}`'), true);
});

test('Chapter 6-C keeps tokens out of React state and nutrition persistence', () => {
  const appSource = readSource('App.tsx');
  const useAuthSource = readSource('src\\auth\\useAuth.ts');
  const storageSource = readSource('src\\storage.ts');

  assert.equal(appSource.includes('sessionToken'), false);
  assert.equal(useAuthSource.includes('sessionToken'), false);
  assert.equal(useAuthSource.includes('AUTH_SESSION_TOKEN_KEY'), false);
  assert.equal(storageSource.includes('sessionToken'), false);
  assert.equal(storageSource.includes('AUTH_SESSION_TOKEN_KEY'), false);
});

test('Chapter 6-C keeps password state inside the auth form', () => {
  const authScreenSource = readSource('src\\screens\\AuthScreen.tsx');
  const useAuthSource = readSource('src\\auth\\useAuth.ts');
  const clientSource = readSource('src\\auth\\authClient.ts');

  assert.equal(authScreenSource.includes("const [password, setPassword] = useState('')"), true);
  assert.equal(authScreenSource.includes('secureTextEntry'), true);
  assert.equal(useAuthSource.includes('password'), false);
  assert.equal(authScreenSource.includes('console.'), false);
  assert.equal(clientSource.includes('console.'), false);
});

test('Chapter 6-C gates goal setup behind authentication and keeps nutrition state independent', () => {
  const appSource = readSource('App.tsx');
  const useAuthSource = readSource('src\\auth\\useAuth.ts');

  const authGateIndex = appSource.indexOf("appRenderState === 'auth-required'");
  const goalSetupIndex = appSource.indexOf("appRenderState === 'goal-setup'");

  assert.equal(authGateIndex >= 0, true);
  assert.equal(goalSetupIndex > authGateIndex, true);
  assert.equal(appSource.includes('<AuthScreen onLogin={auth.login} onRegister={auth.register} />'), true);
  assert.equal(appSource.includes('onLogout={auth.logout}'), true);
  assert.equal(useAuthSource.includes('setMealsByDate'), false);
  assert.equal(useAuthSource.includes('setFoods'), false);
  assert.equal(useAuthSource.includes('saveAppDataSnapshot'), false);
});

test('Chapter 6-C exposes logout in Settings without adding account management', () => {
  const settingsSource = readSource('src\\screens\\SettingsScreen.tsx');
  const useAuthSource = readSource('src\\auth\\useAuth.ts');

  assert.equal(settingsSource.includes('title="계정"'), true);
  assert.equal(settingsSource.includes("label={isLoggingOut ? '로그아웃 중...' : '로그아웃'}"), true);
  assert.equal(settingsSource.includes('onPress={() => void logout()}'), true);
  assert.equal(useAuthSource.includes('applyResult(result);'), true);
  assert.equal(useAuthSource.includes("finally {\n      setState({ status: 'anonymous' });"), false);
});

test('Chapter 6-C documents one shared configurable backend URL', () => {
  const configSource = readSource('src\\services\\backendConfig.ts');
  const clientSource = readSource('src\\auth\\authClient.ts');
  const envExample = readSource('.env.example');
  const apiContract = readSource('docs\\API_CONTRACT.md');

  assert.equal(configSource.includes("DEFAULT_BACKEND_URL = 'http://localhost:8000'"), true);
  assert.equal(clientSource.includes('createBackendServiceConfig()'), true);
  assert.equal(clientSource.includes('EXPO_PUBLIC_'), false);
  assert.equal(envExample.includes('EXPO_PUBLIC_BACKEND_URL=http://localhost:8000'), true);
  assert.equal(envExample.includes('http://10.0.2.2:8000'), true);
  assert.equal(apiContract.includes('http://localhost:8000'), true);
  assert.equal(apiContract.includes('http://127.0.0.1:8000'), false);
});
