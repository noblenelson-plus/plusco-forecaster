'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useClientRFQ } from '@/lib/client-rfq-context';
import { useTranslations } from 'next-intl';
import { ForecastRow as ForecastRowType } from './types';
import { ForecastHeader } from './ForecastHeader';
import { ForecastRow } from './ForecastRow';
import { ForecastSummary } from './ForecastSummary';
import { ActualsSection } from './ActualsSection';
import { getRowTotal, buildSubmissionQuery } from './utils';

export function ForecastTable() {
  const { selectedClient, selectedRFQ, isRFQLocked } = useClientRFQ();
  const t = useTranslations();

  const [forecasts, setForecasts] = useState<ForecastRowType[]>([]);
  const [actuals, setActuals] = useState<ForecastRowType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedClient || !selectedRFQ) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');

      try {
        // Build the submission string matching Firestore format
        const submissionStr = buildSubmissionQuery(
          selectedRFQ.rfq,
          selectedRFQ.year,
          selectedClient.id
        );

        console.log('[ForecastTable] Querying forecasts for:', {
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          submissionStr: submissionStr,
          rfq: selectedRFQ,
        });

        // Query using client ID and built submission string
        const q = query(
          collection(db, 'forecasts'),
          where('FO_Client', '==', selectedClient.id),
          where('FO_Submission', '==', submissionStr)
        );

        const snapshot = await getDocs(q);
        console.log('[ForecastTable] Found', snapshot.size, 'forecast rows');

        if (snapshot.docs.length > 0) {
          console.log('[ForecastTable] Sample doc:', JSON.stringify(snapshot.docs[0].data()));
        }

        const forecastRows: ForecastRowType[] = [];
        const actualRows: ForecastRowType[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data() as ForecastRowType;
          data.id = doc.id;

          if (data.FO_Type === 'Media spend forecast') {
            forecastRows.push(data);
          } else if (
            data.FO_Type === 'GAIA Actuals' ||
            data.FO_Type === '00_Actuals' ||
            data.FO_Type === 'Actuals'
          ) {
            actualRows.push(data);
          }
        });

        console.log('[ForecastTable] Media spend rows:', forecastRows.length);
        console.log('[ForecastTable] Actuals rows:', actualRows.length);

        setForecasts(forecastRows);
        setActuals(actualRows);
      } catch (err) {
        console.error('[ForecastTable] Query error:', err);
        setError('Failed to load forecast data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedClient, selectedRFQ]);

  if (!selectedClient) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Select a client to view forecasts</p>
      </div>
    );
  }

  if (!selectedRFQ) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Select an RFQ period</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <p className="text-gray-500 mt-4">Loading forecast data...</p>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-red-600">{error}</div>;
  }

  if (forecasts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No forecast data found for this client and RFQ</p>
        <p className="text-xs text-gray-400 mt-2">
          Client ID: {selectedClient.id} | Submission: {buildSubmissionQuery(selectedRFQ.rfq, selectedRFQ.year, selectedClient.id)}
        </p>
      </div>
    );
  }

  const totalActuals = actuals.reduce((sum, row) => sum + getRowTotal(row), 0);

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full border-collapse">
        <ForecastHeader />
        <tbody>
          {forecasts.map((row, idx) => (
            <ForecastRow key={row.id} row={row} isEditable={!isRFQLocked} isAlternate={idx % 2 === 1} />
          ))}
          <ForecastSummary rows={forecasts} />
          {actuals.length > 0 && (
            <ActualsSection rows={actuals} totalActuals={totalActuals} />
          )}
        </tbody>
      </table>
    </div>
  );
}