// components/bulk-edit/google-connect.tsx
"use client";

/**
 * Google connection control for the Bulk Edit page. Owns the GIS OAuth state and
 * reports it up so the export/import panels can enable themselves. When the
 * client id is not configured it renders a clear "not configured" hint instead
 * of a dead button.
 */

import { useState } from "react";
import { Loader2, Link2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  connect,
  disconnect,
  isConnected,
  isGoogleConfigured,
} from "../../lib/services/google-sheets-service";

export default function GoogleConnect({
  connected,
  onConnectedChange,
}: {
  connected: boolean;
  onConnectedChange: (connected: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = isGoogleConfigured();

  async function handleConnect() {
    setBusy(true);
    setError("");
    try {
      await connect();
      onConnectedChange(isConnected());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed.");
      onConnectedChange(false);
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    disconnect();
    onConnectedChange(false);
  }

  if (!configured) {
    return (
      <div className="flex items-start gap-2.5 bg-yellow-400 border border-yellow-400 rounded-lg px-3 py-2.5">
        <AlertTriangle size={15} className="text-gray-900 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-gray-900 leading-relaxed">
          <span className="font-semibold">Google Sheets not configured.</span> Set{" "}
          <code className="font-mono bg-gray-900 text-yellow-400 px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>{" "}
          in <code className="font-mono bg-gray-900 text-yellow-400 px-1 rounded">.env.local</code> (OAuth Web
          client with the Sheets + Drive APIs enabled), then restart the dev server.
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {connected ? (
        <>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 border border-green-500 rounded-lg text-sm font-medium text-white">
            <CheckCircle2 size={14} /> Connected to Google
          </span>
          <button
            onClick={handleDisconnect}
            className="text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          {busy ? "Connecting…" : "Connect Google"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
