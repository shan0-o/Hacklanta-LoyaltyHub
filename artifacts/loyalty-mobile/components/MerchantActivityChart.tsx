import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActivityDay } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

export function MerchantActivityChart({ activity }: { activity: ActivityDay[] }) {
  const colors = useColors();
  const maximum = Math.max(1, ...activity.map((day) => day.visits));
  return (
    <View
      accessible
      accessibilityLabel="Approved customer visits per day for the last seven days"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.heading}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Visits this week
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Staff-approved visits · last 7 days
          </Text>
        </View>
      </View>
      <View style={styles.plot}>
        {activity.map((day) => {
          const barHeight = (day.visits / maximum) * 83;
          const date = new Date(`${day.date}T12:00:00Z`);
          return (
            <View
              key={day.date}
              style={styles.dayColumn}
              accessibilityLabel={`${day.date}: ${day.visits} approved visits`}
            >
              <Text style={[styles.value, { color: colors.mutedForeground }]}>
                {day.visits || ""}
              </Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: day.visits ? colors.primary : colors.secondary,
                  },
                ]}
              />
              <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>
                {date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 10 },
  heading: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  subtitle: { marginTop: 4, fontSize: 11, fontFamily: "Inter_400Regular" },
  plot: { minHeight: 122, flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 10 },
  dayColumn: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  value: { height: 14, fontSize: 10, fontFamily: "Inter_500Medium" },
  bar: { width: "72%", borderRadius: 8 },
  dayLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
});
