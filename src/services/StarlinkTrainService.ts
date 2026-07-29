// StarlinkTrainService.ts
// Atmospheric Wake — Starlink Train Tracker.
// Live data: fetches TLE strings from Celestrak, propagates via satellite.js
// every second so blip positions are accurate to the real sky.
// Fallback: mock 28-node train if network unavailable.

import { calculateAlignment, type AlignmentResult } from "@/utils/alignmentEngine";
import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import type { CameraPointing } from "@/features/sky-lens/ar/SkyLensProjection";
import {
  getLiveStarlinkPositions,
  repropagateStarlinkToNow,
  isSatelliteJsAvailable,
  type PropagatedPosition,
} from "@/services/LiveTLEService";

const TRAIN_COLOR = "#A78BFA"; // Nebula violet
const TRAIN_NODE_LIMIT = 28;

export interface TrainBlip {
  id: string;
  index: number;
  azimuthDiff: number;
  elevationDiff: number;
  color: string;
  /** 1.0 at lead, fading to 0.25 at tail */
  opacity: number;
  isActive: boolean;
  isLead: boolean;
  alignmentScore: number;
  totalAngularError: number;
}

// ─── Live position state ──────────────────────────────────────────────────────

let _livePositions: PropagatedPosition[] = [];
let _isLive = false;
let _fetchPromise: Promise<void> | null = null;

/** Fetch TLE data from Celestrak (once, cached for 2h). Call on train mode entry. */
export async function initStarlinkTrainLive(): Promise<boolean> {
  if (!isSatelliteJsAvailable()) return false;
  // A fetch already in flight: await it rather than reporting the stale flag, so a second
  // caller doesn't see `false` simply because the first request hasn't landed yet.
  if (_fetchPromise) {
    await _fetchPromise;
    return _isLive;
  }

  const attempt = getLiveStarlinkPositions(TRAIN_NODE_LIMIT)
    .then(positions => {
      if (positions.length > 0) {
        _livePositions = positions;
        _isLive = true;
      }
    })
    .catch(() => { _isLive = false; })
    .finally(() => {
      // Release the latch unless this attempt actually produced live data. The promise used
      // to be kept forever, so one failed fetch (offline on mode entry) permanently pinned
      // the train to mock data — every later entry short-circuited and never retried.
      if (!_isLive) _fetchPromise = null;
    });

  _fetchPromise = attempt;
  await attempt;
  return _isLive;
}

/**
 * Re-propagate cached TLE records to the current second.
 * Call every 1000ms in a setInterval while in train mode.
 * This is cheap — no network call, just math on cached TLE strings.
 */
export async function tickStarlinkLive(): Promise<void> {
  if (!_isLive) return;
  const updated = await repropagateStarlinkToNow(TRAIN_NODE_LIMIT);
  if (updated.length > 0) _livePositions = updated;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

let _mockTick = 0;

function buildMockPositions(): PropagatedPosition[] {
  const now = Date.now();
  return Array.from({ length: TRAIN_NODE_LIMIT }, (_, i) => {
    const lonOffset = i * 0.055 * 1.2;
    const latOffset = i * 0.055 * 0.3;
    return {
      noradId: 57680 + i,
      name: `STARLINK-L${i + 1}`,
      latitudeDegrees: Math.max(-51.6, Math.min(51.6, 45 + Math.sin(now * 0.00004) * 20 - latOffset)),
      longitudeDegrees: (((_mockTick * 0.6 - lonOffset) % 360) + 360) % 360 - 180,
      altitudeKm: 550 - i * 0.3,
      velocityKms: 7.66,
      timestamp: new Date().toISOString(),
    };
  });
}

export function tickStarlinkMock(): void {
  _mockTick++;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get current train blips for radar rendering.
 * Uses live positions if available, mock otherwise.
 */
export function getStarlinkTrainBlips(
  observer: ObserverLocation,
  pointing: CameraPointing
): TrainBlip[] {
  const positions = _isLive && _livePositions.length > 0
    ? _livePositions
    : buildMockPositions();

  const results = positions.map((pos, i) => {
    const alignment = calculateAlignment(observer, pointing, {
      id: `sl-${pos.noradId}`,
      name: pos.name,
      latitudeDegrees: pos.latitudeDegrees,
      longitudeDegrees: pos.longitudeDegrees,
      altitudeKm: pos.altitudeKm,
    });

    const opacity = Math.max(0.25, 1 - (i / positions.length) * 0.75);

    return {
      id: `sl-${pos.noradId}`,
      index: i,
      azimuthDiff: alignment.azimuthDiff,
      elevationDiff: alignment.elevationDiff,
      color: TRAIN_COLOR,
      opacity,
      isActive: false,
      isLead: i === 0,
      alignmentScore: alignment.alignmentScore,
      totalAngularError: alignment.totalAngularError,
    };
  });

  // Mark the node closest to device pointing as active
  if (results.length > 0) {
    const minIdx = results.reduce((best, r, i) =>
      r.totalAngularError < results[best].totalAngularError ? i : best, 0
    );
    results[minIdx].isActive = true;
  }

  return results;
}

export function isTrainLive(): boolean { return _isLive; }
export function getTrainNodeCount(): number {
  return _isLive ? _livePositions.length : TRAIN_NODE_LIMIT;
}

/** Haptic interval ms based on closest node error — null = silent */
export function trainHapticInterval(closestError: number): number | null {
  if (closestError > 30) return null;
  if (closestError > 15) return 500;
  if (closestError > 5)  return 250;
  return 100;
}
