// app/(protected)/admin/agencies/page.tsx
// The agency ↔ domain editor was merged into the Access page (/admin/users).
// Kept as a redirect so old links still resolve.
import { redirect } from "next/navigation";

export default function AdminAgenciesPage() {
  redirect("/admin/users");
}
