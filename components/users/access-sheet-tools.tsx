// components/users/access-sheet-tools.tsx
"use client";

/**
 * Compact Export / Import controls for the admin Users toolbar (Team tab).
 *
 * Sits beside the role-filter chips. Google connects on demand the first time you
 * Export or Import (no separate Connect button). The sheet is the source of truth
 * for Business-Lead and Viewer client scope; Import previews every add/remove/skip
 * before writing. Admins/Execs/disabled are never changed; roles never change.
 */

import { useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  connect,
  isConnected,
  createSpreadsheet,
  writeValues,
  readSheet,
  extractSpreadsheetId,
} from "../../lib/services/google-sheets-service";
import { fetchInvites } from "../../lib/services/invite-service";
import {
  computeAccessSync,
  buildExportRows,
  type AccessUser,
  type AccessSyncPlan,
  type SkipReason,
} from "../../lib/services/access-sync";
import { Download, Upload, Loader2 } from "lucide-react";

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
const EXPORT_BTN = BTN_BASE + " bg-gray-900 text-white hover:bg-gray-800";
const IMPORT_BTN = BTN_BASE + " border border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

function skipLabel(reason: SkipReason): string {
  switch (reason) {
    case "not-a-user":
      return "not a user yet - invite them first";
    case "pending-invite":
      return "invite pending - applies after they sign in";
    case "revoked":
      return "account revoked - restore in admin first";
    case "admin-exec":
      return "admin/exec - managed manually, not changed";
    default:
      return reason;
  }
}

async function ensureConnected(): Promise<void> {
  if (!isConnected()) await connect();
}

export default function AccessSheetTools({ users }: { users: AccessUser[] }) {
  const [busy, setBusy] = useState<"" | "export" | "import">("");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sheetInput, setSheetInput] = useState("");
  const [plan, setPlan] = useState<AccessSyncPlan | null>(null);
  const [applied, setApplied] = useState(false);
  const [modalErr, setModalErr] = useState("");

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 6000);
  }

  async function handleExport() {
    const w = window.open("", "_blank"); // reserve a tab up front (popup-safe)
    setBusy("export");
    try {
      await ensureConnected();
      const snap = await getDocs(collection(db, "clients"));
      const nameById = new Map<string, string>();
      snap.forEach((d) => {
        const data = d.data() as { CL_Name?: string };
        nameById.set(d.id, data.CL_Name ?? "");
      });
      const rows = buildExportRows(users, nameById);
      const values: (string | number)[][] = [
        ["Client_ID", "Client_Name", "Email"],
        ...rows.map((r) => [r.clientId, r.clientName, r.email]),
      ];
      const today = new Date().toISOString().slice(0, 10);
      const { spreadsheetId, url } = await createSpreadsheet(
        "Plusco Client Access - " + today,
        ["Client_Access"]
      );
      await writeValues(spreadsheetId, "Client_Access", values);
      if (w) w.location.href = url;
      else flash("ok", "Sheet created (allow pop-ups to open it).");
    } catch (err) {
      if (w) w.close();
      flash("err", err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy("");
    }
  }

  function openImport() {
    setImportOpen(true);
    setSheetInput("");
    setPlan(null);
    setApplied(false);
    setModalErr("");
  }
  function closeImport() {
    setImportOpen(false);
    setBusy("");
  }

  async function handlePreview() {
    setBusy("import");
    setModalErr("");
    setPlan(null);
    setApplied(false);
    try {
      await ensureConnected();
      const id = extractSpreadsheetId(sheetInput.trim());
      if (!id) throw new Error("Could not read a Google Sheet id from that link.");
      const grid = await readSheet(id, "Client_Access");
      if (!grid.length) throw new Error("The Client_Access sheet is empty.");
      const header = grid[0].map((c) => String(c ?? "").trim().toLowerCase());
      const idCol = header.indexOf("client_id");
      const emailCol = header.indexOf("email");
      if (idCol === -1 || emailCol === -1) {
        throw new Error("Sheet must have Client_ID and Email columns in the header.");
      }
      const sheetRows: { clientId: string; email: string }[] = [];
      for (let i = 1; i < grid.length; i++) {
        const row = grid[i] || [];
        const clientId = String(row[idCol] ?? "").trim();
        const email = String(row[emailCol] ?? "").trim();
        if (clientId && email) sheetRows.push({ clientId, email });
      }
      const snap = await getDocs(collection(db, "clients"));
      const validClientIds = snap.docs.map((d) => d.id);
      const invites = await fetchInvites();
      const pendingInviteEmails = invites.map((v) => v.email);
      setPlan(
        computeAccessSync({ sheetRows, users, validClientIds, pendingInviteEmails })
      );
    } catch (err) {
      setModalErr(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleApply() {
    if (!plan) return;
    setBusy("import");
    setModalErr("");
    try {
      for (const wr of plan.writes) {
        const patch: Record<string, unknown> = { assignedClients: wr.assignedClients };
        if (wr.clearAgencies) patch.assignedAgencies = [];
        await updateDoc(doc(db, "users", wr.uid), patch);
      }
      setApplied(true);
    } catch (err) {
      setModalErr(err instanceof Error ? err.message : "Apply failed.");
    } finally {
      setBusy("");
    }
  }

  const s = plan ? plan.summary : null;
  const nothingToDo = plan !== null && plan.writes.length === 0;

  return (
    <span className="flex items-center gap-2 pr-3 mr-1 border-r border-gray-200">
      <button type="button" onClick={handleExport} disabled={busy !== ""} className={EXPORT_BTN}>
        {busy === "export" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {busy === "export" ? "Exporting..." : "Export"}
      </button>
      <button type="button" onClick={openImport} disabled={busy !== ""} className={IMPORT_BTN}>
        <Upload size={14} />
        Import
      </button>

      {toast ? (
        <div
          className={
            "fixed bottom-4 right-4 z-50 max-w-sm text-sm rounded-lg px-4 py-3 shadow-lg border " +
            (toast.kind === "ok"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700")
          }
        >
          {toast.msg}
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-12 p-5 text-left">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Import client access</h3>
              <button type="button" onClick={closeImport} className="text-gray-400 hover:text-gray-600 text-sm">
                Close
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              The sheet is the full picture of Business-Lead and Viewer client
              access: rows present grant, rows removed revoke. Admins, Execs,
              revoked and not-yet-users are never changed. Preview first.
            </p>

            <label className="block text-xs font-medium text-gray-700 mb-1">Client_Access sheet link</label>
            <input
              type="text"
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
              placeholder="Paste the Google Sheet URL"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
            />

            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={handlePreview}
                disabled={busy !== "" || !sheetInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === "import" && !applied ? "Working..." : "Preview changes"}
              </button>
              {plan && !applied ? (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={busy !== "" || nothingToDo}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === "import" ? "Applying..." : "Apply changes"}
                </button>
              ) : null}
            </div>

            {modalErr ? (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                {modalErr}
              </div>
            ) : null}

            {applied ? (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <div className="font-medium mb-1">Access updated.</div>
                <button type="button" onClick={() => window.location.reload()} className="underline">
                  Reload the page to see the new access
                </button>
              </div>
            ) : null}

            {plan && !applied ? (
              <div className="border border-gray-200 rounded-lg p-3 text-sm">
                {s ? (
                  <div className="mb-2 text-gray-800">
                    <span className="font-medium">{s.usersChanged}</span> user(s) change:{" "}
                    <span className="text-green-700">+{s.clientsAdded}</span> granted,{" "}
                    <span className="text-red-600">-{s.clientsRemoved}</span> removed,{" "}
                    <span className="text-red-600">{s.usersEmptied}</span> removed from all,{" "}
                    <span className="text-gray-600">{s.agenciesCleared}</span> agency cleared,{" "}
                    <span className="text-gray-600">{s.skippedCount}</span> skipped,{" "}
                    <span className="text-gray-600">{s.unknownClientCount}</span> unknown id(s).
                  </div>
                ) : null}

                {nothingToDo ? (
                  <div className="text-gray-500">Nothing to change - the app already matches the sheet.</div>
                ) : null}

                {plan.changes.length ? (
                  <div className="mt-2">
                    <div className="font-medium text-gray-700 mb-1">Changes</div>
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {plan.changes.map((c) => (
                        <li key={c.uid} className="text-gray-700">
                          {c.email}
                          {c.addClientIds.length ? (
                            <span className="text-green-700"> +{c.addClientIds.length}</span>
                          ) : null}
                          {c.removeClientIds.length ? (
                            <span className="text-red-600"> -{c.removeClientIds.length}</span>
                          ) : null}
                          {c.finalClientIds.length === 0 && c.removeClientIds.length ? (
                            <span className="text-red-600"> (removed from all clients)</span>
                          ) : null}
                          {c.clearAgencies ? (
                            <span className="text-gray-500"> (agency access cleared)</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {plan.skipped.length ? (
                  <div className="mt-3">
                    <div className="font-medium text-gray-700 mb-1">Skipped</div>
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {plan.skipped.map((sk) => (
                        <li key={sk.email} className="text-gray-600">
                          {sk.email} - {skipLabel(sk.reason)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {plan.unknownClientIds.length ? (
                  <div className="mt-3">
                    <div className="font-medium text-gray-700 mb-1">Unknown client ids (ignored)</div>
                    <div className="text-gray-600 break-all">{plan.unknownClientIds.join(", ")}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}
