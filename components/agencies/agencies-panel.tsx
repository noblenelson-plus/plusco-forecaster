// components/agencies/agencies-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { Building2, Globe, Loader2, AlertCircle, Plus, X } from "lucide-react";
import {
  fetchAgencies,
  fetchCompanyDomains,
  saveAgency,
  saveCompanyDomains,
} from "../../lib/services/agency-service";
import {
  CLIENT_AGENCIES,
  type ClientAgency,
} from "../../lib/constants/client.constants";

/**
 * Agency ↔ email-domain mapping editor. When someone signs in, the domain of
 * their email grants automatic read-only access to the matching agency's
 * clients. Company-wide domains grant every agency at once.
 *
 * Self-contained (loads its own data). `userCountByAgency` is optional — when
 * provided, each agency card shows how many users currently belong to it.
 */
export default function AgenciesPanel({
  userCountByAgency,
}: {
  userCountByAgency?: Record<string, number>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [domainsByAgency, setDomainsByAgency] = useState<
    Record<string, string[]>
  >({});
  const [companyDomains, setCompanyDomains] = useState<string[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [agencies, company] = await Promise.all([
          fetchAgencies(),
          fetchCompanyDomains(),
        ]);
        const map: Record<string, string[]> = {};
        agencies.forEach((a) => (map[a.name] = a.domains ?? []));
        setDomainsByAgency(map);
        setCompanyDomains(company);
      } catch (err) {
        setError(
          "Failed to load agencies: " +
            (err instanceof Error ? err.message : "Unknown error")
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persistAgency(name: ClientAgency, domains: string[]) {
    setSavingKey(name);
    setError("");
    try {
      await saveAgency(name, domains);
      setDomainsByAgency((prev) => ({ ...prev, [name]: domains }));
    } catch (err) {
      setError(
        "Failed to save domains: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function persistCompany(domains: string[]) {
    setSavingKey("__company__");
    setError("");
    try {
      await saveCompanyDomains(domains);
      setCompanyDomains(domains);
    } catch (err) {
      setError(
        "Failed to save company domains: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading agencies...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Company-wide domains */}
      <div className="bg-gray-900 text-white border border-gray-900 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe size={16} className="text-yellow-400" />
          <h3 className="font-semibold">Company-wide domains</h3>
        </div>
        <p className="text-xs text-gray-300 mb-3">
          A match here grants access to <strong>every</strong> agency (including
          agencies added later). Set it once for domains that span the whole
          company.
        </p>
        <DomainEditor
          domains={companyDomains}
          saving={savingKey === "__company__"}
          dark
          onAdd={(d) => persistCompany([...companyDomains, d])}
          onRemove={(d) => persistCompany(companyDomains.filter((x) => x !== d))}
        />
      </div>

      {/* Per-agency domains */}
      <div className="grid gap-4 sm:grid-cols-2">
        {CLIENT_AGENCIES.map(({ value, label }) => {
          const domains = domainsByAgency[value] ?? [];
          const count = userCountByAgency?.[value];
          return (
            <div
              key={value}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-gray-400" />
                  <h3 className="font-semibold text-gray-900">{label}</h3>
                </div>
                {count !== undefined && (
                  <span className="text-xs font-medium text-gray-400">
                    {count} user{count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <DomainEditor
                domains={domains}
                saving={savingKey === value}
                onAdd={(d) => persistAgency(value, [...domains, d])}
                onRemove={(d) =>
                  persistAgency(
                    value,
                    domains.filter((x) => x !== d)
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Domain chip editor ─────────────────────────────────────────────────────

function DomainEditor({
  domains,
  saving,
  dark = false,
  onAdd,
  onRemove,
}: {
  domains: string[];
  saving: boolean;
  dark?: boolean;
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
}) {
  const [input, setInput] = useState("");

  function commit() {
    const d = input.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (!d.includes(".") || domains.includes(d)) {
      setInput("");
      return;
    }
    onAdd(d);
    setInput("");
  }

  const chipClass = dark ? "bg-white/10 text-white" : "bg-gray-100 text-gray-700";
  const inputClass = dark
    ? "bg-white/10 text-white placeholder-gray-400 border-white/20 focus:ring-yellow-400"
    : "bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-yellow-400";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {domains.length === 0 && (
          <span className="text-xs text-gray-400">No domains yet.</span>
        )}
        {domains.map((d) => (
          <span
            key={d}
            className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-medium ${chipClass}`}
          >
            {d}
            <button
              type="button"
              onClick={() => onRemove(d)}
              disabled={saving}
              className="hover:text-red-500 transition-colors disabled:opacity-50"
              aria-label={`Remove ${d}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {saving && (
          <Loader2
            size={14}
            className={`animate-spin ${dark ? "text-gray-300" : "text-gray-400"}`}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="agency.com"
          disabled={saving}
          className={`flex-1 min-w-0 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 ${inputClass}`}
        />
        <button
          type="button"
          onClick={commit}
          disabled={saving || !input.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-yellow-400 text-gray-900 hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
    </div>
  );
}
