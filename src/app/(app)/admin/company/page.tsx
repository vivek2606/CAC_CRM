import { requireHead } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getCompanySettings } from "@/lib/company-profile";
import { CompanyForm } from "./company-form";

export default async function CompanyDetailsPage() {
  await requireHead();
  const settings = await getCompanySettings();
  return (
    <div>
      <PageHeader
        title="Company Details"
        description="Sakuragi Industries Nigeria Limited letterhead, logo, bank details and terms printed on quotations and proforma invoices"
      />
      <div className="p-6">
        <Card className="p-6">
          <CompanyForm initial={settings} />
        </Card>
      </div>
    </div>
  );
}
