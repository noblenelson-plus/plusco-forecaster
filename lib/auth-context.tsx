// lib/auth-context.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { ensureUserProfile } from "./services/user-service";
import { fetchSignInDomains } from "./services/agency-service";
import { emailDomain } from "./format/email";

/**
 * Only company email domains may use the app (config/sign_in_domains: the
 * agencies' domains + the company-wide ones). Anyone else is signed straight
 * back out and no user row is created; the security rules refuse them too
 * (isActive). If the list can't be read, sign-in proceeds — the rules still
 * decide.
 */
async function isAllowedDomain(email: string | null): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain) return false;
  try {
    const allowed = await fetchSignInDomains();
    return allowed.length === 0 || allowed.includes(domain);
  } catch (err) {
    console.error("Could not read the allowed sign-in domains:", err);
    return true;
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Set when the last sign-in used a non-company email (it was signed out). */
  blockedEmail: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !(await isAllowedDomain(firebaseUser.email))) {
        setBlockedEmail(firebaseUser.email ?? "this account");
        await firebaseSignOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }
      if (firebaseUser) {
        setBlockedEmail(null);
        // Ensure Firestore profile exists or is updated on every auth state change
        try {
          await ensureUserProfile(firebaseUser);
        } catch (err) {
          console.error("Failed to ensure user profile:", err);
        }
      }

      setUser(firebaseUser);
      setLoading(false);
      console.log(
        "Auth state changed:",
        firebaseUser ? firebaseUser.email : "signed out"
      );
    });

    return () => unsubscribe();
  }, []);

  async function signInWithGoogle() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Signed in as:", result.user.email);
    } catch (err: any) {
      console.error("Sign-in error:", err?.code, err?.message);
      throw err;
    }
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth);
      console.log("Signed out");
    } catch (err: any) {
      console.error("Sign-out error:", err?.code, err?.message);
      throw err;
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, blockedEmail, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}