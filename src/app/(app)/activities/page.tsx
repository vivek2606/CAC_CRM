import { redirect } from "next/navigation";

// Activities now live in Leads & Activities, as its "Activities" tab.
export default function ActivitiesPage() {
  redirect("/leads?tab=activities");
}
