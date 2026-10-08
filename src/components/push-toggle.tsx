"use client";

import { useEffect, useState } from "react";
import { subscribePush, unsubscribePush, sendTestPush } from "@/app/(app)/notifications/actions";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "checking" | "unsupported" | "ios-install" | "blocked" | "off" | "on";

// Turns phone / desktop notifications on or off for this device.
export function PushToggle({ pushKey }: { pushKey: string | null | undefined }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = ios && !standalone ? "ios-install" : "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        const reg = await navigator.serviceWorker.ready;
        next = (await reg.pushManager.getSubscription()) ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pushKey) return null; // not set up on the server yet

  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
      const res = await subscribePush(sub.toJSON());
      setState(res.ok ? "on" : "off");
      if (res.ok) setNote("Turned on - you'll get a morning summary and alerts when something needs you.");
    } catch {
      setNote("Couldn't turn notifications on for this device.");
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setNote(null);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    const { sent } = await sendTestPush();
    setNote(sent ? "Test sent - it should appear in a few seconds." : "Couldn't send a test - try turning notifications off and on again.");
    setBusy(false);
  };

  const btn = "rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60";
  return (
    <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-700">Phone / desktop notifications</span>
        <span className="ml-auto flex items-center gap-1.5">
          {state === "off" && (
            <button type="button" disabled={busy} onClick={turnOn} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
              Turn on
            </button>
          )}
          {state === "on" && (
            <>
              <button type="button" disabled={busy} onClick={test} className={`${btn} border border-slate-300 bg-white hover:bg-slate-100`}>
                Send test
              </button>
              <button type="button" disabled={busy} onClick={turnOff} className={`${btn} text-slate-500 hover:text-slate-800`}>
                Turn off
              </button>
            </>
          )}
          {state === "checking" && <span className="text-slate-400">…</span>}
        </span>
      </div>
      {state === "on" && !note && <p className="mt-1 text-slate-500">On for this device.</p>}
      {state === "blocked" && <p className="mt-1 text-amber-700">Blocked in this browser&apos;s settings - allow notifications for this site, then reopen the app.</p>}
      {state === "ios-install" && <p className="mt-1 text-slate-500">On iPhone / iPad: add the app to your Home Screen (Share → Add to Home Screen), open it from there, then turn this on.</p>}
      {state === "unsupported" && <p className="mt-1 text-slate-500">This browser doesn&apos;t support notifications.</p>}
      {note && <p className="mt-1 text-slate-600">{note}</p>}
    </div>
  );
}
