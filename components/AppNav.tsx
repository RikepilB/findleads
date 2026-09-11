'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/leads', label: 'Lead pipeline', shortLabel: 'Leads' },
  { href: '/jobs', label: 'Scrape runs', shortLabel: 'Runs' },
]

export default function AppNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="flex h-14 items-stretch gap-1">
      {links.map((link) => {
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center border-b-2 px-3 text-sm font-medium transition-colors ${
              active
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="sm:hidden">{link.shortLabel}</span>
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
