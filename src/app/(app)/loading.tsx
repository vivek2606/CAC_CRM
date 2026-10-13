// Shown the moment a page is opened, while its data loads - so a click
// responds straight away instead of the old page sitting there.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6 py-4 sm:py-5">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3.5 w-72 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${92 - i * 7}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
