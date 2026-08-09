// BirthSkyScreen.tsx
// Personal birth-sky certificate using birth date, local birth time, and birthplace.

import React, { useEffect, useRef, useState } from "react";
import { Alert, PixelRatio, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";
import { ScreenShell } from "@/components/ScreenShell";
import { Starfield } from "@/components/Starfield";
import { ZODIAC_BODIES, signPositionFromLongitude } from "@/features/birthsky/tropicalZodiac";
import { AuraLunisColors } from "@/theme/tokens";
import { tapLight } from "@/services/HapticService";
import { computeBirthSky, BIRTHDAY_STORAGE_KEY, type BirthSkyProfile } from "@/services/BirthSkyService";
import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { fetchWithTimeout } from "@/utils/network";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { resolveBirthMoment } from "@/utils/birthTime";
import {
  buildExplanationCards,
  buildSkyStory
} from "@/features/birthsky/birthSkyExplanations";
import {
  BirthSkyShareCard,
  REPORT_PAGES,
  REPORT_PAGE_COUNT,
  QUICK_WIDTH_PX,
  QUICK_HEIGHT_PX,
  BASE_WIDTH,
  CAPTURE_SCALE,
  type ReportPage
} from "@/features/birthsky/BirthSkyShareCard";
import {
  buildInterpretationGroups,
  buildPersonalityPortrait,
  ASTROLOGY_DISCLOSURE,
  FRAME_DIFFERENCE_NOTE
} from "@/features/birthsky/astrologyInterpretation";

// Thrown by findBirthplace when a geocoded place has no IANA time zone — we must NOT guess
// UTC (that silently produces a wrong chart), so generate() catches this and asks the user
// to refine the birthplace instead.
const NO_TIMEZONE = "BIRTHPLACE_NO_TIMEZONE";

// User-facing, jargon-free recovery copy. We never quietly compute a chart from a time zone we
// couldn't confirm, or from a birth time that DST made impossible or ambiguous.
const TIMEZONE_ERROR_COPY =
  "We found that place but couldn't confirm its time zone, which we need for an accurate chart. Please try a more specific birthplace — for example, the city with its state or country.";
const DST_GAP_COPY =
  "That birth time didn't occur on that date — clocks sprang forward for daylight saving time, skipping that hour. Please double-check the recorded birth time.";
const DST_OVERLAP_COPY =
  "That birth time happened twice on that date — clocks fell back for daylight saving time, so it occurred once before the change and once after. Please double-check the exact recorded time before we cast the chart.";

interface Props {
  onClose: () => void;
}

type GeocodingResult = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone?: string;
};

type SavedBirthplace = {
  query: string;
  displayName: string;
  timezone: string;
  location: ObserverLocation;
};

type ParsedBirthTime = {
  localTime24: string;
  exact: boolean;
  display: string;
};

const BIRTHPLACE_STORAGE_KEY = "auralunis.birthplace";
const BIRTH_DATE_LOCAL_STORAGE_KEY = "auralunis.birthdate.local";
const BIRTH_TIME_LOCAL_STORAGE_KEY = "auralunis.birthtime.local";

const US_STATE_NAMES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland",
  MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey",
  NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina",
  SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming",
  DC: "district of columbia"
};

const PLANET_COLORS: Record<string, string> = {
  Mercury: "#C0C6D4",
  Venus: "#FFF6D6",
  Mars: "#E8836A",
  Jupiter: "#F5D08E",
  Saturn: "#E8D5A0",
  Uranus: "#8FD4D8",
  Neptune: "#6A8CE8"
};

const PLANET_BIRTH_MEANINGS: Record<string, string> = {
  Mercury: "The messenger crossed your sky — a mind built for connection and quick thinking.",
  Venus: "The evening star was shining — beauty, harmony, and love marked your arrival.",
  Mars: "The red planet burned bright — energy, courage, and drive were written in your sky.",
  Jupiter: "The king of planets stood high — expansion, luck, and abundance welcomed you.",
  Saturn: "The ringed guardian kept watch — discipline, patience, and lasting structure shaped your moment.",
  Uranus: "The ice giant was present — originality and sudden inspiration colored your birth.",
  Neptune: "The dream planet drifted above — imagination and intuition flowed through your sky."
};

const CONSTELLATION_MEANINGS: Record<string, string> = {
  Pegasus: "the winged horse, carrying dreamers beyond the horizon",
  Orion: "the great hunter, bold and unmistakable in the winter sky",
  Leo: "the lion, radiating confidence and warmth",
  Scorpius: "the scorpion, intense and transformative",
  Sagittarius: "the archer, always aiming toward something greater",
  Gemini: "the twins, bridging dualities with wit and curiosity",
  Virgo: "the maiden, grounded in precision and quiet strength",
  Aquarius: "the water bearer, pouring out ideas ahead of their time",
  Taurus: "the bull, steady and resolute under the stars",
  Cancer: "the crab, protective and deeply intuitive",
  Libra: "the scales, seeking harmony in all things",
  Pisces: "the fish, swimming between reality and imagination",
  Aries: "the ram, charging forward with unstoppable fire",
  Capricornus: "the sea-goat, climbing steadily toward the summit",
  "Ursa Major": "the great bear, a guardian circling the pole",
  "Ursa Minor": "the little bear, keeper of the constant North",
  Cassiopeia: "the queen, enthroned in the northern sky",
  Cygnus: "the swan, soaring along the river of the Milky Way",
  Lyra: "the lyre, singing the music of the spheres",
  Andromeda: "the chained princess, set forever among the stars",
  Perseus: "the hero, holding aloft the head of Medusa"
};

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function azToDir(azimuth: number): string {
  const directions = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return directions[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}

function extractSeason(profile: BirthSkyProfile): string {
  const seasonal = (profile.seasonalSky || "").toLowerCase();
  for (const word of ["autumn", "fall", "winter", "spring", "summer"]) {
    if (seasonal.includes(word)) return word === "fall" ? "autumn" : word;
  }
  const month = new Date(profile.birthDate).getUTCMonth() + 1;
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

function generateSkyStory(profile: BirthSkyProfile): string {
  const season = extractSeason(profile);
  const visible = profile.planets.filter((planet) => planet.visible);
  const moonPhrase = profile.moonIllumination > 70
    ? "beneath bright moonlight"
    : profile.moonIllumination < 20
      ? "beneath a dark, starlit sky"
      : `with a ${profile.moonPhase.toLowerCase()} overhead`;

  const planetPhrase = visible.length === 0
    ? "the stars held the stage"
    : visible.length <= 2
      ? `${visible[0].name} stood watch in the ${azToDir(visible[0].azimuth)}`
      : `${visible[0].name}, ${visible[1].name}, and ${visible[2].name} welcomed you`;

  const meaning = CONSTELLATION_MEANINGS[profile.dominantConstellation] ?? "an ancient pattern etched in starlight";
  const rarePhrase = visible.length >= 3 ? ` An uncommon ${visible.length}-planet sky, full of possibility.` : "";
  return `You arrived beneath ${article(season)} ${season} sky, ${moonPhrase}. ${planetPhrase}, while ${profile.dominantConstellation} carried the night overhead — ${meaning}.${rarePhrase}`;
}

function normalizeQualifier(value: string): string {
  const cleaned = value.trim().toUpperCase();
  return US_STATE_NAMES[cleaned] ?? value.trim().toLowerCase();
}

function buildPlaceName(place: GeocodingResult): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}

function scorePlace(place: GeocodingResult, qualifiers: string[]): number {
  if (qualifiers.length === 0) return 0;
  const haystack = `${place.admin1 ?? ""} ${place.country ?? ""}`.toLowerCase();
  return qualifiers.reduce((score, qualifier) => score + (haystack.includes(normalizeQualifier(qualifier)) ? 1 : 0), 0);
}

async function findBirthplace(query: string): Promise<SavedBirthplace> {
  const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts[0] || query.trim();
  const qualifiers = parts.slice(1);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error("Birthplace search failed");

  const payload = (await response.json()) as { results?: GeocodingResult[] };
  const results = payload.results ?? [];
  if (results.length === 0) throw new Error("Birthplace not found");

  const place = [...results].sort((a, b) => scorePlace(b, qualifiers) - scorePlace(a, qualifiers))[0];
  // A birth chart is only correct if we know the birthplace's real time zone. If geocoding
  // didn't return one, stop rather than silently assuming UTC (which yields a wrong chart).
  if (!place.timezone) throw new Error(NO_TIMEZONE);
  return {
    query,
    displayName: buildPlaceName(place),
    timezone: place.timezone,
    location: {
      latitudeDegrees: place.latitude,
      longitudeDegrees: place.longitude,
      altitudeMeters: place.elevation
    }
  };
}

function parseBirthTime(input: string): ParsedBirthTime | null {
  const trimmed = input.trim();
  if (!trimmed) return { localTime24: "12:00", exact: false, display: "" };

  const meridiemMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? "0");
    const meridiem = meridiemMatch[3].toLowerCase();
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem === "a" && hour === 12) hour = 0;
    if (meridiem === "p" && hour !== 12) hour += 12;
    const localTime24 = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { localTime24, exact: true, display: trimmed.toUpperCase().replace(/\./g, "") };
  }

  const twentyFourHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHourMatch) return null;
  const hour = Number(twentyFourHourMatch[1]);
  const minute = Number(twentyFourHourMatch[2]);
  if (hour > 23 || minute > 59) return null;
  const localTime24 = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { localTime24, exact: true, display: localTime24 };
}


/** Sidereal hours → "02h 39m". Sidereal time is what decides which sky faces you. */
function formatSiderealTime(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const carry = m === 60;
  return `${String(carry ? h + 1 : h).padStart(2, "0")}h ${String(carry ? 0 : m).padStart(2, "0")}m`;
}

/** Plain-language reading of where a planet sat in its arc across the sky. */
const PLANET_STATUS_WORDS: Record<string, string> = {
  rising: "climbing in the east",
  culminating: "at its highest",
  setting: "sinking toward the west",
  below: "below the horizon",
};


/**
 * One collapsible explanation. Collapsed by default so the report reads as a scannable list
 * rather than a wall of text; the summary line carries the user's own value so the collapsed
 * state is still informative.
 */
function ExplainCard({ title, summary, body }: { title: string; summary: string; body: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      style={styles.explainCard}
      onPress={() => { tapLight(); setOpen((v) => !v); }}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}. ${summary}`}
    >
      <View style={styles.explainHeader}>
        <View style={styles.explainHeaderText}>
          <Text style={styles.explainTitle}>{title}</Text>
          <Text style={styles.explainSummary}>{summary}</Text>
        </View>
        <Text style={styles.explainChevron}>{open ? "−" : "+"}</Text>
      </View>
      {open && body.map((paragraph, i) => (
        <Text key={i} style={styles.explainBody}>{paragraph}</Text>
      ))}
    </Pressable>
  );
}

export function BirthSkyScreen({ onClose }: Props) {
  const { isPremium } = useEntitlement();
  const { openPaywall } = usePaywallNavigation();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [birthplaceQuery, setBirthplaceQuery] = useState("");
  const [resolvedBirthplace, setResolvedBirthplace] = useState<SavedBirthplace | null>(null);
  const [profile, setProfile] = useState<BirthSkyProfile | null>(null);
  const [exactTimeUsed, setExactTimeUsed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Export hosts. Rendered off-screen so the captured artwork never contains interactive UI.
  const quickRef = useRef<View>(null);
  const reportRefs = useRef<Record<string, View | null>>({});
  const [reportHeights, setReportHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(BIRTHDAY_STORAGE_KEY),
      AsyncStorage.getItem(BIRTH_DATE_LOCAL_STORAGE_KEY),
      AsyncStorage.getItem(BIRTH_TIME_LOCAL_STORAGE_KEY),
      AsyncStorage.getItem(BIRTHPLACE_STORAGE_KEY)
    ]).then(([iso, localDate, localTime, savedPlace]) => {
      if (!active) return;
      if (localDate) setDate(localDate);
      else if (iso) setDate(iso.slice(0, 10));
      if (localTime) setTime(localTime);
      if (savedPlace) {
        try {
          const parsed = JSON.parse(savedPlace) as SavedBirthplace;
          setBirthplaceQuery(parsed.displayName || parsed.query);
          setResolvedBirthplace(parsed);
        } catch {
          /* Ignore malformed local data. */
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function generate() {
    tapLight();
    setError(null);
    setProfile(null);

    const trimmedDate = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      setError("Enter your birth date as YYYY-MM-DD (for example, 1990-06-21).");
      return;
    }

    const trimmedPlace = birthplaceQuery.trim();
    if (trimmedPlace.length < 2) {
      setError("Enter the city or town where you were born.");
      return;
    }

    const parsedTime = parseBirthTime(time);
    if (!parsedTime) {
      setError("Enter a valid birth time such as 1:35 PM or 13:35, or leave it blank if unknown.");
      return;
    }

    setIsGenerating(true);
    try {
      const savedPlace = resolvedBirthplace && resolvedBirthplace.query.toLowerCase() === trimmedPlace.toLowerCase()
        ? resolvedBirthplace
        : await findBirthplace(trimmedPlace);
      const resolved = resolveBirthMoment(trimmedDate, parsedTime.localTime24, savedPlace.timezone);
      // Recoverable DST/timezone edges — explain, preserve entered data, never guess a chart.
      if (resolved.kind === "nonexistent-local-time") { setError(DST_GAP_COPY); return; }
      if (resolved.kind === "ambiguous-local-time") { setError(DST_OVERLAP_COPY); return; }
      if (resolved.kind === "invalid-time-zone") { setError(TIMEZONE_ERROR_COPY); return; }
      const birthMoment = resolved.utc;
      const nextProfile = computeBirthSky(birthMoment.toISOString(), savedPlace.location, savedPlace.displayName);

      setResolvedBirthplace(savedPlace);
      setBirthplaceQuery(savedPlace.displayName);
      setTime(parsedTime.display);
      setExactTimeUsed(parsedTime.exact);
      setProfile(nextProfile);

      await Promise.all([
        AsyncStorage.setItem(BIRTHDAY_STORAGE_KEY, birthMoment.toISOString()),
        AsyncStorage.setItem(BIRTH_DATE_LOCAL_STORAGE_KEY, trimmedDate),
        parsedTime.exact
          ? AsyncStorage.setItem(BIRTH_TIME_LOCAL_STORAGE_KEY, parsedTime.display)
          : AsyncStorage.removeItem(BIRTH_TIME_LOCAL_STORAGE_KEY),
        AsyncStorage.setItem(BIRTHPLACE_STORAGE_KEY, JSON.stringify(savedPlace))
      ]);
    } catch (e) {
      if (e instanceof Error && e.message === NO_TIMEZONE) {
        // Recoverable: entered date/time/place are preserved so the user can just refine the place.
        setError(TIMEZONE_ERROR_COPY);
      } else {
        setError("We couldn't find that birthplace. Try entering the city and state or country, such as Austell, Georgia.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  /**
   * Quick card — one social-ratio image. Captured from the dedicated off-screen component at an
   * explicit 1080×1350, never from the live card (which would include the share button itself
   * and the interpretation cards in their collapsed, contentless state).
   */
  async function shareQuickCard() {
    if (!profile) return;
    tapLight();
    try {
      // captureRef's width/height are POINTS, which it then multiplies by the device pixel
      // ratio. Passing pixels directly produced a 3240×4050 image on a 3× screen — 9× the
      // intended bitmap. Dividing by the ratio pins the output at exactly 1080×1350 on any
      // device, which also keeps the in-memory bitmap at ~5.8MB instead of ~52MB.
      const scale = PixelRatio.get();
      const uri = await captureRef(quickRef, {
        format: "png", quality: 1,
        width: QUICK_WIDTH_PX / scale, height: QUICK_HEIGHT_PX / scale,
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "image/png" });
      else await Share.share({ url: uri });
    } catch {
      /* User cancelled or capture failed. */
    }
  }

  /**
   * Full report — captured one page at a time. A single 1080-wide report runs many thousands of
   * pixels tall and the bitmap can exhaust memory on older hardware, so it is split by SECTION:
   * each page is bounded, and no section is ever cut in half. Pages are saved to Photos rather
   * than pushed through four consecutive share sheets.
   */
  async function shareFullReport() {
    if (!profile) return;
    tapLight();
    try {
      // Each page is captured in its OWN try/catch. A single shared catch meant one failing
      // page aborted the whole loop, and the report silently came out partial — two pages
      // instead of the promised set, with no error surfaced.
      const uris: string[] = [];
      const failed: string[] = [];
      for (const page of REPORT_PAGES) {
        const ref = reportRefs.current[page];
        if (!ref) { failed.push(page); continue; }
        try {
          uris.push(await captureRef(ref, {
            format: "png", quality: 1, width: (BASE_WIDTH * CAPTURE_SCALE) / PixelRatio.get(),
          }));
        } catch {
          failed.push(page);
        }
      }
      if (uris.length === 0) return;

      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        for (const uri of uris) await MediaLibrary.saveToLibraryAsync(uri);
        // Say plainly if any page could not be produced, rather than implying a full report.
        Alert.alert(
          failed.length ? "Report partly saved" : "Report saved",
          failed.length
            ? `${uris.length} of ${REPORT_PAGE_COUNT} pages saved to your Photos. ${failed.length} page${failed.length === 1 ? "" : "s"} could not be generated.`
            : `All ${uris.length} pages saved to your Photos.`
        );
        return;
      }
      // Without photo access, fall back to sharing the first page rather than failing silently.
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uris[0], { mimeType: "image/png" });
    } catch {
      /* User cancelled or capture failed. */
    }
  }

  const visiblePlanets = profile ? profile.planets.filter((planet) => planet.visible) : [];
  const rare = visiblePlanets.length >= 3;

  // Screen-level entitlement guard (defense-in-depth): Birth Sky is an ENTIRELY premium feature.
  // A non-entitled user must never reach the input form, generate a chart, or see chart results,
  // narratives, planet details, or sharing — even if this screen is opened through some other
  // path. Render a premium preview/gate instead; "Unlock Premium" opens the existing paywall.
  if (!isPremium) {
    return (
      <ScreenShell title="Your Birth Sky" subtitle="Birth Sky" background={<Starfield />}>
        <Pressable style={styles.backBtn} onPress={() => { tapLight(); onClose(); }} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>◈</Text>
          <Text style={styles.gateTitle}>Birth Sky</Text>
          <Text style={styles.gateBadge}>PREMIUM FEATURE</Text>
          <Text style={styles.gateDesc}>
            Recreate the exact sky over your birthplace the moment you were born — your Sun and
            rising signs, the planets above your horizon, the moon phase, and a personal cosmic
            reading you can save and share.
          </Text>
          <Pressable style={styles.unlockBtn} onPress={() => { tapLight(); openPaywall(); }}>
            <Text style={styles.unlockText}>✦ Unlock Premium</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Your Birth Sky" subtitle="Birth Sky" background={<Starfield />}>
      <Pressable style={styles.backBtn} onPress={() => { tapLight(); onClose(); }} hitSlop={12}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <Text style={styles.intro}>
        Enter your birth date, local birth time, and birthplace to recreate the sky over the place where you arrived.
      </Text>

      <View style={styles.form}>
        <Text style={styles.label}>BIRTH DATE</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={AuraLunisColors.faint}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
        />

        <Text style={styles.label}>BIRTH TIME (optional)</Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder="1:35 PM or 13:35 — blank if unknown"
          placeholderTextColor={AuraLunisColors.faint}
          keyboardType="default"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Text style={styles.fieldNote}>Use the local time shown on your birth record. Unknown times use noon and make horizon details approximate.</Text>

        <Text style={styles.label}>BIRTHPLACE</Text>
        <TextInput
          style={styles.input}
          value={birthplaceQuery}
          onChangeText={(value) => {
            setBirthplaceQuery(value);
            setResolvedBirthplace(null);
          }}
          placeholder="City, state or country"
          placeholderTextColor={AuraLunisColors.faint}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={generate}
        />
        <Text style={styles.fieldNote}>Your birthplace sets the correct horizon, visible planets, and chart orientation.</Text>

        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
          onPress={generate}
          disabled={isGenerating}
        >
          <Text style={styles.generateText}>{isGenerating ? "Finding Your Birth Sky…" : "Generate My Birth Sky"}</Text>
        </Pressable>
      </View>

      {profile && (
        <>
        <View style={styles.resultCard}>
          {/* Tropical placement table.
              This replaced the circular star chart. The circle looked impressive but conveyed
              almost nothing a reader could act on — clustered planets, labels fighting for
              space, and no way to read an actual position off it. A table gives the values the
              rest of this screen then interprets.

              TROPICAL ONLY. Every figure here comes from geocentric ecliptic longitude, never
              from IAU constellation membership — those are different frames and usually
              disagree (see tropicalZodiac.ts). The astronomy constellation lives in its own
              section further down. */}
          <View style={styles.placementCard}>
            <Text style={styles.placementTitle}>YOUR TROPICAL PLACEMENTS</Text>
            <Text style={styles.placementSub}>
              Positions along the ecliptic at your birth moment, in the twelve equal signs of the
              tropical zodiac.
            </Text>
            {ZODIAC_BODIES.filter((body) => profile.zodiacLongitudes[body] !== undefined).map((body) => {
              const position = signPositionFromLongitude(profile.zodiacLongitudes[body]);
              return (
                <View key={body} style={styles.placementRow}>
                  <Text style={styles.placementBody}>{body}</Text>
                  <Text style={styles.placementSign}>{position.sign}</Text>
                  <Text style={styles.placementDegree}>{position.display}</Text>
                </View>
              );
            })}
            <View style={styles.placementRowAccent}>
              <Text style={styles.placementBodyAccent}>Rising</Text>
              <Text style={styles.placementSignAccent}>{profile.risingSign}</Text>
              <Text style={styles.placementDegreeAccent}>
                {signPositionFromLongitude(profile.risingLongitude).display}
              </Text>
            </View>
            {!exactTimeUsed && (
              <Text style={styles.placementNote}>
                Birth time was not entered, so the Rising degree is based on local noon and is
                approximate. Every other placement is unaffected.
              </Text>
            )}
          </View>

          {rare && (
            <View style={styles.rarityBadge}>
              <Text style={styles.rarityText}>✦ Rare: {visiblePlanets.length} planets above the horizon at your birth</Text>
            </View>
          )}

          {isPremium ? (
            <Text style={styles.skyStory}>“{generateSkyStory(profile)}”</Text>
          ) : (
            <Text style={styles.signature}>“{profile.cosmicSignature}”</Text>
          )}

          <View style={styles.divider} />
          <Row label="Birthplace" value={profile.locationName} />
          <Row label="Sun sign" value={profile.sunSign} />
          <Row label="Moon phase" value={`${profile.moonPhase} · ${profile.moonIllumination}%`} />
          <Row label={exactTimeUsed ? "Eastern sky" : "Approx. eastern sky"} value={profile.risingSign} />
          <Row label="Moon was in" value={profile.dominantConstellation} />
          <Row label="Sky at that hour" value={`${profile.lightState} · Sun ${profile.sunAltitude > 0 ? "+" : ""}${profile.sunAltitude}°`} />
          <Row label="Season there" value={profile.seasonalSky} />
          <Row label="Local sidereal time" value={formatSiderealTime(profile.localSiderealTimeHours)} />
          <Row label="Planets up" value={`${visiblePlanets.length} of ${profile.planets.length}${visiblePlanets.length ? ` — ${visiblePlanets.map((planet) => planet.name).join(", ")}` : " above the horizon"}`} />
          {!exactTimeUsed && (
            <Text style={styles.approximationNote}>Birth time was not entered, so horizon-based details use local noon and are approximate.</Text>
          )}

          {isPremium && (
            <>
              <View style={styles.divider} />
              <Text style={styles.planetsHeader}>YOUR BIRTH SKY EXPLAINED</Text>
              <Text style={styles.explainIntro}>
                Every line below is built from the values computed for your birth moment. Tap any card to read more.
              </Text>
              {buildExplanationCards(profile, exactTimeUsed).map((card) => (
                <ExplainCard key={card.id} title={card.title} summary={card.summary} body={card.body} />
              ))}

              <View style={styles.divider} />
              <Text style={styles.planetsHeader}>YOUR SKY STORY</Text>
              {buildSkyStory(profile, exactTimeUsed).map((paragraph, i) => (
                <Text key={i} style={styles.storyParagraph}>{paragraph}</Text>
              ))}

              <View style={styles.divider} />
              <Text style={styles.symbolicHeader}>YOUR ASTROLOGICAL INTERPRETATION</Text>
              <Text style={styles.symbolicCaveat}>{ASTROLOGY_DISCLOSURE}</Text>
              {buildInterpretationGroups(profile.zodiacPlacements, profile.risingSign).map((group) => (
                <View key={group.heading}>
                  <Text style={styles.groupHeading}>{group.heading}</Text>
                  {group.readings.map((reading) => (
                    <ExplainCard key={reading.id} title={reading.title} summary={reading.subtitle} body={reading.body} />
                  ))}
                </View>
              ))}

              <Text style={styles.groupHeading}>WHY THE TWO DIFFER</Text>
              <Text style={styles.symbolicNote}>{FRAME_DIFFERENCE_NOTE}</Text>
              {profile.planets.filter((p) => p.constellation && p.zodiacSign && p.constellation !== p.zodiacSign).slice(0, 2).map((p) => (
                <Text key={p.name} style={styles.contrastNote}>
                  {`${p.name} — astronomy: physically in front of ${p.constellation}. Astrology: tropical sign ${p.zodiacSign}.`}
                </Text>
              ))}

              <View style={styles.divider} />
              <Text style={styles.symbolicHeader}>YOUR PERSONALITY PORTRAIT</Text>
              {buildPersonalityPortrait(profile.zodiacPlacements, profile.risingSign, exactTimeUsed).map((paragraph, i) => (
                <Text key={i} style={styles.symbolicNote}>{paragraph}</Text>
              ))}
            </>
          )}

          {isPremium && visiblePlanets.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.planetsHeader}>PLANETS IN YOUR SKY</Text>
              {visiblePlanets.map((planet) => (
                <View key={planet.name} style={styles.planetCard}>
                  <View style={[styles.planetDot, { backgroundColor: PLANET_COLORS[planet.name] ?? AuraLunisColors.gold }]} />
                  <View style={styles.planetTextWrap}>
                    <Text style={styles.planetName}>{planet.name}</Text>
                    <Text style={styles.planetDesc}>
                      {PLANET_BIRTH_MEANINGS[planet.name] ?? `${planet.name} was above the horizon.`}
                    </Text>
                    <Text style={styles.planetFact}>
                      {[
                        planet.constellation ? `In ${planet.constellation}` : null,
                        `${planet.altitude}° above the horizon`,
                        PLANET_STATUS_WORDS[planet.status]
                      ].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {isPremium ? (
            <>
              <Pressable style={styles.shareBtn} onPress={shareQuickCard}>
                <Text style={styles.shareText}>Share Quick Card ✦</Text>
              </Pressable>
              <Pressable style={styles.shareBtnSecondary} onPress={shareFullReport}>
                <Text style={styles.shareTextSecondary}>Share Full Report · {REPORT_PAGE_COUNT} pages</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.unlockBtn} onPress={() => { tapLight(); openPaywall(); }}>
              <Text style={styles.unlockText}>✦ Unlock Your Full Birth Certificate</Text>
            </Pressable>
          )}

          <Text style={styles.watermark}>✦ AuraLunis</Text>
        </View>

        {/* Off-screen export hosts. These are what captureRef reads — never the live card. */}
        <View style={styles.exportHost} pointerEvents="none" collapsable={false}>
          <View ref={quickRef} collapsable={false}>
            <BirthSkyShareCard profile={profile} exactTimeUsed={exactTimeUsed} variant="quick" />
          </View>
          {REPORT_PAGES.map((page) => (
            <View
              key={page}
              ref={(node) => { reportRefs.current[page] = node; }}
              collapsable={false}
              onLayout={(e) => {
                // Measured so the report's real pixel height (and therefore its bitmap cost)
                // is a known quantity rather than an assumption.
                const h = Math.round(e.nativeEvent.layout.height);
                setReportHeights((prev) => (prev[page] === h ? prev : { ...prev, [page]: h }));
              }}
            >
              <BirthSkyShareCard profile={profile} exactTimeUsed={exactTimeUsed} variant="report" page={page as ReportPage} />
            </View>
          ))}
        </View>
        </>
      )}
    </ScreenShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { marginBottom: 10 },
  backText: { color: AuraLunisColors.gold, fontSize: 14, fontWeight: "700" },
  intro: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  form: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 18
  },
  label: { color: AuraLunisColors.gold, fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6, marginTop: 12 },
  input: {
    borderRadius: 12, padding: 12, color: "#FFF", backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1, borderColor: AuraLunisColors.borderSubtle, fontSize: 15
  },
  fieldNote: { color: AuraLunisColors.faint, fontSize: 10.5, lineHeight: 15, marginTop: 6 },
  error: { color: "#FF9166", fontSize: 12, lineHeight: 18, marginTop: 12 },
  generateBtn: {
    marginTop: 18, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    backgroundColor: AuraLunisColors.gold
  },
  generateBtnDisabled: { opacity: 0.65 },
  generateText: { color: AuraLunisColors.cosmicBlack, fontWeight: "900", fontSize: 14 },
  resultCard: {
    backgroundColor: "rgba(217,168,78,0.07)", borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: "rgba(217,168,78,0.22)", marginBottom: 28
  },
  chartWrap: { alignItems: "center", marginBottom: 16 },
  chartCaption: { color: AuraLunisColors.faint, fontSize: 11, fontStyle: "italic", marginTop: 10, textAlign: "center" },
  signature: { color: AuraLunisColors.gold2, fontSize: 17, lineHeight: 25, fontWeight: "800", fontStyle: "italic" },
  rarityBadge: {
    alignSelf: "center", marginTop: 14,
    backgroundColor: "rgba(217,168,78,0.15)", borderWidth: 1, borderColor: "rgba(217,168,78,0.3)",
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6
  },
  rarityText: { color: AuraLunisColors.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase", textAlign: "center" },
  skyStory: { color: AuraLunisColors.gold2, fontSize: 14, lineHeight: 22, fontStyle: "italic", marginTop: 14 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, gap: 12 },
  rowLabel: { color: AuraLunisColors.muted, fontSize: 13 },
  rowValue: { color: "#FFF", fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  approximationNote: { color: AuraLunisColors.faint, fontSize: 10.5, lineHeight: 15, marginTop: 10, fontStyle: "italic" },
  planetsHeader: { color: AuraLunisColors.gold, fontSize: 9, letterSpacing: 2, fontWeight: "900", marginTop: 16, marginBottom: 10 },
  planetCard: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 7,
    flexDirection: "row", alignItems: "center", gap: 12
  },
  planetDot: { width: 12, height: 12, borderRadius: 6 },
  planetTextWrap: { flex: 1 },
  planetName: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  placementCard: {
    backgroundColor: "rgba(255,255,255,0.035)", borderRadius: 18, borderWidth: 1,
    borderColor: "rgba(217,168,78,0.22)", padding: 16, marginBottom: 4
  },
  placementTitle: { color: AuraLunisColors.gold2, fontSize: 11, letterSpacing: 2, fontWeight: "900" },
  placementSub: { color: AuraLunisColors.faint, fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 10 },
  placementRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: "rgba(217,168,78,0.12)"
  },
  // The ascendant is not a body, so it gets its own emphasis and a heavier rule above it.
  placementRowAccent: {
    flexDirection: "row", alignItems: "center", paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: "rgba(217,168,78,0.4)", marginTop: 2
  },
  placementBody: { flex: 1.1, color: "#FFF", fontSize: 14, fontWeight: "800" },
  placementSign: { flex: 1.3, color: AuraLunisColors.silver, fontSize: 14 },
  // Tabular alignment: degrees right-align so the column reads as a column.
  placementDegree: { color: AuraLunisColors.gold2, fontSize: 14, fontVariant: ["tabular-nums"], textAlign: "right", minWidth: 66 },
  placementBodyAccent: { flex: 1.1, color: AuraLunisColors.gold, fontSize: 14, fontWeight: "900" },
  placementSignAccent: { flex: 1.3, color: "#FFF", fontSize: 14, fontWeight: "700" },
  placementDegreeAccent: { color: AuraLunisColors.gold, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right", minWidth: 66 },
  placementNote: { color: AuraLunisColors.faint, fontSize: 10, lineHeight: 15, marginTop: 10 },
  explainCard: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 14, marginBottom: 8 },
  explainHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  explainHeaderText: { flex: 1 },
  explainTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  explainSummary: { color: AuraLunisColors.gold2, fontSize: 11, marginTop: 2 },
  explainChevron: { color: AuraLunisColors.gold2, fontSize: 20, fontWeight: "700", width: 18, textAlign: "center" },
  explainBody: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 19, marginTop: 10 },
  explainIntro: { color: AuraLunisColors.faint, fontSize: 11, lineHeight: 17, marginBottom: 10 },
  storyParagraph: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 21, marginBottom: 10 },
  // Symbolic content is visually separated from the measured sections on purpose.
  symbolicHeader: { color: AuraLunisColors.faint, fontSize: 11, letterSpacing: 2, fontWeight: "900", marginBottom: 4 },
  symbolicCaveat: { color: AuraLunisColors.faint, fontSize: 11, lineHeight: 17, fontStyle: "italic", marginBottom: 10 },
  groupHeading: { color: AuraLunisColors.gold2, fontSize: 10, letterSpacing: 2, fontWeight: "900", marginTop: 14, marginBottom: 8 },
  contrastNote: { color: AuraLunisColors.silver, fontSize: 11, lineHeight: 17, marginBottom: 6 },
  symbolicNote: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 19, marginBottom: 8 },
  planetFact: { color: AuraLunisColors.gold2, fontSize: 11, marginTop: 3 },
  planetDesc: { color: AuraLunisColors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  // Off-screen export hosts: laid out for capture, positioned far outside the viewport so they
  // are never visible and never intercept touches.
  exportHost: { position: "absolute", left: -10000, top: 0, opacity: 0 },
  shareBtnSecondary: {
    borderWidth: 1, borderColor: AuraLunisColors.borderGold, borderRadius: 14,
    paddingVertical: 12, alignItems: "center", marginTop: 8
  },
  shareTextSecondary: { color: AuraLunisColors.gold2, fontSize: 13, fontWeight: "700" },
  shareBtn: {
    marginTop: 18, borderRadius: 14, paddingVertical: 13, alignItems: "center",
    borderWidth: 1, borderColor: AuraLunisColors.gold
  },
  shareText: { color: AuraLunisColors.gold2, fontWeight: "900", fontSize: 14 },
  unlockBtn: {
    marginTop: 18, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    backgroundColor: AuraLunisColors.gold
  },
  unlockText: { color: AuraLunisColors.cosmicBlack, fontWeight: "900", fontSize: 14 },
  gateCard: { marginTop: 24, backgroundColor: "rgba(7,18,37,0.7)", borderRadius: 20, borderWidth: 1, borderColor: AuraLunisColors.gold, padding: 24, alignItems: "center" },
  gateIcon: { fontSize: 32, color: AuraLunisColors.gold, marginBottom: 10 },
  gateTitle: { color: AuraLunisColors.gold2, fontSize: 22, fontWeight: "900", textAlign: "center" },
  gateBadge: { color: AuraLunisColors.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase", marginTop: 4, marginBottom: 12 },
  gateDesc: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 20 },
  watermark: { position: "absolute", bottom: 8, right: 12, fontSize: 8, color: AuraLunisColors.gold, opacity: 0.5 }
});
