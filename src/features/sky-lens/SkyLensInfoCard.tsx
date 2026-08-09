import React, { useEffect, useRef, type ReactNode } from "react";
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { useTourTarget } from "@/features/tour/TourTargetRegistry";
import { TOUR_TARGETS } from "@/features/tour/tourTargets";
import type { SelectedObject } from "./SkyLensVisual";

// expo-blur accessor (same resolution pattern as GlassPanel) — real system blur on
// iOS, graceful semi-transparent fallback elsewhere / when unavailable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStyle = any;
let BlurViewComponent: React.ComponentType<{ intensity?: number; tint?: string; style?: AnyStyle; children?: ReactNode }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BlurViewComponent = (require("expo-blur") as { BlurView: typeof BlurViewComponent }).BlurView;
} catch {
  // expo-blur unavailable — fallback panel used.
}

type Props = {
  object: SelectedObject | null;
  nightMode: boolean;
  saved: boolean;
  showPoetry?: boolean; // premium: the evocative description / myth. free: facts only.
  onSave: (object: SelectedObject) => void;
  onClose: () => void;
};

// Liquid-glass object card — frosted blur, gold-accent border, top light reflection,
// floating depth shadow — that SPRINGS up from the bottom when the user taps a star,
// planet, the Moon, a constellation, or a nebula. Save to Vault is the only action.
// All View/BlurView/Animated.View (no SVG) → crash-safe.
export function SkyLensInfoCard({ object, nightMode, saved, showPoetry = true, onSave, onClose }: Props) {
  // Spring entrance — declared unconditionally (the early-return below sits AFTER the
  // hooks so the rules of hooks hold). Re-springs whenever a new object is selected.
  const slide = useRef(new Animated.Value(0)).current;
  // Lets a guided tour spotlight the real Save button. Registration is a no-op when no tour
  // registry is mounted, so this card behaves identically outside a tour.
  const saveTarget = useTourTarget(TOUR_TARGETS.infoCardSave);
  useEffect(() => {
    if (!object) return;
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, tension: 60, friction: 11 }).start();
  }, [object?.id, slide]);

  if (!object) return null;
  const accent = nightMode ? "#C24A4A" : AuraLunisColors.gold;
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });

  const content = (
    <>
      <View style={styles.innerGlow} pointerEvents="none" />
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: accent }]}>{object.name}</Text>
          {object.subtitle ? <Text style={styles.subtitle}>{object.subtitle}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      {object.facts.length > 0 && (
        <View style={styles.facts}>
          {object.facts.map((f) => (
            <View key={f.label} style={styles.factRow}>
              <Text style={styles.factLabel}>{f.label}</Text>
              <Text style={styles.factValue}>{f.value}</Text>
            </View>
          ))}
        </View>
      )}

      {showPoetry && object.description ? <Text style={styles.desc}>{object.description}</Text> : null}

      <TouchableOpacity
        ref={saveTarget.ref}
        onLayout={saveTarget.onLayout}
        style={[styles.saveBtn, { borderColor: accent }, saved && { backgroundColor: accent }]}
        onPress={() => onSave(object)}
        disabled={saved}
        activeOpacity={0.85}
      >
        <Text style={[styles.saveText, saved && styles.saveTextOn]}>
          {saved ? "✓ Saved to Vault" : "Save to Vault"}
        </Text>
      </TouchableOpacity>
    </>
  );

  // Narrow to a non-null component inside the branch so JSX accepts it.
  const Blur = Platform.OS === "ios" ? BlurViewComponent : null;

  return (
    <Animated.View style={[styles.card, { opacity: slide, transform: [{ translateY }] }]} pointerEvents="box-none">
      <View style={[styles.outer, { borderColor: accent }]}>
        {Blur ? (
          <Blur intensity={48} tint="dark" style={styles.pad}>
            {content}
          </Blur>
        ) : (
          <View style={[styles.pad, styles.fallback]}>{content}</View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12 },
  // Floating frosted-glass shell: rounded, clipped (so the blur respects the radius),
  // gold-accent border, soft depth shadow so it hovers above the sky.
  outer: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 26,
    elevation: 10,
  },
  pad: { padding: 18, overflow: "hidden" },
  fallback: { backgroundColor: "rgba(7,18,37,0.82)" }, // no native blur → readable tint
  // hairline light reflection along the top edge (Liquid Glass refraction)
  innerGlow: { position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: "rgba(255,255,255,0.10)" },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  name: { fontSize: 20, fontWeight: "900", letterSpacing: 0.2 },
  subtitle: { color: AuraLunisColors.silver, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  close: { color: "#E7ECF8", fontSize: 18, fontWeight: "800", paddingHorizontal: 4 },
  facts: { marginTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", paddingTop: 10 },
  factRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  factLabel: { color: AuraLunisColors.muted, fontSize: 13, letterSpacing: 0.1 },
  factValue: { color: "#FFF", fontSize: 13.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  desc: { color: "#D7DEEE", fontSize: 13.5, lineHeight: 20.5, marginTop: 12 },
  saveBtn: { marginTop: 16, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  saveTextOn: { color: "#030816", fontWeight: "900" },
});
