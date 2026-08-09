import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";

// Real constellation data — recognizable star patterns at correct relative positions
const CONSTELLATIONS = [
  {
    name: "Orion",
    sub: "The Hunter · Winter Sky",
    stars: [
      { x: 90, y: 18, mag: 0.5, name: "Betelgeuse", color: "#FF8866" },  // red supergiant
      { x: 160, y: 22, mag: 1.64, name: "Bellatrix", color: "#B8D4FF" }, // blue giant; mag 1.64, NOT 0.2
      { x: 110, y: 62, mag: 1.7 },
      { x: 125, y: 72, mag: 1.6 },
      { x: 140, y: 82, mag: 1.7 },
      { x: 90, y: 115, mag: 2.1, name: "Saiph", color: "#B8D4FF" },
      { x: 160, y: 108, mag: 0.1, name: "Rigel", color: "#B8D4FF" },     // brightest, blue
    ],
    lines: [[0,2],[1,2],[2,3],[3,4],[4,5],[4,6],[0,5],[1,6]],
  },
  {
    name: "Scorpius",
    sub: "The Scorpion · Summer Sky",
    stars: [
      { x: 70, y: 20, mag: 2.3 },
      { x: 90, y: 30, mag: 2.6 },
      { x: 100, y: 48, mag: 1.0, name: "Antares", color: "#FF6644" },    // red supergiant
      { x: 108, y: 68, mag: 2.3 },
      { x: 120, y: 85, mag: 2.7 },
      { x: 140, y: 95, mag: 2.8 },
      { x: 160, y: 100, mag: 2.9 },
      { x: 175, y: 110, mag: 1.6, name: "Shaula" },
      { x: 180, y: 118, mag: 2.7 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]],
  },
  {
    name: "Ursa Major",
    sub: "The Great Bear · Spring Sky",
    stars: [
      { x: 40, y: 55, mag: 1.8, name: "Dubhe" },
      { x: 70, y: 48, mag: 2.3, name: "Merak" },
      { x: 95, y: 52, mag: 2.4 },
      { x: 115, y: 60, mag: 3.3 },
      { x: 140, y: 58, mag: 1.8, name: "Mizar" },
      { x: 160, y: 50, mag: 2.0 },
      { x: 185, y: 42, mag: 1.9, name: "Alkaid" },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[0,3]],
  },
];

function starRadius(mag: number) {
  return Math.max(1, 4.5 - mag * 0.8);
}

export function ConstellationIgnitionVisual() {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 1 — line drawing animation
  const frameRef = useRef<number>(0);

  // Cycle through constellations every 6 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % CONSTELLATIONS.length);
      setProgress(0);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  // Animate lines drawing in
  useEffect(() => {
    setProgress(0);
    let start = Date.now();
    function tick() {
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / 2000); // 2 second draw-in
      setProgress(p);
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [index]);

  const c = CONSTELLATIONS[index];
  const visibleLines = Math.ceil(c.lines.length * progress);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{c.name}</Text>
        <Text style={styles.sub}>{c.sub}</Text>
      </View>
      <Svg width="100%" height={150} viewBox="0 0 220 140" style={{ marginTop: 4 }}>
        <Defs>
          <RadialGradient id="sky-bg" cx="50%" cy="40%" rx="60%" ry="60%">
            <Stop offset="0%" stopColor="#071225" stopOpacity="1" />
            <Stop offset="100%" stopColor="#030816" stopOpacity="1" />
          </RadialGradient>
        </Defs>

        {/* Sky background */}
        <Rect x="0" y="0" width="220" height="140" rx="14" fill="url(#sky-bg)" />

        {/* Background stars */}
        {Array.from({ length: 35 }, (_, i) => (
          <Circle
            key={`bg-${i}`}
            cx={((i * 47 + 13) % 210) + 5}
            cy={((i * 31 + 7) % 130) + 5}
            r={Math.random() > 0.7 ? 0.8 : 0.4}
            fill="#FFF6D6"
            opacity={0.15 + (i % 5) * 0.05}
          />
        ))}

        {/* Constellation lines — animate drawing in */}
        {c.lines.slice(0, visibleLines).map(([a, b], i) => {
          const sa = c.stars[a], sb = c.stars[b];
          return (
            <Line
              key={`line-${i}`}
              x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y}
              stroke={AuraLunisColors.gold}
              strokeWidth={0.8}
              opacity={0.5}
            />
          );
        })}

        {/* Line glow (wider, dimmer duplicate) */}
        {c.lines.slice(0, visibleLines).map(([a, b], i) => {
          const sa = c.stars[a], sb = c.stars[b];
          return (
            <Line
              key={`glow-${i}`}
              x1={sa.x} y1={sa.y} x2={sb.x} y2={sb.y}
              stroke={AuraLunisColors.gold}
              strokeWidth={3}
              opacity={0.06}
            />
          );
        })}

        {/* Stars */}
        {c.stars.map((star, i) => {
          const r = starRadius(star.mag);
          const color = star.color || "#FFF6D6";
          const showLabel = progress > 0.6 && star.name;
          return (
            <G key={`star-${i}`}>
              {/* Glow for bright stars */}
              {star.mag < 1.5 && (
                <Circle cx={star.x} cy={star.y} r={r * 3} fill={color} opacity={0.1} />
              )}
              {/* Star dot */}
              <Circle cx={star.x} cy={star.y} r={r} fill={color} opacity={progress > 0.1 ? 0.9 : 0.3} />
              {/* Name label */}
              {showLabel && (
                <SvgText
                  x={star.x}
                  y={star.y - r - 4}
                  fill={AuraLunisColors.gold}
                  fontSize={7}
                  fontWeight="600"
                  textAnchor="middle"
                  opacity={0.5}
                >
                  {star.name}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>
      <View style={styles.dots}>
        {CONSTELLATIONS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(3, 8, 22, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(217, 168, 78, 0.12)",
    marginBottom: 14,
  },
  header: { marginBottom: 2 },
  name: {
    color: AuraLunisColors.gold,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },
  sub: {
    color: AuraLunisColors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(192, 198, 212, 0.2)",
  },
  dotActive: {
    backgroundColor: AuraLunisColors.gold,
  },
});
