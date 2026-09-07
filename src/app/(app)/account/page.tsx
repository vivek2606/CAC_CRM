import { requireUser } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHeader title="My Account" description={user.email ?? undefined} />
      <div className="p-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Change password</h2>
          <p className="text-xs text-slate-500 mb-4">
            You&apos;ll need your current password to set a new one.
          </p>
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
