'use client'

// Client boundary needed for the same reason as NotesField: React's <form
// action> prop type requires a void-returning callback, and useActionState
// is the sanctioned way to wrap a Server Action that returns { ok, error }.
import { useActionState } from 'react'
import { setContactedAction } from './actions'

export default function ContactedToggle({
  businessId,
  contacted,
}: {
  businessId: number
  contacted: boolean
}) {
  const [, formAction] = useActionState(
    (_prevState: Awaited<ReturnType<typeof setContactedAction>>, formData: FormData) =>
      setContactedAction(formData),
    { ok: true as const },
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="contacted" value={String(!contacted)} />
      <button
        type="submit"
        className={
          contacted
            ? 'rounded-full bg-success-bg px-2 py-0.5 text-xs font-semibold text-success-foreground'
            : 'rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted-foreground'
        }
      >
        {contacted ? 'Contacted' : 'Not contacted'}
      </button>
    </form>
  )
}
