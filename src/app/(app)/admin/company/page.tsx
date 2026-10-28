import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getCompanySettings } from "@/lib/company-profile";
import { CompanyForm } from "./company-form";
import { TestErrorButton } from "./test-error-button";

export default async function CompanyDetailsPage() {
  await requireHead();
  const settings = await getCompanySettings();
  return (
    <div>
      <PageHeader
        title="Company Details"
        description="Sakuragi Industries Nigeria Limited letterhead, logo, bank details and terms printed on quotations and proforma invoices"
        action={<TestErrorButton configured={!!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)} />}
      />
      <div className="p-6">
        <Card className="p-6">
          <CompanyForm initial={settings} />
        </Card>
      </div>
    </div>
  );
}
