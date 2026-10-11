import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import type { RedemptionResult, StampResult } from "@workspace/api-client-react";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getLoyaltyErrorMessage } from "@/context/LoyaltyContext";
import { useColors } from "@/hooks/useColors";
import type { Business } from "@/context/LoyaltyContext";

type Mode = "stamp" | "redeem";

export function LoyaltyActionModal({
  visible,
  business,
  mode,
  expectedStamps,
  promotion,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  business: Business | null;
  mode: Mode;
  expectedStamps: number;
  promotion: string | null;
  onClose: () => void;
  onConfirm: (
    staffPin: string,
    idempotencyKey: string,
  ) => Promise<StampResult | RedemptionResult>;
}) {
  const colors = useColors();
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestKey] = useState(() => Crypto.randomUUID());
  const punchScale = useRef(new Animated.Value(1)).current;
  const isStamp = mode === "stamp";

  function close() {
    if (isSubmitting) return;
    setPin("");
    setError("");
    setSuccess("");
    onClose();
  }

  async function confirm() {
    if (!business || pin.length !== 4 || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await onConfirm(pin, requestKey);
      setSuccess(result.message);
      setPin("");
      Animated.sequence([
        Animated.timing(punchScale, { toValue: 1.2, duration: 140, useNativeDriver: true }),
        Animated.spring(punchScale, { toValue: 1, useNativeDriver: true }),
      ]).start();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (submitError) {
      setError(getLoyaltyErrorMessage(submitError));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === "web" ? 18 : 0,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={close}
            disabled={isSubmitting}
            style={styles.iconButton}
            accessibilityLabel="Close loyalty confirmation"
          >
            <Ionicons name="close" size={23} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {success
              ? "All set"
              : isStamp
                ? "Approve stamp request"
                : "Approve reward redemption"}
          </Text>
          <View style={styles.iconButton} />
        </View>

        <KeyboardAwareScrollViewCompat
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.actionIcon,
              { transform: [{ scale: punchScale }] },
              { backgroundColor: success ? colors.accent : colors.secondary },
            ]}
          >
            <Ionicons
              name={success ? "checkmark" : isStamp ? "cafe-outline" : "gift-outline"}
              size={26}
              color={colors.primary}
            />
          </Animated.View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {success
              ? isStamp
                ? "Stamp added"
                : "Reward redeemed"
              : isStamp
                ? `A visit at ${business?.name ?? "this store"}`
                : business?.rewardDescription ?? "Your loyalty reward"}
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {success
              ? success
              : isStamp
                ? `${expectedStamps} stamp${expectedStamps === 1 ? "" : "s"} will be added after staff approval.`
                : `This will use ${business?.goal ?? 0} stamps. Any stamps above the reward threshold stay on your card.`}
          </Text>
          {!!success && (
            <Text style={[styles.description, { color: colors.foreground }]}>
              {business?.name}{!isStamp ? ` · ${business?.rewardDescription}` : ''}
            </Text>
          )}

          {!!promotion && !success && (
            <View
              style={[
                styles.promotionNote,
                { backgroundColor: colors.accent },
              ]}
            >
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[styles.promotionText, { color: colors.primary }]}>
                {promotion}
              </Text>
            </View>
          )}

          {success ? (
            <Pressable
              testID="loyalty-action-done"
              onPress={close}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                Done
              </Text>
              <Ionicons name="checkmark" size={19} color={colors.primaryForeground} />
            </Pressable>
          ) : (
            <>
              <View
                style={[
                  styles.pinCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.pinLabel, { color: colors.foreground }]}>
                  STAFF APPROVAL PIN
                </Text>
                <Text style={[styles.pinHelp, { color: colors.mutedForeground }]}>
                  Ask staff to enter their current private four-digit PIN.
                </Text>
                <TextInput
                  testID="staff-approval-pin"
                  value={pin}
                  onChangeText={(value) => {
                    setPin(value.replace(/[^0-9]/g, "").slice(0, 4));
                    setError("");
                  }}
                  placeholder="••••"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  autoFocus={Platform.OS === "web"}
                  style={[
                    styles.pinInput,
                    {
                      backgroundColor: colors.background,
                      borderColor: error ? colors.destructive : colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  accessibilityLabel="Staff approval PIN"
                />
              </View>
              {!!error && (
                <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
                  {error}
                </Text>
              )}
              <Pressable
                testID={isStamp ? "confirm-stamp" : `confirm-redemption-${business?.id}`}
                onPress={() => void confirm()}
                disabled={pin.length !== 4 || isSubmitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: pin.length !== 4 || isSubmitting ? 0.55 : pressed ? 0.82 : 1,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                      {isStamp ? "Confirm stamp" : "Confirm redemption"}
                    </Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
                  </>
                )}
              </Pressable>
              <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
                The PIN is checked by the server and is never stored on this device.
              </Text>
            </>
          )}
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  content: { padding: 22, gap: 16, paddingBottom: 36 },
  actionIcon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  title: { fontSize: 25, lineHeight: 31, fontFamily: "Inter_700Bold" },
  description: { fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular" },
  promotionNote: { flexDirection: "row", gap: 8, alignItems: "center", padding: 13, borderRadius: 14 },
  promotionText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: "Inter_600SemiBold" },
  pinCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  pinLabel: { fontSize: 11, letterSpacing: 1.1, fontFamily: "Inter_700Bold" },
  pinHelp: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  pinInput: {
    height: 54,
    marginTop: 5,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 16,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
  error: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  footnote: { fontSize: 12, lineHeight: 17, textAlign: "center", fontFamily: "Inter_400Regular" },
});
