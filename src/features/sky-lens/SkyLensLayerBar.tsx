import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { PRIMARY_LAYERS, SECONDARY_LAYERS, type LayerKey } from "./SkyLensLayerCatalog";

type Props = {
  active: Set<LayerKey>;
  nightMode: boolean;
  onToggle: (key: LayerKey) => void;
  onOpenLayers: () => void;
};

// ALL FIVE VISIBLE, ONE ROW, NO SCROLL.
//
// History: v1 wrapped to two rows (stole sky); v2 scrolled horizontally (a hidden Planets
// control reads as broken, and swiping the dock fights panning the sky). Both rejected.
//
// v3 (this): a plain non-scrolling flex row of TEXT-ONLY pills, a fixed divider, and a
// fixed 44x44 icon-only Layers button. The full word "Constellations" is shortened to
// "Constell." in the dock ONLY (unchanged everywhere else).
//
// RESPONSIVE AT ANY WIDTH. Pills are flexShrink:1 and each label is 15pt with
// adjustsFontSizeToFit + minimumFontScale 0.72 — so at 430pt (Pro Max) everything sits at
// a comfortable 15pt with real gaps, and on a narrower phone (390/375/320pt) the pills
// shrink and the font auto-scales DOWN (never below ~10.8pt) rather than clipping or
// ellipsizing. The same mechanism absorbs Dynamic Type and long localized strings.
export function SkyLensLayerBar({ active, nightMode, onToggle, onOpenLayers }: Props) {
  const accent = nightMode ? "#B64A4A" : AuraLunisColors.gold;

  // Counts only overlays the USER turned on — layers that ship on by default (Nebulae)
  // are excluded, or the badge would read "1" on a fresh launch and imply the user had
  // changed something they hadn't.
  const activeExtras = SECONDARY_LAYERS.filter(
    (def) => !def.defaultOn && active.has(def.key)
  ).length;

  return (
    <View style={styles.shell} pointerEvents="box-none">
      {/* NON-SCROLLING flex row: all five controls always visible. Scrolling was removed
          deliberately (a hidden Planets control reads as broken, and swiping the dock
          fights panning the sky). On narrow screens the pills shrink and their label font
          auto-scales to fit — never clipped, never ellipsized. */}
      {PRIMARY_LAYERS.map((def) => {
        const on = active.has(def.key);
        // Dock-only shorthand so all five fit at the 16pt floor. The full word
        // "Constellations" is unchanged everywhere else (sheet, accessibility, info card).
        const dockLabel = def.key === "constellations" ? "Constell." : def.label;
        return (
          <TouchableOpacity
            key={def.key}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${def.label} layer, ${on ? "on" : "off"}`}
            onPress={() => onToggle(def.key)}
            style={[
              styles.pill,
              { borderColor: on ? accent : AuraLunisColors.borderSubtle },
              on && { backgroundColor: accent },
            ]}
          >
            {/* Text-only. The little glyphs (☆◎☁●) were decorative and duplicated the
                word — dropping them is what buys the breathing room to run 15pt labels
                with real gaps instead of crammed icon+text. The ON state reads clearly
                from the filled gold pill. */}
            <Text
              style={[styles.label, on && styles.labelOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {dockLabel}
            </Text>
          </TouchableOpacity>
        );
      })}

      <View style={styles.divider} />

      {/* Pinned to the right of the divider, always fully visible — never the half-cut
          sliver at the screen edge that started all this. */}
      <TouchableOpacity
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={
          activeExtras > 0 ? `Layers, ${activeExtras} overlays on` : "Layers, more overlays"
        }
        onPress={onOpenLayers}
        style={[
          styles.pill,
          styles.layersPill,
          { borderColor: activeExtras > 0 ? accent : AuraLunisColors.borderSubtle },
        ]}
      >
        {/* The button stays DARK regardless of state — recolouring the whole glyph gold
            made the control feel crowded. Active overlays are signalled by a small gold
            count badge pinned to the upper-right corner instead, hidden entirely at zero. */}
        <Text style={styles.layersIcon}>☰</Text>
        {activeExtras > 0 && (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Text style={styles.badgeText}>{activeExtras}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** The bar's fixed height, exported so the screen can derive the dock/exclusion zones
 *  from it instead of hard-coding a magic number that silently drifts out of sync. */
export const LAYER_BAR_HEIGHT = 52;

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    height: LAYER_BAR_HEIGHT,
    marginHorizontal: 4,
    paddingHorizontal: 5,
    borderRadius: 22,
    backgroundColor: "rgba(2,8,20,0.52)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(217,168,78,0.13)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    overflow: "hidden",
  },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    height: 44, // comfortable tap target — unchanged
    flexShrink: 1, // shrink to fit narrow screens; the label font auto-scales with it
    marginHorizontal: 3, // ~6pt gap between controls (was ~4pt — the pills read as one slab)
    paddingHorizontal: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(5,13,29,0.38)",
  },
  // A fixed seam between the pills and the Layers button, so the button sits in a
  // consistent place instead of drifting with the row's slack.
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: 6, // clear space on both sides — never touches the Planets pill
    backgroundColor: "rgba(217,168,78,0.2)",
  },
  // Fixed 44x44 icon button (not a text pill). The menu glyph communicates its function
  // and opens a labelled sheet, so it needs no "Layers" word. Fixed size so the badge
  // appearing/disappearing can't shift it.
  layersPill: {
    width: 40,
    height: 44,
    flexShrink: 0,
    justifyContent: "center",
    backgroundColor: "rgba(5,13,29,0.62)",
  },
  layersIcon: { color: "rgba(231,236,248,0.92)", fontSize: 17, fontWeight: "700" },
  // Inactive label: quieter than the selected one, but still comfortably legible. The ON
  // label (labelOn) is unchanged — dark on filled gold — so selection stays unmistakable.
  label: {
    color: "rgba(231,236,248,0.78)",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  labelOn: { color: "#030816", fontWeight: "900" },
  badge: {
    position: "absolute",
    top: 3,
    right: 3,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#030816", fontSize: 9.5, fontWeight: "900" },
});
