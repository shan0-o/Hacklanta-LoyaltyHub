import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MerchantAnalytics } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

type Retention = NonNullable<MerchantAnalytics['retention']>;
type Week = Retention['weeks'][number];

const fmtPct = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '')}%`;
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayMs = 86400000;
const isPartial = (w: Week) => Date.parse(w.end) - Date.parse(w.start) < 6.5 * dayMs;

function LineChart({
  weeks,
  values,
  max,
  format,
  label,
}: {
  weeks: Week[];
  values: (number | null)[];
  max: number;
  format: (v: number) => string;
  label: string;
}) {
  const colors = useColors();
  const W = 320;
  const H = 150;
  const padX = 26;
  const top = 22;
  const bottom = 30;
  const plotH = H - top - bottom;
  const step = weeks.length > 1 ? (W - padX * 2) / (weeks.length - 1) : 0;
  const pts = values.map((v, i) => ({
    x: weeks.length > 1 ? padX + i * step : W / 2,
    y: v === null ? null : top + plotH - (v / Math.max(max, 1)) * plotH,
    v,
  }));
  const segments: string[][] = [];
  let cur: string[] = [];
  pts.forEach((p) => {
    if (p.y === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push(`${p.x},${p.y}`);
  });
  if (cur.length) segments.push(cur);
  return (
    <View accessible accessibilityLabel={label}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={padX - 10} x2={W - padX + 10} y1={top + plotH} y2={top + plotH} stroke={colors.border} strokeWidth={1} />
        <Line x1={padX - 10} x2={W - padX + 10} y1={top} y2={top} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />
        {segments.map((s, i) =>
          s.length > 1 ? (
            <Polyline key={i} points={s.join(' ')} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          ) : null,
        )}
        {pts.map((p, i) => (
          <React.Fragment key={weeks[i].start}>
            {p.y !== null ? (
              <>
                <Circle cx={p.x} cy={p.y} r={5} fill={colors.accent} stroke={colors.primary} strokeWidth={2} />
                <SvgText x={p.x} y={p.y - 9} fontSize={10} fontWeight="700" fill={colors.foreground} textAnchor="middle">
                  {format(p.v as number)}
                </SvgText>
              </>
            ) : (
              <SvgText x={p.x} y={top + plotH - 6} fontSize={10} fill={colors.mutedForeground} textAnchor="middle">
                –
              </SvgText>
            )}
            <SvgText x={p.x} y={H - 12} fontSize={9.5} fill={colors.mutedForeground} textAnchor="middle">
              {fmtDay(weeks[i].start)}
              {isPartial(weeks[i]) ? '*' : ''}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

function Change({ value, unit, available }: { value: number; unit: string; available: boolean }) {
  const colors = useColors();
  if (!available) {
    return <Text style={[styles.changeMuted, { color: colors.mutedForeground }]}>Not enough historical data</Text>;
  }
  const rounded = Math.round(value * 10) / 10;
  const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const icon = dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'remove';
  const word = dir === 'up' ? 'Increase' : dir === 'down' ? 'Decrease' : 'No change';
  return (
    <View style={[styles.changePill, { backgroundColor: dir === 'up' ? colors.accent : colors.secondary }]}>
      <Ionicons name={icon} size={12} color={colors.primary} />
      <Text style={[styles.changeText, { color: colors.primary }]}>
        {word}
        {dir !== 'flat' ? ` · ${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toString()}${unit}` : ''}
      </Text>
    </View>
  );
}

export function RepeatAnalyticsModal({
  visible,
  onClose,
  retention,
  businessName,
}: {
  visible: boolean;
  onClose: () => void;
  retention?: Retention;
  businessName: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const weeks = retention?.weeks ?? [];
  const hasActivity = (retention?.activeCustomers ?? 0) > 0;
  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <View style={[styles.header, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Repeat customers</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>{businessName} · last 30 days (UTC)</Text>
          </View>
          <Pressable testID="close-analytics" onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.secondary }]}>
            <Ionicons name="close" size={20} color={colors.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {!retention ? (
            <View style={card}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Analytics loading</Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>Retention data isn't available yet. Pull to refresh in a moment.</Text>
            </View>
          ) : (
            <>
              <View style={[styles.hero, { backgroundColor: colors.primary }]}>
                <Text style={styles.heroLabel}>REPEAT VISIT RATE</Text>
                <Text style={[styles.heroValue, { color: colors.accent }]}>{fmtPct(retention.repeatRate)}</Text>
                <Text style={styles.heroCaption}>
                  {retention.repeatCustomers} of {retention.activeCustomers} active customers made 2+ approved visits
                </Text>
              </View>

              <Text style={[styles.section, { color: colors.foreground }]}>Compared with previous 30 days</Text>
              <View style={styles.row}>
                <View style={[...card, styles.half]}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Repeat rate</Text>
                  <Text style={[styles.metric, { color: colors.foreground }]}>{fmtPct(retention.repeatRate)}</Text>
                  {retention.comparisonAvailable && (
                    <Text style={[styles.prev, { color: colors.mutedForeground }]}>was {fmtPct(retention.previousRepeatRate)}</Text>
                  )}
                  <Change value={retention.repeatRateChange} unit=" pp" available={retention.comparisonAvailable} />
                </View>
                <View style={[...card, styles.half]}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Active customers</Text>
                  <Text style={[styles.metric, { color: colors.foreground }]}>{retention.activeCustomers}</Text>
                  {retention.comparisonAvailable && (
                    <Text style={[styles.prev, { color: colors.mutedForeground }]}>was {retention.previousActiveCustomers}</Text>
                  )}
                  <Change value={retention.activeCustomerChange} unit="" available={retention.comparisonAvailable} />
                </View>
              </View>

              <View style={card}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Customer activity trend</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }]}>Unique customers with an approved visit, per week</Text>
                {!hasActivity || weeks.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.mutedForeground }]}>No approved visits in the last 30 days yet.</Text>
                ) : (
                  <LineChart
                    weeks={weeks}
                    values={weeks.map((w) => w.activeCustomers)}
                    max={Math.max(...weeks.map((w) => w.activeCustomers))}
                    format={(v) => String(v)}
                    label="Weekly active customers"
                  />
                )}
              </View>

              <View style={card}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Repeat visit trend</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }]}>Share of that week's active customers with 2+ visits</Text>
                {!hasActivity || weeks.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.mutedForeground }]}>Repeat rates appear once customers start visiting.</Text>
                ) : (
                  <LineChart
                    weeks={weeks}
                    values={weeks.map((w) => (w.activeCustomers > 0 ? w.repeatRate : null))}
                    max={100}
                    format={fmtPct}
                    label="Weekly repeat visit rate"
                  />
                )}
              </View>

              <Text style={[styles.foot, { color: colors.mutedForeground }]}>
                Weeks start Monday (UTC). * marks a partial week clipped to the 30-day window. “–” means no visits that week.
                Each staff-approved stamp counts as one visit, even with double stamps; redemptions don't count as visits.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 14 },
  hero: { borderRadius: 24, padding: 22 },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroValue: { fontSize: 46, fontWeight: '800', marginVertical: 4 },
  heroCaption: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  section: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 12.5, lineHeight: 18 },
  metricLabel: { fontSize: 12 },
  metric: { fontSize: 24, fontWeight: '800' },
  prev: { fontSize: 11.5 },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  changeText: { fontSize: 11, fontWeight: '700' },
  changeMuted: { fontSize: 11.5, fontStyle: 'italic', marginTop: 4 },
  empty: { fontSize: 13, paddingVertical: 28, textAlign: 'center' },
  foot: { fontSize: 11.5, lineHeight: 17 },
});
