import { prisma } from "@/lib/prisma";
import { requireUser, canAccessOwner, isBackOffice } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { getCompanySettings, defaultTermsLines } from "@/lib/company-profile";
import { PAYMENT_TERMS_LABELS } from "@/lib/constants";
import {
  getAllTentativePrices,
  getAvailableStockByProduct,
  getInTransitByProduct,
  getLatestPriceByProduct,
  getQuotableProducts,
} from "@/lib/pricing";
import { documentInputSchema } from "@/lib/sales-document";
import { canSeeQuotation, quoteSalesPeople } from "@/lib/saved-quotes";
import { dealOwnerOptions } from "@/lib/deal-owner";
import { QuotationBuilder, type DealPrefill, type ModelOption, type QuotePrefill } from "./builder";
import { QuotationTabs } from "./quotation-tabs";

// Quotation / proforma invoice / BOQ builder: pick models, quantities and
// (editable) ex-VAT rates; the PDF / Excel add VAT and the total in words.
// Opened from a deal (?deal=) it starts with that deal's customer and items;
// opened from a saved quotation (?quote=, &revise=1 for a new number) it
// starts with that quotation.

const dateFmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ deal?: string; quote?: string; revise?: string }> }) {
  const user = await requireUser();
  const { deal: dealId, quote: quoteId, revise } = await searchParams;
  const [settings, products, prices, stock, inTransit, tentative, me] = await Promise.all([
    getCompanySettings(),
    getQuotableProducts(),
    getLatestPriceByProduct(),
    getAvailableStockByProduct(),
    getInTransitByProduct(),
    getAllTentativePrices(),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, title: true, phone: true } }),
  ]);

  const availability = (productId: string | null) => {
    if (!productId) return "Not Available";
    if ((stock.get(productId) ?? 0) > 0) return "Available";
    const t = inTransit.get(productId);
    if (t && t.qty > 0) return t.eta ? `In Transit (ETA ${dateFmt(t.eta)})` : "In Transit";
    return "Not Available";
  };
  const optionIds = new Set(products.map((p) => p.id));
  const tentativeByModel = new Map(tentative.map((t) => [t.model.trim().toLowerCase(), t.dealerPrice]));
  const productModels = new Set(products.map((p) => p.model.trim().toLowerCase()));
  const options: ModelOption[] = [
    ...products.map((p) => ({
      id: p.id,
      label: `${p.model} (${p.code})`,
      model: p.model,
      code: p.code,
      // No dealer price yet: the tentative price for the same model, if any.
      rate: prices.get(p.id) ?? tentativeByModel.get(p.model.trim().toLowerCase()) ?? null,
      tentative: !prices.has(p.id) && tentativeByModel.has(p.model.trim().toLowerCase()),
      stock: stock.get(p.id) ?? 0,
      inTransit: inTransit.get(p.id)?.qty ?? 0,
      availability: availability(p.id),
      // The limits are the Head's only - the check runs on the server.
      maxDiscountPct: user.role === "HEAD" ? p.maxDiscountPct : null,
    })),
    // Models only on the tentative price list (not stocked).
    ...tentative
      .filter((t) => !productModels.has(t.model.trim().toLowerCase()))
      .map((t) => ({
        id: `tentative:${t.model}`,
        label: `${t.model} (tentative price)`,
        model: t.model,
        code: "",
        rate: t.dealerPrice,
        stock: 0,
        inTransit: 0,
        availability: "Not Available",
        tentative: true,
        maxDiscountPct: null,
      })),
  ];

  // Pre-fill from a deal the user can see.
  let fromDeal: DealPrefill | null = null;
  if (dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        account: { select: { name: true, address: true, city: true, state: true, phone: true } },
        contact: { select: { firstName: true, lastName: true, phone: true } },
        items: { orderBy: { createdAt: "asc" }, include: { product: { select: { id: true, model: true } } } },
      },
    });
    if (deal && canAccessOwner(user, deal.ownerId)) {
      const contactName = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}`.trim() : "";
      const acc = deal.account;
      const to = [
        acc?.name ?? deal.customerName ?? contactName,
        acc?.address,
        [acc?.city, acc?.state].filter(Boolean).join(", "),
        deal.customerPhone ?? deal.contact?.phone ?? acc?.phone,
      ].filter((x): x is string => Boolean(x));
      const terms = defaultTermsLines(settings);
      if (deal.paymentTerms) terms[0] = `Payment Terms: ${PAYMENT_TERMS_LABELS[deal.paymentTerms]}`;
      fromDeal = {
        dealId: deal.id,
        ownerId: deal.ownerId,
        to: to.join("\n"),
        attention: acc ? (deal.customerName ?? contactName) : contactName,
        title: deal.title,
        terms,
        rows: deal.items.map((i) => ({
          productId: optionIds.has(i.product.id) ? i.product.id : null,
          description: i.product.model,
          detail: availability(i.product.id),
          unit: "No.",
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
      };
    }
  }

  let fromQuote: QuotePrefill | null = null;
  if (quoteId) {
    const q = await prisma.quotation.findUnique({ where: { id: quoteId }, include: { deal: { select: { id: true, title: true, ownerId: true } } } });
    const data = q && canSeeQuotation(user, q) ? documentInputSchema.safeParse(q.data) : null;
    if (q && data?.success) {
      const isRevision = revise === "1";
      fromQuote = {
        ownerId: q.ownerId,
        dealId: q.deal?.id ?? null,
        dealTitle: q.deal?.title ?? null,
        ref: isRevision ? "" : q.ref,
        revisionOf: isRevision ? q.ref : null,
        data: data.data,
      };
    }
  }

  // Head / Coordinator pick the sales person; the deal's or saved quote's
  // own sales person is always in the list.
  let salesPeople: { id: string; name: string }[] | null = null;
  if (isBackOffice(user)) {
    salesPeople = await quoteSalesPeople();
    const current = fromQuote?.ownerId ?? fromDeal?.ownerId;
    if (current && !salesPeople.some((p) => p.id === current)) {
      const u = await prisma.user.findUnique({ where: { id: current }, select: { id: true, name: true } });
      if (u) salesPeople = [...salesPeople, u].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        action={<QuotationTabs active={fromQuote ? "saved" : "new"} />}
        description={
          fromQuote
            ? fromQuote.revisionOf
              ? `Revising ${fromQuote.revisionOf}`
              : `Saved quotation ${fromQuote.ref}`
            : fromDeal
            ? `For the deal: ${fromDeal.title}`
            : "Prepare a quotation, proforma invoice or bill of quantity - download as PDF, or Excel to edit later"
        }
      />
      <div className="p-6">
        <QuotationBuilder
          key={fromQuote ? `${quoteId}-${revise ?? ""}` : (dealId ?? "new")}
          options={options}
          companies={settings.companies.map((c) => ({
            key: c.key,
            name: c.name,
            refPrefix: c.refPrefix,
            tin: c.tin,
            bankName: c.bankName,
            accountName: c.accountName,
            accountNumber: c.accountNumber,
          }))}
          defaultCompany={settings.defaultCompany}
          vatRatePct={settings.vatRatePct}
          defaultTerms={defaultTermsLines(settings)}
          validityDays={settings.quoteValidityDays}
          signatory={{ name: me?.name ?? user.name ?? "", designation: me?.title ?? "", phone: me?.phone ?? "" }}
          fromDeal={fromQuote ? null : fromDeal}
          fromQuote={fromQuote}
          salesPeople={salesPeople}
          dealOwners={isBackOffice(user) ? await dealOwnerOptions() : null}
          myId={user.id}
          isHead={user.role === "HEAD"}
        />
      </div>
    </div>
  );
}
