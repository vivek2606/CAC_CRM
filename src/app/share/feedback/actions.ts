"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/push";
import { LOW_RATING } from "@/lib/feedback";

// The customer's answer (no login - the token is the key). Once only.
export async function submitFeedback(token: string, rating: number, comment: string): Promise<{ error?: string }> {
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) return { error: "Please pick a rating from 1 to 5 stars." };
  const fb = await prisma.customerFeedback.findUnique({ where: { token }, select: { id: true, respondedAt: true, dealId: true, deal: { select: { title: true, ownerId: true } } } });
  if (!fb) return { error: "This link isn't valid any more." };
  if (fb.respondedAt) return { error: "Thank you - we already have your feedback." };
  await prisma.customerFeedback.update({ where: { id: fb.id }, data: { rating: r, comment: comment.trim().slice(0, 2000) || null, respondedAt: new Date() } });
  if (r <= LOW_RATING) {
    after(async () => {
      const heads = await prisma.user.findMany({ where: { role: "HEAD", isActive: true }, select: { id: true } });
      await sendPush([...new Set([fb.deal.ownerId, ...heads.map((h) => h.id)])], {
        title: `Unhappy customer: ${r} star${r === 1 ? "" : "s"}`,
        body: `${fb.deal.title}${comment.trim() ? ` - "${comment.trim().slice(0, 120)}"` : ""}`,
        url: `/deals/${fb.dealId}`,
        tag: "feedback",
      });
    });
  }
  return {};
}
