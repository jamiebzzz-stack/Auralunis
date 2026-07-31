import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { TAB_BAR_STYLE } from "@/navigation/RootTabs";
import type { FocusTarget } from "@/features/sky-lens/SkyLensScreen";
import { ScreenShell } from "@/components/ScreenShell";
import { FeatureCard } from "@/components/FeatureCard";
import { GlassPanel } from "@/components/GlassPanel";
import { SkyLensScreen } from "@/features/sky-lens/SkyLensScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ManualSkyMap } from "@/features/sky-lens/ManualSkyMap";
import { featuredDeepSkyObjects } from "@/features/archive/DeepSkyCatalog";
import { AuraLunisColors } from "@/theme/tokens";
import { useAuraLunisVault } from "@/state/AuraLunisVaultContext";
import { SatelliteThermalOverlayPanel } from "@/features/aura-pro/SatelliteThermalOverlayPanel";
import { AstrophotographyPredictorPanel } from "@/features/aura-pro/AstrophotographyPredictorPanel";
import { computeTonightSky, findBody } from "@/features/sky-lens/ephemeris/SkyEphemerisService";
import { useObserverLocation } from "@/features/sky-lens/ephemeris/useObserverLocation";
import { displaySeasonLabel } from "@/utils/seasons";
import { OrbitalAlignmentScreen } from "@/screens/OrbitalAlignmentScreen";
import { BirthSkyScreen } from "@/screens/BirthSkyScreen";
import { AstroWeatherScreen } from "@/screens/AstroWeatherScreen";
import { PhotoPlannerScreen } from "@/screens/PhotoPlannerScreen";
import { SkyShareScreen } from "@/screens/SkyShareScreen";
import { CelestialArchiveScreen } from "@/screens/CelestialArchiveScreen";
import { CelestialCalendarScreen } from "@/screens/CelestialCalendarScreen";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { useFirstLight } from "@/features/first-light/FirstLightContext";

export function SkyScreen() {
  const { isPremium } = useEntitlement();
  const { openPaywall } = usePaywallNavigation();
  const [skyLensOpen, setSkyLensOpen] = useState(false);
  const [manualMapOpen, setManualMapOpen] = useState(false);
  const [galaxyModeOn, setGalaxyModeOn] = useState(false);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [birthSkyOpen, setBirthSkyOpen] = useState(false);
  const [astroWeatherOpen, setAstroWeatherOpen] = useState(false);
  const [photoPlannerOpen, setPhotoPlannerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [skyShareOpen, setSkyShareOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const { addItem } = useAuraLunisVault();

  const { location, status, enableLocation } = useObserverLocation();
  const sky = useMemo(() => computeTonightSky(location), [location]);

  // Hide the (absolute-positioned) bottom tab bar during full-screen immersive
  // modes so it doesn't sit on top of the Sky Lens layer pills / Alignment controls.
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  useEffect(() => {
    const immersive = skyLensOpen || alignmentOpen || birthSkyOpen || astroWeatherOpen || photoPlannerOpen || skyShareOpen || archiveOpen || calendarOpen;
    navigation.setOptions({ tabBarStyle: immersive ? { display: "none" } : TAB_BAR_STYLE });
  }, [navigation, skyLensOpen, alignmentOpen, birthSkyOpen, astroWeatherOpen, photoPlannerOpen, skyShareOpen, archiveOpen, calendarOpen]);

  // First Light runs its hands-on steps inside Sky Lens. Open the lens ONCE, on the transition
  // into that phase of the tour. If the user then closes Sky Lens the effect does not re-fire,
  // so the tutorial can always be walked away from — it never traps anyone in a screen.
  const firstLight = useFirstLight();
  const tourNeedsSkyLens = firstLight?.overlayVisible === true && firstLight.step?.host === "skyLens";
  const tourNeededSkyLensRef = useRef(false);
  useEffect(() => {
    if (tourNeedsSkyLens && !tourNeededSkyLensRef.current) setSkyLensOpen(true);
    tourNeededSkyLensRef.current = tourNeedsSkyLens;
  }, [tourNeedsSkyLens]);

  // A Learn lesson can deep-link here with a target ("See in Sky Lens"): open the
  // lens straight to Find Mode on that object, then clear the param so it doesn't
  // re-fire on the next focus.
  useEffect(() => {
    const t = route.params?.focusTarget as FocusTarget | undefined;
    if (t) {
      setFocusTarget(t);
      setSkyLensOpen(true);
      navigation.setParams({ focusTarget: undefined });
    }
  }, [route.params?.focusTarget, navigation]);

  // Sky Lens is a sensor-aligned cinematic planetarium (no camera feed), so it opens
  // directly and takes over the full screen — no camera-permission gate.
  if (skyLensOpen) {
    return (
      // Outer boundary catches crashes in the sensor manager / hooks (which run in
      // SkyLensScreen itself, above the inner SkyLensErrorBoundary around the canvas).
      <ErrorBoundary>
        <SkyLensScreen
          onClose={() => { setSkyLensOpen(false); setFocusTarget(null); }}
          focusTarget={focusTarget}
          onOpenLearn={() => navigation.navigate("Learn")}
        />
      </ErrorBoundary>
    );
  }

  // Orbital Alignment also takes over the full screen. It used to render as an
  // absoluteFill overlay INSIDE ScreenShell's ScrollView, which positioned it
  // under the brand header and let it scroll — that's why it looked off.
  if (alignmentOpen) {
    return (
      <View style={styles.alignmentRoot}>
        <OrbitalAlignmentScreen />
        <TouchableOpacity style={styles.backButton} onPress={() => setAlignmentOpen(false)}>
          <Text style={styles.backButtonText}>← Sky</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (birthSkyOpen) {
    return <BirthSkyScreen onClose={() => setBirthSkyOpen(false)} />;
  }

  if (astroWeatherOpen) {
    return <AstroWeatherScreen onClose={() => setAstroWeatherOpen(false)} />;
  }

  if (photoPlannerOpen) {
    return <PhotoPlannerScreen onClose={() => setPhotoPlannerOpen(false)} />;
  }

  if (skyShareOpen) {
    return <SkyShareScreen onClose={() => setSkyShareOpen(false)} />;
  }

  if (archiveOpen) {
    return <CelestialArchiveScreen onClose={() => setArchiveOpen(false)} />;
  }

  if (calendarOpen) {
    return (
      <CelestialCalendarScreen
        onClose={() => setCalendarOpen(false)}
        onSeeInSky={() => {
          // Events have no precise coords yet — open the planetarium so the user can pan
          // to the event's described direction. Coordinate deep-link is a TODO.
          setCalendarOpen(false);
          setSkyLensOpen(true);
        }}
      />
    );
  }

  return (
    <ScreenShell title="Sky Lens + Archive" subtitle="Sky">
      {manualMapOpen ? <ManualSkyMap onClose={() => setManualMapOpen(false)} /> : null}

      <FeatureCard
        title="AuraLunis Sky Lens"
        description="Sensor-aligned live planetarium with celestial overlays, Find Mode, Birth Overlay, guided exploration, and capture."
        actionLabel="Open Sky Lens"
        onPress={() => setSkyLensOpen(true)}
      />

      <FeatureCard
        title="Manual Sky Map"
        description="Explore the sky manually without using device orientation. Ideal when indoors or when you prefer a still map."
        actionLabel="Open Manual Map"
        onPress={() => setManualMapOpen(true)}
      />

      <FeatureCard
        title="Orbital Alignment"
        description="Point your phone at the sky and lock onto a satellite or celestial target using live GPS and device orientation. Radar scope tracks the target in real time."
        actionLabel="Open Alignment"
        onPress={() => setAlignmentOpen(true)}
      />

      <GlassPanel accent style={{ marginBottom: 12 }}>
        <Text style={styles.sectionLabel}>TONIGHT’S SKY · LIVE</Text>
        <Text style={styles.sectionTitle}>Real positions for your location</Text>
        {sky.bodies.map((body) => (
          <View key={body.id} style={styles.skyRow}>
            <Text style={styles.skyName}>{body.name}</Text>
            <Text style={body.aboveHorizon ? styles.skyVal : styles.skyValDim}>
              {body.aboveHorizon
                ? `az ${Math.round(body.azimuthDegrees)}° · alt ${Math.round(body.altitudeDegrees)}°`
                : "below horizon"}
            </Text>
          </View>
        ))}
        {status === "fallback" ? (
          // Explicit, user-initiated location enable — the ONLY path that may show the iOS
          // location prompt. Automatic/mount paths only check existing permission.
          <TouchableOpacity
            onPress={enableLocation}
            accessibilityRole="button"
            accessibilityLabel="Use my location for your exact sky"
          >
            <Text style={styles.skyHint}>Default location · tap Use My Location for your exact sky.</Text>
          </TouchableOpacity>
        ) : null}
      </GlassPanel>

      <FeatureCard
        title="Celestial Calendar"
        description="Upcoming meteor showers, eclipses, oppositions, and conjunctions for 2026–2027 — with the best time, where to look, and reminders."
        actionLabel="Open Calendar"
        onPress={() => setCalendarOpen(true)}
      />

      <FeatureCard
        title="Find Mode"
        description="Guide to the Moon, Venus, Jupiter, and tonight’s best targets using live ephemeris and device orientation."
        actionLabel="Find Venus"
        onPress={() => {
          const venus = findBody(sky, "venus");
          Alert.alert(
            "Find Mode · Venus",
            venus && venus.aboveHorizon
              ? `Venus is up now: compass azimuth ${Math.round(venus.azimuthDegrees)}°, altitude ${Math.round(venus.altitudeDegrees)}° above the horizon. Point your phone there. On-device, the compass and gyro align the overlay arrow to this position.`
              : "Venus is below the horizon right now. Find Mode will point you to it once it rises."
          );
        }}
      />

      <FeatureCard
        title="Your Birth Sky"
        description="What did the sky look like the night you were born? Moon phase, sun sign, rising constellation, visible planets, and a poetic cosmic signature you can share."
        actionLabel="Reveal My Birth Sky"
        onPress={() => {
          // Birth Sky is an entirely premium feature: free users get the paywall, never the screen.
          if (!isPremium) { openPaywall(); return; }
          setBirthSkyOpen(true);
        }}
      />

      <FeatureCard
        title="Astro Weather"
        description="Tonight's observing verdict — GO / MAYBE / STAY IN — with the best clear window and an hour-by-hour breakdown of cloud, seeing, and transparency."
        actionLabel="Check Tonight's Sky"
        onPress={() => {
          // Premium feature (as advertised on the paywall): free users get the paywall.
          if (!isPremium) { openPaywall(); return; }
          setAstroWeatherOpen(true);
        }}
      />

      <FeatureCard
        title="Photo Planner"
        description="Astrophotography planner: tonight's verdict, exposure settings for your gear (500 & NPF rules, ISO, stacking), the Milky Way core window, golden/blue hours, and ranked targets."
        actionLabel="Plan a Shoot"
        onPress={() => {
          // Photo Planner is an entirely premium feature: free users get the paywall, never the screen.
          if (!isPremium) { openPaywall(); return; }
          setPhotoPlannerOpen(true);
        }}
      />

      <FeatureCard
        title="Share Your Sky"
        description="Turn tonight's sky into a shareable card — pick a style (cosmic, minimal, data, story), add a note, and share."
        actionLabel="Create Share Card"
        onPress={() => setSkyShareOpen(true)}
      />

      <FeatureCard
        title="Milky Way / Galaxy Mode"
        description={`Milky Way band, Galactic Center, Great Rift, dust lanes, and best viewing guidance. Current state: ${galaxyModeOn ? "On" : "Off"}.`}
        actionLabel={galaxyModeOn ? "Hide Galaxy Mode" : "Show Galaxy Mode"}
        onPress={() => setGalaxyModeOn((previous) => !previous)}
      />

      <SatelliteThermalOverlayPanel />

      <AstrophotographyPredictorPanel />

      <GlassPanel style={{ marginBottom: 12 }}>
        <Text style={styles.sectionLabel}>DEEP SKY HIGHLIGHTS</Text>
        <Text style={styles.sectionTitle}>Nebulae, galaxies, clusters, and remnants</Text>
        <Text style={styles.sectionCopy}>
          Most deep-sky objects need dark skies, binoculars, or a telescope. AuraLunis shows their true sky location honestly.
        </Text>
      </GlassPanel>

      {featuredDeepSkyObjects.slice(0, 8).map((object) => (
        <FeatureCard
          key={object.id}
          title={object.name}
          description={`${object.summary}\n\nLayer: ${object.skyLensLayer.replace("_", " ")} · Best season: ${displaySeasonLabel(object.bestSeason ?? "Varies", location?.latitudeDegrees)} · Naked-eye: ${object.visibleToNakedEye ? "sometimes" : "usually no"}`}
          actionLabel="Save + Find"
          onPress={() => {
            // Saving to the (premium) Vault requires entitlement — free users get the paywall.
            if (!isPremium) { openPaywall(); return; }
            addItem({ type: "archive", title: object.name, detail: object.summary });
            Alert.alert(object.name, "Saved to your Cosmic Vault.");
          }}
          status={object.type.replace("_", " ")}
        />
      ))}

      <FeatureCard
        title="Celestial Archive"
        description="The reference library — Solar System, Moon, Planets, Constellations, Stars, Deep Sky, Milky Way, and Events, each with live counts and a jump to learn it."
        actionLabel="Open Archive"
        onPress={() => {
          // The full Celestial Archive is a premium feature: free users get the paywall.
          if (!isPremium) { openPaywall(); return; }
          setArchiveOpen(true);
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "rgba(98,207,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(98,207,255,0.18)"
  },
  sectionLabel: { color: AuraLunisColors.gold2, fontSize: 10, letterSpacing: 2.4, fontWeight: "900" },
  sectionTitle: { color: "#FFF", fontSize: 20, fontWeight: "900", marginTop: 8 },
  sectionCopy: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 19, marginTop: 6 },
  skyCard: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "rgba(217,168,78,0.08)",
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.20)"
  },
  skyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)"
  },
  skyName: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  skyVal: { color: AuraLunisColors.gold2, fontSize: 13, fontVariant: ["tabular-nums"] },
  skyValDim: { color: AuraLunisColors.muted, fontSize: 13 },
  skyHint: { color: AuraLunisColors.muted, fontSize: 11, marginTop: 10 },
  alignmentRoot: { flex: 1, backgroundColor: AuraLunisColors.cosmicBlack },
  backButton: {
    position: "absolute",
    top: 54,
    left: 20,
    backgroundColor: "rgba(7,18,37,0.88)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: AuraLunisColors.borderGold,
  },
  backButtonText: {
    color: AuraLunisColors.gold2,
    fontSize: 14,
    fontWeight: "700",
  },
});
