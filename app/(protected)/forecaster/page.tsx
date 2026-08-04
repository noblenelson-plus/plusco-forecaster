// app/(protected)/forecaster/page.tsx
//
// The Forecaster comparison dashboard was merged into the app's home Dashboard
// (`app/(protected)/page.tsx`). This route is kept as a redirect so old links
// still resolve.

import { redirect } from "next/navigation";

export default function ForecasterRedirect() {
  redirect("/");
}
