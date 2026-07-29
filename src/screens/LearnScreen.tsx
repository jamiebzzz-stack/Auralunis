import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ScreenShell } from "@/components/ScreenShell";
import { FeatureCard } from "@/components/FeatureCard";
import { AuraLunisColors } from "@/theme/tokens";
import { TAB_BAR_STYLE } from "@/navigation/RootTabs";
import { learnCategories, learnTopics, isLearnLessonFree, FREE_LEARN_LESSON_COUNT } from "@/features/learn/LearnCatalog";
import type { LearnCategoryId } from "@/features/learn/LearnTypes";
import { LearnVisualForCategory } from "@/features/learn/LearnCategoryVisual";
import { useLearnPreferences } from "@/features/learn/learnPreferences";
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

  const { prefs, reload, lastSaveRevision } = useLearnPreferences();
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    navigation.setOptions?.({ tabBarStyle: openTopicId ? { display: "none" } : TAB_BAR_STYLE });
  }, [navigation, openTopicId]);

  const categoryMatchesLevel = useCallback((categoryId: string) => {
    return learnTopics.some((topic) => topic.categoryId === categoryId && topic.level === prefs.level);
  }, [prefs.level]);

  const orderedCategories = useMemo(() => {
    const interestRank = (id: string) => {
      const index = prefs.interests.indexOf(id as (typeof prefs.interests)[number]);
      return index === -1 ? prefs.interests.length + 1 : index;
    };

    return [...learnCategories].sort((a, b) => {
      const aLevelRank = categoryMatchesLevel(a.id) ? 0 : 1;
      const bLevelRank = categoryMatchesLevel(b.id) ? 0 : 1;
      if (aLevelRank !== bLevelRank) return aLevelRank - bLevelRank;

      const interestDifference = interestRank(a.id) - interestRank(b.id);
      if (interestDifference !== 0) return interestDifference;
      return learnCategories.findIndex((category) => category.id === a.id)
        - learnCategories.findIndex((category) => category.id === b.id);
    });
  }, [categoryMatchesLevel, prefs.interests]);

  // Every completed Save deliberately re-opens the first existing category that actually has
  // a lesson at the selected level. This fixes stale cards without adding or redesigning UI.
  useEffect(() => {
    const exactLevelCategory = orderedCategories.find((category) => categoryMatchesLevel(category.id));
    if (exactLevelCategory) {
      setSelectedCategory(exactLevelCategory.id as LearnCategoryId);
    }
    setDeepSkyTabIndex(DEEP_SKY_LEVEL_TAB[prefs.level]);
  }, [categoryMatchesLevel, lastSaveRevision, orderedCategories, prefs.level]);

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

  if (openTopicId) {
    const index = learnTopics.findIndex((topic) => topic.id === openTopicId);
    const topic = learnTopics[index];
    if (topic) {
      const next = learnTopics[(index + 1) % learnTopics.length];
      const categoryTitle =
        learnCategories.find((category) => category.id === topic.categoryId)?.title ?? "Lesson";
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

      <Text style={styles.sectionLabel}>Choose a learning path</Text>
      <View style={styles.categoryGrid}>
        {orderedCategories.map((category) => {
          const active = selectedCategory === category.id;
          return (
            <Pressable
              key={category.id}
              style={[styles.categoryCard, active && styles.categoryCardActive]}
              onPress={() => setSelectedCategory(category.id as LearnCategoryId)}
            >
              <Text style={styles.categoryIcon}>{category.icon}</Text>
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

      <LearnVisualForCategory categoryId={selectedCategory} onDeepSkyTabChange={setDeepSkyTabIndex} />

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
  heroTitle: {
    color: "#FFF",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.8
  },
  heroCopy: {
    color: AuraLunisColors.silver,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8
  },
  heroFree: {
    color: AuraLunisColors.gold2,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 10
  },
  sectionLabel: {
    color: AuraLunisColors.gold2,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontWeight: "900",
    marginBottom: 10
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16
  },
  categoryCard: {
    width: "48%",
    minHeight: 132,
    borderRadius: 22,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)"
  },
  categoryCardActive: {
    backgroundColor: "rgba(217,168,78,0.12)",
    borderColor: "rgba(217,168,78,0.28)"
  },
  categoryIcon: { fontSize: 24, color: AuraLunisColors.gold2 },
  categoryTitle: { color: "#FFF", fontSize: 14, fontWeight: "900", marginTop: 7 },
  categoryDescription: { color: AuraLunisColors.muted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  selectedHeader: {
    marginTop: 4,
    marginBottom: 10
  },
  selectedTitle: { color: "#FFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.7 },
  selectedCopy: { color: AuraLunisColors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }
});
