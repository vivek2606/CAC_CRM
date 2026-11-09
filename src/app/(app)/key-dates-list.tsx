import Link from "next/link";
import { whatsappLink } from "@/lib/whatsapp";
import { greeting, whenLabel, type KeyDate } from "@/lib/key-dates";

// Birthdays and anniversaries coming up, each with a WhatsApp greeting.
export function KeyDatesList({ items, from, company, showOwner = false }: { items: KeyDate[]; from: string; company: string; showOwner?: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((k) => (
        <li key={`${k.contactId}-${k.kind}`} className="flex flex-wrap items-center gap-2 py-1.5">
          <span>{k.kind === "Birthday" ? "🎂" : "🎉"}</span>
          <Link href={`/contacts/${k.contactId}`} className="font-medium text-slate-800 hover:text-indigo-700">
            {k.name}
          </Link>
          {k.account && <span className="text-slate-500">{k.account}</span>}
          <span className={`text-xs ${k.daysAway === 0 ? "font-semibold text-emerald-700" : "text-slate-500"}`}>
            {k.kind} {whenLabel(k.daysAway)}
            {showOwner && ` · ${k.ownerName}`}
          </span>
          {k.phone && (
            <a
              href={whatsappLink(k.phone, greeting({ firstName: k.firstName, kind: k.kind, from, company }))}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              Send greeting
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
