import Link from "next/link";
import { Card, EmptyState, Avatar } from "@/components/ui";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  email: string | null;
  account: { name: string } | null;
  owner: { name: string; avatarColor: string };
};

// The Contacts tab of Accounts & Contacts.
export function ContactsList({ contacts }: { contacts: ContactRow[] }) {
  return (
    <Card>
      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" description="Add people you're in touch with." />
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Job title</th>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${contact.id}`} className="font-medium text-slate-800 hover:text-indigo-600">
                    {contact.firstName} {contact.lastName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{contact.jobTitle ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{contact.account?.name ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{contact.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={contact.owner.name} color={contact.owner.avatarColor} size={6} />
                    <span className="text-slate-600">{contact.owner.name}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Card>
  );
}
