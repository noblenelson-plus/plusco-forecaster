"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Types
export interface Client {
  id: string;
  name: string;
  agency: string;
  status: string;
}

export interface RFQ {
  year: number;
  rfq: string;
  status: string;
  label: string;
}

interface ClientRFQContextType {
  clients: Client[];
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  clientsLoading: boolean;

  rfqs: RFQ[];
  selectedRFQ: RFQ | null;
  setSelectedRFQ: (rfq: RFQ | null) => void;
  rfqsLoading: boolean;

  isRFQLocked: boolean;
}

const ClientRFQContext = createContext<ClientRFQContextType | undefined>(undefined);

export function ClientRFQProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientsLoading, setClientsLoading] = useState(true);

  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);
  const [rfqsLoading, setRFQsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user?.email) {
        setClients([]);
        setClientsLoading(false);
        return;
      }

      try {
        const accessQuery = query(
          collection(db, 'access'),
          where('Email', '==', user.email)
        );
        const accessSnapshot = await getDocs(accessQuery);
        const allowedClientIds = accessSnapshot.docs.map(doc => doc.data().Client_ID);

        if (allowedClientIds.length === 0) {
          setClients([]);
          setClientsLoading(false);
          return;
        }

        const allClients: Client[] = [];
        const batches: string[][] = [];
        for (let i = 0; i < allowedClientIds.length; i += 30) {
          batches.push(allowedClientIds.slice(i, i + 30));
        }

        for (const batch of batches) {
          const clientQuery = query(
            collection(db, 'clients'),
            where('CL_ID', 'in', batch)
          );
          const clientSnapshot = await getDocs(clientQuery);
          clientSnapshot.docs.forEach(doc => {
            const data: any = doc.data();
            allClients.push({
              id: data.CL_ID || doc.id,
              name: data.Client_Name || data.name || 'Unknown',
              agency: data.Agency || '',
              status: data.Status || 'Active',
            });
          });
        }

        allClients.sort((a, b) => a.name.localeCompare(b.name));
        setClients(allClients);

        if (!selectedClient && allClients.length > 0) {
          setSelectedClient(allClients[0]);
        }
      } catch (error) {
        console.error('Error loading clients:', error);
      } finally {
        setClientsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadRFQs = async () => {
      try {
        const rfqSnapshot = await getDocs(collection(db, 'rfq_settings'));

        if (rfqSnapshot.empty) {
          const defaultRFQs: RFQ[] = [
            { year: 2026, rfq: 'RFQ 0', status: 'Locked', label: '2026 RFQ 0' },
            { year: 2026, rfq: 'RFQ 1', status: 'Locked', label: '2026 RFQ 1' },
            { year: 2026, rfq: 'RFQ 2', status: 'Unlocked', label: '2026 RFQ 2' },
            { year: 2026, rfq: 'RFQ 3', status: 'Locked', label: '2026 RFQ 3' },
          ];
          setRFQs(defaultRFQs);
          const unlocked = defaultRFQs.find(r => r.status === 'Unlocked');
          setSelectedRFQ(unlocked || defaultRFQs[0]);
        } else {
          const loadedRFQs: RFQ[] = rfqSnapshot.docs.map(doc => {
            const data: any = doc.data();
            return {
              year: data.Year || data.year,
              rfq: data.RFQ || data.rfq,
              status: data.Status || data.status || 'Locked',
              label: `${data.Year || data.year} ${data.RFQ || data.rfq}`,
            };
          });
          loadedRFQs.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return a.rfq.localeCompare(b.rfq);
          });
          setRFQs(loadedRFQs);
          const unlocked = loadedRFQs.find(r => r.status === 'Unlocked');
          setSelectedRFQ(unlocked || loadedRFQs[0]);
        }
      } catch (error) {
        console.error('Error loading RFQs:', error);
      } finally {
        setRFQsLoading(false);
      }
    };

    loadRFQs();
  }, []);

  const isRFQLocked = selectedRFQ?.status === 'Locked';

  return (
    <ClientRFQContext.Provider
      value={{
        clients,
        selectedClient,
        setSelectedClient,
        clientsLoading,
        rfqs,
        selectedRFQ,
        setSelectedRFQ,
        rfqsLoading,
        isRFQLocked,
      }}
    >
      {children}
    </ClientRFQContext.Provider>
  );
}

export function useClientRFQ() {
  const context = useContext(ClientRFQContext);
  if (!context) {
    throw new Error('useClientRFQ must be used within a ClientRFQProvider');
  }
  return context;
}
