import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, visibleOwnerIds, isBackOffice } from "@/lib/rbac";
import { getAvailableStockByProduct, getInTransitByProduct, getPendingShortfalls } from "@/lib/pricing";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { VAT_RATE } from "@/lib/constants";
import { PendingOrderForm } from "./pending-order-form";
import { PendingOrderActions } from "./pending-order-actions";
import { StockReceiptForm } from "./stock-receipt-form";
import { BulkReceiptForm } from "./bulk-receipt-form";
import { DeleteReceiptButton } from "./delete-receipt-button";
import { InTransitForm, BulkInTransitForm } from "./in-transit-form";
import { InTransitActions } from "./in-transit-actions";
import { isTempCode } from "@/lib/product-match";
import { ExportCsvButton } from "@/components/export-csv-button";

const STATUS_LABEL = { OPEN: "Open", FULFILLED: "Delivered", CANCELLED: "Cancelled" } as const;
const STATUS_BADGE = {
  OPEN: { bg: "bg-amber-50", text: "text-amber-700" },
  FULFILLED: { bg: "bg-emerald-50", text: "text-emerald-700" },
  CANCELLED: { bg: "bg-slate-100", text: "text-slate-500" },
} as const;
const PAID_BADGE = { bg: "bg-emerald-50", text: "text-emerald-700" };
const UNPAID_BADGE = { bg: "bg-slate-100", text: "text-slate-600" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const isHead = isBackOffice(user);
  const showAll = (await searchParams).show === "all";
  const ownerIds = await visibleOwnerIds(user);

  const [products, availableStock, pendingOrders, receipts, inTransit, inTransitByProduct] = await Promise.all([
    prisma.product.findMany({ orderBy: { model: "asc" }, select: { id: true, code: true, model: true } }),
    getAvailableStockByProduct(),
    prisma.pendingOrder.findMany({
      where: { ownerId: { in: ownerIds }, ...(showAll ? {} : { status: "OPEN" }) },
      orderBy: { createdAt: "desc" },
      take: showAll ? 200 : undefined,
      include: { product: { select: { code: true, model: true } }, owner: { select: { name: true } } },
    }),
    prisma.stockReceipt.findMany({
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: { product: { select: { code: true, model: true } } },
    }),
    prisma.inTransitOrder.findMany({
      where: { status: "IN_TRANSIT" },
      orderBy: [{ eta: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: { product: { select: { code: true, model: true } } },
    }),
    getInTransitByProduct(),
  ]);
  const [shortfalls, salesPeople] = await Promise.all([
    getPendingShortfalls(availableStock, inTransitByProduct),
    isHead
      ? prisma.user.findMany({
          where: { isActive: true, title: "Sales Manager" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve(undefined),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));

  // Open pending orders, model x sales person (always from the open set,
  // whichever filter the list below is on).
  const openPending = showAll
    ? await prisma.pendingOrder.findMany({
        where: { ownerId: { in: ownerIds }, status: "OPEN" },
        include: { product: { select: { code: true, model: true } }, owner: { select: { name: true } } },
      })
    : pendingOrders;
  const pivotPeople = Array.from(new Map(openPending.map((o) => [o.ownerId, o.owner.name])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pivotByProduct = new Map<string, { model: string; code: string; total: number; paid: number; byPerson: Map<string, { qty: number; paid: number }> }>();
  for (const o of openPending) {
    const row = pivotByProduct.get(o.productId) ?? { model: o.product.model, code: o.product.code, total: 0, paid: 0, byPerson: new Map() };
    const cell = row.byPerson.get(o.ownerId) ?? { qty: 0, paid: 0 };
    cell.qty += o.quantity;
    row.total += o.quantity;
    if (o.paymentReceived) {
      cell.paid += o.quantity;
      row.paid += o.quantity;
    }
    row.byPerson.set(o.ownerId, cell);
    pivotByProduct.set(o.productId, row);
  }
  const pivotRows = Array.from(pivotByProduct.entries())
    .map(([productId, r]) => ({ productId, ...r }))
    .sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));
  const personTotal = (id: string) => pivotRows.reduce((s, r) => s + (r.byPerson.get(id)?.qty ?? 0), 0);
  const personPaid = (id: string) => pivotRows.reduce((s, r) => s + (r.byPerson.get(id)?.paid ?? 0), 0);
  const pivotTotal = pivotRows.reduce((s, r) => s + r.total, 0);
  const pivotPaid = pivotRows.reduce((s, r) => s + r.paid, 0);
  const shortList = Array.from(shortfalls.entries())
    .map(([productId, s]) => ({ productId, ...s, product: productById.get(productId) }))
    .sort((a, b) => b.shortfall - a.shortfall);

  const productOptions = products.map((p) => ({
    id: p.id,
    label: `${p.model} (${p.code})`,
    availableQty: availableStock.get(p.id) ?? null,
    inTransit: inTransitByProduct.get(p.id) ?? null,
  }));
  const openOrders = pendingOrders.filter((o) => o.status === "OPEN");
  const paidUnits = openOrders.filter((o) => o.paymentReceived).reduce((s, o) => s + o.quantity, 0);
  const unpaidUnits = openOrders.filter((o) => !o.paymentReceived).reduce((s, o) => s + o.quantity, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const inTransitUnits = inTransit.reduce((s, o) => s + o.quantity, 0);

  return (
    <div>
      <PageHeader
        title="Stock & Pending Orders"
        description="Orders taken for items not in stock, and fresh units arriving in the warehouse"
        action={
          <div className="flex items-center gap-4">
            <Link href="/products" className="text-sm text-indigo-600 hover:text-indigo-700">
              Current stock by product →
            </Link>
            {isHead && (
              <Link href="/reorder" className="text-sm text-indigo-600 hover:text-indigo-700">
                Reorder planning →
              </Link>
            )}
          </div>
        }
      />
      <div className="p-6 space-y-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Add a pending order</h2>
          <p className="text-xs text-slate-500 mb-4">
            For an order picked up for an item that isn&apos;t in stock or in transit. Paid orders count as firm
            demand and go into the next factory order.{isHead && " You can log one on behalf of a sales manager."}
          </p>
          <PendingOrderForm products={productOptions} salesPeople={salesPeople} />
        </Card>

        {shortList.length > 0 && (
          <Card className="p-5 border-rose-200 bg-rose-50/40">
            <h2 className="text-sm font-semibold text-rose-700 mb-1">
              {shortList.length} model{shortList.length === 1 ? "" : "s"} short for paid orders
            </h2>
            <p className="text-xs text-slate-600 mb-3">
              Paid pending orders from all sales managers add up to more than what&apos;s in stock plus in transit. The
              shortfall is added to the next factory order in Reorder Planning.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 pr-4 font-medium text-right">Paid pending</th>
                    <th className="py-2 pr-4 font-medium text-right">In stock</th>
                    <th className="py-2 pr-4 font-medium text-right">In transit</th>
                    <th className="py-2 font-medium text-right">Short by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {shortList.map((r) => (
                    <tr key={r.productId}>
                      <td className="py-2 pr-4">
                        <span className="font-medium text-slate-800">{r.product?.model ?? "—"}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{r.product?.code}</span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.paid}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.stock}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.inTransit}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-rose-700">{r.shortfall}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {pivotRows.length > 0 && (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-0">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Open pending orders by sales person</h2>
                <p className="text-xs text-slate-500 mt-0.5">Units per model; the smaller figure is how many are paid.</p>
              </div>
              <ExportCsvButton
                filename={`pending-orders-by-sales-person-${today}.csv`}
                headers={["Model", "Code", ...pivotPeople.flatMap((p) => [`${p.name} (qty)`, `${p.name} (paid)`]), "Total qty", "Total paid", "In stock", "In transit"]}
                rows={[
                  ...pivotRows.map((r) => [
                    r.model,
                    r.code,
                    ...pivotPeople.flatMap((p) => [r.byPerson.get(p.id)?.qty ?? 0, r.byPerson.get(p.id)?.paid ?? 0]),
                    r.total,
                    r.paid,
                    availableStock.get(r.productId) ?? "",
                    inTransitByProduct.get(r.productId)?.qty ?? 0,
                  ]),
                  ["Total", "", ...pivotPeople.flatMap((p) => [personTotal(p.id), personPaid(p.id)]), pivotTotal, pivotPaid, "", ""],
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Model</th>
                    {pivotPeople.map((p) => (
                      <th key={p.id} className="px-3 py-3 font-medium text-right">
                        {p.name.split(" ")[0]}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-medium text-right">Total</th>
                    <th className="px-3 py-3 font-medium text-right">In stock</th>
                    <th className="px-4 py-3 font-medium text-right">In transit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pivotRows.map((r) => (
                    <tr key={r.productId}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-800">{r.model}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{r.code}</span>
                        {shortfalls.has(r.productId) && (
                          <span className="ml-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                            Short {shortfalls.get(r.productId)!.shortfall}
                          </span>
                        )}
                      </td>
                      {pivotPeople.map((p) => {
                        const c = r.byPerson.get(p.id);
                        return (
                          <td key={p.id} className="px-3 py-2.5 text-right tabular-nums">
                            {c ? (
                              <>
                                <span className="font-medium text-slate-800">{c.qty}</span>
                                <span className="ml-1 text-xs text-emerald-600">{c.paid} paid</span>
                              </>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-semibold text-slate-900">{r.total}</span>
                        <span className="ml-1 text-xs text-emerald-600">{r.paid} paid</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{availableStock.get(r.productId) ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{inTransitByProduct.get(r.productId)?.qty ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className="px-4 py-2.5">Total</td>
                    {pivotPeople.map((p) => (
                      <td key={p.id} className="px-3 py-2.5 text-right tabular-nums">
                        {personTotal(p.id)}
                        <span className="ml-1 text-xs font-normal text-emerald-600">{personPaid(p.id)} paid</span>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {pivotTotal}
                      <span className="ml-1 text-xs font-normal text-emerald-600">{pivotPaid} paid</span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-0">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Pending orders</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Open: {paidUnits} unit{paidUnits === 1 ? "" : "s"} paid, {unpaidUnits} unit{unpaidUnits === 1 ? "" : "s"} awaiting
                payment
              </p>
            </div>
            <div className="flex gap-3 text-sm">
              <Link href="/stock" className={showAll ? "text-slate-500 hover:text-slate-700" : "font-medium text-slate-900"}>
                Open
              </Link>
              <Link href="/stock?show=all" className={showAll ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-700"}>
                All
              </Link>
            </div>
          </div>
          {pendingOrders.length === 0 ? (
            <div className="p-4">
              <EmptyState title={showAll ? "No pending orders yet" : "No open pending orders"} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    {isHead && <th className="px-4 py-3 font-medium">Sales person</th>}
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">In stock now</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingOrders.map((o) => {
                    const inStock = availableStock.get(o.productId);
                    return (
                      <tr key={o.id}>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                        <td className="px-4 py-3 min-w-[180px]">
                          <div className="text-slate-800 font-medium">{o.product.model}</div>
                          <div className="text-xs text-slate-400">{o.product.code}</div>
                          {o.note && <div className="text-xs text-slate-500 mt-0.5">{o.note}</div>}
                          {o.status === "OPEN" && shortfalls.has(o.productId) && (
                            <span
                              className="mt-1 inline-flex whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                              title="Paid orders for this model exceed stock + in transit - the shortfall is added to the next factory order"
                            >
                              Model short {shortfalls.get(o.productId)!.shortfall}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800 tabular-nums">{o.quantity}</td>
                        <td className="px-4 py-3 text-slate-700">{o.customerName}</td>
                        {isHead && <td className="px-4 py-3 text-slate-600">{o.owner.name}</td>}
                        <td className="px-4 py-3">
                          <Badge {...(o.paymentReceived ? PAID_BADGE : UNPAID_BADGE)}>{o.paymentReceived ? "Received" : "Not yet"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">{inStock == null ? "—" : inStock}</td>
                        <td className="px-4 py-3">
                          <Badge {...STATUS_BADGE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <PendingOrderActions id={o.id} status={o.status} paymentReceived={o.paymentReceived} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {isHead && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Record fresh units received</h2>
            <p className="text-xs text-slate-500 mb-4">
              Adds to the item&apos;s stock from the date it entered the warehouse. Every billing after that reduces it
              automatically. Enter a dealer&apos;s price only if it changed with this arrival - basic, excluding VAT.
            </p>
            <StockReceiptForm products={productOptions} today={today} />
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Bulk upload</h3>
              <p className="text-xs text-slate-500 mb-4">
                One row per arrival: Product Code, Quantity, Date Received, and Dealer&apos;s Price (basic, excl. VAT) only if it
                changed. Add Model and Category to create an item that isn&apos;t in the system yet. Re-uploading the same
                sheet won&apos;t double-count - rows already recorded are skipped.
              </p>
              <BulkReceiptForm today={today} />
            </div>
          </Card>
        )}

        <Card>
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">Goods in transit</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {inTransitUnits} unit{inTransitUnits === 1 ? "" : "s"} ordered from the factory and on the way. Not in stock until
              received{isHead ? " - use Receive when they land" : ""}.
            </p>
          </div>
          {inTransit.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nothing in transit" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Tentative arrival</th>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Qty in transit</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Ordered</th>
                    <th className="px-4 py-3 font-medium">In stock now</th>
                    {isHead && <th className="px-4 py-3 font-medium" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inTransit.map((o) => {
                    const overdue = o.eta != null && o.eta < todayStart;
                    return (
                      <tr key={o.id}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {o.eta ? (
                            <span className={overdue ? "text-rose-600 font-medium" : "text-slate-700"}>
                              {formatDate(o.eta)}
                              {overdue && " (overdue)"}
                            </span>
                          ) : (
                            <span className="text-slate-400">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800 font-medium">{o.product.model}</div>
                          <div className="text-xs text-slate-400">
                            {o.product.code}
                            {isTempCode(o.product.code) && (
                              <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                temporary code
                              </span>
                            )}
                          </div>
                          {o.note && <div className="text-xs text-slate-500 mt-0.5">{o.note}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800 tabular-nums">
                          {o.quantity}
                          {o.receivedQty > 0 && <div className="text-xs font-normal text-slate-400">{o.receivedQty} already received</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{o.reference ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{o.orderedAt ? formatDate(o.orderedAt) : "—"}</td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">{availableStock.get(o.productId) ?? "—"}</td>
                        {isHead && (
                          <td className="px-4 py-3">
                            <InTransitActions id={o.id} quantity={o.quantity} today={today} tempCode={isTempCode(o.product.code)} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {isHead && (
            <div className="border-t border-slate-100 p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Add goods in transit</h3>
                <InTransitForm products={productOptions} />
              </div>
              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Bulk upload</h3>
                <p className="text-xs text-slate-500 mb-4">
                  One row per shipment line: Model (or Product Code), Quantity, ETA, and optionally Order Date and Reference. A
                  model is matched to the product code used most recently for it; a model that&apos;s new gets a temporary code
                  (TEMP-####) - enter the ERP code when you Receive it. Rows matching a line already in transit are skipped.
                </p>
                <BulkInTransitForm />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-slate-900">Recent arrivals</h2>
          </div>
          {receipts.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No stock receipts recorded yet" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Entered stock</th>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium">Dealer&apos;s price (incl. VAT)</th>
                    <th className="px-4 py-3 font-medium">In stock now</th>
                    {isHead && <th className="px-4 py-3 font-medium" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(r.receivedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800 font-medium">{r.product.model}</div>
                        <div className="text-xs text-slate-400">{r.product.code}</div>
                        {r.note && <div className="text-xs text-slate-500 mt-0.5">{r.note}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 tabular-nums">{r.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.dealerPrice == null ? <span className="text-slate-400">Unchanged</span> : formatCurrency(r.dealerPrice * (1 + VAT_RATE))}
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{availableStock.get(r.productId) ?? "—"}</td>
                      {isHead && (
                        <td className="px-4 py-3">
                          <DeleteReceiptButton id={r.id} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
