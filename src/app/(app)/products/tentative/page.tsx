import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getAllTentativePrices } from "@/lib/pricing";
import { PageHeader, Card } from "@/components/ui";
import { TentativePriceLookup } from "../tentative-price-lookup";
import { TentativePriceTable } from "./tentative-price-table";

export default async function TentativePricesPage() {
  await requireUser();

  const entries = await getAllTentativePrices();
  const lookupOptions = entries.map((e) => ({
    id: e.model,
    label: e.model,
    category: e.category,
    dealerPrice: e.dealerPrice,
  }));

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
        <Card className="p-5">
          <TentativePriceLookup entries={lookupOptions} />
        </Card>

        <TentativePriceTable entries={entries} />
      </div>
    </div>
  );
}
