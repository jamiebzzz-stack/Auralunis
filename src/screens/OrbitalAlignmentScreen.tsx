// OrbitalAlignmentScreen.tsx — AuraLunis Telemetry Hub
// Eight tracking modes unified under one screen:
//   fleet       Atmosphere Explorer (LEO satellites)
//   deep-space  Planetary ephemeris (Solar System)
//   train       Starlink Train Tracker
//   golden      Chrono-Light Golden Hour
//   debris      Debris Clean Mission Loop
//   meteor      Meteor Shower Sonar
//   chain       Sky-Crawl Alignment Chain
//   static      Ionospheric Static audio display
// + Solar Wind Aura header
// + Cosmic Drift galaxy diary
// + Horizon Scope on all radar modes

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Vibration } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, withSpring, Easing,
} from "react-native-reanimated";

import { useDevicePointing } from "@/features/sky-lens/ar/useDevicePointing";
import { useObserverLocation } from "@/features/sky-lens/ephemeris/useObserverLocation";
import type { CameraPointing } from "@/features/sky-lens/ar/SkyLensProjection";
import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";

// Mode services
import { simulateTick, computeFleetState, syncLiveTLEData, isFleetLive, type FleetState } from "@/services/AtmosphereExplorerService";
import { ATMOSPHERE_CATALOG } from "@/data/AtmosphereCatalog";
import { SatelliteDataCard } from "@/components/SatelliteDataCard";
import { SpaceRadarGrid, type RadarBlip } from "@/components/SpaceRadarGrid";
import { HapticController } from "@/utils/hapticController";
import { tapLight } from "@/services/HapticService";
import { computePlanetaryTargets, planetAlignmentDiff } from "@/utils/planetaryEphemeris";
import { getStarlinkTrainBlips, tickStarlinkLive, tickStarlinkMock, initStarlinkTrainLive, trainHapticInterval, isTrainLive, getTrainNodeCount } from "@/services/StarlinkTrainService";
import { computeSunPosition, findNextGoldenEvents, formatCountdown } from "@/services/ChronoLightService";
import { recordLock } from "@/services/CosmicDriftService";
import { CosmicDriftGalaxy } from "@/components/CosmicDriftGalaxy";
import { computeDebrisFleet, tickDebrisMock, tickDebrisLive, initDebrisLive, tickLockTimers, getTotalCatalogued, isDebrisLive } from "@/services/SpaceDebrisService";
import { computeDecayFleet as computeReentryFleet, simulateDecayTick, getDecayFleet, formatReentryWindow, reentryAlertPattern, initReEntryLive, isReEntryLive } from "@/services/ReEntryService";
import { getActiveShowers } from "@/services/MeteorShowerService";
import { getDailyChain, getChainProgress, advanceChain, resetChain } from "@/services/SkyAlignmentChainService";
import { fetchSpaceWeather, AURA_VISUALS, type SpaceWeatherSnapshot } from "@/services/SolarWindService";
import { computeStaticParams, elevationAudioLabel, STATIC_COLORS } from "@/services/IonosphericStaticService";
import { getIonosphericEngine, destroyIonosphericEngine } from "@/services/IonosphericAudioEngine";
import { AuraLunisColors } from "@/theme/tokens";
import { Starfield } from "@/components/Starfield";
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from "react-native-svg";

// A faint mode-coloured wash over the living-sky background so each tracking mode
// has its own feel without overwhelming the scene (3–6% opacity). null = navy default.
function modeTint(mode: TrackingMode): { color: string; opacity: number } | null {
  switch (mode) {
    case "debris": return { color: "#FF3B30", opacity: 0.08 }; // danger red — stronger so it reads as a hazard
    case "reentry": return { color: "#FF9500", opacity: 0.08 }; // amber warning — stronger
    case "train": return { color: "#3A6FFF", opacity: 0.045 }; // cool blue
    case "deep-space": return { color: "#000000", opacity: 0.06 }; // darker, deeper space
    default: return null; // fleet / golden / meteor / chain / static → navy default
  }
}
import { RadarTutorial } from "@/features/onboarding/RadarTutorial";
import { LockShareCard, type LockShareData } from "@/components/LockShareCard";
import { isModeGated, FREE_DRIFT_EVENT_LIMIT, type TrackingMode } from "@/features/paywall/MonetizationCatalog";
import { LOCK_SHARE_MODES, shouldPresentLockShareCard } from "@/screens/telemetryLockShare";
import { useEntitlement } from "@/hooks/useEntitlement";
import { PremiumModeGate } from "@/components/PremiumModeGate";

const PREMIUM_MODE_DESCRIPTIONS: Partial<Record<TrackingMode, string>> = {
  train:   "Track a live Starlink satellite train with machine-gun haptic feedback as the chain sweeps overhead.",
  debris:  "Scan the sky for orbital debris. Hold a 100% lock for 5 seconds to catalogue each piece of space junk.",
  reentry: "Real-time orbital decay alerts. Watch pulsing blips mark objects burning back into the atmosphere.",
  chain:   "Daily multi-target alignment puzzle. Lock Venus, Saturn, and the ISS in a single fluid sweep.",
  static:  "Ionospheric Static audio mode. Hear the sky — noise thins to a clean carrier wave as you lock on.",
};

const MODE_LABELS: Record<TrackingMode, string> = {
  fleet: "Fleet", "deep-space": "Deep Space", train: "Train", golden: "Golden",
  debris: "Debris", meteor: "Meteor", chain: "Chain", static: "Static", reentry: "Re-Entry",
};

const SIM_LOCATION: ObserverLocation = { latitudeDegrees: 39.0997, longitudeDegrees: -94.5786, altitudeMeters: 340 }; // Demo Location (Kansas City, MO)
function buildSimPointing(tick: number): CameraPointing {
  return { azimuthDegrees: (tick * 1.5) % 360, altitudeDegrees: 30 + Math.sin((tick * Math.PI) / 120) * 20, rollDegrees: 0 };
}

export function OrbitalAlignmentScreen() {
  const { pointing: livePointing, available: sensorAvailable } = useDevicePointing(80);
  const { location: liveLocation, status: gpsStatus } = useObserverLocation();

  const [simMode, setSimMode] = useState(false);
  const [simTick, setSimTick] = useState(0);
  const [mode, setMode] = useState<TrackingMode>("fleet");
  const [fleetState, setFleetState] = useState<FleetState>({ satellites: [], activeTarget: null });
  const [selectedSatId, setSelectedSatId] = useState<string | null>(null);
  const [showDrift, setShowDrift] = useState(false);
  const [driftRefresh, setDriftRefresh] = useState(0);
  const [lockShareData, setLockShareData] = useState<LockShareData | null>(null);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [weather, setWeather] = useState<SpaceWeatherSnapshot | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [debrisFleet, setDebrisFleet] = useState<ReturnType<typeof computeDebrisFleet>>([]);
  const [debrisLockCounters, setDebrisLockCounters] = useState<Record<string, number>>({});
  const [reentryFleet, setReentryFleet] = useState<ReturnType<typeof computeReentryFleet>>([]);
  const reentryAlertFiredRef = useRef<Set<string>>(new Set());
  const [chainProgress, setChainProgress] = useState(() => {
    const dummy = { id: "", name: "", description: "", targets: [], difficulty: "easy" as const, reward: 0 };
    return getChainProgress(dummy);
  });

  const { isPremium, refresh: refreshEntitlement } = useEntitlement();
  const hapticCtrl = useRef(new HapticController());
  const trainHapticRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debrisLockTimers = useRef<Record<string, number>>({});
  const wasLockedRef = useRef(false);
  const pulseOpacity = useSharedValue(1);

  const location = simMode ? SIM_LOCATION : liveLocation;
  const pointing = simMode ? buildSimPointing(simTick) : livePointing;

  // `pointing` (and `location`) are new objects on nearly every render — the sensors update
  // continuously. Any 1s setInterval that lists them as effect dependencies is therefore torn
  // down and recreated before it can ever fire. Mirror them into refs so the tick effects can
  // read the latest values while depending only on `mode`.
  const locationRef = useRef(location);
  const pointingRef = useRef(pointing);
  locationRef.current = location;
  pointingRef.current = pointing;

  // Sim sweep
  useEffect(() => {
    if (!simMode) return;
    const id = setInterval(() => setSimTick(t => t + 1), 200);
    return () => clearInterval(id);
  }, [simMode]);

  // Fleet tick
  useEffect(() => {
    if (mode !== "fleet") return;
    const id = setInterval(async () => { simulateTick(); setFleetState(computeFleetState(location, pointing)); }, 1000);
    return () => clearInterval(id);
  }, [mode, location, pointing]);

  useEffect(() => {
    if (mode === "fleet") setFleetState(computeFleetState(location, pointing));
  }, [mode, pointing.azimuthDegrees, pointing.altitudeDegrees]);

  // Live TLE sync — fires once when entering fleet mode
  useEffect(() => {
    if (mode !== "fleet") return;
    syncLiveTLEData()
      .then(synced => { if (synced) setFleetState(computeFleetState(location, pointing)); })
      .catch(() => {}); // silent fallback to simulation
  }, [mode]);

  // Train tick — live re-propagation or mock
  useEffect(() => {
    if (mode !== "train") return;
    // Try to init live data on entry
    initStarlinkTrainLive().catch(() => {});
    const id = setInterval(() => {
      tickStarlinkLive().catch(() => {});
      tickStarlinkMock(); // keeps mock moving too (no-op if live)
    }, 1000);
    return () => clearInterval(id);
  }, [mode]);

  // Debris tick + lock timer
  useEffect(() => {
    if (mode !== "debris") return;
    const id = setInterval(() => {
      // Re-propagate live TLE or advance mock
      tickDebrisLive().catch(() => {});
      tickDebrisMock();
      const fleet = computeDebrisFleet(locationRef.current, pointingRef.current);
      tickLockTimers(fleet);
      setDebrisFleet(fleet);
      setDebrisLockCounters({ ...debrisLockTimers.current });
    }, 1000);
    return () => clearInterval(id);
  }, [mode]);

  // Solar wind fetch
  useEffect(() => {
    fetchSpaceWeather().then(setWeather).catch(() => {});
  }, []);

  // Reentry tick
  useEffect(() => {
    // Re-Entry is a PREMIUM mode: non-entitled users see the upgrade gate, never the live
    // decay ticker or its urgent decay-alert vibration.
    if (mode !== "reentry" || !isPremium) return;
    // Try live TIP data on mode entry
    initReEntryLive().catch(() => {});
    const id = setInterval(() => {
      simulateDecayTick();
      const fleet = computeReentryFleet(locationRef.current, pointingRef.current);
      setReentryFleet(fleet);
      // Fire urgent haptic if critical/imminent corridor crosses local horizon
      fleet.forEach(s => {
        if ((s.object.threatLevel === "critical" || s.object.threatLevel === "imminent") &&
            s.crossesLocalHorizon && !reentryAlertFiredRef.current.has(s.object.id)) {
          reentryAlertFiredRef.current.add(s.object.id);
          Vibration.vibrate(reentryAlertPattern());
        }
      });
    }, 1000);
    return () => clearInterval(id);
  }, [mode, isPremium]);

  // Audio engine — init on mount, destroy on unmount
  useEffect(() => {
    const engine = getIonosphericEngine();
    engine.init().catch(() => {});
    return () => { destroyIonosphericEngine().catch(() => {}); };
  }, []);

  // Chain init
  useEffect(() => {
    if (mode !== "chain") return;
    const chain = getDailyChain(location);
    setChainProgress(getChainProgress(chain));
  }, [mode, location]);

  // Cleanup
  useEffect(() => () => {
    hapticCtrl.current.destroy();
    if (trainHapticRef.current) clearInterval(trainHapticRef.current);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────────
  const planetaryTargets = useMemo(() => mode === "deep-space" ? computePlanetaryTargets(location) : [], [mode, location]);

  const activePlanet = useMemo(() => {
    if (mode !== "deep-space" || !planetaryTargets.length) return null;
    return planetaryTargets.reduce((best, pt) => {
      const d = planetAlignmentDiff(pointing.azimuthDegrees, pointing.altitudeDegrees, pt.azimuth, pt.altitude);
      const bd = planetAlignmentDiff(pointing.azimuthDegrees, pointing.altitudeDegrees, best.azimuth, best.altitude);
      return d.totalAngularError < bd.totalAngularError ? pt : best;
    });
  }, [mode, planetaryTargets, pointing.azimuthDegrees, pointing.altitudeDegrees]);

  const trainBlips = useMemo(() => {
    if (mode !== "train") return [];
    return getStarlinkTrainBlips(location, pointing);
  }, [mode, pointing.azimuthDegrees, pointing.altitudeDegrees, simTick]);

  const sunPos = useMemo(() => mode === "golden" ? computeSunPosition(location) : null, [mode, location, simTick]);
  const goldenEvents = useMemo(() => mode === "golden" ? findNextGoldenEvents(location) : [], [mode, location]);
  const activeShowers = useMemo(() => {
    if (mode !== "meteor") return [];
    return getActiveShowers(location, pointing.azimuthDegrees, pointing.altitudeDegrees);
  }, [mode, location, pointing.azimuthDegrees, pointing.altitudeDegrees]);

  const staticParams = useMemo(() => {
    if (mode !== "static") return null;
    const score = fleetState.activeTarget?.alignment.alignmentScore ?? 0;
    const locked = fleetState.activeTarget?.alignment.isLocked ?? false;
    return computeStaticParams(score, locked);
  }, [mode, fleetState]);

  // Active score / color / name for the badge + haptics
  const { activeScore, isLocked, activeColor, activeName, activeAzimuth, activeElevation, activeAltKm } = useMemo(() => {
    if (mode === "fleet" && fleetState.activeTarget) {
      const t = fleetState.activeTarget;
      return { activeScore: t.alignment.alignmentScore, isLocked: t.alignment.isLocked, activeColor: t.satellite.radarColor, activeName: t.satellite.name, activeAzimuth: t.alignment.targetAzimuth, activeElevation: t.alignment.targetElevation, activeAltKm: t.satellite.altitudeKm };
    }
    if (mode === "deep-space" && activePlanet) {
      const d = planetAlignmentDiff(pointing.azimuthDegrees, pointing.altitudeDegrees, activePlanet.azimuth, activePlanet.altitude);
      return { activeScore: d.alignmentScore, isLocked: d.isLocked, activeColor: activePlanet.planet.radarColor, activeName: activePlanet.planet.name, activeAzimuth: Math.round(activePlanet.azimuth), activeElevation: Math.round(activePlanet.altitude * 10) / 10, activeAltKm: Math.round(activePlanet.distAU * 149597870) };
    }
    if (mode === "train") {
      const act = trainBlips.find(b => b.isActive);
      return { activeScore: act?.alignmentScore ?? 0, isLocked: (act?.totalAngularError ?? 999) < 3.5, activeColor: "#A78BFA", activeName: "Starlink Group 12", activeAzimuth: 0, activeElevation: 0, activeAltKm: 340 };
    }
    if (mode === "reentry" && reentryFleet.length) {
      const t = reentryFleet[0];
      const threatColor = t.object.threatLevel === "imminent" || t.object.threatLevel === "critical" ? "#FF3B30" : "#FF9500";
      return { activeScore: t.alignment.alignmentScore, isLocked: t.alignment.isLocked, activeColor: threatColor, activeName: t.object.name, activeAzimuth: t.alignment.targetAzimuth, activeElevation: t.alignment.targetElevation, activeAltKm: Math.round(t.object.perigeeKm) };
    }
    if (mode === "debris" && debrisFleet.length) {
      const t = debrisFleet[0];
      return { activeScore: t.alignment.alignmentScore, isLocked: t.alignment.isLocked, activeColor: "#FF3B30", activeName: t.object.name, activeAzimuth: t.alignment.targetAzimuth, activeElevation: t.alignment.targetElevation, activeAltKm: t.object.altitudeKm };
    }
    if (mode === "meteor" && activeShowers.length) {
      const s = activeShowers[0];
      const score = Math.max(0, Math.round(100 * (1 - s.angularError / 90)));
      return { activeScore: score, isLocked: s.angularError < 3.5, activeColor: s.shower.radarColor, activeName: s.shower.name, activeAzimuth: Math.round(s.azimuth), activeElevation: Math.round(s.altitude * 10) / 10, activeAltKm: 80 };
    }
    return { activeScore: 0, isLocked: false, activeColor: AuraLunisColors.gold, activeName: "—", activeAzimuth: 0, activeElevation: 0, activeAltKm: 0 };
  }, [mode, fleetState, activePlanet, trainBlips, debrisFleet, activeShowers, pointing]);

  const statusColor = isLocked ? AuraLunisColors.green : activeScore > 65 ? activeColor : AuraLunisColors.silver;
  const statusText = isLocked ? "LOCKED" : activeScore > 65 ? "ALIGNING" : "SEARCHING";

  // Feed alignment score into audio engine whenever in static mode.
  // Static is a PREMIUM mode: a non-entitled user sees the upgrade gate, never the audio.
  useEffect(() => {
    if (mode !== "static" || !isPremium) {
      getIonosphericEngine().setMuted(true);
      return;
    }
    getIonosphericEngine().setMuted(audioMuted);
    if (!audioMuted) {
      getIonosphericEngine().update(activeScore, isLocked);
    }
  }, [mode, activeScore, isLocked, audioMuted, isPremium]);

  // Audio engine — sync with alignment state
  useEffect(() => {
    if (mode !== "static" || !isPremium) {
      destroyIonosphericEngine().catch(() => {});
      return;
    }
    getIonosphericEngine().setMuted(audioMuted);
    if (!audioMuted) {
      getIonosphericEngine().update(activeScore, isLocked);
    }
  }, [mode, activeScore, isLocked, audioMuted, isPremium]);

  // Haptics. Premium modes (debris, reentry, train) must not produce haptics for a non-entitled
  // user — they only see the upgrade gate. Free modes (fleet, deep-space, meteor) are unchanged.
  useEffect(() => {
    const premiumModeBlocked = isModeGated(mode) && !isPremium;
    if (mode === "fleet" || mode === "deep-space" || mode === "meteor" ||
        ((mode === "debris" || mode === "reentry") && isPremium)) {
      hapticCtrl.current.update(activeScore, isLocked);
    }
    if (mode === "train" && !premiumModeBlocked) {
      const act = trainBlips.find(b => b.isActive);
      const interval = trainHapticInterval(act?.totalAngularError ?? 999);
      if (trainHapticRef.current) clearInterval(trainHapticRef.current);
      if (interval) trainHapticRef.current = setInterval(() => tapLight(), interval);
    }
    if (mode === "meteor" && activeShowers.length) {
      const interval = activeShowers[0].sonarInterval;
      if (trainHapticRef.current) clearInterval(trainHapticRef.current);
      if (interval) trainHapticRef.current = setInterval(() => tapLight(), interval);
    }
    // Stop the haptic pulse when leaving train/meteor mode (or on unmount) — otherwise
    // the last setInterval keeps firing tapLight() forever (battery drain).
    return () => {
      if (trainHapticRef.current) {
        clearInterval(trainHapticRef.current);
        trainHapticRef.current = null;
      }
    };
  }, [activeScore, isLocked, mode, trainBlips, activeShowers, isPremium]);

  // Cosmic Drift lock recording + chain advance. Merged into ONE effect so the
  // shared `wasLockedRef` lock-transition is consumed once: previously the
  // recording effect flipped wasLockedRef before the separate chain effect ran,
  // so chain-advance never fired. Deps include the values read on lock, so the
  // recorded target is current rather than a stale closure.
  useEffect(() => {
    const justLocked = isLocked && !wasLockedRef.current;
    if (justLocked && LOCK_SHARE_MODES.includes(mode)) {
      const type = mode === "fleet" ? "satellite" : mode === "deep-space" ? "planet" : "satellite";
      recordLock({ targetId: activeName, targetName: activeName, targetType: type, targetColor: activeColor, observerLat: location.latitudeDegrees, observerLon: location.longitudeDegrees, azimuth: activeAzimuth, elevation: activeElevation, altitudeKm: activeAltKm, isPremium })
        .then(() => setDriftRefresh(n => n + 1)).catch(() => {});

      // Show share card on lock — but NEVER during Simulation Mode. The demo sweep produces
      // continuous automatic locks; each would mount the full-screen LockShareCard overlay,
      // which intercepts every touch and traps the Telemetry controls (mode switch, Unlock
      // Premium, Sim-exit). Real-device/non-simulation locks are unaffected.
      if (shouldPresentLockShareCard(mode, simMode)) {
        setLockShareData({
          targetName: activeName,
          targetColor: activeColor,
          targetType: type,
          alignmentScore: activeScore,
          azimuth: activeAzimuth,
          elevation: activeElevation,
          altitudeKm: activeAltKm,
          observerLat: location.latitudeDegrees,
          observerLon: location.longitudeDegrees,
          locationLabel: "Your Location",
          timestamp: new Date().toISOString(),
        });
      }
    }
    if (justLocked && mode === "chain") {
      advanceChain();
      setChainProgress(p => ({ ...p, currentIndex: Math.min(p.currentIndex + 1, p.chain.targets.length) }));
    }
    wasLockedRef.current = isLocked;
  }, [isLocked, mode, activeName, activeColor, activeAzimuth, activeElevation, activeAltKm, activeScore, location, isPremium, simMode]);

  // Pulse
  useEffect(() => {
    if (isLocked) { pulseOpacity.value = withSpring(1); return; }
    pulseOpacity.value = withRepeat(withSequence(withTiming(0.4, { duration: 650, easing: Easing.inOut(Easing.ease) }), withTiming(1.0, { duration: 650, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [isLocked]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  // Active blips
  const activeBlips: RadarBlip[] = useMemo(() => {
    if (mode === "fleet") return fleetState.satellites.map(s => ({ id: s.satellite.id, azimuthDiff: s.alignment.azimuthDiff, elevationDiff: s.alignment.elevationDiff, color: s.satellite.radarColor, isActive: s.satellite.id === fleetState.activeTarget?.satellite.id, label: s.satellite.shortName }));
    if (mode === "deep-space") return planetaryTargets.map(pt => { const d = planetAlignmentDiff(pointing.azimuthDegrees, pointing.altitudeDegrees, pt.azimuth, pt.altitude); return { id: pt.id, azimuthDiff: d.azimuthDiff, elevationDiff: d.elevationDiff, color: pt.planet.radarColor, isActive: pt.id === activePlanet?.id, label: pt.planet.name }; });
    if (mode === "train") return trainBlips.map(b => ({ id: b.id, azimuthDiff: b.azimuthDiff, elevationDiff: b.elevationDiff, color: b.color, isActive: b.isActive, label: "", opacity: b.opacity }));
    if (mode === "debris") return debrisFleet.map(s => ({ id: s.object.id, azimuthDiff: s.alignment.azimuthDiff, elevationDiff: s.alignment.elevationDiff, color: "#FF3B30", isActive: s.object.id === debrisFleet[0]?.object.id, label: s.object.name, isDebris: true }));
    if (mode === "reentry") return reentryFleet.map(s => ({ id: s.object.id, azimuthDiff: s.alignment.azimuthDiff, elevationDiff: s.alignment.elevationDiff, color: s.object.alertColor, isActive: s.object.id === reentryFleet[0]?.object.id, label: s.object.name, isDecayAlert: true }));
    if (mode === "meteor") return activeShowers.map(s => { const azDiff = (((s.azimuth - pointing.azimuthDegrees + 180) % 360) + 360) % 360 - 180; const elDiff = s.altitude - pointing.altitudeDegrees; return { id: s.shower.id, azimuthDiff: azDiff, elevationDiff: elDiff, color: s.shower.radarColor, isActive: s.shower.id === activeShowers[0]?.shower.id, label: s.shower.name }; });
    if (mode === "chain" && chainProgress.currentIndex < chainProgress.chain.targets.length) {
      const t = chainProgress.chain.targets[chainProgress.currentIndex];
      const azDiff = (((t.azimuth - pointing.azimuthDegrees + 180) % 360) + 360) % 360 - 180;
      const elDiff = t.altitude - pointing.altitudeDegrees;
      return [{ id: t.id, azimuthDiff: azDiff, elevationDiff: elDiff, color: t.color, isActive: true, label: t.name }];
    }
    return [];
  }, [mode, fleetState, planetaryTargets, activePlanet, trainBlips, debrisFleet, activeShowers, chainProgress, pointing]);

  const isReady = simMode || (gpsStatus !== "loading" && sensorAvailable);
  const auraStyle = weather ? AURA_VISUALS[weather.auraIntensity] : AURA_VISUALS.calm;

  // Living-sky background shared by both render states (loading + main): a centre-lifted
  // radial gradient (#071225 → #030816), the Home-style twinkling Starfield, and a faint
  // mode tint. Sits absolutely behind the ScrollView so every mode feels like space.
  const tint = modeTint(mode);
  const skyBackground = (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="orbitalSky" cx="50%" cy="40%" r="80%">
            <Stop offset="0%" stopColor="#071225" />
            <Stop offset="100%" stopColor="#030816" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#orbitalSky)" />
      </Svg>
      <Starfield />
      {tint && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint.color, opacity: tint.opacity }]} />}
    </View>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!isReady) {
    return (
      <View style={[styles.screen, styles.center]}>
        {skyBackground}
        <Text style={styles.title}>AURALUNIS TELEMETRY</Text>
        <View style={styles.loadingCard}>
          <Text style={styles.loadingTitle}>Acquiring telemetry…</Text>
          <Text style={styles.loadingDetail}>GPS: {gpsStatus === "loading" ? "acquiring" : gpsStatus}</Text>
          <Text style={styles.loadingDetail}>Sensors: {sensorAvailable ? "ready" : "initialising"}</Text>
        </View>
        <View style={styles.simCard}>
          <Text style={styles.simCardTitle}>Testing indoors?</Text>
          <TouchableOpacity style={styles.simBtn} onPress={() => setSimMode(true)}>
            <Text style={styles.simBtnText}>Enable Simulation Mode</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      {skyBackground}
      <RadarTutorial onComplete={() => setTutorialDone(true)} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* Solar Wind Aura header */}
        {weather && (
          <View style={[styles.auraBar, { borderColor: auraStyle.primaryColor + "55" }]}>
            <View style={[styles.auraDot, { backgroundColor: auraStyle.primaryColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.auraTitle, { color: auraStyle.primaryColor }]}>SOLAR WIND · Kp {weather.kpIndex.toFixed(1)} · {weather.auraIntensity.toUpperCase()}</Text>
              <Text style={styles.auraDesc}>{weather.summary}</Text>
            </View>
          </View>
        )}

        <Text style={styles.title}>AURALUNIS TELEMETRY</Text>

        {simMode && (
          <TouchableOpacity style={styles.simBanner} onPress={() => setSimMode(false)}>
            <Text style={styles.simBannerText}>⚙ SIMULATION MODE · Tap to exit</Text>
          </TouchableOpacity>
        )}

        {/* Mode switcher — 2 rows of 4 */}
        <View style={styles.modeGrid}>
          {(Object.keys(MODE_LABELS) as TrackingMode[]).map(m => {
            const gated = isModeGated(m) && !isPremium;
            const isActive = mode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[
                  styles.modeBtn,
                  isActive && { borderColor: AuraLunisColors.gold, backgroundColor: "rgba(217,168,78,0.12)" },
                  gated && { borderColor: AuraLunisColors.borderSubtle, opacity: 0.6 },
                ]}
                onPress={() => setMode(m)}
              >
                {gated && <Text style={styles.modeLock}>◈ </Text>}
                <Text style={[styles.modeBtnText, isActive && { color: AuraLunisColors.gold }, gated && { color: AuraLunisColors.faint }]}>
                  {MODE_LABELS[m]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Premium gate — show upgrade card for gated modes on free tier ── */}
        {isModeGated(mode) && !isPremium && (
          <PremiumModeGate
            modeName={MODE_LABELS[mode]}
            modeDescription={PREMIUM_MODE_DESCRIPTIONS[mode] ?? "This mode requires AuraLunis Premium."}
            onUpgrade={refreshEntitlement}
          />
        )}

        {/* ── Golden Hour ── */}
        {mode === "golden" && sunPos && (!isModeGated("golden") || isPremium) && (
          <>
            <View style={[styles.card, { borderColor: "#EF9F27" + "55" }]}>
              <Text style={styles.cardLabel}>Sun Position</Text>
              <View style={styles.pills}>
                <InfoPill label="Az" value={`${Math.round(sunPos.azimuth)}°`} />
                <InfoPill label="El" value={`${sunPos.elevation.toFixed(1)}°`} />
                <InfoPill label="Phase" value={sunPos.phase.replace("-", " ")} />
              </View>
              <View style={[styles.phaseBar, { marginTop: 12 }]}>
                <View style={[styles.phaseFill, { width: `${Math.max(0, Math.min(100, (sunPos.elevation + 6) / 12 * 100))}%` as `${number}%`, backgroundColor: sunPos.isGoldenHour ? "#EF9F27" : "#D9A84E" }]} />
              </View>
            </View>
            {goldenEvents.map(evt => (
              <View key={evt.type} style={[styles.card, { borderColor: "#EF9F27" + "44" }]}>
                <Text style={styles.cardLabel}>{evt.type === "dawn" ? "Golden Dawn" : "Golden Dusk"}</Text>
                <View style={styles.pills}>
                  <InfoPill label="Countdown" value={formatCountdown(evt.minutesUntil)} />
                  <InfoPill label="Sun Az" value={`${Math.round(evt.azimuth)}°`} />
                </View>
                {sunPos.isGoldenHour && <Text style={styles.note}>Golden hour active now — light is perfect.</Text>}
              </View>
            ))}
          </>
        )}

        {/* ── Ionospheric Static ── */}
        {mode === "static" && staticParams && (!isModeGated("static") || isPremium) && (
          <View style={[styles.card, { borderColor: STATIC_COLORS[staticParams.phase] + "55" }]}>
            <Text style={styles.cardLabel}>Ionospheric Static</Text>
            <View style={styles.pills}>
              <InfoPill label="Phase" value={staticParams.phase.replace("-"," ")} />
              <InfoPill label="Noise" value={`${staticParams.noiseFrequency} Hz`} />
              {staticParams.chimeFrequency > 0 && <InfoPill label="Chime" value={`${staticParams.chimeFrequency} Hz`} />}
            </View>
            <Text style={[styles.note, { color: STATIC_COLORS[staticParams.phase], marginTop: 8 }]}>{staticParams.description}</Text>
            <Text style={[styles.note, { marginTop: 6 }]}>{elevationAudioLabel(pointing.altitudeDegrees)}</Text>
          </View>
        )}

        {/* ── Sky Chain ── */}
        {mode === "chain" && (!isModeGated(mode) || isPremium) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Daily Chain · {chainProgress.chain.name}</Text>
            <Text style={[styles.cardVal, { fontSize: 11, marginBottom: 10 }]}>{chainProgress.chain.description}</Text>
            {chainProgress.chain.targets.map((t, i) => (
              <View key={t.id} style={styles.chainRow}>
                <View style={[styles.chainDot, { backgroundColor: i < chainProgress.currentIndex ? AuraLunisColors.green : i === chainProgress.currentIndex ? t.color : AuraLunisColors.elevated }]} />
                <Text style={[styles.chainName, { color: i < chainProgress.currentIndex ? AuraLunisColors.green : i === chainProgress.currentIndex ? t.color : AuraLunisColors.faint }]}>{t.name}</Text>
                {i < chainProgress.currentIndex && <Text style={{ color: AuraLunisColors.green, fontSize: 12 }}>✓</Text>}
                {i === chainProgress.currentIndex && <Text style={{ color: t.color, fontSize: 10, fontWeight: "800" }}>CURRENT</Text>}
              </View>
            ))}
            {chainProgress.completedAt && <Text style={[styles.note, { color: AuraLunisColors.green, marginTop: 8 }]}>Chain complete! +{chainProgress.chain.reward} XP</Text>}
            {!chainProgress.completedAt && chainProgress.currentIndex < chainProgress.chain.targets.length && (
              <Text style={[styles.note, { marginTop: 8 }]}>Lock onto {chainProgress.chain.targets[chainProgress.currentIndex]?.name} to advance</Text>
            )}
          </View>
        )}

        {/* ── Meteor Shower ── */}
        {mode === "meteor" && activeShowers.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Meteor Shower Sonar</Text>
            <Text style={styles.note}>No major showers active today. Next: check December for the Geminids.</Text>
          </View>
        )}

        {/* ── Debris stats ── */}
        {mode === "debris" && (!isModeGated(mode) || isPremium) && (
          <View style={[styles.card, { borderColor: "#FF3B30" + "44" }]}>
            <Text style={styles.cardLabel}>Debris Mission</Text>
            <View style={styles.pills}>
              <InfoPill label="Catalogued" value={`${getTotalCatalogued()} / ${debrisFleet.length}`} />
              <InfoPill label="Active Lock" value={debrisFleet[0] ? `${debrisLockCounters[debrisFleet[0].object.id] ?? 0}s / 5s` : "—"} />
            </View>
            <Text style={[styles.note, { marginTop: 8 }]}>Hold 100% lock for 5 seconds to catalogue debris.</Text>
          </View>
        )}

        {/* ── Radar (modes with visual tracking) ── */}
        {mode !== "golden" && mode !== "static" && (!isModeGated(mode) || isPremium) && (
          <>
            <Animated.View style={pulseStyle}>
              <View style={[styles.badge, { borderColor: statusColor }]}>
                <Text style={[styles.badgeText, { color: statusColor }]}>{statusText}</Text>
              </View>
            </Animated.View>

            <View style={styles.radarWrap}>
              {/* subtle gold radial glow → the radar reads as a holographic projection
                  floating in space rather than a flat disc on a screen */}
              <Svg width={320} height={320} style={styles.radarGlow} pointerEvents="none">
                <Defs>
                  <RadialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor="#D9A84E" stopOpacity={0.08} />
                    <Stop offset="55%" stopColor="#D9A84E" stopOpacity={0.03} />
                    <Stop offset="100%" stopColor="#D9A84E" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={160} cy={160} r={160} fill="url(#radarGlow)" />
              </Svg>
              <SpaceRadarGrid
                blips={activeBlips}
                alignmentScore={activeScore}
                isLocked={isLocked}
                onBlipPress={mode === "fleet" ? setSelectedSatId : undefined}
                devicePitch={pointing.altitudeDegrees}
                showHorizon={true}
              />
            </View>

            <Text style={styles.tapHint}>
              {mode === "fleet" ? `Satellites · ${isFleetLive() ? "LIVE TLE" : "Simulation"} · tap a blip to identify` :
               mode === "train" ? `Starlink train · ${isTrainLive() ? "LIVE TLE" : "Simulation"} · ${getTrainNodeCount()} nodes` :
               mode === "debris" ? `Debris · ${isDebrisLive() ? "LIVE TLE" : "Simulation"} · lock 5s to catalogue` :
               mode === "reentry" ? `Decaying objects · ${isReEntryLive() ? "LIVE TIP" : "Simulation"} · amber = watch · crimson = imminent` :
               mode === "meteor" && activeShowers.length > 0 ? `${activeShowers[0].shower.name} radiant · sonar active` :
               mode === "chain" ? `Target: ${chainProgress.chain.targets[chainProgress.currentIndex]?.name ?? "chain complete"}` :
               "Tap a blip to identify"}
            </Text>

            <View style={styles.scoreRow}>
              <Text style={[styles.scoreVal, { color: statusColor }]}>{activeScore}%</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${activeScore}%` as `${number}%`, backgroundColor: statusColor }]} />
              </View>
            </View>

            {/* Active target card */}
            {activeName !== "—" && (
              <View style={[styles.card, { borderColor: activeColor + "55" }]}>
                <Text style={styles.cardLabel}>Active Target</Text>
                <View style={styles.activeHeader}>
                  <View style={[styles.dot, { backgroundColor: activeColor }]} />
                  <Text style={[styles.cardVal, { color: activeColor }]}>{activeName}</Text>
                </View>
                <View style={styles.pills}>
                  <InfoPill label="Az" value={`${activeAzimuth}°`} />
                  <InfoPill label="El" value={`${activeElevation}°`} />
                  {mode === "deep-space" && activePlanet ? <InfoPill label="Dist" value={`${activePlanet.distAU.toFixed(2)} AU`} /> : <InfoPill label="Alt" value={`${activeAltKm} km`} />}
                </View>
                {mode === "deep-space" && activePlanet && <Text style={styles.note}>{activePlanet.planet.fact}</Text>}
                {mode === "debris" && debrisFleet[0] && <Text style={[styles.note, { color: "#FF3B30" }]}>{debrisFleet[0].object.description}</Text>}
                {mode === "reentry" && reentryFleet[0] && <Text style={[styles.note, { color: reentryFleet[0].object.alertColor }]}>{reentryFleet[0].object.description}</Text>}
                {mode === "meteor" && activeShowers[0] && <Text style={styles.note}>{activeShowers[0].shower.description}</Text>}
              </View>
            )}

            {/* Fleet list */}
            {mode === "fleet" && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Fleet · {fleetState.satellites.length} Objects</Text>
                {fleetState.satellites.map(s => (
                  <TouchableOpacity key={s.satellite.id} style={styles.listRow} onPress={() => setSelectedSatId(s.satellite.id)}>
                    <View style={[styles.dot, { backgroundColor: s.satellite.radarColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{s.satellite.shortName}</Text>
                      <Text style={styles.listSub}>{s.satellite.agency.split(" /")[0]}</Text>
                    </View>
                    <Text style={[styles.listScore, { color: s.satellite.radarColor }]}>{s.alignment.alignmentScore}%</Text>
                    <Text style={styles.arrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Debris list */}
            {mode === "debris" && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Debris Objects · {debrisFleet.length} Tracked</Text>
                {debrisFleet.map(s => (
                  <View key={s.object.id} style={styles.listRow}>
                    <View style={[styles.dot, { backgroundColor: s.catalogued ? AuraLunisColors.green : "#FF3B30" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{s.object.name}</Text>
                      <Text style={styles.listSub}>{s.object.origin} · {s.object.debrisYear}</Text>
                    </View>
                    <Text style={[styles.listScore, { color: s.catalogued ? AuraLunisColors.green : "#FF3B30" }]}>{s.catalogued ? "✓" : `${s.alignment.alignmentScore}%`}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Planet list */}
            {mode === "deep-space" && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Solar System · {planetaryTargets.length} Bodies</Text>
                {planetaryTargets.map(pt => {
                  const d = planetAlignmentDiff(pointing.azimuthDegrees, pointing.altitudeDegrees, pt.azimuth, pt.altitude);
                  return (
                    <View key={pt.id} style={styles.listRow}>
                      <View style={[styles.dot, { backgroundColor: pt.planet.radarColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.listName}>{pt.planet.name}</Text>
                        <Text style={styles.listSub}>{pt.altitude > 0 ? `el ${pt.altitude.toFixed(1)}°` : "below horizon"}</Text>
                      </View>
                      <Text style={[styles.listScore, { color: pt.planet.radarColor }]}>{d.alignmentScore}%</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Cosmic Drift */}
        <TouchableOpacity style={[styles.card, { borderColor: AuraLunisColors.violet + "55" }]} onPress={() => setShowDrift(v => !v)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.cardLabel, { color: AuraLunisColors.violet }]}>✦ COSMIC DRIFT GALAXY</Text>
            <Text style={[styles.cardLabel, { color: AuraLunisColors.violet }]}>{showDrift ? "▲" : "▼"}</Text>
          </View>
          {!showDrift && <Text style={styles.listSub}>Your personal lock history — tap to expand</Text>}
        </TouchableOpacity>
        {showDrift && <CosmicDriftGalaxy refreshTrigger={driftRefresh} />}

        {/* Observer */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.cardLabel}>Observer</Text>
          <View style={styles.pills}>
            <InfoPill label="Lat" value={`${location.latitudeDegrees.toFixed(3)}°`} />
            <InfoPill label="Lon" value={`${location.longitudeDegrees.toFixed(3)}°`} />
            <InfoPill label="Device Az" value={`${Math.round(pointing.azimuthDegrees)}°`} />
            <InfoPill label="Pitch" value={`${Math.round(pointing.altitudeDegrees)}°`} />
          </View>
          {simMode && <Text style={styles.note}>Simulated observer: Demo Location</Text>}
        </View>

      </ScrollView>

      {selectedSatId && (() => {
        const sat = ATMOSPHERE_CATALOG.find(s => s.id === selectedSatId);
        const state = fleetState.satellites.find(s => s.satellite.id === selectedSatId);
        if (!sat || !state) return null;
        return <SatelliteDataCard satellite={sat} alignmentScore={state.alignment.alignmentScore} targetAzimuth={state.alignment.targetAzimuth} targetElevation={state.alignment.targetElevation} onClose={() => setSelectedSatId(null)} />;
      })()}

      {lockShareData && (
        <LockShareCard data={lockShareData} onClose={() => setLockShareData(null)} />
      )}
    </View>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AuraLunisColors.cosmicBlack },
  scroll: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  container: { alignItems: "center", paddingTop: 52, paddingHorizontal: 14, paddingBottom: 20 },
  title: { color: AuraLunisColors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 4, marginBottom: 10 },
  auraBar: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: AuraLunisColors.surface, borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 10 },
  auraDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  auraTitle: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  auraDesc: { fontSize: 10, color: AuraLunisColors.faint, marginTop: 2 },
  simBanner: { backgroundColor: AuraLunisColors.deepIndigo, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 10, borderWidth: 1, borderColor: AuraLunisColors.borderSubtle },
  simBannerText: { color: AuraLunisColors.silver, fontSize: 9, fontWeight: "700", letterSpacing: 1.5 },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12, width: "100%", justifyContent: "center" },
  modeBtn: { borderWidth: 1, borderColor: AuraLunisColors.borderSubtle, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5 },
  modeBtnText: { color: AuraLunisColors.faint, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  modeLock: { color: AuraLunisColors.gold, fontSize: 8, fontWeight: "800" },
  badge: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 3, marginBottom: 4, alignSelf: "center" },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 3 },
  tapHint: { color: AuraLunisColors.faint, fontSize: 9, marginBottom: 8 },
  scoreRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  scoreVal: { fontSize: 17, fontWeight: "900", width: 46, textAlign: "right" },
  scoreTrack: { flex: 1, height: 4, backgroundColor: AuraLunisColors.elevated, borderRadius: 2, overflow: "hidden" },
  scoreFill: { height: "100%", borderRadius: 2 },
  radarWrap: { alignItems: "center", justifyContent: "center", marginBottom: 4 },
  radarGlow: { position: "absolute" },
  card: { width: "100%", backgroundColor: "rgba(7,18,37,0.7)", borderRadius: 14, borderWidth: 1, borderColor: AuraLunisColors.borderGold, padding: 13, marginBottom: 9 },
  cardLabel: { color: AuraLunisColors.faint, fontSize: 8, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 7 },
  cardVal: { fontSize: 13, fontWeight: "800", color: AuraLunisColors.gold2, marginBottom: 7 },
  activeHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { backgroundColor: AuraLunisColors.elevated, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, flex: 1 },
  pillLabel: { color: AuraLunisColors.faint, fontSize: 8, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  pillVal: { color: AuraLunisColors.silver, fontSize: 11, fontWeight: "700", marginTop: 2 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: AuraLunisColors.borderFaint },
  listName: { color: AuraLunisColors.silver, fontSize: 12, fontWeight: "700" },
  listSub: { color: AuraLunisColors.faint, fontSize: 10, marginTop: 1 },
  listScore: { fontSize: 11, fontWeight: "700", marginRight: 3 },
  arrow: { color: AuraLunisColors.faint, fontSize: 15 },
  chainRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: AuraLunisColors.borderFaint },
  chainDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  chainName: { flex: 1, fontSize: 12, fontWeight: "700" },
  phaseBar: { width: "100%", height: 4, backgroundColor: AuraLunisColors.elevated, borderRadius: 2, overflow: "hidden" },
  phaseFill: { height: "100%", borderRadius: 2 },
  note: { color: AuraLunisColors.faint, fontSize: 10, lineHeight: 16, marginTop: 6 },
  loadingCard: { alignItems: "center", gap: 8, marginBottom: 24 },
  loadingTitle: { color: AuraLunisColors.silver, fontSize: 15, fontWeight: "700" },
  loadingDetail: { color: AuraLunisColors.faint, fontSize: 12 },
  simCard: { width: "100%", backgroundColor: "rgba(7,18,37,0.7)", borderRadius: 14, borderWidth: 1, borderColor: AuraLunisColors.borderGold, padding: 16, alignItems: "center", gap: 10 },
  simCardTitle: { color: AuraLunisColors.silver, fontSize: 13, fontWeight: "700" },
  simBtn: { backgroundColor: AuraLunisColors.deepIndigo, borderRadius: 11, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1, borderColor: AuraLunisColors.borderGold },
  simBtnText: { color: AuraLunisColors.gold2, fontSize: 12, fontWeight: "700" },
});
