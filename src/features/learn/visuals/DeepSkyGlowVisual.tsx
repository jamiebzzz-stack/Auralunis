import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";

const LABELS = ["Nebula", "Galaxy", "Cluster", "Remnant"];

const CAPTIONS = [
  "Nebulae glow as vast clouds of gas and dust — the stellar nurseries where new stars ignite.",
  "Galaxies are island cities of billions of stars, often spiralling around a bright central core.",
  "Star clusters are tight families of stars born together from the same collapsing cloud.",
  "Supernova remnants are the glowing shells flung outward when a massive star explodes."
];

const CLUSTER = (() => {
  let s = 0x2545f491 >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  return Array.from({ length: 24 }, () => {
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.7) * 34;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.9, rad: 1 + rng() * 1.9, warm: rng() < 0.3 };
  });
})();

function DeepSkyShape({ type, cx, cy }: { type: number; cx: number; cy: number }) {
  if (type === 0) {
    return (
      <G>
        <Defs>
          <RadialGradient id="dsNeb" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#C9A8FF" stopOpacity={0.55} />
            <Stop offset="55%" stopColor="#8B74FF" stopOpacity={0.22} />
            <Stop offset="100%" stopColor="#8B74FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx - 16} cy={cy + 6} rx={50} ry={38} fill="url(#dsNeb)" />
        <Ellipse cx={cx + 20} cy={cy - 8} rx={42} ry={33} fill="url(#dsNeb)" />
        <Ellipse cx={cx + 2} cy={cy + 2} rx={30} ry={26} fill="url(#dsNeb)" />
        <Circle cx={cx - 8} cy={cy - 2} r={1.5} fill="#FFF6D6" />
        <Circle cx={cx + 14} cy={cy + 9} r={1.3} fill="#FFF6D6" />
        <Circle cx={cx + 4} cy={cy - 12} r={1.1} fill="#FFF6D6" />
      </G>
    );
  }
  if (type === 1) {
    return (
      <G rotation={-22} originX={cx} originY={cy}>
        <Defs>
          <RadialGradient id="dsGal" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFF6D6" stopOpacity={0.9} />
            <Stop offset="32%" stopColor="#9FD4FF" stopOpacity={0.4} />
            <Stop offset="100%" stopColor="#62CFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={cy} rx={64} ry={22} fill="url(#dsGal)" />
        <Path d={`M ${cx - 60} ${cy} Q ${cx - 22} ${cy - 20} ${cx} ${cy} Q ${cx + 22} ${cy + 20} ${cx + 60} ${cy}`} fill="none" stroke="#9FD4FF" strokeWidth={2} strokeOpacity={0.5} strokeLinecap="round" />
        <Path d={`M ${cx - 46} ${cy + 11} Q ${cx - 12} ${cy - 6} ${cx} ${cy}`} fill="none" stroke="#C9A8FF" strokeWidth={1.5} strokeOpacity={0.4} strokeLinecap="round" />
        <Circle cx={cx} cy={cy} r={5.5} fill="#FFF6D6" />
      </G>
    );
  }
  if (type === 2) {
    return (
      <G>
        {CLUSTER.map((star, index) => (
          <Circle key={index} cx={cx + star.x} cy={cy + star.y} r={star.rad} fill={star.warm ? "#FFE9A8" : "#FFF6D6"} opacity={0.92} />
        ))}
      </G>
    );
  }
  return (
    <G>
      <Defs>
        <RadialGradient id="dsRem" cx="50%" cy="50%" r="50%">
          <Stop offset="58%" stopColor="#FF8B6A" stopOpacity={0} />
          <Stop offset="82%" stopColor="#FF8B6A" stopOpacity={0.42} />
          <Stop offset="100%" stopColor="#FF8B6A" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={46} fill="url(#dsRem)" />
      <Circle cx={cx} cy={cy} r={44} fill="none" stroke="#FFB07A" strokeWidth={1.5} strokeOpacity={0.65} />
      <Circle cx={cx} cy={cy} r={33} fill="none" stroke="#F6DC91" strokeWidth={1} strokeOpacity={0.35} />
      <Circle cx={cx} cy={cy} r={2} fill="#FFF6D6" />
    </G>
  );
}

export function DeepSkyGlowVisual({
  onTabChange,
  selectedIndex
}: {
  onTabChange?: (index: number) => void;
  selectedIndex?: number;
} = {}) {
  const [active, setActive] = useState(selectedIndex ?? 0);

  useEffect(() => {
    if (selectedIndex === undefined) return;
    setActive(selectedIndex);
  }, [selectedIndex]);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>DEEP SKY LAYER</Text>
      <View style={styles.canvas}>
        <Svg width="100%" height="100%" viewBox="0 0 280 150">
          <DeepSkyShape type={active} cx={140} cy={75} />
        </Svg>
      </View>
      <View style={styles.row}>
        {LABELS.map((label, index) => (
          <TouchableOpacity
            key={label}
            onPress={() => {
              setActive(index);
              onTabChange?.(index);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active === index }}
            accessibilityLabel={`Show ${label}`}
            hitSlop={6}
          >
            <Text style={[styles.pill, active === index && styles.pillActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.caption}>{CAPTIONS[active]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 28, padding: 16, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14 },
  label: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  canvas: { height: 150, borderRadius: 22, overflow: "hidden", marginTop: 10, backgroundColor: "rgba(3,5,10,0.8)" },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  pill: { color: AuraLunisColors.silver, fontSize: 11, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  pillActive: { color: AuraLunisColors.gold2, borderColor: "rgba(217,168,78,0.28)", backgroundColor: "rgba(217,168,78,0.1)" },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }
});
