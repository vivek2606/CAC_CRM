import { redirect } from "next/navigation";

// Old per-deal quote link: the Quotations builder now does this, pre-filled
// from the deal.
export default async function QuoteRedirect({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  redirect(`/quotations?deal=${dealId}`);
}
