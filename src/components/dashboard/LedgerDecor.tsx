import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { alpha } from '@/theme/theme';

// Fixed design canvas — the SVG scales into whatever box it is given, so nothing
// here ever reads measured layout (that feedback loop made the hero grow forever).
const DECOR_W = 300;
const DECOR_H = 210;
const RULE_ROWS = [24, 50, 76, 102, 128, 154, 180, 206];

type Props = {
  cream: string;
  lineColor: string;
  accent: string;
};

/** Warm receipt paper: faint ruled ledger lines + a tilted invoice illustration. */
export const HeroPaperDecor = memo(function HeroPaperDecor({ cream, lineColor, accent }: Props) {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={`0 0 ${DECOR_W} ${DECOR_H}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Flat fill — the seam paints the same colour, so any gradient here would
          show as a seam mismatch at the tear. */}
      <Rect x={0} y={0} width={DECOR_W} height={DECOR_H} fill={cream} />

      {/* Ruled ledger lines running edge to edge, barely there. */}
      <G>
        {RULE_ROWS.map((y) => (
          <Line
            key={y}
            x1={0}
            y1={y}
            x2={DECOR_W}
            y2={y}
            stroke={alpha(accent, 0.13)}
            strokeWidth={1}
            strokeDasharray="3 6"
          />
        ))}
      </G>

      {/* Tilted invoice sheet with a folded corner, ruled body, signature and stamp. */}
      <G opacity={0.55} transform="translate(176 46) rotate(-7)">
        <Path
          d="M0 8 Q0 0 8 0 H62 L88 26 V102 Q88 110 80 110 H8 Q0 110 0 102 Z"
          fill="#FFFFFF"
          stroke={alpha(accent, 0.32)}
          strokeWidth={1.4}
        />
        <Path d="M62 0 L88 26 H70 Q62 26 62 18 Z" fill={alpha(accent, 0.18)} />

        <SvgText x={12} y={24} fill={alpha(lineColor, 0.65)} fontSize={9} fontWeight="700" letterSpacing="1.2">
          INVOICE
        </SvgText>

        <G stroke={alpha(lineColor, 0.3)} strokeWidth={2} strokeLinecap="round">
          <Line x1={12} y1={40} x2={44} y2={40} />
          <Line x1={54} y1={40} x2={76} y2={40} />
          <Line x1={12} y1={52} x2={44} y2={52} />
          <Line x1={54} y1={52} x2={76} y2={52} />
          <Line x1={12} y1={64} x2={44} y2={64} />
          <Line x1={54} y1={64} x2={76} y2={64} />
        </G>

        {/* Signature squiggle */}
        <Path
          d="M12 88 c6 -10 10 4 16 -2 c5 -5 3 8 9 3"
          stroke={alpha(lineColor, 0.5)}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />

        {/* Paid stamp */}
        <Circle cx={68} cy={86} r={13} stroke={alpha(accent, 0.4)} strokeWidth={1.4} fill="none" strokeDasharray="2 3" />
        <SvgText x={68} y={91} fill={alpha(accent, 0.55)} fontSize={13} fontWeight="700" textAnchor="middle">
          ₹
        </SvgText>
      </G>
    </Svg>
  );
});

// Ticket seam geometry. Both panels end in the *same* serpentine wave, offset by a
// constant gap, so they interlock like a torn ticket stub and the page background
// shows through as an even zigzag ribbon.
const SEAM_AMPLITUDE = 5;
const SEAM_GAP = 6;
const SEAM_PERIOD = 20;
const SEAM_W = SEAM_AMPLITUDE * 2 + SEAM_GAP;
const SEAM_H = 640;

/** Serpentine boundary running the full seam height, oscillating +/- amplitude around cx. */
const waveFrom = (cx: number) => {
  const half = SEAM_PERIOD / 2;
  let d = '';
  let direction = 1;
  for (let y = 0; y < SEAM_H; y += half) {
    d += ` Q ${cx + direction * SEAM_AMPLITUDE * 2} ${y + half / 2} ${cx} ${y + half}`;
    direction *= -1;
  }
  return d;
};

const LEFT_EDGE = `M 0 0 L ${SEAM_AMPLITUDE} 0${waveFrom(SEAM_AMPLITUDE)} L 0 ${SEAM_H} Z`;
const RIGHT_EDGE = `M ${SEAM_W} 0 L ${SEAM_AMPLITUDE + SEAM_GAP} 0${waveFrom(
  SEAM_AMPLITUDE + SEAM_GAP
)} L ${SEAM_W} ${SEAM_H} Z`;

type PerforationProps = {
  /** Colour of the receipt body on the left of the seam. */
  left: string;
  /** Colour of the stat rail on the right of the seam. */
  right: string;
  /** Page colour revealed through the tear. */
  background: string;
};

/** Vertical torn-ticket seam dividing the hero body from the stat rail. */
export const TicketPerforation = memo(function TicketPerforation({ left, right, background }: PerforationProps) {
  return (
    <View pointerEvents="none" style={[styles.strip, { backgroundColor: background }]}>
      <Svg width={SEAM_W} height={SEAM_H} style={styles.stripSvg}>
        <Path d={LEFT_EDGE} fill={left} />
        <Path d={RIGHT_EDGE} fill={right} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  strip: { alignSelf: 'stretch', width: SEAM_W },
  stripSvg: { left: 0, position: 'absolute', top: 0 }
});
