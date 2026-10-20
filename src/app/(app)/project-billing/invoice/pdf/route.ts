import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireBackOffice } from "@/lib/rbac";
import { renderSalesDocumentPdf } from "@/lib/pdf/sales-document-pdf";
import { buildServiceInvoice, nextServiceInvoiceRef, serviceInvoiceFilename, serviceInvoiceInputSchema } from "@/lib/service-invoice";

// Builds the Somotex service / project invoice from the form and saves it:
// a new one gets its number now; a saved one (its ref) is updated in place.
export async function POST(request: Request) {
  const user = await requireBackOffice();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Couldn't read the invoice." }, { status: 400 });
  }
  const parsed = serviceInvoiceInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the invoice." }, { status: 400 });
  const input = parsed.data;
  if (!input.to.split("\n")[0]?.trim()) return Response.json({ error: 'Enter the customer\'s name (first line of "Bill to").' }, { status: 400 });
  if (!input.rows.some((r) => r.kind === "item" && r.description && r.qty > 0)) return Response.json({ error: "Add at least one line item." }, { status: 400 });

  // Everything checked before a new invoice takes a number.
  const doc = await buildServiceInvoice(input);
  if (doc.payment && doc.payment.received > doc.total + 0.005) return Response.json({ error: "The payment received is more than the invoice total." }, { status: 400 });
  if (input.ref) {
    if (!(await prisma.serviceInvoice.findUnique({ where: { ref: input.ref }, select: { id: true } }))) {
      return Response.json({ error: `Invoice ${input.ref} isn't saved - clear the number to issue a new one.` }, { status: 400 });
    }
  } else {
    input.ref = await nextServiceInvoiceRef();
    doc.ref = input.ref;
  }

  const data = { customerName: doc.to[0] ?? "", total: doc.total, data: input as unknown as Prisma.InputJsonValue };
  const saved = await prisma.serviceInvoice.upsert({
    where: { ref: input.ref },
    create: { ref: input.ref, ...data, createdById: user.id },
    update: data,
    select: { id: true },
  });
  const pdf = await renderSalesDocumentPdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${serviceInvoiceFilename(doc)}"`,
      "X-Invoice-Ref": input.ref,
      "X-Invoice-Id": saved.id,
    },
  });
}
