// app/(protected)/media/page.tsx
// The Media Spend page is now a tab inside the unified /forecast page.
// Keep this route as a redirect so old links/bookmarks still resolve.
import { redirect } from "next/navigation";

export default function MediaRedirect() {
  redirect("/forecast");
}
