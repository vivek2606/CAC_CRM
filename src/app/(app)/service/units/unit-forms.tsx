"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { SearchableSelect, type SearchableOption } from "@/components/searchable-select";
import { addInstalledUnit, refreshInstalledUnits, updateInstalledUnit, type NewUnitInput } from "../base-actions";

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "-");

export function RefreshUnitsButton() {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs text-emerald-700">{note}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await refreshInstalledUnits();
            setNote(res.error ?? `${res.added ?? 0} new unit line${res.added === 1 ? "" : "s"} added from sales`);
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title="Add units from sales won since the last refresh (also done every night)"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Refresh from sales
      </button>
    </div>
  );
}

type Unit = {
  id: string;
  customerName: string;
  accountId: string | null;
  dealId: string | null;
  model: string;
  qty: number;
  invoiceNo: string | null;
  invoiceDate: string;
  warrantyUntil: string;
  warrantyMonths: number;
  serialNos: string[];
  siteAddress: string;
  phone: string;
  installedAt: string;
  notes: string;
  amc: { id: string; ref: string; until: string; active: boolean } | null;
};

export function UnitRow({ u, today }: { u: Unit; today: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  // One serial no. per unit, in order.
  const slots = Array.from({ length: Math.max(u.qty, u.serialNos.length) }, (_, i) => u.serialNos[i] ?? "");
  const filled = u.serialNos.filter((x) => x.trim()).length;
  const [v, setV] = useState({ serialNos: slots, siteAddress: u.siteAddress, phone: u.phone, installedAt: u.installedAt, warrantyMonths: u.warrantyMonths, notes: u.notes });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const days = u.warrantyUntil ? Math.round((Date.parse(u.warrantyUntil) - Date.parse(today)) / 86400000) : null;
  const badge =
    days == null ? (
      <span className="text-slate-400">No invoice date</span>
    ) : days < 0 ? (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Ended {dmy(u.warrantyUntil)}</span>
    ) : (
      <span className={`rounded-full px-2 py-0.5 font-medium ${days <= 60 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
        Until {dmy(u.warrantyUntil)}
        {days <= 60 ? ` (${days} d)` : ""}
      </span>
    );
  const offer = `/service/amc/new?unit=${u.id}`;
  return (
    <>
      <tr className="align-top">
        <td className="py-2 pr-3 text-slate-800">
          {u.dealId ? (
            <Link href={`/deals/${u.dealId}`} className="hover:text-indigo-600">
              {u.customerName}
            </Link>
          ) : (
            u.customerName
          )}
        </td>
        <td className="py-2 pr-3 text-slate-700">
          {u.qty} × {u.model}
        </td>
        <td className="py-2 pr-3 text-xs text-slate-600 whitespace-nowrap">
          {u.invoiceNo ?? "-"}
          <div className="text-slate-400">{dmy(u.invoiceDate)}</div>
        </td>
        <td className="py-2 pr-3 text-xs whitespace-nowrap">
          {badge}
          {u.warrantyMonths !== 12 && <div className="mt-0.5 text-slate-400">{u.warrantyMonths} months</div>}
        </td>
        <td className="py-2 pr-3 text-xs whitespace-nowrap">
          {u.amc ? (
            <Link href={`/service/amc/${u.amc.id}`} className={u.amc.active ? "font-medium text-indigo-600" : "text-slate-400 line-through"}>
              {u.amc.ref}
            </Link>
          ) : (
            <Link href={offer} className="font-medium text-amber-700 hover:text-amber-600">
              Offer AMC
            </Link>
          )}
        </td>
        <td className="py-2 pr-3 text-xs text-slate-600 max-w-[260px]">
          {filled ? (
            <div className="truncate" title={u.serialNos.filter(Boolean).join(", ")}>
              S/N {u.serialNos.filter(Boolean).join(", ")}
            </div>
          ) : null}
          {filled < u.qty && (
            <button type="button" onClick={() => setEdit(true)} className="font-medium text-amber-700 hover:text-amber-600">
              {u.qty - filled} serial {u.qty - filled === 1 ? "no." : "nos."} to fill
            </button>
          )}
          {u.siteAddress && <div className="truncate text-slate-400">{u.siteAddress}</div>}
        </td>
        <td className="py-2 text-right">
          <button type="button" onClick={() => setEdit(!edit)} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
            {edit ? "Close" : "Edit"}
          </button>
        </td>
      </tr>
      {edit && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-3 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-full text-xs text-slate-500">
                <span className="mb-1 block">Serial no. of each unit ({u.qty} × {u.model})</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {v.serialNos.map((sn, i) => (
                    <input
                      key={i}
                      value={sn}
                      onChange={(e) => setV({ ...v, serialNos: v.serialNos.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder={`Unit ${i + 1}`}
                      aria-label={`Serial no. unit ${i + 1}`}
                      className={`${field} w-full`}
                    />
                  ))}
                </div>
              </div>
              <label className="min-w-[200px] flex-1 text-xs text-slate-500">
                <span className="mb-1 block">Site address</span>
                <input value={v.siteAddress} onChange={(e) => setV({ ...v, siteAddress: e.target.value })} className={`${field} w-full`} />
              </label>
              <label className="text-xs text-slate-500">
                <span className="mb-1 block">Phone</span>
                <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={`${field} w-36`} />
              </label>
              <label className="text-xs text-slate-500">
                <span className="mb-1 block">Installed on</span>
                <input type="date" value={v.installedAt} onChange={(e) => setV({ ...v, installedAt: e.target.value })} className={field} />
              </label>
              <label className="text-xs text-slate-500">
                <span className="mb-1 block">Warranty months</span>
                <input type="number" min={0} value={v.warrantyMonths} onChange={(e) => setV({ ...v, warrantyMonths: Number(e.target.value) || 0 })} className={`${field} w-20`} />
              </label>
              <label className="min-w-[200px] flex-1 text-xs text-slate-500">
                <span className="mb-1 block">Notes</span>
                <input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={`${field} w-full`} />
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError("");
                    const res = await updateInstalledUnit(u.id, v);
                    if (res.error) return setError(res.error);
                    setEdit(false);
                    router.refresh();
                  })
                }
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export function AddUnitForm({ accounts }: { accounts: SearchableOption[] }) {
  const router = useRouter();
  const blank: NewUnitInput = { customerName: "", accountId: "", model: "", qty: 1, invoiceNo: "", invoiceDate: "", serialNos: "", siteAddress: "", phone: "" };
  const [v, setV] = useState(blank);
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <div key={key} className="flex flex-wrap items-end gap-2">
      <div className="w-64 text-xs text-slate-500">
        <span className="mb-1 block">Account (or type the customer)</span>
        <SearchableSelect options={accounts} onSelect={(o) => setV({ ...v, accountId: o?.id ?? "", customerName: o ? o.label.replace(/ \([^)]*\)$/, "") : v.customerName })} placeholder="Search accounts..." />
      </div>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Customer *</span>
        <input value={v.customerName} onChange={(e) => setV({ ...v, customerName: e.target.value })} className={`${field} w-48`} />
      </label>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Model *</span>
        <input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} className={`${field} w-40`} />
      </label>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Qty</span>
        <input type="number" min={1} value={v.qty} onChange={(e) => setV({ ...v, qty: Number(e.target.value) || 1 })} className={`${field} w-16`} />
      </label>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Invoice no.</span>
        <input value={v.invoiceNo} onChange={(e) => setV({ ...v, invoiceNo: e.target.value })} className={`${field} w-28`} />
      </label>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Invoice date</span>
        <input type="date" value={v.invoiceDate} onChange={(e) => setV({ ...v, invoiceDate: e.target.value })} className={field} />
      </label>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Serial nos.</span>
        <input value={v.serialNos} onChange={(e) => setV({ ...v, serialNos: e.target.value })} className={`${field} w-40`} />
      </label>
      <label className="text-xs text-slate-500">
        <span className="mb-1 block">Site address</span>
        <input value={v.siteAddress} onChange={(e) => setV({ ...v, siteAddress: e.target.value })} className={`${field} w-48`} />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const res = await addInstalledUnit(v);
            if (res.error) return setError(res.error);
            setV(blank);
            setKey((k) => k + 1);
            router.refresh();
          })
        }
        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        Add unit
      </button>
      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </div>
  );
}
