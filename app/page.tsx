"use client";

import { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

const adjectives = ["Happy", "Brave", "Swift", "Mighty", "Friendly"];
const animals = ["Tiger", "Whale", "Dolphin", "Koala", "Fox"];

export default function Home() {
  const [status, setStatus] = useState("One More");
  const [error, setError] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function authenticate() {
      try {
        const userCredential = await signInAnonymously(auth);
        console.log("Signed in anonymously:", userCredential.user.uid);
        setIsAuthenticated(true);
      } catch (err: any) {
        console.error("Auth failed:", err);
        setError("Auth failed: " + err.message);
      }
    }
    authenticate();
  }, []);

  async function handleClick() {
    if (!isAuthenticated) return;

    const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
    setStatus("Saving...");
    setError("");
    console.log("Attempting to save name:", name, "User:", auth.currentUser?.uid);
    
    try {
      const savePromise = addDoc(collection(db, "test"), {
        name: name,
        timestamp: new Date().toISOString(),
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error("Write timed out after 10s - check Firebase console: ensure Firestore is enabled and anonymous auth is allowed"));
        }, 10000)
      );

      await Promise.race([savePromise, timeoutPromise]);
      setNames(prev => [name, ...prev]);
      setStatus("One More");
    } catch (err: any) {
      setError("ERROR: " + (err?.code || "TIMEOUT") + " — " + err?.message);
      setNames(prev => [name, ...prev]); // Show name even on failure
      setStatus("One More");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white p-8">
      <h1 className="text-3xl font-bold mb-4">PlusCo Forecaster</h1>
      <button
        onClick={handleClick}
        disabled={!isAuthenticated}
        className="bg-yellow-400 px-8 py-3 rounded-full font-semibold mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div key={i} className="bg-gray-50 rounded p-3 mb-2">{n}</div>
          ))}
        </div>
      )}
    </main>
  );
}