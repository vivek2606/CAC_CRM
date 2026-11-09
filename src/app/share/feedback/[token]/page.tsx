import { prisma } from "@/lib/prisma";
import { getCompanySettings, pickCompany } from "@/lib/company-profile";
import { FEEDBACK_KIND_LABEL } from "@/lib/feedback";
import { FeedbackForm } from "./feedback-form";

// The customer's feedback page, opened from the WhatsApp link (no login).
export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fb = await prisma.customerFeedback.findUnique({
    where: { token },
    select: { kind: true, respondedAt: true, deal: { select: { billingCompany: true, customerName: true, account: { select: { name: true } } } } },
  });
  const settings = await getCompanySettings();
  const company = pickCompany(settings, fb?.deal.billingCompany?.toUpperCase() ?? undefined);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{company.name}</p>
        {!fb ? (
          <p className="mt-4 text-sm text-slate-600">This link isn&apos;t valid any more. Thank you for thinking of us.</p>
        ) : fb.respondedAt ? (
          <p className="mt-4 text-sm text-slate-600">Thank you - we already have your feedback.</p>
        ) : (
          <>
            <h1 className="mt-2 text-lg font-semibold text-slate-900">How did we do with the {FEEDBACK_KIND_LABEL[fb.kind]}?</h1>
            <p className="mt-1 text-sm text-slate-500">{fb.deal.account?.name ?? fb.deal.customerName ?? ""}</p>
            <FeedbackForm token={token} />
          </>
        )}
      </div>
    </main>
  );
}
