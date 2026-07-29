import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Svg, { Circle, Defs, G, RadialGradient, Stop } from "react-native-svg";
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
  bottomInset?: number;
  topInset?: number;
  reservedRects?: ChromeRect[];
  reducedDetail?: boolean;
  onSelect: (object: SelectedObject) => void;
};

const shortestAngleDelta = (from: number, to: number) => {
  let delta = (to - from + 540) % 360 - 180;
  if (delta === -180) delta = 180;
  return delta;
};

function useAutomaticReducedDetail(pointing: CameraPointing) {
  const [moving, setMoving] = useState(false);
  const previous = useRef(pointing);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = pointing;
    const az = Math.abs(shortestAngleDelta(before.azimuthDegrees, pointing.azimuthDegrees));
    const alt = Math.abs(before.altitudeDegrees - pointing.altitudeDegrees);
    const roll = Math.abs(shortestAngleDelta(before.rollDegrees, pointing.rollDegrees));
    const deliberate = az >= 0.28 || alt >= 0.22 || roll >= 0.4;
    if (!deliberate) return;

    setMoving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMoving(false), 220);
  }, [pointing]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return moving;
}

export function SkyLensCanvas({
  box,
  pointing,
  sky,
  fov,
  activeLayers,
  nightMode,
  milkyWayBoost,
  domeStarMultiplier = 1,
  extinction = false,
  isPremium,
  focus,
  showcase,
  parallax,
  satellites,
  cinematic = false,
  gate,
  bottomInset = 120,
  topInset = 108,
  reservedRects = [],
  reducedDetail = false,
  onSelect
}: Props) {
  const autoReducedDetail = useAutomaticReducedDetail(pointing);
  const lightScene = reducedDetail || autoReducedDetail;
  const palette = nightMode ? NIGHT_PALETTE : DAY_PALETTE;
  const vg = gate ?? getVisualGate(isPremium);
  const horizonCorrect = false;

  const domeStars = useMemo(() => {
    const base = domeStarMultiplier < 1
      ? sky.domeStars.filter((star) => star.magnitude <= 3.2 + 2.8 * domeStarMultiplier)
      : sky.domeStars;
    const limit = lightScene ? 3.25 : 4.5;
    return base.filter((star) => star.aboveHorizon && star.magnitude <= limit);
  }, [sky.domeStars, domeStarMultiplier, lightScene]);

  const primaryStars = useMemo(
    () => lightScene ? sky.stars.filter((star) => star.magnitude <= 2.7) : sky.stars,
    [sky.stars, lightScene]
  );

  const showLabels = !cinematic && !lightScene;
  const placeLabel = makeLabelPlacer(box, { top: topInset, bottom: bottomInset });
  for (const rect of reservedRects) placeLabel.reserve(rect.x, rect.y, rect.w, rect.h);

  const depth = (amount: number) => `translate(${(parallax.x * amount).toFixed(2)} ${(parallax.y * amount).toFixed(2)})`;
  const constellations = sky.constellations;
  const project: ProjectFn = useCallback(
    (azimuth: number, altitude: number) => projectTarget(pointing, azimuth, altitude, fov, box),
    [pointing, box, fov]
  );

  const zoomLevel = DEFAULT_FOV.horizontalDegrees / fov.horizontalDegrees;
  const starLabelMag = 1.65 + Math.min(2.2, Math.max(0, zoomLevel - 1) * 0.65);
  const moon = sky.bodies.find((body) => body.id === "moon");
  const moonProj = moon && moon.aboveHorizon ? project(moon.azimuthDegrees, moon.altitudeDegrees) : null;
  const moonOnScreen = !!moonProj?.onScreen;
  const heroDim = moonOnScreen ? 0.85 : 1;
  const lensR = Math.min(box.height * 0.95, box.height * (30 / Math.max(8, fov.verticalDegrees)));

  if (moonOnScreen && moonProj) placeLabel.reserveCircle(moonProj.x, moonProj.y, MOON_RADIUS * 1.2);

  return (
    <Svg style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <Defs>
        <RadialGradient id="moonLensAdapt" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFE9B0" stopOpacity={0.05} />
          <Stop offset="55%" stopColor="#D9A84E" stopOpacity={0.02} />
          <Stop offset="100%" stopColor="#D9A84E" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {moonOnScreen && !nightMode && moonProj && !lightScene && (
        <Circle cx={moonProj.x} cy={moonProj.y} r={lensR} fill="url(#moonLensAdapt)" />
      )}

      <G opacity={heroDim}>
        {!lightScene && (
          <>
            <CosmicDustLayer box={box} project={project} band={sky.milkyWay} nightMode={nightMode} fullSphere={horizonCorrect} />
            <HorizonGlowLayer project={project} centerAzimuth={pointing.azimuthDegrees} box={box} nightMode={nightMode} boost={milkyWayBoost} />
          </>
        )}

        {activeLayers.has("grid") && !cinematic && (
          <GridLayer project={project} centerAzimuth={pointing.azimuthDegrees} box={box} palette={palette} />
        )}
        {!cinematic && !lightScene && <CardinalLayer project={project} box={box} nightMode={nightMode} />}
        {activeLayers.has("ecliptic") && !cinematic && (
          <EclipticLayer points={sky.ecliptic} project={project} palette={palette} nightMode={nightMode} />
        )}

        {activeLayers.has("constellations") && (
          <ConstellationArtLayer constellations={constellations} project={project} box={box} fov={fov} enabled={false} />
        )}
        {activeLayers.has("constellations") && (
          <G opacity={cinematic ? 0.48 : lightScene ? 0.5 : 0.72}>
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
            sun={sky.bodies.find((body) => body.id === "sun") ?? null}
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
          <DomeStarLayer
            stars={domeStars}
            project={project}
            palette={palette}
            nightMode={nightMode}
            focus={focus}
            showcase={showcase}
            extinction={extinction}
            useSpectralColors={vg.spectralColors}
            fullSphere={horizonCorrect}
          />
        )}
        {activeLayers.has("stars") && (
          <G transform={depth(0.25)}>
            <StarLayer
              stars={primaryStars}
              project={project}
              palette={palette}
              nightMode={nightMode}
              focus={focus}
              showcase={showcase}
              placeLabel={placeLabel}
              labelMagLimit={starLabelMag}
              showLabels={showLabels}
              extinction={extinction}
              bloom={vg.starBloom && !lightScene}
              fullSphere={horizonCorrect}
              onSelect={onSelect}
            />
          </G>
        )}

        {vg.shootingStars && !lightScene && <ShootingStarLayer width={box.width} height={box.height} nightMode={nightMode} />}

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

        {activeLayers.has("satellites") && !cinematic && !lightScene && (
          <SatelliteLayer satellites={satellites} project={project} palette={palette} nightMode={nightMode} placeLabel={placeLabel} onSelect={onSelect} />
        )}

        {activeLayers.has("zodiac") && showLabels && !cinematic && (
          <ZodiacLayer
            zodiac={sky.zodiac}
            project={project}
            palette={palette}
            nightMode={nightMode}
            sun={sky.bodies.find((body) => body.id === "sun") ?? null}
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