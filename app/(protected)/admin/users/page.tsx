// app/(protected)/admin/users/page.tsx
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import { UserProfile, UserRole } from "../../../../lib/services/user-service";
import { useUserProfile } from "../../../../lib/hooks/use-user-profile";
import { useRouter } from "next/navigation";
import UserClientsDrawer from "../../../../components/users/user-clients-drawer";
import {
  Shield,
  User,
  ChevronDown,
  Loader2,
  AlertCircle,
  Search,
} from "lucide-react";

export default function AdminUsersPage() {
  const { isAdmin, loading: profileLoading } = useUserProfile();
  const router = useRouter();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Drawer d'assignation de clients
  const [assignUser, setAssignUser] = useState<UserProfile | null>(null);

  // Guard — redirect non-admins
  useEffect(() => {
    if (!profileLoading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, profileLoading, router]);

  // Fetch all users
  useEffect(() => {
    if (!isAdmin) return;

    async function fetchUsers() {
      setLoading(true);
      setError("");
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const data = snapshot.docs.map((d) => ({
          uid: d.id,
          ...(d.data() as Omit<UserProfile, "uid">),
        }));
        setUsers(data);
      } catch (err: any) {
        setError("Failed to load users: " + (err?.message ?? "Unknown error"));
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, [isAdmin]);

  async function handleRoleChange(uid: string, newRole: UserRole) {
    setUpdatingUid(uid);
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u))
      );
    } catch (err: any) {
      setError("Failed to update role: " + (err?.message ?? "Unknown error"));
    } finally {
      setUpdatingUid(null);
    }
  }

  // Après Save du drawer — met à jour le compteur localement
  function handleAssignmentsSaved(uid: string, assignedClients: string[]) {
    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, assignedClients } : u))
    );
    setAssignUser(null);
  }

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.displayName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (profileLoading) return null;
  if (!isAdmin) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage roles and access for all registered users.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Search + count */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
          />
        </div>
        <span className="text-sm text-gray-400 flex-shrink-0">
          {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading users...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <User size={32} className="mb-2 opacity-40" />
            <p className="text-sm">No users found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">
                  User
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs">
                  Role
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider text-xs hidden sm:table-cell">
                  Clients assigned
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((u) => (
                <UserRow
                  key={u.uid}
                  user={u}
                  updating={updatingUid === u.uid}
                  onRoleChange={handleRoleChange}
                  onAssignClients={() => setAssignUser(u)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer d'assignation user → clients */}
      <UserClientsDrawer
        open={!!assignUser}
        user={assignUser}
        onClose={() => setAssignUser(null)}
        onSaved={handleAssignmentsSaved}
      />
    </div>
  );
}

// Sub-component for each user row
function UserRow({
  user,
  updating,
  onRoleChange,
  onAssignClients,
}: {
  user: UserProfile;
  updating: boolean;
  onRoleChange: (uid: string, role: UserRole) => void;
  onAssignClients: () => void;
}) {
  const initials = user.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* User info */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center text-gray-900 text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {user.displayName ?? "—"}
            </p>
            <p className="text-gray-400 text-xs truncate">{user.email}</p>
          </div>
        </div>
      </td>

      {/* Role selector */}
      <td className="px-4 py-3">
        <div className="relative inline-block">
          {updating ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Saving...
            </div>
          ) : (
            <div className="relative">
              <select
                value={user.role}
                onChange={(e) => onRoleChange(user.uid, e.target.value as UserRole)}
                className="appearance-none pl-8 pr-8 py-1.5 text-sm font-medium rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400
                  bg-white border-gray-200 text-gray-700 hover:border-gray-300 transition-colors"
              >
                <option value="BUSINESS_LEAD">Business Lead</option>
                <option value="ADMIN">Admin</option>
              </select>
              {/* Role icon */}
              <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                {user.role === "ADMIN"
                  ? <Shield size={13} className="text-yellow-500" />
                  : <User size={13} className="text-gray-400" />
                }
              </div>
              {/* Chevron */}
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <ChevronDown size={13} className="text-gray-400" />
              </div>
            </div>
          )}
        </div>
      </td>

      {/* Assigned clients count — cliquable, ouvre le drawer d'assignation */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <button
          type="button"
          onClick={onAssignClients}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-yellow-100 hover:text-yellow-800 border border-transparent hover:border-yellow-300 transition-colors cursor-pointer"
          title="Manage client assignments"
        >
          {user.assignedClients?.length ?? 0} client{(user.assignedClients?.length ?? 0) !== 1 ? "s" : ""}
        </button>
      </td>
    </tr>
  );
}