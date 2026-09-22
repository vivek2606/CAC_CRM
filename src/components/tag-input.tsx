"use client";

import { useState } from "react";
import { X } from "lucide-react";

// Freeform chip input - type a label and press Enter or comma to add it,
// click the x to remove. Submits as one comma-separated hidden field
// (parsed back into an array by parseTagsInput on the server), so this
// works as a drop-in inside any plain <form action=...> without extra
// client-side form wiring.
export function TagInput({ name = "tags", defaultValue = [] }: { name?: string; defaultValue?: string[] }) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    setTags((prev) => (prev.some((t) => t.toLowerCase() === tag.toLowerCase()) ? prev : [...prev, tag]));
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={tags.join(",")} />
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5"
          >
            {tag}
            <button
              type="button"
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="hover:text-indigo-900"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={tags.length === 0 ? "Type a tag and press Enter..." : "Add another..."}
          className="flex-1 min-w-[120px] text-sm outline-none py-0.5"
        />
      </div>
    </div>
  );
}
