import React, { useCallback, useEffect, useMemo, useRef } from "react";
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from "react-native-svg";
import { StyleSheet } from "react-native";
import { projectTarget, DEFAULT_FOV, type CameraPointing, type CameraFov } from "./ar/SkyLensProjection";
import { GridLayer } from "./layers/GridLayer";
import { CardinalLayer } from "./layers/CardinalLayer";
import { ConstellationLayer } from "./layers/ConstellationLayer";
import { ConstellationArtLayer } from "./layers/ConstellationArtLayer";
import { StarLayer } from "./layers/StarLayer";
import { DomeStarLayer } from "./layers/DomeStarLayer";
import { PlanetLayer } from "./layers/PlanetLayer";
import { MoonLayer, MOON_RADIUS } from "./layers/MoonLayer";
import { CosmicDustLayer } from "./layers/CosmicDustLayer";
import { HorizonGlowLayer } from "./layers/HorizonGlowLayer";
import { ShootingStarLayer } from "./layers/ShootingStarLayer";
import { EclipticLayer } from "./layers/EclipticLayer";
import { ZodiacLayer } from "./layers/ZodiacLayer";
import { SatelliteLayer, type SkyLensSatellite } from "./layers/SatelliteLayer";
import { DAY_PALETTE, NIGHT_PALETTE, type ProjectFn, type SelectedObject, type FocusZone } from "./SkyLensVisual";
import { type LayerKey } from "./SkyLensLayerCatalog";
import { makeLabelPlacer } from "./labelLayout";
import { type ChromeRect } from "./skyLensChromeLayout";
import type { SkyData } from "./hooks/useSkyProjection";
import type { ParallaxOffset } from "./ar/useParallaxOffset";
import { getVisualGate, type VisualGateConfig } from "./PremiumVisualGating";

type Props = {
  box: { width: number; height: number };
  pointing: CameraPointing;
  sky: SkyData;
  fov: CameraFov;
  activeLayers: Set<LayerKey>;
  nightMode: boolean;
  milkyWayBoost: number;
  domeStarMultiplier?: number;
  nebulaOpacity?: number;
  extinction?: boolean;
  isPremium: boolean;
  focus: FocusZone;
  showcase: FocusZone;
  parallax: ParallaxOffset;
  satellites: SkyLensSatellite[];
  cinematic?: boolean;
  gate?: VisualGateConfig;
  photographicCore?: boolean;
  fullSphere?: boolean;
  /** Height of the bottom control dock (px). Labels are kept out of it. */
  bottomInset?: number;
  /** Top exclusion band (px), derived from safe-area + HUD height by the screen. */
  topInset?: number;
  /** UI-chrome rectangles (shutter, guidance banner, zoom chip) labels must avoid. */
  reservedRects?: ChromeRect[];
  onSelect: (object: SelectedObject) => void;
};

const RETICLE_RADIUS = 24;
const RETICLE_CAPTURE_RADIUS = 34;
const RETICLE_DWELL_MS = 420;

const PLANET_DESCRIPTIONS: Record<string, string> = {
  sun: "The star at the center of our Solar System.",
  mercury: "The smallest planet and the closest to the Sun.",
  venus: "The brightest planet, often called the morning or evening star.",
  mars: "The red planet, shaped by volcanoes, canyons, and ancient water.",
  jupiter: "The largest planet in our Solar System.",
  saturn: "The ringed giant, surrounded by an intricate system of icy rings.",
  uranus: "An ice giant rotating almost on its side.",
  neptune: "A distant blue ice giant with extremely fast winds.",
  moon: "Earth's natural satellite and the main driver of ocean tides."
};

// Composes the enabled celestial layers over the cinematic sky. The presentation may
// look like a planetarium, but normal viewing remains horizon-correct: objects beneath
// the observer are never painted into the visible sky.
export function SkyLensCanvas({ box, pointing, sky, fov, activeLayers, nightMode, milkyWayBoost, domeStarMultiplier = 1, nebulaOpacity = 1, extinction = false, isPremium, focus, showcase, parallax, satellites, cinematic = false, gate, bottomInset = 120, topInset = 108, reservedRects = [], onSelect }: Props) {
  const palette = nightMode ? NIGHT_PALETTE : DAY_PALETTE;
  const vg = gate ?? getVisualGate(isPremium);
  const horizonCorrect = false;

  const domeStars = useMemo(() => {
    const base = domeStarMultiplier < 1
      ? sky.domeStars.filter((s) => s.magnitude <= 3.2 + 2.8 * domeStarMultiplier)
      : sky.domeStars;
    return base.filter((s) => s.aboveHorizon && s.magnitude <= 4.5);
  }, [sky.domeStars, domeStarMultiplier]);

  const showLabels = !cinematic;
  const placeLabel = makeLabelPlacer(box, { top: topInset, bottom: bottomInset });
  for (const r of reservedRects) placeLabel.reserve(r.x, r.y, r.w, r.h);
  const depth = (d: number) => `translate(${(parallax.x * d).toFixed(2)} ${(parallax.y * d).toFixed(2)})`;
  const constellations = sky.constellations;

  const project: ProjectFn = useCallback(
    (az: number, alt: number) => projectTarget(pointing, az, alt, fov, box),
    [pointing, box, fov]
  );

  const zoomLevel = DEFAULT_FOV.horizontalDegrees / fov.horizontalDegrees;
  const starLabelMag = 1.65 + Math.min(2.2, Math.max(0, zoomLevel - 1) * 0.65);

  const moon = sky.bodies.find((b) => b.id === "moon");
  const moonProj = moon && moon.aboveHorizon ? project(moon.azimuthDegrees, moon.altitudeDegrees) : null;
  const moonOnScreen = !!moonProj?.onScreen;
  const heroDim = moonOnScreen ? 0.85 : 1;
  const lensR = Math.min(box.height * 0.95, box.height * (30 / Math.max(8, fov.verticalDegrees)));

  if (moonOnScreen && moonProj) {
    placeLabel.reserveCircle(moonProj.x, moonProj.y, MOON_RADIUS * 1.2);
  }

  // Center-reticle discovery. It uses the exact same projection as the rendered layers,
  // waits briefly before locking, and remembers the last object so nearby labels do not flicker.
  const centeredCandidate = useMemo<{ object: SelectedObject; distance: number } | null>(() => {
    if (cinematic || box.width <= 0 || box.height <= 0) return null;
    const cx = box.width / 2;
    const cy = box.height / 2;
    let closest: { object: SelectedObject; distance: number } | null = null;

    const consider = (object: SelectedObject, azimuthDegrees: number, altitudeDegrees: number) => {
      const p = projectTarget(pointing, azimuthDegrees, altitudeDegrees, fov, box);
      if (!p.onScreen || p.behind) return;
      const distance = Math.hypot(p.x - cx, p.y - cy);
      if (distance > RETICLE_CAPTURE_RADIUS) return;
      if (!closest || distance < closest.distance) closest = { object, distance };
    };

    if (activeLayers.has("planets")) {
      for (const body of sky.bodies) {
        if (!body.aboveHorizon) continue;
        consider(
          {
            kind: body.id === "moon" ? "moon" : "planet",
            id: body.id,
            name: body.name,
            subtitle: body.id === "moon" ? "Earth's Moon" : body.id === "sun" ? "Star" : "Planet",
            description: PLANET_DESCRIPTIONS[body.id],
            facts: [
              ...(body.magnitude !== undefined ? [{ label: "Magnitude", value: body.magnitude.toFixed(1) }] : []),
              { label: "Altitude", value: `${Math.round(body.altitudeDegrees)}°` },
              { label: "Azimuth", value: `${Math.round(body.azimuthDegrees)}°` }
            ]
          },
          body.azimuthDegrees,
          body.altitudeDegrees
        );
      }
    }

    if (activeLayers.has("stars")) {
      for (const star of sky.stars) {
        if (!star.aboveHorizon || star.magnitude >= 1.8) continue;
        consider(
          {
            kind: "star",
            id: star.id,
            name: star.name || star.id,
            subtitle: `Magnitude ${star.magnitude.toFixed(1)}`,
            description: "A bright star currently crossing the center of Sky Lens.",
            facts: [
              { label: "Magnitude", value: star.magnitude.toFixed(1) },
              { label: "Altitude", value: `${Math.round(star.altitudeDegrees)}°` },
              { label: "Azimuth", value: `${Math.round(star.azimuthDegrees)}°` }
            ]
          },
          star.azimuthDegrees,
          star.altitudeDegrees
        );
      }
    }

    if (activeLayers.has("constellations") && !closest) {
      for (const constellation of sky.constellations) {
        const center = constellation.centroid;
        if (!center.aboveHorizon) continue;
        consider(
          {
            kind: "constellation",
            id: constellation.id,
            name: constellation.name || constellation.id,
            subtitle: "Constellation",
            description: "A recognized constellation centered in Sky Lens.",
            facts: [
              { label: "Altitude", value: `${Math.round(center.altitudeDegrees)}°` },
              { label: "Azimuth", value: `${Math.round(center.azimuthDegrees)}°` }
            ]
          },
          center.azimuthDegrees,
          center.altitudeDegrees
        );
      }
    }

    return closest;
  }, [activeLayers, box, cinematic, fov, pointing, sky.bodies, sky.constellations, sky.stars]);

  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const identifiedIdRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const candidate = centeredCandidate?.object ?? null;
    if (!candidate) {
      pendingIdRef.current = null;
      identifiedIdRef.current = null;
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
      return;
    }

    if (identifiedIdRef.current === candidate.id || pendingIdRef.current === candidate.id) return;
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    pendingIdRef.current = candidate.id;
    dwellTimerRef.current = setTimeout(() => {
      if (pendingIdRef.current !== candidate.id) return;
      identifiedIdRef.current = candidate.id;
      pendingIdRef.current = null;
      onSelectRef.current(candidate);
    }, RETICLE_DWELL_MS);

    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    };
  }, [centeredCandidate?.object]);

  useEffect(() => () => {
    if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
  }, []);

  const reticleColor = nightMode ? "#FF6B5F" : "#D9A84E";
  const reticleActive = !!centeredCandidate;
  const reticleX = box.width / 2;
  const reticleY = box.height / 2;

  return (
    <Svg style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Defs>
        <RadialGradient id="moonLensAdapt" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFE9B0" stopOpacity={0.05} />
          <Stop offset="55%" stopColor="#D9A84E" stopOpacity={0.02} />
          <Stop offset="100%" stopColor="#D9A84E" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {moonOnScreen && !nightMode && moonProj && (
        <Circle cx={moonProj.x} cy={moonProj.y} r={lensR} fill="url(#moonLensAdapt)" />
      )}

      <G opacity={heroDim}>
        <CosmicDustLayer
          box={box}
          project={project}
          band={sky.milkyWay}
          nightMode={nightMode}
          fullSphere={horizonCorrect}
        />
        <HorizonGlowLayer project={project} centerAzimuth={pointing.azimuthDegrees} box={box} nightMode={nightMode} boost={milkyWayBoost} />

        {activeLayers.has("grid") && !cinematic && (
          <GridLayer project={project} centerAzimuth={pointing.azimuthDegrees} box={box} palette={palette} />
        )}
        {!cinematic && <CardinalLayer project={project} box={box} nightMode={nightMode} />}
        {activeLayers.has("ecliptic") && !cinematic && (
          <EclipticLayer points={sky.ecliptic} project={project} palette={palette} nightMode={nightMode} />
        )}

        {activeLayers.has("constellations") && (
          <ConstellationArtLayer constellations={constellations} project={project} box={box} fov={fov} enabled={false} />
        )}
        {activeLayers.has("constellations") && (
          <G opacity={cinematic ? 0.48 : 0.72}>
            <ConstellationLayer
              constellations={constellations}
              project={project}
              box={box}
              palette={palette}
              nightMode={nightMode}
              showLabels={false}
              showNodes={false}
              fullSphere={horizonCorrect}
              onSelect={onSelect}
            />
          </G>
        )}

        {activeLayers.has("zodiac") && !cinematic && (
          <ZodiacLayer
            zodiac={sky.zodiac}
            project={project}
            palette={palette}
            nightMode={nightMode}
            sun={sky.bodies.find((b) => b.id === "sun") ?? null}
            placeLabel={placeLabel}
            onSelect={onSelect}
          />
        )}

        {activeLayers.has("planets") && showLabels && (
          <PlanetLayer
            bodies={sky.bodies}
            project={project}
            palette={palette}
            nightMode={nightMode}
            placeLabel={placeLabel}
            showLabels
            labelsOnly
            useIllustrations={vg.planetIllustrations}
            zoom={zoomLevel}
            fullSphere={horizonCorrect}
            onSelect={onSelect}
          />
        )}
        {activeLayers.has("stars") && (
          <DomeStarLayer stars={domeStars} project={project} palette={palette} nightMode={nightMode} focus={focus} showcase={showcase} extinction={extinction} useSpectralColors={vg.spectralColors} fullSphere={horizonCorrect} />
        )}
        {activeLayers.has("stars") && (
          <G transform={depth(0.25)}>
            <StarLayer stars={sky.stars} project={project} palette={palette} nightMode={nightMode} focus={focus} showcase={showcase} placeLabel={placeLabel} labelMagLimit={starLabelMag} showLabels={showLabels} extinction={extinction} bloom={vg.starBloom} fullSphere={horizonCorrect} onSelect={onSelect} />
          </G>
        )}

        {vg.shootingStars && <ShootingStarLayer width={box.width} height={box.height} nightMode={nightMode} />}
        {activeLayers.has("planets") && (
          <PlanetLayer
            bodies={sky.bodies}
            project={project}
            palette={palette}
            nightMode={nightMode}
            placeLabel={placeLabel}
            showLabels={false}
            useIllustrations={vg.planetIllustrations}
            zoom={zoomLevel}
            fullSphere={horizonCorrect}
            onSelect={onSelect}
          />
        )}
        {activeLayers.has("constellations") && showLabels && (
          <G opacity={cinematic ? 0.48 : 0.72}>
            <ConstellationLayer
              constellations={constellations}
              project={project}
              box={box}
              palette={palette}
              nightMode={nightMode}
              placeLabel={placeLabel}
              showLabels
              labelsOnly
              fullSphere={horizonCorrect}
              onSelect={onSelect}
            />
          </G>
        )}
        {activeLayers.has("satellites") && !cinematic && (
          <SatelliteLayer satellites={satellites} project={project} palette={palette} nightMode={nightMode} placeLabel={placeLabel} onSelect={onSelect} />
        )}

        {activeLayers.has("zodiac") && showLabels && !cinematic && (
          <ZodiacLayer
            zodiac={sky.zodiac}
            project={project}
            palette={palette}
            nightMode={nightMode}
            sun={sky.bodies.find((b) => b.id === "sun") ?? null}
            placeLabel={placeLabel}
            labelsOnly
            onSelect={onSelect}
          />
        )}
      </G>

      <MoonLayer
        moon={moon}
        illuminationPercent={sky.moonIlluminationPercent}
        placeLabel={placeLabel}
        project={project}
        palette={palette}
        nightMode={nightMode}
        showLabels={showLabels}
        heroMode={vg.heroMoon}
        fullSphere={horizonCorrect}
        onSelect={onSelect}
      />

      {!cinematic && (
        <G opacity={reticleActive ? 0.95 : 0.55} pointerEvents="none">
          <Circle
            cx={reticleX}
            cy={reticleY}
            r={RETICLE_RADIUS}
            fill="rgba(3,8,22,0.18)"
            stroke={reticleColor}
            strokeWidth={reticleActive ? 2.2 : 1.4}
          />
          <Circle cx={reticleX} cy={reticleY} r={2.6} fill={reticleColor} />
          <Line x1={reticleX - 36} y1={reticleY} x2={reticleX - 27} y2={reticleY} stroke={reticleColor} strokeWidth={1.5} />
          <Line x1={reticleX + 27} y1={reticleY} x2={reticleX + 36} y2={reticleY} stroke={reticleColor} strokeWidth={1.5} />
          <Line x1={reticleX} y1={reticleY - 36} x2={reticleX} y2={reticleY - 27} stroke={reticleColor} strokeWidth={1.5} />
          <Line x1={reticleX} y1={reticleY + 27} x2={reticleX} y2={reticleY + 36} stroke={reticleColor} strokeWidth={1.5} />
        </G>
      )}
    </Svg>
  );
}
