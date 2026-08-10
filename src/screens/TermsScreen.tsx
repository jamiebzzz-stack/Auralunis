import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";

export function TermsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>AuraLunis Terms of Use</Text>
      <Text style={styles.updated}>Last updated: August 2026</Text>

      <Text style={styles.body}>
        By using AuraLunis, you agree to these terms. If you do not agree, do not use the app.
      </Text>

      <Text style={styles.heading}>Description</Text>
      <Text style={styles.body}>
        AuraLunis is a premium interactive astronomy app that transforms your iPhone into a living celestial instrument. Features include a sensor-aligned sky planetarium, satellite tracking, constellation charts, and astrophotography planning. Your observations stay on your device.
      </Text>

      <Text style={styles.heading}>Premium Access</Text>
      <Text style={styles.body}>
        Free access includes selected astronomy features and learning content.{"\n\n"}
        Lifetime access is a one-time, non-consumable in-app purchase that permanently unlocks AuraLunis Premium. The U.S. storefront price is $29.99; localized App Store pricing may vary by region. Lifetime has no subscription, no recurring charge, and no free trial.{"\n\n"}
        Existing customers who previously subscribed to AuraLunis Premium Monthly or Annual keep the access provided by their active legacy subscription. Those legacy subscriptions may continue to renew under the terms shown by Apple and can be managed or canceled in Apple ID subscription settings. New customers are not offered Monthly or Annual subscriptions in AuraLunis.
      </Text>

      <Text style={styles.heading}>Billing</Text>
      <Text style={styles.body}>
        • Payment is charged to your Apple ID account at confirmation of purchase{"\n"}
        • Lifetime is charged once and does not renew{"\n"}
        • Existing legacy Monthly or Annual subscriptions may renew automatically according to the billing terms shown by Apple unless canceled{"\n"}
        • Existing subscription customers can manage or cancel their subscription in Apple ID Account Settings{"\n"}
        • Refunds and purchase disputes are handled under Apple's applicable App Store policies
      </Text>

      <Text style={styles.heading}>Accuracy & Safety</Text>
      <Text style={styles.body}>
        AuraLunis provides astronomical data for educational and recreational purposes. Celestial positions, satellite predictions, and weather forecasts are approximations and should not be relied upon for navigation, aviation, or safety-critical decisions. Always be aware of your surroundings when using Sky Lens outdoors, especially at night.
      </Text>

      <Text style={styles.heading}>Your Content</Text>
      <Text style={styles.body}>
        You own everything you create in AuraLunis. We claim no rights to your observations, notes, vault entries, or any content you create within the app.
      </Text>

      <Text style={styles.heading}>Acceptable Use</Text>
      <Text style={styles.body}>
        Do not use AuraLunis to store illegal content or to violate the rights of others.
      </Text>

      <Text style={styles.heading}>Disclaimer</Text>
      <Text style={styles.body}>
        AuraLunis is provided "as is" without warranties of any kind. Ocoee Studios is not liable for any loss of data, observations, or creative work. Back up important content regularly using the export feature.
      </Text>

      <Text style={styles.heading}>Limitation of Liability</Text>
      <Text style={styles.body}>
        To the maximum extent permitted by law, Ocoee Studios shall not be liable for any indirect, incidental, special, or consequential damages.
      </Text>

      <Text style={styles.heading}>Governing Law</Text>
      <Text style={styles.body}>
        These terms are governed by the laws of the State of Tennessee, United States.
      </Text>

      <Text style={styles.heading}>Contact</Text>
      <Text style={styles.body}>admin@ocoeestudios.com</Text>

      <Text style={styles.heading}>Apple EULA</Text>
      <Text style={styles.body}>
        This agreement is between you and Ocoee Studios, not Apple. Apple has no obligation to furnish maintenance or support services with respect to AuraLunis. To the extent permitted by applicable law, Apple will have no warranty obligation with respect to AuraLunis. Apple is not responsible for addressing any claims relating to AuraLunis. Apple is a third-party beneficiary of this agreement.
      </Text>

      <Text style={styles.footer}>© 2026 Ocoee Studios</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AuraLunisColors.cosmicBlack },
  content: { padding: 20, paddingBottom: 60 },
  title: { color: AuraLunisColors.gold, fontSize: 20, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  updated: { color: AuraLunisColors.muted, fontSize: 12, marginBottom: 20 },
  heading: { color: AuraLunisColors.gold, fontSize: 14, fontWeight: "800", marginTop: 20, marginBottom: 6 },
  body: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 20 },
  footer: { color: AuraLunisColors.faint, fontSize: 11, marginTop: 30, textAlign: "center" },
});
