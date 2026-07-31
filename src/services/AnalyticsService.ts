// Lightweight analytics for conversion tracking. Events are logged locally and
// can be wired to any backend (RevenueCat, Mixpanel, Firebase) by replacing the
// `send` function. For v1, events go to AsyncStorage as a local log and
// console.log in __DEV__.
//
// Key events to watch after launch:
//   paywall_impression   — how many users see the paywall
//   toggle_monthly       — user switched to monthly (vs default annual)
//   toggle_annual        — user switched back to annual
//   purchase_tap         — user tapped the purchase button (conversion intent)
//   continue_free        — user declined (compare to impression for drop-off rate)
//   purchase_complete    — StoreKit confirmed (actual conversion)
//   purchase_cancelled   — user cancelled in StoreKit sheet

import AsyncStorage from "@react-native-async-storage/async-storage";

export type PaywallEventName =
  | "paywall_impression"
  | "toggle_monthly"
  | "toggle_annual"
  | "purchase_tap"
  | "continue_free"
  | "purchase_complete"
  | "purchase_cancelled";

interface AnalyticsEvent {
  name: PaywallEventName;
  properties: Record<string, unknown>;
  timestamp: string;
}

const EVENT_LOG_KEY = "auralunis.analytics.paywall_events";
const MAX_LOCAL_EVENTS = 200;

async function appendLocalEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EVENT_LOG_KEY);
    const log: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    log.push(event);
    // Keep only the most recent events to bound storage.
    const trimmed = log.length > MAX_LOCAL_EVENTS ? log.slice(-MAX_LOCAL_EVENTS) : log;
    await AsyncStorage.setItem(EVENT_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // Analytics should never crash the app.
  }
}

// Replace this function to wire a real analytics backend.
async function send(event: AnalyticsEvent): Promise<void> {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event.name}`, event.properties);
  }
  await appendLocalEvent(event);
}

export function trackPaywallEvent(
  name: PaywallEventName,
  properties: Record<string, unknown> = {}
): void {
  const event: AnalyticsEvent = {
    name,
    properties,
    timestamp: new Date().toISOString()
  };
  // Fire-and-forget: don't await so the UI stays responsive.
  void send(event);
}

// Read the local event log (useful for debugging / export).
export async function getPaywallEventLog(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearPaywallEventLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(EVENT_LOG_KEY);
  } catch {
    // No-op.
  }
}

// ── Tutorial (First Light) events ────────────────────────────────────────────────
//
// Same local-only mechanism as the paywall log above — NO new analytics provider, no network
// call, no third-party SDK. Events go to a separate namespaced AsyncStorage key and, in dev,
// the console.
//
// PRIVACY: the properties are limited to the small, non-identifying set below (step id, an
// object KIND like "moon"/"planet", a tip id, a reason string). Location, orientation samples,
// Vault contents, notes, and anything else about the user's sky session are never recorded
// here — and, like the paywall log, a failure is swallowed so analytics can never block or
// crash the tour.

export type TutorialEventName =
  | "first_light_started"
  | "first_light_step_completed"
  | "first_light_skipped"
  | "first_light_completed"
  | "first_light_replayed"
  | "contextual_tip_seen"
  | "contextual_tip_dismissed";

/** The ONLY property keys a tutorial event may carry. Anything else is dropped, not logged. */
export const ALLOWED_TUTORIAL_EVENT_PROPERTIES: ReadonlyArray<string> = [
  "stepId",
  "objectKind",
  "tipId",
  "reason",
  "variant",
];

const TUTORIAL_EVENT_LOG_KEY = "auralunis.analytics.tutorial_events";

interface TutorialEvent {
  name: TutorialEventName;
  properties: Record<string, string>;
  timestamp: string;
}

/** Keep only allow-listed keys, coerced to short strings. Defence in depth against a caller
 *  accidentally passing a coordinate, a note body, or an object. */
function sanitizeTutorialProperties(properties: Record<string, unknown>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const key of ALLOWED_TUTORIAL_EVENT_PROPERTIES) {
    const value = properties[key];
    if (typeof value === "string" && value.length > 0) clean[key] = value.slice(0, 64);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = String(value);
    else if (typeof value === "boolean") clean[key] = String(value);
  }
  return clean;
}

export function trackTutorialEvent(
  name: TutorialEventName,
  properties: Record<string, unknown> = {}
): void {
  const event: TutorialEvent = {
    name,
    properties: sanitizeTutorialProperties(properties),
    timestamp: new Date().toISOString(),
  };
  // Fire-and-forget, exactly like the paywall events — never awaited by the tour.
  void (async () => {
    try {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[analytics] ${event.name}`, event.properties);
      }
      const raw = await AsyncStorage.getItem(TUTORIAL_EVENT_LOG_KEY);
      const log: TutorialEvent[] = raw ? JSON.parse(raw) : [];
      log.push(event);
      const trimmed = log.length > MAX_LOCAL_EVENTS ? log.slice(-MAX_LOCAL_EVENTS) : log;
      await AsyncStorage.setItem(TUTORIAL_EVENT_LOG_KEY, JSON.stringify(trimmed));
    } catch {
      // Analytics must never break the tutorial.
    }
  })();
}

export async function getTutorialEventLog(): Promise<TutorialEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(TUTORIAL_EVENT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
