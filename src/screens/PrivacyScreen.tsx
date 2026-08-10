import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AuraLunisColors } from "@/theme/tokens";

export function PrivacyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>AuraLunis Privacy Policy</Text>
      <Text style={styles.updated}>Last updated: August 2026</Text>

      <Text style={styles.body}>
        Your privacy matters to us. AuraLunis is designed to keep your data on your device. This policy explains what data we access, why, and how it stays private.
      </Text>

      <Text style={styles.heading}>Data That Stays on Your Device</Text>
      <Text style={styles.body}>
        • Observations, notes, and vault entries — stored locally with NaCl encryption{"\n"}
        • Device motion and compass data — used to determine which direction your phone points, never stored{"\n"}
        • Location — used on-device to compute your sky; only approximate coordinates are sent to Open-Meteo for the weather forecast (see Third-Party Services)
      </Text>

      <Text style={styles.heading}>Data We Access</Text>

      <Text style={styles.subheading}>Location</Text>
      <Text style={styles.body}>
        AuraLunis uses your location to compute the positions of stars, planets, the Moon, and satellites for your exact viewing point. Location data is processed on-device and is never sent to Ocoee Studios servers or any third party except Open-Meteo for weather forecasts (approximate coordinates only).
      </Text>

      <Text style={styles.subheading}>Motion Sensors</Text>
      <Text style={styles.body}>
        Accelerometer, gyroscope, and magnetometer data determine which direction your phone is pointing so the Sky Lens planetarium aligns with the real sky. This data is used in real-time only and is never stored or transmitted.
      </Text>

      <Text style={styles.heading}>Third-Party Services</Text>

      <Text style={styles.subheading}>RevenueCat</Text>
      <Text style={styles.body}>
        Manages purchase and entitlement status. Receives an anonymous app user ID and Apple purchase receipts. Does not receive your location, health data, observations, or any personal content. Privacy policy: revenuecat.com/privacy
      </Text>

      <Text style={styles.subheading}>Open-Meteo</Text>
      <Text style={styles.body}>
        Provides weather data for the Astro Weather forecast and the Tonight score. Receives approximate latitude/longitude coordinates only. No account required, no API key, no device ID transmitted. Privacy policy: open-meteo.com/en/terms
      </Text>

      <Text style={styles.subheading}>astronomy-engine</Text>
      <Text style={styles.body}>
        Runs entirely on your device. Makes zero network requests. No data collection of any kind.
      </Text>

      <Text style={styles.subheading}>Live Astronomy Data (CelesTrak, Space-Track, NOAA SWPC)</Text>
      <Text style={styles.body}>
        Satellite tracking and space-weather features fetch public, read-only data from CelesTrak and NOAA's Space Weather Prediction Center (and Space-Track if you supply your own credentials). These requests send no personal data, no location, and no device identifiers — only a request for the public data feed.
      </Text>

      <Text style={styles.heading}>What We Do NOT Do</Text>
      <Text style={styles.body}>
        • We do not sell your data{"\n"}
        • We do not use advertising identifiers (IDFA){"\n"}
        • We do not track you across apps{"\n"}
        • We do not display ads{"\n"}
        • We do not require an account{"\n"}
        • We do not have user analytics beyond Apple's standard App Analytics{"\n"}
        • We do not transmit your observations, notes, or vault content
      </Text>

      <Text style={styles.heading}>Encrypted Vault</Text>
      <Text style={styles.body}>
        Your observation journal and saved data are encrypted on-device using NaCl secretbox (tweetnacl). The encryption key stays on your device. Ocoee Studios cannot read your vault data. If you delete the app, your vault data is permanently deleted.
      </Text>

      <Text style={styles.heading}>Children's Privacy</Text>
      <Text style={styles.body}>
        AuraLunis is rated 4+ and is suitable for all ages. We do not knowingly collect personal information from children. The app does not require account creation and stores no personally identifiable information.
      </Text>

      <Text style={styles.heading}>Changes to This Policy</Text>
      <Text style={styles.body}>
        We may update this policy with new app versions. Changes will be reflected in the "Last updated" date above. Continued use of AuraLunis after changes constitutes acceptance.
      </Text>

      <Text style={styles.heading}>Contact</Text>
      <Text style={styles.body}>
        Questions about your privacy? Contact us at admin@ocoeestudios.com
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
  subheading: { color: AuraLunisColors.starlight, fontSize: 13, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  body: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 20 },
  footer: { color: AuraLunisColors.faint, fontSize: 11, marginTop: 30, textAlign: "center" },
});
