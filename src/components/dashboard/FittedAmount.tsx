import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleProp, Text, TextStyle } from 'react-native';

/** Average glyph width as a fraction of font size for the bold money type. */
const GLYPH_RATIO = 0.62;
/** Below this the full figure has shrunk past comfortable reading; swap to the ₹1.2L form. */
const COMPACT_BELOW = 26;
/** How long a tapped-open full figure stays visible before it folds back. */
const REVEAL_MS = 4000;

export const fitFontSize = (text: string, available: number, max: number, min: number) =>
  Math.round(Math.max(min, Math.min(max, available / Math.max(text.length, 1) / GLYPH_RATIO)));

type Props = {
  full: string;
  /** Short form (₹1.25L). When it is what fits, tapping reveals `full` briefly. */
  compact?: string;
  /** Width the text actually gets, in px. */
  available: number;
  maxFontSize: number;
  minFontSize?: number;
  /** Font size under which the compact form is preferred; defaults to 26. */
  compactBelow?: number;
  style?: StyleProp<TextStyle>;
  color?: string;
};

/**
 * Money that sizes itself to the space it is given. adjustsFontSizeToFit alone is
 * unreliable on Android (it ellipsises instead of shrinking), so the size is computed
 * from text length, and past a floor the compact form is shown rather than a figure
 * too small to read. The compact form is tappable to reveal the exact amount.
 */
export const FittedAmount = memo(function FittedAmount({
  full,
  compact,
  available,
  maxFontSize,
  minFontSize = 20,
  compactBelow = COMPACT_BELOW,
  style,
  color
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fullSize = fitFontSize(full, available, maxFontSize, minFontSize);
  const usesCompact = Boolean(compact) && compact !== full && fullSize < compactBelow;
  const text = usesCompact && !revealed ? (compact as string) : full;
  const fontSize = fitFontSize(text, available, maxFontSize, minFontSize);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onPress = useCallback(() => {
    clearTimeout(timer.current);
    setRevealed(true);
    timer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  }, []);

  const label = (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      allowFontScaling={false}
      style={[style, { fontSize, lineHeight: Math.round(fontSize * 1.16) }, color ? { color } : null]}
    >
      {text}
    </Text>
  );

  if (!usesCompact) return label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={full}
      accessibilityHint="Shows the exact amount"
      onPress={onPress}
      hitSlop={8}
    >
      {label}
    </Pressable>
  );
});
