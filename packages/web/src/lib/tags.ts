export function matchesAllTags(recordTags: string[], selectedTags: string[]): boolean {
  if (selectedTags.length === 0) return true

  return selectedTags.every((tag) => recordTags.includes(tag))
}

export function getVisibleTags(tags: string[], selectedTags: string[]): string[] {
  if (selectedTags.length === 0) return tags

  return tags.filter((tag) => selectedTags.includes(tag))
}

export function collectUniqueTags(tagGroups: string[][]): string[] {
  return [...new Set(tagGroups.flat())].sort()
}
