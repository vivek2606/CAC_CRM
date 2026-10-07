import { Document, Font, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { SalesDocument } from "@/lib/sales-document";

// A4 quotation / proforma invoice / bill of quantity. Amounts are printed
// as plain numbers under "NGN" headings - the built-in PDF fonts have no ₦
// glyph.

// Wrap whole words - no "Lim-ited" style hyphenation in names and numbers.
Font.registerHyphenationCallback((word) => [word]);

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
const dateFmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const ink = "#0f172a";
const muted = "#64748b";
const line = "#e2e8f0";
const accent = "#4338ca";

const s = StyleSheet.create({
  // paddingTop leaves room for the continuation header on pages 2+.
  page: { paddingTop: 64, paddingBottom: 46, paddingHorizontal: 38, fontSize: 9, fontFamily: "Helvetica", color: ink },
  contHeader: { position: "absolute", top: 22, left: 38, right: 38 },
  contTitle: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: muted, marginBottom: 4 },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 10, marginBottom: 12, marginTop: -32 },
  logo: { maxHeight: 46, maxWidth: 170, objectFit: "contain", marginBottom: 5 },
  company: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 7.5, color: muted, marginTop: 1.5 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: accent, textAlign: "right", letterSpacing: 1 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  metaLabel: { fontSize: 8, color: muted, width: 60, textAlign: "right", marginRight: 6 },
  metaValue: { fontSize: 8, fontFamily: "Helvetica-Bold", maxWidth: 140, textAlign: "right" },
  parties: { flexDirection: "row", marginBottom: 10 },
  label: { fontSize: 7, color: muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  strong: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: "#eef2ff", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#c7d2fe", paddingVertical: 5 },
  thText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#3730a3" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: line, paddingVertical: 5 },
  section: { flexDirection: "row", backgroundColor: "#f8fafc", borderBottomWidth: 0.5, borderBottomColor: line, paddingVertical: 4 },
  cNo: { width: 24, paddingLeft: 4 },
  cDesc: { flex: 1, paddingRight: 6 },
  cUnit: { width: 30, textAlign: "center" },
  cQty: { width: 34, textAlign: "right" },
  cPrice: { width: 80, textAlign: "right" },
  cAmt: { width: 88, textAlign: "right", paddingRight: 4 },
  totals: { alignSelf: "flex-end", width: 240, marginTop: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, marginTop: 2, borderTopWidth: 1.5, borderTopColor: ink },
  words: { marginTop: 10, padding: 7, backgroundColor: "#f8fafc", borderWidth: 0.5, borderColor: line, fontSize: 8.5 },
  bottom: { flexDirection: "row", marginTop: 12 },
  bankRow: { flexDirection: "row", marginTop: 2 },
  bankLabel: { width: 78, color: muted, fontSize: 8.5 },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  signBlock: { width: 220 },
  signLine: { borderTopWidth: 0.75, borderTopColor: ink, marginTop: 28, paddingTop: 4 },
  footer: { position: "absolute", bottom: 20, left: 38, right: 38, fontSize: 7, color: muted, textAlign: "center", borderTopWidth: 0.5, borderTopColor: line, paddingTop: 5 },
});

function TableHeader() {
  return (
    <View style={s.th}>
      <Text style={[s.thText, s.cNo]}>S/N</Text>
      <Text style={[s.thText, s.cDesc]}>Description</Text>
      <Text style={[s.thText, s.cUnit]}>Unit</Text>
      <Text style={[s.thText, s.cQty]}>Qty</Text>
      <Text style={[s.thText, s.cPrice]}>Rate (NGN)</Text>
      <Text style={[s.thText, s.cAmt]}>Amount (NGN)</Text>
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
        <View style={s.header}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            {c.logo ? <Image src={c.logo} style={s.logo} /> : null}
            <Text style={s.company}>{c.name}</Text>
            {c.addressLines.filter(Boolean).map((l) => (
              <Text key={l} style={s.small}>
                {l}
              </Text>
            ))}
            {contact ? <Text style={s.small}>{contact}</Text> : null}
            {reg ? <Text style={s.small}>{reg}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>{doc.heading}</Text>
            {doc.ref ? (
              <View style={[s.metaRow, { marginTop: 6 }]}>
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

        <View style={s.parties}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.label}>{doc.type === "proforma" ? "Bill to" : "To"}</Text>
            {doc.to.map((l, i) => (
              <Text key={i} style={i === 0 ? [s.strong, { fontSize: 10 }] : { color: muted }}>
                {l}
              </Text>
            ))}
          </View>
          {doc.attention ? (
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Kind attention</Text>
              <Text style={s.strong}>{doc.attention}</Text>
            </View>
          ) : null}
        </View>

        {doc.title ? (
          <Text style={{ marginBottom: 8 }}>
            <Text style={s.strong}>Re: </Text>
            {doc.title}
          </Text>
        ) : null}

        <TableHeader />
        {doc.rows.map((r, i) =>
          r.kind === "section" ? (
            <View key={i} style={s.section} wrap={false}>
              <Text style={[s.cNo, s.strong]}>{r.sn}</Text>
              <Text style={[s.cDesc, s.strong]}>{r.label}</Text>
            </View>
          ) : (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.cNo, { color: muted }]}>{r.sn}</Text>
              <View style={s.cDesc}>
                <Text>{r.description}</Text>
                {r.detail ? <Text style={{ fontSize: 7.5, color: muted, marginTop: 1 }}>{r.detail}</Text> : null}
              </View>
              <Text style={s.cUnit}>{r.unit}</Text>
              <Text style={s.cQty}>{qtyFmt(r.qty)}</Text>
              <Text style={s.cPrice}>{money(r.unitPrice)}</Text>
              <Text style={s.cAmt}>{money(r.amount)}</Text>
            </View>
          ),
        )}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>Subtotal (excl. VAT)</Text>
            <Text>{money(doc.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: muted }}>VAT @ {doc.vatRatePct}%</Text>
            <Text>{money(doc.vat)}</Text>
          </View>
          <View style={s.grand}>
            <Text style={[s.strong, { fontSize: 10 }]}>Total incl. VAT (NGN)</Text>
            <Text style={[s.strong, { fontSize: 10 }]}>{money(doc.total)}</Text>
          </View>
        </View>

        <View style={s.words} wrap={false}>
          <Text>
            <Text style={s.strong}>Amount in words: </Text>
            {doc.totalInWords}
          </Text>
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={{ flex: 1, paddingRight: 14 }}>
            <Text style={s.label}>Terms &amp; conditions</Text>
            {doc.terms.map((t, i) => (
              <Text key={i} style={{ marginTop: 1.5 }}>
                • {t}
              </Text>
            ))}
          </View>
          {hasBank || doc.tin ? (
            <View style={{ width: 210 }}>
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

        <View style={s.signRow} wrap={false}>
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
