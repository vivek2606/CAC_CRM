import type { DealStage, LeadStatus, LeadSource, EquipmentType, ActivityType, ActivityStatus, LostReason, EndUseSegment, AccountType } from "@prisma/client";

// A deal's itemized total discounted more than this far below catalog price
// needs Head approval before it can be marked Won.
export const DISCOUNT_APPROVAL_THRESHOLD_PCT = 15;

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

// An open deal with no update in this many days is flagged as stalled on
// the Dashboard, since there's no dedicated stage-change timestamp to track
// "time in current stage" - last edit is the best available proxy.
export const STALE_DEAL_DAYS = 14;

export const LOST_REASONS: LostReason[] = [
  "PRICE_TOO_HIGH",
  "COMPETITOR",
  "BUDGET_CANCELLED",
  "TIMING",
  "WENT_COLD",
  "OTHER",
];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  PRICE_TOO_HIGH: "Price too high",
  COMPETITOR: "Lost to a competitor",
  BUDGET_CANCELLED: "Budget cut / project cancelled",
  TIMING: "Bad timing / delayed",
  WENT_COLD: "Went cold / no response",
  OTHER: "Other",
};

// Reuses the first 6 steps of the same validated categorical order used for
// LEAD_SOURCE_COLORS, so identity colors stay consistent app-wide.
export const LOST_REASON_COLORS: Record<LostReason, string> = {
  PRICE_TOO_HIGH: "#3b82f6",
  COMPETITOR: "#f97316",
  BUDGET_CANCELLED: "#14b8a6",
  TIMING: "#f59e0b",
  WENT_COLD: "#ec4899",
  OTHER: "#16a34a",
};

// Terminal statuses that should be excluded from "active leads" counts.
export const CLOSED_LEAD_STATUSES: LeadStatus[] = ["CONVERTED", "UNQUALIFIED"];

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

// Winning probability, as a percentage in steps of 10.
export const WIN_PROBABILITY_OPTIONS: number[] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function winProbabilityColor(pct: number): { bg: string; text: string } {
  if (pct >= 70) return { bg: "bg-emerald-100", text: "text-emerald-700" };
  if (pct >= 40) return { bg: "bg-amber-100", text: "text-amber-700" };
  return { bg: "bg-rose-100", text: "text-rose-700" };
}

export const LEAD_SOURCES: LeadSource[] = [
  "COLD_CALL",
  "WEBSITE",
  "CONTRACTOR",
  "CONSULTANT",
  "ARCHITECT",
  "DIRECT",
  "REFERRAL",
  "EVENT",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  COLD_CALL: "Cold Call",
  WEBSITE: "Website",
  CONTRACTOR: "Contractor",
  CONSULTANT: "Consultant",
  ARCHITECT: "Architect",
  DIRECT: "Direct",
  REFERRAL: "Referral",
  EVENT: "Event",
};

// Fixed categorical order, validated for colorblind-safe adjacent contrast
// (see dataviz skill) - never reorder or cycle these independently of LEAD_SOURCES.
export const LEAD_SOURCE_COLORS: Record<LeadSource, string> = {
  COLD_CALL: "#3b82f6",
  WEBSITE: "#f97316",
  CONTRACTOR: "#14b8a6",
  CONSULTANT: "#f59e0b",
  ARCHITECT: "#ec4899",
  DIRECT: "#16a34a",
  REFERRAL: "#7c3aed",
  EVENT: "#ef4444",
};

export const EQUIPMENT_TYPES: EquipmentType[] = [
  "VRF",
  "ATOM",
  "FLOOR_STANDING",
  "ROOFTOP",
  "LARGE_DUCT",
  "MIXED_PRODUCT",
];

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  VRF: "VRF",
  ATOM: "Atom",
  FLOOR_STANDING: "Floor Standing",
  ROOFTOP: "Rooftop",
  LARGE_DUCT: "Large Duct",
  MIXED_PRODUCT: "Mixed Product",
};

export const END_USE_SEGMENTS: EndUseSegment[] = [
  "RESIDENTIAL",
  "COMMERCIAL_OFFICE",
  "HOSPITALITY",
  "RETAIL",
  "HEALTHCARE",
  "INDUSTRIAL",
  "GOVERNMENT_INSTITUTIONAL",
  "REAL_ESTATE_DEVELOPER",
];

export const END_USE_SEGMENT_LABELS: Record<EndUseSegment, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL_OFFICE: "Commercial / Office",
  HOSPITALITY: "Hospitality",
  RETAIL: "Retail",
  HEALTHCARE: "Healthcare",
  INDUSTRIAL: "Industrial",
  GOVERNMENT_INSTITUTIONAL: "Government / Institutional",
  REAL_ESTATE_DEVELOPER: "Real Estate Developer",
};

// Full 8-step validated categorical order used for LEAD_SOURCE_COLORS.
export const END_USE_SEGMENT_COLORS: Record<EndUseSegment, string> = {
  RESIDENTIAL: "#3b82f6",
  COMMERCIAL_OFFICE: "#f97316",
  HOSPITALITY: "#14b8a6",
  RETAIL: "#f59e0b",
  HEALTHCARE: "#ec4899",
  INDUSTRIAL: "#16a34a",
  GOVERNMENT_INSTITUTIONAL: "#7c3aed",
  REAL_ESTATE_DEVELOPER: "#ef4444",
};

export const ACCOUNT_TYPES: AccountType[] = [
  "CONTRACTOR",
  "CONSULTANT",
  "ARCHITECT",
  "DEVELOPER",
  "DISTRIBUTOR",
  "END_USER",
  "GOVERNMENT",
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CONTRACTOR: "Contractor",
  CONSULTANT: "Consultant",
  ARCHITECT: "Architect",
  DEVELOPER: "Real Estate Developer",
  DISTRIBUTOR: "Distributor / Dealer",
  END_USER: "End User",
  GOVERNMENT: "Government",
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
