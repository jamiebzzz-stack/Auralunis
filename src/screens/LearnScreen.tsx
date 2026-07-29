import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ScreenShell } from "@/components/ScreenShell";
import { FeatureCard } from "@/components/FeatureCard";
import { AuraLunisColors } from "@/theme/tokens";
import { TAB_BAR_STYLE } from "@/navigation/RootTabs";
import {
  categoryHasLearnLevel,
  FREE_LEARN_LESSON_COUNT,
  getLearnTopicsForLevel,
  isLearnLessonFree,
  LEARN_LEVEL_LABELS,
  learnCategories,
  learnTopics
} from "@/features/learn/LearnCatalog";
import type { LearnCategoryId } from "@/features/learn/LearnTypes";
import { LearnVisualForCategory } from "@/features/learn/LearnCategoryVisual";
import { LEARN_INTERESTS, useLearnPreferences } from "@/features/learn/learnPreferences";
import { LearnDetailScreen } from "@/screens/LearnDetailScreen";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePaywallNavigation } from "@/context/PaywallNavigationContext";

const DEEP_SKY_LEVEL_TAB = {
  beginner: 0,
  intermediate: 2,
  advanced: 1
} as const;

export function LearnScreen() {
  const navigation = useNavigation<any>();
  const { isPremium } = useEntitlement();
  const { openPaywall } = usePaywallNavigation();
  const [selectedCategory, setSelectedCategory] = useState<LearnCategoryId>("solar_system");
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  function openLesson(topicId: string) {
    if (!isLearnLessonFree(topicId) && !isPremium) { openPaywall(); return; }
    setOpenTopicId(topicId);
  }

  const [deepSkyTabIndex, setDeepSkyTabIndex] = useState(0);
  const { prefs, reload } = useLearnPreferences();
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    navigation.setOptions?.({ tabBarStyle: openTopicId ? { display: "none" } : TAB_BAR_STYLE });
  }, [navigation, openTopicId]);

  const selectedInterestRank = useCallback((categoryId: string) => {
    if (prefs.interests.length === LEARN_INTERESTS.length) return 0;
    const index = prefs.interests.indexOf(categoryId as (typeof prefs.interests)[number]);
    return index === -1 ? prefs.interests.length + 1 : index;
  }, [prefs.interests]);

  const orderedCategories = useMemo(() => {
    return [...learnCategories].sort((a, b) => {
      const aLevelRank = categoryHasLearnLevel(a.id, prefs.level) ? 0 : 1;
      const bLevelRank = categoryHasLearnLevel(b.id, prefs.level) ? 0 : 1;
      if (aLevelRank !== bLevelRank) return aLevelRank - bLevelRank;

      const interestDifference = selectedInterestRank(a.id) - selectedInterestRank(b.id);
      if (interestDifference !== 0) return interestDifference;
      return learnCategories.findIndex((category) => category.id === a.id)
        - learnCategories.findIndex((category) => category.id === b.id);
    });
  }, [prefs.level, selectedInterestRank]);

  const appliedPreferenceSignature = useRef("");
  useEffect(() => {
    const signature = `${prefs.level}:${prefs.interests.join(",")}`;
    if (appliedPreferenceSignature.current === signature) return;
    appliedPreferenceSignature.current = signature;

    const firstCategory = orderedCategories[0];
    if (firstCategory) setSelectedCategory(firstCategory.id as LearnCategoryId);
    setDeepSkyTabIndex(DEEP_SKY_LEVEL_TAB[prefs.level]);
  }, [orderedCategories, prefs.interests, prefs.level]);

  const recommendedTopics = useMemo(() => {
    const matching = getLearnTopicsForLevel(prefs.level);
    return [...matching]
      .sort((a, b) => selectedInterestRank(a.categoryId) - selectedInterestRank(b.categoryId))
      .slice(0, 3);
  }, [prefs.level, selectedInterestRank]);

  const selectedTopics = useMemo(() => {
    const inCategory = learnTopics.filter((topic) => topic.categoryId === selectedCategory);
    if (selectedCategory === "deep_sky") {
      const wantId = ["nebulae", "galaxies", "clusters", "remnants"][deepSkyTabIndex];
      return inCategory.filter((topic) => topic.id === wantId);
    }
    return [...inCategory].sort((a, b) => {
      const aMatch = a.level === prefs.level ? 0 : 1;
      const bMatch = b.level === prefs.level ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [selectedCategory, deepSkyTabIndex, prefs.level]);

  const selectedMeta = learnCategories.find((category) => category.id === selectedCategory);
  const levelLabel = LEARN_LEVEL_LABELS[prefs.level];

  if (openTopicId) {
    const index = learnTopics.findIndex((topic) => topic.id === openTopicId);
    const topic = learnTopics[index];
    if (topic) {
      const next = learnTopics[(index + 1) % learnTopics.length];
      const categoryTitle = learnCategories.find((category) => category.id === topic.categoryId)?.title ?? "Lesson";
      return (
        <LearnDetailScreen
          topic={topic}
          categoryTitle={categoryTitle}
          nextTopicTitle={next && next.id !== topic.id ? next.title : null}
          onBack={() => setOpenTopicId(null)}
          onNext={() => openLesson(next.id)}
          onOpenSkyLens={() => {
            setOpenTopicId(null);
            navigation.navigate("Sky", topic.skyTarget ? { focusTarget: topic.skyTarget } : undefined);
          }}
        />
      );
    }
  }

  return (
    <ScreenShell title="Learn the Cosmos" subtitle="Education">
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>A living astronomy guide.</Text>
        <Text style={styles.heroCopy}>
          Learn planets, constellations, stars, the Moon, nebulae, galaxies, and the Milky Way
          through real live visuals instead of static blocks alone.
        </Text>
        <Text style={styles.heroFree}>
          {isPremium
            ? "All lessons unlocked."
            : `${FREE_LEARN_LESSON_COUNT} free starter lessons · unlock the rest with Premium.`}
        </Text>
      </View>

      <View style={styles.preferenceCard}>
        <View>
          <Text style={styles.preferenceEyebrow}>YOUR LEARNING LEVEL</Text>
          <Text style={styles.preferenceLevel}>{levelLabel}</Text>
        </View>
        <Text style={styles.preferenceCount}>{getLearnTopicsForLevel(prefs.level).length} matching lessons</Text>
      </View>

      <Text style={styles.sectionLabel}>Recommended for {levelLabel}</Text>
      {recommendedTopics.map((topic) => (
        <FeatureCard
          key={`recommended-${topic.id}`}
          title={topic.title}
          description={topic.summary}
          actionLabel={isLearnLessonFree(topic.id) || isPremium ? "Open Lesson" : "✦ Unlock Lesson"}
          onPress={() => openLesson(topic.id)}
          status={isLearnLessonFree(topic.id) || isPremium ? topic.level : "premium"}
        />
      ))}

      <Text style={styles.sectionLabel}>Choose a learning path</Text>
      <View style={styles.categoryGrid}>
        {orderedCategories.map((category) => {
          const active = selectedCategory === category.id;
          const matchesLevel = categoryHasLearnLevel(category.id, prefs.level);
          return (
            <Pressable
              key={category.id}
              style={[styles.categoryCard, active && styles.categoryCardActive]}
              onPress={() => setSelectedCategory(category.id as LearnCategoryId)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.categoryTopRow}>
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                {matchesLevel && <Text style={styles.levelMatch}>FOR YOU</Text>}
              </View>
              <Text style={styles.categoryTitle}>{category.title}</Text>
              <Text style={styles.categoryDescription}>{category.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.selectedHeader}>
        <Text style={styles.selectedTitle}>{selectedMeta?.title}</Text>
        <Text style={styles.selectedCopy}>{selectedMeta?.description}</Text>
      </View>

      <LearnVisualForCategory
        categoryId={selectedCategory}
        deepSkyActiveIndex={deepSkyTabIndex}
        onDeepSkyTabChange={setDeepSkyTabIndex}
      />

      {selectedTopics.map((topic) => (
        <FeatureCard
          key={topic.id}
          title={topic.title}
          description={`${topic.summary}\n\nKey facts:\n• ${topic.keyFacts.join("\n• ")}`}
          actionLabel={isLearnLessonFree(topic.id) || isPremium ? "Open Lesson" : "✦ Unlock Lesson"}
          onPress={() => openLesson(topic.id)}
          status={isLearnLessonFree(topic.id) || isPremium ? topic.level : "premium"}
        />
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: "rgba(217,168,78,0.08)",
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.18)",
    marginBottom: 16
  },
  heroTitle: { color: "#FFF", fontSize: 25, fontWeight: "900", letterSpacing: -0.8 },
  heroCopy: { color: AuraLunisColors.silver, fontSize: 14, lineHeight: 21, marginTop: 8 },
  heroFree: {
    color: AuraLunisColors.gold2,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 10
  },
  preferenceCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(123,92,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(123,92,246,0.2)"
  },
  preferenceEyebrow: { color: "#A88BFF", fontSize: 9, fontWeight: "900", letterSpacing: 1.7 },
  preferenceLevel: { color: "#FFF", fontSize: 18, fontWeight: "900", marginTop: 3 },
  preferenceCount: { color: AuraLunisColors.silver, fontSize: 11, fontWeight: "700" },
  sectionLabel: {
    color: AuraLunisColors.gold2,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontWeight: "900",
    marginBottom: 10,
    marginTop: 4
  },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  categoryCard: {
    width: "48%",
    minHeight: 132,
    borderRadius: 22,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)"
  },
  categoryCardActive: { backgroundColor: "rgba(217,168,78,0.12)", borderColor: "rgba(217,168,78,0.28)" },
  categoryTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryIcon: { fontSize: 24, color: AuraLunisColors.gold2 },
  levelMatch: { color: "#A88BFF", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  categoryTitle: { color: "#FFF", fontSize: 14, fontWeight: "900", marginTop: 7 },
  categoryDescription: { color: AuraLunisColors.muted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  selectedHeader: { marginTop: 4, marginBottom: 10 },
  selectedTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  selectedCopy: { color: AuraLunisColors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }
});