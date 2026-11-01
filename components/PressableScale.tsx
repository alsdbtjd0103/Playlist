import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic, HapticKind } from '../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** 누를 때 줄어드는 비율(기본 0.97) */
  scaleTo?: number;
  /** 누르는 순간 햅틱(설정에서 끌 수 있음) */
  haptic?: HapticKind;
};

// 누르면 살짝 줄어들었다 돌아오는 스프링 피드백. TouchableOpacity 의 투명도 깜빡임 대신 쓴다.
export default function PressableScale({ style, scaleTo = 0.97, haptic: hapticKind, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 20, stiffness: 400 });
        if (hapticKind) haptic(hapticKind);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        onPressOut?.(e);
      }}
    />
  );
}
