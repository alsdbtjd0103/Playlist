import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor } from '@testing-library/react-native';
import { SettingsProvider, useSettings } from '../contexts/SettingsContext';
import { getSettings } from '../lib/settings';

function Probe() {
  const { settings } = useSettings();
  return <Text>{`analytics:${settings.analytics}`}</Text>;
}

describe('SettingsProvider', () => {
  it('저장된 설정을 읽은 뒤에야 화면을 그린다(첫 화면이 기본값으로 동작하지 않게)', async () => {
    (AsyncStorage as any).__resetStore();
    await AsyncStorage.setItem('@settings', JSON.stringify({ analytics: false }));
    const r = render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    );
    expect(r.queryByText(/analytics:/)).toBeNull();
    await waitFor(() => expect(r.getByText('analytics:false')).toBeTruthy());
    expect(getSettings().analytics).toBe(false);
  });
});
