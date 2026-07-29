import React, { memo, useEffect } from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from "react-native-svg";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface Props { width: number; height: number; nightVision?: boolean; intensity?: number; }

export const AstralBreathingLayer = memo(function AstralBreathingLayer({ width, height, nightVision = false, intensity = 1 }: Props) {
  const breath = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { cancelAnimation(breath); breath.value = 0.5; return; }
    breath.value = withRepeat(withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [breath, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.28 + breath.value * 0.18, transform: [{ scale: 1 + breath.value * 0.018 }] }));
  const gold = nightVision ? "#FF453A" : "#D9A84E";
  const starlight = nightVision ? "#FFB3AA" : "#FFF6D6";
  const violet = nightVision ? "#210406" : "#7B5CF6";
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs><RadialGradient id="astralBreathCore" cx="50%" cy="42%" r="72%">
          <Stop offset="0%" stopColor={starlight} stopOpacity={0.055 * intensity} />
          <Stop offset="28%" stopColor={gold} stopOpacity={0.045 * intensity} />
          <Stop offset="64%" stopColor={violet} stopOpacity={0.035 * intensity} />
          <Stop offset="100%" stopColor="#030816" stopOpacity={0} />
        </RadialGradient></Defs>
        <Rect width={width} height={height} fill="url(#astralBreathCore)" />
        <Circle cx={width * 0.5} cy={height * 0.42} r={Math.min(width, height) * 0.38} fill={gold} opacity={0.018 * intensity} />
      </Svg>
    </Animated.View>
  );
});
