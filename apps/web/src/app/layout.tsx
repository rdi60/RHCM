import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RHCM",
  description: "Dental Clinic & Charity Trust Management System",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f6e94",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
