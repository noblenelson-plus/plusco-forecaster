// app/layout.tsx
import type { Metadata } from "next";
import { Urbanist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";

// Urbanist is the Plus Company brand-approved substitute for Gellix
// (Brand Guidelines 2024, "Plus typography").
const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forecaster — Plus Company",
  description: "The Plus Company forecasting app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${urbanist.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Apply the app zoom before paint to avoid a flash of unzoomed content.
            Defaults to 80% when nothing is stored; a saved choice wins. Kept in
            sync with lib/app-zoom.ts (default 80, neutral 100, clamp 60–120). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("app-zoom");var z=s?Number(s):80;if(z){z=Math.min(120,Math.max(60,Math.round(z/10)*10));if(z!==100){var f=z/100,r=document.documentElement;r.style.zoom=String(f);r.style.setProperty("--app-zoom",String(f));}}}catch(e){}})();`,
          }}
        />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
