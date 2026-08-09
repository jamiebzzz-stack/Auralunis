import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";

export function TermsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>AuraLunis Terms of Use</Text>
      <Text style={styles.updated}>Last updated: June 2026</Text>

      <Text style={styles.body}>
        By using AuraLunis, you agree to these terms. If you do not agree, do not use the app.
      </Text>

      <Text style={styles.heading}>Description</Text>
      <Text style={styles.body}>
        AuraLunis is a premium interactive astronomy app that transforms your iPhone into a living celestial instrument. Features include a sensor-aligned sky planetarium, satellite tracking, constellation charts, and astrophotography planning. Your observations stay on your device.
      </Text>

      <Text style={styles.heading}>Purchases</Text>
      <Text style={styles.body}>
        Free: the Sky Lens planetarium with stars, constellations, Milky Way, planets and nebulae; Tonight Score and Find Mode; Fleet, Deep Space, Golden Hour and Meteor tracking; three starter Learn lessons; Celestial Calendar event listings; and Share Your Sky card creation.{"\n\n"}
        AuraLunis Lifetime ($29.99, one-time): everything above plus the premium visual treatment and Sky Lens Pro tools, satellite and ecliptic layers, the complete Learn curriculum, Birth Sky, Astro Weather, Photo Planner, Celestial Archive, the encrypted Vault, full event details and reminders, the premium tracking modes, unlimited Cosmic Drift, premium sharing, and the Aura Pro panels — permanently, including future updates.{"\n\n"}
        Lifetime is a one-time purchase. It is not a subscription, nothing renews, no recurring charge is made, and it includes no free trial. Prices shown may vary by region.
      </Text>

      <Text style={styles.heading}>Billing</Text>
      <Text style={styles.body}>
        • Payment is charged to your Apple ID account at confirmation of purchase{"\n"}
        • The Lifetime purchase is charged once. It does not renew and cannot lapse{"\n"}
        • Refunds are handled by Apple under the App Store terms
      </Text>

      <Text style={styles.heading}>Existing Subscriptions</Text>
      <Text style={styles.body}>
        AuraLunis no longer sells monthly or annual subscriptions. If you already hold one, it is unaffected: it continues to grant full Premium access and continues to renew on its existing terms until you cancel.{"\n\n"}
        • Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period{"\n"}
        • Your account will be charged for renewal within 24 hours prior to the end of the current period at the same price{"\n"}
        • You can manage and cancel subscriptions in your Apple ID Account Settings{"\n"}
        • No refunds for partial subscription periods
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
