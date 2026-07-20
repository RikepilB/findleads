import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
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

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["italic", "normal"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <nav className="border-b border-border px-6 flex items-center gap-6">
          <span className="py-4 pr-2 font-serif text-sm italic text-muted-foreground">
            findleads
          </span>
          <Link
            href="/leads"
            className="py-4 text-xs font-semibold tracking-[0.12em] uppercase"
          >
            Leads
          </Link>
          <Link
            href="/jobs"
            className="py-4 text-xs font-semibold tracking-[0.12em] uppercase"
          >
            Job History
          </Link>
        </nav>
        <div className="border-b border-border px-6 py-2">
          <GoogleAttribution />
        </div>
        {children}
      </body>
    </html>
  );
}
