// app/(protected)/admin/agencies/page.tsx
// The agency ↔ domain editor lives on Admin → Dashboard Access (Agencies & Domains tab).
// Kept as a redirect so old links still resolve.
import { redirect } from "next/navigation";

export default function AdminAgenciesPage() {
  redirect("/admin/dashboard-access");
}
