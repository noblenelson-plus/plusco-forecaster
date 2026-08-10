// components/forecaster/copy-row-context.tsx
"use client";

/**
 * Provides the "copy a BL row to another submission" action to the grid rows
 * without prop-drilling through every bucket/row renderer. Mounted once around
 * the active grid (media / labs / revenue): it captures the current selection
 * (client / year / RFQ) and the active axis config, and hosts the modal.
 *
 * Rows call `useCopyRow()?.open(row, bucketName)`. The controller is null when
 * the selection isn't complete (no submission to copy from), so rows simply
 * omit the action.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AxisConfig, ForecastRow } from "../../lib/types/forecaster.types";
import type { RFQ } from "../../lib/types/rfq.types";
import { useForecastSelection } from "../../lib/stores/forecast-selection.store";
import { useAuth } from "../../lib/auth-context";
import CopyRowModal, { type CopyRowSource } from "./copy-row-modal";

interface CopyRowController {
  /** Open the "copy to submission" dialog for a BL row of the active axis. */
  open: (row: ForecastRow, bucketName: string) => void;
}

const CopyRowContext = createContext<CopyRowController | null>(null);

/** The copy-row controller, or null when outside the provider / no selection. */
export function useCopyRow(): CopyRowController | null {
  return useContext(CopyRowContext);
}

export function CopyRowProvider({
  config,
  rfqs,
  children,
}: {
  config: AxisConfig;
  rfqs: RFQ[];
  children: ReactNode;
}) {
  const { selectedClient, selectedYear, selectedRFQ } = useForecastSelection();
  const { user } = useAuth();
  const [source, setSource] = useState<CopyRowSource | null>(null);

  const ready =
    !!selectedClient && selectedYear != null && !!selectedRFQ && rfqs.length > 0;

  const open = useCallback(
    (row: ForecastRow, bucketName: string) => {
      if (ready) setSource({ row, bucketName });
    },
    [ready]
  );

  const controller = useMemo<CopyRowController | null>(
    () => (ready ? { open } : null),
    [ready, open]
  );

  return (
    <CopyRowContext.Provider value={controller}>
      {children}
      {source && selectedClient && selectedYear != null && selectedRFQ && (
        <CopyRowModal
          source={source}
          config={config}
          clientId={selectedClient.cl_id}
          clientName={selectedClient.CL_Name}
          sourceYear={selectedYear}
          sourceRfq={selectedRFQ.type}
          rfqs={rfqs}
          userUid={user?.uid}
          onClose={() => setSource(null)}
        />
      )}
    </CopyRowContext.Provider>
  );
}
