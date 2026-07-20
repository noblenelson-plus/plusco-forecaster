// lib/types/user.types.ts

export type UserRole = "ADMIN" | "BUSINESS_LEAD";

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  assignedClients: string[]; // Array of CL_ID references
  // Agency-scoped access: the user automatically sees every client whose
  // CL_Agency is listed here — including clients added later. Optional so
  // pre-migration docs (missing the field) read as "no agency access".
  assignedAgencies?: string[]; // Array of ClientAgency values
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
  canEditActuals: boolean;       // Finance/Admin only
  canEditGaiaAdjustments: boolean; // Finance/Admin only
  canLockEntries: boolean;
  canManageLabsPartners: boolean;
  canViewAllClients: boolean;
}

export function resolvePermissions(role: UserRole): UserPermissions {
  const isAdmin = role === "ADMIN";
  return {
    canManageUsers: isAdmin,
    canManageClients: isAdmin,
    canEditActuals: isAdmin,
    canEditGaiaAdjustments: isAdmin,
    canLockEntries: isAdmin,
    canManageLabsPartners: isAdmin,
    canViewAllClients: isAdmin,
  };
}