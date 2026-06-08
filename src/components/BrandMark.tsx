import { Image, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { fontStyles } from '@/theme/theme';

type Props = { size?: number; compact?: boolean; imageUri?: string; label?: string };

function getInitials(label?: string) {
  const words = label?.trim().split(/\s+/).filter(Boolean) || [];
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'B';
}

export function BrandMark({ size = 44, compact = false, imageUri, label }: Props) {
  const theme = useTheme();
  const initials = getInitials(label);

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: imageUri ? theme.colors.elevation.level1 : theme.colors.primary,
          borderColor: imageUri ? theme.colors.outlineVariant : 'transparent'
        }
      ]}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} resizeMode="cover" style={styles.image} />
      ) : (
        <Text
          style={[
            styles.letter,
            {
              color: theme.colors.onPrimary,
              fontSize: compact ? size * 0.42 : size * 0.46
            }
          ]}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  image: {
    height: '100%',
    width: '100%'
  },
  letter: {
    ...fontStyles.bold,
    includeFontPadding: false,
    letterSpacing: -1
  }
});
