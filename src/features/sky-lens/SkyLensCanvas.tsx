import React, { useCallback, useMemo } from "react";
import Svg, { Circle, Defs, G, RadialGradient, Stop } from "react-native-svg";
import { StyleSheet } from "react-native";
import { projectTarget, projectTargetWithBasis, DEFAULT_FOV, type CameraPointing, type CameraBasis, type CameraFov } from "./ar/SkyLensProjection";
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
  /**
   * Quaternion-derived camera basis. When present this drives EVERY layer, label and hit
   * test through the singularity-free projection; `pointing` is then only a legacy fallback.
   * One immutable snapshot per render — nothing downstream re-derives orientation.
   */
  basis?: CameraBasis;
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

// Composes the enabled celestial layers over the cinematic sky. The presentation may
// look like a planetarium, but normal viewing remains horizon-correct: objects beneath
// the observer are never painted into the visible sky.
export function SkyLensCanvas({ box, pointing, basis, sky, fov, activeLayers, nightMode, milkyWayBoost, domeStarMultiplier = 1, nebulaOpacity = 1, extinction = false, isPremium, focus, showcase, parallax, satellites, cinematic = false, gate, bottomInset = 120, topInset = 108, reservedRects = [], onSelect }: Props) {
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
    // ONE projection for the whole render. With a quaternion basis this never reconstructs a
    // camera axis from an azimuth, so the zenith stops being a singularity; without one it
    // falls back to the legacy Euler path, which remains intact but unused in production.
    (az: number, alt: number) =>
      basis
        ? projectTargetWithBasis(basis, az, alt, fov, box)
        : projectTarget(pointing, az, alt, fov, box),
    [basis, pointing, box, fov]
  );

  // Display-only heading for the horizon glow and grid centring. Read off the basis rather
  // than the Euler pointing so every consumer agrees with the rendered camera. This is a
  // READOUT, never a source of camera motion.
  const centerAzimuth = useMemo(() => {
    if (!basis) return pointing.azimuthDegrees;
    const az = (Math.atan2(basis.forward.e, basis.forward.n) * 180) / Math.PI;
    return (az + 360) % 360;
  }, [basis, pointing.azimuthDegrees]);

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
        <HorizonGlowLayer project={project} centerAzimuth={centerAzimuth} box={box} nightMode={nightMode} boost={milkyWayBoost} />

        {activeLayers.has("grid") && !cinematic && (
          <GridLayer project={project} centerAzimuth={centerAzimuth} box={box} palette={palette} />
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
            hideNames={activeLayers.has("constellations")}            project={project}
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
          {/* CONSTELLATION NAMES — PRIMARY PASS.
              The shared placer is first-come-first-served, so PRIORITY IS MOUNT ORDER.
              Major asterisms and primary constellation names are claimed BEFORE star names,
              which is the requested ladder: Moon/planets, then asterisms and primary
              constellations, then bright stars. Secondary names are a separate mount AFTER
              StarLayer, so they yield to star names instead of competing with them. */}
          {activeLayers.has("constellations") && (
            <ConstellationLayer
              constellations={constellations}
              project={project}
              box={box}
              palette={palette}
              nightMode={nightMode}
              placeLabel={placeLabel}
              showLabels
              labelsOnly
              zoom={zoomLevel}
              bands={["primary"]}
              fullSphere={horizonCorrect}
              onSelect={onSelect}
            />
          )}
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
              zoom={zoomLevel}
              bands={["secondary", "tertiary"]}
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
            hideNames={activeLayers.has("constellations")}            project={project}
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
    </Svg>
  );
}
