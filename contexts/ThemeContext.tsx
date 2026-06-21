import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ColorTokens } from '../lib/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@themeMode';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

interface ThemeContextValue {
  colors: ColorTokens;
  scheme: 'light' | 'dark';
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setModeState(saved);
        }
      } catch (e) {
        console.error('테마 모드 로드 실패:', e);
      }
    })();
  }, []);

  const persist = useCallback((m: ThemeMode) => {
    AsyncStorage.setItem(STORAGE_KEY, m).catch((e) => console.error('테마 모드 저장 실패:', e));
  }, []);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      persist(m);
    },
    [persist]
  );

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
      persist(next);
      return next;
    });
  }, [persist]);

  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ colors, scheme, mode, setMode, cycleMode }),
    [colors, scheme, mode, setMode, cycleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
