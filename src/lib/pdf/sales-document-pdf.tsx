import { Document, Font, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { SalesDocument } from "@/lib/sales-document";

// A4 quotation / proforma invoice / bill of quantity. The item table always
// runs down to the totals/terms block, which sits at the foot of the last
// page - empty ruled space fills the gap (as on the BOQ template), and a
// page holding only the terms still shows an empty table above them.
// Amounts are plain numbers under "NGN" headings - the built-in PDF fonts
// have no ₦ glyph.

// Wrap whole words - no "Lim-ited" style hyphenation in names and numbers.
Font.registerHyphenationCallback((word) => [word]);

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const dateFmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const ink = "#0f172a";
const muted = "#64748b";
const rule = "#cbd5e1";
const accent = "#1e4f9c"; // Sakuragi logo blue

// Column widths (#, Unit, Qty, Rate, Amount fixed; Description flexes).
const W = { no: 26, unit: 34, qty: 36, rate: 82, amt: 90 };

const s = StyleSheet.create({
  // paddingTop leaves room for the continuation header on pages 2+.
  page: { paddingTop: 52, paddingBottom: 46, paddingHorizontal: 38, fontSize: 9, fontFamily: "Helvetica", color: ink, flexDirection: "column" },
  contHeader: { position: "absolute", top: 22, left: 38, right: 38 },
  contTitle: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: muted, marginBottom: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 8, marginBottom: 12, marginTop: -20 },
  logo: { height: 42, width: 156, objectFit: "contain", objectPosition: "left" },
  company: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  small: { fontSize: 8, color: muted, marginTop: 1.5, textAlign: "right" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: accent, textAlign: "right", letterSpacing: 1 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  metaLabel: { fontSize: 8, color: muted, width: 60, textAlign: "right", marginRight: 6 },
  metaValue: { fontSize: 8, fontFamily: "Helvetica-Bold", maxWidth: 140, textAlign: "right" },
  parties: { flexDirection: "row", marginBottom: 10 },
  label: { fontSize: 7, color: muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  strong: { fontFamily: "Helvetica-Bold" },
  // Everything from the table down grows to fill the page, so the bottom
  // block lands at the foot of the last page.
  body: { flexGrow: 1, flexDirection: "column" },
  row: { flexDirection: "row", borderLeftWidth: 0.75, borderRightWidth: 0.75, borderColor: ink },
  th: { backgroundColor: "#e8eff9", borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: ink },
  thText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1e3a6e" },
  cell: { paddingVertical: 4.5, paddingHorizontal: 4, borderRightWidth: 0.5, borderRightColor: rule },
  last: { borderRightWidth: 0 },
  filler: { flexGrow: 1, minHeight: 10 },
  sectionText: { fontFamily: "Helvetica-Bold" },
  // Grows too: on a page of its own it puts an empty table above the totals.
  bottom: { flexGrow: 1, flexDirection: "column" },
  totalRow: { flexDirection: "row", borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.5, borderColor: ink },
  totalLabel: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, textAlign: "right", borderRightWidth: 0.5, borderRightColor: rule },
  totalValue: { width: W.amt, paddingVertical: 4, paddingHorizontal: 4, textAlign: "right" },
  words: { borderLeftWidth: 0.75, borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: ink, paddingVertical: 5, paddingHorizontal: 6, fontSize: 8.5 },
  terms: { flexDirection: "row", marginTop: 10 },
  bankRow: { flexDirection: "row", marginTop: 2 },
  bankLabel: { width: 72, color: muted, fontSize: 8.5 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  signBlock: { width: 220 },
  signLine: { borderTopWidth: 0.75, borderTopColor: ink, marginTop: 26, paddingTop: 4 },
  footer: { position: "absolute", bottom: 20, left: 38, right: 38, fontSize: 7, color: muted, textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 5 },
});

const col = {
  no: [s.cell, { width: W.no }],
  desc: [s.cell, { flex: 1 }],
  unit: [s.cell, { width: W.unit, textAlign: "center" as const }],
  qty: [s.cell, { width: W.qty, textAlign: "right" as const }],
  rate: [s.cell, { width: W.rate, textAlign: "right" as const }],
  amt: [s.cell, s.last, { width: W.amt, textAlign: "right" as const }],
};

function TableHeader() {
  return (
    <View style={[s.row, s.th]}>
      <Text style={[...col.no, s.thText]}>#</Text>
      <Text style={[...col.desc, s.thText]}>Description</Text>
      <Text style={[...col.unit, s.thText]}>Unit</Text>
      <Text style={[...col.qty, s.thText]}>Qty</Text>
      <Text style={[...col.rate, s.thText]}>Rate (NGN)</Text>
      <Text style={[...col.amt, s.thText]}>Amount (NGN)</Text>
    </View>
  );
}

// Empty ruled columns - stretches to fill whatever height is left.
function EmptyRows({ grow = true }: { grow?: boolean }) {
  return (
    <View style={[s.row, grow ? s.filler : { height: 0 }]}>
      <View style={col.no} />
      <View style={col.desc} />
      <View style={col.unit} />
      <View style={col.qty} />
      <View style={col.rate} />
      <View style={col.amt} />
    </View>
  );
}

export function SalesDocumentPdf({ doc }: { doc: SalesDocument }) {
  const c = doc.company;
  const contact = [c.phone, c.email, c.website].filter(Boolean).join("  |  ");
  const reg = [c.rcNumber && `RC ${c.rcNumber.replace(/^RC[\s.:#-]*/i, "")}`, doc.tin && `TIN ${doc.tin.replace(/^TIN[\s.:#-]*/i, "")}`]
    .filter(Boolean)
    .join("  |  ");
  const hasBank = Boolean(doc.bank.bankName || doc.bank.accountName || doc.bank.accountNumber);
  return (
    <Document title={`${doc.heading} ${doc.ref}`} author={c.name} subject={doc.title || doc.heading}>
      <Page size="A4" style={s.page}>
        {/* Pages 2+: who/what/ref plus the column headings again, in the top margin. */}
        <View
          style={s.contHeader}
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View>
                <View style={s.contTitle}>
                  <Text>{c.name}</Text>
                  <Text>
                    {doc.heading}
                    {doc.ref ? ` ${doc.ref}` : ""} (continued)
                  </Text>
                </View>
                <TableHeader />
              </View>
            ) : null
          }
        />

        {/* Letterhead: logo left, company name and address right (as on the Sakuragi letterhead). */}
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {c.logo ? <Image src={c.logo} style={s.logo} /> : <View />}
          <View style={{ alignItems: "flex-end", maxWidth: 330 }}>
            <Text style={s.company}>{c.name}</Text>
            {c.addressLines.filter(Boolean).map((l) => (
              <Text key={l} style={s.small}>
                {l}
              </Text>
            ))}
            {contact ? <Text style={s.small}>{contact}</Text> : null}
            {reg ? <Text style={s.small}>{reg}</Text> : null}
          </View>
        </View>

        <View style={s.parties}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.label}>{doc.type === "proforma" ? "Bill to" : "To"}</Text>
            {doc.to.map((l, i) => (
              <Text key={i} style={i === 0 ? [s.strong, { fontSize: 10 }] : { color: muted }}>
                {l}
              </Text>
            ))}
            {doc.attention ? (
              <View style={{ marginTop: 6 }}>
                <Text style={s.label}>Kind attention</Text>
                <Text style={s.strong}>{doc.attention}</Text>
              </View>
            ) : null}
          </View>
          <View>
            <Text style={s.title}>{doc.heading}</Text>
            {doc.ref ? (
              <View style={[s.metaRow, { marginTop: 5 }]}>
                <Text style={s.metaLabel}>Ref</Text>
                <Text style={s.metaValue}>{doc.ref}</Text>
              </View>
            ) : null}
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{dateFmt(doc.date)}</Text>
            </View>
            {doc.validUntil ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Valid until</Text>
                <Text style={s.metaValue}>{dateFmt(doc.validUntil)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {doc.title ? (
          <Text style={{ marginBottom: 8 }}>
            <Text style={s.strong}>Re: </Text>
            {doc.title}
          </Text>
        ) : null}

        <View style={s.body}>
          <TableHeader />
          {doc.rows.map((r, i) =>
            r.kind === "section" ? (
              <View key={i} style={[s.row, { backgroundColor: "#f8fafc" }]} wrap={false}>
                <Text style={[...col.no, s.sectionText]}>{r.sn}</Text>
                <Text style={[...col.desc, s.sectionText]}>{r.label}</Text>
                <View style={col.unit} />
                <View style={col.qty} />
                <View style={col.rate} />
                <View style={col.amt} />
              </View>
            ) : (
              <View key={i} style={s.row} wrap={false}>
                <Text style={[...col.no, { color: muted }]}>{r.sn}</Text>
                <View style={col.desc}>
                  <Text>{r.description}</Text>
                  {r.detail ? <Text style={{ fontSize: 7.5, color: muted, marginTop: 1 }}>{r.detail}</Text> : null}
                </View>
                <Text style={col.unit}>{r.unit}</Text>
                <Text style={col.qty}>{qtyFmt(r.qty)}</Text>
                <Text style={col.rate}>{money(r.unitPrice)}</Text>
                <Text style={col.amt}>{money(r.amount)}</Text>
              </View>
            ),
          )}

          {/* Empty table down to the bottom block (and above it on a page of its own). */}
          <EmptyRows />

          <View style={s.bottom} wrap={false}>
            <EmptyRows />
            <View style={[s.totalRow, { borderTopWidth: 0.75 }]}>
              <Text style={s.totalLabel}>Subtotal (excl. VAT)</Text>
              <Text style={s.totalValue}>{money(doc.subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>VAT @ {doc.vatRatePct}%</Text>
              <Text style={s.totalValue}>{money(doc.vat)}</Text>
            </View>
            <View style={[s.totalRow, { backgroundColor: "#e8eff9", borderBottomWidth: 0.75 }]}>
              <Text style={[s.totalLabel, s.strong, { fontSize: 10 }]}>Total incl. VAT (NGN)</Text>
              <Text style={[s.totalValue, s.strong, { fontSize: 10 }]}>{money(doc.total)}</Text>
            </View>
            <Text style={s.words}>
              <Text style={s.strong}>Amount in words: </Text>
              {doc.totalInWords}
            </Text>

            <View style={s.terms}>
              <View style={{ flex: 1, paddingRight: 14 }}>
                <Text style={s.label}>Terms &amp; conditions</Text>
                {doc.terms.map((t, i) => (
                  <Text key={i} style={{ marginTop: 1.5 }}>
                    • {t}
                  </Text>
                ))}
              </View>
              {hasBank || doc.tin ? (
                <View style={{ width: 262 }}>
                  <Text style={s.label}>Bank details for payment</Text>
                  {doc.bank.bankName ? (
                    <View style={s.bankRow}>
                      <Text style={s.bankLabel}>Bank</Text>
                      <Text style={{ flex: 1 }}>{doc.bank.bankName}</Text>
                    </View>
                  ) : null}
                  {doc.bank.accountName ? (
                    <View style={s.bankRow}>
                      <Text style={s.bankLabel}>Account name</Text>
                      <Text style={{ flex: 1 }}>{doc.bank.accountName}</Text>
                    </View>
                  ) : null}
                  {doc.bank.accountNumber ? (
                    <View style={s.bankRow}>
                      <Text style={s.bankLabel}>Account number</Text>
                      <Text style={[s.strong, { flex: 1 }]}>{doc.bank.accountNumber}</Text>
                    </View>
                  ) : null}
                  {doc.tin ? (
                    <View style={s.bankRow}>
                      <Text style={s.bankLabel}>TIN</Text>
                      <Text style={{ flex: 1 }}>{doc.tin}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={s.signRow}>
              <View style={s.signBlock}>
                <Text style={s.strong}>For {c.name}</Text>
                <View style={s.signLine}>
                  {doc.signatory.name ? <Text style={s.strong}>{doc.signatory.name}</Text> : <Text style={{ color: muted }}>Name</Text>}
                  {doc.signatory.designation ? <Text style={{ color: muted }}>{doc.signatory.designation}</Text> : null}
                  {doc.signatory.phone ? <Text style={{ color: muted }}>{doc.signatory.phone}</Text> : null}
                </View>
              </View>
              <View style={s.signBlock}>
                <Text style={s.strong}>Customer acceptance</Text>
                <View style={s.signLine}>
                  <Text style={{ color: muted }}>Name, signature and date</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <Text
          style={s.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${c.name}  ·  ${doc.heading}${doc.ref ? " " + doc.ref : ""}  ·  Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

export async function renderSalesDocumentPdf(doc: SalesDocument): Promise<Buffer> {
  return renderToBuffer(<SalesDocumentPdf doc={doc} />);
}
