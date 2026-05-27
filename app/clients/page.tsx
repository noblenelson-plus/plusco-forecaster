"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { collection, getDocs, query, where, DocumentData } from "firebase/firestore";
// no special firebase app import needed for constructing public storage URLs

type Client = DocumentData & {
  CL_ID?: string;
  CL_Name?: string;
  CL_Logo?: string;
  CL_Agency?: string;
  Client_Status_2026?: string;
  Hide_Unhide?: string;
};

export default function ClientsPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
  const [loadingClients, setLoadingClients] = useState(false);

  const [search, setSearch] = useState("");
  const [agencyFilter, setAgencyFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace("/auth/login");
      else setLoadingAuth(false);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    async function load() {
      setLoadingClients(true);
      try {
        const q = query(collection(db, "clients"), where("Hide_Unhide", "==", "Unhide"));
        const snap = await getDocs(q);
        const items = snap.docs.map((d) => ({ ...(d.data() as any), _docId: d.id }));
        setClients(items);

        // Construct public storage URLs using the known bucket name so the browser
        // can request images directly. URL-encode the path portion.
        const BUCKET = "pluscoops.appspot.com";
        const map: Record<string, string> = {};
        items.forEach((it) => {
          const id = it.CL_ID || it._docId || it._id || it._docId;
          if (it.CL_Logo) {
            const encoded = encodeURIComponent(String(it.CL_Logo));
            map[id] = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media`;
          }
        });
        setLogoUrls(map);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingClients(false);
      }
    }
    load();
  }, []);

  const agencies = ["Mekanism", "Cossette Media", "Jungle", "K72", "Showroom"];
  const statuses = ["Active", "New client", "Loss", "Inactive"];

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (!c.CL_Name) return false;
      if (search && !String(c.CL_Name).toLowerCase().includes(search.toLowerCase())) return false;
      if (agencyFilter && c.CL_Agency !== agencyFilter) return false;
      if (statusFilter && c.Client_Status_2026 !== statusFilter) return false;
      return true;
    });
  }, [clients, search, agencyFilter, statusFilter]);

  function firstLetter(name?: string) {
    if (!name) return "?";
    return String(name).trim()[0].toUpperCase();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Clients <span className="text-sm text-gray-500">{clients.length}</span></h1>

        <div className="flex-1 max-w-xl ml-6">
          <input
            placeholder="Search for a client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg shadow-sm focus:outline-none"
            aria-label="Search for a client"
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 mr-2">Agency:</span>
          <button
            className={`px-3 py-1 rounded-full text-sm ${!agencyFilter ? 'bg-gray-200 text-gray-800' : 'bg-white border'}`}
            onClick={() => setAgencyFilter(null)}
          >
            All
          </button>
          {agencies.map((a) => (
            <button
              key={a}
              onClick={() => setAgencyFilter(a)}
              className={`px-3 py-1 rounded-full text-sm ${agencyFilter === a ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700'}`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-gray-600 mr-2">Status:</span>
          <button
            className={`px-3 py-1 rounded-full text-sm ${!statusFilter ? 'bg-gray-200 text-gray-800' : 'bg-white border'}`}
            onClick={() => setStatusFilter(null)}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-sm ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-700'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loadingClients ? (
        <div className="py-12 text-center text-gray-600">Loading clients…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {filtered.map((c) => {
            const id = c.CL_ID || c._docId || c._id || c._docId;
            const logo = logoUrls[id];
            return (
              <div
                key={id}
                onClick={() => router.push(`/clients/${c.CL_ID || id}`)}
                role="button"
                className="bg-white rounded-lg p-4 flex flex-col items-center text-center cursor-pointer shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-32 h-32 mb-3 flex items-center justify-center rounded-full overflow-hidden bg-gray-100">
                  {logo && !failedLogos[id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt={c.CL_Name || 'logo'} className="w-full h-full object-contain" onError={() => setFailedLogos((p) => ({ ...p, [id]: true }))} />
                        ) : (
                    <div className="w-16 h-16 flex items-center justify-center rounded-full bg-gray-300 text-xl font-semibold text-gray-700">
                      {firstLetter(c.CL_Name)}
                    </div>
                  )}
                </div>

                <div className="font-semibold text-sm text-gray-900">{c.CL_Name}</div>
                <div className="text-xs text-gray-500 mt-1">{c.CL_Agency}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
