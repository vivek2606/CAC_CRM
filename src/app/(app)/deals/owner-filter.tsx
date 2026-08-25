"use client";

export function OwnerFilter({ owners, value }: { owners: { id: string; name: string }[]; value: string }) {
  return (
    <form className="mb-4" action="/deals">
      <select
        name="owner"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">All sales managers</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </form>
  );
}
