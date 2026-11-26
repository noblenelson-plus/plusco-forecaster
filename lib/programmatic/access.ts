// lib/programmatic/access.ts

/**
 * Who may open the Programmatic (preview) page while it is a demo. A short
 * named list (not "all admins"), same model as lib/finance-toolkit/access.ts:
 * the sidebar entry and the page check it, and the Firestore rule on
 * `programmatic_preview` (firestoreRules.txt) holds the same list, which is the
 * real boundary.
 *
 * To open it to more people, add their company email here (lowercase) AND in
 * the `programmatic_preview` rule, then deploy rules + hosting.
 */

export const PROGRAMMATIC_PREVIEW_VIEWERS: readonly string[] = [
  "noble.nelson@pluscompany.com",
  "adriana.novoa@pluscompany.com",
  "harshal.walambe@cossettemedia.com",
];

export function canViewProgrammaticPreview(email: string | null | undefined): boolean {
  return !!email && PROGRAMMATIC_PREVIEW_VIEWERS.includes(email.trim().toLowerCase());
}
