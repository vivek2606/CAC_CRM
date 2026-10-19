import Link from "next/link";
import { Card } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OrderInvoice } from "@/lib/order-invoices";

// Every invoice of an order billed in parts, with its products - on the
// deal (any of the order's deals) and on the lead it came from.
export function OrderInvoicesCard({ invoices, currentId, title = "Invoices for this order" }: { invoices: OrderInvoice[]; currentId?: string; title?: string }) {
  if (invoices.length < 2) return null;
  const total = invoices.reduce((s, i) => s + i.value, 0);
  const qty = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mb-3 text-xs text-slate-500">
        Billed in {invoices.length} invoices, {formatCurrency(total)} in all (excl. VAT). Each invoice is its own won deal.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide">
              <th className="px-2 py-1.5 font-medium">Invoice</th>
              <th className="px-2 py-1.5 font-medium">Company</th>
              <th className="px-2 py-1.5 font-medium">Date</th>
              <th className="px-2 py-1.5 font-medium">Products</th>
              <th className="px-2 py-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className={`border-t border-slate-100 align-top ${inv.id === currentId ? "bg-indigo-50/70" : ""}`}>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {inv.id === currentId ? (
                    <span className="font-semibold text-indigo-900">{inv.invoiceNo ?? "-"} (this deal)</span>
                  ) : (
                    <Link href={`/deals/${inv.id}`} className="font-medium text-indigo-700 hover:underline">
                      {inv.invoiceNo ?? "-"}
                    </Link>
                  )}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{inv.billingCompany ?? "Not recorded"}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{inv.closedAt ? formatDate(inv.closedAt) : "-"}</td>
                <td className="px-2 py-1.5 text-slate-700">
                  {inv.items.length === 0 ? (
                    <span className="text-slate-400">-</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {inv.items.map((it, k) => (
                        <li key={k} className="text-xs">
                          <span className="font-medium">{it.product.model}</span> <span className="text-slate-400">({it.product.code})</span> - {qty(it.qty)} × {formatCurrency(it.unitPrice)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-medium">{formatCurrency(inv.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="px-2 py-1.5" colSpan={4}>
                Order total
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
