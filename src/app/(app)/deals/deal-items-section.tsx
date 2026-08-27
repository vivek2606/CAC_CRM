import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { deleteDealLineItem } from "./actions";
import { AddLineItemForm } from "./add-line-item-form";

type DealItem = {
  id: string;
  qty: number;
  unitPrice: number;
  product: { code: string; model: string; category: string };
};
type ProductOption = { id: string; label: string; defaultPrice: number | null };

export function DealItemsSection({
  dealId,
  items,
  products,
}: {
  dealId: string;
  items: DealItem[];
  products: ProductOption[];
}) {
  const total = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 mb-4">
          No products itemized yet. Add what&apos;s being quoted so it feeds Sales by Category once this deal is won.
        </p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 px-3 font-medium">Qty</th>
                <th className="py-2 px-3 font-medium">Unit Price</th>
                <th className="py-2 px-3 font-medium">Line Total</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3 text-slate-800">
                    {item.product.model}
                    <span className="block text-xs text-slate-400">
                      {item.product.code} · {item.product.category}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-600">{item.qty}</td>
                  <td className="py-2 px-3 text-slate-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 px-3 text-slate-700 font-medium">{formatCurrency(item.qty * item.unitPrice)}</td>
                  <td className="py-2 text-right">
                    <form action={deleteDealLineItem.bind(null, item.id, dealId)}>
                      <button
                        type="submit"
                        aria-label="Remove line item"
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={3} className="py-2 px-3 text-right text-slate-500 font-medium">
                  Total
                </td>
                <td className="py-2 px-3 text-slate-900 font-semibold">{formatCurrency(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <AddLineItemForm dealId={dealId} products={products} />
    </div>
  );
}
