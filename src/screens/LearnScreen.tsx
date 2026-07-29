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

const DEEP_SKY_TOPIC_TAB: Record<string, number> = {
  nebulae: 0,
  galaxies: 1,
  clusters: 2,
  remnants: 3
};

export function LearnScreen() {
  const navigation = useNavigation<any>();
  const { isPremium } = useEntitlement();
  const { openPaywall } = usePaywallNavigation();
  const [selectedCategory, setSelectedCategory] = useState<LearnCategoryId>("solar_system");
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);
  const [deepSkyTabIndex, setDeepSkyTabIndex] = useState(0);
  const { prefs, reload } = useLearnPreferences();

  function openLesson(topicId: string) {
    if (!isLearnLessonFree(topicId) && !isPremium) {
      openPaywall();
      return;
    }
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

  // This is the visible curriculum deck. Switching Beginner / Intermediate / Advanced
  // replaces the cards themselves; it does not merely reorder a static category grid.
  const levelTopics = useMemo(() => {
    return [...getLearnTopicsForLevel(prefs.level)].sort((a, b) => {
      const interestDifference = selectedInterestRank(a.categoryId) - selectedInterestRank(b.categoryId);
      if (interestDifference !== 0) return interestDifference;
      return learnTopics.findIndex((topic) => topic.id === a.id)
        - learnTopics.findIndex((topic) => topic.id === b.id);
    });
  }, [prefs.level, selectedInterestRank]);

  // Only show topic filters that actually contain a lesson at the selected level.
  // Advanced therefore cannot silently fall back to Beginner cards.
  const availableCategories = useMemo(() => {
    return learnCategories
      .filter((category) => categoryHasLearnLevel(category.id, prefs.level))
      .sort((a, b) => {
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

    const firstTopic = levelTopics[0];
    const firstCategory = availableCategories[0];
    if (firstCategory) setSelectedCategory(firstCategory.id as LearnCategoryId);
    if (firstTopic?.categoryId === "deep_sky") {
      setDeepSkyTabIndex(DEEP_SKY_TOPIC_TAB[firstTopic.id] ?? 0);
    }
  }, [availableCategories, levelTopics, prefs.interests, prefs.level]);

  const selectedTopics = useMemo(() => {
    const exactLevelTopics = levelTopics.filter((topic) => topic.categoryId === selectedCategory);
    if (selectedCategory !== "deep_sky") return exactLevelTopics;

    const wantedId = ["nebulae", "galaxies", "clusters", "remnants"][deepSkyTabIndex];
    const matchingTab = exactLevelTopics.filter((topic) => topic.id === wantedId);
    return matchingTab.length > 0 ? matchingTab : exactLevelTopics.slice(0, 1);
  }, [deepSkyTabIndex, levelTopics, selectedCategory]);

  const selectedMeta = availableCategories.find((category) => category.id === selectedCategory)
    ?? availableCategories[0];
  const levelLabel = LEARN_LEVEL_LABELS[prefs.level];

  if (openTopicId) {
    const index = learnTopics.findIndex((topic) => topic.id === openTopicId);
    const topic = learnTopics[index];
    if (topic) {
      const nextAtLevel = levelTopics[(levelTopics.findIndex((item) => item.id === topic.id) + 1) % Math.max(1, levelTopics.length)];
      const next = nextAtLevel ?? learnTopics[(index + 1) % learnTopics.length];
      const categoryTitle = learnCategories.find((category) => category.id === topic.categoryId)?.title ?? "Lesson";
      return (
        <LearnDetailScreen
          topic={topic}
          categoryTitle={categoryTitle}
          nextTopicTitle={next && next.id !== topic.id ? next.title : null}
          onBack={() => setOpenTopicId(null)}
          onNext={() => next && openLesson(next.id)}
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
          Choose your level and see a curriculum built specifically for it.
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
        <Text style={styles.preferenceCount}>{levelTopics.length} lessons</Text>
      </View>

      <Text style={styles.sectionLabel}>{levelLabel} lessons</Text>
      <View style={styles.levelLessonGrid}>
        {levelTopics.map((topic) => {
          const category = learnCategories.find((item) => item.id === topic.categoryId);
          const unlocked = isLearnLessonFree(topic.id) || isPremium;
          return (
            <Pressable
              key={`level-${topic.id}`}
              style={styles.levelLessonCard}
              onPress={() => openLesson(topic.id)}
              accessibilityRole="button"
              accessibilityLabel={`${unlocked ? "Open" : "Unlock"} ${topic.title}`}
            >
              <View style={styles.levelLessonTop}>
                <Text style={styles.levelLessonIcon}>{category?.icon ?? "✦"}</Text>
                <Text style={styles.levelLessonBadge}>{unlocked ? levelLabel : "Premium"}</Text>
              </View>
              <Text style={styles.levelLessonTitle} numberOfLines={2}>{topic.title}</Text>
              <Text style={styles.levelLessonSummary} numberOfLines={3}>{topic.summary}</Text>
              <Text style={styles.levelLessonAction}>{unlocked ? "Open lesson  ›" : "Unlock lesson  ›"}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Explore {levelLabel.toLowerCase()} topics</Text>
      <View style={styles.categoryChips}>
        {availableCategories.map((category) => {
          const active = selectedCategory === category.id;
          return (
            <Pressable
              key={category.id}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => {
                setSelectedCategory(category.id as LearnCategoryId);
                if (category.id === "deep_sky") {
                  const firstTopic = levelTopics.find((topic) => topic.categoryId === "deep_sky");
                  setDeepSkyTabIndex(DEEP_SKY_TOPIC_TAB[firstTopic?.id ?? ""] ?? 0);
                }
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={styles.categoryChipIcon}>{category.icon}</Text>
              <Text style={styles.categoryChipText}>{category.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedMeta && (
        <>
          <View style={styles.selectedHeader}>
            <Text style={styles.selectedTitle}>{selectedMeta.title}</Text>
            <Text style={styles.selectedCopy}>{selectedMeta.description}</Text>
          </View>

          <LearnVisualForCategory
            categoryId={selectedMeta.id as LearnCategoryId}
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
        </>
      )}
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
  levelLessonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 18
  },
  levelLessonCard: {
    width: "48.6%",
    height: 184,
    borderRadius: 20,
    padding: 13,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.18)"
  },
  levelLessonTop: {
    height: 29,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  levelLessonIcon: { color: AuraLunisColors.gold2, fontSize: 22 },
  levelLessonBadge: {
    color: AuraLunisColors.gold2,
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(217,168,78,0.24)",
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  levelLessonTitle: { color: "#FFF", fontSize: 15, lineHeight: 18, fontWeight: "900", marginTop: 7 },
  levelLessonSummary: { color: AuraLunisColors.muted, fontSize: 11, lineHeight: 15, marginTop: 6 },
  levelLessonAction: {
    color: AuraLunisColors.gold2,
    fontSize: 10,
    fontWeight: "900",
    marginTop: "auto",
    paddingTop: 8
  },
  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18
  },
  categoryChip: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)"
  },
  categoryChipActive: {
    backgroundColor: "rgba(217,168,78,0.13)",
    borderColor: "rgba(217,168,78,0.5)"
  },
  categoryChipIcon: { color: AuraLunisColors.gold2, fontSize: 18 },
  categoryChipText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  selectedHeader: { marginTop: 2, marginBottom: 10 },
  selectedTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  selectedCopy: { color: AuraLunisColors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }
});