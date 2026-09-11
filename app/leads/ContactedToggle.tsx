'use client'

// Client boundary needed for the same reason as NotesField: React's <form
// action> prop type requires a void-returning callback, and useActionState
// is the sanctioned way to wrap a Server Action that returns { ok, error }.
import { useActionState, useState } from 'react'
import { setContactedAction } from './actions'

export default function ContactedToggle({
  businessId,
  contacted,
}: {
  businessId: number
  contacted: boolean
}) {
  const [checked, setChecked] = useState(contacted)

  const [state, formAction, pending] = useActionState(
    async (_prevState: Awaited<ReturnType<typeof setContactedAction>>, formData: FormData) => {
      const result = await setContactedAction(formData)
      if (!result.ok) setChecked(contacted)
      return result
    },
    { ok: true as const },
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="contacted" value={String(checked)} />
      <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(event) => {
            const next = event.currentTarget.checked
            const form = event.currentTarget.form
            const value = form?.elements.namedItem('contacted')
            if (value instanceof HTMLInputElement) value.value = String(next)
            setChecked(next)
            form?.requestSubmit()
          }}
          className="size-4 accent-accent disabled:cursor-wait"
        />
        <span className={checked ? 'text-success-foreground' : 'text-muted-foreground'}>
          {pending ? 'Saving…' : checked ? 'Contacted' : 'To contact'}
        </span>
      </label>
      {!state.ok ? <p role="alert" className="mt-1 text-xs text-danger-foreground">{state.error}</p> : null}
    </form>
  )
}
