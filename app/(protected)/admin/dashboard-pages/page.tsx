// app/(protected)/admin/dashboard-pages/page.tsx
// Dashboard Pages (per-role visibility) became Dashboard Access (per-dashboard
// mode + domain / people grants). Keep this route as a redirect so old links
// and bookmarks still resolve.
import { redirect } from "next/navigation";

export default function DashboardPagesRedirect() {
  redirect("/admin/dashboard-access");
}
