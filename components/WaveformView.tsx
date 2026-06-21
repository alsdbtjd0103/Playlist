import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { TrimRange, clampTrimRange } from '../lib/trim';
import { colors, borderRadius } from '../lib/theme';

interface Props {
  samples: number[];
  duration: number;
  range: TrimRange;
  playhead?: number;
  onChangeRange: (r: TrimRange) => void;
  width?: number;
  height?: number;
}

const HANDLE_W = 14;

export function WaveformView({ samples, duration, range, playhead, onChangeRange, width = 320, height = 120 }: Props) {
  const widthRef = useRef(width);
  const onLayout = (e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width; };

  const rangeRef = useRef(range);
  const durationRef = useRef(duration);
  const onChangeRef = useRef(onChangeRange);
  useEffect(() => {
    rangeRef.current = range;
    durationRef.current = duration;
    onChangeRef.current = onChangeRange;
  });

  const secToX = (sec: number) => (duration > 0 ? (sec / duration) * widthRef.current : 0);

  const makeResponder = (which: 'start' | 'end') => {
    let startSecAtGrant = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startSecAtGrant = which === 'start' ? rangeRef.current.start : rangeRef.current.end;
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = widthRef.current;
        const dur = durationRef.current;
        const startX = dur > 0 ? (startSecAtGrant / dur) * w : 0;
        const x = Math.max(0, Math.min(w, startX + gesture.dx));
        const sec = w > 0 ? (x / w) * dur : 0;
        const next = which === 'start'
          ? { ...rangeRef.current, start: sec }
          : { ...rangeRef.current, end: sec };
        onChangeRef.current(clampTrimRange(next, dur));
      },
    });
  };

  const startResponder = useRef(makeResponder('start')).current;
  const endResponder = useRef(makeResponder('end')).current;

  const bars = samples.length > 0 ? samples : null;
  const startX = secToX(range.start);
  const endX = secToX(range.end);

  return (
    <View style={[styles.container, { width, height }]} onLayout={onLayout}>
      {bars ? (
        <View testID="waveform-bars" style={styles.bars}>
          {bars.map((v, i) => {
            const sec = duration * (i / bars.length);
            const inRange = sec >= range.start && sec <= range.end;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  marginHorizontal: 0.5,
                  height: Math.max(2, v * (height - 8)),
                  backgroundColor: inRange ? colors.primary : colors.border,
                  borderRadius: 1,
                }}
              />
            );
          })}
        </View>
      ) : (
        <View testID="waveform-fallback" style={styles.bars}>
          {Array.from({ length: 60 }).map((_, i) => {
            const sec = duration * (i / 60);
            const inRange = sec >= range.start && sec <= range.end;
            return (
              <View key={i} style={{ flex: 1, marginHorizontal: 0.5, height: (height - 8) * 0.4, backgroundColor: inRange ? colors.primary : colors.border, borderRadius: 1 }} />
            );
          })}
        </View>
      )}

      {/* 선택 구간 바깥 음영 */}
      <View pointerEvents="none" style={[styles.dim, { left: 0, width: startX }]} />
      <View pointerEvents="none" style={[styles.dim, { left: endX, right: 0 }]} />

      {/* playhead */}
      {typeof playhead === 'number' && (
        <View pointerEvents="none" style={[styles.playhead, { left: secToX(playhead) }]} />
      )}

      {/* 핸들 */}
      <View testID="trim-handle-start" {...startResponder.panHandlers} style={[styles.handle, { left: Math.max(0, startX - HANDLE_W / 2) }]} />
      <View testID="trim-handle-end" {...endResponder.panHandlers} style={[styles.handle, { left: Math.max(0, endX - HANDLE_W / 2) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, overflow: 'hidden' },
  bars: { flexDirection: 'row', alignItems: 'center', height: '100%', paddingHorizontal: 4 },
  dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.warning },
  handle: { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, backgroundColor: colors.primary, opacity: 0.9, borderRadius: 4 },
});
