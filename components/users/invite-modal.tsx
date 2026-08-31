// components/users/invite-modal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { X, Loader2, Mail, Search, Check } from "lucide-react";
import { db } from "../../lib/firebase";
import { createInvite } from "../../lib/services/invite-service";
import { isClientHidden } from "../../lib/format/client";
import type { Client } from "../../lib/types/client.types";
import {
  ROLE_LABELS,
  ROLE_ORDER,
  type UserRole,
} from "../../lib/types/user.types";

/**
 * Pre-provision access for someone who hasn't signed in yet: pick an email,
 * role, and — for a Business Lead — the clients they'll be able to edit. On
 * their first Google sign-in the invite is applied (role + client assignments)
 * and consumed.
 *
 * Client assignments are only meaningful for Business Leads (everyone else is
 * agency-scoped read access from their email domain), so the picker only shows
 * for that role — mirroring the per-user clients drawer.
 *
 * Mounted only while open (the parent conditionally renders it), so state resets
 * naturally on each open — no reset effect needed.
 */
export default function InviteModal({
  onClose,
  onCreated,
  createdBy,
}: {
  onClose: () => void;
  onCreated: () => void;
  createdBy?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("VIEWER");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Clients — loaded once, only used by the picker.
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const showClientPicker = role === "BUSINESS_LEAD";
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  useEffect(() => {
    async function fetchClients() {
      setClientsLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "clients"));
        const data = snapshot.docs
          .map((d) => ({ cl_id: d.id, ...(d.data() as Omit<Client, "cl_id">) }))
          .filter((c) => !isClientHidden(c))
          .sort((a, b) => a.CL_Name.localeCompare(b.CL_Name));
        setClients(data);
      } catch {
        /* non-fatal — the picker just stays empty */
      } finally {
        setClientsLoading(false);
      }
    }
    fetchClients();
  }, []);

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.CL_Name.toLowerCase().includes(q) ||
        c.CL_Agency.toLowerCase().includes(q)
    );
  }, [clients, search]);

  function toggle(clId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(clId)) next.delete(clId);
      else next.add(clId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!emailValid) return;
    setSaving(true);
    setError("");
    try {
      // Client grants are only meaningful for Business Leads.
      const assignedClients = showClientPicker ? [...selected] : [];
      await createInvite(email, role, assignedClients, createdBy);
      onCreated();
      onClose();
    } catch (err) {
      setError(
        "Failed to create invite: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Mail size={16} className="text-yellow-400" />
            <h2 className="text-base font-semibold">Invite someone</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Grants access as soon as this person signs in with Google. They must
            still log in once themselves — this just pre-sets their role
            {showClientPicker ? " and client access" : ""}.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailValid) handleSubmit();
              }}
              placeholder="person@agency.com"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer"
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {/* Client picker — Business Leads only (editable clients) */}
          {showClientPicker && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Editable clients{" "}
                {selected.size > 0 && (
                  <span className="text-gray-400 normal-case font-medium">
                    ({selected.size} selected)
                  </span>
                )}
              </label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="relative border-b border-gray-100">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white focus:outline-none"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {clientsLoading ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                      <Loader2 size={15} className="animate-spin" />
                      <span className="text-xs">Loading clients...</span>
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">
                      No clients match your search.
                    </p>
                  ) : (
                    <ul>
                      {filteredClients.map((c) => {
                        const isSelected = selected.has(c.cl_id);
                        return (
                          <li key={c.cl_id}>
                            <button
                              type="button"
                              onClick={() => toggle(c.cl_id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                                isSelected ? "bg-yellow-400" : "hover:bg-gray-50"
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
                                  isSelected
                                    ? "bg-gray-900 border-gray-900 text-yellow-400"
                                    : "bg-white border-gray-300"
                                }`}
                              >
                                {isSelected && (
                                  <Check size={11} strokeWidth={3} />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium text-gray-900 truncate">
                                  {c.CL_Name}
                                </span>
                                <span
                                  className={`block text-xs truncate ${
                                    isSelected ? "text-gray-800" : "text-gray-400"
                                  }`}
                                >
                                  {c.CL_Agency}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                You can change these anytime from the team list, even before they
                sign in.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !emailValid}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
