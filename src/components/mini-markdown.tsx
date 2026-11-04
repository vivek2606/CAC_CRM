import type { ReactNode } from "react";

// A small markdown renderer for text we write ourselves (the Help guide):
// blocks split by blank lines - "### " headings, "- " bullet and "1. "
// numbered lists, "| " tables (second line = separator), paragraphs - and
// **bold** inside. No HTML is passed through.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function MiniMarkdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines[0].startsWith("### ")) {
          return (
            <h3 key={i} className="pt-2 text-sm font-semibold text-slate-900">
              {inline(lines[0].slice(4))}
            </h3>
          );
        }
        if (lines.every((l) => l.trim().startsWith("|"))) {
          const [head, , ...rows] = lines;
          return (
            <div key={i} className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {cells(head).map((c, j) => (
                      <th key={j} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, j) => (
                    <tr key={j} className="align-top">
                      {cells(r).map((c, k) => (
                        <td key={k} className={`px-3 py-2 ${k === 0 ? "font-medium text-slate-800" : ""}`}>
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (lines.every((l) => /^- /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
