// BirthSkyScreen.tsx
// Personal birth-sky certificate using birth date, local birth time, and birthplace.

import React, { useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from "react-native-view-shot";
import { ScreenShell } from "@/components/ScreenShell";
import { Starfield } from "@/components/Starfield";
import { BirthSkyCanvas } from "@/components/BirthSkyCanvas";
import { AuraLunisColors } from "@/theme/tokens";
import { tapLight } from "@/services/HapticService";
import { computeBirthSky, BIRTHDAY_STORAGE_KEY, type BirthSkyProfile } from "@/services/BirthSkyService";
import type { ObserverLocation } from "@/features/sky-lens/accuracy/SkyLensAccuracyTypes";
import { fetchWithTimeout } from "@/utils/network";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { resolveBirthMoment } from "@/utils/birthTime";

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
  const cardRef = useRef<View>(null);

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

  async function shareBirthSky() {
    if (!profile) return;
    tapLight();
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      await Share.share({ url: uri });
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
        <View ref={cardRef} collapsable={false} style={styles.resultCard}>
          <View style={styles.chartWrap}>
            <BirthSkyCanvas
              birthDate={new Date(profile.birthDate)}
              location={profile.location}
              size={272}
              dominantConstellation={profile.dominantConstellation}
              season={extractSeason(profile)}
            />
            <Text style={styles.chartCaption}>The sky over {profile.locationName} when you were born</Text>
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
          <Row label="Dominant" value={profile.dominantConstellation} />
          <Row label="Seasonal sky" value={profile.seasonalSky} />
          <Row label="Planets up" value={visiblePlanets.map((planet) => planet.name).join(", ") || "None above horizon"} />
          {!exactTimeUsed && (
            <Text style={styles.approximationNote}>Birth time was not entered, so horizon-based details use local noon and are approximate.</Text>
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
                      {PLANET_BIRTH_MEANINGS[planet.name] ?? `${planet.name} was above the horizon in ${planet.constellation}.`}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {isPremium ? (
            <Pressable style={styles.shareBtn} onPress={shareBirthSky}>
              <Text style={styles.shareText}>Share Birth Sky ✦</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.unlockBtn} onPress={() => { tapLight(); openPaywall(); }}>
              <Text style={styles.unlockText}>✦ Unlock Your Full Birth Certificate</Text>
            </Pressable>
          )}

          <Text style={styles.watermark}>✦ AuraLunis</Text>
        </View>
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
  planetDesc: { color: AuraLunisColors.muted, fontSize: 11.5, lineHeight: 16, marginTop: 1 },
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
