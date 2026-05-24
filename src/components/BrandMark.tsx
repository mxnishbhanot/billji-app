import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

type Props = { size?: number; compact?: boolean };

export function BrandMark({ size = 44, compact = false }: Props) {
  const theme = useTheme();
  const dotSize = Math.max(8, size * 0.22);

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: size * 0.36,
          backgroundColor: theme.colors.primary
        }
      ]}
    >
      <Text
        style={[
          styles.letter,
          {
            color: theme.colors.onPrimary,
            fontSize: compact ? size * 0.46 : size * 0.5
          }
        ]}
      >
        B
      </Text>
      <View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: theme.colors.tertiary
          }
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    right: 7,
    top: 7
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  letter: {
    fontWeight: '900',
    includeFontPadding: false,
    letterSpacing: -1
  }
});
