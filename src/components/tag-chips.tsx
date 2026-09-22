// Read-only display for a record's tags - list pages and detail pages both
// just want the chips, not the editable input.
export function TagChips({ tags, className = "" }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5">
          {tag}
        </span>
      ))}
    </div>
  );
}
