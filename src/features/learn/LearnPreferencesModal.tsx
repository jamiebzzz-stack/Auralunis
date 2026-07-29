// LearnPreferencesModal.tsx — the real Learning Preferences editor (replaces the old
// "coming soon" alert). Single-select skill level + multi-select interests, persisted to
// AsyncStorage. The Learn screen reads these to order categories and lessons.
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { tapLight } from "@/services/HapticService";
import {
  DEFAULT_LEARN_PREFERENCES,
  LEARN_LEVELS,
  LEARN_INTERESTS,
  loadLearnPreferences,
  saveLearnPreferences,
  type LearnLevel,
  type LearnInterest
} from "./learnPreferences";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function LearnPreferencesModal({ visible, onClose }: Props) {
  const [level, setLevel] = useState<LearnLevel>(DEFAULT_LEARN_PREFERENCES.level);
  const [interests, setInterests] = useState<LearnInterest[]>([
    ...DEFAULT_LEARN_PREFERENCES.interests
  ]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the last completed save each time the modal opens. Cancel therefore truly discards
  // any unsaved taps made during the current visit.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setSaving(false);
    setSaveError(null);
    void loadLearnPreferences().then((preferences) => {
      if (!active) return;
      setLevel(preferences.level);
      setInterests(preferences.interests);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  function chooseLevel(next: LearnLevel) {
    tapLight();
    setSaveError(null);
    setLevel(next);
  }

  function toggleInterest(next: LearnInterest) {
    tapLight();
    setSaveError(null);
    setInterests((previous) => (
      previous.includes(next)
        ? previous.filter((interest) => interest !== next)
        : [...previous, next]
    ));
  }

  async function handleSave() {
    if (saving) return;
    if (interests.length === 0) {
      setSaveError("Choose at least one interest before saving.");
      return;
    }

    tapLight();
    setSaving(true);
    setSaveError(null);
    const saved = await saveLearnPreferences({ level, interests });

    if (!saved) {
      setSaving(false);
      setSaveError("AuraLunis couldn't save these preferences. Please try again.");
      return;
    }

    setSaving(false);
    tapLight();
    onClose();
  }

  function handleCancel() {
    if (saving) return;
    tapLight();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Learning Preferences</Text>
          <Pressable onPress={handleCancel} hitSlop={12} disabled={saving}>
            <Text style={[styles.done, saving && styles.textDisabled]}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.intro}>
            Personalize your lessons. We'll surface the topics you care about first and match your level.
          </Text>

          <Text style={styles.sectionLabel}>SKILL LEVEL</Text>
          <View style={styles.pillRow}>
            {LEARN_LEVELS.map((option) => {
              const active = level === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => chooseLevel(option.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label} skill level`}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>INTERESTS</Text>
          {LEARN_INTERESTS.map((interest) => {
            const checked = interests.includes(interest.key);
            return (
              <Pressable
                key={interest.key}
                style={styles.checkRow}
                onPress={() => toggleInterest(interest.key)}
                accessibilityRole="checkbox"
                accessibilityLabel={interest.label}
                accessibilityState={{ checked }}
              >
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                  {checked && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>{interest.label}</Text>
              </Pressable>
            );
          })}

          <Text style={styles.note}>Your Learn tab updates as soon as this save completes.</Text>
          {saveError && (
            <Text style={styles.saveError} accessibilityRole="alert">{saveError}</Text>
          )}

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save learning preferences"
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AuraLunisColors.cosmicBlack ?? "#03060F" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)"
  },
  title: { color: "#FFF", fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  done: { color: AuraLunisColors.gold, fontSize: 16, fontWeight: "800" },
  textDisabled: { opacity: 0.45 },
  body: { padding: 20, paddingBottom: 48 },
  intro: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 21, marginBottom: 22 },
  sectionLabel: { color: AuraLunisColors.gold, fontSize: 11, letterSpacing: 2, fontWeight: "900", marginBottom: 12, marginTop: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    borderWidth: 1, borderColor: AuraLunisColors.borderSubtle, backgroundColor: "rgba(255,255,255,0.04)"
  },
  pillActive: { borderColor: "rgba(217,168,78,0.5)", backgroundColor: "rgba(217,168,78,0.14)" },
  pillText: { color: AuraLunisColors.silver, fontSize: 14, fontWeight: "700" },
  pillTextActive: { color: AuraLunisColors.gold },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: AuraLunisColors.borderSubtle,
    alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)"
  },
  checkboxOn: { borderColor: AuraLunisColors.gold, backgroundColor: "rgba(217,168,78,0.18)" },
  checkMark: { color: AuraLunisColors.gold, fontSize: 14, fontWeight: "900" },
  checkLabel: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  note: { color: AuraLunisColors.faint, fontSize: 12, lineHeight: 18, marginTop: 26 },
  saveError: { color: "#FFB4AB", fontSize: 12, lineHeight: 18, marginTop: 10, fontWeight: "700" },
  saveBtn: {
    marginTop: 22, borderRadius: 14, paddingVertical: 15, alignItems: "center",
    backgroundColor: AuraLunisColors.gold
  },
  saveBtnDisabled: { opacity: 0.58 },
  saveText: { color: AuraLunisColors.cosmicBlack ?? "#03060F", fontWeight: "900", fontSize: 15 }
});
