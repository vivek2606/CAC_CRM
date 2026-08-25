import type { DealStage, LeadStatus, LeadSource, ActivityType, ActivityStatus } from "@prisma/client";

export const DEAL_STAGES: DealStage[] = [
  "QUALIFICATION",
  "NEEDS_ANALYSIS",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

export const OPEN_DEAL_STAGES: DealStage[] = [
  "QUALIFICATION",
  "NEEDS_ANALYSIS",
  "PROPOSAL",
  "NEGOTIATION",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  QUALIFICATION: "Qualification",
  NEEDS_ANALYSIS: "Needs Analysis",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

export const DEAL_STAGE_COLORS: Record<DealStage, { bg: string; text: string; dot: string }> = {
  QUALIFICATION: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  NEEDS_ANALYSIS: { bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" },
  PROPOSAL: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  NEGOTIATION: { bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500" },
  WON: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  LOST: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500" },
};

export const LEAD_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  UNQUALIFIED: "Unqualified",
  CONVERTED: "Converted",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, { bg: string; text: string }> = {
  NEW: { bg: "bg-blue-100", text: "text-blue-700" },
  CONTACTED: { bg: "bg-sky-100", text: "text-sky-700" },
  QUALIFIED: { bg: "bg-emerald-100", text: "text-emerald-700" },
  UNQUALIFIED: { bg: "bg-slate-200", text: "text-slate-600" },
  CONVERTED: { bg: "bg-indigo-100", text: "text-indigo-700" },
};

export const LEAD_SOURCES: LeadSource[] = [
  "WEBSITE",
  "REFERRAL",
  "COLD_CALL",
  "EMAIL_CAMPAIGN",
  "SOCIAL_MEDIA",
  "EVENT",
  "PARTNER",
  "OTHER",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  REFERRAL: "Referral",
  COLD_CALL: "Cold Call",
  EMAIL_CAMPAIGN: "Email Campaign",
  SOCIAL_MEDIA: "Social Media",
  EVENT: "Event",
  PARTNER: "Partner",
  OTHER: "Other",
};

export const ACTIVITY_TYPES: ActivityType[] = ["CALL", "EMAIL", "MEETING", "TASK", "NOTE"];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  TASK: "Task",
  NOTE: "Note",
};

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const STAGE_DEFAULT_PROBABILITY: Record<DealStage, number> = {
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  WON: 100,
  LOST: 0,
};
