// AuraLunis Design System — from the approved brand guide.
// Colors, typography, and spacing tokens used across all screens.

export const AuraLunisColors = {
  // Primary palette (from brand guide)
  cosmicBlack: "#030816",
  midnightNavy: "#071225",
  deepIndigo: "#0B1630",
  gold: "#D9A84E",        // Astral Gold — primary accent
  silver: "#C0C6D4",      // Moon Silver — secondary text
  violet: "#7B5CF6",      // Nebula Violet — accent highlight

  // Extended palette
  gold2: "#FFF6D6",       // Light gold for highlights
  goldDim: "#C7A66A",     // Muted gold for borders
  muted: "#A8AFBF",       // Muted text
  faint: "#747D90",       // Faint labels

  // Backgrounds
  background: "#030816",  // App background (Cosmic Black)
  surface: "#071225",     // Card/panel surface (Midnight Navy)
  elevated: "#0B1630",    // Elevated surface (Deep Indigo)

  // Borders
  borderGold: "rgba(217,168,78,0.34)",
  borderSubtle: "rgba(192,198,212,0.12)",
  borderFaint: "rgba(255,255,255,0.06)",

  // Glass panel
  glassBackground: "rgba(18,26,44,0.74)",
  glassBorder: "rgba(212,175,55,0.28)",
  glassHighlight: "rgba(255,255,255,0.08)",

  // Backward-compatible aliases (referenced by existing screens)
  orange: "#EF9F27",
  blue: "#78C8FF",
  green: "#4ADE80",
  black: "#030816",
  starlight: "#FFF6D6"
} as const;

export const AuraLunisTypography = {
  display: {
    fontFamily: "Cinzel_400Regular",
    fallback: "Georgia"
  },
  body: {
    fontFamily: "PlayfairDisplay_400Regular",
    medium: "PlayfairDisplay_500Medium",
    fallback: "System"
  }
} as const;

export const AuraLunisSpacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
  screenPadding: 16,
  cardRadius: 22,
  buttonRadius: 14
} as const;

export const AuraLunisTaglines = [
  "Time moves. The cosmos remembers.",
  "Your Time, Written in the Stars",
  "Explore time. Align with the universe.",
  "The universe is now in your hands."
] as const;

export interface AuraLunisThemePalette {
  background: string;
  surface: string;
  accent: string;
  text: string;
  muted: string;
  gradient: string[];
}

export const AuraLunisThemes: Record<string, AuraLunisThemePalette> = {
  system: { background: "#030816", surface: "#071225", accent: "#D9A84E", text: "#F8F4EA", muted: "#A8AFBF", gradient: ["#030816", "#071225"] },
  midnight_gold: { background: "#030816", surface: "#071225", accent: "#D9A84E", text: "#F8F4EA", muted: "#A8AFBF", gradient: ["#030816", "#071225"] },
  soft_moon: { background: "#14182A", surface: "#1E2640", accent: "#C0C6D4", text: "#F0F2F8", muted: "#8E96A8", gradient: ["#14182A", "#1E2640"] },
  deep_space: { background: "#040408", surface: "#0A0C18", accent: "#7B5CF6", text: "#E8E4F0", muted: "#6E6E8A", gradient: ["#040408", "#0A0C18"] }
};

export const AuraLunisPricing = {
  // Legacy subscription values remain for existing-subscriber surfaces only. New customers
  // are offered Lifetime only. StoreKit/RevenueCat localized pricing is the runtime source of truth.
  monthly: "$9.99/month",
  monthlySubtitle: "Legacy monthly subscription",
  annual: "$49.99/year",
  annualMonthly: "$4.17/month",
  annualSavings: "",
  annualSubtitle: "Legacy annual subscription",

  // Current new-customer Lifetime fallback. Must match App Store Connect.
  lifetime: "$29.99",
  lifetimeSubtitle: "One-time purchase · Forever",
  lifetimeBadge: "BEST VALUE",

  freeDriftEventLimit: 5,
} as const;
