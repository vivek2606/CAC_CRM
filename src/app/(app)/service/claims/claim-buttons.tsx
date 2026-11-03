"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWarrantyClaim } from "../claim-actions";

// Raise a warranty claim for a complaint's free spares (opens it).
export function RaiseClaimButton({ complaintId, label = "Raise claim" }: { complaintId: string; label?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const res = await createWarrantyClaim(complaintId);
            if (res.error) return setError(res.error);
            if (res.id) router.push(`/service/claims/${res.id}`);
          })
        }
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "..." : label}
      </button>
    </span>
  );
}
