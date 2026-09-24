// lib/types/user.types.ts

// Four layered access tiers (each adds to the one below):
//  - VIEWER        → agency employee, granted automatically by email domain.
//                    Read-only, Dashboard tab only, no revenue.
//  - BUSINESS_LEAD → assigned to specific clients; may edit their forecast and
//                    milestones (never actuals).
//  - EXEC          → like a BL, plus a global dashboard covering all clients.
//  - ADMIN         → manages users, clients, actuals and the agency↔domain map.
export type UserRole = "ADMIN" | "EXEC" | "BUSINESS_LEAD" | "VIEWER";

// Human-readable role names, shared by the admin dropdown, the sidebar badge
// and the access-levels explainer.
export const ROLE_LABELS: Record<UserRole, string> = {
  VIEWER: "Agency Viewer",
  BUSINESS_LEAD: "Business Lead",
  EXEC: "Exec",
  ADMIN: "Admin",
};

// Weakest → strongest; the order the admin role dropdown lists them in.
export const ROLE_ORDER: UserRole[] = [
  "VIEWER",
  "BUSINESS_LEAD",
  "EXEC",
  "ADMIN",
];

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  assignedClients: string[]; // Array of CL_ID references
  // Agency-scoped access: the user automatically sees every client whose
  // CL_Agency is listed here — including clients added later. Optional so
  // pre-migration docs (missing the field) read as "no agency access".
  assignedAgencies?: string[]; // Array of ClientAgency values
  disabled?: boolean; // When true, access is revoked (blocked at the layout gate)
  displayName?: string;
  photoURL?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSession {
  uid: string;
  email: string;
  role: UserRole;
}

// Used when creating or updating a user from the Admin panel
export interface UserFormData {
  email: string;
  role: UserRole;
  assignedClients: string[];
  assignedAgencies?: string[];
  displayName?: string;
}

// Permissions derived from role — used in UI guards and Server Actions
export interface UserPermissions {
  canManageUsers: boolean;
  canManageClients: boolean;
  canManageAgencies: boolean;    // Admin-only: agency ↔ domain mapping
  canEditActuals: boolean;       // Finance/Admin only
  canEditGaiaAdjustments: boolean; // Finance/Admin only
  canLockEntries: boolean;
  canManageLabsPartners: boolean;
  canViewAllClients: boolean;    // Every client in the normal (per-client) views
  // Tier capabilities (BL/Exec/Admin — never a plain agency viewer):
  canEditForecast: boolean;      // Edit forecast + milestones on accessible clients
  canViewRevenue: boolean;       // See the Revenue tab / revenue figures
  // Exec + Admin only: the high-level dashboard aggregating ALL clients.
  canViewGlobalDashboard: boolean;
}

export function resolvePermissions(role: UserRole): UserPermissions {
  const isAdmin = role === "ADMIN";
  const isExec = role === "EXEC";
  const isBL = role === "BUSINESS_LEAD";
  // BL, Exec and Admin can all edit their accessible clients and see revenue;
  // a plain agency VIEWER cannot.
  const canEdit = isAdmin || isExec || isBL;
  return {
    canManageUsers: isAdmin,
    canManageClients: isAdmin,
    canManageAgencies: isAdmin,
    canEditActuals: isAdmin,
    canEditGaiaAdjustments: isAdmin,
    canLockEntries: isAdmin,
    canManageLabsPartners: isAdmin,
    canViewAllClients: isAdmin,
    canEditForecast: canEdit,
    canViewRevenue: canEdit,
    canViewGlobalDashboard: isAdmin || isExec,
  };
}