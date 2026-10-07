"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Calculator as CalculatorIcon, Copy, Check, GripHorizontal, X } from "lucide-react";
import { evaluate, formatNumber } from "@/lib/calc";
import { VAT_RATE } from "@/lib/constants";

// Floating calculator, available on every page from the top bar - for
// working out BOQ / quotation figures without leaving the CRM. Draggable,
// keyboard-friendly, with VAT keys, memory and a short history.

type HistoryItem = { expr: string; result: number };
const VAT_PCT = Math.round(VAT_RATE * 1000) / 10; // 7.5

const KEYS: { label: string; value?: string; action?: "clear" | "back" | "equals"; tone?: "op" | "fn" | "eq" }[][] = [
  [{ label: "C", action: "clear", tone: "fn" }, { label: "(", value: "(", tone: "fn" }, { label: ")", value: ")", tone: "fn" }, { label: "÷", value: "÷", tone: "op" }],
  [{ label: "7", value: "7" }, { label: "8", value: "8" }, { label: "9", value: "9" }, { label: "×", value: "×", tone: "op" }],
  [{ label: "4", value: "4" }, { label: "5", value: "5" }, { label: "6", value: "6" }, { label: "−", value: "−", tone: "op" }],
  [{ label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" }, { label: "+", value: "+", tone: "op" }],
  [{ label: "%", value: "%", tone: "fn" }, { label: "0", value: "0" }, { label: ".", value: "." }, { label: "=", action: "equals", tone: "eq" }],
];

export function CalculatorButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Calculator"
        aria-label="Open calculator"
        aria-pressed={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
          open ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <CalculatorIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Calculator</span>
      </button>
      {open && <CalculatorPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function CalculatorPanel({ onClose }: { onClose: () => void }) {
  // expr = what's been typed; result = the last "=" / VAT result (shown big).
  // Kept together so quick typing never reads a stale result.
  const [calc, setCalc] = useState<{ expr: string; result: number | null }>({ expr: "", result: null });
  const { expr, result } = calc;
  const [error, setError] = useState(false);
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = default corner
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Live preview of the expression typed so far.
  let preview: number | null = null;
  try {
    preview = expr ? evaluate(expr) : null;
  } catch {
    preview = null;
  }
  const current = result ?? preview ?? 0;

  const plain = (n: number) => formatNumber(n).replace(/,/g, "");
  const showResult = (value: number) => setCalc({ expr: plain(value), result: value });

  const press = (value: string) => {
    setError(false);
    setCalc((c) => {
      // Typing a digit right after a result starts afresh; an operator carries the result on.
      if (c.result != null) return { expr: /[\d.(]/.test(value) ? value : plain(c.result) + value, result: null };
      return { expr: c.expr + value, result: null };
    });
  };
  const equals = () => {
    if (!expr) return;
    try {
      const value = evaluate(expr);
      setHistory((h) => [{ expr, result: value }, ...h].slice(0, 8));
      showResult(value);
      setError(false);
    } catch {
      setError(true);
    }
  };
  const clear = () => {
    setCalc({ expr: "", result: null });
    setError(false);
  };
  const back = () => {
    setError(false);
    setCalc((c) => ({ expr: c.expr.slice(0, -1), result: null }));
  };
  // Apply a function to the current value (VAT keys) and show it as the result.
  const apply = (label: string, fn: (v: number) => number) => {
    const v = current;
    const out = Math.round(fn(v) * 100) / 100; // to the kobo
    setHistory((h) => [{ expr: `${formatNumber(v)} ${label}`, result: out }, ...h].slice(0, 8));
    showResult(out);
    setError(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(Math.round(current * 100) / 100));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked - nothing to do
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (/^[\d.()%]$/.test(k)) press(k);
    else if (k === "+") press("+");
    else if (k === "-") press("−");
    else if (k === "*" || k === "x" || k === "X") press("×");
    else if (k === "/") press("÷");
    else if (k === "Enter" || k === "=") equals();
    else if (k === "Backspace") back();
    else if (k === "Delete" || k === "c" || k === "C") clear();
    else if (k === "Escape") onClose();
    else return;
    e.preventDefault();
  };

  // Drag by the title bar.
  const startDrag = (e: ReactPointerEvent) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: ReactPointerEvent) => {
    if (!drag.current || !panelRef.current) return;
    const w = panelRef.current.offsetWidth;
    const h = panelRef.current.offsetHeight;
    setPos({
      x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - w),
      y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - h),
    });
  };

  const keyClass = (tone?: string) =>
    `h-11 rounded-lg text-base font-medium transition-colors active:scale-[0.97] ${
      tone === "op"
        ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        : tone === "fn"
          ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
          : tone === "eq"
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "bg-white border border-slate-200 text-slate-900 hover:bg-slate-50"
    }`;
  const small = "h-8 rounded-md text-xs font-medium transition-colors";

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="dialog"
      aria-label="Calculator"
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={`fixed z-50 w-[19rem] rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none ${pos ? "" : "right-4 top-16"}`}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={() => (drag.current = null)}
        className="flex cursor-move select-none items-center gap-2 rounded-t-2xl border-b border-slate-100 bg-slate-50 px-3 py-2"
      >
        <GripHorizontal className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-700">Calculator</span>
        {memory !== 0 && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">M</span>}
        <button type="button" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Close calculator" className="ml-auto p-1 text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Display */}
        <div className="rounded-xl bg-slate-900 px-3 py-2.5 text-right">
          <div className="min-h-[1rem] truncate text-xs text-slate-400" title={expr}>
            {result != null ? history[0]?.expr : expr || " "}
          </div>
          <div className={`truncate text-2xl font-semibold tabular-nums ${error ? "text-rose-400" : "text-white"}`}>
            {error ? "Error" : formatNumber(current)}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {[
              ["MC", () => setMemory(0)],
              ["MR", () => press(String(Math.round(memory * 1e10) / 1e10))],
              ["M+", () => setMemory((m) => m + current)],
              ["M−", () => setMemory((m) => m - current)],
            ].map(([label, fn]) => (
              <button key={label as string} type="button" onClick={fn as () => void} className={`${small} w-9 bg-slate-100 text-slate-600 hover:bg-slate-200`}>
                {label as string}
              </button>
            ))}
          </div>
          <button type="button" onClick={copy} title="Copy result" className={`${small} inline-flex items-center gap-1 px-2 text-slate-600 hover:bg-slate-100`}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* VAT keys */}
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={() => apply(`+ VAT ${VAT_PCT}%`, (v) => v * (1 + VAT_RATE))} title={`Add ${VAT_PCT}% VAT`} className={`${small} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
            +VAT {VAT_PCT}%
          </button>
          <button type="button" onClick={() => apply(`excl. VAT`, (v) => v / (1 + VAT_RATE))} title="Remove VAT from a VAT-inclusive amount" className={`${small} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
            −VAT
          </button>
          <button type="button" onClick={() => apply(`VAT ${VAT_PCT}% of`, (v) => v * VAT_RATE)} title={`${VAT_PCT}% VAT amount`} className={`${small} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
            VAT amt
          </button>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-4 gap-1.5">
          {KEYS.flat().map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => (k.action === "clear" ? clear() : k.action === "equals" ? equals() : k.action === "back" ? back() : press(k.value!))}
              className={keyClass(k.tone)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={back} className={`${small} w-full bg-slate-100 text-slate-600 hover:bg-slate-200`}>
          ⌫ Backspace
        </button>

        {history.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">History - tap to reuse</p>
            <ul className="max-h-32 space-y-0.5 overflow-y-auto">
              {history.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      showResult(h.result);
                      setError(false);
                    }}
                    className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-left text-xs hover:bg-slate-50"
                  >
                    <span className="truncate text-slate-400">{h.expr}</span>
                    <span className="shrink-0 font-medium tabular-nums text-slate-700">{formatNumber(h.result)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-center text-[10px] text-slate-400">Keyboard works too · Enter = · Esc closes</p>
      </div>
    </div>
  );
}
