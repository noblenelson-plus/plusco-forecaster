// app/(protected)/admin/products/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  AlertCircle,
  Package,
} from "lucide-react";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import type { ProductDefinition } from "../../../../lib/types/product.types";
import {
  subscribeToProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  type ProductInput,
} from "../../../../lib/services/product-service";
import PageHeader from "../../../../components/_shared/page-header";

export default function AdminProductsPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [products, setProducts] = useState<ProductDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Guard — redirect non-admins.
  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace("/");
  }, [isAdmin, profileLoading, router]);

  // Real-time subscription.
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = subscribeToProducts(
      (data) => {
        setProducts(data);
        setLoading(false);
      },
      (err) => {
        setError("Failed to load products: " + err.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isAdmin]);

  async function handleCreate(input: ProductInput): Promise<boolean> {
    setError("");
    try {
      await createProduct(input);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product.");
      return false;
    }
  }

  async function handleUpdate(
    productId: string,
    input: ProductInput
  ): Promise<boolean> {
    setError("");
    try {
      await updateProduct(productId, input);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product.");
      return false;
    }
  }

  async function handleDelete(productId: string) {
    setBusyId(productId);
    setError("");
    try {
      await deleteProduct(productId);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product.");
    } finally {
      setBusyId(null);
    }
  }

  if (profileLoading) return null;
  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader
        title="DISH Products"
        description="Manage the global product catalog — used for the pipeline axis and the revenue Product Fees dropdown."
      />

      <div className="p-6 max-w-4xl mx-auto">
        {error && (
          <div className="flex items-center gap-2 bg-red-500 border border-red-500 text-white px-4 py-3 rounded-lg mb-4 text-sm">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading products...</span>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
            {products.length === 0 ? (
              <div className="px-4 py-4 text-xs text-gray-400 italic">
                No products yet — add your first below.
              </div>
            ) : (
              products.map((p) => (
                <ProductRow
                  key={p.productId}
                  product={p}
                  busy={busyId === p.productId}
                  confirmingDelete={confirmDeleteId === p.productId}
                  onUpdate={handleUpdate}
                  onAskDelete={() => setConfirmDeleteId(p.productId)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => handleDelete(p.productId)}
                />
              ))
            )}

            <AddProductForm onCreate={handleCreate} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Use toggles (Pipeline / Revenue Dropdown) ────────────────────────────────

function UseToggles({
  pipeline,
  revenueDropdown,
  onChange,
}: {
  pipeline: boolean;
  revenueDropdown: boolean;
  onChange: (next: { pipeline: boolean; revenueDropdown: boolean }) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={pipeline}
          onChange={(e) =>
            onChange({ pipeline: e.target.checked, revenueDropdown })
          }
          className="h-4 w-4 accent-yellow-400"
        />
        Pipeline
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={revenueDropdown}
          onChange={(e) =>
            onChange({ pipeline, revenueDropdown: e.target.checked })
          }
          className="h-4 w-4 accent-yellow-400"
        />
        Revenue Dropdown
      </label>
    </div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddProductForm({
  onCreate,
}: {
  onCreate: (input: ProductInput) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipeline, setPipeline] = useState(true);
  const [revenueDropdown, setRevenueDropdown] = useState(false);
  const [creating, setCreating] = useState(false);

  async function submit() {
    if (!name.trim() || creating) return;
    setCreating(true);
    const ok = await onCreate({ name, description, pipeline, revenueDropdown });
    setCreating(false);
    if (ok) {
      setName("");
      setDescription("");
      setPipeline(true);
      setRevenueDropdown(false);
    }
  }

  return (
    <div className="px-4 py-3 bg-gray-50 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Product name…"
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
        />
        <button
          onClick={submit}
          disabled={creating || !name.trim()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          {creating ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Add
        </button>
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Description (optional)"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
      />
      <UseToggles
        pipeline={pipeline}
        revenueDropdown={revenueDropdown}
        onChange={({ pipeline: p, revenueDropdown: r }) => {
          setPipeline(p);
          setRevenueDropdown(r);
        }}
      />
    </div>
  );
}

// ─── Product row ──────────────────────────────────────────────────────────────

function ProductRow({
  product,
  busy,
  confirmingDelete,
  onUpdate,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  product: ProductDefinition;
  busy: boolean;
  confirmingDelete: boolean;
  onUpdate: (productId: string, input: ProductInput) => Promise<boolean>;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(product.name);
  const [editDescription, setEditDescription] = useState(
    product.description ?? ""
  );
  const [editPipeline, setEditPipeline] = useState(product.pipeline);
  const [editRevenueDropdown, setEditRevenueDropdown] = useState(
    product.revenueDropdown
  );
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit() {
    setEditName(product.name);
    setEditDescription(product.description ?? "");
    setEditPipeline(product.pipeline);
    setEditRevenueDropdown(product.revenueDropdown);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editName.trim() || savingEdit) return;
    setSavingEdit(true);
    const ok = await onUpdate(product.productId, {
      name: editName,
      description: editDescription,
      pipeline: editPipeline,
      revenueDropdown: editRevenueDropdown,
    });
    setSavingEdit(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="px-4 py-3 bg-gray-50 space-y-2">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Product name…"
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
          />
          <button
            onClick={saveEdit}
            disabled={savingEdit || !editName.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-900 bg-yellow-400 rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {savingEdit && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            Cancel
          </button>
        </div>
        <input
          type="text"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="Description (optional)"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
        />
        <UseToggles
          pipeline={editPipeline}
          revenueDropdown={editRevenueDropdown}
          onChange={({ pipeline: p, revenueDropdown: r }) => {
            setEditPipeline(p);
            setEditRevenueDropdown(r);
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-yellow-400 flex items-center justify-center flex-shrink-0">
            <Package size={14} className="text-gray-900" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-gray-900 truncate">
                {product.name}
              </p>
              {product.pipeline && (
                <span className="flex-shrink-0 px-2 py-0.5 text-[11px] font-medium text-gray-900 bg-blue-200">
                  Pipeline
                </span>
              )}
              {product.revenueDropdown && (
                <span className="flex-shrink-0 px-2 py-0.5 text-[11px] font-medium text-white bg-purple-600">
                  Revenue Dropdown
                </span>
              )}
            </div>
            {product.description && (
              <p className="text-xs text-gray-400 truncate">
                {product.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {confirmingDelete ? (
            <>
              <span className="text-xs text-red-600 mr-1">Remove?</span>
              <button
                onClick={onConfirmDelete}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                Yes, remove
              </button>
              <button
                onClick={onCancelDelete}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Edit product"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={onAskDelete}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors"
                title="Remove product"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
