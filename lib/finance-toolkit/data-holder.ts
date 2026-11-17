// filepath: lib/finance-toolkit/data-holder.ts

/**
 * Holds the Finance Toolkit dataset once the page has downloaded it from
 * /api/finance-toolkit-data. model.ts reads it when it is first evaluated, so
 * the page must call setFinanceToolkitData() before it dynamically imports the
 * toolkit UI (which imports model.ts). The dataset never ships in a bundle.
 */

import type { FinanceToolkitData } from "./finance-toolkit.types";

let data: FinanceToolkitData | null = null;

export function setFinanceToolkitData(d: FinanceToolkitData): void {
  data = d;
}

export function getFinanceToolkitData(): FinanceToolkitData {
  if (!data) throw new Error("Finance Toolkit data not loaded yet (setFinanceToolkitData must run first).");
  return data;
}
