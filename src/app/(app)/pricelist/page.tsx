import { redirect } from "next/navigation";

// The Price List and Products tabs were merged into one Products view
// (price entries, with Capacity and the model lookup bar) - this route
// stays only so any old bookmark/link still lands somewhere useful.
export default function PricelistPage() {
  redirect("/products");
}
