"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canAccessOwner, isBackOffice, requireUser } from "@/lib/rbac";
import { requireService, SERVICE_MANAGER } from "@/lib/service-access";
import { audit } from "@/lib/audit";
import { sendPush } from "@/lib/push";
import { serialElsewhere, SerialTaken, serialSlots } from "@/lib/installed-base";
import { nextInstallRef, type InstallStatus } from "@/lib/installation";

type Result = { error?: string; id?: string };
const clean = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

function done(id?: string, dealId?: string) {
  revalidatePath("/service/installations");
  if (id) revalidatePath(`/service/installations/${id}`);
  if (dealId) revalidatePath(`/deals/${dealId}`);
}

// The Service Manager(s) and the Sales Coordinator: who plans installations.
async function planners(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { isActive: true, OR: [{ title: SERVICE_MANAGER }, { role: "COORDINATOR" }] }, select: { id: true } });
  return users.map((u) => u.id);
}

export type HandoverInput = { contactName: string; phone: string; siteAddress: string; preferredDate: string; notes: string };

// The sales person (or the Head / Coordinator) hands a won supply +
// installation order over to service.
export async function handOverInstallation(dealId: string, input: HandoverInput): Promise<Result> {
  const user = await requireUser();
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, title: true, stage: true, ownerId: true, customerName: true, customerPhone: true, account: { select: { name: true } }, installationJob: { select: { id: true } } },
  });
  if (!deal || !(canAccessOwner(user, deal.ownerId) || isBackOffice(user))) return { error: "Deal not found." };
  if (deal.installationJob) return { id: deal.installationJob.id };
  if (deal.stage !== "WON") return { error: "Hand over for installation once the deal is Won (invoiced)." };
  const siteAddress = clean(input.siteAddress);
  if (!siteAddress) return { error: "Enter the site address - where the units are to be installed." };
  const phone = clean(input.phone, 60) || deal.customerPhone || "";
  if (!phone) return { error: "Enter the site contact's phone no." };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const job = await prisma.installationJob.create({
        data: {
          ref: await nextInstallRef(),
          dealId: deal.id,
          customerName: deal.account?.name ?? deal.customerName ?? deal.title,
          contactName: clean(input.contactName, 120) || null,
          phone,
          siteAddress,
          preferredDate: day(input.preferredDate),
          handoverNotes: clean(input.notes, 2000) || null,
          createdById: user.id,
        },
      });
      await audit("deal", deal.id, user.id, "edited", `Handed over for installation (${job.ref}).`);
      await sendPush(
        (await planners()).filter((id) => id !== user.id),
        { title: `New installation to schedule - ${job.customerName}`, body: `${job.ref} · ${siteAddress}${job.preferredDate ? ` · preferred ${job.preferredDate.toISOString().slice(0, 10).split("-").reverse().join("/")}` : ""}`, url: `/service/installations/${job.id}`, tag: `ins-${job.id}` },
      );
      done(job.id, deal.id);
      return { id: job.id };
    } catch (e) {
      if (!(e instanceof Error && /Unique constraint/i.test(e.message)) || attempt === 2) throw e;
    }
  }
  return { error: "Couldn't save - try again." };
}

export type InstallUpdate =
  | { action: "schedule"; scheduledDate: string; team: string }
  | { action: "start" }
  | { action: "cancel"; reason: string }
  | { action: "reopen" }
  | { action: "notes"; notes: string; contactName: string; phone: string; siteAddress: string };

export async function updateInstallation(id: string, u: InstallUpdate): Promise<Result> {
  await requireService();
  const job = await prisma.installationJob.findUnique({ where: { id }, select: { id: true, status: true, dealId: true, startedAt: true } });
  if (!job) return { error: "Installation not found." };
  const status = job.status as InstallStatus;
  const closed = status === "COMMISSIONED" || status === "CANCELLED";
  let data: Parameters<typeof prisma.installationJob.update>[0]["data"];
  switch (u.action) {
    case "schedule": {
      const d = day(u.scheduledDate);
      if (!d) return { error: "Pick the installation date." };
      if (!clean(u.team, 120)) return { error: "Enter the installation team or contractor." };
      if (closed) return { error: "This installation is closed." };
      data = { scheduledDate: d, team: clean(u.team, 120), status: status === "IN_PROGRESS" ? "IN_PROGRESS" : "SCHEDULED" };
      break;
    }
    case "start":
      if (status !== "SCHEDULED") return { error: "Schedule it first." };
      data = { status: "IN_PROGRESS", startedAt: job.startedAt ?? new Date() };
      break;
    case "cancel":
      if (!clean(u.reason)) return { error: "Say why it is cancelled (e.g. customer's own installer)." };
      if (status === "COMMISSIONED") return { error: "Already commissioned." };
      data = { status: "CANCELLED", cancelReason: clean(u.reason) };
      break;
    case "reopen":
      if (!closed) return {};
      data = { status: "PENDING", cancelReason: null, commissionedAt: null };
      break;
    case "notes":
      data = { notes: clean(u.notes, 2000) || null, contactName: clean(u.contactName, 120) || null, phone: clean(u.phone, 60) || null, siteAddress: clean(u.siteAddress) || null };
      break;
  }
  await prisma.installationJob.update({ where: { id }, data });
  done(id, job.dealId);
  return {};
}

// Commissioned: each unit's serial no. (from its plate) goes on the
// installed base, with the installation date and site. A serial that can't
// be read needs a reason.
export type CommissionInput = { commissionedAt: string; units: { unitId: string; serials: string[] }[]; missingReason: string };

export async function commissionInstallation(id: string, input: CommissionInput): Promise<Result> {
  const user = await requireService();
  const job = await prisma.installationJob.findUnique({
    where: { id },
    select: { id: true, ref: true, status: true, dealId: true, siteAddress: true, customerName: true, deal: { select: { ownerId: true } } },
  });
  if (!job) return { error: "Installation not found." };
  if (job.status === "COMMISSIONED" || job.status === "CANCELLED") return { error: "This installation is closed." };
  const at = day(input.commissionedAt);
  if (!at) return { error: "Enter the commissioning date." };
  if (at.getTime() > Date.now() + 86400000) return { error: "The commissioning date can't be in the future." };
  const lines = await prisma.installedUnit.findMany({ where: { dealId: job.dealId }, select: { id: true, qty: true, serialNos: true, model: true } });

  // Check everything first.
  const seen = new Set<string>();
  let missing = 0;
  const plan: { id: string; serials: string[] }[] = [];
  for (const line of lines) {
    const given = input.units.find((u) => u.unitId === line.id)?.serials ?? [];
    const slots = serialSlots(line).map((s, i) => clean(given[i] ?? s, 100));
    for (const sn of slots) {
      if (!sn) {
        missing++;
        continue;
      }
      if (seen.has(sn.toUpperCase())) return { error: `Serial no. ${sn} is entered twice.` };
      seen.add(sn.toUpperCase());
    }
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      try {
        await serialElsewhere(slots[i], line.id, i);
      } catch (e) {
        if (e instanceof SerialTaken) return { error: `Serial no. ${slots[i]} is already recorded on ${e.message} - check it.` };
        throw e;
      }
    }
    plan.push({ id: line.id, serials: slots });
  }
  const reason = clean(input.missingReason);
  if (missing && !reason) return { error: `${missing} unit${missing === 1 ? " has" : "s have"} no serial no. - enter them from the units' plates, or say why they can't be read.` };

  for (const p of plan) {
    const slots = [...p.serials];
    while (slots.length && !slots[slots.length - 1]) slots.pop();
    await prisma.installedUnit.update({
      where: { id: p.id },
      data: { serialNos: slots, installedAt: at, ...(job.siteAddress ? { siteAddress: job.siteAddress } : {}) },
    });
  }
  await prisma.installationJob.update({
    where: { id },
    data: { status: "COMMISSIONED", commissionedAt: at, ...(missing ? { notes: `Serial nos. missing for ${missing} unit(s): ${reason}` } : {}) },
  });
  await audit("deal", job.dealId, user.id, "edited", `Installation ${job.ref} commissioned.`);
  if (job.deal.ownerId !== user.id)
    await sendPush([job.deal.ownerId], { title: `Installed and commissioned - ${job.customerName}`, body: `${job.ref} · ${input.commissionedAt.split("-").reverse().join("/")}`, url: `/deals/${job.dealId}`, tag: `ins-${job.id}` });
  done(id, job.dealId);
  return {};
}
