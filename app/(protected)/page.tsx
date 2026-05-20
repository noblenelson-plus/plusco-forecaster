// app/(protected)/page.tsx
"use client";

import { useState } from "react";
import { db } from "../../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { useAuth } from "../../lib/auth-context";

const adjectives = ["Happy", "Brave", "Swift", "Mighty", "Friendly"];
const animals = ["Tiger", "Whale", "Dolphin", "Koala", "Fox"];

export default function Home() {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState("One More");
  const [error, setError] = useState("");
  const [names, setNames] = useState<string[]>([]);

  async function handleClick() {
    const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${
      animals[Math.floor(Math.random() * animals.length)]
    }`;
    setStatus("Saving...");
    setError("");

    try {
      await addDoc(collection(db, "test"), {
        name: name,
        timestamp: new Date().toISOString(),
        userId: user?.uid ?? null,
        userEmail: user?.email ?? null,
      });

      setNames((prev) => [name, ...prev]);
      setStatus("One More");
    } catch (err: any) {
      setError("ERROR: " + (err?.code || "UNKNOWN") + " — " + err?.message);
      setNames((prev) => [name, ...prev]);
      setStatus("One More");
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      // La redirection vers /auth/login est gérée automatiquement
      // par le ProtectedLayout dès que user devient null
    } catch (err: any) {
      setError("Sign-out error: " + (err?.code || "UNKNOWN"));
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-white">
      {/* Header avec user + logout */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="text-sm text-gray-600">
          Signed in as <span className="font-medium">{user?.email}</span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Sign out
        </button>
      </header>

      {/* Contenu principal */}
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">PlusCo Forecaster</h1>

        <button
          onClick={handleClick}
          className="bg-yellow-400 px-8 py-3 rounded-full font-semibold mb-4 hover:bg-yellow-500 transition-colors"
        >
          {status}
        </button>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-800 px-6 py-3 rounded mb-4 max-w-xl text-sm">
            {error}
          </div>
        )}

        {names.length > 0 && (
          <div className="w-full max-w-xl">
            <h2 className="font-bold mb-2">Generated this session:</h2>
            {names.map((n, i) => (
              <div key={i} className="bg-gray-50 rounded p-3 mb-2">
                {n}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}