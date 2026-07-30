import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  /** Styles land on the animated inner view so the scale composes cleanly. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * A Pressable that dips slightly under the finger and springs back on
 * release: the shared press feedback for cards and buttons. The scale is
 * subtle on purpose; it reads as responsiveness, not as an effect.
 */
export function PressableScale({ style, children, onPressIn, onPressOut, ...props }: Props) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
  }));

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        pressed.value = withTiming(1, { duration: 90 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = withSpring(0, { damping: 16, stiffness: 300 });
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
