export type LearnCategoryId =
  | "solar_system"
  | "moon"
  | "planets"
  | "constellations"
  | "stars"
  | "deep_sky"
  | "milky_way"
  | "beginner_path";

/**
 * The four Deep Sky subject tabs, in the order the Deep Sky visual renders them
 * (Nebula · Galaxy · Cluster · Remnant). A deep_sky lesson is addressed by
 * (subject, level) rather than by a hardcoded lesson id, so every tab has content
 * at every level and no tab can render blank.
 */
export type DeepSkySubject = "nebulae" | "galaxies" | "clusters" | "remnants";

export type LearnLevel = "beginner" | "intermediate" | "advanced";

export interface LearnTopic {
  id: string;
  categoryId: LearnCategoryId;
  title: string;
  level: LearnLevel;
  summary: string;
  /** Full lesson body — a few real paragraphs (textbook content, not a placeholder). */
  body?: string;
  keyFacts: string[];
  /** Which Deep Sky tab this lesson belongs to. Required for deep_sky, unused elsewhere. */
  deepSkySubject?: DeepSkySubject;
  skyLensAction?: string;
  archiveAction?: string;
  /** When set, "Try in Sky Lens" deep-links to Find Mode on this RA/Dec target. */
  skyTarget?: {
    raHours: number;
    decDegrees: number;
    name: string;
    subtitle?: string;
    description?: string;
  };
}
