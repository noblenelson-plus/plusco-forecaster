import { ForecastRow, MONTH_FIELDS } from './types';

// Parse Firestore string values like "$12,500" or "$0" to numbers
export const parseCurrencyString = (value: any): number => {
  if (typeof value === 'number') return value;
  if (!value || value === '') return 0;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const formatCurrency = (value: number | undefined): string => {
  if (!value && value !== 0) return '$0';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const getMonthValue = (row: ForecastRow, monthIndex: number): number => {
  const field = MONTH_FIELDS[monthIndex];
  return parseCurrencyString(row[field]);
};

export const getRowTotal = (row: ForecastRow): number => {
  let total = 0;
  for (let i = 0; i < 12; i++) {
    total += getMonthValue(row, i);
  }
  return total;
};

export const getMonthTotal = (rows: ForecastRow[], monthIndex: number): number => {
  return rows.reduce((sum, row) => sum + getMonthValue(row, monthIndex), 0);
};

// Build the FO_Submission string to match Firestore format
// Firestore stores: "RFQ 2-2026-BL-2051abdb"
// We have: selectedRFQ.rfq = "RFQ 2", selectedRFQ.year = 2026, selectedClient.id = "2051abdb"
export const buildSubmissionQuery = (rfqName: string, year: number, clientId: string): string => {
  return `${rfqName}-${year}-BL-${clientId}`;
};