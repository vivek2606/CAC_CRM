"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { CONTACT_ROLES, CONTACT_ROLE_LABELS, CONTACT_ROLE_COLORS } from "@/lib/constants";
import { addDealContactRole, removeDealContactRole } from "./actions";
import type { ContactRole } from "@prisma/client";

type Stakeholder = {
  id: string;
  role: ContactRole;
  contact: { id: string; firstName: string; lastName: string };
};

// Salesforce's "Opportunity Contact Role" - additional stakeholders beyond
// the deal's one primary Contact field, each tagged with the part they play
// (Economic Buyer, Champion, etc.) - matters most on a multi-stakeholder
// capital-goods deal where the person who signs off isn't necessarily the
// person actually using the equipment.
export function StakeholdersSection({
  dealId,
  stakeholders,
  contacts,
}: {
  dealId: string;
  stakeholders: Stakeholder[];
  contacts: { id: string; firstName: string; lastName: string }[];
}) {
  const addAction = addDealContactRole.bind(null, dealId);
  const contactOptions = contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }));

  return (
    <div>
      {stakeholders.length === 0 ? (
        <p className="text-sm text-slate-400 mb-3">No stakeholders added yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 mb-3">
          {stakeholders.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Link
                  href={`/contacts/${s.contact.id}`}
                  className="text-sm text-slate-800 hover:text-indigo-600 font-medium"
                >
                  {s.contact.firstName} {s.contact.lastName}
                </Link>
                <Badge bg={CONTACT_ROLE_COLORS[s.role].bg} text={CONTACT_ROLE_COLORS[s.role].text}>
                  {CONTACT_ROLE_LABELS[s.role]}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${s.contact.firstName} ${s.contact.lastName} as a stakeholder?`)) {
                    removeDealContactRole(s.id, dealId);
                  }
                }}
                aria-label="Remove stakeholder"
                className="text-slate-400 hover:text-red-600 transition-colors p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={addAction} className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[160px]">
          <SearchableSelect name="contactId" options={contactOptions} placeholder="Add a contact..." />
        </div>
        <select
          name="role"
          defaultValue="INFLUENCER"
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {CONTACT_ROLES.map((r) => (
            <option key={r} value={r}>
              {CONTACT_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
        >
          Add
        </button>
      </form>
    </div>
  );
}
