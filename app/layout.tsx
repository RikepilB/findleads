import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import GoogleAttribution from "@/components/GoogleAttribution";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "findleads",
  description: "Lead-generation dashboard over the Google Places API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="bg-[#F3F4F6] px-6 flex gap-6">
          <Link href="/leads" className="py-4 text-sm font-semibold">
            Leads
          </Link>
          <Link href="/jobs" className="py-4 text-sm font-semibold">
            Job History
          </Link>
        </nav>
        <div className="bg-[#F3F4F6] px-6 py-2">
          <GoogleAttribution />
        </div>
        {children}
      </body>
    </html>
  );
}
