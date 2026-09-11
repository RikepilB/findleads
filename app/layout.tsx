import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import AppNav from '@/components/AppNav'
import GoogleAttribution from '@/components/GoogleAttribution'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'findleads',
  description: 'Lead-generation dashboard over the Google Places API',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3 sm:gap-5">
              <span className="text-base font-bold tracking-tight">findleads</span>
              <AppNav />
            </div>
            <GoogleAttribution />
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
