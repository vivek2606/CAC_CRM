// Shared by every create/update action for a taggable record (Account,
// Lead, Deal) - the TagInput component always submits tags as one
// comma-separated hidden field, so parsing them back into a clean array is
// identical everywhere.
export function parseTagsInput(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}
