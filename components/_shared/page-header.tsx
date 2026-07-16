//components/_shared/page-header.tsx
"use client";
interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional right-side slot — action buttons, quick filters, etc. */
  actions?: React.ReactNode;
}
/**
 * Reusable page banner.
 * — Sticky at the top of the content area (the body is the scroll container).
 * — On mobile it sits right under the topbar (h ≈ 56px → top-14).
 * — Solid white (flat brand style — no translucency).
 * — Ends with the Plus color-pattern hairline (Brand Guidelines p.17), the
 *   brand's signature stripe.
 *
 * Usage:
 * <PageHeader
 *   title="Clients"
 *   description="Manage all agency clients."
 *   actions={<button>Add client</button>}
 * />
 */
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="sticky top-14 lg:top-0 z-10 bg-white">
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        {/* Title + description */}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 truncate">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
        {/* Actions (optional) */}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      <div className="plus-pattern h-0.5" />
    </div>
  );
}
