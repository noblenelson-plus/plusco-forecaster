// filepath: lib/finance-toolkit/access.ts

/**
 * Who may open the Finance Toolkit while it is being built. Deliberately a
 * short named list (not "all admins"): the page, the sidebar entry and the
 * data route (app/api/finance-toolkit-data/route.ts) all check it. The route
 * is the real boundary; the page and sidebar only hide the entry.
 *
 * To open it to more people, add their company email here (lowercase).
 */

export const FINANCE_TOOLKIT_VIEWERS: readonly string[] = ["noble.nelson@pluscompany.com"];

export function canViewFinanceToolkit(email: string | null | undefined): boolean {
  return !!email && FINANCE_TOOLKIT_VIEWERS.includes(email.trim().toLowerCase());
}
