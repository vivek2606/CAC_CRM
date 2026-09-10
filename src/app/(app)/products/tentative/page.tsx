import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getAllTentativePrices } from "@/lib/pricing";
import { PageHeader } from "@/components/ui";
import { TentativePriceTable } from "./tentative-price-table";

export default async function TentativePricesPage() {
  await requireUser();

  const entries = await getAllTentativePrices();

  return (
    <div>
      <PageHeader
        title="Tentative Prices"
        description="Quotable prices for items not currently held in stock"
        action={
          <Link href="/products" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Back to Products
          </Link>
        }
      />
      <div className="p-6 space-y-4">
        <TentativePriceTable entries={entries} />
      </div>
    </div>
  );
}
