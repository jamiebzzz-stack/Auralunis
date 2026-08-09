// ThreeTierPaywallModal.tsx
// LIFETIME-ONLY paywall. (Filename kept: renaming it would churn App.tsx, the context, and
// eight self-tests for no behavioural gain.)
//
// There is exactly ONE purchasable option — `$rc_lifetime`, the only package in the RevenueCat
// `default` Offering. The previous three-tier UI defaulted its selection to Annual, whose
// package was removed from the Offering remotely; RevenueCatService then resolved it to
// `not_available` and the primary button did nothing. A paywall must never present an option it
// cannot sell, so tier selection is gone entirely rather than merely re-defaulted.
//
// NO TRIAL, NO RENEWAL COPY: a one-time purchase has nothing to renew and carries no
// introductory offer, so resolvePlanCopy returns `disclosure: null` for lifetime in every state.
//
// The price shown is the LIVE localized StoreKit price whenever the store has returned one
// (usePaywallOffers); the catalog's "$29.99" is only a pre-load fallback. An App Store Connect
// price change therefore needs no app update.
//
// The Free column is not marketing — every line maps to a gate verified in the code. See the
// note above `freeFeatures` in MonetizationCatalog.

import React, { useState } from "react";
import {
  Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { AuraLunisColors, AuraLunisTypography } from "@/theme/tokens";
import {
  lifetimePlan,
  freeFeatures,
  premiumFeatures,
  lifetimeFeatures,
  type PlanOption,
} from "./MonetizationCatalog";
import { usePaywallOffers, type PlanOffer, type TrialState } from "./usePaywallOffers";
import { resolvePlanCopy } from "./paywallCopy";
import { tapLight, tapSuccess } from "@/services/HapticService";
import { Starfield } from "@/components/Starfield";
import { TermsScreen } from "@/screens/TermsScreen";
import { PrivacyScreen } from "@/screens/PrivacyScreen";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPurchase: (planId: string) => void;
  onRestore: () => void;
};

// All user-visible copy for a plan comes from the pure `resolvePlanCopy` helper — the modal
// never re-derives eligibility or trial wording. A missing offer resolves as `loading`, which
// fails closed to paid copy (no trial), so "free trial" can never flash before eligibility loads.
function planCopy(plan: PlanOption, offer?: PlanOffer) {
  const trial: TrialState = offer?.trial ?? { status: "loading" };
  return resolvePlanCopy(plan.interval, plan.displayPrice, offer?.localizedPrice ?? null, trial);
}

export function ThreeTierPaywallModal({ visible, onClose, onPurchase, onRestore }: Props) {
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  // Live localized price. Only loads while the paywall is visible.
  const { offers } = usePaywallOffers(visible);

  function handlePurchase() {
    tapSuccess();
    onPurchase(lifetimePlan.id);
  }

  // All lifetime copy comes from the pure helper. `disclosure` is null for a one-time purchase,
  // so no renewal sentence is rendered at all.
  const copy = planCopy(lifetimePlan, offers[lifetimePlan.id]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        {/* living-sky background so the paywall feels like the rest of the app */}
        <Starfield />

        {/* close — users must always be able to dismiss without purchasing */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => { tapLight(); onClose(); }} hitSlop={12} accessibilityLabel="Close">
          <Text style={styles.closeX}>✕</Text>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

            {/* Header */}
            <Text style={styles.eyebrow}>AURALUNIS LIFETIME</Text>
            <Text style={styles.headline}>{copy.heading}</Text>
            <Text style={styles.sub}>
              One purchase. Premium forever.
            </Text>

            {/* Price — the single offer, stated plainly. No tiers, so nothing to choose. */}
            <View style={styles.priceCard}>
              <Text style={styles.priceValue}>{copy.priceText}</Text>
              <Text style={styles.priceNote}>{lifetimePlan.subtitle}</Text>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.cta}
              onPress={handlePurchase}
              accessibilityRole="button"
              accessibilityLabel={copy.ctaLabel}
            >
              <Text style={styles.ctaText}>{copy.ctaLabel}</Text>
              <Text style={styles.ctaSub}>{copy.detailText}</Text>
            </TouchableOpacity>

            {/* copy.disclosure is null for a one-time purchase — nothing renews, so there is
                deliberately no renewal disclosure here. Rendered defensively so that if
                subscriptions ever return, the required Apple text reappears automatically. */}
            {copy.disclosure && <Text style={styles.disclosure}>{copy.disclosure}</Text>}

            {/* Free vs Lifetime — an honest comparison. The free column is real access, not a
                teaser: someone should be able to enjoy AuraLunis without paying, and upgrade
                because they want more rather than because they hit a wall. */}
            <Text style={styles.sectionLabel}>Free — always yours</Text>
            {freeFeatures.map(f => (
              <View key={f} style={styles.featureRow}>
                <Text style={styles.featureCheckFree}>✓</Text>
                <Text style={styles.featureTextFree}>{f}</Text>
              </View>
            ))}

            <Text style={[styles.sectionLabel, styles.sectionLabelGold]}>Lifetime adds</Text>
            {premiumFeatures.map(f => (
              <View key={f} style={styles.featureRow}>
                <Text style={styles.featureCheck}>✦</Text>
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}

            <View style={styles.lifetimeNote}>
              {lifetimeFeatures.map(f => (
                <Text key={f} style={styles.lifetimeNoteText}>{f}</Text>
              ))}
            </View>

            {/* Footer — required Apple links, all tappable */}
            <View style={styles.footer}>
              <Text style={styles.footerLink} onPress={() => { tapLight(); onRestore(); }}>Restore Purchases</Text>
              <Text style={styles.footerDot}>·</Text>
              <Text style={styles.footerLink} onPress={() => { tapLight(); setLegal("terms"); }}>Terms</Text>
              <Text style={styles.footerDot}>·</Text>
              <Text style={styles.footerLink} onPress={() => { tapLight(); setLegal("privacy"); }}>Privacy</Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
              <Text style={styles.skipText}>Continue Free</Text>
            </TouchableOpacity>

        </ScrollView>

        {/* in-app Terms / Privacy */}
        <Modal visible={legal !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setLegal(null)}>
          <View style={styles.screen}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setLegal(null)} hitSlop={12} accessibilityLabel="Close">
              <Text style={styles.closeX}>✕</Text>
            </TouchableOpacity>
            {legal === "terms" && <TermsScreen />}
            {legal === "privacy" && <PrivacyScreen />}
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

// Brand type: Cinzel (display) for headings/labels, Playfair Display (body) for
// prose. Both are loaded app-wide via useAuraLunisFonts(); they fall back cleanly
// to serif/system until loaded, so applying them here can't crash.
const DISPLAY = AuraLunisTypography.display.fontFamily;
const BODY = AuraLunisTypography.body.fontFamily;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AuraLunisColors.cosmicBlack },
  closeBtn: { position: "absolute", top: 52, right: 20, zIndex: 10, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,18,37,0.7)", borderWidth: 1, borderColor: AuraLunisColors.borderGold },
  closeX: { color: AuraLunisColors.silver, fontSize: 16, fontWeight: "700", lineHeight: 18 },
  content: { padding: 24, paddingTop: 72, paddingBottom: 48 },
  eyebrow: { fontFamily: DISPLAY, color: AuraLunisColors.gold, fontSize: 10, fontWeight: "800", letterSpacing: 3, textAlign: "center", marginBottom: 6 },
  headline: { fontFamily: DISPLAY, color: AuraLunisColors.gold2, fontSize: 24, fontWeight: "900", textAlign: "center", marginBottom: 6 },
  sub: { fontFamily: BODY, color: AuraLunisColors.muted, fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 22 },
  // Single-offer price block. There is no tier selection, so this states the price rather
  // than asking the user to pick between options.
  priceCard: { backgroundColor: AuraLunisColors.elevated, borderRadius: 16, borderWidth: 1, borderColor: AuraLunisColors.borderGold, paddingVertical: 18, paddingHorizontal: 16, marginBottom: 4, alignItems: "center" },
  priceValue: { fontFamily: DISPLAY, color: AuraLunisColors.gold, fontSize: 30, fontWeight: "900", letterSpacing: 0.5, textAlign: "center" },
  priceNote: { fontFamily: BODY, color: AuraLunisColors.muted, fontSize: 12, marginTop: 6, textAlign: "center" },
  cta: { backgroundColor: AuraLunisColors.gold, borderRadius: 16, padding: 16, alignItems: "center", marginTop: 20, marginBottom: 10 },
  ctaText: { fontFamily: DISPLAY, color: AuraLunisColors.cosmicBlack, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  ctaSub: { fontFamily: BODY, color: "rgba(11,11,18,0.7)", fontSize: 11, marginTop: 3 },
  // Auto-renewal / trial-renewal disclosure directly beneath the CTA (Apple requirement).
  disclosure: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 10, lineHeight: 15, textAlign: "center", marginBottom: 14, paddingHorizontal: 4 },
  sectionLabel: { fontFamily: DISPLAY, color: AuraLunisColors.faint, fontSize: 9, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, marginTop: 18 },
  // The upgrade half is gold; the free half stays quiet silver. The contrast carries the
  // comparison without needing a table, which would be unreadable at this width.
  sectionLabelGold: { color: AuraLunisColors.gold },
  featureRow: { flexDirection: "row", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: AuraLunisColors.borderFaint },
  featureCheck: { color: AuraLunisColors.gold, fontSize: 11, marginTop: 1 },
  featureText: { fontFamily: BODY, color: AuraLunisColors.silver, fontSize: 12, flex: 1, lineHeight: 18 },
  featureCheckFree: { color: AuraLunisColors.muted, fontSize: 11, marginTop: 1 },
  featureTextFree: { fontFamily: BODY, color: AuraLunisColors.muted, fontSize: 12, flex: 1, lineHeight: 18 },
  lifetimeNote: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: AuraLunisColors.borderGold, gap: 4 },
  lifetimeNoteText: { fontFamily: BODY, color: AuraLunisColors.gold2, fontSize: 12, lineHeight: 18, textAlign: "center" },
  footer: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 20, marginBottom: 10 },
  footerLink: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 11 },
  footerDot: { color: AuraLunisColors.faint, fontSize: 11 },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 12 },
});
