import { requireUser } from "@/lib/rbac";
import { buildDocument, documentInputSchema, type SalesDocument } from "@/lib/sales-document";

// Shared by the PDF and Excel routes: read the builder's JSON body and turn
// it into the rendered document (totals worked out here, not trusted from
// the browser).
export async function documentFromRequest(request: Request): Promise<{ doc: SalesDocument } | { error: Response }> {
  await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: Response.json({ error: "Couldn't read the document." }, { status: 400 }) };
  }
  const parsed = documentInputSchema.safeParse(body);
  if (!parsed.success) return { error: Response.json({ error: parsed.error.issues[0]?.message ?? "Check the document." }, { status: 400 }) };
  if (!parsed.data.rows.some((r) => r.kind === "item")) return { error: Response.json({ error: "Add at least one item." }, { status: 400 }) };
  return { doc: await buildDocument(parsed.data) };
}
