// app/auth/login/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import confetti from "canvas-confetti";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Zap, Sparkles, LayoutDashboard, Hand } from "lucide-react";
import { useAuth } from "../../../lib/auth-context";

// Initial forecast curve — the climb continues forever once mounted.
const INITIAL_SERIES = Array.from({ length: 18 }, (_, i) => ({
  v: 20 + i * 4.5 + Math.sin(i) * 3,
}));

// Rotating one-liners under the headline.
const TAGLINES = [
  "Where the numbers go up and to the right",
  "Forecasting, finally made painless",
  "Turning gut feelings into clean charts",
  "Plan smarter, not harder",
];

// The improvements 2.0 ships with.
const FEATURES = [
  { icon: Zap, title: "Faster", desc: "Crunches forecasts in a blink" },
  { icon: Sparkles, title: "More intuitive", desc: "Designed to just make sense" },
  { icon: LayoutDashboard, title: "All in one view", desc: "Every chart, one place" },
  { icon: Hand, title: "Easy to tweak", desc: "Edit numbers effortlessly" },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [count, setCount] = useState(1_240_000);
  const [series, setSeries] = useState(INITIAL_SERIES);
  const [tagline, setTagline] = useState(0);
  const firedRef = useRef(false);

  // Confetti in the nav's yellow, with money/chart emojis for flavour.
  const celebrate = useCallback((power = 1) => {
    const bill = confetti.shapeFromText({ text: "💵", scalar: 2.2 });
    const chart = confetti.shapeFromText({ text: "📈", scalar: 2.2 });
    const n = Math.round(60 * power);
    const opts = {
      particleCount: n, spread: 75, startVelocity: 50,
      colors: ["#facc15", "#fde68a", "#ffffff", "#fbbf24"],
      shapes: [bill, chart, "circle" as const], scalar: 1.4,
    };
    confetti({ ...opts, angle: 60, origin: { x: 0, y: 1 } });
    confetti({ ...opts, angle: 120, origin: { x: 1, y: 1 } });
  }, []);

  // The figure and the chart climb forever — a gentle, never-ending rise.
  useEffect(() => {
    if (loading || user) return;
    const id = setInterval(() => {
      setCount((c) => c + Math.round(700 + Math.random() * 1500));
      setSeries((prev) => {
        const next = prev[prev.length - 1].v + 3 + Math.random() * 6;
        return [...prev.slice(1), { v: next }];
      });
    }, 850);
    return () => clearInterval(id);
  }, [loading, user]);

  // Welcome confetti, once.
  useEffect(() => {
    if (loading || user || firedRef.current) return;
    firedRef.current = true;
    const t = setTimeout(() => celebrate(), 250);
    return () => clearTimeout(t);
  }, [loading, user, celebrate]);

  // Cycle the tagline.
  useEffect(() => {
    const id = setInterval(() => setTagline((t) => (t + 1) % TAGLINES.length), 2800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  async function handleGoogleSignIn() {
    setError("");
    setSigningIn(true);
    celebrate(1.5);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(
        "Erreur de connexion: " + (err?.code || "UNKNOWN") + " — " + err?.message
      );
      setSigningIn(false);
    }
  }

  if (loading || user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
          <p className="text-sm tracking-wide text-gray-400">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-700 bg-gray-800 shadow-2xl shadow-black/50">
        <div className="p-8">
          {/* Brand lockup — single logo */}
          <div className="mb-7 flex items-center gap-3">
            <Image
              src="/plusco_logo.jpeg"
              alt="PlusCo logo"
              width={40}
              height={40}
              className="rounded-lg"
              priority
            />
            <span className="text-lg font-bold tracking-tight text-white">
              PlusCo <span className="text-yellow-400">Forecaster</span>
            </span>
          </div>

          {/* Forever-climbing figure */}
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total forecast · live
          </p>
          <div className="flex items-end gap-2">
            <span className="font-mono text-4xl font-extrabold tabular-nums text-yellow-400">
              {money.format(count)}
            </span>
            <span className="mb-1.5 rounded bg-yellow-400/15 px-1.5 py-0.5 text-xs font-bold text-yellow-400">
              ▲ live
            </span>
          </div>

          {/* Chart that keeps rising */}
          <div className="my-5 h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#facc15" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#facc15"
                  strokeWidth={2.5}
                  fill="url(#forecastFill)"
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <h1 className="text-2xl font-bold text-white">
            Welcome to the Forecaster <span className="text-yellow-400">2.0</span>
          </h1>
          <p className="mt-1 h-5 text-sm text-gray-400">{TAGLINES[tagline]}</p>

          {/* What's new in 2.0 */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-gray-700 bg-gray-900/50 p-3 transition-colors hover:border-yellow-400/40"
              >
                <Icon className="mb-2 h-5 w-5 text-yellow-400" />
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs leading-snug text-gray-400">{desc}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-lg bg-yellow-400 px-6 py-3 font-semibold text-gray-900 shadow-sm transition-all hover:scale-[1.02] hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5 rounded-full bg-white p-0.5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>{signingIn ? "Signing in..." : "Sign in with Google"}</span>
          </button>

          {error && (
            <div className="mt-4 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Signature */}
          <p className="mt-6 text-center text-xs text-gray-500">
            Crafted by{" "}
            <span className="font-medium text-gray-300">Noble, Tristan &amp; Adriana</span>
          </p>
        </div>
      </div>
    </main>
  );
}
