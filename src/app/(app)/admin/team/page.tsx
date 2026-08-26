import { requireHead } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Avatar } from "@/components/ui";
import { ResetPasswordButton } from "./reset-password-button";

export default async function TeamPage() {
  await requireHead();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, title: true, role: true, avatarColor: true },
  });

  return (
    <div>
      <PageHeader title="Team & Logins" description="Everyone with access to this CRM" />
      <div className="p-6">
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.name} color={u.avatarColor} size={7} />
                        <span className="font-medium text-slate-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.title ?? (u.role === "HEAD" ? "Head of Sales" : "Sales Manager")}
                    </td>
                    <td className="px-4 py-3">
                      <ResetPasswordButton userId={u.id} name={u.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
