import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppSettings,
  getSettings,
  loadSettings,
  subscribeSettings,
  updateSettings,
} from '../lib/settings';

interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  useEffect(() => {
    const unsubscribe = subscribeSettings(setSettings);
    loadSettings();
    return unsubscribe;
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    updateSettings(patch);
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

// Provider 밖(테스트 등)에서도 동작하도록 모듈 캐시로 대체한다.
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  const [fallback, setFallback] = useState<AppSettings>(getSettings());
  useEffect(() => (ctx ? undefined : subscribeSettings(setFallback)), [ctx]);
  return ctx ?? { settings: fallback, update: (patch) => { updateSettings(patch); } };
}
