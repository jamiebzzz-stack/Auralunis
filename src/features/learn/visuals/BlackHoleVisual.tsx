// BlackHoleVisual.tsx — a schematic black-hole system.
//
// SCIENTIFIC VISUALISATION, NOT A PHOTOGRAPH. Nothing here is telescope data, and the label
// on screen says so. It is drawn to teach four specific things, and each element exists
// because it carries one of them:
//
//   · the SHADOW — the apparent dark region produced by captured light paths and extreme
//     lensing. It is larger than the event horizon itself; the horizon is a boundary, not a
//     dark physical surface painted on the sky.
//   · the ACCRETION DISK — visible light comes from heated gas around the black hole, not from
//     the hole itself.
//   · GRAVITATIONAL LENSING — the disk's far side is bent up and over into view above and
//     below the shadow. That arc is the single most important thing in the picture: it is why
//     black-hole imagery looks the way it does, and it is real physics, not artistic licence.
//   · DOPPLER BRIGHTENING — the side of the disk rotating toward the viewer is brighter.
//
// The jets are drawn faintly and LABELLED as belonging to accreting systems, because they are
// not a property every black hole has. Same reasoning as the Deep Sky remnant: the picture must
// not assert more than the class supports.
//
// Not to scale, and deliberately so — the disk's real extent dwarfs the shadow.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";

const W = 300;
const H = 220;
const CX = W / 2;
const CY = H / 2;
/** Radius of the apparent shadow — deliberately not labelled as the horizon radius. */
const SHADOW_R = 30;

export function BlackHoleVisual() {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>ANATOMY OF A BLACK HOLE</Text>
      <Text style={styles.sub}>Scientific visualization — not to scale</Text>

      <View style={styles.stage}>
        <Svg width={W} height={H}>
          <Defs>
            {/* Disk emission: hottest and brightest toward the inner edge. */}
            <LinearGradient id="bhDiskWarm" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFE9B8" stopOpacity="0.25" />
              <Stop offset="0.5" stopColor="#FFC46B" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#FF8A3D" stopOpacity="0.3" />
            </LinearGradient>
            <RadialGradient id="bhGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor="#FFB870" stopOpacity="0" />
              <Stop offset="0.78" stopColor="#FFB870" stopOpacity="0.22" />
              <Stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id="bhJet" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#9FD4FF" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#9FD4FF" stopOpacity="0.28" />
              <Stop offset="1" stopColor="#9FD4FF" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Jets — faint, and labelled below as accreting-system only. */}
          <Path d={`M ${CX - 5} ${CY - SHADOW_R} L ${CX - 13} 6 L ${CX + 13} 6 L ${CX + 5} ${CY - SHADOW_R} Z`} fill="url(#bhJet)" />
          <Path d={`M ${CX - 5} ${CY + SHADOW_R} L ${CX - 13} ${H - 6} L ${CX + 13} ${H - 6} L ${CX + 5} ${CY + SHADOW_R} Z`} fill="url(#bhJet)" />

          {/* LENSED FAR SIDE: the disk behind the black hole, bent up and over into view.
              Physically this material is hidden behind the shadow; its light is deflected
              toward the viewer, which is why it appears above and below. */}
          <Path
            d={`M ${CX - 74} ${CY} A 74 46 0 0 1 ${CX + 74} ${CY}`}
            fill="none" stroke="url(#bhDiskWarm)" strokeWidth={11} strokeLinecap="round"
          />
          <Path
            d={`M ${CX - 74} ${CY} A 74 46 0 0 0 ${CX + 74} ${CY}`}
            fill="none" stroke="url(#bhDiskWarm)" strokeWidth={9} strokeOpacity={0.75} strokeLinecap="round"
          />

          {/* Diffuse halo of the surrounding emission. */}
          <Circle cx={CX} cy={CY} r={72} fill="url(#bhGlow)" />

          {/* SHADOW — drawn last over the lensed light so it reads as an absence in the glow.
              This is the apparent shadow, not a drawing of the event horizon itself. */}
          <Circle cx={CX} cy={CY} r={SHADOW_R} fill="#04050A" />
          {/* Photon-ring cue: light strongly lensed around the compact object. This is schematic,
              not a claim that the horizon sits on this visible ring. */}
          <Circle cx={CX} cy={CY} r={SHADOW_R + 1.5} fill="none" stroke="#FFD9A0" strokeWidth={1.6} strokeOpacity={0.75} />

          {/* Foreground disk — passes IN FRONT of the shadow, so it is drawn over it. The left
              limb is brighter: the side rotating toward the viewer is Doppler-boosted. */}
          <G>
            <Ellipse cx={CX} cy={CY} rx={112} ry={17} fill="none" stroke="url(#bhDiskWarm)" strokeWidth={13} strokeOpacity={0.9} />
            <Ellipse cx={CX} cy={CY} rx={112} ry={17} fill="none" stroke="#FFF0CE" strokeWidth={3} strokeOpacity={0.35} />
          </G>
        </Svg>
      </View>

      <View style={styles.legend}>
        <Legend swatch="#04050A" ring label="Shadow" note="apparent dark region from light capture and lensing" />
        <Legend swatch="#FFC46B" label="Accretion disk" note="heated gas — visible light comes from the gas, not the hole" />
        <Legend swatch="#FFE9B8" label="Lensed far side" note="light from behind, bent into view" />
        <Legend swatch="#9FD4FF" label="Jets" note="in some accreting systems — not every black hole" />
      </View>

      <Text style={styles.caption}>
        A black hole gives off no visible light of its own. Everything luminous here is material
        around it. The dark shadow is an apparent region shaped by light capture and extreme
        lensing, and is larger than the event horizon itself. The arcs above and below are the
        far side of the disk, bent into view by curved spacetime. Schematic, not to scale, and
        not a telescope image.
      </Text>
    </View>
  );
}

function Legend({ swatch, label, note, ring }: { swatch: string; label: string; note: string; ring?: boolean }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: swatch }, ring && styles.swatchRing]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28, padding: 16, backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14
  },
  label: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  sub: { color: AuraLunisColors.faint, fontSize: 10, marginTop: 4, fontStyle: "italic" },
  stage: { width: W, height: H, alignSelf: "center", marginTop: 8 },
  legend: { marginTop: 10, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  swatchRing: { borderWidth: 1, borderColor: "#FFD9A0" },
  legendLabel: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  legendNote: { color: AuraLunisColors.faint, fontSize: 10, flex: 1 },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 }
});
