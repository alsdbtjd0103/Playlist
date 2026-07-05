import React, { useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent, Pressable } from 'react-native';
import { TrimRange, normalizeCuts } from '../lib/trim';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, borderRadius } from '../lib/theme';

interface Props {
  samples: number[];
  duration: number;
  /** 삭제할 구간들. 남길 구간 = [0,duration] − cuts */
  cuts: TrimRange[];
  onChangeCuts: (cuts: TrimRange[]) => void;
  selectedIndex: number | null;
  onSelectCut: (index: number | null) => void;
  playhead?: number;
  width?: number;
  height?: number;
}

const HANDLE_W = 14;
const MIN_CUT = 0.2;

const inAnyCut = (sec: number, cuts: TrimRange[]) =>
  cuts.some((c) => sec >= c.start && sec <= c.end);

export function WaveformView({
  samples,
  duration,
  cuts,
  onChangeCuts,
  selectedIndex,
  onSelectCut,
  playhead,
  width = 320,
  height = 120,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const widthRef = useRef(width);
  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const cutsRef = useRef(cuts);
  const durationRef = useRef(duration);
  const onChangeRef = useRef(onChangeCuts);
  const onSelectRef = useRef(onSelectCut);
  useEffect(() => {
    cutsRef.current = cuts;
    durationRef.current = duration;
    onChangeRef.current = onChangeCuts;
    onSelectRef.current = onSelectCut;
  });

  const secToX = (sec: number) => (duration > 0 ? (sec / duration) * widthRef.current : 0);

  // cut 개수만큼 핸들 responder 생성(개수 바뀔 때만 재생성)
  const responders = useMemo(() => {
    const make = (index: number, which: 'start' | 'end') => {
      let base = 0;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const c = cutsRef.current[index];
          if (!c) return;
          base = which === 'start' ? c.start : c.end;
          onSelectRef.current(index);
        },
        onPanResponderMove: (_evt, gesture) => {
          const w = widthRef.current;
          const dur = durationRef.current;
          const c = cutsRef.current[index];
          if (!c || dur <= 0) return;
          const baseX = (base / dur) * w;
          const x = Math.max(0, Math.min(w, baseX + gesture.dx));
          let sec = (x / w) * dur;
          const next = { ...c };
          if (which === 'start') next.start = Math.max(0, Math.min(sec, c.end - MIN_CUT));
          else next.end = Math.min(dur, Math.max(sec, c.start + MIN_CUT));
          const arr = cutsRef.current.slice();
          arr[index] = next;
          cutsRef.current = arr;
          onChangeRef.current(arr);
        },
        onPanResponderRelease: () => {
          onChangeRef.current(normalizeCuts(cutsRef.current, durationRef.current));
        },
      });
    };
    return cuts.map((_, i) => ({ start: make(i, 'start'), end: make(i, 'end') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuts.length]);

  const bars = samples.length > 0 ? samples : null;
  const barCount = bars ? bars.length : 60;

  const renderBar = (i: number, count: number, h: number) => {
    const sec = duration * (i / count);
    const cut = inAnyCut(sec, cuts);
    return (
      <View
        key={i}
        style={{
          flex: 1,
          marginHorizontal: 0.5,
          height: bars ? Math.max(2, (bars[i] ?? 0) * (h - 8)) : (h - 8) * 0.4,
          backgroundColor: cut ? colors.border : colors.accent,
          opacity: cut ? 0.5 : 1,
          borderRadius: 1,
        }}
      />
    );
  };

  return (
    <View style={[styles.container, { width, height }]} onLayout={onLayout}>
      <View testID={bars ? 'waveform-bars' : 'waveform-fallback'} style={styles.bars}>
        {Array.from({ length: barCount }).map((_, i) => renderBar(i, barCount, height))}
      </View>

      {/* 삭제 구간(음영) + 선택/핸들 */}
      {cuts.map((c, i) => {
        const left = secToX(c.start);
        const w = Math.max(0, secToX(c.end) - left);
        const selected = i === selectedIndex;
        return (
          <React.Fragment key={i}>
            <Pressable
              testID={`cut-${i}-region`}
              onPress={() => onSelectCut(i)}
              style={[
                styles.cutRegion,
                { left, width: w },
                selected && styles.cutRegionSelected,
              ]}
            />
            <View
              testID={`cut-${i}-start`}
              {...responders[i].start.panHandlers}
              style={[styles.handle, selected && styles.handleSelected, { left: Math.max(0, left - HANDLE_W / 2) }]}
            />
            <View
              testID={`cut-${i}-end`}
              {...responders[i].end.panHandlers}
              style={[styles.handle, selected && styles.handleSelected, { left: Math.max(0, left + w - HANDLE_W / 2) }]}
            />
          </React.Fragment>
        );
      })}

      {typeof playhead === 'number' && (
        <View pointerEvents="none" style={[styles.playhead, { left: secToX(playhead) }]} />
      )}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
    },
    bars: { flexDirection: 'row', alignItems: 'center', height: '100%', paddingHorizontal: 4 },
    cutRegion: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      backgroundColor: colors.overlay,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    cutRegionSelected: { borderColor: colors.danger },
    playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.star },
    handle: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: HANDLE_W,
      backgroundColor: colors.danger,
      opacity: 0.85,
      borderRadius: 4,
    },
    handleSelected: { opacity: 1 },
  });
