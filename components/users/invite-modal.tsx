// components/users/invite-modal.tsx
"use client";

import { useState } from "react";
import { X, Loader2, Mail } from "lucide-react";
import { createInvite } from "../../lib/services/invite-service";
import {
  ROLE_LABELS,
  ROLE_ORDER,
  type UserRole,
} from "../../lib/types/user.types";

/**
 * Pre-provision access for someone who hasn't signed in yet: pick an email +
 * role. On their first Google sign-in the invite is applied and consumed.
 * Client assignments (for a BL) are set afterwards, once they appear in the list.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function handleSubmit() {
    if (!emailValid) return;
    setSaving(true);
    setError("");
    try {
      await createInvite(email, role, [], createdBy);
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
        className="w-full max-w-md bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-900 px-5 py-4 flex items-center justify-between">
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
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Grants access as soon as this person signs in with Google. They must
            still log in once themselves — this just pre-sets their role.
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

          {error && (
            <div className="bg-red-500 text-white px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
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
