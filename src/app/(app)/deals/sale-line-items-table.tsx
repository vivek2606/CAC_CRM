import { formatCurrency, formatDate } from "@/lib/format";

type SaleLineItem = {
  id: string;
  docDate: Date;
  qty: number;
  value: number;
  product: { code: string; model: string };
};

// Read-only breakdown of a historical sale imported from the Sales
// Register - distinct from DealItemsSection, which is an editable quote
// builder for deals worked directly in the CRM. An imported deal has no
// DealLineItem rows to edit; this is its only line-item detail.
export function SaleLineItemsTable({ items }: { items: SaleLineItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3 font-medium">Item Code</th>
            <th className="py-2 px-3 font-medium">Item Name</th>
            <th className="py-2 px-3 font-medium">Qty</th>
            <th className="py-2 px-3 font-medium">Invoice Date</th>
            <th className="py-2 px-3 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="py-2 pr-3 text-slate-800">{item.product.code}</td>
              <td className="py-2 px-3 text-slate-600">{item.product.model}</td>
              <td className="py-2 px-3 text-slate-600">{item.qty}</td>
              <td className="py-2 px-3 text-slate-600">{formatDate(item.docDate)}</td>
              <td className="py-2 px-3 text-slate-700 font-medium">{formatCurrency(item.value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200">
            <td colSpan={4} className="py-2 px-3 text-right text-slate-500 font-medium">
              Total
            </td>
            <td className="py-2 px-3 text-slate-900 font-semibold">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
