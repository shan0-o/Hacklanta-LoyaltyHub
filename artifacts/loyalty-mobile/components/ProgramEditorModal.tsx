import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Business, BusinessInput, BusinessUpdate } from "@/context/LoyaltyContext";
import { useColors } from "@/hooks/useColors";

type ProgramFields = Omit<BusinessInput, "staffPin"> & { staffPin?: string };

export function ProgramEditorModal({
  visible,
  business,
  onClose,
  onSave,
}: {
  visible: boolean;
  business: Business | null;
  onClose: () => void;
  onSave: (input: ProgramFields, businessId?: string) => Promise<void>;
}) {
  const colors = useColors();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [programName, setProgramName] = useState("");
  const [goal, setGoal] = useState("8");
  const [rewardDescription, setRewardDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(business?.name ?? "");
    setCategory(business?.category ?? "");
    setLocation(business?.location ?? "");
    setDescription(business?.description ?? "");
    setProgramName(business?.programName ?? "");
    setGoal(String(business?.goal ?? 8));
    setRewardDescription(business?.rewardDescription ?? "");
    setTerms(business?.terms ?? "");
    setStaffPin("");
    setConfirmPin("");
    setError("");
  }, [business, visible]);

  async function submit() {
    if (saving) return;
    const numericGoal = Number(goal);
    if (!name.trim() || !category.trim() || !location.trim() || !programName.trim()) {
      setError("Add a business name, category, location, and program name.");
      return;
    }
    if (!Number.isInteger(numericGoal) || numericGoal < 2 || numericGoal > 30) {
      setError("Set a reward threshold between 2 and 30 stamps.");
      return;
    }
    if (!rewardDescription.trim()) {
      setError("Describe the reward customers can earn.");
      return;
    }
    if (!business && !/^[0-9]{4,8}$/.test(staffPin)) {
      setError("Set a staff PIN with 4–8 digits.");
      return;
    }
    if (staffPin && !/^[0-9]{4,8}$/.test(staffPin)) {
      setError("A new staff PIN must have 4–8 digits.");
      return;
    }
    if (staffPin && staffPin !== confirmPin) {
      setError("The PIN entries do not match.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const fields = {
        name: name.trim(),
        category: category.trim(),
        location: location.trim(),
        description: description.trim(),
        programName: programName.trim(),
        goal: numericGoal,
        rewardDescription: rewardDescription.trim(),
        terms: terms.trim(),
        ...(staffPin ? { staffPin } : {}),
      };
      await onSave(fields, business?.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The program could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      color: colors.foreground,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
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
            onPress={onClose}
            style={styles.iconButton}
            accessibilityLabel="Close program editor"
          >
            <Ionicons name="close" size={23} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {business ? "Program settings" : "Create your business"}
          </Text>
          <View style={styles.iconButton} />
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            {business ? "Shape your loyalty program" : "Start with a simple loyalty card"}
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Set the business details, the stamps needed for a reward, and who can approve customer requests.
          </Text>

          <Field label="BUSINESS NAME" value={name} onChange={setName} placeholder="e.g. Daybreak Coffee" style={fieldStyle} />
          <View style={styles.row}>
            <Field label="CATEGORY" value={category} onChange={setCategory} placeholder="Coffee shop" style={[fieldStyle, styles.halfInput]} />
            <Field label="LOCATION" value={location} onChange={setLocation} placeholder="Brooklyn, NY" style={[fieldStyle, styles.halfInput]} />
          </View>
          <Field label="BUSINESS DESCRIPTION" value={description} onChange={setDescription} placeholder="What makes your place special?" style={fieldStyle} multiline />
          <Field label="PROGRAM NAME" value={programName} onChange={setProgramName} placeholder="The regulars club" style={fieldStyle} />
          <View style={styles.row}>
            <Field label="STAMPS TO A REWARD" value={goal} onChange={(value) => setGoal(value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="8" style={[fieldStyle, styles.halfInput]} keyboardType="number-pad" />
            <Field label="REWARD" value={rewardDescription} onChange={setRewardDescription} placeholder="One coffee on us" style={[fieldStyle, styles.halfInput]} />
          </View>
          <Field label="PROGRAM TERMS" value={terms} onChange={setTerms} placeholder="One approved stamp per visit." style={fieldStyle} multiline />

          <View style={[styles.pinCard, { backgroundColor: colors.secondary }]}>
            <View style={styles.pinTitleRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
              <Text style={[styles.pinTitle, { color: colors.foreground }]}>Staff approval PIN</Text>
            </View>
            <Text style={[styles.pinHelp, { color: colors.mutedForeground }]}>
              {business
                ? "Enter a new PIN only if you want to replace the current one. It is never shown again."
                : "Staff enter this PIN to approve each stamp or redemption. It is stored as a secure hash."}
            </Text>
            <Field
              label={business ? "NEW PIN (OPTIONAL)" : "SET PIN"}
              value={staffPin}
              onChange={(value) => setStaffPin(value.replace(/[^0-9]/g, "").slice(0, 8))}
              placeholder="4–8 digits"
              style={fieldStyle}
              keyboardType="number-pad"
              secureTextEntry
            />
            {!!staffPin && (
              <Field
                label="CONFIRM PIN"
                value={confirmPin}
                onChange={(value) => setConfirmPin(value.replace(/[^0-9]/g, "").slice(0, 8))}
                placeholder="Enter it again"
                style={fieldStyle}
                keyboardType="number-pad"
                secureTextEntry
              />
            )}
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
              {error}
            </Text>
          )}
          <Pressable
            testID="save-program"
            onPress={() => void submit()}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.primary, opacity: pressed || saving ? 0.75 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>
                  {business ? "Save program" : "Create loyalty program"}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  style,
  multiline = false,
  keyboardType,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style: object;
  multiline?: boolean;
  keyboardType?: "default" | "number-pad";
  secureTextEntry?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={[style, multiline && styles.multiline]}
        maxLength={multiline ? 1000 : 120}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={secureTextEntry ? "none" : "sentences"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  content: { padding: 22, gap: 15, paddingBottom: 38 },
  title: { fontSize: 25, lineHeight: 31, fontFamily: "Inter_700Bold" },
  description: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", gap: 12 },
  halfInput: { flex: 1 },
  field: { flex: 1, gap: 7 },
  label: { fontSize: 10, letterSpacing: 1, fontFamily: "Inter_700Bold" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 14, fontFamily: "Inter_400Regular" },
  multiline: { minHeight: 76, paddingTop: 12 },
  pinCard: { padding: 15, borderRadius: 18, gap: 12 },
  pinTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pinHelp: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  error: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_500Medium" },
  saveButton: { minHeight: 54, borderRadius: 16, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  saveButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
