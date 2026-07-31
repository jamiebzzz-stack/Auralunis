import React, { useState } from "react";
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";
import { useNavigation } from "@react-navigation/native";
import { useOnboarding } from "@/context/OnboardingContext";
import { useFirstLight } from "@/features/first-light/FirstLightContext";
import { resolveMembershipCta } from "@/features/paywall/entitlementStatus";
import { TermsScreen } from "@/screens/TermsScreen";
import { PrivacyScreen } from "@/screens/PrivacyScreen";
import { GlassPanel } from "@/components/GlassPanel";
import { ScreenShell } from "@/components/ScreenShell";
import { LogoMark } from "@/components/LogoMark";
import { AuraLunisColors, AuraLunisPricing } from "@/theme/tokens";
import { AuraLunisBrand } from "@/data/brand";
import type { AuraLunisThemeMode } from "@/features/settings/SettingsTypes";
import { useAuraLunisSettings } from "@/state/AuraLunisSettingsContext";
import { useAuraLunisVault } from "@/state/AuraLunisVaultContext";
import { DeviceDiagnosticsPanel } from "@/features/device-qa/DeviceDiagnosticsPanel";
import { LearnPreferencesModal } from "@/features/learn/LearnPreferencesModal";
import { openAuraLunisSubscriptionManagement, restoreAuraLunisPurchases } from "@/services/RevenueCatService";
import { requestNotificationPermission } from "@/services/NotificationService";

type SettingRowProps = {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

function SettingRow({ title, description, value, onValueChange, disabled = false }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: "rgba(255,255,255,0.14)", true: "rgba(217,168,78,0.42)" }}
        thumbColor={value ? AuraLunisColors.gold2 : AuraLunisColors.silver}
      />
    </View>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { settings, hydrated, updateSetting, resetSettings } = useAuraLunisSettings();
  const { membershipKind, refresh } = useEntitlement();
  const { openPaywall } = usePaywallNavigation();
  const { replayTutorial } = useOnboarding();
  // First Light is optional infrastructure — `useFirstLight()` returns null when the provider
  // isn't mounted, and the row simply doesn't render rather than throwing.
  const firstLight = useFirstLight();
  const navigation = useNavigation<any>();
  // Single source of truth for the membership card's copy, label, and action — derived
  // from the RevenueCat-backed membershipKind (loading/unknown/error fail closed to "none").
  const membershipCta = resolveMembershipCta(membershipKind);
  const { items, clearPrototypeVault } = useAuraLunisVault();
  const [deviceDiagnosticsOpen, setDeviceDiagnosticsOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [learnPrefsOpen, setLearnPrefsOpen] = useState(false);


  async function handleRestorePurchases() {
    try {
      const result = await restoreAuraLunisPurchases();
      if (result.status === "not_configured") {
        Alert.alert("Restore Purchases", "Purchases will be available once AuraLunis is live on the App Store.");
        return;
      }
      if (result.status === "error") {
        Alert.alert("Restore Purchases", "We couldn't reach the App Store to restore your purchases. Please check your connection and try again.");
        return;
      }
      // Re-fetch entitlement so the UI reflects the restore immediately (not just on
      // next foreground), and tell the user the truth about what was found — success ONLY
      // when the active AuraLunis Premium entitlement is present, never on a bare completion.
      await refresh();
      Alert.alert(
        "Restore Purchases",
        result.entitled
          ? "Your AuraLunis Premium membership has been restored."
          : "No active AuraLunis purchase was found on this Apple ID."
      );
    } catch {
      Alert.alert("Restore Purchases", "Restore could not be completed. Please try again from a signed-in Apple ID.");
    }
  }

  // Explicit, user-initiated notification permission request. This is the ONLY place the app
  // asks for notification authorization — turning the master Notifications switch on. Automatic
  // paths (startup, onboarding, Home mount-time scheduling) never prompt. The saved preference
  // must reflect the real iOS authorization result so denial never appears enabled.
  async function handleNotificationsToggle(value: boolean) {
    if (!value) {
      updateSetting("notificationsEnabled", false);
      return;
    }

    try {
      const granted = await requestNotificationPermission();
      updateSetting("notificationsEnabled", granted);
    } catch {
      updateSetting("notificationsEnabled", false);
    }
  }

  async function handleManageSubscription() {
    try {
      const result = await openAuraLunisSubscriptionManagement();

      if (result.status === "opened") return;

      Alert.alert(
        "Manage Subscription",
        result.status === "not_configured"
          ? "Subscriptions are managed through your Apple ID and will be available once AuraLunis is live on the App Store."
          : "You don't have an active AuraLunis subscription on this Apple ID yet."
      );
    } catch {
      Alert.alert(
        "Subscription management",
        "The App Store subscription-management page could not be opened."
      );
    }
  }

  const themes: Array<[AuraLunisThemeMode, string]> = [
    ["midnight_gold", "Midnight Gold"],
    ["soft_moon", "Soft Moon"],
    ["deep_space", "Deep Space"],
    ["system", "System"]
  ];

  return (
    <ErrorBoundary>
    <ScreenShell title="Settings" subtitle="Control Center">
      <View style={styles.hero}>
        <LogoMark size={126} showWordmark showDescriptor centered />
        <Text style={styles.heroTagline}>{AuraLunisBrand.tagline}</Text>
        <Text style={styles.heroCopy}>
          Manage subscription, appearance, privacy, Sky Lens calibration,
          notifications, learning preferences, and local data.
        </Text>
        <Text style={styles.syncState}>{hydrated ? "Settings saved locally" : "Loading local settings…"}</Text>
      </View>

      <SettingsSection title="Subscription">
        <GlassPanel accent>
          <Text style={styles.infoTitle}>AuraLunis Memberships</Text>
          <Text style={styles.infoCopy}>
            AuraLunis Premium: {AuraLunisPricing.monthly} or {AuraLunisPricing.annual}. Lifetime {AuraLunisPricing.lifetime} one-time.
          </Text>
          {/* Copy + primary CTA come from resolveMembershipCta(membershipKind), so the card
              can never show contradictory subscriber/non-subscriber states. Non-subscriber
              (incl. loading/unknown/error) → paywall; active sub → Apple management; lifetime
              → a non-recurring active badge that never opens subscription management. */}
          <Text style={styles.infoCopy}>{membershipCta.statusCopy}</Text>
          {membershipCta.ctaKind === "paywall" && (
            <Pressable style={styles.actionButton} onPress={openPaywall}>
              <Text style={styles.actionButtonText}>{membershipCta.ctaLabel}</Text>
            </Pressable>
          )}
          {membershipCta.ctaKind === "manage" && (
            <Pressable style={styles.actionButton} onPress={handleManageSubscription}>
              <Text style={styles.actionButtonText}>{membershipCta.ctaLabel}</Text>
            </Pressable>
          )}
          {membershipCta.ctaKind === "lifetime" && (
            <View style={styles.actionButton} accessibilityRole="text">
              <Text style={styles.actionButtonText}>{membershipCta.ctaLabel}</Text>
            </View>
          )}
          <Pressable
            style={styles.secondaryButton}
            onPress={handleRestorePurchases}
          >
            <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
          </Pressable>
          {/* Development-only: opens the REAL ThreeTierPaywallModal so trial/pricing
              states can be inspected visually. __DEV__ is false in release builds, so
              this is stripped from production. It only calls openPaywall() — it never
              touches entitlement state, RevenueCat config, or purchase logic. */}
          {__DEV__ && (
            <Pressable style={styles.devButton} onPress={openPaywall}>
              <Text style={styles.devButtonText}>Preview Paywall (Dev Only)</Text>
            </Pressable>
          )}
        </GlassPanel>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <View style={styles.themeGrid}>
          {themes.map(([mode, label]) => {
            const active = settings.themeMode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.themeTile, active && styles.themeTileActive]}
                onPress={() => updateSetting("themeMode", mode)}
              >
                <Text style={styles.themeTitle}>{label}</Text>
                <Text style={styles.themeSub}>{active ? "Active globally" : "Tap to apply"}</Text>
              </Pressable>
            );
          })}
        </View>
        <SettingRow
          title="Night Vision Mode"
          description="Deep red for dark adaptation. Syncs with the Sky Lens night toggle."
          value={settings.nightVision}
          onValueChange={(value) => updateSetting("nightVision", value)}
        />
      </SettingsSection>

      <SettingsSection title="Notifications + Alarms">
        <SettingRow
          title="Notifications"
          description="Master switch for reminders and celestial alerts."
          value={settings.notificationsEnabled}
          onValueChange={handleNotificationsToggle}
        />
        <SettingRow
          title="Celestial Alarms"
          description="Sunrise, moonrise, Venus visible, and stargazing-window alerts."
          value={settings.notificationsEnabled && settings.celestialAlarmsEnabled}
          onValueChange={(value) => updateSetting("celestialAlarmsEnabled", value)}
          disabled={!settings.notificationsEnabled}
        />
        <SettingRow
          title="Tonight’s Ritual Reminders"
          description="Gentle evening ritual reminders."
          value={settings.notificationsEnabled && settings.tonightRitualRemindersEnabled}
          onValueChange={(value) => updateSetting("tonightRitualRemindersEnabled", value)}
          disabled={!settings.notificationsEnabled}
        />
      </SettingsSection>

      <SettingsSection title="Sky Lens">
        <SettingRow title="Calibration Reminders" description="Prompt when compass or motion accuracy is poor." value={settings.skyLensCalibrationRemindersEnabled} onValueChange={(value) => updateSetting("skyLensCalibrationRemindersEnabled", value)} />

        <Text style={styles.qualityLabel}>Sky Quality</Text>
        <Text style={styles.qualityDescription}>
          Bortle scale of your usual site — Urban (7–9), Suburban (5–6), Rural (3–4), Dark (1–2). Affects the Tonight Score.
        </Text>
        <View style={styles.segmentRow}>
          {(["urban", "suburban", "rural", "dark"] as const).map((quality) => (
            <Pressable
              key={quality}
              style={[styles.segment, settings.skyQuality === quality && styles.segmentActive]}
              onPress={() => updateSetting("skyQuality", quality)}
            >
              <Text style={[styles.segmentText, settings.skyQuality === quality && styles.segmentTextActive]}>
                {quality.charAt(0).toUpperCase() + quality.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.secondaryButton} onPress={() => Alert.alert(
          "Calibrate Sky Lens",
          "To calibrate your compass for accurate sky pointing:\n\n1. Hold your phone away from metal objects\n2. Move it slowly in a figure-eight pattern 3 times\n3. Open Sky Lens and point at a known bright object (Moon, Venus, or a bright star)\n4. If it's misaligned, repeat the figure-eight\n\nMost calibration issues are caused by magnetic interference from cases, mounts, or nearby electronics.",
          [{ text: "Got it", style: "default" }]
        )}>
          <Text style={styles.secondaryButtonText}>Compass Calibration Guide</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.secondaryButtonText}>Manage App Permissions</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => Alert.alert(
          "Privacy-Safe Sky Map",
          "AuraLunis works without location or camera access:\n\n• Planetarium Mode — full sky view with no camera, no location needed\n• Manual Location — set your city in iOS Settings → Privacy → Location Services\n• Offline — all star data is on-device, no internet required\n\nYour location is only used locally for sky calculations. It is never sent to any server.",
          [{ text: "OK", style: "default" }]
        )}>
          <Text style={styles.secondaryButtonText}>Privacy-Safe Sky Map</Text>
        </Pressable>
      </SettingsSection>

      <SettingsSection title="Privacy + Data">
        <SettingRow title="Local-First Vault" description="Keep Notes, LifeSky moments, lessons, and saved objects local by default." value={settings.localFirstVaultEnabled} onValueChange={(value) => updateSetting("localFirstVaultEnabled", value)} />
        {/* Cloud Sync and AI Oracle removed — features not built. 
            Re-add when actual implementations exist. */}
        <Text style={styles.localCount}>{items.length} Vault items</Text>
        <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.secondaryButtonText}>Review App Permissions in Settings</Text>
        </Pressable>
        <Pressable style={styles.dangerButton} onPress={() => clearPrototypeVault().then(() => Alert.alert("Cosmic Vault", "Vault items cleared."))}>
          <Text style={styles.dangerButtonText}>Clear Vault Data</Text>
        </Pressable>
      </SettingsSection>

      {/* Widgets section removed for v1 — the WidgetKit extension is not bundled in
          this build, so the toggle controlled nothing and advertised widgets that
          don't ship. Re-add when the widget extension is wired into the app. */}

      <SettingsSection title="Learning">
        <Pressable style={styles.secondaryButton} onPress={() => setLearnPrefsOpen(true)}>
          <Text style={styles.secondaryButtonText}>Learning Preferences</Text>
        </Pressable>
      </SettingsSection>

      <LearnPreferencesModal visible={learnPrefsOpen} onClose={() => setLearnPrefsOpen(false)} />


      {/* Developer-only on-device QA. __DEV__ compiles to false in release builds, so this
          section is completely absent from production / TestFlight / App Store binaries;
          the panel code is preserved for local development. */}
      {__DEV__ && (
        <SettingsSection title="Native Device QA">
          <Text style={styles.infoCopy}>
            Run location, compass, motion-sensor, photo-save, and haptic
            checks on a physical iPhone before outdoor Sky Lens calibration.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setDeviceDiagnosticsOpen((previous) => !previous)}
          >
            <Text style={styles.secondaryButtonText}>
              {deviceDiagnosticsOpen ? "Hide Device Diagnostics" : "Open Device Diagnostics"}
            </Text>
          </Pressable>
          {deviceDiagnosticsOpen ? <DeviceDiagnosticsPanel /> : null}
        </SettingsSection>
      )}

      <SettingsSection title="Help + About">
        <View style={styles.aboutCard}>
          <LogoMark size={62} />
          <View style={{ flex: 1 }}>
            <Text style={styles.aboutTitle}>About Us</Text>
            <Text style={styles.aboutCopy}>
              AuraLunis was created to turn the night sky into a living, personal experience. Blending astronomy, thoughtful design, and quiet daily rituals, we help you slow down, look up, and feel more connected to the universe around you.
            </Text>
          </View>
        </View>

        <Pressable style={styles.secondaryButton} onPress={() => Alert.alert(
          "Frequently Asked Questions",
          "How do I use Sky Lens?\nPoint your phone at the sky. Stars, constellations, and planets align to the direction your phone is pointing.\n\nWhy can't I see the Milky Way?\nTurn toward the south (heading ~160-180°). The galactic core is brightest in Sagittarius.\n\nHow do I find a specific object?\nLook for the 'Pan to...' hint at the bottom of Sky Lens. It guides you to bright objects.\n\nIs there a free trial?\nThe monthly and annual plans support Apple's 7-day introductory trial for eligible new subscribers. Apple determines eligibility and shows the trial at checkout only when your account qualifies; otherwise standard pricing applies. Lifetime has no trial.\n\nHow do I restore my purchase?\nGo to Settings → Manage Subscription → Restore Purchases.\n\nNeed more help?\nTap 'Contact Support' below to email us."
        )}>
          <Text style={styles.secondaryButtonText}>FAQ / Help</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => Alert.alert("About AuraLunis", `${AuraLunisBrand.name} · ${AuraLunisBrand.descriptor}\n${AuraLunisBrand.tagline}`)}>
          <Text style={styles.secondaryButtonText}>About AuraLunis</Text>
        </Pressable>
        {/* Re-opens the first-run onboarding from the beginning. Purely presentational: it
            never erases birth data, clears entitlement/RevenueCat state, or marks the app as
            a new install. */}
        <Pressable
          style={styles.secondaryButton}
          onPress={replayTutorial}
          accessibilityRole="button"
          accessibilityLabel="Replay Tutorial"
        >
          <Text style={styles.secondaryButtonText}>Replay Tutorial</Text>
        </Pressable>
        {/* Restarts the optional hands-on First Light tour from step one and jumps to the Sky
            tab, where it runs. It resets ONLY the First Light document — settings, birth data,
            entitlement, Vault items, and the contextual tips already seen are untouched. */}
        {firstLight ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              firstLight.replay();
              navigation.navigate("Sky");
            }}
            accessibilityRole="button"
            accessibilityLabel="Replay First Light guided tour"
          >
            <Text style={styles.secondaryButtonText}>Replay First Light</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondaryButton} onPress={() => setLegalModal("privacy")}>
          <Text style={styles.secondaryButtonText}>Privacy Policy</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setLegalModal("terms")}>
          <Text style={styles.secondaryButtonText}>Terms of Use</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => Linking.openURL("mailto:admin@ocoeestudios.com")}>
          <Text style={styles.secondaryButtonText}>Contact Support</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => resetSettings().then(() => Alert.alert("Settings", "Local settings reset to safe defaults."))}>
          <Text style={styles.secondaryButtonText}>Reset Settings</Text>
        </Pressable>
      </SettingsSection>

      {/* Brand footer with app icon */}
      <View style={styles.brandFooter}>
        <Image
          source={require("../../assets/icon.png")}
          style={styles.brandIcon}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>AuraLunis</Text>
        <Text style={styles.brandTagline}>Your Time, Written in the Stars</Text>
        <Text style={styles.brandVersion}>v1.0.0 · Ocoee Studios</Text>
        <Text style={styles.brandEmail}>admin@ocoeestudios.com</Text>
      </View>
      {/* Legal modals — in-app, no web hosting needed */}
      <Modal visible={legalModal !== null} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: AuraLunisColors.cosmicBlack }}>
          <Pressable
            style={{ padding: 16, paddingTop: 20, alignItems: "flex-end" }}
            onPress={() => setLegalModal(null)}
          >
            <Text style={{ color: AuraLunisColors.gold, fontSize: 16, fontWeight: "700" }}>Done</Text>
          </Pressable>
          {legalModal === "terms" && <TermsScreen />}
          {legalModal === "privacy" && <PrivacyScreen />}
        </View>
      </Modal>
    </ScreenShell>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, padding: 18, backgroundColor: "rgba(217,168,78,0.08)", borderWidth: 1, borderColor: "rgba(217,168,78,0.18)", marginBottom: 16 },
  heroTagline: { color: AuraLunisColors.gold2, fontSize: 15, fontWeight: "700", marginTop: 12, textAlign: "center" },
  heroCopy: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 21, marginTop: 14, textAlign: "center" },
  syncState: { color: AuraLunisColors.gold2, fontSize: 11, marginTop: 10, textAlign: "center" },
  section: { borderRadius: 24, padding: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", marginBottom: 14 },
  sectionTitle: { color: AuraLunisColors.gold2, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: "900", marginBottom: 10 },
  infoCard: { borderRadius: 20, padding: 14, backgroundColor: "rgba(4,5,11,0.65)", borderWidth: 1, borderColor: "rgba(217,168,78,0.18)" },
  infoTitle: { color: "#FFF", fontSize: 21, fontWeight: "900" },
  infoCopy: { color: AuraLunisColors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  settingRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  settingTitle: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  settingDescription: { color: AuraLunisColors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeTile: { width: "48%", borderRadius: 18, padding: 13, backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  themeTileActive: { backgroundColor: "rgba(217,168,78,0.12)", borderColor: "rgba(217,168,78,0.32)" },
  themeTitle: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  themeSub: { color: AuraLunisColors.muted, fontSize: 11, marginTop: 4 },
  actionButton: { backgroundColor: AuraLunisColors.gold2, borderRadius: 17, paddingVertical: 13, alignItems: "center", marginTop: 14 },
  actionButtonText: { color: "#17100A", fontWeight: "900" },
  secondaryButton: { borderRadius: 17, paddingVertical: 13, paddingHorizontal: 12, alignItems: "center", marginTop: 10, backgroundColor: "rgba(217,168,78,0.10)", borderWidth: 1, borderColor: "rgba(217,168,78,0.22)" },
  secondaryButtonText: { color: "#FFF", fontWeight: "800" },
  dangerButton: { borderRadius: 17, paddingVertical: 13, paddingHorizontal: 12, alignItems: "center", marginTop: 10, backgroundColor: "rgba(255,120,120,0.08)", borderWidth: 1, borderColor: "rgba(255,120,120,0.22)" },
  dangerButtonText: { color: "#FFD2D2", fontWeight: "800" },
  // Dev-only preview button — dashed border marks it as a non-production tool.
  devButton: { borderRadius: 17, paddingVertical: 13, paddingHorizontal: 12, alignItems: "center", marginTop: 10, backgroundColor: "rgba(120,180,255,0.08)", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(120,180,255,0.40)" },
  devButtonText: { color: "#BFD8FF", fontWeight: "800" },
  qualityLabel: { color: "#FFF", fontSize: 14, fontWeight: "800", marginTop: 12 },
  qualityDescription: { color: AuraLunisColors.silver, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 10 },
  segmentRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: "center", backgroundColor: "rgba(217,168,78,0.06)", borderWidth: 1, borderColor: "rgba(217,168,78,0.15)" },
  segmentActive: { backgroundColor: "rgba(217,168,78,0.20)", borderColor: AuraLunisColors.gold2 },
  segmentText: { color: AuraLunisColors.silver, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: AuraLunisColors.gold2 },
  localCount: { color: AuraLunisColors.gold2, fontSize: 12, marginTop: 12 },
  aboutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 20,
    padding: 14,
    marginBottom: 4,
    backgroundColor: "rgba(217,168,78,0.08)",
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.18)"
  },
  aboutTitle: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  aboutCopy: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 19, marginTop: 5 },
  brandFooter: {
    alignItems: "center",
    paddingVertical: 32,
    paddingBottom: 48,
    marginTop: 8,
  },
  brandIcon: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 12,
  },
  brandName: {
    color: AuraLunisColors.gold,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  brandTagline: {
    color: AuraLunisColors.gold,
    fontSize: 10,
    letterSpacing: 1.5,
    opacity: 0.5,
    marginTop: 4,
    fontStyle: "italic",
  },
  brandVersion: {
    color: AuraLunisColors.faint,
    fontSize: 10,
    marginTop: 10,
  },
  brandEmail: {
    color: AuraLunisColors.gold,
    fontSize: 10,
    marginTop: 2,
    opacity: 0.6,
  },
});
