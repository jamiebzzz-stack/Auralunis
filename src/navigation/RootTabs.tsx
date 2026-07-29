import React from "react";
import { Platform, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { AuraLunisColors } from "@/theme/tokens";
import { HomeScreen } from "@/screens/HomeScreen";
import { SkyScreen } from "@/screens/SkyScreen";
import { LearnScreen } from "@/screens/LearnScreen";
import { VaultScreen } from "@/screens/VaultScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

let BlurTab: React.ComponentType<{ intensity?: number; tint?: string; style?: object; children?: React.ReactNode }> | null = null;
try {
  const ExpoBlur = require("expo-blur") as { BlurView: typeof BlurTab };
  if (Platform.OS === "ios") BlurTab = ExpoBlur.BlurView;
} catch { /* fallback */ }

function TabBarBackground() {
  const fill = { position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 };
  if (BlurTab) {
    return (
      <View style={[fill, { overflow: "hidden", backgroundColor: "#070A13" }]}>
        <BlurTab intensity={42} tint="dark" style={fill} />
        <View style={[fill, { backgroundColor: "rgba(7,10,19,0.92)" }]} />
      </View>
    );
  }
  return <View style={[fill, { backgroundColor: "rgba(7,10,19,0.98)" }]} />;
}

export type RootTabParamList = {
  Home: undefined;
  Sky: undefined;
  Learn: undefined;
  Vault: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// The bar participates in layout instead of floating over the ScrollView. Full-screen
// experiences still hide it explicitly, but normal screens never lose content beneath it.
export const TAB_BAR_STYLE = {
  backgroundColor: "#070A13",
  borderTopColor: "rgba(217,168,78,0.18)",
  height: 82,
  paddingBottom: 18,
  paddingTop: 8,
  overflow: "hidden" as const
};

const icons: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Sky: "moon-outline",
  Learn: "book-outline",
  Vault: "bookmark-outline",
  Settings: "settings-outline"
};

export function RootTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: { name: keyof RootTabParamList } }) => ({
        headerShown: false,
        tabBarAccessibilityLabel: `${route.name} tab`,
        tabBarStyle: TAB_BAR_STYLE,
        tabBarHideOnKeyboard: true,
        tabBarBackground: () => <TabBarBackground />,
        tabBarActiveTintColor: AuraLunisColors.gold2,
        tabBarInactiveTintColor: AuraLunisColors.muted,
        tabBarIcon: ({ color, size }: { color: string; size: number }) => (
          <Ionicons name={icons[route.name]} color={color} size={size} />
        )
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Sky" component={SkyScreen} />
      <Tab.Screen name="Learn" component={LearnScreen} />
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}