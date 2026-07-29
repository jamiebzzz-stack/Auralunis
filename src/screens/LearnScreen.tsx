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
  const [deepSkyTabIndex, setDeepSkyTabIndex] = useState(0);
  const { prefs, reload } = useLearnPreferences();

  function openLesson(topicId: string) {
    if (!isLearnLessonFree(topicId) && !isPremium) { openPaywall(); return; }
    setOpenTopicId(topicId);
  }

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

  // Skill level is the primary ordering signal; interests break ties.
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
        <Text style={styles.heroCopy} numberOfLines={2}>
          Learn planets, constellations, stars, the Moon, nebulae, galaxies, and the Milky Way through live visuals.
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
        <Text style={styles.preferenceCount}>{getLearnTopicsForLevel(prefs.level).length} lessons</Text>
      </View>

      <Text style={styles.sectionLabel}>Recommended for {levelLabel}</Text>
      <View style={styles.recommendedList}>
        {recommendedTopics.map((topic) => (
          <Pressable
            key={`recommended-${topic.id}`}
            style={styles.recommendedRow}
            onPress={() => openLesson(topic.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${topic.title}`}
          >
            <View style={styles.recommendedText}>
              <Text style={styles.recommendedTitle} numberOfLines={1}>{topic.title}</Text>
              <Text style={styles.recommendedSummary} numberOfLines={1}>{topic.summary}</Text>
            </View>
            <View style={styles.recommendedEnd}>
              <Text style={styles.recommendedLevel}>{isLearnLessonFree(topic.id) || isPremium ? topic.level : "premium"}</Text>
              <Text style={styles.recommendedArrow}>›</Text>
            </View>
          </Pressable>
        ))}
      </View>

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
              <Text style={styles.categoryTitle} numberOfLines={1}>{category.title}</Text>
              <Text style={styles.categoryDescription} numberOfLines={3}>{category.description}</Text>
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
    paddingHorizontal: 2,
    paddingBottom: 14,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(217,168,78,0.18)"
  },
  heroTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  heroCopy: { color: AuraLunisColors.silver, fontSize: 13, lineHeight: 19, marginTop: 6 },
  heroFree: {
    color: AuraLunisColors.gold2,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.35,
    textTransform: "uppercase",
    marginTop: 9
  },
  preferenceCard: {
    minHeight: 66,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 11,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(123,92,246,0.07)",
    borderWidth: 1,
    borderColor: "rgba(123,92,246,0.2)"
  },
  preferenceEyebrow: { color: "#A88BFF", fontSize: 9, fontWeight: "900", letterSpacing: 1.7 },
  preferenceLevel: { color: "#FFF", fontSize: 17, fontWeight: "900", marginTop: 2 },
  preferenceCount: { color: AuraLunisColors.silver, fontSize: 11, fontWeight: "700" },
  sectionLabel: {
    color: AuraLunisColors.gold2,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontWeight: "900",
    marginBottom: 10,
    marginTop: 3
  },
  recommendedList: { marginBottom: 16, gap: 8 },
  recommendedRow: {
    minHeight: 64,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  recommendedText: { flex: 1, paddingRight: 10 },
  recommendedTitle: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  recommendedSummary: { color: AuraLunisColors.muted, fontSize: 11, marginTop: 4 },
  recommendedEnd: { flexDirection: "row", alignItems: "center", gap: 8 },
  recommendedLevel: {
    color: AuraLunisColors.gold2,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.24)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4
  },
  recommendedArrow: { color: AuraLunisColors.gold2, fontSize: 23, lineHeight: 24 },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 18
  },
  categoryCard: {
    width: "48.6%",
    height: 154,
    borderRadius: 20,
    padding: 13,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)"
  },
  categoryCardActive: {
    backgroundColor: "rgba(217,168,78,0.12)",
    borderColor: "rgba(217,168,78,0.42)"
  },
  categoryTopRow: { height: 31, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryIcon: { fontSize: 23, color: AuraLunisColors.gold2 },
  levelMatch: { color: "#A88BFF", fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  categoryTitle: { color: "#FFF", fontSize: 14, fontWeight: "900", marginTop: 7 },
  categoryDescription: { color: AuraLunisColors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  selectedHeader: { marginTop: 2, marginBottom: 10 },
  selectedTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  selectedCopy: { color: AuraLunisColors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }
});