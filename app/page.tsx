import { redirect } from 'next/navigation'

// Leads is the default view per 05-UI-SPEC.md Page/View Inventory.
export default function Home() {
  redirect('/leads')
}
