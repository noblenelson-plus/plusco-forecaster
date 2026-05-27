"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "en";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const isEn = locale === "en";

  // If already logged in, redirect to app
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push(`/${locale}/media-spend`);
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router, locale]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push(`/${locale}/media-spend`);
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      setError(
        isEn
          ? "Google sign-in failed. Please try again."
          : "Échec de la connexion Google. Veuillez réessayer."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      setError(
        isEn
          ? "Please enter email and password."
          : "Veuillez entrer votre courriel et mot de passe."
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push(`/${locale}/media-spend`);
    } catch (err: any) {
      console.error("Email sign-in error:", err);
      setError(
        isEn
          ? "Invalid email or password."
          : "Courriel ou mot de passe invalide."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleLocale = () => {
    const newLocale = locale === "en" ? "fr" : "en";
    router.push(`/${newLocale}/login`);
  };

  if (checkingAuth) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8f9fb",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #e5e7eb",
            borderTopColor: "#1e3a5f",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0f4f8 0%, #e8eef5 50%, #f0f4f8 100%)",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle background decoration */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(30,58,95,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(30,58,95,0.04) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Login Card */}
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 16,
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 30px -5px rgba(0,0,0,0.08)",
          padding: "48px 40px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 40,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#1e3a5f",
                margin: 0,
                letterSpacing: "-0.5px",
              }}
            >
              PlusCo Forecaster
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "#94a3b8",
                margin: "6px 0 0 0",
                fontWeight: 400,
              }}
            >
              {isEn ? "Media planning & forecasting" : "Planification et prévision média"}
            </p>
          </div>
          {/* Language toggle */}
          <div
            style={{
              display: "flex",
              gap: 2,
              background: "#f1f5f9",
              borderRadius: 8,
              padding: 3,
            }}
          >
            <button
              onClick={locale === "en" ? undefined : toggleLocale}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                cursor: locale === "en" ? "default" : "pointer",
                background: locale === "en" ? "#1e3a5f" : "transparent",
                color: locale === "en" ? "#ffffff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              EN
            </button>
            <button
              onClick={locale === "fr" ? undefined : toggleLocale}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                cursor: locale === "fr" ? "default" : "pointer",
                background: locale === "fr" ? "#1e3a5f" : "transparent",
                color: locale === "fr" ? "#ffffff" : "#64748b",
                transition: "all 0.15s ease",
              }}
            >
              FR
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              marginBottom: 24,
              fontSize: 13,
              color: "#dc2626",
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {/* Internal Access */}
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              margin: "0 0 12px 0",
            }}
          >
            {isEn ? "Internal Access" : "Accès Interne"}
          </p>
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 20px",
              background: "#ffffff",
              border: "1.5px solid #e2e8f0",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: "#334155",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition: "all 0.15s ease",
              opacity: loading ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.boxShadow =
                  "0 2px 8px rgba(0,0,0,0.06)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading
              ? isEn
                ? "Signing in..."
                : "Connexion en cours..."
              : isEn
              ? "Sign in with Google"
              : "Se connecter avec Google"}
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
          <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
        </div>

        {/* External Partners */}
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              margin: "0 0 12px 0",
            }}
          >
            {isEn ? "External Partners" : "Partenaires Externes"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="email"
              placeholder={isEn ? "email@company.com" : "courriel@entreprise.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                color: "#334155",
                outline: "none",
                transition: "border-color 0.15s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#1e3a5f")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
            <input
              type="password"
              placeholder={isEn ? "Password" : "Mot de passe"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailSignIn()}
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                fontSize: 14,
                color: "#334155",
                outline: "none",
                transition: "border-color 0.15s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#1e3a5f")}
              onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
            />
            <button
              onClick={handleEmailSignIn}
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: "#1e3a5f",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                color: "#ffffff",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = "#162d4a";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#1e3a5f";
              }}
            >
              {loading
                ? isEn
                  ? "Signing in..."
                  : "Connexion..."
                : isEn
                ? "Sign in"
                : "Se connecter"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <p
            style={{
              fontSize: 12,
              color: "#94a3b8",
              margin: "0 0 16px 0",
            }}
          >
            {isEn
              ? "Connection problem? Contact your admin"
              : "Problème de connexion ? Contactez votre administrateur"}
          </p>
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#1e3a5f",
              margin: 0,
              letterSpacing: "2px",
              textTransform: "lowercase",
            }}
          >
            plus company
          </p>
        </div>
      </div>
    </div>
  );
}