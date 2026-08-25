"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from "@/lib/constants";
import { formatCompactCurrency } from "@/lib/format";
import { Avatar } from "@/components/ui";
import { updateDealStage } from "./actions";
import type { DealStage } from "@prisma/client";

type DealCard = {
  id: string;
  title: string;
  value: number;
  stage: DealStage;
  owner: { name: string; avatarColor: string };
  account: { name: string } | null;
};

export function KanbanBoard({ deals }: { deals: DealCard[] }) {
  const [items, setItems] = useState(deals);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function moveDeal(dealId: string, stage: DealStage) {
    const deal = items.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;

    let lostReason: string | undefined;
    if (stage === "LOST") {
      lostReason = window.prompt("Reason for losing this deal?") ?? "Not specified";
    }

    setItems((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    startTransition(() => {
      updateDealStage(dealId, stage, lostReason);
    });
  }

  function handleDrop(stage: DealStage) {
    if (!dragId) return;
    moveDeal(dragId, stage);
    setDragId(null);
  }

  return (
    <div className={`flex gap-4 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
      {DEAL_STAGES.map((stage) => {
        const colors = DEAL_STAGE_COLORS[stage];
        const stageDeals = items.filter((d) => d.stage === stage);
        const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);

        return (
          <div
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(stage)}
            className="w-72 shrink-0 rounded-xl bg-slate-100/70 border border-slate-200 flex flex-col max-h-[calc(100vh-9rem)]"
          >
            <div className="px-3 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                <h3 className="text-sm font-semibold text-slate-800">{DEAL_STAGE_LABELS[stage]}</h3>
                <span className="text-xs text-slate-400 ml-auto">{stageDeals.length}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{formatCompactCurrency(stageValue)}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {stageDeals.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDragId(deal.id)}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors"
                >
                  <Link href={`/deals/${deal.id}`} className="block">
                    <p className="text-sm font-medium text-slate-800 line-clamp-2">{deal.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{deal.account?.name ?? "No account"}</p>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-sm font-semibold text-slate-700">
                        {formatCompactCurrency(deal.value)}
                      </span>
                      <Avatar name={deal.owner.name} color={deal.owner.avatarColor} size={6} />
                    </div>
                  </Link>
                  {/* Dragging doesn't work via touch on iPad/iPhone, so this select is the
                      reliable way to change stage on those devices (also works with a mouse). */}
                  <select
                    value={deal.stage}
                    onChange={(e) => moveDeal(deal.id, e.target.value as DealStage)}
                    className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {DEAL_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {DEAL_STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {stageDeals.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Drop deals here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
