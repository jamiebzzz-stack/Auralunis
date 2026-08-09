// SolarSystemLiveVisual.tsx — where the planets actually are, right now.
//
// The previous version was labelled "LIVE ORRERY" and was not live: four dots circling on
// invented periods (`step/8`, `/10`, `/12`, `/14`) around arbitrary rings, in colours matching
// no planet. Every position here now comes from real heliocentric ecliptic longitude — see
// orreryGeometry.ts, which also explains why distances are compressed and says so on screen.
//
// It re-reads slowly because planets move slowly: Mercury, the fastest, covers about 4° a day,
// so a minute-scale refresh is far more than enough and costs nothing.

import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, G, RadialGradient, Stop, Text as SvgText } from "react-native-svg";
import { AuraLunisColors } from "@/theme/tokens";
import { orreryPositions, orreryPoint } from "../orreryGeometry";

const SIZE = 260;
const CENTER = SIZE / 2;
/** Outermost orbit, leaving room for the Neptune dot and its label. */
const MAX_ORBIT = CENTER - 24;
/** Innermost orbit, clear of the Sun's glow so Mercury is not swallowed by it. */
const MIN_ORBIT = 28;
const REFRESH_MS = 60_000;

export function SolarSystemLiveVisual() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const planets = useMemo(() => orreryPositions(now), [now]);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>LIVE ORRERY</Text>
      <Text style={styles.sub}>Heliocentric positions for right now</Text>

      <View style={styles.stage}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <RadialGradient id="orrerySun" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFF6D6" stopOpacity="1" />
              <Stop offset="0.45" stopColor="#F6DC91" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#D9A84E" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Orbits, drawn at the compressed radii the planets sit on. */}
          {planets.map((planet) => (
            <Circle
              key={`orbit-${planet.name}`}
              cx={CENTER}
              cy={CENTER}
              r={MIN_ORBIT + planet.normalizedRadius * (MAX_ORBIT - MIN_ORBIT)}
              fill="none"
              stroke="rgba(217,168,78,0.16)"
              strokeWidth={0.75}
            />
          ))}

          {/* The Sun. */}
          <Circle cx={CENTER} cy={CENTER} r={17} fill="url(#orrerySun)" />
          <Circle cx={CENTER} cy={CENTER} r={5.5} fill="#FFF3C9" />

          {/* Label side is decided once, deterministically, so two planets close in angle do not
              stack their names. Positions themselves are never moved — only the text. */}
          {(() => {
            const points = planets.map((planet) => ({
              planet,
              point: orreryPoint(planet, CENTER, CENTER, MAX_ORBIT, MIN_ORBIT),
            }));
            // A label goes BELOW its dot when another already-placed label is within this many
            // points; Mercury and Mars sit ~9° apart and collided in testing.
            const COLLIDE = 26;
            const placed: Array<{ x: number; y: number }> = [];
            const below = points.map(({ point }) => {
              const clash = placed.some(
                (p) => Math.abs(p.x - point.x) < COLLIDE && Math.abs(p.y - point.y) < 14
              );
              placed.push({ x: point.x, y: point.y });
              return clash;
            });
            return points.map(({ planet, point }, index) => {
            // Gas giants read larger, as they do in every orbital diagram; this is a size
            // hierarchy for legibility, not a claim about relative diameters.
            const dotRadius = planet.semiMajorAxisAU > 4 ? 4.5 : 3.2;
            const labelY = below[index] ? point.y + dotRadius + 11 : point.y - dotRadius - 5;

            return (
              <G key={planet.name}>
                <Circle cx={point.x} cy={point.y} r={dotRadius * 2.6} fill={planet.color} opacity={0.16} />
                <Circle cx={point.x} cy={point.y} r={dotRadius} fill={planet.color} />
                <SvgText
                    x={point.x}
                    y={labelY}
                    fill={AuraLunisColors.faint}
                    fontSize={7}
                    textAnchor="middle"
                >
                  {planet.name}
                </SvgText>
              </G>
            );
            });
          })()}
        </Svg>
      </View>

      <Text style={styles.caption}>
        Each planet is drawn at its true position around the Sun for this moment, computed from
        the same ephemeris the rest of AuraLunis uses. Angles are real; orbital distances are
        compressed to fit — Neptune orbits roughly 78 times further out than Mercury, so a
        to-scale drawing would put the inner planets inside the Sun.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28, padding: 16, backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14
  },
  label: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  sub: { color: AuraLunisColors.faint, fontSize: 11, marginTop: 4 },
  stage: { width: SIZE, height: SIZE, alignSelf: "center", marginTop: 10 },
  caption: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 }
});
