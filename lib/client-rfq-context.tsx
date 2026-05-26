"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// Admin emails who have access to all clients
const ADMIN_EMAILS = [
  'noble.nelson@pluscompany.com',
  'adriana.viera@pluscompany.com',
];

// Types
export interface Client {
  id: string;
  name: string;
  agency: string;
  status: string;
  logo: string;
}

export interface RFQ {
  year: number;
  rfq: string;
  status: string;
  version: string;
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
      console.log('[ClientRFQ] Auth user:', user?.email);

      if (!user?.email) {
        console.log('[ClientRFQProvider] No user email, clearing clients');
        setClients([]);
        setClientsLoading(false);
        return;
      }

      console.log('[ClientRFQProvider] Loading clients for user:', user.email);

      const isAdmin = ADMIN_EMAILS.includes(user.email);
      console.log('[ClientRFQ] Is admin:', isAdmin, 'Email:', user.email);

      try {
        let allClients: Client[] = [];

        if (isAdmin) {
          // Admin: load all clients from /clients collection
          console.log('[ClientRFQProvider] Admin user - loading all clients');
          const clientSnapshot = await getDocs(collection(db, 'clients'));
          console.log('[ClientRFQ] Clients collection query returned:', clientSnapshot.docs.length, 'records');
          if (clientSnapshot.docs.length > 0) {
            console.log('[ClientRFQ] Sample client doc:', JSON.stringify(clientSnapshot.docs[0]?.data()));
          }
          
          clientSnapshot.docs.forEach(doc => {
            const data: any = doc.data();
            allClients.push({
              id: data.CL_ID || doc.id,
              name: data.CL_Name || data.Client_Name || data.name || 'Unknown',
              agency: data.CL_Agency || data.Agency || '',
              status: data.Client_Status_2026 || data.Status || 'Active',
              logo: data.CL_Logo || data.logo || '',
            });
          });
        } else {
          // Non-admin: load clients via access collection
          console.log('[ClientRFQProvider] Non-admin user - loading assigned clients');
          const accessQuery = query(
            collection(db, 'access'),
            where('Email', '==', user.email)
          );
          const accessSnapshot = await getDocs(accessQuery);
          console.log('[ClientRFQ] Access docs found:', accessSnapshot.size, accessSnapshot.docs.map(d => d.data()));
          
          const allowedClientIds = accessSnapshot.docs.map(doc => {
            const clientId = doc.data().Client_ID;
            console.log('[ClientRFQProvider] Access doc:', { Email: doc.data().Email, Client_ID: clientId });
            return clientId;
          });

          console.log('[ClientRFQProvider] Client IDs found:', allowedClientIds);

          if (allowedClientIds.length === 0) {
            console.log('[ClientRFQProvider] No client IDs found for user');
            setClients([]);
            setClientsLoading(false);
            return;
          }

          const batches: string[][] = [];
          for (let i = 0; i < allowedClientIds.length; i += 30) {
            batches.push(allowedClientIds.slice(i, i + 30));
          }

          console.log('[ClientRFQProvider] Fetching', batches.length, 'batch(es) of clients');

          for (const batch of batches) {
            const clientQuery = query(
              collection(db, 'clients'),
              where('CL_ID', 'in', batch)
            );
            const clientSnapshot = await getDocs(clientQuery);
            console.log('[ClientRFQProvider] Batch query returned', clientSnapshot.docs.length, 'client records');
            if (clientSnapshot.docs.length > 0 && batch === batch) {
              console.log('[ClientRFQ] Sample client doc (batch):', JSON.stringify(clientSnapshot.docs[0]?.data()));
            }
            
            clientSnapshot.docs.forEach(doc => {
              const data: any = doc.data();
              allClients.push({
                id: data.CL_ID || doc.id,
                name: data.CL_Name || data.Client_Name || data.name || 'Unknown',
                agency: data.CL_Agency || data.Agency || '',
                status: data.Client_Status_2026 || data.Status || 'Active',
                logo: data.CL_Logo || data.logo || '',
              });
            });
          }
        }

        console.log('[ClientRFQ] Clients loaded:', allClients.length, allClients);

        allClients.sort((a, b) => a.name.localeCompare(b.name));
        setClients(allClients);

        if (!selectedClient && allClients.length > 0) {
          console.log('[ClientRFQProvider] Auto-selecting first client:', allClients[0].name);
          setSelectedClient(allClients[0]);
        }
      } catch (error) {
        console.error('[ClientRFQProvider] Error loading clients:', error);
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
            { year: 2026, rfq: 'RFQ 0', status: 'Locked', version: 'BL Version', label: '2026 - RFQ 0 (BL Version)' },
            { year: 2026, rfq: 'RFQ 1', status: 'Locked', version: 'BL Version', label: '2026 - RFQ 1 (BL Version)' },
            { year: 2026, rfq: 'RFQ 2', status: 'Unlocked', version: 'BL Version', label: '2026 - RFQ 2 (BL Version)' },
            { year: 2026, rfq: 'RFQ 3', status: 'Locked', version: 'BL Version', label: '2026 - RFQ 3 (BL Version)' },
          ];
          setRFQs(defaultRFQs);
          const unlocked = defaultRFQs.find(r => r.status === 'Unlocked');
          setSelectedRFQ(unlocked || defaultRFQs[0]);
        } else {
          const loadedRFQs: RFQ[] = rfqSnapshot.docs.map(doc => {
            const data: any = doc.data();
            const year = data.Year || data.year;
            const rfq = data.RFQ || data.rfq;
            const version = data.Version || data.version || 'BL Version';

            return {
              year,
              rfq,
              status: data.Status || data.status || 'Locked',
              version,
              label: `${year} - ${rfq} (${version})`,
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
