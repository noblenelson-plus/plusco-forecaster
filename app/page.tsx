//xx
"use client";

import { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";

const adjectives = ["Happy", "Brave", "Swift", "Mighty", "Friendly"];
const animals = ["Tiger", "Whale", "Dolphin", "Koala", "Fox"];

export default function Home() {
  const [status, setStatus] = useState("One More");
  const [error, setError] = useState("");
  const [names, setNames] = useState<string[]>([]);

  async function handleClick() {
    const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
    setStatus("Saving...");
    setError("");
    
    try {
      await addDoc(collection(db, "test"), {
        name: name,
        timestamp: new Date().toISOString(),
      });

      setNames(prev => [name, ...prev]);
      setStatus("One More");
    } catch (err: any) {
      setError("ERROR: " + (err?.code || "UNKNOWN") + " — " + err?.message);
      setNames(prev => [name, ...prev]);
      setStatus("One More");
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white p-8">
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
            <div key={i} className="bg-gray-50 rounded p-3 mb-2">{n}</div>
          ))}
        </div>
      )}
    </main>
  );
}