// learnPreferences.ts — persisted Learn personalization: skill level + interests.
// Used by the Settings "Learning Preferences" editor and the Learn screen, which sorts
// categories (interests first) and lessons (matching skill level first).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export const LEARN_LEVEL_KEY = "learn_level";
export const LEARN_INTERESTS_KEY = "learn_interests";

export type LearnLevel = "beginner" | "intermediate" | "advanced";
export type LearnInterest = "planets" | "stars" | "constellations" | "deep_sky" | "moon" | "milky_way";

export const LEARN_LEVELS: { key: LearnLevel; label: string }[] = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" }
];

export const LEARN_INTERESTS: { key: LearnInterest; label: string }[] = [
  { key: "planets", label: "Planets" },
  { key: "stars", label: "Stars" },
  { key: "constellations", label: "Constellations" },
  { key: "deep_sky", label: "Deep Sky" },
  { key: "moon", label: "Moon" },
  { key: "milky_way", label: "Milky Way" }
];

export type LearnPreferences = { level: LearnLevel; interests: LearnInterest[] };

const VALID_LEVELS = new Set<string>(LEARN_LEVELS.map((level) => level.key));
const VALID_INTERESTS = new Set<string>(LEARN_INTERESTS.map((interest) => interest.key));
const ALL_INTERESTS = LEARN_INTERESTS.map((interest) => interest.key);

export const DEFAULT_LEARN_PREFERENCES: LearnPreferences = {
  level: "beginner",
  interests: [...ALL_INTERESTS]
};

type LearnPreferencesListener = (preferences: LearnPreferences, saveRevision: number) => void;
const listeners = new Set<LearnPreferencesListener>();
let saveRevision = 0;

function normalizeInterests(value: unknown): LearnInterest[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<LearnInterest>();
  for (const item of value) {
    if (typeof item === "string" && VALID_INTERESTS.has(item)) unique.add(item as LearnInterest);
  }
  return [...unique];
}

function publish(preferences: LearnPreferences) {
  saveRevision += 1;
  for (const listener of listeners) listener(preferences, saveRevision);
}

export function subscribeLearnPreferences(listener: LearnPreferencesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadLearnPreferences(): Promise<LearnPreferences> {
  try {
    const entries = await AsyncStorage.multiGet([LEARN_LEVEL_KEY, LEARN_INTERESTS_KEY]);
    const stored = new Map(entries);
    const rawLevel = stored.get(LEARN_LEVEL_KEY);
    const rawInterests = stored.get(LEARN_INTERESTS_KEY);

    const level = rawLevel && VALID_LEVELS.has(rawLevel)
      ? (rawLevel as LearnLevel)
      : DEFAULT_LEARN_PREFERENCES.level;

    let interests: LearnInterest[] = [];
    if (rawInterests) {
      try {
        interests = normalizeInterests(JSON.parse(rawInterests));
      } catch {
        interests = [];
      }
    }

    return {
      level,
      interests: interests.length ? interests : [...DEFAULT_LEARN_PREFERENCES.interests]
    };
  } catch {
    return {
      level: DEFAULT_LEARN_PREFERENCES.level,
      interests: [...DEFAULT_LEARN_PREFERENCES.interests]
    };
  }
}

export async function saveLearnPreferences(preferences: LearnPreferences): Promise<boolean> {
  const interests = normalizeInterests(preferences.interests);
  if (!VALID_LEVELS.has(preferences.level) || interests.length === 0) return false;

  const normalized: LearnPreferences = { level: preferences.level, interests };
  try {
    await AsyncStorage.multiSet([
      [LEARN_LEVEL_KEY, normalized.level],
      [LEARN_INTERESTS_KEY, JSON.stringify(normalized.interests)]
    ]);
    publish(normalized);
    return true;
  } catch {
    return false;
  }
}

export async function saveLearnLevel(level: LearnLevel): Promise<boolean> {
  const current = await loadLearnPreferences();
  return saveLearnPreferences({ ...current, level });
}

export async function saveLearnInterests(interests: LearnInterest[]): Promise<boolean> {
  const current = await loadLearnPreferences();
  return saveLearnPreferences({ ...current, interests });
}

export function useLearnPreferences() {
  const [prefs, setPrefs] = useState<LearnPreferences>({
    level: DEFAULT_LEARN_PREFERENCES.level,
    interests: [...DEFAULT_LEARN_PREFERENCES.interests]
  });
  const [lastSaveRevision, setLastSaveRevision] = useState(0);

  const reload = useCallback(async () => {
    const next = await loadLearnPreferences();
    setPrefs(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    void loadLearnPreferences().then((next) => {
      if (active) setPrefs(next);
    });
    const unsubscribe = subscribeLearnPreferences((next, revision) => {
      if (!active) return;
      setPrefs(next);
      setLastSaveRevision(revision);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { prefs, reload, lastSaveRevision };
}
