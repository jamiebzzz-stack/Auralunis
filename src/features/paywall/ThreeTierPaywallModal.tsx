// ThreeTierPaywallModal.tsx
// New-customer paywall: Lifetime only.
//
// Monthly and annual products intentionally remain in App Store Connect / RevenueCat so
// existing subscribers can keep their entitlement, restore purchases, and manage their
// subscription. They are NOT offered for new purchases in RevenueCat's current offering
// and must not be shown as selectable plans in this paywall.
//
// Lifetime is a one-time purchase and never carries trial language.

import React, { useState } from "react";
import {
  Modal, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { AuraLunisColors, AuraLunisTypography } from "@/theme/tokens";
import {
  plans,
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

function planCopy(plan: PlanOption, offer?: PlanOffer) {
  const trial: TrialState = offer?.trial ?? { status: "loading" };
  return resolvePlanCopy(plan.interval, plan.displayPrice, offer?.localizedPrice ?? null, trial);
}

export function ThreeTierPaywallModal({ visible, onClose, onPurchase, onRestore }: Props) {
  const [legal, setLegal] = useState<"terms" | "privacy" | null>(null);

  // RevenueCat's current offering contains only the lifetime package. We still read the live
  // store price so localized App Store pricing remains the source of truth.
  const { offers } = usePaywallOffers(visible);
  const lifetime = plans.find(p => p.id === "lifetime")!;
  const lifetimeOffer = offers[lifetime.id];
  const copy = planCopy(lifetime, lifetimeOffer);

  function handlePurchase() {
    tapSuccess();
    onPurchase(lifetime.id);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Starfield />

        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => { tapLight(); onClose(); }}
          hitSlop={12}
          accessibilityLabel="Close"
        >
          <Text style={styles.closeX}>✕</Text>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>AURALUNIS PREMIUM</Text>
          <Text style={styles.headline}>Unlock AuraLunis for Life</Text>
          <Text style={styles.sub}>
            One purchase. Every premium feature. No subscription and no recurring charge.
          </Text>

          <View style={[styles.planCard, styles.planCardSelected]}>
            <View style={styles.planLeft}>
              <View style={[styles.radio, styles.radioSelected]} />
              <View style={styles.planTextCol}>
                <Text style={[styles.planName, { color: AuraLunisColors.gold2 }]}>Lifetime</Text>
                <Text style={styles.planSubtitle}>{copy.detailText}</Text>
              </View>
            </View>
            <View style={styles.planRight}>
              <Text style={[styles.planPrice, { color: AuraLunisColors.gold }]}>{copy.priceText}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>ONE TIME</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.cta}
            onPress={handlePurchase}
            accessibilityRole="button"
            accessibilityLabel={copy.ctaLabel}
          >
            <Text style={styles.ctaText}>{copy.ctaLabel}</Text>
            <Text style={styles.ctaSub}>{copy.detailText}</Text>
          </TouchableOpacity>

          <Text style={styles.oneTimeDisclosure}>
            One-time purchase. No free trial, subscription, or recurring billing.
          </Text>

          <Text style={styles.sectionLabel}>What you get</Text>
          {lifetimeFeatures.map(f => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.featureCheck}>✦</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}

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
  planCard: { backgroundColor: AuraLunisColors.elevated, borderRadius: 14, borderWidth: 1, borderColor: AuraLunisColors.borderSubtle, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planCardSelected: { borderColor: AuraLunisColors.gold, backgroundColor: "rgba(217,168,78,0.1)" },
  planLeft: { flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1 },
  planTextCol: { flexShrink: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: AuraLunisColors.faint, marginTop: 2, flexShrink: 0 },
  radioSelected: { borderColor: AuraLunisColors.gold, backgroundColor: AuraLunisColors.gold },
  planName: { fontFamily: DISPLAY, color: AuraLunisColors.silver, fontSize: 14, fontWeight: "700" },
  planSubtitle: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 11, marginTop: 2 },
  planRight: { alignItems: "flex-end", gap: 4, flexShrink: 0, marginLeft: 8 },
  planPrice: { fontFamily: DISPLAY, color: AuraLunisColors.silver, fontSize: 15, fontWeight: "800" },
  badge: { backgroundColor: "rgba(217,168,78,0.2)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: DISPLAY, color: AuraLunisColors.gold, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  cta: { backgroundColor: AuraLunisColors.gold, borderRadius: 16, padding: 16, alignItems: "center", marginTop: 20, marginBottom: 10 },
  ctaText: { fontFamily: DISPLAY, color: AuraLunisColors.cosmicBlack, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  ctaSub: { fontFamily: BODY, color: "rgba(11,11,18,0.7)", fontSize: 11, marginTop: 3 },
  oneTimeDisclosure: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 10, lineHeight: 15, textAlign: "center", marginBottom: 14, paddingHorizontal: 4 },
  sectionLabel: { fontFamily: DISPLAY, color: AuraLunisColors.faint, fontSize: 9, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 },
  featureRow: { flexDirection: "row", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: AuraLunisColors.borderFaint },
  featureCheck: { color: AuraLunisColors.gold, fontSize: 11, marginTop: 1 },
  featureText: { fontFamily: BODY, color: AuraLunisColors.silver, fontSize: 12, flex: 1, lineHeight: 18 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 20, marginBottom: 10 },
  footerLink: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 11 },
  footerDot: { color: AuraLunisColors.faint, fontSize: 11 },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { fontFamily: BODY, color: AuraLunisColors.faint, fontSize: 12 },
});
