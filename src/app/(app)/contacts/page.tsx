import { redirect } from "next/navigation";

// Contacts now live in Accounts & Contacts, as its "Contacts" tab.
export default function ContactsPage() {
  redirect("/accounts?tab=contacts");
}
