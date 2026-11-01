import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeContext';
import { ColorTokens, fontFamily, borderRadius, spacing } from '../lib/theme';

export const UNDO_WINDOW_MS = 5000;
const TOAST_MS = 2200;

interface UndoOptions {
  onUndo?: () => void;
  /** 실행 취소 시간이 지나면 실제 작업(삭제 등)을 수행한다. */
  onCommit: () => Promise<void> | void;
}

interface ToastValue {
  show: (message: string) => void;
  showUndo: (message: string, opts: UndoOptions) => void;
}

interface Entry {
  id: number;
  message: string;
  undo?: UndoOptions;
}

const ToastContext = createContext<ToastValue | undefined>(undefined);

const runCommit = (opts: UndoOptions) => {
  Promise.resolve()
    .then(() => opts.onCommit())
    .catch((error) => console.error('작업 확정 실패:', error));
};

/**
 * 화면 하단에 잠깐 뜨는 알림과 "실행 취소" 스낵바.
 * - 실행 취소 대기 중 다른 실행 취소 알림이 오면 앞의 작업은 바로 확정한다.
 * - 대기 중 앱이 내려가 Provider 가 사라지면 확정하지 않는다(데이터 보존 쪽으로 실패).
 */
export function ToastProvider({ children, bottomOffset = 0 }: { children: React.ReactNode; bottomOffset?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<Entry | null>(null);
  const entryRef = useRef<Entry | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const set = (next: Entry | null) => {
    entryRef.current = next;
    setEntry(next);
  };

  const flushPending = useCallback(() => {
    const current = entryRef.current;
    clearTimer();
    if (current?.undo) runCommit(current.undo);
  }, []);

  const show = useCallback(
    (message: string) => {
      // 실행 취소를 기다리는 중이면 그 스낵바를 유지한다. 일반 알림이 대기 중인 삭제를
      // 앞당겨 확정해 버리면(예: 메모 저장 직후) 실행 취소할 기회가 사라진다.
      if (entryRef.current?.undo) return;
      clearTimer();
      const id = ++idRef.current;
      set({ id, message });
      timerRef.current = setTimeout(() => {
        if (entryRef.current?.id === id) set(null);
      }, TOAST_MS);
    },
    []
  );

  const showUndo = useCallback(
    (message: string, opts: UndoOptions) => {
      flushPending();
      const id = ++idRef.current;
      set({ id, message, undo: opts });
      timerRef.current = setTimeout(() => {
        if (entryRef.current?.id !== id) return;
        set(null);
        runCommit(opts);
      }, UNDO_WINDOW_MS);
    },
    [flushPending]
  );

  const handleUndo = () => {
    const current = entryRef.current;
    clearTimer();
    set(null);
    current?.undo?.onUndo?.();
  };

  useEffect(() => () => clearTimer(), []);

  const value = useMemo(() => ({ show, showUndo }), [show, showUndo]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {entry && (
        <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset }]}>
          <Animated.View
            key={entry.id}
            entering={FadeInDown.duration(180)}
            exiting={FadeOutDown.duration(150)}
            style={styles.toast}
            accessibilityLiveRegion="polite"
            testID="toast"
          >
            <Text style={styles.message} numberOfLines={2}>
              {entry.message}
            </Text>
            {entry.undo && (
              <TouchableOpacity onPress={handleUndo} hitSlop={10} testID="toast-undo">
                <Text style={styles.undo}>실행 취소</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

const noop: ToastValue = {
  show: () => undefined,
  showUndo: (_m, opts) => runCommit(opts),
};

// Provider 밖(단독 렌더 테스트 등)에서는 알림 없이 바로 확정한다.
export function useToast(): ToastValue {
  return useContext(ToastContext) ?? noop;
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    host: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      alignItems: 'center',
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      minHeight: 48,
      maxWidth: 480,
      alignSelf: 'stretch',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.text,
    },
    message: {
      flex: 1,
      color: c.bg,
      fontFamily: fontFamily.medium,
      fontSize: 14,
    },
    undo: {
      color: c.accent,
      fontFamily: fontFamily.bold,
      fontSize: 14,
    },
  });
