// lib/types/invite.types.ts

import type { UserRole } from "./user.types";

/**
 * A pre-provisioned access grant for someone who hasn't signed in yet.
 *
 * Firebase Auth (Google) owns the login, and user profiles are keyed by the
 * Firebase UID — which only exists after the first sign-in. So access can't be
 * created ahead of time on the `users` doc directly. Instead an admin stores an
 * invite keyed by (lowercased) email; on that person's first sign-in,
 * `ensureUserProfile` finds the matching invite, applies its role + client
 * assignments, and deletes it.
 */
export interface Invite {
  // Lowercased email — also the document id.
  email: string;
  role: UserRole;
  assignedClients?: string[];
  createdBy?: string | null;
  createdAt?: unknown; // Firestore ServerTimestamp
}
