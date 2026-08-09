// BirthSkyShareCard.tsx — the exported Birth Sky artwork.
//
// WHY THIS EXISTS AS ITS OWN COMPONENT
// -----------------------------------
// Sharing used to call captureRef on the LIVE on-screen card. That silently exported whatever
// the screen happened to be rendering: the interpretation cards in their COLLAPSED state (11
// rows of title plus a "+" affordance, with none of the actual reading), the "Share Birth Sky"
// button itself, and an arbitrary, ever-growing height. An export has to be a designed artifact,
// not a screenshot of interactive UI, so it gets its own component that renders neither state
// nor controls.
//
// SIZING. Everything lays out at BASE_WIDTH points and is captured at 3× by passing explicit
// pixel dimensions to captureRef. That keeps the off-screen view small in layout terms while the
// output is crisp, and it makes the quick card land on exactly 1080×1350 rather than whatever
// the content happened to measure.
//
// PAGINATION. The full report is split into fixed pages by SECTION, not by measured overflow.
// A single 1080-wide report runs many thousands of pixels tall, and a bitmap that size can
// exhaust memory. Splitting by section is deterministic, keeps each capture bounded, and —
// critically — never crops: a section is always wholly on one page.
//
// The interpretation pages are split FURTHER, into core (Big Three + personal planets) and
// outer (growth/structure + outer planets). All eleven readings on one page produced a bitmap
// tall enough that captureRef failed outright, which silently yielded a partial report.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";
import { ZODIAC_BODIES, signPositionFromLongitude } from "./tropicalZodiac";
import type { BirthSkyProfile } from "@/services/BirthSkyService";
import { buildExplanationCards, buildSkyStory } from "./birthSkyExplanations";
import {
  buildInterpretationGroups,
  buildPersonalityPortrait,
  ASTROLOGY_DISCLOSURE,
  FRAME_DIFFERENCE_NOTE,
} from "./astrologyInterpretation";

/** Layout width in points. Output pixels = BASE_WIDTH × CAPTURE_SCALE. */
export const BASE_WIDTH = 360;
export const CAPTURE_SCALE = 3;

/** Quick card is a fixed 4:5 — the ratio that survives social crops best. */
export const QUICK_WIDTH_PX = BASE_WIDTH * CAPTURE_SCALE; // 1080
export const QUICK_HEIGHT_PX = 1350;
const QUICK_HEIGHT_PT = QUICK_HEIGHT_PX / CAPTURE_SCALE; // 450

/** Report pages, in order. Each page holds whole sections only. */
export const REPORT_PAGES = ["chart", "astronomy", "readings-core", "readings-outer", "synthesis"] as const;
export type ReportPage = typeof REPORT_PAGES[number];
export const REPORT_PAGE_COUNT = REPORT_PAGES.length;

export type ShareVariant = "quick" | "report";

interface Props {
  profile: BirthSkyProfile;
  exactTimeUsed: boolean;
  variant: ShareVariant;
  /** Which page of the report to render. Ignored for the quick card. */
  page?: ReportPage;
}


/**
 * The tropical placement table, shared by both exports.
 *
 * This replaced the circular star chart in the exports for the same reason it was replaced on
 * screen: the circle looked impressive and told the reader nothing they could act on, while a
 * table gives the exact positions the interpretation sections then discuss. `compact` shrinks
 * the type for the quick card, where the whole artwork has to fit a fixed 4:5 frame.
 */
function PlacementTable({ profile, compact }: { profile: BirthSkyProfile; compact?: boolean }) {
  const rowStyle = compact ? styles.placeRowCompact : styles.placeRow;
  const textStyle = compact ? styles.placeTextCompact : styles.placeText;
  return (
    <View style={styles.placeTable}>
      {ZODIAC_BODIES.filter((body) => profile.zodiacLongitudes[body] !== undefined).map((body) => {
        const position = signPositionFromLongitude(profile.zodiacLongitudes[body]);
        return (
          <View key={body} style={rowStyle}>
            <Text style={[textStyle, styles.placeBody]}>{body}</Text>
            <Text style={[textStyle, styles.placeSign]}>{position.sign}</Text>
            <Text style={[textStyle, styles.placeDeg]}>{position.display}</Text>
          </View>
        );
      })}
      <View style={[rowStyle, styles.placeRowAccent]}>
        <Text style={[textStyle, styles.placeBodyAccent]}>Rising</Text>
        <Text style={[textStyle, styles.placeSignAccent]}>{profile.risingSign}</Text>
        <Text style={[textStyle, styles.placeDegAccent]}>
          {signPositionFromLongitude(profile.risingLongitude).display}
        </Text>
      </View>
    </View>
  );
}

function Brand({ note }: { note?: string }) {
  return (
    <View style={styles.brandRow}>
      <Text style={styles.brand}>✦ AuraLunis</Text>
      {note ? <Text style={styles.brandNote}>{note}</Text> : null}
    </View>
  );
}

/** The single disclosure line. Both variants carry it — an export travels without context. */
function Disclosure() {
  return (
    <Text style={styles.disclosure}>
      Astronomical positions calculated for your birth moment · Astrological interpretation based
      on traditional Western astrology
    </Text>
  );
}

export function BirthSkyShareCard({ profile, exactTimeUsed, variant, page = "chart" }: Props) {
  const birthDate = new Date(profile.birthDate);
  const dateLine = birthDate.toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
  const visible = profile.planets.filter((p) => p.visible);
  const portrait = buildPersonalityPortrait(profile.zodiacPlacements, profile.risingSign, exactTimeUsed);

  if (variant === "quick") {
    // Curated on purpose. Eleven three-paragraph readings on one image would be unreadable;
    // the quick card is the thing people actually post, so it carries only the headline values.
    const notable = visible.slice(0, 2).map((p) => `${p.name} ${p.altitude}° up`).join(" · ");
    return (
      <View style={[styles.page, { width: BASE_WIDTH, height: QUICK_HEIGHT_PT }]}>
        <Text style={styles.eyebrow}>AURALUNIS</Text>
        <Text style={styles.title}>Your Birth Sky</Text>
        <Text style={styles.subtitle}>
          {dateLine}{exactTimeUsed ? "" : " · time approximate"} · {profile.locationName}
        </Text>

        {/* The table carries Sun, Moon and Rising, so the separate "Big Three" strip and the
            highlights line were dropped — repeating the same three placements twice on a card
            this small wasted the space the table needs. */}
        <PlacementTable profile={profile} compact />

        <Text style={styles.quickLine}>
          {profile.moonPhase} · {profile.moonIllumination}% lit
          {notable ? ` · ${notable}` : ` · no planets above the horizon`}
        </Text>

        {portrait[0] ? <Text style={styles.quickPortrait} numberOfLines={4}>{portrait[0]}</Text> : null}

        <View style={styles.spacer} />
        <Disclosure />
        <Brand />
      </View>
    );
  }

  // ── Full report pages ───────────────────────────────────────────────────────
  const pageIndex = REPORT_PAGES.indexOf(page) + 1;
  const header = (
    <>
      <Text style={styles.eyebrow}>AURALUNIS · YOUR BIRTH SKY</Text>
      <Text style={styles.reportPageNo}>Report {pageIndex} of {REPORT_PAGE_COUNT}</Text>
    </>
  );

  if (page === "chart") {
    return (
      <View style={[styles.page, { width: BASE_WIDTH }]}>
        {header}
        <Text style={styles.title}>Your Birth Sky</Text>
        <Text style={styles.subtitle}>
          {dateLine}{exactTimeUsed ? "" : " · time approximate"} · {profile.locationName}
        </Text>
        <Text style={styles.sectionHead}>YOUR TROPICAL PLACEMENTS</Text>
        <PlacementTable profile={profile} />
        <Text style={styles.sectionHead}>THE SKY AT THAT MOMENT</Text>
        <Row label="Sun sign" value={profile.zodiacPlacements.Sun ?? profile.sunSign} />
        <Row label="Moon" value={`${profile.moonPhase} · ${profile.moonIllumination}% lit`} />
        <Row label="Moon was in" value={profile.dominantConstellation} />
        <Row label="Rising" value={profile.risingSign} />
        <Row label="Light" value={`${profile.lightState} · Sun ${profile.sunAltitude > 0 ? "+" : ""}${profile.sunAltitude}°`} />
        <Row label="Season" value={profile.seasonalSky} />
        <Row label="Planets up" value={`${visible.length} of ${profile.planets.length}`} />
        {buildSkyStory(profile, exactTimeUsed).map((p, i) => (
          <Text key={i} style={styles.body}>{p}</Text>
        ))}
        <Brand note={`Report ${pageIndex}`} />
      </View>
    );
  }

  if (page === "astronomy") {
    return (
      <View style={[styles.page, { width: BASE_WIDTH }]}>
        {header}
        <Text style={styles.sectionHead}>YOUR BIRTH SKY EXPLAINED</Text>
        {buildExplanationCards(profile, exactTimeUsed).map((card) => (
          <View key={card.id} style={styles.block}>
            <Text style={styles.blockTitle}>{card.title}</Text>
            <Text style={styles.blockSub}>{card.summary}</Text>
            {card.body.map((p, i) => <Text key={i} style={styles.body}>{p}</Text>)}
          </View>
        ))}
        <Brand note={`Report ${pageIndex}`} />
      </View>
    );
  }

  if (page === "readings-core" || page === "readings-outer") {
    const CORE = ["THE BIG THREE", "PERSONAL PLANETS"];
    const groups = buildInterpretationGroups(profile.zodiacPlacements, profile.risingSign)
      .filter((g) => (page === "readings-core" ? CORE.includes(g.heading) : !CORE.includes(g.heading)));
    return (
      <View style={[styles.page, { width: BASE_WIDTH }]}>
        {header}
        <Text style={styles.sectionHead}>
          YOUR ASTROLOGICAL INTERPRETATION{page === "readings-outer" ? " (CONTINUED)" : ""}
        </Text>
        {page === "readings-core" && <Text style={styles.caveat}>{ASTROLOGY_DISCLOSURE}</Text>}
        {groups.map((group) => (
          <View key={group.heading}>
            <Text style={styles.groupHead}>{group.heading}</Text>
            {group.readings.map((reading) => (
              <View key={reading.id} style={styles.block}>
                <Text style={styles.blockTitle}>{reading.title}</Text>
                <Text style={styles.blockSub}>{reading.subtitle}</Text>
                {reading.body.map((p, i) => <Text key={i} style={styles.body}>{p}</Text>)}
              </View>
            ))}
          </View>
        ))}
        <Brand note={`Report ${pageIndex}`} />
      </View>
    );
  }

  // synthesis
  return (
    <View style={[styles.page, { width: BASE_WIDTH }]}>
      {header}
      <Text style={styles.sectionHead}>YOUR PERSONALITY PORTRAIT</Text>
      {portrait.map((p, i) => <Text key={i} style={styles.body}>{p}</Text>)}

      <Text style={styles.sectionHead}>WHY THE TWO DIFFER</Text>
      <Text style={styles.body}>{FRAME_DIFFERENCE_NOTE}</Text>
      {profile.planets
        .filter((p) => p.constellation && p.zodiacSign && p.constellation !== p.zodiacSign)
        .slice(0, 3)
        .map((p) => (
          <Text key={p.name} style={styles.contrast}>
            {`${p.name} — astronomy: in front of ${p.constellation}. Astrology: tropical sign ${p.zodiacSign}.`}
          </Text>
        ))}

      <View style={styles.spacer} />
      <Disclosure />
      <Brand note={`Report ${pageIndex}`} />
    </View>
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
  page: { backgroundColor: "#070B16", padding: 20 },
  placeTable: { marginTop: 8, marginBottom: 4 },
  placeRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "rgba(217,168,78,0.14)" },
  placeRowCompact: { flexDirection: "row", alignItems: "center", paddingVertical: 2.5, borderTopWidth: 1, borderTopColor: "rgba(217,168,78,0.14)" },
  placeRowAccent: { borderTopColor: "rgba(217,168,78,0.45)" },
  placeText: { fontSize: 10 },
  placeTextCompact: { fontSize: 9 },
  placeBody: { flex: 1.1, color: "#FFF", fontWeight: "800" },
  placeSign: { flex: 1.3, color: AuraLunisColors.silver },
  placeDeg: { color: AuraLunisColors.gold2, textAlign: "right", minWidth: 48, fontVariant: ["tabular-nums"] },
  placeBodyAccent: { flex: 1.1, color: AuraLunisColors.gold, fontWeight: "900" },
  placeSignAccent: { flex: 1.3, color: "#FFF", fontWeight: "700" },
  placeDegAccent: { color: AuraLunisColors.gold, fontWeight: "700", textAlign: "right", minWidth: 48, fontVariant: ["tabular-nums"] },
  eyebrow: { color: AuraLunisColors.gold, fontSize: 8, letterSpacing: 2.5, fontWeight: "900" },
  reportPageNo: { color: AuraLunisColors.faint, fontSize: 8, letterSpacing: 1.5, marginTop: 2 },
  title: { color: "#FFF", fontSize: 24, fontWeight: "900", marginTop: 6 },
  subtitle: { color: AuraLunisColors.muted, fontSize: 10, marginTop: 3 },
  quickLine: { color: AuraLunisColors.silver, fontSize: 10, textAlign: "center", marginTop: 10 },
  quickPortrait: { color: AuraLunisColors.muted, fontSize: 9, lineHeight: 14, marginTop: 10 },
  spacer: { flex: 1 },
  sectionHead: { color: AuraLunisColors.gold2, fontSize: 9, letterSpacing: 2, fontWeight: "900", marginTop: 14, marginBottom: 6 },
  groupHead: { color: AuraLunisColors.gold, fontSize: 8, letterSpacing: 2, fontWeight: "900", marginTop: 10, marginBottom: 4 },
  caveat: { color: AuraLunisColors.faint, fontSize: 8, fontStyle: "italic", marginBottom: 6 },
  block: { marginBottom: 10 },
  blockTitle: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  blockSub: { color: AuraLunisColors.gold2, fontSize: 8, marginTop: 1, marginBottom: 3 },
  body: { color: AuraLunisColors.muted, fontSize: 9, lineHeight: 14, marginBottom: 5 },
  contrast: { color: AuraLunisColors.silver, fontSize: 9, lineHeight: 13, marginBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  rowLabel: { color: AuraLunisColors.faint, fontSize: 9 },
  rowValue: { color: "#FFF", fontSize: 9, fontWeight: "700" },
  disclosure: { color: AuraLunisColors.faint, fontSize: 7, lineHeight: 10, textAlign: "center", marginTop: 8 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  brand: { color: AuraLunisColors.gold2, fontSize: 9, fontWeight: "800" },
  brandNote: { color: AuraLunisColors.faint, fontSize: 7 },
});
