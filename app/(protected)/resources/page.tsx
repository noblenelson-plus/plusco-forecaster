// app/(protected)/resources/page.tsx
"use client";

/**
 * Resources — a shared library of external links.
 * Readable by everyone; only admins can add, edit or delete entries.
 * Business Leads simply click a card to open the link in a new tab.
 */

import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Library,
  Loader2,
} from "lucide-react";
import PageHeader from "../../../components/_shared/page-header";
import ResourceFormModal from "../../../components/resources/resource-form-modal";
import { useUserProfile } from "../../../lib/hooks/use-user-profile";
import {
  subscribeToResources,
  deleteResource,
} from "../../../lib/services/resource-service";
import type { Resource } from "../../../lib/types/resource.types";

export default function ResourcesPage() {
  const { isAdmin } = useUserProfile();

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToResources(
      (data) => {
        setResources(data);
        setLoading(false);
      },
      (err) => {
        setError("Failed to load resources: " + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  function handleAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function handleEdit(resource: Resource) {
    setEditing(resource);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteResource(id);
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError("Failed to delete resource: " + (err?.message ?? "Unknown error"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Resources"
        description="Useful links and documents"
        actions={
          isAdmin && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
            >
              <Plus size={14} />
              <span>Add resource</span>
            </button>
          )
        }
      />

      <div className="p-6 max-w-7xl mx-auto">
        {error && (
          <div className="bg-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-12 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Loading resources…
          </div>
        ) : resources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Library size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">No resources yet</p>
            <p className="text-sm text-gray-400 mt-1">
              {isAdmin
                ? "Add the first resource with the button above."
                : "Resources shared by the team will appear here."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map((r) => (
              <div
                key={r.id}
                className="group relative flex flex-col border border-gray-200 rounded-lg bg-white p-4 hover:border-gray-300 transition-colors"
              >
                {/* Stretched link — covers the whole card so it is fully clickable.
                    Admin action buttons sit above it via z-index. */}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 rounded-lg"
                  aria-label={`Open ${r.name}`}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-yellow-400 text-gray-900">
                      <ExternalLink size={15} />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {r.name}
                    </h3>
                  </div>

                  {/* Admin controls — above the stretched link. */}
                  {isAdmin && (
                    <div className="relative z-10 flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(r)}
                        title="Edit"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {r.description && (
                  <p className="mt-2 text-sm text-gray-500 line-clamp-3">
                    {r.description}
                  </p>
                )}

                {/* Delete confirmation — above the stretched link. */}
                {confirmDeleteId === r.id && (
                  <div className="relative z-10 mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                    <span className="text-xs text-gray-600">Delete this resource?</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        {busyId === r.id && <Loader2 size={12} className="animate-spin" />}
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ResourceFormModal
          resource={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            /* real-time subscription refreshes the list */
          }}
        />
      )}
    </div>
  );
}
