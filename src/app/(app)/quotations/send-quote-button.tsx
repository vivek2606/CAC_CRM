"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, X } from "lucide-react";
import { whatsappLink, waNumber } from "@/lib/whatsapp";
import { emailQuote, logQuoteSent, prepareQuoteSend, type SendInfo } from "./send-actions";

const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

// Send a saved quotation to the customer in one click - WhatsApp (message
// with the PDF link; on a phone, the PDF itself), or email - logged on the
// deal automatically.
export function SendQuoteButton({ quoteId, variant = "link" }: { quoteId: string; variant?: "link" | "button" }) {
  const router = useRouter();
  const [info, setInfo] = useState<SendInfo | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const open = () =>
    start(async () => {
      setError("");
      setStatus("");
      const res = await prepareQuoteSend(quoteId);
      if (res.error) return setError(res.error);
      setInfo(res);
      setPhone(res.phones?.[0] ?? "");
      setEmail(res.emails?.[0] ?? "");
      setSubject(res.subject ?? "");
      setMessage(res.message ?? "");
    });
  // The page refreshes once the dialog is closed (a sent quote can leave a
  // follow-up list, which would take the dialog with it).
  const [sent, setSent] = useState(false);
  const done = (what: string) => {
    setStatus(`${what} - logged in the CRM.`);
    setSent(true);
  };
  const close = () => {
    setInfo(null);
    if (sent) {
      setSent(false);
      router.refresh();
    }
  };
  const log = (channel: "WHATSAPP" | "EMAIL", to: string, what: string) =>
    start(async () => {
      const res = await logQuoteSent(quoteId, channel, to);
      if (res.error) setError(res.error);
      else done(what);
    });

  const sendWhatsApp = () => {
    if (!waNumber(phone)) return setError("Enter the customer's WhatsApp number (e.g. 0803 123 4567).");
    setError("");
    window.open(whatsappLink(phone, message), "_blank", "noopener");
    log("WHATSAPP", phone, "WhatsApp opened with the message");
  };
  // On a phone: share the PDF file itself (to WhatsApp or any app).
  const canShareFile = typeof navigator !== "undefined" && "canShare" in navigator;
  const sharePdf = () =>
    start(async () => {
      setError("");
      try {
        const blob = await (await fetch(info!.link!)).blob();
        const file = new File([blob], `${info!.ref}.pdf`, { type: "application/pdf" });
        if (!navigator.canShare?.({ files: [file] })) return setError("This device can't share files - use WhatsApp above.");
        await navigator.share({ files: [file], text: message });
        const res = await logQuoteSent(quoteId, "WHATSAPP", phone);
        if (res.error) setError(res.error);
        else done("PDF shared");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("Couldn't share the PDF - use WhatsApp above.");
      }
    });
  const sendEmail = () => {
    if (!/@/.test(email)) return setError("Enter the customer's email address.");
    setError("");
    if (info?.canEmail) {
      start(async () => {
        const res = await emailQuote(quoteId, email, subject, message);
        if (res.error) setError(res.error);
        else done(`Emailed to ${email} with the PDF attached`);
      });
    } else {
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      log("EMAIL", email, "Your mail app opened with the message");
    }
  };

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      ) : (
        <button type="button" onClick={open} disabled={pending} className="text-indigo-600 hover:text-indigo-500 font-medium" title="Send to the customer by WhatsApp or email">
          Send
        </button>
      )}
      {error && !info && <span className="ml-2 text-xs text-rose-600">{error}</span>}
      {info && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={close}>
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Send {info.ref} to the customer</h3>
              <button type="button" onClick={close} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block text-xs font-medium text-slate-500">
              <span className="mb-1 block">Message</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} className={field} />
            </label>

            <div className="space-y-2 rounded-lg bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-900">WhatsApp</p>
              <div className="flex gap-2">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} list={`wa-${quoteId}`} placeholder="0803 123 4567" className={field} />
                <datalist id={`wa-${quoteId}`}>{info.phones?.map((p) => <option key={p} value={p} />)}</datalist>
                <button type="button" onClick={sendWhatsApp} disabled={pending} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                  Send on WhatsApp
                </button>
              </div>
              {canShareFile && (
                <button type="button" onClick={sharePdf} disabled={pending} className="text-xs font-medium text-emerald-800 underline">
                  On a phone: share the PDF file itself
                </button>
              )}
            </div>

            <div className="space-y-2 rounded-lg bg-sky-50 p-3">
              <p className="text-xs font-semibold text-sky-900">Email{info.canEmail ? " (PDF attached, you're copied)" : " (opens your mail app with the link)"}</p>
              <input value={email} onChange={(e) => setEmail(e.target.value)} list={`em-${quoteId}`} placeholder="customer@company.com" className={field} />
              <datalist id={`em-${quoteId}`}>{info.emails?.map((e) => <option key={e} value={e} />)}</datalist>
              <div className="flex gap-2">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
                <button type="button" onClick={sendEmail} disabled={pending} className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50">
                  {pending ? "Sending..." : "Send email"}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              The link opens the PDF without logging in, for 60 days. Sending is logged on the deal (or account) and starts its follow-up reminder.
            </p>
            {status && <p className="text-sm font-medium text-emerald-700">✓ {status}</p>}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
