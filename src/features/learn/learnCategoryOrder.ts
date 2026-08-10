// learnCategoryOrder.ts — presentation ordering rules for Learn categories.
//
// Personalized interests still decide the broad order. Black Holes is the one editorial
// adjacency we keep stable because it continues the Stars → stellar evolution story. Existing
// users do not have a persisted `black_holes` interest (the category was added later), so without
// this small post-pass it falls to the unranked tail of the grid even though LearnCatalog places
// it directly after Stars.

export function keepBlackHolesAfterStars<T extends { id: string }>(categories: readonly T[]): T[] {
  const ordered = [...categories];
  const starsIndex = ordered.findIndex((category) => category.id === "stars");
  const blackHolesIndex = ordered.findIndex((category) => category.id === "black_holes");

  if (starsIndex === -1 || blackHolesIndex === -1 || blackHolesIndex === starsIndex + 1) {
    return ordered;
  }

  const [blackHoles] = ordered.splice(blackHolesIndex, 1);
  const updatedStarsIndex = ordered.findIndex((category) => category.id === "stars");
  ordered.splice(updatedStarsIndex + 1, 0, blackHoles);
  return ordered;
}
