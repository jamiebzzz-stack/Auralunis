import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMediumDate } from "@/utils/formatting";
import { Alert, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Sharing from "expo-sharing";

// react-native-view-shot isn't bundled in Expo Go — load it lazily (guarded require,
// same pattern as ShareCardService) so Sky Lens still renders there. When it's
// unavailable the capture button falls back to the iOS-screenshot tip.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ViewShot: { captureScreen?: (opts: any) => Promise<string> } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ViewShot = require("react-native-view-shot");
} catch {
  // unavailable (e.g. Expo Go) — capture degrades gracefully.
}
import { Body, Horizon, Observer, SearchHourAngle } from "astronomy-engine";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuraLunisColors } from "@/theme/tokens";
import { useAuraLunisVault } from "@/state/AuraLunisVaultContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { useObserverLocation } from "./ephemeris/useObserverLocation";
import { useAuraLunisSettings } from "@/state/AuraLunisSettingsContext";
import { SKY_PROFILES, getSeasonalTint, getMagnificentBoost, type SkyQuality } from "@/services/SkyQualityService";
import { computeStargazingIndex } from "@/services/StargazingIndexService";
import { fetchCurrentWeather, type WeatherSnapshot } from "@/services/WeatherService";
import { useDevicePointing } from "./ar/useDevicePointing";
// TEMPORARY dev-only probe: logs DeviceMotion attitude to confirm the Euler convention.
// It does NOT drive the camera — the live orientation path below is unchanged.
import { useDeviceMotionProbe } from "./ar/useDeviceMotionProbe";
// Live quaternion orientation + Lock Sky + drag-to-pan. This is the path that renders.
import { useSkyOrientation, DRAG_ACTIVATION_POINTS } from "./ar/useSkyOrientation";
import { cameraBasisFromQuaternion, quaternionLookingAt } from "./ar/orientationQuaternion";
import { useParallaxOffset } from "./ar/useParallaxOffset";
import { getFleet, simulateTick, syncLiveTLEData, isFleetLive } from "@/services/AtmosphereExplorerService";
import { onObjectTapped, onObjectCentered } from "@/services/HapticDiscoveryService";
import { tapLight } from "@/services/HapticService";
import { computeAzimuthElevation } from "@/utils/alignmentEngine";
import type { SkyLensSatellite } from "./layers/SatelliteLayer";
import { useSkyData } from "./hooks/useSkyProjection";
import { SkyLensCanvas } from "./SkyLensCanvas";
import { chromeAvoidRects, chromeTopInset } from "./skyLensChromeLayout";
import { SolidSkyBackgroundLayer } from "./SolidSkyBackgroundLayer";
import { NebulaImageLayer } from "./layers/NebulaImageLayer";
import { ClusterLayer } from "./layers/ClusterLayer";
import { SkyVignette } from "./SkyVignette";
import { PremiumSkyBloomLayer } from "./layers/PremiumSkyBloomLayer";
import { AstralBreathingLayer } from "./layers/AstralBreathingLayer";
import { stardustGlints } from "./layers/CosmicDustLayer";
// LuxuryStarfieldFXLayer stays retired — see the note at its old mount point below.
import { LunarGodRayLayer } from "./layers/LunarGodRayLayer";
import { OrbitalGhostTrailsLayer } from "./layers/OrbitalGhostTrailsLayer";
import { AuroraCurtainLayer } from "./layers/AuroraCurtainLayer";
import { ConstellationForgeLayer, type ForgePoint, type ForgeSegment } from "./layers/ConstellationForgeLayer";
import { SkyLensLayerBar, LAYER_BAR_HEIGHT } from "./SkyLensLayerBar";
import { SkyLensLayersSheet } from "./SkyLensLayersSheet";
import { SkyLensInfoCard } from "./SkyLensInfoCard";
import { SkyLensErrorBoundary } from "./SkyLensErrorBoundary";
import { TwinkleOverlay, type TwinkleTarget } from "./TwinkleOverlay";
import { TimeScrubBar } from "./TimeScrubBar";
import { TargetPulse } from "./TargetPulse";
import { SelectionRing } from "./SelectionRing";
import { HeroSpotlight } from "./HeroSpotlight";
import { DEFAULT_ACTIVE_LAYERS, SKY_LENS_LAYERS, type LayerDef, type LayerKey } from "./SkyLensLayerCatalog";
import { projectTarget, DEFAULT_FOV, type CameraPointing } from "./ar/SkyLensProjection";
import { skyGradient, starColor, type SelectedObject, type FocusZone } from "./SkyLensVisual";
import { getVisualGate } from "./PremiumVisualGating";

// Dev-only Sky Lens review targets. Aiming at one of these pins the clock to the planet's
// next meridian transit so it can be inspected on a physical device without waiting for it
// to rise. Purely a review convenience — it is only ever consulted behind the reviewMode
// gate (dev build + explicit env flag) and has no bearing on production behaviour.
const REVIEW_PLANET_BODY: Record<string, Body> = {
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  mars: Body.Mars,
  venus: Body.Venus
};

// A Find-Mode target handed in from Learn ("See in Sky Lens") — RA/Dec + lesson copy.
export type FocusTarget = {
  raHours: number;
  decDegrees: number;
  name: string;
  subtitle?: string;
  description?: string;
};

type Props = { onClose: () => void; focusTarget?: FocusTarget | null };

type LayoutEvent = { nativeEvent: { layout: { width: number; height: number } } };

// Screen-space bearing (0=right, 90=down, …) → an arrow glyph for the Moon finder.
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
const arrowFor = (bearingDegrees: number) => ARROWS[Math.round(bearingDegrees / 45) % 8];

// Full-screen Sky Lens: a sensor-aligned cinematic planetarium (no camera feed) with the Stars,
// Constellations, Planets, Moon, and Grid layers projected over it, a toggle
// bar, tap-to-reveal Info Card, and Night Mode. Phase-2 layers appear locked.
export function SkyLensScreen({ onClose, focusTarget }: Props) {
  const insets = useSafeAreaInsets();
  const { location, status } = useObserverLocation();
  // Zoom state lives up here so the device-pointing smoothing can ramp with it.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  // Zoom is passed straight through: a narrow field of view magnifies hand movement, so
  // useDevicePointing damps its follow factor further as zoom climbs (see
  // zoomDampingMultiplier there). This replaces a `smoothAlpha` value that was computed
  // here and passed in, but which the hook never actually read.
  const { pointing: sensorPointing, available } = useDevicePointing(120, 0, zoom);
  // Dev-only attitude probe. Logs raw alpha/beta/gamma and the derived pointing so the
  // DeviceMotion mapping can be verified on hardware. No effect on what is rendered.
  useDeviceMotionProbe(__DEV__);
  // Quaternion orientation drives the rendered camera. `sensorPointing` above is retained as
  // the legacy fallback until this passes device testing; it no longer feeds the projection.
  const skyOrientation = useSkyOrientation(true);
  // Gesture callbacks are created once; read the live handlers through a ref.
  const skyOrientationRef = useRef(skyOrientation);
  skyOrientationRef.current = skyOrientation;
  const parallax = useParallaxOffset();
  // Time Scrub: when the scrub bar is dragged, freeze the sky to the offset instant.
  const [timeOffsetMin, setTimeOffsetMin] = useState(0);
  const [scrubVisible, setScrubVisible] = useState(false);
  // The secondary overlays live in a sheet, not on the bottom bar. Nebulae is the one
  // that ships ON (it's part of the default beauty set now — max 2 curated heroes at low
  // opacity); Zodiac / Grid / Satellites / Ecliptic all still start OFF and stay off
  // until the user asks for them.
  const [layersSheet, setLayersSheet] = useState(false);

  // DEV-ONLY COLD-START ASSERTION.
  // We spent a round chasing a "cluttered default" that turned out to be four analytical
  // overlays switched on by stray taps. This logs the ACTUAL layer state at mount, so a
  // genuine cold-start anomaly (a real persistence path, say) is immediately obvious
  // instead of being inferred from screenshots. Stripped in production; no UI impact.
  const mountLogged = useRef(false);
  useEffect(() => {
    if (!__DEV__ || mountLogged.current) return;
    mountLogged.current = true;
    const analytical = SKY_LENS_LAYERS.filter((l) => !l.primary && !l.defaultOn);
    const analyticalOn = analytical.filter((l) => active.has(l.key)).map((l) => l.key);
    // eslint-disable-next-line no-console
    console.log("[SkyLens] cold-start layer state", {
      defaults: DEFAULT_ACTIVE_LAYERS,
      activeNow: [...active],
      analyticalOnCount: analyticalOn.length, // MUST be 0 on a clean launch
      analyticalOn,
      layersSheetOpen: layersSheet,           // MUST be false on a clean launch
      scrubVisible,                            // MUST be false on a clean launch
    });
    if (analyticalOn.length > 0 || layersSheet || scrubVisible) {
      // eslint-disable-next-line no-console
      console.warn(
        "[SkyLens] UNEXPECTED cold-start state — analytical overlays / sheet / time panel " +
          "should all start off. If this fires on a genuine fresh launch, there IS a " +
          "persistence path and the 'stray tap' explanation is wrong.",
        { analyticalOn, layersSheet, scrubVisible }
      );
    }
    // Mount-only snapshot by design — deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Sky brightness lives behind a top-bar button now. It used to be a permanently-mounted
  // slider bar sitting directly above the pills — 62pt of chrome, always on, and (being a
  // dark rounded bar with a slider in it) routinely mistaken for the time-travel panel.
  // It is a set-once control; it does not deserve permanent residency over the sky.
  const [brightnessVisible, setBrightnessVisible] = useState(false);
  // ── DETERMINISTIC REVIEW MODE (dev + no compass only) ─────────────────────────
  //
  // The whole review loop has been broken: a simulator has no magnetometer, so `available`
  // is false and the sky freezes at a meaningless heading. That made Orion impossible to
  // inspect anywhere except by physically hunting for it with a real phone — which is not
  // a testing process, it's a scavenger hunt.
  //
  // So when a DEV build finds no compass (i.e. a simulator), we stop pretending to point
  // and instead aim deliberately: fix the clock to a night when Orion is high, and aim the
  // camera straight at M42. The scene becomes reproducible, screenshot-able, and diffable.
  //
  // GATING: explicit opt-in only. Enable with `EXPO_PUBLIC_SKYLENS_REVIEW_MODE=1` when
  // building for a simulator (which has no magnetometer to point with). It is off unless
  // that flag is set AND this is a dev build, so it can never surprise-activate — not in a
  // release build (__DEV__ false) and not transiently on a physical dev build (the old
  // `!available` gate was briefly true at cold start before the first magnetometer sample,
  // which flashed the review scene on real devices).
  const reviewMode = __DEV__ && process.env.EXPO_PUBLIC_SKYLENS_REVIEW_MODE === "1";

  // Optional planet review target — dev + review mode ONLY. Reading the env var is gated
  // behind `reviewMode` (which is itself `__DEV__ && REVIEW_MODE === "1"`), so in a release
  // build `reviewTarget` is always "" and `reviewPlanet` is always null: the planet aid
  // cannot activate in production, and the default M42 scene and live sky are untouched.
  const reviewTarget = reviewMode ? (process.env.EXPO_PUBLIC_SKYLENS_REVIEW_TARGET ?? "").toLowerCase() : "";
  const reviewPlanet = REVIEW_PLANET_BODY[reviewTarget] ? reviewTarget : null;

  // Orion high in the south (matches scripts/orion-selftest.js exactly) — the default M42
  // review scene when no planet target is set.
  const REVIEW_TIME = useMemo(() => new Date("2026-01-15T22:00:00-08:00"), []);

  // For a planet target, pin the clock to that planet's NEXT meridian transit at the
  // current location: its highest point, so it is reliably above the horizon regardless of
  // when the review is run. The position math is astronomy-engine's own (unchanged) — this
  // only chooses a review timestamp.
  const reviewPlanetTime = useMemo(() => {
    if (!reviewPlanet) return null;
    try {
      const obs = new Observer(location.latitudeDegrees, location.longitudeDegrees, location.altitudeMeters ?? 0);
      return SearchHourAngle(REVIEW_PLANET_BODY[reviewPlanet], obs, 0, new Date()).time.date;
    } catch {
      return null;
    }
  }, [reviewPlanet, location]);

  const observerTime = useMemo(() => {
    if (reviewPlanet && reviewPlanetTime) return reviewPlanetTime;
    if (reviewMode) return REVIEW_TIME;
    return timeOffsetMin === 0 ? null : new Date(Date.now() + timeOffsetMin * 60_000);
  }, [reviewMode, reviewPlanet, reviewPlanetTime, REVIEW_TIME, timeOffsetMin]);
  const sky = useSkyData(location, undefined, observerTime);

  // Aim at the review target so it lands dead centre — a planet from sky.bodies when a
  // planet target is set, otherwise the default M42 nebula.
  const pointing = useMemo<CameraPointing>(() => {
    if (!reviewMode) return sensorPointing;
    if (reviewPlanet) {
      const b = sky.bodies.find((body) => body.id === reviewPlanet && body.aboveHorizon);
      if (b) return { azimuthDegrees: b.azimuthDegrees, altitudeDegrees: b.altitudeDegrees, rollDegrees: 0 };
      return sensorPointing;
    }
    const t = sky.nebulae.find((n) => n.id === "m42");
    if (!t) return sensorPointing;
    return { azimuthDegrees: t.azimuthDegrees, altitudeDegrees: t.altitudeDegrees, rollDegrees: 0 };
  }, [reviewMode, reviewPlanet, sensorPointing, sky.nebulae, sky.bodies]);

  // THE camera basis for this render — one immutable snapshot shared by every layer, label,
  // overlay and hit test. Review mode still aims at its target; everything else follows the
  // quaternion orientation (live, locked, dragged, or mid unlock-blend).
  const cameraBasis = useMemo(() => {
    if (!reviewMode) return skyOrientation.basis;
    return cameraBasisFromQuaternion(
      quaternionLookingAt(pointing.azimuthDegrees, pointing.altitudeDegrees, 0)
    );
  }, [reviewMode, skyOrientation.basis, pointing.azimuthDegrees, pointing.altitudeDegrees]);

  // Photo capture — captureScreen grabs the full rendered screen including SVG
  const sceneRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;
  const captureSky = useCallback(async () => {
    if (capturing) return;
    if (!ViewShot?.captureScreen) {
      // Expo Go / module unavailable — point the user at the system screenshot.
      Alert.alert(
        "Tip: Use iOS Screenshot",
        "Press Power + Volume Up for the best sky photos. Captures the whole planetarium scene perfectly."
      );
      return;
    }
    setCapturing(true);
    // Quick white shutter flash so the capture feels tactile.
    Animated.sequence([
      Animated.timing(flash, { toValue: 0.85, duration: 70, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true })
    ]).start();
    try {
      const uri = await ViewShot.captureScreen({ format: "jpg", quality: 0.85, result: "tmpfile" });
      setCapturing(false);
      if (await Sharing.isAvailableAsync()) {
        Sharing.shareAsync(uri, { mimeType: "image/jpeg" });
      }
    } catch (e) {
      setCapturing(false);
      Alert.alert(
        "Tip: Use iOS Screenshot",
        "Press Power + Volume Up for the best sky photos. Captures the whole planetarium scene perfectly."
      );
    }
  }, [capturing]);
  const { isPremium } = useEntitlement();
  // Premium visual gate — FREE sees a good sky map, PREMIUM the living universe.
  // Drives star colours, constellation nodes, planet/moon detail, MW boost, shooting
  // stars, and the cinematic/immersive/night-vision/capture modes (all below).
  const gate = useMemo(() => getVisualGate(isPremium), [isPremium]);
  const { openPaywall } = usePaywallNavigation();
  const { addItem } = useAuraLunisVault();

  const [box, setBox] = useState({ width: 360, height: 720 });
  // The default scene is FIVE layers: Stars, Constellations, Milky Way, Planets, and
  // Nebulae — the entries with defaultOn: true (Nebulae ships on as a curated 2-hero
  // accent; see the note above). The four analytical overlays (zodiac/grid/satellites/
  // ecliptic) stay off, and nothing may switch them on automatically.
  //
  // Deep Sky used to auto-enable the moment entitlement resolved to premium ("they paid
  // for it, give it to them"), which meant a premium user's first impression of Sky Lens
  // silently included Nebulae — a fifth active layer nobody asked for, and a busier
  // opening scene than the free user's. Premium value stays in HOW layers render
  // (PremiumVisualGating: spectral stars, hero moon, shooting stars); Nebulae is now an
  // opt-in tap for everyone, so the calm four-pill first impression is universal.
  const [active, setActive] = useState<Set<LayerKey>>(() => new Set(DEFAULT_ACTIVE_LAYERS));

  // Live satellite tracking for the AR "Satellites" layer — reuses the Orbital fleet
  // service (live-TLE-backed positions → absolute observer az/alt). Refreshed every
  // 1 s; the projection uses the live pointing, so satellites track smoothly between
  // updates. Only runs while the layer is on.
  const [satellites, setSatellites] = useState<SkyLensSatellite[]>([]);
  // Whether the satellites are positioned from live TLE data (vs simulation) — drives the
  // honest LIVE/Simulated badge so synthetic positions are never shown as real.
  const [satellitesLive, setSatellitesLive] = useState(false);
  const satellitesActive = active.has("satellites");
  useEffect(() => {
    if (!satellitesActive) {
      setSatellites([]);
      setSatellitesLive(false);
      return;
    }
    let alive = true;
    void syncLiveTLEData().catch(() => {});
    const tick = () => {
      simulateTick();
      if (!alive) return;
      setSatellitesLive(isFleetLive());
      setSatellites(
        getFleet().map((sat) => {
          const { azimuth, elevation } = computeAzimuthElevation(location, {
            id: sat.id,
            name: sat.name,
            latitudeDegrees: sat.latitudeDegrees,
            longitudeDegrees: sat.longitudeDegrees,
            altitudeKm: sat.altitudeKm,
          });
          return {
            id: sat.id,
            name: sat.name,
            shortName: sat.shortName,
            altitudeKm: sat.altitudeKm,
            azimuthDegrees: azimuth,
            elevationDegrees: elevation,
          };
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [satellitesActive, location]);
  // Night Vision is shared with Settings: seed from the saved flag on open, write
  // back on toggle so the two stay in sync.
  const { settings, updateSetting } = useAuraLunisSettings();
  // Night Vision is premium — free users always start in normal (day) palette even
  // if a stale saved flag says otherwise.
  const [nightMode, setNightMode] = useState(gate.nightVision && settings.nightVision);
  // Reconcile night mode once settings hydrate / entitlement resolves (the initial
  // useState can run before settings load → a saved preference would be ignored). The
  // manual toggle also writes settings.nightVision, so this stays consistent after toggles.
  useEffect(() => {
    setNightMode(gate.nightVision && settings.nightVision);
  }, [gate.nightVision, settings.nightVision]);
  // Sky Lens now uses a permanent full-screen planetarium presentation.
  // The live camera AR mode was removed so the visual experience stays cinematic.
  const planetarium = true;
  const immersive = false;
  // Cinematic "Immersive Sky" (Week 4) — the no-UI mode for screenshots & wonder. All
  // chrome and labels vanish; only the sky remains, darkened to ~85%. Enter via a
  // triple-tap or a long-press on the mode button; a single tap anywhere restores the UI.
  const [cinematic, setCinematic] = useState(false);
  // Sky brightness — an Animated.Value so dragging the slider animates ONLY the native
  // scrim opacity (no React re-render of the whole scene per frame). Range 0 → 0.7.
  // Starts at a slight tint (thumb mid). Dragging toward ☾ Dark raises it, ☀ Clear → 0.
  const scrimOpacity = useRef(new Animated.Value(0.35)).current;
  // Remembers the thumb position so it doesn't snap back to center when the slider
  // re-mounts (it's hidden while an info card is open).
  const sliderValueRef = useRef(0.5);
  const cinematicHint = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!cinematic) return;
    cinematicHint.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(cinematicHint, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(cinematicHint, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [cinematic, cinematicHint]);
  const [selected, setSelected] = useState<SelectedObject | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());

  // Pinch-to-zoom: zoom magnifies the sky by narrowing the field of view (and
  // nudges the camera's optical zoom to match). 1× = full 60°×45° FOV.
  const zoomStart = useRef(1);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        // Don't swallow single touches — let react-native-svg onPress (object hit-targets) fire.
        .cancelsTouchesInView(false)
        .onStart(() => {
          zoomStart.current = zoomRef.current;
        })
        .onUpdate((e) => setZoom(Math.max(1, Math.min(12, zoomStart.current * e.scale)))),
    []
  );
  // Cinematic Immersive Sky is premium. Free users who try to enter it get the
  // paywall instead — the locked mode IS the pitch.
  const enterCinematic = useCallback(() => {
    if (!gate.cinematicMode) { openPaywall(); return; }
    setCinematic(true);
  }, [gate.cinematicMode, openPaywall]);
  // Triple-tap anywhere enters cinematic Immersive Sky. Runs alongside pinch so zoom
  // still works; single taps fall through to the object hit-targets as before.
  const cinematicTap = useMemo(
    () => Gesture.Tap().numberOfTaps(3).runOnJS(true).cancelsTouchesInView(false).onEnd(() => enterCinematic()),
    [enterCinematic]
  );
  // sceneGesture is composed AFTER `fov` is declared (objectTap hit-tests with it).
  const fov = useMemo(
    () => ({
      horizontalDegrees: DEFAULT_FOV.horizontalDegrees / zoom,
      verticalDegrees: DEFAULT_FOV.verticalDegrees / zoom
    }),
    [zoom]
  );

  // Tap-to-select. SVG onPress does NOT fire inside an RNGH GestureDetector on iOS, so we
  // hit-test the tap point against projected object positions ourselves and open the info
  // card for the nearest hit. Uses the SAME projectTarget the canvas renders with, so the
  // screen positions line up exactly. (Declared here so it can read `fov`.)
  // Refs mirror the live values so the gesture reads the LATEST sky/pointing/fov/box at
  // tap time WITHOUT being rebuilt every motion frame (which churned RNGH wiring and could
  // drop a tap if a re-composition landed mid-touch).
  const skyRef = useRef(sky); skyRef.current = sky;
  const pointingRef = useRef(pointing); pointingRef.current = pointing;
  const fovRef = useRef(fov); fovRef.current = fov;
  const boxRef = useRef(box); boxRef.current = box;
  const objectTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDuration(300)
        .onEnd((e) => {
          const sky = skyRef.current;
          const pointing = pointingRef.current;
          const fov = fovRef.current;
          const box = boxRef.current;
          const PLANET_DESCRIPTIONS: Record<string, string> = {
            mercury: "The smallest planet, closest to the Sun.",
            venus: "The brightest planet, often called the evening or morning star.",
            mars: "The red planet, named for the god of war.",
            jupiter: "The largest planet in our solar system.",
            saturn: "The ringed giant, a jewel of the night sky.",
            moon: "Earth's only natural satellite, ruler of the tides."
          };
          const PLANET_HIT = 80; // planets are the main targets — generous finger radius
          const STAR_HIT = 50;
          let closest: { dist: number; obj: SelectedObject } | null = null;

          // Planets + Moon first (bigger, brighter targets). Check ALL above-horizon
          // bodies except the Sun — never miss one that's actually up.
          for (const body of sky.bodies) {
            if (!body.aboveHorizon || body.id === "sun") continue;
            const p = projectTarget(pointing, body.azimuthDegrees, body.altitudeDegrees, fov, box);
            if (!p.onScreen) continue;
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < PLANET_HIT && (!closest || dist < closest.dist)) {
              closest = {
                dist,
                obj: {
                  kind: body.id === "moon" ? "moon" : "planet",
                  id: body.id,
                  name: body.name,
                  subtitle: body.id === "moon" ? "Earth's Moon" : "Planet",
                  description: PLANET_DESCRIPTIONS[body.id],
                  facts: [
                    ...(body.magnitude !== undefined ? [{ label: "Magnitude", value: body.magnitude.toFixed(1) }] : []),
                    { label: "Altitude", value: `${Math.round(body.altitudeDegrees)}°` },
                    { label: "Azimuth", value: `${Math.round(body.azimuthDegrees)}°` }
                  ]
                }
              };
            }
          }

          // If we already landed squarely on a planet, skip the star scan entirely.
          const planetLocked = closest !== null && closest.dist < 40;
          // Then the ~20–30 brightest stars only (mag < 2) — scanning every star is slow.
          if (!planetLocked) for (const star of sky.stars) {
            if (!star.aboveHorizon || star.magnitude >= 2.0) continue;
            const p = projectTarget(pointing, star.azimuthDegrees, star.altitudeDegrees, fov, box);
            if (!p.onScreen) continue;
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < STAR_HIT && (!closest || dist < closest.dist)) {
              closest = {
                dist,
                obj: {
                  kind: "star",
                  id: star.id,
                  name: star.name || star.id,
                  subtitle: `Magnitude ${star.magnitude.toFixed(1)}`,
                  facts: [
                    { label: "Magnitude", value: star.magnitude.toFixed(1) },
                    { label: "Altitude", value: `${Math.round(star.altitudeDegrees)}°` },
                    { label: "Azimuth", value: `${Math.round(star.azimuthDegrees)}°` }
                  ]
                }
              };
            }
          }

          if (closest) {
            setSelected(closest.obj);
          }
        }),
    [] // stable — reads live values through refs (see above)
  );
  // Drag-to-pan, active ONLY while the sky is locked. The activation distance keeps a tap a
  // tap: below DRAG_ACTIVATION_POINTS of movement nothing pans and object selection wins.
  const dragLast = useRef({ x: 0, y: 0 });
  const skyDrag = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .cancelsTouchesInView(false)
        .minDistance(DRAG_ACTIVATION_POINTS)
        .onStart((e) => {
          dragLast.current = { x: e.translationX, y: e.translationY };
        })
        .onUpdate((e) => {
          const dx = e.translationX - dragLast.current.x;
          const dy = e.translationY - dragLast.current.y;
          dragLast.current = { x: e.translationX, y: e.translationY };
          skyOrientationRef.current.applyDrag(dx, dy);
        }),
    []
  );
  const sceneGesture = useMemo(
    () => Gesture.Simultaneous(pinch, skyDrag, cinematicTap, objectTap),
    [pinch, skyDrag, cinematicTap, objectTap]
  );
  // Milky Way brightens as the camera fades out: faint over a live feed, bold over
  // black. AR (1.4) → Immersive (1.9) → Planetarium (2.4).
  // ── Sky Quality (Bortle) + live conditions drive the entire visual ─────────
  // Lightweight weather snapshot (cloud cover) feeds the magnificent-night boost.
  const [weather, setWeather] = useState<WeatherSnapshot>({
    cloudPercent: 30, humidity: 50, tempCelsius: 20, description: "loading…", source: "unavailable",
  });
  useEffect(() => {
    fetchCurrentWeather(location).then(setWeather).catch(() => {});
  }, [location]);
  // 1. BORTLE PRESET — the profile for the user's Sky Quality setting. Drives MW
  // opacity (below), nebula opacity, and dome-star count (both in SkyLensCanvas).
  // Bortle presets are premium — free users are locked to the "dark" default, so
  // their Sky Quality setting doesn't transform the Sky Lens visual.
  const skyProfile = gate.skyQualityPresets
    ? (SKY_PROFILES[settings.skyQuality as SkyQuality] ?? SKY_PROFILES.dark)
    : SKY_PROFILES.dark;
  // 3. MAGNIFICENT NIGHT — a great Stargazing Index (>85) blazes the MW + nebulae
  // 15-30% brighter. Cloud cover from the weather snapshot; seeing/transparency
  // estimated from it (same model as Home's Stargazing Index).
  const stargazingScore = useMemo(() => {
    const moonAlt = sky.bodies.find((b) => b.id === "moon")?.altitudeDegrees ?? -90;
    const cloud = weather.cloudPercent;
    const seeingArcsec = cloud > 80 ? 4.5 : cloud > 50 ? 3.2 : cloud > 20 ? 2.2 : 1.5;
    const transparencyMag = Math.max(3, 6.6 - cloud / 28);
    return computeStargazingIndex(cloud, sky.moonIlluminationPercent, moonAlt, seeingArcsec, transparencyMag).score;
  }, [sky, weather]);
  const magnificentBoost = getMagnificentBoost(stargazingScore);
  // Milky Way brightens as the camera fades out (AR 1.4 → Immersive 1.9 →
  // Planetarium 2.4), then scales by Bortle MW opacity × magnificent-night boost.
  // Free tier multiplies the whole thing by 0.4 → a faint smooth band; premium 1.0×.
  const milkyWayBoost = (planetarium ? 2.4 : cinematic ? 2.1 : immersive ? 1.9 : 1.4) * skyProfile.milkyWayOpacity * magnificentBoost * gate.milkyWayBoostMultiplier;
  // Nebula glow visibility: Bortle nebula opacity × magnificent-night boost (clamped).
  const nebulaOpacity = Math.min(1, skyProfile.nebulaOpacity * magnificentBoost);
  // 2. SEASONAL COLOR — a barely-perceptible warm (summer / MW season) or cool
  // (winter / Orion season) grade, by month + hemisphere.
  const seasonalTint = useMemo(
    () => getSeasonalTint((observerTime ?? new Date()).getMonth(), location?.latitudeDegrees ?? 0),
    [observerTime, location?.latitudeDegrees]
  );
  const onLayout = useCallback((e: LayoutEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ width, height });
  }, []);

  const toggleLayer = useCallback((key: LayerKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // THE CONVERSION MOMENT (Paywall Strategy): when a free user taps premium content we
  // never show a bare lock — we let them EXPERIENCE the value first. Temp-enable the
  // layer for 2s (full glory), then gently fade the scene and surface "✦ Unlock the
  // living universe". Tapping the prompt opens the paywall; it auto-dismisses if ignored.
  const [preview, setPreview] = useState<{ key: LayerKey; label: string; phase: "show" | "prompt" } | null>(null);
  const previewFade = useRef(new Animated.Value(0)).current;
  const previewTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const endPreview = useCallback(() => {
    previewTimers.current.forEach(clearTimeout);
    previewTimers.current = [];
    previewFade.setValue(0);
    setPreview(null);
  }, [previewFade]);
  const startPreview = useCallback(
    (def: LayerDef) => {
      previewTimers.current.forEach(clearTimeout);
      previewTimers.current = [];
      previewFade.setValue(0);
      setPreview({ key: def.key, label: def.label, phase: "show" });
      // After 2s of full beauty, fade to the unlock prompt.
      previewTimers.current.push(
        setTimeout(() => {
          setPreview((p) => (p ? { ...p, phase: "prompt" } : null));
          Animated.timing(previewFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        }, 2000)
      );
      // Auto-dismiss if the user never taps the prompt.
      previewTimers.current.push(setTimeout(() => setPreview(null), 9000));
    },
    [previewFade]
  );
  useEffect(() => () => { previewTimers.current.forEach(clearTimeout); }, []);

  const onLockedPress = useCallback(
    (def: LayerDef) => {
      // Every shipped layer is `available`; a locked tap is a free user touching a premium
      // layer → preview its beauty, then prompt the paywall (no "coming soon" placeholders).
      if (!isPremium && def.available) startPreview(def);
    },
    [isPremium, startPreview]
  );

  // Layers actually rendered = the user's set, plus any premium layer being previewed.
  const activeWithPreview = useMemo(
    () => (preview ? new Set(active).add(preview.key) : active),
    [active, preview]
  );

  const onSave = useCallback(
    (object: SelectedObject) => {
      // Saving to the (premium) Vault requires entitlement — free users get the paywall.
      if (!isPremium) { openPaywall(); return; }
      addItem({
        type: "archive",
        title: object.name,
        detail: object.description ?? object.facts.map((f) => `${f.label}: ${f.value}`).join(" · ")
      });
      setSavedIds((prev) => new Set(prev).add(object.id));
    },
    [addItem, isPremium, openPaywall]
  );

  const hud = useMemo(
    () =>
      available
        ? `Heading ${Math.round(pointing.azimuthDegrees)}°  ·  Alt ${Math.round(pointing.altitudeDegrees)}°`
        : "Calibrating compass…",
    [available, pointing.azimuthDegrees, pointing.altitudeDegrees]
  );

  // Moon finder: tells you where the Moon is (or that it's below the horizon) so
  // it's never a mystery why you can't see it.
  const moonFinder = useMemo(() => {
    const moon = sky.bodies.find((b) => b.id === "moon");
    if (!moon) return null;
    // Below the horizon → say nothing. A permanent "the Moon is below the horizon" banner
    // is a nag, not guidance: there is no action the user can take.
    if (!moon.aboveHorizon) return null;
    const p = projectTarget(pointing, moon.azimuthDegrees, moon.altitudeDegrees, fov, box);
    if (p.onScreen) return null; // it's in view — no need to point you to it
    return p.behind ? "☾  Turn around for the Moon ↻" : `☾  Pan ${arrowFor(p.bearingDegrees)} to the Moon`;
  }, [sky.bodies, pointing, box, fov]);

  // ── Find Mode: guide the user to a target handed in from a Learn lesson ──────
  const targetHoriz = useMemo(() => {
    if (!focusTarget) return null;
    const obs = new Observer(location.latitudeDegrees, location.longitudeDegrees, location.altitudeMeters ?? 0);
    const h = Horizon(sky.when, obs, focusTarget.raHours, focusTarget.decDegrees, "normal");
    return { az: h.azimuth, alt: h.altitude, above: h.altitude > 0 };
  }, [focusTarget, location, sky.when]);

  const targetProj = useMemo(() => {
    if (!targetHoriz || !targetHoriz.above) return null;
    return projectTarget(pointing, targetHoriz.az, targetHoriz.alt, fov, box);
  }, [targetHoriz, pointing, fov, box]);

  const targetFinder = useMemo(() => {
    if (!focusTarget || !targetHoriz) return null;
    if (!targetHoriz.above) return `✦  ${focusTarget.name} is below the horizon right now`;
    if (!targetProj || targetProj.onScreen) return null;
    return targetProj.behind
      ? `✦  Turn around for ${focusTarget.name} ↻`
      : `✦  Pan ${arrowFor(targetProj.bearingDegrees)} to ${focusTarget.name}`;
  }, [focusTarget, targetHoriz, targetProj]);

  // On arrival (target first comes on screen), slide up the lesson info card once.
  const arrivedRef = useRef(false);
  useEffect(() => {
    arrivedRef.current = false;
  }, [focusTarget]);
  useEffect(() => {
    if (focusTarget && targetHoriz?.above && targetProj?.onScreen && !arrivedRef.current) {
      arrivedRef.current = true;
      setSelected({
        kind: "constellation",
        id: `focus-${focusTarget.name}`,
        name: focusTarget.name,
        subtitle: focusTarget.subtitle,
        facts: [
          { label: "Azimuth", value: `${Math.round(targetHoriz.az)}°` },
          { label: "Altitude", value: `${Math.round(targetHoriz.alt)}°` },
        ],
        description: focusTarget.description,
      });
    }
  }, [focusTarget, targetHoriz, targetProj]);

  // Dynamic sky gradient by the Sun's altitude (drives Planetarium Mode's backdrop).
  const sunAltitude = sky.bodies.find((b) => b.id === "sun")?.altitudeDegrees ?? -90;
  const skyColors = skyGradient(sunAltitude);

  // The 20 brightest on-screen stars projected for the twinkle overlay (View-based,
  // crash-safe). Sorted by magnitude so it's genuinely the brightest, not the first
  // 20 found in catalog order.
  const twinkleStars = useMemo<TwinkleTarget[]>(() => {
    const out: TwinkleTarget[] = [];
    for (const s of sky.stars) {
      if (!s.aboveHorizon || s.magnitude > 3.0) continue;
      const p = projectTarget(pointing, s.azimuthDegrees, s.altitudeDegrees, fov, box);
      if (!p.onScreen) continue;
      out.push({
        id: s.id,
        x: p.x,
        y: p.y,
        size: Math.max(2.5, 6 - s.magnitude),
        color: starColor(s.id, s.magnitude),
        offset: (s.id.charCodeAt(0) % 10) / 10,
        magnitude: s.magnitude
      });
    }
    const brightest = out.sort((a, b) => a.magnitude - b.magnitude).slice(0, 10);
    if (nightMode) return brightest;
    // The stardust's SHIMMER rides this same overlay. TwinkleOverlay is the only
    // crash-safe animator in the stack (View opacity on one shared clock), and it was
    // driving just 10 dots — adding ~14 sky-locked dust glints costs one clock, no new
    // animation system, and keeps the sparkle in lockstep with the star twinkle.
    // The glints sit on the real galactic plane, exactly like CosmicDustLayer's motes.
    const project = (az: number, alt: number) => projectTarget(pointing, az, alt, fov, box);
    // `false` mirrors SkyLensCanvas's horizonCorrect: the sky below the horizon stays
    // unpainted. This MUST match the flag the canvas hands CosmicDustLayer, or the
    // glints would shimmer below the horizon in places the dust itself isn't drawn.
    return [...brightest, ...stardustGlints(sky.milkyWay, project, box, false)];
  }, [sky.stars, sky.milkyWay, pointing, fov, box, nightMode]);

  const accent = nightMode ? "#C24A4A" : AuraLunisColors.gold;

  // ── THE DOCK ────────────────────────────────────────────────────────────────────
  // One number, derived from what is actually mounted. Everything that must sit clear of
  // the bottom chrome — the Moon prompt, the shutter, and the LABEL EXCLUSION ZONE — is
  // computed from this, so nothing can drift out of sync with a magic constant again.
  // (The old code hard-coded `bottom: insets.bottom + 168/175` for the shutter and the
  // Moon prompt, numbers that assumed a layout which no longer exists.)
  const BRIGHTNESS_H = 62; // slider bar (8+36+8) + its 10pt margin — exact
  // The time panel was TRIMMED ~23% (TimeScrubBar) and this figure corrected: it was 70,
  // but the panel really measured ~89pt, so the exclusion zone ran 19pt short and labels
  // could slide under it. Now ~61pt of panel + 10pt margin = 71.
  const SCRUB_H = 71;
  const dockHeight =
    LAYER_BAR_HEIGHT +
    6 +
    (brightnessVisible && !selected ? BRIGHTNESS_H : 0) +
    (scrubVisible && !selected ? SCRUB_H : 0);
  // Top edge of the bottom chrome, in screen px — the exclusion line for labels/artwork.
  const dockTop = box.height - dockHeight - insets.bottom - 12;
  // Where floating controls perch: just above the dock, never on top of it.
  const floatAbove = insets.bottom + dockHeight + 16;

  // LABEL AVOIDANCE FOR UI CHROME. The top HUD and bottom dock are already excluded by the
  // placer's top/bottom safe bands (topInset / bottomInset). These are the floating controls
  // those bands don't cover — the shutter, the guidance banner, the zoom chip — reserved so
  // no celestial label renders under or behind them. Visibility mirrors the render
  // conditions below exactly, so hidden chrome never suppresses a label. Geometry comes from
  // skyLensChromeLayout (shared source of truth), not per-call magic numbers.
  const labelTopInset = chromeTopInset(insets);
  const chromeRects = chromeAvoidRects({
    box,
    insets,
    dockHeight,
    visible: {
      shutter: !cinematic && !selected && gate.photoCapture,
      finder: !cinematic && !selected && (!!targetFinder || (!scrubVisible && !!moonFinder)),
      zoomChip: !cinematic && zoom > 1.05
    }
  });

  // Hero Object Spotlight: reverse-map the selected object's id to its LIVE az/alt
  // (one place, no per-layer wiring), then project it so the spotlight dims the
  // field around whatever you've focused and tracks it as you pan.
  const focusAzAlt = useMemo(() => {
    if (!selected) return null;
    const { kind, id } = selected;
    if (kind === "moon" || kind === "planet") {
      const b = sky.bodies.find((x) => x.id === id);
      return b && b.aboveHorizon ? { az: b.azimuthDegrees, alt: b.altitudeDegrees } : null;
    }
    if (kind === "star") {
      const s = sky.stars.find((x) => x.id === id) ?? sky.domeStars.find((x) => x.id === id);
      return s && s.aboveHorizon ? { az: s.azimuthDegrees, alt: s.altitudeDegrees } : null;
    }
    if (kind === "constellation") {
      const c = sky.constellations.find((x) => x.id === id);
      return c ? { az: c.centroid.azimuthDegrees, alt: c.centroid.altitudeDegrees } : null;
    }
    if (kind === "nebula") {
      const n = sky.nebulae.find((x) => x.id === id);
      return n && n.aboveHorizon ? { az: n.azimuthDegrees, alt: n.altitudeDegrees } : null;
    }
    if (kind === "zodiac") {
      const z = sky.zodiac.signs.find((s) => `zodiac-${s.id}` === id);
      return z && z.center.aboveHorizon ? { az: z.center.azimuthDegrees, alt: z.center.altitudeDegrees } : null;
    }
    return null;
  }, [selected, sky]);

  const focusProj = useMemo(() => {
    if (!focusAzAlt) return null;
    const p = projectTarget(pointing, focusAzAlt.az, focusAzAlt.alt, fov, box);
    return p.behind ? null : p;
  }, [focusAzAlt, pointing, fov, box]);

  // Focus zone handed to the canvas layers: the selected object's on-screen point +
  // a boost radius. Layers swell/brighten nebulae and stars that fall inside it, so
  // the spotlighted region literally intensifies (not just dims around it).
  const focusZone = useMemo<FocusZone>(() => {
    if (!focusProj || !focusProj.onScreen) return null;
    // 0.34 → 0.22: a tighter selection spotlight, so the focused star sits in a crisp
    // ring rather than a large colored bubble. Showcase (auto-Orion) is a separate zone.
    return { x: focusProj.x, y: focusProj.y, r: Math.min(box.width, box.height) * 0.22 };
  }, [focusProj, box]);

  // Permanent HERO REGIONS — focal zones where everything reinforces, so the sky isn't
  // uniformly bright. When a hero's anchor is in view, the whole region lights up (no
  // tap): layers boost nebula intensity (~3×), local star density, and showcase-star
  // glow inside the zone. Sagittarius is THE showpiece (largest zone) — Lagoon + Trifid
  // + Swan + Eagle + the galactic core all overlap → "Whoa." Then Orion (winter), then
  // Carina (southern). First anchor that's on-screen wins; Sagittarius is checked first.
  const HERO_REGIONS: ReadonlyArray<{ id: string; r: number }> = [
    { id: "m8", r: 0.66 },     // Sagittarius core — showpiece, widest zone
    { id: "m42", r: 0.55 },    // Orion
    { id: "ngc3372", r: 0.5 }, // Carina
  ];
  const showcaseZone = useMemo<FocusZone>(() => {
    for (const hero of HERO_REGIONS) {
      const n = sky.nebulae.find((x) => x.id === hero.id);
      if (!n || !n.aboveHorizon) continue;
      const sp = projectTarget(pointing, n.azimuthDegrees, n.altitudeDegrees, fov, box);
      if (sp.behind || !sp.onScreen) continue;
      return { x: sp.x, y: sp.y, r: Math.min(box.width, box.height) * hero.r };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky.nebulae, pointing, fov, box]);

  // Below-horizon bleed guard: the screen-fixed decorative overlays (FX layers,
  // atmosphere glow, meteors) aren't sky-projected, so they'd render over the real
  // floor in camera mode. Fade them out as the camera tilts below the horizon —
  // 1 at alt ≥ 0°, linearly to 0 by −18°. Planetarium (virtual dome) keeps full.
  const horizonFade = planetarium ? 1 : Math.max(0, Math.min(1, (pointing.altitudeDegrees + 18) / 18));

  // Moon screen position for the Lunar God Ray layer.
  const moonProj = useMemo(() => {
    const m = sky.bodies.find((b) => b.id === "moon");
    if (!m || !m.aboveHorizon) return null;
    const mp = projectTarget(pointing, m.azimuthDegrees, m.altitudeDegrees, fov, box);
    return mp.behind ? null : mp;
  }, [sky.bodies, pointing, fov, box]);

  // Constellation Forge: when a constellation is identified (selected), snapshot its
  // projected segments/points and play the gold ink-draw for ~1.8s.
  const [forge, setForge] = useState<{ active: boolean; points: ForgePoint[]; segments: ForgeSegment[] }>(
    { active: false, points: [], segments: [] }
  );
  const forgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (selected?.kind !== "constellation") return;
    const c = sky.constellations.find((x) => x.id === selected.id);
    if (!c) return;
    const proj = c.points.map((pt) => projectTarget(pointing, pt.azimuthDegrees, pt.altitudeDegrees, fov, box));
    const points: ForgePoint[] = proj.filter((q) => !q.behind).map((q) => ({ x: q.x, y: q.y }));
    const segments: ForgeSegment[] = c.lines
      .filter(([i, j]) => proj[i] && proj[j] && !proj[i].behind && !proj[j].behind)
      .map(([i, j]) => ({ from: { x: proj[i].x, y: proj[i].y }, to: { x: proj[j].x, y: proj[j].y } }));
    setForge({ active: true, points, segments });
    if (forgeTimer.current) clearTimeout(forgeTimer.current);
    forgeTimer.current = setTimeout(() => setForge((f) => ({ ...f, active: false })), 1900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.kind]);
  useEffect(() => () => { if (forgeTimer.current) clearTimeout(forgeTimer.current); }, []);

  // Apple-delight haptics (HapticDiscoveryService): a soft pulse when you tap an object,
  // and a whisper the first time a hero object drifts into the centre of the view.
  // Premium only — free users feel nothing (gate.hapticDiscovery).
  useEffect(() => {
    if (gate.hapticDiscovery && selected?.id) onObjectTapped(selected.id);
  }, [selected?.id, gate.hapticDiscovery]);
  const heroCenteredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!gate.hapticDiscovery) return;
    const cx = box.width / 2, cy = box.height / 2;
    const rad = Math.min(box.width, box.height) * 0.22; // ≈ the centre 30° of the view
    const now = new Set<string>();
    const check = (id: string, az: number, alt: number) => {
      const p = projectTarget(pointing, az, alt, fov, box);
      if (p.behind || !p.onScreen) return;
      if (Math.hypot(p.x - cx, p.y - cy) <= rad) {
        now.add(id);
        if (!heroCenteredRef.current.has(id)) onObjectCentered(id); // service dedupes + cools down
      }
    };
    for (const b of sky.bodies) if (b.aboveHorizon && b.id !== "sun") check(b.id, b.azimuthDegrees, b.altitudeDegrees);
    for (const s of sky.stars) if (s.aboveHorizon && s.magnitude < 1.3) check(s.id, s.azimuthDegrees, s.altitudeDegrees);
    heroCenteredRef.current = now;
  }, [pointing, sky.bodies, sky.stars, fov, box, gate.hapticDiscovery]);

  return (
    <View style={styles.root} onLayout={onLayout}>
      <GestureDetector gesture={sceneGesture}>
        <View ref={sceneRef} collapsable={false} style={StyleSheet.absoluteFill}>
          {/* Permanent cinematic planetarium background — no live camera feed. */}

          {/* Cosmic dark overlay */}
          <View
            style={[StyleSheet.absoluteFillObject, {
              backgroundColor: planetarium
                ? "rgba(3,8,22,0.95)"
                : cinematic
                ? "rgba(3,8,22,0.85)"
                : immersive
                ? "rgba(3,8,22,0.75)"
                : "rgba(3,8,22,0.45)",
            }]}
            pointerEvents="none"
          />
          {/* Sky-darkness scrim — sits between the camera and the star canvas; the
              brightness slider drives its opacity (0 → 0.6) to darken the whole sky. */}
          <Animated.View
            style={[StyleSheet.absoluteFillObject, { backgroundColor: "#030816", opacity: scrimOpacity }]}
            pointerEvents="none"
          />
          {planetarium && !nightMode && (
            <LinearGradient
              colors={skyColors}
              locations={[0, 0.42, 0.72, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { opacity: horizonFade }]}
              pointerEvents="none"
            />
          )}
          {/* Atmospheric depth over the planetarium background: transparent at the top,
              deepening to ground-glow at the bottom for a sense of depth. */}
          {!nightMode && !planetarium && (
            <LinearGradient
              colors={["rgba(8,16,42,0)", "rgba(9,18,47,0.1)", "rgba(10,20,50,0.3)", "rgba(10,21,53,0.55)"] as const}
              locations={[0, 0.42, 0.74, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          )}
          {nightMode && <View style={styles.nightFilter} pointerEvents="none" />}

          <SolidSkyBackgroundLayer
            visible={planetarium && !nightMode && active.has("milkyway")}
          />

          {/* THE nebula renderer. `fullSphere={false}` — normal viewing is horizon-correct,
              so nothing below the horizon is ever painted, matching every other layer.
              (It used to receive `planetarium` here, which is permanently true, meaning
              below-horizon nebulae would have been drawn into the visible sky.) */}
          <NebulaImageLayer
            nebulae={sky.nebulae}
            pointing={pointing}
            basis={cameraBasis}
            fov={fov}
            box={box}
            visible={!nightMode && active.has("deepsky")}
            fullSphere={false}
            uiBottom={box.height - dockTop}
            onSelect={setSelected}
          />

          {/* Star clusters, rendered as STARS — a swarm of individual suns, not a cloud.
              Disjoint from NebulaImageLayer's object set (clusters vs emission heroes),
              so no object is ever drawn by two renderers. Galaxies stay unrendered. */}
          <ClusterLayer
            nebulae={sky.nebulae}
            pointing={pointing}
            basis={cameraBasis}
            fov={fov}
            box={box}
            visible={!nightMode && active.has("deepsky")}
            fullSphere={false}
            uiBottom={box.height - dockTop}
            onSelect={setSelected}
          />

          {/* Ambient atmosphere: breathing sky bloom, above the background and below the
              star canvas + labels/cards. Crash-safe (Animated.View + useAnimatedStyle).
              COORDINATED WITH THE STARDUST: both of these are flat full-screen gradients
              — they add glow, but they also VEIL, and it's contrast that lets stardust
              and nebulae read. Now that CosmicDustLayer carries the atmosphere with
              sky-locked texture (and its old dark #0A0806 wash is gone), these two step
              back ~18% so the dust and the nebulae are what you actually see. Total
              ambient light is roughly conserved; it's just better distributed. */}
          <PremiumSkyBloomLayer
            width={box.width}
            height={box.height}
            nightVision={nightMode}
            moonVisible={sky.bodies.find((b) => b.id === "moon")?.aboveHorizon ?? false}
            milkyWayVisible={active.has("milkyway")}
            intensity={(planetarium ? 0.74 : 0.45) * horizonFade}
          />
          {/* AstralBreathingLayer — a barely-perceptible 22s breathing swell so the sky
              feels alive, not static. Crash-safe (single Animated.View + useAnimatedStyle
              over a static Svg). Faded out below the horizon with the other screen-fixed
              FX. This is the layer that makes the whole sky "breathe"; the per-mote
              sparkle is TwinkleOverlay's job. Two scales of motion, one calm result. */}
          <AstralBreathingLayer
            width={box.width}
            height={box.height}
            nightVision={nightMode}
            intensity={(planetarium ? 0.44 : 0.32) * horizonFade}
          />
          {/* LuxuryStarfieldFXLayer stays RETIRED — and is no longer even imported.
              It rendered 90 screen-fixed particles on its own shimmer clock, plus two
              hardcoded "diffraction spike" stars pinned at (0.18, 0.24) and (0.82, 0.42)
              — fake objects glued to the screen that slid over the real sky as you
              panned. CosmicDustLayer now does this properly: sky-locked, galactic-plane
              weighted, static SVG, with its shimmer riding TwinkleOverlay's existing
              clock. Nothing here to re-enable. */}
          {moonProj && (
            <LunarGodRayLayer
              width={box.width}
              height={box.height}
              moonX={moonProj.x}
              moonY={moonProj.y}
              moonRadius={22}
              visible={moonProj.onScreen}
              nightVision={nightMode}
              intensity={(planetarium ? 0.9 : 0.5) * horizonFade}
            />
          )}
          <OrbitalGhostTrailsLayer
            width={box.width}
            height={box.height}
            trails={[]}
            nightVision={nightMode}
            intensity={(planetarium ? 0.9 : 0.6) * horizonFade}
          />

          {/* Aurora curtains — soft atmospheric light BEHIND the sky objects (this
              sits above the background FX, below the star canvas + labels/cards, and
              is pointerEvents="none"). v1 shows it only in Planetarium ("fantasy /
              preview") mode; realistic camera mode stays off until an enable toggle /
              live AuroraForecastService gate is wired. */}
          {/* Aurora curtains disabled — they created visible vertical bands
              over the new cinematic full-background sky. */}
          <AuroraCurtainLayer
            width={box.width}
            height={box.height}
            visible={false}
            intensity={0}
            variant="cosmic"
            nightVision={nightMode}
          />

          <SkyLensErrorBoundary>
            <SkyLensCanvas
              box={box}
              pointing={pointing}
              basis={cameraBasis}
              sky={sky}
              fov={fov}
              activeLayers={activeWithPreview}
              nightMode={nightMode}
              milkyWayBoost={milkyWayBoost}
              gate={gate}
              domeStarMultiplier={skyProfile.domeStarMultiplier}
              nebulaOpacity={nebulaOpacity}
              extinction={!nightMode}
              isPremium={isPremium}
              focus={focusZone}
              showcase={showcaseZone}
              parallax={parallax}
              satellites={satellites}
              cinematic={cinematic}
              fullSphere={planetarium}
              bottomInset={box.height - dockTop}
              topInset={labelTopInset}
              reservedRects={chromeRects}
              onSelect={setSelected}
            />
          </SkyLensErrorBoundary>
          {/* 2. SEASONAL COLOR — a whisper of warm (summer / MW season) or cool
              (winter / Orion season) grade over the sky. pointerEvents none so it
              never blocks taps; opacity ≤8% so it's felt, not seen. */}
          {seasonalTint.warm > 0 && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(217,168,78,${seasonalTint.warm})` }]} />
          )}
          {seasonalTint.cool > 0 && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(100,140,220,${seasonalTint.cool})` }]} />
          )}
          {/* Crash-safe twinkle: View-opacity animation over the bright stars */}
          <TwinkleOverlay targets={twinkleStars} nightMode={nightMode} />
          {/* Shooting stars now live in ShootingStarLayer (inside SkyLensCanvas):
              moving head + trailing tail, 8-12 min schedule, its own haptic pulse.
              The old View-based MeteorOverlay was retired to avoid two meteor
              systems firing on different clocks + double haptics. */}
          {/* Find-Mode arrival pulse on the lesson target */}
          {targetProj?.onScreen && <TargetPulse x={targetProj.x} y={targetProj.y} />}
          {/* Hero Object Spotlight — dims the field around the selected object so it
              becomes the star of the scene. Above the field, below the forge + HUD. */}
          {focusProj && <HeroSpotlight x={focusProj.x} y={focusProj.y} box={box} nightMode={nightMode} />}
          {/* Selected-object marker: a steady ring + gentle pulse on the object whose
              info card is open, so it's obvious WHICH object was tapped. Only while a
              card is showing and the object is on screen. */}
          {selected && focusProj?.onScreen && (
            <SelectionRing x={focusProj.x} y={focusProj.y} color={nightMode ? "#C24A4A" : accent} />
          )}
          {/* Constellation Forge — gold ink-draw on identify (above canvas, below HUD) */}
          <ConstellationForgeLayer
            width={box.width}
            height={box.height}
            active={forge.active}
            points={forge.points}
            segments={forge.segments}
            nightVision={nightMode}
          />
          {/* §12 — cinematic vignette framing the whole scene (clear centre → ~15%
              dark corners). Topmost sky layer, below the HUD; pointerEvents none. */}
          <SkyVignette width={box.width} height={box.height} />
          {/* Watermark — baked into the captured photo only (mounts during capture) */}
          {capturing && (
            <View style={[styles.watermark, { bottom: insets.bottom + 16 }]} pointerEvents="none">
              <Text style={styles.watermarkBrand}>✦ AuraLunis</Text>
              <Text style={styles.watermarkSub}>
                {formatMediumDate(observerTime ?? new Date())}
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Cinematic Immersive Sky — a single tap anywhere restores the UI. Mounted only
          in cinematic, above the scene, so the sky stays pristine and the exit gesture
          is captured cleanly. A brief auto-fading hint makes it discoverable. */}
      {cinematic && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setCinematic(false)}>
          <Animated.View
            style={[styles.cinematicHint, { bottom: insets.bottom + 44, opacity: cinematicHint }]}
            pointerEvents="none"
          >
            <Text style={styles.cinematicHintText}>✦  Tap anywhere to show controls</Text>
          </Animated.View>
        </Pressable>
      )}

      {/* Capture flash — white pulse over the scene (View opacity, crash-safe) */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: "#FFFFFF", opacity: flash }]}
        pointerEvents="none"
      />

      {/* Lock Sky — freezes the orientation exactly so the sky can be read, and enables
          drag-to-pan. Zoom and object taps keep working either way. Hidden in cinematic,
          which is a hands-off presentation mode. */}
      {!cinematic && (
        <Pressable
          onPress={() => { tapLight(); skyOrientation.toggleLock(); }}
          style={[styles.lockChip, { bottom: insets.bottom + 96 }, skyOrientation.isLocked && styles.lockChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: skyOrientation.isLocked }}
          accessibilityLabel={skyOrientation.isLocked ? "Unlock the sky and resume live tracking" : "Lock the sky so it stops moving"}
          hitSlop={10}
        >
          <Text style={[styles.lockChipText, skyOrientation.isLocked && styles.lockChipTextActive]}>
            {skyOrientation.isLocked ? "🔒  Sky Locked · drag to explore" : "🔓  Lock Sky"}
          </Text>
        </Pressable>
      )}

      {/* Zoom indicator — pinch to zoom, tap to reset */}
      {!cinematic && zoom > 1.05 && (
        <TouchableOpacity
          style={[styles.zoomChip, { top: insets.top + 58 }]}
          onPress={() => setZoom(1)}
          activeOpacity={0.85}
        >
          <Text style={[styles.zoomText, { color: accent }]}>{zoom.toFixed(1)}×  ·  tap to reset</Text>
        </TouchableOpacity>
      )}

      {/* Top HUD (hidden in cinematic Immersive Sky) */}
      {!cinematic && (
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onClose}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Close Sky Lens"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.iconBtnText}>✕</Text>
        </TouchableOpacity>

        <View style={styles.hudPill} pointerEvents="none">
          {/* numberOfLines={1} on every line: the HUD must stay a compact strip, never
              grow into a tall text card that covers Betelgeuse and the nearby sky. */}
          <Text style={[styles.hudText, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{hud}</Text>
          {planetarium ? (
            <Text style={styles.hudSub} numberOfLines={1}>🔭 Planetarium — pan to explore</Text>
          ) : immersive ? (
            <Text style={styles.hudSub} numberOfLines={1}>🌌 Immersive — dimmed for photos</Text>
          ) : status === "fallback" ? (
            <Text style={styles.hudSub} numberOfLines={1}>Default location</Text>
          ) : null}
          {satellitesActive && (
            <Text style={styles.hudSubSmall} numberOfLines={1}>◈ Satellites · {satellitesLive ? "LIVE TLE" : "Simulated"}</Text>
          )}
        </View>

        <View style={styles.toggleRow} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.iconBtn, brightnessVisible && { backgroundColor: "rgba(217,168,78,0.32)" }]}
            onPress={() => setBrightnessVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Sky brightness"
            accessibilityState={{ selected: brightnessVisible }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <Text style={styles.iconBtnText}>☀</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, scrubVisible && { backgroundColor: "rgba(217,168,78,0.32)" }]}
            onPress={() => {
              // Time Travel (scrubbing the sky through time) is premium — free users get
              // the paywall instead of the scrub bar.
              if (!isPremium) { openPaywall(); return; }
              // Hiding the bar snaps back to the live sky so we never leave it frozen.
              if (scrubVisible && timeOffsetMin !== 0) setTimeOffsetMin(0);
              setScrubVisible((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Time travel"
            accessibilityState={{ selected: scrubVisible }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <Text style={styles.iconBtnText}>🕐</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, nightMode && { backgroundColor: "rgba(139,32,32,0.5)" }]}
            onPress={() => {
              if (!gate.nightVision) { openPaywall(); return; } // red dark-adapt mode is premium
              const next = !nightMode; setNightMode(next); updateSetting("nightVision", next);
            }}
            accessibilityRole="button"
            accessibilityLabel="Night vision"
            accessibilityState={{ selected: nightMode }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <Text style={styles.iconBtnText}>{nightMode ? "🌙" : "◐"}</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}

      {/* Find-Mode target banner (from a Learn lesson) takes priority */}
      {!cinematic && !selected && targetFinder && (
        <View style={[styles.finder, { bottom: floatAbove + 72 }]} pointerEvents="none">
          <Text style={[styles.finderText, { color: accent }]}>{targetFinder}</Text>
        </View>
      )}
      {/* Moon finder banner (hidden while an info card is open or a target is set).
          +72 clears the 60pt shutter that sits at floatAbove — at +52 the prompt was
          crossing it. Derived, so it also rides up when the time panel opens. */}
      {!cinematic && !selected && !scrubVisible && !targetFinder && moonFinder && (
        <View style={[styles.finder, { bottom: floatAbove + 72 }]} pointerEvents="none">
          <Text style={[styles.finderText, { color: accent }]}>{moonFinder}</Text>
        </View>
      )}

      {/* Photo shutter — capture the sky + overlay, baked with watermark, to share.
          Premium only (gate.photoCapture). */}
      {!cinematic && !selected && gate.photoCapture && (
        <TouchableOpacity
          style={[styles.shutterBtn, { bottom: floatAbove, borderColor: accent }]}
          onPress={captureSky}
          disabled={capturing}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Capture a photo of the sky"
          accessibilityHint="Saves and shares an image of the current sky view."
          accessibilityState={{ disabled: capturing, busy: capturing }}
        >
          <Text style={styles.shutterIcon}>{capturing ? "…" : "📷"}</Text>
        </TouchableOpacity>
      )}

      {/* Bottom controls (hidden in cinematic Immersive Sky) */}
      {!cinematic && (
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 6 }]} pointerEvents="box-none">
        {/* Sky brightness — slide to lighten/darken the backdrop. Hidden while an info
            card is open so they don't overlap. */}
        {brightnessVisible && !selected && (
          <View style={styles.skySliderWrap}>
            <Text style={styles.skySliderLabel}>☾ Dark</Text>
            <Slider
              style={styles.skySlider}
              minimumValue={0}
              maximumValue={1}
              value={sliderValueRef.current}
              onValueChange={(v) => { sliderValueRef.current = v; scrimOpacity.setValue((1 - v) * 0.7); }}
              thumbTintColor={AuraLunisColors.gold}
              minimumTrackTintColor={AuraLunisColors.gold}
              maximumTrackTintColor="rgba(192,198,212,0.18)"
            />
            <Text style={styles.skySliderLabel}>☀ Clear</Text>
          </View>
        )}
        {/* Time Scrub — drag to fast-forward / rewind the whole sky */}
        {scrubVisible && !selected && (
          <View style={{ marginBottom: 10 }}>
            <TimeScrubBar offsetMinutes={timeOffsetMin} onChange={setTimeOffsetMin} accent={accent} />
          </View>
        )}
        {selected ? (
          <SkyLensInfoCard
            object={selected}
            nightMode={nightMode}
            saved={savedIds.has(selected.id)}
            showPoetry={gate.celestialPoetry}
            onSave={onSave}
            onClose={() => setSelected(null)}
          />
        ) : (
          <SkyLensLayerBar
            active={active}
            nightMode={nightMode}
            onToggle={toggleLayer}
            onOpenLayers={() => setLayersSheet(true)}
          />
        )}
      </View>
      )}

      {/* The analytical overlays. Off the sky, one tap away. */}
      <SkyLensLayersSheet
        visible={layersSheet}
        active={active}
        isPremium={isPremium}
        nightMode={nightMode}
        onToggle={toggleLayer}
        onLockedPress={(def) => {
          // The locked-layer flow PREVIEWS the premium layer on the live sky for ~2s and
          // then raises the paywall prompt. That whole moment happens behind this modal,
          // so the sheet has to get out of the way first or the user would just see a
          // dimmed sheet and no sky.
          setLayersSheet(false);
          onLockedPress(def);
        }}
        onClose={() => setLayersSheet(false)}
      />

      {/* THE CONVERSION MOMENT — after a 2s preview of the premium beauty, the scene
          gently fades and the unlock prompt rises. Tap anywhere on it → the paywall. */}
      {preview?.phase === "prompt" && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { endPreview(); openPaywall(); }}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.previewScrim, { opacity: previewFade }]} pointerEvents="none" />
          <Animated.View style={[styles.previewPrompt, { bottom: floatAbove + 8, opacity: previewFade }]} pointerEvents="none">
            <Text style={styles.previewTitle}>✦ Unlock the living universe</Text>
            <Text style={styles.previewSub}>Tap to see {preview.label} like never before</Text>
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  nightFilter: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.3)" },
  atmosphere: { position: "absolute", left: 0, right: 0, bottom: 0, height: "42%" },
  zoomChip: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(7,18,37,0.78)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  zoomText: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  // Three circular buttons now (brightness / time / night). 42→38 and a tighter gap so
  // the cluster stops crowding the HUD pill beside it.
  toggleRow: { flexDirection: "row", gap: 6 },
  shutterBtn: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    backgroundColor: "rgba(7,10,19,0.75)",
    alignItems: "center",
    justifyContent: "center"
  },
  shutterIcon: { fontSize: 26 },
  watermark: { position: "absolute", left: 18, alignItems: "flex-start" },
  watermarkBrand: { color: "#F4E3B8", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  watermarkSub: { color: "rgba(244,227,184,0.75)", fontSize: 11, fontWeight: "600", marginTop: 1 },
  finder: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  finderText: {
    backgroundColor: "rgba(7,18,37,0.82)",
    fontSize: 17,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 3,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    overflow: "hidden"
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(7,18,37,0.58)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(217,168,78,0.24)",
    alignItems: "center",
    justifyContent: "center"
  },
  iconBtnText: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  // UI CHROME — lightened. The panels were dense enough to read as opaque slabs sitting
  // ON the sky. Dropping the fills and adding a hairline gold edge lets the sky show
  // through, so the chrome reads as GLASS resting over the scene rather than as a lid.
  hudPill: {
    flex: 1,
    marginHorizontal: 8,
    backgroundColor: "rgba(7,18,37,0.42)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(217,168,78,0.14)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  previewScrim: { backgroundColor: "rgba(3,8,22,0.5)" },
  previewPrompt: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  previewTitle: {
    color: "#F4E3B8",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 8,
  },
  previewSub: {
    color: "rgba(244,227,184,0.82)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  lockChip: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(8,12,24,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)"
  },
  lockChipActive: {
    backgroundColor: "rgba(217,168,78,0.16)",
    borderColor: "rgba(217,168,78,0.42)"
  },
  lockChipText: { color: "rgba(255,255,255,0.86)", fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  lockChipTextActive: { color: "#D9A84E" },
  cinematicHint: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  cinematicHintText: {
    color: "rgba(244,227,184,0.92)",
    backgroundColor: "rgba(7,18,37,0.55)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
  hudText: { fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"], textShadowColor: "rgba(0,0,0,0.55)", textShadowRadius: 2 },
  hudSub: { color: AuraLunisColors.muted, fontSize: 13, fontWeight: "500", marginTop: 1, opacity: 0.82 },
  hudSubSmall: { color: AuraLunisColors.muted, fontSize: 13, fontWeight: "500", marginTop: 0, opacity: 0.72 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  skySliderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(3,8,22,0.85)",
    borderWidth: 1,
    borderColor: AuraLunisColors.borderSubtle
  },
  skySliderLabel: { color: AuraLunisColors.muted, fontSize: 10, fontWeight: "700" },
  skySlider: { flex: 1, height: 36 }
});
