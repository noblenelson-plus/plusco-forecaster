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
import { ensureUserProfile } from "./user-service";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
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
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
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