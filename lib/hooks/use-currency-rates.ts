// lib/hooks/use-currency-rates.ts

import { useEffect, useState } from "react";
import { subscribeToCurrencyRates } from "../services/currency-service";
import type { CurrencyRate } from "../types/currency.types";

/** Subscribe to the admin-managed yearly USD→CAD rates in real time. */
export function useCurrencyRates(): CurrencyRate[] {
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  useEffect(() => {
    const unsub = subscribeToCurrencyRates(setRates);
    return () => unsub();
  }, []);
  return rates;
}
