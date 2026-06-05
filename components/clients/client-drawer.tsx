//# filepath: components/clients/client-drawer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { X, Loader2, Trash2, ChevronDown, ImagePlus, Percent, Copy, Check } from "lucide-react";
import { db } from "../../lib/firebase";
import {
  Client,
  ClientFormData,
  Currency,
  FeeStructure,
  ClientStatus,
  ClientTier,
  CommissionsConfig,
} from "../../lib/types/client.types";
import {
  CLIENT_STATUSES,
  CLIENT_TIERS,
  CLIENT_AGENCIES,
  CLIENT_REGIONS,
  CLIENT_OFFICES,
  CLIENT_GM_PODS,
  CLIENT_CURRENCIES,
  CLIENT_FEE_STRUCTURES,
} from "../../lib/constants/client.constants";
import { saveClient, deleteClient, uploadClientLogo } from "../../lib/services/client-service";
import ClientAccessSection from "./client-access-section";
import CommissionsDrawer from "./commissions-drawer";

interface ClientDrawerProps {
  open: boolean;
  client: Client | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (client: Client) => void;
  onDeleted: (cl_id: string) => void;
}

// Empty form: all dropdowns start blank except Status (defaults to ACTIVE).
// The "" values on strict-typed fields are validated away before saveClient.
const EMPTY_FORM: ClientFormData = {
  CL_Name: "",
  CL_Logo: "",
  CL_Agency: "",
  CL_Business_Unit_Region: "",
  CL_Office: "",
  CL_Business_Lead: "",
  CL_Digital_Lead: "",
  Client_Fee_Structure: "" as FeeStructure,
  GM_Pod: "",
  CL_Currency: "" as Currency,
  CL_GAIA_Number: [],
  CL_Tier: "" as ClientTier,
  Client_Status_2026: "ACTIVE",
  Client_Notes: "",
  commissionsConfig: {},
};

// Required dropdowns checked before save (Status excluded, always defaulted).
const REQUIRED_FIELDS: Array<[keyof ClientFormData, string]> = [
  ["CL_Agency", "Agency"],
  ["CL_Business_Unit_Region", "Region"],
  ["CL_Office", "Office"],
  ["Client_Fee_Structure", "Fee structure"],
  ["GM_Pod", "GM Pod"],
  ["CL_Currency", "Currency"],
  ["CL_Tier", "Tier"],
];

export default function ClientDrawer({
  open,
  client,
  isAdmin,
  onClose,
  onSaved,
  onDeleted,
}: ClientDrawerProps) {
  const isEditing = !!client;

  const [form, setForm] = useState<ClientFormData>(EMPTY_FORM);
  const [gaiaInput, setGaiaInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Commissions drawer (stacked above this one)
  const [commissionsOpen, setCommissionsOpen] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (client) {
      setForm({
        CL_Name: client.CL_Name,
        CL_Logo: client.CL_Logo ?? "",
        CL_Agency: client.CL_Agency,
        CL_Business_Unit_Region: client.CL_Business_Unit_Region,
        CL_Office: client.CL_Office,
        CL_Business_Lead: client.CL_Business_Lead,
        CL_Digital_Lead: client.CL_Digital_Lead ?? "",
        Client_Fee_Structure: client.Client_Fee_Structure,
        GM_Pod: client.GM_Pod,
        CL_Currency: client.CL_Currency,
        CL_GAIA_Number: client.CL_GAIA_Number ?? [],
        CL_Tier: client.CL_Tier,
        Client_Status_2026: client.Client_Status_2026,
        Client_Notes: client.Client_Notes ?? "",
        commissionsConfig: client.commissionsConfig ?? {},
      });
      setGaiaInput((client.CL_GAIA_Number ?? []).join(", "));
    } else {
      setForm(EMPTY_FORM);
      setGaiaInput("");
    }
    setError("");
    setConfirmDelete(false);
    setCommissionsOpen(false);
    setCopiedId(false);
  }, [client, open]);

  function set<K extends keyof ClientFormData>(key: K, value: ClientFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setError("");
    try {
      const url = await uploadClientLogo(file, form.CL_Name || `client_${Date.now()}`);
      set("CL_Logo", url);
    } catch (err: any) {
      setError("Logo upload failed: " + (err?.message ?? "Unknown error"));
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  // Case-insensitive duplicate check by CL_Name across the whole collection.
  async function checkDuplicateName(name: string): Promise<boolean> {
    const target = name.trim().toLowerCase();
    if (!target) return false;
    const snapshot = await getDocs(collection(db, "clients"));
    return snapshot.docs.some((d) => {
      const data = d.data() as { CL_Name?: string };
      return (data.CL_Name ?? "").trim().toLowerCase() === target;
    });
  }

  async function handleSave() {
    // Name required
    if (!form.CL_Name.trim()) {
      setError("Client name is required.");
      return;
    }

    // Required dropdowns
    for (const [key, label] of REQUIRED_FIELDS) {
      if (!form[key] || form[key] === "") {
        setError(`Please select a ${label}.`);
        return;
      }
    }

    const gaiaNumbers = gaiaInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    setError("");

    try {
      // Duplicate name check (only on Create)
      if (!isEditing) {
        const exists = await checkDuplicateName(form.CL_Name);
        if (exists) {
          setError("Client already exists.");
          setSaving(false);
          return;
        }
      }

      const saved = await saveClient(
        { ...form, CL_GAIA_Number: gaiaNumbers },
        client?.cl_id ?? null
      );
      onSaved(saved);
    } catch (err: any) {
      setError("Failed to save: " + (err?.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!client) return;
    setDeleting(true);
    setError("");
    try {
      await deleteClient(client.cl_id);
      onDeleted(client.cl_id);
    } catch (err: any) {
      setError("Failed to delete: " + (err?.message ?? "Unknown error"));
      setDeleting(false);
    }
  }

  async function handleCopyId() {
    if (!client) return;
    try {
      await navigator.clipboard.writeText(client.cl_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  // Commissions are persisted by the CommissionsDrawer itself. We just sync
  // local form state so the counter stays current and a later Save doesn't
  // overwrite anything.
  function handleCommissionsSaved(_clId: string, config: CommissionsConfig) {
    set("commissionsConfig", config);
    setCommissionsOpen(false);
  }

  // Configured types count for the current year (Finance summary)
  const currentYear = new Date().getFullYear();
  const configuredCount = Object.keys(
    form.commissionsConfig?.[currentYear] ?? {}
  ).length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className={`
          fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-2xl
          flex flex-col transform transition-transform duration-250 ease-in-out
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="bg-gray-900 px-6 py-5 flex items-start justify-between">
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-semibold text-white truncate">
              {isEditing ? "Edit client" : "New client"}
            </h2>
            {isEditing && client && (
              <div className="mt-1">
                <p className="text-sm font-medium text-gray-300 truncate">
                  {client.CL_Name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs text-gray-500 font-mono truncate">{client.cl_id}</p>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    title="Copy Client ID"
                  >
                    {copiedId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Section: Identity */}
          <Section label="Identity">
            {/* Logo */}
            <Field label="Logo">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {form.CL_Logo ? (
                    <img
                      src={form.CL_Logo}
                      alt="Logo preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImagePlus size={18} className="text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={form.CL_Logo ?? ""}
                    onChange={(e) => set("CL_Logo", e.target.value)}
                    placeholder="Paste image URL..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent mb-1.5"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                  >
                    {uploadingLogo
                      ? <><Loader2 size={12} className="animate-spin" /> Uploading...</>
                      : <><ImagePlus size={12} /> Upload new logo</>
                    }
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </Field>

            <Field label="Client name *">
              <Input
                value={form.CL_Name}
                onChange={(v) => set("CL_Name", v)}
                placeholder="e.g. Acme Corporation"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Agency *">
                <Select
                  value={form.CL_Agency}
                  onChange={(v) => set("CL_Agency", v)}
                  options={CLIENT_AGENCIES}
                  placeholder="Select agency"
                />
              </Field>
              <Field label="Fee structure *">
                <Select
                  value={form.Client_Fee_Structure}
                  onChange={(v) => set("Client_Fee_Structure", v as FeeStructure)}
                  options={CLIENT_FEE_STRUCTURES}
                  placeholder="Select fee structure"
                />
              </Field>
            </div>
          </Section>

          {/* Section: Location */}
          <Section label="Location">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Region *">
                <Select
                  value={form.CL_Business_Unit_Region}
                  onChange={(v) => set("CL_Business_Unit_Region", v)}
                  options={CLIENT_REGIONS}
                  placeholder="Select region"
                />
              </Field>
              <Field label="Office *">
                <Select
                  value={form.CL_Office}
                  onChange={(v) => set("CL_Office", v)}
                  options={CLIENT_OFFICES}
                  placeholder="Select office"
                />
              </Field>
            </div>
          </Section>

          {/* Section: Team */}
          <Section label="Team">
            <Field label="GM Pod *">
              <Select
                value={form.GM_Pod}
                onChange={(v) => set("GM_Pod", v)}
                options={CLIENT_GM_PODS}
                placeholder="Select GM Pod"
              />
            </Field>
            <Field label="Business Lead (email)">
              <Input
                value={form.CL_Business_Lead}
                onChange={(v) => set("CL_Business_Lead", v)}
                placeholder="e.g. lead@cossettemedia.com"
              />
            </Field>
            <Field label="Digital Lead (email)">
              <Input
                value={form.CL_Digital_Lead ?? ""}
                onChange={(v) => set("CL_Digital_Lead", v)}
                placeholder="e.g. digital@cossettemedia.com (optional)"
              />
            </Field>
          </Section>

          {/* Section: Access (edit only) */}
          {isEditing && client && (
            <ClientAccessSection clId={client.cl_id} isAdmin={isAdmin} />
          )}

          {/* Section: Classification */}
          <Section label="Classification">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tier *">
                <Select
                  value={form.CL_Tier}
                  onChange={(v) => set("CL_Tier", v as ClientTier)}
                  options={CLIENT_TIERS}
                  placeholder="Select tier"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.Client_Status_2026}
                  onChange={(v) => set("Client_Status_2026", v as ClientStatus)}
                  options={CLIENT_STATUSES}
                />
              </Field>
              <Field label="Currency *">
                <Select
                  value={form.CL_Currency}
                  onChange={(v) => set("CL_Currency", v as Currency)}
                  options={CLIENT_CURRENCIES}
                  placeholder="Select currency"
                />
              </Field>
            </div>
          </Section>

          {/* Section: Finance */}
          <Section label="Finance">
            <Field label="GAIA number(s)">
              <Input
                value={gaiaInput}
                onChange={setGaiaInput}
                placeholder="e.g. 12345, 67890"
              />
              <p className="text-xs text-gray-400 mt-1">
                Separate multiple GAIA numbers with commas.
              </p>
            </Field>

            {isEditing && (
              <Field label="Commissions">
                <button
                  type="button"
                  onClick={() => setCommissionsOpen(true)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg bg-white hover:border-yellow-400 hover:bg-yellow-50/50 transition-colors group"
                >
                  <span className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="w-7 h-7 rounded-lg bg-yellow-100 text-yellow-700 flex items-center justify-center group-hover:bg-yellow-400 group-hover:text-gray-900 transition-colors">
                      <Percent size={13} strokeWidth={2.5} />
                    </span>
                    Manage commissions
                  </span>
                  <span className="text-xs text-gray-400">
                    {configuredCount} type{configuredCount !== 1 ? "s" : ""} · {currentYear}
                  </span>
                </button>
              </Field>
            )}
          </Section>

          {/* Section: Notes */}
          <Section label="Notes">
            <Field label="Client notes">
              <textarea
                value={form.Client_Notes}
                onChange={(e) => set("Client_Notes", e.target.value)}
                placeholder="Any relevant notes..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
              />
            </Field>
          </Section>

          {/* Delete zone */}
          {isEditing && (
            <div className="pt-2 pb-2 border-t border-gray-100">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete client
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700 mb-3">
                    Are you sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {deleting && <Loader2 size={13} className="animate-spin" />}
                      Yes, delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEditing ? "Save changes" : "Create client"}
          </button>
        </div>
      </div>

      {/* Stacked commissions drawer */}
      <CommissionsDrawer
        open={commissionsOpen}
        client={
          client
            ? { ...client, commissionsConfig: form.commissionsConfig ?? {} }
            : null
        }
        onClose={() => setCommissionsOpen(false)}
        onSaved={handleCommissionsSaved}
      />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {label}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  const isEmpty = value === "";
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent cursor-pointer ${
          isEmpty && placeholder ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-gray-900">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}