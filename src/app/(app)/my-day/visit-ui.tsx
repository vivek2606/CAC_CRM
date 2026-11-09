"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { planVisit, checkInVisit, cancelVisit } from "./visit-actions";

const field = "rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

// Plan a visit: the day and time, who (a customer or a deal), why.
export function PlanVisitForm({ days, options, suggestions }: { days: { value: string; label: string }[]; options: SearchableOption[]; suggestions: { target: string; label: string; why: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState({ date: days.find((d) => d.value >= new Date().toISOString().slice(0, 10))?.value ?? days[0].value, time: "10:00", target: "", purpose: "" });
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const save = (target = v.target, purpose = v.purpose) =>
    start(async () => {
      setError("");
      const res = await planVisit({ ...v, target, purpose });
      if (res.error) return setError(res.error);
      setV((x) => ({ ...x, target: "", purpose: "" }));
      setKey((k) => k + 1);
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Day</span>
          <select value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={field}>
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Time</span>
          <input type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} className={`${field} w-28`} />
        </label>
        <div className="min-w-[220px] flex-1 text-xs text-slate-500">
          <span className="mb-1 block">Customer or deal</span>
          <SearchableSelect key={key} options={options} onSelect={(o) => setV((x) => ({ ...x, target: o?.id ?? "" }))} placeholder="Type a customer or deal..." />
        </div>
        <label className="min-w-[180px] flex-1 text-xs text-slate-500">
          <span className="mb-1 block">Purpose</span>
          <input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} placeholder="e.g. site survey, follow up quote" className={`${field} w-full`} />
        </label>
        <button type="button" onClick={() => save()} disabled={pending} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          Add visit
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {suggestions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Worth a visit - add to the day picked above:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.target}
                type="button"
                disabled={pending}
                onClick={() => save(s.target, s.why)}
                title={s.why}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
              >
                + {s.label} <span className="text-slate-400">· {s.why}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Check in at a visit: a note, and the phone's location if allowed.
export function CheckInButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError("");
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!("geolocation" in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
      });
      const res = await checkInVisit(id, { note, lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null });
      if (res.error) return setError(res.error);
      setOpen(false);
      router.refresh();
    });
  if (!open)
    return (
      <span className="inline-flex gap-2">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">
          <MapPin className="h-3.5 w-3.5" /> Check in
        </button>
        <button
          type="button"
          onClick={() => start(async () => void (await cancelVisit(id), router.refresh()))}
          className="text-xs text-slate-400 hover:text-rose-600"
          title="Didn't happen / not needed"
        >
          Cancel
        </button>
      </span>
    );
  return (
    <span className="flex w-full flex-wrap items-center gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened? (met who, next step)" className={`${field} min-w-[220px] flex-1 py-1.5`} />
      <button type="button" onClick={submit} disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
        {pending ? "Saving..." : "Save visit"}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
