import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { alpha } from '@/theme/theme';

type Props = {
  color: string;
  data?: number[];
  height?: number;
  width?: number;
};

export const Sparkline = memo(function Sparkline({ color, data = [2, 4, 3, 6, 5, 7, 6], height = 28, width = 120 }: Props) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(data.length - 1, 1);
  const points = data.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const line = points.reduce((path, point, index) => {
    const [x, y] = point.split(',');
    return index === 0 ? `M ${x} ${y}` : `${path} L ${x} ${y}`;
  }, '');

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path
          d={`${line} L ${width} ${height} L 0 ${height} Z`}
          fill={alpha(color, 0.12)}
          stroke="none"
        />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: 'auto', overflow: 'hidden', paddingTop: 8 }
});
